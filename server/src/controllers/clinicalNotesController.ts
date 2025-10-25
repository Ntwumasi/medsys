import { Request, Response } from 'express';
import pool from '../database/db';

// Create a clinical note
export const createClinicalNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const created_by = authReq.user?.id;

    const { encounter_id, patient_id, note_type, content } = req.body;

    const result = await pool.query(
      `INSERT INTO clinical_notes (
        encounter_id, patient_id, note_type, content, created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [encounter_id, patient_id, note_type, content, created_by]
    );

    res.status(201).json({
      message: 'Clinical note created successfully',
      note: result.rows[0],
    });
  } catch (error) {
    console.error('Create clinical note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get clinical notes for an encounter
export const getEncounterNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const result = await pool.query(
      `SELECT cn.*,
        u_created.first_name || ' ' || u_created.last_name as created_by_name,
        u_created.role as created_by_role,
        u_signed.first_name || ' ' || u_signed.last_name as signed_by_name
      FROM clinical_notes cn
      LEFT JOIN users u_created ON cn.created_by = u_created.id
      LEFT JOIN users u_signed ON cn.signed_by = u_signed.id
      WHERE cn.encounter_id = $1
      ORDER BY cn.created_at DESC`,
      [encounter_id]
    );

    res.json({
      notes: result.rows,
    });
  } catch (error) {
    console.error('Get encounter notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get clinical notes for a patient (across all encounters)
export const getPatientNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;

    const result = await pool.query(
      `SELECT cn.*,
        e.encounter_number,
        e.encounter_date,
        u_created.first_name || ' ' || u_created.last_name as created_by_name,
        u_created.role as created_by_role,
        u_signed.first_name || ' ' || u_signed.last_name as signed_by_name
      FROM clinical_notes cn
      LEFT JOIN encounters e ON cn.encounter_id = e.id
      LEFT JOIN users u_created ON cn.created_by = u_created.id
      LEFT JOIN users u_signed ON cn.signed_by = u_signed.id
      WHERE cn.patient_id = $1
      ORDER BY cn.created_at DESC`,
      [patient_id]
    );

    res.json({
      notes: result.rows,
    });
  } catch (error) {
    console.error('Get patient notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a clinical note (only if not locked)
export const updateClinicalNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    // Check if note is locked
    const checkResult = await pool.query(
      `SELECT is_locked FROM clinical_notes WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({ error: 'Clinical note not found' });
      return;
    }

    if (checkResult.rows[0].is_locked) {
      res.status(403).json({ error: 'Cannot modify a locked note. You can only add new notes.' });
      return;
    }

    const result = await pool.query(
      `UPDATE clinical_notes SET content = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [content, id]
    );

    res.json({
      message: 'Clinical note updated successfully',
      note: result.rows[0],
    });
  } catch (error) {
    console.error('Update clinical note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Sign a clinical note (doctor only)
export const signClinicalNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const signed_by = authReq.user?.id;
    const user_role = authReq.user?.role;

    if (user_role !== 'doctor') {
      res.status(403).json({ error: 'Only doctors can sign notes' });
      return;
    }

    const { id } = req.params;

    const result = await pool.query(
      `UPDATE clinical_notes
       SET is_signed = true, signed_at = CURRENT_TIMESTAMP, signed_by = $1, is_locked = true
       WHERE id = $2
       RETURNING *`,
      [signed_by, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Clinical note not found' });
      return;
    }

    const note = result.rows[0];

    // Update billing when note is signed
    await pool.query(
      `UPDATE invoices
       SET subtotal = subtotal + 150.00,
           total = total + 150.00,
           status = 'pending'
       WHERE encounter_id = $1`,
      [note.encounter_id]
    );

    res.json({
      message: 'Clinical note signed and locked successfully',
      note: result.rows[0],
    });
  } catch (error) {
    console.error('Sign clinical note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all signed notes for an encounter (for chart view)
export const getSignedNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const result = await pool.query(
      `SELECT cn.*,
        u_created.first_name || ' ' || u_created.last_name as created_by_name,
        u_signed.first_name || ' ' || u_signed.last_name as signed_by_name
      FROM clinical_notes cn
      LEFT JOIN users u_created ON cn.created_by = u_created.id
      LEFT JOIN users u_signed ON cn.signed_by = u_signed.id
      WHERE cn.encounter_id = $1 AND cn.is_signed = true
      ORDER BY cn.signed_at DESC`,
      [encounter_id]
    );

    res.json({
      signed_notes: result.rows,
    });
  } catch (error) {
    console.error('Get signed notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
