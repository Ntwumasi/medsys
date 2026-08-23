import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../database/db';
import { generateResetToken, hashResetToken } from '../utils/passwordValidation';
import { validatePhoneNumber, sendSMS } from '../services/smsService';
import { sendEmail, validateEmail, textToHtml } from '../services/emailService';
import { auditService } from '../services/auditService';

const LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 min one-time link
const SESSION_EXPIRY = '90d'; // long-lived patient session
const SESSION_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // renew when <14 days left
const MAX_DOB_ATTEMPTS = 5;
const DOB_LOCK_MS = 15 * 60 * 1000;

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

const getClientIP = (req: Request): string => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
};

const getBaseUrl = (): string => {
  const fromEnv = process.env.FRONTEND_URL?.split(',')[0]?.trim();
  return fromEnv || 'http://localhost:5173';
};

// Issue the long-lived patient session token + set cookie. Returns the raw token.
const issuePatientSession = (
  res: Response,
  user: { id: number; username: string }
): string => {
  const token = jwt.sign(
    { id: user.id, username: user.username, role: 'patient', is_super_admin: false },
    getJwtSecret(),
    { expiresIn: SESSION_EXPIRY }
  );
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_EXPIRY_MS,
    path: '/',
  });
  return token;
};

// Placeholder address auto-assigned at registration when a patient gives no
// email. 940 of ~1140 patients carry one, so it must never be treated as a
// reachable address or matched against a login attempt.
const PLACEHOLDER_EMAIL_DOMAIN = 'noemail.medsys.local';

export const isRealEmail = (email: string | null | undefined): boolean =>
  !!email && validateEmail(email) && !email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);

// Create + store an access token for a patient and send the link. Shared by
// self-service and staff; `channel` picks SMS or email as the delivery route.
const createAndSendLink = async (
  patientId: number,
  destination: string,
  channel: 'sms' | 'email',
  deliveryMethod: 'self' | 'staff',
  sentBy: number | null,
  req: Request
): Promise<boolean> => {
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + LINK_EXPIRY_MS);

  // Invalidate any prior unused tokens for this patient
  await pool.query(
    `UPDATE patient_portal_access_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE patient_id = $1 AND used_at IS NULL`,
    [patientId]
  );

  await pool.query(
    `INSERT INTO patient_portal_access_tokens
       (patient_id, token_hash, expires_at, delivery_method, sent_by, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [patientId, tokenHash, expiresAt, deliveryMethod, sentBy, getClientIP(req), req.headers['user-agent'] || null]
  );

  const link = `${getBaseUrl()}/portal/verify?token=${token}`;
  const message = `Access your clinic records: ${link} (valid 15 min). You'll confirm your date of birth.`;

  let success: boolean;
  let provider: string;

  if (channel === 'email') {
    const subject = 'Your clinic records access link';
    const body = [
      'Hello,',
      '',
      'Use the link below to view your clinic records. It is valid for 15 minutes',
      "and you'll be asked to confirm your date of birth.",
      '',
      link,
      '',
      "If you didn't request this, you can ignore this email.",
    ].join('\n');
    const result = await sendEmail(destination, subject, body, textToHtml(body));
    success = result.success;
    provider = result.provider;
  } else {
    const result = await sendSMS(destination, message);
    success = result.success;
    provider = result.provider;
  }

  // Resolve the patient's user_id for the audit entry
  const userRow = await pool.query('SELECT user_id FROM patients WHERE id = $1', [patientId]);
  await auditService.log({
    userId: sentBy || userRow.rows[0]?.user_id,
    action: 'create',
    entityType: 'patient_portal_link',
    entityId: patientId,
    details: { delivery: deliveryMethod, channel, provider, success },
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'] || undefined,
  });

  return success;
};

/**
 * POST /api/patient-portal/request-link  (public, rate-limited)
 * Self-service: patient enters their email OR phone; we send a one-time access
 * link by the matching channel. Always returns a generic success
 * (anti-enumeration).
 *
 * Accepts `identifier`; `phone` is still honoured so any older client keeps
 * working.
 */
