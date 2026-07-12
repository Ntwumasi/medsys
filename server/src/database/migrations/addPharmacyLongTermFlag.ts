import pool from '../db';

/**
 * Adds `is_long_term` to pharmacy_orders.
 *
 * Lets the prescribing doctor explicitly mark a medication as Long-term
 * (chronic / refillable → shows on the pharmacy RefillsCalendar) vs One-time
 * (a single course, no refill). Previously "long-term" was only *implicit*
 * (refills > 0). The refills calendar now includes an order when it is either
 * explicitly long-term OR still has refills remaining, so existing dispensed
 * orders are unaffected (Irene: distinguish chronic meds that need refill
 * reminders from one-off prescriptions).
 *
 * Default false = one-time, matching the safe/backwards-compatible behaviour
 * for existing rows.
 */
async function addPharmacyLongTermFlag() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Adding is_long_term to pharmacy_orders...');

    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS is_long_term BOOLEAN NOT NULL DEFAULT false
    `);

    await client.query('COMMIT');
    console.log('🎉 is_long_term migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addPharmacyLongTermFlag()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
