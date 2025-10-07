import { Request, Response } from 'express';
import pool from '../database/db';

export const createEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const provider_id = authReq.user?.id;

    const {
      patient_id,
      encounter_date,
      encounter_type,
      chief_complaint,
      history_of_present_illness,
      vital_signs,
      physical_examination,
      assessment,
      plan,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO encounters (
        patient_id, provider_id, encounter_date, encounter_type, chief_complaint,
        history_of_present_illness, vital_signs, physical_examination, assessment, plan, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'in-progress')
      RETURNING *`,
      [
        patient_id,
        provider_id,
        encounter_date || new Date(),
        encounter_type,
        chief_complaint,
        history_of_present_illness,
        vital_signs,
        physical_examination,
        assessment,
        plan,
      ]
    );

    res.status(201).json({
      message: 'Encounter created successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Create encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEncounters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, provider_id, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT e.*,
        u.first_name || ' ' || u.last_name as provider_name,
        p.patient_number
      FROM encounters e
      LEFT JOIN users u ON e.provider_id = u.id
      LEFT JOIN patients p ON e.patient_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND e.patient_id = $${paramCount}`;
      params.push(patient_id);
      paramCount++;
    }

    if (provider_id) {
      query += ` AND e.provider_id = $${paramCount}`;
      params.push(provider_id);
      paramCount++;
    }

    if (status) {
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY e.encounter_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      encounters: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get encounters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEncounterById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.*,
        u.first_name || ' ' || u.last_name as provider_name,
        p.patient_number,
        p.date_of_birth,
        p.gender
      FROM encounters e
      LEFT JOIN users u ON e.provider_id = u.id
      LEFT JOIN patients p ON e.patient_id = p.id
      WHERE e.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    // Get diagnoses for this encounter
    const diagnosesResult = await pool.query(
      `SELECT * FROM diagnoses WHERE encounter_id = $1`,
      [id]
    );

    res.json({
      encounter: result.rows[0],
      diagnoses: diagnosesResult.rows,
    });
  } catch (error) {
    console.error('Get encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE encounters SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    res.json({
      message: 'Encounter updated successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Update encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addDiagnosis = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id, patient_id, diagnosis_code, diagnosis_description, type, onset_date } = req.body;

    const result = await pool.query(
      `INSERT INTO diagnoses (encounter_id, patient_id, diagnosis_code, diagnosis_description, type, onset_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [encounter_id, patient_id, diagnosis_code, diagnosis_description, type, onset_date]
    );

    res.status(201).json({
      message: 'Diagnosis added successfully',
      diagnosis: result.rows[0],
    });
  } catch (error) {
    console.error('Add diagnosis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
