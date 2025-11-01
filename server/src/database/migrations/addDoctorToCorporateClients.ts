import pool from '../db';

const addDoctorToCorporateClients = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add doctor_id column to corporate_clients table
    await client.query(`
      ALTER TABLE corporate_clients
      ADD COLUMN IF NOT EXISTS assigned_doctor_id INTEGER REFERENCES users(id)
    `);

    console.log('Added assigned_doctor_id column to corporate_clients table');

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding doctor to corporate clients:', error);
    throw error;
  } finally {
    client.release();
  }
};

export default addDoctorToCorporateClients;

// Run if called directly
if (require.main === module) {
  addDoctorToCorporateClients()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
