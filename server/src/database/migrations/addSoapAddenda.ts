import pool from '../db';

/**
 * SOAP addenda: append-only notes attached to an encounter after the original
 * SOAP note is finalized. Use case: doctor sees a patient, orders labs;
 * labs come back the next day; doctor adds an addendum reflecting the
 * results without modifying the original signed note.
 *
 * Legal requirement in most EMR jurisdictions: original record stays
 * intact; addenda are timestamped, attributed, and non-editable.
 */
export async function addSoapAddenda() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS soap_addenda (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_soap_addenda_encounter
        ON soap_addenda(encounter_id, created_at DESC)
    `);

    await client.query('COMMIT');
    console.log('SOAP addenda migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('SOAP addenda migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addSoapAddenda()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
