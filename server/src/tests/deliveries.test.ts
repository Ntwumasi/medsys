import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/patientAutoTextService', () => ({ textDeliveryOnTheWay: vi.fn() }));
vi.mock('../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../services/invoiceResolver', () => ({ getOrCreateEncounterInvoice: vi.fn().mockResolvedValue(900) }));
vi.mock('./../controllers/invoiceController', () => ({ updateInvoice: vi.fn() }));

import {
  canMoveDelivery,
  createDelivery,
  setDeliveryStatus,
  collectDeliveryPayment,
} from '../controllers/deliveryController';
import { textDeliveryOnTheWay } from '../services/patientAutoTextService';
import { updateInvoice } from '../controllers/invoiceController';

const pharmacist = { id: 9, role: 'pharmacist' };
type Call = { sql: string; params: any[] };

/**
 * SQL-aware fake for both the transaction client and pool.query.
 * `orders` are the pharmacy_orders rows; `delivery` the deliveries row.
 */
const fakeDb = (opts: {
  orders?: Array<Record<string, unknown>>;
  delivery?: Record<string, unknown> | null;
  stillPreparing?: string[];
  notDispensed?: string[];
  invoice?: { total_amount: number; amount_paid: number; payer_type?: string | null };
  lines?: Array<{ total_price: number; bill_to: string }>;
}) => {
  const calls: Call[] = [];
  const query = vi.fn(async (raw: unknown, params: any[] = []) => {
    const sql = String(raw);
    calls.push({ sql, params });
    if (sql.includes('FROM pharmacy_orders WHERE id = ANY($1) FOR UPDATE')) return { rows: opts.orders || [] };
    if (sql.includes('INSERT INTO deliveries')) return { rows: [{ id: 41, invoice_id: 900, fee_invoice_item_id: null }] };
    if (sql.includes('FROM deliveries WHERE id = $1')) return { rows: opts.delivery ? [opts.delivery] : [] };
    if (sql.includes("AND status = 'ready'")) {
      return { rows: (opts.notDispensed || []).map((m) => ({ medication_name: m })) };
    }
    if (sql.includes("status IN ('ordered', 'in_progress')")) {
      return { rows: (opts.stillPreparing || []).map((m) => ({ medication_name: m })) };
    }
    if (sql.includes("service_code = 'DELIVERY'")) return { rows: [{ id: 77, service_name: 'Medicine delivery' }] };
    if (sql.includes('INSERT INTO invoice_items')) return { rows: [{ id: 501 }] };
    if (sql.includes('FROM invoices i LEFT JOIN patient_payer_sources')) {
      const inv = opts.invoice || { total_amount: 0, amount_paid: 0 };
      return { rows: [{ id: 900, ...inv, invoice_payer_type: inv.payer_type ?? null }] };
    }
    if (sql.includes('FROM invoice_items WHERE invoice_id = $1')) {
      return { rows: (opts.lines || []).map((l) => ({ invoice_id: 900, ...l })) };
    }
    if (sql.includes('FROM payments WHERE invoice_id = $1 AND created_by')) return { rows: [{ id: 3001 }] };
    if (sql.includes('FROM payments WHERE invoice_id = $1')) return { rows: [] };
    if (sql.includes('FROM patient_payer_sources')) return { rows: [] };
    return { rows: [] };
  });
  vi.mocked(pool.connect).mockResolvedValue({ query, release: vi.fn() } as any);
  vi.mocked(pool.query).mockImplementation(query as any);
  return { calls };
};

const order = (over: Record<string, unknown> = {}) => ({
  id: 1, patient_id: 55, encounter_id: 321, status: 'ready', delivery_id: null, medication_name: 'Amlodipine', ...over,
});

describe('delivery status rules', () => {
  it('only allows real next steps', () => {
    expect(canMoveDelivery('ready', 'out_for_delivery')).toBe(true);
    expect(canMoveDelivery('out_for_delivery', 'delivered')).toBe(true);
    expect(canMoveDelivery('failed', 'out_for_delivery')).toBe(true);
    expect(canMoveDelivery('preparing', 'delivered')).toBe(false);
    expect(canMoveDelivery('delivered', 'cancelled')).toBe(false);
    expect(canMoveDelivery('out_for_delivery', 'cancelled')).toBe(false);
  });
});

