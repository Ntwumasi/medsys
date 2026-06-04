import pool from '../db';

/**
 * Social / engagement layer (v1) — profile-centric.
 *
 * Adds four tables:
 *  - user_profiles : 1:1 with users; bio, "ask me about", languages, interests,
 *                    and a manually-set presence status. Kept separate from the
 *                    `users` auth table so security columns stay uncluttered.
 *  - user_follows  : the staff follow graph (follower -> following).
 *  - kudos         : peer recognition (sender -> recipient + message + tag).
 *  - activity_feed : generic activity stream. `activity_type` is intentionally a
 *                    free VARCHAR so v2 (badges, feature-discovery) can slot in
 *                    without a schema change.
 *
 * Guardrail: nothing here references clinical/patient-care metrics. Patients are
 * excluded at the query layer (controllers), not by schema.
 */
export async function addSocialLayer() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // --- user_profiles (1:1 with users) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        bio TEXT,
        ask_me_about TEXT,
        languages TEXT[] NOT NULL DEFAULT '{}',
        interests TEXT[] NOT NULL DEFAULT '{}',
        presence_status VARCHAR(20) NOT NULL DEFAULT 'online'
          CHECK (presence_status IN ('online', 'on_call', 'away')),
        presence_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // --- user_follows (the social graph) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT user_follows_unique UNIQUE (follower_id, following_id),
        CONSTRAINT user_follows_no_self CHECK (follower_id <> following_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id)');

    // --- kudos (peer recognition) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS kudos (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        tag VARCHAR(20)
          CHECK (tag IS NULL OR tag IN ('Teamwork', 'Lifesaver', 'Mentor', 'Kindness', 'Reliability')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT kudos_no_self CHECK (sender_id <> recipient_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_kudos_recipient ON kudos(recipient_id, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_kudos_sender ON kudos(sender_id, created_at DESC)');

    // --- activity_feed (generic stream; activity_type is open for v2) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_feed (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_type VARCHAR(40) NOT NULL,
        target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        entity_type VARCHAR(40),
        entity_id INTEGER,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_feed_actor ON activity_feed(actor_id, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at DESC)');

    await client.query('COMMIT');
    console.log('Social layer tables (user_profiles, user_follows, kudos, activity_feed) created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating social layer tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  addSocialLayer()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
