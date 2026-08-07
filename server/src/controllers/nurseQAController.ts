import { Request, Response } from 'express';
import pool from '../database/db';

/**
 * QA review: every patient a given doctor saw over a date range, with the
 * number to call them back on.
 *
 * Built for the head nurse doing quality follow-up — pick a doctor, pick a
 * period, get a callable list. Distinct from /nurse/follow-up-tasks, which only
 * surfaces visits the doctor explicitly flagged as needing follow-up; QA needs
 * to see *every* visit, including the ones nobody flagged.
 */
export const getPatientsSeenByDoctor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider_id, date_from, date_to, search } = req.query;

    if (!date_from || !date_to) {
      res.status(400).json({ error: 'date_from and date_to are required' });
      return;
    }

    const params: any[] = [String(date_from), String(date_to)];
    let paramIndex = 3;

    // encounter_date is a TIMESTAMP, so compare against an exclusive upper
    // bound one day out rather than <= date_to, which would drop everything
    // after midnight on the last day.
    let where = `
      WHERE e.encounter_date >= $1::date
        AND e.encounter_date < ($2::date + INTERVAL '1 day')
        AND e.status NOT IN ('cancelled', 'scheduled')
    `;

    // Omitting provider_id gives every doctor — useful for a period-wide sweep.
    if (provider_id && provider_id !== 'all') {
      where += ` AND e.provider_id = $${paramIndex}`;
      params.push(Number(provider_id));
      paramIndex++;
    } else {
      where += ` AND e.provider_id IS NOT NULL`;
    }

    if (search) {
      where += ` AND (
        LOWER(u_pat.first_name || ' ' || u_pat.last_name) LIKE LOWER($${paramIndex})
        OR LOWER(p.patient_number) LIKE LOWER($${paramIndex})
        OR u_pat.phone LIKE $${paramIndex}
        OR LOWER(e.encounter_number) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${String(search).trim()}%`);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT
         e.id                     AS encounter_id,
         e.encounter_number,
         e.encounter_date,
         e.completed_at,
         e.status,
         e.chief_complaint,
         e.assessment,
         e.follow_up_required,
         e.follow_up_timeframe,
         e.clinic,
         p.id                     AS patient_id,
         p.patient_number,
         p.date_of_birth,
         p.gender,
         u_pat.first_name         AS patient_first_name,
         u_pat.last_name          AS patient_last_name,
         NULLIF(TRIM(u_pat.phone), '')            AS patient_phone,
         NULLIF(TRIM(p.emergency_contact_phone), '') AS emergency_contact_phone,
         p.emergency_contact_name,
         u_doc.id                 AS doctor_id,
         u_doc.first_name         AS doctor_first_name,
         u_doc.last_name          AS doctor_last_name,
         ncl.call_date            AS last_call_date,
         ncl.call_status          AS last_call_status
       FROM encounters e
       JOIN patients p        ON e.patient_id = p.id
       LEFT JOIN users u_pat  ON p.user_id = u_pat.id
       LEFT JOIN users u_doc  ON e.provider_id = u_doc.id
       LEFT JOIN LATERAL (
         SELECT call_date, call_status
           FROM nurse_call_logs
          WHERE encounter_id = e.id
          ORDER BY call_date DESC
          LIMIT 1
       ) ncl ON true
       ${where}
       ORDER BY e.encounter_date DESC`,
      params
    );

    const encounters = result.rows.map((row) => {
      const name = [row.patient_first_name, row.patient_last_name].filter(Boolean).join(' ');
      // Fall back to the emergency contact when the patient has no number of
      // their own — flagged so the caller knows who they're actually reaching.
      const callback = row.patient_phone || row.emergency_contact_phone || null;
      return {
        ...row,
        patient_name: name || 'Unknown patient',
        doctor_name: [row.doctor_first_name, row.doctor_last_name].filter(Boolean).join(' ') || null,
        callback_phone: callback,
        callback_is_emergency_contact: !row.patient_phone && !!row.emergency_contact_phone,
      };
    });

    const uniquePatients = new Set(encounters.map((e) => e.patient_id));

    res.json({
      encounters,
      summary: {
        total_visits: encounters.length,
        unique_patients: uniquePatients.size,
        reachable: encounters.filter((e) => e.callback_phone).length,
        no_phone: encounters.filter((e) => !e.callback_phone).length,
        follow_up_required: encounters.filter((e) => e.follow_up_required).length,
        already_called: encounters.filter((e) => e.last_call_date).length,
      },
    });
  } catch (error) {
    console.error('Error fetching patients seen by doctor:', error);
    res.status(500).json({ error: 'Failed to load QA patient list' });
  }
};
