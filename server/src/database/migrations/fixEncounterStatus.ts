import pool from '../db';

async function fixEncounterStatus() {
  console.log('Fixing encounters status constraint...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop the existing constraint
    await client.query(`
      ALTER TABLE encounters
      DROP CONSTRAINT IF EXISTS encounters_status_check
    `);

    // Add the new constraint with additional workflow statuses
    await client.query(`
      ALTER TABLE encounters
      ADD CONSTRAINT encounters_status_check
      CHECK (status IN ('scheduled', 'in-progress', 'with_nurse', 'with_doctor', 'completed', 'cancelled', 'checked_out'))
    `);

    await client.query('COMMIT');
    console.log('✓ Encounters status constraint updated successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating encounters status constraint:', error);
    throw error;
  } finally {
    client.release();
  }

  process.exit(0);
}

fixEncounterStatus().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
