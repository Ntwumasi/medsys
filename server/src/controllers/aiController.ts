import { Request, Response } from 'express';
import aiService from '../services/aiService';
import pool from '../database/db';

interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

/**
 * Get AI-enhanced drug interaction explanation
 */
export const explainDrugInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { drug1, drug2, patientAge, patientConditions, existingInteraction } = req.body;

    if (!drug1 || !drug2) {
      res.status(400).json({ error: 'Both drug1 and drug2 are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available. Check OPENAI_API_KEY configuration.' });
      return;
    }

    const result = await aiService.explainDrugInteraction(
      { drug1, drug2, patientAge, patientConditions, existingInteraction },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Drug interaction AI error:', error);
    res.status(500).json({ error: 'Failed to process drug interaction analysis' });
  }
};

/**
 * Verify medication dosage with AI
 */
export const verifyDosage = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { medication, dosage, frequency, patientAge, patientWeight, renalFunction, hepaticFunction } = req.body;

    if (!medication || !dosage || !frequency) {
      res.status(400).json({ error: 'Medication, dosage, and frequency are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    const result = await aiService.verifyDosage(
      { medication, dosage, frequency, patientAge, patientWeight, renalFunction, hepaticFunction },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Dosage verification AI error:', error);
    res.status(500).json({ error: 'Failed to verify dosage' });
  }
};

/**
 * Get medication substitution suggestions
 */
export const suggestSubstitutions = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { medication, reason, patientAllergies, patientConditions, preferGeneric } = req.body;

    if (!medication || !reason) {
      res.status(400).json({ error: 'Medication and reason are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    const result = await aiService.suggestSubstitutions(
      { medication, reason, patientAllergies, patientConditions, preferGeneric },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Substitution AI error:', error);
    res.status(500).json({ error: 'Failed to generate substitutions' });
  }
};

/**
 * Generate patient counseling instructions
 */
export const generateCounseling = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { medication, dosage, frequency, route, patientName, conditions, otherMedications } = req.body;

    if (!medication || !dosage || !frequency || !route) {
      res.status(400).json({ error: 'Medication, dosage, frequency, and route are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    const result = await aiService.generateCounseling(
      { medication, dosage, frequency, route, patientName, conditions, otherMedications },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Counseling AI error:', error);
    res.status(500).json({ error: 'Failed to generate counseling' });
  }
};

/**
 * Parse voice command for dispensing
 */
export const parseVoiceCommand = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { transcript, includeContext } = req.body;

    if (!transcript) {
      res.status(400).json({ error: 'Transcript is required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    // Optionally fetch context data
    let context: any = {};
    if (includeContext) {
      // Get recent patients with pending orders
      const patientsResult = await pool.query(
        `SELECT DISTINCT ON (p.id) p.id, u.first_name || ' ' || u.last_name as name
         FROM pharmacy_orders po
         JOIN patients p ON po.patient_id = p.id
         JOIN users u ON p.user_id = u.id
         WHERE po.status IN ('ordered', 'in_progress', 'ready')
         ORDER BY p.id, po.ordered_date DESC
         LIMIT 20`
      );
      context.currentPatients = patientsResult.rows;

      // Get common medications
      const medsResult = await pool.query(
        `SELECT DISTINCT medication_name
         FROM pharmacy_inventory
         WHERE is_active = true AND quantity_on_hand > 0
         ORDER BY medication_name
         LIMIT 50`
      );
      context.availableMedications = medsResult.rows.map((r: any) => r.medication_name);
    }

    const result = await aiService.parseVoiceCommand(
      { transcript, context },
      authReq.user?.id
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Voice command AI error:', error);
    res.status(500).json({ error: 'Failed to parse voice command' });
  }
};

/**
 * Check AI service status
 */
export const getAIStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const isAvailable = aiService.isAvailable();

    // Get cache stats
    const cacheStats = await pool.query(
      `SELECT interaction_type, COUNT(*) as count
       FROM ai_interactions
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY interaction_type`
    );

    res.json({
      available: isAvailable,
      model: 'gpt-4o',
      cacheStats: cacheStats.rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get AI status' });
  }
};

/**
 * AI-powered triage priority suggestion
 */
export const suggestTriagePriority = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { chiefComplaint, vitals, patientAge, patientGender } = req.body;

    if (!chiefComplaint) {
      res.status(400).json({ error: 'Chief complaint is required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service is not configured' });
      return;
    }

    const result = await aiService.suggestTriagePriority(
      { chiefComplaint, vitals, patientAge, patientGender },
      authReq.user?.id
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Triage suggestion error:', error);
    res.status(500).json({ error: 'Failed to get triage suggestion' });
  }
};

/**
 * AI-powered test suggestions based on chief complaint
 */
export const suggestTestOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { chiefComplaint, patientAge, patientGender, existingDiagnoses, currentMedications, recentLabTests } = req.body;

    if (!chiefComplaint) {
      res.status(400).json({ error: 'Chief complaint is required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service is not configured' });
      return;
    }

    const result = await aiService.suggestTests(
      { chiefComplaint, patientAge, patientGender, existingDiagnoses, currentMedications, recentLabTests },
      authReq.user?.id
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Test suggestion error:', error);
    res.status(500).json({ error: 'Failed to get test suggestions' });
  }
};

/**
 * AI-generated encounter/discharge summary
 */
export const generateEncounterSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { patientName, patientAge, chiefComplaint, vitals, diagnoses, clinicalNotes, labResults, imagingResults, medications, procedures } = req.body;

    if (!chiefComplaint) {
      res.status(400).json({ error: 'Chief complaint is required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service is not configured' });
      return;
    }

    const result = await aiService.generateEncounterSummary(
      { patientName, patientAge, chiefComplaint, vitals, diagnoses, clinicalNotes, labResults, imagingResults, medications, procedures },
      authReq.user?.id
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Encounter summary error:', error);
    res.status(500).json({ error: 'Failed to generate encounter summary' });
  }
};

/**
 * Suggested tests for a patient, driven by their history + demographics rather
 * than by a single typed complaint.
 *
 * The dashboards call this with just a patient id — the history is assembled
 * here so the nurse and doctor views can't drift apart on what the AI is told
 * (the older POST /ai/test-suggest let each caller decide, and NurseDashboard
 * was sending only the chief complaint, so age/sex/history were never seen).
 *
 * Suggestions are constrained to the clinic's lab_test_catalog and re-validated
 * against it after generation, so a hallucinated code can never reach the UI as
 * an orderable test.
 */
export const getPatientTestSuggestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const encounterId = req.query.encounter_id ? parseInt(req.query.encounter_id as string, 10) : null;

    const patientId = parseInt(String(id), 10);
    if (!Number.isFinite(patientId)) {
      res.status(400).json({ error: 'Invalid patient id' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service is not configured' });
      return;
    }

    const [patientRes, diagnosesRes, medsRes, labHistoryRes, vitalsRes, catalogRes, complaintRes] = await Promise.all([
      pool.query(
        `SELECT date_of_birth, gender, allergies, other_health_conditions,
                hiv_status, hepatitis_b_status, hepatitis_c_status, tb_status, sickle_cell_status
         FROM patients WHERE id = $1`,
        [patientId]
      ),
      // Distinct diagnosis descriptions across the patient's whole history —
      // screening depends on what they've EVER had, not just this visit.
      pool.query(
        `SELECT DISTINCT d.diagnosis_description
         FROM diagnoses d
         LEFT JOIN encounters e ON d.encounter_id = e.id
         WHERE (d.patient_id = $1 OR e.patient_id = $1)
           AND d.diagnosis_description IS NOT NULL AND d.diagnosis_description != ''
         ORDER BY d.diagnosis_description
         LIMIT 30`,
        [patientId]
      ),
      pool.query(
        `SELECT DISTINCT medication_name
         FROM pharmacy_orders
         WHERE patient_id = $1 AND status != 'cancelled'
           AND created_at > NOW() - INTERVAL '12 months'
         LIMIT 30`,
        [patientId]
      ),
      // Most recent instance of each test, with how long ago it was done, so the
      // model can skip anything still within its monitoring interval.
      pool.query(
        `SELECT DISTINCT ON (LOWER(test_name)) test_name, test_code, created_at,
                GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 2592000))::int AS months_ago
         FROM lab_orders
         WHERE patient_id = $1 AND status != 'cancelled'
         ORDER BY LOWER(test_name), created_at DESC`,
        [patientId]
      ),
      // Vitals come from vital_signs_history — that is where addVitalSigns
      // actually writes. This read used to point at the `vital_signs` table,
      // which is empty (0 rows against 2289 in history), so every suggestion was
      // generated with no weight, blood pressure or heart rate at all.
      //
      // Units are passed through rather than normalised, and BMI is deliberately
      // not computed: the data is overwhelmingly kg/cm but a handful of lbs/in
      // rows exist, and handing a clinical model a silently mis-converted BMI is
      // worse than handing it the raw figures plus their units.
      pool.query(
        `SELECT temperature, temperature_unit,
                blood_pressure_systolic, blood_pressure_diastolic,
                heart_rate, respiratory_rate, oxygen_saturation,
                weight, weight_unit, height, height_unit, recorded_at
         FROM vital_signs_history
         WHERE patient_id = $1
         ORDER BY recorded_at DESC LIMIT 1`,
        [patientId]
      ),
      pool.query(
        `SELECT test_code, test_name, category, base_price
         FROM lab_test_catalog
         WHERE is_active = true
         ORDER BY category NULLS LAST, test_name`
      ),
      encounterId
        ? pool.query(`SELECT chief_complaint FROM encounters WHERE id = $1`, [encounterId])
        : Promise.resolve({ rows: [] as any[] }),
    ]);

    if (patientRes.rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const patient = patientRes.rows[0];
    const catalog = catalogRes.rows;

    if (catalog.length === 0) {
      res.status(503).json({ error: 'Lab test catalog is empty — cannot suggest orderable tests' });
      return;
    }

    // DOB is NOT NULL in patients, and unknown DOBs are stored as 1900-01-01
    // (see patientController) — treat that sentinel as "no age" rather than
    // telling the model this is a 126-year-old.
    let age: number | undefined;
    if (patient.date_of_birth) {
      const dob = new Date(patient.date_of_birth);
      if (dob.getFullYear() > 1900) {
        age = Math.floor((Date.now() - dob.getTime()) / 31557600000);
      }
    }

    const vitals = vitalsRes.rows[0]
      ? Object.fromEntries(Object.entries(vitalsRes.rows[0]).filter(([, v]) => v !== null && v !== undefined))
      : {};

    const diagnoses = diagnosesRes.rows.map((d: any) => d.diagnosis_description);
    // Registration-time history lives in dedicated columns, not in diagnoses —
    // a known hepatitis B or sickle-cell status changes what screening is due.
    if (patient.other_health_conditions) diagnoses.unshift(String(patient.other_health_conditions));
    for (const [label, value] of [
      ['HIV', patient.hiv_status],
      ['Hepatitis B', patient.hepatitis_b_status],
      ['Hepatitis C', patient.hepatitis_c_status],
      ['TB', patient.tb_status],
      ['Sickle cell', patient.sickle_cell_status],
    ] as [string, string | null][]) {
      if (value && !/^(unknown|not tested|negative|none)$/i.test(value.trim())) {
        diagnoses.unshift(`${label}: ${value}`);
      }
    }

    const testHistory = labHistoryRes.rows.map((t: any) => ({
      test_name: t.test_name,
      test_code: t.test_code || undefined,
      months_ago: t.months_ago,
    }));

    const result = await aiService.suggestPatientTests(
      {
        patientAge: age,
        patientGender: patient.gender || undefined,
        chiefComplaint: complaintRes.rows[0]?.chief_complaint || undefined,
        existingDiagnoses: diagnoses,
        currentMedications: medsRes.rows.map((m: any) => m.medication_name),
        allergies: patient.allergies || undefined,
        latestVitals: vitals,
        testHistory: testHistory.slice(0, 25),
        catalog: catalog.map((c: any) => ({ test_code: c.test_code, test_name: c.test_name, category: c.category })),
      },
      authReq.user?.id
    );

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    // Validate every suggested lab code against the catalog. Anything the model
    // invented is dropped rather than shown — an un-orderable suggestion is
    // worse than no suggestion.
    const byCode = new Map<string, any>(catalog.map((c: any) => [String(c.test_code).toLowerCase(), c]));
    const byName = new Map<string, any>(catalog.map((c: any) => [String(c.test_name).toLowerCase().trim(), c]));
    const lastDone = new Map<string, number>();
    for (const t of testHistory) {
      if (t.test_code) lastDone.set(t.test_code.toLowerCase(), t.months_ago);
      lastDone.set(t.test_name.toLowerCase().trim(), t.months_ago);
    }

    const groundTests = (tests: any[] | undefined) =>
      (Array.isArray(tests) ? tests : [])
        .map((t: any) => {
          const match =
            byCode.get(String(t.test_code || '').toLowerCase()) ||
            byName.get(String(t.test_name || '').toLowerCase().trim());
          if (!match) return null;
          const months =
            lastDone.get(String(match.test_code).toLowerCase()) ??
            lastDone.get(String(match.test_name).toLowerCase().trim());
          return {
            test_name: match.test_name,
            test_code: match.test_code,
            category: match.category || null,
            base_price: match.base_price != null ? Number(match.base_price) : null,
            priority: ['routine', 'urgent', 'stat'].includes(t.priority) ? t.priority : 'routine',
            rationale: typeof t.rationale === 'string' ? t.rationale : '',
            interval: typeof t.interval === 'string' ? t.interval : null,
            last_done_months_ago: months ?? null,
          };
        })
        .filter(Boolean);

    const data = result.data || {};
    const visit_tests = groundTests(data.visit_tests);
    const screening_tests = groundTests(data.screening_tests);
    // Same test in both lists reads as a bug to a clinician — the visit reason wins.
    const visitCodes = new Set(visit_tests.map((t: any) => t.test_code));

    res.json({
      patient: { age: age ?? null, gender: patient.gender || null },
      visit_tests,
      screening_tests: screening_tests.filter((t: any) => !visitCodes.has(t.test_code)),
      imaging_tests: (Array.isArray(data.imaging_tests) ? data.imaging_tests : []).slice(0, 2),
      clinical_note: typeof data.clinical_note === 'string' ? data.clinical_note : '',
      cached: !!result.cached,
    });
  } catch (error: any) {
    console.error('Patient test suggestion error:', error);
    res.status(500).json({ error: 'Failed to get test suggestions' });
  }
};
