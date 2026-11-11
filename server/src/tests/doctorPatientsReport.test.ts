import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';
import {
  getDoctorPatientsReport,
  isMissedAppointment,
  validateRange,
} from '../controllers/doctorPatientsReportController';
import { authorizeRoles } from '../middleware/auth';

const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000);
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

describe('isMissedAppointment', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const past = '2026-11-10T09:00:00Z';
  const future = '2026-11-10T15:00:00Z';

  it('counts a no-show as missed, in either spelling', () => {
    expect(isMissedAppointment({ status: 'no-show', appointment_date: future, has_same_day_encounter: false }, now)).toBe(true);
    expect(isMissedAppointment({ status: 'no_show', appointment_date: future, has_same_day_encounter: true }, now)).toBe(true);
  });

  it('counts a past scheduled/confirmed appointment with no same-day visit as missed', () => {
    expect(isMissedAppointment({ status: 'scheduled', appointment_date: past, has_same_day_encounter: false }, now)).toBe(true);
    expect(isMissedAppointment({ status: 'confirmed', appointment_date: new Date(past), has_same_day_encounter: false }, now)).toBe(true);
  });

  it('is not missed when the patient was seen that day', () => {
    expect(isMissedAppointment({ status: 'scheduled', appointment_date: past, has_same_day_encounter: true }, now)).toBe(false);
  });

  it('is not missed while the time has not come yet', () => {
    expect(isMissedAppointment({ status: 'scheduled', appointment_date: future, has_same_day_encounter: false }, now)).toBe(false);
  });

  it('is not missed once checked in, completed or cancelled', () => {
    for (const status of ['checked-in', 'in-progress', 'completed', 'cancelled']) {
      expect(isMissedAppointment({ status, appointment_date: past, has_same_day_encounter: false }, now)).toBe(false);
    }
  });
});

describe('validateRange', () => {
  it('accepts a normal week', () => {
    expect(validateRange('2026-11-09', '2026-11-15')).toEqual({ ok: true, from: '2026-11-09', to: '2026-11-15', days: 7 });
  });

  it('accepts exactly 93 days and rejects 94', () => {
    expect(validateRange('2026-01-01', '2026-04-03')).toMatchObject({ ok: true, days: 93 });
    expect(validateRange('2026-01-01', '2026-04-04')).toMatchObject({ ok: false });
  });

  it('rejects missing, malformed, impossible or reversed dates', () => {
    expect(validateRange(undefined, '2026-11-15').ok).toBe(false);
    expect(validateRange('11/09/2026', '2026-11-15').ok).toBe(false);
    expect(validateRange('2026-02-31', '2026-03-02').ok).toBe(false);
    expect(validateRange('2026-11-15', '2026-11-09').ok).toBe(false);
    expect(validateRange("2026-11-09'; DROP TABLE x;--", '2026-11-15').ok).toBe(false);
  });
});

