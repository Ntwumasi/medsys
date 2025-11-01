import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating charge_master table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS charge_master (
        id SERIAL PRIMARY KEY,
        service_name VARCHAR(255) NOT NULL,
        service_code VARCHAR(50) UNIQUE NOT NULL,
        category VARCHAR(100) NOT NULL, -- consultation, lab, imaging, pharmacy, procedure
        price DECIMAL(10, 2) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating invoice_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        charge_master_id INTEGER REFERENCES charge_master(id),
        description VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Seeding charge master with common services...');

    // Consultations
    await client.query(`
      INSERT INTO charge_master (service_name, service_code, category, price, description) VALUES
      ('New Patient Consultation', 'CONS-NEW', 'consultation', 50.00, 'Initial consultation for new patients'),
      ('Follow-up Consultation', 'CONS-FU', 'consultation', 30.00, 'Follow-up visit for returning patients'),
      ('Emergency Consultation', 'CONS-ER', 'consultation', 100.00, 'Emergency department consultation')
    `);

    // Lab Tests
    await client.query(`
      INSERT INTO charge_master (service_name, service_code, category, price, description) VALUES
      ('Complete Blood Count (CBC)', 'LAB-CBC', 'lab', 25.00, 'Full blood count test'),
      ('Comprehensive Metabolic Panel (CMP)', 'LAB-CMP', 'lab', 35.00, 'Complete metabolic panel'),
      ('Lipid Panel', 'LAB-LIPID', 'lab', 30.00, 'Cholesterol and triglyceride levels'),
      ('Urinalysis', 'LAB-UA', 'lab', 15.00, 'Urine analysis'),
      ('Blood Glucose', 'LAB-GLUC', 'lab', 10.00, 'Blood sugar test'),
      ('HbA1c', 'LAB-A1C', 'lab', 40.00, 'Glycated hemoglobin test'),
      ('Liver Function Test (LFT)', 'LAB-LFT', 'lab', 35.00, 'Liver enzyme panel'),
      ('Kidney Function Test', 'LAB-KFT', 'lab', 30.00, 'Renal function panel'),
      ('Thyroid Function Test', 'LAB-TFT', 'lab', 45.00, 'TSH, T3, T4 panel'),
      ('Malaria Test', 'LAB-MAL', 'lab', 12.00, 'Rapid malaria antigen test'),
      ('HIV Test', 'LAB-HIV', 'lab', 20.00, 'HIV screening test'),
      ('Hepatitis Panel', 'LAB-HEP', 'lab', 50.00, 'Hepatitis A, B, C screening')
    `);

    // Imaging
    await client.query(`
      INSERT INTO charge_master (service_name, service_code, category, price, description) VALUES
      ('X-Ray - Chest', 'IMG-XR-CHEST', 'imaging', 40.00, 'Chest X-ray, 2 views'),
      ('X-Ray - Abdomen', 'IMG-XR-ABD', 'imaging', 45.00, 'Abdominal X-ray'),
      ('X-Ray - Extremity', 'IMG-XR-EXT', 'imaging', 35.00, 'X-ray of arm, leg, hand, or foot'),
      ('X-Ray - Spine', 'IMG-XR-SPINE', 'imaging', 50.00, 'Spinal X-ray'),
      ('Ultrasound - Abdomen', 'IMG-US-ABD', 'imaging', 80.00, 'Abdominal ultrasound'),
      ('Ultrasound - Pelvis', 'IMG-US-PELV', 'imaging', 75.00, 'Pelvic ultrasound'),
      ('Ultrasound - Obstetric', 'IMG-US-OB', 'imaging', 70.00, 'Pregnancy ultrasound'),
      ('CT Scan - Head', 'IMG-CT-HEAD', 'imaging', 250.00, 'CT scan of head/brain'),
      ('CT Scan - Chest', 'IMG-CT-CHEST', 'imaging', 300.00, 'CT scan of chest'),
      ('CT Scan - Abdomen', 'IMG-CT-ABD', 'imaging', 300.00, 'CT scan of abdomen'),
      ('MRI - Brain', 'IMG-MRI-BRAIN', 'imaging', 500.00, 'MRI of brain'),
      ('ECG', 'IMG-ECG', 'imaging', 25.00, '12-lead electrocardiogram')
    `);

    // Common Medications
    await client.query(`
      INSERT INTO charge_master (service_name, service_code, category, price, description) VALUES
      ('Paracetamol 500mg (10 tablets)', 'MED-PARA-10', 'pharmacy', 5.00, 'Pain relief and fever reducer'),
      ('Ibuprofen 400mg (10 tablets)', 'MED-IBU-10', 'pharmacy', 8.00, 'Anti-inflammatory pain relief'),
      ('Amoxicillin 500mg (14 capsules)', 'MED-AMOX-14', 'pharmacy', 15.00, 'Antibiotic - 7 day course'),
      ('Ciprofloxacin 500mg (10 tablets)', 'MED-CIPRO-10', 'pharmacy', 20.00, 'Antibiotic'),
      ('Metformin 500mg (30 tablets)', 'MED-METF-30', 'pharmacy', 12.00, 'Diabetes medication'),
      ('Amlodipine 5mg (30 tablets)', 'MED-AMLO-30', 'pharmacy', 18.00, 'Blood pressure medication'),
      ('Lisinopril 10mg (30 tablets)', 'MED-LISI-30', 'pharmacy', 20.00, 'Blood pressure medication'),
      ('Omeprazole 20mg (14 capsules)', 'MED-OMEP-14', 'pharmacy', 15.00, 'Acid reflux medication'),
      ('Salbutamol Inhaler', 'MED-SALB-INH', 'pharmacy', 25.00, 'Asthma inhaler'),
      ('Oral Rehydration Salts (ORS)', 'MED-ORS', 'pharmacy', 3.00, 'Rehydration solution')
    `);

    // Procedures
    await client.query(`
      INSERT INTO charge_master (service_name, service_code, category, price, description) VALUES
      ('Wound Dressing - Simple', 'PROC-DRESS-S', 'procedure', 20.00, 'Simple wound dressing'),
      ('Wound Dressing - Complex', 'PROC-DRESS-C', 'procedure', 50.00, 'Complex wound care'),
      ('Suturing - Simple', 'PROC-SUTURE-S', 'procedure', 75.00, 'Simple laceration repair'),
      ('Suturing - Complex', 'PROC-SUTURE-C', 'procedure', 150.00, 'Complex laceration repair'),
      ('IV Cannulation', 'PROC-IV', 'procedure', 15.00, 'Intravenous line insertion'),
      ('IV Fluid - Normal Saline', 'PROC-IV-NS', 'procedure', 20.00, '1L Normal Saline IV'),
      ('IV Fluid - Dextrose', 'PROC-IV-D5', 'procedure', 25.00, '1L Dextrose 5% IV'),
      ('Nebulization', 'PROC-NEB', 'procedure', 15.00, 'Nebulizer treatment'),
      ('Injection - IM/SC', 'PROC-INJ', 'procedure', 10.00, 'Intramuscular or subcutaneous injection'),
      ('Blood Pressure Check', 'PROC-BP', 'procedure', 5.00, 'Blood pressure monitoring'),
      ('Catheterization', 'PROC-CATH', 'procedure', 40.00, 'Urinary catheter insertion'),
      ('Nasogastric Tube Insertion', 'PROC-NGT', 'procedure', 35.00, 'NG tube placement')
    `);

    console.log('Creating indexes for performance...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_charge_master_category ON charge_master(category);
      CREATE INDEX IF NOT EXISTS idx_charge_master_code ON charge_master(service_code);
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
