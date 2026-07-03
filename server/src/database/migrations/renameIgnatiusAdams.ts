import pool from '../db';

/**
 * Rename the OB/GYN specialist "James Adams" -> "Ignatius Adams".
 *
 * Requested by reception: the doctor's correct name is Dr. Ignatius Adams. This
 * updates only first_name on the existing user row (id 37, username 'jadams',
 * seeded by addClinicStaff). Username and email are intentionally left
 * unchanged so his login continues to work.
 */
export async function renameIgnatiusAdams() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `UPDATE users
          SET first_name = 'Ignatius', updated_at = CURRENT_TIMESTAMP
        WHERE username = 'jadams'
          AND lower(last_name) = 'adams'
          AND lower(first_name) = 'james'
        RETURNING id, first_name, last_name, username, email, role`
    );

    if (res.rows.length === 0) {
      // Idempotent: already renamed (or not found) — report and continue.
      const check = await client.query(
        `SELECT id, first_name, last_name, username FROM users WHERE username = 'jadams'`
      );
      console.log('No James Adams row updated. Current jadams row:', check.rows[0] || '(none found)');
    } else {
      console.log('Renamed doctor:', res.rows[0]);
    }

    await client.query('COMMIT');
    console.log('renameIgnatiusAdams completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('renameIgnatiusAdams migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  renameIgnatiusAdams()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