describe('who can open the report (authorizeRoles nurse, admin)', () => {
  const gate = authorizeRoles('nurse', 'admin');
  const run = (user: any) => {
    const res = mockResponse();
    const next = vi.fn();
    gate(mockRequest({}, {}, {}, user), res, next);
    return { res, next };
  };

  it('lets nurses, admins, office managers and super admins in', () => {
    for (const user of [
      { id: 1, role: 'nurse' },
      { id: 2, role: 'admin' },
      { id: 3, role: 'office_manager' },
      { id: 4, role: 'receptionist', is_super_admin: true },
    ]) {
      expect(run(user).next).toHaveBeenCalled();
    }
  });

  it('turns away doctors, receptionists and patients', () => {
    for (const role of ['doctor', 'receptionist', 'patient', 'accountant']) {
      const { res, next } = run({ id: 9, role });
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });
});

describe('GET /reports/doctor-patients', () => {
  const nurse = { id: 20, role: 'nurse' };
  let calls: Array<{ sql: string; params: any[] }>;

  const encounterRow = (over: Record<string, unknown> = {}) => ({
    encounter_id: 1, patient_id: 55, provider_id: 3, provider_name: 'Kofi Mensah',
    encounter_date: new Date('2026-11-09T09:30:00Z'), encounter_type: 'consultation',
    chief_complaint: 'Headache', status: 'completed', is_home_visit: false,
    primary_diagnosis: 'Migraine', patient_number: 'P001', date_of_birth: '1980-05-01',
    patient_name: 'Ama Owusu', phone: '0244000000', ...over,
  });
  const apptRow = (over: Record<string, unknown> = {}) => ({
    appointment_id: 10, patient_id: 55, provider_id: 3, provider_name: 'Kofi Mensah',
    appointment_date: hourAgo(), duration_minutes: 30, appointment_type: 'follow-up',
    status: 'scheduled', reason: 'BP review', location_type: 'clinic', patient_number: 'P001',
    date_of_birth: null, patient_name: 'Ama Owusu', phone: '0244000000',
    has_same_day_encounter: false, ...over,
  });

  const mockDb = (encounters: any[], appointments: any[]) => {
    calls = [];
    vi.mocked(pool.query).mockImplementation((async (raw: unknown, params: any[] = []) => {
      const sql = String(raw);
      calls.push({ sql, params });
      if (sql.includes('FROM encounters e') && sql.includes('WITH enc')) return { rows: encounters };
      if (sql.includes('FROM appointments a')) return { rows: appointments };
      return { rows: [] };
    }) as any);
  };

  beforeEach(() => vi.clearAllMocks());

  it('rejects a range longer than 93 days without touching the database', async () => {
    mockDb([], []);
    const res = mockResponse();
    await getDoctorPatientsReport(mockRequest({}, {}, { from: '2026-01-01', to: '2026-06-01' }, nurse), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric doctor_id', async () => {
    mockDb([], []);
    const res = mockResponse();
    await getDoctorPatientsReport(mockRequest({}, {}, { from: '2026-11-09', to: '2026-11-15', doctor_id: '3 OR 1=1' }, nurse), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('passes the doctor filter as a parameter to both queries', async () => {
    mockDb([], []);
    const res = mockResponse();
    await getDoctorPatientsReport(mockRequest({}, {}, { from: '2026-11-09', to: '2026-11-15', doctor_id: '3' }, nurse), res);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.params).toEqual(['2026-11-09', '2026-11-15', 3]);
      expect(c.sql).toContain('$3::int IS NULL OR');
      expect(c.sql).toContain('merged_into IS NULL');
      expect(c.sql).toContain("<> 'cancelled'");
      expect(c.sql).toContain("DATE '1900-01-01'");
    }
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ doctor_id: 3 }));
  });

  it('uses NULL for "All doctors"', async () => {
    mockDb([], []);
    const res = mockResponse();
    await getDoctorPatientsReport(mockRequest({}, {}, { from: '2026-11-09', to: '2026-11-15', doctor_id: 'all' }, nurse), res);
    for (const c of calls) expect(c.params[2]).toBeNull();
  });

  it('groups by doctor with counts and flags missed appointments', async () => {
    mockDb(
      [
        encounterRow(),
        encounterRow({ encounter_id: 2, patient_id: 56, patient_name: 'Yaw Boateng', is_home_visit: true }),
        encounterRow({ encounter_id: 3, provider_id: 4, provider_name: 'Abena Asante' }),
        encounterRow({ encounter_id: 4, provider_id: null, provider_name: null }),
      ],
      [
        apptRow(), // past, scheduled, no visit → missed
        apptRow({ appointment_id: 11, has_same_day_encounter: true }), // came in → not missed
        apptRow({ appointment_id: 12, appointment_date: inAnHour() }), // later today → not missed
        apptRow({ appointment_id: 13, provider_id: 4, provider_name: 'Abena Asante', status: 'no-show', appointment_date: inAnHour() }),
      ]
    );
    const res = mockResponse();
    await getDoctorPatientsReport(mockRequest({}, {}, { from: '2026-11-09', to: '2026-11-15' }, nurse), res);
    const body = vi.mocked(res.json).mock.calls[0][0];

    expect(body.seen.total).toBe(4);
    expect(body.seen.groups.map((g: any) => [g.doctor_name, g.count])).toEqual([
      ['Abena Asante', 1],
      ['Kofi Mensah', 2],
      ['No doctor assigned', 1],
    ]);
    expect(body.seen.groups[1].encounters[1].is_home_visit).toBe(true);

    expect(body.appointments.total).toBe(4);
    expect(body.appointments.missed_count).toBe(2);
    const kofi = body.appointments.groups.find((g: any) => g.doctor_id === 3);
    expect(kofi.count).toBe(3);
    expect(kofi.missed_count).toBe(1);
    expect(kofi.appointments.map((a: any) => [a.appointment_id, a.missed])).toEqual([[10, true], [11, false], [12, false]]);
    const abena = body.appointments.groups.find((g: any) => g.doctor_id === 4);
    expect(abena.appointments[0].missed).toBe(true);
  });

  it('never writes to the database', async () => {
    mockDb([encounterRow()], [apptRow()]);
    await getDoctorPatientsReport(mockRequest({}, {}, { from: '2026-11-09', to: '2026-11-15' }, nurse), mockResponse());
    for (const c of calls) expect(c.sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i);
  });

  it('returns 500 when the query fails', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('boom'));
    const res = mockResponse();
    await getDoctorPatientsReport(mockRequest({}, {}, { from: '2026-11-09', to: '2026-11-15' }, nurse), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
