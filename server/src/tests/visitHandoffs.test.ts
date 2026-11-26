import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../services/notificationService', () => ({
  default: {
    notifyPatientCheckedOut: vi.fn().mockResolvedValue(undefined),
    notifyPatientCheckedIn: vi.fn().mockResolvedValue(undefined),
    notifyReadyForCheckout: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/patientAutoTextService', () => ({
  textVisitSummary: vi.fn(),
  textHomeVisitOnTheWay: vi.fn(),
}));
vi.mock('../services/billingService', () => ({ default: { generateEncounterInvoice: vi.fn() } }));

import { autoCheckoutIfFullyPaid } from '../services/autoCheckoutService';
import { releaseRoom } from '../controllers/workflowController';

interface Stage {
  doctor_completed_at?: string | null;
  status?: string;
  clinic?: string | null;
  is_otc?: boolean;
  open_labs?: number;
  open_meds?: number;
  routing?: string[];
}

// A transaction client for a PAID invoice whose visit is at `stage`.
const paidVisit = (stage: Stage) => {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (raw: unknown) => {
      const sql = String(raw);
      calls.push(sql);
      if (sql.includes('FROM invoices i')) {
        return { rows: [{ id: 9, encounter_id: 4, total_amount: '100', amount_paid: '100', status: 'paid' }] };
      }
      if (sql.includes('SELECT e.id, e.status, e.room_id')) {
        return { rows: [{ id: 4, status: stage.status || 'in-progress', room_id: 2, patient_id: 1 }] };
      }
      if (sql.includes('FROM department_routing')) {
        return { rows: (stage.routing || []).map((s, i) => ({ id: i + 1, status: s })) };
      }
      if (sql.includes('open_labs')) {
        return {
          rows: [{
            doctor_completed_at: stage.doctor_completed_at ?? null,
            status: stage.status || 'in-progress',
            clinic: stage.clinic ?? 'General Practice',
            is_otc: !!stage.is_otc,
            open_labs: String(stage.open_labs || 0),
            open_meds: String(stage.open_meds || 0),
          }],
        };
      }
      if (sql.includes('FROM clinical_notes')) return { rows: [{ count: '0' }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  vi.mocked(pool.connect).mockResolvedValue(client as any);
  return { calls };
};

const discharged = (calls: string[]) => calls.some((c) => c.includes("SET status = 'discharged'"));

describe('auto-checkout after a full payment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not discharge a patient who paid before seeing the doctor', async () => {
    const { calls } = paidVisit({ doctor_completed_at: null });
    const r = await autoCheckoutIfFullyPaid(9, 1);
    expect(r).toEqual({ didCheckout: false, reason: 'visit_in_progress' });
    expect(discharged(calls)).toBe(false);
  });

  it('waits while a lab test or medicine is still outstanding', async () => {
    const { calls } = paidVisit({ doctor_completed_at: '2026-11-26T10:00:00Z', open_meds: 1 });
    const r = await autoCheckoutIfFullyPaid(9, 1);
    expect(r.reason).toBe('orders_outstanding');
    expect(discharged(calls)).toBe(false);
  });

  it('counts routing stored as in-progress (hyphen) as still at a department', async () => {
    paidVisit({ doctor_completed_at: '2026-11-26T10:00:00Z', routing: ['in-progress'] });
    const r = await autoCheckoutIfFullyPaid(9, 1);
    expect(r.reason).toBe('pending_department_routing');
    const routingSql = vi.mocked((await pool.connect()).query).mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('FROM department_routing'));
    expect(routingSql).toContain("'in-progress'");
  });

  it('discharges once the doctor has finished and nothing is outstanding', async () => {
    const { calls } = paidVisit({ doctor_completed_at: '2026-11-26T10:00:00Z' });
    const r = await autoCheckoutIfFullyPaid(9, 1);
    expect(r.didCheckout).toBe(true);
    expect(discharged(calls)).toBe(true);
  });

  it('still discharges a department walk-in, which has no doctor step', async () => {
    const { calls } = paidVisit({ clinic: 'Lab (Walk-in)' });
    const r = await autoCheckoutIfFullyPaid(9, 1);
    expect(r.didCheckout).toBe(true);
    expect(discharged(calls)).toBe(true);
  });
});

describe('release-room after a payment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves the room and visit alone if the doctor has not finished', async () => {
    vi.mocked(pool.query).mockImplementation((async (raw: unknown) => {
      const sql = String(raw);
      if (sql.includes('FROM encounters e')) {
        return { rows: [{ room_id: 3, patient_id: 1, status: 'in-progress', doctor_completed_at: null, clinic: 'General Practice', is_otc: false }] };
      }
      return { rows: [] };
    }) as any);
    const req = mockRequest({ encounter_id: 4, after_payment: true }, {}, {}, { id: 1, role: 'receptionist' });
    const res = mockResponse();
    await releaseRoom(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ visit_in_progress: true }));
    const writes = vi.mocked(pool.query).mock.calls.map((c) => String(c[0])).filter((s) => /UPDATE (rooms|encounters)/.test(s));
    expect(writes).toEqual([]);
  });
});

