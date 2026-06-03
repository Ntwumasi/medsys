import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * Super-admin account for Robert Provencal (username `rprovencal`).
 *
 * He has no separate clinical login, so this is a single admin + super-admin
 * account (like `rkyei`) — super admins can view any dashboard via the role
 * switcher. The temp password is generated at runtime and printed; hand it to
 * Robert and he's forced to change it on first login.
 */
export async function addRobertProvencal(): Promise<string | null> {
  const client = await pool.connect();
  let tempPassword: string | null = null;

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM users WHERE username = 'rprovencal'`
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE users SET role = 'admin', is_super_admin = TRUE, is_active = TRUE WHERE username = 'rprovencal'`
      );
      console.log('Updated rprovencal: role=admin, is_super_admin=true (password unchanged)');
    } else {
      // Compliant temp password: upper + lower + digits + special.
      tempPassword = 'Temp' + Math.random().toString(36).slice(2, 7).toUpperCase() + '#' + Math.floor(Math.random() * 9 + 1);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await client.query(
        `INSERT INTO users (first_name, last_name, email, username, password_hash, role, is_active, is_super_admin, must_change_password)
         VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, TRUE, TRUE)`,
        ['Robert', 'Provencal', 'robert.provencal@medsys.com', 'rprovencal', passwordHash]
      );
      console.log(`Created rprovencal (Robert Provencal) as admin + super admin. Temp password: ${tempPassword}`);
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully');
    return tempPassword;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addRobertProvencal()
    .then((temp) => {
      if (temp) console.log(`\n>>> Hand this to Robert — rprovencal temp password: ${temp}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
