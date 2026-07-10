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
    // Structured per-user assignee (added later than the base table) so a task
    // can be shown to just the person it's assigned to (e.g. the Marketing
    // dashboard). Self-heals on existing installs even before the migration runs.
    await pool.query(`ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_tasks_status   ON admin_tasks(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_tasks_category ON admin_tasks(category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_tasks_assigned_to ON admin_tasks(assigned_to)`);

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
    const authReq = req as any;
    const user = authReq.user || {};
    const { status, category, assignee_role } = req.query as {
      status?: string; category?: string; assignee_role?: string;
    };

    // Scope shared by the list and the count chips (assignee + category).
    // A marketing user only ever sees the tasks assigned to THEM; admins /
    // office-managers / super-admins see everything, and can preview a role's
    // tasks via ?assignee_role (used by the Marketing dashboard).
    const scope: string[] = [];
    const scopeParams: any[] = [];
    if (category) {
      scopeParams.push(category);
      scope.push(`t.category = $${scopeParams.length}`);
    }
    if (user.role === 'marketing' && !user.is_super_admin) {
      // Marketing sees tasks assigned to marketing (scoped by the assignee's
      // role, not a single user id) — so it works both for the real marketing
      // user and for a super admin previewing via a demo marketing session.
      scopeParams.push('marketing');
      scope.push(`au.role = $${scopeParams.length}`);
    } else if (assignee_role) {
      scopeParams.push(assignee_role);
      scope.push(`au.role = $${scopeParams.length}`);
    }

    // List adds the (list-only) status filter on top of the shared scope.
    const listParams = [...scopeParams];
    const listWhere = [...scope];
    if (status && VALID_STATUSES.includes(status)) {
      listParams.push(status);
      listWhere.push(`t.status = $${listParams.length}`);
    }

    const sql = `
      SELECT t.id, t.category, t.task, t.contact_person, t.responsibility, t.status,
             t.remarks, t.cost, t.due_date, t.assigned_to,
             au.first_name || ' ' || au.last_name AS assigned_to_name,
             t.created_at, t.updated_at
        FROM admin_tasks t
        LEFT JOIN users au ON t.assigned_to = au.id
        ${listWhere.length ? 'WHERE ' + listWhere.join(' AND ') : ''}
       ORDER BY
         CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 WHEN 'complete' THEN 3 ELSE 4 END,
         t.category ASC,
         t.id ASC
    `;
    const r = await pool.query(sql, listParams);

    // Summary counts for filter chips on the UI (respect the same scope).
    const counts = await pool.query(
      `SELECT t.status, COUNT(*)::int AS n
         FROM admin_tasks t
         LEFT JOIN users au ON t.assigned_to = au.id
         ${scope.length ? 'WHERE ' + scope.join(' AND ') : ''}
        GROUP BY t.status`,
      scopeParams
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
    const { category, task, contact_person, responsibility, status, remarks, cost, due_date, assigned_to } = req.body;
    if (!category || !task) {
      res.status(400).json({ error: 'category and task are required' });
      return;
    }
    const stat = status && VALID_STATUSES.includes(status) ? status : 'pending';
    const r = await pool.query(
      `INSERT INTO admin_tasks (category, task, contact_person, responsibility, status, remarks, cost, due_date, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [category, task, contact_person || null, responsibility || null, stat, remarks || null, cost || null, due_date || null, assigned_to || null, userId || null]
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
    const authReq = req as any;
    const user = authReq.user || {};
    const id = parseInt(String(req.params.id), 10);
    const { category, task, contact_person, responsibility, status, remarks, cost, due_date, assigned_to } = req.body;
    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    // A marketing user may only touch tasks assigned to them (they reach this
    // route to update their own task status/remarks, not others').
    if (user.role === 'marketing' && !user.is_super_admin) {
      const own = await pool.query(
        `SELECT au.role AS assignee_role
           FROM admin_tasks t LEFT JOIN users au ON t.assigned_to = au.id
          WHERE t.id = $1`,
        [id]
      );
      if (own.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (own.rows[0].assignee_role !== 'marketing') {
        res.status(403).json({ error: 'You can only update marketing tasks' });
        return;
      }
    }

    // Dynamic SET so we don't blow away fields the caller didn't send
    const setClauses: string[] = [];
    const params: any[] = [];
    const fields: Array<[string, any]> = [
      ['category', category], ['task', task],
      ['contact_person', contact_person], ['responsibility', responsibility],
      ['status', status], ['remarks', remarks], ['cost', cost], ['due_date', due_date],
      ['assigned_to', assigned_to],
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
