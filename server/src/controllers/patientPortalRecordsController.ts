import { Request, Response } from 'express';
import pool from '../database/db';
import { loadLabOrderParameters } from './labInventoryController';

/**
 * Patient portal records. Every endpoint resolves the patient from the portal
 * token (never from a request parameter), so a patient can only ever see
 * their own record.
 *
 * Results release rule (agreed 2026-10-25): a patient sees a result once a
 * doctor has reviewed it, or 3 days after it was finalised — whichever comes
 * first. Until then they see that the test exists and when it will be
 * available. Imaging has no doctor-review step, so it is the 3-day rule only.
 */

const RELEASE_DELAY = "INTERVAL '3 days'";

const patientIdFor = async (req: Request): Promise<number | null> => {
  const userId = (req as any).user?.id;
  if (!userId) return null;
  const r = await pool.query(
    `SELECT id FROM patients WHERE user_id = $1 AND merged_into IS NULL LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.id ?? null;
};

const withPatient = (
  handler: (patientId: number, req: Request, res: Response) => Promise<void>,
  label: string
) => async (req: Request, res: Response): Promise<void> => {
  try {
    const patientId = await patientIdFor(req);
    if (!patientId) {
      res.status(404).json({ error: 'Patient record not found' });
      return;
    }
    await handler(patientId, req, res);
  } catch (error) {
    console.error(`Portal ${label} error:`, error);
    res.status(500).json({ error: `Could not load your ${label}` });
  }
};

/** GET /patient-portal/labs */
export const getPortalLabs = withPatient(async (patientId, _req, res) => {
  const rows = await pool.query(
    `SELECT lo.id, lo.test_name, lo.status,
            lo.ordered_date, lo.result_date,
            u.first_name || ' ' || u.last_name AS ordered_by,
            -- finalised = verified, or completed when no verification was needed
            COALESCE(lo.verified_at, lo.result_date) AS finalised_at,
            (lo.doctor_reviewed_at IS NOT NULL) AS doctor_reviewed,
            CASE
              WHEN lo.status = 'completed'
               AND COALESCE(lo.verification_status, 'not_required') NOT IN ('pending', 'rejected')
               AND lo.result IS NOT NULL
               AND (lo.doctor_reviewed_at IS NOT NULL
                    OR COALESCE(lo.verified_at, lo.result_date) <= NOW() - ${RELEASE_DELAY})
              THEN 'released'
              WHEN lo.status = 'completed'
               AND COALESCE(lo.verification_status, 'not_required') NOT IN ('pending', 'rejected')
              THEN 'awaiting_review'
              ELSE 'in_progress'
            END AS release_state,
            COALESCE(lo.verified_at, lo.result_date) + ${RELEASE_DELAY} AS available_by,
            LEAST(lo.doctor_reviewed_at, COALESCE(lo.verified_at, lo.result_date) + ${RELEASE_DELAY}) AS released_at,
            lo.result
       FROM lab_orders lo
       LEFT JOIN users u ON u.id = lo.ordering_provider
      WHERE lo.patient_id = $1
        AND lo.status <> 'cancelled'
      ORDER BY COALESCE(lo.result_date, lo.ordered_date) DESC
      LIMIT 200`,
    [patientId]
  );

  const labs = [];
  for (const r of rows.rows) {
    const released = r.release_state === 'released';
    let parameters: any[] = [];
    if (released && typeof r.result === 'string' && r.result.trim().startsWith('{')) {
      const defs = await loadLabOrderParameters(r.id).catch(() => null);
      parameters = defs?.parameters || [];
    }
    labs.push({
      id: r.id,
      test_name: r.test_name,
      ordered_date: r.ordered_date,
      ordered_by: r.ordered_by,
      release_state: r.release_state,
      doctor_reviewed: r.doctor_reviewed,
      available_by: r.release_state === 'awaiting_review' ? r.available_by : null,
      released_at: released ? r.released_at : null,
      // The result itself only once released.
      result: released ? r.result : null,
      parameters,
    });
  }
  res.json({ labs });
}, 'lab results');

/** GET /patient-portal/imaging */
export const getPortalImaging = withPatient(async (patientId, _req, res) => {
  const rows = await pool.query(
    `SELECT io.id, io.imaging_type, io.body_part, io.status, io.ordered_date, io.completed_date,
            CASE
              WHEN io.status = 'completed' AND io.findings IS NOT NULL
               AND COALESCE(io.completed_date, io.updated_at) <= NOW() - ${RELEASE_DELAY}
              THEN 'released'
              WHEN io.status = 'completed' THEN 'awaiting_review'
              ELSE 'in_progress'
            END AS release_state,
            COALESCE(io.completed_date, io.updated_at) + ${RELEASE_DELAY} AS available_by,
            io.findings
       FROM imaging_orders io
      WHERE io.patient_id = $1 AND io.status <> 'cancelled'
      ORDER BY COALESCE(io.completed_date, io.ordered_date) DESC
      LIMIT 100`,
    [patientId]
  );
  res.json({
    imaging: rows.rows.map((r) => ({
      id: r.id,
      imaging_type: r.imaging_type,
      body_part: r.body_part,
      ordered_date: r.ordered_date,
      completed_date: r.completed_date,
      release_state: r.release_state,
      available_by: r.release_state === 'awaiting_review' ? r.available_by : null,
      findings: r.release_state === 'released' ? r.findings : null,
    })),
  });
}, 'imaging reports');

/** GET /patient-portal/medications */
export const getPortalMedications = withPatient(async (patientId, _req, res) => {
  const rows = await pool.query(
    `SELECT m.id, m.medication_name, m.dosage, m.frequency, m.route, m.status,
            m.start_date, m.end_date,
            u.first_name || ' ' || u.last_name AS prescribed_by
       FROM medications m
       LEFT JOIN users u ON u.id = m.prescribing_doctor
      WHERE m.patient_id = $1
      ORDER BY (m.status = 'active') DESC, m.start_date DESC NULLS LAST, m.id DESC
      LIMIT 200`,
    [patientId]
  );
  res.json({ medications: rows.rows });
}, 'medications');

/** GET /patient-portal/appointments */
export const getPortalAppointments = withPatient(async (patientId, _req, res) => {
  const rows = await pool.query(
    `SELECT a.id, a.appointment_date, a.status, a.reason, a.appointment_type,
            -- Date-only bookings are stored at midnight: no time to show.
            (a.appointment_date::time <> '00:00') AS has_time,
            u.first_name || ' ' || u.last_name AS provider_name
       FROM appointments a
       LEFT JOIN users u ON u.id = a.provider_id
      WHERE a.patient_id = $1
      ORDER BY a.appointment_date DESC
      LIMIT 200`,
    [patientId]
  );
  res.json({ appointments: rows.rows });
}, 'appointments');

const isPayerSettlement = (notes: string | null | undefined, method: string | null | undefined) =>
  /payer settlement$/.test(notes || '') || /_settlement$/.test(method || '');

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /patient-portal/bills — every invoice, past and present, with what the
 * PATIENT owes. Self-pay: the whole bill. Insured/corporate/staff cover: only
 * the lines marked bill_to='patient'; the rest is shown as the payer's share.
 */
export const getPortalBills = withPatient(async (patientId, _req, res) => {
  const primary = await pool.query(
    `SELECT payer_type FROM patient_payer_sources
      WHERE patient_id = $1
      ORDER BY is_primary DESC NULLS LAST, id ASC
      LIMIT 1`,
    [patientId]
  );
  const primaryPayerType: string = primary.rows[0]?.payer_type || 'self_pay';

  const invoices = await pool.query(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.status, i.encounter_id,
            i.total_amount, COALESCE(i.amount_paid, 0) AS amount_paid,
            pps.payer_type AS invoice_payer_type,
            COALESCE(cc.name, ip.name) AS payer_name
       FROM invoices i
       LEFT JOIN patient_payer_sources pps ON pps.id = i.payer_source_id
       LEFT JOIN corporate_clients cc ON cc.id = pps.corporate_client_id
       LEFT JOIN insurance_providers ip ON ip.id = pps.insurance_provider_id
      WHERE i.patient_id = $1 AND i.status <> 'cancelled'
      ORDER BY i.invoice_date DESC, i.id DESC
      LIMIT 200`,
    [patientId]
  );
  const ids = invoices.rows.map((i) => i.id);
  const items = ids.length
    ? await pool.query(
        `SELECT invoice_id, description, quantity, total_price, COALESCE(bill_to, 'payer') AS bill_to
           FROM invoice_items WHERE invoice_id = ANY($1) ORDER BY id`,
        [ids]
      )
    : { rows: [] as any[] };
  const payments = ids.length
    ? await pool.query(
        `SELECT invoice_id, payment_date, amount, payment_method, notes
           FROM payments WHERE invoice_id = ANY($1) ORDER BY payment_date, id`,
        [ids]
      )
    : { rows: [] as any[] };

  let totalDue = 0;
  const bills = invoices.rows.map((inv) => {
    const payerType = inv.invoice_payer_type || primaryPayerType;
    const covered = payerType !== 'self_pay';
    const lines = items.rows.filter((i) => i.invoice_id === inv.id);
    const pays = payments.rows.filter((p) => p.invoice_id === inv.id);
    const total = Number(inv.total_amount) || 0;

    const patientPaid = money(
      pays.filter((p) => !isPayerSettlement(p.notes, p.payment_method)).reduce((s, p) => s + Number(p.amount || 0), 0)
    );
    const patientPortion = covered
      ? money(lines.filter((l) => l.bill_to === 'patient').reduce((s, l) => s + Number(l.total_price || 0), 0))
      : total;
    const due = covered
      ? Math.max(0, money(patientPortion - patientPaid))
      : Math.max(0, money(total - Number(inv.amount_paid)));
    totalDue += due;

    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      encounter_id: inv.encounter_id ?? null,
      covered,
      payer_name: covered ? inv.payer_name || null : null,
      total,
      your_share: patientPortion,
      covered_share: covered ? money(total - patientPortion) : 0,
      you_paid: covered ? patientPaid : money(Number(inv.amount_paid)),
      balance_due: due,
      items: lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity) || 1,
        amount: Number(l.total_price) || 0,
        paid_by: covered && l.bill_to !== 'patient' ? 'cover' : 'you',
      })),
      payments: pays
        .filter((p) => !isPayerSettlement(p.notes, p.payment_method))
        .map((p) => ({ date: p.payment_date, amount: Number(p.amount), method: p.payment_method })),
    };
  });

  res.json({ bills, total_due: money(totalDue) });
}, 'bills');

