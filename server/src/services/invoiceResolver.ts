import pool from '../database/db';
import { nextInvoiceNumber } from './sequences';

/**
 * Resolve the (possibly shared) invoice for an encounter.
 *
 * Multiple same-day encounters (a patient seeing several doctors) share ONE
 * invoice: the first check-in creates it, later ones link to it via
 * encounters.invoice_id. All order billing (labs/meds/imaging/procedures) must
 * resolve the invoice through this link — NOT via `invoices.encounter_id`,
 * which only points at the first (anchor) encounter — otherwise a second
 * doctor's charges would land on a different invoice or go unbilled.
 *
 * Falls back to the legacy invoices.encounter_id link for any encounter not yet
 * carrying an invoice_id (belt-and-suspenders alongside the backfill).
 */

// Minimal shape so callers can pass either the pool or a transaction client.
type Queryable = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

/** Returns the invoice id for the encounter, or null if none exists yet. */
export async function resolveEncounterInvoiceId(
  encounterId: number | string,
  db: Queryable = pool
): Promise<number | null> {
  const r = await db.query(
    `SELECT COALESCE(
        e.invoice_id,
        (SELECT iv.id FROM invoices iv WHERE iv.encounter_id = e.id ORDER BY iv.id LIMIT 1)
      ) AS invoice_id
     FROM encounters e
     WHERE e.id = $1`,
    [encounterId]
  );
  const id = r.rows[0]?.invoice_id;
  return id ?? null;
}

/**
 * Resolve the encounter's invoice, creating a fresh 'pending' invoice if none
 * exists yet. Always leaves encounters.invoice_id set so subsequent lookups are
 * O(1). Use this in billers that must have an invoice to charge to.
 */
export async function getOrCreateEncounterInvoice(
  encounterId: number | string,
  db: Queryable = pool
): Promise<number> {
  const existing = await resolveEncounterInvoiceId(encounterId, db);
  if (existing) {
    // Make sure the link is set for next time (cheap no-op if already linked).
    await db.query(
      `UPDATE encounters SET invoice_id = $1 WHERE id = $2 AND invoice_id IS DISTINCT FROM $1`,
      [existing, encounterId]
    );
    return existing;
  }

  const enc = await db.query('SELECT patient_id FROM encounters WHERE id = $1', [encounterId]);
  const patientId = enc.rows[0]?.patient_id;
  const invoiceNumber = await nextInvoiceNumber(db);
  const ins = await db.query(
    `INSERT INTO invoices (patient_id, encounter_id, invoice_number, invoice_date, subtotal, tax, total_amount, status)
     VALUES ($1, $2, $3, CURRENT_DATE, 0, 0, 0, 'pending')
     RETURNING id`,
    [patientId, encounterId, invoiceNumber]
  );
  const invoiceId = ins.rows[0].id;
  await db.query(`UPDATE encounters SET invoice_id = $1 WHERE id = $2`, [invoiceId, encounterId]);
  return invoiceId;
}
