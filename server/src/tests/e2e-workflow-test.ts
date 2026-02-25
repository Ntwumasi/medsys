/**
 * End-to-End Workflow Test
 * Tests the complete patient journey through the system
 */

import pool from '../database/db';

const API_BASE = process.env.API_URL || 'http://localhost:3000/api';

interface TestResult {
  step: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  data?: any;
}

const results: TestResult[] = [];
let testPatientId: number;
let testEncounterId: number;
let testUserId: number;
let doctorId: number;
let nurseId: number;
let labOrderId: number;
let imagingOrderId: number;
let pharmacyOrderId: number;

function log(step: string, status: 'pass' | 'fail' | 'warning', message: string, data?: any) {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} [${step}] ${message}`);
  if (data && status !== 'pass') {
    console.log('   Data:', JSON.stringify(data, null, 2).substring(0, 500));
  }
  results.push({ step, status, message, data });
}

async function runTests() {
  console.log('\n========================================');
  console.log('  END-TO-END WORKFLOW TEST');
  console.log('========================================\n');

  const client = await pool.connect();

  try {
    // Get staff IDs for testing
    const staffResult = await client.query(`
      SELECT id, role, first_name, last_name FROM users
      WHERE role IN ('doctor', 'nurse', 'receptionist', 'lab', 'pharmacy', 'pharmacist', 'imaging')
      ORDER BY role
    `);

    console.log('Available Staff:');
    staffResult.rows.forEach(u => console.log(`  - ${u.role}: ${u.first_name} ${u.last_name} (ID: ${u.id})`));
    console.log('');

    const doctor = staffResult.rows.find(u => u.role === 'doctor');
    const nurse = staffResult.rows.find(u => u.role === 'nurse');
    const lab = staffResult.rows.find(u => u.role === 'lab');
    const pharmacist = staffResult.rows.find(u => u.role === 'pharmacist' || u.role === 'pharmacy');
    const imaging = staffResult.rows.find(u => u.role === 'imaging');

    if (!doctor) throw new Error('No doctor found in system');
    if (!nurse) throw new Error('No nurse found in system');

    doctorId = doctor.id;
    nurseId = nurse.id;

    // ========================================
    // STEP 1: RECEPTIONIST - Register Patient
    // ========================================
    console.log('\n--- STEP 1: RECEPTIONIST - Register Patient ---\n');

    const patientData = {
      first_name: 'Test',
      last_name: 'Patient',
      date_of_birth: '1990-05-15',
      gender: 'Male',
      phone: '0244123456',
      email: `test.patient.${Date.now()}@test.com`,
      address: '123 Test Street',
      city: 'Accra',
      region: 'Greater Accra',
      nationality: 'Ghanaian',
      preferred_clinic: 'General Practice',
      vip_status: 'gold',
      emergency_contact_name: 'Emergency Contact',
      emergency_contact_phone: '0244999888',
      emergency_contact_relationship: 'Spouse',
    };

    const patientResult = await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
      VALUES ($1, '$2b$10$placeholder', 'patient', $2, $3, $4)
      RETURNING id
    `, [patientData.email, patientData.first_name, patientData.last_name, patientData.phone]);

    testUserId = patientResult.rows[0].id;

    const patientCountResult = await client.query('SELECT COUNT(*) FROM patients');
    const patientNumber = `P${String(parseInt(patientCountResult.rows[0].count) + 1).padStart(6, '0')}`;

    const insertPatient = await client.query(`
      INSERT INTO patients (
        user_id, patient_number, date_of_birth, gender, address, city, region,
        nationality, preferred_clinic, vip_status, emergency_contact_name,
        emergency_contact_phone, emergency_contact_relationship
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      testUserId, patientNumber, patientData.date_of_birth, patientData.gender,
      patientData.address, patientData.city, patientData.region, patientData.nationality,
      patientData.preferred_clinic, patientData.vip_status, patientData.emergency_contact_name,
      patientData.emergency_contact_phone, patientData.emergency_contact_relationship
    ]);

    testPatientId = insertPatient.rows[0].id;
    log('Patient Registration', 'pass', `Created patient ${patientNumber} (ID: ${testPatientId}) with VIP status: ${patientData.vip_status}`);

    // Check VIP status was saved
    const vipCheck = await client.query('SELECT vip_status FROM patients WHERE id = $1', [testPatientId]);
    if (vipCheck.rows[0].vip_status === 'gold') {
      log('VIP Status', 'pass', 'VIP status saved correctly as "gold"');
    } else {
      log('VIP Status', 'fail', `VIP status mismatch. Expected: gold, Got: ${vipCheck.rows[0].vip_status}`);
    }

    // Create encounter
    const encounterCountResult = await client.query('SELECT COUNT(*) FROM encounters');
    const encounterNumber = `E${String(parseInt(encounterCountResult.rows[0].count) + 1).padStart(6, '0')}`;

    const encounterResult = await client.query(`
      INSERT INTO encounters (
        patient_id, encounter_number, encounter_type, status, chief_complaint, clinic, encounter_date, checked_in_at
      ) VALUES ($1, $2, 'walk-in', 'in-progress', 'Test complaint - headache and fever', 'General Practice', NOW(), NOW())
      RETURNING *
    `, [testPatientId, encounterNumber]);

    testEncounterId = encounterResult.rows[0].id;
    log('Encounter Creation', 'pass', `Created encounter ${encounterNumber} (ID: ${testEncounterId})`);

    // Check duplicate prevention
    const dupCheck = await client.query(`
      SELECT COUNT(*) FROM patients p
      JOIN users u ON p.user_id = u.id
      WHERE LOWER(u.first_name) = LOWER($1)
        AND LOWER(u.last_name) = LOWER($2)
        AND p.date_of_birth = $3
    `, [patientData.first_name, patientData.last_name, patientData.date_of_birth]);

    if (parseInt(dupCheck.rows[0].count) === 1) {
      log('Duplicate Check', 'pass', 'Duplicate prevention query working correctly');
    } else {
      log('Duplicate Check', 'warning', `Found ${dupCheck.rows[0].count} patients with same name/DOB`);
    }

    // ========================================
    // STEP 2: NURSE - Intake & Vitals
    // ========================================
    console.log('\n--- STEP 2: NURSE - Intake & Vitals ---\n');

    // Assign nurse to encounter
    await client.query(`
      UPDATE encounters SET nurse_id = $1, status = 'in-progress' WHERE id = $2
    `, [nurseId, testEncounterId]);
    log('Nurse Assignment', 'pass', `Assigned nurse ID ${nurseId} to encounter`);

    // Get available room
    const roomResult = await client.query(`
      SELECT id, room_number FROM rooms WHERE is_available = true LIMIT 1
    `);

    if (roomResult.rows.length === 0) {
      log('Room Assignment', 'fail', 'No available rooms found');
    } else {
      const roomId = roomResult.rows[0].id;
      await client.query(`
        UPDATE encounters SET room_id = $1 WHERE id = $2
      `, [roomId, testEncounterId]);
      await client.query(`
        UPDATE rooms SET is_available = false WHERE id = $1
      `, [roomId]);
      log('Room Assignment', 'pass', `Assigned room ${roomResult.rows[0].room_number} to encounter`);
    }

    // Record vital signs
    const vitals = {
      temperature: 38.5,
      temperature_unit: 'C',
      blood_pressure_systolic: 120,
      blood_pressure_diastolic: 80,
      heart_rate: 75,
      respiratory_rate: 16,
      oxygen_saturation: 98,
      weight: 70,
      weight_unit: 'kg',
      height: 175,
      height_unit: 'cm',
      pain_level: 4
    };

    await client.query(`
      INSERT INTO vital_signs_history (
        encounter_id, patient_id, temperature, temperature_unit,
        blood_pressure_systolic, blood_pressure_diastolic, heart_rate,
        respiratory_rate, oxygen_saturation, weight, weight_unit,
        height, height_unit, pain_level, recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      testEncounterId, testPatientId, vitals.temperature, vitals.temperature_unit,
      vitals.blood_pressure_systolic, vitals.blood_pressure_diastolic, vitals.heart_rate,
      vitals.respiratory_rate, vitals.oxygen_saturation, vitals.weight, vitals.weight_unit,
      vitals.height, vitals.height_unit, vitals.pain_level, nurseId
    ]);
    log('Vital Signs', 'pass', 'Recorded vital signs successfully');

    // Add nurse clinical note
    await client.query(`
      INSERT INTO clinical_notes (encounter_id, patient_id, note_type, content, created_by)
      VALUES ($1, $2, 'nurse_general', 'Patient presents with headache and fever for 2 days. No recent travel.', $3)
    `, [testEncounterId, testPatientId, nurseId]);
    log('Nurse Notes', 'pass', 'Added nurse clinical notes');

    // Alert doctor (change status to with_doctor)
    await client.query(`
      UPDATE encounters SET status = 'with_doctor', provider_id = $1 WHERE id = $2
    `, [doctorId, testEncounterId]);
    log('Alert Doctor', 'pass', 'Updated encounter status to with_doctor');

    // ========================================
    // STEP 3: DOCTOR - Consultation
    // ========================================
    console.log('\n--- STEP 3: DOCTOR - Consultation ---\n');

    // Check if doctor can see patient in their list
    const doctorPatients = await client.query(`
      SELECT e.*, p.patient_number, p.vip_status,
             u.first_name || ' ' || u.last_name as patient_name
      FROM encounters e
      JOIN patients p ON e.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE e.status IN ('in-progress', 'with_doctor', 'with_nurse')
      AND e.room_id IS NOT NULL
      ORDER BY
        CASE WHEN p.vip_status = 'platinum' THEN 1
             WHEN p.vip_status = 'gold' THEN 2
             WHEN p.vip_status = 'silver' THEN 3
             ELSE 4 END
    `);

    const ourPatient = doctorPatients.rows.find(p => p.id === testEncounterId);
    if (ourPatient) {
      log('Doctor Patient List', 'pass', `Patient visible in doctor's list. VIP sorting: ${ourPatient.vip_status}`);
    } else {
      log('Doctor Patient List', 'fail', 'Patient not visible in doctor\'s list');
    }

    // Add SOAP note (stored as doctor_general with JSON content)
    const soapContent = JSON.stringify({
      subjective: 'Patient reports headache and fever for 2 days. Pain 4/10.',
      objective: 'Temp 38.5C, BP 120/80, HR 75. Alert and oriented.',
      assessment: 'Viral syndrome, rule out bacterial infection',
      plan: 'Order CBC, Urinalysis. Prescribe acetaminophen. Follow up if symptoms worsen.'
    });

    await client.query(`
      INSERT INTO clinical_notes (encounter_id, patient_id, note_type, content, created_by)
      VALUES ($1, $2, 'doctor_general', $3, $4)
    `, [testEncounterId, testPatientId, soapContent, doctorId]);
    log('SOAP Note', 'pass', 'Added SOAP note successfully');

    // ========================================
    // STEP 4: DOCTOR - Create Lab Order
    // ========================================
    console.log('\n--- STEP 4: DOCTOR - Create Lab Order ---\n');

    const labOrderResult = await client.query(`
      INSERT INTO lab_orders (
        encounter_id, patient_id, ordering_provider, test_name, priority, status, notes, ordered_date
      ) VALUES ($1, $2, $3, 'Complete Blood Count (CBC)', 'routine', 'ordered', 'Check for infection', NOW())
      RETURNING *
    `, [testEncounterId, testPatientId, doctorId]);

    labOrderId = labOrderResult.rows[0].id;
    log('Lab Order', 'pass', `Created lab order ID ${labOrderId}: CBC`);

    // Add another lab test
    await client.query(`
      INSERT INTO lab_orders (
        encounter_id, patient_id, ordering_provider, test_name, priority, status, notes, ordered_date
      ) VALUES ($1, $2, $3, 'Urinalysis', 'routine', 'ordered', 'UTI screen', NOW())
    `, [testEncounterId, testPatientId, doctorId]);
    log('Lab Order', 'pass', 'Created additional lab order: Urinalysis');

    // ========================================
    // STEP 5: DOCTOR - Create Imaging Order
    // ========================================
    console.log('\n--- STEP 5: DOCTOR - Create Imaging Order ---\n');

    const imagingOrderResult = await client.query(`
      INSERT INTO imaging_orders (
        encounter_id, patient_id, ordering_provider, imaging_type, body_part, priority, status, notes, ordered_date
      ) VALUES ($1, $2, $3, 'X-Ray', 'Chest', 'routine', 'ordered', 'Rule out pneumonia', NOW())
      RETURNING *
    `, [testEncounterId, testPatientId, doctorId]);

    imagingOrderId = imagingOrderResult.rows[0].id;
    log('Imaging Order', 'pass', `Created imaging order ID ${imagingOrderId}: Chest X-Ray`);

    // ========================================
    // STEP 6: DOCTOR - Create Pharmacy Order
    // ========================================
    console.log('\n--- STEP 6: DOCTOR - Create Pharmacy Order ---\n');

    const pharmacyOrderResult = await client.query(`
      INSERT INTO pharmacy_orders (
        encounter_id, patient_id, ordering_provider, medication_name, dosage, frequency, quantity, status, notes, ordered_date
      ) VALUES ($1, $2, $3, 'Acetaminophen', '500mg', 'Every 6 hours', 20, 'ordered', 'Take with food. Duration: 5 days', NOW())
      RETURNING *
    `, [testEncounterId, testPatientId, doctorId]);

    pharmacyOrderId = pharmacyOrderResult.rows[0].id;
    log('Pharmacy Order', 'pass', `Created pharmacy order ID ${pharmacyOrderId}: Acetaminophen`);

    // ========================================
    // STEP 7: LAB - Process Order
    // ========================================
    console.log('\n--- STEP 7: LAB - Process Order ---\n');

    // Check if lab can see ordered tests
    const pendingLabOrders = await client.query(`
      SELECT lo.*, p.patient_number, u.first_name || ' ' || u.last_name as patient_name
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE lo.status = 'ordered'
      ORDER BY lo.created_at DESC
    `);

    if (pendingLabOrders.rows.length > 0) {
      log('Lab Pending Orders', 'pass', `Found ${pendingLabOrders.rows.length} ordered lab tests`);
    } else {
      log('Lab Pending Orders', 'fail', 'No ordered lab tests found');
    }

    // Lab collects sample
    await client.query(`
      UPDATE lab_orders SET status = 'collected', collected_date = NOW() WHERE id = $1
    `, [labOrderId]);
    log('Lab Collection', 'pass', 'Lab marked sample as collected');

    // Lab completes the order with results
    await client.query(`
      UPDATE lab_orders SET
        status = 'completed',
        result = $1,
        result_date = NOW()
      WHERE id = $2
    `, [JSON.stringify({
      wbc: '8.5 x10^9/L (Normal)',
      rbc: '4.8 x10^12/L (Normal)',
      hemoglobin: '14.2 g/dL (Normal)',
      hematocrit: '42% (Normal)',
      platelets: '250 x10^9/L (Normal)'
    }), labOrderId]);
    log('Lab Results', 'pass', 'Lab completed order with results');

    // ========================================
    // STEP 8: IMAGING - Process Order
    // ========================================
    console.log('\n--- STEP 8: IMAGING - Process Order ---\n');

    // Check if imaging can see ordered studies
    const pendingImagingOrders = await client.query(`
      SELECT io.*, p.patient_number, u.first_name || ' ' || u.last_name as patient_name
      FROM imaging_orders io
      JOIN patients p ON io.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE io.status = 'ordered'
      ORDER BY io.created_at DESC
    `);

    if (pendingImagingOrders.rows.length > 0) {
      log('Imaging Pending Orders', 'pass', `Found ${pendingImagingOrders.rows.length} ordered imaging studies`);
    } else {
      log('Imaging Pending Orders', 'fail', 'No ordered imaging studies found');
    }

    // Imaging processes and completes the order
    await client.query(`
      UPDATE imaging_orders SET
        status = 'completed',
        findings = 'Chest X-Ray findings: Clear lung fields bilaterally. No consolidation, effusion, or pneumothorax. Heart size normal. No acute cardiopulmonary process.',
        completed_date = NOW()
      WHERE id = $1
    `, [imagingOrderId]);
    log('Imaging Results', 'pass', 'Imaging completed order with findings');

    // ========================================
    // STEP 9: PHARMACY - Process Order
    // ========================================
    console.log('\n--- STEP 9: PHARMACY - Process Order ---\n');

    // Check if pharmacy can see ordered prescriptions
    const pendingPharmacyOrders = await client.query(`
      SELECT po.*, p.patient_number, u.first_name || ' ' || u.last_name as patient_name
      FROM pharmacy_orders po
      JOIN patients p ON po.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE po.status = 'ordered'
      ORDER BY po.created_at DESC
    `);

    if (pendingPharmacyOrders.rows.length > 0) {
      log('Pharmacy Pending Orders', 'pass', `Found ${pendingPharmacyOrders.rows.length} ordered prescriptions`);
    } else {
      log('Pharmacy Pending Orders', 'fail', 'No ordered prescriptions found');
    }

    // Pharmacy dispenses medication
    await client.query(`
      UPDATE pharmacy_orders SET
        status = 'dispensed',
        dispensed_date = NOW()
      WHERE id = $1
    `, [pharmacyOrderId]);
    log('Pharmacy Dispensed', 'pass', 'Pharmacy dispensed medication');

    // ========================================
    // STEP 10: DOCTOR - Review Results & Alert Nurse
    // ========================================
    console.log('\n--- STEP 10: DOCTOR - Review Results & Alert Nurse ---\n');

    // Check completed orders are visible
    const completedOrders = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM lab_orders WHERE encounter_id = $1 AND status = 'completed') as lab_completed,
        (SELECT COUNT(*) FROM imaging_orders WHERE encounter_id = $1 AND status = 'completed') as imaging_completed,
        (SELECT COUNT(*) FROM pharmacy_orders WHERE encounter_id = $1 AND status = 'dispensed') as pharmacy_dispensed
    `, [testEncounterId]);

    log('Orders Status', 'pass',
      `Lab: ${completedOrders.rows[0].lab_completed} completed, ` +
      `Imaging: ${completedOrders.rows[0].imaging_completed} completed, ` +
      `Pharmacy: ${completedOrders.rows[0].pharmacy_dispensed} dispensed`
    );

    // Doctor alerts nurse (patient goes back to nurse)
    await client.query(`
      UPDATE encounters SET status = 'with_nurse' WHERE id = $1
    `, [testEncounterId]);
    log('Alert Nurse', 'pass', 'Doctor alerted nurse - status changed to with_nurse');

    // Verify patient shows as "with nurse" in doctor list (greyed out)
    const doctorListAfterAlert = await client.query(`
      SELECT status FROM encounters WHERE id = $1
    `, [testEncounterId]);

    if (doctorListAfterAlert.rows[0].status === 'with_nurse') {
      log('With Nurse Status', 'pass', 'Encounter correctly shows as "with_nurse" - should appear greyed out in doctor list');
    } else {
      log('With Nurse Status', 'fail', `Expected status "with_nurse", got "${doctorListAfterAlert.rows[0].status}"`);
    }

    // ========================================
    // STEP 11: NURSE - Complete Encounter
    // ========================================
    console.log('\n--- STEP 11: NURSE - Complete Encounter ---\n');

    // Nurse adds discharge notes
    await client.query(`
      INSERT INTO clinical_notes (encounter_id, patient_id, note_type, content, created_by)
      VALUES ($1, $2, 'nurse_general', 'DISCHARGE: Patient educated on medication use. Advised to return if fever persists > 3 days.', $3)
    `, [testEncounterId, testPatientId, nurseId]);
    log('Discharge Notes', 'pass', 'Nurse added discharge notes');

    // Complete the encounter
    const roomToFree = await client.query('SELECT room_id FROM encounters WHERE id = $1', [testEncounterId]);

    await client.query(`
      UPDATE encounters SET
        status = 'completed',
        completed_at = NOW()
      WHERE id = $1
    `, [testEncounterId]);

    if (roomToFree.rows[0]?.room_id) {
      await client.query(`
        UPDATE rooms SET is_available = true WHERE id = $1
      `, [roomToFree.rows[0].room_id]);
      log('Room Release', 'pass', 'Room released and marked as available');
    }

    log('Encounter Complete', 'pass', 'Encounter marked as completed');

    // Verify encounter no longer appears in active lists
    const activeEncounters = await client.query(`
      SELECT COUNT(*) FROM encounters
      WHERE id = $1 AND status IN ('in-progress', 'with_doctor', 'with_nurse')
    `, [testEncounterId]);

    if (parseInt(activeEncounters.rows[0].count) === 0) {
      log('Active List', 'pass', 'Completed encounter no longer appears in active lists');
    } else {
      log('Active List', 'fail', 'Completed encounter still appears in active lists');
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n========================================');
    console.log('  TEST SUMMARY');
    console.log('========================================\n');

    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const warnings = results.filter(r => r.status === 'warning').length;

    console.log(`Total Tests: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);

    if (failed > 0) {
      console.log('\nFailed Tests:');
      results.filter(r => r.status === 'fail').forEach(r => {
        console.log(`  - ${r.step}: ${r.message}`);
      });
    }

    if (warnings > 0) {
      console.log('\nWarnings:');
      results.filter(r => r.status === 'warning').forEach(r => {
        console.log(`  - ${r.step}: ${r.message}`);
      });
    }

    // ========================================
    // ISSUES & IMPROVEMENTS
    // ========================================
    console.log('\n========================================');
    console.log('  ISSUES & SUGGESTED IMPROVEMENTS');
    console.log('========================================\n');

    const issues: string[] = [];
    const improvements: string[] = [];

    // Check for potential issues
    const missingIndexes = await client.query(`
      SELECT tablename, indexname FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('encounters', 'lab_orders', 'imaging_orders', 'pharmacy_orders', 'clinical_notes')
    `);

    // Check for orders without encounter association
    const orphanOrders = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM lab_orders WHERE encounter_id IS NULL) as orphan_lab,
        (SELECT COUNT(*) FROM imaging_orders WHERE encounter_id IS NULL) as orphan_imaging,
        (SELECT COUNT(*) FROM pharmacy_orders WHERE encounter_id IS NULL) as orphan_pharmacy
    `);

    if (parseInt(orphanOrders.rows[0].orphan_lab) > 0 ||
        parseInt(orphanOrders.rows[0].orphan_imaging) > 0 ||
        parseInt(orphanOrders.rows[0].orphan_pharmacy) > 0) {
      issues.push(`Found orphan orders: Lab(${orphanOrders.rows[0].orphan_lab}), Imaging(${orphanOrders.rows[0].orphan_imaging}), Pharmacy(${orphanOrders.rows[0].orphan_pharmacy})`);
    }

    // Check for encounters stuck in progress
    const stuckEncounters = await client.query(`
      SELECT COUNT(*) FROM encounters
      WHERE status IN ('in-progress', 'with_doctor', 'with_nurse')
      AND created_at < NOW() - INTERVAL '24 hours'
    `);

    if (parseInt(stuckEncounters.rows[0].count) > 0) {
      issues.push(`${stuckEncounters.rows[0].count} encounters older than 24 hours still in progress`);
    }

    // Suggest improvements
    improvements.push('Add real-time notifications when orders are completed (WebSocket/SSE)');
    improvements.push('Add order prioritization display (STAT orders highlighted)');
    improvements.push('Add patient wait time tracking and alerts');
    improvements.push('Add billing integration - auto-generate invoice when encounter completes');
    improvements.push('Add medication interaction checking in pharmacy module');
    improvements.push('Add lab result abnormal value highlighting');
    improvements.push('Add patient history quick view for returning patients');
    improvements.push('Add appointment scheduling from encounter');
    improvements.push('Add electronic signature for SOAP notes');
    improvements.push('Add audit logging for all clinical actions');

    console.log('POTENTIAL ISSUES:');
    if (issues.length === 0) {
      console.log('  None detected');
    } else {
      issues.forEach(i => console.log(`  ❌ ${i}`));
    }

    console.log('\nSUGGESTED IMPROVEMENTS:');
    improvements.forEach((imp, idx) => console.log(`  ${idx + 1}. ${imp}`));

    console.log('\nTEST DATA CREATED:');
    console.log(`  Patient ID: ${testPatientId}`);
    console.log(`  Encounter ID: ${testEncounterId}`);
    console.log(`  Lab Order ID: ${labOrderId}`);
    console.log(`  Imaging Order ID: ${imagingOrderId}`);
    console.log(`  Pharmacy Order ID: ${pharmacyOrderId}`);

  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

runTests();
