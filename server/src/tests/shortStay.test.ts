import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../services/invoiceResolver', () => ({ getOrCreateEncounterInvoice: vi.fn().mockResolvedValue(900) }));
vi.mock('../services/priceResolutionService', () => ({
  resolvePrice: vi.fn().mockResolvedValue({ unitPrice: 350, isExcluded: false }),
}));

import {
  detentionUnits,
  nextObsDue,
  assignBed,
  dischargeShortStay,
  transferShortStay,
  addShortStayEntry,
  addShortStayBed,
} from '../controllers/shortStayController';

const nurse = { id: 12, role: 'nurse' };
type Call = { sql: string; params: any[] };
const H = 3_600_000;

const fakeDb = (opts: {
  bed?: Record<string, unknown> | null;
  targetBed?: Record<string, unknown> | null;
  openStayForPatient?: boolean;
  encounter?: Record<string, unknown> | null;
  stay?: Record<string, unknown> | null;
  otherDetentionQty?: number;
  ownQty?: number;
}) => {
  const calls: Call[] = [];
  const query = vi.fn(async (raw: unknown, params: any[] = []) => {
    const sql = String(raw);
    calls.push({ sql, params });
    if (sql.includes('FROM short_stay_beds WHERE id = $1 AND COALESCE(is_active')) return { rows: opts.targetBed ? [opts.targetBed] : [] };
    if (sql.includes('FROM short_stay_beds WHERE id = $1 FOR UPDATE')) return { rows: opts.bed ? [opts.bed] : [] };
    if (sql.includes("WHERE s.patient_id = $1 AND s.status = 'admitted'")) {
      return { rows: opts.openStayForPatient ? [{ bed_name: 'Bed 2' }] : [] };
    }
    if (sql.includes('FROM encounters WHERE id = $1')) return { rows: opts.encounter ? [opts.encounter] : [] };
    if (sql.includes('INSERT INTO short_stays')) {
      return { rows: [{ id: 70, encounter_id: params[2], detention_item_id: null, billed_units: 0, bill_detention: true }] };
    }
    if (sql.includes('FROM short_stays WHERE id = $1')) return { rows: opts.stay ? [opts.stay] : [] };
    if (sql.includes('FROM charge_master WHERE service_code')) return { rows: [{ id: 31, service_name: 'SHORT STAY', price: '350', category: 'procedure' }] };
    if (sql.includes('COALESCE(SUM(quantity), 0)::int AS qty')) return { rows: [{ qty: opts.otherDetentionQty || 0 }] };
    if (sql.includes('SELECT quantity FROM invoice_items WHERE id = $1')) return { rows: [{ quantity: opts.ownQty ?? 1 }] };
    if (sql.includes('INSERT INTO invoice_items')) return { rows: [{ id: 801 }] };
    if (sql.includes('SELECT status FROM short_stays')) return { rows: opts.stay ? [{ status: (opts.stay as any).status }] : [] };
    if (sql.includes('INSERT INTO short_stay_entries')) return { rows: [{ id: 5 }] };
    return { rows: [] };
  });
  vi.mocked(pool.connect).mockResolvedValue({ query, release: vi.fn() } as any);
  vi.mocked(pool.query).mockImplementation(query as any);
  return { calls };
};