describe('creating a delivery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs an address or GPS code', async () => {
    const res = mockResponse();
    await createDelivery(mockRequest({ order_ids: [1] }, {}, {}, pharmacist), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/address or GPS/);
  });

  it('refuses medicines from two different visits', async () => {
    fakeDb({ orders: [order(), order({ id: 2, encounter_id: 322 })] });
    const res = mockResponse();
    await createDelivery(mockRequest({ order_ids: [1, 2], address: 'East Legon' }, {}, {}, pharmacist), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/one visit at a time/);
  });

  it('refuses medicines for two different patients', async () => {
    fakeDb({ orders: [order(), order({ id: 2, patient_id: 56 })] });
    const res = mockResponse();
    await createDelivery(mockRequest({ order_ids: [1, 2], address: 'East Legon' }, {}, {}, pharmacist), res);
    expect(res.json.mock.calls[0][0].error).toMatch(/one patient/);
  });

  it('creates it ready when every medicine is prepared, and bills the fee to the patient', async () => {
    const { calls } = fakeDb({ orders: [order(), order({ id: 2, status: 'dispensed' })] });
    const res = mockResponse();
    await createDelivery(
      mockRequest({ order_ids: [1, 2], gps_address: 'GA-123-4567', delivery_fee: '25', pay_on_delivery: true }, {}, {}, pharmacist),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const ins = calls.find((c) => c.sql.includes('INSERT INTO deliveries'))!;
    expect(ins.params[3]).toBe('ready');
    const fee = calls.find((c) => c.sql.includes('INSERT INTO invoice_items'))!;
    expect(fee.sql).toContain("'patient'");
    expect(fee.params).toEqual([900, 77, 'Medicine delivery', 25]);
    expect(calls.some((c) => c.sql.includes('UPDATE pharmacy_orders SET delivery_id'))).toBe(true);
  });

  it('starts as preparing while a medicine is still being made up, with no fee line at 0', async () => {
    const { calls } = fakeDb({ orders: [order({ status: 'in_progress' })] });
    const res = mockResponse();
    await createDelivery(mockRequest({ order_ids: [1], address: 'Spintex' }, {}, {}, pharmacist), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(calls.find((c) => c.sql.includes('INSERT INTO deliveries'))!.params[3]).toBe('preparing');
    expect(calls.some((c) => c.sql.includes('INSERT INTO invoice_items'))).toBe(false);
  });
});

