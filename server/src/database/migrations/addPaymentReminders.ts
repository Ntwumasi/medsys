import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addPaymentReminders() {
  const client = await pool.connect();

  try {
    console.log('Starting payment reminders migration...');

    // Create payment_reminders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_reminders (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),

        -- Reminder details
        reminder_type VARCHAR(20) NOT NULL,
        reminder_number INTEGER DEFAULT 1,

        -- Contact info used
        contact_method VARCHAR(100),

        -- Content
        message TEXT,

        -- Status tracking
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
        scheduled_for TIMESTAMP,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        failed_reason TEXT,

        -- Metadata
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created payment_reminders table');

    // Create reminder_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminder_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created reminder_settings table');

    // Add reminder tracking columns to invoices
    await client.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS next_reminder_date DATE
    `);
    console.log('Added reminder columns to invoices table');

    // Seed default reminder settings
    const defaultSettings = [
      { key: 'first_reminder_days', value: '7', description: 'Days after invoice date to send first reminder' },
      { key: 'second_reminder_days', value: '14', description: 'Days after first reminder to send second reminder' },
      { key: 'third_reminder_days', value: '30', description: 'Days after second reminder to send third reminder' },
      { key: 'sms_enabled', value: 'false', description: 'Enable SMS reminders (requires API integration)' },
      { key: 'email_enabled', value: 'false', description: 'Enable email reminders (requires API integration)' },
      { key: 'auto_send_enabled', value: 'false', description: 'Automatically send reminders on schedule' },
      {
        key: 'reminder_template_sms',
        value: 'Dear {patient_name}, this is a reminder from MedSys Clinic. You have an outstanding balance of GHS {amount} on invoice #{invoice_number}. Please visit the clinic or contact us to arrange payment. Thank you.',
        description: 'SMS reminder message template'
      },
      {
        key: 'reminder_template_email_subject',
        value: 'Payment Reminder - Invoice #{invoice_number}',
        description: 'Email subject template'
      },
      {
        key: 'reminder_template_email_body',
        value: `Dear {patient_name},

This is a friendly reminder that you have an outstanding balance with MedSys Clinic.

Invoice Number: #{invoice_number}
Invoice Date: {invoice_date}
Amount Due: GHS {amount}

Please visit the clinic or contact us to arrange payment at your earliest convenience.

If you have already made this payment, please disregard this message.

Thank you for your attention to this matter.

Best regards,
MedSys Clinic`,
        description: 'Email body template'
      }
    ];

    for (const setting of defaultSettings) {
      await client.query(`
        INSERT INTO reminder_settings (setting_key, setting_value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (setting_key) DO NOTHING
      `, [setting.key, setting.value, setting.description]);
    }
    console.log('Seeded default reminder settings');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice ON payment_reminders(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_payment_reminders_patient ON payment_reminders(patient_id);
      CREATE INDEX IF NOT EXISTS idx_payment_reminders_status ON payment_reminders(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_next_reminder ON invoices(next_reminder_date);
    `);
    console.log('Created indexes');

    console.log('Payment reminders migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addPaymentReminders().catch(console.error);
