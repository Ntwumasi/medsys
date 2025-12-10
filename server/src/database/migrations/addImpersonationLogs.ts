import pool from '../db';

export async function addImpersonationLogs() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create impersonation_logs table for audit trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS impersonation_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) NOT NULL,
        impersonated_user_id INTEGER REFERENCES users(id) NOT NULL,
        impersonated_role VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        ip_address VARCHAR(50)
      )
    `);

    console.log('Created impersonation_logs table');

    await client.query('COMMIT');
    console.log('Impersonation logs migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  addImpersonationLogs()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
