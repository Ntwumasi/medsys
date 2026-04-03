import { Request, Response } from 'express';
import pool from '../database/db';

// Get encounters that need follow-up but haven't been scheduled yet
export const getUnscheduledFollowUps = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        e.id as encounter_id,
        e.follow_up_required,
        e.follow_up_timeframe,
        e.follow_up_reason,
        e.follow_up_scheduled,
        e.checked_in_at as encounter_date,
        p.id as patient_id,
        p.patient_number,
        u.first_name || ' ' || u.last_name as patient_name,
        u.phone as patient_phone,
        u.email as patient_email,
        doc.first_name || ' ' || doc.last_name as doctor_name
      FROM encounters e
      JOIN patients p ON e.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN users doc ON e.provider_id = doc.id
      WHERE e.follow_up_required = true
        AND (e.follow_up_scheduled = false OR e.follow_up_scheduled IS NULL)
      ORDER BY e.checked_in_at DESC
    `);

    res.json({ unscheduled: result.rows });
  } catch (error) {
    console.error('Error fetching unscheduled follow-ups:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Schedule a follow-up appointment and link it to the encounter
export const scheduleFollowUp = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { encounter_id, appointment_id } = req.body;

    if (!encounter_id || !appointment_id) {
      res.status(400).json({ error: 'encounter_id and appointment_id are required' });
      return;
    }

    await client.query('BEGIN');

    // Verify the encounter exists and needs follow-up
    const encounterResult = await client.query(
      `SELECT id, follow_up_required, follow_up_scheduled FROM encounters WHERE id = $1`,
      [encounter_id]
    );

    if (encounterResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    const encounter = encounterResult.rows[0];
    if (!encounter.follow_up_required) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'This encounter does not require follow-up' });
      return;
    }

    // Verify the appointment exists
    const appointmentResult = await client.query(
      `SELECT id FROM appointments WHERE id = $1`,
      [appointment_id]
    );

    if (appointmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    // Link the appointment to the encounter
    await client.query(
      `UPDATE encounters
       SET follow_up_scheduled = true,
           follow_up_appointment_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [encounter_id, appointment_id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Follow-up appointment scheduled successfully',
      encounter_id,
      appointment_id,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error scheduling follow-up:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Get follow-up statistics for dashboard
export const getFollowUpStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE follow_up_required = true) as total_follow_ups,
        COUNT(*) FILTER (WHERE follow_up_required = true AND (follow_up_scheduled = false OR follow_up_scheduled IS NULL)) as unscheduled,
        COUNT(*) FILTER (WHERE follow_up_required = true AND follow_up_scheduled = true) as scheduled,
        COUNT(*) FILTER (WHERE follow_up_required = true AND follow_up_reminder_sent = true) as reminders_sent
      FROM encounters
      WHERE DATE(checked_in_at) >= CURRENT_DATE - INTERVAL '90 days'
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching follow-up stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Mark follow-up as skipped (receptionist chose to checkout without scheduling)
export const skipFollowUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.body;

    if (!encounter_id) {
      res.status(400).json({ error: 'encounter_id is required' });
      return;
    }

    // Mark as scheduled even though no appointment was made
    // This prevents it from showing up in unscheduled list
    await pool.query(
      `UPDATE encounters
       SET follow_up_scheduled = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND follow_up_required = true`,
      [encounter_id]
    );

    res.json({ message: 'Follow-up skipped', encounter_id });
  } catch (error) {
    console.error('Error skipping follow-up:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
