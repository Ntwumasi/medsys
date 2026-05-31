import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../database/db';
import { mockRequest, mockResponse } from './helpers';

// Mock services that workflowController imports
vi.mock('../services/billingService', () => ({
  default: { generateEncounterInvoice: vi.fn().mockResolvedValue({ total: 100 }) },
}));
vi.mock('../services/auditService', () => ({
  default: { log: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../services/notificationService', () => ({
  default: {
    notifyPatientCheckedIn: vi.fn().mockResolvedValue(undefined),
    notifyPatientCheckedOut: vi.fn().mockResolvedValue(undefined),
    notifyReadyForCheckout: vi.fn().mockResolvedValue(undefined),
    notifyDepartmentWalkIn: vi.fn().mockResolvedValue(undefined),
    sendToRole: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../utils/vitalSignsValidation', () => ({
  validateAllVitals: vi.fn().mockReturnValue({ isValid: true, warnings: [], criticalValues: [], errors: [] }),
}));
vi.mock('./nurseFollowUpTaskController', () => ({
  getNextMonOrThu: vi.fn().mockReturnValue('2026-06-01'),
}));

import {
  checkInPatient,
  alertDoctor,
  getNurseAssignedPatients,
  checkoutPatient,
} from '../controllers/workflowController';

// Helper to create a mock client (for functions that use pool.connect)
const createMockClient = () => ({
  query: vi.fn(),
  release: vi.fn(),
});

describe('workflowController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── checkInPatient ──────────────────────────────────────────────────
  describe('checkInPatient', () => {
    it('should reject duplicate check-in with 409', async () => {
      const mockClient = createMockClient();
      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      // 1. SELECT users WHERE id = receptionist_id
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] } as any);
      // 2. BEGIN
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 3. SELECT active encounter today (duplicate found!)
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 99,
          encounter_number: 'ENC000099',
          checked_in_at: new Date().toISOString(),
          patient_name: 'John Doe',
        }],
      } as any);
      // 4. ROLLBACK
      mockClient.query.mockResolvedValueOnce(undefined as any);

      const req = mockRequest(
        { patient_id: 1, chief_complaint: 'Headache' },
        {},
        {},
        { id: 1 }
      );
      const res = mockResponse();

      await checkInPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Patient already checked in',
          existingEncounterId: 99,
          existingEncounterNumber: 'ENC000099',
        })
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should successfully create encounter and invoice for a returning patient', async () => {
      const mockClient = createMockClient();
      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const encounter = {
        id: 100,
        encounter_number: 'ENC000100',
        patient_id: 1,
        encounter_type: 'walk-in',
      };

      // 1. SELECT users (receptionist exists)
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] } as any);
      // 2. BEGIN
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 3. Active encounter check (none found)
      mockClient.query.mockResolvedValueOnce({ rows: [] } as any);
      // 4. Payer source check
      mockClient.query.mockResolvedValueOnce({ rows: [] } as any);
      // 5. INSERT encounter
      mockClient.query.mockResolvedValueOnce({ rows: [encounter] } as any);
      // 6. Encounter count (returning patient = 2)
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '2' }] } as any);
      // 7. MAX invoice id
      mockClient.query.mockResolvedValueOnce({ rows: [{ next_id: '50' }] } as any);
      // 8. Consultation charge_master lookup (CONS-GP)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 10, price: '200.00', service_name: 'General Consultation' }],
      } as any);
      // 9. INSERT invoice
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 50, invoice_number: 'INV000050' }],
      } as any);
      // 10. INSERT invoice_item (consultation)
      mockClient.query.mockResolvedValueOnce({ rows: [] } as any);
      // 11. Patient info query
      mockClient.query.mockResolvedValueOnce({
        rows: [{ patient_name: 'John Doe', patient_number: 'PT001' }],
      } as any);
      // 12. Conflict check for appointment
      mockClient.query.mockResolvedValueOnce({ rows: [] } as any);
      // 13. INSERT appointment
      mockClient.query.mockResolvedValueOnce({ rows: [] } as any);
      // 14. COMMIT
      mockClient.query.mockResolvedValueOnce(undefined as any);

      const req = mockRequest(
        { patient_id: 1, chief_complaint: 'Headache', encounter_type: 'walk-in' },
        {},
        {},
        { id: 1 }
      );
      const res = mockResponse();

      await checkInPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Patient checked in successfully',
          encounter: expect.objectContaining({ id: 100 }),
        })
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 500 and rollback on unexpected error', async () => {
      const mockClient = createMockClient();
      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      // 1. SELECT users
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] } as any);
      // 2. BEGIN
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 3. Throw on active encounter check
      mockClient.query.mockRejectedValueOnce(new Error('DB connection lost'));

      const req = mockRequest({ patient_id: 1 }, {}, {}, { id: 1 });
      const res = mockResponse();

      await checkInPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ─── alertDoctor ─────────────────────────────────────────────────────
  describe('alertDoctor', () => {
    it('should reject when no doctor assigned (provider_id null)', async () => {
      // 1. SELECT encounter
      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{ patient_id: 1, provider_id: null }],
        } as any);

      const req = mockRequest(
        { encounter_id: 10, message: 'Patient ready' },
        {},
        {},
        { id: 5 }
      );
      const res = mockResponse();

      await alertDoctor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('No doctor assigned'),
        })
      );
    });

    it('should return 404 when encounter not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest(
        { encounter_id: 999 },
        {},
        {},
        { id: 5 }
      );
      const res = mockResponse();

      await alertDoctor(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Encounter not found' });
    });

    it('should successfully create alert with type ready_for_doctor', async () => {
      const alertRow = {
        id: 1,
        encounter_id: 10,
        patient_id: 1,
        from_user_id: 5,
        to_user_id: 3,
        alert_type: 'ready_for_doctor',
        message: 'Patient is ready for doctor',
      };

      vi.mocked(pool.query)
        // 1. SELECT encounter
        .mockResolvedValueOnce({
          rows: [{ patient_id: 1, provider_id: 3 }],
        } as any)
        // 2. UPDATE encounters status
        .mockResolvedValueOnce({ rows: [] } as any)
        // 3. INSERT alert
        .mockResolvedValueOnce({ rows: [alertRow] } as any);

      const req = mockRequest(
        { encounter_id: 10, message: 'Patient is ready for doctor' },
        {},
        {},
        { id: 5 }
      );
      const res = mockResponse();

      await alertDoctor(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Doctor alerted successfully',
          alert: expect.objectContaining({ alert_type: 'ready_for_doctor' }),
        })
      );
    });
  });

  // ─── getNurseAssignedPatients ────────────────────────────────────────
  describe('getNurseAssignedPatients', () => {
    it('should return today\'s encounters for the nurse', async () => {
      const patientRows = [
        { id: 10, patient_name: 'Jane Doe', status: 'in-progress', encounter_date: new Date().toISOString() },
      ];

      vi.mocked(pool.query)
        // 1. Main query
        .mockResolvedValueOnce({ rows: patientRows } as any)
        // 2. Vitals query for first encounter
        .mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({}, {}, {}, { id: 5 });
      const res = mockResponse();

      await getNurseAssignedPatients(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          patients: expect.arrayContaining([
            expect.objectContaining({ id: 10, patient_name: 'Jane Doe' }),
          ]),
        })
      );

      // Verify the main query filters by nurse_id and date
      const mainQueryCall = vi.mocked(pool.query).mock.calls[0];
      const sql = mainQueryCall[0] as string;
      expect(sql).toContain('nurse_id = $1');
      expect(sql).toContain('CURRENT_DATE');
      // Verify cancelled is excluded
      expect(sql).toContain("'cancelled'");
    });

    it('should return empty array when nurse has no patients', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({}, {}, {}, { id: 5 });
      const res = mockResponse();

      await getNurseAssignedPatients(req, res);

      expect(res.json).toHaveBeenCalledWith({ patients: [] });
    });
  });

  // ─── checkoutPatient ─────────────────────────────────────────────────
  describe('checkoutPatient', () => {
    it('should successfully discharge patient', async () => {
      const mockClient = createMockClient();
      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      // 1. BEGIN
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 2. SELECT encounter details
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 10, room_id: 5, patient_id: 1, status: 'completed',
          provider_id: 3, room_number: '101',
          patient_name: 'John Doe', patient_number: 'PT001',
        }],
      } as any);
      // 3. Check unsigned notes (none)
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      // 4. Release room
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 5. UPDATE encounter to discharged
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 6. Mark alerts as read
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 7. Check existing review task
      mockClient.query.mockResolvedValueOnce({ rows: [] } as any);
      // 8. INSERT follow-up task
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 9. COMMIT
      mockClient.query.mockResolvedValueOnce(undefined as any);

      const req = mockRequest(
        { encounter_id: 10 },
        {},
        {},
        { id: 1 }
      );
      const res = mockResponse();

      await checkoutPatient(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('checked out successfully'),
        })
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject checkout if unsigned clinical notes exist', async () => {
      const mockClient = createMockClient();
      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      // 1. BEGIN
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 2. SELECT encounter details
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 10, room_id: 5, patient_id: 1, status: 'completed',
          provider_id: 3, room_number: '101',
          patient_name: 'John Doe', patient_number: 'PT001',
        }],
      } as any);
      // 3. Check unsigned notes (1 unsigned note!)
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);

      const req = mockRequest(
        { encounter_id: 10 },
        {},
        {},
        { id: 1 }
      );
      const res = mockResponse();

      await checkoutPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('unsigned clinical notes'),
        })
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 404 when encounter not found', async () => {
      const mockClient = createMockClient();
      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      // 1. BEGIN
      mockClient.query.mockResolvedValueOnce(undefined as any);
      // 2. SELECT encounter (not found)
      mockClient.query.mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest(
        { encounter_id: 999 },
        {},
        {},
        { id: 1 }
      );
      const res = mockResponse();

      await checkoutPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Encounter not found' });
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
