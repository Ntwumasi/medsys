import OpenAI from 'openai';
import crypto from 'crypto';
import pool from '../database/db';

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

interface AIResponse {
  success: boolean;
  data?: any;
  error?: string;
  cached?: boolean;
}

interface DrugInteractionAIRequest {
  drug1: string;
  drug2: string;
  patientAge?: number;
  patientConditions?: string[];
  existingInteraction?: {
    severity: string;
    description: string;
  };
}

interface DosageVerificationRequest {
  medication: string;
  dosage: string;
  frequency: string;
  patientAge?: number;
  patientWeight?: number;
  renalFunction?: string;
  hepaticFunction?: string;
}

interface SubstitutionRequest {
  medication: string;
  reason: string;
  patientAllergies?: string[];
  patientConditions?: string[];
  preferGeneric?: boolean;
}

interface CounselingRequest {
  medication: string;
  dosage: string;
  frequency: string;
  route: string;
  patientName?: string;
  conditions?: string[];
  otherMedications?: string[];
}

interface VoiceCommandRequest {
  transcript: string;
  context?: {
    currentPatients?: { id: number; name: string }[];
    availableMedications?: string[];
  };
}

/**
 * Generate a hash for caching identical requests
 */
function generateRequestHash(type: string, data: any): string {
  const normalized = JSON.stringify({ type, ...data });
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 64);
}

/**
 * Check cache for existing response
 */
