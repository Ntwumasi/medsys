import pool from '../db';
import bcrypt from 'bcrypt';

/**
 * Super-admin access for Kojo Essel — mirrors Sedo Tamakloe's two-account setup:
 *   - his normal doctor login (`kessel`) stays a plain doctor (NOT super admin)
 *   - a SEPARATE admin account (`kesseladmin`) carries role='admin' + super admin
 *
 * The temp password is generated at runtime and printed — hand it to Kojo; he's
 * forced to change it on first login.
 */
export async function addKojoEssel(): Promise<string | null> {
  const client = await pool.connect();
  let tempPassword: string | null = null;

  try {
    await client.query('BEGIN');

    // 1. Keep his doctor account exactly as it was — ensure it is NOT super admin.
    await client.query(
      `UPDATE users SET is_super_admin = FALSE WHERE username = 'kessel'`
    );
    console.log("Ensured doctor account 'kessel' is a plain doctor (is_super_admin=false)");

    // 2. Separate admin + super-admin account, like stamakloeadmin.
    const existing = await client.query(
      `SELECT id FROM users WHERE username = 'kesseladmin'`
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE users SET role = 'admin', is_super_admin = TRUE, is_active = TRUE WHERE username = 'kesseladmin'`
      );
      console.log('Updated kesseladmin: role=admin, is_super_admin=true (password unchanged)');
    } else {
      // Compliant temp password: upper + lower + digits + special.
      tempPassword = 'Temp' + Math.random().toString(36).slice(2, 7).toUpperCase() + '#' + Math.floor(Math.random() * 9 + 1);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await client.query(
        `INSERT INTO users (first_name, last_name, email, username, password_hash, role, is_active, is_super_admin, must_change_password)
         VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, TRUE, TRUE)`,
        ['Kojo', 'Essel', 'kojo.essel+admin@medsys.com', 'kesseladmin', passwordHash]
      );
      console.log(`Created kesseladmin (Kojo Essel) as admin + super admin. Temp password: ${tempPassword}`);
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
  addKojoEssel()
    .then((temp) => {
      if (temp) console.log(`\n>>> Hand this to Kojo — kesseladmin temp password: ${temp}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
