import pool from '../db';

export async function addShortStayBeds() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create short_stay_beds table
    await client.query(`
      CREATE TABLE IF NOT EXISTS short_stay_beds (
        id SERIAL PRIMARY KEY,
        bed_number VARCHAR(10) UNIQUE NOT NULL,
        bed_name VARCHAR(50) NOT NULL,
        is_available BOOLEAN DEFAULT true,
        current_encounter_id INTEGER REFERENCES encounters(id),
        patient_id INTEGER REFERENCES patients(id),
        assigned_at TIMESTAMP,
        assigned_by INTEGER REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Created short_stay_beds table');

    // Seed 2 beds
    await client.query(`
      INSERT INTO short_stay_beds (bed_number, bed_name)
      VALUES ('SSU-1', 'Bed 1'), ('SSU-2', 'Bed 2')
      ON CONFLICT (bed_number) DO NOTHING
    `);

    console.log('Seeded Short Stay Unit beds');

    await client.query('COMMIT');
    console.log('Short Stay Beds migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  addShortStayBeds()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
