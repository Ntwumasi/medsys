import pool from '../db';
import { unusablePasswordHash } from '../seedPasswords';

async function addPatientUser() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding patient portal user...');

    const password = await unusablePasswordHash();

    // Check if patient user exists
    const patientCheck = await client.query(
      `SELECT id FROM users WHERE email = 'patient@medsys.com'`
    );

    if (patientCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'patient', 'Demo', 'Patient', '555-0099')`,
        ['patient@medsys.com', password]
      );
      console.log('Created patient user: patient@medsys.com (no usable password)');
    } else {
      console.log('Patient user already exists');
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addPatientUser();
