import pool from '../db';

export async function addEncounterClinic() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add clinic column to encounters table
    await client.query(`
      ALTER TABLE encounters
      ADD COLUMN IF NOT EXISTS clinic VARCHAR(100)
    `);

    console.log('Added clinic column to encounters table');

    await client.query('COMMIT');
    console.log('Encounter clinic migration completed successfully');

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
  addEncounterClinic()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
