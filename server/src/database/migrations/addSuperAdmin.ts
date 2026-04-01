import pool from '../db';

/**
 * Migration to add super admin functionality
 *
 * This migration:
 * 1. Adds is_super_admin column to users table
 * 2. Sets specific users as super admins
 *
 * Update the SUPER_ADMIN_USERNAMES array with the correct usernames
 * before running this migration.
 */

// Add usernames of users who should be super admins
// Format: first initial + lastname (lowercase)
const SUPER_ADMIN_USERNAMES = [
  'stamakloe',
  'rkyei',
  'ntwumasi',
];

export async function addSuperAdmin() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding is_super_admin column to users table...');

    // Check if column exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'is_super_admin'
    `);

    if (columnCheck.rows.length === 0) {
      // Add is_super_admin column
      await client.query(`
        ALTER TABLE users
        ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE
      `);
      console.log('Added is_super_admin column');
    } else {
      console.log('is_super_admin column already exists');
    }

    // Set super admin status for specified users
    if (SUPER_ADMIN_USERNAMES.length > 0) {
      console.log(`Setting super admin status for: ${SUPER_ADMIN_USERNAMES.join(', ')}`);

      const result = await client.query(`
        UPDATE users
        SET is_super_admin = TRUE
        WHERE LOWER(username) = ANY($1::text[])
        RETURNING id, username, first_name, last_name
      `, [SUPER_ADMIN_USERNAMES.map(u => u.toLowerCase())]);

      console.log(`Updated ${result.rowCount} users as super admin:`);
      result.rows.forEach(row => {
        console.log(`  - ${row.username} (${row.first_name} ${row.last_name})`);
      });

      // Check if any specified usernames weren't found
      const foundUsernames = result.rows.map(r => r.username.toLowerCase());
      const notFound = SUPER_ADMIN_USERNAMES.filter(u => !foundUsernames.includes(u.toLowerCase()));
      if (notFound.length > 0) {
        console.warn(`Warning: The following usernames were not found: ${notFound.join(', ')}`);
      }
    } else {
      console.log('No super admin usernames specified. Edit SUPER_ADMIN_USERNAMES array and re-run.');
    }

    await client.query('COMMIT');
    console.log('Super admin migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Super admin migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Allow running directly
if (require.main === module) {
  addSuperAdmin()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
