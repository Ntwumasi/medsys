import pool from '../db';

async function addMedicationAlerts() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating medication_alerts table...');

    // Create medication_alerts table for tracking drug interactions and other alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS medication_alerts (
        id SERIAL PRIMARY KEY,
        pharmacy_order_id INTEGER REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        alert_type VARCHAR(50) NOT NULL DEFAULT 'drug_interaction',
        severity VARCHAR(20) NOT NULL DEFAULT 'moderate',
        details JSONB,
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_by INTEGER REFERENCES users(id),
        acknowledged_at TIMESTAMP,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT medication_alerts_type_check CHECK (alert_type IN ('drug_interaction', 'allergy', 'dosage', 'duplicate', 'contraindication')),
        CONSTRAINT medication_alerts_severity_check CHECK (severity IN ('mild', 'moderate', 'severe', 'contraindicated'))
      )
    `);

    // Create indexes for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_medication_alerts_patient ON medication_alerts(patient_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_medication_alerts_order ON medication_alerts(pharmacy_order_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_medication_alerts_unacknowledged ON medication_alerts(acknowledged) WHERE acknowledged = false
    `);

    // Add prepared_by column to pharmacy_orders if it doesn't exist
    console.log('Adding prepared_by column to pharmacy_orders...');
    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD COLUMN IF NOT EXISTS prepared_by INTEGER REFERENCES users(id)
    `);

    // Update pharmacy_orders status constraint to include 'ready'
    console.log('Updating pharmacy_orders status constraint...');

    // First drop the existing constraint if it exists
    await client.query(`
      ALTER TABLE pharmacy_orders
      DROP CONSTRAINT IF EXISTS pharmacy_orders_status_check
    `);

    // Add the new constraint with 'ready' status
    await client.query(`
      ALTER TABLE pharmacy_orders
      ADD CONSTRAINT pharmacy_orders_status_check
      CHECK (status IN ('ordered', 'in_progress', 'ready', 'dispensed', 'cancelled'))
    `);

    await client.query('COMMIT');
    console.log('Medication alerts migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in medication alerts migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
addMedicationAlerts()
  .then(() => {
    console.log('Migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
