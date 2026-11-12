import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../database/db';
import { generateResetToken, hashResetToken } from '../utils/passwordValidation';
import { validatePhoneNumber, sendSMS, isArkeselSandbox } from '../services/smsService';
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

/**
 * Base address for links texted to patients. FRONTEND_URL is a list (it is
 * also the CORS allow-list) and on prod starts with the raw *.vercel.app
 * address — a link a patient should never be asked to trust. Prefer the
 * clinic's own domain whenever the list has one.
 */
export const getBaseUrl = (): string => {
  const origins = (process.env.FRONTEND_URL || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  const own = origins.find((o) => /^https:\/\//.test(o) && !/\.vercel\.app$/i.test(o) && !/^https:\/\/www\./i.test(o))
    || origins.find((o) => !/\.vercel\.app$/i.test(o));
  return own || origins[0] || 'http://localhost:5173';
};

// Issue the long-lived patient session token + set cookie. Returns the raw token.
const issuePatientSession = (
  res: Response,
  user: { id: number; username: string },
  /** Issued-at (seconds). Only set when it must land after a revocation. */
  iat?: number
): string => {
  const token = jwt.sign(
    { id: user.id, username: user.username, role: 'patient', is_super_admin: false, ...(iat ? { iat } : {}) },
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

/**
 * Store a portal access token and return the raw value (only its hash is
 * kept). 'login' links last 15 minutes and replace any earlier unused login
 * link; 'notify' links (after-visit text, message replies) last 7 days and open `target`.
 * Either way the patient confirms their date of birth before anything shows.
 */
export const NOTIFY_LINK_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const createPortalToken = async (
  patientId: number,
  opts: {
    purpose: 'login' | 'notify'; target?: string | null; deliveryMethod: string; sentBy?: number | null;
    ip?: string | null; userAgent?: string | null;
    /** 'sms' links may be opened as any patient sharing that phone (see verify). */
    channel?: 'sms' | 'email' | null;
  }
): Promise<string> => {
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + (opts.purpose === 'notify' ? NOTIFY_LINK_EXPIRY_MS : LINK_EXPIRY_MS));
  if (opts.purpose === 'login') {
    await pool.query(
      `UPDATE patient_portal_access_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE patient_id = $1 AND used_at IS NULL AND purpose = 'login'`,
      [patientId]
    );
  }
  await pool.query(
    `INSERT INTO patient_portal_access_tokens
       (patient_id, token_hash, expires_at, delivery_method, sent_by, ip_address, user_agent, purpose, target, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [patientId, hashResetToken(token), expiresAt, opts.deliveryMethod, opts.sentBy ?? null,
     opts.ip ?? null, opts.userAgent ?? null, opts.purpose, opts.target ?? null, opts.channel ?? null]
  );
  return token;
};

export const portalLinkFor = (token: string): string => `${getBaseUrl()}/portal/verify?token=${token}`;

// Create + store an access token for a patient and send the link. Shared by
// self-service and staff; `channel` picks SMS or email as the delivery route.
const createAndSendLink = async (
  patientId: number,
  destination: string,
  channel: 'sms' | 'email',
  deliveryMethod: 'self' | 'staff',
  sentBy: number | null,
  req: Request
): Promise<{ success: boolean; link: string }> => {
  const token = await createPortalToken(patientId, {
    purpose: 'login', deliveryMethod, sentBy, ip: getClientIP(req), userAgent: req.headers['user-agent'] || null,
    channel,
  });
  const link = portalLinkFor(token);
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

  return { success, link };
};

/** The real clinic site — test-only conveniences never appear here. */
export const isLiveSite = (): boolean => /^https:\/\/(www\.)?medsys\.healthcare$/i.test(getBaseUrl());

/** Self-service sign-in links per phone number (or patient) per hour. */
export const MAX_SELF_LINKS_PER_HOUR = 3;

/** Last 9 digits of a stored phone, as SQL — stored phones are unnormalized. */
const PHONE9_SQL = `RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 9)`;

/**
 * Has this phone (or, for email, this patient) already been sent the hourly
 * maximum of sign-in links? The IP rate limit lives in memory per serverless
 * instance, so it can't stop someone flooding one number with texts — this
 * counts in the database instead.
 */
const tooManyRecentLinks = async (by: { phone9: string } | { patientId: number }): Promise<boolean> => {
  const r = 'phone9' in by
    ? await pool.query(
        `SELECT COUNT(*)::int AS n FROM patient_portal_access_tokens t
           JOIN patients p ON p.id = t.patient_id JOIN users u ON u.id = p.user_id
          WHERE t.purpose = 'login' AND t.delivery_method = 'self'
            AND t.created_at > NOW() - INTERVAL '1 hour' AND ${PHONE9_SQL} = $1`,
        [by.phone9])
    : await pool.query(
        `SELECT COUNT(*)::int AS n FROM patient_portal_access_tokens
          WHERE purpose = 'login' AND delivery_method = 'self'
            AND created_at > NOW() - INTERVAL '1 hour' AND patient_id = $1`,
        [by.patientId]);
  return r.rows[0].n >= MAX_SELF_LINKS_PER_HOUR;
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

      if (byEmail.rows.length === 1 && await tooManyRecentLinks({ patientId: byEmail.rows[0].patient_id })) {
        console.warn('[portal] hourly sign-in link limit reached for an email — not sent');
      } else if (byEmail.rows.length === 1) {
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

    // A family often shares one phone. Any patient on the number will do: the
    // link is marked 'sms', and at verify the date of birth picks the patient.
    const patientResult = await pool.query(
      `SELECT p.id AS patient_id, u.phone
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE u.role = 'patient' AND u.is_active = true AND p.merged_into IS NULL
         AND ${PHONE9_SQL} = $1
       ORDER BY p.id
       LIMIT 1`,
      [last9]
    );

    if (patientResult.rows.length > 0 && await tooManyRecentLinks({ phone9: last9 })) {
      console.warn('[portal] hourly sign-in link limit reached for a phone number — not sent');
    } else if (patientResult.rows.length > 0) {
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
    const { success: sent, link } = await createAndSendLink(patient_id, destination, channel, 'staff', sentBy, req);

    // Staging only: texts there are sandboxed or unconfigured, so testers
    // could never receive a link. Hand it to the staff member instead. Never
    // on the live domain, even if prod texting is ever frozen with sandbox.
    const testLink = channel === 'sms' && !isLiveSite() && (isArkeselSandbox() || !sent) ? link : undefined;
    if (testLink) {
      res.json({ message: 'Test site: no text sent — use the link below.', channel, test_link: testLink });
      return;
    }

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
      `SELECT t.id, t.patient_id, t.used_at, t.expires_at, t.dob_attempts, t.locked_until, t.purpose, t.target,
              t.channel, ${PHONE9_SQL} AS phone9,
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
    // Who is signing in. Normally the link's own patient; on a shared phone, a
    // texted sign-in link opens whichever patient on that number has this
    // date of birth (a parent signing in for each child). After-visit links
    // stay bound to their one patient.
    let who = { patient_id: row.patient_id, user_id: row.user_id, username: row.username,
      first_name: row.first_name, last_name: row.last_name };
    let sharedPhone = false;
    if (providedDob !== row.dob && row.purpose === 'login' && row.channel === 'sms'
        && typeof row.phone9 === 'string' && row.phone9.length === 9) {
      const family = await pool.query(
        `SELECT p.id AS patient_id, p.user_id, u.username, u.first_name, u.last_name
           FROM patients p JOIN users u ON u.id = p.user_id
          WHERE u.role = 'patient' AND u.is_active = true AND p.merged_into IS NULL
            AND ${PHONE9_SQL} = $1 AND to_char(p.date_of_birth, 'YYYY-MM-DD') = $2`,
        [row.phone9, providedDob]
      );
      if (family.rows.length > 1) {
        // Twins, or a duplicate record: don't guess whose chart to open.
        res.status(400).json({
          error: 'More than one patient on this phone has that date of birth. Please ask the clinic to send your link.',
        });
        return;
      }
      if (family.rows.length === 1) {
        who = family.rows[0];
        sharedPhone = true;
      }
    }

    if (providedDob !== row.dob && !sharedPhone) {
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

    const sessionToken = issuePatientSession(res, { id: who.user_id, username: who.username });

    await auditService.log({
      userId: who.user_id,
      action: 'read',
      entityType: 'patient_portal_login',
      entityId: who.patient_id,
      details: {
        method: row.purpose === 'notify' ? 'notify_link' : 'sms_link',
        target: row.target || undefined,
        ...(sharedPhone ? { shared_phone: true, link_patient_id: row.patient_id } : {}),
      },
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'] || undefined,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: who.user_id,
        username: who.username,
        role: 'patient',
        first_name: who.first_name,
        last_name: who.last_name,
        is_super_admin: false,
      },
      token: sessionToken,
      // Where the link should land, e.g. 'visit:123' from the after-visit text.
      target: row.target || null,
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
              u.first_name, u.last_name, u.username, u.portal_password_set,
              (SELECT COUNT(*)::int FROM patient_portal_messages m
                WHERE m.patient_id = p.id AND m.sender = 'staff' AND m.read_by_patient_at IS NULL) AS unread_messages
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

// ---------------------------------------------------------------------------
// Password sign-in for returning patients
// ---------------------------------------------------------------------------

const PORTAL_MAX_PASSWORD_ATTEMPTS = 5;
const PORTAL_PASSWORD_LOCK_MS = 15 * 60 * 1000;
/** Same answer for every failure, so the form can't confirm who is registered. */
const BAD_SIGN_IN =
  "That didn't match. Check your details and try again. If your family shares this phone, sign in with your patient number (for example P000123).";

/** Patients choose their own password: long enough, with a letter and a number. */
export const portalPasswordProblem = (password: unknown): string | null => {
  if (typeof password !== 'string' || password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 128) return 'That password is too long.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.';
  return null;
};

/**
 * Who is signing in? A patient number (P000123, CC-MGC-00503-25) names one
 * patient. A phone number only counts when exactly one patient with a
 * password uses it — a family phone must use the patient number.
 */
const findPasswordPatient = async (identifier: string) => {
  const select = `SELECT p.id AS patient_id, u.id AS user_id, u.username, u.first_name, u.last_name,
                         u.password_hash, u.failed_login_attempts, u.locked_until
                    FROM patients p JOIN users u ON u.id = p.user_id
                   WHERE u.role = 'patient' AND u.is_active = true AND p.merged_into IS NULL
                     AND u.portal_password_set = true`;
  const asNumber = identifier.trim().toUpperCase().replace(/\s+/g, '');
  if (/^(P\d+|CC-[A-Z0-9-]+)$/.test(asNumber)) {
    const r = await pool.query(`${select} AND UPPER(p.patient_number) = $1`, [asNumber]);
    return r.rows.length === 1 ? r.rows[0] : null;
  }
  const last9 = identifier.replace(/\D/g, '').slice(-9);
  if (last9.length < 9) return null;
  const r = await pool.query(`${select} AND ${PHONE9_SQL} = $1`, [last9]);
  return r.rows.length === 1 ? r.rows[0] : null;
};

/** POST /api/patient-portal/login  (public, rate-limited) — phone or patient number + password. */
export const passwordLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body || {};
    if (typeof identifier !== 'string' || !identifier.trim() || typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'Enter your phone or patient number and your password.' });
      return;
    }
    const who = await findPasswordPatient(identifier);
    if (!who) {
      res.status(401).json({ error: BAD_SIGN_IN });
      return;
    }
    if (who.locked_until && new Date(who.locked_until).getTime() > Date.now()) {
      res.status(429).json({ error: 'Too many wrong tries. Wait 15 minutes, or sign in with a text link instead.' });
      return;
    }
    if (!(await bcrypt.compare(password, who.password_hash))) {
      const attempts = (Number(who.failed_login_attempts) || 0) + 1;
      const lock = attempts >= PORTAL_MAX_PASSWORD_ATTEMPTS ? new Date(Date.now() + PORTAL_PASSWORD_LOCK_MS) : null;
      await pool.query(`UPDATE users SET failed_login_attempts = $2, locked_until = $3 WHERE id = $1`, [who.user_id, attempts, lock]);
      res.status(401).json({ error: BAD_SIGN_IN });
      return;
    }
    await pool.query(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`, [who.user_id]);
    const sessionToken = issuePatientSession(res, { id: who.user_id, username: who.username });
    await auditService.log({
      userId: who.user_id, action: 'read', entityType: 'patient_portal_login', entityId: who.patient_id,
      details: { method: 'password' }, ipAddress: getClientIP(req), userAgent: req.headers['user-agent'] || undefined,
    });
    res.json({
      message: 'Login successful',
      user: { id: who.user_id, username: who.username, role: 'patient', first_name: who.first_name, last_name: who.last_name, is_super_admin: false },
      token: sessionToken,
      target: null,
    });
  } catch (error) {
    console.error('Portal password login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/patient-portal/password  (signed-in patient) — set or change the
 * password. Signs out every other phone (a lost phone stays useless) and
 * hands this one a fresh session. Tells them the username to use next time.
 */
export const setPortalPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const problem = portalPasswordProblem(req.body?.password);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }
    const me = await pool.query(
      `SELECT p.id AS patient_id, p.patient_number, u.username, ${PHONE9_SQL} AS phone9,
              (SELECT COUNT(*)::int FROM patients p2 JOIN users u2 ON u2.id = p2.user_id
                WHERE u2.role = 'patient' AND u2.is_active = true AND p2.merged_into IS NULL
                  AND RIGHT(REGEXP_REPLACE(COALESCE(u2.phone, ''), '[^0-9]', '', 'g'), 9) = ${PHONE9_SQL}) AS on_phone
         FROM patients p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
      [userId]
    );
    const row = me.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Patient record not found' });
      return;
    }
    const hash = await bcrypt.hash(req.body.password, 10);
    // Sign out every other phone. Token times are whole seconds, so a session
    // made this same second would survive "revoked now": revoke from the NEXT
    // second and stamp this phone's new session at exactly that second.
    const cutoff = Math.floor(Date.now() / 1000) + 1;
    await pool.query(
      `UPDATE users SET password_hash = $2, portal_password_set = true, failed_login_attempts = 0, locked_until = NULL,
              tokens_revoked_at = to_timestamp($3) WHERE id = $1`,
      [userId, hash, cutoff]
    );
    const sessionToken = issuePatientSession(res, { id: userId, username: row.username }, cutoff);
    await auditService.log({
      userId, action: 'update', entityType: 'patient_portal_password', entityId: row.patient_id,
      ipAddress: getClientIP(req), userAgent: req.headers['user-agent'] || undefined,
    });
    const phoneWorks = typeof row.phone9 === 'string' && row.phone9.length === 9 && row.on_phone === 1;
    res.json({
      message: 'Password saved',
      token: sessionToken,
      sign_in_with: { patient_number: row.patient_number, phone_works: phoneWorks },
    });
  } catch (error) {
    console.error('Portal set password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
