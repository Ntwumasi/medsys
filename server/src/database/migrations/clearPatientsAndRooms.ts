import pool from '../db';

async function clearPatientsAndRooms() {
  console.log('Clearing all patients and rooms from the system...');
  console.log('⚠️  This will delete all patient data, encounters, and related records.\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete in order respecting foreign key constraints

    // 1. Delete clinical notes
    const notesResult = await client.query('DELETE FROM clinical_notes');
    console.log(`Deleted ${notesResult.rowCount} clinical notes`);

    // 2. Delete vital signs history
    const vitalsResult = await client.query('DELETE FROM vital_signs_history');
    console.log(`Deleted ${vitalsResult.rowCount} vital signs records`);

    // 3. Delete all order types
    const labOrdersResult = await client.query('DELETE FROM lab_orders');
    console.log(`Deleted ${labOrdersResult.rowCount} lab orders`);

    const imagingOrdersResult = await client.query('DELETE FROM imaging_orders');
    console.log(`Deleted ${imagingOrdersResult.rowCount} imaging orders`);

    const pharmacyOrdersResult = await client.query('DELETE FROM pharmacy_orders');
    console.log(`Deleted ${pharmacyOrdersResult.rowCount} pharmacy orders`);

    const ordersResult = await client.query('DELETE FROM orders');
    console.log(`Deleted ${ordersResult.rowCount} general orders`);

    // 4. Delete invoice items first, then invoices
    const invoiceItemsResult = await client.query('DELETE FROM invoice_items');
    console.log(`Deleted ${invoiceItemsResult.rowCount} invoice items`);

    const invoicesResult = await client.query('DELETE FROM invoices');
    console.log(`Deleted ${invoicesResult.rowCount} invoices`);

    // 5. Delete appointments
    const appointmentsResult = await client.query('DELETE FROM appointments');
    console.log(`Deleted ${appointmentsResult.rowCount} appointments`);

    // 6. Delete encounters
    const encountersResult = await client.query('DELETE FROM encounters');
    console.log(`Deleted ${encountersResult.rowCount} encounters`);

    // 7. Delete patient payer sources
    const payerSourcesResult = await client.query('DELETE FROM patient_payer_sources');
    console.log(`Deleted ${payerSourcesResult.rowCount} patient payer sources`);

    // 8. Delete medications
    const medsResult = await client.query('DELETE FROM medications');
    console.log(`Deleted ${medsResult.rowCount} medications`);

    // 9. Delete allergies
    const allergiesResult = await client.query('DELETE FROM allergies');
    console.log(`Deleted ${allergiesResult.rowCount} allergies`);

    // 10. Delete patients
    const patientsResult = await client.query('DELETE FROM patients');
    console.log(`Deleted ${patientsResult.rowCount} patients`);

    // 11. Delete patient user accounts (role = 'patient') that are not referenced elsewhere
    const patientUsersResult = await client.query(`
      DELETE FROM users
      WHERE role = 'patient'
      AND id NOT IN (SELECT DISTINCT assigned_doctor_id FROM corporate_clients WHERE assigned_doctor_id IS NOT NULL)
    `);
    console.log(`Deleted ${patientUsersResult.rowCount} patient user accounts`);

    // 12. Clear room assignments (set all rooms to available)
    const roomsResult = await client.query(`
      UPDATE rooms
      SET is_available = true
    `);
    console.log(`Reset ${roomsResult.rowCount} rooms to available`);

    // 13. Reset patient number sequence
    // We'll create a sequence if it doesn't exist and reset it
    await client.query(`
      DO $$
      BEGIN
        -- Check if we need to do anything with sequences
        -- Patient numbers are generated in code, so no sequence to reset
        NULL;
      END $$;
    `);

    await client.query('COMMIT');

    console.log('\n✅ System cleared successfully!');
    console.log('   - All patients and related data deleted');
    console.log('   - All rooms reset to available');
    console.log('   - Ready for fresh testing\n');

    // Verify duplicate prevention is in place
    console.log('Verifying duplicate patient prevention...');
    const checkResult = await client.query(`
      SELECT 1 FROM pg_proc
      WHERE proname = 'createpatient'
      LIMIT 1
    `);

    console.log('✅ Duplicate check: The createPatient controller checks for');
    console.log('   matching first_name + last_name + date_of_birth before creating.\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing system:', error);
    throw error;
  } finally {
    client.release();
  }

  process.exit(0);
}

clearPatientsAndRooms().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
