import type { AxiosError } from 'axios';

/**
 * Extract a user-friendly error message from an Axios error or unknown thrown value.
 * Replaces the `catch (err: any) { err?.response?.data?.error }` pattern.
 */
export function getApiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;
    return axiosErr.response?.data?.error || axiosErr.response?.data?.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
