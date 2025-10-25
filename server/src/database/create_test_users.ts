import pool from './db';
import bcrypt from 'bcrypt';

const createTestUsers = async () => {
  const client = await pool.connect();

  try {
    const password = 'demo123';
    const passwordHash = await bcrypt.hash(password, 10);

    // Create receptionist
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('receptionist@clinic.com', $1, 'receptionist', 'Jane', 'Smith', '555-0101', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // Create nurse
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('nurse@clinic.com', $1, 'nurse', 'Sarah', 'Johnson', '555-0102', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // Create doctor
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('doctor@clinic.com', $1, 'doctor', 'John', 'Williams', '555-0103', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // Create admin
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ('admin@clinic.com', $1, 'admin', 'Admin', 'User', '555-0100', true)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    console.log('✅ Test users created successfully!');
    console.log('\nLogin credentials:');
    console.log('─────────────────────────────────────');
    console.log('Receptionist: receptionist@clinic.com / demo123');
    console.log('Nurse:        nurse@clinic.com / demo123');
    console.log('Doctor:       doctor@clinic.com / demo123');
    console.log('Admin:        admin@clinic.com / demo123');
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
