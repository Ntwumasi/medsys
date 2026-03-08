import pool from '../db';

async function addInventoryBatches() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating inventory_batches table...');

    // Create inventory_batches table for FEFO tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_batches (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES pharmacy_inventory(id) ON DELETE CASCADE,
        batch_number VARCHAR(100),
        quantity INTEGER NOT NULL DEFAULT 0,
        unit_cost DECIMAL(10, 2),
        expiry_date DATE,
        received_date DATE DEFAULT CURRENT_DATE,
        supplier_id INTEGER REFERENCES suppliers(id),
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_batches_inventory_id ON inventory_batches(inventory_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_batches_active ON inventory_batches(is_active) WHERE is_active = true
    `);

    // Migrate existing inventory items to batches
    // Create a batch for each item that has stock
    console.log('Migrating existing inventory to batches...');

    const existingInventory = await client.query(`
      SELECT id, quantity_on_hand, unit_cost, expiry_date, supplier_id
      FROM pharmacy_inventory
      WHERE quantity_on_hand > 0
    `);

    for (const item of existingInventory.rows) {
      // Check if batch already exists for this item
      const existingBatch = await client.query(
        'SELECT id FROM inventory_batches WHERE inventory_id = $1 LIMIT 1',
        [item.id]
      );

      if (existingBatch.rows.length === 0) {
        await client.query(`
          INSERT INTO inventory_batches (inventory_id, batch_number, quantity, unit_cost, expiry_date, supplier_id, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          item.id,
          'LEGACY-BATCH',
          item.quantity_on_hand,
          item.unit_cost,
          item.expiry_date,
          item.supplier_id,
          'Migrated from existing inventory'
        ]);
      }
    }

    await client.query('COMMIT');
    console.log('Inventory batches migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in inventory batches migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
addInventoryBatches()
  .then(() => {
    console.log('Migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
