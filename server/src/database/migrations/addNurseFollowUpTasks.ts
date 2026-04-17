import pool from '../db';

async function addNurseFollowUpTasks() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating nurse_follow_up_tasks table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS nurse_follow_up_tasks (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('follow_up', 'review')),
        scheduled_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'cancelled')),
        notes TEXT,
        call_status VARCHAR(20),
        called_by INTEGER REFERENCES users(id),
        completed_at TIMESTAMP,
        review_requested_by INTEGER REFERENCES users(id),
        review_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_nft_status_date ON nurse_follow_up_tasks(status, scheduled_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_nft_encounter ON nurse_follow_up_tasks(encounter_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_nft_type ON nurse_follow_up_tasks(type)');

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addNurseFollowUpTasks()
  .then(() => { console.log('Done'); process.exit(0); })
  .catch((error) => { console.error('Failed:', error); process.exit(1); });