export const requestLink = async (req: Request, res: Response): Promise<void> => {
  const generic = { message: 'If an account exists for that email or phone number, a login link has been sent.' };
  try {
    const raw = req.body?.identifier ?? req.body?.phone;
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      res.json(generic);
      return;
    }
    const identifier = raw.trim();

    if (identifier.includes('@')) {
      // ---- Email route ----
      if (!isRealEmail(identifier)) {
        res.json(generic);
        return;
      }

      const byEmail = await pool.query(
        `SELECT p.id AS patient_id, u.email
         FROM patients p
         JOIN users u ON p.user_id = u.id
         WHERE u.role = 'patient' AND u.is_active = true
           AND LOWER(u.email) = LOWER($1)`,
        [identifier]
      );

      // A handful of records share an address (e.g. a couple using one inbox).
      // The token is bound to ONE patient, so sending on a shared address could
      // hand someone the wrong person's chart — the date-of-birth gate wouldn't
      // catch it. Refuse to guess; those patients sign in by phone.
      if (byEmail.rows.length > 1) {
        console.warn(`[portal] ambiguous login email shared by ${byEmail.rows.length} patients — not sent`);
        res.json(generic);
        return;
      }

      if (byEmail.rows.length === 1) {
        await createAndSendLink(byEmail.rows[0].patient_id, byEmail.rows[0].email, 'email', 'self', null, req);
      }

      res.json(generic);
      return;
    }

    // ---- Phone route ----
    // Match on the trailing 9 significant digits (stored phones are unnormalized).
    const digits = identifier.replace(/\D/g, '');
    const last9 = digits.slice(-9);
    if (last9.length < 9) {
      res.json(generic);
      return;
    }

    const patientResult = await pool.query(
      `SELECT p.id AS patient_id, u.phone
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE u.role = 'patient' AND u.is_active = true
         AND RIGHT(REGEXP_REPLACE(u.phone, '[^0-9]', '', 'g'), 9) = $1
       LIMIT 1`,
      [last9]
    );

    if (patientResult.rows.length > 0) {
      const { patient_id, phone: storedPhone } = patientResult.rows[0];
      const formatted = validatePhoneNumber(storedPhone).formatted;
      await createAndSendLink(patient_id, formatted, 'sms', 'self', null, req);
    }

    res.json(generic);
  } catch (error) {
    console.error('Portal request-link error:', error);
    // Still return generic to avoid leaking anything
    res.json(generic);
  }
};

/**
 * POST /api/patient-portal/staff-send  (receptionist/admin)
 * Front desk sends the access link from the patient record.
 */
