import { Request, Response } from 'express';
import pool from '../database/db';
import { validateIntervalDays } from '../utils/sqlSecurity';

// Get all inventory items with optional filters
export const getInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, low_stock, expiring_soon, expired, search, include_inactive } = req.query;

    let query = `
      SELECT
        i.*,
        COALESCE(s.name, i.supplier) as supplier_name,
        s.contact_person as supplier_contact,
        s.phone as supplier_phone,
        CASE WHEN i.quantity_on_hand <= i.reorder_level THEN true ELSE false END as is_low_stock,
        CASE WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN true ELSE false END as is_expiring_soon
      FROM pharmacy_inventory i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
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
      query += ` AND i.expiry_date <= CURRENT_DATE + INTERVAL '90 days' AND i.expiry_date >= CURRENT_DATE`;
    }

    if (expired === 'true') {
      query += ` AND i.expiry_date < CURRENT_DATE`;
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
      supplier_id,
      location,
      requires_prescription
    } = req.body;

    const result = await pool.query(
      `INSERT INTO pharmacy_inventory
       (medication_name, generic_name, category, unit, quantity_on_hand, reorder_level,
        unit_cost, selling_price, expiry_date, supplier, supplier_id, location, requires_prescription)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [medication_name, generic_name, category, unit, quantity_on_hand || 0, reorder_level || 10,
       unit_cost || 0, selling_price || 0, expiry_date, supplier, supplier_id || null, location || 'Main Pharmacy', requires_prescription ?? true]
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
      supplier_id,
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
        supplier_id = COALESCE($10, supplier_id),
        location = COALESCE($11, location),
        requires_prescription = COALESCE($12, requires_prescription),
        is_active = COALESCE($13, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $14
       RETURNING *`,
      [medication_name, generic_name, category, unit, reorder_level, unit_cost,
       selling_price, expiry_date, supplier, supplier_id, location, requires_prescription, is_active, id]
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
    // Validate and sanitize the days parameter to prevent SQL injection
    const daysAhead = validateIntervalDays(days, 90, 365);

    const result = await pool.query(
      `SELECT *,
        expiry_date - CURRENT_DATE as days_until_expiry
       FROM pharmacy_inventory
       WHERE is_active = true
         AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $1
       ORDER BY expiry_date ASC`,
      [daysAhead]
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
    let transactionDateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND po.dispensed_date >= $1 AND po.dispensed_date <= $2`;
      transactionDateFilter = `AND it.created_at >= $1 AND it.created_at <= $2`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND po.dispensed_date >= $1`;
      transactionDateFilter = `AND it.created_at >= $1`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND po.dispensed_date <= $1`;
      transactionDateFilter = `AND it.created_at <= $1`;
      params.push(end_date);
    }

    // Get revenue by day - using inventory transactions for accurate tracking
    const dailyRevenue = await pool.query(
      `SELECT
        DATE(it.created_at) as date,
        COUNT(*) as orders_count,
        SUM(ABS(it.quantity) * it.unit_cost) as revenue
       FROM inventory_transactions it
       WHERE it.transaction_type = 'dispense' ${transactionDateFilter}
       GROUP BY DATE(it.created_at)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );

    // Get totals from pharmacy orders
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

    // Get total revenue from dispense transactions
    const revenueTotal = await pool.query(
      `SELECT
        COALESCE(SUM(ABS(it.quantity) * it.unit_cost), 0) as total_revenue
       FROM inventory_transactions it
       WHERE it.transaction_type = 'dispense' ${transactionDateFilter}`,
      params
    );

    // Get top medications by dispensed quantity
    const topMedications = await pool.query(
      `SELECT
        pi.medication_name,
        COUNT(*) as order_count,
        SUM(ABS(it.quantity)) as total_quantity,
        SUM(ABS(it.quantity) * it.unit_cost) as total_revenue
       FROM inventory_transactions it
       JOIN pharmacy_inventory pi ON it.inventory_id = pi.id
       WHERE it.transaction_type = 'dispense' ${transactionDateFilter}
       GROUP BY pi.medication_name
       ORDER BY total_revenue DESC
       LIMIT 10`,
      params
    );

    res.json({
      daily_revenue: dailyRevenue.rows,
      totals: {
        ...totals.rows[0],
        total_revenue: revenueTotal.rows[0]?.total_revenue || 0
      },
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

// Get refills calendar data - supports year/month OR from_date/to_date
export const getRefillsCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, from_date, to_date } = req.query;

    let result;

    if (from_date && to_date) {
      // Date range query (for appointment calendar integration)
      // Uses days_supply if set, otherwise falls back to quantity as days
      result = await pool.query(
        `SELECT
          po.id,
          po.medication_name,
          po.quantity,
          po.refills,
          po.days_supply,
          po.dispensed_date,
          po.frequency,
          p.id as patient_id,
          p.patient_number,
          u.first_name || ' ' || u.last_name as patient_name,
          u.phone as patient_phone,
          -- Estimate refill date: use days_supply if available, otherwise use quantity
          (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date as estimated_refill_date,
          po.refills as refills_remaining
         FROM pharmacy_orders po
         JOIN patients p ON po.patient_id = p.id
         JOIN users u ON p.user_id = u.id
         WHERE po.status = 'dispensed'
           AND po.refills > 0
           AND (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date >= $1::date
           AND (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date <= $2::date
         ORDER BY estimated_refill_date ASC`,
        [from_date, to_date]
      );
    } else if (year && month) {
      // Year/month query (original behavior)
      // Uses days_supply if set, otherwise falls back to quantity as days
      result = await pool.query(
        `SELECT
          po.id,
          po.medication_name,
          po.quantity,
          po.refills,
          po.days_supply,
          po.dispensed_date,
          po.frequency,
          p.id as patient_id,
          p.patient_number,
          u.first_name || ' ' || u.last_name as patient_name,
          u.phone as patient_phone,
          -- Estimate refill date: use days_supply if available, otherwise use quantity
          (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date as estimated_refill_date,
          po.refills as refills_remaining
         FROM pharmacy_orders po
         JOIN patients p ON po.patient_id = p.id
         JOIN users u ON p.user_id = u.id
         WHERE po.status = 'dispensed'
           AND po.refills > 0
           AND EXTRACT(YEAR FROM (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)) = $1
           AND EXTRACT(MONTH FROM (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)) = $2
         ORDER BY estimated_refill_date ASC`,
        [year, month]
      );
    } else {
      res.status(400).json({ error: 'Either year/month or from_date/to_date are required' });
      return;
    }

    // Transform the data for calendar display
    const refills = result.rows.map(row => ({
      ...row,
      refill_date: row.estimated_refill_date
    }));

    res.json({ refills });
  } catch (error) {
    console.error('Get refills calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch refills calendar' });
  }
};

// Record a purchase (procurement) - with batch tracking
export const recordPurchase = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const {
      inventory_id,
      supplier_id,
      quantity,
      unit_cost,
      discount_percent,
      original_unit_cost,
      new_selling_price,
      batch_number,
      expiry_date
    } = req.body;
    const authReq = req as any;
    const userId = authReq.user?.id;

    if (!inventory_id || !quantity || quantity <= 0) {
      res.status(400).json({ error: 'Invalid inventory item or quantity' });
      return;
    }

    await client.query('BEGIN');

    // Get medication info for batch number generation
    const medResult = await client.query(
      `SELECT medication_name FROM pharmacy_inventory WHERE id = $1`,
      [inventory_id]
    );

    // Auto-generate batch number: MED-YYYYMM-XXX
    let generatedBatchNumber = batch_number;
    if (!batch_number) {
      const medName = medResult.rows[0]?.medication_name || 'MED';
      // Create abbreviation from first 3 letters of first word (uppercase)
      const abbrev = medName.split(' ')[0].substring(0, 3).toUpperCase();
      const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');

      // Get next sequence number for this medication this month
      const seqResult = await client.query(
        `SELECT COUNT(*) + 1 as next_seq FROM inventory_batches
         WHERE inventory_id = $1 AND batch_number LIKE $2`,
        [inventory_id, `${abbrev}-${yearMonth}%`]
      );
      const seqNum = String(seqResult.rows[0].next_seq).padStart(3, '0');
      generatedBatchNumber = `${abbrev}-${yearMonth}-${seqNum}`;
    }
    await client.query(
      `INSERT INTO inventory_batches
        (inventory_id, batch_number, quantity, unit_cost, expiry_date, supplier_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        inventory_id,
        generatedBatchNumber,
        quantity,
        unit_cost,
        expiry_date || null,
        supplier_id || null,
        `Discount: ${discount_percent || 0}%, Original cost: ${original_unit_cost || unit_cost}`
      ]
    );

    // Record the purchase transaction
    await client.query(
      `INSERT INTO inventory_transactions
        (inventory_id, transaction_type, quantity, reference_type, notes, performed_by)
       VALUES ($1, 'purchase', $2, 'procurement', $3, $4)`,
      [
        inventory_id,
        quantity,
        `Batch: ${generatedBatchNumber}, Cost: ${unit_cost}, Discount: ${discount_percent || 0}%`,
        userId
      ]
    );

    // Update inventory total quantity and earliest expiry
    await client.query(
      `UPDATE pharmacy_inventory
       SET quantity_on_hand = quantity_on_hand + $1,
           unit_cost = $2,
           supplier_id = COALESCE($3, supplier_id),
           expiry_date = (
             SELECT MIN(expiry_date)
             FROM inventory_batches
             WHERE inventory_id = $4 AND is_active = true AND quantity > 0 AND expiry_date IS NOT NULL
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [quantity, unit_cost, supplier_id, inventory_id]
    );

    // Update selling price if provided
    if (new_selling_price && new_selling_price > 0) {
      await client.query(
        `UPDATE pharmacy_inventory SET selling_price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [new_selling_price, inventory_id]
      );
    }

    await client.query('COMMIT');

    res.json({ message: 'Purchase recorded successfully', batch_number: generatedBatchNumber });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Record purchase error:', error);
    res.status(500).json({ error: 'Failed to record purchase' });
  } finally {
    client.release();
  }
};

// Get batches for an inventory item
export const getInventoryBatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        ib.*,
        s.name as supplier_name
       FROM inventory_batches ib
       LEFT JOIN suppliers s ON ib.supplier_id = s.id
       WHERE ib.inventory_id = $1 AND ib.is_active = true AND ib.quantity > 0
       ORDER BY ib.expiry_date ASC NULLS LAST, ib.received_date ASC`,
      [id]
    );

    res.json({ batches: result.rows });
  } catch (error) {
    console.error('Get inventory batches error:', error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
};

// Dispense from batches using FEFO (First Expired, First Out)
export const dispenseFromBatches = async (
  client: any,
  inventoryId: number,
  quantityToDispense: number,
  userId: number | null
): Promise<{ success: boolean; dispensedBatches: any[] }> => {
  const dispensedBatches: any[] = [];
  let remainingQty = quantityToDispense;

  // Get batches ordered by expiry date (FEFO)
  const batches = await client.query(
    `SELECT id, batch_number, quantity, expiry_date
     FROM inventory_batches
     WHERE inventory_id = $1 AND is_active = true AND quantity > 0
     ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
    [inventoryId]
  );

  for (const batch of batches.rows) {
    if (remainingQty <= 0) break;

    const dispenseFromThisBatch = Math.min(batch.quantity, remainingQty);

    // Reduce batch quantity
    await client.query(
      `UPDATE inventory_batches
       SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [dispenseFromThisBatch, batch.id]
    );

    dispensedBatches.push({
      batch_id: batch.id,
      batch_number: batch.batch_number,
      quantity_dispensed: dispenseFromThisBatch,
      expiry_date: batch.expiry_date
    });

    remainingQty -= dispenseFromThisBatch;
  }

  // Update the main inventory quantity
  await client.query(
    `UPDATE pharmacy_inventory
     SET quantity_on_hand = quantity_on_hand - $1,
         expiry_date = (
           SELECT MIN(expiry_date)
           FROM inventory_batches
           WHERE inventory_id = $2 AND is_active = true AND quantity > 0 AND expiry_date IS NOT NULL
         ),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [quantityToDispense, inventoryId]
  );

  return { success: remainingQty === 0, dispensedBatches };
};

