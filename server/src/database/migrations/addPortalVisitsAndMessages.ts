/**
 * Migration: patient portal — visit summaries, after-visit texts, front-desk messages.
 *
 *  - encounters.patient_note: optional "Notes for the patient" the doctor writes
 *    at sign-off; shown on the patient's visit summary (assessment/plan stay
 *    staff-only).
 *  - patient_portal_access_tokens.purpose / target: the after-visit text carries
 *    a 7-day link (purpose 'notify') that opens that visit once the patient
 *    confirms their date of birth. Login links stay 15 minutes.
 *  - patient_portal_messages: one conversation per patient with the front desk.
 *  - reminder_settings: patient_sms_visit_summary_enabled, OFF until an admin
 *    switches it on (same rule as every other automatic text).
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  try {
    await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS patient_note TEXT`);

    await pool.query(`
      ALTER TABLE patient_portal_access_tokens
        ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'login',
        ADD COLUMN IF NOT EXISTS target VARCHAR(60)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_portal_messages (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        sender VARCHAR(10) NOT NULL CHECK (sender IN ('patient', 'staff')),
        staff_user_id INTEGER REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_by_staff_at TIMESTAMP,
        read_by_staff_user_id INTEGER REFERENCES users(id),
        read_by_patient_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_messages_patient ON patient_portal_messages (patient_id, created_at)`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_portal_messages_unread_staff
        ON patient_portal_messages (patient_id) WHERE sender = 'patient' AND read_by_staff_at IS NULL
    `);

    await pool.query(
      `INSERT INTO reminder_settings (setting_key, setting_value, description)
       VALUES ('patient_sms_visit_summary_enabled', 'false', 'Text patients a link to their visit summary and invoice after each visit')
       ON CONFLICT (setting_key) DO NOTHING`
    );

    console.log('Portal visits + messages ready (after-visit text OFF until an admin enables it).');
  } catch (e) {
    console.error('addPortalVisitsAndMessages migration failed:', e);
    throw e;
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
