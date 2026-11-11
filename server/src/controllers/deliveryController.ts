import { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import pool from '../database/db';
import auditService from '../services/auditService';
import { getOrCreateEncounterInvoice } from '../services/invoiceResolver';
import { patientShares, primaryPayerTypeSql, money } from '../services/patientShare';
import { textDeliveryOnTheWay } from '../services/patientAutoTextService';
import { updateInvoice } from './invoiceController';

/**
 * Medicine delivery (home care phase 2).
 *
 * The pharmacy groups a visit's medicine orders into a delivery, hands them to
 * an external courier and updates the status as the courier reports back:
 *   preparing → ready → out_for_delivery → delivered | failed → (retry) | cancelled
 *
 * Stock still leaves (and medicines are billed) through the normal dispense
 * step; a delivery can't go out until every medicine is dispensed.
 *
 * Money: the delivery fee is a patient-billed line on the visit invoice. With
 * pay on delivery the courier collects the patient's share (insured/corporate
 * cover stays with the payer); when the money comes back the pharmacy records
 * it here and it goes through the ordinary invoice payment (receipt, QuickBooks,
 * receipt text).
 */

export const DELIVERY_STATUSES = ['preparing', 'ready', 'out_for_delivery', 'delivered', 'failed', 'cancelled'] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];

/** Allowed next steps from each status. */
export const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus[]> = {
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'preparing', 'cancelled'],
  out_for_delivery: ['delivered', 'failed'],
  failed: ['out_for_delivery', 'ready', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export const canMoveDelivery = (from: DeliveryStatus, to: DeliveryStatus) => NEXT_STATUS[from]?.includes(to) ?? false;

const userId = (req: Request): number => (req as any).user?.id;

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const parseFee = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? money(n) : null;
};

const DELIVERY_SELECT = `
  SELECT d.*,
         u.first_name || ' ' || u.last_name AS patient_name,
         p.patient_number,
         CASE WHEN p.date_of_birth > DATE '1900-01-01' THEN p.date_of_birth END AS patient_date_of_birth,
         u.phone AS patient_phone,
         e.encounter_number, COALESCE(e.is_home_visit, false) AS is_home_visit,
         i.invoice_number,
         cb.first_name || ' ' || cb.last_name AS created_by_name
    FROM deliveries d
    JOIN patients p ON p.id = d.patient_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN encounters e ON e.id = d.encounter_id
    LEFT JOIN invoices i ON i.id = d.invoice_id
    LEFT JOIN users cb ON cb.id = d.created_by
`;

/** What the patient still owes on the delivery's invoice (their share only). */
const patientBalanceDue = async (db: PoolClient | typeof pool, invoiceId: number, patientId: number): Promise<number> => {
  const inv = await db.query(
    `SELECT i.id, i.total_amount, i.amount_paid, pps.payer_type AS invoice_payer_type
       FROM invoices i LEFT JOIN patient_payer_sources pps ON pps.id = i.payer_source_id
      WHERE i.id = $1`,
    [invoiceId]
  );
  if (!inv.rows[0]) return 0;
  const lines = await db.query(
    `SELECT invoice_id, total_price, COALESCE(bill_to, 'payer') AS bill_to FROM invoice_items WHERE invoice_id = $1`,
    [invoiceId]
  );
  const payments = await db.query(
    `SELECT invoice_id, amount, notes, payment_method FROM payments WHERE invoice_id = $1`,
    [invoiceId]
  );
  const primary = await db.query(primaryPayerTypeSql, [patientId]);
  return patientShares(inv.rows, lines.rows, payments.rows, primary.rows[0]?.payer_type).get(invoiceId)?.balance_due ?? 0;
};

/** Recompute an invoice's totals and payment status after its lines change. */
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
 * Put the delivery fee on the visit invoice (billed to the patient), change it,
 * or take it off when the fee is 0 or the delivery is cancelled.
 */
