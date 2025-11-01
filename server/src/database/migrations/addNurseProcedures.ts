import pool from '../db';

async function addNurseProcedures() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🏥 Creating nurse procedures table...');

    // Create nurse procedures table
    await client.query(`
      CREATE TABLE IF NOT EXISTS nurse_procedures (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        charge_master_id INTEGER REFERENCES charge_master(id),
        procedure_name VARCHAR(200) NOT NULL,
        ordered_by INTEGER REFERENCES users(id),
        performed_by INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
        notes TEXT,
        ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        billed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Nurse procedures table created');

    // Add common nurse procedure charges to charge master
    console.log('💰 Adding nurse procedure charges...');

    const procedures = [
      { code: 'NURSE-SUTURE-SIMPLE', name: 'Simple Suture (1-5 stitches)', category: 'Nursing Procedures', price: 50.00 },
      { code: 'NURSE-SUTURE-INTER', name: 'Intermediate Suture (6-12 stitches)', category: 'Nursing Procedures', price: 100.00 },
      { code: 'NURSE-SUTURE-COMPLEX', name: 'Complex Suture (13+ stitches)', category: 'Nursing Procedures', price: 150.00 },
      { code: 'NURSE-WOUND-SIMPLE', name: 'Simple Wound Dressing', category: 'Nursing Procedures', price: 25.00 },
      { code: 'NURSE-WOUND-COMPLEX', name: 'Complex Wound Care', category: 'Nursing Procedures', price: 75.00 },
      { code: 'NURSE-IV-INSERT', name: 'IV Line Insertion', category: 'Nursing Procedures', price: 40.00 },
      { code: 'NURSE-CATHETER', name: 'Urinary Catheter Insertion', category: 'Nursing Procedures', price: 60.00 },
      { code: 'NURSE-NG-TUBE', name: 'Nasogastric Tube Insertion', category: 'Nursing Procedures', price: 55.00 },
      { code: 'NURSE-INJECTION-IM', name: 'Intramuscular Injection', category: 'Nursing Procedures', price: 20.00 },
      { code: 'NURSE-INJECTION-SC', name: 'Subcutaneous Injection', category: 'Nursing Procedures', price: 15.00 },
      { code: 'NURSE-BLOOD-DRAW', name: 'Blood Draw/Venipuncture', category: 'Nursing Procedures', price: 30.00 },
      { code: 'NURSE-ECG', name: 'ECG/EKG Recording', category: 'Nursing Procedures', price: 45.00 },
      { code: 'NURSE-NEBULIZER', name: 'Nebulizer Treatment', category: 'Nursing Procedures', price: 35.00 },
    ];

    for (const proc of procedures) {
      const exists = await client.query(
        'SELECT id FROM charge_master WHERE service_code = $1',
        [proc.code]
      );

      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO charge_master (service_code, service_name, category, price, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [proc.code, proc.name, proc.category, proc.price]
        );
      }
    }

    console.log(`✅ Added ${procedures.length} nurse procedure charges`);

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 Nurse procedures migration completed successfully!');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
addNurseProcedures()
  .then(() => {
    console.log('✓ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
