/**
 * Migration: Unify lab pricing into a single source (lab_test_catalog)
 *
 * Lab prices were split across charge_master (category='lab', 342 rows, edited
 * on admin Service Charges) and lab_test_catalog (115 rows, edited on the Lab
 * Dashboard). Billing fuzzy-matched names across both → wrong/duplicate prices.
 *
 * This makes lab_test_catalog the single source of truth:
 *  1. Port every charge_master lab test that isn't already in the catalog
 *     (281 specialised tests) so nothing is lost. Category taken from the
 *     description prefix ("Hormones: ..." -> "Hormones") when present.
 *  2. For overlapping tests, set the catalog price = the admin charge_master
 *     price (admin is the agreed reference; only ~5 actually differ).
 *  3. Deactivate charge_master category='lab' so the divergent list is gone.
 *  4. Report any catalog entries still priced 0/null.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Port charge_master lab tests not already in the catalog (by code or name)
    const ported = await client.query(`
      INSERT INTO lab_test_catalog (test_code, test_name, base_price, category, is_active)
      SELECT cm.service_code,
             cm.service_name,
             cm.price,
             COALESCE(NULLIF(TRIM(SPLIT_PART(cm.description, ':', 1)), ''), 'Lab'),
             true
      FROM charge_master cm
      WHERE cm.category = 'lab' AND cm.is_active = true
        AND NOT EXISTS (SELECT 1 FROM lab_test_catalog lc WHERE lc.test_code = cm.service_code)
        AND NOT EXISTS (SELECT 1 FROM lab_test_catalog lc WHERE LOWER(TRIM(lc.test_name)) = LOWER(TRIM(cm.service_name)))
      ON CONFLICT (test_code) DO NOTHING
    `);

    // 2. Overlapping tests: admin (charge_master) price wins
    const synced = await client.query(`
      UPDATE lab_test_catalog lc
      SET base_price = cm.price, updated_at = CURRENT_TIMESTAMP
      FROM charge_master cm
      WHERE cm.category = 'lab' AND cm.is_active = true
        AND (cm.service_code = lc.test_code OR LOWER(TRIM(cm.service_name)) = LOWER(TRIM(lc.test_name)))
        AND lc.base_price IS DISTINCT FROM cm.price
    `);

    // 3. Retire charge_master lab list
    const retired = await client.query(
      `UPDATE charge_master SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE category = 'lab' AND is_active = true`
    );

    await client.query('COMMIT');

    const zero = await pool.query(
      `SELECT test_code, test_name FROM lab_test_catalog WHERE is_active = true AND (base_price IS NULL OR base_price = 0) ORDER BY test_name`
    );
    const total = await pool.query('SELECT COUNT(*) c FROM lab_test_catalog WHERE is_active = true');

    console.log(`Unify lab pricing complete:`);
    console.log(`  ported into catalog: ${ported.rowCount}`);
    console.log(`  overlap prices synced to admin price: ${synced.rowCount}`);
    console.log(`  charge_master lab rows retired: ${retired.rowCount}`);
    console.log(`  catalog active tests now: ${total.rows[0].c}`);
    console.log(`  catalog entries still priced 0/null (need a price or deactivate): ${zero.rows.length}`);
    zero.rows.forEach((r: any) => console.log(`    - ${r.test_code}  ${r.test_name}`));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Unify lab pricing migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
