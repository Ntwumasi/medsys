import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shared axios client that ai.ts posts through.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/client', () => ({ default: { post } }));

import aiApi, { AIUnavailableError } from '../api/ai';

describe('aiApi', () => {
  beforeEach(() => post.mockReset());

  it('verifyDosage posts the right payload to /ai/dosage-verify and returns data', async () => {
    post.mockResolvedValueOnce({
      data: { isAppropriate: true, confidence: 'high', concerns: [], recommendations: [], requiresReview: false },
    });
    const body = { medication: 'Amoxicillin', dosage: '500mg', frequency: 'TID', patientAge: 40 };
    const res = await aiApi.verifyDosage(body);
    expect(post).toHaveBeenCalledWith('/ai/dosage-verify', body);
    expect(res.isAppropriate).toBe(true);
  });

  it('suggestSubstitutions posts to /ai/substitutions', async () => {
    post.mockResolvedValueOnce({ data: { originalMedication: 'X', therapeuticClass: 'Y', alternatives: [] } });
    const body = { medication: 'X', reason: 'out of stock', patientAllergies: ['Penicillin'], preferGeneric: true };
    await aiApi.suggestSubstitutions(body);
    expect(post).toHaveBeenCalledWith('/ai/substitutions', body);
  });

  it('generateCounseling posts to /ai/counseling', async () => {
    post.mockResolvedValueOnce({ data: { medicationName: 'X', howToTake: '', timing: '', withFood: '', commonSideEffects: [], seriousSideEffects: [], storage: '', missedDose: '', lifestyleNotes: [], warnings: [], patientFriendlySummary: '' } });
    const body = { medication: 'X', dosage: '1', frequency: 'OD', route: 'PO' };
    await aiApi.generateCounseling(body);
    expect(post).toHaveBeenCalledWith('/ai/counseling', body);
  });

  it('explainDrugInteraction posts to /ai/drug-interactions', async () => {
    post.mockResolvedValueOnce({ data: { explanation: '', clinicalEffects: [], riskLevel: 'moderate', recommendations: [], alternatives: [], monitoring: [] } });
    const body = { drug1: 'A', drug2: 'B' };
    await aiApi.explainDrugInteraction(body);
    expect(post).toHaveBeenCalledWith('/ai/drug-interactions', body);
  });

  it('parseVoiceCommand posts to /ai/voice-command', async () => {
    post.mockResolvedValueOnce({ data: { understood: true, action: 'dispense', medication: 'X', quantity: 10, patient: { searchTerm: 'Kwame', matchedId: null }, specialInstructions: null, confirmationPrompt: 'ok?', confidence: 'high' } });
    const body = { transcript: 'dispense 10 X for Kwame', includeContext: true };
    const res = await aiApi.parseVoiceCommand(body);
    expect(post).toHaveBeenCalledWith('/ai/voice-command', body);
    expect(res.action).toBe('dispense');
  });

  it('maps a 503 (no OPENAI_API_KEY) to AIUnavailableError — the graceful-degradation branch', async () => {
    post.mockRejectedValueOnce({ response: { status: 503, data: { error: 'AI service not available' } } });
    await expect(
      aiApi.verifyDosage({ medication: 'X', dosage: '1', frequency: 'OD' })
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it('rethrows non-503 errors unchanged (real failures still surface)', async () => {
    const err = { response: { status: 500, data: { error: 'boom' } } };
    post.mockRejectedValueOnce(err);
    await expect(aiApi.suggestSubstitutions({ medication: 'X', reason: 'y' })).rejects.toBe(err);
  });

  it('isUnavailable narrows only AIUnavailableError', () => {
    expect(aiApi.isUnavailable(new AIUnavailableError())).toBe(true);
    expect(aiApi.isUnavailable(new Error('other'))).toBe(false);
  });
});
