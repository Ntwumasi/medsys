import pool from '../db';

/**
 * Imported marketing contacts — people who are not patients (health-fair
 * sign-ups, corporate staff lists…), uploaded by marketing from a spreadsheet.
 *
 *   - marketing_contact_imports : one row per uploaded file, with who uploaded
 *                                 it and their confirmation that everyone in it
 *                                 agreed to receive marketing messages.
 *   - marketing_contacts        : one row per person, de-duplicated on phone
 *                                 (233XXXXXXXXX) or, without a phone, on email.
 *                                 Never patients: no chart, no patient number.
 *   - sms_campaign_recipients.contact_id : a campaign recipient is either a
 *                                 patient or an imported contact.
 */
export async function addMarketingContacts() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS marketing_contact_imports (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255),
        source VARCHAR(100),
        rows_in_file INTEGER NOT NULL DEFAULT 0,
        added INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        consent_confirmed BOOLEAN NOT NULL DEFAULT false,
        imported_by INTEGER REFERENCES users(id),
        removed_at TIMESTAMP,
        removed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS marketing_contacts (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(255),
        source VARCHAR(100),
        import_id INTEGER REFERENCES marketing_contact_imports(id) ON DELETE SET NULL,
        consent_confirmed_by INTEGER REFERENCES users(id),
        consent_confirmed_at TIMESTAMP,
        opted_out BOOLEAN NOT NULL DEFAULT false,
        opted_out_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK (phone IS NOT NULL OR email IS NOT NULL)
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_contacts_phone
        ON marketing_contacts(phone) WHERE phone IS NOT NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_contacts_email_only
        ON marketing_contacts(LOWER(email)) WHERE phone IS NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketing_contacts_import ON marketing_contacts(import_id)
    `);

    await client.query(`
      ALTER TABLE sms_campaign_recipients
        ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES marketing_contacts(id) ON DELETE SET NULL
    `);

    await client.query('COMMIT');
    console.log('addMarketingContacts migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addMarketingContacts migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addMarketingContacts()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
