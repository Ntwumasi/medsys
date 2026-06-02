/**
 * Migration: Add consultation_price to clinics
 *
 * Gives each clinic an explicit, editable consultation fee so check-in bills
 * the assigned clinic's price (e.g. Family Medicine = 400) instead of falling
 * back to a generic "General Practitioner Consult". Backfills sensible
 * starting prices from matching charge_master consultation rows.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE clinics ADD COLUMN IF NOT EXISTS consultation_price NUMERIC(10,2)
    `);

    // Backfill from the best-matching charge_master consultation row (carries
    // existing specialty prices over: Cardiology, Internal Medicine, etc.)
    await client.query(`
      UPDATE clinics c
      SET consultation_price = (
        SELECT cm.price FROM charge_master cm
        WHERE cm.category = 'consultation' AND cm.is_active = true
          AND (cm.service_name ILIKE c.name
               OR cm.service_name ILIKE c.name || ' %'
               OR cm.service_name ILIKE '%' || c.name || '%')
        ORDER BY CASE
          WHEN cm.service_name ILIKE c.name THEN 1
          WHEN cm.service_name ILIKE c.name || ' %' THEN 2
          ELSE 3 END
        LIMIT 1
      )
      WHERE c.consultation_price IS NULL
    `);

    // Explicit overrides for clinics without a clean charge_master name match
    await client.query(`UPDATE clinics SET consultation_price = 400 WHERE name = 'Family Medicine'`);
    await client.query(`UPDATE clinics SET consultation_price = 200 WHERE name = 'General Practice'`);

    // Department walk-ins don't bill a consultation
    await client.query(`
      UPDATE clinics SET consultation_price = NULL
      WHERE name IN ('Pharmacy (OTC/Walk-in)', 'Lab (Walk-in)', 'Imaging (Walk-in)')
    `);

    await client.query('COMMIT');
    console.log('Clinic consultation_price migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Clinic consultation_price migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
