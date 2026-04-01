import pool from '../db';

/**
 * Migration: Add username-based login
 *
 * - Adds username column to users table
 * - Generates usernames for existing users (first initial + lastname)
 * - Handles duplicates by appending numbers
 * - Sets must_change_password = true for all existing users
 */
export async function addUsernameLogin() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Starting username login migration...\n');

    // 1. Add username column if it doesn't exist
    console.log('Adding username column...');
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE
    `);
    console.log('✅ Added username column');

    // 2. Generate usernames for existing users
    console.log('\nGenerating usernames for existing users...');

    const usersResult = await client.query(`
      SELECT id, first_name, last_name, email
      FROM users
      WHERE username IS NULL
      ORDER BY created_at ASC
    `);

    const existingUsernames = new Set<string>();

    // First, get any existing usernames
    const existingResult = await client.query(`
      SELECT username FROM users WHERE username IS NOT NULL
    `);
    existingResult.rows.forEach(row => existingUsernames.add(row.username.toLowerCase()));

    for (const user of usersResult.rows) {
      // Generate base username: first initial + lastname (lowercase, no spaces)
      const firstInitial = (user.first_name || 'x').charAt(0).toLowerCase();
      const lastName = (user.last_name || 'user').toLowerCase().replace(/[^a-z]/g, '');
      let baseUsername = `${firstInitial}${lastName}`;

      // Ensure minimum length
      if (baseUsername.length < 3) {
        baseUsername = baseUsername + 'user';
      }

      // Handle duplicates
      let username = baseUsername;
      let counter = 2;
      while (existingUsernames.has(username)) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      existingUsernames.add(username);

      // Update user with generated username
      await client.query(
        `UPDATE users SET username = $1 WHERE id = $2`,
        [username, user.id]
      );

      console.log(`  ${user.first_name} ${user.last_name} (${user.email}) → ${username}`);
    }

    console.log(`✅ Generated usernames for ${usersResult.rows.length} users`);

    // 3. Make username NOT NULL after populating
    console.log('\nMaking username column required...');
    await client.query(`
      ALTER TABLE users ALTER COLUMN username SET NOT NULL
    `);
    console.log('✅ Username column is now required');

    // 4. Create index for faster username lookups
    console.log('\nCreating index on username...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `);
    console.log('✅ Created username index');

    // 5. Set must_change_password = true for all users (they need to set their own password)
    console.log('\nFlagging all users to change password on next login...');
    await client.query(`
      UPDATE users SET must_change_password = true WHERE must_change_password IS NULL OR must_change_password = false
    `);
    console.log('✅ All users flagged for password change');

    await client.query('COMMIT');
    console.log('\n✅ Username login migration completed successfully!');
    console.log('\nUsers can now login with their username. Default password is: demo123');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  addUsernameLogin()
    .then(() => {
      console.log('\nMigration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
