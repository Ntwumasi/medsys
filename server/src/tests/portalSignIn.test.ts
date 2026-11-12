import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockResponse } from './helpers';

vi.mock('../services/smsService', () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true, provider: 'arkesel', messageId: 'm1' }),
  validatePhoneNumber: (p: string) => ({ valid: /^0\d{9}$/.test(p), formatted: '+233' + p.slice(1) }),
}));
vi.mock('../services/emailService', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, provider: 'smtp', messageId: 'e1' }),
  textToHtml: (t: string) => t,
  validateEmail: (e: string) => e.includes('@'),
}));
vi.mock('../services/auditService', () => ({ default: { log: vi.fn() }, auditService: { log: vi.fn() } }));

import { sendSMS } from '../services/smsService';
import { verify, requestLink } from '../controllers/patientPortalController';

const req = (body: any) => ({ body, headers: {}, ip: '1.1.1.1', socket: { remoteAddress: '1.1.1.1' } }) as any;
const future = new Date(Date.now() + 10 * 60_000).toISOString();

// The link was texted to a phone shared by a mother (patient 7) and her son (patient 8).
const tokenRow = (over: Record<string, unknown> = {}) => ({
  id: 1, patient_id: 7, used_at: null, expires_at: future, dob_attempts: 0, locked_until: null,
  purpose: 'login', target: null, channel: 'sms', phone9: '241234567',
  dob: '1980-05-01', user_id: 70, username: 'ama', first_name: 'Ama', last_name: 'Mensah', ...over,
});

const mockDb = (token: Record<string, unknown>, family: any[] = []) => {
  vi.mocked(pool.query).mockImplementation((async (q: any) => {
    const sql = String(typeof q === 'string' ? q : q?.text ?? '');
    if (sql.includes('FROM patient_portal_access_tokens t') && sql.includes('token_hash')) return { rows: [token] };
    if (sql.includes("to_char(p.date_of_birth, 'YYYY-MM-DD') = $2")) return { rows: family };
    return { rows: [] };
  }) as any);
};
const sqls = () => vi.mocked(pool.query).mock.calls.map((c: any[]) => String(typeof c[0] === 'string' ? c[0] : c[0]?.text ?? ''));

