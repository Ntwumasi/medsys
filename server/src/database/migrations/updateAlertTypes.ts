import pool from '../db';

/**
 * Update the alerts.alert_type CHECK constraint to include all alert types
 * used across the application.
 *
 * Original constraint only allowed: patient_ready, vitals_critical, urgent, general
 * New types added: ready_for_doctor, follow_up_care, ready_for_checkout, critical_priority
 */
async function updateAlertTypes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop the old CHECK constraint
    await client.query(`
      ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check;
    `);

    // Also try the unnamed inline check constraint (PostgreSQL auto-names these)
    await client.query(`
      DO $$
      DECLARE
        constraint_name TEXT;
      BEGIN
        SELECT con.conname INTO constraint_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'alerts'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%alert_type%';

        IF constraint_name IS NOT NULL THEN
          EXECUTE 'ALTER TABLE alerts DROP CONSTRAINT ' || constraint_name;
          RAISE NOTICE 'Dropped constraint: %', constraint_name;
        END IF;
      END $$;
    `);

    // Add the new CHECK constraint with all alert types
    await client.query(`
      ALTER TABLE alerts ADD CONSTRAINT alerts_alert_type_check
      CHECK (alert_type IN (
        'patient_ready',
        'ready_for_doctor',
        'follow_up_care',
        'ready_for_checkout',
        'vitals_critical',
        'critical_priority',
        'urgent',
        'general'
      ));
    `);

    await client.query('COMMIT');
    console.log('✅ Alert type constraint updated successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to update alert type constraint:', error);
    throw error;
  } finally {
    client.release();
  }
}

updateAlertTypes()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
