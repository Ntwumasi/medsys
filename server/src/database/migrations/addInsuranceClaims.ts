import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting insurance claims migration...');

    // 1. Create patient_insurance_details table
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_insurance_details (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        insurance_provider_id INTEGER REFERENCES insurance_providers(id),
        member_id VARCHAR(100),
        plan_option VARCHAR(100),
        annual_limit DECIMAL(12,2),
        used_to_date DECIMAL(12,2) DEFAULT 0,
        effective_date DATE,
        expiry_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(patient_id, insurance_provider_id)
      )
    `);
    console.log('Created patient_insurance_details table');

    // 2. Drop existing insurance_claims if it exists and recreate with full schema
    // First check if the table exists and has all required columns
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'insurance_claims'
      )
    `);

    if (tableExists.rows[0].exists) {
      // Check if table has the new columns
      const hasNewColumns = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'insurance_claims' AND column_name = 'claim_number'
        )
      `);

      if (!hasNewColumns.rows[0].exists) {
        // Drop and recreate with new schema
        await client.query(`DROP TABLE IF EXISTS insurance_claims CASCADE`);
        console.log('Dropped old insurance_claims table');
      }
    }

    // Create insurance_claims table with full schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS insurance_claims (
        id SERIAL PRIMARY KEY,
        claim_number VARCHAR(50) UNIQUE NOT NULL,
        invoice_id INTEGER REFERENCES invoices(id),
        patient_id INTEGER REFERENCES patients(id),
        encounter_id INTEGER REFERENCES encounters(id),
        insurance_provider_id INTEGER REFERENCES insurance_providers(id),

        -- Patient & Insurance info
        member_id VARCHAR(100),
        plan_option VARCHAR(100),

        -- Diagnosis codes
        primary_diagnosis_code VARCHAR(20),
        primary_diagnosis_desc TEXT,
        secondary_diagnosis_codes JSONB DEFAULT '[]',

        -- Claim amounts
        total_charged DECIMAL(12,2) DEFAULT 0,
        amount_approved DECIMAL(12,2),
        amount_paid DECIMAL(12,2),
        patient_responsibility DECIMAL(12,2),

        -- Coverage tracking (snapshot at claim creation)
        annual_limit DECIMAL(12,2),
        used_to_date DECIMAL(12,2),
        remaining_coverage DECIMAL(12,2),

        -- Workflow status
        status VARCHAR(30) DEFAULT 'draft'
          CHECK (status IN ('draft', 'pending_validation', 'pending_doctor_review',
                           'doctor_rejected', 'approved_by_doctor', 'submitted',
                           'processing', 'approved', 'partial', 'denied', 'paid')),

        -- Doctor vetting
        reviewed_by_doctor INTEGER REFERENCES users(id),
        doctor_reviewed_at TIMESTAMP,
        doctor_notes TEXT,
        doctor_override_reason TEXT,

        -- Diagnosis validation
        diagnosis_validated BOOLEAN DEFAULT false,
        validation_issues JSONB DEFAULT '[]',
        validation_override_by INTEGER REFERENCES users(id),
        validation_override_reason TEXT,

        -- Submission tracking
        submitted_by INTEGER REFERENCES users(id),
        submitted_at TIMESTAMP,
        submission_reference VARCHAR(100),

        -- Claim items (denormalized for claim form)
        claim_items JSONB DEFAULT '[]',

        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created insurance_claims table');

    // 3. Create diagnosis_procedure_mappings table for validation
    await client.query(`
      CREATE TABLE IF NOT EXISTS diagnosis_procedure_mappings (
        id SERIAL PRIMARY KEY,
        diagnosis_code_pattern VARCHAR(20) NOT NULL,
        diagnosis_description TEXT,
        procedure_category VARCHAR(50) NOT NULL CHECK (procedure_category IN ('lab', 'imaging', 'pharmacy', 'procedure')),
        procedure_code VARCHAR(50),
        procedure_name VARCHAR(200),
        is_valid BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created diagnosis_procedure_mappings table');

    // 4. Seed some common diagnosis-procedure mappings
    await client.query(`
      INSERT INTO diagnosis_procedure_mappings (diagnosis_code_pattern, diagnosis_description, procedure_category, procedure_code, procedure_name, notes)
      VALUES
        -- Diabetes
        ('E11%', 'Type 2 Diabetes', 'lab', 'GLU', 'Blood Glucose', 'Routine monitoring'),
        ('E11%', 'Type 2 Diabetes', 'lab', 'HBA1C', 'HbA1c', 'Quarterly monitoring'),
        ('E11%', 'Type 2 Diabetes', 'lab', 'RFT', 'Renal Function Test', 'Complication screening'),
        ('E11%', 'Type 2 Diabetes', 'lab', 'LIP', 'Lipid Profile', 'Cardiovascular risk'),

        -- Hypertension
        ('I10%', 'Hypertension', 'lab', 'RFT', 'Renal Function Test', 'Organ damage screening'),
        ('I10%', 'Hypertension', 'lab', 'LIP', 'Lipid Profile', 'Cardiovascular risk'),
        ('I10%', 'Hypertension', 'lab', 'LFT', 'Liver Function Test', 'Medication monitoring'),
        ('I10%', 'Hypertension', 'imaging', 'ECG', 'Electrocardiogram', 'Cardiac screening'),

        -- Malaria
        ('B50%', 'Malaria', 'lab', 'MP', 'Malaria Parasite', 'Diagnosis confirmation'),
        ('B50%', 'Malaria', 'lab', 'FBC', 'Full Blood Count', 'Severity assessment'),
        ('B50%', 'Malaria', 'pharmacy', NULL, 'Antimalarial', 'Treatment'),

        -- Typhoid
        ('A01%', 'Typhoid', 'lab', 'WIDAL', 'Widal Test', 'Diagnosis'),
        ('A01%', 'Typhoid', 'lab', 'FBC', 'Full Blood Count', 'Infection markers'),

        -- Pregnancy
        ('O09%', 'Pregnancy', 'lab', 'FBC', 'Full Blood Count', 'Routine antenatal'),
        ('O09%', 'Pregnancy', 'lab', 'BGRH', 'Blood Group & Rh', 'Compatibility'),
        ('O09%', 'Pregnancy', 'lab', 'VDRL', 'VDRL', 'STI screening'),
        ('O09%', 'Pregnancy', 'lab', 'HIV', 'HIV Screening', 'PMTCT'),
        ('O09%', 'Pregnancy', 'imaging', 'US', 'Ultrasound', 'Fetal assessment'),

        -- Respiratory infections
        ('J06%', 'Upper Respiratory Infection', 'lab', 'FBC', 'Full Blood Count', 'Infection markers'),
        ('J06%', 'Upper Respiratory Infection', 'pharmacy', NULL, 'Antibiotics', 'Treatment'),
        ('J06%', 'Upper Respiratory Infection', 'pharmacy', NULL, 'Analgesics', 'Symptomatic'),

        -- Anemia
        ('D50%', 'Anemia', 'lab', 'FBC', 'Full Blood Count', 'Diagnosis and monitoring'),
        ('D50%', 'Anemia', 'lab', 'IRON', 'Iron Studies', 'Etiology'),
        ('D50%', 'Anemia', 'pharmacy', NULL, 'Iron supplements', 'Treatment')
      ON CONFLICT DO NOTHING
    `);
    console.log('Seeded diagnosis-procedure mappings');

    // 5. Create indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_claims_patient ON insurance_claims(patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_claims_status ON insurance_claims(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_claims_invoice ON insurance_claims(invoice_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_claims_provider ON insurance_claims(insurance_provider_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_claims_doctor_review ON insurance_claims(status) WHERE status = 'pending_doctor_review'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_insurance ON patient_insurance_details(patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_diagnosis_mappings ON diagnosis_procedure_mappings(diagnosis_code_pattern)`);
    console.log('Created indexes');

    console.log('Insurance claims migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
