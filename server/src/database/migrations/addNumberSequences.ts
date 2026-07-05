import pool from '../db';

/**
 * Atomic sequences for invoice_number and patient_number.
 *
 * These were generated with `SELECT COUNT(*)+1` / `MAX(id)+1` and formatted as
 * INV###### / P######. Under concurrency two requests compute the SAME number →
 * a UNIQUE violation rolls back the whole transaction (a registration or invoice
 * is silently lost / 500s). COUNT-based numbers also drift after any hard delete.
 *
 * Postgres sequences hand out unique values atomically (nextval never collides,
 * even under concurrency, and doesn't roll back — gaps are fine). Initialize each
 * ABOVE the current max numeric part so no new number collides with an existing
 * one. Callers use services/sequences.ts (nextInvoiceNumber / nextPatientNumber).
 */
export async function addNumberSequences() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS patient_number_seq`);

    // setval(..., is_called=true) => the NEXT nextval() returns value + 1.
    // Match only the standard formats: INV/SPL###### and P######. Imported
    // CareCode patient numbers (CC-MGC-#####-##) are a SEPARATE series and must
    // NOT feed the P-sequence (their scraped digits are huge).
    await client.query(`
      SELECT setval('invoice_number_seq', GREATEST(
        (SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '[0-9]+')::BIGINT), 0)
           FROM invoices WHERE invoice_number ~ '^(INV|SPL)[0-9]+$'),
        1))
    `);
    await client.query(`
      SELECT setval('patient_number_seq', GREATEST(
        (SELECT COALESCE(MAX(SUBSTRING(patient_number FROM '^P0*([0-9]+)$')::BIGINT), 0)
           FROM patients WHERE patient_number ~ '^P[0-9]+$'),
        1))
    `);

    const [inv, pat] = await Promise.all([
      client.query(`SELECT last_value FROM invoice_number_seq`),
      client.query(`SELECT last_value FROM patient_number_seq`),
    ]);
    console.log(`invoice_number_seq at ${inv.rows[0].last_value}; patient_number_seq at ${pat.rows[0].last_value} (next = +1).`);

    await client.query('COMMIT');
    console.log('addNumberSequences completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addNumberSequences migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addNumberSequences()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
