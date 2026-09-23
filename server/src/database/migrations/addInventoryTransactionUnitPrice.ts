/**
 * Migration: record the price on the stock transaction itself
 *
 * inventory_transactions stored quantity but no price, so pharmacy revenue and
 * order history had to multiply by the CURRENT pharmacy_inventory.selling_price.
 * Repricing a drug at procurement therefore rewrote the history of every past
 * sale of it — Irene: "it computes the bill based on current pricing and not
 * what it was at the time it was served".
 *
 * 8ca7620 fixed the reporting side by reading the price off the invoice line,
 * which is the truth for any sale that produced one. About a third of dispenses
 * never did, and for those there is no record of what was charged.
 *
 * This closes the gap at the source: the price is now stamped on the transaction
 * when the stock moves, so it can never drift again regardless of what happens
 * to the catalogue price afterwards.
 *
 * Backfills from the invoice line wherever one can be found. Rows with no
 * invoice line are left NULL — deliberately, because inventing a price for them
 * would be worse than admitting we don't know: reporting falls back to the
 * current price and is transparent about it.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE inventory_transactions
        ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2)
    `);

    // Backfill: the invoice line for the same pharmacy order holds what was
    // actually charged. Take the first priced line per order.
    const backfilled = await client.query(`
      UPDATE inventory_transactions it
         SET unit_price = billed.unit_price
        FROM (
          SELECT DISTINCT ON (ii.reference_id)
                 ii.reference_id AS order_id, ii.unit_price
            FROM invoice_items ii
           WHERE ii.reference_type = 'pharmacy_order'
             AND ii.unit_price > 0
           ORDER BY ii.reference_id, ii.id
        ) billed
       WHERE it.reference_type = 'pharmacy_order'
         AND it.reference_id = billed.order_id
         AND it.unit_price IS NULL
    `);

    await client.query('COMMIT');

    const summary = await pool.query(`
      SELECT transaction_type,
             COUNT(*) AS rows,
             COUNT(unit_price) AS with_price
        FROM inventory_transactions
       WHERE transaction_type IN ('dispense', 'return')
       GROUP BY 1 ORDER BY 1
    `);

    console.log(`Stock transactions can now carry a price. Backfilled ${backfilled.rowCount} rows from invoice lines.`);
    console.table(summary.rows);
    console.log('Rows still NULL had no invoice line — reporting falls back to the current price for those.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('addInventoryTransactionUnitPrice migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
