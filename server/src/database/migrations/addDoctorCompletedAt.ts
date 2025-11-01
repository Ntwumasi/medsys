import pool from '../db';

async function addDoctorCompletedAt() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔧 Adding doctor_completed_at column to encounters table...');

    // Check if doctor_completed_at column already exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'encounters' AND column_name = 'doctor_completed_at'
    `);

    if (columnCheck.rows.length === 0) {
      console.log('Adding doctor_completed_at column...');

      await client.query(`
        ALTER TABLE encounters
        ADD COLUMN doctor_completed_at TIMESTAMP
      `);

      console.log('✅ Column added successfully');
    } else {
      console.log('✓ Column doctor_completed_at already exists');
    }

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 Doctor completed timestamp migration completed successfully!');
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
addDoctorCompletedAt()
  .then(() => {
    console.log('✓ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
