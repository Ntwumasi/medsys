import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * Add super-admin (admin + is_super_admin) accounts requested by Sedo:
 *   - Maxwell Larweh   -> username 'mlarweh'
 *   - Martina Tamakloe -> username 'mtamakloe1'  (plain 'mtamakloe' is already
 *                         taken by an unrelated PATIENT record, so we suffix it)
 *   - Kojo Essel       -> already has 'kesseladmin' (verified, not recreated)
 *
 * These are PURE admin accounts (no separate clinical login), mirroring the
 * rprovencal pattern: role='admin', is_super_admin=TRUE, must_change_password.
 * Temp passwords are generated at runtime and printed — hand them to each user;
 * they're forced to change on first login. Idempotent: existing accounts are
 * updated (role/super/active) without touching their password.
 */

function genTempPassword(): string {
  // Compliant: upper + lower + digits + special.
  return 'Temp' + Math.random().toString(36).slice(2, 7).toUpperCase() + '#' + Math.floor(Math.random() * 9 + 1);
}

type NewAdmin = { firstName: string; lastName: string; username: string; email: string };

const ADMINS: NewAdmin[] = [
  { firstName: 'Maxwell', lastName: 'Larweh', username: 'mlarweh', email: 'maxwell.larweh@medsys.com' },
  { firstName: 'Martina', lastName: 'Tamakloe', username: 'mtamakloe1', email: 'martina.tamakloe@medsys.com' },
];

export async function addAdminSuperusers(): Promise<Record<string, string>> {
  const client = await pool.connect();
  const issued: Record<string, string> = {};

  try {
    await client.query('BEGIN');

    for (const a of ADMINS) {
      const existing = await client.query(`SELECT id FROM users WHERE username = $1`, [a.username]);
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE users SET role = 'admin', is_super_admin = TRUE, is_active = TRUE WHERE username = $1`,
          [a.username]
        );
        console.log(`Updated ${a.username} (${a.firstName} ${a.lastName}): role=admin, is_super_admin=true (password unchanged)`);
      } else {
        const tempPassword = genTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        await client.query(
          `INSERT INTO users (first_name, last_name, email, username, password_hash, role, is_active, is_super_admin, must_change_password)
           VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, TRUE, TRUE)`,
          [a.firstName, a.lastName, a.email, a.username, passwordHash]
        );
        issued[a.username] = tempPassword;
        console.log(`Created ${a.username} (${a.firstName} ${a.lastName}) as admin + super admin. Temp password: ${tempPassword}`);
      }
    }

    // Verify Kojo's existing super-admin account — do NOT recreate.
    const kojo = await client.query(
      `SELECT username, role, is_super_admin, is_active FROM users WHERE username = 'kesseladmin'`
    );
    if (kojo.rows.length > 0) {
      const k = kojo.rows[0];
      console.log(`Verified kesseladmin (Kojo Essel): role=${k.role}, is_super_admin=${k.is_super_admin}, is_active=${k.is_active}`);
    } else {
      console.log('WARNING: kesseladmin not found — run addKojoEssel to create it.');
    }

    await client.query('COMMIT');
    console.log('addAdminSuperusers completed.');
    return issued;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addAdminSuperusers migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addAdminSuperusers()
    .then((issued) => {
      const lines = Object.entries(issued);
      if (lines.length > 0) {
        console.log('\n>>> Hand these temp passwords to the users (they change on first login):');
        lines.forEach(([u, p]) => console.log(`    ${u} : ${p}`));
        console.log('');
      }
      process.exit(0);
    })
    .catch(() => process.exit(1));
}
