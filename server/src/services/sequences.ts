import pool from '../database/db';

/**
 * Collision-free number generation via Postgres sequences (see the
 * addNumberSequences migration). Replaces the old COUNT(*)+1 / MAX(id)+1 schemes
 * that raced under concurrency. Pass a transaction `client` when inside one.
 */

type Queryable = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

/** e.g. "INV000123" (or a custom prefix like "SPL" for special invoices). */
export async function nextInvoiceNumber(db: Queryable = pool, prefix: string = 'INV'): Promise<string> {
  const r = await db.query(`SELECT nextval('invoice_number_seq') AS n`);
  return `${prefix}${String(r.rows[0].n).padStart(6, '0')}`;
}

/** e.g. "P000123". */
export async function nextPatientNumber(db: Queryable = pool): Promise<string> {
  const r = await db.query(`SELECT nextval('patient_number_seq') AS n`);
  return `P${String(r.rows[0].n).padStart(6, '0')}`;
}
