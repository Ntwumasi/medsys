import axios from 'axios';

// In production/preview: use relative /api (same domain).
// In local dev: VITE_API_URL points to localhost:5000.
const API_BASE_URL = import.meta.env.VITE_API_URL || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? '/api'
    : 'http://localhost:5000/api'
);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15s timeout — prevents indefinite hangs on slow networks
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

// Timestamp of the most recent successful login. For a short grace period
// afterwards we suppress the auth-failure redirect: the dashboard fires a burst
// of requests immediately after login, and on this clinic's slow/cold-start
// Neon connection a transient 401 in that burst must NOT hard-reload the user
// back to a blank login page (the "had to log in twice" glitch).
let lastLoginAt = 0;
const POST_LOGIN_GRACE_MS = 10000;

// Call this on login to snapshot the current token
export const setActiveToken = (token: string) => {
  activeToken = token;
  lastLoginAt = Date.now();
  consecutive401s = 0;
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

      // Grace period right after login: never bounce a freshly-created session
      // on a transient 401 from the post-login request burst.
      if (Date.now() - lastLoginAt < POST_LOGIN_GRACE_MS) {
        return Promise.reject(error);
      }

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

// Retry interceptor — automatically retries failed requests (network errors, timeouts, 5xx)
// with exponential backoff. Skips retries for 4xx errors (client errors).
apiClient.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config) return Promise.reject(error);

  // Don't retry POST/PUT/DELETE (not idempotent) or already-retried requests.
  // EXCEPTION: the login POST is retried on transient errors. On this clinic's
  // serverless Neon + Vercel setup the very first request after idle hits a cold
  // start, so the login often failed once and only worked on the second try (the
  // "always have to log in twice" glitch). Retrying is safe here — we only retry
  // network/timeout/5xx below, never a 401 (bad credentials still fail fast).
  const url = config.url || '';
  const isLoginEndpoint = url.includes('/auth/login');
  const isIdempotent = !config.method || config.method === 'get';
  config.__retryCount = config.__retryCount || 0;
  const maxRetries = (isIdempotent || isLoginEndpoint) ? 2 : 0;

  const isNetworkError = !error.response; // timeout, DNS failure, network offline
  const isServerError = error.response?.status >= 500;
  const shouldRetry = (isNetworkError || isServerError) && config.__retryCount < maxRetries;

  if (shouldRetry) {
    config.__retryCount += 1;
    const delay = Math.min(1000 * Math.pow(2, config.__retryCount - 1), 5000); // 1s, 2s, max 5s
    await new Promise(resolve => setTimeout(resolve, delay));
    return apiClient(config);
  }

  return Promise.reject(error);
});

export default apiClient;
