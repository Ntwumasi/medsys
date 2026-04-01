import apiClient from './client';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  role: string;
  first_name: string;
  last_name: string;
  phone?: string;
  employee_id?: string;
}

export interface LoginResponse {
  message: string;
  user: {
    id: number;
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    is_breakglass?: boolean;
    is_super_admin?: boolean;
  };
  token: string;
  must_change_password?: boolean;
  password_expired?: boolean;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export const authAPI = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
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

  changePassword: async (data: ChangePasswordData) => {
    const response = await apiClient.post('/auth/change-password', data);
    return response.data;
  },

  requestPasswordReset: async (email: string) => {
    const response = await apiClient.post('/auth/request-reset', { email });
    return response.data;
  },

  resetPassword: async (token: string, new_password: string) => {
    const response = await apiClient.post('/auth/reset-password', { token, new_password });
    return response.data;
  },

  getLoginHistory: async () => {
    const response = await apiClient.get('/auth/login-history');
    return response.data;
  },
};
