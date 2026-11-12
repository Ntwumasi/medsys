import { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import pool from '../database/db';
import auditService from '../services/auditService';
import { getOrCreateEncounterInvoice } from '../services/invoiceResolver';
import { resolvePrice } from '../services/priceResolutionService';

/**
 * Short Stay Unit.
 *
 * A patient admitted to a bed opens a "stay": admitting doctor, reason, how
 * often obs are due. During the stay nurses record observations (ordinary
 * vitals, so critical alerts and the chart keep working), medicines and drips
 * given, notes and handovers, and can move the patient to another bed.
 * Discharge records the condition, a note and follow-up, frees the bed and
 * settles the short stay charge: one unit of the nurses' "SHORT STAY" charge
 * (service code 'NUR- SS', the one already billed by hand on prod) per started
 * 24 hours, the first at admission. Short stay already added by hand on the
 * visit counts towards it, so nothing is charged twice.
 */

export const DETENTION_CODE = 'NUR- SS';
export const DETENTION_UNIT_HOURS = 24;
const ENTRY_KINDS = ['medication', 'fluid', 'note', 'handover'] as const;
const DISCHARGE_CONDITIONS = ['improved', 'stable', 'referred', 'against_advice', 'deceased', 'other'] as const;

const me = (req: Request): number => (req as any).user?.id;

const str = (v: unknown, max = 2000): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** Detention units for a stay: one per started 24 hours, at least one. */
export const detentionUnits = (admittedAt: Date, until: Date = new Date()): number => {
  const hours = Math.max(0, (until.getTime() - admittedAt.getTime()) / 3_600_000);
  return Math.max(1, Math.ceil(hours / DETENTION_UNIT_HOURS));
};

/** When the next obs are due: interval after the last obs, or after admission. */
export const nextObsDue = (admittedAt: Date, lastObsAt: Date | null, intervalMinutes: number): Date =>
  new Date((lastObsAt && lastObsAt > admittedAt ? lastObsAt : admittedAt).getTime() + intervalMinutes * 60_000);

const recalcInvoice = async (client: PoolClient, invoiceId: number) => {
  await client.query(
    `UPDATE invoices
        SET subtotal = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0),
            total_amount = COALESCE((SELECT SUM(total_price) FROM invoice_items WHERE invoice_id = $1), 0) + COALESCE(tax, 0),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [invoiceId]
  );
  await client.query(
    `UPDATE invoices
        SET status = CASE
              WHEN COALESCE(amount_paid, 0) >= total_amount AND total_amount > 0 THEN 'paid'
              WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
              ELSE 'pending' END
      WHERE id = $1 AND status <> 'cancelled'`,
    [invoiceId]
  );
};

/**
 * Bring the stay's Detention line up to `units`. Never lowers a charge already
 * made; counts detention billed by hand on the same invoice. Returns the
 * units now billed.
 */
const billDetention = async (
  client: PoolClient,
  stay: { id: number; encounter_id: number | null; detention_item_id: number | null; billed_units: number; bill_detention: boolean },
  units: number
): Promise<number> => {
  if (!stay.bill_detention || !stay.encounter_id) return stay.billed_units;
  const charge = await client.query(
    `SELECT id, BTRIM(service_name) AS service_name, price, category FROM charge_master WHERE service_code = $1 AND is_active = true LIMIT 1`,
    [DETENTION_CODE]
  );
  if (!charge.rows[0]) {
    // Never skip quietly: an unbilled stay is lost revenue nobody notices.
    console.error(`Short stay ${stay.id} NOT billed: no active charge_master row with service_code '${DETENTION_CODE}'`);
    return stay.billed_units;
  }
  const invoiceId = await getOrCreateEncounterInvoice(stay.encounter_id, client);

  // Detention already on the invoice that isn't this stay's own line (a doctor
  // added it by hand) counts towards the stay.
  const other = await client.query(
    `SELECT COALESCE(SUM(quantity), 0)::int AS qty FROM invoice_items
      WHERE invoice_id = $1 AND charge_master_id = $2 AND ($3::int IS NULL OR id <> $3)`,
    [invoiceId, charge.rows[0].id, stay.detention_item_id]
  );
  const own = stay.detention_item_id
    ? (await client.query(`SELECT quantity FROM invoice_items WHERE id = $1`, [stay.detention_item_id])).rows[0]
    : null;
  const ownQty = own ? Number(own.quantity) || 0 : 0;
  const alreadyBilled = ownQty + Number(other.rows[0].qty);
  if (alreadyBilled >= units) return Math.max(stay.billed_units, units);

  const resolved = await resolvePrice(charge.rows[0].id, invoiceId, client);
  const unitPrice = resolved.unitPrice;
  const billTo = resolved.isExcluded ? 'patient' : 'payer';
  const newOwnQty = ownQty + (units - alreadyBilled);
  let itemId = stay.detention_item_id;
  if (own) {
    await client.query(
      `UPDATE invoice_items SET quantity = $2::int, unit_price = $3::numeric, total_price = $2::int * $3::numeric WHERE id = $1`,
      [itemId, newOwnQty, unitPrice]
    );
  } else {
    const ins = await client.query(
      `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category, bill_to)
       VALUES ($1, $2, $3, $4::int, $5::numeric, $4::int * $5::numeric, $6, $7) RETURNING id`,
      [invoiceId, charge.rows[0].id, charge.rows[0].service_name, newOwnQty, unitPrice, charge.rows[0].category || 'procedure', billTo]
    );
    itemId = ins.rows[0].id;
  }
  await recalcInvoice(client, invoiceId);
  await client.query(
    `UPDATE short_stays SET detention_item_id = $2, billed_units = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [stay.id, itemId, units]
  );
  return units;
};

