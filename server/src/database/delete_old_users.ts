import pool from './db';

const deleteOldUsers = async () => {
  const client = await pool.connect();

  try {
    await client.query(`
      DELETE FROM users
      WHERE email IN ('receptionist@clinic.com', 'nurse@clinic.com', 'doctor@clinic.com', 'admin@clinic.com')
    `);

    console.log('✅ Old @clinic.com users deleted successfully!');
  } catch (error) {
    console.error('Error deleting old users:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

deleteOldUsers();
