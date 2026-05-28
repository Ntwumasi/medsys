import pool from '../db';

export async function addDoctorLabReview() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add doctor review columns to lab_orders
    await client.query(`
      ALTER TABLE lab_orders
        ADD COLUMN IF NOT EXISTS doctor_reviewed_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS doctor_reviewed_at TIMESTAMP
    `);

    console.log('Added doctor review columns to lab_orders');

    // Index for filtering unreviewed results
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor_reviewed
        ON lab_orders(ordering_provider, doctor_reviewed_at)
        WHERE doctor_reviewed_at IS NULL
    `);

    console.log('Created index for doctor lab review');

    await client.query('COMMIT');
    console.log('addDoctorLabReview migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('addDoctorLabReview migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run directly
addDoctorLabReview()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
