import { Request, Response } from 'express';
import pool from '../database/db';

// Search patients
export const searchPatients = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const searchTerm = `%${q.trim()}%`;

    const result = await pool.query(
      `SELECT p.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.first_name || ' ' || u.last_name as full_name
       FROM patients p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.patient_number ILIKE $1
          OR u.first_name ILIKE $1
          OR u.last_name ILIKE $1
          OR (u.first_name || ' ' || u.last_name) ILIKE $1
          OR u.phone ILIKE $1
          OR u.email ILIKE $1
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [searchTerm]
    );

    res.json({
      patients: result.rows,
    });
  } catch (error) {
    console.error('Search patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Search encounters
export const searchEncounters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, status, date_from, date_to } = req.query;

    let query = `
      SELECT e.*,
        p.patient_number,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_doctor.first_name || ' ' || u_doctor.last_name as doctor_name,
        u_nurse.first_name || ' ' || u_nurse.last_name as nurse_name,
        r.room_number
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN users u_doctor ON e.provider_id = u_doctor.id
      LEFT JOIN users u_nurse ON e.nurse_id = u_nurse.id
      LEFT JOIN rooms r ON e.room_id = r.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Text search
    if (q && typeof q === 'string' && q.trim().length > 0) {
      const searchTerm = `%${q.trim()}%`;
      query += ` AND (
        e.encounter_number ILIKE $${paramIndex}
        OR p.patient_number ILIKE $${paramIndex}
        OR (u_patient.first_name || ' ' || u_patient.last_name) ILIKE $${paramIndex}
        OR e.chief_complaint ILIKE $${paramIndex}
      )`;
      params.push(searchTerm);
      paramIndex++;
    }

    // Status filter
    if (status && typeof status === 'string') {
      query += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Date range filter
    if (date_from) {
      query += ` AND e.encounter_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      query += ` AND e.encounter_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    query += ' ORDER BY e.encounter_date DESC, e.created_at DESC LIMIT 50';

    const result = await pool.query(query, params);

    res.json({
      encounters: result.rows,
    });
  } catch (error) {
    console.error('Search encounters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Quick search (combined patients and encounters)
export const quickSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const searchTerm = `%${q.trim()}%`;

    // Search patients
    const patientsResult = await pool.query(
      `SELECT p.*,
        u.first_name,
        u.last_name,
        u.phone,
        u.first_name || ' ' || u.last_name as full_name,
        'patient' as result_type
       FROM patients p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.patient_number ILIKE $1
          OR u.first_name ILIKE $1
          OR u.last_name ILIKE $1
          OR (u.first_name || ' ' || u.last_name) ILIKE $1
       ORDER BY p.created_at DESC
       LIMIT 5`,
      [searchTerm]
    );

    // Search encounters
    const encountersResult = await pool.query(
      `SELECT e.*,
        p.patient_number,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        'encounter' as result_type
       FROM encounters e
       LEFT JOIN patients p ON e.patient_id = p.id
       LEFT JOIN users u_patient ON p.user_id = u_patient.id
       WHERE e.encounter_number ILIKE $1
          OR p.patient_number ILIKE $1
       ORDER BY e.encounter_date DESC
       LIMIT 5`,
      [searchTerm]
    );

    res.json({
      patients: patientsResult.rows,
      encounters: encountersResult.rows,
      total_results: patientsResult.rows.length + encountersResult.rows.length,
    });
  } catch (error) {
    console.error('Quick search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
