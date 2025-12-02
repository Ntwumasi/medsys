import { Request, Response } from 'express';
import pool from '../database/db';
import { validateAllVitals } from '../utils/vitalSignsValidation';

// Receptionist: Check-in patient and create encounter
export const checkInPatient = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const authReq = req as any;
    const receptionist_id = authReq.user?.id;

    const { patient_id, chief_complaint, encounter_type, billing_amount } = req.body;

    await client.query('BEGIN');

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
        chief_complaint, status, checked_in_at, triage_time, triage_priority
      ) VALUES ($1, $2, $3, $4, $5, $6, 'in-progress', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'green')
      RETURNING *`,
      [
        patient_id,
        assigned_provider_id,
        receptionist_id,
        new Date(),
        encounter_type || 'walk-in',
        chief_complaint,
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

    await client.query('COMMIT');

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
        // Assign doctor to encounter
        await pool.query(
          `UPDATE encounters SET provider_id = $1 WHERE id = $2`,
          [doctor_id, encounter_id]
        );
      }
    }

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
    const result = await pool.query(
      `SELECT e.*,
        r.room_number,
        r.room_name,
        p.patient_number,
        p.date_of_birth,
        p.gender,
        u_patient.first_name || ' ' || u_patient.last_name as patient_name,
        u_nurse.first_name || ' ' || u_nurse.last_name as nurse_name,
        u_doctor.first_name || ' ' || u_doctor.last_name as doctor_name
      FROM encounters e
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      LEFT JOIN users u_nurse ON e.nurse_id = u_nurse.id
      LEFT JOIN users u_doctor ON e.provider_id = u_doctor.id
      WHERE e.status = 'in-progress' AND e.room_id IS NOT NULL
      ORDER BY r.room_number`
    );

    res.json({
      encounters: result.rows,
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

// Get patient queue with color coding - includes all patients for the day
export const getPatientQueue = async (req: Request, res: Response): Promise<void> => {
  try {
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
        CASE
          WHEN e.status = 'completed' THEN 'completed'
          WHEN e.doctor_started_at IS NOT NULL THEN 'with_doctor'
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
      WHERE DATE(e.encounter_date) = CURRENT_DATE
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
        END as current_priority
      FROM encounters e
      LEFT JOIN rooms r ON e.room_id = r.id
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u_patient ON p.user_id = u_patient.id
      WHERE e.nurse_id = $1 AND e.status = 'in-progress'
      ORDER BY e.triage_time`,
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
    const { encounter_id } = req.body;

    // Update encounter status to 'with_nurse' - patient goes back to nurse
    await pool.query(
      `UPDATE encounters
       SET status = 'with_nurse',
           doctor_completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [encounter_id]
    );

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
    const { encounter_id } = req.body;

    // Get room_id from encounter
    const encounterResult = await pool.query(
      `SELECT room_id FROM encounters WHERE id = $1`,
      [encounter_id]
    );

    if (encounterResult.rows.length === 0) {
      res.status(404).json({ error: 'Encounter not found' });
      return;
    }

    const room_id = encounterResult.rows[0].room_id;

    if (room_id) {
      await pool.query(
        `UPDATE rooms SET is_available = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [room_id]
      );
    }

    await pool.query(
      `UPDATE encounters SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [encounter_id]
    );

    res.json({
      message: 'Room released and encounter completed successfully',
    });
  } catch (error) {
    console.error('Release room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get completed encounters with search and date filtering (for Past Patients view)
export const getCompletedEncounters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, date_from, date_to, page = 1, limit = 10 } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT e.*,
        p.patient_number,
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

    // Add ordering and pagination
    query += ` ORDER BY e.encounter_date DESC, e.completed_at DESC`;
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
