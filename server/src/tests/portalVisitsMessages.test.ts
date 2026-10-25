import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';

vi.mock('../services/smsService', () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true, provider: 'arkesel', messageId: 'm1' }),
  validatePhoneNumber: (p: string) => ({ valid: /^0\d{9}$/.test(p), formatted: '+233' + p.slice(1) }),
}));
vi.mock('../services/emailService', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, provider: 'smtp', messageId: 'e1' }),
  textToHtml: (t: string) => t,
  validateEmail: (e: string) => e.includes('@'),
}));
vi.mock('../services/notificationService', () => ({ default: { sendToRole: vi.fn().mockResolvedValue(undefined) } }));

import { sendSMS } from '../services/smsService';
import { textVisitSummary } from '../services/patientAutoTextService';
import { sendMyMessage } from '../controllers/portalMessagesController';

const calls = () => vi.mocked(pool.query).mock.calls.map((c) => ({ sql: String(c[0]), params: c[1] as unknown[] }));

const mockDb = (enabled: boolean) => {
  vi.mocked(pool.query).mockImplementation((async (sql: string) => {
    if (sql.includes('FROM encounters WHERE id')) return { rows: [{ patient_id: 7 }] };
    if (sql.includes('FROM reminder_settings')) {
      return { rows: [{ setting_key: 'patient_sms_visit_summary_enabled', setting_value: String(enabled) },
                      { setting_key: 'patient_sms_clinic_name', setting_value: 'Medics Clinic' }] };
    }
    if (sql.includes('FROM patients p')) return { rows: [{ patient_id: 7, first_name: 'AMA', phone: '0241234567', email: null, opted_out: false, merged: false }] };
    if (sql.includes('INSERT INTO patient_sms_log')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  }) as any);
};

describe('after-visit text', () => {
  beforeEach(() => { vi.mocked(pool.query).mockReset(); vi.mocked(sendSMS).mockClear(); });

  it('texts a 7-day link to that visit and never logs the usable link', async () => {
    mockDb(true);
    await textVisitSummary(42);

    const token = calls().find((c) => c.sql.includes('INSERT INTO patient_portal_access_tokens'));
    expect(token?.params).toEqual(expect.arrayContaining(['notify', 'visit:42']));
    const expires = (token!.params[2] as Date).getTime() - Date.now();
    expect(expires).toBeGreaterThan(6.9 * 86400000);
    expect(expires).toBeLessThanOrEqual(7 * 86400000);

    const [, text] = vi.mocked(sendSMS).mock.calls[0];
    expect(text).toMatch(/^Hello Ama, thank you for visiting Medics Clinic\. Your visit summary and invoice: .*\/portal\/verify\?token=[0-9a-f]+ \(valid 7 days\)\.$/);

    const logged = calls().find((c) => c.sql.includes('INSERT INTO patient_sms_log'))!.params[5] as string;
    expect(logged).toContain('token=…');
    expect(logged).not.toMatch(/token=[0-9a-f]/);
  });

  it('does nothing — not even a link — while switched off', async () => {
    mockDb(false);
    await textVisitSummary(42);
    expect(calls().some((c) => c.sql.includes('patient_portal_access_tokens'))).toBe(false);
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe('patient messages', () => {
  const res = () => {
    const r: any = {};
    r.status = vi.fn(() => r);
    r.json = vi.fn(() => r);
    return r;
  };
  beforeEach(() => vi.mocked(pool.query).mockReset());

  it('refuses an empty or over-long message', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 7 }] } as any);
    for (const body of ['   ', 'x'.repeat(1001)]) {
      const r = res();
      await sendMyMessage({ user: { id: 1 }, body: { body } } as any, r);
      expect(r.status).toHaveBeenCalledWith(400);
    }
  });

  it('stops a patient after 20 messages in a day', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) =>
      String(sql).includes('COUNT(*)') ? { rows: [{ n: 20 }] } : { rows: [{ id: 7 }] }) as any);
    const r = res();
    await sendMyMessage({ user: { id: 1 }, body: { body: 'Hello' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(429);
  });
});
