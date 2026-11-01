import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/patientAutoTextService', () => ({
  textHomeVisitOnTheWay: vi.fn(),
  textVisitSummary: vi.fn(),
}));
vi.mock('../services/billingService', () => ({ default: { generateEncounterInvoice: vi.fn() } }));
vi.mock('../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../services/invoiceResolver', () => ({ getOrCreateEncounterInvoice: vi.fn().mockResolvedValue(900) }));
vi.mock('../services/priceResolutionService', () => ({
  resolvePrice: vi.fn(async (chargeId: number) => ({ unitPrice: chargeId === 542 ? 800 : 500, isExcluded: false })),
}));

import { startHomeVisit } from '../controllers/homeVisitController';
import { createAppointment } from '../controllers/appointmentController';

const appt = (over: Record<string, unknown> = {}) => ({
  id: 7, location_type: 'home', status: 'scheduled', patient_id: 55, provider_id: 3, nurse_id: null,
  encounter_id: null, reason: 'BP review', ...over,
});

// Transaction client that knows one appointment and whether the patient had
// an earlier home visit; records every statement.
const fakeClient = (a: Record<string, unknown> | null, hadHomeVisit = false) => {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const client = {
    query: vi.fn(async (raw: unknown, params: any[] = []) => {
      const sql = String(raw);
      calls.push({ sql, params });
      if (sql.includes('FROM appointments WHERE id = $1 FOR UPDATE')) return { rows: a ? [a] : [] };
      if (sql.includes('INSERT INTO encounters')) return { rows: [{ id: 321 }] };
      if (sql.includes('is_home_visit = true')) return { rows: hadHomeVisit ? [{ '?column?': 1 }] : [] };
      if (sql.includes('FROM charge_master')) {
        return { rows: [params[0] === 'CONS-HOME' ? { id: 542, service_name: 'First Patient Home Visit', price: '800' } : { id: 549, service_name: 'SUBSEQUENT HOME VISITS', price: '500' }] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  vi.mocked(pool.connect).mockResolvedValue(client as any);
  return { calls };
};

const doctor = { id: 3, role: 'doctor' };
const line = (calls: Array<{ sql: string; params: any[] }>) => calls.find((c) => c.sql.includes('INSERT INTO invoice_items'));

describe('starting a home visit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens a home-visit encounter and bills the first home visit', async () => {
    const { calls } = fakeClient(appt());
    const res = mockResponse();
    await startHomeVisit(mockRequest({}, { id: '7' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ encounter_id: 321, invoice_id: 900 });
    const enc = calls.find((c) => c.sql.includes('INSERT INTO encounters'))!;
    expect(enc.sql).toContain("'home-visit'");
    expect(enc.sql).toContain('is_home_visit');
    expect(line(calls)!.params.slice(1, 4)).toEqual([542, 'First Patient Home Visit', 800]);
    expect(calls.some((c) => c.sql.includes("SET status = 'in-progress', encounter_id"))).toBe(true);
    expect(calls[calls.length - 1].sql).toBe('COMMIT');
  });

  it('bills a later home visit as a subsequent visit', async () => {
    const { calls } = fakeClient(appt(), true);
    await startHomeVisit(mockRequest({}, { id: '7' }, {}, doctor), mockResponse());
    expect(line(calls)!.params.slice(1, 4)).toEqual([549, 'SUBSEQUENT HOME VISITS', 500]);
  });

  it('returns the visit already started instead of opening a second one', async () => {
    const { calls } = fakeClient(appt({ encounter_id: 99, status: 'in-progress' }));
    const res = mockResponse();
    await startHomeVisit(mockRequest({}, { id: '7' }, {}, doctor), res);
    expect(res.json).toHaveBeenCalledWith({ encounter_id: 99, already_started: true });
    expect(calls.some((c) => c.sql.includes('INSERT INTO encounters'))).toBe(false);
  });

  it("refuses another doctor's visit, an unregistered patient and a clinic booking", async () => {
    let res = mockResponse();
    fakeClient(appt({ provider_id: 4 }));
    await startHomeVisit(mockRequest({}, { id: '7' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(403);

    res = mockResponse();
    fakeClient(appt({ patient_id: null }));
    await startHomeVisit(mockRequest({}, { id: '7' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(400);

    res = mockResponse();
    fakeClient(appt({ location_type: 'clinic' }));
    await startHomeVisit(mockRequest({}, { id: '7' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('lets the nurse going along start it', async () => {
    fakeClient(appt({ nurse_id: 12 }));
    const res = mockResponse();
    await startHomeVisit(mockRequest({}, { id: '7' }, {}, { id: 12, role: 'nurse' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('booking a home visit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs an address or GPS code', async () => {
    const res = mockResponse();
    await createAppointment(
      mockRequest({ patient_id: 55, provider_id: 3, appointment_date: '2026-11-03T10:00:00', location_type: 'home' }, {}, {}, doctor),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('stores where to go and saves the address back to the patient when asked', async () => {
    vi.mocked(pool.query).mockImplementation((async (raw: unknown) => {
      const sql = String(raw);
      if (sql.includes('INSERT INTO appointments')) return { rows: [{ id: 8 }] };
      return { rows: [] };
    }) as any);
    const res = mockResponse();
    await createAppointment(
      mockRequest({
        patient_id: 55, provider_id: 3, appointment_date: '2026-11-03T10:00:00', location_type: 'home',
        visit_gps_address: 'ga-123-4567', visit_landmark: 'Blue gate', save_to_patient: true,
      }, {}, {}, doctor),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const calls = vi.mocked(pool.query).mock.calls.map(([sql, params]) => ({ sql: String(sql), params: params as any[] }));
    const insert = calls.find((c) => c.sql.includes('INSERT INTO appointments'))!;
    expect(insert.params.slice(4, 6)).toEqual([60, 'home-visit']);
    expect(insert.params.slice(9, 12)).toEqual(['home', null, 'GA-123-4567']);
    expect(calls.some((c) => c.sql.includes('UPDATE patients') && c.params[2] === 'GA-123-4567')).toBe(true);
  });
});
