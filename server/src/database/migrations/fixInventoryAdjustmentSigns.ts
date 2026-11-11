import pool from '../db';

/**
 * Stock movement history (Irene: "it's not doing the math right", Neo-cort).
 *
 * Batch edits and stock-takes logged their adjustment as Math.abs(diff), so a
 * count that went DOWN appeared in an item's History as "+N" in green, and the
 * movements no longer added up to the stock on hand. The code now logs the
 * signed change; this flips the past rows whose own note shows a decrease:
 *
 *   "Batch X decreased: 12 → 8 …"            (batch edit)
 *   "Stock-take: batch X decreased 12 → 8 …"  (stock-take, batch mode)
 *   "Stock-take: batch X counted 12 → 8 …"    (stock-take, single batch)
 *   "Stock-take: counted 8 (was 12) …"         (stock-take, no batch yet)
 *
 * Only positive 'adjustment' rows written by those code paths are touched, and
 * each is set to -(before − after) from its own note. Idempotent.
 */
export async function fixInventoryAdjustmentSigns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(`
      WITH parsed AS (
        SELECT id,
               COALESCE(
                 regexp_match(notes, '^(?:Batch |Stock-take: batch ).*(?:decreased:? |counted )([0-9]+) → ([0-9]+)'),
                 (SELECT ARRAY[m[2], m[1]] FROM regexp_match(notes, '^Stock-take: counted ([0-9]+) \\(was ([0-9]+)\\)') AS m)
               ) AS m
          FROM inventory_transactions
         WHERE transaction_type = 'adjustment' AND quantity > 0
           AND (notes LIKE 'Batch %' OR notes LIKE 'Stock-take:%')
      )
      UPDATE inventory_transactions t
         SET quantity = -(p.m[1]::int - p.m[2]::int)
        FROM parsed p
       WHERE t.id = p.id
         AND p.m IS NOT NULL
         AND p.m[2]::int < p.m[1]::int
      RETURNING t.id
    `);

    await client.query('COMMIT');
    console.log(`fixInventoryAdjustmentSigns: ${res.rowCount} stock decreases re-signed.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('fixInventoryAdjustmentSigns failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  fixInventoryAdjustmentSigns()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
