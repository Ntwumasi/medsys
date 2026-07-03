import { Request, Response } from 'express';
import pool from '../database/db';
import { validateAllVitals } from '../utils/vitalSignsValidation';
import billingService from '../services/billingService';
import auditService from '../services/auditService';
import notificationService from '../services/notificationService';
import { getNextMonOrThu } from './nurseFollowUpTaskController';
import { resolveLabCatalogItem } from './ordersController';

// Receptionist: Check-in patient and create encounter
export const checkInPatient = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const authReq = req as any;
    let receptionist_id = authReq.user?.id || null;

    const { patient_id, chief_complaint, encounter_type, billing_amount, clinic, provider_id: requested_provider_id, force } = req.body;

    // Verify receptionist_id exists in users table (to avoid FK constraint violation)
    if (receptionist_id) {
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [receptionist_id]);
      if (userCheck.rows.length === 0) {
        receptionist_id = null; // User doesn't exist, use NULL
      }
    }

    await client.query('BEGIN');

    // Check if patient already has an active encounter today (prevent duplicate
    // check-ins). `force` lets reception intentionally start a SECOND same-day
    // visit while the first is still open — e.g. the patient needs to see a
    // different doctor and pays for everything at the end of the day.
    const activeEncounterCheck = force
      ? { rows: [] as any[] }
      : await client.query(
      `SELECT e.id, e.encounter_number, e.checked_in_at,
              u.first_name || ' ' || u.last_name as patient_name
       FROM encounters e
       JOIN patients p ON e.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE e.patient_id = $1
         AND DATE(e.checked_in_at) = CURRENT_DATE
         AND e.status NOT IN ('completed', 'discharged', 'cancelled')`,
      [patient_id]
    );

    if (activeEncounterCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      client.release(); // Release connection before returning
      const existing = activeEncounterCheck.rows[0];
      const checkedInTime = new Date(existing.checked_in_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      res.status(409).json({
        error: 'Patient already checked in',
        message: `${existing.patient_name} is already checked in today (${existing.encounter_number} at ${checkedInTime}). Please use the existing encounter or complete/discharge it first.`,
        existingEncounterId: existing.id,
        existingEncounterNumber: existing.encounter_number
      });
      return;
    }

    // Check if patient has a corporate payer source and get assigned doctor
    const payerSourceResult = await client.query(
      `SELECT pps.payer_type, cc.assigned_doctor_id
       FROM patient_payer_sources pps
       LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
       WHERE pps.patient_id = $1 AND pps.payer_type = 'corporate' AND pps.is_primary = true
       LIMIT 1`,
      [patient_id]
    );

    // Priority: receptionist's explicit choice > corporate payer default > null (assign later)
    let assigned_provider_id = requested_provider_id || null;
    if (!assigned_provider_id && payerSourceResult.rows.length > 0 && payerSourceResult.rows[0].assigned_doctor_id) {
      assigned_provider_id = payerSourceResult.rows[0].assigned_doctor_id;
    }

    const result = await client.query(
      `INSERT INTO encounters (
        patient_id, provider_id, receptionist_id, encounter_date, encounter_type,
        chief_complaint, status, checked_in_at, triage_time, triage_priority, clinic
      ) VALUES ($1, $2, $3, $4, $5, $6, 'in-progress', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'green', $7)
      RETURNING *`,
      [
        patient_id,
        assigned_provider_id,
        receptionist_id,
        new Date(),
        encounter_type || 'walk-in',
        chief_complaint,
        clinic || null,
      ]
    );

    const encounter = result.rows[0];

    // Check if this is a new or returning patient
    // Use count > 1 because the current encounter was already inserted above
    const encounterCountResult = await client.query(
      `SELECT COUNT(*) FROM encounters WHERE patient_id = $1`,
      [patient_id]
    );
    const totalEncounters = parseInt(encounterCountResult.rows[0].count);
    // Also check if patient has any PREVIOUS encounters (before today) to be safe
    const previousVisitResult = await client.query(
      `SELECT COUNT(*) FROM encounters WHERE patient_id = $1 AND id != $2`,
      [patient_id, encounter.id]
    );
    const hasPreviousVisits = parseInt(previousVisitResult.rows[0].count) > 0;
    // CareCode legacy patients (imported, cc- prefixed) already existed before
    // MedSys, so their first MedSys encounter is NOT a first-ever visit — they
    // must not be charged a registration fee (Irene: returning patients billed
    // registration because the system saw cc- imports as new).
    const sourceResult = await client.query(
      `SELECT source, patient_number FROM patients WHERE id = $1`,
      [patient_id]
    );
    const isLegacyPatient =
      sourceResult.rows[0]?.source === 'carecode' ||
      /^cc/i.test(String(sourceResult.rows[0]?.patient_number || ''));
    const isNewPatient = totalEncounters === 1 && !hasPreviousVisits && !isLegacyPatient;

    // Create invoice with proper billing - use MAX(id) to avoid collisions
    const maxIdResult = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM invoices');
    const nextInvoiceId = parseInt(maxIdResult.rows[0].next_id);
    const invoiceNumber = `INV${String(nextInvoiceId).padStart(6, '0')}`;

    // Build all check-in charges upfront (registration + consultation together)
    const checkInCharges: Array<{ chargeMasterId: number | null; description: string; price: number }> = [];

    // 1. Registration fee for new patients only — skip for department walk-ins
    const departmentClinics = ['Pharmacy (OTC/Walk-in)', 'Lab (Walk-in)', 'Imaging (Walk-in)'];
    if (isNewPatient && !departmentClinics.includes(clinic)) {
      const chargeResult = await client.query(
        'SELECT id, price, service_name FROM charge_master WHERE service_code = $1 AND is_active = true',
        ['REG-001']
      );

      checkInCharges.push({
        chargeMasterId: chargeResult.rows.length > 0 ? chargeResult.rows[0].id : null,
        description: chargeResult.rows.length > 0 ? chargeResult.rows[0].service_name : 'Registration',
        price: chargeResult.rows.length > 0 ? parseFloat(chargeResult.rows[0].price) : 100,
      });
    }

    // 2. Consultation fee — match the clinic if possible, fall back to general
    // Only add consultation for non-department walk-ins (pharmacy/lab/imaging don't need it)
    if (!departmentClinics.includes(clinic)) {
      // Prefer the assigned clinic's linked consultation charge. Billing the
      // charge (not a flat price) means the invoice loop below runs it through
      // resolvePrice, so the patient's payer source (self-pay / insurance /
      // corporate) determines the amount — e.g. Cardiology bills 600 self-pay
      // but the insurer's agreed rate when an insurance payer is selected.
      let clinicCharge: { id: number; price: number } | null = null;
      if (clinic) {
        const cr = await client.query(
          `SELECT cm.id, cm.price
           FROM clinics c JOIN charge_master cm ON c.charge_master_id = cm.id
           WHERE c.name = $1 AND cm.is_active = true LIMIT 1`,
          [clinic]
        );
        if (cr.rows.length > 0) {
          clinicCharge = { id: cr.rows[0].id, price: parseFloat(cr.rows[0].price) };
        }
      }

      if (clinicCharge) {
        checkInCharges.push({
          chargeMasterId: clinicCharge.id,
          description: `${clinic} Consultation`,
          price: clinicCharge.price,
        });
      } else {
      // Try clinic-specific consultation charge first
      // The charge_master uses various naming patterns:
      //   "Cardiology" (SPEC-CARDIO), "Internal Medicine" (SPEC-INTMED),
      //   "Family Medicine" → falls through to "General Practitioner Consult"
      let consultResult = { rows: [] as any[] };
      if (clinic) {
        // Search broadly: clinic name anywhere in service_name, or exact match
        consultResult = await client.query(
          `SELECT id, price, service_name FROM charge_master
           WHERE category = 'consultation' AND is_active = true
           AND (service_name ILIKE $1 OR service_name ILIKE $2 OR service_name ILIKE $3)
           ORDER BY
             CASE WHEN service_name ILIKE $1 THEN 1
                  WHEN service_name ILIKE $2 THEN 2
                  ELSE 3 END
           LIMIT 1`,
          [`${clinic}`, `${clinic} %`, `%${clinic}%`]
        );
      }
      // Fall back to encounter-type-based charge code
      if (consultResult.rows.length === 0) {
        // Family Medicine, General Practice → CONS-GP
        // Follow-up → CONS-REVIEW
        // New patient → CONS-GP (not CONS-PCP which is "Primary Care" at GHS 400)
        const consultCode = encounter.encounter_type === 'follow-up' ? 'CONS-REVIEW' : 'CONS-GP';
        consultResult = await client.query(
          'SELECT id, price, service_name FROM charge_master WHERE service_code = $1 AND is_active = true LIMIT 1',
          [consultCode]
        );
      }
      checkInCharges.push({
        chargeMasterId: consultResult.rows.length > 0 ? consultResult.rows[0].id : null,
        description: consultResult.rows.length > 0 ? consultResult.rows[0].service_name : `${clinic || 'General'} Consultation`,
        price: consultResult.rows.length > 0 ? parseFloat(consultResult.rows[0].price) : 200,
      });
      }
    }

    const initialTotal = checkInCharges.reduce((sum, c) => sum + c.price, 0);

    const invoiceResult = await client.query(
      `INSERT INTO invoices (
        patient_id, encounter_id, invoice_number, invoice_date,
        subtotal, tax, total_amount, status
      ) VALUES ($1, $2, $3, CURRENT_DATE, $4, 0, $4, 'pending')
      RETURNING *`,
      [patient_id, encounter.id, invoiceNumber, initialTotal]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // Insert all charge items and resolve payer-specific prices
    let resolvedTotal = 0;
    for (const charge of checkInCharges) {
      let finalPrice = charge.price;
      if (charge.chargeMasterId) {
        try {
          const { resolvePrice } = require('../services/priceResolutionService');
          const resolved = await resolvePrice(charge.chargeMasterId, invoiceId, client);
          if (!resolved.isExcluded) {
            finalPrice = resolved.unitPrice;
          }
        } catch {
          // Fall back to cash rate if resolution fails
        }
      }

      await client.query(
        `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category)
         VALUES ($1, $2, $3, 1, $4, $4, $5)`,
        [
          invoiceId,
          charge.chargeMasterId,
          charge.description,
          finalPrice,
          charge.description.toLowerCase().includes('registration') ? 'registration' : 'consultation',
        ]
      );
      resolvedTotal += finalPrice;
    }

    // Update invoice total if payer-resolved prices differ
    if (resolvedTotal !== initialTotal) {
      await client.query(
        `UPDATE invoices SET subtotal = $1, total_amount = $1 WHERE id = $2`,
        [resolvedTotal, invoiceId]
      );
    }

    const registrationFee = resolvedTotal;

    // Get patient info for appointment and notification
    const patientInfoResult = await client.query(
      `SELECT u.first_name || ' ' || u.last_name as patient_name, p.patient_number
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [patient_id]
    );

    const patientInfo = patientInfoResult.rows[0] || {};

    // Check if this is a department walk-in (pharmacy, lab, or imaging)
    const departmentWalkIns: Record<string, string> = {
      'Pharmacy (OTC/Walk-in)': 'pharmacy',
      'Lab (Walk-in)': 'lab',
      'Imaging (Walk-in)': 'imaging',
    };

    const walkInDepartment = departmentWalkIns[clinic];

    if (walkInDepartment) {
      // Route directly to department as walk-in (no doctor/appointment needed)
      await client.query(
        `INSERT INTO department_routing (
          encounter_id, patient_id, department, priority, notes, routed_by, is_walk_in
        ) VALUES ($1, $2, $3, 'routine', $4, $5, true)`,
        [encounter.id, patient_id, walkInDepartment, chief_complaint || 'Walk-in', receptionist_id]
      );

      await client.query('COMMIT');

      // Notify department of new walk-in
      if (patientInfo.patient_name) {
        await notificationService.notifyDepartmentWalkIn(
          walkInDepartment,
          patientInfo.patient_name,
          patientInfo.patient_number,
          encounter.id
        );
      }

      res.status(201).json({
        message: `Patient checked in and routed to ${walkInDepartment}`,
        encounter_id: encounter.id,
        encounter_number: encounter.encounter_number,
        invoice_number: invoiceResult.rows[0].invoice_number,
        billing_amount: registrationFee,
        routed_to: walkInDepartment
      });
      return;
    }

    // Create a 30-minute appointment slot for walk-in patients
    const appointmentTime = new Date();
    const appointmentDuration = 30;
    const appointmentEnd = new Date(appointmentTime.getTime() + appointmentDuration * 60 * 1000);

    // Use the assigned provider for the appointment (receptionist chose or corporate default)
    const appointmentProviderId = assigned_provider_id;

    // Always create a walk-in appointment so the calendar shows the patient.
    // If a provider is assigned, check for scheduling conflicts first.
    let skipAppointment = false;
    if (appointmentProviderId) {
      const conflictCheck = await client.query(
        `SELECT id FROM appointments
         WHERE provider_id = $1
           AND status NOT IN ('cancelled', 'no-show')
           AND (
             (appointment_date <= $2 AND appointment_date + (duration_minutes || ' minutes')::interval > $2)
             OR (appointment_date < $3 AND appointment_date + (duration_minutes || ' minutes')::interval > $2)
             OR (appointment_date >= $2 AND appointment_date < $3)
           )`,
        [appointmentProviderId, appointmentTime, appointmentEnd]
      );
      if (conflictCheck.rows.length > 0) {
        skipAppointment = true; // conflict — still check in, just skip the appointment
      }
    }
    if (!skipAppointment) {
      await client.query(
        `INSERT INTO appointments (
          patient_id, patient_name, provider_id, appointment_date, duration_minutes,
          appointment_type, status, reason, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'checked-in', $7, $8)`,
        [
          patient_id,
          patientInfo.patient_name || null,
          appointmentProviderId || null,
          appointmentTime,
          appointmentDuration,
          encounter_type || 'walk-in',
          chief_complaint || 'Walk-in visit',
          receptionist_id,
        ]
      );
    }

    await client.query('COMMIT');

    // Notify all nurses that a new patient has checked in
    if (patientInfo.patient_name) {
      await notificationService.notifyPatientCheckedIn(patientInfo.patient_name, patientInfo.patient_number, encounter.id);
    }

    res.status(201).json({
      message: 'Patient checked in successfully',
      encounter: encounter,
      invoice: invoiceResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Receptionist: Assign room to patient
export const assignRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id, room_id } = req.body;

    // First, get the current room assignment to release it
    const currentEncounter = await pool.query(
      `SELECT room_id FROM encounters WHERE id = $1`,
      [encounter_id]
    );

    const oldRoomId = currentEncounter.rows[0]?.room_id;

    // Check if the room is already assigned to another active patient today
    const roomOccupied = await pool.query(
      `SELECT e.id, u.first_name || ' ' || u.last_name as patient_name
       FROM encounters e
       JOIN patients p ON e.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE e.room_id = $1
         AND e.id != $2
         AND e.status NOT IN ('completed', 'discharged', 'cancelled')
         AND DATE(e.encounter_date) = CURRENT_DATE
       LIMIT 1`,
      [room_id, encounter_id]
    );

    if (roomOccupied.rows.length > 0) {
      res.status(400).json({
        error: `Room is already occupied by ${roomOccupied.rows[0].patient_name}. Please release that patient first or choose another room.`
      });
      return;
    }

    // If patient was in a different room, mark old room as available
    if (oldRoomId && oldRoomId !== room_id) {
      await pool.query(
        `UPDATE rooms SET is_available = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [oldRoomId]
      );
    }

    // Mark new room as occupied
    await pool.query(
      `UPDATE rooms SET is_available = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [room_id]
    );

    // Update encounter with room
    const result = await pool.query(
      `UPDATE encounters SET room_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [room_id, encounter_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    res.json({
      message: 'Room assigned successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Assign room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Receptionist: Assign nurse to patient
export const assignNurse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id, nurse_id } = req.body;

    const result = await pool.query(
      `UPDATE encounters SET nurse_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [nurse_id, encounter_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    // Create alert for nurse
    await pool.query(
      `INSERT INTO alerts (encounter_id, patient_id, to_user_id, alert_type, message)
       SELECT $1, patient_id, $2, 'patient_ready',
         'New patient assigned to you in room ' || (SELECT room_number FROM rooms WHERE id = room_id)
       FROM encounters WHERE id = $1`,
      [encounter_id, nurse_id]
    );

    res.json({
      message: 'Nurse assigned successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Assign nurse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Receptionist: Assign doctor to encounter
export const assignDoctor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id, doctor_id } = req.body;

    const result = await pool.query(
      `UPDATE encounters SET provider_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [doctor_id, encounter_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    // Create alert for doctor
    await pool.query(
      `INSERT INTO alerts (encounter_id, patient_id, to_user_id, alert_type, message)
       SELECT $1, patient_id, $2, 'general',
         'Patient assigned to you' || COALESCE(' in room ' || (SELECT room_number FROM rooms WHERE id = room_id), '')
       FROM encounters WHERE id = $1`,
      [encounter_id, doctor_id]
    );

    res.json({
      message: 'Doctor assigned successfully',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Assign doctor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Start seeing patient
export const nurseStartEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.body;

    const result = await pool.query(
      `UPDATE encounters SET nurse_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [encounter_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    res.json({
      message: 'Nurse started encounter',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Nurse start encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Add vital signs
export const addVitalSigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const recorded_by = authReq.user?.id;
    const { encounter_id, vital_signs } = req.body;

    // Validate vital signs
    const validation = validateAllVitals(vital_signs);

    if (!validation.isValid) {
      res.status(400).json({
        error: 'Invalid vital signs',
        errors: validation.errors,
      });
      return;
    }

    const result = await pool.query(
      `UPDATE encounters SET vital_signs = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(vital_signs), encounter_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    // Also insert into vital_signs_history for tracking
    await pool.query(
      `INSERT INTO vital_signs_history (
        encounter_id, patient_id, recorded_by,
        temperature, temperature_unit,
        blood_pressure_systolic, blood_pressure_diastolic,
        heart_rate, respiratory_rate, oxygen_saturation,
        weight, weight_unit, height, height_unit,
        pain_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        encounter_id,
        result.rows[0].patient_id,
        recorded_by,
        vital_signs.temperature || null,
        vital_signs.temperature_unit || 'F',
        vital_signs.blood_pressure_systolic || null,
        vital_signs.blood_pressure_diastolic || null,
        vital_signs.heart_rate || null,
        vital_signs.respiratory_rate || null,
        vital_signs.oxygen_saturation || null,
        vital_signs.weight || null,
        vital_signs.weight_unit || 'lbs',
        vital_signs.height || null,
        vital_signs.height_unit || 'in',
        vital_signs.pain_level != null ? vital_signs.pain_level : null,
      ]
    );

    // Check for critical vitals and create alert if needed
    const isCritical = validation.criticalValues.length > 0;

    if (isCritical) {
      const criticalMessage = `Critical vital signs detected: ${validation.criticalValues.join(', ')}`;

      await pool.query(
        `INSERT INTO alerts (encounter_id, patient_id, to_user_id, alert_type, message)
         SELECT $1, patient_id, provider_id, 'vitals_critical', $2
         FROM encounters WHERE id = $1`,
        [encounter_id, criticalMessage]
      );
    }

    res.json({
      message: 'Vital signs added successfully',
      encounter: result.rows[0],
      warnings: validation.warnings,
      criticalValues: validation.criticalValues,
    });
  } catch (error) {
    console.error('Add vital signs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get vital signs history for a patient
export const getVitalSignsHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { limit = 20 } = req.query;

    const result = await pool.query(
      `SELECT
        vsh.*,
        e.encounter_number,
        CONCAT(u.first_name, ' ', u.last_name) as recorded_by_name
       FROM vital_signs_history vsh
       JOIN encounters e ON vsh.encounter_id = e.id
       LEFT JOIN users u ON vsh.recorded_by = u.id
       WHERE vsh.patient_id = $1
       ORDER BY vsh.recorded_at DESC
       LIMIT $2`,
      [patient_id, limit]
    );

    res.json({
      history: result.rows,
    });
  } catch (error) {
    console.error('Get vital signs history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Update triage priority
export const updateTriagePriority = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const nurse_id = authReq.user?.id;
    const { encounter_id, priority } = req.body;

    if (!['green', 'yellow', 'red'].includes(priority)) {
      res.status(400).json({ error: 'Priority must be green, yellow, or red' });
      return;
    }

    const result = await pool.query(
      `UPDATE encounters SET triage_priority = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id, triage_priority`,
      [priority, encounter_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    // If escalated to red, create alert for assigned doctor
    if (priority === 'red') {
      const enc = await pool.query(
        `SELECT provider_id, patient_id FROM encounters WHERE id = $1`,
        [encounter_id]
      );
      if (enc.rows[0]?.provider_id) {
        await pool.query(
          `INSERT INTO alerts (encounter_id, patient_id, from_user_id, to_user_id, alert_type, message)
           VALUES ($1, $2, $3, $4, 'critical_priority', 'Patient has been escalated to RED priority')`,
          [encounter_id, enc.rows[0].patient_id, nurse_id, enc.rows[0].provider_id]
        );
      }
    }

    await auditService.log({
      userId: nurse_id,
      action: 'update',
      entityType: 'encounter',
      entityId: encounter_id,
      details: { priority },
    });

    res.json({ message: 'Triage priority updated', priority });
  } catch (error) {
    console.error('Update triage priority error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Record medication administration
export const recordMedicationAdministration = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const nurse_id = authReq.user?.id;
    const { pharmacy_order_id, notes } = req.body;

    // Verify the order exists and is dispensed
    const orderResult = await pool.query(
      `SELECT po.*, e.patient_id FROM pharmacy_orders po
       JOIN encounters e ON po.encounter_id = e.id
       WHERE po.id = $1`,
      [pharmacy_order_id]
    );

    if (orderResult.rows.length === 0) {
      res.status(404).json({ error: 'Pharmacy order not found' });
      return;
    }

    const order = orderResult.rows[0];

    // Update pharmacy order with administration info
    await pool.query(
      `UPDATE pharmacy_orders
       SET status = 'completed',
           administered_by = $1,
           administered_at = CURRENT_TIMESTAMP,
           administration_notes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [nurse_id, notes || null, pharmacy_order_id]
    );

    await auditService.log({
      userId: nurse_id,
      action: 'complete',
      entityType: 'pharmacy_order',
      entityId: pharmacy_order_id,
      details: { medication_name: order.medication_name, patient_id: order.patient_id },
    });

    res.json({ message: 'Medication administration recorded' });
  } catch (error) {
    console.error('Record medication administration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Alert doctor that patient is ready
export const alertDoctor = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const nurse_id = authReq.user?.id;

    const { encounter_id, message } = req.body;

    // Get encounter details to find the doctor
    const encounterResult = await pool.query(
      `SELECT patient_id, provider_id FROM encounters WHERE id = $1`,
      [encounter_id]
    );

    if (encounterResult.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    const { patient_id, provider_id } = encounterResult.rows[0];

    // If no doctor assigned, require assignment first
    let doctor_id = provider_id;
    if (!doctor_id) {
      res.status(400).json({
        error: 'No doctor assigned to this encounter. Please ask the receptionist to assign a doctor first.'
      });
      return;
    }

    // Update encounter status to ready_for_doctor
    await pool.query(
      `UPDATE encounters
       SET status = 'ready_for_doctor',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [encounter_id]
    );

    const result = await pool.query(
      `INSERT INTO alerts (encounter_id, patient_id, from_user_id, to_user_id, alert_type, message)
       VALUES ($1, $2, $3, $4, 'ready_for_doctor', $5)
       RETURNING *`,
      [encounter_id, patient_id, nurse_id, doctor_id, message || 'Patient is ready for doctor']
    );

    res.status(201).json({
      message: 'Doctor alerted successfully',
      alert: result.rows[0],
    });
  } catch (error) {
    console.error('Alert doctor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Get notifications from doctors (only patients routed from doctor)
export const getNurseNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const nurse_id = authReq.user?.id;

    // Get alerts where the nurse is the recipient and the sender is a doctor
    // This only shows patients that doctors have routed back to the nurse
    const result = await pool.query(
      `SELECT DISTINCT ON (a.id)
        a.id,
        a.encounter_id,
        a.message,
        a.is_read,
        a.created_at,
        CONCAT(p_user.first_name, ' ', p_user.last_name) as patient_name,
        pat.patient_number,
        CONCAT(from_user.first_name, ' ', from_user.last_name) as doctor_name
       FROM alerts a
       JOIN encounters e ON a.encounter_id = e.id
       JOIN patients pat ON a.patient_id = pat.id
       LEFT JOIN users p_user ON pat.user_id = p_user.id
       JOIN users from_user ON a.from_user_id = from_user.id
       WHERE (a.to_user_id = $1 OR e.nurse_id = $1)
         AND from_user.role = 'doctor'
         AND a.alert_type IN ('patient_ready', 'follow_up_care')
         AND a.is_read = false
         AND e.status NOT IN ('completed', 'discharged')
       ORDER BY a.id, a.created_at DESC
       LIMIT 20`,
      [nurse_id]
    );

    res.json({
      notifications: result.rows,
    });
  } catch (error) {
    console.error('Get nurse notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Doctor: Start seeing patient
export const doctorStartEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.body;

    const result = await pool.query(
      `UPDATE encounters SET doctor_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [encounter_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    res.json({
      message: 'Doctor started encounter',
      encounter: result.rows[0],
    });
  } catch (error) {
    console.error('Doctor start encounter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get encounters by room for doctor view
export const getEncountersByRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId: number | undefined = authReq.user?.id;
    const isSuperAdmin: boolean = authReq.user?.is_super_admin === true;

    // Per-doctor scoping: regular doctors see only the encounters where
    // they are the listed provider. Super admins see every encounter for
    // the day so they can fill in for anyone. NULL provider encounters
    // (very rare — receptionist-created walk-ins that haven't been claimed)
    // are also visible to super admins.
    const providerFilter = isSuperAdmin ? '' : 'AND e.provider_id = $1';
    const queryParams = isSuperAdmin ? [] : [userId];
    const result = await pool.query(
      `SELECT e.*,
        r.room_number,
        r.room_name,
        p.patient_number,
        p.date_of_birth,
        p.gender,
        p.vip_status,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_nurse.first_name || ' ' || u_nurse.last_name as nurse_name,
        u_doctor.first_name || ' ' || u_doctor.last_name as doctor_name,
        p.allergies as patient_allergies,
        (SELECT json_agg(json_build_object('allergen', a.allergen, 'reaction', a.reaction, 'severity', a.severity))
         FROM allergies a WHERE a.patient_id = p.id) as allergies_list,
        EXISTS(
          SELECT 1 FROM alerts a
          WHERE a.encounter_id = e.id
          AND a.alert_type IN ('patient_ready', 'ready_for_doctor')
          AND a.is_read = false
        ) as has_nurse_alert
      FROM encounters e
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN users u_nurse ON e.nurse_id = u_nurse.id
      LEFT JOIN users u_doctor ON e.provider_id = u_doctor.id
      -- Doctor sees every patient under their care for the entire day,
      -- regardless of where the patient currently is in the workflow OR
      -- whether they've been checked out. Only filter out 'cancelled'
      -- (no-shows / true cancellations) — completed/discharged stay
      -- visible until midnight so the doctor can reopen for addenda or
      -- last-look review. checked_in is included too — patient is in the
      -- building, doctor should see them coming.
      WHERE DATE(e.encounter_date) = CURRENT_DATE
        AND e.status != 'cancelled'
        ${providerFilter}
      ORDER BY
        CASE
          WHEN p.vip_status = 'platinum' THEN 1
          WHEN p.vip_status = 'gold' THEN 2
          WHEN p.vip_status = 'silver' THEN 3
          ELSE 4
        END,
        r.room_number`,
      queryParams
    );

    // Fetch latest vital signs for each encounter from vital_signs_history
    // or use the vital_signs JSON column from encounters if available
    const encountersWithVitals = await Promise.all(
      result.rows.map(async (encounter) => {
        // First try to get from vital_signs_history table
        const vitalsResult = await pool.query(
          `SELECT * FROM vital_signs_history
           WHERE encounter_id = $1
           ORDER BY recorded_at DESC
           LIMIT 1`,
          [encounter.id]
        );

        const historyRow = vitalsResult.rows[0];
        // Check if history row has at least one actual vital value
        const historyHasData = historyRow && (
          historyRow.temperature != null ||
          historyRow.heart_rate != null ||
          historyRow.blood_pressure_systolic != null ||
          historyRow.respiratory_rate != null ||
          historyRow.oxygen_saturation != null ||
          historyRow.weight != null ||
          historyRow.height != null
        );

        // Parse encounter.vital_signs if it's somehow a string
        let encounterVitals = encounter.vital_signs;
        if (typeof encounterVitals === 'string') {
          try { encounterVitals = JSON.parse(encounterVitals); } catch { encounterVitals = null; }
        }

        // Prefer history row with actual data, then JSONB column, then null
        const vitalSigns = historyHasData ? historyRow : encounterVitals || null;

        return {
          ...encounter,
          vital_signs: vitalSigns,
        };
      })
    );

    res.json({
      encounters: encountersWithVitals,
    });
  } catch (error: any) {
    console.error('Get encounters by room error:', error);
    res.status(500).json({ error: 'Failed to load patient list', detail: error.message });
  }
};

// Get all available rooms
export const getAvailableRooms = async (req: Request, res: Response): Promise<void> => {
  try {
    // Auto-release stale rooms: any room held by an encounter that's been
    // discharged OR whose encounter_date is >24h ago with no doctor activity.
    // This prevents "occupied ghost" rooms from accumulating.
    await pool.query(`
      UPDATE rooms SET is_available = true, updated_at = CURRENT_TIMESTAMP
       WHERE is_available = false
         AND id NOT IN (
           SELECT DISTINCT e.room_id FROM encounters e
            WHERE e.room_id IS NOT NULL
              AND e.status NOT IN ('discharged', 'cancelled')
              AND e.encounter_date >= NOW() - INTERVAL '24 hours'
         )
    `);

    // Also null out room_id on encounters that are discharged but still
    // reference a room (belt-and-suspenders with the above).
    await pool.query(`
      UPDATE encounters SET room_id = NULL
       WHERE status IN ('discharged', 'cancelled')
         AND room_id IS NOT NULL
    `);

    const result = await pool.query(
      `SELECT * FROM rooms ORDER BY room_number`
    );

    res.json({
      rooms: result.rows,
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get nurses for assignment
export const getAvailableNurses = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, phone
       FROM users
       WHERE role = 'nurse' AND is_active = true
       ORDER BY first_name, last_name`
    );

    res.json({
      nurses: result.rows,
    });
  } catch (error) {
    console.error('Get nurses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get doctors for PCP assignment
export const getAvailableDoctors = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, phone
       FROM users
       WHERE role = 'doctor' AND is_active = true
       ORDER BY first_name, last_name`
    );

    res.json({
      doctors: result.rows,
    });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get patient queue with color coding - includes all patients for the day
export const getPatientQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get patient queue with accurate workflow status that considers:
    // 1. Encounter status (completed, with_nurse after doctor completes)
    // 2. Pending lab, pharmacy, imaging orders
    // 3. Current stage based on timestamps
    const result = await pool.query(
      `SELECT e.*,
        e.checked_in_at as check_in_time,
        r.room_number,
        p.patient_number,
        p.date_of_birth,
        p.vip_status,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_patient.phone as patient_phone,
        u_nurse.first_name || ' ' || u_nurse.last_name as nurse_name,
        u_doctor.first_name || ' ' || u_doctor.last_name as doctor_name,
        i.status as invoice_status,
        i.total_amount as billing_amount,
        -- Count allergies for this patient
        COALESCE((SELECT COUNT(*) FROM allergies a WHERE a.patient_id = p.id), 0) as allergies_count,
        -- Count past visits (excluding current encounter)
        COALESCE((SELECT COUNT(*) FROM encounters e2 WHERE e2.patient_id = p.id AND e2.id != e.id), 0) as visit_count,
        -- Calculate outstanding balance from unpaid invoices
        COALESCE((SELECT SUM(inv.total_amount - COALESCE(inv.amount_paid, 0)) FROM invoices inv WHERE inv.patient_id = p.id AND inv.status IN ('pending', 'partial')), 0) as outstanding_balance,
        CASE
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - e.triage_time)) / 60 < 15 THEN 'green'
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - e.triage_time)) / 60 < 30 THEN 'yellow'
          ELSE 'red'
        END as current_priority,
        -- Count pending orders for each department
        COALESCE((SELECT COUNT(*) FROM lab_orders lo WHERE lo.encounter_id = e.id AND lo.status IN ('pending', 'in_progress')), 0) as pending_lab_orders,
        COALESCE((SELECT COUNT(*) FROM pharmacy_orders po WHERE po.encounter_id = e.id AND po.status IN ('pending', 'in_progress')), 0) as pending_pharmacy_orders,
        COALESCE((SELECT COUNT(*) FROM imaging_orders io WHERE io.encounter_id = e.id AND io.status IN ('pending', 'in_progress')), 0) as pending_imaging_orders,
        CASE
          WHEN e.status = 'completed' THEN 'completed'
          WHEN e.status = 'discharged' THEN 'discharged'
          -- Check department_routing for physical location (pending = patient is there)
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'lab' AND dr.status = 'pending') THEN 'at_lab'
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'imaging' AND dr.status = 'pending') THEN 'at_imaging'
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'pharmacy' AND dr.status = 'pending') THEN 'at_pharmacy'
          -- Check if routed to receptionist (ready for checkout)
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'receptionist' AND dr.status = 'pending') THEN 'ready_for_checkout'
          WHEN e.doctor_completed_at IS NOT NULL THEN 'ready_for_checkout'
          WHEN e.status = 'with_doctor' THEN 'with_doctor'
          WHEN e.status = 'ready_for_doctor' THEN 'ready_for_doctor'
          WHEN e.status = 'with_nurse' THEN 'with_nurse'
          WHEN e.doctor_started_at IS NOT NULL AND e.doctor_completed_at IS NULL THEN 'with_doctor'
          WHEN e.nurse_started_at IS NOT NULL THEN 'with_nurse'
          WHEN e.nurse_id IS NOT NULL THEN 'waiting_for_nurse'
          WHEN e.room_id IS NOT NULL THEN 'in_room'
          ELSE 'checked_in'
        END as workflow_status
      FROM encounters e
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN users u_nurse ON e.nurse_id = u_nurse.id
      LEFT JOIN users u_doctor ON e.provider_id = u_doctor.id
      LEFT JOIN invoices i ON i.encounter_id = e.id
      WHERE DATE(e.checked_in_at) = CURRENT_DATE
        AND e.status != 'cancelled'
      ORDER BY
        CASE e.status
          WHEN 'in-progress' THEN 1
          WHEN 'with_nurse' THEN 2
          WHEN 'with_doctor' THEN 3
          WHEN 'ready_for_doctor' THEN 4
          WHEN 'completed' THEN 8
          WHEN 'discharged' THEN 9
          ELSE 5
        END,
        e.triage_time`
    );

    res.json({
      queue: result.rows,
    });
  } catch (error) {
    console.error('Get patient queue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get encounters assigned to a specific nurse
export const getNurseAssignedPatients = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const nurse_id = authReq.user?.id;

    const result = await pool.query(
      `SELECT e.*,
        r.room_number,
        r.room_name,
        p.patient_number,
        p.date_of_birth,
        p.gender,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        CASE
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - e.triage_time)) / 60 < 15 THEN 'green'
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - e.triage_time)) / 60 < 30 THEN 'yellow'
          ELSE 'red'
        END as current_priority,
        CASE WHEN e.status = 'with_nurse' THEN true ELSE false END as from_doctor,
        -- Get current location based on department routing
        (SELECT dr.department FROM department_routing dr
         WHERE dr.encounter_id = e.id AND dr.status = 'pending'
         ORDER BY dr.created_at DESC LIMIT 1) as current_department,
        CASE
          WHEN e.status IN ('completed', 'discharged') THEN 'checked_out'
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'lab' AND dr.status = 'pending') THEN 'at_lab'
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'imaging' AND dr.status = 'pending') THEN 'at_imaging'
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'pharmacy' AND dr.status = 'pending') THEN 'at_pharmacy'
          WHEN EXISTS (SELECT 1 FROM department_routing dr WHERE dr.encounter_id = e.id AND dr.department = 'receptionist' AND dr.status = 'pending') THEN 'ready_for_checkout'
          WHEN e.status = 'with_doctor' THEN 'with_doctor'
          WHEN e.status = 'ready_for_doctor' THEN 'waiting_for_doctor'
          WHEN e.status = 'with_nurse' THEN 'with_nurse'
          WHEN e.vital_signs IS NOT NULL THEN 'vitals_complete'
          WHEN e.room_id IS NOT NULL THEN 'in_room'
          ELSE 'checked_in'
        END as workflow_status,
        (e.status IN ('completed', 'discharged')) as is_checked_out
      FROM encounters e
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      -- Only show today's patients. Active encounters from yesterday should
      -- not appear — they need to be completed/discharged first.
      -- Deduplicate by patient_id so the same patient never appears twice.
      WHERE e.nurse_id = $1
        AND e.encounter_date::date = CURRENT_DATE
        AND e.status NOT IN ('cancelled')
      ORDER BY
        CASE WHEN e.status IN ('completed', 'discharged') THEN 2 ELSE 0 END,
        CASE WHEN e.status = 'with_nurse' THEN 0 ELSE 1 END,
        e.doctor_completed_at DESC NULLS LAST,
        e.triage_time DESC`,
      [nurse_id]
    );

    // Fetch latest vital signs from vital_signs_history for each encounter
    // (same logic as getEncountersByRoom so nurse and doctor see the same data)
    const patientsWithVitals = await Promise.all(
      result.rows.map(async (encounter) => {
        const vitalsResult = await pool.query(
          `SELECT * FROM vital_signs_history
           WHERE encounter_id = $1
           ORDER BY recorded_at DESC
           LIMIT 1`,
          [encounter.id]
        );
        const historyRow = vitalsResult.rows[0];
        const historyHasData = historyRow && (
          historyRow.temperature != null ||
          historyRow.heart_rate != null ||
          historyRow.blood_pressure_systolic != null ||
          historyRow.respiratory_rate != null ||
          historyRow.oxygen_saturation != null ||
          historyRow.weight != null ||
          historyRow.height != null
        );
        let encounterVitals = encounter.vital_signs;
        if (typeof encounterVitals === 'string') {
          try { encounterVitals = JSON.parse(encounterVitals); } catch { encounterVitals = null; }
        }
        const vitalSigns = historyHasData ? historyRow : encounterVitals || null;
        return { ...encounter, vital_signs: vitalSigns };
      })
    );

    res.json({
      patients: patientsWithVitals,
    });
  } catch (error) {
    console.error('Get nurse assigned patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Doctor: Complete encounter and send back to nurse
export const doctorCompleteEncounter = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const doctor_id = authReq.user?.id;
    const { encounter_id, follow_up_required, follow_up_timeframe, follow_up_reason, review_required, review_date, review_reason } = req.body;

    // Get encounter details to find nurse_id and patient_id
    const encounterResult = await pool.query(
      `SELECT e.nurse_id, e.patient_id, r.room_number,
              u.first_name || ' ' || u.last_name as patient_name
       FROM encounters e
       LEFT JOIN rooms r ON e.room_id = r.id
       LEFT JOIN patients p ON e.patient_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE e.id = $1`,
      [encounter_id]
    );

    if (encounterResult.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    const { nurse_id, patient_id, room_number, patient_name } = encounterResult.rows[0];

    // Update encounter status to 'with_nurse' - patient goes back to nurse
    // Include follow-up data if provided
    await pool.query(
      `UPDATE encounters
       SET status = 'with_nurse',
           doctor_completed_at = CURRENT_TIMESTAMP,
           follow_up_required = COALESCE($2, false),
           follow_up_timeframe = $3,
           follow_up_reason = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [encounter_id, follow_up_required || false, follow_up_timeframe || null, follow_up_reason || null]
    );

    // Create alert for nurse that patient is ready for follow-up
    if (nurse_id) {
      await pool.query(
        `INSERT INTO alerts (encounter_id, patient_id, from_user_id, to_user_id, alert_type, message)
         VALUES ($1, $2, $3, $4, 'follow_up_care', $5)`,
        [
          encounter_id,
          patient_id,
          doctor_id,
          nurse_id,
          `Patient ${patient_name || ''} in Room ${room_number || 'N/A'} is ready for follow-up care`
        ]
      );
    }

    // If doctor marks for review, create a review task (replaces auto follow-up at checkout)
    if (review_required && review_date && patient_id) {
      await pool.query(
        `INSERT INTO nurse_follow_up_tasks (encounter_id, patient_id, type, scheduled_date, review_requested_by, review_reason)
         VALUES ($1, $2, 'review', $3, $4, $5)`,
        [encounter_id, patient_id, review_date, doctor_id, review_reason || null]
      );
    }

    // If doctor schedules a follow-up visit, auto-create an appointment so it
    // lands on the receptionist's calendar without manual scheduling. Date is
    // computed from the timeframe (e.g. "2 weeks" → today + 14d). The nurse
    // can later reschedule via /workflow/follow-up/reschedule.
    if (follow_up_required && follow_up_timeframe && patient_id) {
      const timeframeDays: Record<string, number> = {
        '1 week':  7,
        '2 weeks': 14,
        '3 weeks': 21,
        '4 weeks': 28,
        '1 month': 30,
        '2 months': 60,
        '3 months': 90,
        '6 months': 180,
      };
      const days = timeframeDays[follow_up_timeframe] ?? 14;
      const apptDate = new Date();
      apptDate.setDate(apptDate.getDate() + days);
      // Default to 10:00 local time so it doesn't collide at midnight
      apptDate.setHours(10, 0, 0, 0);

      try {
        await pool.query(
          `INSERT INTO appointments
             (patient_id, provider_id, appointment_date, duration_minutes,
              appointment_type, reason, notes, created_by, status)
           VALUES ($1, $2, $3, 30, 'follow_up', $4, $5, $6, 'scheduled')`,
          [
            patient_id,
            doctor_id,
            apptDate,
            follow_up_reason || 'Follow-up visit',
            `Auto-scheduled follow-up for encounter ${encounter_id}. Reason: ${follow_up_reason || 'follow-up care'}`,
            doctor_id,
          ]
        );
      } catch (apptErr) {
        // Non-fatal — encounter completes even if appointment creation fails
        console.error('Auto-appointment creation failed:', apptErr);
      }
    }

    res.json({
      message: review_required
        ? 'Encounter completed. Review call scheduled for nurse.'
        : follow_up_required
        ? 'Encounter completed. Patient sent back to nurse. Follow-up visit scheduled.'
        : 'Encounter completed. Patient sent back to nurse.',
      follow_up_required: follow_up_required || false,
      review_required: review_required || false,
    });
  } catch (error) {
    console.error('Doctor complete encounter error:', error);
    res.status(500).json({ error: 'Failed to complete encounter', detail: (error as any).message });
  }
};

// Lab / Pharmacy / Imaging: hand patient back to the nurse so the nurse
// can decide what's next (more orders, send to another department, or
// final checkout). Does NOT release the room, does NOT close the
// encounter, does NOT generate an invoice. Just clears the department's
// routing rows and notifies the nurse(s).
export const releaseToNurse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id, from_department } = req.body || {};
    if (!encounter_id) {
      res.status(400).json({ error: 'encounter_id is required' });
      return;
    }
    const validDepartments = ['lab', 'pharmacy', 'imaging'];
    if (!validDepartments.includes(from_department)) {
      res.status(400).json({ error: 'from_department must be lab, pharmacy, or imaging' });
      return;
    }

    // Pull patient context first — we need patient_id for the possible INSERT
    // below, and we want to fail fast if the encounter doesn't exist before
    // doing any writes.
    const ctx = await pool.query(
      `SELECT p.id AS patient_id, p.patient_number,
              u.first_name || ' ' || u.last_name AS patient_name,
              e.clinic
         FROM encounters e
         JOIN patients p ON e.patient_id = p.id
         JOIN users u ON p.user_id = u.id
        WHERE e.id = $1`,
      [encounter_id]
    );
    if (ctx.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }
    const { patient_id, patient_name, patient_number, clinic: encounterClinic } = ctx.rows[0];
    const isWalkIn = ['Lab (Walk-in)', 'Imaging (Walk-in)', 'Pharmacy (OTC/Walk-in)'].includes(encounterClinic);

    // Mark all open routing entries for this department + encounter as done.
    const updateResult = await pool.query(
      `UPDATE department_routing
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
       WHERE encounter_id = $1
         AND department = $2
         AND status IN ('pending', 'in-progress')`,
      [encounter_id, from_department]
    );

    // If no pending/in-progress routing row existed (e.g. the encounter was
    // a direct walk-in or doctor-initiated order that skipped the routing
    // layer entirely), insert a synthetic 'completed' row so downstream
    // queries (the dispensed list's `routed_back_to_nurse` flag, the doctor
    // dashboard's auto-routing alert) can tell this encounter has been
    // handed back to nurse.
    if (updateResult.rowCount === 0) {
      const existing = await pool.query(
        `SELECT 1 FROM department_routing
          WHERE encounter_id = $1 AND department = $2 AND status = 'completed'
          LIMIT 1`,
        [encounter_id, from_department]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO department_routing
             (encounter_id, patient_id, department, status, completed_at)
           VALUES ($1, $2, $3, 'completed', CURRENT_TIMESTAMP)`,
          [encounter_id, patient_id, from_department]
        );
      }
    }

    // Lab-specific failsafe: when the lab tech sends the patient back to
    // nurse, sweep every non-cancelled lab_order for this encounter and make
    // sure each has a billed invoice_item. Covers the edge cases where a
    // lab order ended up in a half-done state (entered but not finalised,
    // verified but stuck in-progress, etc.) and never auto-billed via
    // runLabCompletionSideEffects. Idempotent — the existence check on
    // invoice_items.description prevents double-billing on repeat clicks.
    let labsBilled = 0;
    if (from_department === 'lab') {
      const invoiceRow = await pool.query(
        `SELECT id FROM invoices WHERE encounter_id = $1 LIMIT 1`,
        [encounter_id]
      );
      if (invoiceRow.rows.length > 0) {
        const invoiceId = invoiceRow.rows[0].id;

        const labs = await pool.query(
          `SELECT id, test_code, test_name, status
             FROM lab_orders
            WHERE encounter_id = $1
              AND status != 'cancelled'`,
          [encounter_id]
        );

        for (const lo of labs.rows) {
          // Price from the lab catalog (single source of truth): code → name → fuzzy.
          const labItem = await resolveLabCatalogItem(lo.test_code, lo.test_name);
          const chargeDescription = labItem.match ? labItem.match.test_name : lo.test_name;
          const labPrice = labItem.match ? Number(labItem.match.base_price) : 0;
          const description = `Lab: ${chargeDescription}`;
          if (!labItem.match) {
            console.warn(`⚠️ Route-from-lab billing: no catalog match for "${lo.test_name}" (code ${lo.test_code}) — billed 0, review.`);
          }

          // Dedup by the canonical catalog name so the same test isn't billed twice.
          const existing = await pool.query(
            `SELECT id FROM invoice_items WHERE invoice_id = $1 AND description = $2`,
            [invoiceId, description]
          );
          if (existing.rows.length > 0) continue;

          await pool.query(
            `INSERT INTO invoice_items
               (invoice_id, charge_master_id, description, quantity, unit_price, total_price, category)
             VALUES ($1, NULL, $2, 1, $3, $3, 'lab')`,
            [invoiceId, description, labPrice]
          );
          await pool.query(
            `UPDATE invoices
                SET subtotal     = subtotal + $2,
                    total_amount = total_amount + $2,
                    updated_at   = CURRENT_TIMESTAMP
              WHERE id = $1`,
            [invoiceId, labPrice]
          );
          labsBilled++;
        }
      }
    }

    const deptLabel: Record<string, string> = {
      lab: 'lab',
      pharmacy: 'pharmacy',
      imaging: 'imaging',
    };

    if (isWalkIn) {
      // Walk-in patients go straight to receptionist for checkout
      await pool.query(
        `UPDATE encounters SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [encounter_id]
      );
      await notificationService.sendToRole('receptionist', {
        type: 'patient_alert',
        title: `Walk-in ready for checkout`,
        message: `${patient_name} (${patient_number}) has completed ${deptLabel[from_department]} walk-in and is ready for checkout.`,
        entityType: 'encounter',
        entityId: encounter_id,
      });
    } else {
      await notificationService.sendToRole('nurse', {
        type: 'patient_alert',
        title: `Back from ${deptLabel[from_department]}`,
        message: `${patient_name} (${patient_number}) is back from ${deptLabel[from_department]} and needs follow-up.`,
        entityType: 'encounter',
        entityId: encounter_id,
      });
    }

    res.json({
      message: isWalkIn ? `Walk-in patient sent to receptionist for checkout` : `Patient sent back to nurse from ${from_department}`,
      patient_name,
      patient_number,
      labs_billed: labsBilled,
      is_walk_in: isWalkIn,
    });
  } catch (error) {
    console.error('Release to nurse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse: Release room when patient workflow is complete
export const releaseRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const user_id = authReq.user?.id;
    const { encounter_id, release_only } = req.body;

    // Get encounter details including room_id, patient info
    const encounterResult = await pool.query(
      `SELECT e.room_id, e.patient_id, r.room_number,
              u.first_name || ' ' || u.last_name as patient_name,
              p.patient_number
       FROM encounters e
       LEFT JOIN rooms r ON e.room_id = r.id
       LEFT JOIN patients p ON e.patient_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE e.id = $1`,
      [encounter_id]
    );

    if (encounterResult.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    const { room_id, patient_id, room_number, patient_name, patient_number } = encounterResult.rows[0];

    // Always release the room if it exists
    if (room_id) {
      await pool.query(
        `UPDATE rooms SET is_available = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [room_id]
      );
    }

    // Also clear the room_id from the encounter so the patient no longer shows in that room
    await pool.query(
      `UPDATE encounters SET room_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [encounter_id]
    );

    // If release_only is true, just release the room without completing the encounter
    if (release_only) {
      res.json({
        message: 'Room released successfully',
      });
      return;
    }

    // Complete the encounter
    await pool.query(
      `UPDATE encounters SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [encounter_id]
    );

    // Auto-generate final invoice
    let billingResult = null;
    try {
      billingResult = await billingService.generateEncounterInvoice(encounter_id);
    } catch (billingError) {
      console.error('Error generating invoice:', billingError);
    }

    // Audit log for encounter completion
    await auditService.log({
      userId: user_id,
      action: 'complete',
      entityType: 'encounter',
      entityId: encounter_id,
      details: { patient_id, room_id, invoiceTotal: billingResult?.total }
    });

    // Create alert for all receptionists that patient is ready for billing/checkout
    await pool.query(
      `INSERT INTO alerts (encounter_id, patient_id, from_user_id, to_user_id, alert_type, message)
       SELECT $1, $2, $3, u.id, 'ready_for_checkout', $4
       FROM users u
       WHERE u.role = 'receptionist' AND u.is_active = true`,
      [
        encounter_id,
        patient_id,
        user_id,
        `Patient ${patient_name || ''} (${patient_number || 'N/A'}) is ready for billing. Room ${room_number || 'N/A'} has been released.`
      ]
    );

    // Send real-time notification to all receptionists
    await notificationService.notifyReadyForCheckout(patient_name || '', patient_number || '', encounter_id);

    res.json({
      message: 'Room released and encounter completed successfully',
      invoice: billingResult,
    });
  } catch (error) {
    console.error('Release room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get completed encounters with search and date filtering (for Past Patients view)
export const getCompletedEncounters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, date_from, date_to, page = 1, limit = 10, sort_field = 'encounter_date', sort_order = 'desc' } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT e.*,
        p.patient_number,
        p.gender,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_provider.first_name || ' ' || u_provider.last_name as provider_name,
        r.room_number
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN users u_provider ON e.provider_id = u_provider.id
      LEFT JOIN rooms r ON e.room_id = r.id
      WHERE e.status = 'completed'
    `;

    const params: any[] = [];
    let paramCount = 1;

    // Add search filter for patient name or patient number
    if (search) {
      query += ` AND (
        LOWER(u_patient.first_name || ' ' || u_patient.last_name) LIKE LOWER($${paramCount})
        OR LOWER(p.patient_number) LIKE LOWER($${paramCount})
        OR LOWER(e.encounter_number) LIKE LOWER($${paramCount})
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Add date range filters
    if (date_from) {
      query += ` AND e.encounter_date >= $${paramCount}`;
      params.push(date_from);
      paramCount++;
    }

    if (date_to) {
      query += ` AND e.encounter_date <= $${paramCount}`;
      params.push(date_to);
      paramCount++;
    }

    // Get total count for pagination
    const countQuery = query.replace(
      /SELECT e\.\*.*?FROM encounters e/s,
      'SELECT COUNT(*) FROM encounters e'
    );
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Map sort fields to actual column names
    const sortFieldMap: { [key: string]: string } = {
      'encounter_date': 'e.encounter_date',
      'patient_name': 'patient_name',
      'clinic': 'e.clinic',
      'provider_name': 'provider_name',
      'gender': 'p.gender',
    };

    const sortColumn = sortFieldMap[sort_field as string] || 'e.encounter_date';
    const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';

    // Add ordering and pagination
    query += ` ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, e.completed_at DESC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      encounters: result.rows,
      total: totalCount,
      page: Number(page),
      totalPages: Math.ceil(totalCount / Number(limit)),
    });
  } catch (error) {
    console.error('Get completed encounters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Receptionist: Get billing alerts for completed encounters
export const getReceptionistAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const receptionist_id = authReq.user?.id;

    // Auto-dismiss all old alerts (not from today) and paid invoices
    await pool.query(
      `UPDATE alerts SET is_read = true
       WHERE is_read = false
         AND alert_type IN ('patient_ready', 'ready_for_checkout')
         AND (
           DATE(created_at) < CURRENT_DATE
           OR encounter_id IN (
             SELECT i.encounter_id FROM invoices i
             WHERE i.status = 'paid'
               OR (i.total_amount - COALESCE(i.amount_paid, 0)) <= 0
           )
         )`
    );

    // Get today's unread checkout alerts for this receptionist
    const result = await pool.query(
      `SELECT a.*,
              e.encounter_number,
              e.clinic,
              u_patient.first_name || ' ' || u_patient.last_name as patient_name,
              p.patient_number,
              from_user.first_name || ' ' || from_user.last_name as from_user_name,
              r.room_number
       FROM alerts a
       JOIN encounters e ON a.encounter_id = e.id
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN users u_patient ON p.user_id = u_patient.id
       LEFT JOIN users from_user ON a.from_user_id = from_user.id
       LEFT JOIN rooms r ON e.room_id = r.id
       LEFT JOIN invoices i ON i.encounter_id = e.id
       WHERE a.to_user_id = $1
         AND a.is_read = false
         AND a.alert_type IN ('patient_ready', 'ready_for_checkout')
         AND DATE(a.created_at) = CURRENT_DATE
         AND e.status IN ('completed', 'discharged')
         AND (i.id IS NULL OR i.status != 'paid')
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [receptionist_id]
    );

    res.json({
      alerts: result.rows,
    });
  } catch (error) {
    console.error('Get receptionist alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Receptionist: Mark alert as read
export const markAlertAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const user_id = authReq.user?.id;
    const { alert_id } = req.params;

    await pool.query(
      `UPDATE alerts SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND to_user_id = $2`,
      [alert_id, user_id]
    );

    res.json({ message: 'Alert marked as read' });
  } catch (error) {
    console.error('Mark alert as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Full details for a single alert — used by the nurse dashboard modal that
// pops when the nurse clicks a Doctor Notification. Returns the alert
// itself plus the related encounter's follow-up state, the doctor's notes
// (chief complaint, plan), the doctor's review-call task if any, and any
// auto-created follow-up appointment so the nurse sees the whole context
// without bouncing between tabs.
export const getAlertDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { alert_id } = req.params;

    const alertRow = await pool.query(
      `SELECT a.id, a.encounter_id, a.patient_id, a.from_user_id, a.to_user_id,
              a.alert_type, a.message, a.is_read, a.read_at, a.created_at,
              u_from.first_name || ' ' || u_from.last_name AS from_user_name,
              u_to.first_name   || ' ' || u_to.last_name   AS to_user_name,
              u_pat.first_name  || ' ' || u_pat.last_name  AS patient_name,
              p.patient_number
         FROM alerts a
         LEFT JOIN users u_from ON a.from_user_id = u_from.id
         LEFT JOIN users u_to   ON a.to_user_id   = u_to.id
         LEFT JOIN patients p   ON a.patient_id   = p.id
         LEFT JOIN users u_pat  ON p.user_id      = u_pat.id
        WHERE a.id = $1`,
      [alert_id]
    );

    if (alertRow.rows.length === 0) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    const alert = alertRow.rows[0];

    let encounter: any = null;
    let followUpAppointment: any = null;
    let reviewTask: any = null;

    if (alert.encounter_id) {
      const encResult = await pool.query(
        `SELECT id, encounter_number, encounter_date, chief_complaint,
                assessment, plan, status,
                follow_up_required, follow_up_timeframe, follow_up_reason
           FROM encounters
          WHERE id = $1`,
        [alert.encounter_id]
      );
      encounter = encResult.rows[0] || null;

      // Find the auto-created follow-up appointment if any
      const apptResult = await pool.query(
        `SELECT id, appointment_date, reason, notes, status
           FROM appointments
          WHERE patient_id = $1
            AND notes ILIKE '%encounter ' || $2 || '%'
          ORDER BY appointment_date ASC
          LIMIT 1`,
        [alert.patient_id, alert.encounter_id]
      );
      followUpAppointment = apptResult.rows[0] || null;

      const reviewResult = await pool.query(
        `SELECT nft.id, nft.scheduled_date, nft.review_reason, nft.status,
                u_rev.first_name || ' ' || u_rev.last_name AS review_requested_by_name
           FROM nurse_follow_up_tasks nft
           LEFT JOIN users u_rev ON nft.review_requested_by = u_rev.id
          WHERE nft.encounter_id = $1 AND nft.type = 'review'
          ORDER BY nft.created_at DESC
          LIMIT 1`,
        [alert.encounter_id]
      );
      reviewTask = reviewResult.rows[0] || null;
    }

    res.json({
      alert,
      encounter,
      follow_up_appointment: followUpAppointment,
      review_task: reviewTask,
    });
  } catch (error) {
    console.error('Get alert details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Nurse reschedules either the follow-up appointment date or the review-call
// scheduled date. Accepts EITHER appointment_id+new_date OR follow_up_task_id+new_date.
// Same endpoint covers both because the modal triggers from one place.
export const rescheduleFollowUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { appointment_id, follow_up_task_id, new_date } = req.body;

    if (!new_date) {
      res.status(400).json({ error: 'new_date is required' });
      return;
    }
    if (!appointment_id && !follow_up_task_id) {
      res.status(400).json({ error: 'Either appointment_id or follow_up_task_id is required' });
      return;
    }

    if (appointment_id) {
      const r = await pool.query(
        `UPDATE appointments SET appointment_date = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 RETURNING *`,
        [new_date, appointment_id]
      );
      if (r.rows.length === 0) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }
      res.json({ message: 'Appointment rescheduled', appointment: r.rows[0] });
      return;
    }

    // follow_up_task_id
    const r = await pool.query(
      `UPDATE nurse_follow_up_tasks
          SET scheduled_date = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND status = 'pending'
        RETURNING *`,
      [new_date, follow_up_task_id]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Follow-up task not found or already completed' });
      return;
    }
    res.json({ message: 'Review call rescheduled', task: r.rows[0] });
  } catch (error) {
    console.error('Reschedule follow-up error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Receptionist: Checkout patient - closes the entire flow
export const checkoutPatient = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const authReq = req as any;
    const user_id = authReq.user?.id;
    const { encounter_id } = req.body;

    await client.query('BEGIN');

    // Get encounter details including room_id, patient info
    const encounterResult = await client.query(
      `SELECT e.id, e.room_id, e.patient_id, e.status, e.provider_id,
              r.room_number,
              u.first_name || ' ' || u.last_name as patient_name,
              p.patient_number
       FROM encounters e
       LEFT JOIN rooms r ON e.room_id = r.id
       LEFT JOIN patients p ON e.patient_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE e.id = $1`,
      [encounter_id]
    );

    if (encounterResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    const { room_id, patient_id, patient_name, patient_number } = encounterResult.rows[0];

    // Prevent checkout if doctor has unsigned clinical notes for this encounter
    const unsignedNotes = await client.query(
      `SELECT COUNT(*) FROM clinical_notes WHERE encounter_id = $1 AND is_signed = false`,
      [encounter_id]
    );
    if (parseInt(unsignedNotes.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        error: 'Cannot checkout patient — doctor has unsigned clinical notes for this encounter'
      });
      return;
    }

    // Release room if patient is still in one
    if (room_id) {
      await client.query(
        `UPDATE rooms SET is_available = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [room_id]
      );
    }

    // Mark the encounter as discharged (fully checked out)
    await client.query(
      `UPDATE encounters
       SET status = 'discharged',
           room_id = NULL,
           discharged_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [encounter_id]
    );

    // Mark all alerts for this encounter as read
    await client.query(
      `UPDATE alerts SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE encounter_id = $1 AND is_read = false`,
      [encounter_id]
    );

    // Audit log for checkout
    await auditService.log({
      userId: user_id,
      action: 'checkout',
      entityType: 'encounter',
      entityId: encounter_id,
      details: { patient_id, patient_name, patient_number }
    });

    // Auto-create follow-up call task (if doctor saw the patient and no review already exists)
    const { provider_id } = encounterResult.rows[0];
    if (provider_id && patient_id) {
      const existingReview = await client.query(
        `SELECT id FROM nurse_follow_up_tasks WHERE encounter_id = $1 AND type = 'review'`,
        [encounter_id]
      );
      if (existingReview.rows.length === 0) {
        const scheduledDate = getNextMonOrThu();
        await client.query(
          `INSERT INTO nurse_follow_up_tasks (encounter_id, patient_id, type, scheduled_date)
           VALUES ($1, $2, 'follow_up', $3)
           ON CONFLICT DO NOTHING`,
          [encounter_id, patient_id, scheduledDate]
        );
      }
    }

    await client.query('COMMIT');

    // Notify all receptionists that patient has been checked out
    await notificationService.notifyPatientCheckedOut(patient_name || '', patient_number || '');

    res.json({
      message: `Patient ${patient_name || ''} has been checked out successfully`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Checkout patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};
