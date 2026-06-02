/**
 * Migration: Add Patient Portal Access Tokens
 *
 * Backs the passwordless patient portal login. A short-lived, one-time token is
 * SMS'd to the patient; opening the link + entering date of birth issues a
 * long-lived patient session. Mirrors the password_reset_tokens pattern.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_portal_access_tokens (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        dob_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        delivery_method VARCHAR(20) NOT NULL DEFAULT 'self',
        sent_by INTEGER REFERENCES users(id),
        ip_address VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ppat_token_hash
      ON patient_portal_access_tokens(token_hash)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ppat_patient
      ON patient_portal_access_tokens(patient_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ppat_expires
      ON patient_portal_access_tokens(expires_at)
    `);

    await client.query('COMMIT');
    console.log('Patient portal access tokens migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Patient portal access tokens migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration if executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
