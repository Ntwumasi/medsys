import pool from '../db';

export async function addMedicationAdministration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add medication administration columns to pharmacy_orders
    await client.query(`
      ALTER TABLE pharmacy_orders
        ADD COLUMN IF NOT EXISTS administered_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS administered_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS administration_notes TEXT
    `);

    await client.query('COMMIT');
    console.log('Migration: addMedicationAdministration completed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run directly
addMedicationAdministration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
