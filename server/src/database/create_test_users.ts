import pool from './db';
import bcrypt from 'bcrypt';
import { devSeedPassword } from './seedPasswords';

const createTestUsers = async () => {
  const client = await pool.connect();

  try {
    const password = devSeedPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    // Create receptionist
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('receptionist@medsys.com', $1, 'receptionist', 'Jane', 'Smith', '555-0101', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // Create nurse
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('nurse@medsys.com', $1, 'nurse', 'Sarah', 'Johnson', '555-0102', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // Create doctor
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('doctor@medsys.com', $1, 'doctor', 'John', 'Williams', '555-0103', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // Create admin
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('admin@medsys.com', $1, 'admin', 'Admin', 'User', '555-0100', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    console.log('✅ Test users created successfully!');
    console.log('\nLogin credentials:');
    console.log('─────────────────────────────────────');
    console.log('Receptionist: receptionist@medsys.com');
    console.log('Nurse:        nurse@medsys.com');
    console.log('Doctor:       doctor@medsys.com');
    console.log('Admin:        admin@medsys.com');
    console.log(`Password (all): ${password}`);
    console.log('─────────────────────────────────────\n');

  } catch (error) {
    console.error('Error creating test users:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

createTestUsers();
