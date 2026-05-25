// Parses medication names to extract dosage, route, and form
// e.g., "PARACETAMOL 120MG/5ML SYR 100ML" → { dosage: "120MG/5ML", route: "PO", form: "Syrup" }

interface ParsedMedication {
  dosage: string;
  route: string;
  form: string;
}

const FORM_ROUTE_MAP: Array<{ patterns: RegExp[]; form: string; route: string }> = [
  { patterns: [/\bEYE\s*DROPS?\b/, /\bOPHTH/], form: 'Eye Drop', route: 'Ophthalmic' },
  { patterns: [/\bEAR\s*DROPS?\b/, /\bOTIC/], form: 'Ear Drop', route: 'Otic' },
  { patterns: [/\bNASAL\b/], form: 'Nasal Spray', route: 'Nasal' },
  { patterns: [/\bINH(?:ALER)?\b/], form: 'Inhaler', route: 'Inhalation' },
  { patterns: [/\bSUPP(?:OSITORY|OS)?\b/], form: 'Suppository', route: 'Rectal' },
  { patterns: [/\bCREAM\b/, /\bOINT(?:MENT)?\b/, /\bGEL\b/], form: 'Topical', route: 'Topical' },
  { patterns: [/\bINJ(?:ECTION)?\b/, /\bAMP(?:OULE)?S?\b/, /\bVIAL\b/], form: 'Injection', route: 'IM' },
  { patterns: [/\bIV\b/], form: 'IV', route: 'IV' },
  { patterns: [/\bSYR(?:UP)?\b/, /\bSUSP(?:ENSION)?\b/, /\bSOL(?:UTION)?\b/, /\bELIXIR\b/], form: 'Syrup', route: 'PO' },
  { patterns: [/\bTAB(?:LET)?S?\b/], form: 'Tablet', route: 'PO' },
  { patterns: [/\bCAP(?:SULE)?S?\b/], form: 'Capsule', route: 'PO' },
  { patterns: [/\bDROPS?\b/], form: 'Drops', route: 'PO' },
  { patterns: [/\bPATCH\b/], form: 'Patch', route: 'Transdermal' },
];

// Regex to capture dosage with optional spaces between number and unit
// Matches: "500MG", "500 MG", "120MG/5ML", "120 MG/5 ML", "0.3%", "75MG/3ML", "10MG/ML", "500MG/250MG"
const DOSAGE_REGEX = /\b(\d+(?:\.\d+)?\s*(?:MG|MCG|G|ML|IU|%|MMOL)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:ML|MG|G))?)\b/i;

export function parseMedicationName(name: string): ParsedMedication {
  const upper = name.toUpperCase();
  const result: ParsedMedication = { dosage: '', route: '', form: '' };

  // Extract dosage
  const dosageMatch = upper.match(DOSAGE_REGEX);
  if (dosageMatch) {
    // Normalize: remove internal spaces for clean display (e.g., "120 MG/5 ML" → "120MG/5ML")
    result.dosage = dosageMatch[1].replace(/\s+/g, '');
  }

  // Determine form and route
  for (const entry of FORM_ROUTE_MAP) {
    if (entry.patterns.some(p => p.test(upper))) {
      result.form = entry.form;
      result.route = entry.route;
      break;
    }
  }

  return result;
}

