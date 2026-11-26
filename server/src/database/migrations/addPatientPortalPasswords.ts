import pool from '../db';

/**
 * Returning patients may sign in with a password (2026-11-12). They set it
 * after a first sign-in by texted link; until then the random hash on their
 * user row can never be used. portal_password_set marks a password the
 * patient chose. Idempotent.
 */
export async function addPatientPortalPasswords() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS portal_password_set BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`);
  console.log('addPatientPortalPasswords completed.');
}

if (require.main === module) {
  addPatientPortalPasswords()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
