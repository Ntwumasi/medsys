import { Request, Response } from 'express';
import pool from '../database/db';

/**
 * Patients by doctor (head nurse's view) — read-only.
 *
 * GET /reports/doctor-patients?from=YYYY-MM-DD&to=YYYY-MM-DD&doctor_id=
 *
 *  - seen: the range's encounters (not cancelled) grouped by encounters.provider_id.
 *  - appointments: the range's appointments (not cancelled) grouped by
 *    appointments.provider_id, each flagged `missed` (see isMissedAppointment).
 *
 * Nothing is written: a missed appointment is only flagged, never marked no-show.
 */

/** The appointments CHECK constraint stores 'no-show'; 'no_show' is what parts of the client type say, so accept both. */
export const NO_SHOW_STATUSES = ['no-show', 'no_show'];
/** Statuses that mean "still expected to turn up". */
const AWAITING_STATUSES = ['scheduled', 'confirmed'];

export const MAX_RANGE_DAYS = 93;
const ROW_LIMIT = 2000;

/**
 * Missed = marked no-show, OR the appointment time has passed while it is
 * still scheduled/confirmed and the patient has no (non-cancelled) encounter
 * that same day.
 */
export const isMissedAppointment = (
  appt: { status: string | null; appointment_date: string | Date; has_same_day_encounter: boolean },
  now: Date = new Date()
): boolean => {
  const status = appt.status || '';
  if (NO_SHOW_STATUSES.includes(status)) return true;
  if (!AWAITING_STATUSES.includes(status)) return false;
  const when = new Date(appt.appointment_date);
  if (isNaN(when.getTime())) return false;
  return when.getTime() < now.getTime() && !appt.has_same_day_encounter;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseDay = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  // Reject roll-overs like 2026-02-31.
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
};

export type RangeCheck =
  | { ok: true; from: string; to: string; days: number }
  | { ok: false; error: string };

export const validateRange = (fromRaw: unknown, toRaw: unknown): RangeCheck => {
  const from = parseDay(fromRaw);
  const to = parseDay(toRaw);
  if (!from || !to) return { ok: false, error: 'from and to are required dates (YYYY-MM-DD)' };
  if (to.getTime() < from.getTime()) return { ok: false, error: '"to" must be on or after "from"' };
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `Date range can be at most ${MAX_RANGE_DAYS} days` };
  return { ok: true, from: fromRaw as string, to: toRaw as string, days };
};

interface Group<T> {
  doctor_id: number | null;
  doctor_name: string;
  count: number;
  missed_count?: number;
  rows: T[];
}

const groupByDoctor = <T extends { provider_id: number | null; provider_name: string | null }>(rows: T[]): Group<T>[] => {
  const map = new Map<string, Group<T>>();
  for (const r of rows) {
    const key = r.provider_id == null ? 'none' : String(r.provider_id);
    let g = map.get(key);
    if (!g) {
      g = {
        doctor_id: r.provider_id ?? null,
        doctor_name: r.provider_id == null ? 'No doctor assigned' : (r.provider_name || `Doctor #${r.provider_id}`),
        count: 0,
        rows: [],
      };
      map.set(key, g);
    }
    g.count += 1;
    g.rows.push(r);
  }
  return [...map.values()].sort((a, b) => {
    if (a.doctor_id == null) return 1;
    if (b.doctor_id == null) return -1;
    return a.doctor_name.localeCompare(b.doctor_name);
  });
};

