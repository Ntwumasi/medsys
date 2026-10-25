import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/tokenService', () => ({
  revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
  isTokenRevoked: vi.fn().mockResolvedValue(false),
}));

import { createUser, resetUserPassword, updateUser, deleteUser } from '../controllers/userController';
import { updateLabOrder, updateImagingOrder } from '../controllers/ordersController';
import { revokeAllUserTokens } from '../services/tokenService';

// Target accounts by id.
const TARGETS: Record<string, { role: string; is_super_admin: boolean }> = {
  '10': { role: 'nurse', is_super_admin: false },
  '11': { role: 'doctor', is_super_admin: true }, // a super admin whose role is doctor
  '12': { role: 'office_manager', is_super_admin: false },
};

beforeEach(() => {
  vi.mocked(pool.query).mockReset();
  vi.mocked(revokeAllUserTokens).mockClear();
  vi.mocked(pool.query).mockImplementation((async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM users WHERE id')) {
      const t = TARGETS[String(params?.[0])];
      return { rows: t ? [{ id: Number(params[0]), username: 'u', first_name: 'A', last_name: 'B', ...t }] : [] };
    }
    return { rows: [] };
  }) as any);
});

const receptionist = { id: 2, role: 'receptionist' };
const plainAdmin = { id: 3, role: 'admin' };
const superAdmin = { id: 4, role: 'admin', is_super_admin: true };

describe('receptionist limits', () => {
  it('cannot create an office manager (passes every admin check)', async () => {
    const res = mockResponse();
    await createUser(mockRequest({ role: 'office_manager', first_name: 'X', last_name: 'Y' }, {}, {}, receptionist), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("cannot reset a super admin's or office manager's password", async () => {
    for (const id of ['11', '12']) {
      const res = mockResponse();
      await resetUserPassword(mockRequest({}, { id }, {}, receptionist), res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it("can still reset a nurse's password, and the old sessions are ended", async () => {
    const res = mockResponse();
    await resetUserPassword(mockRequest({}, { id: '10' }, {}, receptionist), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Password reset successfully' }));
    expect(revokeAllUserTokens).toHaveBeenCalledWith(10, 'admin_revoke');
  });
});

describe('super admin accounts', () => {
  it('only a super admin can reset, edit or deactivate one', async () => {
    for (const fn of [resetUserPassword, updateUser, deleteUser]) {
      const denied = mockResponse();
      await fn(mockRequest({ email: 'x@y.z' }, { id: '11' }, {}, plainAdmin), denied);
      expect(denied.status).toHaveBeenCalledWith(403);

      const allowed = mockResponse();
      await fn(mockRequest({ email: 'x@y.z' }, { id: '11' }, {}, superAdmin), allowed);
      expect(allowed.status).not.toHaveBeenCalledWith(403);
    }
  });
});

describe('lab / imaging order updates outside the department', () => {
  const doctor = { id: 7, role: 'doctor' };

  it('a doctor cannot enter a result or skip verification', async () => {
    const res = mockResponse();
    await updateLabOrder(mockRequest({ status: 'completed', results: 'K 7.1', skip_verification: true }, { id: '5' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('a doctor cannot write imaging findings', async () => {
    const res = mockResponse();
    await updateImagingOrder(mockRequest({ findings: 'normal' }, { id: '5' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('a doctor can still cancel', async () => {
    const res = mockResponse();
    await updateImagingOrder(mockRequest({ status: 'cancelled' }, { id: '5' }, {}, doctor), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('nobody can move an order to another patient', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 5 }] } as any);
    const res = mockResponse();
    await updateImagingOrder(mockRequest({ patient_id: 999, findings: 'x' }, { id: '5' }, {}, { id: 8, role: 'imaging' }), res);
    const update = vi.mocked(pool.query).mock.calls.find(([q]) => String(q).includes('UPDATE imaging_orders'));
    expect(String(update?.[0])).not.toContain('patient_id');
  });
});
