import pool from '../db';

async function addVipStatus() {
  console.log('Adding vip_status column to patients table...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add vip_status column
    await client.query(`
      ALTER TABLE patients
      ADD COLUMN IF NOT EXISTS vip_status VARCHAR(20) DEFAULT NULL
    `);

    // Add a check constraint for valid VIP statuses
    await client.query(`
      ALTER TABLE patients
      DROP CONSTRAINT IF EXISTS patients_vip_status_check
    `);

    await client.query(`
      ALTER TABLE patients
      ADD CONSTRAINT patients_vip_status_check
      CHECK (vip_status IS NULL OR vip_status IN ('silver', 'gold', 'platinum'))
    `);

    // Create an index on vip_status for sorting/filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_vip_status ON patients(vip_status)
    `);

    await client.query('COMMIT');
    console.log('✅ VIP status column added successfully!');
    console.log('   - Column: vip_status (VARCHAR(20), nullable)');
    console.log('   - Valid values: NULL, silver, gold, platinum');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding vip_status column:', error);
    throw error;
  } finally {
    client.release();
  }

  process.exit(0);
}

addVipStatus().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
