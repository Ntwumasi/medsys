import { format } from 'date-fns';

/**
 * Safely format a date. Returns `fallback` instead of throwing
 * "Invalid time value" — which white-screens the whole page — when the value is
 * missing or invalid (common for CareCode imports with sentinel/blank dates).
 */
export function safeFormatDate(
  value: string | Date | null | undefined,
  fmt: string,
  fallback = '—'
): string {
  if (!value) return fallback;
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

/**
 * Calculate age from date of birth string.
 * Returns age in years, or "N/A" if DOB is invalid.
 */
export function calculateAge(dob: string | Date | null | undefined): string {
  if (!dob) return 'N/A';
  try {
    const birthDate = typeof dob === 'string' ? new Date(dob) : dob;
    if (isNaN(birthDate.getTime())) return 'N/A';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 0) return 'N/A';
    if (age === 0) {
      // For infants, show months
      const months = (today.getFullYear() - birthDate.getFullYear()) * 12 + today.getMonth() - birthDate.getMonth();
      return months <= 0 ? 'Newborn' : `${months}mo`;
    }
    return `${age}y`;
  } catch {
    return 'N/A';
  }
}

/**
 * Format DOB with age: "03/23/1984 (42y)"
 */
export function formatDobWithAge(dob: string | Date | null | undefined, formatFn?: (d: string, f: string) => string): string {
  if (!dob) return 'N/A';
  const age = calculateAge(dob);
  const formatted = formatFn ? formatFn(String(dob), 'MM/dd/yyyy') : String(dob).slice(0, 10);
  return `${formatted} (${age})`;
}

/**
 * Patient-lookup label: "DOB 23 Mar 1984 · 42y". Month is spelled out so it
 * can't be misread as US vs Ghana day/month order. Used in every patient
 * search list so two people with the same name can be told apart.
 */
export function dobAndAge(dob: string | Date | null | undefined): string {
  // CareCode imports without a real DOB carry a 1900-01-01 placeholder (which
  // shows as 31 Dec 1899 west of GMT) — that's "not recorded", not 126 years.
  const parsed = dob ? (typeof dob === 'string' ? new Date(dob) : dob) : null;
  if (parsed && parsed.getTime() < Date.UTC(1900, 0, 2)) return 'DOB not recorded';
  const formatted = safeFormatDate(dob, 'd MMM yyyy', '');
  if (!formatted) return 'DOB not recorded';
  const age = calculateAge(dob);
  return age === 'N/A' ? `DOB ${formatted}` : `DOB ${formatted} · ${age}`;
}

/**
 * Is this date of birth usable? Placeholder or impossible dates (CareCode
 * imports: before 1910, or in the future) can't be confirmed by the patient,
 * so they block patient-portal sign-in. Matches the server's portal-invite rule.
 */
export function isUsableDob(dob: string | Date | null | undefined): boolean {
  if (!dob) return false;
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() >= 1910 && d.getTime() <= Date.now();
}
