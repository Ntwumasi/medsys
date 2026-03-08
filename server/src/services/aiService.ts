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
};

export default aiService;
