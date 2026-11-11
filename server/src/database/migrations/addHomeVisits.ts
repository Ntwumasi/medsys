import pool from '../db';

/**
 * Home visits: a doctor (optionally with a nurse) sees the patient at home.
 *
 *  - appointments.location_type 'clinic' | 'home', plus where to go: address,
 *    Ghana GPS code, landmark/directions and a contact phone for the visit.
 *    appointments.nurse_id is the nurse going along; encounter_id links the
 *    booking to the visit started from it.
 *  - patients.landmark: directions kept on the patient record.
 *  - encounters.is_home_visit / appointment_id: a home-visit encounter has no
 *    room, no queue and no reception checkout; the doctor closes it.
 *  - The encounter status rule the live databases already use is written down
 *    here (ready_for_doctor and discharged were added by hand), along with the
 *    discharged_at and self_pay_tier columns the code relies on, so a new
 *    database matches production.
 *  - reminder_settings: patient_sms_home_visit_enabled (OFF), the "doctor is on
 *    the way" text.
 */
export async function addHomeVisits() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS location_type VARCHAR(10) NOT NULL DEFAULT 'clinic',
        ADD COLUMN IF NOT EXISTS visit_address TEXT,
        ADD COLUMN IF NOT EXISTS visit_gps_address VARCHAR(100),
        ADD COLUMN IF NOT EXISTS visit_landmark TEXT,
        ADD COLUMN IF NOT EXISTS visit_contact_phone VARCHAR(30),
        ADD COLUMN IF NOT EXISTS nurse_id INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS encounter_id INTEGER REFERENCES encounters(id)
    `);
    await client.query(`ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_location_type_check`);
    await client.query(`
      ALTER TABLE appointments
        ADD CONSTRAINT appointments_location_type_check CHECK (location_type IN ('clinic', 'home'))
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_home_visits
        ON appointments (appointment_date) WHERE location_type = 'home'
    `);

    await client.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS landmark TEXT`);

    await client.query(`
      ALTER TABLE encounters
        ADD COLUMN IF NOT EXISTS is_home_visit BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS appointment_id INTEGER REFERENCES appointments(id),
        ADD COLUMN IF NOT EXISTS discharged_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS self_pay_tier INTEGER
    `);
    await client.query(`ALTER TABLE encounters DROP CONSTRAINT IF EXISTS encounters_status_check`);
    await client.query(`
      ALTER TABLE encounters ADD CONSTRAINT encounters_status_check CHECK (status IN (
        'scheduled', 'in-progress', 'with_nurse', 'ready_for_doctor', 'with_doctor',
        'completed', 'cancelled', 'checked_out', 'discharged'
      ))
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_encounters_appointment
        ON encounters (appointment_id) WHERE appointment_id IS NOT NULL
    `);

    await client.query(`
      INSERT INTO reminder_settings (setting_key, setting_value, description)
      VALUES ('patient_sms_home_visit_enabled', 'false', 'Text the patient when the doctor sets off for a home visit')
      ON CONFLICT (setting_key) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('addHomeVisits migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addHomeVisits migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addHomeVisits()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
