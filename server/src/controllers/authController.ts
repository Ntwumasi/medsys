import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../database/db';
import { validatePassword, generateResetToken, hashResetToken, getPasswordRequirementsMessage } from '../utils/passwordValidation';
import { revokeToken, revokeAllUserTokens } from '../services/tokenService';

// Security constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const PASSWORD_EXPIRY_DAYS = 90;

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

// Helper to get client IP
const getClientIP = (req: Request): string => {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
         req.ip ||
         req.socket?.remoteAddress ||
         'unknown';
};

// Log login attempt
const logLoginAttempt = async (
  email: string,
  userId: number | null,
  success: boolean,
  failureReason: string | null,
  req: Request
): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO login_attempts (email, user_id, ip_address, user_agent, success, failure_reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [email, userId, getClientIP(req), req.headers['user-agent'] || null, success, failureReason]
    );
  } catch (error) {
    console.error('Failed to log login attempt:', error);
  }
};

// Log breakglass access
const logBreakglassAccess = async (
  userId: number,
  action: string,
  entityType: string | null,
  entityId: number | null,
  details: Record<string, unknown>,
  req: Request
): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO breakglass_alerts (breakglass_user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, entityType, entityId, JSON.stringify(details), getClientIP(req), req.headers['user-agent'] || null]
    );
  } catch (error) {
    console.error('Failed to log breakglass access:', error);
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { email, password, role, first_name, last_name, phone, employee_id } = req.body;

  try {
    // Validate required fields
    if (!email || !password || !role || !first_name || !last_name) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Validate password complexity
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
      return;
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      res.status(400).json({ error: 'User with this email already exists' });
      return;
    }

    // Check if employee_id is unique if provided
    if (employee_id) {
      const existingEmpId = await pool.query(
        'SELECT id FROM users WHERE employee_id = $1',
        [employee_id]
      );
      if (existingEmpId.rows.length > 0) {
        res.status(400).json({ error: 'Employee ID already in use' });
        return;
      }
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user with security fields
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, employee_id, password_changed_at, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)
       RETURNING id, email, role, first_name, last_name, phone, employee_id, created_at`,
      [email, password_hash, role, first_name, last_name, phone, employee_id || null, role === 'patient']
    );

    const user = result.rows[0];

    // Store in password history
    await pool.query(
      `INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)`,
      [user.id, password_hash]
    );

    // Generate JWT token
    const secret = getJwtSecret();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '24h' }
    );

    // Set HttpOnly cookie for secure token storage
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        employee_id: user.employee_id,
      },
      token, // Still include for backward compatibility
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error instanceof Error && error.message === 'JWT_SECRET environment variable is required') {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username: rawUsername, password } = req.body;

  try {
    // Validate required fields
    if (!rawUsername || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    // Normalize username: trim, lowercase, remove spaces
    const username = rawUsername.toString().trim().toLowerCase().replace(/\s+/g, '');

    // Find user by username (case-insensitive) with security fields
    const result = await pool.query(
      `SELECT id, username, email, password_hash, role, first_name, last_name, is_active,
              is_breakglass, is_super_admin, must_change_password, password_changed_at,
              failed_login_attempts, locked_until
       FROM users WHERE LOWER(username) = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      await logLoginAttempt(username, null, false, 'user_not_found', req);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logLoginAttempt(username, user.id, false, 'account_locked', req);
      // SECURITY: Don't reveal exact lock time to prevent timing attacks
      res.status(403).json({
        error: 'Account is temporarily locked due to multiple failed login attempts. Please try again later or contact an administrator.',
      });
      return;
    }

    // Check if user is active
    if (!user.is_active) {
      await logLoginAttempt(username, user.id, false, 'account_disabled', req);
      res.status(403).json({ error: 'Account is disabled. Please contact an administrator.' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      // Increment failed attempts
      const newAttempts = (user.failed_login_attempts || 0) + 1;

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        // Lock the account
        const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
          [newAttempts, lockUntil, user.id]
        );
        await logLoginAttempt(username, user.id, false, 'max_attempts_reached', req);
        res.status(403).json({
          error: `Account locked due to too many failed attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
          locked: true
        });
      } else {
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
          [newAttempts, user.id]
        );
        await logLoginAttempt(username, user.id, false, 'invalid_password', req);
        // SECURITY: Don't reveal attempt count to prevent enumeration attacks
        res.status(401).json({
          error: 'Invalid credentials'
        });
      }
      return;
    }

    // Successful login - reset failed attempts and update last login
    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    await logLoginAttempt(username, user.id, true, null, req);

    // Log breakglass access if applicable
    if (user.is_breakglass) {
      await logBreakglassAccess(user.id, 'login', null, null, { username: user.username }, req);
    }

    // Check if password has expired
    let passwordExpired = false;
    if (user.password_changed_at) {
      const daysSinceChange = Math.floor((Date.now() - new Date(user.password_changed_at).getTime()) / (1000 * 60 * 60 * 24));
      passwordExpired = daysSinceChange > PASSWORD_EXPIRY_DAYS;
    }

    // Generate JWT token
    const secret = getJwtSecret();
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, is_super_admin: user.is_super_admin || false },
      secret,
      { expiresIn: '24h' }
    );

    // Check if user must change password
    const mustChangePassword = user.must_change_password || passwordExpired;

    // Set HttpOnly cookie for secure token storage
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        is_breakglass: user.is_breakglass,
        is_super_admin: user.is_super_admin,
      },
      token, // Still include for backward compatibility with frontend
      must_change_password: mustChangePassword,
      password_expired: passwordExpired,
    });
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof Error && error.message === 'JWT_SECRET environment variable is required') {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as any;
  const userId = authReq.user?.id;
  const { current_password, new_password } = req.body;

  try {
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!current_password || !new_password) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    // Validate new password complexity
    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        error: 'New password does not meet requirements',
        details: passwordValidation.errors,
        requirements: getPasswordRequirementsMessage()
      });
      return;
    }

    // Get current user
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    // Check password history (prevent reuse of last 5 passwords)
    const historyResult = await pool.query(
      `SELECT password_hash FROM password_history
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    for (const row of historyResult.rows) {
      const isReused = await bcrypt.compare(new_password, row.password_hash);
      if (isReused) {
        res.status(400).json({
          error: 'Cannot reuse any of your last 5 passwords. Please choose a different password.'
        });
        return;
      }
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await pool.query(
      `UPDATE users SET
         password_hash = $1,
         password_changed_at = CURRENT_TIMESTAMP,
         must_change_password = false
       WHERE id = $2`,
      [newPasswordHash, userId]
    );

    // Add to password history
    await pool.query(
      `INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)`,
      [userId, newPasswordHash]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  try {
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Find user
    const userResult = await pool.query(
      'SELECT id, email, first_name FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      res.json({ message: 'If the email exists, a reset link will be sent.' });
      return;
    }

    const user = userResult.rows[0];

    // Generate reset token
    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing tokens
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );

    // Store new token
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, expiresAt, getClientIP(req), req.headers['user-agent'] || null]
    );

    // TODO: Send email with reset link
    // await sendResetEmail(user.email, user.first_name, token);

    // SECURITY: Never log or expose tokens in responses
    // In development, check database directly if needed for testing

    res.json({
      message: 'If the email exists, a reset link will be sent.'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { token, new_password } = req.body;

  try {
    if (!token || !new_password) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }

    // Validate new password
    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordValidation.errors,
        requirements: getPasswordRequirementsMessage()
      });
      return;
    }

    // Hash the provided token
    const tokenHash = hashResetToken(token);

    // Find valid token
    const tokenResult = await pool.query(
      `SELECT prt.*, u.id as user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token_hash = $1
         AND prt.expires_at > CURRENT_TIMESTAMP
         AND prt.used_at IS NULL`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const resetRecord = tokenResult.rows[0];

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await pool.query(
      `UPDATE users SET
         password_hash = $1,
         password_changed_at = CURRENT_TIMESTAMP,
         must_change_password = false,
         failed_login_attempts = 0,
         locked_until = NULL
       WHERE id = $2`,
      [newPasswordHash, resetRecord.user_id]
    );

    // Mark token as used
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [resetRecord.id]
    );

    // Add to password history
    await pool.query(
      `INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)`,
      [resetRecord.user_id, newPasswordHash]
    );

    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await pool.query(
      `SELECT id, email, role, first_name, last_name, phone, employee_id,
              is_breakglass, is_super_admin, must_change_password, password_changed_at, last_login_at, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];

    // Check if password has expired
    let passwordExpired = false;
    if (user.password_changed_at) {
      const daysSinceChange = Math.floor((Date.now() - new Date(user.password_changed_at).getTime()) / (1000 * 60 * 60 * 24));
      passwordExpired = daysSinceChange > PASSWORD_EXPIRY_DAYS;
    }

    res.json({
      user: {
        ...user,
        password_expired: passwordExpired,
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get login history for current user
export const getLoginHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await pool.query(
      `SELECT id, ip_address, user_agent, success, failure_reason, created_at
       FROM login_attempts
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    res.json({ login_history: result.rows });
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin: Get all login attempts (for security monitoring)
export const getAllLoginAttempts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, success, limit = 100 } = req.query;

    let query = `
      SELECT la.*, u.email, u.first_name, u.last_name, u.role
      FROM login_attempts la
      LEFT JOIN users u ON la.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND la.created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND la.created_at <= $${paramCount}`;
      params.push(end_date);
    }

    if (success !== undefined) {
      paramCount++;
      query += ` AND la.success = $${paramCount}`;
      params.push(success === 'true');
    }

    query += ` ORDER BY la.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({ login_attempts: result.rows });
  } catch (error) {
    console.error('Get all login attempts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin: Get breakglass alerts
export const getBreakglassAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, limit = 100 } = req.query;

    let query = `
      SELECT ba.*, u.email, u.first_name, u.last_name, u.role
      FROM breakglass_alerts ba
      JOIN users u ON ba.breakglass_user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND ba.created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND ba.created_at <= $${paramCount}`;
      params.push(end_date);
    }

    query += ` ORDER BY ba.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({ breakglass_alerts: result.rows });
  } catch (error) {
    console.error('Get breakglass alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin: Unlock user account
export const unlockAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [userId]
    );

    res.json({ message: 'Account unlocked successfully' });
  } catch (error) {
    console.error('Unlock account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin: Force password reset
export const forcePasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    await pool.query(
      `UPDATE users SET must_change_password = true WHERE id = $1`,
      [userId]
    );

    res.json({ message: 'User will be required to change password on next login' });
  } catch (error) {
    console.error('Force password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin impersonation - allows admin to log in as another user
export const impersonateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const adminId = authReq.user?.id;
    const adminRole = authReq.user?.role;
    const targetUserId = parseInt(req.params.userId as string);

    // Verify the requesting user is an admin
    if (adminRole !== 'admin') {
      res.status(403).json({ error: 'Only administrators can impersonate users' });
      return;
    }

    // Validate target user ID
    if (!targetUserId || isNaN(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Get target user
    const targetResult = await pool.query(
      `SELECT id, email, role, first_name, last_name, is_active
       FROM users WHERE id = $1`,
      [targetUserId]
    );

    if (targetResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const targetUser = targetResult.rows[0];

    // Check if target user is active
    if (!targetUser.is_active) {
      res.status(403).json({ error: 'Cannot impersonate an inactive user' });
      return;
    }

    // Prevent admin from impersonating another admin
    if (targetUser.role === 'admin') {
      res.status(403).json({ error: 'Cannot impersonate another administrator' });
      return;
    }

    // Log the impersonation
    const ipAddress = getClientIP(req);
    await pool.query(
      `INSERT INTO impersonation_logs (admin_id, impersonated_user_id, impersonated_role, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, targetUserId, targetUser.role, ipAddress]
    );

    // Generate JWT token for the target user with impersonation flag
    const secret = getJwtSecret();
    const token = jwt.sign(
      {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        impersonatedBy: adminId
      },
      secret,
      { expiresIn: '2h' } // Shorter expiry for impersonation sessions
    );

    // Set HttpOnly cookie for secure token storage (shorter expiry for impersonation)
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000, // 2 hours for impersonation
      path: '/',
    });

    res.json({
      message: 'Impersonation successful',
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
      },
      token, // Still include for backward compatibility
      impersonation: {
        adminId: adminId,
        startedAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Impersonation error:', error);
    if (error instanceof Error && error.message === 'JWT_SECRET environment variable is required') {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Super admin role switcher - log in as the demo user for a given role.
// This makes cross-department workflow testing seamless: workflows
// routed to "the nurse" go to the demo nurse user (Sarah Johnson), etc.
export const switchToDemoRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const adminId = authReq.user?.id;
    const isSuperAdmin = authReq.user?.is_super_admin === true;
    const targetRole = req.params.role;

    if (!isSuperAdmin) {
      res.status(403).json({ error: 'Only super admins can switch roles' });
      return;
    }

    if (!targetRole) {
      res.status(400).json({ error: 'Role is required' });
      return;
    }

    const targetResult = await pool.query(
      `SELECT id, email, username, role, first_name, last_name, is_active
         FROM users
        WHERE role = $1 AND is_demo_user = TRUE AND is_active = TRUE
        ORDER BY id ASC
        LIMIT 1`,
      [targetRole]
    );

    if (targetResult.rows.length === 0) {
      res.status(404).json({ error: `No demo user configured for role '${targetRole}'` });
      return;
    }

    const targetUser = targetResult.rows[0];

    // Audit
    const ipAddress = getClientIP(req);
    await pool.query(
      `INSERT INTO impersonation_logs (admin_id, impersonated_user_id, impersonated_role, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, targetUser.id, targetUser.role, ipAddress]
    );

    // Issue a token for the demo user. Crucially, is_super_admin is FALSE on
    // this token so the demo session sees only what their role would see.
    const secret = getJwtSecret();
    const token = jwt.sign(
      {
        id: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
        is_super_admin: false,
        impersonatedBy: adminId,
      },
      secret,
      { expiresIn: '8h' }
    );

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      message: 'Role switch successful',
      user: {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
        is_super_admin: false,
        is_demo_user: true,
      },
      token,
    });
  } catch (error) {
    console.error('Role switch error:', error);
    if (error instanceof Error && error.message === 'JWT_SECRET environment variable is required') {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Logout - revoke current token
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const token = authReq.token;
    const userId = authReq.user?.id;

    if (!token) {
      res.status(400).json({ error: 'No token to revoke' });
      return;
    }

    // Decode token to get expiration
    const decoded = jwt.decode(token) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24h

    // Add token to blacklist
    await revokeToken(token, userId, expiresAt, 'logout');

    // Clear HttpOnly cookie if set
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
};

// Logout all sessions - revoke all tokens for user
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const token = authReq.token;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Revoke current token
    if (token) {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      await revokeToken(token, userId, expiresAt, 'security');
    }

    // Mark all user tokens as revoked
    await revokeAllUserTokens(userId, 'security');

    // Clear HttpOnly cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    res.json({ message: 'All sessions logged out successfully' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Failed to logout all sessions' });
  }
};
