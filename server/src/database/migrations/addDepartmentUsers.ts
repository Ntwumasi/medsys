import pool from '../db';
import bcrypt from 'bcrypt';

async function addDepartmentUsers() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🏥 Adding department users...');

    const password = await bcrypt.hash('demo123', 10);

    // Check if lab user exists
    const labCheck = await client.query(
      `SELECT id FROM users WHERE email = 'lab@medsys.com'`
    );

    if (labCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'lab', 'Lab', 'Technician', '555-0007')`,
        ['lab@medsys.com', password]
      );
      console.log('✅ Created lab user');
    } else {
      console.log('✓ Lab user already exists');
    }

    // Check if pharmacy user exists
    const pharmacyCheck = await client.query(
      `SELECT id FROM users WHERE email = 'pharmacy@medsys.com'`
    );

    if (pharmacyCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'pharmacy', 'Pharmacy', 'Technician', '555-0008')`,
        ['pharmacy@medsys.com', password]
      );
      console.log('✅ Created pharmacy user');
    } else {
      console.log('✓ Pharmacy user already exists');
    }

    // Check if imaging user exists
    const imagingCheck = await client.query(
      `SELECT id FROM users WHERE email = 'imaging@medsys.com'`
    );

    if (imagingCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, 'imaging', 'Imaging', 'Technician', '555-0009')`,
        ['imaging@medsys.com', password]
      );
      console.log('✅ Created imaging user');
    } else {
      console.log('✓ Imaging user already exists');
    }

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 Department users added successfully!');
    console.log('');
    console.log('New department credentials:');
    console.log('  Lab: lab@medsys.com / demo123');
    console.log('  Pharmacy: pharmacy@medsys.com / demo123');
    console.log('  Imaging: imaging@medsys.com / demo123');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
addDepartmentUsers()
  .then(() => {
    console.log('✓ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
