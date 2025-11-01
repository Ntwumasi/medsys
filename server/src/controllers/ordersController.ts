import { Request, Response } from 'express';
import pool from '../database/db';

// Lab Orders
export const createLabOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const ordering_provider = authReq.user?.id;

    const { patient_id, encounter_id, test_name, test_code, priority, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO lab_orders (
        patient_id, encounter_id, ordering_provider, test_name, test_code, priority, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [patient_id, encounter_id, ordering_provider, test_name, test_code, priority || 'routine', notes]
    );

    // Update billing
    await pool.query(
      `UPDATE invoices
       SET subtotal = subtotal + 75.00,
           total_amount = total_amount + 75.00
       WHERE encounter_id = $1`,
      [encounter_id]
    );

    res.status(201).json({
      message: 'Lab order created successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Create lab order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLabOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, status } = req.query;

    let query = `
      SELECT lo.*,
        u.first_name || ' ' || u.last_name as ordering_provider_name,
        e.encounter_number
      FROM lab_orders lo
      LEFT JOIN users u ON lo.ordering_provider = u.id
      LEFT JOIN encounters e ON lo.encounter_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND lo.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (encounter_id) {
      query += ` AND lo.encounter_id = $${paramCount}`;
      params.push(encounter_id);
      paramCount++;
    }

    if (status) {
      query += ` AND lo.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY lo.ordered_date DESC`;

    const result = await pool.query(query, params);

    res.json({
      lab_orders: result.rows,
    });
  } catch (error) {
    console.error('Get lab orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLabOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE lab_orders SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lab order not found' });
      return;
    }

    res.json({
      message: 'Lab order updated successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Update lab order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Imaging Orders
export const createImagingOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const ordering_provider = authReq.user?.id;

    const { patient_id, encounter_id, imaging_type, body_part, priority, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO imaging_orders (
        patient_id, encounter_id, ordering_provider, imaging_type, body_part, priority, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [patient_id, encounter_id, ordering_provider, imaging_type, body_part, priority || 'routine', notes]
    );

    // Update billing
    await pool.query(
      `UPDATE invoices
       SET subtotal = subtotal + 150.00,
           total_amount = total_amount + 150.00
       WHERE encounter_id = $1`,
      [encounter_id]
    );

    res.status(201).json({
      message: 'Imaging order created successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Create imaging order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getImagingOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, status } = req.query;

    let query = `
      SELECT io.*,
        u.first_name || ' ' || u.last_name as ordering_provider_name,
        e.encounter_number
      FROM imaging_orders io
      LEFT JOIN users u ON io.ordering_provider = u.id
      LEFT JOIN encounters e ON io.encounter_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND io.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (encounter_id) {
      query += ` AND io.encounter_id = $${paramCount}`;
      params.push(encounter_id);
      paramCount++;
    }

    if (status) {
      query += ` AND io.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY io.ordered_date DESC`;

    const result = await pool.query(query, params);

    res.json({
      imaging_orders: result.rows,
    });
  } catch (error) {
    console.error('Get imaging orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateImagingOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE imaging_orders SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Imaging order not found' });
      return;
    }

    res.json({
      message: 'Imaging order updated successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Update imaging order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Pharmacy Orders
export const createPharmacyOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const ordering_provider = authReq.user?.id;

    const {
      patient_id,
      encounter_id,
      medication_name,
      dosage,
      frequency,
      route,
      quantity,
      refills,
      priority,
      notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO pharmacy_orders (
        patient_id, encounter_id, ordering_provider, medication_name,
        dosage, frequency, route, quantity, refills, priority, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        patient_id,
        encounter_id,
        ordering_provider,
        medication_name,
        dosage,
        frequency,
        route,
        quantity,
        refills || 0,
        priority || 'routine',
        notes,
      ]
    );

    // Update billing
    await pool.query(
      `UPDATE invoices
       SET subtotal = subtotal + 25.00,
           total_amount = total_amount + 25.00
       WHERE encounter_id = $1`,
      [encounter_id]
    );

    res.status(201).json({
      message: 'Pharmacy order created successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Create pharmacy order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPharmacyOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, status } = req.query;

    let query = `
      SELECT po.*,
        u.first_name || ' ' || u.last_name as ordering_provider_name,
        e.encounter_number
      FROM pharmacy_orders po
      LEFT JOIN users u ON po.ordering_provider = u.id
      LEFT JOIN encounters e ON po.encounter_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND po.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (encounter_id) {
      query += ` AND po.encounter_id = $${paramCount}`;
      params.push(encounter_id);
      paramCount++;
    }

    if (status) {
      query += ` AND po.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY po.ordered_date DESC`;

    const result = await pool.query(query, params);

    res.json({
      pharmacy_orders: result.rows,
    });
  } catch (error) {
    console.error('Get pharmacy orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePharmacyOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE pharmacy_orders SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Pharmacy order not found' });
      return;
    }

    res.json({
      message: 'Pharmacy order updated successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Update pharmacy order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all orders for an encounter
export const getAllEncounterOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const [labOrders, imagingOrders, pharmacyOrders] = await Promise.all([
      pool.query(
        `SELECT lo.*, u.first_name || ' ' || u.last_name as ordering_provider_name
         FROM lab_orders lo
         LEFT JOIN users u ON lo.ordering_provider = u.id
         WHERE lo.encounter_id = $1
         ORDER BY lo.ordered_date DESC`,
        [encounter_id]
      ),
      pool.query(
        `SELECT io.*, u.first_name || ' ' || u.last_name as ordering_provider_name
         FROM imaging_orders io
         LEFT JOIN users u ON io.ordering_provider = u.id
         WHERE io.encounter_id = $1
         ORDER BY io.ordered_date DESC`,
        [encounter_id]
      ),
      pool.query(
        `SELECT po.*, u.first_name || ' ' || u.last_name as ordering_provider_name
         FROM pharmacy_orders po
         LEFT JOIN users u ON po.ordering_provider = u.id
         WHERE po.encounter_id = $1
         ORDER BY po.ordered_date DESC`,
        [encounter_id]
      ),
    ]);

    res.json({
      lab_orders: labOrders.rows,
      imaging_orders: imagingOrders.rows,
      pharmacy_orders: pharmacyOrders.rows,
    });
  } catch (error) {
    console.error('Get all encounter orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
