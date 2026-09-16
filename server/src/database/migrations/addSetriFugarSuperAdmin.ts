import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * Add Dr Setri Fugar as a super administrator, requested by Sedo Tamakloe
 * (himself a super admin, username 'stamakloeadmin') on 2026-09-14.
 *
 * Mirrors addAdminSuperusers: role='admin', is_super_admin=TRUE, and
 * must_change_password so the temp password below is only good for one login.
 * The temp password is generated at runtime and printed — hand it over directly,
 * don't store it anywhere.
 *
 * Idempotent: if the account already exists it is re-asserted to
 * admin / super / active WITHOUT touching the password, so re-running can't
 * lock anyone out.
 *
 * NB: staff emails are unique (partial index users_email_unique_staff), and
 * setrifugar@gmail.com was verified free before writing this.
 */

function genTempPassword(): string {
  // Meets the policy: upper + lower + digits + special.
  return 'Temp' + Math.random().toString(36).slice(2, 7).toUpperCase() + '#' + Math.floor(Math.random() * 9 + 1);
}

const ADMIN = {
  firstName: 'Setri',
  lastName: 'Fugar',
  username: 'sfugar',
  email: 'setrifugar@gmail.com',
};

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, username FROM users WHERE username = $1 OR LOWER(email) = LOWER($2)`,
      [ADMIN.username, ADMIN.email]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE users SET role = 'admin', is_super_admin = TRUE, is_active = TRUE WHERE id = $1`,
        [existing.rows[0].id]
      );
      console.log(
        `Updated existing account ${existing.rows[0].username} (id ${existing.rows[0].id}) ` +
        `-> admin + super admin, active. Password unchanged.`
      );
    } else {
      const tempPassword = genTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const inserted = await client.query(
        `INSERT INTO users (first_name, last_name, email, username, password_hash, role, is_active, is_super_admin, must_change_password)
         VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, TRUE, TRUE)
         RETURNING id`,
        [ADMIN.firstName, ADMIN.lastName, ADMIN.email, ADMIN.username, passwordHash]
      );
      console.log('');
      console.log('  Created Dr Setri Fugar as admin + SUPER ADMIN');
      console.log(`    user id  : ${inserted.rows[0].id}`);
      console.log(`    username : ${ADMIN.username}`);
      console.log(`    email    : ${ADMIN.email}`);
      console.log(`    password : ${tempPassword}   <-- hand over directly; forced change on first login`);
      console.log('');
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('addSetriFugarSuperAdmin migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
