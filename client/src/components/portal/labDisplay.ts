import type { PortalLabParameter } from '../../api/patientPortal';

// Patient-facing lab result helpers. Results are stored either as JSON
// {parameter_code: value} (structured templates) or as plain text.

export type ParsedLab =
  | { kind: 'structured'; values: { code: string; label: string; value: string }[]; notes: string | null }
  | { kind: 'text'; text: string };

const humanize = (code: string): string =>
  code
    .split('_')
    .map((p) => (p.length <= 3 ? p : p.charAt(0) + p.slice(1).toLowerCase()))
    .join(' ');

export const parseLabResult = (raw: string | null | undefined): ParsedLab => {
  const trimmed = (raw || '').trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const notes = typeof obj.__notes === 'string' && obj.__notes.trim() ? obj.__notes : null;
        const values = Object.entries(obj)
          .filter(([k, v]) => k !== '__notes' && v != null && String(v).trim() !== '')
          .map(([code, v]) => ({ code, label: humanize(code), value: String(v) }));
        return { kind: 'structured', values, notes };
      }
    } catch {
      /* fall through to plain text */
    }
  }
  return { kind: 'text', text: trimmed };
};

export type LabFlag = 'none' | 'normal' | 'low' | 'high' | 'critical';

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Same thresholds as the staff view (LabResultsInline). 'none' = no numeric
 * range to compare against (qualitative tests, or no template).
 */
export const labFlag = (value: string, def: PortalLabParameter | undefined): LabFlag => {
  if (!def || def.value_type !== 'numeric') return 'none';
  // Accept "5.4", "5.4 mmol/L", "<0.5" → compare the number.
  const v = parseFloat(String(value).replace(/^[<>≤≥]=?\s*/, ''));
  if (Number.isNaN(v)) return 'none';
  const cl = num(def.critical_low), ch = num(def.critical_high);
  const nl = num(def.normal_low), nh = num(def.normal_high);
  if (cl !== null && v <= cl) return 'critical';
  if (ch !== null && v >= ch) return 'critical';
  if (nl !== null && v < nl) return 'low';
  if (nh !== null && v > nh) return 'high';
  return nl !== null || nh !== null ? 'normal' : 'none';
};

export const rangeText = (def: PortalLabParameter | undefined): string => {
  if (!def) return '';
  if (def.reference_range_text) return def.reference_range_text;
  const nl = num(def.normal_low), nh = num(def.normal_high);
  if (nl !== null && nh !== null) return `${nl} – ${nh}${def.unit ? ` ${def.unit}` : ''}`;
  if (nh !== null) return `below ${nh}${def.unit ? ` ${def.unit}` : ''}`;
  if (nl !== null) return `above ${nl}${def.unit ? ` ${def.unit}` : ''}`;
  return '';
};

export const FLAG_TEXT: Record<LabFlag, string> = {
  none: '',
  normal: 'Normal',
  low: 'Lower than normal',
  high: 'Higher than normal',
  critical: 'Well outside normal',
};