describe('portal sign-in on a shared phone', () => {
  beforeEach(() => vi.mocked(pool.query).mockReset());

  it("signs in the link's own patient when the DOB matches", async () => {
    mockDb(tokenRow());
    const res = mockResponse();
    await verify(req({ token: 't', date_of_birth: '1980-05-01' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 70 }) }));
  });

  it('signs in the other patient on the same phone whose DOB was entered', async () => {
    mockDb(tokenRow(), [{ patient_id: 8, user_id: 80, username: 'kofi', first_name: 'Kofi', last_name: 'Mensah' }]);
    const res = mockResponse();
    await verify(req({ token: 't', date_of_birth: '2015-02-03' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 80, first_name: 'Kofi' }) }));
    expect(sqls().some((s) => s.includes('dob_attempts = $1'))).toBe(false);
  });

  it('refuses to guess when two patients on the phone share the DOB (twins)', async () => {
    mockDb(tokenRow(), [{ patient_id: 8, user_id: 80 }, { patient_id: 9, user_id: 90 }]);
    const res = mockResponse();
    await verify(req({ token: 't', date_of_birth: '2015-02-03' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('an after-visit link stays bound to its one patient', async () => {
    mockDb(tokenRow({ purpose: 'notify', target: 'visit:5', channel: null }), [{ patient_id: 8, user_id: 80 }]);
    const res = mockResponse();
    await verify(req({ token: 't', date_of_birth: '2015-02-03' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sqls().some((s) => s.includes("to_char(p.date_of_birth, 'YYYY-MM-DD') = $2"))).toBe(false);
    expect(sqls().some((s) => s.includes('dob_attempts = $1'))).toBe(true);
  });

  it('an emailed link stays bound to its one patient', async () => {
    mockDb(tokenRow({ channel: 'email' }), [{ patient_id: 8, user_id: 80 }]);
    const res = mockResponse();
    await verify(req({ token: 't', date_of_birth: '2015-02-03' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('sign-in link limit per phone', () => {
  beforeEach(() => { vi.mocked(pool.query).mockReset(); vi.mocked(sendSMS).mockClear(); });

  const mockPhone = (recent: number) => vi.mocked(pool.query).mockImplementation((async (sql: string) => {
    if (sql.includes('COUNT(*)::int AS n FROM patient_portal_access_tokens')) return { rows: [{ n: recent }] };
    if (sql.includes('SELECT p.id AS patient_id, u.phone')) return { rows: [{ patient_id: 7, phone: '0241234567' }] };
    if (sql.includes('SELECT user_id FROM patients')) return { rows: [{ user_id: 70 }] };
    return { rows: [] };
  }) as any);

  it('sends while under the hourly limit', async () => {
    mockPhone(2);
    await requestLink(req({ identifier: '024 123 4567' }), mockResponse());
    expect(sendSMS).toHaveBeenCalledTimes(1);
  });

  it('stops texting a number that already got 3 links this hour (same generic reply)', async () => {
    mockPhone(3);
    const res = mockResponse();
    await requestLink(req({ identifier: '024 123 4567' }), res);
    expect(sendSMS).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('If an account exists') }));
  });
});

import { getBaseUrl } from '../controllers/patientPortalController';
describe('links texted to patients use the clinic domain', () => {
  const was = process.env.FRONTEND_URL;
  it('skips the vercel.app address (prod lists it first)', () => {
    process.env.FRONTEND_URL = 'https://medsys-five.vercel.app,https://medsys.healthcare,https://www.medsys.healthcare';
    expect(getBaseUrl()).toBe('https://medsys.healthcare');
  });
  it('works for staging', () => {
    process.env.FRONTEND_URL = 'https://staging.medsys.healthcare';
    expect(getBaseUrl()).toBe('https://staging.medsys.healthcare');
  });
  it('falls back to the only address there is', () => {
    process.env.FRONTEND_URL = 'https://medsys-five.vercel.app';
    expect(getBaseUrl()).toBe('https://medsys-five.vercel.app');
    process.env.FRONTEND_URL = was;
  });
});

import bcrypt from 'bcrypt';
import { passwordLogin, portalPasswordProblem } from '../controllers/patientPortalController';

describe('portal password sign-in', () => {
  let hash = '';
  beforeEach(async () => {
    vi.mocked(pool.query).mockReset();
    hash = hash || (await bcrypt.hash('Sunshine42', 4));
  });
  const who = (over: Record<string, unknown> = {}) => ({
    patient_id: 12, user_id: 120, username: 'esi', first_name: 'Esi', last_name: 'T',
    password_hash: hash, failed_login_attempts: 0, locked_until: null, ...over,
  });
  const mockFind = (rows: any[]) => vi.mocked(pool.query).mockImplementation((async (q: any) => {
    const sql = String(typeof q === 'string' ? q : q?.text ?? '');
    if (sql.includes('portal_password_set = true')) return { rows };
    return { rows: [] };
  }) as any);
  const findParams = () => vi.mocked(pool.query).mock.calls.find((c: any[]) => String(c[0]).includes('portal_password_set = true'))![1] as any[];

  it('signs in with patient number + password', async () => {
    mockFind([who()]);
    const res = mockResponse();
    await passwordLogin(req({ identifier: 'p000012', password: 'Sunshine42' }), res);
    expect(findParams()).toEqual(['P000012']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 120, role: 'patient' }) }));
  });

  it('signs in with a phone number used by exactly one patient', async () => {
    mockFind([who()]);
    const res = mockResponse();
    await passwordLogin(req({ identifier: '+233 24 400 0201', password: 'Sunshine42' }), res);
    expect(findParams()).toEqual(['244000201']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: expect.any(String) }));
  });

  it('a shared family phone must use the patient number', async () => {
    mockFind([who(), who({ patient_id: 13, user_id: 130 })]);
    const res = mockResponse();
    await passwordLogin(req({ identifier: '0244000201', password: 'Sunshine42' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('a wrong password counts towards a lock, with the same message as an unknown user', async () => {
    mockFind([who({ failed_login_attempts: 4 })]);
    const res = mockResponse();
    await passwordLogin(req({ identifier: 'P000012', password: 'wrong123' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    const upd = vi.mocked(pool.query).mock.calls.find((c: any[]) => String(c[0]).includes('failed_login_attempts = $2'))!;
    expect((upd[1] as any[])[1]).toBe(5);
    expect((upd[1] as any[])[2]).toBeInstanceOf(Date);

    mockFind([]);
    const res2 = mockResponse();
    await passwordLogin(req({ identifier: 'P999999', password: 'wrong123' }), res2);
    expect(res2.json.mock.calls[0][0].error).toBe(res.json.mock.calls[0][0].error);
  });

  it('a locked account is refused even with the right password', async () => {
    mockFind([who({ locked_until: new Date(Date.now() + 60_000) })]);
    const res = mockResponse();
    await passwordLogin(req({ identifier: 'P000012', password: 'Sunshine42' }), res);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('password rules: 8+ characters with a letter and a number', () => {
    expect(portalPasswordProblem('short1')).toBeTruthy();
    expect(portalPasswordProblem('allletters')).toBeTruthy();
    expect(portalPasswordProblem('12345678')).toBeTruthy();
    expect(portalPasswordProblem('Sunshine42')).toBeNull();
  });
});
