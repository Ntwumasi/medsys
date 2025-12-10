import { Request, Response } from 'express';
import pool from '../database/db';

// Get all inventory items with optional filters
export const getInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, low_stock, expiring_soon, search, include_inactive } = req.query;

    let query = `
      SELECT
        i.*,
        CASE WHEN i.quantity_on_hand <= i.reorder_level THEN true ELSE false END as is_low_stock,
        CASE WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN true ELSE false END as is_expiring_soon
      FROM pharmacy_inventory i
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (!include_inactive) {
      query += ` AND i.is_active = true`;
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
      query += ` AND i.expiry_date <= CURRENT_DATE + INTERVAL '90 days'`;
    }

    if (search) {
      query += ` AND (i.medication_name ILIKE $${paramIndex} OR i.generic_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY i.medication_name ASC`;

    const result = await pool.query(query, params);

    // Get summary stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE quantity_on_hand <= reorder_level) as low_stock_count,
        COUNT(*) FILTER (WHERE expiry_date <= CURRENT_DATE + INTERVAL '90 days') as expiring_soon_count,
        COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired_count,
        SUM(quantity_on_hand * unit_cost) as total_stock_value
      FROM pharmacy_inventory
      WHERE is_active = true
    `);

    res.json({
      inventory: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
};

// Get single inventory item
export const getInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM pharmacy_inventory WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    // Get transaction history
    const transactions = await pool.query(
      `SELECT t.*, u.first_name, u.last_name
       FROM inventory_transactions t
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
    console.error('Get inventory item error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
};

// Add new inventory item
export const createInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      medication_name,
      generic_name,
      category,
      unit,
      quantity_on_hand,
      reorder_level,
      unit_cost,
      selling_price,
      expiry_date,
      supplier,
      location,
      requires_prescription
    } = req.body;

    const result = await pool.query(
      `INSERT INTO pharmacy_inventory
       (medication_name, generic_name, category, unit, quantity_on_hand, reorder_level,
        unit_cost, selling_price, expiry_date, supplier, location, requires_prescription)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [medication_name, generic_name, category, unit, quantity_on_hand || 0, reorder_level || 10,
       unit_cost || 0, selling_price || 0, expiry_date, supplier, location || 'Main Pharmacy', requires_prescription ?? true]
    );

    // Log the initial stock as a purchase transaction
    const authReq = req as any;
    if (quantity_on_hand > 0) {
      await pool.query(
        `INSERT INTO inventory_transactions
         (inventory_id, transaction_type, quantity, notes, performed_by)
         VALUES ($1, 'purchase', $2, 'Initial stock entry', $3)`,
        [result.rows[0].id, quantity_on_hand, authReq.user?.id]
      );
    }

    res.status(201).json({
      message: 'Inventory item created successfully',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
};

// Update inventory item
export const updateInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      medication_name,
      generic_name,
      category,
      unit,
      reorder_level,
      unit_cost,
      selling_price,
      expiry_date,
      supplier,
      location,
      requires_prescription,
      is_active
    } = req.body;

    const result = await pool.query(
      `UPDATE pharmacy_inventory SET
        medication_name = COALESCE($1, medication_name),
        generic_name = COALESCE($2, generic_name),
        category = COALESCE($3, category),
        unit = COALESCE($4, unit),
        reorder_level = COALESCE($5, reorder_level),
        unit_cost = COALESCE($6, unit_cost),
        selling_price = COALESCE($7, selling_price),
        expiry_date = COALESCE($8, expiry_date),
        supplier = COALESCE($9, supplier),
        location = COALESCE($10, location),
        requires_prescription = COALESCE($11, requires_prescription),
        is_active = COALESCE($12, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [medication_name, generic_name, category, unit, reorder_level, unit_cost,
       selling_price, expiry_date, supplier, location, requires_prescription, is_active, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    res.json({
      message: 'Inventory item updated successfully',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
};

// Adjust stock (add or remove quantity)
export const adjustStock = async (req: Request, res: Response): Promise<void> => {
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
      `SELECT quantity_on_hand FROM pharmacy_inventory WHERE id = $1`,
      [id]
    );

    if (current.rows.length === 0) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    const newQuantity = current.rows[0].quantity_on_hand + adjustment;

    if (newQuantity < 0) {
      res.status(400).json({ error: 'Insufficient stock for this adjustment' });
      return;
    }

    // Update stock
    const result = await client.query(
      `UPDATE pharmacy_inventory SET
        quantity_on_hand = $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newQuantity, id]
    );

    // Log the transaction
    await client.query(
      `INSERT INTO inventory_transactions
       (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, transaction_type || 'adjustment', adjustment, reference_type, reference_id, notes, authReq.user?.id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Stock adjusted successfully',
      item: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Adjust stock error:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  } finally {
    client.release();
  }
};

// Dispense medication (from pharmacy order)
export const dispenseMedication = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { inventory_id, quantity, pharmacy_order_id, patient_id, notes } = req.body;
    const authReq = req as any;

    if (!inventory_id || !quantity || quantity <= 0) {
      res.status(400).json({ error: 'Inventory ID and quantity are required' });
      return;
    }

    await client.query('BEGIN');

    // Get current stock
    const current = await client.query(
      `SELECT * FROM pharmacy_inventory WHERE id = $1`,
      [inventory_id]
    );

    if (current.rows.length === 0) {
      res.status(404).json({ error: 'Medication not found in inventory' });
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
      `UPDATE pharmacy_inventory SET
        quantity_on_hand = quantity_on_hand - $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [quantity, inventory_id]
    );

    // Log the transaction
    await client.query(
      `INSERT INTO inventory_transactions
       (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
       VALUES ($1, 'dispense', $2, 'pharmacy_order', $3, $4, $5)`,
      [inventory_id, -quantity, pharmacy_order_id, notes, authReq.user?.id]
    );

    // Update pharmacy order status if provided
    if (pharmacy_order_id) {
      await client.query(
        `UPDATE pharmacy_orders SET
          status = 'dispensed',
          dispensed_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [pharmacy_order_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Medication dispensed successfully',
      dispensed: {
        medication: item.medication_name,
        quantity: quantity,
        remaining_stock: item.quantity_on_hand - quantity
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Dispense medication error:', error);
    res.status(500).json({ error: 'Failed to dispense medication' });
  } finally {
    client.release();
  }
};

// Get inventory categories
export const getInventoryCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category, COUNT(*) as count
       FROM pharmacy_inventory
       WHERE is_active = true AND category IS NOT NULL
       GROUP BY category
       ORDER BY category`
    );

    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

// Get low stock alerts
export const getLowStockAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM pharmacy_inventory
       WHERE is_active = true AND quantity_on_hand <= reorder_level
       ORDER BY quantity_on_hand ASC`
    );

    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Get low stock alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch low stock alerts' });
  }
};

// Get expiring medications
export const getExpiringMedications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days } = req.query;
    const daysAhead = days ? parseInt(days as string) : 90;

    const result = await pool.query(
      `SELECT *,
        expiry_date - CURRENT_DATE as days_until_expiry
       FROM pharmacy_inventory
       WHERE is_active = true
         AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
       ORDER BY expiry_date ASC`
    );

    res.json({ expiring: result.rows });
  } catch (error) {
    console.error('Get expiring medications error:', error);
    res.status(500).json({ error: 'Failed to fetch expiring medications' });
  }
};

// Get payer pricing rules
export const getPayerPricingRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT p.*,
        cc.name as corporate_name,
        ip.name as insurance_name
       FROM payer_pricing_rules p
       LEFT JOIN corporate_clients cc ON p.payer_type = 'corporate' AND p.payer_id = cc.id
       LEFT JOIN insurance_providers ip ON p.payer_type = 'insurance' AND p.payer_id = ip.id
       WHERE p.is_active = true
       ORDER BY p.payer_type, p.category`
    );

    res.json({ rules: result.rows });
  } catch (error) {
    console.error('Get pricing rules error:', error);
    res.status(500).json({ error: 'Failed to fetch pricing rules' });
  }
};

