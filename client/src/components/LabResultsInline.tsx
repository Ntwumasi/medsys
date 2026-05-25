import React from 'react';

// Parses a lab order's `result` string. Structured results are stored as
// JSON of {parameter_code: value} (e.g. {"WBC":"5.42","NEU_ABS":"2.36"}).
// Anything that doesn't parse as a flat JSON object is treated as plain
// text (legacy / single-value tests).
const parseStructured = (raw: string | null | undefined): Record<string, string> | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, v == null ? '' : String(v)])
      );
    }
  } catch {
    /* not JSON */
  }
  return null;
};

// Humanises parameter codes: 'WBC' -> 'WBC', 'NEU_ABS' -> 'Neu Abs',
// 'LYMP_PCT' -> 'Lymp %', 'TOTAL_PROTEIN' -> 'Total Protein'.
const PARAM_LABEL_OVERRIDES: Record<string, string> = {
  WBC: 'WBC',
  RBC: 'RBC',
  HGB: 'Hemoglobin',
  HCT: 'Hematocrit',
  MCV: 'MCV',
  MCH: 'MCH',
  MCHC: 'MCHC',
  RDW: 'RDW',
  PLT: 'Platelets',
  MPV: 'MPV',
  NEU_ABS: 'Neutrophils (abs)',
  NEU_PCT: 'Neutrophils %',
  LYMP_ABS: 'Lymphocytes (abs)',
  LYMP_PCT: 'Lymphocytes %',
  MON_ABS: 'Monocytes (abs)',
  MON_PCT: 'Monocytes %',
  EOS_ABS: 'Eosinophils (abs)',
  EOS_PCT: 'Eosinophils %',
  BASO_ABS: 'Basophils (abs)',
  BASO_PCT: 'Basophils %',
  CRP: 'CRP',
  ESR: 'ESR',
  GLU: 'Glucose',
  BUN: 'BUN',
  CRE: 'Creatinine',
  NA: 'Sodium',
  K: 'Potassium',
  CL: 'Chloride',
  HCO3: 'Bicarbonate',
  ALT: 'ALT',
  AST: 'AST',
  ALP: 'Alk Phos',
  GGT: 'GGT',
  TBIL: 'Total Bilirubin',
  DBIL: 'Direct Bilirubin',
  IBIL: 'Indirect Bilirubin',
  ALB: 'Albumin',
  TP: 'Total Protein',
  CHOL: 'Cholesterol',
  HDL: 'HDL',
  LDL: 'LDL',
  TG: 'Triglycerides',
};

const humanizeCode = (code: string): string => {
  if (PARAM_LABEL_OVERRIDES[code]) return PARAM_LABEL_OVERRIDES[code];
  return code
    .split('_')
    .map((p) => (p.length <= 3 ? p : p.charAt(0) + p.slice(1).toLowerCase()))
    .join(' ');
};

interface LabResultsInlineProps {
  /** The raw `result` string off the lab order. JSON or plain text. */
  result: string | null | undefined;
  /** Compact mode for the small "Results for this visit" cards. */
  compact?: boolean;
}

/**
 * Inline-readable lab result rendering. Replaces raw `<pre>{json}</pre>`
 * dumps in both the SOAP Lab Results section and the "Results for this
 * visit" mini-panel. Critical/abnormal flagging is intentionally NOT done
 * here — that needs an async parameter-definition lookup; if needed,
 * doctors can click into the lab order for the full modal with flags.
 */
const LabResultsInline: React.FC<LabResultsInlineProps> = ({ result, compact = false }) => {
  const structured = parseStructured(result);

  if (structured) {
    const entries = Object.entries(structured).filter(([, v]) => v !== '');
    if (entries.length === 0) {
      return <span className="text-xs text-gray-400 italic">No values</span>;
    }
    return (
      <div className={`grid grid-cols-2 gap-x-4 ${compact ? 'gap-y-0.5 text-xs' : 'gap-y-1 text-sm'}`}>
        {entries.map(([code, val]) => (
          <div key={code} className="contents">
            <div className="text-gray-600 truncate">{humanizeCode(code)}</div>
            <div className="text-gray-900 font-mono text-right tabular-nums">{val}</div>
          </div>
        ))}
      </div>
    );
  }

  // Plain-text / legacy fallback
  return (
    <div className={`text-gray-900 whitespace-pre-wrap ${compact ? 'text-xs' : 'text-sm'}`}>
      {result || <span className="text-gray-400 italic">No result</span>}
    </div>
  );
};

export default LabResultsInline;
