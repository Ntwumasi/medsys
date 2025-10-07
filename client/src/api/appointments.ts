import apiClient from './client';
import { Appointment } from '../types';

export const appointmentsAPI = {
  getAppointments: async (params?: {
    patient_id?: number;
    provider_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
  }) => {
    const response = await apiClient.get('/appointments', { params });
    return response.data;
  },

  getTodayAppointments: async (provider_id?: number) => {
    const response = await apiClient.get('/appointments/today', {
      params: provider_id ? { provider_id } : {},
    });
    return response.data;
  },

  createAppointment: async (data: Partial<Appointment>) => {
    const response = await apiClient.post('/appointments', data);
    return response.data;
  },

  updateAppointment: async (id: number, data: Partial<Appointment>) => {
    const response = await apiClient.put(`/appointments/${id}`, data);
    return response.data;
  },

  cancelAppointment: async (id: number, reason?: string) => {
    const response = await apiClient.post(`/appointments/${id}/cancel`, { reason });
    return response.data;
  },
};
