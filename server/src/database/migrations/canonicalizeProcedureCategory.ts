import pool from '../db';

// Canonicalize the charge_master.category for nurse procedures.
//
// History: addNurseProcedures.ts seeded rows with category='Nursing Procedures',
// but the admin Service-Charges form writes the lowercase singular 'procedure'.
// Two values meant the same thing, so the nurse-procedures dropdown's filter
// needed an OR-list and admin-added rows were silently invisible until that
// filter was widened.
//
// This migration collapses the historical variants down to a single canonical
// value: 'procedure' (matches the admin form's option list). After this runs,
// the controller filter can be tightened back to a single equality check.
async function canonicalizeProcedureCategory() {
  console.log('Canonicalizing nurse-procedure charge categories to "procedure"...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      `SELECT category, COUNT(*) AS n
         FROM charge_master
        WHERE LOWER(category) IN ('nursing procedures', 'procedures', 'nursing procedure')
        GROUP BY category
        ORDER BY n DESC`,
    );
    if (before.rows.length === 0) {
      console.log('No legacy variants found — nothing to do.');
    } else {
      console.log('Found legacy variants to canonicalize:');
      for (const row of before.rows) {
        console.log(`  ${row.category}: ${row.n} rows`);
      }
    }

    const result = await client.query(
      `UPDATE charge_master
          SET category = 'procedure',
              updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(category) IN ('nursing procedures', 'procedures', 'nursing procedure')
          AND category <> 'procedure'`,
    );
    console.log(`✅ Updated ${result.rowCount} row(s) to category='procedure'`);

    await client.query('COMMIT');
    console.log('\n✅ Procedure category canonicalization complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
  process.exit(0);
}

canonicalizeProcedureCategory().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
