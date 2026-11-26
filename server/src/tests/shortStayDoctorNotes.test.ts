import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

vi.mock('../services/auditService', () => ({ default: { log: vi.fn() } }));

import { parseDoctorNote, addDoctorNote, updateDoctorNote, setTreatmentPlan } from '../controllers/shortStayController';

const doctor = { id: 7, role: 'doctor' };

describe('parseDoctorNote', () => {
  it('rejects an unknown type and an empty note', () => {
    expect(parseDoctorNote({ note_type: 'other', subjective: 'x' }).error).toBe('Choose the type of note.');
    expect(parseDoctorNote({ note_type: 'progress' }).error).toBe('The note is empty.');
  });
  it('needs the procedure named', () => {
    expect(parseDoctorNote({ note_type: 'procedure', examination: 'I&D done' }).error).toBe('Name the procedure.');
  });
  it('needs a plan before signing, but not for a draft', () => {
    expect(parseDoctorNote({ note_type: 'progress', subjective: 'Feels better', sign: true }).error).toBe('Add the plan before signing.');
    expect(parseDoctorNote({ note_type: 'discharge', subjective: 'Stay summary', sign: true }).error).toBe('Add the medicines and follow-up before signing.');
    expect(parseDoctorNote({ note_type: 'progress', subjective: 'Feels better' }).note?.sign).toBe(false);
  });
});

describe('doctor note endpoints', () => {
  const query = vi.mocked(pool.query);
  beforeEach(() => query.mockReset());

  it('saves a signed note with the author', async () => {
    query.mockImplementation((async (raw: unknown) => {
      const sql = String(raw);
      if (sql.includes('SELECT id FROM short_stays')) return { rows: [{ id: 3 }] };
      if (sql.includes('INSERT INTO short_stay_doctor_notes')) return { rows: [{ id: 50 }] };
      if (sql.includes('FROM short_stay_doctor_notes n')) return { rows: [{ id: 50, status: 'signed', author_id: 7 }] };
      return { rows: [] };
    }) as any);
    const req = mockRequest({ note_type: 'progress', subjective: 'Better', assessment_plan: 'Home tomorrow', sign: true }, { id: '3' }, {}, doctor);
    const res = mockResponse();
    await addDoctorNote(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const ins = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO short_stay_doctor_notes'))!;
    expect(ins[1]).toEqual([3, 'progress', null, 'Better', null, 'Home tomorrow', 'signed', 7]);
    // Regression: an uncast $7 in both VALUES and CASE fails on real Postgres.
    expect(String(ins[0])).toContain("CASE WHEN $7::varchar = 'signed'");
  });

  it('refuses to change a signed note', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 50, status: 'signed', author_id: 7, note_type: 'progress' }] } as any);
    const res = mockResponse();
    await updateDoctorNote(mockRequest({ subjective: 'changed' }, { noteId: '50' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("refuses to edit another doctor's draft", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 51, status: 'draft', author_id: 99, note_type: 'progress' }] } as any);
    const res = mockResponse();
    await updateDoctorNote(mockRequest({ subjective: 'changed' }, { noteId: '51' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('does not set a plan on a closed stay', async () => {
    query.mockImplementation((async (raw: unknown) => {
      const sql = String(raw);
      if (sql.includes('UPDATE short_stays SET treatment_plan')) return { rows: [] };
      if (sql.includes('SELECT id FROM short_stays')) return { rows: [{ id: 3 }] };
      return { rows: [] };
    }) as any);
    const res = mockResponse();
    await setTreatmentPlan(mockRequest({ treatment_plan: 'IV fluids' }, { id: '3' }, {}, doctor), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
