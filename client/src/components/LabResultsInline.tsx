import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';

// Parses a lab order's `result` string. Structured results are stored as
// JSON of {parameter_code: value} (e.g. {"WBC":"5.42","NEU_ABS":"2.36"}).
// Anything that doesn't parse as a flat JSON object is treated as plain
// text (legacy / single-value tests).
const parseStructured = (raw: string | null | undefined): { values: Record<string, string>; notes: string | null } | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const notes = typeof parsed.__notes === 'string' ? parsed.__notes : null;
    const { __notes, ...rest } = parsed;
    void __notes;
    const values = Object.fromEntries(
      Object.entries(rest).map(([k, v]) => [k, v == null ? '' : String(v)]),
    );
    return { values, notes };
  } catch {
    return null;
  }
};

// Humanises parameter codes when the API doesn't supply a name:
// 'WBC' -> 'WBC', 'NEU_ABS' -> 'Neu Abs', 'LYMP_PCT' -> 'Lymp %'.
const PARAM_LABEL_OVERRIDES: Record<string, string> = {
  WBC: 'WBC', RBC: 'RBC', HGB: 'Hemoglobin', HCT: 'Hematocrit',
  MCV: 'MCV', MCH: 'MCH', MCHC: 'MCHC', RDW: 'RDW',
  PLT: 'Platelets', MPV: 'MPV',
  NEU_ABS: 'Neutrophils (abs)', NEU_PCT: 'Neutrophils %',
  LYMP_ABS: 'Lymphocytes (abs)', LYMP_PCT: 'Lymphocytes %',
  MON_ABS: 'Monocytes (abs)', MON_PCT: 'Monocytes %',
  EOS_ABS: 'Eosinophils (abs)', EOS_PCT: 'Eosinophils %',
  BASO_ABS: 'Basophils (abs)', BASO_PCT: 'Basophils %',
  CRP: 'CRP', ESR: 'ESR',
  GLU: 'Glucose', BUN: 'BUN', CRE: 'Creatinine',
  NA: 'Sodium', K: 'Potassium', CL: 'Chloride', HCO3: 'Bicarbonate',
  ALT: 'ALT', AST: 'AST', ALP: 'Alk Phos', GGT: 'GGT',
  TBIL: 'Total Bilirubin', DBIL: 'Direct Bilirubin', IBIL: 'Indirect Bilirubin',
  ALB: 'Albumin', TP: 'Total Protein',
  CHOL: 'Cholesterol', HDL: 'HDL', LDL: 'LDL', TG: 'Triglycerides',
};

const humanizeCode = (code: string): string => {
  if (PARAM_LABEL_OVERRIDES[code]) return PARAM_LABEL_OVERRIDES[code];
  return code
    .split('_')
    .map((p) => (p.length <= 3 ? p : p.charAt(0) + p.slice(1).toLowerCase()))
    .join(' ');
};

interface ParameterDef {
  parameter_code: string;
  parameter_name: string;
  unit: string | null;
  normal_low: number | null;
  normal_high: number | null;
  critical_low: number | null;
  critical_high: number | null;
  reference_range_text: string | null;
  value_type: 'numeric' | 'qualitative';
}

// Same logic as LabResultModal — keep the two in sync if either changes.
const flagFor = (
  raw: string,
  def: ParameterDef | undefined,
): { label: string; tone: 'normal' | 'low' | 'high' | 'critical' } => {
  if (!def || def.value_type !== 'numeric') return { label: '', tone: 'normal' };
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return { label: '', tone: 'normal' };
  if (def.critical_low !== null && num <= def.critical_low) return { label: 'CRIT LOW', tone: 'critical' };
  if (def.critical_high !== null && num >= def.critical_high) return { label: 'CRIT HIGH', tone: 'critical' };
  if (def.normal_low !== null && num < def.normal_low) return { label: 'LOW', tone: 'low' };
  if (def.normal_high !== null && num > def.normal_high) return { label: 'HIGH', tone: 'high' };
  return { label: '', tone: 'normal' };
};

interface LabResultsInlineProps {
  /** The raw `result` string off the lab order. JSON or plain text. */
  result: string | null | undefined;
  /** When supplied, fetches the test's parameter definitions so we can
   *  render names, units, reference ranges, and LOW/HIGH/CRITICAL flags. */
  orderId?: number;
  /** Compact mode for narrow contexts (e.g. the "Results for this visit" card). */
  compact?: boolean;
}

