import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isTokenRevoked } from '../services/tokenService';
import pool from '../database/db';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    is_super_admin?: boolean;
  };
  token?: string; // Store token for logout
}

/**
 * All non-patient roles. Use with authorizeRoles(...STAFF_ROLES) for endpoints
 * that should be open to any staff member but never to patients (e.g. the
 * social layer). Super admins bypass authorizeRoles entirely.
 */
export const STAFF_ROLES = [
  'doctor', 'nurse', 'admin', 'office_manager', 'receptionist', 'lab',
  'pharmacy', 'pharmacist', 'pharmacy_tech', 'imaging', 'accountant', 'marketing',
] as const;

/**
 * The ONLY routes a patient-portal token may call. Everything else is staff
 * territory and answers 403 for a patient, whatever the route's own gates say —
 * so a route that forgets authorizeRoles can't leak other patients' records.
 * Keep in sync with what client/src/pages/PatientPortal.tsx actually calls.
 */
const PATIENT_ALLOWED_ROUTES: { method: string; path: RegExp }[] = [
  { method: 'GET', path: /^\/patient-portal\/me$/ },
  { method: 'GET', path: /^\/appointments$/ },
  { method: 'GET', path: /^\/orders\/lab$/ },
  { method: 'GET', path: /^\/orders\/imaging$/ },
  { method: 'GET', path: /^\/medications\/patient\/\d+$/ },
  { method: 'GET', path: /^\/auth\/me$/ },
  { method: 'POST', path: /^\/auth\/logout(-all)?$/ },
  // Notifications are always scoped to the caller's own rows.
  { method: '*', path: /^\/notifications(\/.*)?$/ },
];

const isPatientAllowedRoute = (req: Request): boolean => {
  const path = (req.originalUrl || req.url || '').split('?')[0].replace(/^\/api(?=\/)/, '').replace(/\/+$/, '');
  return PATIENT_ALLOWED_ROUTES.some(
    (r) => (r.method === '*' || r.method === req.method) && r.path.test(path)
  );
};

/**
 * Account status, looked up per request (cached briefly per instance) so that
 * deactivating a user or "log out everywhere" takes effect within seconds
 * instead of when the JWT expires (24h staff, 90 days portal).
 */
interface AccountStatus { isActive: boolean; revokedAtSec: number | null; isSuperAdmin: boolean; at: number }
const ACCOUNT_STATUS_TTL_MS = 30_000;
const accountStatusCache = new Map<number, AccountStatus>();

const getAccountStatus = async (userId: number): Promise<AccountStatus | null> => {
  const cached = accountStatusCache.get(userId);
  if (cached && Date.now() - cached.at < ACCOUNT_STATUS_TTL_MS) return cached;
  const r = await pool.query(
    `SELECT is_active, is_super_admin,
            FLOOR(EXTRACT(EPOCH FROM tokens_revoked_at))::bigint AS revoked_at_sec
       FROM users WHERE id = $1`,
    [userId]
  );
  if (r.rows.length === 0) return null;
  const status: AccountStatus = {
    isActive: r.rows[0].is_active !== false,
    revokedAtSec: r.rows[0].revoked_at_sec != null ? Number(r.rows[0].revoked_at_sec) : null,
    isSuperAdmin: r.rows[0].is_super_admin === true,
    at: Date.now(),
  };
  accountStatusCache.set(userId, status);
  return status;
};

/** Drop a user's cached status so a deactivation / revoke applies immediately on this instance. */
export const forgetAccountStatus = (userId: number): void => {
  accountStatusCache.delete(userId);
};

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Support both Authorization header and HttpOnly cookie
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1] || req.cookies?.auth_token;

  if (!token) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as {
      id: number;
      email: string;
      role: string;
      is_super_admin?: boolean;
      iat?: number;
      exp?: number;
    };

    // Check if token is blacklisted (revoked)
    const revoked = await isTokenRevoked(token);
    if (revoked) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    // Deactivated accounts and "log out everywhere" end existing sessions.
    // Fail-OPEN on a DB error, like the blacklist check above: a Neon hiccup
    // must not log everyone out.
    try {
      const status = await getAccountStatus(decoded.id);
      if (!status || !status.isActive) {
        res.status(401).json({ error: 'Account is inactive' });
        return;
      }
      if (status.revokedAtSec !== null && decoded.iat !== undefined && decoded.iat < status.revokedAtSec) {
        res.status(401).json({ error: 'Session has been signed out' });
        return;
      }
      // A super-admin flag removed in the DB stops applying straight away.
      if (decoded.is_super_admin && !status.isSuperAdmin) decoded.is_super_admin = false;
    } catch (statusError) {
      console.error('Account status check failed (allowing request):', statusError);
    }

    // Patient-portal tokens may only reach the portal's own routes.
    if (decoded.role === 'patient' && !decoded.is_super_admin && !isPatientAllowedRoute(req)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    (req as AuthRequest).user = decoded;
    (req as AuthRequest).token = token; // Store for potential logout
    next();
  } catch (error) {
    if (error instanceof Error && error.message === 'JWT_SECRET environment variable is required') {
      console.error('CRITICAL: JWT_SECRET not configured');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Restrict patients to their OWN data on patient_id-scoped read endpoints.
 *
 * Staff/super-admins are unaffected (they may query any patient_id). For a
 * 'patient' role caller, this resolves the patient record they own and forces
 * the request to use it:
 *  - query-param endpoints (?patient_id=...) -> overwrite req.query.patient_id
 *  - path-param endpoints (/:patient_id)     -> 403 if it isn't their own
 *
 * Must run after authenticateToken.
 */
export const enforcePatientOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = (req as AuthRequest).user;

  // Staff and super admins keep full access.
  if (!user || (user.role !== 'patient' && !user.is_super_admin)) {
    next();
    return;
  }
  // A super admin impersonating staff shouldn't be scoped; only scope true patients.
  if (user.role !== 'patient') {
    next();
    return;
  }

  try {
    const result = await pool.query('SELECT id FROM patients WHERE user_id = $1', [user.id]);
    if (result.rows.length === 0) {
      res.status(403).json({ error: 'No patient record associated with this account' });
      return;
    }
    const ownPatientId = String(result.rows[0].id);

    // Path-param endpoints (e.g. /medications/patient/:patient_id)
    if (req.params && req.params.patient_id !== undefined) {
      if (String(req.params.patient_id) !== ownPatientId) {
        res.status(403).json({ error: 'You can only view your own records' });
        return;
      }
    }

    // Query-param endpoints: force scoping to the caller's own record.
    // Express 5 re-parses req.query from the URL on every read, so assigning
    // req.query.patient_id is silently lost — replace the property instead.
    Object.defineProperty(req, 'query', {
      value: { ...req.query, patient_id: ownPatientId },
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  } catch (error) {
    console.error('enforcePatientOwnership error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Super admins can access any role's endpoints
    if (user.is_super_admin) {
      next();
      return;
    }

    // Office Manager has the same permissions as Admin — any admin-gated route is
    // open to it. It's a distinct role (so it can be labelled, impersonated and
    // audited separately) but functionally mirrors admin everywhere.
    if (user.role === 'office_manager' && roles.includes('admin')) {
      next();
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
