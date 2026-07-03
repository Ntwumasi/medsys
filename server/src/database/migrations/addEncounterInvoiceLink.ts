import pool from '../db';

/**
 * Link an encounter to its invoice so several same-day encounters (a patient
 * seeing multiple doctors) can share ONE invoice.
 *
 * Today the relationship is expressed only as invoices.encounter_id (one invoice
 * points at one encounter), so a second check-in makes a second invoice. Adding
 * encounters.invoice_id lets many encounters point at one shared invoice while
 * keeping invoices.encounter_id (the "anchor"/first encounter) for back-compat.
 *
 * Backfill every existing encounter to its current invoice so queue/lookup
 * joins that resolve through encounters.invoice_id keep working unchanged.
 */
export async function addEncounterInvoiceLink() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE encounters
        ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_encounters_invoice ON encounters (invoice_id)
    `);

    const res = await client.query(`
      UPDATE encounters e
         SET invoice_id = i.id
        FROM invoices i
       WHERE i.encounter_id = e.id
         AND e.invoice_id IS NULL
    `);
    console.log(`encounters.invoice_id added; backfilled ${res.rowCount} rows from invoices.encounter_id.`);

    await client.query('COMMIT');
    console.log('addEncounterInvoiceLink completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addEncounterInvoiceLink migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addEncounterInvoiceLink()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
