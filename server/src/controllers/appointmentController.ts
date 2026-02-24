import { Request, Response } from 'express';
import pool from '../database/db';

export const createAppointment = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const created_by = authReq.user?.id;

    const {
      patient_id,
      patient_name,
      provider_id,
      appointment_date,
      duration_minutes,
      appointment_type,
      reason,
      notes,
    } = req.body;

    // Allow booking without patient_id (for new patients not yet registered)
    const result = await pool.query(
      `INSERT INTO appointments (
        patient_id, patient_name, provider_id, appointment_date, duration_minutes,
        appointment_type, reason, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        patient_id || null,
        patient_name || null,
        provider_id,
        appointment_date,
        duration_minutes || 30,
        appointment_type,
        reason,
        notes,
        created_by,
      ]
    );

    res.status(201).json({
      message: 'Appointment created successfully',
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAppointments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, provider_id, status, from_date, to_date, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT a.*,
        p.patient_number,
        COALESCE(u1.first_name || ' ' || u1.last_name, a.patient_name) as patient_name,
        u2.first_name || ' ' || u2.last_name as provider_name
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN users u1 ON p.user_id = u1.id
      LEFT JOIN users u2 ON a.provider_id = u2.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND a.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (provider_id) {
      query += ` AND a.provider_id = $${paramCount}`;
      params.push(provider_id);
      paramCount++;
    }

    if (status) {
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (from_date) {
      query += ` AND a.appointment_date >= $${paramCount}`;
      params.push(from_date);
      paramCount++;
    }

    if (to_date) {
      query += ` AND a.appointment_date <= $${paramCount}`;
      params.push(to_date);
      paramCount++;
    }

    query += ` ORDER BY a.appointment_date ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      appointments: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAppointment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE appointments SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json({
      message: 'Appointment updated successfully',
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const cancelAppointment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE appointments
       SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, `Cancelled: ${reason || 'No reason provided'}`]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json({
      message: 'Appointment cancelled successfully',
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTodayAppointments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider_id } = req.query;

    let query = `
      SELECT a.*,
        p.patient_number,
        COALESCE(u1.first_name || ' ' || u1.last_name, a.patient_name) as patient_name,
        u1.phone as patient_phone,
        u2.first_name || ' ' || u2.last_name as provider_name
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN users u1 ON p.user_id = u1.id
      LEFT JOIN users u2 ON a.provider_id = u2.id
      WHERE DATE(a.appointment_date) = CURRENT_DATE
    `;

    const params: any[] = [];

    if (provider_id) {
      query += ` AND a.provider_id = $1`;
      params.push(provider_id);
    }

    query += ` ORDER BY a.appointment_date ASC`;

    const result = await pool.query(query, params);

    res.json({
      appointments: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get today appointments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
