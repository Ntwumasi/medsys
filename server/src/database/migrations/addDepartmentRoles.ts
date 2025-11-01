import pool from '../db';

async function addDepartmentRoles() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔧 Updating user roles constraint...');

    // Drop the existing role check constraint
    await client.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    `);

    // Add the new role check constraint with department roles
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('doctor', 'nurse', 'admin', 'receptionist', 'patient', 'lab', 'pharmacy', 'imaging'));
    `);

    await client.query('COMMIT');
    console.log('✅ User roles constraint updated successfully!');
    console.log('   Added roles: lab, pharmacy, imaging');
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
addDepartmentRoles()
  .then(() => {
    console.log('✓ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
