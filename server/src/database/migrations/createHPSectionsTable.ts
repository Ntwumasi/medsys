import pool from '../db';

async function createHPSectionsTable() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔧 Creating hp_sections table...');

    // Check if table already exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'hp_sections'
    `);

    if (tableCheck.rows.length === 0) {
      console.log('Creating hp_sections table...');

      await client.query(`
        CREATE TABLE hp_sections (
          id SERIAL PRIMARY KEY,
          encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
          patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          section_id VARCHAR(100) NOT NULL,
          content TEXT,
          completed BOOLEAN DEFAULT FALSE,
          updated_by INTEGER REFERENCES users(id),
          updated_by_role VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(encounter_id, section_id)
        )
      `);

      // Create indexes for better query performance
      await client.query(`
        CREATE INDEX idx_hp_sections_encounter ON hp_sections(encounter_id);
        CREATE INDEX idx_hp_sections_patient ON hp_sections(patient_id);
        CREATE INDEX idx_hp_sections_completed ON hp_sections(completed);
      `);

      console.log('✅ Table created successfully');
    } else {
      console.log('✓ Table hp_sections already exists');
    }

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 H&P sections table migration completed successfully!');
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
createHPSectionsTable()
  .then(() => {
    console.log('✓ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
