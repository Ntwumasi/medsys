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

    // Add the new constraint with pharmacy_tech and pharmacist roles
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('doctor', 'nurse', 'admin', 'receptionist', 'patient', 'lab', 'pharmacy', 'pharmacist', 'pharmacy_tech', 'imaging'))
    `);

    await client.query('COMMIT');
    console.log('✅ Pharmacy roles updated successfully!');
    console.log('   - Role constraint now includes: pharmacist, pharmacy_tech');
    console.log('');
    console.log('To assign roles to users, update manually:');
    console.log("   UPDATE users SET role = 'pharmacist' WHERE email = 'pharmacist@example.com';");
    console.log("   UPDATE users SET role = 'pharmacy_tech' WHERE email = 'tech@example.com';");

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
