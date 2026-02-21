import pool from '../db';

export async function addLabInventory() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create lab_inventory table for reagents, supplies, equipment
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_inventory (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        category VARCHAR(100),
        unit VARCHAR(50) NOT NULL,
        quantity_on_hand INTEGER NOT NULL DEFAULT 0,
        reorder_level INTEGER NOT NULL DEFAULT 10,
        unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
        expiry_date DATE,
        lot_number VARCHAR(100),
        supplier VARCHAR(255),
        storage_location VARCHAR(100) DEFAULT 'Main Lab',
        storage_conditions VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        last_calibration_date DATE,
        next_calibration_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_item_type CHECK (item_type IN ('reagent', 'supply', 'equipment'))
      )
    `);
    console.log('Created lab_inventory table');

    // Create lab_inventory_transactions table for stock movements
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_inventory_transactions (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER REFERENCES lab_inventory(id) ON DELETE CASCADE,
        transaction_type VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        notes TEXT,
        performed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_lab_transaction_type CHECK (transaction_type IN ('purchase', 'use', 'adjustment', 'expired', 'calibration', 'transfer'))
      )
    `);
    console.log('Created lab_inventory_transactions table');

    // Create lab_test_catalog for standardized test definitions (or add missing columns if exists)
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_test_catalog (
        id SERIAL PRIMARY KEY,
        test_code VARCHAR(50) UNIQUE NOT NULL,
        test_name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        specimen_type VARCHAR(100),
        turnaround_time_hours INTEGER DEFAULT 24,
        base_price DECIMAL(10, 2) DEFAULT 0,
        critical_low DECIMAL(10, 2),
        critical_high DECIMAL(10, 2),
        normal_range_low DECIMAL(10, 2),
        normal_range_high DECIMAL(10, 2),
        unit VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add columns if they don't exist (for existing tables)
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
    console.log('Created/updated lab_test_catalog table');

    // Create critical_result_alerts for tracking critical values needing physician review
    await client.query(`
      CREATE TABLE IF NOT EXISTS critical_result_alerts (
        id SERIAL PRIMARY KEY,
        lab_order_id INTEGER REFERENCES lab_orders(id) ON DELETE CASCADE,
        ordering_provider_id INTEGER REFERENCES users(id),
        alert_type VARCHAR(50) NOT NULL,
        result_value VARCHAR(100),
        is_acknowledged BOOLEAN DEFAULT false,
        acknowledged_by INTEGER REFERENCES users(id),
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_alert_type CHECK (alert_type IN ('critical_high', 'critical_low', 'panic_value'))
      )
    `);
    console.log('Created critical_result_alerts table');

    // Seed lab inventory items
    const labInventoryItems = [
      // Reagents
      ['Complete Blood Count Reagent', 'reagent', 'Hematology', 'test', 500, 50, 2.50, '2026-12-31', 'LOT-CBC-2024', 'Bio-Rad', 'Main Lab', 'refrigerated'],
      ['Blood Chemistry Panel Reagent', 'reagent', 'Chemistry', 'test', 400, 40, 5.00, '2026-06-30', 'LOT-CHEM-2024', 'Roche', 'Main Lab', 'refrigerated'],
      ['Urinalysis Strips', 'reagent', 'Urinalysis', 'strip', 1000, 100, 0.50, '2026-09-30', 'LOT-UA-2024', 'Siemens', 'Main Lab', 'room_temp'],
      ['Pregnancy Test Kit', 'reagent', 'Immunology', 'test', 200, 20, 3.00, '2026-08-31', 'LOT-HCG-2024', 'Abbott', 'Main Lab', 'room_temp'],
      ['Blood Glucose Strips', 'reagent', 'Chemistry', 'strip', 800, 80, 0.80, '2026-07-31', 'LOT-GLU-2024', 'Accu-Chek', 'Main Lab', 'room_temp'],
      ['Malaria RDT', 'reagent', 'Parasitology', 'test', 300, 30, 4.00, '2026-05-31', 'LOT-MAL-2024', 'SD Bioline', 'Main Lab', 'room_temp'],
      ['HIV Rapid Test', 'reagent', 'Serology', 'test', 150, 15, 8.00, '2026-04-30', 'LOT-HIV-2024', 'Alere', 'Main Lab', 'room_temp'],
      ['Hepatitis B Test Kit', 'reagent', 'Serology', 'test', 100, 10, 6.00, '2026-10-31', 'LOT-HBV-2024', 'Abbott', 'Main Lab', 'refrigerated'],
      ['Gram Stain Kit', 'reagent', 'Microbiology', 'kit', 50, 5, 25.00, '2027-01-31', 'LOT-GRAM-2024', 'BD', 'Main Lab', 'room_temp'],
      ['Culture Media (Blood Agar)', 'reagent', 'Microbiology', 'plate', 200, 20, 2.00, '2026-03-31', 'LOT-BA-2024', 'Oxoid', 'Main Lab', 'refrigerated'],

      // Supplies
      ['EDTA Blood Collection Tubes', 'supply', 'Collection', 'tube', 1000, 100, 0.30, '2027-12-31', 'LOT-EDTA-2024', 'BD Vacutainer', 'Supply Room', 'room_temp'],
      ['Plain Blood Collection Tubes', 'supply', 'Collection', 'tube', 800, 80, 0.25, '2027-12-31', 'LOT-PLN-2024', 'BD Vacutainer', 'Supply Room', 'room_temp'],
      ['Lithium Heparin Tubes', 'supply', 'Collection', 'tube', 500, 50, 0.35, '2027-12-31', 'LOT-LH-2024', 'BD Vacutainer', 'Supply Room', 'room_temp'],
      ['Urine Collection Cups', 'supply', 'Collection', 'cup', 500, 50, 0.20, '2027-06-30', 'LOT-UC-2024', 'Generic', 'Supply Room', 'room_temp'],
      ['Microscope Slides', 'supply', 'General', 'slide', 2000, 200, 0.05, '2028-12-31', 'LOT-SLD-2024', 'Fisher', 'Supply Room', 'room_temp'],
      ['Cover Slips', 'supply', 'General', 'slip', 2000, 200, 0.02, '2028-12-31', 'LOT-CVR-2024', 'Fisher', 'Supply Room', 'room_temp'],
      ['Disposable Pipettes', 'supply', 'General', 'piece', 1000, 100, 0.10, '2027-12-31', 'LOT-PIP-2024', 'Generic', 'Supply Room', 'room_temp'],
      ['Gloves (Nitrile, Medium)', 'supply', 'PPE', 'pair', 500, 100, 0.15, '2027-06-30', 'LOT-GLV-2024', '3M', 'Supply Room', 'room_temp'],
      ['Alcohol Swabs', 'supply', 'Disinfection', 'swab', 1000, 100, 0.05, '2027-12-31', 'LOT-ALC-2024', 'Generic', 'Supply Room', 'room_temp'],
      ['Sharps Container', 'supply', 'Waste', 'container', 20, 5, 8.00, '2028-12-31', 'LOT-SHP-2024', 'BD', 'Supply Room', 'room_temp'],

      // Equipment (no expiry for equipment, but has calibration dates)
      ['Hematology Analyzer', 'equipment', 'Hematology', 'unit', 2, 1, 25000.00, null, 'SN-HEM-001', 'Sysmex', 'Main Lab', 'room_temp'],
      ['Chemistry Analyzer', 'equipment', 'Chemistry', 'unit', 2, 1, 35000.00, null, 'SN-CHEM-001', 'Roche', 'Main Lab', 'room_temp'],
      ['Microscope (Binocular)', 'equipment', 'General', 'unit', 5, 2, 2000.00, null, 'SN-MIC-001', 'Olympus', 'Main Lab', 'room_temp'],
      ['Centrifuge', 'equipment', 'General', 'unit', 3, 1, 1500.00, null, 'SN-CEN-001', 'Eppendorf', 'Main Lab', 'room_temp'],
      ['Incubator', 'equipment', 'Microbiology', 'unit', 2, 1, 3000.00, null, 'SN-INC-001', 'Thermo Fisher', 'Main Lab', 'room_temp'],
    ];

    for (const item of labInventoryItems) {
      await client.query(
        `INSERT INTO lab_inventory
         (item_name, item_type, category, unit, quantity_on_hand, reorder_level, unit_cost, expiry_date, lot_number, supplier, storage_location, storage_conditions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT DO NOTHING`,
        item
      );
    }
    console.log('Seeded lab inventory items');

    // Update equipment with calibration dates
    await client.query(`
      UPDATE lab_inventory
      SET last_calibration_date = CURRENT_DATE - INTERVAL '6 months',
          next_calibration_date = CURRENT_DATE + INTERVAL '6 months'
      WHERE item_type = 'equipment'
    `);
    console.log('Set calibration dates for equipment');

    // Seed lab test catalog
    const testCatalog = [
      // Hematology
      ['CBC', 'Complete Blood Count', 'Hematology', 'blood', 2, 75.00, 3.0, 11.0, 4.0, 10.0, 'x10^9/L'],
      ['HB', 'Hemoglobin', 'Hematology', 'blood', 1, 25.00, 7.0, 20.0, 12.0, 17.0, 'g/dL'],
      ['HCT', 'Hematocrit', 'Hematology', 'blood', 1, 20.00, 20.0, 60.0, 36.0, 50.0, '%'],
      ['PLT', 'Platelet Count', 'Hematology', 'blood', 1, 30.00, 50.0, 600.0, 150.0, 400.0, 'x10^9/L'],
      ['ESR', 'Erythrocyte Sedimentation Rate', 'Hematology', 'blood', 2, 35.00, null, 50.0, 0.0, 20.0, 'mm/hr'],

      // Chemistry
      ['GLU', 'Blood Glucose (Fasting)', 'Chemistry', 'blood', 1, 40.00, 2.0, 25.0, 3.9, 6.1, 'mmol/L'],
      ['GLUR', 'Blood Glucose (Random)', 'Chemistry', 'blood', 1, 40.00, 2.0, 30.0, 3.9, 11.0, 'mmol/L'],
      ['CREAT', 'Creatinine', 'Chemistry', 'blood', 4, 50.00, 30.0, 1000.0, 53.0, 115.0, 'umol/L'],
      ['UREA', 'Blood Urea Nitrogen', 'Chemistry', 'blood', 4, 45.00, 1.0, 50.0, 2.5, 7.1, 'mmol/L'],
      ['LFT', 'Liver Function Tests', 'Chemistry', 'blood', 6, 120.00, null, null, null, null, 'panel'],
      ['LIPID', 'Lipid Profile', 'Chemistry', 'blood', 6, 100.00, null, null, null, null, 'panel'],
      ['ELEC', 'Electrolytes (Na, K, Cl)', 'Chemistry', 'blood', 4, 80.00, null, null, null, null, 'panel'],

      // Urinalysis
      ['UA', 'Urinalysis (Complete)', 'Urinalysis', 'urine', 2, 50.00, null, null, null, null, 'panel'],
      ['UCUL', 'Urine Culture', 'Microbiology', 'urine', 48, 80.00, null, null, null, null, 'CFU/mL'],

      // Serology
      ['HIV', 'HIV Antibody Test', 'Serology', 'blood', 1, 100.00, null, null, null, null, 'reactive/non-reactive'],
      ['HBSAG', 'Hepatitis B Surface Antigen', 'Serology', 'blood', 2, 80.00, null, null, null, null, 'reactive/non-reactive'],
      ['HCV', 'Hepatitis C Antibody', 'Serology', 'blood', 2, 80.00, null, null, null, null, 'reactive/non-reactive'],
      ['VDRL', 'VDRL (Syphilis)', 'Serology', 'blood', 4, 60.00, null, null, null, null, 'reactive/non-reactive'],
      ['WIDAL', 'Widal Test (Typhoid)', 'Serology', 'blood', 2, 50.00, null, null, null, null, 'titer'],

      // Parasitology
      ['MP', 'Malaria Parasite (RDT)', 'Parasitology', 'blood', 1, 50.00, null, null, null, null, 'positive/negative'],
      ['MPS', 'Malaria Parasite (Smear)', 'Parasitology', 'blood', 2, 40.00, null, null, null, null, 'positive/negative'],
      ['STOOL', 'Stool Examination', 'Parasitology', 'stool', 2, 40.00, null, null, null, null, 'positive/negative'],

      // Immunology
      ['HCG', 'Pregnancy Test (Urine)', 'Immunology', 'urine', 1, 30.00, null, null, null, null, 'positive/negative'],
      ['BHCG', 'Beta HCG (Blood)', 'Immunology', 'blood', 4, 80.00, null, null, null, null, 'mIU/mL'],

      // Microbiology
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
    console.log('Seeded lab test catalog');

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_inventory_item_name ON lab_inventory(item_name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_inventory_type ON lab_inventory(item_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_inventory_category ON lab_inventory(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_inventory_expiry ON lab_inventory(expiry_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_inventory_transactions_inventory ON lab_inventory_transactions(inventory_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_code ON lab_test_catalog(test_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_category ON lab_test_catalog(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_critical_alerts_provider ON critical_result_alerts(ordering_provider_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_critical_alerts_unack ON critical_result_alerts(is_acknowledged) WHERE is_acknowledged = false`);
    console.log('Created indexes');

    await client.query('COMMIT');
    console.log('Lab inventory migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  addLabInventory()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
