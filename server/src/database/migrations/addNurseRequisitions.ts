import pool from '../db';

/**
 * Nurse requisitions: a running shopping list of items the nurse needs the
 * clinic to procure. Built up over days; sent when ready. Separate concept
 * from a Purchase (which records stock RECEIVED), so we can track the
 * request → receipt cycle.
 *
 * Lifecycle:  draft  →  sent  →  received | cancelled
 */
export async function addNurseRequisitions() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS nurse_requisitions (
        id SERIAL PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
        notes TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        received_at TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nurse_requisitions_status
        ON nurse_requisitions(status, created_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS nurse_requisition_items (
        id SERIAL PRIMARY KEY,
        requisition_id INTEGER NOT NULL REFERENCES nurse_requisitions(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES nurse_inventory(id) ON DELETE SET NULL,
        item_name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        estimated_unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'pcs',
        notes TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nurse_requisition_items_req
        ON nurse_requisition_items(requisition_id, display_order)
    `);

    await client.query('COMMIT');
    console.log('Nurse requisitions migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Nurse requisitions migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addNurseRequisitions()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
