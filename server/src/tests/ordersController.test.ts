import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

// Services createPharmacyOrder fires after a successful insert — stub them out.
vi.mock('../services/auditService', () => ({ default: { log: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../services/notificationService', () => ({
  default: {
    notifyStatOrder: vi.fn().mockResolvedValue(undefined),
    notifyNurseOrderCreated: vi.fn().mockResolvedValue(undefined),
    notifyPharmacyNewOrder: vi.fn().mockResolvedValue(undefined),
  },
}));

import { createPharmacyOrder } from '../controllers/ordersController';

describe('createPharmacyOrder — repeat-dose (allow_duplicate) handling', () => {
  beforeEach(() => vi.clearAllMocks());

  // Ethan Avle's real scenario: a salbutamol order already exists on the encounter.
  const body = {
    patient_id: 1,
    encounter_id: 919,
    medication_name: 'NEB SALBUTAMOL 5MG',
    dosage: '5mg',
    frequency: 'PRN',
    route: 'nebulized',
    quantity: '1',
  };

  it('blocks a same-name repeat with 409 DUPLICATE_MEDICATION when allow_duplicate is absent', async () => {
    // dup check finds the existing order
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 331 }] } as any);

    const req = mockRequest(body, {}, {}, { id: 27 });
    const res = mockResponse();
    await createPharmacyOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DUPLICATE_MEDICATION' }));
    // Only the dup-check SELECT ran — no INSERT.
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1);
  });

  it('allows the repeat (skips the dup check, inserts, 201) when allow_duplicate is true', async () => {
    // No dup-check query is expected; the first DB call is the INSERT.
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 999, medication_name: body.medication_name }] } as any);

    const req = mockRequest({ ...body, allow_duplicate: true }, {}, {}, { id: 27 });
    const res = mockResponse();
    await createPharmacyOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const firstSql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(firstSql).toMatch(/INSERT INTO pharmacy_orders/i);
    expect(firstSql).not.toMatch(/SELECT id FROM pharmacy_orders/i);
  });

  it('inserts normally (201) when no matching order exists', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as any) // dup check: none found
      .mockResolvedValueOnce({ rows: [{ id: 1000, medication_name: body.medication_name }] } as any); // INSERT

    const req = mockRequest(body, {}, {}, { id: 27 });
    const res = mockResponse();
    await createPharmacyOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});
