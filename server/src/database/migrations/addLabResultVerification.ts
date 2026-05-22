import pool from '../db';

/**
 * Peer-review verification step for lab results.
 *
 * Workflow:
 *   1. Lab tech enters/uploads a result and assigns a reviewer (must be a
 *      different lab user). Row goes to verification_status='pending'; status
 *      stays 'in-progress'; result is NOT visible to the doctor yet.
 *   2. Any other lab tech (assignment is a hint, not a lock) opens the
 *      pending queue and either Verifies or Rejects with a reason.
 *   3. Verified -> status='completed', critical-value alerts fire, billing
 *      runs, doctor sees the result.
 *   4. Rejected -> status returns to 'in-progress', rejection_count++, entry
 *      tech is notified and edits + resubmits.
 *
 * Existing completed rows are grandfathered as 'not_required' so they stay
 * visible to the doctor without going through verification.
 */
export async function addLabResultVerification() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE lab_orders
        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20)
          DEFAULT 'not_required'
          CHECK (verification_status IN ('not_required', 'pending', 'verified', 'rejected')),
        ADD COLUMN IF NOT EXISTS assigned_reviewer_id INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verification_notes TEXT,
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0
    `);

    // Grandfather any existing completed results: they remain visible to the
    // doctor without re-verification. New results entered after this migration
    // will start at 'pending' (set by the controller, not by default).
    await client.query(`
      UPDATE lab_orders
         SET verification_status = 'not_required'
       WHERE verification_status IS NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_orders_verification_status
        ON lab_orders(verification_status)
        WHERE verification_status IN ('pending', 'rejected')
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_orders_assigned_reviewer
        ON lab_orders(assigned_reviewer_id)
        WHERE assigned_reviewer_id IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('Lab result verification migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lab result verification migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addLabResultVerification()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
