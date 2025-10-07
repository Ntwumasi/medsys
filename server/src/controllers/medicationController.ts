import { Request, Response } from 'express';
import pool from '../database/db';

export const prescribeMedication = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const prescribing_doctor = authReq.user?.id;

    const {
      patient_id,
      medication_name,
      dosage,
      frequency,
      route,
      start_date,
      end_date,
      notes,
    } = req.body;

    // Check for drug interactions with existing active medications
    const existingMeds = await pool.query(
      `SELECT medication_name FROM medications
       WHERE patient_id = $1 AND status = 'active'`,
      [patient_id]
    );

    // Simple drug interaction check (in production, use a proper drug interaction database)
    const warnings = checkDrugInteractions(medication_name, existingMeds.rows);

    const result = await pool.query(
      `INSERT INTO medications (
        patient_id, medication_name, dosage, frequency, route,
        start_date, end_date, prescribing_doctor, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        patient_id,
        medication_name,
        dosage,
        frequency,
        route,
        start_date || new Date(),
        end_date,
        prescribing_doctor,
        notes,
      ]
    );

    res.status(201).json({
      message: 'Medication prescribed successfully',
      medication: result.rows[0],
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error('Prescribe medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPatientMedications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { status } = req.query;

    let query = `
      SELECT m.*,
        u.first_name || ' ' || u.last_name as prescribing_doctor_name
      FROM medications m
      LEFT JOIN users u ON m.prescribing_doctor = u.id
      WHERE m.patient_id = $1
    `;
    const params: any[] = [patient_id];

    if (status) {
      query += ` AND m.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY m.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      medications: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get patient medications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMedication = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const fields = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updateData);

    const result = await pool.query(
      `UPDATE medications SET ${fields}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Medication not found' });
      return;
    }

    res.json({
      message: 'Medication updated successfully',
      medication: result.rows[0],
    });
  } catch (error) {
    console.error('Update medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const discontinueMedication = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE medications
       SET status = 'discontinued',
           end_date = CURRENT_DATE,
           notes = COALESCE(notes || E'\n', '') || $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, `Discontinued: ${reason || 'No reason provided'}`]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Medication not found' });
      return;
    }

    res.json({
      message: 'Medication discontinued successfully',
      medication: result.rows[0],
    });
  } catch (error) {
    console.error('Discontinue medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function for drug interaction checking
function checkDrugInteractions(newMedication: string, existingMedications: any[]): string[] {
  const warnings: string[] = [];

  // This is a simplified example. In production, use a comprehensive drug interaction database
  const knownInteractions: { [key: string]: string[] } = {
    'warfarin': ['aspirin', 'ibuprofen', 'naproxen'],
    'aspirin': ['warfarin', 'clopidogrel'],
    'metformin': ['alcohol'],
    'lisinopril': ['potassium', 'spironolactone'],
  };

  const newMedLower = newMedication.toLowerCase();

  existingMedications.forEach((med) => {
    const existingMedLower = med.medication_name.toLowerCase();

    if (knownInteractions[newMedLower]?.some(drug => existingMedLower.includes(drug))) {
      warnings.push(`Potential interaction between ${newMedication} and ${med.medication_name}`);
    }

    if (knownInteractions[existingMedLower]?.some(drug => newMedLower.includes(drug))) {
      warnings.push(`Potential interaction between ${newMedication} and ${med.medication_name}`);
    }
  });

  return warnings;
}

export const checkAllergies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, medication_name } = req.body;

    const result = await pool.query(
      `SELECT * FROM allergies
       WHERE patient_id = $1 AND allergen ILIKE $2`,
      [patient_id, `%${medication_name}%`]
    );

    if (result.rows.length > 0) {
      res.json({
        hasAllergy: true,
        allergies: result.rows,
        warning: 'Patient has documented allergy to this medication or its components',
      });
    } else {
      res.json({
        hasAllergy: false,
        message: 'No known allergies to this medication',
      });
    }
  } catch (error) {
    console.error('Check allergies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
