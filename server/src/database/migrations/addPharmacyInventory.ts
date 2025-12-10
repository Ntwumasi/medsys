import pool from '../db';

export async function addPharmacyInventory() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create pharmacy_inventory table for stock management
    await client.query(`
      CREATE TABLE IF NOT EXISTS pharmacy_inventory (
        id SERIAL PRIMARY KEY,
        medication_name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        category VARCHAR(100),
        unit VARCHAR(50) NOT NULL,
        quantity_on_hand INTEGER NOT NULL DEFAULT 0,
        reorder_level INTEGER NOT NULL DEFAULT 10,
        unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
        selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
        expiry_date DATE,
        supplier VARCHAR(255),
        location VARCHAR(100) DEFAULT 'Main Pharmacy',
        is_active BOOLEAN DEFAULT true,
        requires_prescription BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created pharmacy_inventory table');

    // Create payer_pricing_rules table for markup/discount handling
    await client.query(`
      CREATE TABLE IF NOT EXISTS payer_pricing_rules (
        id SERIAL PRIMARY KEY,
        payer_type VARCHAR(20) NOT NULL,
        payer_id INTEGER,
        category VARCHAR(100),
        markup_percentage DECIMAL(5, 2) DEFAULT 0,
        discount_percentage DECIMAL(5, 2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_payer_type CHECK (payer_type IN ('self_pay', 'corporate', 'insurance'))
      )
    `);
    console.log('Created payer_pricing_rules table');

    // Create inventory_transactions table for stock movements
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER REFERENCES pharmacy_inventory(id),
        transaction_type VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        notes TEXT,
        performed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_transaction_type CHECK (transaction_type IN ('purchase', 'dispense', 'adjustment', 'return', 'expired', 'transfer'))
      )
    `);
    console.log('Created inventory_transactions table');

    // Seed some initial inventory items
    const inventoryItems = [
      ['Paracetamol 500mg', 'Acetaminophen', 'Analgesic', 'tablet', 500, 50, 0.50, 1.00, '2026-12-31'],
      ['Ibuprofen 400mg', 'Ibuprofen', 'NSAID', 'tablet', 300, 30, 0.80, 1.50, '2026-06-30'],
      ['Amoxicillin 500mg', 'Amoxicillin', 'Antibiotic', 'capsule', 200, 20, 1.50, 3.00, '2025-12-31'],
      ['Ciprofloxacin 500mg', 'Ciprofloxacin', 'Antibiotic', 'tablet', 150, 15, 2.00, 4.00, '2026-03-31'],
      ['Metformin 500mg', 'Metformin', 'Antidiabetic', 'tablet', 400, 40, 0.40, 0.80, '2026-09-30'],
      ['Omeprazole 20mg', 'Omeprazole', 'PPI', 'capsule', 250, 25, 1.00, 2.00, '2026-08-31'],
      ['Amlodipine 5mg', 'Amlodipine', 'Antihypertensive', 'tablet', 300, 30, 0.60, 1.20, '2026-11-30'],
      ['Lisinopril 10mg', 'Lisinopril', 'ACE Inhibitor', 'tablet', 200, 20, 0.70, 1.40, '2026-07-31'],
      ['Atorvastatin 20mg', 'Atorvastatin', 'Statin', 'tablet', 250, 25, 1.20, 2.40, '2026-10-31'],
      ['Losartan 50mg', 'Losartan', 'ARB', 'tablet', 180, 18, 0.90, 1.80, '2026-05-31'],
      ['Metronidazole 400mg', 'Metronidazole', 'Antibiotic', 'tablet', 200, 20, 0.80, 1.60, '2026-04-30'],
      ['Azithromycin 500mg', 'Azithromycin', 'Antibiotic', 'tablet', 100, 10, 3.00, 6.00, '2025-09-30'],
      ['Salbutamol Inhaler', 'Salbutamol', 'Bronchodilator', 'inhaler', 50, 5, 8.00, 15.00, '2026-02-28'],
      ['Prednisolone 5mg', 'Prednisolone', 'Corticosteroid', 'tablet', 300, 30, 0.30, 0.60, '2026-12-31'],
      ['Diazepam 5mg', 'Diazepam', 'Benzodiazepine', 'tablet', 100, 10, 0.50, 1.00, '2026-01-31'],
      ['Tramadol 50mg', 'Tramadol', 'Analgesic', 'capsule', 150, 15, 1.00, 2.00, '2026-06-30'],
      ['Cetirizine 10mg', 'Cetirizine', 'Antihistamine', 'tablet', 400, 40, 0.20, 0.50, '2027-03-31'],
      ['Loratadine 10mg', 'Loratadine', 'Antihistamine', 'tablet', 350, 35, 0.25, 0.60, '2027-01-31'],
      ['Vitamin C 500mg', 'Ascorbic Acid', 'Vitamin', 'tablet', 500, 50, 0.10, 0.30, '2027-06-30'],
      ['Multivitamin', 'Multivitamin Complex', 'Vitamin', 'tablet', 400, 40, 0.15, 0.40, '2027-04-30'],
      ['ORS Sachet', 'Oral Rehydration Salts', 'Electrolyte', 'sachet', 300, 30, 0.30, 0.80, '2026-12-31'],
      ['Antacid Suspension', 'Aluminium/Magnesium Hydroxide', 'Antacid', 'bottle', 100, 10, 3.00, 6.00, '2026-08-31'],
      ['Cough Syrup', 'Dextromethorphan', 'Antitussive', 'bottle', 80, 8, 4.00, 8.00, '2026-05-31'],
      ['Eye Drops (Artificial Tears)', 'Carboxymethylcellulose', 'Ophthalmic', 'bottle', 60, 6, 5.00, 10.00, '2026-03-31'],
      ['Hydrocortisone Cream 1%', 'Hydrocortisone', 'Topical Steroid', 'tube', 75, 8, 3.50, 7.00, '2026-09-30'],
    ];

    for (const item of inventoryItems) {
      await client.query(
        `INSERT INTO pharmacy_inventory
         (medication_name, generic_name, category, unit, quantity_on_hand, reorder_level, unit_cost, selling_price, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        item
      );
    }
    console.log('Seeded pharmacy inventory items');

    // Seed payer pricing rules
    const pricingRules = [
      ['self_pay', null, null, 0, 0],
      ['corporate', null, null, 0, 10], // 10% discount for corporate clients
      ['insurance', null, null, 0, 15], // 15% discount for insurance
    ];

    for (const rule of pricingRules) {
      await client.query(
        `INSERT INTO payer_pricing_rules
         (payer_type, payer_id, category, markup_percentage, discount_percentage)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        rule
      );
    }
    console.log('Seeded payer pricing rules');

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_medication_name ON pharmacy_inventory(medication_name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_category ON pharmacy_inventory(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON pharmacy_inventory(expiry_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_transactions_inventory ON inventory_transactions(inventory_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payer_pricing_rules_type ON payer_pricing_rules(payer_type)`);
    console.log('Created indexes');

    await client.query('COMMIT');
    console.log('Pharmacy inventory migration completed successfully');

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
  addPharmacyInventory()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
