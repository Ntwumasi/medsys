/**
 * Automatic patient texts — reminders and "it's ready" notices.
 *
 * Every automatic text goes through sendPatientText(), which:
 *  1. skips kinds an admin hasn't switched on (all start OFF),
 *  2. skips patients who opted out (patients.sms_reminders_opt_out) or were merged,
 *  3. claims (kind, ref_key) in patient_sms_log first, so a reminder can never be
 *     sent twice — re-running the daily job or re-verifying a lab is harmless,
 *  4. never throws: a texting problem must not fail a payment or a lab verify.
 *
 * Texts deliberately never name a test or medication — phones are often shared.
 *
 * Daily kinds (appointment / follow-up / refill) run from runDailyPatientTexts(),
 * called by the Vercel cron (09:00 UTC = 09:00 Ghana) or the admin "Run now".
 */

import pool from '../database/db';
import { sendSMS, validatePhoneNumber } from './smsService';
import { sendEmail, textToHtml, validateEmail } from './emailService';

export type PatientTextKind =
  | 'appointment'
  | 'follow_up'
  | 'refill'
  | 'lab_ready'
  | 'pharmacy_ready'
  | 'payment_receipt';

export const PATIENT_TEXT_KINDS: PatientTextKind[] = [
  'appointment', 'follow_up', 'refill', 'lab_ready', 'pharmacy_ready', 'payment_receipt',
];

const enabledKey = (kind: PatientTextKind) => `patient_sms_${kind}_enabled`;

interface TextSettings {
  enabled: Record<PatientTextKind, boolean>;
  clinicName: string;
  clinicPhone: string;
  refillDaysBefore: number;
  followUpDaysBefore: number;
}

export const getTextSettings = async (): Promise<TextSettings> => {
  const rows = await pool.query(
    `SELECT setting_key, setting_value FROM reminder_settings
      WHERE setting_key LIKE 'patient_sms_%' OR setting_key = 'follow_up_reminder_days_before'`
  );
  const map: Record<string, string> = {};
  rows.rows.forEach((r) => { map[r.setting_key] = r.setting_value; });

  const enabled = {} as Record<PatientTextKind, boolean>;
  PATIENT_TEXT_KINDS.forEach((k) => { enabled[k] = map[enabledKey(k)] === 'true'; });

  return {
    enabled,
    clinicName: map.patient_sms_clinic_name || 'Medics Clinic',
    clinicPhone: map.patient_sms_clinic_phone || '',
    refillDaysBefore: parseInt(map.patient_sms_refill_days_before) || 3,
    followUpDaysBefore: parseInt(map.follow_up_reminder_days_before) || 3,
  };
};

interface PatientContact {
  patient_id: number;
  first_name: string;
  phone: string | null;
  email: string | null;
  opted_out: boolean;
  merged: boolean;
}

const getPatientContact = async (patientId: number): Promise<PatientContact | null> => {
  const r = await pool.query(
    `SELECT p.id AS patient_id, u.first_name, u.phone, u.email,
            COALESCE(p.sms_reminders_opt_out, false) AS opted_out,
            (p.merged_into IS NOT NULL) AS merged
       FROM patients p
       JOIN users u ON p.user_id = u.id
      WHERE p.id = $1`,
    [patientId]
  );
  return r.rows[0] || null;
};

const firstName = (name: string | null | undefined) => {
  const n = (name || '').trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : 'there';
};

const callLine = (s: TextSettings) => (s.clinicPhone ? ` Call ${s.clinicPhone}.` : '');

export type TextOutcome = 'sent' | 'failed' | 'skipped';

interface SendArgs {
  kind: PatientTextKind;
  refKey: string;
  patientId: number;
  /** Builds the SMS text once the patient's first name is known. */
  message: (firstName: string, s: TextSettings) => string;
  /** Optional email fallback for patients with no usable phone. */
  email?: (firstName: string, s: TextSettings) => { subject: string; body: string };
  settings?: TextSettings;
}

