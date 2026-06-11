import pool from '../db';

/**
 * Adds `is_manual_reminder` to pharmacy_orders.
 *
 * Manually-added refill reminders were being inserted as status='dispensed'
 * purely to populate the refills calendar (see createManualRefill). That made
 * them leak into the pharmacy "Dispensed" tab, revenue and analytics as if a
 * real dispense had happened — the "reminders got auto-dispensed" report.
 *
 * We keep storing them in pharmacy_orders (so the refills calendar and the
 * process-refill flow are unchanged) but tag them with this flag, and every
 * place that lists/aggregates real dispenses now excludes flagged rows.
 */
async function addManualReminderFlag() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Adding is_manual_reminder flag to pharmacy_orders...');

    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS is_manual_reminder BOOLEAN NOT NULL DEFAULT false
    `);

    // Backfill existing phantom reminders. A real dispense ALWAYS records the
    // dispensing user and belongs to an encounter; manual refills have neither.
    const res = await client.query(`
      UPDATE pharmacy_orders
      SET is_manual_reminder = true
      WHERE status = 'dispensed'
        AND dispensed_by IS NULL
        AND encounter_id IS NULL
        AND is_manual_reminder = false
    `);
    console.log(`✅ Flagged ${res.rowCount} existing manual-reminder row(s)`);

    await client.query('COMMIT');
    console.log('🎉 is_manual_reminder migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addManualReminderFlag()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
