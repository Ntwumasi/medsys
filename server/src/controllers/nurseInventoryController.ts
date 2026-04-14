import { Request, Response } from 'express';
import pool from '../database/db';

export const getNurseInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, search } = req.query;
    let query = `SELECT * FROM nurse_inventory WHERE is_active = TRUE`;
    const params: any[] = [];
    let idx = 1;

    if (category && category !== 'all') {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (search) {
      query += ` AND item_name ILIKE $${idx++}`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY category, item_name`;
    const result = await pool.query(query, params);

    // Stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE quantity_on_hand <= reorder_level) as low_stock,
        COUNT(DISTINCT category) as categories,
        COALESCE(SUM(quantity_on_hand * unit_cost), 0) as total_value
      FROM nurse_inventory WHERE is_active = TRUE
    `);

    res.json({
      items: result.rows,
      stats: stats.rows[0],
    });
  } catch (error) {
    console.error('Get nurse inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
};

export const createNurseInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { item_name, category, unit, quantity_on_hand, reorder_level, unit_cost, location, supplier } = req.body;

    if (!item_name) {
      res.status(400).json({ error: 'Item name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO nurse_inventory (item_name, category, unit, quantity_on_hand, reorder_level, unit_cost, location, supplier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [item_name, category || 'Supplies', unit || 'pcs', quantity_on_hand || 0, reorder_level || 10, unit_cost || 0, location || 'Nurse Station', supplier || null]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    console.error('Create nurse inventory error:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
};

export const updateNurseInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { item_name, category, unit, quantity_on_hand, reorder_level, unit_cost, location, supplier, is_active } = req.body;

    const result = await pool.query(
      `UPDATE nurse_inventory SET
        item_name = COALESCE($1, item_name),
        category = COALESCE($2, category),
        unit = COALESCE($3, unit),
        quantity_on_hand = COALESCE($4, quantity_on_hand),
        reorder_level = COALESCE($5, reorder_level),
        unit_cost = COALESCE($6, unit_cost),
        location = COALESCE($7, location),
        supplier = COALESCE($8, supplier),
        is_active = COALESCE($9, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [item_name, category, unit, quantity_on_hand, reorder_level, unit_cost, location, supplier, is_active, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Update nurse inventory error:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
};

export const recordNursePurchase = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    const { inventory_id, quantity, unit_cost, supplier, batch_number, notes } = req.body;

    if (!inventory_id || !quantity) {
      res.status(400).json({ error: 'inventory_id and quantity are required' });
      return;
    }

    await client.query('BEGIN');

    const totalCost = (unit_cost || 0) * quantity;

    // Record purchase
    const purchase = await client.query(
      `INSERT INTO nurse_purchases (inventory_id, quantity, unit_cost, total_cost, supplier, batch_number, notes, purchased_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [inventory_id, quantity, unit_cost || 0, totalCost, supplier || null, batch_number || null, notes || null, userId]
    );

    // Update stock
    await client.query(
      `UPDATE nurse_inventory SET
        quantity_on_hand = quantity_on_hand + $1,
        unit_cost = COALESCE($2, unit_cost),
        supplier = COALESCE($3, supplier),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [quantity, unit_cost, supplier, inventory_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Purchase recorded',
      purchase: purchase.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Record nurse purchase error:', error);
    res.status(500).json({ error: 'Failed to record purchase' });
  } finally {
    client.release();
  }
};

export const getNursePurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT np.*,
              ni.item_name, ni.category, ni.unit,
              u.first_name || ' ' || u.last_name as purchased_by_name
         FROM nurse_purchases np
         JOIN nurse_inventory ni ON np.inventory_id = ni.id
         LEFT JOIN users u ON np.purchased_by = u.id
        ORDER BY np.created_at DESC
        LIMIT 100`
    );

    res.json({ purchases: result.rows });
  } catch (error) {
    console.error('Get nurse purchases error:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
};
