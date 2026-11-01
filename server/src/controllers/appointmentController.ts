import { Request, Response } from 'express';
import pool from '../database/db';
import { buildSafeUpdateClause } from '../utils/sqlSecurity';

type HomeFields = {
  location_type: 'clinic' | 'home';
  visit_address: string | null;
  visit_gps_address: string | null;
  visit_landmark: string | null;
  visit_contact_phone: string | null;
  nurse_id: number | null;
};

/**
 * Where the appointment happens. A home visit needs somewhere to go: an
 * address or a Ghana GPS code (e.g. GA-123-4567).
 */
const homeVisitFields = (body: any): HomeFields | { error: string } => {
  const text = (v: unknown, max: number) => {
    const t = typeof v === 'string' ? v.trim().slice(0, max) : '';
    return t || null;
  };
  if (body?.location_type !== 'home') {
    return { location_type: 'clinic', visit_address: null, visit_gps_address: null, visit_landmark: null, visit_contact_phone: null, nurse_id: null };
  }
  const fields: HomeFields = {
    location_type: 'home',
    visit_address: text(body.visit_address, 500),
    visit_gps_address: text(body.visit_gps_address, 100)?.toUpperCase() ?? null,
    visit_landmark: text(body.visit_landmark, 500),
    visit_contact_phone: text(body.visit_contact_phone, 30),
    nurse_id: Number.isInteger(body.nurse_id) && body.nurse_id > 0 ? body.nurse_id : null,
  };
  if (!fields.visit_address && !fields.visit_gps_address) {
    return { error: 'A home visit needs an address or a GPS address' };
  }
  return fields;
};

/** Booking staff confirmed the address with the patient: keep it on the record. */
const saveAddressToPatient = async (patientId: number, home: HomeFields): Promise<void> => {
  await pool.query(
    `UPDATE patients
        SET address = COALESCE($2, address),
            gps_address = COALESCE($3, gps_address),
            landmark = COALESCE($4, landmark),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [patientId, home.visit_address, home.visit_gps_address, home.visit_landmark]
  );
};

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
    const home = homeVisitFields(req.body);
    if ('error' in home) {
      res.status(400).json({ error: home.error });
      return;
    }

    const slotDuration = duration_minutes || (home.location_type === 'home' ? 60 : 30);
    const appointmentStart = new Date(appointment_date);
    const appointmentEnd = new Date(appointmentStart.getTime() + slotDuration * 60 * 1000);

    // Check for double-booking - ensure doctor doesn't have overlapping appointments
    const conflictCheck = await pool.query(
      `SELECT a.id, a.appointment_date, a.duration_minutes,
              COALESCE(u.first_name || ' ' || u.last_name, a.patient_name) as patient_name
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE a.provider_id = $1
         AND a.status NOT IN ('cancelled', 'no-show')
         AND (
           (a.appointment_date <= $2 AND a.appointment_date + (a.duration_minutes || ' minutes')::interval > $2)
           OR (a.appointment_date < $3 AND a.appointment_date + (a.duration_minutes || ' minutes')::interval > $2)
           OR (a.appointment_date >= $2 AND a.appointment_date < $3)
         )`,
      [provider_id, appointmentStart, appointmentEnd]
    );

    if (conflictCheck.rows.length > 0) {
      const conflict = conflictCheck.rows[0];
      const conflictTime = new Date(conflict.appointment_date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      res.status(409).json({
        error: 'Double booking conflict',
        message: `This doctor already has an appointment at ${conflictTime} with ${conflict.patient_name || 'another patient'}. Please select a different time slot.`,
        conflictingAppointment: conflict
      });
      return;
    }

    // Allow booking without patient_id (for new patients not yet registered)
    const result = await pool.query(
      `INSERT INTO appointments (
        patient_id, patient_name, provider_id, appointment_date, duration_minutes,
        appointment_type, reason, notes, created_by,
        location_type, visit_address, visit_gps_address, visit_landmark, visit_contact_phone, nurse_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        patient_id || null,
        patient_name || null,
        provider_id,
        appointment_date,
        slotDuration,
        home.location_type === 'home' ? 'home-visit' : appointment_type,
        reason,
        notes,
        created_by,
        home.location_type,
        home.visit_address,
        home.visit_gps_address,
        home.visit_landmark,
        home.visit_contact_phone,
        home.nurse_id,
      ]
    );

    if (home.location_type === 'home' && patient_id && req.body.save_to_patient === true) {
      await saveAddressToPatient(patient_id, home);
    }

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
    const { provider_id, status, from_date, to_date, future, limit = 100, offset = 0 } = req.query;
    // A patient caller is pinned to their own record (set by enforcePatientOwnership).
    const patient_id = (req as any).ownPatientId ?? req.query.patient_id;

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

    // Filter for future appointments (after current time)
    if (future === 'true') {
      query += ` AND a.appointment_date > NOW() AND a.status NOT IN ('completed', 'cancelled', 'no-show', 'checked-in')`;
    }

    if (from_date) {
      query += ` AND DATE(a.appointment_date) >= $${paramCount}::date`;
      params.push(from_date);
      paramCount++;
    }

    if (to_date) {
      query += ` AND DATE(a.appointment_date) <= $${paramCount}::date`;
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

    // Use field whitelisting to prevent SQL injection
    const { setClause, values } = buildSafeUpdateClause('appointments', updateData, 2);

    const result = await pool.query(
      `UPDATE appointments SET ${setClause}, updated_at = CURRENT_TIMESTAMP
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

export const markNoShow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE appointments
       SET status = 'no-show', notes = COALESCE(notes || E'\n', '') || 'Marked as no-show', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json({
      message: 'Appointment marked as no-show',
      appointment: result.rows[0],
    });
  } catch (error) {
    console.error('Mark no-show error:', error);
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
