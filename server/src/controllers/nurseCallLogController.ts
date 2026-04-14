import { Request, Response } from 'express';
import pool from '../database/db';

/**
 * Get follow-up call queue — patients who need follow-up calls.
 * Auto-populates from encounter data (patient, doctor, chief complaint).
 * Groups into: overdue, due_today, upcoming (next 7 days), later.
 */
export const getFollowUpQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, days_ahead = 7 } = req.query;

    const result = await pool.query(
      `SELECT
        e.id as encounter_id,
        e.encounter_number,
        e.encounter_date,
        e.chief_complaint,
        e.follow_up_timeframe,
        e.follow_up_reason,
        e.follow_up_required,
        e.follow_up_scheduled,
        e.completed_at,
        p.id as patient_id,
        p.patient_number,
        u_patient.first_name as patient_first_name,
        u_patient.last_name as patient_last_name,
        u_patient.phone as patient_phone,
        u_doctor.first_name as doctor_first_name,
        u_doctor.last_name as doctor_last_name,
        u_doctor.role as doctor_role,
        -- Calculate follow-up due date from encounter completion + timeframe
        CASE
          WHEN e.follow_up_timeframe = '1 week' THEN COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '7 days'
          WHEN e.follow_up_timeframe = '2 weeks' THEN COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '14 days'
          WHEN e.follow_up_timeframe = '3 weeks' THEN COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '21 days'
          WHEN e.follow_up_timeframe = '1 month' THEN COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '30 days'
          WHEN e.follow_up_timeframe = '2 months' THEN COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '60 days'
          WHEN e.follow_up_timeframe = '3 months' THEN COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '90 days'
          WHEN e.follow_up_timeframe = '6 months' THEN COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '180 days'
          ELSE COALESCE(e.completed_at, e.encounter_date)::date + INTERVAL '14 days'
        END as follow_up_due_date,
        -- Get the latest call log for this encounter (if any)
        ncl.id as last_call_id,
        ncl.call_date as last_call_date,
        ncl.call_status as last_call_status,
        ncl.patient_status_notes as last_call_notes,
        ncl.next_review_date
       FROM encounters e
       JOIN patients p ON e.patient_id = p.id
       JOIN users u_patient ON p.user_id = u_patient.id
       LEFT JOIN users u_doctor ON e.provider_id = u_doctor.id
       LEFT JOIN LATERAL (
         SELECT * FROM nurse_call_logs
          WHERE encounter_id = e.id
          ORDER BY call_date DESC
          LIMIT 1
       ) ncl ON true
       WHERE e.follow_up_required = true
       ORDER BY follow_up_due_date ASC`
    );

    // Group into categories
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayStr = now.toISOString().split('T')[0];
    const aheadDate = new Date(now);
    aheadDate.setDate(aheadDate.getDate() + Number(days_ahead));

    const overdue: any[] = [];
    const due_today: any[] = [];
    const upcoming: any[] = [];
    const later: any[] = [];

    for (const row of result.rows) {
      const dueDate = new Date(row.follow_up_due_date);
      dueDate.setHours(0, 0, 0, 0);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      const item = {
        ...row,
        patient_name: `${row.patient_first_name} ${row.patient_last_name}`,
        doctor_name: row.doctor_first_name
          ? `Dr. ${row.doctor_first_name} ${row.doctor_last_name}`
          : null,
      };

      if (dueDateStr < todayStr) {
        overdue.push(item);
      } else if (dueDateStr === todayStr) {
        due_today.push(item);
      } else if (dueDate <= aheadDate) {
        upcoming.push(item);
      } else {
        later.push(item);
      }
    }

    // Apply optional status filter
    if (status === 'overdue') {
      res.json({ queue: overdue, total: overdue.length });
      return;
    }
    if (status === 'today') {
      res.json({ queue: due_today, total: due_today.length });
      return;
    }

    res.json({
      overdue,
      due_today,
      upcoming,
      later,
      counts: {
        overdue: overdue.length,
        due_today: due_today.length,
        upcoming: upcoming.length,
        later: later.length,
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error('Get follow-up queue error:', error);
    res.status(500).json({ error: 'Failed to fetch follow-up queue' });
  }
};

/**
 * Log a follow-up call for an encounter/patient.
 */
export const logFollowUpCall = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const calledBy = authReq.user?.id;
    const {
      encounter_id,
      patient_id,
      call_status,
      patient_status_notes,
      next_review_date,
    } = req.body;

    if (!patient_id || !call_status) {
      res.status(400).json({ error: 'patient_id and call_status are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO nurse_call_logs
         (encounter_id, patient_id, called_by, call_status, patient_status_notes, next_review_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        encounter_id || null,
        patient_id,
        calledBy,
        call_status,
        patient_status_notes || null,
        next_review_date || null,
      ]
    );

    // If next_review_date is set, update the encounter's follow-up fields
    if (encounter_id && next_review_date) {
      await pool.query(
        `UPDATE encounters
            SET follow_up_scheduled = false,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [encounter_id]
      );
    }

    // If call was reached and notes indicate resolved, optionally mark follow-up as done
    // (the nurse can manually uncheck follow_up_required in the UI if needed)

    res.status(201).json({
      message: 'Call logged successfully',
      call_log: result.rows[0],
    });
  } catch (error) {
    console.error('Log follow-up call error:', error);
    res.status(500).json({ error: 'Failed to log call' });
  }
};

/**
 * Get call history for a specific patient or encounter.
 */
export const getCallHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, limit = 50 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (patient_id) {
      whereClause += ` AND ncl.patient_id = $${idx++}`;
      params.push(patient_id);
    }
    if (encounter_id) {
      whereClause += ` AND ncl.encounter_id = $${idx++}`;
      params.push(encounter_id);
    }

    const result = await pool.query(
      `SELECT ncl.*,
              u_caller.first_name || ' ' || u_caller.last_name as called_by_name,
              u_patient.first_name || ' ' || u_patient.last_name as patient_name,
              p.patient_number,
              u_patient.phone as patient_phone,
              e.chief_complaint,
              e.encounter_number
         FROM nurse_call_logs ncl
         JOIN users u_caller ON ncl.called_by = u_caller.id
         JOIN patients p ON ncl.patient_id = p.id
         JOIN users u_patient ON p.user_id = u_patient.id
         LEFT JOIN encounters e ON ncl.encounter_id = e.id
        ${whereClause}
        ORDER BY ncl.call_date DESC
        LIMIT $${idx}`,
      [...params, limit]
    );

    res.json({ call_logs: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
};
