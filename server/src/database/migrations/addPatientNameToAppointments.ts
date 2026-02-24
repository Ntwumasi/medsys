import pool from '../db';

async function addPatientNameToAppointments() {
  const client = await pool.connect();

  try {
    console.log('Adding patient_name column to appointments table...');

    // Add patient_name column if it doesn't exist
    await client.query(`
      ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);
    `);

    // Make patient_id nullable if it isn't already
    await client.query(`
      ALTER TABLE appointments
      ALTER COLUMN patient_id DROP NOT NULL;
    `);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addPatientNameToAppointments();
