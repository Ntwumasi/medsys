import pool from '../db';

export async function addUserNotifications() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create user_notifications table for user-specific notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread ON user_notifications(user_id, is_read) WHERE is_read = false');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC)');

    await client.query('COMMIT');
    console.log('User notifications table created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating user notifications table:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  addUserNotifications()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
