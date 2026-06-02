import pool from '../db';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Adds an `item_code` column to pharmacy_inventory so the self-serve inventory
 * uploader can match rows by the pharmacy's stable accounting code (DRUG###/ITM###)
 * instead of fuzzy medication names. Best-effort backfill from the import staging
 * file (docs/pricing/_pharminv.json, code↔name) when present; otherwise codes
 * self-heal on the first file upload (matched by name, code stored going forward).
 */
export async function addInventoryItemCode() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE pharmacy_inventory ADD COLUMN IF NOT EXISTS item_code VARCHAR(50)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_item_code ON pharmacy_inventory(item_code)`);
    console.log('Ensured pharmacy_inventory.item_code column + index');

    // Best-effort backfill from the local staging file (maps code -> name)
    const jsonPath = path.resolve(process.cwd(), '..', 'docs', 'pricing', '_pharminv.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const items: Array<{ code: string; name: string }> = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        let backfilled = 0;
        for (const it of items) {
          if (!it.code || !it.name) continue;
          const res = await client.query(
            `UPDATE pharmacy_inventory
                SET item_code = $1
              WHERE item_code IS NULL AND LOWER(TRIM(medication_name)) = LOWER(TRIM($2))`,
            [it.code.trim(), it.name.trim()]
          );
          backfilled += res.rowCount || 0;
        }
        console.log(`Backfilled item_code for ${backfilled} items from _pharminv.json`);
      } catch (e) {
        console.warn('item_code backfill skipped (could not read staging file):', (e as Error).message);
      }
    } else {
      console.log('No _pharminv.json present — codes will self-heal on first upload.');
    }

    await client.query('COMMIT');
    console.log('addInventoryItemCode migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addInventoryItemCode failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addInventoryItemCode()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
