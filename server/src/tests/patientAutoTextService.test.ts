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

import { sendSMS } from '../services/smsService';
import { sendPatientText } from '../services/patientAutoTextService';

// SQL-aware pool mock: settings, patient contact, the claim insert, the status update.
const mockDb = (opts: {
  enabled?: boolean;
  patient?: Partial<{ first_name: string; phone: string | null; email: string | null; opted_out: boolean; merged: boolean }>;
  alreadySent?: boolean;
}) => {
  vi.mocked(pool.query).mockImplementation((async (sql: string) => {
    if (sql.includes('FROM reminder_settings')) {
      return { rows: [{ setting_key: 'patient_sms_lab_ready_enabled', setting_value: opts.enabled === false ? 'false' : 'true' },
                      { setting_key: 'patient_sms_clinic_name', setting_value: 'Medics Clinic' }] };
    }
    if (sql.includes('FROM patients p')) {
      return { rows: [{ patient_id: 7, first_name: 'AMA', phone: '0241234567', email: null, opted_out: false, merged: false, ...opts.patient }] };
    }
    if (sql.includes('INSERT INTO patient_sms_log')) return { rows: opts.alreadySent ? [] : [{ id: 1 }] };
    return { rows: [] };
  }) as any);
};

const send = () =>
  sendPatientText({
    kind: 'lab_ready',
    refKey: '7:2026-10-24',
    patientId: 7,
    message: (n, s) => `Hello ${n}, your lab results at ${s.clinicName} are ready.`,
  });

describe('sendPatientText', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(sendSMS).mockClear();
  });

  it('sends when the kind is on, with a tidy first name', async () => {
    mockDb({});
    expect(await send()).toBe('sent');
    expect(sendSMS).toHaveBeenCalledWith('+233241234567', 'Hello Ama, your lab results at Medics Clinic are ready.');
  });

  it('sends nothing while the kind is switched off', async () => {
    mockDb({ enabled: false });
    expect(await send()).toBe('skipped');
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('respects the patient opt-out', async () => {
    mockDb({ patient: { opted_out: true } });
    expect(await send()).toBe('skipped');
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('never sends the same reminder twice', async () => {
    mockDb({ alreadySent: true });
    expect(await send()).toBe('skipped');
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('skips a patient with no usable phone when there is no email fallback', async () => {
    mockDb({ patient: { phone: '123' } });
    expect(await send()).toBe('skipped');
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('never throws — a database error is reported as failed', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('db down'));
    expect(await send()).toBe('failed');
  });
});