/**
 * Inline-readable lab result rendering. Replaces raw `<pre>{json}</pre>`
 * dumps wherever a structured lab result is shown. When `orderId` is
 * provided, ranges + abnormal flags appear right next to each value so
 * doctors don't need to drill into the modal for routine review.
 */
const LabResultsInline: React.FC<LabResultsInlineProps> = ({ result, orderId, compact = false }) => {
  const structured = useMemo(() => parseStructured(result), [result]);
  const [paramDefs, setParamDefs] = useState<ParameterDef[]>([]);

  // Fetch parameter metadata for this order so we can show ranges + flags.
  // Per-order rather than per-test_id because parameters are scoped to a
  // specific order's selected variant (age/sex). Silently no-ops if no
  // orderId is supplied (legacy callers still work, just without ranges).
  useEffect(() => {
    if (!orderId || !structured) return;
    let cancelled = false;
    apiClient
      .get(`/lab/orders/${orderId}/parameters`)
      .then((res) => {
        if (!cancelled && res.data?.parameters) setParamDefs(res.data.parameters);
      })
      .catch(() => { /* fall back to humanized codes, no ranges */ });
    return () => { cancelled = true; };
  }, [orderId, !!structured]);

  const defByCode = useMemo(() => {
    const m = new Map<string, ParameterDef>();
    for (const p of paramDefs) m.set(p.parameter_code, p);
    return m;
  }, [paramDefs]);

  if (structured) {
    const entries = Object.entries(structured.values).filter(([, v]) => v !== '');
    if (entries.length === 0) {
      return <span className="text-xs text-gray-400 italic">No values</span>;
    }

    const textSize = compact ? 'text-xs' : 'text-sm';
    const padY = compact ? 'py-0.5' : 'py-1';

    return (
      <div className="w-full overflow-x-auto">
        <table className={`w-full ${textSize} table-auto`}>
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className={`text-left font-semibold ${padY} pr-2`}>Parameter</th>
              <th className={`text-right font-semibold ${padY} px-2`}>Value</th>
              <th className={`text-left font-semibold ${padY} px-2 hidden sm:table-cell`}>Unit</th>
              <th className={`text-left font-semibold ${padY} px-2`}>Reference</th>
              <th className={`text-left font-semibold ${padY} pl-2`}>Flag</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([code, val]) => {
              const def = defByCode.get(code);
              const name = def?.parameter_name || humanizeCode(code);
              const unit = def?.unit || '';
              const ref =
                def?.reference_range_text ||
                (def != null && def.normal_low != null && def.normal_high != null
                  ? `${def.normal_low} – ${def.normal_high}${unit ? ' ' + unit : ''}`
                  : '');
              const { label: flagLabel, tone } = flagFor(val, def);
              const flagCls =
                tone === 'critical'
                  ? 'bg-danger-100 text-danger-700'
                  : tone === 'high'
                    ? 'bg-warning-100 text-warning-700'
                    : tone === 'low'
                      ? 'bg-primary-100 text-primary-700'
                      : '';
              const valueCls =
                tone === 'critical'
                  ? 'text-danger-700 font-bold'
                  : tone === 'high' || tone === 'low'
                    ? 'text-warning-700 font-semibold'
                    : 'text-gray-900';
              return (
                <tr key={code} className="border-b border-gray-100 last:border-b-0">
                  <td className={`${padY} pr-2 text-gray-700 align-top`}>{name}</td>
                  <td className={`${padY} px-2 text-right font-mono tabular-nums whitespace-nowrap align-top ${valueCls}`}>{val}</td>
                  <td className={`${padY} px-2 text-gray-500 text-[11px] whitespace-nowrap align-top hidden sm:table-cell`}>{unit || '—'}</td>
                  <td className={`${padY} px-2 text-gray-500 text-[11px] whitespace-nowrap align-top`}>{ref || '—'}</td>
                  <td className={`${padY} pl-2 align-top`}>
                    {flagLabel && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${flagCls}`}>{flagLabel}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {structured.notes && (
          <div className={`mt-2 pt-2 border-t border-gray-100 ${textSize}`}>
            <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-0.5">Notes</div>
            <p className="text-gray-700 whitespace-pre-wrap">{structured.notes}</p>
          </div>
        )}
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
