import { Request, Response } from 'express';
import pool from '../database/db';
import { validateAllVitals } from '../utils/vitalSignsValidation';
import billingService from '../services/billingService';
import auditService from '../services/auditService';
import notificationService from '../services/notificationService';

// Receptionist: Check-in patient and create encounter
export const checkInPatient = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const authReq = req as any;
    const receptionist_id = authReq.user?.id;

    const { patient_id, chief_complaint, encounter_type, billing_amount, clinic } = req.body;

    await client.query('BEGIN');

    // Check if patient already has an active encounter today (prevent duplicate check-ins)
    const activeEncounterCheck = await client.query(
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

    let assigned_provider_id = null;
    if (payerSourceResult.rows.length > 0 && payerSourceResult.rows[0].assigned_doctor_id) {
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
    const encounterCountResult = await client.query(
      `SELECT COUNT(*) FROM encounters WHERE patient_id = $1`,
      [patient_id]
    );
    const isNewPatient = parseInt(encounterCountResult.rows[0].count) === 1;

    // Create invoice with proper billing
    const countResult = await client.query('SELECT COUNT(*) FROM invoices');
    const invoiceCount = parseInt(countResult.rows[0].count) + 1;
    const invoiceNumber = `INV${String(invoiceCount).padStart(6, '0')}`;

    // Get consultation charge from charge master
    const consultationCode = isNewPatient ? 'CONS-NEW' : 'CONS-FU';
    const chargeResult = await client.query(
      'SELECT id, price, service_name FROM charge_master WHERE service_code = $1',
      [consultationCode]
    );

    const consultationFee = chargeResult.rows.length > 0
      ? parseFloat(chargeResult.rows[0].price)
      : (billing_amount || (isNewPatient ? 50 : 30));

    const invoiceResult = await client.query(
      `INSERT INTO invoices (
        patient_id, encounter_id, invoice_number, invoice_date,
        subtotal, tax, total_amount, status
      ) VALUES ($1, $2, $3, CURRENT_DATE, $4, 0, $4, 'pending')
      RETURNING *`,
      [patient_id, encounter.id, invoiceNumber, consultationFee]
    );

    // Create invoice item for consultation
    const chargeMasterId = chargeResult.rows.length > 0 ? chargeResult.rows[0].id : null;
    const consultationDescription = chargeResult.rows.length > 0
      ? chargeResult.rows[0].service_name
      : (isNewPatient ? 'New Patient Consultation' : 'Follow-up Consultation');

    await client.query(
      `INSERT INTO invoice_items (invoice_id, charge_master_id, description, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, 1, $4, $4)`,
      [
        invoiceResult.rows[0].id,
        chargeMasterId,
        consultationDescription,
        consultationFee,
      ]
    );

    // Get patient info for appointment and notification
    const patientInfoResult = await client.query(
      `SELECT u.first_name || ' ' || u.last_name as patient_name, p.patient_number
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [patient_id]
    );

    const patientInfo = patientInfoResult.rows[0] || {};

    // Create a 30-minute appointment slot for walk-in patients
    const appointmentTime = new Date();
    const appointmentDuration = 30;
    const appointmentEnd = new Date(appointmentTime.getTime() + appointmentDuration * 60 * 1000);

    // Find a doctor to assign appointment to
    let appointmentProviderId = assigned_provider_id;

    // If no provider assigned, find an available doctor
    if (!appointmentProviderId) {
      // Find a doctor who doesn't have a conflicting appointment at this time
      const availableDoctorResult = await client.query(
        `SELECT u.id FROM users u
         WHERE u.role = 'doctor' AND u.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.provider_id = u.id
             AND a.status NOT IN ('cancelled', 'no-show')
             AND (
               (a.appointment_date <= $1 AND a.appointment_date + (a.duration_minutes || ' minutes')::interval > $1)
               OR (a.appointment_date < $2 AND a.appointment_date + (a.duration_minutes || ' minutes')::interval > $1)
               OR (a.appointment_date >= $1 AND a.appointment_date < $2)
             )
         )
         ORDER BY u.first_name
         LIMIT 1`,
        [appointmentTime, appointmentEnd]
      );

      if (availableDoctorResult.rows.length > 0) {
        appointmentProviderId = availableDoctorResult.rows[0].id;

        // Also update the encounter with this provider
        await client.query(
          `UPDATE encounters SET provider_id = $1 WHERE id = $2`,
          [appointmentProviderId, encounter.id]
        );
      }
    }

    // Create appointment if we found an available provider
    if (appointmentProviderId) {
      // Double-check for conflicts with assigned provider
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

      // Only create appointment if no conflict
      if (conflictCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO appointments (
            patient_id, patient_name, provider_id, appointment_date, duration_minutes,
            appointment_type, status, reason, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, 'checked-in', $7, $8)`,
          [
            patient_id,
            patientInfo.patient_name || null,
            appointmentProviderId,
            appointmentTime,
            appointmentDuration,
            encounter_type || 'walk-in',
            chief_complaint || 'Walk-in visit',
            receptionist_id,
          ]
        );
      }
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
         AND e.status NOT IN ('completed', 'discharged')
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
        weight, weight_unit, height, height_unit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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

    // If no doctor assigned, find available doctor
    let doctor_id = provider_id;
    if (!doctor_id) {
      const doctorResult = await pool.query(
        `SELECT id FROM users WHERE role = 'doctor' AND is_active = true LIMIT 1`
      );
      if (doctorResult.rows.length > 0) {
        doctor_id = doctorResult.rows[0].id;
      }
    }

    // Update encounter: assign doctor and set status to ready_for_doctor
    await pool.query(
      `UPDATE encounters
       SET provider_id = COALESCE(provider_id, $1),
           status = 'ready_for_doctor',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [doctor_id, encounter_id]
    );

    const result = await pool.query(
      `INSERT INTO alerts (encounter_id, patient_id, from_user_id, to_user_id, alert_type, message)
       VALUES ($1, $2, $3, $4, 'patient_ready', $5)
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
         AND a.alert_type = 'patient_ready'
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
    // Only show patients that have been explicitly sent to the doctor:
    // - status 'with_doctor' (doctor is seeing them)
    // - status 'ready_for_doctor' (nurse has alerted doctor, patient is waiting)
    // - status 'with_nurse' but there's an active alert for the doctor (legacy support)
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
        EXISTS(
          SELECT 1 FROM alerts a
          WHERE a.encounter_id = e.id
          AND a.alert_type = 'patient_ready'
          AND a.is_read = false
        ) as has_nurse_alert
      FROM encounters e
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN users u_nurse ON e.nurse_id = u_nurse.id
      LEFT JOIN users u_doctor ON e.provider_id = u_doctor.id
      WHERE e.room_id IS NOT NULL
        AND DATE(e.encounter_date) = CURRENT_DATE
        AND (
          e.status = 'with_doctor'
          OR e.status = 'ready_for_doctor'
          OR (e.status = 'with_nurse' AND EXISTS(
            SELECT 1 FROM alerts a
            WHERE a.encounter_id = e.id
            AND a.alert_type = 'patient_ready'
          ))
        )
      ORDER BY
        CASE
          WHEN p.vip_status = 'platinum' THEN 1
          WHEN p.vip_status = 'gold' THEN 2
          WHEN p.vip_status = 'silver' THEN 3
          ELSE 4
        END,
        r.room_number`
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

        // Use vital_signs_history if available, otherwise use the JSON column from encounters
        const vitalSigns = vitalsResult.rows[0] || encounter.vital_signs || null;

        return {
          ...encounter,
          vital_signs: vitalSigns,
        };
      })
    );

    res.json({
      encounters: encountersWithVitals,
    });
  } catch (error) {
    console.error('Get encounters by room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all available rooms
export const getAvailableRooms = async (req: Request, res: Response): Promise<void> => {
  try {
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
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_nurse.first_name || ' ' || u_nurse.last_name as nurse_name,
        u_doctor.first_name || ' ' || u_doctor.last_name as doctor_name,
        i.status as invoice_status,
        i.total_amount as billing_amount,
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
      ORDER BY
        CASE e.status
          WHEN 'in-progress' THEN 1
          WHEN 'with_nurse' THEN 2
          WHEN 'completed' THEN 3
          ELSE 4
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
        END as workflow_status
      FROM encounters e
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      WHERE e.nurse_id = $1 AND e.status IN ('in-progress', 'with_nurse', 'ready_for_doctor', 'with_doctor')
      ORDER BY
        CASE WHEN e.status = 'with_nurse' THEN 0 ELSE 1 END,
        e.doctor_completed_at DESC NULLS LAST,
        e.triage_time DESC`,
      [nurse_id]
    );

    res.json({
      patients: result.rows,
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
    const { encounter_id } = req.body;

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
    await pool.query(
      `UPDATE encounters
       SET status = 'with_nurse',
           doctor_completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [encounter_id]
    );

    // Create alert for nurse that patient is ready for follow-up
    if (nurse_id) {
      await pool.query(
        `INSERT INTO alerts (encounter_id, patient_id, from_user_id, to_user_id, alert_type, message)
         VALUES ($1, $2, $3, $4, 'patient_ready', $5)`,
        [
          encounter_id,
          patient_id,
          doctor_id,
          nurse_id,
          `Patient ${patient_name || ''} in Room ${room_number || 'N/A'} is ready for follow-up care`
        ]
      );
    }

    res.json({
      message: 'Encounter completed. Patient sent back to nurse.',
    });
  } catch (error) {
    console.error('Doctor complete encounter error:', error);
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
       SELECT $1, $2, $3, u.id, 'patient_ready', $4
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

    // Get unread alerts for this receptionist that are billing-related (patient_ready from nurses)
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
       WHERE a.to_user_id = $1
         AND a.is_read = false
         AND e.status = 'completed'
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
      `SELECT e.id, e.room_id, e.patient_id, e.status,
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
