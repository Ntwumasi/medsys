import pool from '../db';

/**
 * Migration to:
 * 1. Add invoice_number and invoice_date columns to inventory_batches
 * 2. Support purchase deletion/editing workflow
 */
export async function addInvoiceFieldsAndPurchaseDelete() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add invoice_number to inventory_batches
    const col1 = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventory_batches' AND column_name = 'invoice_number'
    `);
    if (col1.rows.length === 0) {
      await client.query(`ALTER TABLE inventory_batches ADD COLUMN invoice_number VARCHAR(100)`);
      console.log('Added invoice_number column to inventory_batches');
    }

    // Add invoice_date to inventory_batches
    const col2 = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventory_batches' AND column_name = 'invoice_date'
    `);
    if (col2.rows.length === 0) {
      await client.query(`ALTER TABLE inventory_batches ADD COLUMN invoice_date DATE`);
      console.log('Added invoice_date column to inventory_batches');
    }

    // Add invoice_number to inventory_transactions for easier querying
    const col3 = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventory_transactions' AND column_name = 'invoice_number'
    `);
    if (col3.rows.length === 0) {
      await client.query(`ALTER TABLE inventory_transactions ADD COLUMN invoice_number VARCHAR(100)`);
      console.log('Added invoice_number column to inventory_transactions');
    }

    // Add invoice_date to inventory_transactions
    const col4 = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventory_transactions' AND column_name = 'invoice_date'
    `);
    if (col4.rows.length === 0) {
      await client.query(`ALTER TABLE inventory_transactions ADD COLUMN invoice_date DATE`);
      console.log('Added invoice_date column to inventory_transactions');
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addInvoiceFieldsAndPurchaseDelete()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
