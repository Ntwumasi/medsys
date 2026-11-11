import pool from '../db';

/**
 * Short stay care (head nurse's request): the Short Stay Unit becomes a ward,
 * not just two bed flags.
 *
 *  - short_stays: one row per admission to a bed — who, which bed, admitting
 *    doctor, reason, how often obs are due, and the discharge (condition, note,
 *    follow-up). Past stays are the history. One open stay per bed and per
 *    patient.
 *  - short_stay_entries: what happened during the stay — medicines and drips
 *    given, nursing notes, handovers, bed transfers.
 *  - Observations are ordinary vitals (vital_signs_history for the encounter),
 *    so critical-value alerts and the chart keep working; a stay only adds
 *    "when are obs next due".
 *  - Billing: the existing Detention charge (CONS-DETENTION), one unit per
 *    started 24 hours in bed. detention_item_id / billed_units track the line;
 *    bill_detention is off for stays carried over from before this change.
 *  - short_stay_beds.current_stay_id points at the open stay; beds already
 *    occupied are backfilled into stays.
 */
export async function addShortStayCare() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS short_stays (
        id SERIAL PRIMARY KEY,
        bed_id INTEGER NOT NULL REFERENCES short_stay_beds(id),
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        encounter_id INTEGER REFERENCES encounters(id),
        status VARCHAR(20) NOT NULL DEFAULT 'admitted',
        reason TEXT,
        doctor_id INTEGER REFERENCES users(id),
        obs_interval_minutes INTEGER NOT NULL DEFAULT 60,
        admitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        admitted_by INTEGER REFERENCES users(id),
        discharged_at TIMESTAMP,
        discharged_by INTEGER REFERENCES users(id),
        discharge_condition VARCHAR(30),
        discharge_note TEXT,
        follow_up TEXT,
        detention_item_id INTEGER REFERENCES invoice_items(id) ON DELETE SET NULL,
        billed_units INTEGER NOT NULL DEFAULT 0,
        bill_detention BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT short_stays_status_check CHECK (status IN ('admitted', 'discharged')),
        CONSTRAINT short_stays_obs_interval_check CHECK (obs_interval_minutes BETWEEN 15 AND 1440)
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_short_stays_open_bed ON short_stays (bed_id) WHERE status = 'admitted'
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_short_stays_open_patient ON short_stays (patient_id) WHERE status = 'admitted'
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_short_stays_admitted_at ON short_stays (admitted_at DESC)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS short_stay_entries (
        id SERIAL PRIMARY KEY,
        stay_id INTEGER NOT NULL REFERENCES short_stays(id) ON DELETE CASCADE,
        kind VARCHAR(20) NOT NULL,
        detail TEXT NOT NULL,
        recorded_by INTEGER REFERENCES users(id),
        recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT short_stay_entries_kind_check CHECK (kind IN ('medication', 'fluid', 'note', 'handover', 'transfer'))
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_short_stay_entries_stay ON short_stay_entries (stay_id, recorded_at)`);

    await client.query(`
      ALTER TABLE short_stay_beds ADD COLUMN IF NOT EXISTS current_stay_id INTEGER REFERENCES short_stays(id) ON DELETE SET NULL
    `);
    await client.query(`ALTER TABLE short_stay_beds ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);

    // Beds occupied today become open stays, with bill_detention off — the old
    // flow never billed detention, so don't charge patients already in a bed.
    await client.query(`
      INSERT INTO short_stays (bed_id, patient_id, encounter_id, reason, admitted_at, admitted_by, bill_detention)
      SELECT b.id, b.patient_id, b.current_encounter_id, b.notes, COALESCE(b.assigned_at, CURRENT_TIMESTAMP), b.assigned_by, false
        FROM short_stay_beds b
       WHERE b.is_available = false AND b.patient_id IS NOT NULL AND b.current_stay_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM short_stays s WHERE s.status = 'admitted' AND (s.bed_id = b.id OR s.patient_id = b.patient_id))
    `);
    await client.query(`
      UPDATE short_stay_beds b
         SET current_stay_id = s.id
        FROM short_stays s
       WHERE s.bed_id = b.id AND s.status = 'admitted' AND b.current_stay_id IS NULL
    `);

    await client.query('COMMIT');
    console.log('addShortStayCare migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addShortStayCare migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addShortStayCare()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
