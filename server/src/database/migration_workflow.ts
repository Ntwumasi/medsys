import pool from './db';

const migrateWorkflowSystem = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create rooms table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        room_number VARCHAR(10) UNIQUE NOT NULL,
        room_name VARCHAR(100),
        is_available BOOLEAN DEFAULT true,
        room_type VARCHAR(50) DEFAULT 'exam',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add encounter_number and workflow fields to encounters table
    await client.query(`
      ALTER TABLE encounters
      ADD COLUMN IF NOT EXISTS encounter_number VARCHAR(50) UNIQUE,
      ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id),
      ADD COLUMN IF NOT EXISTS nurse_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS receptionist_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS triage_time TIMESTAMP,
      ADD COLUMN IF NOT EXISTS triage_priority VARCHAR(20) CHECK (triage_priority IN ('green', 'yellow', 'red')),
      ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS nurse_started_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS doctor_started_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP
    `);

    // Create clinical notes table with signing capability
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_notes (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        note_type VARCHAR(50) NOT NULL CHECK (note_type IN ('receptionist', 'nurse_hmp', 'nurse_general', 'doctor_general', 'doctor_orders')),
        content TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) NOT NULL,
        is_signed BOOLEAN DEFAULT false,
        signed_at TIMESTAMP,
        signed_by INTEGER REFERENCES users(id),
        is_locked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create pharmacy orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pharmacy_orders (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        encounter_id INTEGER REFERENCES encounters(id),
        ordering_provider INTEGER REFERENCES users(id),
        medication_name VARCHAR(200) NOT NULL,
        dosage VARCHAR(100),
        frequency VARCHAR(100),
        route VARCHAR(50),
        quantity VARCHAR(50),
        refills INTEGER DEFAULT 0,
        priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
        status VARCHAR(20) DEFAULT 'ordered' CHECK (status IN ('ordered', 'approved', 'dispensed', 'completed', 'cancelled')),
        ordered_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        dispensed_date TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create alerts/notifications table for nurse-to-doctor communication
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        from_user_id INTEGER REFERENCES users(id),
        to_user_id INTEGER REFERENCES users(id),
        alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('patient_ready', 'vitals_critical', 'urgent', 'general')),
        message TEXT,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default rooms (5-10 exam rooms)
    await client.query(`
      INSERT INTO rooms (room_number, room_name, room_type)
      VALUES
        ('1', 'Exam Room 1', 'exam'),
        ('2', 'Exam Room 2', 'exam'),
        ('3', 'Exam Room 3', 'exam'),
        ('4', 'Exam Room 4', 'exam'),
        ('5', 'Exam Room 5', 'exam'),
        ('6', 'Exam Room 6', 'exam'),
        ('7', 'Exam Room 7', 'exam'),
        ('8', 'Exam Room 8', 'exam')
      ON CONFLICT (room_number) DO NOTHING
    `);

    // Add indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_encounters_encounter_number ON encounters(encounter_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_encounters_room_id ON encounters(room_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_encounters_nurse_id ON encounters(nurse_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_encounters_triage_time ON encounters(triage_time)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter_id ON clinical_notes(encounter_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_id ON clinical_notes(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_alerts_encounter_id ON alerts(encounter_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_alerts_to_user ON alerts(to_user_id, is_read)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_patient_id ON pharmacy_orders(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_encounter_id ON pharmacy_orders(encounter_id)');

    // Add function to auto-generate encounter numbers
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_encounter_number()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.encounter_number IS NULL THEN
          NEW.encounter_number := 'ENC' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('encounters_id_seq')::TEXT, 6, '0');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS set_encounter_number ON encounters;
    `);

    await client.query(`
      CREATE TRIGGER set_encounter_number
      BEFORE INSERT ON encounters
      FOR EACH ROW
      EXECUTE FUNCTION generate_encounter_number();
    `);

    await client.query('COMMIT');
    console.log('Workflow system migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error migrating workflow system:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

migrateWorkflowSystem();
