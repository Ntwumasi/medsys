import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function addQuickBooksTables() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. QuickBooks Configuration Table - stores OAuth tokens and connection settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS quickbooks_config (
        id SERIAL PRIMARY KEY,
        realm_id VARCHAR(50) UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        company_name VARCHAR(200),
        is_connected BOOLEAN DEFAULT false,
        last_sync_at TIMESTAMP,
        sync_enabled BOOLEAN DEFAULT true,
        auto_sync_invoices BOOLEAN DEFAULT false,
        auto_sync_payments BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created quickbooks_config table');

    // 2. QuickBooks Sync Mapping Table - maps MedSys entities to QB entities
    await client.query(`
      CREATE TABLE IF NOT EXISTS quickbooks_sync_map (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        medsys_id INTEGER NOT NULL,
        quickbooks_id VARCHAR(50) NOT NULL,
        quickbooks_sync_token VARCHAR(50),
        last_synced_at TIMESTAMP,
        sync_status VARCHAR(20) DEFAULT 'synced',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_type, medsys_id)
      )
    `);
    console.log('Created quickbooks_sync_map table');

    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qb_sync_map_entity
      ON quickbooks_sync_map(entity_type, medsys_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qb_sync_map_status
      ON quickbooks_sync_map(sync_status)
    `);

    // 3. QuickBooks Sync Log Table - audit log for sync operations
    await client.query(`
      CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
        id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50),
        entity_type VARCHAR(50),
        direction VARCHAR(10),
        records_processed INTEGER DEFAULT 0,
        records_succeeded INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        status VARCHAR(20),
        error_details JSONB,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created quickbooks_sync_log table');

    // Create index for log queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qb_sync_log_date
      ON quickbooks_sync_log(created_at DESC)
    `);

    // Insert default config row (no connection yet)
    await client.query(`
      INSERT INTO quickbooks_config (id, is_connected, sync_enabled)
      VALUES (1, false, true)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('Inserted default quickbooks_config row');

    await client.query('COMMIT');
    console.log('QuickBooks tables migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addQuickBooksTables().catch(console.error);
