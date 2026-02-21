import { Request, Response } from 'express';
import pool from '../database/db';

// Get all lab inventory items with optional filters
export const getLabInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { item_type, category, low_stock, expiring_soon, search, include_inactive } = req.query;

    let query = `
      SELECT
        i.*,
        CASE WHEN i.quantity_on_hand <= i.reorder_level THEN true ELSE false END as is_low_stock,
        CASE WHEN i.item_type != 'equipment' AND i.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN true ELSE false END as is_expiring_soon,
        CASE WHEN i.item_type = 'equipment' AND i.next_calibration_date <= CURRENT_DATE + INTERVAL '30 days' THEN true ELSE false END as is_calibration_due
      FROM lab_inventory i
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (!include_inactive) {
      query += ` AND i.is_active = true`;
    }

    if (item_type) {
      query += ` AND i.item_type = $${paramIndex}`;
      params.push(item_type);
      paramIndex++;
    }

    if (category) {
      query += ` AND i.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (low_stock === 'true') {
      query += ` AND i.quantity_on_hand <= i.reorder_level`;
    }

    if (expiring_soon === 'true') {
      query += ` AND i.item_type != 'equipment' AND i.expiry_date <= CURRENT_DATE + INTERVAL '90 days'`;
    }

    if (search) {
      query += ` AND (i.item_name ILIKE $${paramIndex} OR i.category ILIKE $${paramIndex} OR i.lot_number ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY i.item_name ASC`;

    const result = await pool.query(query, params);

    // Get summary stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE quantity_on_hand <= reorder_level) as low_stock_count,
        COUNT(*) FILTER (WHERE item_type != 'equipment' AND expiry_date <= CURRENT_DATE + INTERVAL '90 days') as expiring_soon_count,
        COUNT(*) FILTER (WHERE item_type != 'equipment' AND expiry_date < CURRENT_DATE) as expired_count,
        COUNT(*) FILTER (WHERE item_type = 'equipment' AND next_calibration_date <= CURRENT_DATE + INTERVAL '30 days') as calibration_due_count,
        SUM(quantity_on_hand * unit_cost) as total_stock_value
      FROM lab_inventory
      WHERE is_active = true
    `);

    res.json({
      inventory: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Get lab inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch lab inventory' });
  }
};

// Get single lab inventory item
export const getLabInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM lab_inventory WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lab inventory item not found' });
      return;
    }

    // Get transaction history
    const transactions = await pool.query(
      `SELECT t.*, u.first_name, u.last_name
       FROM lab_inventory_transactions t
       LEFT JOIN users u ON t.performed_by = u.id
       WHERE t.inventory_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({
      item: result.rows[0],
      transactions: transactions.rows
    });
  } catch (error) {
    console.error('Get lab inventory item error:', error);
    res.status(500).json({ error: 'Failed to fetch lab inventory item' });
  }
};

