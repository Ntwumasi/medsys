import { Request, Response } from 'express';
import pool from '../database/db';

// Get all charges from charge master
export const getAllCharges = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.query;

    let query = 'SELECT * FROM charge_master WHERE is_active = true';
    const params: any[] = [];

    if (category) {
      query += ' AND category = $1';
      params.push(category);
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

// Add charge to invoice
export const addChargeToInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { invoice_id, charge_master_id, quantity, description } = req.body;

    if (!invoice_id) {
      res.status(400).json({ error: 'Invoice ID is required' });
      return;
    }

    // Get charge details
    const chargeResult = await pool.query(
      'SELECT * FROM charge_master WHERE id = $1 AND is_active = true',
      [charge_master_id]
    );

    if (chargeResult.rows.length === 0) {
      res.status(404).json({ error: 'Charge not found' });
      return;
    }

    const charge = chargeResult.rows[0];
    const qty = quantity || 1;
    const unitPrice = parseFloat(charge.price);
    const totalPrice = unitPrice * qty;
    const itemDescription = description || charge.service_name;

    // Add item to invoice
    const itemResult = await pool.query(
      `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [invoice_id, charge_master_id, itemDescription, qty, unitPrice, totalPrice]
    );

    // Update invoice total
    const sumResult = await pool.query(
      'SELECT SUM(total_price) as total FROM invoice_items WHERE invoice_id = $1',
      [invoice_id]
    );

    const newTotal = parseFloat(sumResult.rows[0].total) || 0;

    await pool.query(
      'UPDATE invoices SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
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
