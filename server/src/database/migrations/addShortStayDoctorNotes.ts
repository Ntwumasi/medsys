import pool from '../db';

/**
 * Doctors on the Short Stay Unit (Dr Sedo / Joe's request).
 *
 *  - short_stays.treatment_plan: the doctor's current plan, shown to nurses on
 *    the bed card. Who changed it last and when.
 *  - short_stay_doctor_notes: progress notes, procedure notes and the discharge
 *    summary for a stay. Saved as a draft, then signed; a signed note is locked.
 *
 * Additive and idempotent.
 */
export async function addShortStayDoctorNotes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE short_stays ADD COLUMN IF NOT EXISTS treatment_plan TEXT`);
    await client.query(`ALTER TABLE short_stays ADD COLUMN IF NOT EXISTS plan_updated_at TIMESTAMP`);
    await client.query(`ALTER TABLE short_stays ADD COLUMN IF NOT EXISTS plan_updated_by INTEGER REFERENCES users(id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS short_stay_doctor_notes (
        id SERIAL PRIMARY KEY,
        stay_id INTEGER NOT NULL REFERENCES short_stays(id) ON DELETE CASCADE,
        note_type VARCHAR(20) NOT NULL,
        title TEXT,
        subjective TEXT,
        examination TEXT,
        assessment_plan TEXT,
        status VARCHAR(10) NOT NULL DEFAULT 'draft',
        author_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        signed_at TIMESTAMP,
        CONSTRAINT short_stay_doctor_notes_type_check CHECK (note_type IN ('progress', 'procedure', 'discharge')),
        CONSTRAINT short_stay_doctor_notes_status_check CHECK (status IN ('draft', 'signed'))
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_short_stay_doctor_notes_stay ON short_stay_doctor_notes (stay_id, created_at)`);
    await client.query('COMMIT');
    console.log('addShortStayDoctorNotes migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addShortStayDoctorNotes migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addShortStayDoctorNotes()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
