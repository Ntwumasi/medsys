import pool from '../db';

async function addChargeMasterIdToInvoiceItems() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔧 Adding charge_master_id to invoice_items table...');

    // Check if charge_master_id column already exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoice_items' AND column_name = 'charge_master_id'
    `);

    if (columnCheck.rows.length === 0) {
      console.log('Adding charge_master_id column...');

      await client.query(`
        ALTER TABLE invoice_items
        ADD COLUMN charge_master_id INTEGER REFERENCES charge_master(id)
      `);

      console.log('✅ Column added successfully');
    } else {
      console.log('✓ Column charge_master_id already exists');
    }

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 Invoice items migration completed successfully!');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
addChargeMasterIdToInvoiceItems()
  .then(() => {
    console.log('✓ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
