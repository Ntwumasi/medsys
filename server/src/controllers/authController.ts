import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../database/db';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { email, password, role, first_name, last_name, phone } = req.body;

  try {
    // Validate required fields
    if (!email || !password || !role || !first_name || !last_name) {
      res.status(400).json({ error: 'Missing required fields' });
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

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, role, first_name, last_name, phone, created_at`,
      [email, password_hash, role, first_name, last_name, phone]
    );

    const user = result.rows[0];

    // Generate JWT token
    const secret = getJwtSecret();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      token,
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
  const { email, password } = req.body;

  try {
    // Validate required fields
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user
    const result = await pool.query(
      `SELECT id, email, password_hash, role, first_name, last_name, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      res.status(403).json({ error: 'Account is disabled' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate JWT token
    const secret = getJwtSecret();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      token,
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

export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await pool.query(
      `SELECT id, email, role, first_name, last_name, phone, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin impersonation - allows admin to log in as another user
export const impersonateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const adminId = authReq.user?.id;
    const adminRole = authReq.user?.role;
    const targetUserId = parseInt(req.params.userId);

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
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
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

    res.json({
      message: 'Impersonation successful',
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
      },
      token,
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
