import pool from '../db';

async function fixLabTestCatalog() {
  const client = await pool.connect();
  try {
    // Add missing columns
    await client.query(`
      ALTER TABLE lab_test_catalog
      ADD COLUMN IF NOT EXISTS turnaround_time_hours INTEGER DEFAULT 24,
      ADD COLUMN IF NOT EXISTS base_price DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS critical_low DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS critical_high DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS normal_range_low DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS normal_range_high DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('Added missing columns');

    // Migrate existing data from old columns to new if they exist
    await client.query(`
      UPDATE lab_test_catalog
      SET normal_range_low = normal_range_min,
          normal_range_high = normal_range_max,
          turnaround_time_hours = CASE
            WHEN turnaround_time ~ '^[0-9]+' THEN REGEXP_REPLACE(turnaround_time, '[^0-9]', '', 'g')::INTEGER
            ELSE 24
          END
      WHERE normal_range_low IS NULL
    `);
    console.log('Migrated existing data');

    // Now seed the test catalog with new entries (ON CONFLICT will skip existing)
    const testCatalog = [
      ['CBC', 'Complete Blood Count', 'Hematology', 'blood', 2, 75.00, 3.0, 11.0, 4.0, 10.0, 'x10^9/L'],
      ['HB', 'Hemoglobin', 'Hematology', 'blood', 1, 25.00, 7.0, 20.0, 12.0, 17.0, 'g/dL'],
      ['HCT', 'Hematocrit', 'Hematology', 'blood', 1, 20.00, 20.0, 60.0, 36.0, 50.0, '%'],
      ['PLT', 'Platelet Count', 'Hematology', 'blood', 1, 30.00, 50.0, 600.0, 150.0, 400.0, 'x10^9/L'],
      ['ESR', 'Erythrocyte Sedimentation Rate', 'Hematology', 'blood', 2, 35.00, null, 50.0, 0.0, 20.0, 'mm/hr'],
      ['GLU', 'Blood Glucose (Fasting)', 'Chemistry', 'blood', 1, 40.00, 2.0, 25.0, 3.9, 6.1, 'mmol/L'],
      ['GLUR', 'Blood Glucose (Random)', 'Chemistry', 'blood', 1, 40.00, 2.0, 30.0, 3.9, 11.0, 'mmol/L'],
      ['CREAT', 'Creatinine', 'Chemistry', 'blood', 4, 50.00, 30.0, 1000.0, 53.0, 115.0, 'umol/L'],
      ['UREA', 'Blood Urea Nitrogen', 'Chemistry', 'blood', 4, 45.00, 1.0, 50.0, 2.5, 7.1, 'mmol/L'],
      ['LFT', 'Liver Function Tests', 'Chemistry', 'blood', 6, 120.00, null, null, null, null, 'panel'],
      ['LIPID', 'Lipid Profile', 'Chemistry', 'blood', 6, 100.00, null, null, null, null, 'panel'],
      ['ELEC', 'Electrolytes (Na, K, Cl)', 'Chemistry', 'blood', 4, 80.00, null, null, null, null, 'panel'],
      ['UA', 'Urinalysis (Complete)', 'Urinalysis', 'urine', 2, 50.00, null, null, null, null, 'panel'],
      ['UCUL', 'Urine Culture', 'Microbiology', 'urine', 48, 80.00, null, null, null, null, 'CFU/mL'],
      ['HIV', 'HIV Antibody Test', 'Serology', 'blood', 1, 100.00, null, null, null, null, 'reactive/non-reactive'],
      ['HBSAG', 'Hepatitis B Surface Antigen', 'Serology', 'blood', 2, 80.00, null, null, null, null, 'reactive/non-reactive'],
      ['HCV', 'Hepatitis C Antibody', 'Serology', 'blood', 2, 80.00, null, null, null, null, 'reactive/non-reactive'],
      ['VDRL', 'VDRL (Syphilis)', 'Serology', 'blood', 4, 60.00, null, null, null, null, 'reactive/non-reactive'],
      ['WIDAL', 'Widal Test (Typhoid)', 'Serology', 'blood', 2, 50.00, null, null, null, null, 'titer'],
      ['MP', 'Malaria Parasite (RDT)', 'Parasitology', 'blood', 1, 50.00, null, null, null, null, 'positive/negative'],
      ['MPS', 'Malaria Parasite (Smear)', 'Parasitology', 'blood', 2, 40.00, null, null, null, null, 'positive/negative'],
      ['STOOL', 'Stool Examination', 'Parasitology', 'stool', 2, 40.00, null, null, null, null, 'positive/negative'],
      ['HCG', 'Pregnancy Test (Urine)', 'Immunology', 'urine', 1, 30.00, null, null, null, null, 'positive/negative'],
      ['BHCG', 'Beta HCG (Blood)', 'Immunology', 'blood', 4, 80.00, null, null, null, null, 'mIU/mL'],
      ['BCUL', 'Blood Culture', 'Microbiology', 'blood', 72, 150.00, null, null, null, null, 'growth/no growth'],
      ['SCUL', 'Stool Culture', 'Microbiology', 'stool', 48, 100.00, null, null, null, null, 'growth/no growth'],
      ['WCUL', 'Wound Culture', 'Microbiology', 'swab', 48, 100.00, null, null, null, null, 'growth/no growth'],
    ];

    for (const test of testCatalog) {
      await client.query(
        `INSERT INTO lab_test_catalog
         (test_code, test_name, category, specimen_type, turnaround_time_hours, base_price, critical_low, critical_high, normal_range_low, normal_range_high, unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (test_code) DO UPDATE SET
           turnaround_time_hours = EXCLUDED.turnaround_time_hours,
           base_price = EXCLUDED.base_price,
           critical_low = EXCLUDED.critical_low,
           critical_high = EXCLUDED.critical_high,
           normal_range_low = EXCLUDED.normal_range_low,
           normal_range_high = EXCLUDED.normal_range_high`,
        test
      );
    }
    console.log('Seeded/updated lab test catalog');

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_code ON lab_test_catalog(test_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_category ON lab_test_catalog(category)`);
    console.log('Created indexes');

    console.log('Lab test catalog fix complete');
  } catch (error) {
    console.error('Fix failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  fixLabTestCatalog()
    .then(() => {
      console.log('Fix complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fix failed:', error);
      process.exit(1);
    });
}