const STAY_SELECT = `
  SELECT s.*,
         b.bed_number, b.bed_name,
         u.first_name || ' ' || u.last_name AS patient_name,
         p.patient_number, p.gender,
         CASE WHEN p.date_of_birth > DATE '1900-01-01' THEN p.date_of_birth END AS patient_date_of_birth,
         d.first_name || ' ' || d.last_name AS doctor_name,
         ab.first_name || ' ' || ab.last_name AS admitted_by_name,
         db.first_name || ' ' || db.last_name AS discharged_by_name,
         e.encounter_number,
         (SELECT MAX(v.recorded_at) FROM vital_signs_history v
           WHERE v.encounter_id = s.encounter_id AND v.recorded_at >= s.admitted_at) AS last_obs_at
    FROM short_stays s
    JOIN short_stay_beds b ON b.id = s.bed_id
    JOIN patients p ON p.id = s.patient_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users d ON d.id = s.doctor_id
    LEFT JOIN users ab ON ab.id = s.admitted_by
    LEFT JOIN users db ON db.id = s.discharged_by
    LEFT JOIN encounters e ON e.id = s.encounter_id
`;

const withTiming = (s: any) => {
  if (!s) return s;
  const admitted = new Date(s.admitted_at);
  const last = s.last_obs_at ? new Date(s.last_obs_at) : null;
  const due = nextObsDue(admitted, last, Number(s.obs_interval_minutes) || 60);
  return {
    ...s,
    obs_next_due: s.status === 'admitted' ? due.toISOString() : null,
    obs_overdue: s.status === 'admitted' && due.getTime() < Date.now(),
    hours_in_bed: Math.round(((s.discharged_at ? new Date(s.discharged_at) : new Date()).getTime() - admitted.getTime()) / 360_000) / 10,
  };
};

