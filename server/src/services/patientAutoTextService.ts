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
import { createPortalToken, portalLinkFor, getBaseUrl } from '../controllers/patientPortalController';

export type PatientTextKind =
  | 'appointment'
  | 'follow_up'
  | 'refill'
  | 'lab_ready'
  | 'pharmacy_ready'
  | 'payment_receipt'
  | 'visit_summary'
  | 'home_visit'
  | 'delivery'
  /** One-off portal invitation, sent by an admin — no on/off toggle. */
  | 'portal_invite';

/** Kinds an admin switches on/off (portal_invite is sent by hand instead). */
export const PATIENT_TEXT_KINDS: PatientTextKind[] = [
  'appointment', 'follow_up', 'refill', 'lab_ready', 'pharmacy_ready', 'payment_receipt', 'visit_summary', 'home_visit', 'delivery',
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
  /** Sent by an admin on purpose (portal invites): no on/off toggle applies. */
  manual?: boolean;
}

export const sendPatientText = async (args: SendArgs): Promise<TextOutcome> => {
  try {
    const s = args.settings || (await getTextSettings());
    if (!args.manual && !s.enabled[args.kind]) return 'skipped';

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
            OR (patient_sms_log.status = 'pending' AND patient_sms_log.created_at < NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      // The log never keeps a usable portal link.
      [args.patientId, args.kind, args.refKey, channel, destination, (useSms ? text : mail!.body).replace(/token=[^\s)]+/g, 'token=…')]
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

/**
 * Event texts are sent from inside staff actions (verifying a lab result,
 * marking a prescription ready, taking a payment). SMS providers can take up
 * to 15s each, so the staff action waits at most EVENT_TEXT_WAIT_MS; a slower
 * send carries on in the background (and is retried later if it never lands).
 */
const EVENT_TEXT_WAIT_MS = 4000;
const capWait = async (send: Promise<unknown>): Promise<void> => {
  await Promise.race([send.catch(() => undefined), new Promise((r) => setTimeout(r, EVENT_TEXT_WAIT_MS))]);
};

/** Lab result verified/completed. At most one text per patient per day. */
export const textLabResultsReady = async (patientId: number | null | undefined): Promise<void> => {
  if (!patientId) return;
  const today = new Date().toISOString().slice(0, 10);
  await capWait(sendPatientText({
    kind: 'lab_ready',
    refKey: `${patientId}:${today}`,
    patientId,
    message: (n, s) =>
      `Hello ${n}, your lab results at ${s.clinicName} are ready. Your doctor will go over them with you.${callLine(s)}`,
  }));
};

/** Medicines handed to the courier. Once per delivery; never names a medicine. */
export const textDeliveryOnTheWay = async (deliveryId: number, patientId: number): Promise<void> => {
  try {
    await capWait(sendPatientText({
      kind: 'delivery',
      refKey: `${deliveryId}:out_for_delivery`,
      patientId,
      message: (n, s) =>
        `Hello ${n}, your order from the ${s.clinicName} pharmacy is on its way to you.${callLine(s)}`,
    }));
  } catch (err) {
    console.error(`[patient-text] delivery ${deliveryId} failed:`, err);
  }
};

/** The doctor set off for a home visit. Once per visit. */
export const textHomeVisitOnTheWay = async (
  appointmentId: number,
  patientId: number,
  doctorLastName: string | null | undefined
): Promise<TextOutcome | 'sending'> => {
  // 'sending' = the SMS provider is slow; the text carries on in the background.
  let outcome: TextOutcome | 'sending' = 'sending';
  await capWait(
    sendPatientText({
      kind: 'home_visit',
      refKey: `${appointmentId}:on_the_way`,
      patientId,
      message: (n, s) =>
        `Hello ${n}, ${doctorLastName ? `Dr ${doctorLastName}` : 'your doctor'} from ${s.clinicName} is on the way for your home visit.${callLine(s)}`,
    }).then((o) => { outcome = o; })
  );
  return outcome;
};

/** Pharmacy marked an order ready. At most one text per patient per day. */
export const textMedicationReady = async (patientId: number | null | undefined): Promise<void> => {
  if (!patientId) return;
  const today = new Date().toISOString().slice(0, 10);
  await capWait(sendPatientText({
    kind: 'pharmacy_ready',
    refKey: `${patientId}:${today}`,
    patientId,
    message: (n, s) =>
      `Hello ${n}, your medication is ready for pickup at the ${s.clinicName} pharmacy.${callLine(s)}`,
  }));
};

/** A patient payment was recorded. One text per payment. */
export const textPaymentReceipt = async (paymentId: number): Promise<void> => {
  try {
    await capWait(sendPaymentReceipt(paymentId));
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

/**
 * After a visit: a 7-day portal link straight to that visit's summary and
 * invoice (the patient confirms their date of birth first). Sent at checkout;
 * visits that finish without a checkout are picked up by the daily run.
 */
const sendVisitSummary = async (encounterId: number, patientId: number, s: TextSettings): Promise<TextOutcome> => {
  if (!s.enabled.visit_summary) return 'skipped';
  // Already sent for this visit? Don't mint a fresh link just to be skipped.
  const done = await pool.query(
    `SELECT 1 FROM patient_sms_log WHERE kind = 'visit_summary' AND ref_key = $1 AND status IN ('sent', 'pending')`,
    [String(encounterId)]
  );
  if (done.rows.length) return 'skipped';
  const token = await createPortalToken(patientId, { purpose: 'notify', target: `visit:${encounterId}`, deliveryMethod: 'auto' });
  const link = portalLinkFor(token);
  return sendPatientText({
    kind: 'visit_summary',
    refKey: String(encounterId),
    patientId,
    settings: s,
    message: (n, st) =>
      `Hello ${n}, thank you for visiting ${st.clinicName}. Your visit summary and invoice: ${link} (valid 7 days).`,
    email: (n, st) => ({
      subject: `Your visit summary from ${st.clinicName}`,
      body: [
        `Hello ${n},`,
        '',
        `Thank you for visiting ${st.clinicName}. Your visit summary and invoice are ready:`,
        '',
        link,
        '',
        "The link is valid for 7 days and you'll be asked to confirm your date of birth.",
        '',
        st.clinicName,
      ].join('\n'),
    }),
  });
};

/** Patient checked out. Never throws. */
export const textVisitSummary = async (encounterId: number | null | undefined): Promise<void> => {
  if (!encounterId) return;
  try {
    const e = await pool.query(`SELECT patient_id FROM encounters WHERE id = $1`, [encounterId]);
    if (!e.rows[0]?.patient_id) return;
    const s = await getTextSettings();
    await capWait(sendVisitSummary(encounterId, e.rows[0].patient_id, s));
  } catch (err) {
    console.error(`[patient-text] visit summary ${encounterId} failed:`, err);
  }
};

// ---------------------------------------------------------------------------
// Daily reminders
// ---------------------------------------------------------------------------

export interface DailyRunResult {
  appointment: Record<TextOutcome, number>;
  follow_up: Record<TextOutcome, number>;
  refill: Record<TextOutcome, number>;
  visit_summary: Record<TextOutcome, number>;
}

const tally = () => ({ sent: 0, failed: 0, skipped: 0 });

export const runDailyPatientTexts = async (): Promise<DailyRunResult> => {
  const s = await getTextSettings();
  const result: DailyRunResult = { appointment: tally(), follow_up: tally(), refill: tally(), visit_summary: tally() };

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
      `SELECT a.id, a.patient_id, (a.location_type = 'home') AS is_home,
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
          a.is_home
            ? `Hello ${n}, reminder: a doctor from ${st.clinicName} will visit you at home tomorrow, ${a.date_label}${a.time_label}. To change the time${st.clinicPhone ? `, call ${st.clinicPhone}` : ', please contact us'}.`
            : `Hello ${n}, reminder: you have an appointment at ${st.clinicName} tomorrow, ${a.date_label}${a.time_label}. To reschedule${st.clinicPhone ? `, call ${st.clinicPhone}` : ', please contact us'}.`,
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

  if (s.enabled.visit_summary) {
    // Visits that finished in the last day without a checkout text. Only the
    // last day: switching the text on must not message every past patient.
    const done = await pool.query(
      `SELECT e.id, e.patient_id
         FROM encounters e
        WHERE e.status IN ('completed', 'discharged')
          AND e.patient_id IS NOT NULL
          AND COALESCE(e.discharged_at, e.completed_at) > NOW() - INTERVAL '1 day'
          AND NOT EXISTS (
            SELECT 1 FROM patient_sms_log l
             WHERE l.kind = 'visit_summary' AND l.ref_key = e.id::text AND l.status IN ('sent', 'pending')
          )`
    );
    for (const e of done.rows) {
      result.visit_summary[await sendVisitSummary(e.id, e.patient_id, s)]++;
    }
  }

  console.log('[patient-text] daily run', JSON.stringify(result));
  return result;
};

// ---------------------------------------------------------------------------
// Portal invitation (one-off, sent by an admin in batches)
// ---------------------------------------------------------------------------

/** Who gets invited: seen recently, so the number is likely still theirs. */
export const PORTAL_INVITE_MONTHS = 6;

/**
 * The invite carries the plain portal address, never a personal link: a
 * personal link texted to an old or recycled number would hand a stranger a
 * ready-made way in. The patient enters their own phone and gets a fresh
 * 15-minute link.
 */
export const portalInviteMessage = (name: string, s: { clinicName: string; clinicPhone: string }): string =>
  // Kept under 160 characters (one SMS) for typical names.
  `Hello ${name}, ${s.clinicName} now has a patient portal. See your results, bills and visit notes at ` +
  `${getBaseUrl()}/portal${s.clinicPhone ? ` Call ${s.clinicPhone}.` : ''}`;

interface InviteCandidate { patient_id: number; first_name: string; phone: string }

/**
 * Patients to invite, one per phone number (a family sharing a phone gets one
 * text — anyone on it can sign in). Skips: not seen in the last 6 months,
 * opted out, merged, an unusable date of birth (they could never pass the
 * check), already signed in to the portal, or a number already invited.
 */
export const portalInviteCandidates = async (): Promise<InviteCandidate[]> => {
  const r = await pool.query(
    `WITH c AS (
       SELECT p.id AS patient_id, u.first_name, u.phone,
              RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 9) AS phone9,
              (SELECT MAX(e.checked_in_at) FROM encounters e WHERE e.patient_id = p.id) AS last_visit
         FROM patients p
         JOIN users u ON u.id = p.user_id
        WHERE u.role = 'patient' AND u.is_active = true AND p.merged_into IS NULL
          AND COALESCE(p.sms_reminders_opt_out, false) = false
          AND p.date_of_birth BETWEEN DATE '1910-01-01' AND CURRENT_DATE
          AND NOT EXISTS (SELECT 1 FROM patient_portal_access_tokens t WHERE t.patient_id = p.id AND t.used_at IS NOT NULL)
     )
     SELECT DISTINCT ON (c.phone9) c.patient_id, c.first_name, c.phone, c.last_visit
       FROM c
      WHERE LENGTH(c.phone9) = 9
        AND c.last_visit > NOW() - ($1 || ' months')::interval
        AND NOT EXISTS (
          SELECT 1 FROM patient_sms_log l
           WHERE l.kind = 'portal_invite' AND l.status IN ('sent', 'pending')
             AND RIGHT(REGEXP_REPLACE(COALESCE(l.destination, ''), '[^0-9]', '', 'g'), 9) = c.phone9)
      ORDER BY c.phone9, c.last_visit DESC`,
    [String(PORTAL_INVITE_MONTHS)]
  );
  return r.rows
    .filter((row) => validatePhoneNumber(row.phone).valid)
    .sort((a, b) => new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime())
    .map(({ patient_id, first_name, phone }) => ({ patient_id, first_name, phone }));
};

/** Send the next batch of invites. Small batches keep each request short. */
export const sendPortalInviteBatch = async (
  limit: number
): Promise<{ sent: number; failed: number; skipped: number; remaining: number }> => {
  const s = await getTextSettings();
  const batch = (await portalInviteCandidates()).slice(0, Math.max(1, Math.min(limit, 25)));
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const c of batch) {
    const r = await sendPatientText({
      kind: 'portal_invite',
      refKey: String(c.patient_id),
      patientId: c.patient_id,
      settings: s,
      manual: true,
      message: (n, st) => portalInviteMessage(n, st),
    });
    out[r] += 1;
  }
  const remaining = (await portalInviteCandidates()).length;
  return { ...out, remaining };
};

/** For the admin screen: how many would be invited and the exact wording. */
export const portalInvitePreview = async () => {
  const s = await getTextSettings();
  const candidates = await portalInviteCandidates();
  const sent = await pool.query(
    `SELECT COUNT(*)::int AS n FROM patient_sms_log WHERE kind = 'portal_invite' AND status = 'sent'`
  );
  const example = portalInviteMessage(firstName(candidates[0]?.first_name) || 'Ama', s);
  return { eligible: candidates.length, already_sent: sent.rows[0].n, months: PORTAL_INVITE_MONTHS, example, characters: example.length };
};
