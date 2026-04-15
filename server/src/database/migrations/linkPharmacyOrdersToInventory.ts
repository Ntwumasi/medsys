import pool from '../db';

async function linkPharmacyOrdersToInventory() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding inventory_id column to pharmacy_orders...');
    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES pharmacy_inventory(id)
    `);

    console.log('Adding substitute_medication column to pharmacy_orders...');
    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS substitute_medication VARCHAR(200)
    `);

    console.log('Adding substitute_reason column to pharmacy_orders...');
    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS substitute_reason TEXT
    `);

    // Create index for inventory_id lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_inventory_id ON pharmacy_orders(inventory_id)
    `);

    // Attempt to link existing orders to inventory by medication name
    console.log('Linking existing orders to inventory items...');
    const linkResult = await client.query(`
      UPDATE pharmacy_orders po
      SET inventory_id = pi.id
      FROM pharmacy_inventory pi
      WHERE po.inventory_id IS NULL
        AND pi.medication_name ILIKE po.medication_name
        AND pi.is_active = true
    `);
    console.log(`Linked ${linkResult.rowCount} existing orders to inventory`);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

linkPharmacyOrdersToInventory()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
