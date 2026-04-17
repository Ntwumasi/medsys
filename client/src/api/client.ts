import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors.
// A single 401 from a polling request during a Neon cold-start should NOT
// nuke the session — only redirect to login if we see repeated 401s or the
// request was explicitly an auth call (login/me).
let consecutive401s = 0;
const AUTH_REDIRECT_THRESHOLD = 3; // need 3 in a row before we give up

// Call this on logout to prevent stale 401s from interfering with the next login
export const resetApiClientState = () => {
  consecutive401s = 0;
};

apiClient.interceptors.response.use(
  (response) => {
    // Any success resets the counter
    consecutive401s = 0;
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Don't redirect on login failures — let the login page handle its own errors
      const isLoginEndpoint = url.includes('/auth/login');
      if (isLoginEndpoint) {
        return Promise.reject(error);
      }

      const isAuthEndpoint = url.includes('/auth/me');
      consecutive401s++;

      // Immediately redirect for /auth/me (token is definitely bad)
      // or after several consecutive 401s from data endpoints (not a transient blip)
      if (isAuthEndpoint || consecutive401s >= AUTH_REDIRECT_THRESHOLD) {
        consecutive401s = 0;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Only redirect if not already on the login page (prevents reload loop)
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
