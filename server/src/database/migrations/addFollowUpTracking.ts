import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addFollowUpTracking() {
  const client = await pool.connect();

  try {
    console.log('Starting follow-up tracking migration...');

    // Add follow-up columns to encounters table
    await client.query(`
      ALTER TABLE encounters
      ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS follow_up_timeframe VARCHAR(50),
      ADD COLUMN IF NOT EXISTS follow_up_reason TEXT,
      ADD COLUMN IF NOT EXISTS follow_up_scheduled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS follow_up_appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS follow_up_reminder_sent BOOLEAN DEFAULT false
    `);
    console.log('Added follow-up columns to encounters table');

    // Create follow_up_reminders table for tracking sent reminders
    await client.query(`
      CREATE TABLE IF NOT EXISTS follow_up_reminders (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),

        -- Reminder details
        reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('email', 'sms')),
        days_before INTEGER NOT NULL,

        -- Contact info used
        contact_info VARCHAR(255),

        -- Content
        message TEXT,

        -- Status tracking
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
        scheduled_for TIMESTAMP,
        sent_at TIMESTAMP,
        failed_reason TEXT,

        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created follow_up_reminders table');

    // Create indexes for efficient queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_encounters_follow_up_required ON encounters(follow_up_required) WHERE follow_up_required = true;
      CREATE INDEX IF NOT EXISTS idx_encounters_follow_up_scheduled ON encounters(follow_up_scheduled) WHERE follow_up_required = true AND follow_up_scheduled = false;
      CREATE INDEX IF NOT EXISTS idx_encounters_follow_up_appointment ON encounters(follow_up_appointment_id);
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_encounter ON follow_up_reminders(encounter_id);
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_appointment ON follow_up_reminders(appointment_id);
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_status ON follow_up_reminders(status);
    `);
    console.log('Created indexes');

    // Add follow-up reminder settings to reminder_settings table (if it exists)
    const settingsExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'reminder_settings'
      )
    `);

    if (settingsExist.rows[0].exists) {
      const defaultSettings = [
        { key: 'follow_up_reminder_days_before', value: '3', description: 'Days before follow-up appointment to send reminder' },
        { key: 'follow_up_email_enabled', value: 'true', description: 'Enable email reminders for follow-up appointments' },
        {
          key: 'follow_up_reminder_email_subject',
          value: 'Reminder: Upcoming Follow-Up Appointment',
          description: 'Email subject for follow-up reminders'
        },
        {
          key: 'follow_up_reminder_email_body',
          value: `Dear {patient_name},

This is a friendly reminder that you have a follow-up appointment scheduled at MedSys Clinic.

Appointment Date: {appointment_date}
Appointment Time: {appointment_time}
Reason: {follow_up_reason}

Please arrive 10 minutes early to complete any necessary paperwork.

If you need to reschedule, please contact us as soon as possible.

Thank you,
MedSys Clinic`,
          description: 'Email body template for follow-up reminders'
        }
      ];

      for (const setting of defaultSettings) {
        await client.query(`
          INSERT INTO reminder_settings (setting_key, setting_value, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (setting_key) DO NOTHING
        `, [setting.key, setting.value, setting.description]);
      }
      console.log('Added follow-up reminder settings');
    }

    console.log('Follow-up tracking migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addFollowUpTracking().catch(console.error);