const syncDeliveryFee = async (
  client: PoolClient,
  delivery: { id: number; invoice_id: number | null; fee_invoice_item_id: number | null },
  fee: number
): Promise<number | null> => {
  if (!delivery.invoice_id) return null;
  let itemId = delivery.fee_invoice_item_id;
  if (itemId) {
    if (fee > 0) {
      await client.query(
        `UPDATE invoice_items SET unit_price = $2, total_price = $2 WHERE id = $1`,
        [itemId, fee]
      );
    } else {
      await client.query(`DELETE FROM invoice_items WHERE id = $1`, [itemId]);
      itemId = null;
    }
  } else if (fee > 0) {
    const charge = await client.query(
      `SELECT id, service_name FROM charge_master WHERE service_code = 'DELIVERY' LIMIT 1`
    );
    const ins = await client.query(
      `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category, bill_to)
       VALUES ($1, $2, $3, 1, $4, $4, 'pharmacy', 'patient') RETURNING id`,
      [delivery.invoice_id, charge.rows[0]?.id || null, charge.rows[0]?.service_name || 'Medicine delivery', fee]
    );
    itemId = ins.rows[0].id;
  }
  await recalcInvoice(client, delivery.invoice_id);
  return itemId;
};

const addEvent = (client: PoolClient | typeof pool, deliveryId: number, status: string, note: string | null, by: number) =>
  client.query(
    `INSERT INTO delivery_events (delivery_id, status, note, user_id) VALUES ($1, $2, $3, $4)`,
    [deliveryId, status, note, by]
  );

const loadDelivery = async (id: number) => {
  const d = await pool.query(`${DELIVERY_SELECT} WHERE d.id = $1`, [id]);
  if (!d.rows[0]) return null;
  const orders = await pool.query(
    `SELECT id, medication_name, dosage, frequency, quantity, status
       FROM pharmacy_orders WHERE delivery_id = $1 ORDER BY id`,
    [id]
  );
  const events = await pool.query(
    `SELECT de.id, de.status, de.note, de.created_at, u.first_name || ' ' || u.last_name AS by_name
       FROM delivery_events de LEFT JOIN users u ON u.id = de.user_id
      WHERE de.delivery_id = $1 ORDER BY de.created_at, de.id`,
    [id]
  );
  const delivery = d.rows[0];
  const balanceDue = delivery.invoice_id ? await patientBalanceDue(pool, delivery.invoice_id, delivery.patient_id) : 0;
  return { ...delivery, balance_due: balanceDue, orders: orders.rows, events: events.rows };
};

/** GET /deliveries?scope=active|done — the pharmacy's delivery board. */
export const listDeliveries = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = req.query.scope === 'done' ? 'done' : 'active';
    const where = scope === 'done'
      ? `d.status IN ('delivered', 'cancelled') AND d.updated_at > NOW() - INTERVAL '30 days'`
      : `d.status IN ('preparing', 'ready', 'out_for_delivery', 'failed')`;
    const rows = await pool.query(
      `${DELIVERY_SELECT}
       WHERE ${where}
       ORDER BY CASE d.status WHEN 'failed' THEN 0 WHEN 'out_for_delivery' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END,
                d.created_at DESC
       LIMIT 200`
    );
    const ids = rows.rows.map((r) => r.id);
    const orders = ids.length
      ? (await pool.query(
          `SELECT id, delivery_id, medication_name, quantity, status FROM pharmacy_orders
            WHERE delivery_id = ANY($1) ORDER BY id`,
          [ids]
        )).rows
      : [];
    res.json({
      deliveries: rows.rows.map((d) => ({ ...d, orders: orders.filter((o) => o.delivery_id === d.id) })),
    });
  } catch (error) {
    console.error('List deliveries error:', error);
    res.status(500).json({ error: 'Failed to load deliveries' });
  }
};

/** GET /deliveries/:id — one delivery with its medicines and timeline. */
export const getDelivery = async (req: Request, res: Response): Promise<void> => {
  try {
    const delivery = await loadDelivery(Number(req.params.id));
    if (!delivery) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }
    res.json({ delivery });
  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({ error: 'Failed to load delivery' });
  }
};

/**
 * POST /deliveries — send a visit's medicines out for delivery.
 * Body: order_ids[], address | gps_address (one required), landmark,
 * contact_phone, courier_name, courier_phone, delivery_fee, pay_on_delivery,
 * notes, save_address (copy the address to the patient record).
 */
