import pool from '../db';

export async function addSOAPSigning() {
  const client = await pool.connect();

  try {
    console.log('Adding SOAP signing columns to encounters table...');

    // Check if columns already exist
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'encounters' AND column_name = 'soap_signed'
    `);

    if (checkColumn.rows.length === 0) {
      // Add SOAP signing columns
      await client.query(`
        ALTER TABLE encounters
        ADD COLUMN IF NOT EXISTS soap_signed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS soap_signed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS soap_signed_by INTEGER REFERENCES users(id)
      `);

      console.log('SOAP signing columns added successfully');
    } else {
      console.log('SOAP signing columns already exist');
    }

    console.log('SOAP signing migration completed');
  } catch (error) {
    console.error('Error adding SOAP signing columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  addSOAPSigning()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
