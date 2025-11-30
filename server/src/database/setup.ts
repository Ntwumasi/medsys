import pool from './db';

const createTables = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Users table for authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('doctor', 'nurse', 'admin', 'receptionist', 'patient')),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Patients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        patient_number VARCHAR(50) UNIQUE NOT NULL,
        date_of_birth DATE NOT NULL,
        gender VARCHAR(20) NOT NULL,
        blood_group VARCHAR(10),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        emergency_contact_name VARCHAR(200),
        emergency_contact_phone VARCHAR(20),
        emergency_contact_relationship VARCHAR(50),
        insurance_provider VARCHAR(200),
        insurance_number VARCHAR(100),
        marital_status VARCHAR(20),
        occupation VARCHAR(100),
        pcp_name VARCHAR(255),
        pcp_phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Medical history
    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_history (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        condition VARCHAR(200) NOT NULL,
        diagnosed_date DATE,
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Surgical history
    await client.query(`
      CREATE TABLE IF NOT EXISTS surgical_history (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        procedure_name VARCHAR(200) NOT NULL,
        procedure_date DATE NOT NULL,
        hospital VARCHAR(200),
        surgeon VARCHAR(200),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Allergies
    await client.query(`
      CREATE TABLE IF NOT EXISTS allergies (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        allergen VARCHAR(200) NOT NULL,
        reaction TEXT,
        severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
        onset_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Medications
    await client.query(`
      CREATE TABLE IF NOT EXISTS medications (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        medication_name VARCHAR(200) NOT NULL,
        dosage VARCHAR(100),
        frequency VARCHAR(100),
        route VARCHAR(50),
        start_date DATE NOT NULL,
        end_date DATE,
        prescribing_doctor INTEGER REFERENCES users(id),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'discontinued', 'completed')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Immunizations
    await client.query(`
      CREATE TABLE IF NOT EXISTS immunizations (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        vaccine_name VARCHAR(200) NOT NULL,
        date_administered DATE NOT NULL,
        administered_by INTEGER REFERENCES users(id),
        site VARCHAR(50),
        lot_number VARCHAR(100),
        next_due_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Family history
    await client.query(`
      CREATE TABLE IF NOT EXISTS family_history (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        relationship VARCHAR(50) NOT NULL,
        condition VARCHAR(200) NOT NULL,
        age_of_onset INTEGER,
        is_deceased BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Encounters/Visits
    await client.query(`
      CREATE TABLE IF NOT EXISTS encounters (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        provider_id INTEGER REFERENCES users(id),
        encounter_date TIMESTAMP NOT NULL,
        encounter_type VARCHAR(50),
        chief_complaint TEXT,
        history_of_present_illness TEXT,
        vital_signs JSONB,
        physical_examination TEXT,
        assessment TEXT,
        plan TEXT,
        status VARCHAR(20) DEFAULT 'in-progress' CHECK (status IN ('scheduled', 'in-progress', 'completed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Diagnoses
    await client.query(`
      CREATE TABLE IF NOT EXISTS diagnoses (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        diagnosis_code VARCHAR(20),
        diagnosis_description TEXT NOT NULL,
        type VARCHAR(20) CHECK (type IN ('primary', 'secondary')),
        onset_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Lab orders
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_orders (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        encounter_id INTEGER REFERENCES encounters(id),
        ordering_provider INTEGER REFERENCES users(id),
        test_name VARCHAR(200) NOT NULL,
        test_code VARCHAR(50),
        priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
        status VARCHAR(20) DEFAULT 'ordered' CHECK (status IN ('ordered', 'collected', 'in-progress', 'completed', 'cancelled')),
        ordered_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        collected_date TIMESTAMP,
        result_date TIMESTAMP,
        result TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Imaging orders
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_orders (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        encounter_id INTEGER REFERENCES encounters(id),
        ordering_provider INTEGER REFERENCES users(id),
        imaging_type VARCHAR(100) NOT NULL,
        body_part VARCHAR(100),
        priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
        status VARCHAR(20) DEFAULT 'ordered' CHECK (status IN ('ordered', 'scheduled', 'in-progress', 'completed', 'cancelled')),
        ordered_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scheduled_date TIMESTAMP,
        completed_date TIMESTAMP,
        findings TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Appointments
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        provider_id INTEGER REFERENCES users(id),
        appointment_date TIMESTAMP NOT NULL,
        duration_minutes INTEGER DEFAULT 30,
        appointment_type VARCHAR(50),
        status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show')),
        reason TEXT,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Messages (secure messaging)
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id),
        recipient_id INTEGER REFERENCES users(id),
        subject VARCHAR(200),
        message_body TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        parent_message_id INTEGER REFERENCES messages(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Billing/Invoices
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        encounter_id INTEGER REFERENCES encounters(id),
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE,
        subtotal DECIMAL(10, 2) NOT NULL,
        tax DECIMAL(10, 2) DEFAULT 0,
        total DECIMAL(10, 2) NOT NULL,
        amount_paid DECIMAL(10, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Invoice items
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL,
        total DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Payments
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        payment_date DATE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        reference_number VARCHAR(100),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Clinical notes templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS note_templates (
        id SERIAL PRIMARY KEY,
        template_name VARCHAR(200) NOT NULL,
        specialty VARCHAR(100),
        template_content TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_patients_patient_number ON patients(patient_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_encounters_provider_id ON encounters(provider_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_encounters_date ON encounters(encounter_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_provider_id ON appointments(provider_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_medications_patient_id ON medications(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_allergies_patient_id ON allergies(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_id ON lab_orders(patient_id)');

    await client.query('COMMIT');
    console.log('Database tables created successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

createTables();
