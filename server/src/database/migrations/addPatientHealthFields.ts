import pool from '../db';

export async function addPatientHealthFields() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add new columns to patients table
    await client.query(`
      ALTER TABLE patients
      ADD COLUMN IF NOT EXISTS nationality VARCHAR(100),
      ADD COLUMN IF NOT EXISTS region VARCHAR(100),
      ADD COLUMN IF NOT EXISTS gps_address VARCHAR(100),
      ADD COLUMN IF NOT EXISTS preferred_clinic VARCHAR(100),
      ADD COLUMN IF NOT EXISTS hiv_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS hepatitis_b_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS hepatitis_c_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS tb_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS sickle_cell_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS other_health_conditions TEXT
    `);

    console.log('Added new patient health and demographic fields');

    // Migrate data from state to region if state has data
    await client.query(`
      UPDATE patients
      SET region = state
      WHERE state IS NOT NULL AND region IS NULL
    `);

    console.log('Migrated state data to region');

    await client.query('COMMIT');
    console.log('Patient health fields migration completed successfully');

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
  addPatientHealthFields()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
