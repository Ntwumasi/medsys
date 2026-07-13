import pool from '../db';

/**
 * READ-ONLY report — makes NO changes. Delete after running.
 * Lists every ACTIVE lab_test_catalog test whose base_price is 0 or NULL, so the
 * clinic knows exactly which tests to price (these are the ones billing at GHS 0).
 */
async function run() {
  const client = await pool.connect();
  try {
    const rows = await client.query(`
      SELECT test_code, test_name, category, base_price
        FROM lab_test_catalog
       WHERE is_active = true AND (base_price IS NULL OR base_price = 0)
       ORDER BY category NULLS LAST, test_name
    `);
    console.log(`\n=== Active lab tests with NO price (base_price 0/NULL): ${rows.rowCount} ===`);
    console.table(rows.rows);
    console.log(`\nSet each test's price via the Lab catalog editor, or send me this`);
    console.log(`list with prices and I'll bulk-apply it to lab_test_catalog.base_price.`);
    console.log('\nReport complete — no changes made.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
