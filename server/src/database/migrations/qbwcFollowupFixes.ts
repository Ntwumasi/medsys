import pool from '../db';

/**
 * QBWC follow-up fixes (companion to the receiveResponseXML drain fix):
 *
 * 1. Add quickbooks_config.default_item_name — the QuickBooks item used for
 *    invoice lines whose charge isn't mapped to a specific QB item, so we stop
 *    emitting InvoiceLineAdd rows with no <ItemRef> (invalid qbXML that aborts
 *    the whole Web Connector batch).
 *
 * 2. One-time requeue: hundreds of invoice/payment rows were parked as
 *    'error: Failed to generate QBXML' because the old sendRequestXML burned
 *    rows that generateQBXML had deliberately deferred (dependency not yet in
 *    QB). Now that that's fixed, reset them to 'pending' so they retry — they
 *    will either sync or correctly fall back to 'waiting' this time.
 */
const qbwcFollowupFixes = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE quickbooks_config
      ADD COLUMN IF NOT EXISTS default_item_name VARCHAR(200) DEFAULT 'Medical Services'
    `);

    const requeue = await client.query(`
      UPDATE quickbooks_request_queue
         SET status = 'pending', error_message = NULL, error_code = NULL, sent_at = NULL
       WHERE entity_type IN ('invoice', 'payment')
         AND status = 'error'
         AND error_message = 'Failed to generate QBXML'
    `);

    await client.query('COMMIT');
    console.log(`QBWC follow-up fixes applied. Requeued ${requeue.rowCount} previously-burned invoice/payment rows.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying QBWC follow-up fixes:', error);
    throw error;
  } finally {
    client.release();
  }
};

export default qbwcFollowupFixes;

if (require.main === module) {
  qbwcFollowupFixes()
    .then(() => { console.log('Migration completed successfully'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
