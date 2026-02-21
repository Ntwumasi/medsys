import pool from '../db';

async function addPhase3LabFeatures() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Patient Documents table - for storing lab results and other uploads
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_documents (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        encounter_id INTEGER REFERENCES encounters(id),
        lab_order_id INTEGER REFERENCES lab_orders(id),
        document_type VARCHAR(50) NOT NULL DEFAULT 'lab_result',
        document_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER,
        description TEXT,
        uploaded_by INTEGER REFERENCES users(id),
        is_confidential BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created patient_documents table');

    // 2. QC Results table - for quality control logging
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_qc_results (
        id SERIAL PRIMARY KEY,
        test_code VARCHAR(50) NOT NULL,
        test_name VARCHAR(255),
        control_level VARCHAR(50) NOT NULL,
        lot_number VARCHAR(100),
        measured_value DECIMAL(10, 4) NOT NULL,
        target_value DECIMAL(10, 4) NOT NULL,
        standard_deviation DECIMAL(10, 4) NOT NULL,
        unit VARCHAR(50),
        performed_by INTEGER REFERENCES users(id),
        performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_within_limits BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created lab_qc_results table');

    // 3. Add indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_patient ON patient_documents(patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_encounter ON patient_documents(encounter_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_lab_order ON patient_documents(lab_order_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_type ON patient_documents(document_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_qc_results_test_code ON lab_qc_results(test_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_qc_results_date ON lab_qc_results(performed_at)`);
    console.log('Created indexes');

    // 4. Add result_document_id column to lab_orders if not exists
    await client.query(`
      ALTER TABLE lab_orders
      ADD COLUMN IF NOT EXISTS result_document_id INTEGER REFERENCES patient_documents(id)
    `);
    console.log('Added result_document_id to lab_orders');

    await client.query('COMMIT');
    console.log('Phase 3 lab features migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addPhase3LabFeatures()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default addPhase3LabFeatures;
