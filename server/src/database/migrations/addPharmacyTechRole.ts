import pool from '../db';

async function addPharmacyTechRole() {
  console.log('Adding pharmacy_tech role...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop the existing constraint
    await client.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check
    `);

    // Add the new constraint with pharmacy_tech role
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('doctor', 'nurse', 'admin', 'receptionist', 'patient', 'lab', 'pharmacy', 'pharmacist', 'pharmacy_tech', 'imaging'))
    `);

    // Update existing pharmacy technicians to have pharmacy_tech role
    // This assumes pharmacy technicians have 'Pharmacy Technician' in their position
    await client.query(`
      UPDATE users
      SET role = 'pharmacy_tech'
      WHERE role = 'pharmacy' AND position ILIKE '%technician%'
    `);

    // Update pharmacists to have pharmacist role (Pharm D.)
    await client.query(`
      UPDATE users
      SET role = 'pharmacist'
      WHERE role = 'pharmacy' AND (position ILIKE '%pharm d%' OR position ILIKE '%pharmacist%')
    `);

    await client.query('COMMIT');
    console.log('✅ Pharmacy tech role added successfully!');
    console.log('   - Updated role constraint');
    console.log('   - Updated pharmacy technicians to pharmacy_tech role');
    console.log('   - Updated pharmacists to pharmacist role');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding pharmacy_tech role:', error);
    throw error;
  } finally {
    client.release();
  }

  process.exit(0);
}

addPharmacyTechRole().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
