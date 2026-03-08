import pool from '../db';

export async function addSuppliers() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create suppliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created suppliers table');

    // Add supplier_id column to pharmacy_inventory if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pharmacy_inventory' AND column_name = 'supplier_id'
        ) THEN
          ALTER TABLE pharmacy_inventory ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id);
        END IF;
      END $$;
    `);
    console.log('Added supplier_id to pharmacy_inventory');

    // Create index for supplier lookups
    await client.query(`CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON pharmacy_inventory(supplier_id)`);
    console.log('Created indexes');

    // Seed some sample suppliers
    const suppliers = [
      ['Ernest Chemists Ltd', 'Ernest Adjei', '+233 302 123456', 'orders@ernestchemists.gh', 'Plot 10, Industrial Area, Accra', 'Accra', 'Major pharmaceutical distributor'],
      ['Tobinco Pharmaceuticals', 'Samuel Amo', '+233 302 987654', 'sales@tobinco.com', 'Tema Industrial Area', 'Tema', 'Local manufacturer'],
      ['Kama Healthcare', 'Grace Mensah', '+233 244 556677', 'procurement@kama.gh', 'Spintex Road, Accra', 'Accra', 'Medical supplies and devices'],
      ['Pharma Express Ghana', 'Kofi Asante', '+233 266 112233', 'info@pharmaexpress.gh', 'Ring Road Central', 'Accra', 'Fast delivery service'],
      ['HealthPlus Distributors', 'Ama Owusu', '+233 277 445566', 'orders@healthplus.gh', 'Kumasi Central', 'Kumasi', 'Regional distributor']
    ];

    for (const supplier of suppliers) {
      await client.query(
        `INSERT INTO suppliers (name, contact_person, phone, email, address, city, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        supplier
      );
    }
    console.log('Seeded sample suppliers');

    await client.query('COMMIT');
    console.log('Suppliers migration completed successfully');

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
  addSuppliers()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
