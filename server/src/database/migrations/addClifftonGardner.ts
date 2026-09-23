import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * Migration to add Cliffton Gardner as an admin with super admin permissions.
 * Username: cgardner
 */
export async function addClifftonGardner() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if user already exists
    const existing = await client.query(
      `SELECT id FROM users WHERE username = 'cgardner'`
    );

    if (existing.rows.length > 0) {
      console.log('User cgardner already exists, ensuring super admin and admin role...');
      await client.query(
        `UPDATE users SET role = 'admin', is_super_admin = TRUE, is_active = TRUE WHERE username = 'cgardner'`
      );
      console.log('Updated cgardner: role=admin, is_super_admin=true');
    } else {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash('demo123', saltRounds);

      // NOTE: no department/position columns here — the users table has never
      // had them (not even in production). Including them made this migration
      // fail with 42703 on any fresh database, which halted the whole
      // migration run and left every later migration unapplied.
      await client.query(
        `INSERT INTO users (first_name, last_name, email, username, password_hash, role, is_active, is_super_admin, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, TRUE)`,
        [
          'Cliffton',
          'Gardner',
          'cliffton.gardner@medsys.com',
          'cgardner',
          passwordHash,
          'admin',
        ]
      );
      console.log('Created user cgardner (Cliffton Gardner) as admin + super admin');
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addClifftonGardner()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
