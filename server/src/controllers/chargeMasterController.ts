import { Request, Response } from 'express';
import pool from '../database/db';
import { resolvePrice } from '../services/priceResolutionService';

// Get all charges from charge master
// Supports optional payer filtering: ?payer_type=insurance&payer_id=3
export const getAllCharges = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, payer_type, payer_id } = req.query;

    let query: string;
    const params: any[] = [];
    let paramIdx = 1;

    if (payer_type && payer_id) {
      // Join with payer_price_schedules to include payer-specific prices
      const payerColumn = payer_type === 'insurance' ? 'insurance_provider_id' : 'corporate_client_id';
      query = `
        SELECT cm.*,
          pps.price as payer_price,
          pps.is_excluded as payer_excluded
        FROM charge_master cm
        LEFT JOIN payer_price_schedules pps
          ON cm.id = pps.charge_master_id
          AND pps.payer_type = $${paramIdx}
          AND pps.${payerColumn} = $${paramIdx + 1}
        WHERE cm.is_active = true`;
      params.push(payer_type, payer_id);
      paramIdx += 2;
    } else {
      query = 'SELECT * FROM charge_master WHERE is_active = true';
    }

    if (category) {
      query += ` AND category = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }

    query += ' ORDER BY category, service_name';

    const result = await pool.query(query, params);

    res.json({
      charges: result.rows,
    });
  } catch (error) {
    console.error('Get charges error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add charge to invoice (supports both charge_master items and custom/other charges)
export const addChargeToInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { invoice_id, charge_master_id, quantity, description, unit_price } = req.body;

    if (!invoice_id) {
      res.status(400).json({ error: 'Invoice ID is required' });
      return;
    }

    const qty = quantity || 1;
    let unitPrice: number;
    let itemDescription: string;

    if (charge_master_id) {
      // Standard charge from charge master
      const chargeResult = await pool.query(
        'SELECT * FROM charge_master WHERE id = $1 AND is_active = true',
        [charge_master_id]
      );

      if (chargeResult.rows.length === 0) {
        res.status(404).json({ error: 'Charge not found' });
        return;
      }

      const charge = chargeResult.rows[0];

      // Resolve payer-specific price
      const resolved = await resolvePrice(charge_master_id, invoice_id);
      if (resolved.isExcluded) {
        res.status(400).json({ error: 'This service is excluded for the patient\'s payer' });
        return;
      }

      unitPrice = resolved.unitPrice;
      itemDescription = description || charge.service_name;
    } else {
      // Custom/other charge (no charge_master_id)
      if (!description) {
        res.status(400).json({ error: 'Description is required for custom charges' });
        return;
      }
      unitPrice = parseFloat(unit_price) || 0;
      itemDescription = description;
    }

    const totalPrice = unitPrice * qty;

    // Add item to invoice
    const itemResult = await pool.query(
      `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [invoice_id, charge_master_id || null, itemDescription, qty, unitPrice, totalPrice]
    );

    // Update invoice total
    const sumResult = await pool.query(
      'SELECT SUM(total_price) as total FROM invoice_items WHERE invoice_id = $1',
      [invoice_id]
    );

    const newTotal = parseFloat(sumResult.rows[0].total) || 0;

    await pool.query(
      'UPDATE invoices SET total_amount = $1, subtotal = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newTotal, invoice_id]
    );

    res.status(201).json({
      message: 'Charge added to invoice successfully',
      item: itemResult.rows[0],
      new_total: newTotal,
    });
  } catch (error) {
    console.error('Add charge to invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get invoice items
export const getInvoiceItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const { invoice_id } = req.params;

    const result = await pool.query(
      `SELECT ii.*, cm.service_code, cm.category
       FROM invoice_items ii
       LEFT JOIN charge_master cm ON ii.charge_master_id = cm.id
       WHERE ii.invoice_id = $1
       ORDER BY ii.created_at`,
      [invoice_id]
    );

    res.json({
      items: result.rows,
    });
  } catch (error) {
    console.error('Get invoice items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove item from invoice
export const removeInvoiceItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get item details first
    const itemResult = await pool.query(
      'SELECT invoice_id FROM invoice_items WHERE id = $1',
      [id]
    );

    if (itemResult.rows.length === 0) {
      res.status(404).json({ error: 'Invoice item not found' });
      return;
    }

    const invoiceId = itemResult.rows[0].invoice_id;

    // Delete the item
    await pool.query('DELETE FROM invoice_items WHERE id = $1', [id]);

    // Recalculate invoice total
    const sumResult = await pool.query(
      'SELECT SUM(total_price) as total FROM invoice_items WHERE invoice_id = $1',
      [invoiceId]
    );

    const newTotal = parseFloat(sumResult.rows[0].total) || 0;

    await pool.query(
      'UPDATE invoices SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newTotal, invoiceId]
    );

    res.json({
      message: 'Invoice item removed successfully',
      new_total: newTotal,
    });
  } catch (error) {
    console.error('Remove invoice item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update invoice item (price, description, quantity)
export const updateInvoiceItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { unit_price, description, quantity } = req.body;

    // Get existing item
    const existingResult = await pool.query(
      'SELECT * FROM invoice_items WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: 'Invoice item not found' });
      return;
    }

    const existing = existingResult.rows[0];
    const newUnitPrice = unit_price !== undefined ? parseFloat(unit_price) : parseFloat(existing.unit_price);
    const newQty = quantity !== undefined ? quantity : existing.quantity;
    const newDescription = description !== undefined ? description : existing.description;
    const newTotalPrice = newUnitPrice * newQty;

    // Update the item
    const updateResult = await pool.query(
      `UPDATE invoice_items
       SET unit_price = $1, quantity = $2, total_price = $3, description = $4
       WHERE id = $5
       RETURNING *`,
      [newUnitPrice, newQty, newTotalPrice, newDescription, id]
    );

    // Recalculate invoice total
    const invoiceId = existing.invoice_id;
    const sumResult = await pool.query(
      'SELECT SUM(total_price) as total FROM invoice_items WHERE invoice_id = $1',
      [invoiceId]
    );

    const newTotal = parseFloat(sumResult.rows[0].total) || 0;

    await pool.query(
      'UPDATE invoices SET total_amount = $1, subtotal = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newTotal, invoiceId]
    );

    res.json({
      message: 'Invoice item updated successfully',
      item: updateResult.rows[0],
      new_total: newTotal,
    });
  } catch (error) {
    console.error('Update invoice item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create custom charge (admin only)
export const createCharge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_name, service_code, category, price, description } = req.body;

    if (!service_name || !service_code || !category || !price) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO charge_master (service_name, service_code, category, price, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [service_name, service_code, category, price, description]
    );

    res.status(201).json({
      message: 'Charge created successfully',
      charge: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Service code already exists' });
      return;
    }
    console.error('Create charge error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update charge (admin only)
export const updateCharge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { service_name, service_code, category, price, description, is_active } = req.body;

    const result = await pool.query(
      `UPDATE charge_master
       SET service_name = COALESCE($1, service_name),
           service_code = COALESCE($2, service_code),
           category = COALESCE($3, category),
           price = COALESCE($4, price),
           description = COALESCE($5, description),
           is_active = COALESCE($6, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [service_name, service_code, category, price, description, is_active, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Charge not found' });
      return;
    }

    res.json({
      message: 'Charge updated successfully',
      charge: result.rows[0],
    });
  } catch (error) {
    console.error('Update charge error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all payer prices for a specific charge
export const getPayerPricesForCharge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pps.*,
        ip.name as insurance_provider_name,
        cc.name as corporate_client_name
       FROM payer_price_schedules pps
       LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
       LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
       WHERE pps.charge_master_id = $1
       ORDER BY pps.payer_type, COALESCE(ip.name, cc.name)`,
      [id]
    );

    res.json({ payer_prices: result.rows });
  } catch (error) {
    console.error('Get payer prices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Upsert payer prices for a specific charge (admin only)
export const upsertPayerPricesForCharge = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { payer_prices } = req.body;

    if (!Array.isArray(payer_prices)) {
      res.status(400).json({ error: 'payer_prices must be an array' });
      return;
    }

    await client.query('BEGIN');

    for (const pp of payer_prices) {
      const { payer_type, insurance_provider_id, corporate_client_id, price, is_excluded } = pp;

      if (payer_type === 'insurance' && insurance_provider_id) {
        await client.query(
          `INSERT INTO payer_price_schedules
            (charge_master_id, payer_type, insurance_provider_id, price, is_excluded)
           VALUES ($1, 'insurance', $2, $3, $4)
           ON CONFLICT (charge_master_id, insurance_provider_id) WHERE payer_type = 'insurance'
           DO UPDATE SET price = EXCLUDED.price, is_excluded = EXCLUDED.is_excluded, updated_at = CURRENT_TIMESTAMP`,
          [id, insurance_provider_id, is_excluded ? null : price, is_excluded || false]
        );
      } else if (payer_type === 'corporate' && corporate_client_id) {
        await client.query(
          `INSERT INTO payer_price_schedules
            (charge_master_id, payer_type, corporate_client_id, price, is_excluded)
           VALUES ($1, 'corporate', $2, $3, $4)
           ON CONFLICT (charge_master_id, corporate_client_id) WHERE payer_type = 'corporate'
           DO UPDATE SET price = EXCLUDED.price, is_excluded = EXCLUDED.is_excluded, updated_at = CURRENT_TIMESTAMP`,
          [id, corporate_client_id, is_excluded ? null : price, is_excluded || false]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Payer prices updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Upsert payer prices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Get full price schedule for a specific payer
export const getPayerSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { payer_type, payer_id } = req.params;

    const payerColumn = payer_type === 'insurance' ? 'insurance_provider_id' : 'corporate_client_id';

    const result = await pool.query(
      `SELECT cm.id, cm.service_name, cm.service_code, cm.category, cm.price as cash_price,
        pps.price as payer_price, pps.is_excluded
       FROM charge_master cm
       LEFT JOIN payer_price_schedules pps
         ON cm.id = pps.charge_master_id
         AND pps.payer_type = $1
         AND pps.${payerColumn} = $2
       WHERE cm.is_active = true
       ORDER BY cm.category, cm.service_name`,
      [payer_type, payer_id]
    );

    res.json({ schedule: result.rows });
  } catch (error) {
    console.error('Get payer schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all payers (insurance + corporate) for dropdown
export const getAllPayers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const insurance = await pool.query(
      `SELECT id, name, 'insurance' as payer_type FROM insurance_providers WHERE is_active = true ORDER BY name`
    );
    const corporate = await pool.query(
      `SELECT id, name, 'corporate' as payer_type FROM corporate_clients WHERE is_active = true ORDER BY name`
    );

    res.json({
      payers: [...insurance.rows, ...corporate.rows],
    });
  } catch (error) {
    console.error('Get all payers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