export const staffSendLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.body;
    if (!patient_id) {
      res.status(400).json({ error: 'patient_id is required' });
      return;
    }

    const result = await pool.query(
      `SELECT p.id AS patient_id, u.phone, u.email
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [patient_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const { phone, email } = result.rows[0];
    const check = phone ? validatePhoneNumber(phone) : { valid: false, formatted: '' };
    const emailUsable = isRealEmail(email);

    // Staff may force a channel; otherwise prefer SMS (94% of patients have a
    // usable phone, only ~17% a real email) and fall back to email.
    const requested = req.body?.channel as 'sms' | 'email' | undefined;
    let channel: 'sms' | 'email';
    if (requested === 'email') {
      if (!emailUsable) {
        res.status(400).json({ error: 'No valid email address on file for this patient.' });
        return;
      }
      channel = 'email';
    } else if (requested === 'sms') {
      if (!check.valid) {
        res.status(400).json({ error: 'No valid phone number on file for this patient.' });
        return;
      }
      channel = 'sms';
    } else if (check.valid) {
      channel = 'sms';
    } else if (emailUsable) {
      channel = 'email';
    } else {
      res.status(400).json({ error: 'No valid phone number or email address on file for this patient.' });
      return;
    }

    const destination = channel === 'email' ? email : check.formatted;
    const sentBy = (req as any).user?.id || null;
    const sent = await createAndSendLink(patient_id, destination, channel, 'staff', sentBy, req);

    // Don't tell the user it was sent unless it actually was.
    if (!sent) {
      res.status(502).json({
        error: channel === 'email'
          ? 'Email could not be sent (email service not configured or the send failed). The link was created but not delivered — check SMTP setup.'
          : 'Text could not be sent (SMS service not configured or the send failed). The link was created but not delivered — check SMS setup.',
      });
      return;
    }

    const masked = channel === 'email'
      ? email.replace(/^(.)(.*)(@.*)$/, (_m: string, a: string, b: string, c: string) => a + '•'.repeat(Math.max(b.length, 1)) + c)
      : check.formatted.slice(0, -6).replace(/\d/g, '•') + check.formatted.slice(-4);
    res.json({ message: `Portal login link sent to ${masked}.`, channel });
  } catch (error) {
    console.error('Portal staff-send error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/patient-portal/verify  (public, rate-limited)
 * Validate the link token + date of birth, then issue a long-lived patient session.
 */
export const verify = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, date_of_birth } = req.body;
    if (!token || !date_of_birth) {
      res.status(400).json({ error: 'Link token and date of birth are required.' });
      return;
    }

    const tokenHash = hashResetToken(token);
    const tokenResult = await pool.query(
      `SELECT t.id, t.patient_id, t.used_at, t.expires_at, t.dob_attempts, t.locked_until,
              to_char(p.date_of_birth, 'YYYY-MM-DD') AS dob,
              p.user_id, u.username, u.first_name, u.last_name
       FROM patient_portal_access_tokens t
       JOIN patients p ON p.id = t.patient_id
       JOIN users u ON u.id = p.user_id
       WHERE t.token_hash = $1`,
      [tokenHash]
    );

    const row = tokenResult.rows[0];
    const invalid = (): void => {
      res.status(400).json({ error: 'Invalid or expired link. Please request a new one.' });
    };

    if (!row) { invalid(); return; }
    if (row.used_at) { invalid(); return; }
    if (new Date(row.expires_at).getTime() < Date.now()) { invalid(); return; }
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      res.status(429).json({ error: 'Too many incorrect attempts. Please request a new link shortly.' });
      return;
    }

    const providedDob = String(date_of_birth).slice(0, 10);
    if (providedDob !== row.dob) {
      const attempts = row.dob_attempts + 1;
      const lock = attempts >= MAX_DOB_ATTEMPTS ? new Date(Date.now() + DOB_LOCK_MS) : null;
      await pool.query(
        `UPDATE patient_portal_access_tokens SET dob_attempts = $1, locked_until = $2 WHERE id = $3`,
        [attempts, lock, row.id]
      );
      res.status(400).json({ error: 'Date of birth does not match. Please try again.' });
      return;
    }

    // Success: consume the one-time link, issue the durable session.
    await pool.query(
      `UPDATE patient_portal_access_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [row.id]
    );

    const sessionToken = issuePatientSession(res, { id: row.user_id, username: row.username });

    await auditService.log({
      userId: row.user_id,
      action: 'read',
      entityType: 'patient_portal_login',
      entityId: row.patient_id,
      details: { method: 'sms_link' },
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'] || undefined,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: row.user_id,
        username: row.username,
        role: 'patient',
        first_name: row.first_name,
        last_name: row.last_name,
        is_super_admin: false,
      },
      token: sessionToken,
    });
  } catch (error) {
    console.error('Portal verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/patient-portal/me  (authenticated patient)
 * Returns the caller's own patient profile and renews the session if it's near expiry.
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await pool.query(
      `SELECT p.id AS patient_id, p.patient_number,
              to_char(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              u.first_name, u.last_name, u.username
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient record not found' });
      return;
    }

    // Sliding session: re-issue if the current token is close to expiry.
    // Returned as `renewed_token` so header/localStorage-based clients can update too.
    let renewedToken: string | undefined;
    try {
      const decoded = jwt.decode(authReq.token) as { exp?: number } | null;
      if (decoded?.exp) {
        const msLeft = decoded.exp * 1000 - Date.now();
        if (msLeft > 0 && msLeft < SESSION_RENEW_THRESHOLD_MS) {
          renewedToken = issuePatientSession(res, { id: userId, username: result.rows[0].username });
        }
      }
    } catch {
      // Non-fatal: renewal is best-effort
    }

    res.json({ ...result.rows[0], renewed_token: renewedToken });
  } catch (error) {
    console.error('Portal getMe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