describe('detention units and obs timing', () => {
  const t0 = new Date('2026-11-10T08:00:00Z');
  it('bills one unit per started 24 hours, at least one', () => {
    expect(detentionUnits(t0, new Date(t0.getTime() + 0.5 * H))).toBe(1);
    expect(detentionUnits(t0, new Date(t0.getTime() + 24 * H))).toBe(1);
    expect(detentionUnits(t0, new Date(t0.getTime() + 25 * H))).toBe(2);
    expect(detentionUnits(t0, new Date(t0.getTime() + 49 * H))).toBe(3);
  });
  it('obs are due one interval after the last obs, or after admission', () => {
    expect(nextObsDue(t0, null, 60).toISOString()).toBe('2026-11-10T09:00:00.000Z');
    expect(nextObsDue(t0, new Date(t0.getTime() + 2 * H), 30).toISOString()).toBe('2026-11-10T10:30:00.000Z');
    // Vitals from before the admission don't count.
    expect(nextObsDue(t0, new Date(t0.getTime() - H), 60).toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });
});

describe('admitting to a bed', () => {
  beforeEach(() => vi.clearAllMocks());
  const body = { bed_id: 1, encounter_id: 321, patient_id: 55, reason: 'IV fluids, dehydration' };

  it('a nurse can admit; opens a stay and bills the first Detention unit', async () => {
    const { calls } = fakeDb({ bed: { id: 1, bed_name: 'Bed 1', is_available: true }, encounter: { id: 321, patient_id: 55, provider_id: 3 } });
    const res = mockResponse();
    await assignBed(mockRequest(body, {}, {}, nurse), res);
    expect(res.status).not.toHaveBeenCalled();
    const stay = calls.find((c) => c.sql.includes('INSERT INTO short_stays'))!;
    expect(stay.params).toEqual([1, 55, 321, 'IV fluids, dehydration', 3, 60, 12]);
    const line = calls.find((c) => c.sql.includes('INSERT INTO invoice_items'))!;
    expect(line.params).toEqual([900, 31, 'SHORT STAY', 1, 350, 'procedure', 'payer']);
    expect(calls.some((c) => c.sql.includes('UPDATE short_stay_beds') && c.params.includes(70))).toBe(true);
  });

  it("doesn't double-bill detention a doctor already added to the visit", async () => {
    const { calls } = fakeDb({
      bed: { id: 1, bed_name: 'Bed 1', is_available: true },
      encounter: { id: 321, patient_id: 55, provider_id: 3 },
      otherDetentionQty: 1,
    });
    await assignBed(mockRequest(body, {}, {}, nurse), mockResponse());
    expect(calls.some((c) => c.sql.includes('INSERT INTO invoice_items'))).toBe(false);
  });

  it('refuses an occupied bed, a patient already in a bed, and a visit of another patient', async () => {
    fakeDb({ bed: { id: 1, bed_name: 'Bed 1', is_available: false } });
    let res = mockResponse();
    await assignBed(mockRequest(body, {}, {}, nurse), res);
    expect(res.json.mock.calls[0][0].error).toMatch(/occupied/);

    fakeDb({ bed: { id: 1, bed_name: 'Bed 1', is_available: true }, openStayForPatient: true });
    res = mockResponse();
    await assignBed(mockRequest(body, {}, {}, nurse), res);
    expect(res.json.mock.calls[0][0].error).toMatch(/already assigned to Bed 2/);

    fakeDb({ bed: { id: 1, bed_name: 'Bed 1', is_available: true }, encounter: { id: 321, patient_id: 99 } });
    res = mockResponse();
    await assignBed(mockRequest(body, {}, {}, nurse), res);
    expect(res.json.mock.calls[0][0].error).toMatch(/doesn't belong/);
  });

  it('rejects an obs interval outside 15 min – 24 h', async () => {
    const res = mockResponse();
    await assignBed(mockRequest({ ...body, obs_interval_minutes: 5 }, {}, {}, nurse), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('discharge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs the condition at discharge', async () => {
    const res = mockResponse();
    await dischargeShortStay(mockRequest({ note: 'ok' }, { id: '70' }, {}, nurse), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('tops the Detention line up to the started days and frees the bed', async () => {
    const admitted = new Date(Date.now() - 30 * H).toISOString(); // 30h → 2 units
    const { calls } = fakeDb({
      stay: { id: 70, bed_id: 1, encounter_id: 321, status: 'admitted', admitted_at: admitted, detention_item_id: 801, billed_units: 1, bill_detention: true },
      ownQty: 1,
    });
    const res = mockResponse();
    await dischargeShortStay(mockRequest({ condition: 'improved', note: 'Rehydrated' }, { id: '70' }, {}, nurse), res);
    const upd = calls.find((c) => c.sql.includes('UPDATE invoice_items SET quantity'))!;
    expect(upd.params).toEqual([801, 2, 350]);
    expect(calls.some((c) => c.sql.includes("SET status = 'discharged'"))).toBe(true);
    expect(calls.some((c) => c.sql.includes('UPDATE short_stay_beds') && c.sql.includes('is_available = true'))).toBe(true);
    expect(res.json.mock.calls[0][0].detention_units).toBe(2);
  });

  it("doesn't charge stays carried over from before detention billing", async () => {
    const { calls } = fakeDb({
      stay: { id: 70, bed_id: 1, encounter_id: 321, status: 'admitted', admitted_at: new Date(Date.now() - 50 * H).toISOString(), detention_item_id: null, billed_units: 0, bill_detention: false },
    });
    await dischargeShortStay(mockRequest({ condition: 'stable' }, { id: '70' }, {}, nurse), mockResponse());
    expect(calls.some((c) => c.sql.includes('invoice_items'))).toBe(false);
  });

  it('refuses a second discharge', async () => {
    fakeDb({ stay: { id: 70, status: 'discharged' } });
    const res = mockResponse();
    await dischargeShortStay(mockRequest({ condition: 'stable' }, { id: '70' }, {}, nurse), res);
    expect(res.json.mock.calls[0][0].error).toMatch(/already been discharged/);
  });
});

describe('during the stay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves the patient to a free bed and logs the transfer', async () => {
    const { calls } = fakeDb({
      stay: { id: 70, bed_id: 1, patient_id: 55, encounter_id: 321, status: 'admitted', admitted_at: new Date().toISOString() },
      targetBed: { id: 2, bed_name: 'Bed 2', is_available: true },
      bed: { bed_name: 'Bed 1' },
    });
    const res = mockResponse();
    await transferShortStay(mockRequest({ bed_id: 2 }, { id: '70' }, {}, nurse), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(calls.some((c) => c.sql.includes('UPDATE short_stays SET bed_id = $2') && c.params[1] === 2)).toBe(true);
    expect(calls.find((c) => c.sql.includes('INSERT INTO short_stay_entries'))!.params[1]).toMatch(/to Bed 2/);
  });

  it("won't move into an occupied bed", async () => {
    fakeDb({
      stay: { id: 70, bed_id: 1, status: 'admitted' },
      targetBed: { id: 2, bed_name: 'Bed 2', is_available: false },
    });
    const res = mockResponse();
    await transferShortStay(mockRequest({ bed_id: 2 }, { id: '70' }, {}, nurse), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('logs a medicine given, but not on a closed stay', async () => {
    fakeDb({ stay: { id: 70, status: 'admitted' } });
    let res = mockResponse();
    await addShortStayEntry(mockRequest({ kind: 'medication', detail: 'IV paracetamol 1g' }, { id: '70' }, {}, nurse), res);
    expect(res.status).toHaveBeenCalledWith(201);

    fakeDb({ stay: { id: 70, status: 'discharged' } });
    res = mockResponse();
    await addShortStayEntry(mockRequest({ kind: 'medication', detail: 'x' }, { id: '70' }, {}, nurse), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('addShortStayBed', () => {
  it('numbers the next bed from the digits only (works past the first bed)', async () => {
    const query = vi.fn(async () => ({ rows: [{ id: 2, bed_number: 'SSU-2', bed_name: 'Bed 2' }] }));
    vi.spyOn(pool, 'query').mockImplementation(query as any);
    const res = mockResponse();
    await addShortStayBed(mockRequest({ bed_name: 'Bed 2' }, {}, {}, { id: 1, role: 'admin' }), res as any);
    const sql = String((query.mock.calls[0] as any[])[0]);
    // A bare '\D' inside a JS template literal reaches Postgres as 'D', so
    // 'SSU-1'::int blew up and only the first bed could ever be added.
    expect(sql).toContain("regexp_replace(bed_number, '[^0-9]', '', 'g')");
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
