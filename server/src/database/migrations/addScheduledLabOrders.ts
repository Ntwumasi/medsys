import pool from '../db';

export async function addScheduledLabOrders() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add scheduled_for column to lab_orders
    await client.query(`
      ALTER TABLE lab_orders
        ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP
    `);
    console.log('Added scheduled_for to lab_orders');

    // Add scheduled_for column to imaging_orders
    await client.query(`
      ALTER TABLE imaging_orders
        ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP
    `);
    console.log('Added scheduled_for to imaging_orders');

    // Update priority CHECK constraint on lab_orders to include 'scheduled'
    await client.query(`
      ALTER TABLE lab_orders DROP CONSTRAINT IF EXISTS lab_orders_priority_check
    `);
    await client.query(`
      ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_priority_check
        CHECK (priority IN ('routine', 'urgent', 'stat', 'scheduled'))
    `);
    console.log('Updated lab_orders priority constraint');

    // Update priority CHECK constraint on imaging_orders to include 'scheduled'
    await client.query(`
      ALTER TABLE imaging_orders DROP CONSTRAINT IF EXISTS imaging_orders_priority_check
    `);
    await client.query(`
      ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_priority_check
        CHECK (priority IN ('routine', 'urgent', 'stat', 'scheduled'))
    `);
    console.log('Updated imaging_orders priority constraint');

    await client.query('COMMIT');
    console.log('addScheduledLabOrders migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addScheduledLabOrders migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

addScheduledLabOrders()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
