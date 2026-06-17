import { Request, Response } from 'express';
import pool from '../database/db';

interface AuthedRequest extends Request {
  user?: { id: number; role: string; is_super_admin?: boolean };
}

// Auto-create the tables on first use so the feature works even if the
// addLabTestSets migration hasn't been run against this environment yet.
let tablesEnsured = false;
const ensureTables = async (): Promise<void> => {
  if (tablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_test_sets (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      is_shared BOOLEAN NOT NULL DEFAULT TRUE,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_test_set_items (
      id SERIAL PRIMARY KEY,
      set_id INTEGER NOT NULL REFERENCES lab_test_sets(id) ON DELETE CASCADE,
      test_name VARCHAR(200) NOT NULL,
      default_priority VARCHAR(20) NOT NULL DEFAULT 'routine'
        CHECK (default_priority IN ('routine', 'urgent', 'stat')),
      display_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  tablesEnsured = true;
};

// GET /api/lab-test-sets
// Returns the caller's personal sets + all clinic-shared sets, with each
// set's items inlined. Ordered by use_count desc so the most-used sets pin
// to the front for the chip row.
export const getLabTestSets = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await ensureTables();

    const setsResult = await pool.query(
      `SELECT s.id, s.name, s.description, s.created_by, s.is_shared,
              s.use_count, s.last_used_at, s.created_at,
              u.first_name || ' ' || u.last_name AS created_by_name
         FROM lab_test_sets s
         JOIN users u ON s.created_by = u.id
        WHERE s.deleted_at IS NULL
          AND (s.is_shared = TRUE OR s.created_by = $1)
        ORDER BY s.use_count DESC, s.last_used_at DESC NULLS LAST, s.name ASC`,
      [userId]
    );

    const sets = setsResult.rows;
    if (sets.length === 0) {
      res.json({ sets: [] });
      return;
    }

    const itemsResult = await pool.query(
      `SELECT set_id, test_name, default_priority, display_order
         FROM lab_test_set_items
        WHERE set_id = ANY($1::int[])
        ORDER BY set_id, display_order, id`,
      [sets.map(s => s.id)]
    );

    const itemsBySet = new Map<number, Array<{ test_name: string; default_priority: string }>>();
    for (const row of itemsResult.rows) {
      if (!itemsBySet.has(row.set_id)) itemsBySet.set(row.set_id, []);
      itemsBySet.get(row.set_id)!.push({
        test_name: row.test_name,
        default_priority: row.default_priority,
      });
    }

    res.json({
      sets: sets.map(s => ({
        ...s,
        is_mine: s.created_by === userId,
        items: itemsBySet.get(s.id) || [],
      })),
    });
  } catch (error) {
    console.error('Get lab test sets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/lab-test-sets
// Body: { name, description?, is_shared?, items: [{ test_name, default_priority? }] }
export const createLabTestSet = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const userId = (req as AuthedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await ensureTables();

    const { name, description, is_shared, items } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Set name is required' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'A test set must contain at least one test' });
      return;
    }
    const cleanItems = items
      .map((it: any) => ({
        test_name: typeof it?.test_name === 'string' ? it.test_name.trim() : '',
        default_priority:
          ['routine', 'urgent', 'stat'].includes(it?.default_priority)
            ? it.default_priority
            : 'routine',
      }))
      .filter(it => it.test_name.length > 0);

    if (cleanItems.length === 0) {
      res.status(400).json({ error: 'A test set must contain at least one valid test' });
      return;
    }

    await client.query('BEGIN');

    const setResult = await client.query(
      `INSERT INTO lab_test_sets (name, description, created_by, is_shared)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, created_by, is_shared, use_count, last_used_at, created_at`,
      [name.trim(), description?.trim() || null, userId, is_shared !== false]
    );
    const newSet = setResult.rows[0];

    for (let i = 0; i < cleanItems.length; i++) {
      const it = cleanItems[i];
      await client.query(
        `INSERT INTO lab_test_set_items (set_id, test_name, default_priority, display_order)
         VALUES ($1, $2, $3, $4)`,
        [newSet.id, it.test_name, it.default_priority, i]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      set: {
        ...newSet,
        is_mine: true,
        items: cleanItems,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create lab test set error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// POST /api/lab-test-sets/:id/apply
// Tracks usage so the most-used sets pin to the front of the chip row.
export const applyLabTestSet = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const setId = parseInt(req.params.id as string, 10);
    if (!setId || Number.isNaN(setId)) {
      res.status(400).json({ error: 'Invalid set id' });
      return;
    }

    await pool.query(
      `UPDATE lab_test_sets
          SET use_count = use_count + 1,
              last_used_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL`,
      [setId]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Apply lab test set error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/lab-test-sets/:id
// Soft delete. Only the creator or an admin/super-admin can delete.
export const deleteLabTestSet = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthedRequest;
    const userId = authReq.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const setId = parseInt(req.params.id as string, 10);
    if (!setId || Number.isNaN(setId)) {
      res.status(400).json({ error: 'Invalid set id' });
      return;
    }

    const existing = await pool.query(
      `SELECT created_by FROM lab_test_sets WHERE id = $1 AND deleted_at IS NULL`,
      [setId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Set not found' });
      return;
    }

    const isCreator = existing.rows[0].created_by === userId;
    const isAdmin = authReq.user?.role === 'admin' || authReq.user?.role === 'office_manager' || authReq.user?.is_super_admin === true;
    if (!isCreator && !isAdmin) {
      res.status(403).json({ error: 'Only the creator or an admin can delete this set' });
      return;
    }

    await pool.query(
      `UPDATE lab_test_sets SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [setId]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete lab test set error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
