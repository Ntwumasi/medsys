import pool from '../db';

/**
 * Reset pharmacy_inventory.pack_size back to 1 for every item.
 *
 * Background: `pack_size` was introduced (addPharmacyPackSize) to divide a
 * per-pack selling_price into a per-tablet price at dispense time, on the
 * assumption that pharmacy dispenses in individual units. In practice the
 * clinic stocks AND sells by the pack it receives (Irene: "we receive it in
 * inventory as a pack, so that's how we sell it"), so selling_price already
 * matches the unit dispensed. The divisor was undercharging every item that
 * had a pack_size set (e.g. Augmentin 1G billed 301/14 = 21.50 instead of 301).
 *
 * The billing code no longer divides by pack_size (ordersController), so this
 * column is now inert. Resetting it to 1 keeps the data honest and — while the
 * old billing code is still live on prod — immediately restores correct
 * per-pack pricing (selling_price / 1 = selling_price).
 *
 * Partial-pack ("per tab") sales are rare and handled as a manual price edit on
 * the invoice.
 */
export async function resetPharmacyPackSize() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      `SELECT id, medication_name, unit, selling_price, pack_size
         FROM pharmacy_inventory WHERE pack_size <> 1 ORDER BY medication_name`
    );
    console.log(`Items with pack_size <> 1 before reset: ${before.rows.length}`);
    before.rows.forEach(r =>
      console.log(`  #${r.id} ${r.medication_name} (${r.unit}) price=${r.selling_price} pack_size=${r.pack_size} -> 1`)
    );

    const res = await client.query(`UPDATE pharmacy_inventory SET pack_size = 1 WHERE pack_size <> 1`);
    console.log(`Reset pack_size to 1 on ${res.rowCount} rows.`);

    await client.query('COMMIT');
    console.log('resetPharmacyPackSize completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('resetPharmacyPackSize migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  resetPharmacyPackSize()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
