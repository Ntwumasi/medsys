/**
 * One patient-search rule for every lookup box: a single term can be a name
 * (any order, partial), a patient number, a phone number (any format —
 * 024 123 4567, +233 24 123 4567) or a date of birth (23/03/1984, 1984-03-23,
 * 23 Mar 1984) or an email. Expects `patients p LEFT JOIN users u ON p.user_id = u.id`.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n: number) => String(n).padStart(2, '0');

const validDate = (y: number, m: number, d: number): string | null => {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

const fullYear = (y: number) => (y >= 100 ? y : y + (y > new Date().getFullYear() % 100 ? 1900 : 2000));

/**
 * Dates a term could mean, as YYYY-MM-DD. "05/03/1984" is ambiguous (Ghana
 * writes day first, some screens show month first), so both readings are
 * returned and either matches.
 */
export function parseDobTerm(term: string): string[] {
  const t = term.trim().toLowerCase();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const iso = validDate(+m[1], +m[2], +m[3]);
    return iso ? [iso] : [];
  }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    const out = new Set<string>();
    const dayFirst = validDate(y, b, a);
    const monthFirst = validDate(y, a, b);
    if (dayFirst) out.add(dayFirst);
    if (monthFirst) out.add(monthFirst);
    return [...out];
  }
  m = t.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?,?[\s-]+(\d{2}|\d{4})$/);
  if (m && MONTHS.includes(m[2])) {
    const iso = validDate(fullYear(+m[3]), MONTHS.indexOf(m[2]) + 1, +m[1]);
    return iso ? [iso] : [];
  }
  m = t.match(/^([a-z]{3})[a-z]*\.?[\s-]+(\d{1,2}),?[\s-]+(\d{2}|\d{4})$/);
  if (m && MONTHS.includes(m[1])) {
    const iso = validDate(fullYear(+m[3]), MONTHS.indexOf(m[1]) + 1, +m[2]);
    return iso ? [iso] : [];
  }
  return [];
}

/** Digits of a phone-like term with the country/trunk prefix dropped, or null. */
export function phoneDigits(term: string): string | null {
  if (!/^[\d\s()+-]+$/.test(term.trim())) return null;
  let digits = term.replace(/\D/g, '');
  if (digits.startsWith('233')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 4 ? digits : null;
}

/**
 * SQL condition (wrapped in parentheses) plus its params, numbered from
 * `startIndex`. Returns null for a blank term.
 */
export function buildPatientSearch(
  rawTerm: string,
  startIndex = 1
): { clause: string; params: string[] } | null {
  const term = rawTerm.trim().replace(/\s+/g, ' ');
  if (!term) return null;

  const params: string[] = [];
  const add = (v: string) => {
    params.push(v);
    return `$${startIndex + params.length - 1}`;
  };
  const ors: string[] = [];

  // Patient number, whole term (P001336, CC-MGC-00587-25, 1336).
  ors.push(`p.patient_number ILIKE ${add(`%${term}%`)}`);

  // Date of birth.
  const dates = parseDobTerm(term);
  if (dates.length) {
    ors.push(`p.date_of_birth::date = ANY(${add(`{${dates.join(',')}}`)}::date[])`);
  }

  // Phone.
  const digits = phoneDigits(term);
  if (digits) {
    ors.push(`regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') LIKE ${add(`%${digits}%`)}`);
  }

  // Email.
  if (term.includes('@')) {
    ors.push(`u.email ILIKE ${add(`%${term}%`)}`);
  }

  // Name: every word must appear in the first or last name, any order.
  if (!dates.length && !digits && !term.includes('@')) {
    const words = term.split(' ').slice(0, 5);
    const each = words.map((w) => {
      const p = add(`%${w}%`);
      return `(u.first_name ILIKE ${p} OR u.last_name ILIKE ${p})`;
    });
    ors.push(`(${each.join(' AND ')})`);
  }

  return { clause: `(${ors.join(' OR ')})`, params };
}
