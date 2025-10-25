import pool from './db';

const dropAllTables = async () => {
  const client = await pool.connect();

  try {
    console.log('🗑️  Dropping all existing tables...');

    // Drop tables in reverse order of dependencies
    await client.query('DROP TABLE IF EXISTS payments CASCADE');
    await client.query('DROP TABLE IF EXISTS invoice_items CASCADE');
    await client.query('DROP TABLE IF EXISTS invoices CASCADE');
    await client.query('DROP TABLE IF EXISTS messages CASCADE');
    await client.query('DROP TABLE IF EXISTS appointments CASCADE');
    await client.query('DROP TABLE IF EXISTS imaging_orders CASCADE');
    await client.query('DROP TABLE IF EXISTS lab_orders CASCADE');
    await client.query('DROP TABLE IF EXISTS diagnoses CASCADE');
    await client.query('DROP TABLE IF EXISTS encounters CASCADE');
    await client.query('DROP TABLE IF EXISTS immunizations CASCADE');
    await client.query('DROP TABLE IF EXISTS medications CASCADE');
    await client.query('DROP TABLE IF EXISTS allergies CASCADE');
    await client.query('DROP TABLE IF EXISTS surgical_history CASCADE');
    await client.query('DROP TABLE IF EXISTS medical_history CASCADE');
    await client.query('DROP TABLE IF EXISTS family_history CASCADE');
    await client.query('DROP TABLE IF EXISTS patients CASCADE');
    await client.query('DROP TABLE IF EXISTS note_templates CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');

    // Drop workflow tables
    await client.query('DROP TABLE IF EXISTS pharmacy_orders CASCADE');
    await client.query('DROP TABLE IF EXISTS alerts CASCADE');
    await client.query('DROP TABLE IF EXISTS clinical_notes CASCADE');
    await client.query('DROP TABLE IF EXISTS rooms CASCADE');

    // Drop functions
    await client.query('DROP FUNCTION IF EXISTS generate_encounter_number CASCADE');

    console.log('✅ All tables dropped successfully!');
  } catch (error) {
    console.error('Error dropping tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

dropAllTables();
