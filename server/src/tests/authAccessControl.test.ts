import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import pool from '../database/db';
import { authenticateToken, enforcePatientOwnership, forgetAccountStatus } from '../middleware/auth';

// A real Express 5 app, so req.query behaves exactly as in production (it is
// re-parsed from the URL on every read — the reason the old patient scoping
// silently did nothing).
let server: Server;
let base = '';

const db = {
  users: {} as Record<number, { is_active: boolean; is_super_admin: boolean; revoked_at_sec: number | null }>,
  patientIdForUser: {} as Record<number, number>,
};

beforeAll(async () => {
  const app = express();
  app.get('/api/appointments', authenticateToken, enforcePatientOwnership, (req, res) => {
    res.json({ patient_id: (req.query as Record<string, unknown>).patient_id ?? null });
  });
  // An allowlisted portal path, to exercise enforcePatientOwnership for a patient.
  app.get('/api/patient-portal/me', authenticateToken, enforcePatientOwnership, (req, res) => {
    res.json({ patient_id: (req.query as Record<string, unknown>).patient_id ?? null });
  });
  app.get('/api/medications/patient/:patient_id', authenticateToken, enforcePatientOwnership, (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/messages/users', authenticateToken, (_req, res) => res.json({ ok: true }));
  app.put('/api/appointments/:id', authenticateToken, (_req, res) => res.json({ ok: true }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  db.users = {
    1: { is_active: true, is_super_admin: false, revoked_at_sec: null }, // portal patient
    2: { is_active: true, is_super_admin: false, revoked_at_sec: null }, // staff
  };
  db.patientIdForUser = { 1: 101 };
  [1, 2].forEach(forgetAccountStatus);
  vi.mocked(pool.query).mockReset();
  vi.mocked(pool.query).mockImplementation((async (sql: string, params: unknown[]) => {
    if (sql.includes('token_blacklist')) return { rows: [] };
    if (sql.includes('FROM users WHERE id')) {
      const u = db.users[params[0] as number];
      return { rows: u ? [u] : [] };
    }
    if (sql.includes('FROM patients WHERE user_id')) {
      const pid = db.patientIdForUser[params[0] as number];
      return { rows: pid ? [{ id: pid }] : [] };
    }
    return { rows: [] };
  }) as any);
});

const token = (payload: Record<string, unknown>, iat?: number) =>
  jwt.sign({ ...payload, ...(iat ? { iat } : {}) }, process.env.JWT_SECRET as string);

const get = (path: string, tok: string, method = 'GET') =>
  fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tok}` } });

describe('patient-portal scoping', () => {
  const patient = () => token({ id: 1, role: 'patient', is_super_admin: false });

  it("forces a patient's ?patient_id to their own record", async () => {
    const r = await get('/api/patient-portal/me?patient_id=999', patient());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ patient_id: '101' });
  });

  it('scopes a patient who sends no patient_id at all', async () => {
    const r = await get('/api/patient-portal/me', patient());
    expect(await r.json()).toEqual({ patient_id: '101' });
  });

  it('blocks patients from staff routes, whatever the route forgot to check', async () => {
    expect((await get('/api/messages/users', patient())).status).toBe(403);
    expect((await get('/api/appointments/5', patient(), 'PUT')).status).toBe(403);
    // Staff record endpoints skip the results-release rule — patients use /patient-portal/*.
    expect((await get('/api/appointments?patient_id=101', patient())).status).toBe(403);
    expect((await get('/api/medications/patient/101', patient())).status).toBe(403);
  });

  it('leaves staff queries alone', async () => {
    const staff = token({ id: 2, role: 'receptionist' });
    const r = await get('/api/appointments?patient_id=999', staff);
    expect(await r.json()).toEqual({ patient_id: '999' });
    expect((await get('/api/messages/users', staff)).status).toBe(200);
  });
});

describe('session revocation', () => {
  it('rejects a deactivated account straight away', async () => {
    db.users[2].is_active = false;
    expect((await get('/api/messages/users', token({ id: 2, role: 'nurse' }))).status).toBe(401);
  });

  it('rejects tokens issued before "log out everywhere"', async () => {
    const now = Math.floor(Date.now() / 1000);
    db.users[2].revoked_at_sec = now;
    expect((await get('/api/messages/users', token({ id: 2, role: 'nurse' }, now - 60))).status).toBe(401);
    forgetAccountStatus(2);
    expect((await get('/api/messages/users', token({ id: 2, role: 'nurse' }, now + 1))).status).toBe(200);
  });

  it('stops honouring a super-admin flag removed in the database', async () => {
    const r = await get('/api/messages/users', token({ id: 1, role: 'patient', is_super_admin: true }));
    // DB says not a super admin -> treated as a plain patient -> staff route blocked
    expect(r.status).toBe(403);
  });

  it('lets the request through if the status lookup itself fails', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (sql.includes('token_blacklist')) return { rows: [] };
      throw new Error('db down');
    }) as any);
    expect((await get('/api/messages/users', token({ id: 2, role: 'nurse' }))).status).toBe(200);
  });
});
