/**
 * Migration: marketing opt-out flag on patients
 *
 * Marketing asked to download the registered clients' contacts for campaigns.
 * There was no consent or opt-out field anywhere in the schema, so a patient who
 * asked to stop receiving messages had nowhere to be recorded — the only remedy
 * would have been remembering outside the system.
 *
 * Default FALSE: nobody is excluded to begin with, so the first export is the
 * full list. Reception ticks the box when a patient asks, and the export skips
 * them from then on.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  try {
    await pool.query(`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS marketing_opt_out BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // The export filters on this, and it's a full-table scan otherwise.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_marketing_opt_out
        ON patients (marketing_opt_out)
        WHERE marketing_opt_out = TRUE
    `);

    const counts = await pool.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE marketing_opt_out) AS opted_out
        FROM patients
    `);

    console.log('Marketing opt-out flag ready:');
    console.log(`  patients: ${counts.rows[0].total}, opted out: ${counts.rows[0].opted_out}`);
  } catch (e) {
    console.error('addMarketingOptOut migration failed:', e);
    throw e;
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