// Calculate price with payer adjustment
export const calculatePrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { inventory_id, quantity, payer_type, payer_id } = req.body;

    // Get base price
    const itemResult = await pool.query(
      `SELECT selling_price FROM pharmacy_inventory WHERE id = $1`,
      [inventory_id]
    );

    if (itemResult.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const basePrice = parseFloat(itemResult.rows[0].selling_price);
    const subtotal = basePrice * (quantity || 1);

    // Get pricing rule
    let discount = 0;
    let markup = 0;

    if (payer_type) {
      const ruleResult = await pool.query(
        `SELECT markup_percentage, discount_percentage
         FROM payer_pricing_rules
         WHERE payer_type = $1
           AND (payer_id IS NULL OR payer_id = $2)
           AND is_active = true
         ORDER BY payer_id DESC NULLS LAST
         LIMIT 1`,
        [payer_type, payer_id]
      );

      if (ruleResult.rows.length > 0) {
        markup = parseFloat(ruleResult.rows[0].markup_percentage) || 0;
        discount = parseFloat(ruleResult.rows[0].discount_percentage) || 0;
      }
    }

    const markupAmount = subtotal * (markup / 100);
    const discountAmount = subtotal * (discount / 100);
    const finalPrice = subtotal + markupAmount - discountAmount;

    res.json({
      base_price: basePrice,
      quantity: quantity || 1,
      subtotal: subtotal,
      markup_percentage: markup,
      markup_amount: markupAmount,
      discount_percentage: discount,
      discount_amount: discountAmount,
      final_price: finalPrice
    });
  } catch (error) {
    console.error('Calculate price error:', error);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
};