/** GET /short-stay/beds — every bed with its open stay (the bed board). */
export const getShortStayBeds = async (_req: Request, res: Response) => {
  try {
    const beds = await pool.query(`
      SELECT b.id, b.bed_number, b.bed_name, b.is_available, b.current_encounter_id, b.patient_id,
             b.assigned_at, b.notes, b.current_stay_id,
             p.patient_number,
             u.first_name || ' ' || u.last_name AS patient_name,
             au.first_name || ' ' || au.last_name AS assigned_by_name
        FROM short_stay_beds b
        LEFT JOIN patients p ON b.patient_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN users au ON b.assigned_by = au.id
       WHERE COALESCE(b.is_active, true) = true
       ORDER BY b.bed_number
    `);
    const stayIds = beds.rows.map((b) => b.current_stay_id).filter(Boolean);
    const stays = stayIds.length
      ? (await pool.query(`${STAY_SELECT} WHERE s.id = ANY($1)`, [stayIds])).rows.map(withTiming)
      : [];
    const patientIds = stays.map((s) => s.patient_id);
    const allergies = patientIds.length
      ? (await pool.query(
          `SELECT patient_id, allergen, reaction, severity FROM allergies WHERE patient_id = ANY($1) ORDER BY severity DESC`,
          [patientIds]
        )).rows
      : [];
    const lastObs = stays.length
      ? (await pool.query(
          `SELECT DISTINCT ON (v.encounter_id) v.encounter_id, v.recorded_at, v.temperature, v.temperature_unit,
                  v.blood_pressure_systolic, v.blood_pressure_diastolic, v.heart_rate, v.respiratory_rate, v.oxygen_saturation
             FROM vital_signs_history v
            WHERE v.encounter_id = ANY($1)
            ORDER BY v.encounter_id, v.recorded_at DESC`,
          [stays.map((s) => s.encounter_id).filter(Boolean)]
        )).rows
      : [];
    res.json({
      beds: beds.rows.map((b) => {
        const stay = stays.find((s) => s.id === b.current_stay_id) || null;
        return {
          ...b,
          stay: stay && {
            ...stay,
            allergies: allergies.filter((a) => a.patient_id === stay.patient_id),
            last_obs: lastObs.find((o) => o.encounter_id === stay.encounter_id && new Date(o.recorded_at) >= new Date(stay.admitted_at)) || null,
          },
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching short stay beds:', error);
    res.status(500).json({ error: 'Failed to fetch short stay beds' });
  }
};

/**
 * POST /short-stay/assign { bed_id, encounter_id, patient_id, notes|reason,
 * doctor_id, obs_interval_minutes } — admit to a bed. Bills the first
 * Detention unit.
 */
export const assignBed = async (req: Request, res: Response) => {
  const bedId = Number(req.body?.bed_id);
  const encounterId = Number(req.body?.encounter_id);
  const patientId = Number(req.body?.patient_id);
  const reason = str(req.body?.reason) ?? str(req.body?.notes);
  const interval = req.body?.obs_interval_minutes === undefined ? 60 : Number(req.body.obs_interval_minutes);

  if (!bedId || !encounterId || !patientId) {
    return res.status(400).json({ error: 'bed_id, encounter_id, and patient_id are required' });
  }
  if (!Number.isInteger(interval) || interval < 15 || interval > 1440) {
    return res.status(400).json({ error: 'Obs interval must be between 15 minutes and 24 hours.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bed = await client.query(`SELECT id, bed_name, is_available FROM short_stay_beds WHERE id = $1 FOR UPDATE`, [bedId]);
    if (!bed.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bed not found' });
    }
    if (!bed.rows[0].is_available) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bed is already occupied' });
    }
    const already = await client.query(
      `SELECT b.bed_name FROM short_stays s JOIN short_stay_beds b ON b.id = s.bed_id
        WHERE s.patient_id = $1 AND s.status = 'admitted'`,
      [patientId]
    );
    if (already.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Patient is already assigned to ${already.rows[0].bed_name}` });
    }
    const enc = await client.query(`SELECT id, patient_id, provider_id FROM encounters WHERE id = $1`, [encounterId]);
    if (!enc.rows[0] || Number(enc.rows[0].patient_id) !== patientId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "That visit doesn't belong to this patient." });
    }
    const doctorId = Number(req.body?.doctor_id) || enc.rows[0].provider_id || ((req as any).user?.role === 'doctor' ? me(req) : null);

    const stay = await client.query(
      `INSERT INTO short_stays (bed_id, patient_id, encounter_id, reason, doctor_id, obs_interval_minutes, admitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [bedId, patientId, encounterId, reason, doctorId, interval, me(req)]
    );
    await client.query(
      `UPDATE short_stay_beds
          SET is_available = false, current_encounter_id = $1, patient_id = $2, assigned_at = CURRENT_TIMESTAMP,
              assigned_by = $3, notes = $4, current_stay_id = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6`,
      [encounterId, patientId, me(req), reason, stay.rows[0].id, bedId]
    );
    await billDetention(client, stay.rows[0], 1);
    await client.query('COMMIT');

    await auditService.log({
      userId: me(req), action: 'create', entityType: 'short_stay', entityId: stay.rows[0].id,
      details: { bed_id: bedId, patient_id: patientId, encounter_id: encounterId, reason },
    });
    const full = await pool.query(`${STAY_SELECT} WHERE s.id = $1`, [stay.rows[0].id]);
    res.json({ message: 'Patient assigned to short stay bed successfully', stay: withTiming(full.rows[0]), bed: { id: bedId } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error assigning short stay bed:', error);
    res.status(500).json({ error: 'Failed to assign bed' });
  } finally {
    client.release();
  }
};

/** Close a stay: discharge details, final Detention units, free the bed. */
const dischargeStay = async (
  client: PoolClient,
  stay: any,
  userId: number,
  details: { condition: string | null; note: string | null; follow_up: string | null }
) => {
  const units = detentionUnits(new Date(stay.admitted_at));
  await billDetention(client, stay, units);
  await client.query(
    `UPDATE short_stays
        SET status = 'discharged', discharged_at = CURRENT_TIMESTAMP, discharged_by = $2,
            discharge_condition = $3, discharge_note = $4, follow_up = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [stay.id, userId, details.condition, details.note, details.follow_up]
  );
  await client.query(
    `UPDATE short_stay_beds
        SET is_available = true, current_encounter_id = NULL, patient_id = NULL, assigned_at = NULL,
            assigned_by = NULL, notes = NULL, current_stay_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [stay.bed_id]
  );
  return units;
};

/** POST /short-stay/release/:bed_id — discharge whoever is in the bed (kept for the dashboard strip). */
export const releaseBed = async (req: Request, res: Response) => {
  const bedId = Number(req.params.bed_id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bed = await client.query(`SELECT * FROM short_stay_beds WHERE id = $1 FOR UPDATE`, [bedId]);
    if (!bed.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bed not found' });
    }
    const stay = await client.query(
      `SELECT * FROM short_stays WHERE bed_id = $1 AND status = 'admitted' FOR UPDATE`,
      [bedId]
    );
    if (stay.rows[0]) {
      await dischargeStay(client, stay.rows[0], me(req), {
        condition: str(req.body?.condition, 30), note: str(req.body?.note), follow_up: str(req.body?.follow_up),
      });
    } else {
      await client.query(
        `UPDATE short_stay_beds
            SET is_available = true, current_encounter_id = NULL, patient_id = NULL, assigned_at = NULL,
                assigned_by = NULL, notes = NULL, current_stay_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [bedId]
      );
    }
    await client.query('COMMIT');
    if (stay.rows[0]) {
      await auditService.log({ userId: me(req), action: 'update', entityType: 'short_stay', entityId: stay.rows[0].id, details: { discharged: true } });
    }
    res.json({ message: 'Bed released successfully', bed: { id: bedId } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error releasing short stay bed:', error);
    res.status(500).json({ error: 'Failed to release bed' });
  } finally {
    client.release();
  }
};

/** POST /short-stay/stays/:id/discharge { condition, note, follow_up } */
export const dischargeShortStay = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const condition = str(req.body?.condition, 30);
  if (!condition || !(DISCHARGE_CONDITIONS as readonly string[]).includes(condition)) {
    return res.status(400).json({ error: 'Choose the patient’s condition at discharge.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stay = await client.query(`SELECT * FROM short_stays WHERE id = $1 FOR UPDATE`, [id]);
    if (!stay.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Stay not found' });
    }
    if (stay.rows[0].status !== 'admitted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This patient has already been discharged.' });
    }
    const units = await dischargeStay(client, stay.rows[0], me(req), {
      condition, note: str(req.body?.note), follow_up: str(req.body?.follow_up),
    });
    await client.query('COMMIT');
    await auditService.log({ userId: me(req), action: 'update', entityType: 'short_stay', entityId: id, details: { discharged: true, condition, units } });
    const full = await pool.query(`${STAY_SELECT} WHERE s.id = $1`, [id]);
    res.json({ stay: withTiming(full.rows[0]), detention_units: units });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Discharge short stay error:', error);
    res.status(500).json({ error: 'Failed to discharge' });
  } finally {
    client.release();
  }
};

/** POST /short-stay/stays/:id/transfer { bed_id } — move to another free bed. */
export const transferShortStay = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const toBed = Number(req.body?.bed_id);
  if (!toBed) return res.status(400).json({ error: 'Choose the bed to move to.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stay = await client.query(`SELECT * FROM short_stays WHERE id = $1 FOR UPDATE`, [id]);
    const s = stay.rows[0];
    if (!s || s.status !== 'admitted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only an admitted patient can be moved.' });
    }
    if (s.bed_id === toBed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The patient is already in that bed.' });
    }
    const target = await client.query(
      `SELECT id, bed_name, is_available FROM short_stay_beds WHERE id = $1 AND COALESCE(is_active, true) FOR UPDATE`,
      [toBed]
    );
    if (!target.rows[0] || !target.rows[0].is_available) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That bed isn’t free.' });
    }
    const from = await client.query(`SELECT bed_name, notes, assigned_at, assigned_by FROM short_stay_beds WHERE id = $1 FOR UPDATE`, [s.bed_id]);
    await client.query(
      `UPDATE short_stay_beds
          SET is_available = true, current_encounter_id = NULL, patient_id = NULL, assigned_at = NULL,
              assigned_by = NULL, notes = NULL, current_stay_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [s.bed_id]
    );
    await client.query(
      `UPDATE short_stay_beds
          SET is_available = false, current_encounter_id = $1, patient_id = $2, assigned_at = $3,
              assigned_by = $4, notes = $5, current_stay_id = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7`,
      [s.encounter_id, s.patient_id, from.rows[0]?.assigned_at || s.admitted_at, from.rows[0]?.assigned_by || s.admitted_by,
        from.rows[0]?.notes || s.reason, s.id, toBed]
    );
    await client.query(`UPDATE short_stays SET bed_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id, toBed]);
    await client.query(
      `INSERT INTO short_stay_entries (stay_id, kind, detail, recorded_by) VALUES ($1, 'transfer', $2, $3)`,
      [id, `Moved from ${from.rows[0]?.bed_name || 'bed'} to ${target.rows[0].bed_name}`, me(req)]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Transfer short stay error:', error);
    res.status(500).json({ error: 'Failed to move the patient' });
  } finally {
    client.release();
  }
};

/** PUT /short-stay/stays/:id { obs_interval_minutes, reason, doctor_id } */
export const updateShortStay = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const cur = await pool.query(`SELECT * FROM short_stays WHERE id = $1`, [id]);
    const s = cur.rows[0];
    if (!s) return res.status(404).json({ error: 'Stay not found' });
    if (s.status !== 'admitted') return res.status(400).json({ error: 'This stay is closed.' });
    const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body || {}, k);
    const interval = has('obs_interval_minutes') ? Number(req.body.obs_interval_minutes) : s.obs_interval_minutes;
    if (!Number.isInteger(interval) || interval < 15 || interval > 1440) {
      return res.status(400).json({ error: 'Obs interval must be between 15 minutes and 24 hours.' });
    }
    await pool.query(
      `UPDATE short_stays SET obs_interval_minutes = $2, reason = $3, doctor_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, interval, has('reason') ? str(req.body.reason) : s.reason, has('doctor_id') ? (Number(req.body.doctor_id) || null) : s.doctor_id]
    );
    const full = await pool.query(`${STAY_SELECT} WHERE s.id = $1`, [id]);
    res.json({ stay: withTiming(full.rows[0]) });
  } catch (error) {
    console.error('Update short stay error:', error);
    res.status(500).json({ error: 'Failed to update the stay' });
  }
};

/** POST /short-stay/stays/:id/entries { kind, detail } — medicine/drip given, note, handover. */
export const addShortStayEntry = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const kind = req.body?.kind;
  const detail = str(req.body?.detail, 4000);
  if (!(ENTRY_KINDS as readonly string[]).includes(kind)) return res.status(400).json({ error: 'Unknown entry type.' });
  if (!detail) return res.status(400).json({ error: 'Write what was given or noted.' });
  try {
    const s = await pool.query(`SELECT status FROM short_stays WHERE id = $1`, [id]);
    if (!s.rows[0]) return res.status(404).json({ error: 'Stay not found' });
    if (s.rows[0].status !== 'admitted') return res.status(400).json({ error: 'This stay is closed.' });
    const ins = await pool.query(
      `INSERT INTO short_stay_entries (stay_id, kind, detail, recorded_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, kind, detail, me(req)]
    );
    res.status(201).json({ entry: ins.rows[0] });
  } catch (error) {
    console.error('Add short stay entry error:', error);
    res.status(500).json({ error: 'Failed to save' });
  }
};

/** GET /short-stay/stays/:id — the stay with its obs and entries (the stay chart). */
export const getShortStay = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const s = await pool.query(`${STAY_SELECT} WHERE s.id = $1`, [id]);
    if (!s.rows[0]) return res.status(404).json({ error: 'Stay not found' });
    const stay = withTiming(s.rows[0]);
    const obs = stay.encounter_id
      ? (await pool.query(
          `SELECT v.id, v.recorded_at, v.temperature, v.temperature_unit, v.blood_pressure_systolic, v.blood_pressure_diastolic,
                  v.heart_rate, v.respiratory_rate, v.oxygen_saturation, v.pain_level,
                  u.first_name || ' ' || u.last_name AS recorded_by_name
             FROM vital_signs_history v LEFT JOIN users u ON u.id = v.recorded_by
            WHERE v.encounter_id = $1 AND v.recorded_at >= $2 AND ($3::timestamp IS NULL OR v.recorded_at <= $3)
            ORDER BY v.recorded_at DESC`,
          [stay.encounter_id, stay.admitted_at, stay.discharged_at]
        )).rows
      : [];
    const entries = (await pool.query(
      `SELECT e.id, e.kind, e.detail, e.recorded_at, u.first_name || ' ' || u.last_name AS recorded_by_name
         FROM short_stay_entries e LEFT JOIN users u ON u.id = e.recorded_by
        WHERE e.stay_id = $1 ORDER BY e.recorded_at DESC`,
      [id]
    )).rows;
    const allergies = (await pool.query(
      `SELECT allergen, reaction, severity FROM allergies WHERE patient_id = $1 ORDER BY severity DESC`,
      [stay.patient_id]
    )).rows;
    res.json({ stay: { ...stay, allergies }, obs, entries });
  } catch (error) {
    console.error('Get short stay error:', error);
    res.status(500).json({ error: 'Failed to load the stay' });
  }
};

/** GET /short-stay/history?from=&to= — past stays (default last 30 days). */
export const getShortStayHistory = async (req: Request, res: Response) => {
  try {
    const from = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
    const to = typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : null;
    const rows = await pool.query(
      `${STAY_SELECT}
       WHERE s.status = 'discharged'
         AND s.discharged_at >= COALESCE($1::date, CURRENT_DATE - 30)
         AND s.discharged_at < COALESCE($2::date, CURRENT_DATE) + 1
       ORDER BY s.discharged_at DESC LIMIT 300`,
      [from, to]
    );
    res.json({ stays: rows.rows.map(withTiming) });
  } catch (error) {
    console.error('Short stay history error:', error);
    res.status(500).json({ error: 'Failed to load past stays' });
  }
};

/** POST /short-stay/beds { bed_name } (admin) — add a bed. */
export const addShortStayBed = async (req: Request, res: Response) => {
  const name = str(req.body?.bed_name, 50);
  if (!name) return res.status(400).json({ error: 'Name the bed.' });
  try {
    const ins = await pool.query(
      `INSERT INTO short_stay_beds (bed_number, bed_name)
       SELECT 'SSU-' || (COALESCE(MAX(NULLIF(regexp_replace(bed_number, '[^0-9]', '', 'g'), '')::int), 0) + 1), $1
         FROM short_stay_beds
       RETURNING id, bed_number, bed_name`,
      [name]
    );
    res.status(201).json({ bed: ins.rows[0] });
  } catch (error) {
    console.error('Add short stay bed error:', error);
    res.status(500).json({ error: 'Failed to add the bed' });
  }
};

/** GET /short-stay/encounter/:encounter_id — the bed for a visit (doctor dashboard). */
export const getEncounterShortStayHistory = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.first_name || ' ' || u.last_name AS patient_name
         FROM short_stay_beds b
         LEFT JOIN patients p ON b.patient_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
        WHERE b.current_encounter_id = $1`,
      [req.params.encounter_id]
    );
    res.json({ bed: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching encounter short stay info:', error);
    res.status(500).json({ error: 'Failed to fetch short stay info' });
  }
};