describe('moving a delivery along', () => {
  beforeEach(() => vi.clearAllMocks());

  const delivery = (over: Record<string, unknown> = {}) => ({
    id: 41, patient_id: 55, invoice_id: 900, status: 'ready', courier_name: null, pay_on_delivery: false,
    amount_to_collect: null, fee_invoice_item_id: null, delivery_fee: '0', ...over,
  });

  it("won't send it out while a medicine is still being prepared", async () => {
    fakeDb({ delivery: delivery(), stillPreparing: ['Metformin'] });
    const res = mockResponse();
    await setDeliveryStatus(mockRequest({ status: 'out_for_delivery', courier_name: 'Bolt' }, { id: '41' }, {}, pharmacist), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Metformin/);
    expect(textDeliveryOnTheWay).not.toHaveBeenCalled();
  });

  it("won't send it out until every medicine is dispensed (stock out, billed)", async () => {
    fakeDb({ delivery: delivery(), notDispensed: ['Amlodipine'] });
    const res = mockResponse();
    await setDeliveryStatus(mockRequest({ status: 'out_for_delivery', courier_name: 'Bolt' }, { id: '41' }, {}, pharmacist), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Dispense first: Amlodipine/);
  });

  it('needs a courier to go out', async () => {
    fakeDb({ delivery: delivery() });
    const res = mockResponse();
    await setDeliveryStatus(mockRequest({ status: 'out_for_delivery' }, { id: '41' }, {}, pharmacist), res);
    expect(res.json.mock.calls[0][0].error).toMatch(/courier/);
  });

  it('sends it out, fixes the amount to collect from the patient share, and texts', async () => {
    // Insured: only the patient-billed lines (25 fee + 40 exempt drug) are theirs.
    const { calls } = fakeDb({
      delivery: delivery({ pay_on_delivery: true }),
      invoice: { total_amount: 265, amount_paid: 0, payer_type: 'insurance' },
      lines: [{ total_price: 200, bill_to: 'payer' }, { total_price: 40, bill_to: 'patient' }, { total_price: 25, bill_to: 'patient' }],
    });
    const res = mockResponse();
    await setDeliveryStatus(mockRequest({ status: 'out_for_delivery', courier_name: 'Bolt' }, { id: '41' }, {}, pharmacist), res);
    const upd = calls.find((c) => c.sql.includes('UPDATE deliveries') && c.sql.includes('amount_to_collect'))!;
    expect(upd.params[1]).toBe('out_for_delivery');
    expect(upd.params[5]).toBe(65);
    expect(textDeliveryOnTheWay).toHaveBeenCalledWith(41, 55);
  });

  it('needs a reason when it fails', async () => {
    fakeDb({ delivery: delivery({ status: 'out_for_delivery', courier_name: 'Bolt' }) });
    const res = mockResponse();
    await setDeliveryStatus(mockRequest({ status: 'failed' }, { id: '41' }, {}, pharmacist), res);
    expect(res.json.mock.calls[0][0].error).toMatch(/why/);
  });

  it('cancelling takes the fee off the invoice and frees the medicines for pickup', async () => {
    const { calls } = fakeDb({ delivery: delivery({ fee_invoice_item_id: 501, delivery_fee: '25' }) });
    const res = mockResponse();
    await setDeliveryStatus(mockRequest({ status: 'cancelled' }, { id: '41' }, {}, pharmacist), res);
    expect(calls.some((c) => c.sql.includes('DELETE FROM invoice_items WHERE id = $1') && c.params[0] === 501)).toBe(true);
    expect(calls.some((c) => c.sql.includes('SET delivery_id = NULL'))).toBe(true);
  });
});

describe('recording money collected on delivery', () => {
  beforeEach(() => vi.clearAllMocks());

  const out = { id: 41, patient_id: 55, invoice_id: 900, status: 'delivered', courier_name: 'Bolt' };

  it("won't take more than the patient owes", async () => {
    fakeDb({ delivery: out, invoice: { total_amount: 100, amount_paid: 0 } });
    const res = mockResponse();
    await collectDeliveryPayment(mockRequest({ amount: 150 }, { id: '41' }, {}, pharmacist), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateInvoice).not.toHaveBeenCalled();
  });

  it('records it through the normal invoice payment, without touching invoice notes', async () => {
    const { calls } = fakeDb({ delivery: out, invoice: { total_amount: 100, amount_paid: 0 } });
    vi.mocked(updateInvoice).mockImplementation(async (_req, r) => { r.json({ ok: true }); });
    const res = mockResponse();
    await collectDeliveryPayment(mockRequest({ amount: 100, payment_method: 'mobile_money' }, { id: '41' }, {}, pharmacist), res);
    const payReq = vi.mocked(updateInvoice).mock.calls[0][0] as any;
    expect(payReq.params.id).toBe('900');
    expect(payReq.body).toEqual({ payment_amount: 100, payment_method: 'mobile_money' });
    const upd = calls.find((c) => c.sql.includes('SET amount_collected'))!;
    expect(upd.params).toEqual([41, 100, 'mobile_money', 3001]);
  });

  it('passes a payment refusal straight back', async () => {
    fakeDb({ delivery: out, invoice: { total_amount: 100, amount_paid: 0 } });
    vi.mocked(updateInvoice).mockImplementation(async (_req, r) => { r.status(409).json({ error: 'updated by someone else' }); });
    const res = mockResponse();
    await collectDeliveryPayment(mockRequest({ amount: 50 }, { id: '41' }, {}, pharmacist), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
