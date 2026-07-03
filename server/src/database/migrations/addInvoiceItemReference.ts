import pool from '../db';

/**
 * Add a stable source reference to invoice_items so an order-derived line can be
 * billed exactly once.
 *
 * Root cause of "duplicate meds/labs auto-adding to invoices": billing was
 * deduped by the reconstructed description string, but the same source order
 * gets DIFFERENT descriptions from different billers — labs via the lab catalog
 * (`Lab: <catalog test_name>`) vs the safety-net sync via a charge_master fuzzy
 * join (`Lab: <charge_master.service_name>` or the raw test_name); meds via the
 * dispensed/substitute name vs the original name. Different strings → the dedup
 * misses → a second line is inserted. The fuzzy joins can also match several
 * charge_master/inventory rows for one order, fanning it into multiple lines.
 *
 * reference_type + reference_id (e.g. 'lab_order'/'pharmacy_order'/
 * 'imaging_order'/'nurse_procedure' + the source row id) let dedup key on the
 * source instead of the name, so a given order bills once regardless of naming.
 * Both columns are nullable — manual/consult/registration lines have no source
 * order and keep description-based dedup.
 */
export async function addInvoiceItemReference() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS reference_id INTEGER
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_invoice_items_reference
        ON invoice_items (invoice_id, reference_type, reference_id)
    `);

    await client.query('COMMIT');
    console.log('invoice_items.reference_type / reference_id added (+ dedup index).');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addInvoiceItemReference migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addInvoiceItemReference()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
