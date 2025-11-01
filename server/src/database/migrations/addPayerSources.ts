import pool from '../db';

const addPayerSourceTables = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Corporate clients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL UNIQUE,
        contact_person VARCHAR(200),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        address TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insurance providers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS insurance_providers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL UNIQUE,
        contact_person VARCHAR(200),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        address TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Patient payer sources junction table (many-to-many relationship)
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_payer_sources (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        payer_type VARCHAR(20) NOT NULL CHECK (payer_type IN ('self_pay', 'corporate', 'insurance')),
        corporate_client_id INTEGER REFERENCES corporate_clients(id),
        insurance_provider_id INTEGER REFERENCES insurance_providers(id),
        is_primary BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_payer_source CHECK (
          (payer_type = 'self_pay' AND corporate_client_id IS NULL AND insurance_provider_id IS NULL) OR
          (payer_type = 'corporate' AND corporate_client_id IS NOT NULL AND insurance_provider_id IS NULL) OR
          (payer_type = 'insurance' AND insurance_provider_id IS NOT NULL AND corporate_client_id IS NULL)
        )
      )
    `);

    // Add index for patient payer sources
    await client.query('CREATE INDEX IF NOT EXISTS idx_patient_payer_sources_patient_id ON patient_payer_sources(patient_id)');

    // Add payer_source_id to invoices table to track which payer source was used for billing
    await client.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payer_source_id INTEGER REFERENCES patient_payer_sources(id)
    `);

    // Seed initial corporate clients
    const corporateClients = [
      'The Meal Box',
      'Bigpay Ghana Ltd',
      'Jade E. Service Ghana Ltd (Jumia)',
      'Olam Agri',
      'Olam Agri Grains',
      'Nutrifoods Tomato',
      'Nutrifoods Biscuit',
      'MEST',
      'CFAO'
    ];

    for (const client_name of corporateClients) {
      await client.query(
        `INSERT INTO corporate_clients (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [client_name]
      );
    }

    // Seed initial insurance providers
    const insuranceProviders = [
      'Premier Health Insurance'
    ];

    for (const provider_name of insuranceProviders) {
      await client.query(
        `INSERT INTO insurance_providers (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [provider_name]
      );
    }

    await client.query('COMMIT');
    console.log('Payer source tables created and seeded successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating payer source tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

export default addPayerSourceTables;

// Run if called directly
if (require.main === module) {
  addPayerSourceTables()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