// Get purchase history
export const getPurchaseHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT
        it.id,
        it.inventory_id,
        it.quantity,
        it.unit_cost,
        it.notes,
        it.created_at,
        pi.medication_name,
        s.name as supplier_name,
        CASE
          WHEN it.notes LIKE '%Discount: %'
          THEN SUBSTRING(it.notes FROM 'Discount: ([0-9.]+)%')
          ELSE NULL
        END as discount_percent,
        CASE
          WHEN it.notes LIKE '%Batch: %'
          THEN SUBSTRING(it.notes FROM 'Batch: ([^,]+)')
          ELSE NULL
        END as batch_number
       FROM inventory_transactions it
       JOIN pharmacy_inventory pi ON it.inventory_id = pi.id
       LEFT JOIN suppliers s ON pi.supplier_id = s.id
       WHERE it.transaction_type = 'purchase'
       ORDER BY it.created_at DESC
       LIMIT 50`
    );

    res.json({ purchases: result.rows });
  } catch (error) {
    console.error('Get purchase history error:', error);
    res.status(500).json({ error: 'Failed to fetch purchase history' });
  }
};

// Update batch quantity (for stock adjustments)
export const updateBatchQuantity = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id, batchId } = req.params;
    const { quantity, reason } = req.body;
    const authReq = req as any;

    if (quantity === undefined || quantity < 0) {
      res.status(400).json({ error: 'Valid quantity is required' });
      return;
    }

    await client.query('BEGIN');

    // Get current batch info
    const batchResult = await client.query(
      `SELECT ib.*, pi.medication_name
       FROM inventory_batches ib
       JOIN pharmacy_inventory pi ON ib.inventory_id = pi.id
       WHERE ib.id = $1 AND ib.inventory_id = $2`,
      [batchId, id]
    );

    if (batchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    const batch = batchResult.rows[0];
    const quantityDiff = quantity - batch.quantity;

    // Update batch quantity
    await client.query(
      `UPDATE inventory_batches
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [quantity, batchId]
    );

    // Update main inventory quantity
    await client.query(
      `UPDATE pharmacy_inventory
       SET quantity_on_hand = quantity_on_hand + $1,
           expiry_date = (
             SELECT MIN(expiry_date)
             FROM inventory_batches
             WHERE inventory_id = $2 AND is_active = true AND quantity > 0 AND expiry_date IS NOT NULL
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [quantityDiff, id]
    );

    // Log the adjustment transaction
    const adjustmentDirection = quantityDiff > 0 ? 'increased' : 'decreased';
    await client.query(
      `INSERT INTO inventory_transactions
       (inventory_id, transaction_type, quantity, notes, performed_by)
       VALUES ($1, 'adjustment', $2, $3, $4)`,
      [
        id,
        Math.abs(quantityDiff),
        `Batch ${batch.batch_number} ${adjustmentDirection}: ${batch.quantity} → ${quantity}. ${reason || 'Stock adjustment'}`,
        authReq.user?.id
      ]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Batch quantity updated successfully',
      batch: {
        id: parseInt(batchId),
        previous_quantity: batch.quantity,
        new_quantity: quantity,
        difference: quantityDiff
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update batch quantity error:', error);
    res.status(500).json({ error: 'Failed to update batch quantity' });
  } finally {
    client.release();
  }
};

// Update multiple batch quantities at once
export const updateBatchQuantities = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { batches, reason } = req.body; // batches: [{ batchId, quantity }]
    const authReq = req as any;

    if (!batches || !Array.isArray(batches) || batches.length === 0) {
      res.status(400).json({ error: 'Batches array is required' });
      return;
    }

    await client.query('BEGIN');

    let totalQuantityDiff = 0;
    const updatedBatches: any[] = [];

    for (const batchUpdate of batches) {
      const { batchId, quantity } = batchUpdate;

      if (quantity === undefined || quantity < 0) continue;

      // Get current batch info
      const batchResult = await client.query(
        `SELECT ib.*, pi.medication_name
         FROM inventory_batches ib
         JOIN pharmacy_inventory pi ON ib.inventory_id = pi.id
         WHERE ib.id = $1 AND ib.inventory_id = $2`,
        [batchId, id]
      );

      if (batchResult.rows.length === 0) continue;

      const batch = batchResult.rows[0];
      const quantityDiff = quantity - batch.quantity;

      if (quantityDiff === 0) continue; // No change

      // Update batch quantity
      await client.query(
        `UPDATE inventory_batches
         SET quantity = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [quantity, batchId]
      );

      totalQuantityDiff += quantityDiff;

      // Log individual batch adjustment
      const adjustmentDirection = quantityDiff > 0 ? 'increased' : 'decreased';
      await client.query(
        `INSERT INTO inventory_transactions
         (inventory_id, transaction_type, quantity, notes, performed_by)
         VALUES ($1, 'adjustment', $2, $3, $4)`,
        [
          id,
          Math.abs(quantityDiff),
          `Batch ${batch.batch_number} ${adjustmentDirection}: ${batch.quantity} → ${quantity}. ${reason || 'Stock adjustment'}`,
          authReq.user?.id
        ]
      );

      updatedBatches.push({
        batchId,
        batch_number: batch.batch_number,
        previous_quantity: batch.quantity,
        new_quantity: quantity,
        difference: quantityDiff
      });
    }

    // Update main inventory quantity
    if (totalQuantityDiff !== 0) {
      await client.query(
        `UPDATE pharmacy_inventory
         SET quantity_on_hand = quantity_on_hand + $1,
             expiry_date = (
               SELECT MIN(expiry_date)
               FROM inventory_batches
               WHERE inventory_id = $2 AND is_active = true AND quantity > 0 AND expiry_date IS NOT NULL
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [totalQuantityDiff, id]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Batch quantities updated successfully',
      updatedBatches,
      totalQuantityChange: totalQuantityDiff
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update batch quantities error:', error);
    res.status(500).json({ error: 'Failed to update batch quantities' });
  } finally {
    client.release();
  }
};

// Get dispensing analytics for charts
export const getDispensingAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from_date, to_date } = req.query;
    const fromDate = from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to_date || new Date().toISOString().split('T')[0];

    // Hourly dispensing volume (last 24 hours)
    const hourlyResult = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM po.dispensed_date) as hour,
        COUNT(*) as count,
        SUM(CAST(po.quantity AS INTEGER)) as total_quantity
      FROM pharmacy_orders po
      WHERE po.status = 'dispensed'
        AND po.dispensed_date >= NOW() - INTERVAL '24 hours'
      GROUP BY EXTRACT(HOUR FROM po.dispensed_date)
      ORDER BY hour
    `);

    // Daily dispensing trends
    const dailyResult = await pool.query(`
      SELECT
        DATE(po.dispensed_date) as date,
        COUNT(*) as orders_count,
        COUNT(DISTINCT po.patient_id) as unique_patients,
        SUM(CAST(po.quantity AS INTEGER)) as total_units
      FROM pharmacy_orders po
      WHERE po.status = 'dispensed'
        AND po.dispensed_date >= $1
        AND po.dispensed_date <= $2 + INTERVAL '1 day'
      GROUP BY DATE(po.dispensed_date)
      ORDER BY date
    `, [fromDate, toDate]);

    // Top 10 medications by volume
    const topMedsResult = await pool.query(`
      SELECT
        po.medication_name,
        COUNT(*) as order_count,
        SUM(CAST(po.quantity AS INTEGER)) as total_units
      FROM pharmacy_orders po
      WHERE po.status = 'dispensed'
        AND po.dispensed_date >= $1
        AND po.dispensed_date <= $2 + INTERVAL '1 day'
      GROUP BY po.medication_name
      ORDER BY total_units DESC
      LIMIT 10
    `, [fromDate, toDate]);

    // Dispensing by priority
    const priorityResult = await pool.query(`
      SELECT
        po.priority,
        COUNT(*) as count
      FROM pharmacy_orders po
      WHERE po.status = 'dispensed'
        AND po.dispensed_date >= $1
        AND po.dispensed_date <= $2 + INTERVAL '1 day'
      GROUP BY po.priority
    `, [fromDate, toDate]);

    // Summary stats
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total_dispensed,
        COUNT(DISTINCT po.patient_id) as unique_patients,
        SUM(CAST(po.quantity AS INTEGER)) as total_units,
        ROUND(AVG(EXTRACT(EPOCH FROM (po.dispensed_date - po.ordered_date)) / 60), 1) as avg_turnaround_minutes
      FROM pharmacy_orders po
      WHERE po.status = 'dispensed'
        AND po.dispensed_date >= $1
        AND po.dispensed_date <= $2 + INTERVAL '1 day'
    `, [fromDate, toDate]);

    res.json({
      hourly: hourlyResult.rows,
      daily: dailyResult.rows,
      topMedications: topMedsResult.rows,
      byPriority: priorityResult.rows,
      summary: summaryResult.rows[0] || {
        total_dispensed: 0,
        unique_patients: 0,
        total_units: 0,
        avg_turnaround_minutes: null
      }
    });
  } catch (error) {
    console.error('Get dispensing analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch dispensing analytics' });
  }
};

// Get expiry calendar data
export const getExpiryCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month } = req.query;
    const targetYear = parseInt(year as string) || new Date().getFullYear();
    const targetMonth = parseInt(month as string) || new Date().getMonth() + 1;

    // Get all batch expirations for the month
    const result = await pool.query(`
      SELECT
        ib.id,
        ib.batch_number,
        ib.quantity,
        ib.expiry_date,
        pi.medication_name,
        pi.id as inventory_id,
        CASE
          WHEN ib.expiry_date < CURRENT_DATE THEN 'expired'
          WHEN ib.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
          WHEN ib.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning'
          ELSE 'ok'
        END as status
      FROM inventory_batches ib
      JOIN pharmacy_inventory pi ON ib.inventory_id = pi.id
      WHERE ib.is_active = true
        AND ib.quantity > 0
        AND ib.expiry_date IS NOT NULL
        AND EXTRACT(YEAR FROM ib.expiry_date) = $1
        AND EXTRACT(MONTH FROM ib.expiry_date) = $2
      ORDER BY ib.expiry_date ASC
    `, [targetYear, targetMonth]);

    // Group by date for calendar display
    const byDate: Record<string, any[]> = {};
    result.rows.forEach(batch => {
      const dateKey = batch.expiry_date.toISOString().split('T')[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(batch);
    });

    // Get summary counts
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ib.expiry_date < CURRENT_DATE) as expired_count,
        COUNT(*) FILTER (WHERE ib.expiry_date >= CURRENT_DATE AND ib.expiry_date <= CURRENT_DATE + INTERVAL '30 days') as critical_count,
        COUNT(*) FILTER (WHERE ib.expiry_date > CURRENT_DATE + INTERVAL '30 days' AND ib.expiry_date <= CURRENT_DATE + INTERVAL '90 days') as warning_count
      FROM inventory_batches ib
      WHERE ib.is_active = true AND ib.quantity > 0 AND ib.expiry_date IS NOT NULL
    `);

    res.json({
      batches: result.rows,
      byDate,
      summary: summaryResult.rows[0],
      year: targetYear,
      month: targetMonth
    });
  } catch (error) {
    console.error('Get expiry calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch expiry calendar' });
  }
};

