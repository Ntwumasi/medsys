import { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import pool from '../database/db';
import auditService from '../services/auditService';
import billingService from '../services/billingService';
import { getOrCreateEncounterInvoice } from '../services/invoiceResolver';
import { resolvePrice } from '../services/priceResolutionService';
import { textHomeVisitOnTheWay, textVisitSummary } from '../services/patientAutoTextService';
import { getNextMonOrThu } from './nurseFollowUpTaskController';

/**
 * Home visits.
 *
 * A home visit is booked as an appointment with location_type 'home' (address,
 * GPS code, landmark, contact phone, doctor and optional nurse). At the house
 * the doctor — or the nurse going with them — taps "Start visit", which opens
 * a home-visit encounter: no room, no reception queue, billed CONS-HOME (first
 * home visit) or CONS-HOME-FU (any later one). The doctor records vitals,
 * notes, diagnoses and orders on the usual screens, and signing off closes the
 * visit (finishHomeVisit) instead of sending the patient back to a nurse.
 */

const isSuperAdmin = (req: Request) => (req as any).user?.is_super_admin === true;
const userRole = (req: Request): string => (req as any).user?.role;
const userId = (req: Request): number => (req as any).user?.id;

const VISIT_SELECT = `
  SELECT a.id, a.patient_id, a.appointment_date, a.duration_minutes, a.status, a.reason, a.notes,
         a.provider_id, a.nurse_id, a.encounter_id,
         COALESCE(NULLIF(a.visit_address, ''), p.address) AS visit_address,
         COALESCE(NULLIF(a.visit_gps_address, ''), p.gps_address) AS visit_gps_address,
         COALESCE(NULLIF(a.visit_landmark, ''), p.landmark) AS visit_landmark,
         COALESCE(NULLIF(a.visit_contact_phone, ''), u.phone) AS visit_contact_phone,
         p.city, p.region,
         p.patient_number, p.date_of_birth, p.gender,
         COALESCE(u.first_name || ' ' || u.last_name, a.patient_name) AS patient_name,
         d.first_name || ' ' || d.last_name AS provider_name,
         n.first_name || ' ' || n.last_name AS nurse_name,
         e.status AS encounter_status
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users d ON d.id = a.provider_id
    LEFT JOIN users n ON n.id = a.nurse_id
    LEFT JOIN encounters e ON e.id = a.encounter_id`;

/**
 * GET /home-visits?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=mine|all
 * Doctors and nurses see their own visits (as doctor or as the nurse going
 * along) unless they ask for scope=all; reception and admins see everyone's.
 */
export const listHomeVisits = async (req: Request, res: Response): Promise<void> => {
  try {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof req.query.from === 'string' && dateRe.test(req.query.from) ? req.query.from : null;
    const to = typeof req.query.to === 'string' && dateRe.test(req.query.to) ? req.query.to : null;
    const clinician = ['doctor', 'nurse'].includes(userRole(req));
    const mine = req.query.scope === 'mine' || (clinician && req.query.scope !== 'all');

    const params: any[] = [];
    const clauses = [`a.location_type = 'home'`, `a.status NOT IN ('cancelled', 'no-show')`];
    if (from) {
      params.push(from);
      clauses.push(`a.appointment_date::date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      clauses.push(`a.appointment_date::date <= $${params.length}::date`);
    }
    if (mine) {
      params.push(userId(req));
      clauses.push(`(a.provider_id = $${params.length} OR a.nurse_id = $${params.length})`);
    }
    const result = await pool.query(
      `${VISIT_SELECT}
        WHERE ${clauses.join(' AND ')}
        ORDER BY a.appointment_date ASC
        LIMIT 200`,
      params
    );
    res.json({ visits: result.rows });
  } catch (error) {
    console.error('List home visits error:', error);
    res.status(500).json({ error: 'Failed to load home visits' });
  }
};

/** First home visit for this patient → CONS-HOME, otherwise CONS-HOME-FU. */
const homeVisitCharge = async (client: PoolClient, patientId: number, encounterId: number) => {
  const previous = await client.query(
    `SELECT 1 FROM encounters
      WHERE patient_id = $1 AND id <> $2 AND is_home_visit = true AND status <> 'cancelled'
      LIMIT 1`,
    [patientId, encounterId]
  );
  const code = previous.rows.length > 0 ? 'CONS-HOME-FU' : 'CONS-HOME';
  const charge = await client.query(
    `SELECT id, service_name, price FROM charge_master WHERE service_code = $1 AND is_active = true LIMIT 1`,
    [code]
  );
  return { code, charge: charge.rows[0] || null };
};

/**
 * POST /home-visits/:id/start — at the house. Opens the home-visit encounter
 * for the booking (or returns the one already opened) and bills the visit.
 */
export const startHomeVisit = async (req: Request, res: Response): Promise<void> => {
  const appointmentId = parseInt(req.params.id as string, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const apptRes = await client.query(`SELECT * FROM appointments WHERE id = $1 FOR UPDATE`, [appointmentId]);
    const appt = apptRes.rows[0];
    if (!appt || appt.location_type !== 'home') {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Home visit not found' });
      return;
    }
    if (appt.encounter_id) {
      await client.query('ROLLBACK');
      res.json({ encounter_id: appt.encounter_id, already_started: true });
      return;
    }
    if (['cancelled', 'no-show', 'completed'].includes(appt.status)) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: `This visit is ${appt.status}` });
      return;
    }
    if (!appt.patient_id) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'This booking has no registered patient. Register the patient and link them to the visit first.' });
      return;
    }
    const me = userId(req);
    const role = userRole(req);
    const allowed = isSuperAdmin(req) || role === 'admin'
      || (role === 'doctor' && (appt.provider_id === me || appt.provider_id == null))
      || (role === 'nurse' && appt.nurse_id === me);
    if (!allowed) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Only the doctor or nurse assigned to this visit can start it' });
      return;
    }
    const providerId = appt.provider_id ?? (role === 'doctor' ? me : null);

    const enc = await client.query(
      `INSERT INTO encounters (
         patient_id, provider_id, nurse_id, encounter_date, encounter_type, chief_complaint,
         status, checked_in_at, triage_time, triage_priority, clinic, is_home_visit, appointment_id
       ) VALUES ($1, $2, $3, NOW(), 'home-visit', $4, 'in-progress', NOW(), NOW(), 'green', 'Home visit', true, $5)
       RETURNING id`,
      [appt.patient_id, providerId, appt.nurse_id, appt.reason || null, appointmentId]
    );
    const encounterId = enc.rows[0].id;

    // The visit gets its own invoice (never merged into a same-day clinic bill).
    const invoiceId = await getOrCreateEncounterInvoice(encounterId, client);
    const { code, charge } = await homeVisitCharge(client, appt.patient_id, encounterId);
    let price = charge ? Number(charge.price) || 0 : 0;
    let billTo: 'patient' | 'payer' = 'payer';
    if (charge) {
      const resolved = await resolvePrice(charge.id, invoiceId, client);
      price = resolved.unitPrice;
      if (resolved.isExcluded) billTo = 'patient';
    }
    await client.query(
      `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category, bill_to)
       VALUES ($1, $2, $3, 1, $4, $4, 'consultation', $5)`,
      [invoiceId, charge?.id || null, charge && price > 0 ? charge.service_name : `Home visit [PRICE PENDING]`, price, billTo]
    );
    await client.query(
      `UPDATE invoices
          SET subtotal = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0),
              total_amount = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0) + COALESCE(tax, 0),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [invoiceId]
    );
    await client.query(
      `UPDATE appointments
          SET status = 'in-progress', encounter_id = $2, provider_id = COALESCE(provider_id, $3), updated_at = NOW()
        WHERE id = $1`,
      [appointmentId, encounterId, providerId]
    );
    await client.query('COMMIT');

    await auditService.log({
      userId: me,
      action: 'create',
      entityType: 'encounter',
      entityId: encounterId,
      details: { home_visit: true, appointment_id: appointmentId, patient_id: appt.patient_id, charge: code },
    });
    res.status(201).json({ encounter_id: encounterId, invoice_id: invoiceId });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Start home visit error:', error);
    res.status(500).json({ error: 'Failed to start the home visit' });
  } finally {
    client.release();
  }
};