async function checkCache(type: string, hash: string): Promise<any | null> {
  try {
    const result = await pool.query(
      `SELECT response_data FROM ai_interactions
       WHERE interaction_type = $1 AND request_hash = $2
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [type, hash]
    );
    return result.rows.length > 0 ? result.rows[0].response_data : null;
  } catch (error) {
    console.error('Cache check error:', error);
    return null;
  }
}

/**
 * Save response to cache
 */
async function saveToCache(type: string, hash: string, request: any, response: any, userId?: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_interactions (interaction_type, request_hash, request_data, response_data, user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [type, hash, JSON.stringify(request), JSON.stringify(response), userId || null]
    );
  } catch (error) {
    console.error('Cache save error:', error);
  }
}

export const aiService = {
  /**
   * Check if AI service is available
   */
  isAvailable(): boolean {
    return !!openai;
  },

  /**
   * Summarize staff activity (from audit logs) into a short management narrative
   * for the owners. Returns markdown, or null if AI isn't configured.
   */
  async summarizeStaffActivity(
    period: string,
    employees: Array<{ name: string; role: string; total_actions: number; logins: number; breakdown: Array<{ label: string; count: number }> }>
  ): Promise<string | null> {
    if (!openai || employees.length === 0) return null;
    try {
      const lines = employees.map((e) =>
        `${e.name} (${e.role}): ${e.total_actions} actions, ${e.logins} logins — ${e.breakdown.slice(0, 6).map((b) => `${b.count} ${b.label}`).join(', ')}`
      ).join('\n');
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an operations analyst for a medical clinic. Given per-employee activity counts from the EMR audit log for a period, write a concise management summary for the clinic owner: a 1-2 sentence overall productivity overview, then a short bullet per employee describing what they focused on. Be factual, neutral, and specific to the data. Markdown.' },
          { role: 'user', content: `Period: ${period}\n\nActivity:\n${lines}` },
        ],
        temperature: 0.3,
        max_tokens: 700,
      });
      return completion.choices[0].message.content || null;
    } catch (error) {
      console.error('summarizeStaffActivity AI error:', error);
      return null;
    }
  },

  /**
   * Map a free-typed lab test name to the best matching catalog test_code.
   * Returns the test_code (string) or null if no confident match. Used to make
   * lab billing exact without forcing doctors to pick from a list.
   */
  async mapTestNameToCatalog(
    typedName: string,
    candidates: Array<{ test_code: string; test_name: string }>
  ): Promise<string | null> {
    if (!openai || !typedName || candidates.length === 0) return null;
    try {
      const list = candidates.map((c) => `${c.test_code}: ${c.test_name}`).join('\n');
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You map a clinician\'s free-typed lab test name to the single best matching catalog test. Respond ONLY with JSON {"test_code": string|null, "confident": boolean}. Use null if no clear match.' },
          { role: 'user', content: `Typed test: "${typedName}"\n\nCatalog (code: name):\n${list}\n\nReturn the test_code of the best match, with confident=true only if you are sure.` },
        ],
        temperature: 0,
        max_tokens: 60,
        response_format: { type: 'json_object' },
      });
      const r = JSON.parse(completion.choices[0].message.content || '{}');
      if (r && r.confident && r.test_code && candidates.some((c) => c.test_code === r.test_code)) {
        return r.test_code as string;
      }
      return null;
    } catch (error) {
      console.error('mapTestNameToCatalog AI error:', error);
      return null;
    }
  },

  /**
   * Get AI explanation for drug interaction
   */
  async explainDrugInteraction(request: DrugInteractionAIRequest, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('drug_interaction', request);
    const cached = await checkCache('drug_interaction', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = `You are a clinical pharmacist AI assistant. Explain the following drug interaction in plain language that both pharmacists and patients can understand.

Drug 1: ${request.drug1}
Drug 2: ${request.drug2}
${request.patientAge ? `Patient Age: ${request.patientAge} years` : ''}
${request.patientConditions?.length ? `Patient Conditions: ${request.patientConditions.join(', ')}` : ''}
${request.existingInteraction ? `
Known Interaction:
- Severity: ${request.existingInteraction.severity}
- Description: ${request.existingInteraction.description}
` : ''}

Provide:
1. A clear explanation of why these drugs interact (2-3 sentences)
2. Potential clinical effects (bullet points)
3. Risk level assessment (low/moderate/high/contraindicated)
4. Recommendations for the pharmacist
5. Alternative medications if applicable (up to 3)
6. Monitoring parameters

Format your response as JSON with these fields:
{
  "explanation": "string",
  "clinicalEffects": ["string"],
  "riskLevel": "string",
  "recommendations": ["string"],
  "alternatives": [{"name": "string", "rationale": "string"}],
  "monitoring": ["string"]
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a clinical pharmacist AI assistant providing drug interaction analysis. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      await saveToCache('drug_interaction', hash, request, response, userId);

      return { success: true, data: response };
    } catch (error: any) {
      console.error('Drug interaction AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },

  /**
   * Screen a full medication list for clinically significant drug–drug
   * interactions. Used by the patient Medications view (doctor + pharmacy),
   * combining prescribed/dispensed meds with home meds documented in the SOAP.
   * Returns { available:false } when AI isn't configured so the UI can degrade
   * gracefully. Tolerant of noisy free-text names (e.g. "TAB PREDNISOLONE 5MG").
   */
  async screenMedicationInteractions(
    medications: string[],
    context?: { patientAge?: number; conditions?: string[]; allergies?: string },
    userId?: number
  ): Promise<{
    available: boolean;
    interactions: Array<{ drug1: string; drug2: string; severity: string; description: string; recommendation: string }>;
    summary?: string;
    cached?: boolean;
  }> {
    const meds = Array.from(new Set(medications.map((m) => (m || '').trim()).filter(Boolean)));
    if (!openai || meds.length < 2) {
      return { available: !!openai, interactions: [] };
    }

    const request = { medications: meds.map((m) => m.toLowerCase()).sort(), context };
    const hash = generateRequestHash('med_interaction_screen', request);
    const cached = await checkCache('med_interaction_screen', hash);
    if (cached) {
      return { available: true, interactions: cached.interactions || [], summary: cached.summary, cached: true };
    }

    try {
      const prompt = `You are a clinical pharmacist AI. Review this patient's current medication list and identify clinically significant drug–drug interactions.

Medications (may include dosage/form noise — extract the active drug):
${meds.map((m, i) => `${i + 1}. ${m}`).join('\n')}
${context?.patientAge ? `\nPatient age: ${context.patientAge} years` : ''}
${context?.conditions?.length ? `\nConditions: ${context.conditions.join(', ')}` : ''}
${context?.allergies ? `\nAllergies: ${context.allergies}` : ''}

Report ONLY real, clinically meaningful interactions between pairs that are actually on this list. Avoid false positives and trivial interactions. If there are none, return an empty interactions array.

Respond as JSON:
{
  "interactions": [
    { "drug1": "string", "drug2": "string", "severity": "minor|moderate|major|contraindicated", "description": "1-2 sentence clinical effect", "recommendation": "what the clinician should do" }
  ],
  "summary": "one-sentence overall assessment"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a clinical pharmacist AI screening medication lists for drug-drug interactions. Always respond with valid JSON. Be precise and avoid false positives.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      });

      const parsed = JSON.parse(completion.choices[0].message.content || '{}');
      const response = {
        interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      };
      await saveToCache('med_interaction_screen', hash, request, response, userId);
      return { available: true, ...response };
    } catch (error: any) {
      console.error('Medication interaction screen AI error:', error);
      return { available: true, interactions: [], summary: '' };
    }
  },

  /**
   * Verify medication dosage
   */
  async verifyDosage(request: DosageVerificationRequest, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('dosage_verify', request);
    const cached = await checkCache('dosage_verify', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = `You are a clinical pharmacist AI assistant. Verify if the following medication dosage is appropriate.

Medication: ${request.medication}
Prescribed Dosage: ${request.dosage}
Frequency: ${request.frequency}
${request.patientAge ? `Patient Age: ${request.patientAge} years` : ''}
${request.patientWeight ? `Patient Weight: ${request.patientWeight} kg` : ''}
${request.renalFunction ? `Renal Function: ${request.renalFunction}` : ''}
${request.hepaticFunction ? `Hepatic Function: ${request.hepaticFunction}` : ''}

Analyze and provide:
1. Is this dosage within normal therapeutic range?
2. Any concerns based on patient factors?
3. Recommended dose adjustments if needed
4. Maximum safe daily dose for reference

Format your response as JSON:
{
  "isAppropriate": boolean,
  "confidence": "high" | "medium" | "low",
  "normalRange": {"min": "string", "max": "string", "frequency": "string"},
  "prescribedDailyDose": "string",
  "maxDailyDose": "string",
  "concerns": ["string"],
  "recommendations": ["string"],
  "requiresReview": boolean,
  "reviewReason": "string" | null
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a clinical pharmacist AI assistant specializing in dosage verification. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      await saveToCache('dosage_verify', hash, request, response, userId);

      return { success: true, data: response };
    } catch (error: any) {
      console.error('Dosage verification AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },

  /**
   * Get medication substitution suggestions
   */
  async suggestSubstitutions(request: SubstitutionRequest, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('substitution', request);
    const cached = await checkCache('substitution', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = `You are a clinical pharmacist AI assistant. Suggest alternative medications for the following:

Medication Needed: ${request.medication}
Reason for Substitution: ${request.reason}
${request.patientAllergies?.length ? `Patient Allergies: ${request.patientAllergies.join(', ')}` : ''}
${request.patientConditions?.length ? `Patient Conditions: ${request.patientConditions.join(', ')}` : ''}
${request.preferGeneric ? 'Prefer generic alternatives if available.' : ''}

Provide up to 5 alternative medications with:
1. Drug name (generic and brand)
2. Therapeutic equivalence level
3. Key differences from original
4. Why it's a good alternative
5. Any contraindications to consider

Format your response as JSON:
{
  "originalMedication": "string",
  "therapeuticClass": "string",
  "alternatives": [
    {
      "genericName": "string",
      "brandName": "string",
      "equivalenceLevel": "therapeutic equivalent" | "similar mechanism" | "same class",
      "keyDifferences": "string",
      "rationale": "string",
      "contraindications": ["string"],
      "approximateCost": "lower" | "similar" | "higher",
      "recommended": boolean
    }
  ],
  "notes": "string"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a clinical pharmacist AI assistant specializing in medication substitution. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      await saveToCache('substitution', hash, request, response, userId);

      return { success: true, data: response };
    } catch (error: any) {
      console.error('Substitution AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },

  /**
   * Generate patient counseling instructions
   */
  async generateCounseling(request: CounselingRequest, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('counseling', request);
    const cached = await checkCache('counseling', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = `You are a pharmacist providing medication counseling to a patient. Generate clear, patient-friendly instructions.

Medication: ${request.medication}
Dosage: ${request.dosage}
Frequency: ${request.frequency}
Route: ${request.route}
${request.patientName ? `Patient: ${request.patientName}` : ''}
${request.conditions?.length ? `Patient Conditions: ${request.conditions.join(', ')}` : ''}
${request.otherMedications?.length ? `Other Medications: ${request.otherMedications.join(', ')}` : ''}

Generate counseling points including:
1. How to take the medication (clear instructions)
2. Best time to take it
3. Food interactions (take with food, avoid certain foods, etc.)
4. Common side effects to expect
5. Serious side effects requiring medical attention
6. Storage instructions
7. What to do if a dose is missed
8. Any lifestyle considerations

Format your response as JSON:
{
  "medicationName": "string",
  "howToTake": "string",
  "timing": "string",
  "withFood": "string",
  "commonSideEffects": ["string"],
  "seriousSideEffects": ["string"],
  "storage": "string",
  "missedDose": "string",
  "lifestyleNotes": ["string"],
  "warnings": ["string"],
  "patientFriendlySummary": "string"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a friendly pharmacist providing medication counseling. Use simple, clear language that patients can easily understand. Avoid medical jargon. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      await saveToCache('counseling', hash, request, response, userId);

      return { success: true, data: response };
    } catch (error: any) {
      console.error('Counseling AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },

  /**
   * Parse voice command for dispensing
   */
  async parseVoiceCommand(request: VoiceCommandRequest, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    try {
      const prompt = `You are a pharmacy voice assistant. Parse the following voice command into a structured dispensing action.

Voice Command: "${request.transcript}"

${request.context?.currentPatients ? `
Available Patients:
${request.context.currentPatients.map(p => `- ID ${p.id}: ${p.name}`).join('\n')}
` : ''}

${request.context?.availableMedications ? `
Available Medications: ${request.context.availableMedications.join(', ')}
` : ''}

Parse the command and extract:
1. Action type (dispense, check, search, etc.)
2. Medication name (if mentioned)
3. Quantity (if mentioned)
4. Patient name or ID (if mentioned)
5. Any special instructions

Format your response as JSON:
{
  "understood": boolean,
  "action": "dispense" | "check_stock" | "search_patient" | "search_medication" | "unknown",
  "medication": "string" | null,
  "quantity": number | null,
  "patient": {
    "searchTerm": "string" | null,
    "matchedId": number | null
  },
  "specialInstructions": "string" | null,
  "confirmationPrompt": "string",
  "confidence": "high" | "medium" | "low"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a pharmacy voice assistant that parses voice commands for medication dispensing. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      return { success: true, data: response };
    } catch (error: any) {
      console.error('Voice command AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },
  /**
   * Check medication against patient allergies for cross-reactivity
   */
  async checkAllergyInteraction(request: { medication: string; allergies: string }, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('allergy_check', request);
    const cached = await checkCache('allergy_check', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a clinical pharmacology expert. Analyze whether a medication could cause an allergic reaction in a patient with known allergies. Consider:
- Direct matches (same drug)
- Same drug class / chemical family
- Known cross-reactivity patterns (e.g., penicillin allergy and cephalosporins)
- Inactive ingredient risks (e.g., sulfa sensitivity)

Respond with JSON only:
{
  "has_risk": boolean,
  "risks": [
    {
      "related_allergen": "name of the allergen from patient's list",
      "severity": "mild" | "moderate" | "severe",
      "explanation": "brief clinical explanation of the cross-reactivity"
    }
  ]
}

If there is NO meaningful cross-reactivity risk, return: { "has_risk": false, "risks": [] }`
          },
          {
            role: 'user',
            content: `Medication being prescribed: ${request.medication}\n\nPatient's known allergies: ${request.allergies}`
          }
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      const response = content ? JSON.parse(content) : { has_risk: false, risks: [] };

      await saveToCache('allergy_check', hash, request, response, userId);
      return { success: true, data: response };
    } catch (error: any) {
      console.error('Allergy check AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },
  /**
   * Suggest triage priority based on vitals and chief complaint
   */
  async suggestTriagePriority(request: {
    chiefComplaint: string;
    vitals?: {
      temperature?: number;
      heart_rate?: number;
      blood_pressure_systolic?: number;
      blood_pressure_diastolic?: number;
      respiratory_rate?: number;
      oxygen_saturation?: number;
      pain_level?: number;
    };
    patientAge?: number;
    patientGender?: string;
  }, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('triage_priority', request);
    const cached = await checkCache('triage_priority', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const vitalsStr = request.vitals ? Object.entries(request.vitals)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') : 'No vitals recorded yet';

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an emergency triage nurse AI assistant. Based on the patient's chief complaint and vital signs, suggest a triage priority level.

Priority levels:
- "green" (Stable): Non-urgent, can wait safely
- "yellow" (Urgent): Needs attention soon, potential for deterioration
- "red" (Critical): Immediate attention required, life-threatening

Respond with JSON only:
{
  "suggested_priority": "green" | "yellow" | "red",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief 1-2 sentence clinical reasoning",
  "key_concerns": ["Up to 3 specific concerns that influenced the priority"],
  "recommended_actions": ["Up to 3 immediate actions the nurse should consider"]
}`
          },
          {
            role: 'user',
            content: `Chief Complaint: ${request.chiefComplaint}
Vitals: ${vitalsStr}
${request.patientAge ? `Age: ${request.patientAge}` : ''}
${request.patientGender ? `Gender: ${request.patientGender}` : ''}`
          }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      await saveToCache('triage_priority', hash, request, response, userId);
      return { success: true, data: response };
    } catch (error: any) {
      console.error('Triage suggestion AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },

  /**
   * Suggest lab/imaging tests based on chief complaint and patient history
   */
  async suggestTests(request: {
    chiefComplaint: string;
    patientAge?: number;
    patientGender?: string;
    existingDiagnoses?: string[];
    currentMedications?: string[];
    recentLabTests?: string[];
  }, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('test_suggestion', request);
    const cached = await checkCache('test_suggestion', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a clinical decision support AI. Based on the patient's chief complaint and history, suggest relevant laboratory and imaging tests that would help with diagnosis.

Respond with JSON only:
{
  "lab_tests": [
    {
      "test_name": "Full Blood Count",
      "test_code": "FBC",
      "priority": "routine" | "urgent" | "stat",
      "rationale": "Brief reason why this test is relevant"
    }
  ],
  "imaging_tests": [
    {
      "study_type": "X-Ray",
      "body_part": "Chest",
      "priority": "routine" | "urgent" | "stat",
      "rationale": "Brief reason"
    }
  ],
  "clinical_note": "Brief overall assessment of what to rule out (1-2 sentences)"
}

Only suggest tests that are clinically relevant. Limit to 5 lab tests and 2 imaging tests maximum.`
          },
          {
            role: 'user',
            content: `Chief Complaint: ${request.chiefComplaint}
${request.patientAge ? `Age: ${request.patientAge}` : ''}
${request.patientGender ? `Gender: ${request.patientGender}` : ''}
${request.existingDiagnoses?.length ? `Existing Diagnoses: ${request.existingDiagnoses.join(', ')}` : ''}
${request.currentMedications?.length ? `Current Medications: ${request.currentMedications.join(', ')}` : ''}
${request.recentLabTests?.length ? `Recent Lab Tests (already done): ${request.recentLabTests.join(', ')}` : ''}`
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      await saveToCache('test_suggestion', hash, request, response, userId);
      return { success: true, data: response };
    } catch (error: any) {
      console.error('Test suggestion AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },

  /**
   * Generate encounter discharge summary from clinical data
   */
  async generateEncounterSummary(request: {
    patientName: string;
    patientAge?: number;
    chiefComplaint: string;
    vitals?: Record<string, unknown>;
    diagnoses?: string[];
    clinicalNotes?: string[];
    labResults?: { test_name: string; result?: string; status: string }[];
    imagingResults?: { study_type: string; body_part: string; status: string }[];
    medications?: { name: string; dosage: string; frequency: string }[];
    procedures?: { name: string; status: string }[];
  }, userId?: number): Promise<AIResponse> {
    if (!openai) {
      return { success: false, error: 'AI service not configured' };
    }

    const hash = generateRequestHash('encounter_summary', request);
    const cached = await checkCache('encounter_summary', hash);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a medical documentation AI assistant. Generate a concise, professional discharge summary from the clinical encounter data provided.

Respond with JSON:
{
  "summary": "A concise narrative summary (3-5 sentences) covering presentation, key findings, diagnosis, and treatment plan",
  "key_findings": ["Up to 5 key clinical findings"],
  "discharge_instructions": ["Up to 5 patient instructions"],
  "follow_up_recommendation": "Brief follow-up recommendation if applicable"
}`
          },
          {
            role: 'user',
            content: `Patient: ${request.patientName}${request.patientAge ? ` (Age: ${request.patientAge})` : ''}
Chief Complaint: ${request.chiefComplaint}
${request.vitals ? `Vitals: ${JSON.stringify(request.vitals)}` : ''}
${request.diagnoses?.length ? `Diagnoses: ${request.diagnoses.join(', ')}` : ''}
${request.clinicalNotes?.length ? `Clinical Notes:\n${request.clinicalNotes.join('\n')}` : ''}
${request.labResults?.length ? `Lab Results: ${request.labResults.map(l => `${l.test_name}: ${l.result || l.status}`).join(', ')}` : ''}
${request.imagingResults?.length ? `Imaging: ${request.imagingResults.map(i => `${i.study_type} ${i.body_part}: ${i.status}`).join(', ')}` : ''}
${request.medications?.length ? `Medications: ${request.medications.map(m => `${m.name} ${m.dosage} ${m.frequency}`).join(', ')}` : ''}
${request.procedures?.length ? `Procedures: ${request.procedures.map(p => `${p.name}: ${p.status}`).join(', ')}` : ''}`
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      await saveToCache('encounter_summary', hash, request, response, userId);
      return { success: true, data: response };
    } catch (error: any) {
      console.error('Encounter summary AI error:', error);
      return { success: false, error: error.message || 'AI processing failed' };
    }
  },
};

export default aiService;
