import { Request, Response } from 'express';
import pool from '../database/db';

// Get all short stay beds with availability and patient info
export const getShortStayBeds = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        ssb.id,
        ssb.bed_number,
        ssb.bed_name,
        ssb.is_available,
        ssb.current_encounter_id,
        ssb.patient_id,
        ssb.assigned_at,
        ssb.notes,
        p.patient_number,
        u.first_name || ' ' || u.last_name as patient_name,
        assigned_user.first_name || ' ' || assigned_user.last_name as assigned_by_name
      FROM short_stay_beds ssb
      LEFT JOIN patients p ON ssb.patient_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN users assigned_user ON ssb.assigned_by = assigned_user.id
      ORDER BY ssb.bed_number
    `);

    res.json({ beds: result.rows });
  } catch (error) {
    console.error('Error fetching short stay beds:', error);
    res.status(500).json({ error: 'Failed to fetch short stay beds' });
  }
};

// Assign a patient to a short stay bed
export const assignBed = async (req: Request, res: Response) => {
  const { bed_id, encounter_id, patient_id, notes } = req.body;
  const assigned_by = (req as any).user?.id;

  if (!bed_id || !encounter_id || !patient_id) {
    return res.status(400).json({ error: 'bed_id, encounter_id, and patient_id are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if bed is available
    const bedCheck = await client.query(
      'SELECT is_available FROM short_stay_beds WHERE id = $1',
      [bed_id]
    );

    if (bedCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bed not found' });
    }

    if (!bedCheck.rows[0].is_available) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bed is already occupied' });
    }

    // Check if patient is already in a short stay bed
    const patientCheck = await client.query(
      'SELECT bed_name FROM short_stay_beds WHERE patient_id = $1 AND is_available = false',
      [patient_id]
    );

    if (patientCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Patient is already assigned to ${patientCheck.rows[0].bed_name}`
      });
    }

    // Assign the bed
    const result = await client.query(`
      UPDATE short_stay_beds
      SET
        is_available = false,
        current_encounter_id = $1,
        patient_id = $2,
        assigned_at = CURRENT_TIMESTAMP,
        assigned_by = $3,
        notes = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [encounter_id, patient_id, assigned_by, notes || null, bed_id]);

    await client.query('COMMIT');

    // Fetch full bed info with patient name
    const fullBed = await pool.query(`
      SELECT
        ssb.*,
        u.first_name || ' ' || u.last_name as patient_name
      FROM short_stay_beds ssb
      LEFT JOIN patients p ON ssb.patient_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ssb.id = $1
    `, [bed_id]);

    res.json({
      message: 'Patient assigned to short stay bed successfully',
      bed: fullBed.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning short stay bed:', error);
    res.status(500).json({ error: 'Failed to assign bed' });
  } finally {
    client.release();
  }
};

// Release a short stay bed
export const releaseBed = async (req: Request, res: Response) => {
  const { bed_id } = req.params;

  try {
    const result = await pool.query(`
      UPDATE short_stay_beds
      SET
        is_available = true,
        current_encounter_id = NULL,
        patient_id = NULL,
        assigned_at = NULL,
        assigned_by = NULL,
        notes = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [bed_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bed not found' });
    }

    res.json({
      message: 'Bed released successfully',
      bed: result.rows[0]
    });

  } catch (error) {
    console.error('Error releasing short stay bed:', error);
    res.status(500).json({ error: 'Failed to release bed' });
  }
};

// Get short stay bed history for an encounter
export const getEncounterShortStayHistory = async (req: Request, res: Response) => {
  const { encounter_id } = req.params;

  try {
    const result = await pool.query(`
      SELECT
        ssb.*,
        u.first_name || ' ' || u.last_name as patient_name
      FROM short_stay_beds ssb
      LEFT JOIN patients p ON ssb.patient_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ssb.current_encounter_id = $1
    `, [encounter_id]);

    res.json({ bed: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching encounter short stay info:', error);
    res.status(500).json({ error: 'Failed to fetch short stay info' });
  }
};