export const createDelivery = async (req: Request, res: Response): Promise<void> => {
  const orderIds: number[] = Array.isArray(req.body?.order_ids)
    ? [...new Set<number>(req.body.order_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))]
    : [];
  const address = str(req.body?.address, 1000);
  const gps = str(req.body?.gps_address, 100);
  const fee = parseFee(req.body?.delivery_fee);

  if (orderIds.length === 0) {
    res.status(400).json({ error: 'Choose at least one medicine to deliver.' });
    return;
  }
  if (!address && !gps) {
    res.status(400).json({ error: 'Enter the delivery address or GPS code.' });
    return;
  }
  if (fee === null) {
    res.status(400).json({ error: 'Enter a valid delivery fee (0 or more).' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orders = await client.query(
      `SELECT id, patient_id, encounter_id, status, delivery_id, medication_name
         FROM pharmacy_orders WHERE id = ANY($1) FOR UPDATE`,
      [orderIds]
    );
    if (orders.rows.length !== orderIds.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'One of those medicines no longer exists — refresh and try again.' });
      return;
    }
    const patients = new Set(orders.rows.map((o) => o.patient_id));
    const encounters = new Set(orders.rows.map((o) => o.encounter_id));
    if (patients.size !== 1) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'A delivery is for one patient — pick medicines for the same patient.' });
      return;
    }
    if (encounters.size !== 1 || !orders.rows[0].encounter_id) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Deliver one visit at a time — these medicines are on different visits.' });
      return;
    }
    const blocked = orders.rows.find((o) => ['cancelled', 'returned'].includes(o.status));
    if (blocked) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `${blocked.medication_name} is ${blocked.status} and can't be delivered.` });
      return;
    }
    if (orders.rows.some((o) => o.delivery_id)) {
      const existing = await client.query(
        `SELECT id FROM deliveries WHERE id = ANY($1) AND status NOT IN ('cancelled')`,
        [orders.rows.map((o) => o.delivery_id).filter(Boolean)]
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Some of these medicines are already in a delivery.' });
        return;
      }
    }

    const patientId: number = orders.rows[0].patient_id;
    const encounterId: number = orders.rows[0].encounter_id;
    const invoiceId = await getOrCreateEncounterInvoice(encounterId, client);
    const allPrepared = orders.rows.every((o) => ['ready', 'dispensed'].includes(o.status));

    const ins = await client.query(
      `INSERT INTO deliveries (patient_id, encounter_id, invoice_id, status, address, gps_address, landmark,
                               contact_phone, courier_name, courier_phone, delivery_fee, pay_on_delivery, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, invoice_id, fee_invoice_item_id`,
      [
        patientId, encounterId, invoiceId, allPrepared ? 'ready' : 'preparing',
        address, gps, str(req.body?.landmark, 1000), str(req.body?.contact_phone, 30),
        str(req.body?.courier_name, 120), str(req.body?.courier_phone, 30),
        fee, req.body?.pay_on_delivery === true, str(req.body?.notes, 1000), userId(req),
      ]
    );
    const delivery = ins.rows[0];
    await client.query(`UPDATE pharmacy_orders SET delivery_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2)`, [delivery.id, orderIds]);

    const feeItemId = await syncDeliveryFee(client, delivery, fee);
    if (feeItemId) await client.query(`UPDATE deliveries SET fee_invoice_item_id = $2 WHERE id = $1`, [delivery.id, feeItemId]);

    if (req.body?.save_address === true) {
      await client.query(
        `UPDATE patients
            SET address = COALESCE($2, address), gps_address = COALESCE($3, gps_address),
                landmark = COALESCE($4, landmark), updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [patientId, address, gps, str(req.body?.landmark, 1000)]
      );
    }
    await addEvent(client, delivery.id, allPrepared ? 'ready' : 'preparing', 'Delivery created', userId(req));
    await client.query('COMMIT');

    await auditService.log({
      userId: userId(req),
      action: 'create',
      entityType: 'delivery',
      entityId: delivery.id,
      details: { patient_id: patientId, order_ids: orderIds, delivery_fee: fee, pay_on_delivery: req.body?.pay_on_delivery === true },
    });
    res.status(201).json({ delivery: await loadDelivery(delivery.id) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Create delivery error:', error);
    res.status(500).json({ error: 'Failed to create the delivery' });
  } finally {
    client.release();
  }
};

/** PUT /deliveries/:id — change address, courier, fee or pay-on-delivery before it's finished. */
export const updateDelivery = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [id]);
    const d = cur.rows[0];
    if (!d) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }
    if (['delivered', 'cancelled'].includes(d.status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `This delivery is ${d.status} and can't be changed.` });
      return;
    }
    const b = req.body || {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
    const next = {
      address: has('address') ? str(b.address, 1000) : d.address,
      gps_address: has('gps_address') ? str(b.gps_address, 100) : d.gps_address,
      landmark: has('landmark') ? str(b.landmark, 1000) : d.landmark,
      contact_phone: has('contact_phone') ? str(b.contact_phone, 30) : d.contact_phone,
      courier_name: has('courier_name') ? str(b.courier_name, 120) : d.courier_name,
      courier_phone: has('courier_phone') ? str(b.courier_phone, 30) : d.courier_phone,
      courier_reference: has('courier_reference') ? str(b.courier_reference, 120) : d.courier_reference,
      pay_on_delivery: has('pay_on_delivery') ? b.pay_on_delivery === true : d.pay_on_delivery,
      notes: has('notes') ? str(b.notes, 1000) : d.notes,
    };
    if (!next.address && !next.gps_address) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Keep an address or GPS code on the delivery.' });
      return;
    }
    let fee = Number(d.delivery_fee);
    if (has('delivery_fee')) {
      const parsed = parseFee(b.delivery_fee);
      if (parsed === null) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Enter a valid delivery fee (0 or more).' });
        return;
      }
      fee = parsed;
    }
    let feeItemId = d.fee_invoice_item_id;
    if (fee !== Number(d.delivery_fee)) feeItemId = await syncDeliveryFee(client, d, fee);

    await client.query(
      `UPDATE deliveries
          SET address = $2, gps_address = $3, landmark = $4, contact_phone = $5, courier_name = $6,
              courier_phone = $7, courier_reference = $8, pay_on_delivery = $9, notes = $10,
              delivery_fee = $11, fee_invoice_item_id = $12, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id, next.address, next.gps_address, next.landmark, next.contact_phone, next.courier_name,
        next.courier_phone, next.courier_reference, next.pay_on_delivery, next.notes, fee, feeItemId]
    );
    await client.query('COMMIT');
    await auditService.log({ userId: userId(req), action: 'update', entityType: 'delivery', entityId: id, details: { ...next, delivery_fee: fee } });
    res.json({ delivery: await loadDelivery(id) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Update delivery error:', error);
    res.status(500).json({ error: 'Failed to update the delivery' });
  } finally {
    client.release();
  }
};

/**
 * POST /deliveries/:id/status { status, note, failed_reason, courier_* }.
 * out_for_delivery needs every medicine dispensed (stock out, billed) and
 * texts the patient; failed needs a reason; cancelled takes the fee off.
 */
export const setDeliveryStatus = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const to = req.body?.status as DeliveryStatus;
  if (!DELIVERY_STATUSES.includes(to)) {
    res.status(400).json({ error: 'Unknown delivery status.' });
    return;
  }
  const note = str(req.body?.note, 1000);
  const failedReason = str(req.body?.failed_reason, 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [id]);
    const d = cur.rows[0];
    if (!d) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }
    if (!canMoveDelivery(d.status, to)) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `Can't move a delivery from ${d.status.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.` });
      return;
    }

    let amountToCollect: number | null = d.amount_to_collect;
    if (to === 'ready' || to === 'out_for_delivery') {
      const pending = await client.query(
        `SELECT medication_name FROM pharmacy_orders
          WHERE delivery_id = $1 AND status IN ('ordered', 'in_progress')`,
        [id]
      );
      if (pending.rows.length) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Still being prepared: ${pending.rows.map((r) => r.medication_name).join(', ')}. Mark them ready first.`,
        });
        return;
      }
    }
    if (to === 'out_for_delivery') {
      // Dispensing takes the stock off AND bills the medicine, so everything
      // must be dispensed before the courier leaves — otherwise stock is wrong
      // and the amount to collect misses the medicines.
      const undispensed = await client.query(
        `SELECT medication_name FROM pharmacy_orders WHERE delivery_id = $1 AND status = 'ready'`,
        [id]
      );
      if (undispensed.rows.length) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Dispense first: ${undispensed.rows.map((r) => r.medication_name).join(', ')}.`,
        });
        return;
      }
      const courier = str(req.body?.courier_name, 120) || d.courier_name;
      if (!courier) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Enter the courier before sending it out.' });
        return;
      }
      if (d.pay_on_delivery && d.invoice_id) {
        amountToCollect = await patientBalanceDue(client, d.invoice_id, d.patient_id);
      }
    }
    if (to === 'failed' && !failedReason) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Say why the delivery failed.' });
      return;
    }

    let feeItemId = d.fee_invoice_item_id;
    if (to === 'cancelled') {
      feeItemId = await syncDeliveryFee(client, d, 0);
      // The medicines go back to the normal pickup flow.
      await client.query(`UPDATE pharmacy_orders SET delivery_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE delivery_id = $1`, [id]);
    }

    await client.query(
      `UPDATE deliveries
          SET status = $2,
              courier_name = COALESCE($3, courier_name),
              courier_phone = COALESCE($4, courier_phone),
              courier_reference = COALESCE($5, courier_reference),
              amount_to_collect = $6,
              failed_reason = CASE WHEN $2 = 'failed' THEN $7 ELSE failed_reason END,
              dispatched_at = CASE WHEN $2 = 'out_for_delivery' THEN CURRENT_TIMESTAMP ELSE dispatched_at END,
              delivered_at = CASE WHEN $2 = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
              fee_invoice_item_id = $8,
              delivery_fee = CASE WHEN $2 = 'cancelled' THEN 0 ELSE delivery_fee END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id, to, str(req.body?.courier_name, 120), str(req.body?.courier_phone, 30), str(req.body?.courier_reference, 120),
        amountToCollect, failedReason, feeItemId]
    );
    await addEvent(client, id, to, to === 'failed' ? failedReason : note, userId(req));
    await client.query('COMMIT');

    if (to === 'out_for_delivery') await textDeliveryOnTheWay(id, d.patient_id);

    await auditService.log({
      userId: userId(req),
      action: 'update',
      entityType: 'delivery',
      entityId: id,
      details: { from: d.status, to, note, failed_reason: failedReason },
    });
    res.json({ delivery: await loadDelivery(id) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Set delivery status error:', error);
    res.status(500).json({ error: 'Failed to update the delivery status' });
  } finally {
    client.release();
  }
};

/**
 * POST /deliveries/:id/collect { amount, payment_method } — the courier handed
 * in the money collected at the door. Recorded through the normal invoice
 * payment (same receipt, QuickBooks queue and receipt text as the front desk),
 * then noted on the delivery.
 */
export const collectDeliveryPayment = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const amount = Number(req.body?.amount);
  const method = str(req.body?.payment_method, 30) || 'cash';
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'Enter the amount the courier handed in.' });
    return;
  }
  try {
    const cur = await pool.query(`SELECT * FROM deliveries WHERE id = $1`, [id]);
    const d = cur.rows[0];
    if (!d) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }
    if (!d.invoice_id) {
      res.status(400).json({ error: 'This delivery has no invoice to pay.' });
      return;
    }
    if (!['out_for_delivery', 'delivered'].includes(d.status)) {
      res.status(400).json({ error: 'Record the money once the delivery has gone out.' });
      return;
    }
    const due = await patientBalanceDue(pool, d.invoice_id, d.patient_id);
    if (amount > due + 0.005) {
      res.status(400).json({ error: `That's more than the patient owes (GHS ${due.toFixed(2)}).` });
      return;
    }

    // Hand off to the one payment path. Capture its reply instead of sending it.
    let status = 200;
    let body: any = null;
    const capture = {
      status(code: number) { status = code; return capture; },
      json(payload: unknown) { body = payload; return capture; },
    } as unknown as Response;
    const payReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req, {
      params: { ...req.params, id: String(d.invoice_id) },
      // No `notes`: updateInvoice would write them over the invoice's own notes.
      // The delivery timeline records where the money came from.
      body: { payment_amount: amount, payment_method: method },
    }) as Request;
    await updateInvoice(payReq, capture);
    if (status >= 400) {
      res.status(status).json(body || { error: 'Failed to record the payment' });
      return;
    }

    const paymentId = await pool.query(
      `SELECT id FROM payments WHERE invoice_id = $1 AND created_by = $2 AND amount = $3 ORDER BY id DESC LIMIT 1`,
      [d.invoice_id, userId(req), amount]
    );
    await pool.query(
      `UPDATE deliveries
          SET amount_collected = COALESCE(amount_collected, 0) + $2, collected_method = $3,
              collected_payment_id = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id, amount, method, paymentId.rows[0]?.id || null]
    );
    await addEvent(pool, id, d.status, `GHS ${amount.toFixed(2)} collected (${method}) and handed in`, userId(req));
    res.json({ delivery: await loadDelivery(id) });
  } catch (error) {
    console.error('Collect delivery payment error:', error);
    res.status(500).json({ error: 'Failed to record the payment' });
  }
};
