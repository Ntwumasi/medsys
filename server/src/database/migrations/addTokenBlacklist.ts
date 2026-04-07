/**
 * Migration: Add Token Blacklist Table
 *
 * Creates a table to track revoked/blacklisted JWT tokens.
 * Tokens are added on logout and checked on every authenticated request.
 */

import pool from '../db';

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create token blacklist table
    await client.query(`
      CREATE TABLE IF NOT EXISTS token_blacklist (
        id SERIAL PRIMARY KEY,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reason VARCHAR(50) DEFAULT 'logout'
      )
    `);

    // Create index for fast lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_hash
      ON token_blacklist(token_hash)
    `);

    // Create index for cleanup of expired tokens
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires
      ON token_blacklist(expires_at)
    `);

    // Create function to clean up expired blacklist entries (run periodically)
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_blacklist_tokens()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM token_blacklist WHERE expires_at < CURRENT_TIMESTAMP;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Add tokens_revoked_at column to users table for revoking all user tokens
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS tokens_revoked_at TIMESTAMP
    `);

    await client.query('COMMIT');
    console.log('Token blacklist migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Token blacklist migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration if executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
