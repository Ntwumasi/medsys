import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';
import { isClosingStatus } from '../utils/diagnosisGuard';
import { updateEncounter } from '../controllers/encounterController';

/**
 * PUT /encounters/:id sets status directly. Until now it never checked for a
 * diagnosis, so it was a way straight past the sign-off block — which is why
 * compliance stayed at 39% even for the patients that were supposedly blocked.
 */
describe('diagnosis hard stop', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('isClosingStatus', () => {
    it.each(['completed', 'discharged', 'with_nurse'])('treats %s as closing', (s) => {
      expect(isClosingStatus(s)).toBe(true);
    });

    it('exempts cancelled — a no-show has nothing to diagnose', () => {
      expect(isClosingStatus('cancelled')).toBe(false);
    });

    it.each(['in-progress', 'ready_for_doctor', undefined, null, 42])(
      'does not treat %s as closing',
      (s) => {
        expect(isClosingStatus(s)).toBe(false);
      }
    );
  });

  describe('updateEncounter', () => {
    const clinicalEncounter = { rows: [{ clinic: 'Family Medicine', is_otc: false, provider_id: 7 }] };

    it('blocks closing an encounter that has no diagnosis', async () => {
      vi.mocked(pool.query)
        // does it need one?
        .mockResolvedValueOnce(clinicalEncounter as any)
        // diagnosis lookup -> none
        .mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({ status: 'completed' }, { id: '10' }, {}, { id: 3 });
      const res = mockResponse();

      await updateEncounter(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'DIAGNOSIS_REQUIRED' })
      );
      // The UPDATE must never have run.
      expect(vi.mocked(pool.query).mock.calls.length).toBe(2);
    });

    it('does not block a department walk-in', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ clinic: 'Lab (Walk-in)', is_otc: false, provider_id: null }] } as any)
        .mockResolvedValue({ rows: [{ id: 10 }] } as any);

      const req = mockRequest({ status: 'completed' }, { id: '10' }, {}, { id: 3 });
      const res = mockResponse();

      await updateEncounter(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('allows cancelling without a diagnosis', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 10, status: 'cancelled' }] } as any);

      const req = mockRequest({ status: 'cancelled' }, { id: '10' }, {}, { id: 3 });
      const res = mockResponse();

      await updateEncounter(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('allows closing once a diagnosis exists', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce(clinicalEncounter as any)
        // diagnosis present
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as any)
        .mockResolvedValue({ rows: [{ id: 10, status: 'completed' }] } as any);

      const req = mockRequest({ status: 'completed' }, { id: '10' }, {}, { id: 3 });
      const res = mockResponse();

      await updateEncounter(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('leaves unrelated edits alone — no status change, no diagnosis check', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 10 }] } as any);

      const req = mockRequest({ chief_complaint: 'headache' }, { id: '10' }, {}, { id: 3 });
      const res = mockResponse();

      await updateEncounter(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
    });
  });
});
