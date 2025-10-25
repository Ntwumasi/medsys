import pool from '../database/db';
import bcrypt from 'bcrypt';

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🌱 Starting database seeding...');

    // Check if rooms already exist
    const roomsCheck = await client.query('SELECT COUNT(*) FROM rooms');
    const roomCount = parseInt(roomsCheck.rows[0].count);

    if (roomCount === 0) {
      console.log('📦 Seeding rooms...');

      // Create 10 examination rooms
      for (let i = 1; i <= 10; i++) {
        await client.query(
          `INSERT INTO rooms (room_number, room_name, room_type, is_available)
           VALUES ($1, $2, 'examination', true)`,
          [`${i}`, `Exam Room ${i}`]
        );
      }

      console.log('✅ Created 10 examination rooms');
    } else {
      console.log(`✓ Rooms already seeded (${roomCount} rooms found)`);
    }

    // Check if demo users exist
    const usersCheck = await client.query('SELECT COUNT(*) FROM users WHERE role != \'patient\'');
    const userCount = parseInt(usersCheck.rows[0].count);

    if (userCount === 0) {
      console.log('👥 Seeding demo users...');

      const password = await bcrypt.hash('demo123', 10);

      // Create admin user
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'admin', 'Admin', 'User', '555-0001')`,
        ['admin@medsys.com', password]
      );

      // Create receptionist user
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'receptionist', 'Jane', 'Smith', '555-0002')`,
        ['receptionist@medsys.com', password]
      );

      // Create nurse users
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'nurse', 'Sarah', 'Johnson', '555-0003')`,
        ['nurse@medsys.com', password]
      );

      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'nurse', 'Michael', 'Brown', '555-0004')`,
        ['nurse2@medsys.com', password]
      );

      // Create doctor users
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'doctor', 'Dr. John', 'Williams', '555-0005')`,
        ['doctor@medsys.com', password]
      );

      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'doctor', 'Dr. Emily', 'Davis', '555-0006')`,
        ['doctor2@medsys.com', password]
      );

      console.log('✅ Created 6 demo users (admin, receptionist, 2 nurses, 2 doctors)');
      console.log('   Password for all users: demo123');
    } else {
      console.log(`✓ Users already seeded (${userCount} staff users found)`);
    }

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 Database seeding completed successfully!');
    console.log('');
    console.log('Demo credentials:');
    console.log('  Admin: admin@medsys.com / demo123');
    console.log('  Receptionist: receptionist@medsys.com / demo123');
    console.log('  Nurse: nurse@medsys.com / demo123');
    console.log('  Doctor: doctor@medsys.com / demo123');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the seed function
seedDatabase()
  .then(() => {
    console.log('✓ Seed script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });
