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
