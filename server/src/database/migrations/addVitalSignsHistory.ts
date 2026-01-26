import pool from '../db';

export async function addVitalSignsHistory() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create vital_signs_history table to track all vital sign recordings
    await client.query(`
      CREATE TABLE IF NOT EXISTS vital_signs_history (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        recorded_by INTEGER REFERENCES users(id),
        temperature DECIMAL(5,2),
        temperature_unit VARCHAR(1) DEFAULT 'F',
        blood_pressure_systolic INTEGER,
        blood_pressure_diastolic INTEGER,
        heart_rate INTEGER,
        respiratory_rate INTEGER,
        oxygen_saturation INTEGER,
        weight DECIMAL(6,2),
        weight_unit VARCHAR(3) DEFAULT 'lbs',
        height DECIMAL(5,2),
        height_unit VARCHAR(2) DEFAULT 'in',
        pain_level INTEGER,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      )
    `);

    console.log('Created vital_signs_history table');

    // Add indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_vital_signs_history_patient ON vital_signs_history(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vital_signs_history_encounter ON vital_signs_history(encounter_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vital_signs_history_recorded_at ON vital_signs_history(recorded_at DESC)');

    console.log('Created indexes for vital_signs_history');

    // Migrate existing vital signs from encounters table to history table
    await client.query(`
      INSERT INTO vital_signs_history (
        encounter_id, patient_id, temperature, temperature_unit,
        blood_pressure_systolic, blood_pressure_diastolic, heart_rate,
        respiratory_rate, oxygen_saturation, weight, weight_unit,
        height, height_unit, recorded_at
      )
      SELECT
        e.id as encounter_id,
        e.patient_id,
        (e.vital_signs->>'temperature')::DECIMAL(5,2),
        COALESCE(e.vital_signs->>'temperature_unit', 'F'),
        (e.vital_signs->>'blood_pressure_systolic')::INTEGER,
        (e.vital_signs->>'blood_pressure_diastolic')::INTEGER,
        (e.vital_signs->>'heart_rate')::INTEGER,
        (e.vital_signs->>'respiratory_rate')::INTEGER,
        (e.vital_signs->>'oxygen_saturation')::INTEGER,
        (e.vital_signs->>'weight')::DECIMAL(6,2),
        COALESCE(e.vital_signs->>'weight_unit', 'lbs'),
        (e.vital_signs->>'height')::DECIMAL(5,2),
        COALESCE(e.vital_signs->>'height_unit', 'in'),
        e.updated_at
      FROM encounters e
      WHERE e.vital_signs IS NOT NULL
        AND e.vital_signs != '{}'::jsonb
        AND NOT EXISTS (
          SELECT 1 FROM vital_signs_history vsh
          WHERE vsh.encounter_id = e.id
        )
    `);

    console.log('Migrated existing vital signs to history table');

    await client.query('COMMIT');
    console.log('Vital signs history migration completed successfully');

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
  addVitalSignsHistory()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
