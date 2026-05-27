import pool from '../db';

async function addVoIP(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. User presence — one row per user, UPSERT on heartbeat
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_presence (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status     VARCHAR(20) NOT NULL DEFAULT 'online'
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen)`);

    // 2. VoIP call records — state machine
    await client.query(`
      CREATE TABLE IF NOT EXISTS voip_calls (
        id            SERIAL PRIMARY KEY,
        caller_id     INTEGER NOT NULL REFERENCES users(id),
        callee_id     INTEGER NOT NULL REFERENCES users(id),
        status        VARCHAR(20) NOT NULL DEFAULT 'ringing',
        started_at    TIMESTAMPTZ,
        ended_at      TIMESTAMPTZ,
        duration_secs INTEGER,
        ended_by      INTEGER REFERENCES users(id),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT voip_calls_no_self CHECK (caller_id != callee_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_voip_calls_callee_ringing ON voip_calls(callee_id) WHERE status = 'ringing'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_voip_calls_participants ON voip_calls(caller_id, callee_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_voip_calls_active ON voip_calls(status) WHERE status IN ('ringing', 'active')`);

    // 3. Signaling data — ephemeral SDP + ICE candidates
    await client.query(`
      CREATE TABLE IF NOT EXISTS voip_signals (
        id         SERIAL PRIMARY KEY,
        call_id    INTEGER NOT NULL REFERENCES voip_calls(id) ON DELETE CASCADE,
        from_user  INTEGER NOT NULL REFERENCES users(id),
        type       VARCHAR(20) NOT NULL,
        payload    TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_voip_signals_call_id ON voip_signals(call_id, id)`);

    await client.query('COMMIT');
    console.log('  VoIP tables created successfully (user_presence, voip_calls, voip_signals)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  VoIP migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addVoIP()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default addVoIP;
