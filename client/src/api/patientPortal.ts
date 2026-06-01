import apiClient from './client';

export interface PortalVerifyResponse {
  message: string;
  user: {
    id: number;
    username: string;
    role: string;
    first_name: string;
    last_name: string;
    is_super_admin?: boolean;
  };
  token: string;
}

export interface PortalMe {
  patient_id: number;
  patient_number: string;
  date_of_birth: string;
  first_name: string;
  last_name: string;
  username: string;
  renewed_token?: string;
}

export const patientPortalAPI = {
  // Self-service: request an SMS access link by phone number.
  requestLink: async (phone: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/patient-portal/request-link', { phone });
    return response.data;
  },

  // Verify the link token + date of birth, establishing a session.
  verify: async (token: string, date_of_birth: string): Promise<PortalVerifyResponse> => {
    const response = await apiClient.post('/patient-portal/verify', { token, date_of_birth });
    return response.data;
  },

  // Front desk: send the access link from a patient's record.
  staffSend: async (patientId: number): Promise<{ message: string }> => {
    const response = await apiClient.post('/patient-portal/staff-send', { patient_id: patientId });
    return response.data;
  },

  // Authenticated patient: own profile (and resolves their patient_id).
  me: async (): Promise<PortalMe> => {
    const response = await apiClient.get('/patient-portal/me');
    return response.data;
  },
};