/** POST /home-visits/:id/on-my-way — text the patient that the doctor is coming. */
export const homeVisitOnMyWay = async (req: Request, res: Response): Promise<void> => {
  try {
    const appointmentId = parseInt(req.params.id as string, 10);
    const r = await pool.query(
      `SELECT a.id, a.patient_id, a.location_type, a.status, d.last_name AS doctor_last_name
         FROM appointments a LEFT JOIN users d ON d.id = a.provider_id
        WHERE a.id = $1`,
      [appointmentId]
    );
    const appt = r.rows[0];
    if (!appt || appt.location_type !== 'home') {
      res.status(404).json({ error: 'Home visit not found' });
      return;
    }
    if (!appt.patient_id) {
      res.status(400).json({ error: 'This booking has no registered patient to text' });
      return;
    }
    const outcome = await textHomeVisitOnTheWay(appt.id, appt.patient_id, appt.doctor_last_name);
    res.json({ outcome });
  } catch (error) {
    console.error('Home visit on-my-way error:', error);
    res.status(500).json({ error: 'Failed to text the patient' });
  }
};

/**
 * Close a home visit when the doctor signs off. Called by doctorCompleteEncounter
 * once the diagnosis rule has passed. There is no reception checkout for a home
 * visit, so this does what checkout does: final billing, close, the nurse's
 * follow-up call and the after-visit text. The invoice stays open for payment.
 */
export const finishHomeVisit = async (encounterId: number, doctorId: number): Promise<void> => {
  const enc = await pool.query(
    `UPDATE encounters
        SET status = 'discharged', completed_at = COALESCE(completed_at, NOW()),
            discharged_at = NOW(), room_id = NULL, updated_at = NOW()
      WHERE id = $1
      RETURNING patient_id, appointment_id, provider_id`,
    [encounterId]
  );
  const row = enc.rows[0];
  if (!row) return;
  if (row.appointment_id) {
    await pool.query(`UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1`, [row.appointment_id]);
  }
  try {
    await billingService.generateEncounterInvoice(encounterId);
  } catch (billingError) {
    console.error('Home visit final billing failed:', billingError);
  }
  await pool.query(
    `UPDATE alerts SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE encounter_id = $1 AND is_read = false`,
    [encounterId]
  );
  const review = await pool.query(
    `SELECT 1 FROM nurse_follow_up_tasks WHERE encounter_id = $1 AND type = 'review'`,
    [encounterId]
  );
  if (review.rows.length === 0 && row.patient_id) {
    await pool.query(
      `INSERT INTO nurse_follow_up_tasks (encounter_id, patient_id, type, scheduled_date)
       VALUES ($1, $2, 'follow_up', $3) ON CONFLICT DO NOTHING`,
      [encounterId, row.patient_id, getNextMonOrThu()]
    );
  }
  await auditService.log({
    userId: doctorId,
    action: 'complete',
    entityType: 'encounter',
    entityId: encounterId,
    details: { home_visit: true, patient_id: row.patient_id },
  });
  await textVisitSummary(encounterId);
};