// Get patient medication timeline
export const getPatientMedicationTimeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = req.params;

    // Get all dispensed medications for the patient
    const result = await pool.query(`
      SELECT
        po.id,
        po.medication_name,
        po.dosage,
        po.frequency,
        po.quantity,
        po.ordered_date as start_date,
        po.dispensed_date,
        po.status,
        po.notes,
        u.first_name || ' ' || u.last_name as prescriber_name
      FROM pharmacy_orders po
      LEFT JOIN users u ON po.ordering_provider = u.id
      WHERE po.patient_id = $1
      ORDER BY po.ordered_date DESC
      LIMIT 50
    `, [patientId]);

    // Get active medications (dispensed in last 30 days)
    const activeResult = await pool.query(`
      SELECT DISTINCT ON (po.medication_name)
        po.medication_name,
        po.dosage,
        po.frequency,
        po.dispensed_date as last_dispensed
      FROM pharmacy_orders po
      WHERE po.patient_id = $1
        AND po.status = 'dispensed'
        AND po.dispensed_date >= NOW() - INTERVAL '30 days'
      ORDER BY po.medication_name, po.dispensed_date DESC
    `, [patientId]);

    res.json({
      timeline: result.rows,
      activeMedications: activeResult.rows
    });
  } catch (error) {
    console.error('Get patient medication timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch medication timeline' });
  }
};
