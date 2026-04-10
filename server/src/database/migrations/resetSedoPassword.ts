import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * One-off script: reset Sedo Tamakloe's (stamakloe) password to 'demo123',
 * force a password change on next login, clear lockout state, and clear
 * recent failed login attempts so he can immediately log back in.
 */
export async function resetSedoPassword() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM users WHERE username = 'stamakloe'`
    );

    if (existing.rows.length === 0) {
      throw new Error("User 'stamakloe' not found");
    }

    const userId = existing.rows[0].id;
    const passwordHash = await bcrypt.hash('demo123', 10);

    await client.query(
      `UPDATE users
         SET password_hash = $1,
             must_change_password = TRUE,
             password_changed_at = NOW(),
             failed_login_attempts = 0,
             locked_until = NULL,
             is_active = TRUE
       WHERE id = $2`,
      [passwordHash, userId]
    );

    // Clear any recent failed login attempts so brute-force gate is reset
    await client.query(
      `DELETE FROM login_attempts
        WHERE user_id = $1 AND success = FALSE`,
      [userId]
    );

    await client.query('COMMIT');
    console.log("✅ Reset password for 'stamakloe' to 'demo123'");
    console.log('   - must_change_password = TRUE (will be prompted on login)');
    console.log('   - lockout cleared, failed attempts reset');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  resetSedoPassword()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
