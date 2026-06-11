import pool from '../db';

/**
 * Adds `reminder_cleared` to pharmacy_orders.
 *
 * Lets a pharmacist manually dismiss a refill from the refills calendar once it
 * has been supplied — for BOTH manually-added reminders and real dispensed-order
 * refills (Irene: "for June they've been supplied, let me clear it manually").
 * Cleared rows are filtered out of the refills calendar but the order/dispense
 * record itself is untouched.
 */
async function addRefillReminderCleared() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Adding reminder_cleared to pharmacy_orders...');

    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS reminder_cleared BOOLEAN NOT NULL DEFAULT false
    `);

    await client.query('COMMIT');
    console.log('🎉 reminder_cleared migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addRefillReminderCleared()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
