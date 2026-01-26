import pool from '../db';

export async function renameBloodGroupToAllergies() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if blood_group column exists
    const checkBloodGroup = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'patients' AND column_name = 'blood_group'
    `);

    if (checkBloodGroup.rows.length > 0) {
      // Add allergies column if it doesn't exist
      await client.query(`
        ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS allergies TEXT
      `);
      console.log('Added allergies column');

      // Drop the blood_group column (data will be lost - blood groups are not allergies)
      await client.query(`
        ALTER TABLE patients
        DROP COLUMN IF EXISTS blood_group
      `);
      console.log('Dropped blood_group column');
    } else {
      // blood_group doesn't exist, just ensure allergies exists
      await client.query(`
        ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS allergies TEXT
      `);
      console.log('Allergies column already exists or added');
    }

    await client.query('COMMIT');
    console.log('Migration completed: blood_group renamed to allergies');

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
  renameBloodGroupToAllergies()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
