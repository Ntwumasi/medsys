import apiClient from './client';

// Typed client for the pharmacy/clinical AI endpoints (server: aiController).
// Every endpoint returns 503 when OPENAI_API_KEY is unset — callers should
// treat that as "AI unavailable" and degrade gracefully, never as a hard error.

export interface DosageVerifyResult {
  isAppropriate: boolean;
  confidence: 'high' | 'medium' | 'low';
  normalRange?: { min: string; max: string; frequency: string };
  prescribedDailyDose?: string;
  maxDailyDose?: string;
  concerns: string[];
  recommendations: string[];
  requiresReview: boolean;
  reviewReason?: string | null;
  cached?: boolean;
}

export interface SubstitutionAlternative {
  genericName: string;
  brandName: string;
  equivalenceLevel: string;
  keyDifferences: string;
  rationale: string;
  contraindications: string[];
  approximateCost: 'lower' | 'similar' | 'higher' | string;
  recommended: boolean;
}
export interface SubstitutionResult {
  originalMedication: string;
  therapeuticClass: string;
  alternatives: SubstitutionAlternative[];
  notes?: string;
  cached?: boolean;
}

export interface CounselingResult {
  medicationName: string;
  howToTake: string;
  timing: string;
  withFood: string;
  commonSideEffects: string[];
  seriousSideEffects: string[];
  storage: string;
  missedDose: string;
  lifestyleNotes: string[];
  warnings: string[];
  patientFriendlySummary: string;
  cached?: boolean;
}

export interface InteractionExplainResult {
  explanation: string;
  clinicalEffects: string[];
  riskLevel: string;
  recommendations: string[];
  alternatives: Array<{ name: string; rationale: string }>;
  monitoring: string[];
  cached?: boolean;
}

export interface VoiceCommandResult {
  understood: boolean;
  action: 'dispense' | 'check_stock' | 'search_patient' | 'search_medication' | 'unknown' | string;
  medication: string | null;
  quantity: number | null;
  patient: { searchTerm: string | null; matchedId: number | null };
  specialInstructions: string | null;
  confirmationPrompt: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Thrown/returned when the AI service isn't configured (HTTP 503). */
export class AIUnavailableError extends Error {
  constructor(message = 'AI service is not configured') {
    super(message);
    this.name = 'AIUnavailableError';
  }
}

// Narrow an axios error into AIUnavailableError for a clean UI branch.
function rethrow(err: any): never {
  if (err?.response?.status === 503) {
    throw new AIUnavailableError(err.response?.data?.error);
  }
  throw err;
}

export const aiApi = {
  isUnavailable(err: unknown): err is AIUnavailableError {
    return err instanceof AIUnavailableError;
  },

  async verifyDosage(body: {
    medication: string;
    dosage: string;
    frequency: string;
    patientAge?: number;
    patientWeight?: number;
    renalFunction?: string;
    hepaticFunction?: string;
  }): Promise<DosageVerifyResult> {
    try {
      const { data } = await apiClient.post('/ai/dosage-verify', body);
      return data;
    } catch (err) {
      return rethrow(err);
    }
  },

  async suggestSubstitutions(body: {
    medication: string;
    reason: string;
    patientAllergies?: string[];
    patientConditions?: string[];
    preferGeneric?: boolean;
  }): Promise<SubstitutionResult> {
    try {
      const { data } = await apiClient.post('/ai/substitutions', body);
      return data;
    } catch (err) {
      return rethrow(err);
    }
  },

  async generateCounseling(body: {
    medication: string;
    dosage: string;
    frequency: string;
    route: string;
    patientName?: string;
    conditions?: string[];
    otherMedications?: string[];
  }): Promise<CounselingResult> {
    try {
      const { data } = await apiClient.post('/ai/counseling', body);
      return data;
    } catch (err) {
      return rethrow(err);
    }
  },

  async explainDrugInteraction(body: {
    drug1: string;
    drug2: string;
    patientAge?: number;
    patientConditions?: string[];
    existingInteraction?: { severity: string; description: string };
  }): Promise<InteractionExplainResult> {
    try {
      const { data } = await apiClient.post('/ai/drug-interactions', body);
      return data;
    } catch (err) {
      return rethrow(err);
    }
  },

  async parseVoiceCommand(body: {
    transcript: string;
    includeContext?: boolean;
  }): Promise<VoiceCommandResult> {
    try {
      const { data } = await apiClient.post('/ai/voice-command', body);
      return data;
    } catch (err) {
      return rethrow(err);
    }
  },
};

export default aiApi;
