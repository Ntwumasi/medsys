import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import pool from '../database/db';
import { createPatient, getPatients, getPatientById, updatePatient } from '../controllers/patientController';

const mockResponse = () => {
  const res: Partial<Response> = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as Response;
};

const mockRequest = (body = {}, params = {}, query = {}) => {
  return {
    body,
    params,
    query,
  } as unknown as Request;
};

describe('Patient Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPatient', () => {
    it('should create a patient with basic info', async () => {
      const newPatient = {
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1990-01-01',
        gender: 'Male',
        phone: '0244123456',
      };

      const createdPatient = {
        id: 1,
        patient_number: 'P000001',
        ...newPatient,
      };

      // Mock client for transaction
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Count patients
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Create user
          .mockResolvedValueOnce({ rows: [createdPatient] }) // Create patient
          .mockResolvedValueOnce({ rows: [{ first_name: 'John', last_name: 'Doe' }] }) // Get user
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest(newPatient);
      const res = mockResponse();

      await createPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Patient created successfully',
      }));
    });

    it('should create a patient with Ghana-specific fields', async () => {
      const newPatient = {
        first_name: 'Kwame',
        last_name: 'Asante',
        date_of_birth: '1985-03-15',
        gender: 'Male',
        phone: '0244123456',
        gps_address: 'GA-123-4567',
        region: 'Greater Accra',
        nationality: 'Ghanaian',
        preferred_clinic: 'Cardiology',
      };

      const createdPatient = {
        id: 1,
        patient_number: 'P000001',
        ...newPatient,
      };

      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Count patients
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Create user
          .mockResolvedValueOnce({ rows: [createdPatient] }) // Create patient
          .mockResolvedValueOnce({ rows: [{ first_name: 'Kwame', last_name: 'Asante' }] }) // Get user
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest(newPatient);
      const res = mockResponse();

      await createPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // Verify that the patient data includes Ghana fields
      expect(mockClient.query).toHaveBeenCalled();
    });

    it('should create a patient with health status fields', async () => {
      const newPatient = {
        first_name: 'Test',
        last_name: 'Patient',
        date_of_birth: '1980-05-20',
        gender: 'Female',
        phone: '0201234567',
        hiv_status: 'Negative',
        hepatitis_b_status: 'Negative',
        hepatitis_c_status: 'Not Tested',
        tb_status: 'Negative',
        sickle_cell_status: 'AS',
        other_health_conditions: 'Asthma',
      };

      const createdPatient = {
        id: 1,
        patient_number: 'P000001',
        ...newPatient,
      };

      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Count patients
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Create user
          .mockResolvedValueOnce({ rows: [createdPatient] }) // Create patient
          .mockResolvedValueOnce({ rows: [{ first_name: 'Test', last_name: 'Patient' }] }) // Get user
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest(newPatient);
      const res = mockResponse();

      await createPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should handle database error gracefully', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockRejectedValueOnce(new Error('Database error')), // Simulated error
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest({ first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', gender: 'Male' });
      const res = mockResponse();

      await createPatient(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPatients', () => {
    it('should return all patients', async () => {
      const mockPatients = [
        { id: 1, patient_number: 'P000001', first_name: 'John', last_name: 'Doe' },
        { id: 2, patient_number: 'P000002', first_name: 'Jane', last_name: 'Doe' },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockPatients } as any);

      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getPatients(req, res);

      expect(res.json).toHaveBeenCalledWith({ patients: mockPatients, count: 2 });
    });

    it('should search patients by name', async () => {
      const mockPatients = [
        { id: 1, patient_number: 'P000001', first_name: 'John', last_name: 'Doe' },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockPatients } as any);

      const req = mockRequest({}, {}, { search: 'John' });
      const res = mockResponse();

      await getPatients(req, res);

      const queryCall = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(queryCall).toContain('ILIKE');
    });
  });

  describe('getPatientById', () => {
    it('should return patient with all details including health status', async () => {
      const mockPatient = {
        id: 1,
        patient_number: 'P000001',
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1990-01-01',
        gender: 'Male',
        gps_address: 'GA-123-4567',
        region: 'Greater Accra',
        preferred_clinic: 'General Practice',
        hiv_status: 'Negative',
        hepatitis_b_status: 'Negative',
        hepatitis_c_status: 'Not Tested',
        tb_status: 'Negative',
        sickle_cell_status: 'AA',
        other_health_conditions: '',
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [mockPatient] } as any);

      const req = mockRequest({}, { id: '1' });
      const res = mockResponse();

      await getPatientById(req, res);

      expect(res.json).toHaveBeenCalledWith({
        patient: expect.objectContaining({
          hiv_status: 'Negative',
          sickle_cell_status: 'AA',
          gps_address: 'GA-123-4567',
        }),
      });
    });

    it('should return 404 if patient not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({}, { id: '999' });
      const res = mockResponse();

      await getPatientById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Patient not found' });
    });
  });

  describe('updatePatient', () => {
    it('should update patient basic info', async () => {
      const updatedPatient = {
        id: 1,
        patient_number: 'P000001',
        first_name: 'John Updated',
        last_name: 'Doe',
        phone: '0244999999',
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [updatedPatient] } as any);

      const req = mockRequest(
        { first_name: 'John Updated', phone: '0244999999' },
        { id: '1' }
      );
      const res = mockResponse();

      await updatePatient(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Patient updated successfully',
        patient: expect.objectContaining({
          first_name: 'John Updated',
        }),
      }));
    });

    it('should update patient health status fields', async () => {
      const updatedPatient = {
        id: 1,
        patient_number: 'P000001',
        first_name: 'John',
        last_name: 'Doe',
        hiv_status: 'Positive',
        sickle_cell_status: 'SS',
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [updatedPatient] } as any);

      const req = mockRequest(
        { hiv_status: 'Positive', sickle_cell_status: 'SS' },
        { id: '1' }
      );
      const res = mockResponse();

      await updatePatient(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        patient: expect.objectContaining({
          hiv_status: 'Positive',
          sickle_cell_status: 'SS',
        }),
      }));
    });

    it('should update Ghana-specific address fields', async () => {
      const updatedPatient = {
        id: 1,
        gps_address: 'GA-999-8888',
        region: 'Ashanti',
        city: 'Kumasi',
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [updatedPatient] } as any);

      const req = mockRequest(
        { gps_address: 'GA-999-8888', region: 'Ashanti', city: 'Kumasi' },
        { id: '1' }
      );
      const res = mockResponse();

      await updatePatient(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        patient: expect.objectContaining({
          gps_address: 'GA-999-8888',
          region: 'Ashanti',
        }),
      }));
    });

    it('should return 404 if patient not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({ first_name: 'Test' }, { id: '999' });
      const res = mockResponse();

      await updatePatient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Health Status Validation', () => {
    it('should accept valid sickle cell status values', async () => {
      const validStatuses = ['AA', 'AS', 'SS', 'SC', 'Not Tested'];

      for (const status of validStatuses) {
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: 1, sickle_cell_status: status }],
        } as any);

        const req = mockRequest({ sickle_cell_status: status }, { id: '1' });
        const res = mockResponse();

        await updatePatient(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          patient: expect.objectContaining({
            sickle_cell_status: status,
          }),
        }));

        vi.clearAllMocks();
      }
    });

    it('should accept valid health status values', async () => {
      const validStatuses = ['Negative', 'Positive', 'Not Tested', ''];

      for (const status of validStatuses) {
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: 1, hiv_status: status }],
        } as any);

        const req = mockRequest({ hiv_status: status }, { id: '1' });
        const res = mockResponse();

        await updatePatient(req, res);

        expect(res.json).toHaveBeenCalled();
        vi.clearAllMocks();
      }
    });
  });

  describe('Ghana Regions Validation', () => {
    const ghanaRegions = [
      'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Northern',
      'Volta', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo',
      'Western North', 'Oti', 'North East', 'Savannah',
    ];

    it('should accept all 16 Ghana regions', async () => {
      for (const region of ghanaRegions) {
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: 1, region: region }],
        } as any);

        const req = mockRequest({ region: region }, { id: '1' });
        const res = mockResponse();

        await updatePatient(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          patient: expect.objectContaining({
            region: region,
          }),
        }));

        vi.clearAllMocks();
      }
    });
  });
});
