import pool from '../db';

export async function addClinicsTable() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create clinics lookup table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Created clinics table');

    // Seed initial clinics
    const clinics = [
      'Family Medicine',
      'Internal Medicine',
      'Infectious Disease',
      'Hematology',
      'Nephrology',
    ];

    for (const name of clinics) {
      await client.query(
        `INSERT INTO clinics (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name]
      );
    }

    console.log(`Seeded ${clinics.length} clinics`);

    await client.query('COMMIT');
    console.log('Clinics table migration completed successfully');
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
  addClinicsTable()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
