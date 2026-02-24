import pool from '../db';

export async function addLabOrderEnteredBy() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add entered_by column to track who created the order (may differ from ordering_provider)
    await client.query(`
      ALTER TABLE lab_orders
      ADD COLUMN IF NOT EXISTS entered_by INTEGER REFERENCES users(id)
    `);

    // Backfill existing records: set entered_by to ordering_provider for existing orders
    await client.query(`
      UPDATE lab_orders
      SET entered_by = ordering_provider
      WHERE entered_by IS NULL
    `);

    // Add index for querying by entered_by
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_orders_entered_by ON lab_orders(entered_by)
    `);

    await client.query('COMMIT');
    console.log('Lab orders entered_by column added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding entered_by column:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  addLabOrderEnteredBy()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
