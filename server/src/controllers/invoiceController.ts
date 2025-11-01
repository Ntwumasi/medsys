import { Request, Response } from 'express';
import pool from '../database/db';

// Get invoice by ID
export const getInvoiceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const invoiceResult = await pool.query(
      `SELECT i.*,
              p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name,
              u.email as patient_email,
              u.phone as patient_phone,
              p.address as patient_address,
              p.city as patient_city,
              p.state as patient_state
       FROM invoices i
       JOIN patients p ON i.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE i.id = $1`,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    // Get invoice items
    const itemsResult = await pool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1`,
      [id]
    );

    // Get payments
    const paymentsResult = await pool.query(
      `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [id]
    );

    // Get payer sources
    const payerSourcesResult = await pool.query(
      `SELECT
        pps.*,
        cc.name as corporate_client_name,
        ip.name as insurance_provider_name
       FROM patient_payer_sources pps
       LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
       LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
       WHERE pps.patient_id = $1
       ORDER BY pps.is_primary DESC`,
      [invoiceResult.rows[0].patient_id]
    );

    res.json({
      invoice: invoiceResult.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows,
      payer_sources: payerSourcesResult.rows,
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

// Get invoices by patient ID
export const getInvoicesByPatient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;

    const result = await pool.query(
      `SELECT i.*, e.encounter_date, e.chief_complaint
       FROM invoices i
       LEFT JOIN encounters e ON i.encounter_id = e.id
       WHERE i.patient_id = $1
       ORDER BY i.invoice_date DESC`,
      [patient_id]
    );

    res.json({
      invoices: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get patient invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// Get invoice by encounter ID
export const getInvoiceByEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const invoiceResult = await pool.query(
      `SELECT i.*,
              p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name,
              u.email as patient_email,
              u.phone as patient_phone,
              p.address as patient_address,
              p.city as patient_city,
              p.state as patient_state,
              e.chief_complaint,
              e.encounter_date
       FROM invoices i
       JOIN encounters e ON i.encounter_id = e.id
       JOIN patients p ON i.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE i.encounter_id = $1`,
      [encounter_id]
    );

    if (invoiceResult.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found for this encounter' });
      return;
    }

    // Get invoice items
    const itemsResult = await pool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1`,
      [invoiceResult.rows[0].id]
    );

    // Get payments
    const paymentsResult = await pool.query(
      `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [invoiceResult.rows[0].id]
    );

    // Get payer sources
    const payerSourcesResult = await pool.query(
      `SELECT
        pps.*,
        cc.name as corporate_client_name,
        ip.name as insurance_provider_name
       FROM patient_payer_sources pps
       LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
       LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
       WHERE pps.patient_id = $1
       ORDER BY pps.is_primary DESC`,
      [invoiceResult.rows[0].patient_id]
    );

    res.json({
      invoice: invoiceResult.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows,
      payer_sources: payerSourcesResult.rows,
    });
  } catch (error) {
    console.error('Get encounter invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

// Create or get invoice for a patient/encounter
export const createOrGetInvoice = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { patient_id, encounter_id, items } = req.body;

    await client.query('BEGIN');

    // Check if invoice already exists for this encounter
    let invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE encounter_id = $1`,
      [encounter_id]
    );

    let invoice_id;

    if (invoiceResult.rows.length > 0) {
      // Invoice exists, return it
      invoice_id = invoiceResult.rows[0].id;
    } else {
      // Create new invoice
      // Generate invoice number
      const countResult = await client.query('SELECT COUNT(*) FROM invoices');
      const invoiceCount = parseInt(countResult.rows[0].count) + 1;
      const invoice_number = `INV${String(invoiceCount).padStart(6, '0')}`;

      // Calculate totals from items
      const subtotal = items.reduce((sum: number, item: any) => sum + parseFloat(item.total), 0);
      const tax = 0; // No tax for now
      const total = subtotal + tax;

      invoiceResult = await client.query(
        `INSERT INTO invoices (
          patient_id, encounter_id, invoice_number, invoice_date,
          subtotal, tax, total, status
        ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 'pending')
        RETURNING *`,
        [patient_id, encounter_id, invoice_number, subtotal, tax, total]
      );

      invoice_id = invoiceResult.rows[0].id;

      // Insert invoice items
      for (const item of items) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total)
           VALUES ($1, $2, $3, $4, $5)`,
          [invoice_id, item.description, item.quantity, item.unit_price, item.total]
        );
      }
    }

    await client.query('COMMIT');

    // Get complete invoice data
    const completeInvoiceResult = await pool.query(
      `SELECT i.*,
              p.patient_number,
              u.first_name || ' ' || u.last_name as patient_name
       FROM invoices i
       JOIN patients p ON i.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE i.id = $1`,
      [invoice_id]
    );

    const itemsResult = await pool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1`,
      [invoice_id]
    );

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice: completeInvoiceResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  } finally {
    client.release();
  }
};

// Update invoice
export const updateInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, amount_paid, notes } = req.body;

    const result = await pool.query(
      `UPDATE invoices
       SET status = COALESCE($1, status),
           amount_paid = COALESCE($2, amount_paid),
           notes = COALESCE($3, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, amount_paid, notes, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    res.json({
      message: 'Invoice updated successfully',
      invoice: result.rows[0],
    });
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
};
