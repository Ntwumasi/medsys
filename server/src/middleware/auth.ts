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
    req.query.patient_id = ownPatientId;
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

    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
