import { Request, Response } from 'express';
import pool from '../database/db';

// Database migration needed for PCP fields:
// ALTER TABLE patients ADD COLUMN pcp_name VARCHAR(255);
// ALTER TABLE patients ADD COLUMN pcp_phone VARCHAR(20);

export const createPatient = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      date_of_birth,
      gender,
      allergies,
      address,
      city,
      state,
      region,
      nationality,
      gps_address,
      preferred_clinic,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relationship,
      insurance_provider,
      insurance_number,
      marital_status,
      occupation,
      payer_sources, // New field: array of payer sources
      pcp_name, // Primary Care Physician name
      pcp_phone, // Primary Care Physician phone
      // Health status fields
      hiv_status,
      hepatitis_b_status,
      hepatitis_c_status,
      tb_status,
      sickle_cell_status,
      other_health_conditions,
    } = req.body;

    // Check for duplicate patient (same first name, last name, and date of birth)
    const duplicateCheck = await client.query(
      `SELECT p.id, p.patient_number, u.first_name, u.last_name
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE LOWER(u.first_name) = LOWER($1)
         AND LOWER(u.last_name) = LOWER($2)
         AND p.date_of_birth = $3`,
      [first_name, last_name, date_of_birth]
    );

    if (duplicateCheck.rows.length > 0) {
      const existingPatient = duplicateCheck.rows[0];
      res.status(409).json({
        error: 'Duplicate patient',
        message: `A patient with the same name and date of birth already exists (Patient #${existingPatient.patient_number}: ${existingPatient.first_name} ${existingPatient.last_name}). Please search for the existing patient to check them in.`,
        existingPatientId: existingPatient.id,
        existingPatientNumber: existingPatient.patient_number
      });
      client.release();
      return;
    }

    await client.query('BEGIN');

    // Generate patient number
    const countResult = await client.query('SELECT COUNT(*) FROM patients');
    const patientCount = parseInt(countResult.rows[0].count) + 1;
    const patient_number = `P${String(patientCount).padStart(6, '0')}`;

    // Create user account for patient (always - even if no email provided)
    // If no email provided, generate a dummy email to satisfy unique constraint
    const patientEmail = email || `${patient_number}@noemail.medsys.local`;
    const defaultPassword = 'ChangeMe123!'; // Patient should change this on first login
    const bcrypt = require('bcrypt');
    const password_hash = await bcrypt.hash(defaultPassword, 10);

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, 'patient', $3, $4, $5)
       RETURNING id`,
      [patientEmail, password_hash, first_name, last_name, phone]
    );
    const user_id = userResult.rows[0].id;

    // Create patient record
    const result = await client.query(
      `INSERT INTO patients (
        user_id, patient_number, date_of_birth, gender, allergies, address, city, state,
        region, nationality, gps_address, preferred_clinic,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        insurance_provider, insurance_number, marital_status, occupation, pcp_name, pcp_phone,
        hiv_status, hepatitis_b_status, hepatitis_c_status, tb_status, sickle_cell_status, other_health_conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING *`,
      [
        user_id,
        patient_number,
        date_of_birth,
        gender,
        allergies,
        address,
        city,
        state,
        region || null,
        nationality || null,
        gps_address || null,
        preferred_clinic || null,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        insurance_provider,
        insurance_number,
        marital_status,
        occupation,
        pcp_name || null,
        pcp_phone || null,
        hiv_status || null,
        hepatitis_b_status || null,
        hepatitis_c_status || null,
        tb_status || null,
        sickle_cell_status || null,
        other_health_conditions || null,
      ]
    );

    const patient_id = result.rows[0].id;

    // Insert payer sources if provided
    if (payer_sources && Array.isArray(payer_sources) && payer_sources.length > 0) {
      for (let i = 0; i < payer_sources.length; i++) {
        const payer = payer_sources[i];
        const is_primary = i === 0; // First payer source is primary

        await client.query(
          `INSERT INTO patient_payer_sources (
            patient_id, payer_type, corporate_client_id, insurance_provider_id, is_primary
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            patient_id,
            payer.payer_type,
            payer.corporate_client_id || null,
            payer.insurance_provider_id || null,
            is_primary,
          ]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Patient created successfully',
      patient: result.rows[0],
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create patient error:', error);

    // Handle specific database errors
    if (error.code === '23505') {
      // Unique constraint violation
      if (error.constraint === 'users_email_key') {
        res.status(409).json({
          error: 'Email already registered',
          message: 'A patient with this email address already exists in the system. Please use a different email or search for the existing patient to check them in.'
        });
        return;
      }
      res.status(409).json({
        error: 'Duplicate entry',
        message: 'This patient record already exists in the system.'
      });
      return;
    }

    if (error.code === '23502') {
      // Not null constraint violation
      res.status(400).json({
        error: 'Missing required field',
        message: 'Please fill in all required fields.'
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to register patient',
      message: 'An unexpected error occurred. Please try again or contact support if the problem persists.'
    });
  } finally {
    client.release();
  }
};

export const getPatients = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT p.*, u.email, u.first_name, u.last_name, u.phone,
             p.pcp_name, p.pcp_phone
      FROM patients p
      LEFT JOIN users u ON p.user_id = u.id
    `;
    const params: any[] = [];

    if (search) {
      query += ` WHERE p.patient_number ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      patients: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPatientById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.*, u.email, u.first_name, u.last_name, u.phone,
              p.pcp_name, p.pcp_phone
       FROM patients p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    res.json({ patient: result.rows[0] });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePatient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE patients SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    res.json({
      message: 'Patient updated successfully',
      patient: result.rows[0],
    });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPatientSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get patient info
    const patientResult = await pool.query(
      `SELECT p.*, u.email, u.first_name, u.last_name, u.phone
       FROM patients p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    // Get recent encounters
    const encountersResult = await pool.query(
      `SELECT e.*, u.first_name || ' ' || u.last_name as provider_name
       FROM encounters e
       LEFT JOIN users u ON e.provider_id = u.id
       WHERE e.patient_id = $1
       ORDER BY e.encounter_date DESC
       LIMIT 5`,
      [id]
    );

    // Get active medications
    const medicationsResult = await pool.query(
      `SELECT * FROM medications
       WHERE patient_id = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [id]
    );

    // Get allergies
    const allergiesResult = await pool.query(
      `SELECT * FROM allergies
       WHERE patient_id = $1
       ORDER BY severity DESC, created_at DESC`,
      [id]
    );

    // Get upcoming appointments
    const appointmentsResult = await pool.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as provider_name
       FROM appointments a
       LEFT JOIN users u ON a.provider_id = u.id
       WHERE a.patient_id = $1 AND a.appointment_date > CURRENT_TIMESTAMP
       ORDER BY a.appointment_date ASC
       LIMIT 5`,
      [id]
    );

    res.json({
      patient: patientResult.rows[0],
      recent_encounters: encountersResult.rows,
      active_medications: medicationsResult.rows,
      allergies: allergiesResult.rows,
      upcoming_appointments: appointmentsResult.rows,
    });
  } catch (error) {
    console.error('Get patient summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
