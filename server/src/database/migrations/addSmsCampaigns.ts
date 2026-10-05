import pool from '../db';

/**
 * Marketing bulk SMS campaigns.
 *
 *   - sms_campaigns            : one row per campaign. Created by marketing,
 *                                approved by an admin, then sent in batches.
 *   - sms_campaign_recipients  : the audience snapshot taken when the campaign
 *                                is created (so the approver approves an exact
 *                                list), with per-recipient send/delivery status.
 *                                Opt-outs are re-checked at send time.
 */
export async function addSmsCampaigns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        filters JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'pending_approval'
          CHECK (status IN ('pending_approval', 'approved', 'rejected', 'sending', 'sent', 'cancelled')),
        sandbox BOOLEAN NOT NULL DEFAULT true,
        recipient_count INTEGER NOT NULL DEFAULT 0,
        credits_per_message INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        sent_by INTEGER REFERENCES users(id),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),
        phone VARCHAR(20) NOT NULL,
        first_name VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'submitted', 'delivered', 'failed', 'skipped')),
        provider_message_id VARCHAR(100),
        delivery_status VARCHAR(30),
        error TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (campaign_id, phone)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status
        ON sms_campaign_recipients(campaign_id, status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_provider_id
        ON sms_campaign_recipients(provider_message_id)
        WHERE provider_message_id IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('addSmsCampaigns migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addSmsCampaigns migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addSmsCampaigns()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