// Canonical frequency option list — single source of truth for both the
// doctor's dropdown and the qty auto-calc. Each option has a stable `value`
// stored in the DB, a `label` shown in the dropdown, and `dosesPerDay`
// (null = can't auto-calc, e.g. PRN/STAT).
export interface FrequencyOption {
  value: string;
  label: string;
  dosesPerDay: number | null;
}

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  // Daily
  { value: 'OD',         label: 'OD — Once daily',                       dosesPerDay: 1 },
  { value: 'BID',        label: 'BID — Twice daily',                     dosesPerDay: 2 },
  { value: 'TID',        label: 'TID — Three times daily',               dosesPerDay: 3 },
  { value: 'QID',        label: 'QID — Four times daily',                dosesPerDay: 4 },
  // Time-of-day
  { value: 'qAM',        label: 'qAM — Every morning',                   dosesPerDay: 1 },
  { value: 'qPM',        label: 'qPM — Every evening',                   dosesPerDay: 1 },
  { value: 'qHS',        label: 'qHS — At bedtime',                      dosesPerDay: 1 },
  // Hourly
  { value: 'q2h',        label: 'q2h — Every 2 hours',                   dosesPerDay: 12 },
  { value: 'q3h',        label: 'q3h — Every 3 hours',                   dosesPerDay: 8 },
  { value: 'q4h',        label: 'q4h — Every 4 hours',                   dosesPerDay: 6 },
  { value: 'q6h',        label: 'q6h — Every 6 hours',                   dosesPerDay: 4 },
  { value: 'q8h',        label: 'q8h — Every 8 hours',                   dosesPerDay: 3 },
  { value: 'q12h',       label: 'q12h — Every 12 hours',                 dosesPerDay: 2 },
  // Multi-day / weekly / monthly
  { value: 'qOD',        label: 'qOD — Every other day',                 dosesPerDay: 0.5 },
  { value: 'q week',     label: 'Once a week',                           dosesPerDay: 1 / 7 },
  { value: 'q 2 weeks',  label: 'Every 2 weeks',                         dosesPerDay: 1 / 14 },
  { value: 'q 3 weeks',  label: 'Every 3 weeks',                         dosesPerDay: 1 / 21 },
  { value: 'q month',    label: 'Once a month',                          dosesPerDay: 1 / 30 },
  { value: 'q 3 months', label: 'Every 3 months',                        dosesPerDay: 1 / 90 },
  // Meal-related
  { value: 'AC',         label: 'AC — Before meals',                     dosesPerDay: 3 },
  { value: 'PC',         label: 'PC — After meals',                      dosesPerDay: 3 },
  { value: 'with meals', label: 'With meals',                            dosesPerDay: 3 },
  // No auto-calc
  { value: 'PRN',        label: 'PRN — As needed',                       dosesPerDay: null },
  { value: 'STAT',       label: 'STAT — Single dose now',                dosesPerDay: null },
  { value: 'one-time',   label: 'One-time dose',                         dosesPerDay: null },
];

// Lookup map for the qty calculator — keys are lowercased values + the
// legacy abbreviations we used to accept so old DB rows still resolve.
const FREQUENCY_MAP: Record<string, number | null> = Object.fromEntries(
  FREQUENCY_OPTIONS.map(o => [o.value.toLowerCase(), o.dosesPerDay])
);
// Legacy aliases — older orders typed these in by hand
Object.assign(FREQUENCY_MAP, {
  'daily': 1, 'once daily': 1, 'qd': 1, 'once': 1, 'od (once daily)': 1,
  'bd': 2, 'b.i.d': 2, 'twice daily': 2, 'b.d.': 2, '2x daily': 2, 'bd (twice daily)': 2,
  'tds': 3, 't.i.d': 3, 'three times daily': 3, 't.d.s.': 3, '3x daily': 3, 'tds (three times daily)': 3,
  'qds': 4, 'q.i.d': 4, 'four times daily': 4, 'q.d.s.': 4, '4x daily': 4, 'qds (four times daily)': 4,
  'every 2 hours': 12, 'every 3 hours': 8, 'every 4 hours': 6,
  'every 6 hours': 4, 'every 8 hours': 3, 'every 12 hours': 2,
  'every other day': 0.5, 'eod': 0.5,
  'weekly': 1 / 7, 'once a week': 1 / 7,
  'at bedtime': 1, 'before meals': 3, 'after meals': 3,
});

export function calculateQuantity(frequency: string, daysSupply: number): number | null {
  if (!frequency || daysSupply <= 0) return null;

  const key = frequency.toLowerCase().trim();
  const dosesPerDay = FREQUENCY_MAP[key];

  if (dosesPerDay === undefined || dosesPerDay === null) return null;

  return Math.ceil(dosesPerDay * daysSupply);
}
