import pool from '../db';

async function addAuditLogsAndWaitTime() {
  console.log('Adding audit_logs table and wait time tracking...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create audit_logs table for tracking all clinical actions
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER,
        old_values JSONB,
        new_values JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created audit_logs table');

    // Create index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    `);
    console.log('✅ Created audit_logs indexes');

    // Add wait time tracking columns to encounters if not exists
    await client.query(`
      ALTER TABLE encounters ADD COLUMN IF NOT EXISTS nurse_called_at TIMESTAMP;
      ALTER TABLE encounters ADD COLUMN IF NOT EXISTS doctor_called_at TIMESTAMP;
      ALTER TABLE encounters ADD COLUMN IF NOT EXISTS lab_ordered_at TIMESTAMP;
      ALTER TABLE encounters ADD COLUMN IF NOT EXISTS imaging_ordered_at TIMESTAMP;
      ALTER TABLE encounters ADD COLUMN IF NOT EXISTS pharmacy_ordered_at TIMESTAMP;
    `);
    console.log('✅ Added wait time tracking columns to encounters');

    // Create notifications table for real-time alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created notifications table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
    `);

    // Create drug_interactions table for medication checking
    await client.query(`
      CREATE TABLE IF NOT EXISTS drug_interactions (
        id SERIAL PRIMARY KEY,
        drug1_name VARCHAR(255) NOT NULL,
        drug2_name VARCHAR(255) NOT NULL,
        severity VARCHAR(20) NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe', 'contraindicated')),
        description TEXT,
        recommendation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created drug_interactions table');

    // Create lab_reference_ranges table for abnormal value detection
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_reference_ranges (
        id SERIAL PRIMARY KEY,
        test_name VARCHAR(255) NOT NULL,
        test_code VARCHAR(50),
        unit VARCHAR(50),
        min_normal DECIMAL(10,4),
        max_normal DECIMAL(10,4),
        critical_low DECIMAL(10,4),
        critical_high DECIMAL(10,4),
        gender VARCHAR(10),
        age_min INTEGER,
        age_max INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created lab_reference_ranges table');

    // Seed some common drug interactions
    await client.query(`
      INSERT INTO drug_interactions (drug1_name, drug2_name, severity, description, recommendation)
      VALUES
        ('Warfarin', 'Aspirin', 'severe', 'Increased risk of bleeding', 'Avoid combination or monitor closely'),
        ('Warfarin', 'Ibuprofen', 'severe', 'Increased risk of bleeding', 'Avoid NSAIDs with warfarin'),
        ('Metformin', 'Alcohol', 'moderate', 'Increased risk of lactic acidosis', 'Limit alcohol intake'),
        ('Lisinopril', 'Potassium', 'moderate', 'Risk of hyperkalemia', 'Monitor potassium levels'),
        ('Simvastatin', 'Grapefruit', 'moderate', 'Increased statin levels', 'Avoid grapefruit consumption'),
        ('Ciprofloxacin', 'Antacids', 'moderate', 'Reduced antibiotic absorption', 'Take 2 hours apart'),
        ('Methotrexate', 'NSAIDs', 'severe', 'Increased methotrexate toxicity', 'Avoid combination'),
        ('SSRIs', 'MAOIs', 'contraindicated', 'Serotonin syndrome risk', 'Do not combine - life threatening'),
        ('Digoxin', 'Amiodarone', 'severe', 'Increased digoxin levels', 'Reduce digoxin dose by 50%'),
        ('ACE Inhibitors', 'ARBs', 'moderate', 'Hyperkalemia and renal impairment', 'Generally avoid dual blockade')
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Seeded common drug interactions');

    // Seed common lab reference ranges
    await client.query(`
      INSERT INTO lab_reference_ranges (test_name, test_code, unit, min_normal, max_normal, critical_low, critical_high)
      VALUES
        ('White Blood Cell Count', 'WBC', 'x10^9/L', 4.5, 11.0, 2.0, 30.0),
        ('Red Blood Cell Count', 'RBC', 'x10^12/L', 4.5, 5.5, 3.0, 7.0),
        ('Hemoglobin', 'HGB', 'g/dL', 12.0, 17.5, 7.0, 20.0),
        ('Hematocrit', 'HCT', '%', 36.0, 50.0, 20.0, 60.0),
        ('Platelet Count', 'PLT', 'x10^9/L', 150.0, 400.0, 50.0, 1000.0),
        ('Glucose', 'GLU', 'mg/dL', 70.0, 100.0, 40.0, 500.0),
        ('Creatinine', 'CREAT', 'mg/dL', 0.7, 1.3, 0.4, 10.0),
        ('Blood Urea Nitrogen', 'BUN', 'mg/dL', 7.0, 20.0, 2.0, 100.0),
        ('Sodium', 'NA', 'mEq/L', 136.0, 145.0, 120.0, 160.0),
        ('Potassium', 'K', 'mEq/L', 3.5, 5.0, 2.5, 6.5),
        ('Chloride', 'CL', 'mEq/L', 98.0, 106.0, 80.0, 120.0),
        ('Carbon Dioxide', 'CO2', 'mEq/L', 23.0, 29.0, 10.0, 40.0),
        ('Calcium', 'CA', 'mg/dL', 8.5, 10.5, 6.0, 14.0),
        ('Total Protein', 'TP', 'g/dL', 6.0, 8.3, 4.0, 10.0),
        ('Albumin', 'ALB', 'g/dL', 3.5, 5.0, 2.0, 6.0),
        ('Bilirubin Total', 'TBIL', 'mg/dL', 0.1, 1.2, 0.0, 15.0),
        ('ALT', 'ALT', 'U/L', 7.0, 56.0, 0.0, 1000.0),
        ('AST', 'AST', 'U/L', 10.0, 40.0, 0.0, 1000.0),
        ('Alkaline Phosphatase', 'ALP', 'U/L', 44.0, 147.0, 0.0, 500.0)
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Seeded lab reference ranges');

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in migration:', error);
    throw error;
  } finally {
    client.release();
  }

  process.exit(0);
}

addAuditLogsAndWaitTime().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
