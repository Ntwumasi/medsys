import pool from '../db';

/**
 * Enforce at most ONE primary payer source per patient.
 *
 * `patient_payer_sources.is_primary` had no constraint, and two code paths set
 * it independently (patientController marks the first primary; payerSourcesController
 * inserts new sources with is_primary ?? true). So a patient could end up with
 * several is_primary=true rows → ambiguous payer selection in billing/pricing
 * (which now also drives resolvePrice's fallback).
 *
 * First demote existing duplicates (keep the most recent primary per patient),
 * then add a partial unique index so it can't recur.
 */
export async function addPrimaryPayerConstraint() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fixed = await client.query(`
      UPDATE patient_payer_sources
         SET is_primary = false
       WHERE is_primary = true
         AND id NOT IN (
           SELECT DISTINCT ON (patient_id) id
             FROM patient_payer_sources
            WHERE is_primary = true
            ORDER BY patient_id, id DESC
         )
    `);
    console.log(`Demoted ${fixed.rowCount} duplicate primary payer source(s).`);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_primary_payer_per_patient
        ON patient_payer_sources (patient_id) WHERE is_primary
    `);

    await client.query('COMMIT');
    console.log('addPrimaryPayerConstraint completed (one primary payer per patient enforced).');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addPrimaryPayerConstraint migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addPrimaryPayerConstraint()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
