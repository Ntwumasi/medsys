import pool from '../db';

async function fixInvoicesSchema() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔧 Fixing invoices table schema...');

    // Check if 'total' column exists (old schema)
    const totalColumnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'total'
    `);

    // Check if 'total_amount' column exists (new schema)
    const totalAmountColumnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'total_amount'
    `);

    if (totalColumnCheck.rows.length > 0 && totalAmountColumnCheck.rows.length === 0) {
      console.log('Renaming column "total" to "total_amount"...');
      await client.query(`
        ALTER TABLE invoices RENAME COLUMN total TO total_amount
      `);
      console.log('✅ Column renamed successfully');
    } else if (totalAmountColumnCheck.rows.length > 0) {
      console.log('✓ Column "total_amount" already exists');
    } else {
      console.log('Adding "total_amount" column...');
      await client.query(`
        ALTER TABLE invoices ADD COLUMN total_amount DECIMAL(10, 2) DEFAULT 0
      `);
      console.log('✅ Column added successfully');
    }

    // Check if 'total_price' column exists in invoice_items
    const totalPriceColumnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoice_items' AND column_name = 'total_price'
    `);

    const invoiceItemsTotalCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoice_items' AND column_name = 'total'
    `);

    if (invoiceItemsTotalCheck.rows.length > 0 && totalPriceColumnCheck.rows.length === 0) {
      console.log('Renaming invoice_items column "total" to "total_price"...');
      await client.query(`
        ALTER TABLE invoice_items RENAME COLUMN total TO total_price
      `);
      console.log('✅ Invoice items column renamed successfully');
    } else if (totalPriceColumnCheck.rows.length > 0) {
      console.log('✓ Column "total_price" already exists in invoice_items');
    }

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 Invoices schema migration completed successfully!');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
fixInvoicesSchema()
  .then(() => {
    console.log('✓ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
