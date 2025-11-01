import { Request, Response } from 'express';
import pool from '../database/db';

// Doctor: Order a nurse procedure
export const orderNurseProcedure = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const authReq = req as any;
    const ordered_by = authReq.user?.id;

    const { encounter_id, patient_id, charge_master_id, procedure_name, notes } = req.body;

    if (!encounter_id || !patient_id || !procedure_name) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    await client.query('BEGIN');

    // Create the procedure order
    const result = await client.query(
      `INSERT INTO nurse_procedures (
        encounter_id, patient_id, charge_master_id, procedure_name,
        ordered_by, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *`,
      [encounter_id, patient_id, charge_master_id, procedure_name, ordered_by, notes]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Nurse procedure ordered successfully',
      procedure: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order nurse procedure error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Nurse: Get procedures for an encounter or all pending procedures
export const getNurseProcedures = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id, status } = req.query;
    const authReq = req as any;
    const nurse_id = authReq.user?.id;

    let query = `
      SELECT np.*,
        p.patient_number,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        e.encounter_number,
        e.room_id,
        r.room_number,
        u_ordered.first_name || ' ' || u_ordered.last_name as ordered_by_name,
        u_performed.first_name || ' ' || u_performed.last_name as performed_by_name,
        cm.price
      FROM nurse_procedures np
      LEFT JOIN patients p ON np.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN encounters e ON np.encounter_id = e.id
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN users u_ordered ON np.ordered_by = u_ordered.id
      LEFT JOIN users u_performed ON np.performed_by = u_performed.id
      LEFT JOIN charge_master cm ON np.charge_master_id = cm.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (encounter_id) {
      params.push(encounter_id);
      query += ` AND np.encounter_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND np.status = $${params.length}`;
    } else {
      // Default: show pending and in-progress
      query += ` AND np.status IN ('pending', 'in_progress')`;
    }

    // Only show procedures for encounters assigned to this nurse
    if (!encounter_id) {
      params.push(nurse_id);
      query += ` AND e.nurse_id = $${params.length}`;
    }

    query += ' ORDER BY np.ordered_at ASC';

    const result = await pool.query(query, params);

    res.json({
      procedures: result.rows,
    });
  } catch (error) {
    console.error('Get nurse procedures error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Start a procedure
export const startNurseProcedure = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const performed_by = authReq.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE nurse_procedures
       SET status = 'in_progress',
           performed_by = $1,
           started_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [performed_by, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Procedure not found' });
      return;
    }

    res.json({
      message: 'Procedure started',
      procedure: result.rows[0],
    });
  } catch (error) {
    console.error('Start nurse procedure error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Complete a procedure and add to invoice
export const completeNurseProcedure = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const authReq = req as any;
    const performed_by = authReq.user?.id;
    const { id } = req.params;
    const { notes } = req.body;

    await client.query('BEGIN');

    // Update procedure status
    const procedureResult = await client.query(
      `UPDATE nurse_procedures
       SET status = 'completed',
           performed_by = $1,
           completed_at = CURRENT_TIMESTAMP,
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [performed_by, notes, id]
    );

    if (procedureResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Procedure not found' });
      return;
    }

    const procedure = procedureResult.rows[0];

    // Get or create invoice for this encounter
    let invoiceResult = await client.query(
      'SELECT * FROM invoices WHERE encounter_id = $1',
      [procedure.encounter_id]
    );

    let invoice;
    if (invoiceResult.rows.length === 0) {
      // Create invoice if doesn't exist
      const countResult = await client.query('SELECT COUNT(*) FROM invoices');
      const invoiceCount = parseInt(countResult.rows[0].count) + 1;
      const invoiceNumber = `INV${String(invoiceCount).padStart(6, '0')}`;

      const newInvoiceResult = await client.query(
        `INSERT INTO invoices (
          patient_id, encounter_id, invoice_number, invoice_date,
          subtotal, tax, total_amount, status
        ) VALUES ($1, $2, $3, CURRENT_DATE, 0, 0, 0, 'pending')
        RETURNING *`,
        [procedure.patient_id, procedure.encounter_id, invoiceNumber]
      );
      invoice = newInvoiceResult.rows[0];
    } else {
      invoice = invoiceResult.rows[0];
    }

    // Get charge details
    const chargeResult = await client.query(
      'SELECT * FROM charge_master WHERE id = $1',
      [procedure.charge_master_id]
    );

    if (chargeResult.rows.length > 0) {
      const charge = chargeResult.rows[0];

      // Add invoice item
      await client.query(
        `INSERT INTO invoice_items (
          invoice_id, charge_master_id, description, quantity, unit_price, total_price
        ) VALUES ($1, $2, $3, 1, $4, $4)`,
        [invoice.id, charge.id, procedure.procedure_name, charge.price]
      );

      // Update invoice totals
      const itemsResult = await client.query(
        'SELECT SUM(total_price) as total FROM invoice_items WHERE invoice_id = $1',
        [invoice.id]
      );

      const newTotal = parseFloat(itemsResult.rows[0].total) || 0;

      await client.query(
        `UPDATE invoices
         SET subtotal = $1, total_amount = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newTotal, invoice.id]
      );

      // Mark procedure as billed
      await client.query(
        'UPDATE nurse_procedures SET billed = true WHERE id = $1',
        [id]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Procedure completed and billed successfully',
      procedure: procedureResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Complete nurse procedure error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Get all available nurse procedures from charge master
export const getAvailableNurseProcedures = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT * FROM charge_master
       WHERE category = 'Nursing Procedures' AND is_active = true
       ORDER BY service_name`
    );

    res.json({
      procedures: result.rows,
    });
  } catch (error) {
    console.error('Get available nurse procedures error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Cancel a procedure
export const cancelNurseProcedure = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE nurse_procedures
       SET status = 'cancelled',
           notes = CASE
             WHEN notes IS NULL THEN $1
             ELSE notes || ' | Cancelled: ' || $1
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reason || 'No reason provided', id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Procedure not found' });
      return;
    }

    res.json({
      message: 'Procedure cancelled',
      procedure: result.rows[0],
    });
  } catch (error) {
    console.error('Cancel nurse procedure error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
