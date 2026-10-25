import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Passwords for accounts created by migrations and seed scripts.
 *
 * There is no shared default password any more (the old `demo123` was retired
 * 2026-10-25). An account created by a migration gets a random password that
 * nobody knows; an admin resets it to hand out a one-time Temp password.
 */

/** Hash of a random password nobody knows — the account can't be logged into until an admin resets it. */
export const unusablePasswordHash = (): Promise<string> =>
  bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

/**
 * Password for local dev seed scripts: SEED_USER_PASSWORD if set, otherwise a
 * random one that meets the password policy (the script prints it once).
 */
export const devSeedPassword = (): string =>
  process.env.SEED_USER_PASSWORD || `Dev-${crypto.randomBytes(6).toString('base64url')}9a!`;
