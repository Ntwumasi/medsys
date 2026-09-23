import type { AxiosError } from 'axios';

/** One field-level failure from the server's Zod validation middleware. */
interface ValidationDetail {
  field?: string;
  message?: string;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  details?: Array<ValidationDetail | string> | string[];
}

// 'first_name' -> 'First name', 'payer_sources.0.payer_type' -> 'Payer source 1 payer type'
const humanizeFieldPath = (path: string): string => {
  if (!path) return 'Form';
  const joined = path
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? `${parseInt(seg, 10) + 1}` : seg.replace(/_/g, ' ')))
    .join(' ')
    .replace(/\bsources (\d+)\b/, 'source $1');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
};

/**
 * Builds a readable sentence from a validation 400's `details` array.
 *
 * The server has always sent `details` naming each offending field, but callers
 * that rendered only `error` showed a bare "Validation failed" — no indication
 * of WHICH field was wrong. Returns null when the body carries no usable
 * field-level detail.
 */
export function formatApiValidationError(body: unknown): string | null {
  const details = (body as ApiErrorBody | undefined)?.details;
  if (!Array.isArray(details) || details.length === 0) return null;

  const parts = details
    .map((d) => {
      // Auth endpoints send details as a plain string[]; Zod sends objects.
      if (typeof d === 'string') return d;
      if (!d?.message) return null;
      return d.field ? `${humanizeFieldPath(d.field)} — ${d.message}` : d.message;
    })
    .filter((p): p is string => !!p);

  if (parts.length === 0) return null;
  return `Please check: ${parts.join('; ')}`;
}

/**
 * Extract a user-friendly error message from an Axios error or unknown thrown value.
 * Replaces the `catch (err: any) { err?.response?.data?.error }` pattern.
 *
 * Field-level validation detail wins when present — otherwise a validation 400
 * degrades to the useless top-level "Validation failed".
 */
export function getApiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as AxiosError<ApiErrorBody>;
    const data = axiosErr.response?.data;
    return (
      formatApiValidationError(data) ||
      data?.error ||
      data?.message ||
      fallback
    );
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