export const sendPatientText = async (args: SendArgs): Promise<TextOutcome> => {
  try {
    const s = args.settings || (await getTextSettings());
    if (!s.enabled[args.kind]) return 'skipped';

    const patient = await getPatientContact(args.patientId);
    if (!patient || patient.opted_out || patient.merged) return 'skipped';

    const name = firstName(patient.first_name);
    const phone = patient.phone ? validatePhoneNumber(patient.phone) : null;
    const useSms = !!phone?.valid;
    const useEmail = !useSms && !!args.email && !!patient.email && validateEmail(patient.email);
    if (!useSms && !useEmail) return 'skipped';

    const channel = useSms ? 'sms' : 'email';
    const destination = useSms ? phone!.formatted : patient.email!;
    const text = useSms ? args.message(name, s) : '';
    const mail = useEmail ? args.email!(name, s) : null;

    // Claim the slot first: if this (kind, ref_key) was already sent (or is
    // being sent), stop. Only a previously FAILED attempt may be retried.
    const claim = await pool.query(
      `INSERT INTO patient_sms_log (patient_id, kind, ref_key, channel, destination, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (kind, ref_key) DO UPDATE
         SET status = 'pending', channel = EXCLUDED.channel, destination = EXCLUDED.destination,
             message = EXCLUDED.message, error = NULL, created_at = CURRENT_TIMESTAMP
         WHERE patient_sms_log.status = 'failed'
       RETURNING id`,
      [args.patientId, args.kind, args.refKey, channel, destination, useSms ? text : mail!.body]
    );
    if (claim.rows.length === 0) return 'skipped';
    const logId = claim.rows[0].id;

    let ok = false;
    let provider = '';
    let error: string | undefined;
    if (useSms) {
      const r = await sendSMS(destination, text);
      ok = r.success; provider = r.provider; error = r.error;
    } else {
      const r = await sendEmail(destination, mail!.subject, mail!.body, textToHtml(mail!.body));
      ok = r.success; provider = r.provider; error = r.error;
    }

    await pool.query(
      `UPDATE patient_sms_log
          SET status = $2, provider = $3, error = $4, sent_at = CASE WHEN $2 = 'sent' THEN CURRENT_TIMESTAMP END
        WHERE id = $1`,
      [logId, ok ? 'sent' : 'failed', provider || null, ok ? null : (error || 'Send failed')]
    );
    return ok ? 'sent' : 'failed';
  } catch (err) {
    console.error(`[patient-text] ${args.kind} ${args.refKey} failed:`, err);
    return 'failed';
  }
};

// ---------------------------------------------------------------------------
// Event texts — called right where the thing happens
// ---------------------------------------------------------------------------

/** Lab result verified/completed. At most one text per patient per day. */
export const textLabResultsReady = async (patientId: number | null | undefined): Promise<void> => {
  if (!patientId) return;
  const today = new Date().toISOString().slice(0, 10);
  await sendPatientText({
    kind: 'lab_ready',
    refKey: `${patientId}:${today}`,
    patientId,
    message: (n, s) =>
      `Hello ${n}, your lab results at ${s.clinicName} are ready. Your doctor will go over them with you.${callLine(s)}`,
  });
};

/** Pharmacy marked an order ready. At most one text per patient per day. */
export const textMedicationReady = async (patientId: number | null | undefined): Promise<void> => {
  if (!patientId) return;
  const today = new Date().toISOString().slice(0, 10);
  await sendPatientText({
    kind: 'pharmacy_ready',
    refKey: `${patientId}:${today}`,
    patientId,
    message: (n, s) =>
      `Hello ${n}, your medication is ready for pickup at the ${s.clinicName} pharmacy.${callLine(s)}`,
  });
};

/** A patient payment was recorded. One text per payment. */
export const textPaymentReceipt = async (paymentId: number): Promise<void> => {
  try {
    await sendPaymentReceipt(paymentId);
  } catch (err) {
    console.error(`[patient-text] payment receipt ${paymentId} failed:`, err);
  }
};

const sendPaymentReceipt = async (paymentId: number): Promise<void> => {
  const r = await pool.query(
    `SELECT pay.amount, i.patient_id, i.invoice_number,
            i.total_amount, COALESCE(i.amount_paid, 0) AS amount_paid
       FROM payments pay
       JOIN invoices i ON pay.invoice_id = i.id
      WHERE pay.id = $1`,
    [paymentId]
  );
  const row = r.rows[0];
  if (!row?.patient_id) return;
  const amount = Number(row.amount).toFixed(2);
  const balance = Math.max(0, Number(row.total_amount) - Number(row.amount_paid)).toFixed(2);
  await sendPatientText({
    kind: 'payment_receipt',
    refKey: String(paymentId),
    patientId: row.patient_id,
    message: (_n, s) =>
      `${s.clinicName}: payment of GHS ${amount} received for invoice ${row.invoice_number}. ` +
      (Number(balance) > 0 ? `Balance due: GHS ${balance}.` : 'Paid in full.') +
      ' Thank you.',
  });
};

// ---------------------------------------------------------------------------
// Daily reminders
// ---------------------------------------------------------------------------

export interface DailyRunResult {
  appointment: Record<TextOutcome, number>;
  follow_up: Record<TextOutcome, number>;
  refill: Record<TextOutcome, number>;
}

const tally = () => ({ sent: 0, failed: 0, skipped: 0 });

