import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../services/priceResolutionService', () => ({
  resolvePrice: vi.fn().mockResolvedValue({ unitPrice: 200, isExcluded: false, priceSource: 'cash' }),
}));

import auditService from '../services/auditService';
import { resolvePrice } from '../services/priceResolutionService';
import { updatePatientPayerSources } from '../controllers/payerSourcesController';

/**
 * Lilian Apea Armah (2026-11): switched from Acacia to cash, but her open
 * invoice stayed addressed to the insurer and could only be "submitted".
 */
const patientWithInsurer = (openInvoices: number[]) => {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const client = {
    query: vi.fn(async (raw: unknown, params: any[] = []) => {
      const sql = String(raw);
      calls.push({ sql, params });
      if (sql.includes('FROM patient_payer_sources WHERE patient_id = $1')) {
        return { rows: [{ id: 581, payer_type: 'insurance', corporate_client_id: null, insurance_provider_id: 3, is_primary: true }] };
      }
      if (sql.includes('INSERT INTO patient_payer_sources')) return { rows: [{ id: 900 }] };
      if (sql.includes('SELECT DISTINCT payer_source_id FROM invoices')) return { rows: [{ payer_source_id: 581 }] };
      if (sql.includes('SELECT i.id FROM invoices i')) return { rows: openInvoices.map((id) => ({ id })) };
      if (sql.includes('charge_master_id IS NOT NULL')) return { rows: [{ id: 6607, charge_master_id: 477, quantity: 1 }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  vi.mocked(pool.connect).mockResolvedValue(client as any);
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
  return calls;
};

describe('changing a patient from insurance to cash', () => {
  beforeEach(() => vi.clearAllMocks());

  it("re-bills the current visit's open invoice to the new payer and audits the change", async () => {
    const calls = patientWithInsurer([1573]);
    const req = mockRequest({ payer_sources: [{ payer_type: 'self_pay', is_primary: true }] }, { patient_id: '970' }, {}, { id: 5 });
    const res = mockResponse();
    await updatePatientPayerSources(req, res);

    expect(res.json).toHaveBeenCalled();
    expect(calls.some((c) => c.sql.includes('UPDATE invoices SET payer_source_id = NULL') && c.params[0] === 1573)).toBe(true);
    expect(resolvePrice).toHaveBeenCalledWith(477, 1573, expect.anything());
    const line = calls.find((c) => c.sql.includes('UPDATE invoice_items SET unit_price'))!;
    expect(line.params).toEqual([6607, 200, 200, 'payer']);
    // The open-invoice query only takes visits still in progress.
    const openSql = calls.find((c) => c.sql.includes('SELECT i.id FROM invoices i'))!.sql;
    expect(openSql).toContain("payer_submitted_at IS NULL");
    expect(openSql).toContain("e.status NOT IN ('completed', 'discharged', 'checked_out', 'cancelled')");
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'patient_payer_sources',
      details: expect.objectContaining({ to: expect.objectContaining({ payer_type: 'self_pay' }), rebilled_invoice_ids: [1573] }),
    }));
  });

  it('does nothing to invoices when the payer is saved unchanged (e.g. at check-in)', async () => {
    const calls = patientWithInsurer([1573]);
    const req = mockRequest({ payer_sources: [{ payer_type: 'insurance', insurance_provider_id: 3, is_primary: true }] }, { patient_id: '970' }, {}, { id: 5 });
    await updatePatientPayerSources(req, mockResponse());
    expect(calls.some((c) => c.sql.includes('SELECT i.id FROM invoices i'))).toBe(false);
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