import { checkInPatient } from '../controllers/workflowController';

describe('checking in a booked appointment', () => {
  beforeEach(() => vi.clearAllMocks());

  const bookedClient = (appt: { patient_id: number; provider_id: number | null; status: string }) => {
    const calls: Array<{ sql: string; params: any[] }> = [];
    const client = {
      query: vi.fn(async (raw: unknown, params: any[] = []) => {
        const sql = String(raw);
        calls.push({ sql, params });
        if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 1 }] };
        if (sql.includes('FROM appointments WHERE id = $1 FOR UPDATE')) return { rows: [{ id: 77, ...appt }] };
        if (sql.includes('INSERT INTO encounters')) return { rows: [{ id: 100, encounter_number: 'ENC100', patient_id: appt.patient_id, encounter_type: 'follow-up' }] };
        if (sql.includes('COUNT(*)')) return { rows: [{ count: '2' }] };
        if (sql.includes('SELECT source, patient_number')) return { rows: [{ source: 'medsys', patient_number: 'PT1' }] };
        if (sql.includes('nextval')) return { rows: [{ n: 5 }] };
        if (sql.includes('INSERT INTO invoices')) return { rows: [{ id: 50, invoice_number: 'INV5', status: 'pending' }] };
        if (sql.includes('FROM invoices WHERE id')) return { rows: [{ id: 50, invoice_number: 'INV5', status: 'pending' }] };
        if (sql.includes('as patient_name, p.patient_number')) return { rows: [{ patient_name: 'Ama Owusu', patient_number: 'PT1' }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValueOnce(client as any);
    return calls;
  };

  it("marks THAT appointment checked-in, keeps its doctor, and adds no walk-in appointment", async () => {
    const calls = bookedClient({ patient_id: 1, provider_id: 12, status: 'scheduled' });
    const req = mockRequest({ patient_id: 1, encounter_type: 'follow-up', appointment_id: 77 }, {}, {}, { id: 1 });
    const res = mockResponse();
    await checkInPatient(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const enc = calls.find((c) => c.sql.includes('INSERT INTO encounters'))!;
    expect(enc.params[1]).toBe(12); // provider from the appointment
    expect(enc.params[8]).toBe(77); // appointment_id on the encounter
    const upd = calls.find((c) => c.sql.includes('UPDATE appointments'))!;
    expect(upd.sql).toContain("status = 'checked-in'");
    expect(upd.params.slice(0, 2)).toEqual([77, 100]);
    expect(calls.some((c) => c.sql.includes('INSERT INTO appointments'))).toBe(false);
  });

  it("refuses an appointment that belongs to another patient", async () => {
    const calls = bookedClient({ patient_id: 2, provider_id: 12, status: 'scheduled' });
    const req = mockRequest({ patient_id: 1, appointment_id: 77 }, {}, {}, { id: 1 });
    const res = mockResponse();
    await checkInPatient(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(calls.some((c) => c.sql.includes('INSERT INTO encounters'))).toBe(false);
  });
});

describe('consultation fee for a clinic with no linked charge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags it [PRICE PENDING] with the clinic name instead of billing a GP consult', async () => {
    const calls: Array<{ sql: string; params: any[] }> = [];
    const client = {
      query: vi.fn(async (raw: unknown, params: any[] = []) => {
        const sql = String(raw);
        calls.push({ sql, params });
        if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 1 }] };
        if (sql.includes('INSERT INTO encounters')) return { rows: [{ id: 101, encounter_number: 'ENC101', patient_id: 1, encounter_type: 'walk-in' }] };
        if (sql.includes('COUNT(*)')) return { rows: [{ count: '2' }] };
        if (sql.includes('SELECT source, patient_number')) return { rows: [{ source: 'medsys', patient_number: 'PT1' }] };
        if (sql.includes('nextval')) return { rows: [{ n: 6 }] };
        if (sql.includes('INSERT INTO invoices')) return { rows: [{ id: 51, invoice_number: 'INV6', status: 'pending' }] };
        if (sql.includes('as patient_name, p.patient_number')) return { rows: [{ patient_name: 'Daniel Addo', patient_number: 'PT1' }] };
        return { rows: [] }; // no linked clinic charge, no name match
      }),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValueOnce(client as any);
    const req = mockRequest({ patient_id: 1, clinic: 'GENERAL SURGERY', encounter_type: 'walk-in' }, {}, {}, { id: 1 });
    const res = mockResponse();
    await checkInPatient(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(calls.some((c) => c.sql.includes('WHERE service_code = $1') && c.params[0] === 'CONS-GP')).toBe(false);
    const item = calls.find((c) => c.sql.includes('INSERT INTO invoice_items'));
    expect(JSON.stringify(item?.params)).toContain('GENERAL SURGERY Consultation [PRICE PENDING]');
  });
});
