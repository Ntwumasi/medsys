import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';
import { getPortalBills } from '../controllers/patientPortalRecordsController';

// SQL-aware fake DB for one patient (id 7) with two invoices:
//  #1 insured: 300 covered + 50 patient-pays (med exempted from cover), patient paid 20,
//     insurer settled 300.
//  #2 self-pay: 200 total, paid 120.
const fakeDb = (primaryPayer: string) =>
  vi.mocked(pool.query).mockImplementation((async (raw: unknown) => {
    const sql = String(raw);
    if (sql.includes('FROM patients WHERE user_id')) return { rows: [{ id: 7 }] };
    if (sql.includes('FROM patient_payer_sources')) return { rows: [{ payer_type: primaryPayer }] };
    if (sql.includes('FROM invoices i')) {
      return { rows: [
        { id: 1, invoice_number: 'INV1', invoice_date: '2026-10-01', status: 'partial', total_amount: '350', amount_paid: '320', invoice_payer_type: 'insurance', payer_name: 'Acme Health' },
        { id: 2, invoice_number: 'INV2', invoice_date: '2026-09-01', status: 'partial', total_amount: '200', amount_paid: '120', invoice_payer_type: 'self_pay', payer_name: null },
      ] };
    }
    if (sql.includes('FROM invoice_items')) {
      return { rows: [
        { invoice_id: 1, description: 'Consultation', quantity: 1, total_price: '300', bill_to: 'payer' },
        { invoice_id: 1, description: 'Medication', quantity: 1, total_price: '50', bill_to: 'patient' },
        { invoice_id: 2, description: 'Consultation', quantity: 1, total_price: '200', bill_to: 'payer' },
      ] };
    }
    if (sql.includes('FROM payments')) {
      return { rows: [
        { invoice_id: 1, payment_date: '2026-10-01', amount: '20', payment_method: 'cash', notes: 'Payment at checkout' },
        { invoice_id: 1, payment_date: '2026-10-10', amount: '300', payment_method: 'insurance_settlement', notes: 'insurance payer settlement' },
        { invoice_id: 2, payment_date: '2026-09-01', amount: '120', payment_method: 'momo', notes: null },
      ] };
    }
    return { rows: [] };
  }) as any);

describe('patient portal bills', () => {
  beforeEach(() => vi.mocked(pool.query).mockReset());

  it("only asks an insured patient for their own share, and hides the insurer's payments", async () => {
    fakeDb('insurance');
    const res = mockResponse();
    await getPortalBills(mockRequest({}, {}, {}, { id: 99, role: 'patient' }), res);
    const body = vi.mocked(res.json).mock.calls[0][0];
    const [insured, selfPay] = body.bills;

    expect(insured).toMatchObject({ covered: true, payer_name: 'Acme Health', your_share: 50, covered_share: 300, you_paid: 20, balance_due: 30 });
    expect(insured.payments).toEqual([{ date: '2026-10-01', amount: 20, method: 'cash' }]);
    expect(insured.items.map((i: any) => i.paid_by)).toEqual(['cover', 'you']);

    expect(selfPay).toMatchObject({ covered: false, your_share: 200, you_paid: 120, balance_due: 80 });
    expect(body.total_due).toBe(110);
  });
});