/**
 * GET /patient-portal/visits — every finished visit with a patient-friendly
 * summary: reason, diagnosis, medicines prescribed, tests ordered, follow-up
 * and the doctor's "Notes for the patient". The doctor's assessment and plan
 * are written for staff and are never sent. A visit shows once it is
 * completed (doctor signed off) or checked out. Test RESULTS are not repeated
 * here — they follow the release rule on the Results page.
 */
export const getPortalVisits = withPatient(async (patientId, _req, res) => {
  const enc = await pool.query(
    `SELECT e.id, e.encounter_number,
            COALESCE(e.checked_in_at, e.encounter_date, e.created_at) AS visit_date,
            e.clinic, e.encounter_type, e.chief_complaint, e.patient_note,
            e.follow_up_required, e.follow_up_timeframe, e.follow_up_reason,
            fa.appointment_date AS follow_up_date,
            (fa.appointment_date IS NOT NULL AND fa.appointment_date::time <> '00:00') AS follow_up_has_time,
            NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS doctor_name,
            COALESCE(e.invoice_id, (SELECT i.id FROM invoices i WHERE i.encounter_id = e.id AND i.status <> 'cancelled' ORDER BY i.id DESC LIMIT 1)) AS invoice_id
       FROM encounters e
       LEFT JOIN users u ON u.id = e.provider_id
       LEFT JOIN appointments fa ON fa.id = e.follow_up_appointment_id AND fa.status IN ('scheduled', 'confirmed')
      WHERE e.patient_id = $1 AND e.status IN ('completed', 'discharged')
      ORDER BY visit_date DESC
      LIMIT 100`,
    [patientId]
  );
  const ids = enc.rows.map((e) => e.id);
  const [dx, meds, labs, imaging] = ids.length
    ? await Promise.all([
        pool.query(
          `SELECT encounter_id, diagnosis_description FROM diagnoses
            WHERE encounter_id = ANY($1) AND diagnosis_description IS NOT NULL ORDER BY id`, [ids]),
        pool.query(
          `SELECT encounter_id, medication_name, dosage, frequency, route, days_supply
             FROM pharmacy_orders
            WHERE encounter_id = ANY($1) AND status <> 'cancelled' AND parent_order_id IS NULL ORDER BY id`, [ids]),
        pool.query(
          `SELECT encounter_id, test_name FROM lab_orders
            WHERE encounter_id = ANY($1) AND status <> 'cancelled' ORDER BY id`, [ids]),
        pool.query(
          `SELECT encounter_id, imaging_type, body_part FROM imaging_orders
            WHERE encounter_id = ANY($1) AND status <> 'cancelled' ORDER BY id`, [ids]),
      ])
    : [{ rows: [] as any[] }, { rows: [] as any[] }, { rows: [] as any[] }, { rows: [] as any[] }];

  const forVisit = <T extends { encounter_id: number }>(rows: T[], id: number) => rows.filter((r) => r.encounter_id === id);
  res.json({
    visits: enc.rows.map((e) => ({
      id: e.id,
      encounter_number: e.encounter_number,
      visit_date: e.visit_date,
      clinic: e.clinic,
      visit_type: e.encounter_type,
      doctor_name: e.doctor_name,
      reason: e.chief_complaint,
      diagnoses: [...new Set(forVisit(dx.rows, e.id).map((d) => d.diagnosis_description as string))],
      medicines: forVisit(meds.rows, e.id).map((m) => ({
        name: m.medication_name, dosage: m.dosage, frequency: m.frequency, route: m.route, days: m.days_supply,
      })),
      tests: [
        ...forVisit(labs.rows, e.id).map((l) => l.test_name as string),
        ...forVisit(imaging.rows, e.id).map((i) => [i.imaging_type, i.body_part].filter(Boolean).join(' — ')),
      ],
      follow_up: e.follow_up_required
        ? { timeframe: e.follow_up_timeframe, reason: e.follow_up_reason, date: e.follow_up_date, has_time: e.follow_up_has_time }
        : null,
      patient_note: e.patient_note || null,
      invoice_id: e.invoice_id,
    })),
  });
}, 'visits');
