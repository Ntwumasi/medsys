import pool from '../db';

/**
 * Opens a batch for inventory items that show stock on hand but have no
 * dispensable batch behind it.
 *
 * WHY: pharmacy_inventory.quantity_on_hand is a cache of the batch layer, and
 * the batch layer is what FEFO dispensing draws from. Two writers used to set
 * the cached count without opening a batch — the Adjust Stock endpoint and the
 * opening balance on item creation (plus the original CSV import). Those items
 * displayed stock the pharmacy could not actually dispense, and the first
 * stock-take on such an item would resync its count from the (empty) batch layer
 * and silently erase the stock. Both writers are fixed; this repairs the
 * existing rows by materialising the count they already display.
 *
 * SCOPE, deliberately narrow: only items with quantity_on_hand > 0 and NO active
 * batch at all. Items that have batches which merely DISAGREE with the cached
 * count are left completely alone — deciding whether the shelf or the batch
 * record is right needs a physical count, not a guess, so those are reported for
 * a stock-take instead.
 *
 * Idempotent: an item that already has a usable batch is skipped.
 */
export async function backfillInventoryOpeningBatches() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const targets = await client.query(`
      SELECT i.id, i.medication_name, i.quantity_on_hand, i.expiry_date
        FROM pharmacy_inventory i
       WHERE i.is_active = true
         AND i.quantity_on_hand > 0
         AND NOT EXISTS (
           SELECT 1 FROM inventory_batches b
            WHERE b.inventory_id = i.id AND b.is_active = true AND b.quantity > 0
         )
       ORDER BY i.id
    `);

    for (const item of targets.rows) {
      const abbrev = String(item.medication_name || 'MED').split(' ')[0].substring(0, 3).toUpperCase();
      const ref = item.expiry_date ? new Date(item.expiry_date) : new Date();
      const yearMonth = `${ref.getFullYear()}${String(ref.getMonth() + 1).padStart(2, '0')}`;
      const seq = await client.query(
        `SELECT COUNT(*) + 1 AS next_seq FROM inventory_batches
          WHERE inventory_id = $1 AND batch_number LIKE $2`,
        [item.id, `${abbrev}-${yearMonth}%`]
      );
      const batchNumber = `${abbrev}-${yearMonth}-${String(seq.rows[0].next_seq).padStart(3, '0')}`;

      await client.query(
        `INSERT INTO inventory_batches (inventory_id, batch_number, quantity, expiry_date, notes)
         VALUES ($1, $2, $3, $4, 'Opened from existing on-hand count (backfill)')`,
        [item.id, batchNumber, item.quantity_on_hand, item.expiry_date || null]
      );
    }

    // Report what still disagrees, so the remaining gap stays visible instead of
    // looking resolved. These need a physical count via the Stock-take tab.
    const stillDrifted = await client.query(`
      SELECT i.medication_name, i.quantity_on_hand,
             COALESCE(SUM(b.quantity), 0)::int AS batch_total
        FROM pharmacy_inventory i
        LEFT JOIN inventory_batches b
               ON b.inventory_id = i.id AND b.is_active = true AND b.quantity > 0
       WHERE i.is_active = true
       GROUP BY i.id, i.medication_name, i.quantity_on_hand
      HAVING i.quantity_on_hand <> COALESCE(SUM(b.quantity), 0)
       ORDER BY ABS(i.quantity_on_hand - COALESCE(SUM(b.quantity), 0)) DESC
    `);

    await client.query('COMMIT');

    console.log(`Opened a batch for ${targets.rowCount ?? 0} item(s) that had stock but nothing to dispense`);
    if ((stillDrifted.rowCount ?? 0) > 0) {
      console.log(
        `${stillDrifted.rowCount} item(s) still disagree with their batch records and need a ` +
        `physical count via Stock-take (on-hand vs batches):`
      );
      for (const r of stillDrifted.rows) {
        console.log(`  ${r.medication_name}: on-hand ${r.quantity_on_hand} vs batches ${r.batch_total}`);
      }
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  backfillInventoryOpeningBatches()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