export const runDailyPatientTexts = async (): Promise<DailyRunResult> => {
  const s = await getTextSettings();
  const result: DailyRunResult = { appointment: tally(), follow_up: tally(), refill: tally() };

  // Follow-ups first, so the appointment reminder can skip a visit that was
  // just reminded about today.
  if (s.enabled.follow_up) {
    const due = await pool.query(
      `SELECT e.id AS encounter_id, a.id AS appointment_id, e.patient_id,
              a.appointment_date::date::text AS day,
              TO_CHAR(a.appointment_date, 'Dy DD Mon') AS date_label,
              -- Date-only bookings are stored at midnight: say no time rather than "12:00 am".
              CASE WHEN a.appointment_date::time = '00:00' THEN ''
                   ELSE ' at ' || TO_CHAR(a.appointment_date, 'FMHH12:MI am') END AS time_label
         FROM encounters e
         JOIN appointments a ON a.id = e.follow_up_appointment_id
        WHERE e.follow_up_required = true
          AND a.status IN ('scheduled', 'confirmed')
          AND a.appointment_date::date > CURRENT_DATE
          AND a.appointment_date::date <= CURRENT_DATE + $1::int`,
      [s.followUpDaysBefore]
    );
    for (const f of due.rows) {
      const outcome = await sendPatientText({
        kind: 'follow_up',
        refKey: `${f.appointment_id}:${f.day}`,
        patientId: f.patient_id,
        settings: s,
        message: (n, st) =>
          `Hello ${n}, your follow-up visit at ${st.clinicName} is on ${f.date_label}${f.time_label}. To reschedule${st.clinicPhone ? `, call ${st.clinicPhone}` : ', please contact us'}.`,
        email: (n, st) => ({
          subject: `Reminder: follow-up visit on ${f.date_label}`,
          body: [
            `Hello ${n},`,
            '',
            `This is a reminder of your follow-up visit at ${st.clinicName} on ${f.date_label}${f.time_label}.`,
            '',
            `If you need to reschedule, please ${st.clinicPhone ? `call us on ${st.clinicPhone}` : 'contact us'}.`,
            '',
            st.clinicName,
          ].join('\n'),
        }),
      });
      result.follow_up[outcome]++;
      if (outcome === 'sent') {
        await pool.query(
          `UPDATE encounters SET follow_up_reminder_sent = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [f.encounter_id]
        );
      }
    }
  }

  if (s.enabled.appointment) {
    const due = await pool.query(
      `SELECT a.id, a.patient_id,
              a.appointment_date::date::text AS day,
              TO_CHAR(a.appointment_date, 'Dy DD Mon') AS date_label,
              -- Date-only bookings are stored at midnight: say no time rather than "12:00 am".
              CASE WHEN a.appointment_date::time = '00:00' THEN ''
                   ELSE ' at ' || TO_CHAR(a.appointment_date, 'FMHH12:MI am') END AS time_label
         FROM appointments a
        WHERE a.patient_id IS NOT NULL
          AND a.status IN ('scheduled', 'confirmed')
          AND a.appointment_date::date = CURRENT_DATE + 1
          AND NOT EXISTS (
            SELECT 1 FROM patient_sms_log l
             WHERE l.kind = 'follow_up' AND l.status = 'sent'
               AND l.ref_key LIKE a.id || ':%'
               AND l.created_at::date = CURRENT_DATE
          )`
    );
    for (const a of due.rows) {
      const outcome = await sendPatientText({
        kind: 'appointment',
        refKey: `${a.id}:${a.day}`,
        patientId: a.patient_id,
        settings: s,
        message: (n, st) =>
          `Hello ${n}, reminder: you have an appointment at ${st.clinicName} tomorrow, ${a.date_label}${a.time_label}. To reschedule${st.clinicPhone ? `, call ${st.clinicPhone}` : ', please contact us'}.`,
      });
      result.appointment[outcome]++;
    }
  }

  if (s.enabled.refill) {
    // Same refill-date rule as the pharmacy refill calendar. One text per
    // patient per refill date, however many medications fall due that day.
    const due = await pool.query(
      `SELECT DISTINCT po.patient_id,
              (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date::text AS day,
              TO_CHAR((po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date, 'Dy DD Mon') AS date_label
         FROM pharmacy_orders po
        WHERE po.status = 'dispensed'
          AND (po.is_long_term IS TRUE OR po.refills > 0)
          AND po.reminder_cleared IS NOT TRUE
          AND po.dispensed_date IS NOT NULL
          AND (po.dispensed_date + (COALESCE(po.days_supply, po.quantity::int) || ' days')::interval)::date
              BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`,
      [s.refillDaysBefore]
    );
    for (const r of due.rows) {
      const outcome = await sendPatientText({
        kind: 'refill',
        refKey: `${r.patient_id}:${r.day}`,
        patientId: r.patient_id,
        settings: s,
        message: (n, st) =>
          `Hello ${n}, one of your medications from ${st.clinicName} is due for a refill around ${r.date_label}. Visit our pharmacy${st.clinicPhone ? ` or call ${st.clinicPhone}` : ''}.`,
      });
      result.refill[outcome]++;
    }
  }

  console.log('[patient-text] daily run', JSON.stringify(result));
  return result;
};
