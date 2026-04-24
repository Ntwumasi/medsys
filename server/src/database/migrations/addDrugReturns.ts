import pool from '../db';

export async function addDrugReturns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add return-related columns to pharmacy_orders
    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS return_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS return_reason TEXT,
      ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS returned_by INTEGER REFERENCES users(id)
    `);

    // Update status CHECK constraint to include 'returned'
    // Drop the old constraint if it exists and recreate with 'returned'
    await client.query(`
      ALTER TABLE pharmacy_orders DROP CONSTRAINT IF EXISTS pharmacy_orders_status_check
    `);
    await client.query(`
      ALTER TABLE pharmacy_orders ADD CONSTRAINT pharmacy_orders_status_check
      CHECK (status IN ('ordered', 'in_progress', 'ready', 'dispensed', 'cancelled', 'returned'))
    `);

    await client.query('COMMIT');
    console.log('Drug returns migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Drug returns migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run directly
addDrugReturns()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