// Get pharmacy revenue summary
export const getRevenueSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND po.dispensed_date >= $1 AND po.dispensed_date <= $2`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND po.dispensed_date >= $1`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND po.dispensed_date <= $1`;
      params.push(end_date);
    }

    // Get revenue by day
    const dailyRevenue = await pool.query(
      `SELECT
        DATE(po.dispensed_date) as date,
        COUNT(*) as orders_count,
        COUNT(DISTINCT po.patient_id) as unique_patients,
        SUM(COALESCE(ii.total_price, 0)) as revenue
       FROM pharmacy_orders po
       LEFT JOIN invoice_items ii ON ii.description ILIKE '%' || po.medication_name || '%'
       WHERE po.status = 'dispensed' ${dateFilter}
       GROUP BY DATE(po.dispensed_date)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );

    // Get totals
    const totals = await pool.query(
      `SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'dispensed') as dispensed_orders,
        COUNT(*) FILTER (WHERE status = 'ordered') as pending_orders,
        COUNT(DISTINCT patient_id) as unique_patients
       FROM pharmacy_orders
       WHERE 1=1 ${dateFilter.replace(/po\./g, '')}`,
      params
    );

    // Get top medications
    const topMedications = await pool.query(
      `SELECT
        medication_name,
        COUNT(*) as order_count,
        SUM(CAST(quantity AS INTEGER)) as total_quantity
       FROM pharmacy_orders
       WHERE status = 'dispensed' ${dateFilter}
       GROUP BY medication_name
       ORDER BY order_count DESC
       LIMIT 10`,
      params
    );

    res.json({
      daily_revenue: dailyRevenue.rows,
      totals: totals.rows[0],
      top_medications: topMedications.rows
    });
  } catch (error) {
    console.error('Get revenue summary error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue summary' });
  }
};

// Get patient drug history
export const getPatientDrugHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [patient_id];
    let paramIndex = 2;

    if (start_date) {
      dateFilter += ` AND po.ordered_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      dateFilter += ` AND po.ordered_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    // Get pharmacy orders history
    const orders = await pool.query(
      `SELECT
        po.*,
        u.first_name as provider_first_name,
        u.last_name as provider_last_name,
        e.encounter_number
       FROM pharmacy_orders po
       LEFT JOIN users u ON po.ordering_provider = u.id
       LEFT JOIN encounters e ON po.encounter_id = e.id
       WHERE po.patient_id = $1 ${dateFilter}
       ORDER BY po.ordered_date DESC`,
      params
    );

    // Get active medications
    const activeMeds = await pool.query(
      `SELECT m.*, u.first_name as doctor_first_name, u.last_name as doctor_last_name
       FROM medications m
       LEFT JOIN users u ON m.prescribing_doctor = u.id
       WHERE m.patient_id = $1 AND m.status = 'active'
       ORDER BY m.start_date DESC`,
      [patient_id]
    );

    // Get allergies
    const allergies = await pool.query(
      `SELECT * FROM allergies WHERE patient_id = $1 ORDER BY severity DESC`,
      [patient_id]
    );

    res.json({
      orders: orders.rows,
      active_medications: activeMeds.rows,
      allergies: allergies.rows
    });
  } catch (error) {
    console.error('Get patient drug history error:', error);
    res.status(500).json({ error: 'Failed to fetch patient drug history' });
  }
};
