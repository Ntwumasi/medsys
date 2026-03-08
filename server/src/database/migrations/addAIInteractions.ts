import pool from '../db';

async function addAIInteractions() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating ai_interactions table...');

    // Create ai_interactions table for caching and audit
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_interactions (
        id SERIAL PRIMARY KEY,
        interaction_type VARCHAR(50) NOT NULL,
        request_hash VARCHAR(64),
        request_data JSONB,
        response_data JSONB,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for cache lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_hash
      ON ai_interactions(interaction_type, request_hash)
    `);

    // Create index for user lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_user
      ON ai_interactions(user_id)
    `);

    // Create index for cleanup (older than 7 days)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_created
      ON ai_interactions(created_at)
    `);

    await client.query('COMMIT');
    console.log('AI interactions migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in AI interactions migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
addAIInteractions()
  .then(() => {
    console.log('Migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
