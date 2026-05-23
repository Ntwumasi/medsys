import { Request, Response } from 'express';
import pool from '../database/db';
import { adminTaskSeeds } from '../database/seeds/adminTasks';

// One-time schema + seed bootstrap, runs lazily on first request so the
// table lands automatically on the Vercel deploy without a manual
// migration step.
let adminTasksReady = false;
const ensureAdminTasks = async (): Promise<void> => {
  if (adminTasksReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_tasks (
        id              SERIAL PRIMARY KEY,
        category        VARCHAR(100) NOT NULL,
        task            TEXT NOT NULL,
        contact_person  VARCHAR(255),
        responsibility  VARCHAR(255),
        status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'complete', 'blocked')),
        remarks         TEXT,
        cost            VARCHAR(100),
        due_date        DATE,
        created_by      INTEGER REFERENCES users(id),
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_tasks_status   ON admin_tasks(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_tasks_category ON admin_tasks(category)`);

    // First-time seed from the imported xlsx — only if the table is empty
    // so we don't double-seed on re-runs after admin has been editing.
    const existing = await pool.query('SELECT COUNT(*)::int AS n FROM admin_tasks');
    if (existing.rows[0].n === 0) {
      for (const row of adminTaskSeeds) {
        await pool.query(
          `INSERT INTO admin_tasks (category, task, contact_person, responsibility, status, remarks, cost)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [row.category, row.task, row.contact_person, row.responsibility, row.status, row.remarks, row.cost]
        );
      }
    }
    adminTasksReady = true;
  } catch (err) {
    console.error('Failed to ensure admin_tasks:', err);
  }
};

const VALID_STATUSES = ['pending', 'in_progress', 'complete', 'blocked'];

export const listAdminTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAdminTasks();
    const { status, category } = req.query as { status?: string; category?: string };
    const where: string[] = [];
    const params: any[] = [];
    if (status && VALID_STATUSES.includes(status)) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    const sql = `
      SELECT id, category, task, contact_person, responsibility, status,
             remarks, cost, due_date, created_at, updated_at
        FROM admin_tasks
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY
         CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 WHEN 'complete' THEN 3 ELSE 4 END,
         category ASC,
         id ASC
    `;
    const r = await pool.query(sql, params);

    // Summary counts for filter chips on the UI
    const counts = await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM admin_tasks GROUP BY status`
    );
    const summary: Record<string, number> = { pending: 0, in_progress: 0, complete: 0, blocked: 0 };
    for (const c of counts.rows) summary[c.status] = c.n;

    res.json({ tasks: r.rows, counts: summary });
  } catch (error) {
    console.error('List admin tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createAdminTask = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAdminTasks();
    const authReq = req as any;
    const userId = authReq.user?.id;
    const { category, task, contact_person, responsibility, status, remarks, cost, due_date } = req.body;
    if (!category || !task) {
      res.status(400).json({ error: 'category and task are required' });
      return;
    }
    const stat = status && VALID_STATUSES.includes(status) ? status : 'pending';
    const r = await pool.query(
      `INSERT INTO admin_tasks (category, task, contact_person, responsibility, status, remarks, cost, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [category, task, contact_person || null, responsibility || null, stat, remarks || null, cost || null, due_date || null, userId || null]
    );
    res.status(201).json({ task: r.rows[0] });
  } catch (error) {
    console.error('Create admin task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminTask = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAdminTasks();
    const id = parseInt(String(req.params.id), 10);
    const { category, task, contact_person, responsibility, status, remarks, cost, due_date } = req.body;
    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    // Dynamic SET so we don't blow away fields the caller didn't send
    const setClauses: string[] = [];
    const params: any[] = [];
    const fields: Array<[string, any]> = [
      ['category', category], ['task', task],
      ['contact_person', contact_person], ['responsibility', responsibility],
      ['status', status], ['remarks', remarks], ['cost', cost], ['due_date', due_date],
    ];
    for (const [col, val] of fields) {
      if (val !== undefined) {
        params.push(val === '' ? null : val);
        setClauses.push(`${col} = $${params.length}`);
      }
    }
    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);
    const r = await pool.query(
      `UPDATE admin_tasks SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ task: r.rows[0] });
  } catch (error) {
    console.error('Update admin task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteAdminTask = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAdminTasks();
    const id = parseInt(String(req.params.id), 10);
    const r = await pool.query('DELETE FROM admin_tasks WHERE id = $1 RETURNING id', [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ message: 'Task deleted', id: r.rows[0].id });
  } catch (error) {
    console.error('Delete admin task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