// Add new lab inventory item
export const createLabInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      item_name,
      item_type,
      category,
      unit,
      quantity_on_hand,
      reorder_level,
      unit_cost,
      expiry_date,
      lot_number,
      supplier,
      storage_location,
      storage_conditions,
      last_calibration_date,
      next_calibration_date
    } = req.body;

    const result = await pool.query(
      `INSERT INTO lab_inventory
       (item_name, item_type, category, unit, quantity_on_hand, reorder_level,
        unit_cost, expiry_date, lot_number, supplier, storage_location, storage_conditions,
        last_calibration_date, next_calibration_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [item_name, item_type, category, unit, quantity_on_hand || 0, reorder_level || 10,
       unit_cost || 0, expiry_date, lot_number, supplier, storage_location || 'Main Lab',
       storage_conditions, last_calibration_date, next_calibration_date]
    );

    // Log the initial stock as a purchase transaction
    const authReq = req as any;
    if (quantity_on_hand > 0) {
      await pool.query(
        `INSERT INTO lab_inventory_transactions
         (inventory_id, transaction_type, quantity, notes, performed_by)
         VALUES ($1, 'purchase', $2, 'Initial stock entry', $3)`,
        [result.rows[0].id, quantity_on_hand, authReq.user?.id]
      );
    }

    res.status(201).json({
      message: 'Lab inventory item created successfully',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Create lab inventory item error:', error);
    res.status(500).json({ error: 'Failed to create lab inventory item' });
  }
};

// Update lab inventory item
export const updateLabInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      item_name,
      item_type,
      category,
      unit,
      reorder_level,
      unit_cost,
      expiry_date,
      lot_number,
      supplier,
      storage_location,
      storage_conditions,
      last_calibration_date,
      next_calibration_date,
      is_active
    } = req.body;

    const result = await pool.query(
      `UPDATE lab_inventory SET
        item_name = COALESCE($1, item_name),
        item_type = COALESCE($2, item_type),
        category = COALESCE($3, category),
        unit = COALESCE($4, unit),
        reorder_level = COALESCE($5, reorder_level),
        unit_cost = COALESCE($6, unit_cost),
        expiry_date = COALESCE($7, expiry_date),
        lot_number = COALESCE($8, lot_number),
        supplier = COALESCE($9, supplier),
        storage_location = COALESCE($10, storage_location),
        storage_conditions = COALESCE($11, storage_conditions),
        last_calibration_date = COALESCE($12, last_calibration_date),
        next_calibration_date = COALESCE($13, next_calibration_date),
        is_active = COALESCE($14, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $15
       RETURNING *`,
      [item_name, item_type, category, unit, reorder_level, unit_cost,
       expiry_date, lot_number, supplier, storage_location, storage_conditions,
       last_calibration_date, next_calibration_date, is_active, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lab inventory item not found' });
      return;
    }

    res.json({
      message: 'Lab inventory item updated successfully',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Update lab inventory item error:', error);
    res.status(500).json({ error: 'Failed to update lab inventory item' });
  }
};

// Adjust lab stock (add or remove quantity)
export const adjustLabStock = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { adjustment, transaction_type, notes, reference_type, reference_id } = req.body;
    const authReq = req as any;

    if (!adjustment || adjustment === 0) {
      res.status(400).json({ error: 'Adjustment quantity is required' });
      return;
    }

    await client.query('BEGIN');

    // Get current stock
    const current = await client.query(
      `SELECT quantity_on_hand FROM lab_inventory WHERE id = $1`,
      [id]
    );

    if (current.rows.length === 0) {
      res.status(404).json({ error: 'Lab inventory item not found' });
      return;
    }

    const newQuantity = current.rows[0].quantity_on_hand + adjustment;

    if (newQuantity < 0) {
      res.status(400).json({ error: 'Insufficient stock for this adjustment' });
      return;
    }

    // Update stock
    const result = await client.query(
      `UPDATE lab_inventory SET
        quantity_on_hand = $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newQuantity, id]
    );

    // Log the transaction
    await client.query(
      `INSERT INTO lab_inventory_transactions
       (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, transaction_type || 'adjustment', adjustment, reference_type, reference_id, notes, authReq.user?.id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Lab stock adjusted successfully',
      item: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Adjust lab stock error:', error);
    res.status(500).json({ error: 'Failed to adjust lab stock' });
  } finally {
    client.release();
  }
};

// Use lab supply (deduct from stock when used for test)
export const useLabSupply = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { inventory_id, quantity, lab_order_id, notes } = req.body;
    const authReq = req as any;

    if (!inventory_id || !quantity || quantity <= 0) {
      res.status(400).json({ error: 'Inventory ID and quantity are required' });
      return;
    }

    await client.query('BEGIN');

    // Get current stock
    const current = await client.query(
      `SELECT * FROM lab_inventory WHERE id = $1`,
      [inventory_id]
    );

    if (current.rows.length === 0) {
      res.status(404).json({ error: 'Lab supply not found in inventory' });
      return;
    }

    const item = current.rows[0];

    if (item.quantity_on_hand < quantity) {
      res.status(400).json({
        error: 'Insufficient stock',
        available: item.quantity_on_hand,
        requested: quantity
      });
      return;
    }

    // Update stock
    await client.query(
      `UPDATE lab_inventory SET
        quantity_on_hand = quantity_on_hand - $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [quantity, inventory_id]
    );

    // Log the transaction
    await client.query(
      `INSERT INTO lab_inventory_transactions
       (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
       VALUES ($1, 'use', $2, 'lab_order', $3, $4, $5)`,
      [inventory_id, -quantity, lab_order_id, notes, authReq.user?.id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Lab supply used successfully',
      used: {
        item: item.item_name,
        quantity: quantity,
        remaining_stock: item.quantity_on_hand - quantity
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Use lab supply error:', error);
    res.status(500).json({ error: 'Failed to use lab supply' });
  } finally {
    client.release();
  }
};

// Get lab inventory categories
export const getLabInventoryCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category, item_type, COUNT(*) as count
       FROM lab_inventory
       WHERE is_active = true AND category IS NOT NULL
       GROUP BY category, item_type
       ORDER BY item_type, category`
    );

    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get lab categories error:', error);
    res.status(500).json({ error: 'Failed to fetch lab categories' });
  }
};

// Get low stock alerts
export const getLowLabStockAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT *,
        CASE WHEN quantity_on_hand <= reorder_level THEN true ELSE false END as is_low_stock
       FROM lab_inventory
       WHERE is_active = true AND quantity_on_hand <= reorder_level
       ORDER BY quantity_on_hand ASC`
    );

    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Get low lab stock alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch low lab stock alerts' });
  }
};

// Get expiring lab supplies
export const getExpiringLabSupplies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days } = req.query;
    const daysAhead = days ? parseInt(days as string) : 90;

    const result = await pool.query(
      `SELECT *,
        expiry_date - CURRENT_DATE as days_until_expiry
       FROM lab_inventory
       WHERE is_active = true
         AND item_type != 'equipment'
         AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
       ORDER BY expiry_date ASC`
    );

    res.json({ expiring: result.rows });
  } catch (error) {
    console.error('Get expiring lab supplies error:', error);
    res.status(500).json({ error: 'Failed to fetch expiring lab supplies' });
  }
};

