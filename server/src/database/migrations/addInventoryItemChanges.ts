/**
 * Migration: history of edits to pharmacy inventory items
 *
 * Irene: "on inventory adjustments there is no history or record of item
 * adjustment — price/quantity etc. It just adjusts and updates."
 *
 * Stock movements were already recorded in inventory_transactions (with the
 * reason), but nothing ever displayed them. Edits to the item itself — selling
 * price, cost, pack size, name, reorder level, etc. — overwrote the old value
 * and left no trace at all, including price changes made at procurement and by
 * bulk import.
 *
 * Price/detail edits get their own table rather than zero-quantity rows in
 * inventory_transactions, which reports sum and count by type.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_item_changes (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES pharmacy_inventory(id),
        changes JSONB NOT NULL,
        source VARCHAR(20) NOT NULL,
        reason TEXT,
        performed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_item_change_source CHECK (source IN ('edit', 'procurement', 'import'))
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_item_changes_item
        ON inventory_item_changes (inventory_id, created_at DESC)
    `);

    await client.query('COMMIT');
    console.log('Created inventory_item_changes.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('addInventoryItemChanges migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
