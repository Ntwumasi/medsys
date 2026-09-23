import pool from '../db';

/**
 * Backfills pharmacy_orders.inventory_id for historical OTC walk-in and refill
 * orders.
 *
 * WHY: Order History prices each row by joining pharmacy_inventory on
 * pharmacy_orders.inventory_id. The OTC walk-in and refill code paths never
 * stored that link (they only used inventory_id transiently, for the stock check
 * and batch dispense), so those sales showed their price as "—" even though the
 * sale itself was billed correctly. Both paths now store it; this repairs the
 * rows created before the fix.
 *
 * DELIBERATELY CONSERVATIVE: only links an order when its medication name
 * matches EXACTLY ONE inventory item. Orders whose name matches several items,
 * or no item at all, are left alone — guessing which item a past sale referred
 * to would attach a price to a row we cannot actually vouch for. Those keep
 * showing "—", which is honest.
 *
 * Idempotent: only touches rows where inventory_id IS NULL.
 */
export async function backfillPharmacyOrderInventoryLinks() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(`
      WITH inv AS (
        SELECT lower(trim(medication_name)) AS nm,
               count(*) AS match_count,
               min(id)  AS inventory_id
          FROM pharmacy_inventory
         WHERE medication_name IS NOT NULL AND trim(medication_name) <> ''
         GROUP BY 1
      )
      UPDATE pharmacy_orders po
         SET inventory_id = inv.inventory_id
        FROM inv
       WHERE po.inventory_id IS NULL
         AND po.medication_name IS NOT NULL
         AND trim(po.medication_name) <> ''
         AND lower(trim(po.medication_name)) = inv.nm
         AND inv.match_count = 1
    `);

    // Report what is left so the gap stays visible rather than looking complete.
    const remaining = await client.query(`
      SELECT count(*)::int AS n
        FROM pharmacy_orders
       WHERE inventory_id IS NULL AND is_manual_reminder IS NOT TRUE
    `);

    await client.query('COMMIT');

    console.log(`Linked ${result.rowCount ?? 0} pharmacy order(s) to inventory`);
    console.log(
      `${remaining.rows[0].n} order(s) still have no inventory link ` +
      `(ambiguous or no longer stocked) and will keep showing "—" in Order History`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  backfillPharmacyOrderInventoryLinks()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
