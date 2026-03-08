import pool from '../db';

export async function addPharmacyEnhancements() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add dispensed_by column to pharmacy_orders
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pharmacy_orders' AND column_name = 'dispensed_by'
        ) THEN
          ALTER TABLE pharmacy_orders ADD COLUMN dispensed_by INTEGER REFERENCES users(id);
        END IF;
      END $$;
    `);
    console.log('Added dispensed_by to pharmacy_orders');

    // Add is_otc flag to encounters for walk-in pharmacy patients
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'encounters' AND column_name = 'is_otc'
        ) THEN
          ALTER TABLE encounters ADD COLUMN is_otc BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('Added is_otc flag to encounters');

    // Add pharmacy_walk_in flag to department_routing
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'department_routing' AND column_name = 'is_walk_in'
        ) THEN
          ALTER TABLE department_routing ADD COLUMN is_walk_in BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('Added is_walk_in to department_routing');

    // Create index for faster lookups
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_dispensed_by ON pharmacy_orders(dispensed_by)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_encounters_is_otc ON encounters(is_otc) WHERE is_otc = true`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_department_routing_walk_in ON department_routing(is_walk_in) WHERE is_walk_in = true`);
    console.log('Created indexes');

    await client.query('COMMIT');
    console.log('Pharmacy enhancements migration completed successfully');

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
  addPharmacyEnhancements()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
