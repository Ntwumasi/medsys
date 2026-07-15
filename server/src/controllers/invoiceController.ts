import { Request, Response } from 'express';
import pool from '../database/db';
import { sendReceiptEmail, validateEmail } from '../services/emailService';
import { autoCheckoutIfFullyPaid } from '../services/autoCheckoutService';
import { nextInvoiceNumber } from '../services/sequences';
import { createClaimForInvoice } from './claimsController';

// Get all invoices with filters
export const getAllInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, start_date, end_date, search, payer_type, limit = 50, offset = 0 } = req.query;

    // Each invoice's effective payer type is the patient's PRIMARY payer source.
    // Patients with no payer source on file are treated as fee-paying (self_pay).
    let query = `
      SELECT i.*,
             p.patient_number,
             u.first_name || ' ' || u.last_name as patient_name,
             e.encounter_number,
             e.chief_complaint,
             COALESCE(pp.payer_type, 'self_pay') as payer_type,
             pp.corporate_client_name,
             pp.insurance_provider_name
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN encounters e ON i.encounter_id = e.id
      LEFT JOIN LATERAL (
        SELECT pps.payer_type,
               cc.name as corporate_client_name,
               ip.name as insurance_provider_name
        FROM patient_payer_sources pps
        LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
        LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
        WHERE pps.patient_id = i.patient_id
        ORDER BY pps.is_primary DESC, pps.id ASC
        LIMIT 1
      ) pp ON true
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (status === 'submitted') {
      // "Submitted — awaiting payer": handed to a corporate/insurance payer but
      // not yet settled (still a receivable).
      query += ` AND i.payer_submitted_at IS NOT NULL AND i.status IN ('pending', 'partial')`;
    } else if (status && status !== 'all') {
      paramCount++;
      query += ` AND i.status = $${paramCount}`;
      params.push(status);
    }

    // Filter by payer type (drives the Invoices / Insurance / Corporate / Staff
    // tabs on the accountant dashboard). 'self_pay' also matches invoices whose
    // patient has no payer source recorded.
    if (payer_type && payer_type !== 'all') {
      if (payer_type === 'self_pay') {
        query += ` AND COALESCE(pp.payer_type, 'self_pay') = 'self_pay'`;
      } else {
        paramCount++;
        query += ` AND pp.payer_type = $${paramCount}`;
        params.push(payer_type);
      }
    }

    if (start_date) {
      paramCount++;
      query += ` AND i.invoice_date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND i.invoice_date <= $${paramCount}`;
      params.push(end_date);
    }

    if (search) {
      paramCount++;
      query += ` AND (
        i.invoice_number ILIKE $${paramCount} OR
        p.patient_number ILIKE $${paramCount} OR
        u.first_name ILIKE $${paramCount} OR
        u.last_name ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countQuery = query.replace(/SELECT i\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add ordering and pagination
    query += ` ORDER BY i.invoice_date DESC, i.id DESC`;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    // Get summary stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'partial') as partial_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
        COALESCE(SUM(amount_paid), 0) as total_collected
      FROM invoices
      WHERE invoice_date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    res.json({
      invoices: result.rows,
      total,
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error('Get all invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// Submit an invoice to its corporate/insurance payer. Unlike marking it paid,
// this records WHEN it was submitted and leaves it a receivable (status
// unchanged, amount_paid unchanged) so it isn't counted as collected. For
// insurance payers it also auto-creates a draft claim. The invoice is marked
// paid separately, later, when the payer actually settles.
export const submitInvoiceToPayer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    // Resolve the invoice and the patient's primary payer source.
    const invoiceResult = await pool.query(
      `SELECT i.id, i.status, i.payer_submitted_at, i.patient_id,
              pp.payer_type, pp.payer_source_id, pp.corporate_client_name, pp.insurance_provider_name
       FROM invoices i
       LEFT JOIN LATERAL (
         SELECT pps.id as payer_source_id, pps.payer_type,
                cc.name as corporate_client_name, ip.name as insurance_provider_name
         FROM patient_payer_sources pps
         LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
         LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
         WHERE pps.patient_id = i.patient_id
         ORDER BY pps.is_primary DESC, pps.id ASC
         LIMIT 1
       ) pp ON true
       WHERE i.id = $1`,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const inv = invoiceResult.rows[0];
    const payerType = inv.payer_type;

    if (payerType !== 'corporate' && payerType !== 'insurance') {
      res.status(400).json({ error: 'This invoice is not billed to a corporate or insurance payer.' });
      return;
    }

    if (inv.status === 'paid') {
      res.status(400).json({ error: 'This invoice is already fully paid.' });
      return;
    }

    // Record the submission (idempotent — safe to re-submit).
    await pool.query(
      `UPDATE invoices
       SET payer_source_id = COALESCE(payer_source_id, $2),
           payer_submitted_at = COALESCE(payer_submitted_at, CURRENT_TIMESTAMP),
           payer_submitted_by = COALESCE(payer_submitted_by, $3),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, inv.payer_source_id, userId]
    );

    // Insurance → land it in the Claims workflow automatically.
    let claim: any = null;
    if (payerType === 'insurance') {
      const claimResult = await createClaimForInvoice(Number(id), userId, { skipIfExists: true });
      if (claimResult.ok) {
        claim = claimResult.claim;
      } else {
        // Don't fail the submission if claim creation can't proceed; report it.
        console.warn(`[submitInvoiceToPayer] claim not created for invoice ${id}: ${claimResult.error}`);
      }
    }

    res.json({
      success: true,
      payer_type: payerType,
      payer_name: payerType === 'corporate' ? inv.corporate_client_name : inv.insurance_provider_name,
      claim,
      message: `Invoice submitted to ${payerType === 'corporate' ? (inv.corporate_client_name || 'corporate payer') : (inv.insurance_provider_name || 'insurer')}. It stays outstanding until the payer settles.`,
    });
  } catch (error) {
    console.error('Submit invoice to payer error:', error);
    res.status(500).json({ error: 'Failed to submit invoice to payer' });
  }
};

// Record a corporate/insurance payer settlement against a submitted invoice.
// This is the settle side of the submit→settle loop: the payer (not the
// patient) pays, so it's accountant-accessible (the normal PUT /invoices/:id
// payment path is receptionist/admin only). Records a payment and moves the
// invoice to paid/partial from its amounts. Supports partial settlement.
export const settlePayerInvoice = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount, reference, payment_method } = req.body || {};
    const userId = (req as any).user?.id;

    await client.query('BEGIN');

    const invoiceResult = await client.query(
      `SELECT i.id, i.status, i.total_amount, i.amount_paid, i.payer_submitted_at,
              pp.payer_type
       FROM invoices i
       LEFT JOIN LATERAL (
         SELECT pps.payer_type FROM patient_payer_sources pps
         WHERE pps.patient_id = i.patient_id
         ORDER BY pps.is_primary DESC, pps.id ASC LIMIT 1
       ) pp ON true
       WHERE i.id = $1
       FOR UPDATE OF i`,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const inv = invoiceResult.rows[0];
    if (inv.payer_type !== 'corporate' && inv.payer_type !== 'insurance') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'This invoice is not billed to a corporate or insurance payer.' });
      return;
    }

    const total = parseFloat(inv.total_amount || 0);
    const currentPaid = parseFloat(inv.amount_paid || 0);
    const balance = total - currentPaid;

    if (balance <= 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'This invoice is already fully settled.' });
      return;
    }

    // Default to settling the full outstanding balance.
    let payAmount = amount !== undefined && amount !== null ? parseFloat(amount) : balance;
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Invalid settlement amount.' });
      return;
    }
    if (payAmount > balance + 0.001) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `Settlement (GHS ${payAmount.toFixed(2)}) exceeds the outstanding balance (GHS ${balance.toFixed(2)}).` });
      return;
    }

    const newPaid = currentPaid + payAmount;
    const newStatus = newPaid >= total && total > 0 ? 'paid' : 'partial';

    await client.query(
      `UPDATE invoices SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [newPaid, newStatus, id]
    );

    const paymentResult = await client.query(
      `INSERT INTO payments (invoice_id, payment_date, amount, payment_method, reference_number, notes, created_by, created_at)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING id`,
      [id, payAmount, payment_method || `${inv.payer_type}_settlement`, reference || null, `${inv.payer_type} payer settlement`, userId]
    );

    // Mirror to QuickBooks like the normal payment path.
    const cfg = await client.query('SELECT is_connected FROM quickbooks_config WHERE id = 1');
    if (cfg.rows[0]?.is_connected) {
      await client.query(
        `INSERT INTO quickbooks_request_queue (operation, entity_type, medsys_id, status, priority, created_at)
         VALUES ('push', 'payment', $1, 'pending', 5, CURRENT_TIMESTAMP)`,
        [paymentResult.rows[0].id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      status: newStatus,
      amount_settled: payAmount,
      balance_remaining: total - newPaid,
      message: newStatus === 'paid'
        ? `Invoice fully settled by ${inv.payer_type} payer.`
        : `Partial ${inv.payer_type} settlement of GHS ${payAmount.toFixed(2)} recorded. GHS ${(total - newPaid).toFixed(2)} still outstanding.`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Settle payer invoice error:', error);
    res.status(500).json({ error: 'Failed to record settlement' });
  } finally {
    client.release();
  }
};

// List completed encounters billed to a corporate/insurance payer whose invoice
// hasn't been submitted yet — lets the accountant catch encounters front desk
// missed and submit them after the fact.
export const getUnbilledPayerInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount, i.amount_paid, i.status,
             (i.total_amount - COALESCE(i.amount_paid, 0)) as balance,
             p.patient_number,
             u.first_name || ' ' || u.last_name as patient_name,
             e.encounter_number, e.encounter_date, e.status as encounter_status,
             pp.payer_type,
             pp.corporate_client_name,
             pp.insurance_provider_name
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN encounters e ON i.encounter_id = e.id
      JOIN LATERAL (
        SELECT pps.payer_type,
               cc.name as corporate_client_name,
               ip.name as insurance_provider_name
        FROM patient_payer_sources pps
        LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
        LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
        WHERE pps.patient_id = i.patient_id
        ORDER BY pps.is_primary DESC, pps.id ASC
        LIMIT 1
      ) pp ON true
      WHERE pp.payer_type IN ('corporate', 'insurance')
        AND i.payer_submitted_at IS NULL
        AND i.status IN ('pending', 'partial')
        AND i.total_amount > 0
      ORDER BY i.invoice_date ASC, i.id ASC
    `);

    res.json({ invoices: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get unbilled payer invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch unbilled payer invoices' });
  }
};

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

// Consolidated statement: ALL of a patient's outstanding (pending/partial)
// invoices with their line items and a single grand total. Lets reception show
// / print one past-due statement instead of opening and tallying each invoice.
// The underlying per-visit invoices are left intact (nothing is merged).
export const getPatientStatement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;

    const patientResult = await pool.query(
      `SELECT p.patient_number,
              u.first_name || ' ' || u.last_name AS patient_name,
              u.email AS patient_email, u.phone AS patient_phone,
              p.address AS patient_address, p.city AS patient_city, p.state AS patient_state
       FROM patients p JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [patient_id]
    );
    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const invoicesResult = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.status,
              i.subtotal, i.tax, i.total_amount, i.amount_paid,
              e.encounter_date, e.chief_complaint
       FROM invoices i
       LEFT JOIN encounters e ON i.encounter_id = e.id
       WHERE i.patient_id = $1 AND i.status IN ('pending', 'partial')
       ORDER BY i.invoice_date ASC, i.id ASC`,
      [patient_id]
    );

    const invoiceIds = invoicesResult.rows.map((r) => r.id);
    const itemsByInvoice: Record<number, any[]> = {};
    if (invoiceIds.length > 0) {
      const itemsResult = await pool.query(
        `SELECT id, invoice_id, description, quantity, unit_price, total_price, category
           FROM invoice_items WHERE invoice_id = ANY($1)
          ORDER BY invoice_id ASC, id ASC`,
        [invoiceIds]
      );
      for (const it of itemsResult.rows) {
        (itemsByInvoice[it.invoice_id] ||= []).push(it);
      }
    }

    const invoices = invoicesResult.rows.map((inv) => ({
      ...inv,
      items: itemsByInvoice[inv.id] || [],
    }));

    const grandTotal = invoices.reduce(
      (sum, inv) => sum + (parseFloat(inv.total_amount || 0) - parseFloat(inv.amount_paid || 0)),
      0
    );

    res.json({
      patient: patientResult.rows[0],
      invoices,
      grand_total: Math.round(grandTotal * 100) / 100,
      count: invoices.length,
    });
  } catch (error) {
    console.error('Get patient statement error:', error);
    res.status(500).json({ error: 'Failed to fetch patient statement' });
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
       FROM encounters e
       JOIN invoices i ON i.id = COALESCE(
         e.invoice_id,
         (SELECT iv.id FROM invoices iv WHERE iv.encounter_id = e.id ORDER BY iv.id LIMIT 1)
       )
       JOIN patients p ON i.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE e.id = $1`,
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

    // Check if an invoice already exists for this encounter — resolving the
    // (possibly shared) invoice via the encounter's link, so a second same-day
    // encounter reuses the shared invoice instead of creating another.
    let invoiceResult = await client.query(
      `SELECT i.* FROM encounters e
         JOIN invoices i ON i.id = COALESCE(
           e.invoice_id,
           (SELECT iv.id FROM invoices iv WHERE iv.encounter_id = e.id ORDER BY iv.id LIMIT 1)
         )
        WHERE e.id = $1`,
      [encounter_id]
    );

    let invoice_id;

    if (invoiceResult.rows.length > 0) {
      // Invoice exists, return it
      invoice_id = invoiceResult.rows[0].id;
    } else {
      // Create new invoice
      // Generate invoice number
      const invoice_number = await nextInvoiceNumber(client);

      // Calculate totals from items
      const subtotal = items.reduce((sum: number, item: any) => sum + parseFloat(item.total), 0);
      const tax = 0; // No tax for now
      const total = subtotal + tax;

      invoiceResult = await client.query(
        `INSERT INTO invoices (
          patient_id, encounter_id, invoice_number, invoice_date,
          subtotal, tax, total_amount, status
        ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 'pending')
        RETURNING *`,
        [patient_id, encounter_id, invoice_number, subtotal, tax, total]
      );

      invoice_id = invoiceResult.rows[0].id;

      // Link the encounter to its new invoice for shared-invoice resolution.
      await client.query(`UPDATE encounters SET invoice_id = $1 WHERE id = $2`, [invoice_id, encounter_id]);

      // Insert invoice items
      for (const item of items) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price)
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
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, amount_paid, notes, payment_method } = req.body;
    const userId = (req as any).user?.id;

    await client.query('BEGIN');

    // Get current invoice state — lock the row so two concurrent checkouts
    // can't both read amount_paid=0 and each record the full payment (duplicate
    // collection + ledger drift).
    const currentInvoice = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (currentInvoice.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const invoice = currentInvoice.rows[0];
    const total = parseFloat(invoice.total_amount || 0);
    const currentAmountPaid = parseFloat(invoice.amount_paid || 0);

    // Default: honor an explicit status change (e.g. cancel) when no payment.
    let newAmountPaid = currentAmountPaid;
    let derivedStatus = status ?? invoice.status;

    if (amount_paid !== undefined && amount_paid !== null) {
      newAmountPaid = parseFloat(amount_paid);
      if (!Number.isFinite(newAmountPaid) || newAmountPaid < 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Invalid payment amount.' });
        return;
      }
      // Reject overpayment rather than writing a negative balance / phantom credit.
      if (newAmountPaid > total) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `Payment (GHS ${newAmountPaid.toFixed(2)}) exceeds the invoice total (GHS ${total.toFixed(2)}).` });
        return;
      }
      // Derive status from the amounts — never trust the client's status on a
      // payment (previously an invoice could be marked 'paid' while underpaid).
      derivedStatus = newAmountPaid >= total && total > 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'pending';
    }

    const paymentAmount = newAmountPaid - currentAmountPaid;

    // Update the invoice
    const result = await client.query(
      `UPDATE invoices
       SET status = $1,
           amount_paid = $2,
           notes = COALESCE($3, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [derivedStatus, newAmountPaid, notes, id]
    );

    // If a payment is being made (amount_paid is increasing), create a payment record
    if (paymentAmount > 0) {
      const paymentResult = await client.query(
        `INSERT INTO payments (invoice_id, payment_date, amount, payment_method, notes, created_by, created_at)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         RETURNING id`,
        [id, paymentAmount, payment_method || 'cash', 'Payment at checkout', userId]
      );

      console.log(`Payment recorded: ${paymentAmount} for invoice ${id} (method: ${payment_method || 'cash'})`);

      // Send receipt email to patient
      try {
        const patientInfo = await client.query(
          `SELECT u.email, u.first_name || ' ' || u.last_name as patient_name,
                  i.invoice_number, i.total_amount, i.amount_paid
           FROM invoices i
           JOIN patients p ON i.patient_id = p.id
           JOIN users u ON p.user_id = u.id
           WHERE i.id = $1`,
          [id]
        );

        if (patientInfo.rows.length > 0) {
          const patient = patientInfo.rows[0];
          const invoiceTotal = parseFloat(patient.total_amount || 0);
          const totalPaid = parseFloat(patient.amount_paid || 0);
          const balanceRemaining = invoiceTotal - totalPaid;

          if (patient.email && validateEmail(patient.email)) {
            await sendReceiptEmail(
              patient.email,
              patient.patient_name,
              paymentAmount,
              payment_method || 'cash',
              patient.invoice_number,
              invoiceTotal,
              balanceRemaining,
              paymentResult.rows[0].id
            );
            console.log(`Receipt email sent to ${patient.email}`);
          } else {
            console.log(`Skipping receipt email - no valid email for patient`);
          }
        }
      } catch (emailError) {
        // Don't fail the payment if email fails
        console.error('Failed to send receipt email:', emailError);
      }

      // Queue payment to QuickBooks
      const qbConfig = await client.query('SELECT is_connected FROM quickbooks_config WHERE id = 1');
      if (qbConfig.rows[0]?.is_connected) {
        await client.query(
          `INSERT INTO quickbooks_request_queue (operation, entity_type, medsys_id, status, priority, created_at)
           VALUES ('push', 'payment', $1, 'pending', 5, CURRENT_TIMESTAMP)`,
          [paymentResult.rows[0].id]
        );
        console.log(`Payment ${paymentResult.rows[0].id} queued for QuickBooks sync`);
      }
    }

    // Queue invoice update to QuickBooks (for status change)
    const qbConfig = await client.query('SELECT is_connected FROM quickbooks_config WHERE id = 1');
    if (qbConfig.rows[0]?.is_connected && status) {
      // Check if invoice is already synced to QB
      const syncMap = await client.query(
        `SELECT quickbooks_id FROM quickbooks_sync_map
         WHERE entity_type = 'invoice' AND medsys_id = $1`,
        [id]
      );

      if (syncMap.rows.length > 0) {
        // Invoice exists in QB, queue an update
        await client.query(
          `INSERT INTO quickbooks_request_queue (operation, entity_type, medsys_id, status, priority, created_at)
           VALUES ('update', 'invoice', $1, 'pending', 5, CURRENT_TIMESTAMP)
           ON CONFLICT DO NOTHING`,
          [id]
        );
        console.log(`Invoice ${id} update queued for QuickBooks sync`);
      }
    }

    await client.query('COMMIT');

    // Auto-checkout if the invoice is now fully paid (helps post-paid patients)
    const updatedInvoice = result.rows[0];
    let autoCheckedOut = false;
    if (updatedInvoice.status === 'paid') {
      const autoResult = await autoCheckoutIfFullyPaid(
        parseInt(id as string),
        userId
      );
      autoCheckedOut = autoResult.didCheckout;
    }

    res.json({
      message: autoCheckedOut
        ? 'Invoice updated — patient auto-checked out'
        : 'Invoice updated successfully',
      invoice: updatedInvoice,
      auto_checkout: autoCheckedOut,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update invoice error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  } finally {
    client.release();
  }
};

// Get pending payments (miscellaneous_pending invoices)
export const getPendingPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date, aging_bucket, search } = req.query;

    let dateFilter = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (start_date && end_date) {
      dateFilter = `AND i.invoice_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(start_date, end_date);
      paramIndex += 2;
    }

    let agingFilter = '';
    if (aging_bucket && aging_bucket !== 'all') {
      switch (aging_bucket) {
        case '0-30':
          agingFilter = "AND (CURRENT_DATE - i.invoice_date::date) <= 30";
          break;
        case '31-60':
          agingFilter = "AND (CURRENT_DATE - i.invoice_date::date) BETWEEN 31 AND 60";
          break;
        case '61-90':
          agingFilter = "AND (CURRENT_DATE - i.invoice_date::date) BETWEEN 61 AND 90";
          break;
        case '90+':
          agingFilter = "AND (CURRENT_DATE - i.invoice_date::date) > 90";
          break;
      }
    }

    let searchFilter = '';
    if (search) {
      searchFilter = `AND (
        LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${paramIndex})
        OR LOWER(i.invoice_number) LIKE LOWER($${paramIndex})
        OR LOWER(p.patient_number) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const query = `
      SELECT
        i.id,
        i.invoice_number,
        i.invoice_date,
        i.total_amount,
        COALESCE(i.amount_paid, 0) as amount_paid,
        (i.total_amount - COALESCE(i.amount_paid, 0)) as balance,
        (CURRENT_DATE - i.invoice_date::date) as days_outstanding,
        i.last_reminder_sent,
        COALESCE(i.reminder_count, 0) as reminder_count,
        p.id as patient_id,
        p.patient_number,
        u.first_name || ' ' || u.last_name as patient_name,
        u.email as patient_email,
        u.phone as patient_phone
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      JOIN invoice_payer_sources ips ON i.id = ips.invoice_id
      WHERE ips.payer_type = 'miscellaneous_pending'
        AND ips.is_primary = true
        AND i.status != 'paid'
        ${dateFilter}
        ${agingFilter}
        ${searchFilter}
      ORDER BY i.invoice_date DESC
      LIMIT 100
    `;

    const result = await pool.query(query, params);

    // Get summary
    const summaryQuery = `
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(i.total_amount - COALESCE(i.amount_paid, 0)), 0) as total_balance,
        COUNT(*) FILTER (WHERE (CURRENT_DATE - i.invoice_date::date) <= 30) as bucket_0_30,
        COUNT(*) FILTER (WHERE (CURRENT_DATE - i.invoice_date::date) BETWEEN 31 AND 60) as bucket_31_60,
        COUNT(*) FILTER (WHERE (CURRENT_DATE - i.invoice_date::date) BETWEEN 61 AND 90) as bucket_61_90,
        COUNT(*) FILTER (WHERE (CURRENT_DATE - i.invoice_date::date) > 90) as bucket_90_plus
      FROM invoices i
      JOIN invoice_payer_sources ips ON i.id = ips.invoice_id
      WHERE ips.payer_type = 'miscellaneous_pending'
        AND ips.is_primary = true
        AND i.status != 'paid'
    `;

    const summaryResult = await pool.query(summaryQuery);

    res.json({
      invoices: result.rows,
      summary: summaryResult.rows[0],
    });
  } catch (error) {
    console.error('Get pending payments error:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
};

// Defer payment - mark as miscellaneous pending and complete encounter
export const deferPayment = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { encounter_id } = req.body;

    await client.query('BEGIN');

    // Get the invoice to find patient_id
    const invoiceResult = await client.query(
      'SELECT patient_id FROM invoices WHERE id = $1',
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const patientId = invoiceResult.rows[0].patient_id;

    // Update or create payer source to miscellaneous_pending
    await client.query(
      `INSERT INTO invoice_payer_sources (invoice_id, patient_id, payer_type, is_primary, created_at)
       VALUES ($1, $2, 'miscellaneous_pending', true, CURRENT_TIMESTAMP)
       ON CONFLICT (invoice_id, payer_type)
       DO UPDATE SET is_primary = true, updated_at = CURRENT_TIMESTAMP`,
      [id, patientId]
    );

    // Remove self_pay as primary if exists
    await client.query(
      `UPDATE invoice_payer_sources
       SET is_primary = false
       WHERE invoice_id = $1 AND payer_type = 'self_pay'`,
      [id]
    );

    // Complete the encounter if provided
    if (encounter_id) {
      // Get the encounter's room_id first
      const encResult = await client.query(
        'SELECT room_id FROM encounters WHERE id = $1',
        [encounter_id]
      );
      const roomId = encResult.rows[0]?.room_id;

      await client.query(
        `UPDATE encounters
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [encounter_id]
      );

      // Release the room if one was assigned
      if (roomId) {
        await client.query(
          `UPDATE rooms
           SET is_available = true,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [roomId]
        );
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'Payment deferred successfully',
      success: true,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Defer payment error:', error);
    res.status(500).json({ error: 'Failed to defer payment' });
  } finally {
    client.release();
  }
};

// Create a special (standalone) invoice — not tied to an encounter
export const createSpecialInvoice = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { patient_id, client_name, notes, items } = req.body;

    if (!items || items.length === 0) {
      res.status(400).json({ error: 'At least one invoice item is required' });
      return;
    }

    await client.query('BEGIN');

    // Generate invoice number
    const invoice_number = await nextInvoiceNumber(client, 'SPL');

    // Calculate totals
    const subtotal = items.reduce((sum: number, item: any) => sum + parseFloat(item.total), 0);

    const invoiceResult = await client.query(
      `INSERT INTO invoices (
        patient_id, encounter_id, invoice_number, invoice_date,
        subtotal, tax, total_amount, status, notes
      ) VALUES ($1, NULL, $2, CURRENT_DATE, $3, 0, $3, 'pending', $4)
      RETURNING *`,
      [patient_id || null, invoice_number, subtotal, [client_name ? `Client: ${client_name}` : '', notes].filter(Boolean).join(' | ') || null]
    );

    const invoice = invoiceResult.rows[0];

    // Insert invoice items
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category)
         VALUES ($1, $2, $3, $4, $5, 'special')`,
        [invoice.id, item.description, item.quantity, item.unit_price, item.total]
      );
    }

    await client.query('COMMIT');

    // Fetch complete data with patient info if linked
    let patient_name = null;
    if (patient_id) {
      const patientResult = await pool.query(
        `SELECT u.first_name || ' ' || u.last_name as patient_name
         FROM patients p JOIN users u ON p.user_id = u.id
         WHERE p.id = $1`,
        [patient_id]
      );
      if (patientResult.rows.length > 0) {
        patient_name = patientResult.rows[0].patient_name;
      }
    }

    const itemsResult = await pool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1`,
      [invoice.id]
    );

    res.status(201).json({
      message: 'Special invoice created successfully',
      invoice: {
        ...invoice,
        patient_name,
        client_name: client_name || null,
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create special invoice error:', error);
    res.status(500).json({ error: 'Failed to create special invoice' });
  } finally {
    client.release();
  }
};
