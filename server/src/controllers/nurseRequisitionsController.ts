import { Request, Response } from 'express';
import pool from '../database/db';

interface AuthedRequest extends Request {
  user?: { id: number; role: string; is_super_admin?: boolean };
}

// Auto-create tables on first call so the feature works without running
// the migration manually first. Mirrors the pattern used in nurse
// inventory + lab test sets.
let tablesEnsured = false;
const ensureTables = async (): Promise<void> => {
  if (tablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurse_requisitions (
      id SERIAL PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP,
      received_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurse_requisition_items (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER NOT NULL REFERENCES nurse_requisitions(id) ON DELETE CASCADE,
      inventory_id INTEGER REFERENCES nurse_inventory(id) ON DELETE SET NULL,
      item_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      estimated_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      unit VARCHAR(50) DEFAULT 'pcs',
      notes TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tablesEnsured = true;
};

// GET /api/nurse/requisitions[?status=draft|sent|...]
// Returns list with items + computed totals.
export const listRequisitions = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const { status } = req.query;
    const params: any[] = [];
    let where = '';
    if (typeof status === 'string') {
      where = 'WHERE r.status = $1';
      params.push(status);
    }
    const headers = await pool.query(
      `SELECT r.id, r.status, r.notes, r.created_by, r.created_at, r.sent_at, r.received_at,
              u.first_name || ' ' || u.last_name AS created_by_name
         FROM nurse_requisitions r
         JOIN users u ON r.created_by = u.id
         ${where}
        ORDER BY r.created_at DESC`,
      params
    );
    if (headers.rows.length === 0) {
      res.json({ requisitions: [] });
      return;
    }
    const items = await pool.query(
      `SELECT id, requisition_id, inventory_id, item_name, quantity,
              estimated_unit_cost, unit, notes, display_order
         FROM nurse_requisition_items
        WHERE requisition_id = ANY($1::int[])
        ORDER BY requisition_id, display_order, id`,
      [headers.rows.map(r => r.id)]
    );
    const byReq = new Map<number, any[]>();
    for (const it of items.rows) {
      if (!byReq.has(it.requisition_id)) byReq.set(it.requisition_id, []);
      byReq.get(it.requisition_id)!.push(it);
    }
    res.json({
      requisitions: headers.rows.map(h => {
        const its = byReq.get(h.id) || [];
        const total = its.reduce((s, i) => s + (Number(i.quantity) * Number(i.estimated_unit_cost)), 0);
        return { ...h, items: its, total_estimated: total };
      }),
    });
  } catch (error) {
    console.error('List requisitions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/nurse/requisitions  body: { notes?, items: [{inventory_id?, item_name, quantity, estimated_unit_cost, unit, notes}] }
export const createRequisition = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await ensureTables();
    const userId = (req as AuthedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const { notes, items } = req.body || {};

    await client.query('BEGIN');
    const reqResult = await client.query(
      `INSERT INTO nurse_requisitions (status, notes, created_by)
       VALUES ('draft', $1, $2)
       RETURNING id, status, notes, created_by, created_at, sent_at, received_at`,
      [notes?.trim() || null, userId]
    );
    const reqRow = reqResult.rows[0];

    const cleanItems: any[] = [];
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        if (typeof it.item_name !== 'string' || !it.item_name.trim()) continue;
        if (typeof it.quantity !== 'number' && typeof it.quantity !== 'string') continue;
        const qty = parseInt(it.quantity);
        if (!qty || qty <= 0) continue;
        const ins = await client.query(
          `INSERT INTO nurse_requisition_items
             (requisition_id, inventory_id, item_name, quantity, estimated_unit_cost, unit, notes, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, requisition_id, inventory_id, item_name, quantity, estimated_unit_cost, unit, notes, display_order`,
          [
            reqRow.id,
            it.inventory_id || null,
            it.item_name.trim(),
            qty,
            parseFloat(it.estimated_unit_cost) || 0,
            it.unit?.trim() || 'pcs',
            it.notes?.trim() || null,
            i,
          ]
        );
        cleanItems.push(ins.rows[0]);
      }
    }
    await client.query('COMMIT');

    const total = cleanItems.reduce((s, i) => s + Number(i.quantity) * Number(i.estimated_unit_cost), 0);
    res.status(201).json({ requisition: { ...reqRow, items: cleanItems, total_estimated: total } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create requisition error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// PUT /api/nurse/requisitions/:id  body: { notes?, status?, items? (full replace) }
// items: same shape as POST; passing items REPLACES all existing items.
export const updateRequisition = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await ensureTables();
    const id = parseInt(req.params.id as string);
    if (!id) {
      res.status(400).json({ error: 'Invalid requisition id' });
      return;
    }
    const { notes, status, items } = req.body || {};

    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, status FROM nurse_requisitions WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Requisition not found' });
      return;
    }
    const wasDraft = existing.rows[0].status === 'draft';

    // Only drafts may have items edited. Sent/received/cancelled are locked.
    if (items !== undefined && !wasDraft) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Cannot edit items on a non-draft requisition' });
      return;
    }

    const fields: string[] = [];
    const params: any[] = [];
    let p = 1;
    if (typeof notes !== 'undefined') {
      fields.push(`notes = $${p++}`);
      params.push(notes?.trim() || null);
    }
    if (typeof status === 'string') {
      const valid = ['draft', 'sent', 'received', 'cancelled'];
      if (!valid.includes(status)) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      fields.push(`status = $${p++}`);
      params.push(status);
      if (status === 'sent') {
        fields.push(`sent_at = CURRENT_TIMESTAMP`);
      } else if (status === 'received') {
        fields.push(`received_at = CURRENT_TIMESTAMP`);
      }
    }
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    if (fields.length > 1) {
      params.push(id);
      await client.query(
        `UPDATE nurse_requisitions SET ${fields.join(', ')} WHERE id = $${p}`,
        params
      );
    }

    if (Array.isArray(items)) {
      await client.query(`DELETE FROM nurse_requisition_items WHERE requisition_id = $1`, [id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        if (typeof it.item_name !== 'string' || !it.item_name.trim()) continue;
        const qty = parseInt(it.quantity);
        if (!qty || qty <= 0) continue;
        await client.query(
          `INSERT INTO nurse_requisition_items
             (requisition_id, inventory_id, item_name, quantity, estimated_unit_cost, unit, notes, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            it.inventory_id || null,
            it.item_name.trim(),
            qty,
            parseFloat(it.estimated_unit_cost) || 0,
            it.unit?.trim() || 'pcs',
            it.notes?.trim() || null,
            i,
          ]
        );
      }
    }
    await client.query('COMMIT');

    // Return updated record
    const headerRow = await pool.query(
      `SELECT r.id, r.status, r.notes, r.created_by, r.created_at, r.sent_at, r.received_at,
              u.first_name || ' ' || u.last_name AS created_by_name
         FROM nurse_requisitions r JOIN users u ON r.created_by = u.id
        WHERE r.id = $1`,
      [id]
    );
    const itemRows = await pool.query(
      `SELECT id, requisition_id, inventory_id, item_name, quantity,
              estimated_unit_cost, unit, notes, display_order
         FROM nurse_requisition_items
        WHERE requisition_id = $1
        ORDER BY display_order, id`,
      [id]
    );
    const total = itemRows.rows.reduce((s, i) => s + Number(i.quantity) * Number(i.estimated_unit_cost), 0);
    res.json({
      requisition: { ...headerRow.rows[0], items: itemRows.rows, total_estimated: total },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update requisition error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// DELETE /api/nurse/requisitions/:id  — only drafts can be deleted; others use status=cancelled
export const deleteRequisition = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id as string);
    if (!id) {
      res.status(400).json({ error: 'Invalid requisition id' });
      return;
    }
    const existing = await pool.query(
      `SELECT status FROM nurse_requisitions WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Requisition not found' });
      return;
    }
    if (existing.rows[0].status !== 'draft') {
      res.status(400).json({ error: 'Only draft requisitions can be deleted. Use cancel for sent ones.' });
      return;
    }
    await pool.query(`DELETE FROM nurse_requisitions WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete requisition error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
