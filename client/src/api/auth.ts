import apiClient from './client';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  role: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

export const authAPI = {
  login: async (credentials: LoginCredentials) => {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data;
  },

  register: async (data: RegisterData) => {
    const response = await apiClient.post('/auth/register', data);
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  impersonate: async (userId: number) => {
    const response = await apiClient.post(`/auth/impersonate/${userId}`);
    return response.data;
  },
};
