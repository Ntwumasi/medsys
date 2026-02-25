import apiClient from './client';
import type { Patient, PatientSummary } from '../types';

export const patientsAPI = {
  getPatients: async (params?: { search?: string; limit?: number; offset?: number }) => {
    const response = await apiClient.get('/patients', { params });
    return response.data;
  },

  getPatientById: async (id: number) => {
    const response = await apiClient.get(`/patients/${id}`);
    return response.data;
  },

  getPatientSummary: async (id: number): Promise<PatientSummary> => {
    const response = await apiClient.get(`/patients/${id}/summary`);
    return response.data;
  },

  createPatient: async (data: Partial<Patient> | Record<string, unknown>) => {
    const response = await apiClient.post('/patients', data);
    return response.data;
  },

  updatePatient: async (id: number, data: Partial<Patient>) => {
    const response = await apiClient.put(`/patients/${id}`, data);
    return response.data;
  },
};
