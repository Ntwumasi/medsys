import { Request, Response } from 'express';
import pool from '../database/db';
import { validateIntervalDays } from '../utils/sqlSecurity';
import { notificationService } from '../services/notificationService';
import { auditService } from '../services/auditService';

// Manually add a refill entry to the refills calendar. Refills are normally
// computed from dispensed orders; this lets a pharmacist place one directly.
// Stored as a pharmacy_order with refills=1 and a days_supply that lands the
// estimated refill date on the chosen date. It carries status='dispensed' only
// so the refills-calendar query (which keys off dispensed orders) picks it up —
// the is_manual_reminder flag keeps it OUT of the Dispensed tab, revenue and
// analytics so it never looks like a real dispense ("auto-dispensed" report).
export const createManualRefill = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const { patient_id, medication_name, refill_date, quantity, dosage, frequency, days_supply, notes } = req.body;
    if (!patient_id || !medication_name || !refill_date) {
      res.status(400).json({ error: 'Patient, medication and refill date are required' });
      return;
    }
    const refill = new Date(refill_date);
    if (isNaN(refill.getTime())) {
      res.status(400).json({ error: 'Invalid refill date' });
      return;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysUntil = Math.max(0, Math.round((refill.getTime() - today.getTime()) / 86400000));
    const ds = days_supply !== undefined && days_supply !== null && days_supply !== '' ? parseInt(String(days_supply)) : daysUntil;

    const result = await pool.query(
      `INSERT INTO pharmacy_orders
        (patient_id, encounter_id, ordering_provider, medication_name, dosage, frequency, quantity, refills, days_supply, priority, status, dispensed_date, notes, is_manual_reminder)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, 1, $7, 'routine', 'dispensed', CURRENT_DATE, $8, true)
       RETURNING *`,
      [patient_id, authReq.user?.id || null, String(medication_name).trim(), dosage || null, frequency || null,
       quantity != null && quantity !== '' ? String(quantity) : null, ds, notes || 'Manually added refill']
    );

    await auditService.log({
      userId: authReq.user?.id,
      action: 'create',
      entityType: 'pharmacy_refill_manual',
      entityId: result.rows[0].id,
      details: { patient_id, medication_name, refill_date },
    });

    res.status(201).json({ message: 'Refill added to calendar', refill: result.rows[0] });
  } catch (error) {
    console.error('Create manual refill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Clear a refill from the calendar once it has been supplied. Works for BOTH
// manually-added reminders and real dispensed-order refills (Irene: "for June
// they've been supplied, let me clear it manually"). Sets reminder_cleared so the
// calendar hides it; the order/dispense record is untouched. A manual reminder
// (synthetic row) is deleted outright since it has no other purpose.
export const deleteManualReminder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const { id } = req.params;

    const existing = await pool.query(
      `SELECT id, patient_id, medication_name, is_manual_reminder FROM pharmacy_orders WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Refill not found' });
      return;
    }
    const row = existing.rows[0];

    if (row.is_manual_reminder) {
      await pool.query(`DELETE FROM pharmacy_orders WHERE id = $1`, [id]);
    } else {
      await pool.query(`UPDATE pharmacy_orders SET reminder_cleared = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    }

    await auditService.log({
      userId: authReq.user?.id,
      action: 'update',
      entityType: 'pharmacy_refill',
      entityId: Number(id),
      details: { cleared: true, patient_id: row.patient_id, medication_name: row.medication_name, manual: row.is_manual_reminder },
    });
    res.json({ message: 'Refill cleared' });
  } catch (error) {
    console.error('Clear refill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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

// Search inventory for medication autocomplete (used by doctors when prescribing)
export const searchInventoryMedications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || (q as string).length < 1) {
      res.json({ medications: [] });
      return;
    }

    const result = await pool.query(
      `SELECT id, medication_name, generic_name, category, unit,
              quantity_on_hand, selling_price, requires_prescription
       FROM pharmacy_inventory
       WHERE is_active = true
         AND (medication_name ILIKE $1 OR generic_name ILIKE $1)
       ORDER BY
         CASE WHEN medication_name ILIKE $2 THEN 0 ELSE 1 END,
         medication_name ASC
       LIMIT 15`,
      [`%${q}%`, `${q}%`]
    );

    res.json({ medications: result.rows });
  } catch (error) {
    console.error('Search inventory medications error:', error);
    res.status(500).json({ error: 'Failed to search medications' });
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
      pack_size,
      expiry_date,
      supplier,
      supplier_id,
      location,
      requires_prescription
    } = req.body;

    // The Add-Item form sends expiry_date as '' when left blank; Postgres rejects
    // '' for a DATE column ("invalid input syntax for type date"). Coerce any
    // blank/whitespace value to NULL so creating an item without an expiry works.
    const expiry = expiry_date && String(expiry_date).trim() !== '' ? expiry_date : null;
    // Units per pack (selling_price is per pack). Must be > 0; default 1.
    const packSize = Number(pack_size) > 0 ? Number(pack_size) : 1;

    const result = await pool.query(
      `INSERT INTO pharmacy_inventory
       (medication_name, generic_name, category, unit, quantity_on_hand, reorder_level,
        unit_cost, selling_price, pack_size, expiry_date, supplier, supplier_id, location, requires_prescription)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [medication_name, generic_name, category, unit, quantity_on_hand || 0, reorder_level || 10,
       unit_cost || 0, selling_price || 0, packSize, expiry, supplier, supplier_id || null, location || 'Main Pharmacy', requires_prescription ?? true]
    );

    // Log the opening balance as an ADJUSTMENT, not a purchase. Creating an
    // item just defines it + sets a starting count; an actual purchase (money
    // spent, supplier invoice) is recorded separately on the Procurement page.
    // Logging this as 'purchase' made new items show up as phantom purchases in
    // Recent Purchases (Irene's report).
    const authReq = req as any;
    if (quantity_on_hand > 0) {
      await pool.query(
        `INSERT INTO inventory_transactions
         (inventory_id, transaction_type, quantity, notes, performed_by)
         VALUES ($1, 'adjustment', $2, 'Opening balance (item created)', $3)`,
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
      pack_size,
      expiry_date,
      supplier,
      supplier_id,
      location,
      requires_prescription,
      is_active
    } = req.body;

    // Coerce blank expiry_date ('') to NULL — COALESCE keeps '' (not NULL) and
    // the cast to DATE would fail. NULL means "leave existing value unchanged".
    const expiry = expiry_date && String(expiry_date).trim() !== '' ? expiry_date : null;
    // Units per pack: only update when a valid (>0) value is sent; NULL leaves
    // the existing pack_size unchanged (COALESCE).
    const packSize = Number(pack_size) > 0 ? Number(pack_size) : null;

    const result = await pool.query(
      `UPDATE pharmacy_inventory SET
        medication_name = COALESCE($1, medication_name),
        generic_name = COALESCE($2, generic_name),
        category = COALESCE($3, category),
        unit = COALESCE($4, unit),
        reorder_level = COALESCE($5, reorder_level),
        unit_cost = COALESCE($6, unit_cost),
        selling_price = COALESCE($7, selling_price),
        pack_size = COALESCE($8, pack_size),
        expiry_date = COALESCE($9, expiry_date),
        supplier = COALESCE($10, supplier),
        supplier_id = COALESCE($11, supplier_id),
        location = COALESCE($12, location),
        requires_prescription = COALESCE($13, requires_prescription),
        is_active = COALESCE($14, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $15
       RETURNING *`,
      [medication_name, generic_name, category, unit, reorder_level, unit_cost,
       selling_price, packSize, expiry, supplier, supplier_id, location, requires_prescription, is_active, id]
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

    // Notify pharmacists when a pharmacy tech adjusts inventory
    if (authReq.user?.role === 'pharmacy_tech') {
      const item = result.rows[0];
      const direction = adjustment > 0 ? 'increased' : 'decreased';
      await notificationService.notifyPharmacistOfTechAction(
        authReq.user.id,
        'Inventory Adjusted',
        `${direction} ${item.medication_name} by ${Math.abs(adjustment)} units (now ${newQuantity}). Reason: ${notes || 'Not specified'}`,
        'pharmacy_inventory',
        parseInt(id as string)
      );
    }

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
    const { start_date, end_date, search } = req.query;

    // dispensed_date is a TIMESTAMP. Comparing against bare date strings
    // (`>= '2026-05-25' AND <= '2026-05-25'`) implicitly casts both bounds
    // to midnight, so any non-midnight same-day row got excluded — which
    // made Order History show zeros for a same-day filter. Cast explicitly
    // and use a half-open upper bound (< next-day) so the whole end day
    // is included.
    let dateFilter = '';
    let transactionDateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = `AND po.dispensed_date >= $1::date AND po.dispensed_date < ($2::date + interval '1 day')`;
      transactionDateFilter = `AND it.created_at >= $1::date AND it.created_at < ($2::date + interval '1 day')`;
      params.push(start_date, end_date);
    } else if (start_date) {
      dateFilter = `AND po.dispensed_date >= $1::date`;
      transactionDateFilter = `AND it.created_at >= $1::date`;
      params.push(start_date);
    } else if (end_date) {
      dateFilter = `AND po.dispensed_date < ($1::date + interval '1 day')`;
      transactionDateFilter = `AND it.created_at < ($1::date + interval '1 day')`;
      params.push(end_date);
    }

    // Optional search across patient name / patient number / medication name.
    // Only applied to the orders LIST query — summary stats stay unfiltered
    // (Gmail-style: search narrows what you see, totals reflect the full set).
    const searchTerm = (search as string || '').trim();

    // Revenue by day. inventory_transactions has no unit_cost column — the
    // price lives on pharmacy_inventory.selling_price. Join to get it.
    const dailyRevenue = await pool.query(
      `SELECT
        DATE(it.created_at) as date,
        COUNT(*) as orders_count,
        COALESCE(SUM(ABS(it.quantity) * pi.selling_price), 0) as revenue
       FROM inventory_transactions it
       JOIN pharmacy_inventory pi ON it.inventory_id = pi.id
       WHERE it.transaction_type = 'dispense' ${transactionDateFilter}
       GROUP BY DATE(it.created_at)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );

    // Totals from pharmacy orders
    const totals = await pool.query(
      `SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'dispensed') as dispensed_orders,
        COUNT(*) FILTER (WHERE status = 'ordered') as pending_orders,
        COUNT(DISTINCT patient_id) as unique_patients
       FROM pharmacy_orders
       WHERE is_manual_reminder IS NOT TRUE ${dateFilter.replace(/po\./g, '')}`,
      params
    );

    // Total revenue from dispense transactions
    const revenueTotal = await pool.query(
      `SELECT
        COALESCE(SUM(ABS(it.quantity) * pi.selling_price), 0) as total_revenue
       FROM inventory_transactions it
       JOIN pharmacy_inventory pi ON it.inventory_id = pi.id
       WHERE it.transaction_type = 'dispense' ${transactionDateFilter}`,
      params
    );

    // Top medications by dispensed quantity
    const topMedications = await pool.query(
      `SELECT
        pi.medication_name,
        COUNT(*) as order_count,
        SUM(ABS(it.quantity)) as total_quantity,
        COALESCE(SUM(ABS(it.quantity) * pi.selling_price), 0) as total_revenue
       FROM inventory_transactions it
       JOIN pharmacy_inventory pi ON it.inventory_id = pi.id
       WHERE it.transaction_type = 'dispense' ${transactionDateFilter}
       GROUP BY pi.medication_name
       ORDER BY total_revenue DESC
       LIMIT 10`,
      params
    );

    // Orders list — the actual rows the pharmacist scrolls through.
    // Date filter scoped via dateFilter (po.* prefix). Search applies on top.
    const ordersParams: any[] = [...params];
    let ordersSearchClause = '';
    if (searchTerm) {
      const idx = ordersParams.length + 1;
      ordersSearchClause = `AND (
        pu.first_name ILIKE $${idx} OR pu.last_name ILIKE $${idx}
        OR (pu.first_name || ' ' || pu.last_name) ILIKE $${idx}
        OR p.patient_number ILIKE $${idx}
        OR po.medication_name ILIKE $${idx}
      )`;
      ordersParams.push(`%${searchTerm}%`);
    }
    const orders = await pool.query(
      `SELECT po.id, po.medication_name, po.dosage, po.quantity, po.status,
              po.dispensed_date, po.ordered_date,
              p.patient_number,
              pu.first_name || ' ' || pu.last_name AS patient_name,
              du.first_name || ' ' || du.last_name AS dispensed_by_name,
              pi.selling_price,
              (CASE WHEN pi.selling_price IS NOT NULL
                    THEN pi.selling_price * COALESCE(NULLIF(po.quantity,'')::numeric, 0)
                    ELSE NULL END) AS line_total
         FROM pharmacy_orders po
         LEFT JOIN patients p ON po.patient_id = p.id
         LEFT JOIN users pu ON p.user_id = pu.id
         LEFT JOIN users du ON po.dispensed_by = du.id
         LEFT JOIN pharmacy_inventory pi ON po.inventory_id = pi.id
        WHERE po.is_manual_reminder IS NOT TRUE ${dateFilter} ${ordersSearchClause}
        ORDER BY COALESCE(po.dispensed_date, po.ordered_date) DESC
        LIMIT 200`,
      ordersParams
    );

    res.json({
      daily_revenue: dailyRevenue.rows,
      totals: {
        ...totals.rows[0],
        total_revenue: revenueTotal.rows[0]?.total_revenue || 0
      },
      top_medications: topMedications.rows,
      orders: orders.rows,
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
        du.first_name || ' ' || du.last_name as dispensed_by_name,
        e.encounter_number
       FROM pharmacy_orders po
       LEFT JOIN users u ON po.ordering_provider = u.id
       LEFT JOIN users du ON po.dispensed_by = du.id
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
      // Uses days_supply if set, otherwise falls back to quantity as days.
      // DISTINCT ON collapses duplicate rows for the same patient + medication
      // landing on the same refill date (e.g. a manual reminder duplicating a
      // real dispense) so each shows only once. When both exist we keep the
      // real order (is_manual_reminder ASC → false first) so "Process Refill" works.
      result = await pool.query(
        `SELECT * FROM (
          SELECT DISTINCT ON (p.id, LOWER(po.medication_name), (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date)
            po.id,
            po.medication_name,
            po.quantity,
            po.refills,
            po.days_supply,
            po.dispensed_date,
            po.frequency,
            po.is_manual_reminder,
            p.id as patient_id,
            p.patient_number,
            u.first_name || ' ' || u.last_name as patient_name,
            u.phone as patient_phone,
            (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date as estimated_refill_date,
            po.refills as refills_remaining
           FROM pharmacy_orders po
           JOIN patients p ON po.patient_id = p.id
           JOIN users u ON p.user_id = u.id
           WHERE po.status = 'dispensed'
             AND po.refills > 0
             AND po.reminder_cleared IS NOT TRUE
             AND (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date >= $1::date
             AND (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date <= $2::date
           ORDER BY p.id, LOWER(po.medication_name), (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date, po.is_manual_reminder ASC, po.id DESC
        ) sub
        ORDER BY sub.estimated_refill_date ASC`,
        [from_date, to_date]
      );
    } else if (year && month) {
      // Year/month query (original behavior)
      // Uses days_supply if set, otherwise falls back to quantity as days.
      // DISTINCT ON dedupes same patient + medication + refill date (see range branch above).
      result = await pool.query(
        `SELECT * FROM (
          SELECT DISTINCT ON (p.id, LOWER(po.medication_name), (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date)
            po.id,
            po.medication_name,
            po.quantity,
            po.refills,
            po.days_supply,
            po.dispensed_date,
            po.frequency,
            po.is_manual_reminder,
            p.id as patient_id,
            p.patient_number,
            u.first_name || ' ' || u.last_name as patient_name,
            u.phone as patient_phone,
            (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date as estimated_refill_date,
            po.refills as refills_remaining
           FROM pharmacy_orders po
           JOIN patients p ON po.patient_id = p.id
           JOIN users u ON p.user_id = u.id
           WHERE po.status = 'dispensed'
             AND po.refills > 0
             AND po.reminder_cleared IS NOT TRUE
             AND EXTRACT(YEAR FROM (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)) = $1
             AND EXTRACT(MONTH FROM (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)) = $2
           ORDER BY p.id, LOWER(po.medication_name), (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date, po.is_manual_reminder ASC, po.id DESC
        ) sub
        ORDER BY sub.estimated_refill_date ASC`,
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
      expiry_date,
      invoice_number,
      invoice_date
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

    // Auto-generate batch number: MED-EXP(YYYYMM)-XXX (based on expiry date)
    let generatedBatchNumber = batch_number;
    if (!batch_number) {
      const medName = medResult.rows[0]?.medication_name || 'MED';
      // Create abbreviation from first 3 letters of first word (uppercase)
      const abbrev = medName.split(' ')[0].substring(0, 3).toUpperCase();
      // Use expiry date for batch grouping if provided, otherwise fall back to current date
      const dateRef = expiry_date ? new Date(expiry_date) : new Date();
      const yearMonth = `${dateRef.getFullYear()}${String(dateRef.getMonth() + 1).padStart(2, '0')}`;

      // Get next sequence number for this medication + expiry month
      const seqResult = await client.query(
        `SELECT COUNT(*) + 1 as next_seq FROM inventory_batches
         WHERE inventory_id = $1 AND batch_number LIKE $2`,
        [inventory_id, `${abbrev}-${yearMonth}%`]
      );
      const seqNum = String(seqResult.rows[0].next_seq).padStart(3, '0');
      generatedBatchNumber = `${abbrev}-${yearMonth}-${seqNum}`;
    }
    const batchResult = await client.query(
      `INSERT INTO inventory_batches
        (inventory_id, batch_number, quantity, unit_cost, expiry_date, supplier_id, notes, invoice_number, invoice_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        inventory_id,
        generatedBatchNumber,
        quantity,
        unit_cost,
        expiry_date || null,
        supplier_id || null,
        `Discount: ${discount_percent || 0}%, Original cost: ${original_unit_cost || unit_cost}`,
        invoice_number || null,
        invoice_date || null
      ]
    );
    const batchId = batchResult.rows[0].id;

    // Record the purchase transaction
    await client.query(
      `INSERT INTO inventory_transactions
        (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by, invoice_number, invoice_date)
       VALUES ($1, 'purchase', $2, 'procurement', $3, $4, $5, $6, $7)`,
      [
        inventory_id,
        quantity,
        batchId,
        `Batch: ${generatedBatchNumber}, Cost: ${unit_cost}, Discount: ${discount_percent || 0}%`,
        userId,
        invoice_number || null,
        invoice_date || null
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
    // Pull purchase history from transactions, joining batches for accurate per-purchase data
    const result = await pool.query(
      `SELECT
        it.id,
        it.inventory_id,
        it.quantity,
        it.notes,
        it.created_at,
        it.invoice_number,
        it.invoice_date,
        it.reference_id as batch_id,
        pi.medication_name,
        COALESCE(ib.unit_cost, pi.unit_cost) as unit_cost,
        COALESCE(s2.name, s.name) as supplier_name,
        COALESCE(ib.supplier_id, pi.supplier_id) as supplier_id,
        CASE
          WHEN it.notes LIKE '%Discount: %'
          THEN SUBSTRING(it.notes FROM 'Discount: ([0-9.]+)%')
          ELSE NULL
        END as discount_percent,
        COALESCE(ib.batch_number,
          CASE
            WHEN it.notes LIKE '%Batch: %'
            THEN SUBSTRING(it.notes FROM 'Batch: ([^,]+)')
            ELSE NULL
          END
        ) as batch_number,
        ib.expiry_date
       FROM inventory_transactions it
       JOIN pharmacy_inventory pi ON it.inventory_id = pi.id
       LEFT JOIN inventory_batches ib ON it.reference_id = ib.id
       LEFT JOIN suppliers s ON pi.supplier_id = s.id
       LEFT JOIN suppliers s2 ON ib.supplier_id = s2.id
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

// Delete a purchase transaction and reverse inventory changes
export const deletePurchase = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Get the transaction details
    const txResult = await client.query(
      `SELECT it.*, pi.medication_name
       FROM inventory_transactions it
       JOIN pharmacy_inventory pi ON it.inventory_id = pi.id
       WHERE it.id = $1 AND it.transaction_type = 'purchase'`,
      [id]
    );

    if (txResult.rows.length === 0) {
      res.status(404).json({ error: 'Purchase transaction not found' });
      await client.query('ROLLBACK');
      return;
    }

    const tx = txResult.rows[0];

    // Reverse the inventory quantity
    await client.query(
      `UPDATE pharmacy_inventory
       SET quantity_on_hand = GREATEST(0, quantity_on_hand - $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [tx.quantity, tx.inventory_id]
    );

    // Remove the associated batch if reference_id exists
    if (tx.reference_id) {
      await client.query(
        `DELETE FROM inventory_batches WHERE id = $1`,
        [tx.reference_id]
      );
    }

    // Delete the transaction record
    await client.query(
      `DELETE FROM inventory_transactions WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Purchase deleted and inventory adjusted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete purchase error:', error);
    res.status(500).json({ error: 'Failed to delete purchase' });
  } finally {
    client.release();
  }
};

// Update batch quantity (for stock adjustments)
export const updateBatchQuantity = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const id = req.params.id as string;
    const batchId = req.params.batchId as string;
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
      const { batchId, quantity, expiry_date } = batchUpdate;
      const hasExpiry = expiry_date !== undefined; // allow null to clear

      if ((quantity === undefined || quantity < 0) && !hasExpiry) continue;

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
      const newQty = (quantity === undefined || quantity < 0) ? batch.quantity : quantity;
      const quantityDiff = newQty - batch.quantity;
      const prevExpiry = batch.expiry_date ? new Date(batch.expiry_date).toISOString().split('T')[0] : null;
      const expiryChanged = hasExpiry && (expiry_date || null) !== prevExpiry;

      if (quantityDiff === 0 && !expiryChanged) continue; // No change

      // Update batch quantity and/or expiry
      await client.query(
        `UPDATE inventory_batches
         SET quantity = $1,
             expiry_date = CASE WHEN $3::boolean THEN $4::date ELSE expiry_date END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newQty, batchId, hasExpiry, expiry_date || null]
      );

      totalQuantityDiff += quantityDiff;

      // Log individual batch adjustment
      const parts: string[] = [];
      if (quantityDiff !== 0) parts.push(`${quantityDiff > 0 ? 'increased' : 'decreased'}: ${batch.quantity} → ${newQty}`);
      if (expiryChanged) parts.push(`expiry ${prevExpiry || 'none'} → ${expiry_date || 'none'}`);
      await client.query(
        `INSERT INTO inventory_transactions
         (inventory_id, transaction_type, quantity, notes, performed_by)
         VALUES ($1, 'adjustment', $2, $3, $4)`,
        [
          id,
          Math.abs(quantityDiff),
          `Batch ${batch.batch_number} ${parts.join(', ')}. ${reason || 'Stock adjustment'}`,
          authReq.user?.id
        ]
      );

      updatedBatches.push({
        batchId,
        batch_number: batch.batch_number,
        previous_quantity: batch.quantity,
        new_quantity: newQty,
        difference: quantityDiff
      });
    }

    // Resync main inventory quantity + earliest expiry whenever any batch changed
    // (covers expiry-only edits too, which leave totalQuantityDiff at 0).
    if (updatedBatches.length > 0) {
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

// Helper: generate a batch number from a med name + reference date, unique per
// medication + expiry-month, matching the scheme used by recordPurchase.
const generateBatchNumber = async (client: any, inventoryId: string | number, medicationName: string, refDateStr?: string | null): Promise<string> => {
  const abbrev = (medicationName || 'MED').split(' ')[0].substring(0, 3).toUpperCase();
  const dateRef = refDateStr ? new Date(refDateStr) : new Date();
  const yearMonth = `${dateRef.getFullYear()}${String(dateRef.getMonth() + 1).padStart(2, '0')}`;
  const seq = await client.query(
    `SELECT COUNT(*) + 1 AS next_seq FROM inventory_batches WHERE inventory_id = $1 AND batch_number LIKE $2`,
    [inventoryId, `${abbrev}-${yearMonth}%`]
  );
  return `${abbrev}-${yearMonth}-${String(seq.rows[0].next_seq).padStart(3, '0')}`;
};

// Add a single batch to an item manually (stock received outside procurement,
// or recording a new expiry/lot). Quantity adds to on-hand; earliest expiry resyncs.
export const addBatch = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { batch_number, quantity, expiry_date, unit_cost, supplier_id, notes } = req.body;
    const authReq = req as any;
    const qty = parseInt(String(quantity));

    if (!qty || qty <= 0) {
      res.status(400).json({ error: 'Quantity must be greater than 0' });
      return;
    }

    await client.query('BEGIN');

    const med = await client.query(`SELECT medication_name FROM pharmacy_inventory WHERE id = $1`, [id]);
    if (med.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    const bn = (batch_number && String(batch_number).trim())
      ? String(batch_number).trim()
      : await generateBatchNumber(client, String(id), med.rows[0].medication_name, expiry_date);

    const batchIns = await client.query(
      `INSERT INTO inventory_batches
        (inventory_id, batch_number, quantity, unit_cost, expiry_date, supplier_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [id, bn, qty, unit_cost || null, expiry_date || null, supplier_id || null, notes || 'Manually added batch']
    );

    await client.query(
      `INSERT INTO inventory_transactions
        (inventory_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
       VALUES ($1, 'adjustment', $2, 'batch', $3, $4, $5)`,
      [id, qty, batchIns.rows[0].id, `Batch ${bn} added: +${qty}${expiry_date ? `, exp ${expiry_date}` : ''}`, authReq.user?.id]
    );

    await client.query(
      `UPDATE pharmacy_inventory
       SET quantity_on_hand = quantity_on_hand + $1,
           expiry_date = (
             SELECT MIN(expiry_date) FROM inventory_batches
             WHERE inventory_id = $2 AND is_active = true AND quantity > 0 AND expiry_date IS NOT NULL
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [qty, id]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Batch added', batch_number: bn });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add batch error:', error);
    res.status(500).json({ error: 'Failed to add batch' });
  } finally {
    client.release();
  }
};

// Stock-take: reconcile counted quantities (and expiry) after a physical count.
// Two modes:
//  - Batch-level: body.batches = [{ batchId, counted_quantity, expiry_date? }]
//    (used when an item has multiple batches and each is counted separately)
//  - Item-level: body.counted_total + body.expiry_date
//    (single number for the whole item; for a batchless item we open one batch
//     so FEFO keeps working, for a single-batch item we update that batch)
export const stockTakeItem = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { counted_total, expiry_date, batches, reason } = req.body;
    const authReq = req as any;
    const note = reason && String(reason).trim() ? String(reason).trim() : 'Stock-take';

    await client.query('BEGIN');

    const itemRes = await client.query(
      `SELECT id, medication_name, quantity_on_hand FROM pharmacy_inventory WHERE id = $1`,
      [id]
    );
    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    // ---- Batch-level mode ----
    if (Array.isArray(batches) && batches.length > 0) {
      for (const b of batches) {
        if (b.counted_quantity === undefined || b.counted_quantity === null || b.counted_quantity === '' || Number(b.counted_quantity) < 0) continue;
        const q = parseInt(String(b.counted_quantity));
        const cur = await client.query(
          `SELECT quantity, batch_number, expiry_date FROM inventory_batches WHERE id = $1 AND inventory_id = $2`,
          [b.batchId, id]
        );
        if (cur.rows.length === 0) continue;
        const prev = cur.rows[0].quantity;
        const diff = q - prev;
        const hasExpiry = b.expiry_date !== undefined;
        const prevExpiry = cur.rows[0].expiry_date ? new Date(cur.rows[0].expiry_date).toISOString().split('T')[0] : null;
        const expiryChanged = hasExpiry && (b.expiry_date || null) !== prevExpiry;
        if (diff === 0 && !expiryChanged) continue;

        await client.query(
          `UPDATE inventory_batches
           SET quantity = $1,
               expiry_date = CASE WHEN $3::boolean THEN $4::date ELSE expiry_date END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [q, b.batchId, hasExpiry, b.expiry_date || null]
        );

        const parts: string[] = [];
        if (diff !== 0) parts.push(`${diff > 0 ? 'increased' : 'decreased'} ${prev} → ${q}`);
        if (expiryChanged) parts.push(`expiry ${prevExpiry || 'none'} → ${b.expiry_date || 'none'}`);
        await client.query(
          `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity, notes, performed_by)
           VALUES ($1, 'adjustment', $2, $3, $4)`,
          [id, Math.abs(diff), `Stock-take: batch ${cur.rows[0].batch_number} ${parts.join(', ')}. ${note}`, authReq.user?.id]
        );
      }
    } else {
      // ---- Item-level mode ----
      if (counted_total === undefined || counted_total === null || counted_total === '' || Number(counted_total) < 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Counted quantity is required' });
        return;
      }
      const counted = parseInt(String(counted_total));

      const activeBatches = await client.query(
        `SELECT id, quantity, batch_number FROM inventory_batches
         WHERE inventory_id = $1 AND is_active = true AND quantity > 0
         ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
        [id]
      );

      if (activeBatches.rows.length > 1) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'This item has multiple batches — expand it to count each batch separately.' });
        return;
      }

      if (activeBatches.rows.length === 1) {
        const batch = activeBatches.rows[0];
        const diff = counted - batch.quantity;
        const hasExpiry = expiry_date !== undefined;
        await client.query(
          `UPDATE inventory_batches
           SET quantity = $1,
               expiry_date = CASE WHEN $3::boolean THEN $4::date ELSE expiry_date END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [counted, batch.id, hasExpiry, expiry_date || null]
        );
        await client.query(
          `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity, notes, performed_by)
           VALUES ($1, 'adjustment', $2, $3, $4)`,
          [id, Math.abs(diff), `Stock-take: batch ${batch.batch_number} counted ${batch.quantity} → ${counted}. ${note}`, authReq.user?.id]
        );
      } else {
        // No batches yet — open one so FEFO dispensing has something to draw from.
        const bn = await generateBatchNumber(client, String(id), itemRes.rows[0].medication_name, expiry_date);
        await client.query(
          `INSERT INTO inventory_batches (inventory_id, batch_number, quantity, expiry_date, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, bn, counted, expiry_date || null, 'Opened via stock-take']
        );
        const prevOnHand = parseInt(String(itemRes.rows[0].quantity_on_hand)) || 0;
        const diff = counted - prevOnHand;
        await client.query(
          `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity, notes, performed_by)
           VALUES ($1, 'adjustment', $2, $3, $4)`,
          [id, Math.abs(diff), `Stock-take: counted ${counted} (was ${prevOnHand}); opened batch ${bn}. ${note}`, authReq.user?.id]
        );
      }
    }

    // Resync the item's on-hand to the sum of its active batches + earliest expiry.
    await client.query(
      `UPDATE pharmacy_inventory
       SET quantity_on_hand = COALESCE((
             SELECT SUM(quantity) FROM inventory_batches
             WHERE inventory_id = $1 AND is_active = true AND quantity > 0
           ), 0),
           expiry_date = (
             SELECT MIN(expiry_date) FROM inventory_batches
             WHERE inventory_id = $1 AND is_active = true AND quantity > 0 AND expiry_date IS NOT NULL
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Stock-take saved' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Stock-take error:', error);
    res.status(500).json({ error: 'Failed to save stock-take' });
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
      WHERE po.status = 'dispensed' AND po.is_manual_reminder IS NOT TRUE
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
      WHERE po.status = 'dispensed' AND po.is_manual_reminder IS NOT TRUE
        AND po.dispensed_date >= $1::date
        AND po.dispensed_date <= $2::date + INTERVAL '1 day'
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
      WHERE po.status = 'dispensed' AND po.is_manual_reminder IS NOT TRUE
        AND po.dispensed_date >= $1::date
        AND po.dispensed_date <= $2::date + INTERVAL '1 day'
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
      WHERE po.status = 'dispensed' AND po.is_manual_reminder IS NOT TRUE
        AND po.dispensed_date >= $1::date
        AND po.dispensed_date <= $2::date + INTERVAL '1 day'
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
      WHERE po.status = 'dispensed' AND po.is_manual_reminder IS NOT TRUE
        AND po.dispensed_date >= $1::date
        AND po.dispensed_date <= $2::date + INTERVAL '1 day'
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
        COALESCE(NULLIF(TRIM(po.substitute_medication), ''), po.medication_name) AS medication_name,
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
        AND po.is_manual_reminder IS NOT TRUE
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
        AND po.is_manual_reminder IS NOT TRUE
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
