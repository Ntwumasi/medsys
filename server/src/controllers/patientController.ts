import { Request, Response } from 'express';
import OpenAI from 'openai';
import crypto from 'crypto';
import pool from '../database/db';
import { buildSafeUpdateClause } from '../utils/sqlSecurity';
import { aiService } from '../services/aiService';
import { nextInvoiceNumber, nextPatientNumber } from '../services/sequences';
import drugInteractionService from '../services/drugInteractionService';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

// Database migration needed for PCP fields:
// ALTER TABLE patients ADD COLUMN pcp_name VARCHAR(255);
// ALTER TABLE patients ADD COLUMN pcp_phone VARCHAR(20);

// Generate unique username from first name and last name
const generatePatientUsername = async (client: any, firstName: string, lastName: string): Promise<string> => {
  // Base username: first initial + lastname (lowercase, alphanumeric only)
  const firstInitial = (firstName || 'x').charAt(0).toLowerCase();
  const lastNameClean = (lastName || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
  let baseUsername = `${firstInitial}${lastNameClean}`;

  // Ensure minimum length
  if (baseUsername.length < 3) {
    baseUsername = baseUsername + 'user';
  }

  // Check for existing usernames and handle duplicates
  const existingResult = await client.query(
    `SELECT username FROM users WHERE username LIKE $1`,
    [`${baseUsername}%`]
  );

  const existingUsernames = new Set(existingResult.rows.map((r: any) => r.username));

  let username = baseUsername;
  let counter = 2;
  while (existingUsernames.has(username)) {
    username = `${baseUsername}${counter}`;
    counter++;
  }

  return username;
};

export const createPatient = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      date_of_birth,
      gender,
      allergies,
      address,
      city,
      state,
      region,
      nationality,
      gps_address,
      preferred_clinic,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relationship,
      insurance_provider,
      insurance_number,
      marital_status,
      occupation,
      payer_sources, // New field: array of payer sources
      pcp_name, // Primary Care Physician name
      pcp_phone, // Primary Care Physician phone
      vip_status, // VIP status: silver, gold, platinum
      // Health status fields
      hiv_status,
      hepatitis_b_status,
      hepatitis_c_status,
      tb_status,
      sickle_cell_status,
      other_health_conditions,
    } = req.body;

    // Normalize empty strings for date/optional fields
    // date_of_birth and gender are NOT NULL in the patients table
    const hasRealDob = !!(date_of_birth && date_of_birth.trim() !== '');
    const dob = hasRealDob ? date_of_birth : '1900-01-01';
    const genderValue = gender && gender.trim() !== '' ? gender : 'other';

    // Hard-block on an exact name + date-of-birth collision — but ONLY when a
    // real DOB was supplied. OTC/walk-in intake captures no DOB, so every such
    // patient shares the 1900-01-01 sentinel; blocking on name + sentinel would
    // wrongly reject a second, unrelated person who happens to share a name
    // (e.g. two different "Irene"s walking in). For the no-DOB case the
    // receptionist's /patients/check-duplicates soft-warning + override flow is
    // the right guard, not a hard 409 that the walk-in form can't get past.
    if (hasRealDob) {
      const duplicateCheck = await client.query(
        `SELECT p.id, p.patient_number, u.first_name, u.last_name
         FROM patients p
         JOIN users u ON p.user_id = u.id
         WHERE LOWER(u.first_name) = LOWER($1)
           AND LOWER(u.last_name) = LOWER($2)
           AND p.date_of_birth = $3`,
        [first_name, last_name, dob]
      );

      if (duplicateCheck.rows.length > 0) {
        const existingPatient = duplicateCheck.rows[0];
        res.status(409).json({
          error: 'Duplicate patient',
          message: `A patient with the same name and date of birth already exists (Patient #${existingPatient.patient_number}: ${existingPatient.first_name} ${existingPatient.last_name}). Please search for the existing patient to check them in.`,
          existingPatientId: existingPatient.id,
          existingPatientNumber: existingPatient.patient_number
        });
        client.release();
        return;
      }
    }

    await client.query('BEGIN');

    // Generate patient number
    const patient_number = await nextPatientNumber(client);

    // Create user account for patient (always - even if no email provided)
    // If no email provided, generate a dummy email to satisfy unique constraint
    const patientEmail = email || `${patient_number}@noemail.medsys.local`;
    // Cryptographically random one-time password. The patient must change
    // it on first login (must_change_password flag set below). Surfaced
    // to the receptionist in the response so they can hand it over at
    // intake — never written to logs.
    const cryptoNode = require('crypto');
    const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = cryptoNode.randomBytes(8);
    let defaultPassword = 'Pt';
    for (let i = 0; i < 8; i++) defaultPassword += BASE32[bytes[i] % BASE32.length];
    const bcrypt = require('bcrypt');
    const password_hash = await bcrypt.hash(defaultPassword, 10);

    // Generate unique username for patient
    const username = await generatePatientUsername(client, first_name, last_name);

    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, role, first_name, last_name, phone, must_change_password)
       VALUES ($1, $2, $3, 'patient', $4, $5, $6, true)
       RETURNING id`,
      [username, patientEmail, password_hash, first_name, last_name, phone]
    );
    const user_id = userResult.rows[0].id;

    // Create patient record
    const result = await client.query(
      `INSERT INTO patients (
        user_id, patient_number, date_of_birth, gender, allergies, address, city, state,
        region, nationality, gps_address, preferred_clinic,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        insurance_provider, insurance_number, marital_status, occupation, pcp_name, pcp_phone,
        vip_status, hiv_status, hepatitis_b_status, hepatitis_c_status, tb_status, sickle_cell_status, other_health_conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      RETURNING *`,
      [
        user_id,
        patient_number,
        dob,
        genderValue,
        allergies,
        address,
        city,
        state,
        region || null,
        nationality || null,
        gps_address || null,
        preferred_clinic || null,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        insurance_provider,
        insurance_number,
        marital_status,
        occupation,
        pcp_name || null,
        pcp_phone || null,
        vip_status || null,
        hiv_status || null,
        hepatitis_b_status || null,
        hepatitis_c_status || null,
        tb_status || null,
        sickle_cell_status || null,
        other_health_conditions || null,
      ]
    );

    const patient_id = result.rows[0].id;

    // Insert payer sources if provided
    if (payer_sources && Array.isArray(payer_sources) && payer_sources.length > 0) {
      for (let i = 0; i < payer_sources.length; i++) {
        const payer = payer_sources[i];
        const is_primary = i === 0; // First payer source is primary

        await client.query(
          `INSERT INTO patient_payer_sources (
            patient_id, payer_type, corporate_client_id, insurance_provider_id, is_primary
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            patient_id,
            payer.payer_type,
            payer.corporate_client_id || null,
            payer.insurance_provider_id || null,
            is_primary,
          ]
        );
      }
    }

    // Create registration fee invoice (always pending — payment collected separately)
    const { registration_payment } = req.body;
    let registrationInvoice = null;
    if (registration_payment === 'pay_now' || registration_payment === 'pay_later') {
      const registrationFee = 75.00;

      // Generate invoice number
      const invoiceNumber = await nextInvoiceNumber(client);

      const invoiceResult = await client.query(
        `INSERT INTO invoices (
          patient_id, invoice_number, invoice_date, subtotal, tax, total_amount,
          amount_paid, status
        ) VALUES ($1, $2, CURRENT_DATE, $3, 0, $3, 0, 'pending')
        RETURNING *`,
        [patient_id, invoiceNumber, registrationFee]
      );

      // Create invoice item for registration fee
      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, category)
         VALUES ($1, 'Patient Registration Fee', 1, $2, $2, 'registration')`,
        [invoiceResult.rows[0].id, registrationFee]
      );

      registrationInvoice = invoiceResult.rows[0];
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Patient created successfully',
      patient: result.rows[0],
      registration_invoice: registrationInvoice,
      open_invoice: registration_payment === 'pay_now',
      // One-time portal credentials — receptionist reads these to the
      // patient so they can later log into the patient portal.
      portal_credentials: {
        username,
        temporary_password: defaultPassword,
        note: 'Patient must change this password on first portal login.',
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create patient error:', error);

    // Handle specific database errors
    if (error.code === '23505') {
      // Unique constraint violation
      if (error.constraint === 'users_email_key') {
        res.status(409).json({
          error: 'Email already registered',
          message: 'A patient with this email address already exists in the system. Please use a different email or search for the existing patient to check them in.'
        });
        return;
      }
      res.status(409).json({
        error: 'Duplicate entry',
        message: 'This patient record already exists in the system.'
      });
      return;
    }

    if (error.code === '23502') {
      // Not null constraint violation
      res.status(400).json({
        error: 'Missing required field',
        message: 'Please fill in all required fields.'
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to register patient',
      message: 'An unexpected error occurred. Please try again or contact support if the problem persists.'
    });
  } finally {
    client.release();
  }
};

export const getPatients = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT p.*, u.email, u.first_name, u.last_name, u.phone,
             p.pcp_name, p.pcp_phone, p.vip_status
      FROM patients p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.merged_into IS NULL
    `;
    const params: any[] = [];

    if (search) {
      query += ` AND (p.patient_number ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)`;
      params.push(`%${search}%`);
    }

    // Sort VIP patients to top (platinum > gold > silver > null), then by created_at
    query += ` ORDER BY
      CASE
        WHEN p.vip_status = 'platinum' THEN 1
        WHEN p.vip_status = 'gold' THEN 2
        WHEN p.vip_status = 'silver' THEN 3
        ELSE 4
      END,
      p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      patients: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPatientById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.*, u.email, u.first_name, u.last_name, u.phone,
              p.pcp_name, p.pcp_phone, p.vip_status
       FROM patients p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    // Fetch allergies from allergies table
    const allergiesResult = await pool.query(
      `SELECT id, allergen, reaction, severity, onset_date
       FROM allergies
       WHERE patient_id = $1
       ORDER BY severity DESC, created_at DESC`,
      [id]
    );

    // Does a *live* duplicate of this patient exist (same name + DOB, not merged)?
    // Drives the "possible duplicate — ask an admin to merge" warning on the
    // patient card, so it only fires when there's actually something to merge —
    // not on every CareCode import. Skipped when DOB is unknown.
    const patient = result.rows[0];
    let has_duplicate = false;
    if (patient.date_of_birth) {
      const dupResult = await pool.query(
        `SELECT 1
         FROM patients p
         JOIN users u ON u.id = p.user_id
         WHERE p.id <> $1
           AND p.merged_into IS NULL
           AND p.date_of_birth = $2
           AND LOWER(u.first_name) = LOWER($3)
           AND LOWER(u.last_name) = LOWER($4)
         LIMIT 1`,
        [id, patient.date_of_birth, patient.first_name, patient.last_name]
      );
      has_duplicate = dupResult.rows.length > 0;
    }

    res.json({
      patient: {
        ...patient,
        allergies: allergiesResult.rows, // Return allergies as array of objects
        has_duplicate,
      }
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePatient = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const updateData = req.body;

    // Separate user fields from patient fields
    const userFields = ['first_name', 'last_name', 'email', 'phone'];
    const userData: Record<string, unknown> = {};
    const patientData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updateData)) {
      if (userFields.includes(key)) {
        userData[key] = value;
      } else {
        patientData[key] = value;
      }
    }

    await client.query('BEGIN');

    // Get the user_id for this patient
    const patientResult = await client.query(
      'SELECT user_id FROM patients WHERE id = $1',
      [id]
    );

    if (patientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const userId = patientResult.rows[0].user_id;

    // Update user table if there are user fields (with field whitelisting)
    if (Object.keys(userData).length > 0 && userId) {
      try {
        const { setClause, values } = buildSafeUpdateClause('users', userData, 2);
        await client.query(
          `UPDATE users SET ${setClause} WHERE id = $1`,
          [userId, ...values]
        );
      } catch (err) {
        // No valid user fields to update, continue
      }
    }

    // Update patient table if there are patient fields (with field whitelisting)
    let updatedPatient;
    if (Object.keys(patientData).length > 0) {
      try {
        const { setClause, values } = buildSafeUpdateClause('patients', patientData, 2);
        const result = await client.query(
          `UPDATE patients SET ${setClause}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [id, ...values]
        );
        updatedPatient = result.rows[0];
      } catch (err) {
        // No valid patient fields, just fetch
        const result = await client.query('SELECT * FROM patients WHERE id = $1', [id]);
        updatedPatient = result.rows[0];
      }
    } else {
      // Just fetch the patient if no patient fields to update
      const result = await client.query('SELECT * FROM patients WHERE id = $1', [id]);
      updatedPatient = result.rows[0];
    }

    await client.query('COMMIT');

    res.json({
      message: 'Patient updated successfully',
      patient: updatedPatient,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const getPatientSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get patient info
    const patientResult = await pool.query(
      `SELECT p.*, u.email, u.first_name, u.last_name, u.phone, p.vip_status
       FROM patients p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    // Get recent encounters
    const encountersResult = await pool.query(
      `SELECT e.*, u.first_name || ' ' || u.last_name as provider_name
       FROM encounters e
       LEFT JOIN users u ON e.provider_id = u.id
       WHERE e.patient_id = $1
       ORDER BY e.encounter_date DESC
       LIMIT 20`,
      [id]
    );

    // Enrich encounters with clinical notes, diagnoses, and prescriptions
    const encounterIds = encountersResult.rows.map((e: any) => e.id);
    let notesMap: Record<number, any[]> = {};
    let diagnosesMap: Record<number, any[]> = {};
    let prescriptionsMap: Record<number, any[]> = {};
    let hpSectionsMap: Record<number, any[]> = {};

    if (encounterIds.length > 0) {
      const [notesResult, diagnosesResult, prescriptionsResult, hpResult] = await Promise.all([
        pool.query(
          `SELECT cn.*, u.first_name || ' ' || u.last_name as author_name
           FROM clinical_notes cn
           LEFT JOIN users u ON cn.created_by = u.id
           WHERE cn.encounter_id = ANY($1)
           ORDER BY cn.created_at ASC`,
          [encounterIds]
        ),
        pool.query(
          `SELECT * FROM diagnoses
           WHERE encounter_id = ANY($1)
           ORDER BY type ASC, created_at ASC`,
          [encounterIds]
        ),
        pool.query(
          `SELECT * FROM pharmacy_orders
           WHERE encounter_id = ANY($1)
           ORDER BY created_at ASC`,
          [encounterIds]
        ),
        pool.query(
          `SELECT hp.encounter_id, hp.section_id, hp.content, hp.completed
           FROM hp_sections hp
           WHERE hp.encounter_id = ANY($1) AND hp.content IS NOT NULL AND hp.content != ''
           ORDER BY hp.encounter_id ASC, hp.section_id ASC`,
          [encounterIds]
        ),
      ]);

      for (const note of notesResult.rows) {
        (notesMap[note.encounter_id] ||= []).push(note);
      }
      for (const dx of diagnosesResult.rows) {
        (diagnosesMap[dx.encounter_id] ||= []).push(dx);
      }
      for (const rx of prescriptionsResult.rows) {
        (prescriptionsMap[rx.encounter_id] ||= []).push(rx);
      }
      for (const hp of hpResult.rows) {
        (hpSectionsMap[hp.encounter_id] ||= []).push(hp);
      }
    }

    // Attach to each encounter
    for (const enc of encountersResult.rows) {
      enc.clinical_notes = notesMap[enc.id] || [];
      enc.diagnoses = diagnosesMap[enc.id] || [];
      enc.prescriptions = prescriptionsMap[enc.id] || [];
      enc.hp_sections = hpSectionsMap[enc.id] || [];
    }

    // Get medications — merge the structured medications list with pharmacy
    // prescriptions/dispenses so the tab reflects what was actually ordered and
    // dispensed (with dispensed dates), not just the rarely-populated medications table.
    const medicationsResult = await pool.query(
      `SELECT po.id,
              -- When the pharmacist substituted, the dispensed drug is the
              -- substitute — show THAT as the medication name, not the original
              -- the doctor first ordered. (Otherwise the wrong drug showed as
              -- "dispensed" and the substitute appeared as a separate line.)
              COALESCE(NULLIF(TRIM(po.substitute_medication), ''), po.medication_name) AS medication_name,
              po.dosage, po.frequency, po.route, po.status,
              po.ordered_date::timestamp AS start_date, po.dispensed_date::timestamp AS dispensed_date,
              (u.first_name || ' ' || u.last_name)::text AS provider, po.notes,
              'prescription'::text AS source, po.created_at,
              -- A prescription is "active" if it's not finished/cancelled and either
              -- not yet dispensed, or still within its days-supply window.
              (po.status NOT IN ('cancelled', 'rejected', 'returned', 'completed')
               AND (po.dispensed_date IS NULL
                    OR (po.dispensed_date + (COALESCE(po.days_supply, 30) || ' days')::interval)::date >= CURRENT_DATE)) AS is_active
         FROM pharmacy_orders po
         LEFT JOIN users u ON po.ordering_provider = u.id
        WHERE po.patient_id = $1 AND po.status NOT IN ('cancelled', 'rejected')
       UNION ALL
       SELECT m.id, m.medication_name, m.dosage, m.frequency, m.route, m.status,
              m.start_date::timestamp AS start_date, NULL::timestamp AS dispensed_date,
              (mu.first_name || ' ' || mu.last_name)::text AS provider, m.notes,
              'medication'::text AS source, m.created_at,
              (m.status = 'active') AS is_active
         FROM medications m
         LEFT JOIN users mu ON m.prescribing_doctor = mu.id
        WHERE m.patient_id = $1 AND m.status = 'active'
          AND NOT EXISTS (
            -- Dedup against pharmacy orders by EITHER the original name or the
            -- substitute, so a dispensed substitute (recorded in the medications
            -- table under its substitute name) doesn't double up with its order.
            SELECT 1 FROM pharmacy_orders po2
             WHERE po2.patient_id = $1
               AND po2.status NOT IN ('cancelled', 'rejected')
               AND (LOWER(TRIM(po2.medication_name)) = LOWER(TRIM(m.medication_name))
                    OR LOWER(TRIM(COALESCE(po2.substitute_medication, ''))) = LOWER(TRIM(m.medication_name)))
          )
       ORDER BY created_at DESC`,
      [id]
    );

    // Free-text "Home Medications" documented in the most recent SOAP note —
    // surfaced when there are no structured/prescribed meds to show.
    const documentedMedsResult = await pool.query(
      `SELECT hp.content, e.encounter_date
         FROM hp_sections hp
         JOIN encounters e ON hp.encounter_id = e.id
        WHERE e.patient_id = $1 AND hp.section_id = 'home_medications'
          AND hp.content IS NOT NULL AND hp.content != ''
        ORDER BY e.encounter_date DESC
        LIMIT 1`,
      [id]
    );

    // Get allergies
    const allergiesResult = await pool.query(
      `SELECT * FROM allergies
       WHERE patient_id = $1
       ORDER BY severity DESC, created_at DESC`,
      [id]
    );

    // Get upcoming appointments
    const appointmentsResult = await pool.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as provider_name
       FROM appointments a
       LEFT JOIN users u ON a.provider_id = u.id
       WHERE a.patient_id = $1 AND a.appointment_date > CURRENT_TIMESTAMP
       ORDER BY a.appointment_date ASC
       LIMIT 5`,
      [id]
    );

    // Get payer sources (insurance, corporate, self-pay)
    const payerSourcesResult = await pool.query(
      `SELECT pps.*,
              cc.name as corporate_client_name,
              ip.name as insurance_provider_name
       FROM patient_payer_sources pps
       LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
       LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
       WHERE pps.patient_id = $1
       ORDER BY pps.is_primary DESC`,
      [id]
    );

    // Get outstanding balance
    const balanceResult = await pool.query(
      `SELECT COALESCE(SUM(total_amount - COALESCE(amount_paid, 0)), 0) as outstanding_balance
       FROM invoices
       WHERE patient_id = $1 AND status IN ('pending', 'partial')`,
      [id]
    );

    res.json({
      patient: patientResult.rows[0],
      recent_encounters: encountersResult.rows,
      active_medications: medicationsResult.rows,
      documented_medications: documentedMedsResult.rows[0] || null,
      allergies: allergiesResult.rows,
      upcoming_appointments: appointmentsResult.rows,
      payer_sources: payerSourcesResult.rows,
      outstanding_balance: parseFloat(balanceResult.rows[0].outstanding_balance) || 0,
    });
  } catch (error) {
    console.error('Get patient summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Screen the patient's full medication list for drug–drug interactions.
 * Aggregates prescribed/dispensed meds (pharmacy_orders + medications table)
 * with home meds documented as free text in the SOAP note, then runs the local
 * interaction database plus an AI screen. Visible to doctors and pharmacy.
 */
export const getMedicationInteractions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Structured + dispensed medication names
    const structured = await pool.query(
      `SELECT DISTINCT medication_name FROM (
         SELECT medication_name FROM pharmacy_orders
          WHERE patient_id = $1 AND status NOT IN ('cancelled', 'rejected')
         UNION
         SELECT medication_name FROM medications
          WHERE patient_id = $1 AND status = 'active'
       ) x WHERE medication_name IS NOT NULL AND medication_name != ''`,
      [id]
    );

    // Home meds documented free-text in the most recent SOAP
    const homeMeds = await pool.query(
      `SELECT hp.content
         FROM hp_sections hp
         JOIN encounters e ON hp.encounter_id = e.id
        WHERE e.patient_id = $1 AND hp.section_id = 'home_medications'
          AND hp.content IS NOT NULL AND hp.content != ''
        ORDER BY e.encounter_date DESC LIMIT 1`,
      [id]
    );

    // Patient context for a sharper AI screen
    const ctx = await pool.query(
      `SELECT date_of_birth, allergies FROM patients WHERE id = $1`,
      [id]
    );

    const names = structured.rows.map((r: any) => r.medication_name as string);
    if (homeMeds.rows[0]?.content) {
      // Split the free-text home-med blob into individual lines/items; the AI
      // tolerates dosage noise, so we just need rough tokens.
      const tokens = String(homeMeds.rows[0].content)
        .split(/[\n,;]+/)
        .map((t) => t.replace(/^[\s\-•*\d.\)]+/, '').trim())
        .filter((t) => t.length > 1);
      names.push(...tokens);
    }

    const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));

    if (uniqueNames.length < 2) {
      res.json({ medications: uniqueNames, interactions: [], aiAvailable: aiService.isAvailable(), summary: '' });
      return;
    }

    // Local interaction DB (best-effort) + AI screen
    let dbInteractions: any[] = [];
    try {
      dbInteractions = await drugInteractionService.checkMultipleInteractions(uniqueNames);
    } catch (e) {
      console.error('DB interaction check failed:', e);
    }

    const age = ctx.rows[0]?.date_of_birth
      ? Math.floor((Date.now() - new Date(ctx.rows[0].date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
      : undefined;

    const ai = await aiService.screenMedicationInteractions(
      uniqueNames,
      { patientAge: age, allergies: ctx.rows[0]?.allergies || undefined },
      (req as any).user?.userId
    );

    // Merge, de-duplicating obvious repeats (same drug pair)
    const seen = new Set<string>();
    const interactions = [...dbInteractions, ...ai.interactions]
      .map((i: any) => ({
        drug1: i.drug1,
        drug2: i.drug2,
        severity: (i.severity || 'moderate').toLowerCase(),
        description: i.description || '',
        recommendation: i.recommendation || '',
      }))
      .filter((i) => {
        const key = [i.drug1, i.drug2].map((d) => (d || '').toLowerCase()).sort().join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    res.json({
      medications: uniqueNames,
      interactions,
      aiAvailable: ai.available,
      summary: ai.summary || '',
    });
  } catch (error) {
    console.error('Get medication interactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Check for potential duplicate patients during registration.
 * Supports exact name match, fuzzy match (pg_trgm if available, LIKE fallback),
 * DOB match, and phone match. Returns matches with confidence levels.
 */
export const checkDuplicates = async (req: Request, res: Response): Promise<void> => {
  try {
    const { first_name, last_name, date_of_birth, phone } = req.query;

    if (!first_name || !last_name) {
      res.status(400).json({ error: 'first_name and last_name are required' });
      return;
    }

    const firstName = String(first_name);
    const lastName = String(last_name);
    const dob = date_of_birth ? String(date_of_birth) : null;
    const phoneStr = phone ? String(phone) : null;

    // Check if pg_trgm extension is available for fuzzy matching
    let hasTrgm = false;
    try {
      const trgmCheck = await pool.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`
      );
      hasTrgm = trgmCheck.rows.length > 0;
    } catch {
      // Extension check failed, proceed without fuzzy
    }

    // Build the query to find potential duplicates
    // We gather all candidates that match on name (exact or fuzzy), DOB, or phone,
    // then assign confidence in application code.
    let query: string;
    const params: any[] = [firstName, lastName];

    if (hasTrgm) {
      // Use pg_trgm similarity for fuzzy name matching
      query = `
        SELECT DISTINCT p.id, p.patient_number, u.first_name, u.last_name,
               p.date_of_birth, u.phone,
               (UPPER(u.first_name) = UPPER($1) AND UPPER(u.last_name) = UPPER($2)) AS exact_name,
               (similarity(UPPER(u.first_name), UPPER($1)) > 0.4 AND similarity(UPPER(u.last_name), UPPER($2)) > 0.4) AS fuzzy_name,
               ${dob ? `(p.date_of_birth = $3)` : 'FALSE'} AS dob_match,
               ${phoneStr ? `(u.phone = $${dob ? 4 : 3})` : 'FALSE'} AS phone_match
        FROM patients p
        JOIN users u ON p.user_id = u.id
        WHERE (
          (UPPER(u.first_name) = UPPER($1) AND UPPER(u.last_name) = UPPER($2))
          OR (similarity(UPPER(u.first_name), UPPER($1)) > 0.4 AND similarity(UPPER(u.last_name), UPPER($2)) > 0.4)
          ${dob ? `OR p.date_of_birth = $3` : ''}
          ${phoneStr ? `OR u.phone = $${dob ? 4 : 3}` : ''}
        )
        ORDER BY exact_name DESC, fuzzy_name DESC
        LIMIT 20
      `;
    } else {
      // Fallback: exact match + LIKE-based partial matching
      query = `
        SELECT DISTINCT p.id, p.patient_number, u.first_name, u.last_name,
               p.date_of_birth, u.phone,
               (UPPER(u.first_name) = UPPER($1) AND UPPER(u.last_name) = UPPER($2)) AS exact_name,
               (UPPER(u.first_name) LIKE UPPER($1) || '%' AND UPPER(u.last_name) LIKE UPPER($2) || '%') AS fuzzy_name,
               ${dob ? `(p.date_of_birth = $3)` : 'FALSE'} AS dob_match,
               ${phoneStr ? `(u.phone = $${dob ? 4 : 3})` : 'FALSE'} AS phone_match
        FROM patients p
        JOIN users u ON p.user_id = u.id
        WHERE (
          (UPPER(u.first_name) = UPPER($1) AND UPPER(u.last_name) = UPPER($2))
          OR (UPPER(u.first_name) LIKE UPPER($1) || '%' AND UPPER(u.last_name) LIKE UPPER($2) || '%')
          ${dob ? `OR p.date_of_birth = $3` : ''}
          ${phoneStr ? `OR u.phone = $${dob ? 4 : 3}` : ''}
        )
        ORDER BY exact_name DESC, fuzzy_name DESC
        LIMIT 20
      `;
    }

    if (dob) params.push(dob);
    if (phoneStr) params.push(phoneStr);

    const result = await pool.query(query, params);

    // Assign confidence levels
    const duplicates = result.rows.map((row: any) => {
      let confidence: 'exact' | 'likely' | 'possible';

      if ((row.exact_name || row.fuzzy_name) && row.dob_match) {
        confidence = 'exact';
      } else if (row.fuzzy_name && (row.dob_match || row.phone_match)) {
        confidence = 'likely';
      } else {
        confidence = 'possible';
      }

      return {
        id: row.id,
        patient_number: row.patient_number,
        first_name: row.first_name,
        last_name: row.last_name,
        date_of_birth: row.date_of_birth,
        phone: row.phone,
        confidence,
      };
    });

    res.json({ duplicates });
  } catch (error) {
    console.error('Check duplicates error:', error);
    res.status(500).json({ error: 'Failed to check for duplicate patients' });
  }
};

/**
 * Generate a brief AI-powered patient summary for receptionist check-in.
 * Uses GPT-4o to summarize the last 3 encounters, active medications,
 * allergies, and abnormal lab results. Caches in ai_interactions table.
 */
export const getAISummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Verify patient exists
    const patientResult = await pool.query(
      `SELECT p.id FROM patients p WHERE p.id = $1`,
      [id]
    );

    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    // Fetch last 3 encounters
    const encountersResult = await pool.query(
      `SELECT e.id, e.encounter_date, e.chief_complaint, e.status
       FROM encounters e
       WHERE e.patient_id = $1
       ORDER BY e.encounter_date DESC
       LIMIT 3`,
      [id]
    );

    if (encountersResult.rows.length === 0) {
      res.json({ summary: 'New patient — no visit history.', generated_at: new Date().toISOString() });
      return;
    }

    const encounterIds = encountersResult.rows.map((e: any) => e.id);

    // Fetch diagnoses, active medications, allergies, and abnormal lab results in parallel
    const [diagnosesResult, medicationsResult, allergiesResult, labResultsResult] = await Promise.all([
      pool.query(
        `SELECT d.description, d.icd_code, d.type
         FROM diagnoses d
         WHERE d.encounter_id = ANY($1)
         ORDER BY d.created_at DESC`,
        [encounterIds]
      ),
      pool.query(
        `SELECT m.medication_name, m.dosage, m.frequency
         FROM medications m
         WHERE m.patient_id = $1 AND m.status = 'active'
         ORDER BY m.created_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT a.allergen, a.reaction, a.severity
         FROM allergies a
         WHERE a.patient_id = $1
         ORDER BY a.severity DESC`,
        [id]
      ),
      pool.query(
        `SELECT lo.test_name, lo.results
         FROM lab_orders lo
         WHERE lo.encounter_id = ANY($1)
           AND lo.status = 'completed'
           AND lo.is_abnormal = true
         ORDER BY lo.created_at DESC
         LIMIT 10`,
        [encounterIds]
      ),
    ]);

    // Build the encounter data payload for the AI
    const encounterData = {
      recent_visits: encountersResult.rows.map((e: any) => ({
        date: e.encounter_date,
        chief_complaint: e.chief_complaint,
        status: e.status,
      })),
      diagnoses: diagnosesResult.rows.map((d: any) => ({
        description: d.description,
        icd_code: d.icd_code,
        type: d.type,
      })),
      active_medications: medicationsResult.rows.map((m: any) => ({
        name: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency,
      })),
      allergies: allergiesResult.rows.map((a: any) => ({
        allergen: a.allergen,
        reaction: a.reaction,
        severity: a.severity,
      })),
      abnormal_labs: labResultsResult.rows.map((l: any) => ({
        test: l.test_name,
        results: l.results,
      })),
    };

    // Check cache first
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ type: 'patient_summary', patient_id: id, data: encounterData }))
      .digest('hex')
      .substring(0, 64);

    const cachedResult = await pool.query(
      `SELECT response_data FROM ai_interactions
       WHERE interaction_type = 'patient_summary' AND request_hash = $1
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [requestHash]
    );

    if (cachedResult.rows.length > 0) {
      const cached = cachedResult.rows[0].response_data;
      res.json({ summary: cached.summary, generated_at: cached.generated_at, cached: true });
      return;
    }

    // If no OpenAI key, return a basic summary
    if (!openaiClient) {
      const basicSummary = `${encountersResult.rows.length} recent visit(s). ${
        diagnosesResult.rows.length > 0
          ? `Diagnoses: ${diagnosesResult.rows.slice(0, 3).map((d: any) => d.description).join(', ')}.`
          : 'No diagnoses on file.'
      } ${
        allergiesResult.rows.length > 0
          ? `Allergies: ${allergiesResult.rows.map((a: any) => a.allergen).join(', ')}.`
          : ''
      }`;
      res.json({ summary: basicSummary, generated_at: new Date().toISOString() });
      return;
    }

    // Call GPT-4o
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical records assistant. Summarize this patient\'s recent visit history in 1-2 sentences for a receptionist. Focus on: key conditions, allergies, important medications, and any follow-up requirements. Do not include patient names. Keep it under 50 words.',
        },
        {
          role: 'user',
          content: JSON.stringify(encounterData),
        },
      ],
      temperature: 0.2,
      max_tokens: 150,
    });

    const summary = completion.choices[0]?.message?.content || 'Unable to generate summary.';
    const generatedAt = new Date().toISOString();

    // Cache the result
    const userId = (req as any).user?.id || null;
    try {
      await pool.query(
        `INSERT INTO ai_interactions (interaction_type, request_hash, request_data, response_data, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'patient_summary',
          requestHash,
          JSON.stringify({ patient_id: id, data: encounterData }),
          JSON.stringify({ summary, generated_at: generatedAt }),
          userId,
        ]
      );
    } catch (cacheError) {
      console.error('Failed to cache AI summary:', cacheError);
    }

    res.json({ summary, generated_at: generatedAt });
  } catch (error) {
    console.error('Get AI summary error:', error);
    res.status(500).json({ error: 'Failed to generate patient summary' });
  }
};
