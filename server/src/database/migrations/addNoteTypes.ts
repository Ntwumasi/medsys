import pool from '../db';

export async function addNoteTypes() {
  const client = await pool.connect();

  try {
    console.log('Updating clinical_notes note_type constraint...');

    // Drop the old constraint and add a new one with more note types
    await client.query(`
      ALTER TABLE clinical_notes
      DROP CONSTRAINT IF EXISTS clinical_notes_note_type_check
    `);

    await client.query(`
      ALTER TABLE clinical_notes
      ADD CONSTRAINT clinical_notes_note_type_check
      CHECK (note_type IN (
        'receptionist',
        'nurse_hmp',
        'nurse_general',
        'doctor_general',
        'doctor_orders',
        'doctor_to_nurse',
        'doctor_procedural',
        'nurse_to_doctor'
      ))
    `);

    console.log('Note type constraint updated successfully');
  } catch (error) {
    console.error('Error updating note type constraint:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  addNoteTypes()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
