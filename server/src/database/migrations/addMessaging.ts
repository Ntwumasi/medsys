import pool from '../db';

/**
 * Migration to add in-app messaging functionality
 */
export async function addMessaging() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'messages'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Creating messages table...');

      // Create messages table
      await client.query(`
        CREATE TABLE messages (
          id SERIAL PRIMARY KEY,
          sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject VARCHAR(255),
          body TEXT NOT NULL,
          read_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT messages_sender_recipient_check CHECK (sender_id != recipient_id)
        )
      `);

      // Create indexes for common queries
      await client.query(`CREATE INDEX idx_messages_recipient_id ON messages(recipient_id)`);
      await client.query(`CREATE INDEX idx_messages_sender_id ON messages(sender_id)`);
      await client.query(`CREATE INDEX idx_messages_created_at ON messages(created_at DESC)`);
      await client.query(`CREATE INDEX idx_messages_unread ON messages(recipient_id) WHERE read_at IS NULL`);

      console.log('Messages table created successfully');
    } else {
      console.log('Messages table already exists');
    }

    await client.query('COMMIT');
    console.log('Messaging migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Messaging migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Allow running directly
if (require.main === module) {
  addMessaging()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
