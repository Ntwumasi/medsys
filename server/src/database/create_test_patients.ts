import pool from './db';

const createTestPatients = async () => {
  const client = await pool.connect();

  try {
    // Create test patient 1
    const patient1 = await client.query(`
      INSERT INTO patients (
        patient_number, date_of_birth, gender, allergies,
        address, city, state,
        emergency_contact_name, emergency_contact_phone,
        insurance_provider, insurance_number
      )
      VALUES (
        'PAT001', '1985-03-15', 'Male', 'Penicillin',
        '123 Main St', 'San Francisco', 'CA',
        'Mary Doe', '555-1234',
        'Blue Cross', 'BC123456'
      )
      RETURNING id
    `);

    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
      VALUES ('patient1@example.com', 'temp', 'patient', 'John', 'Doe', '555-1001')
      ON CONFLICT (email) DO UPDATE SET id = users.id
      RETURNING id
    `).then(async (userResult) => {
      await client.query(`
        UPDATE patients SET user_id = $1 WHERE id = $2
      `, [userResult.rows[0].id, patient1.rows[0].id]);
    });

    // Create test patient 2
    const patient2 = await client.query(`
      INSERT INTO patients (
        patient_number, date_of_birth, gender, allergies,
        address, city, state,
        emergency_contact_name, emergency_contact_phone,
        insurance_provider, insurance_number
      )
      VALUES (
        'PAT002', '1972-07-22', 'Female', 'Latex, Sulfa drugs',
        '456 Oak Ave', 'San Francisco', 'CA',
        'Robert Smith', '555-5678',
        'Aetna', 'AE789012'
      )
      RETURNING id
    `);

    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
      VALUES ('patient2@example.com', 'temp', 'patient', 'Emily', 'Smith', '555-1002')
      ON CONFLICT (email) DO UPDATE SET id = users.id
      RETURNING id
    `).then(async (userResult) => {
      await client.query(`
        UPDATE patients SET user_id = $1 WHERE id = $2
      `, [userResult.rows[0].id, patient2.rows[0].id]);
    });

    // Create test patient 3
    const patient3 = await client.query(`
      INSERT INTO patients (
        patient_number, date_of_birth, gender, allergies,
        address, city, state,
        emergency_contact_name, emergency_contact_phone,
        insurance_provider, insurance_number
      )
      VALUES (
        'PAT003', '1990-11-30', 'Male', NULL,
        '789 Pine St', 'Oakland', 'CA',
        'Lisa Brown', '555-9012',
        'Kaiser', 'KP345678'
      )
      RETURNING id
    `);

    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
      VALUES ('patient3@example.com', 'temp', 'patient', 'Michael', 'Brown', '555-1003')
      ON CONFLICT (email) DO UPDATE SET id = users.id
      RETURNING id
    `).then(async (userResult) => {
      await client.query(`
        UPDATE patients SET user_id = $1 WHERE id = $2
      `, [userResult.rows[0].id, patient3.rows[0].id]);
    });

    console.log('✅ Test patients created successfully!');
    console.log('\nPatients:');
    console.log('─────────────────────────────────────');
    console.log('1. John Doe (PAT001) - Male, DOB: 1985-03-15');
    console.log('2. Emily Smith (PAT002) - Female, DOB: 1972-07-22');
    console.log('3. Michael Brown (PAT003) - Male, DOB: 1990-11-30');
    console.log('─────────────────────────────────────\n');

  } catch (error) {
    console.error('Error creating test patients:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

createTestPatients();
