import { describe, it, expect } from 'vitest';
import { isSensitiveClinical } from '../utils/sensitiveResults';

// Real test names from prod lab_orders.
const SENSITIVE = [
  'hbsAg', 'VDRL', 'Retroscreen', 'RETRO CONFIRMATION', 'hepatitis b surface antigen', 'HVS RE', 'upt',
  'B-HCG', 'Serum Beta-HCG', 'Hepatitis B screening test (HbsAg)', 'sti screen', 'SERUM hcg', 'HVS C/S',
  'HIV 1 and 11', 'Hep BsAg', 'PCR CHLAMYDIA TRACHOMATIS', 'RPR + TPHA SCREEN', 'HEP B AND C ',
  'Urethral swab for CS', 'PAP SMEAR TEST', 'Hep B sAg', 'b-HCG QUANTITATIVE', 'syphilis ', 'hvs re',
  'retroscreen, hep B profile', 'Serum Pregnancy Test', 'HCV screening', 'HEPATITIS C', 'HIV ',
  'HIV I & II', 'chlamydia test', 'Urine Pregnancy Test', 'TPHA', 'serum B-hcg', 'HIV rapid + ELISA',
  'Hep B viral load', 'high vaginal swab for culture/sensitivity', 'Hep B profile ', 'hvs r/e &c/s',
  'HIV disease', 'Threatened miscarriage',
];
const NOT_SENSITIVE = [
  'fasting blood sugar', 'fasting lipids', 'non fasting lipids', 'Fasting Lipid Profile', 'FASTING INSULIN',
  'Full blood count', 'FBC', 'Urine R/E', 'Malaria RDT', 'HbA1c', 'Hb electrophoresis', 'Hepatic function test',
  'Liver function test', 'BUE & Cr', 'Widal', 'Stool R/E', 'Hypertension', 'Malaria', 'Thyroid function',
];

describe('isSensitiveClinical', () => {
  it.each(SENSITIVE)('flags %s', (name) => expect(isSensitiveClinical(name)).toBe(true));
  it.each(NOT_SENSITIVE)('leaves %s alone', (name) => expect(isSensitiveClinical(name)).toBe(false));
});

import { vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockResponse } from './helpers';
vi.mock('../controllers/labInventoryController', () => ({ loadLabOrderParameters: vi.fn().mockResolvedValue({ parameters: [] }) }));
import { getPortalLabs } from '../controllers/patientPortalRecordsController';

describe('portal results: sensitive tests wait for the doctor', () => {
  beforeEach(() => vi.mocked(pool.query).mockReset());
  const old = new Date(Date.now() - 10 * 86400000).toISOString();
  const lab = (over: Record<string, unknown>) => ({
    id: 1, test_name: 'Retroscreen', status: 'completed', ordered_date: old, result_date: old, ordered_by: 'Dr A',
    finalised_at: old, doctor_reviewed: false, doctor_reviewed_at: null, release_state: 'released',
    available_by: old, released_at: old, result: 'Non-reactive', ...over,
  });
  const run = async (rows: any[]) => {
    vi.mocked(pool.query).mockImplementation((async (q: any) => {
      const sql = String(typeof q === 'string' ? q : q?.text ?? '');
      if (sql.includes('FROM patients WHERE user_id')) return { rows: [{ id: 7 }] };
      if (sql.includes('FROM lab_orders lo')) return { rows };
      return { rows: [] };
    }) as any);
    const res = mockResponse();
    await getPortalLabs({ user: { id: 70, role: 'patient' } } as any, res);
    return res.json.mock.calls[0][0].labs;
  };

  it('holds an unreviewed HIV result past 3 days and hides its name', async () => {
    const [l] = await run([lab({})]);
    expect(l.release_state).toBe('awaiting_review');
    expect(l.result).toBeNull();
    expect(l.test_name).toBe('Confidential test');
    expect(l.available_by).toBeNull();
  });

  it('releases it once a doctor has reviewed it', async () => {
    const [l] = await run([lab({ doctor_reviewed: true, doctor_reviewed_at: old })]);
    expect(l.release_state).toBe('released');
    expect(l.result).toBe('Non-reactive');
    expect(l.test_name).toBe('Retroscreen');
  });

  it('leaves ordinary tests on the 3-day rule', async () => {
    const [l] = await run([lab({ test_name: 'Full blood count' })]);
    expect(l.release_state).toBe('released');
    expect(l.test_name).toBe('Full blood count');
  });
});