export const getDoctorPatientsReport = async (req: Request, res: Response): Promise<void> => {
  const range = validateRange(req.query.from, req.query.to);
  if (!range.ok) {
    res.status(400).json({ error: range.error });
    return;
  }

  let doctorId: number | null = null;
  const rawDoctor = req.query.doctor_id;
  if (rawDoctor !== undefined && rawDoctor !== '' && rawDoctor !== 'all') {
    if (typeof rawDoctor !== 'string' || !/^\d+$/.test(rawDoctor) || parseInt(rawDoctor, 10) <= 0) {
      res.status(400).json({ error: 'doctor_id must be a positive number' });
      return;
    }
    doctorId = parseInt(rawDoctor, 10);
  }

  try {
    // $1 = from, $2 = to (inclusive day), $3 = doctor id or NULL for every doctor.
    const params = [range.from, range.to, doctorId];

    const seenResult = await pool.query(
      `WITH enc AS (
         SELECT e.id, e.patient_id, e.provider_id, e.encounter_date, e.encounter_type,
                e.chief_complaint, e.status, COALESCE(e.is_home_visit, false) AS is_home_visit
           FROM encounters e
           JOIN patients p ON p.id = e.patient_id
          WHERE e.encounter_date >= $1::date
            AND e.encounter_date < $2::date + 1
            AND e.status <> 'cancelled'
            AND p.merged_into IS NULL
            AND ($3::int IS NULL OR e.provider_id = $3::int)
          ORDER BY e.encounter_date ASC
          LIMIT ${ROW_LIMIT + 1}
       ),
       dx AS (
         SELECT DISTINCT ON (d.encounter_id) d.encounter_id, d.diagnosis_description
           FROM diagnoses d
          WHERE d.encounter_id IN (SELECT id FROM enc)
          ORDER BY d.encounter_id, (d.type = 'primary') DESC, d.id ASC
       )
       SELECT enc.id AS encounter_id, enc.patient_id, enc.provider_id,
              doc.first_name || ' ' || doc.last_name AS provider_name,
              enc.encounter_date, enc.encounter_type, enc.chief_complaint, enc.status, enc.is_home_visit,
              dx.diagnosis_description AS primary_diagnosis,
              p.patient_number,
              CASE WHEN p.date_of_birth > DATE '1900-01-01' THEN p.date_of_birth END AS date_of_birth,
              u.first_name || ' ' || u.last_name AS patient_name,
              u.phone
         FROM enc
         JOIN patients p ON p.id = enc.patient_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN users doc ON doc.id = enc.provider_id
         LEFT JOIN dx ON dx.encounter_id = enc.id
        ORDER BY enc.encounter_date ASC`,
      params
    );

    const apptResult = await pool.query(
      `SELECT a.id AS appointment_id, a.patient_id, a.provider_id,
              doc.first_name || ' ' || doc.last_name AS provider_name,
              a.appointment_date, a.duration_minutes, a.appointment_type, a.status, a.reason,
              COALESCE(a.location_type, 'clinic') AS location_type,
              p.patient_number,
              CASE WHEN p.date_of_birth > DATE '1900-01-01' THEN p.date_of_birth END AS date_of_birth,
              COALESCE(u.first_name || ' ' || u.last_name, a.patient_name) AS patient_name,
              COALESCE(NULLIF(u.phone, ''), NULLIF(a.visit_contact_phone, '')) AS phone,
              EXISTS (
                SELECT 1 FROM encounters e2
                 WHERE e2.status <> 'cancelled'
                   AND (
                     e2.id = a.encounter_id
                     OR (a.patient_id IS NOT NULL
                         AND e2.patient_id = a.patient_id
                         AND e2.encounter_date >= a.appointment_date::date
                         AND e2.encounter_date < a.appointment_date::date + 1)
                   )
              ) AS has_same_day_encounter
         FROM appointments a
         LEFT JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN users doc ON doc.id = a.provider_id
        WHERE a.appointment_date >= $1::date
          AND a.appointment_date < $2::date + 1
          AND a.status <> 'cancelled'
          AND (a.patient_id IS NULL OR p.merged_into IS NULL)
          AND ($3::int IS NULL OR a.provider_id = $3::int)
        ORDER BY a.appointment_date ASC
        LIMIT ${ROW_LIMIT + 1}`,
      params
    );

    const seenRows = seenResult.rows.slice(0, ROW_LIMIT);
    const now = new Date();
    const apptRows = apptResult.rows.slice(0, ROW_LIMIT).map((r: any) => ({
      ...r,
      has_same_day_encounter: r.has_same_day_encounter === true,
      missed: isMissedAppointment(r, now),
    }));

    const seenGroups = groupByDoctor(seenRows).map(({ rows, ...g }) => ({ ...g, encounters: rows }));
    const apptGroups = groupByDoctor(apptRows).map(({ rows, ...g }) => ({
      ...g,
      missed_count: rows.filter((r) => r.missed).length,
      appointments: rows,
    }));

    res.json({
      from: range.from,
      to: range.to,
      doctor_id: doctorId,
      seen: {
        total: seenRows.length,
        truncated: seenResult.rows.length > ROW_LIMIT,
        groups: seenGroups,
      },
      appointments: {
        total: apptRows.length,
        missed_count: apptRows.filter((r) => r.missed).length,
        truncated: apptResult.rows.length > ROW_LIMIT,
        groups: apptGroups,
      },
    });
  } catch (error) {
    console.error('Doctor patients report error:', error);
    res.status(500).json({ error: 'Failed to load patients by doctor' });
  }
};
