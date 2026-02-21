import pool from '../db';

async function verify() {
  const tables = ['lab_inventory', 'lab_inventory_transactions', 'lab_test_catalog', 'critical_result_alerts'];
  for (const table of tables) {
    const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`${table}: ${countResult.rows[0].count} rows`);
  }

  // Check lab_inventory by type
  const inventoryByType = await pool.query(`
    SELECT item_type, COUNT(*) as count
    FROM lab_inventory
    GROUP BY item_type
  `);
  console.log('\nLab inventory by type:');
  inventoryByType.rows.forEach(row => console.log(`  ${row.item_type}: ${row.count}`));

  // Check test catalog categories
  const catalogCategories = await pool.query(`
    SELECT category, COUNT(*) as count
    FROM lab_test_catalog
    GROUP BY category
    ORDER BY count DESC
  `);
  console.log('\nTest catalog by category:');
  catalogCategories.rows.forEach(row => console.log(`  ${row.category}: ${row.count}`));

  process.exit(0);
}

verify().catch(e => { console.error(e); process.exit(1); });
