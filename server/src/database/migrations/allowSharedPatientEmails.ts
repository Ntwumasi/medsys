/**
 * Migration: let patients share an email address, keep staff emails unique
 *
 * The office manager reported being unable to register a second child under a
 * parent's email. `users.email` carried a blanket UNIQUE index
 * (users_email_key), so one address could only ever belong to one person —
 * which is wrong for families, where one parent's inbox legitimately covers
 * several patients.
 *
 * Dropping uniqueness outright would break staff password reset:
 * `forgot-password` looks a user up by email and takes the first row, so two
 * staff on one address would be ambiguous. Staff emails must stay unique.
 *
 * So the blanket index is replaced with a PARTIAL unique index covering only
 * non-patient accounts. Patients may share; staff may not.
 *
 * Verified before writing this: non-patient emails are already unique (0
 * collisions) and no patient shares an address with a staff account (0
 * overlaps), so the partial index builds cleanly against live data.
 *
 * NOTE: patients registered without an email still get a generated
 * `<patient_number>@noemail.medsys.local` placeholder, which stays unique by
 * construction. Portal email login continues to REFUSE an address held by more
 * than one patient (it can't tell which chart to open, and the date-of-birth
 * check wouldn't catch the mismatch) — those families sign in by phone.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Guard: refuse to run if a staff collision exists, rather than failing
    // halfway with a confusing index error.
    const collisions = await client.query(`
      SELECT LOWER(email) AS email, COUNT(*) AS n
        FROM users
       WHERE role <> 'patient' AND COALESCE(email, '') <> ''
       GROUP BY 1 HAVING COUNT(*) > 1
    `);
    if (collisions.rows.length > 0) {
      throw new Error(
        `Cannot apply: ${collisions.rows.length} non-patient email(s) are duplicated. ` +
        `Resolve these first: ${collisions.rows.map((r: any) => r.email).join(', ')}`
      );
    }

    await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key');
    // Older databases may carry it as a bare index rather than a constraint.
    await client.query('DROP INDEX IF EXISTS users_email_key');

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_staff
        ON users (LOWER(email))
        WHERE role <> 'patient' AND email IS NOT NULL
    `);

    await client.query('COMMIT');

    const shared = await pool.query(`
      SELECT COUNT(*) AS c FROM (
        SELECT LOWER(email) FROM users WHERE role = 'patient' AND COALESCE(email,'') <> ''
        GROUP BY 1 HAVING COUNT(*) > 1) t
    `);

    console.log('Shared patient emails enabled:');
    console.log('  users_email_key dropped; users_email_unique_staff (partial) created');
    console.log(`  patient addresses currently shared by >1 patient: ${shared.rows[0].c}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('allowSharedPatientEmails migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
