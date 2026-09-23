import pool from '../db';

/**
 * Adds users.is_head_nurse.
 *
 * WHY THIS EXISTS: the head-nurse QA patient list shipped with
 * `is_head_nurse` in the login SELECT (authController.login) but with no
 * migration to create the column — it was added to production by hand. Any
 * database built from the migrations alone (staging, demo, a new clinic)
 * therefore had a users table without the column, so the login query failed
 * with 42703 and *every* login returned a 500. This backfills the missing
 * step so a fresh database matches production.
 *
 * Idempotent: a no-op on production, where the column already exists.
 */
export async function addHeadNurseFlag() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_head_nurse BOOLEAN DEFAULT FALSE
    `);

    await client.query('COMMIT');
    console.log('users.is_head_nurse present');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addHeadNurseFlag()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
