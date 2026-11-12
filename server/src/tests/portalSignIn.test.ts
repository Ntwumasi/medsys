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
