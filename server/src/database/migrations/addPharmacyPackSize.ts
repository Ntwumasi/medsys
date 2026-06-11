import pool from '../db';

/**
 * pack_size on pharmacy_inventory — units per sellable pack.
 *
 * `selling_price` is the price of ONE pack/container, but dispensing records
 * quantity in individual units (tablets/capsules), so billing was computing
 * `selling_price × tablet_count` and massively over-charging pack-priced meds
 * (e.g. a 14-tablet Augmentin course billed 14 × the pack price).
 *
 * pack_size lets billing convert: per-unit price = selling_price / pack_size,
 * line total = selling_price × quantity / pack_size. Default 1 means "sold per
 * unit" — i.e. no behaviour change for the ~95% of items priced per tablet/
 * vial/bottle. Only true multi-unit packs need a pack_size > 1.
 */
export async function addPharmacyPackSize() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE pharmacy_inventory
        ADD COLUMN IF NOT EXISTS pack_size NUMERIC NOT NULL DEFAULT 1
          CHECK (pack_size > 0)
    `);

    // Seed the pack sizes we have evidence for. Augmentin tabs are dispensed
    // as a 14-tablet course = 1 pack. Other pack/strip items need their real
    // pack sizes set by the pharmacist in the inventory UI before they bill
    // correctly; until then they stay at 1 (= unchanged behaviour).
    await client.query(`
      UPDATE pharmacy_inventory
         SET pack_size = 14
       WHERE unit = 'pack'
         AND medication_name IN ('TAB AUGMENTIN 1G', 'TAB AUGMENTIN 625MG')
         AND pack_size = 1
    `);

    await client.query('COMMIT');
    console.log('pharmacy_inventory.pack_size added (Augmentin seeded to 14).');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addPharmacyPackSize migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addPharmacyPackSize()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
