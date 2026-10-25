/**
 * Migration: one critical alert per lab order + value.
 *
 * The critical-value check runs on every finalisation path (verify, legacy
 * completion, re-verify after an edit). Its INSERT used ON CONFLICT DO NOTHING
 * but there was no unique constraint, so a re-run would raise a duplicate
 * alert. This index makes the alert idempotent; a corrected value is a new row.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  try {
    const dupes = await pool.query(`
      DELETE FROM critical_result_alerts a
       USING critical_result_alerts b
       WHERE a.id > b.id
         AND a.lab_order_id = b.lab_order_id
         AND a.alert_type = b.alert_type
         AND COALESCE(a.result_value, '') = COALESCE(b.result_value, '')
      RETURNING a.id
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_critical_alert_order_type_value
        ON critical_result_alerts (lab_order_id, alert_type, result_value)
    `);
    console.log(`Critical alert uniqueness ready (removed ${dupes.rowCount} duplicate(s)).`);
  } catch (e) {
    console.error('addCriticalAlertUniqueness migration failed:', e);
    throw e;
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
