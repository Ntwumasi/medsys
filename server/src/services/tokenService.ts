/**
 * Token Service
 *
 * Handles JWT token blacklisting for secure logout and token revocation.
 * Uses SHA-256 hash of tokens for storage to avoid storing actual tokens.
 */

import crypto from 'crypto';
import pool from '../database/db';

// Hash token using SHA-256 (we don't store actual tokens for security)
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Add a token to the blacklist (revoke it)
 */
export const revokeToken = async (
  token: string,
  userId: number | null,
  expiresAt: Date,
  reason: 'logout' | 'password_change' | 'security' | 'admin_revoke' = 'logout'
): Promise<void> => {
  const tokenHash = hashToken(token);

  try {
    await pool.query(
      `INSERT INTO token_blacklist (token_hash, user_id, expires_at, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO NOTHING`,
      [tokenHash, userId, expiresAt, reason]
    );
  } catch (error) {
    console.error('Failed to revoke token:', error);
    throw error;
  }
};

/**
 * Check if a token is blacklisted (revoked)
 */
export const isTokenRevoked = async (token: string): Promise<boolean> => {
  const tokenHash = hashToken(token);

  try {
    const result = await pool.query(
      `SELECT 1 FROM token_blacklist WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );
    return result.rows.length > 0;
  } catch (error) {
    // Fail-OPEN: a transient DB hiccup (Neon cold start, connection pool
    // exhaustion) should not boot every logged-in user. The practical risk
    // of a specifically-blacklisted token slipping through for the 1-2
    // seconds the DB is unreachable is negligible. The fail-closed policy
    // was causing real users (Wendy) to get kicked out repeatedly.
    console.error('Failed to check token blacklist (allowing request):', error);
    return false;
  }
};

/**
 * Revoke all tokens for a user (e.g., after password change)
 * This is done by adding a marker, but since we can't enumerate all
 * issued tokens, we'll need to check user's password_changed_at timestamp
 * against token issue time in the middleware.
 */
export const revokeAllUserTokens = async (
  userId: number,
  reason: 'password_change' | 'security' | 'admin_revoke' = 'security'
): Promise<void> => {
  // We can't revoke all tokens directly since we don't store them,
  // but we can update a timestamp that the middleware checks
  try {
    await pool.query(
      `UPDATE users SET tokens_revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [userId]
    );
    console.log(`All tokens revoked for user ${userId} - reason: ${reason}`);
  } catch (error) {
    console.error('Failed to revoke all user tokens:', error);
    throw error;
  }
};

/**
 * Clean up expired blacklist entries
 * Should be run periodically (e.g., via cron or on startup)
 */
export const cleanupExpiredTokens = async (): Promise<number> => {
  try {
    const result = await pool.query(
      `DELETE FROM token_blacklist WHERE expires_at < CURRENT_TIMESTAMP RETURNING id`
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      console.log(`Cleaned up ${count} expired blacklist entries`);
    }
    return count;
  } catch (error) {
    console.error('Failed to cleanup expired tokens:', error);
    return 0;
  }
};

export default {
  revokeToken,
  isTokenRevoked,
  revokeAllUserTokens,
  cleanupExpiredTokens,
};
