import pool from '../db';

/**
 * Lab result audit log: every change to a completed lab order's result text
 * or attached file is recorded here. Required for clinical paper-trail —
 * once a result has been reviewed by a doctor it cannot be silently
 * overwritten. Old values are preserved so the original entry can be
 * reconstructed.
 *
 * Edit types:
 *   - 'result_text_change' : the structured result text was edited
 *   - 'file_replace'       : the attached PDF was replaced
 *   - 'file_add'           : a PDF was added (none before)
 *   - 'delete'             : the result was cleared (status back to in_progress)
 */
export async function addLabResultAudit() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_result_audit (
        id SERIAL PRIMARY KEY,
        lab_order_id INTEGER NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
        edited_by INTEGER NOT NULL REFERENCES users(id),
        edit_type VARCHAR(40) NOT NULL,
        old_result TEXT,
        new_result TEXT,
        old_document_id INTEGER,
        new_document_id INTEGER,
        reason TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_result_audit_order
        ON lab_result_audit(lab_order_id, created_at DESC)
    `);

    await client.query('COMMIT');
    console.log('Lab result audit migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lab result audit migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addLabResultAudit()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
