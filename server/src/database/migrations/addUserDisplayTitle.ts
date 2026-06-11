import pool from '../db';

/**
 * Adds `display_title` to users.
 *
 * Lets a staff member's dashboard/role label be overridden per-user without
 * changing their actual `role` (and therefore their permissions). First use:
 * Angela keeps role='admin' but her dashboard reads "Office Manager".
 * When NULL, the UI falls back to the role's default label.
 */
async function addUserDisplayTitle() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Adding display_title to users...');

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS display_title VARCHAR(100)
    `);

    await client.query('COMMIT');
    console.log('🎉 display_title migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addUserDisplayTitle()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
