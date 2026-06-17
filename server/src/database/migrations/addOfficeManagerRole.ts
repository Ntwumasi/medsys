import pool from '../db';

/**
 * Adds 'office_manager' to the allowed values of the users.role check constraint.
 *
 * Office Manager is a real role with the same permissions as admin (enforced in
 * authorizeRoles), but distinct so it can be labelled, impersonated and audited
 * separately. Angela moves from admin → office_manager.
 */
async function addOfficeManagerRole() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Adding office_manager to users_role_check...');

    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN (
        'doctor', 'nurse', 'admin', 'office_manager', 'receptionist', 'patient',
        'lab', 'pharmacy', 'pharmacist', 'pharmacy_tech', 'imaging', 'accountant'
      ))
    `);

    await client.query('COMMIT');
    console.log('🎉 office_manager role migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addOfficeManagerRole()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
