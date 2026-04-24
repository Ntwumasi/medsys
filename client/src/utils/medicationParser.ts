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

// Maps common frequency abbreviations to doses per day
const FREQUENCY_MAP: Record<string, number> = {
  'daily': 1, 'once daily': 1, 'od': 1, 'qd': 1, 'once': 1,
  'bid': 2, 'b.i.d': 2, 'twice daily': 2, 'b.d.': 2, '2x daily': 2,
  'tid': 3, 't.i.d': 3, 'three times daily': 3, 't.d.s.': 3, '3x daily': 3,
  'qid': 4, 'q.i.d': 4, 'four times daily': 4, 'q.d.s.': 4, '4x daily': 4,
  'q4h': 6, 'every 4 hours': 6,
  'q6h': 4, 'every 6 hours': 4,
  'q8h': 3, 'every 8 hours': 3,
  'q12h': 2, 'every 12 hours': 2,
  'weekly': 0.143, // 1/7 per day
  'at bedtime': 1,
  'with meals': 3,
  'before meals': 3,
  'after meals': 3,
};

export function calculateQuantity(frequency: string, daysSupply: number): number | null {
  if (!frequency || daysSupply <= 0) return null;

  const key = frequency.toLowerCase().trim();
  const dosesPerDay = FREQUENCY_MAP[key];

  if (dosesPerDay === undefined) return null;

  return Math.ceil(dosesPerDay * daysSupply);
}
