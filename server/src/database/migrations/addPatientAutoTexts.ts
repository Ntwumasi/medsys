/**
 * Migration: automatic patient texts (reminders + "it's ready" notices)
 *
 * SMS only ever went out on a click (payment reminders, portal links, bulk
 * campaigns). Patients got no reminder before an appointment, follow-up or
 * refill, and no text when results / medication were ready or a payment was
 * taken. This adds:
 *
 *  - patient_sms_log: one row per automatic text. (kind, ref_key) is unique so
 *    the same reminder can never go to a patient twice, even if the daily job
 *    runs again or a lab result is re-verified.
 *  - patients.sms_reminders_opt_out: patient asked for no automatic texts.
 *    Separate from marketing_opt_out — someone can refuse promotions and still
 *    want their appointment reminder.
 *  - reminder_settings toggles, one per kind, ALL OFF. Texting is live on prod,
 *    so nothing goes out until an admin switches a kind on.
 */

import pool from '../db';

const SETTINGS: { key: string; value: string; description: string }[] = [
  { key: 'patient_sms_appointment_enabled', value: 'false', description: 'Text patients the day before an appointment' },
  { key: 'patient_sms_follow_up_enabled', value: 'false', description: 'Text patients ahead of a doctor-ordered follow-up visit (email if no phone)' },
  { key: 'patient_sms_refill_enabled', value: 'false', description: 'Text patients when a long-term medication is due for a refill' },
  { key: 'patient_sms_lab_ready_enabled', value: 'false', description: 'Text patients when their lab results are verified' },
  { key: 'patient_sms_pharmacy_ready_enabled', value: 'false', description: 'Text patients when their medication is ready for pickup' },
  { key: 'patient_sms_payment_receipt_enabled', value: 'false', description: 'Text patients a receipt when a payment is taken at checkout' },
  { key: 'patient_sms_refill_days_before', value: '3', description: 'Days before the estimated refill date to send the refill text' },
  { key: 'patient_sms_clinic_name', value: 'Medics Clinic', description: 'Clinic name used in patient texts' },
  { key: 'patient_sms_clinic_phone', value: '025 607 0266', description: 'Phone number patients are told to call' },
];

export const runMigration = async (): Promise<void> => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_sms_log (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        kind VARCHAR(30) NOT NULL,
        ref_key VARCHAR(120) NOT NULL,
        channel VARCHAR(10) NOT NULL DEFAULT 'sms',
        destination VARCHAR(255),
        message TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        provider VARCHAR(30),
        error TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        UNIQUE (kind, ref_key)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_sms_log_created ON patient_sms_log (created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_sms_log_patient ON patient_sms_log (patient_id)`);

    await pool.query(`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS sms_reminders_opt_out BOOLEAN NOT NULL DEFAULT FALSE
    `);

    for (const s of SETTINGS) {
      await pool.query(
        `INSERT INTO reminder_settings (setting_key, setting_value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO NOTHING`,
        [s.key, s.value, s.description]
      );
    }

    console.log('Automatic patient texts ready (all kinds OFF until an admin enables them).');
  } catch (e) {
    console.error('addPatientAutoTexts migration failed:', e);
    throw e;
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
