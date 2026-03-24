import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updateQuickBooksForDesktop() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add Web Connector specific columns to quickbooks_config
    await client.query(`
      ALTER TABLE quickbooks_config
      ADD COLUMN IF NOT EXISTS qbwc_username VARCHAR(100) DEFAULT 'medsys',
      ADD COLUMN IF NOT EXISTS qbwc_password_hash VARCHAR(255),
      ADD COLUMN IF NOT EXISTS company_file_path VARCHAR(500),
      ADD COLUMN IF NOT EXISTS owner_id UUID DEFAULT gen_random_uuid(),
      ADD COLUMN IF NOT EXISTS file_id UUID DEFAULT gen_random_uuid(),
      ADD COLUMN IF NOT EXISTS poll_interval_minutes INTEGER DEFAULT 5,
      ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS integration_type VARCHAR(20) DEFAULT 'desktop'
    `);
    console.log('Updated quickbooks_config table with QBWC columns');

    // Create sessions table for QBWC authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS quickbooks_sessions (
        id SERIAL PRIMARY KEY,
        ticket VARCHAR(100) UNIQUE NOT NULL,
        authenticated BOOLEAN DEFAULT false,
        company_file VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        last_request_at TIMESTAMP,
        request_count INTEGER DEFAULT 0
      )
    `);
    console.log('Created quickbooks_sessions table');

    // Create request queue table for QBXML requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS quickbooks_request_queue (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        medsys_id INTEGER NOT NULL,
        operation VARCHAR(20) NOT NULL,
        qbxml_request TEXT,
        priority INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        response_xml TEXT,
        qb_list_id VARCHAR(100),
        qb_txn_id VARCHAR(100),
        qb_edit_sequence VARCHAR(50),
        error_code VARCHAR(20),
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    console.log('Created quickbooks_request_queue table');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qb_queue_status
      ON quickbooks_request_queue(status, priority DESC, created_at ASC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qb_queue_entity
      ON quickbooks_request_queue(entity_type, medsys_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qb_sessions_ticket
      ON quickbooks_sessions(ticket)
    `);

    // Generate initial QBWC password and update config
    const defaultPassword = crypto.randomBytes(8).toString('hex');
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await client.query(`
      UPDATE quickbooks_config SET
        qbwc_password_hash = $1,
        integration_type = 'desktop',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [passwordHash]);

    console.log('Set initial QBWC password');
    console.log(`Initial QBWC password (save this): ${defaultPassword}`);

    await client.query('COMMIT');
    console.log('QuickBooks Desktop migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateQuickBooksForDesktop().catch(console.error);
