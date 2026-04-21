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

// Track the token that was used for each request so stale responses don't
// nuke a freshly-acquired session.
let activeToken: string | null = null;

// Call this on login to snapshot the current token
export const setActiveToken = (token: string) => {
  activeToken = token;
};

// Call this on logout to prevent stale 401s from interfering with the next login
export const resetApiClientState = () => {
  consecutive401s = 0;
  activeToken = null;
};

apiClient.interceptors.response.use(
  (response) => {
    // Any success resets the counter
    consecutive401s = 0;
    return response;
  },
  (error) => {
    const status = error.response?.status;

    // Treat both 401 (missing/revoked token) and 403 (expired/invalid token)
    // as auth failures that may require redirect
    if (status === 401 || status === 403) {
      const url = error.config?.url || '';

      // Don't redirect on login or password-related failures —
      // let those pages handle their own errors
      const isLoginEndpoint = url.includes('/auth/login');
      const isPasswordEndpoint = url.includes('/auth/change-password') || url.includes('/auth/reset-password');
      if (isLoginEndpoint || isPasswordEndpoint) {
        return Promise.reject(error);
      }

      // Don't redirect on authorization failures (role-based access denied)
      // — only redirect when the TOKEN itself is bad
      const errorMsg = error.response?.data?.error || '';
      if (errorMsg === 'Insufficient permissions') {
        return Promise.reject(error);
      }

      // Guard against stale responses: if the token that made this request
      // is different from the current active token, this is a leftover from
      // a previous session — ignore it completely.
      const requestToken = error.config?.headers?.Authorization?.replace('Bearer ', '');
      if (activeToken && requestToken && requestToken !== activeToken) {
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
