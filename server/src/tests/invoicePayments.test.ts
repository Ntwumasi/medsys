import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/emailService', () => ({ sendReceiptEmail: vi.fn(), validateEmail: () => false }));
vi.mock('../services/autoCheckoutService', () => ({ autoCheckoutIfFullyPaid: vi.fn().mockResolvedValue({ didCheckout: false }) }));
vi.mock('../services/patientAutoTextService', () => ({ textPaymentReceipt: vi.fn() }));

import { updateInvoice } from '../controllers/invoiceController';
import { recordPayment } from '../controllers/qbDataController';
import { resolvePrice } from '../services/priceResolutionService';
import { patientShares } from '../services/patientShare';

// A transaction client whose invoice row is { total, paid } and which records
// every statement it runs.
const fakeClient = (invoice: { total: number; paid: number; status?: string }) => {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const client = {
    query: vi.fn(async (raw: unknown, params: any[] = []) => {
      const sql = String(raw);
      calls.push({ sql, params });
      if (sql.includes('FROM invoices WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 5, total_amount: String(invoice.total), amount_paid: String(invoice.paid), status: invoice.status || 'pending' }] };
      }
      if (sql.startsWith('UPDATE invoices') || sql.trim().startsWith('UPDATE invoices')) {
        return { rows: [{ id: 5, status: params[0] ?? params[1], amount_paid: params[1] ?? params[0] }] };
      }
      if (sql.includes('INSERT INTO payments')) return { rows: [{ id: 77 }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  vi.mocked(pool.connect).mockResolvedValue(client as any);
  return { client, calls };
};

const paymentInsert = (calls: Array<{ sql: string; params: any[] }>) => calls.find((c) => c.sql.includes('INSERT INTO payments'));
const invoiceUpdate = (calls: Array<{ sql: string; params: any[] }>) => calls.find((c) => c.sql.includes('UPDATE invoices'));

describe('recording a payment at checkout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds the amount received now to what the server has, under the row lock', async () => {
    const { calls } = fakeClient({ total: 300, paid: 100 });
    const res = mockResponse();
    await updateInvoice(mockRequest({ payment_amount: 50, payment_method: 'momo' }, { id: '5' }, {}, { id: 1 }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(invoiceUpdate(calls)!.params.slice(0, 2)).toEqual(['partial', 150]);
    expect(paymentInsert(calls)!.params[1]).toBe(50);
  });

  it('marks the invoice paid only when the payments cover it', async () => {
    const { calls } = fakeClient({ total: 300, paid: 100 });
    await updateInvoice(mockRequest({ payment_amount: 200 }, { id: '5' }, {}, { id: 1 }), mockResponse());
    expect(invoiceUpdate(calls)!.params.slice(0, 2)).toEqual(['paid', 300]);
  });

  it('refuses a stale total from an old tab instead of losing a payment', async () => {
    // Cashier B's screen still thinks 0 was paid; A already recorded 100.
    const { calls } = fakeClient({ total: 300, paid: 100 });
    const res = mockResponse();
    await updateInvoice(mockRequest({ amount_paid: 100, status: 'partial' }, { id: '5' }, {}, { id: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(paymentInsert(calls)).toBeUndefined();
  });

  it("won't mark an unpaid invoice paid without a payment", async () => {
    const { calls } = fakeClient({ total: 300, paid: 0 });
    const res = mockResponse();
    await updateInvoice(mockRequest({ status: 'paid' }, { id: '5' }, {}, { id: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(invoiceUpdate(calls)).toBeUndefined();
  });

  it('rejects zero, negative and overpaying amounts', async () => {
    for (const payment_amount of [0, -20, 'abc', 250]) {
      const { calls } = fakeClient({ total: 300, paid: 100 });
      const res = mockResponse();
      await updateInvoice(mockRequest({ payment_amount }, { id: '5' }, {}, { id: 1 }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(paymentInsert(calls)).toBeUndefined();
    }
  });
});

describe("accountant's Record payment", () => {
  beforeEach(() => vi.clearAllMocks());

  it('records inside one locked transaction', async () => {
    const { calls } = fakeClient({ total: 300, paid: 100 });
    const res = mockResponse();
    await recordPayment(mockRequest({ amount: '50', payment_method: 'cash' }, { id: '5' }, {}, { id: 1 }), res);
    const sqls = calls.map((c) => c.sql.trim());
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls.some((s) => s.includes('FOR UPDATE'))).toBe(true);
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(invoiceUpdate(calls)!.params).toEqual([150, 'partial', '5']);
  });

  it('rejects negative amounts and cancelled invoices', async () => {
    let { calls } = fakeClient({ total: 300, paid: 100 });
    let res = mockResponse();
    await recordPayment(mockRequest({ amount: -50 }, { id: '5' }, {}, { id: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(paymentInsert(calls)).toBeUndefined();

    ({ calls } = fakeClient({ total: 300, paid: 100, status: 'cancelled' }));
    res = mockResponse();
    await recordPayment(mockRequest({ amount: 50 }, { id: '5' }, {}, { id: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(paymentInsert(calls)).toBeUndefined();
  });
});

describe('payer-excluded services', () => {
  beforeEach(() => vi.clearAllMocks());

  it('come back at the cash price, flagged for the patient to pay', async () => {
    vi.mocked(pool.query).mockImplementation((async (raw: unknown) => {
      const sql = String(raw);
      if (sql.includes('FROM charge_master')) return { rows: [{ id: 9, price: '250', category: 'imaging' }] };
      if (sql.includes('FROM invoices i')) return { rows: [{ payer_type: 'insurance', insurance_provider_id: 3, corporate_client_id: null }] };
      if (sql.includes('FROM payer_price_schedules')) return { rows: [{ price: null, is_excluded: true }] };
      return { rows: [] };
    }) as any);
    expect(await resolvePrice(9, 5)).toEqual({ unitPrice: 250, isExcluded: true, priceSource: 'payer_override' });
  });
});

describe("statements show only the patient's share", () => {
  it("leave out the insurer's share and settlements", () => {
    const shares = patientShares(
      [
        { id: 1, total_amount: '350', amount_paid: '20', invoice_payer_type: 'insurance' },
        { id: 2, total_amount: '200', amount_paid: '120' },
      ],
      [
        { invoice_id: 1, total_price: '300', bill_to: 'payer' },
        { invoice_id: 1, total_price: '50', bill_to: 'patient' },
        { invoice_id: 2, total_price: '200', bill_to: 'payer' },
      ],
      [
        { invoice_id: 1, amount: '20', notes: 'Payment at checkout' },
        { invoice_id: 2, amount: '120' },
      ],
      'self_pay'
    );
    expect(shares.get(1)).toMatchObject({ covered: true, your_share: 50, covered_share: 300, balance_due: 30 });
    expect(shares.get(2)).toMatchObject({ covered: false, your_share: 200, balance_due: 80 });
  });
});
