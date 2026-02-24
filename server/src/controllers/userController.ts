import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../database/db';

// Get all users (staff members) - optionally filter by role
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role } = req.query;

    let query = `
      SELECT id, email, role, first_name, last_name, phone, is_active, created_at, updated_at
      FROM users
      WHERE role != 'patient'
    `;
    const params: any[] = [];

    if (role) {
      query += ` AND role = $1`;
      params.push(role);
    }

    query += ` ORDER BY last_name ASC, first_name ASC`;

    const result = await pool.query(query, params);

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single user by ID
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, email, role, first_name, last_name, phone, is_active, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create new user (staff member)
export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password, role, first_name, last_name, phone } = req.body;

  try {
    // Validate required fields
    if (!email || !password || !role || !first_name || !last_name) {
      res.status(400).json({ error: 'Missing required fields: email, password, role, first_name, last_name' });
      return;
    }

    // Validate role
    const validRoles = ['doctor', 'nurse', 'admin', 'receptionist', 'lab', 'pharmacy', 'imaging'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
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
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, email, role, first_name, last_name, phone, is_active, created_at`,
      [email, password_hash, role, first_name, last_name, phone]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update user
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { email, role, first_name, last_name, phone, is_active, password } = req.body;

  try {
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );

    if (existingUser.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['doctor', 'nurse', 'admin', 'receptionist', 'lab', 'pharmacy', 'imaging'];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
        return;
      }
    }

    // Check if email is being changed and if it's already taken
    if (email) {
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, id]
      );

      if (emailCheck.rows.length > 0) {
        res.status(400).json({ error: 'Email already in use by another user' });
        return;
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      updateValues.push(email);
    }
    if (role !== undefined) {
      updateFields.push(`role = $${paramIndex++}`);
      updateValues.push(role);
    }
    if (first_name !== undefined) {
      updateFields.push(`first_name = $${paramIndex++}`);
      updateValues.push(first_name);
    }
    if (last_name !== undefined) {
      updateFields.push(`last_name = $${paramIndex++}`);
      updateValues.push(last_name);
    }
    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex++}`);
      updateValues.push(phone);
    }
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(is_active);
    }
    if (password !== undefined && password !== '') {
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);
      updateFields.push(`password_hash = $${paramIndex++}`);
      updateValues.push(password_hash);
    }

    if (updateFields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(id);

    const query = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, role, first_name, last_name, phone, is_active, updated_at
    `;

    const result = await pool.query(query, updateValues);

    res.json({
      message: 'User updated successfully',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete user (soft delete by deactivating)
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1',
      [id]
    );

    if (existingUser.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Soft delete by setting is_active to false
    await pool.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({
      message: 'User deactivated successfully',
      user: existingUser.rows[0]
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Activate user
export const activateUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE users
       SET is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, email, role, first_name, last_name, is_active`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      message: 'User activated successfully',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get active doctors - accessible by nurses for lab ordering
export const getActiveDoctors = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT id, first_name, last_name, email
      FROM users
      WHERE role = 'doctor' AND is_active = true
      ORDER BY last_name ASC, first_name ASC
    `);

    res.json({ doctors: result.rows });
  } catch (error) {
    console.error('Get active doctors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
