import { Request, Response } from 'express';
import pool from '../database/db';

// Get all system updates
export const getSystemUpdates = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, status, limit = 50 } = req.query;

    let query = `
      SELECT su.*, u.first_name || ' ' || u.last_name as created_by_name
      FROM system_updates su
      LEFT JOIN users u ON su.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (category && category !== 'all') {
      query += ` AND su.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (status && status !== 'all') {
      query += ` AND su.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY su.update_date DESC, su.created_at DESC LIMIT $${paramCount}`;
    params.push(Number(limit));

    const result = await pool.query(query, params);

    res.json({
      updates: result.rows,
    });
  } catch (error) {
    console.error('Get system updates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new system update
export const createSystemUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const created_by = authReq.user?.id;

    const { title, description, category, status, version, update_date } = req.body;

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO system_updates (title, description, category, status, version, update_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        title,
        description,
        category || 'feature',
        status || 'completed',
        version || null,
        update_date || new Date(),
        created_by,
      ]
    );

    res.status(201).json({
      message: 'System update created successfully',
      update: result.rows[0],
    });
  } catch (error) {
    console.error('Create system update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update an existing system update
export const updateSystemUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, category, status, version, update_date } = req.body;

    const result = await pool.query(
      `UPDATE system_updates
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           status = COALESCE($4, status),
           version = COALESCE($5, version),
           update_date = COALESCE($6, update_date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [title, description, category, status, version, update_date, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'System update not found' });
      return;
    }

    res.json({
      message: 'System update updated successfully',
      update: result.rows[0],
    });
  } catch (error) {
    console.error('Update system update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a system update
export const deleteSystemUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM system_updates WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'System update not found' });
      return;
    }

    res.json({
      message: 'System update deleted successfully',
    });
  } catch (error) {
    console.error('Delete system update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get update statistics
export const getUpdateStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_updates,
        COUNT(*) FILTER (WHERE category = 'feature') as features,
        COUNT(*) FILTER (WHERE category = 'improvement') as improvements,
        COUNT(*) FILTER (WHERE category = 'bugfix') as bugfixes,
        COUNT(*) FILTER (WHERE status = 'planned') as planned,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        MAX(update_date) as latest_update_date
      FROM system_updates
    `);

    res.json({
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error('Get update stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
