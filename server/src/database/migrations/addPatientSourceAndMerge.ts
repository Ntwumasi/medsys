/**
 * Migration: Patient source flag + merge tracking
 *
 * Supports the duplicate-patient cleanup: CareCode-imported records (CC- prefix)
 * collide with native MedSys records. Adds a `source` flag (backfilled from the
 * CC- prefix), merge-tracking columns, and an audit table so merges are
 * traceable and reversible.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'medsys'`);
    await client.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS merged_into INTEGER REFERENCES patients(id)`);
    await client.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS merged_at TIMESTAMP`);
    await client.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS merged_by INTEGER REFERENCES users(id)`);

    // Backfill source from the CareCode import marker
    await client.query(`UPDATE patients SET source = 'carecode' WHERE patient_number LIKE 'CC-%' AND source <> 'carecode'`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_merges (
        id SERIAL PRIMARY KEY,
        source_patient_id INTEGER NOT NULL,
        target_patient_id INTEGER NOT NULL REFERENCES patients(id),
        source_patient_number VARCHAR(50),
        target_patient_number VARCHAR(50),
        merged_by INTEGER REFERENCES users(id),
        merged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        details JSONB
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patients_merged_into ON patients(merged_into)`);

    await client.query('COMMIT');

    const carecode = await pool.query("SELECT COUNT(*) c FROM patients WHERE source = 'carecode'");
    console.log(`Patient source/merge migration complete. CareCode-sourced patients: ${carecode.rows[0].c}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Patient source/merge migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('done'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
}