// Get equipment needing calibration
export const getEquipmentCalibrationDue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days } = req.query;
    const daysAhead = days ? parseInt(days as string) : 30;

    const result = await pool.query(
      `SELECT *,
        next_calibration_date - CURRENT_DATE as days_until_calibration
       FROM lab_inventory
       WHERE is_active = true
         AND item_type = 'equipment'
         AND next_calibration_date IS NOT NULL
         AND next_calibration_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
       ORDER BY next_calibration_date ASC`
    );

    res.json({ equipment: result.rows });
  } catch (error) {
    console.error('Get equipment calibration due error:', error);
    res.status(500).json({ error: 'Failed to fetch equipment calibration due' });
  }
};

// Record equipment calibration
export const recordCalibration = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { next_calibration_date, notes } = req.body;
    const authReq = req as any;

    await client.query('BEGIN');

    // Update calibration dates
    const result = await client.query(
      `UPDATE lab_inventory SET
        last_calibration_date = CURRENT_DATE,
        next_calibration_date = $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND item_type = 'equipment'
       RETURNING *`,
      [next_calibration_date, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    // Log the calibration transaction
    await client.query(
      `INSERT INTO lab_inventory_transactions
       (inventory_id, transaction_type, quantity, notes, performed_by)
       VALUES ($1, 'calibration', 0, $2, $3)`,
      [id, notes || 'Equipment calibration performed', authReq.user?.id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Calibration recorded successfully',
      item: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Record calibration error:', error);
    res.status(500).json({ error: 'Failed to record calibration' });
  } finally {
    client.release();
  }
};

// Get lab test catalog
export const getLabTestCatalog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, search, include_inactive } = req.query;

    let query = `SELECT * FROM lab_test_catalog WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (!include_inactive) {
      query += ` AND is_active = true`;
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (test_name ILIKE $${paramIndex} OR test_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY category, test_name`;

    const result = await pool.query(query, params);

    // Get categories
    const categories = await pool.query(
      `SELECT DISTINCT category, COUNT(*) as count
       FROM lab_test_catalog
       WHERE is_active = true AND category IS NOT NULL
       GROUP BY category
       ORDER BY category`
    );

    res.json({
      tests: result.rows,
      categories: categories.rows
    });
  } catch (error) {
    console.error('Get lab test catalog error:', error);
    res.status(500).json({ error: 'Failed to fetch lab test catalog' });
  }
};

// Create lab test in catalog
export const createLabTest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      test_code,
      test_name,
      category,
      specimen_type,
      turnaround_time_hours,
      base_price,
      critical_low,
      critical_high,
      normal_range_low,
      normal_range_high,
      unit
    } = req.body;

    const result = await pool.query(
      `INSERT INTO lab_test_catalog
       (test_code, test_name, category, specimen_type, turnaround_time_hours, base_price,
        critical_low, critical_high, normal_range_low, normal_range_high, unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [test_code, test_name, category, specimen_type, turnaround_time_hours || 24,
       base_price || 0, critical_low, critical_high, normal_range_low, normal_range_high, unit]
    );

    res.status(201).json({
      message: 'Lab test created successfully',
      test: result.rows[0]
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Test code already exists' });
      return;
    }
    console.error('Create lab test error:', error);
    res.status(500).json({ error: 'Failed to create lab test' });
  }
};

// Update lab test in catalog
export const updateLabTest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      test_code,
      test_name,
      category,
      specimen_type,
      turnaround_time_hours,
      base_price,
      critical_low,
      critical_high,
      normal_range_low,
      normal_range_high,
      unit,
      is_active
    } = req.body;

    const result = await pool.query(
      `UPDATE lab_test_catalog SET
        test_code = COALESCE($1, test_code),
        test_name = COALESCE($2, test_name),
        category = COALESCE($3, category),
        specimen_type = COALESCE($4, specimen_type),
        turnaround_time_hours = COALESCE($5, turnaround_time_hours),
        base_price = COALESCE($6, base_price),
        critical_low = COALESCE($7, critical_low),
        critical_high = COALESCE($8, critical_high),
        normal_range_low = COALESCE($9, normal_range_low),
        normal_range_high = COALESCE($10, normal_range_high),
        unit = COALESCE($11, unit),
        is_active = COALESCE($12, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [test_code, test_name, category, specimen_type, turnaround_time_hours,
       base_price, critical_low, critical_high, normal_range_low, normal_range_high,
       unit, is_active, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lab test not found' });
      return;
    }

    res.json({
      message: 'Lab test updated successfully',
      test: result.rows[0]
    });
  } catch (error) {
    console.error('Update lab test error:', error);
    res.status(500).json({ error: 'Failed to update lab test' });
  }
};
