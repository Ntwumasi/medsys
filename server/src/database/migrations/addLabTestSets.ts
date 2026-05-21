import pool from '../db';

/**
 * Lab test sets: named, reusable bundles of lab tests doctors order together.
 *
 * Driven by corporate screening patterns at Medics (BIGPAY, Olams Pre-Employment,
 * etc.) where the same 6-10 labs are ordered for every patient. Sets are
 * clinic-shared by default; any doctor can create, but only the creator or an
 * admin can delete.
 */
export async function addLabTestSets() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_test_sets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        is_shared BOOLEAN NOT NULL DEFAULT TRUE,
        use_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_test_sets_created_by
        ON lab_test_sets(created_by)
        WHERE deleted_at IS NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_test_sets_use
        ON lab_test_sets(use_count DESC, last_used_at DESC NULLS LAST)
        WHERE deleted_at IS NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_test_set_items (
        id SERIAL PRIMARY KEY,
        set_id INTEGER NOT NULL REFERENCES lab_test_sets(id) ON DELETE CASCADE,
        test_name VARCHAR(200) NOT NULL,
        default_priority VARCHAR(20) NOT NULL DEFAULT 'routine'
          CHECK (default_priority IN ('routine', 'urgent', 'stat')),
        display_order INTEGER NOT NULL DEFAULT 0
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_test_set_items_set
        ON lab_test_set_items(set_id, display_order)
    `);

    await client.query('COMMIT');
    console.log('Lab test sets migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lab test sets migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addLabTestSets()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
