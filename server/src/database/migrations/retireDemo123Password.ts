/**
 * Migration: retire the shared `demo123` password.
 *
 * Early migrations and seed scripts created accounts with the password
 * `demo123`. On 2026-10-25, 91 accounts on prod still accepted it, two of them
 * admins; none had logged in since April. Each such account gets a random
 * password nobody knows, must change it on the next login, and has its open
 * sessions ended. Anyone who needs one of these accounts gets an admin reset,
 * which issues a one-time Temp password. Accounts are not deactivated.
 */

import pool from '../db';
import bcrypt from 'bcrypt';
import { unusablePasswordHash } from '../seedPasswords';

export const runMigration = async (): Promise<void> => {
  try {
    const users = await pool.query(`SELECT id, username, password_hash FROM users WHERE password_hash IS NOT NULL`);
    const retired: string[] = [];
    for (const u of users.rows) {
      if (!(await bcrypt.compare('demo123', u.password_hash))) continue;
      await pool.query(
        `UPDATE users
            SET password_hash = $2, must_change_password = true, tokens_revoked_at = NOW()
          WHERE id = $1`,
        [u.id, await unusablePasswordHash()]
      );
      retired.push(u.username);
    }
    console.log(`demo123 retired on ${retired.length} of ${users.rows.length} account(s)${retired.length ? `: ${retired.join(', ')}` : ''}`);
  } catch (e) {
    console.error('retireDemo123Password migration failed:', e);
    throw e;
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
