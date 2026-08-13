import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import pool from '../database/db';
import aiService from '../services/aiService';
import { getPatientTestSuggestions } from '../controllers/aiController';

const mockResponse = () => {
  const res: Partial<Response> = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as Response;
};

const mockRequest = (params = {}, query = {}) =>
  ({ params, query, user: { id: 1, role: 'doctor' } } as unknown as Request);

const CATALOG = [
  { test_code: 'FBC', test_name: 'Full Blood Count', category: 'Haematology', base_price: '50.00' },
  { test_code: 'LIPID', test_name: 'Lipid Profile', category: 'Chemistry', base_price: '120.00' },
  { test_code: 'HBA1C', test_name: 'HbA1c', category: 'Chemistry', base_price: '150.00' },
];

/**
 * Feeds the six parallel queries getPatientTestSuggestions runs, in order:
 * patient, diagnoses, meds, lab history, vitals, catalog (+ optional complaint).
 */
const mockQueries = (opts: { labHistory?: any[] } = {}) => {
  vi.mocked(pool.query)
    .mockResolvedValueOnce({ rows: [{ date_of_birth: '1980-01-01', gender: 'female', allergies: null,
      other_health_conditions: null, hiv_status: null, hepatitis_b_status: null,
      hepatitis_c_status: null, tb_status: null, sickle_cell_status: null }] } as any)
    .mockResolvedValueOnce({ rows: [{ diagnosis_description: 'diabetes' }] } as any)
    .mockResolvedValueOnce({ rows: [{ medication_name: 'TAB METFORMIN 500MG' }] } as any)
    .mockResolvedValueOnce({ rows: opts.labHistory ?? [] } as any)
    .mockResolvedValueOnce({ rows: [] } as any)
    .mockResolvedValueOnce({ rows: CATALOG } as any);
};

describe('getPatientTestSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(aiService, 'isAvailable').mockReturnValue(true);
  });

  it('drops suggested tests whose code is not in the lab catalog', async () => {
    mockQueries();
    vi.spyOn(aiService, 'suggestPatientTests').mockResolvedValue({
      success: true,
      data: {
        visit_tests: [
          { test_name: 'Full Blood Count', test_code: 'FBC', priority: 'routine', rationale: 'real' },
          { test_name: 'Unobtainium Panel', test_code: 'MADEUP', priority: 'stat', rationale: 'hallucinated' },
        ],
        screening_tests: [],
        imaging_tests: [],
        clinical_note: '',
      },
    });

    const res = mockResponse();
    await getPatientTestSuggestions(mockRequest({ id: '1026' }), res);

    const payload = vi.mocked(res.json).mock.calls[0][0];
    expect(payload.visit_tests).toHaveLength(1);
    expect(payload.visit_tests[0].test_code).toBe('FBC');
    expect(payload.visit_tests[0].base_price).toBe(50);
  });

  it('matches on test name when the model returns a wrong code, using the catalog name/code', async () => {
    mockQueries();
    vi.spyOn(aiService, 'suggestPatientTests').mockResolvedValue({
      success: true,
      data: {
        visit_tests: [{ test_name: 'lipid profile', test_code: 'WRONG', priority: 'routine', rationale: 'x' }],
        screening_tests: [],
        imaging_tests: [],
        clinical_note: '',
      },
    });

    const res = mockResponse();
    await getPatientTestSuggestions(mockRequest({ id: '1026' }), res);

    const payload = vi.mocked(res.json).mock.calls[0][0];
    expect(payload.visit_tests[0].test_code).toBe('LIPID');
    expect(payload.visit_tests[0].test_name).toBe('Lipid Profile');
  });

  it('annotates how long ago a suggested test was last done', async () => {
    mockQueries({ labHistory: [{ test_name: 'HbA1c', test_code: 'HBA1C', months_ago: 2 }] });
    vi.spyOn(aiService, 'suggestPatientTests').mockResolvedValue({
      success: true,
      data: {
        visit_tests: [],
        screening_tests: [{ test_name: 'HbA1c', test_code: 'HBA1C', rationale: 'diabetic monitoring', interval: 'every 3 months' }],
        imaging_tests: [],
        clinical_note: '',
      },
    });

    const res = mockResponse();
    await getPatientTestSuggestions(mockRequest({ id: '1026' }), res);

    const payload = vi.mocked(res.json).mock.calls[0][0];
    expect(payload.screening_tests[0].last_done_months_ago).toBe(2);
    expect(payload.screening_tests[0].interval).toBe('every 3 months');
  });

  it('does not list the same test under both visit and screening', async () => {
    mockQueries();
    vi.spyOn(aiService, 'suggestPatientTests').mockResolvedValue({
      success: true,
      data: {
        visit_tests: [{ test_name: 'Full Blood Count', test_code: 'FBC', priority: 'urgent', rationale: 'a' }],
        screening_tests: [{ test_name: 'Full Blood Count', test_code: 'FBC', rationale: 'b' }],
        imaging_tests: [],
        clinical_note: '',
      },
    });

    const res = mockResponse();
    await getPatientTestSuggestions(mockRequest({ id: '1026' }), res);

    const payload = vi.mocked(res.json).mock.calls[0][0];
    expect(payload.visit_tests).toHaveLength(1);
    expect(payload.screening_tests).toHaveLength(0);
  });

  it('returns 503 rather than an error card when AI is unconfigured', async () => {
    vi.spyOn(aiService, 'isAvailable').mockReturnValue(false);
    const res = mockResponse();
    await getPatientTestSuggestions(mockRequest({ id: '1026' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejects a non-numeric patient id', async () => {
    const res = mockResponse();
    await getPatientTestSuggestions(mockRequest({ id: 'abc' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
