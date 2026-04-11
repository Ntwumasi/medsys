import pool from '../db';

/**
 * Adds a `file_blob` BYTEA column to patient_documents so uploaded files
 * can be stored directly in the database. The previous filesystem-based
 * storage (/tmp/uploads) does not persist on Vercel serverless — files
 * vanish between invocations. Storing the bytes in Postgres works on any
 * deployment with no extra infrastructure.
 */
export async function addDocumentBlobStorage() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE patient_documents
        ADD COLUMN IF NOT EXISTS file_blob BYTEA
    `);
    console.log('✅ Added file_blob column');

    // Make file_path nullable now that the canonical storage is the blob.
    await client.query(`
      ALTER TABLE patient_documents
        ALTER COLUMN file_path DROP NOT NULL
    `);
    console.log('✅ file_path is now nullable');

    await client.query('COMMIT');
    console.log('Migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addDocumentBlobStorage()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
