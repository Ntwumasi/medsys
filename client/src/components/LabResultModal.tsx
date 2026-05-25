import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import apiClient from '../api/client';

// Modal shown when a doctor clicks a completed lab from the Results Alerts
// widget. Renders the test result inline (text or structured table) plus
// any attached PDF — saves the doctor from navigating away to the patient
// chart for routine result checks.

export interface LabResultAlert {
  id: number;
  test_name?: string;
  test_code?: string;
  path_no?: string;
  patient_name: string;
  patient_number?: string;
  priority: string;
  status: string;
  ordered_date?: string;
  result_date?: string;
  result?: string;
  result_document_id?: number | null;
  result_document_name?: string | null;
  room_number?: string;
}

interface LabResultModalProps {
  order: LabResultAlert;
  onClose: () => void;
  // Optional override for the footer row. When provided, the default
  // "Close" button is replaced. Used by the lab verification flow to
  // surface Approve / Reject actions inside the rich result view.
  footer?: React.ReactNode;
  // Optional banner shown above the results body (e.g., reviewer notes
  // textarea for the verify flow).
  banner?: React.ReactNode;
}

// The lab tech can store the result two ways:
//   1) A structured JSON payload keyed by parameter code: {GLU: '95', __notes: '...'}
//   2) Free text
// detectStructured tries the JSON path first and returns the parsed object.
const tryParseStructured = (text: string | null | undefined): {
  values: Record<string, string>;
  notes: string | null;
} | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (!obj || typeof obj !== 'object') return null;
    const notes = typeof obj.__notes === 'string' ? obj.__notes : null;
    const { __notes, ...rest } = obj;
    void __notes;
    return { values: rest as Record<string, string>, notes };
  } catch {
    return null;
  }
};

// Human-readable label fallback for a parameter code when we don't have
// template metadata. "URINE_GLU" → "Urine Glu".
const humanize = (code: string): string =>
  code
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');

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

const flagFor = (
  raw: string,
  def: ParameterDef | undefined,
): { label: string; tone: 'normal' | 'low' | 'high' | 'critical' } => {
  if (!def || def.value_type !== 'numeric') return { label: '', tone: 'normal' };
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return { label: '', tone: 'normal' };
  if (def.critical_low !== null && num <= def.critical_low) return { label: 'CRITICAL LOW', tone: 'critical' };
  if (def.critical_high !== null && num >= def.critical_high) return { label: 'CRITICAL HIGH', tone: 'critical' };
  if (def.normal_low !== null && num < def.normal_low) return { label: 'LOW', tone: 'low' };
  if (def.normal_high !== null && num > def.normal_high) return { label: 'HIGH', tone: 'high' };
  return { label: '', tone: 'normal' };
};

const LabResultModal: React.FC<LabResultModalProps> = ({ order, onClose, footer, banner }) => {
  const [paramDefs, setParamDefs] = useState<ParameterDef[]>([]);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const structured = useMemo(() => tryParseStructured(order.result), [order.result]);
  const isStructured = !!structured && Object.keys(structured.values).length > 0;
  const plainText = !isStructured && order.result && order.result.trim() ? order.result.trim() : null;
  const hasNoResultText = !isStructured && !plainText;

  // For structured results, fetch parameter metadata so we can show real
  // names + ranges + abnormal flags instead of raw param_codes.
  useEffect(() => {
    if (!isStructured) return;
    let cancelled = false;
    (async () => {
      setParamsLoading(true);
      try {
        const res = await apiClient.get(`/lab/orders/${order.id}/parameters`);
        if (!cancelled && res.data?.parameters) {
          setParamDefs(res.data.parameters);
        }
      } catch {
        /* fall back to humanized codes */
      } finally {
        if (!cancelled) setParamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStructured, order.id]);

  const defByCode = useMemo(() => {
    const m = new Map<string, ParameterDef>();
    for (const p of paramDefs) m.set(p.parameter_code, p);
    return m;
  }, [paramDefs]);

  const openAttachedDoc = async () => {
    if (!order.result_document_id) return;
    setPdfLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.get(`/documents/${order.result_document_id}`);
      const doc = res.data?.document;
      const fileData: string | undefined = doc?.file_data;
      const fileType: string | undefined = doc?.file_type;
      const documentName: string | undefined = doc?.document_name;
      if (!fileData) {
        setErrorMsg('File no longer accessible. Ask the lab tech to re-upload the result PDF.');
        return;
      }
      const previewable = (fileType || '').startsWith('image/') || fileType === 'application/pdf';
      if (previewable) {
        const win = window.open();
        if (win) {
          win.document.write(
            `<title>${documentName || 'Lab Result'}</title>` +
              ((fileType || '').startsWith('image/')
                ? `<img src="${fileData}" style="max-width:100%;height:auto;" />`
                : `<iframe src="${fileData}" style="border:0;width:100vw;height:100vh;"></iframe>`),
          );
        }
      } else {
        const a = document.createElement('a');
        a.href = fileData;
        a.download = documentName || 'lab-result';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error || 'Could not load the attached document.');
    } finally {
      setPdfLoading(false);
    }
  };

  const priority = order.priority?.toLowerCase();
  const orderedAt = order.ordered_date ? format(new Date(order.ordered_date), 'MMM d, yyyy h:mm a') : '—';
  const resultedAt = order.result_date ? format(new Date(order.result_date), 'MMM d, yyyy h:mm a') : '—';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 rounded-t-xl flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{order.test_name || 'Lab Result'}</h3>
              {order.test_code && (
                <span className="text-xs text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">
                  {order.test_code}
                </span>
              )}
              {order.path_no && (
                <span className="text-xs font-mono text-primary-700 bg-white px-2 py-0.5 rounded border border-primary-200">
                  Path #{order.path_no}
                </span>
              )}
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  priority === 'stat'
                    ? 'bg-danger-100 text-danger-700'
                    : priority === 'urgent'
                      ? 'bg-warning-100 text-warning-700'
                      : 'bg-gray-100 text-gray-700'
                }`}
              >
                {(order.priority || 'routine').toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-gray-700 mt-1">
              {order.patient_name}
              {order.patient_number && <span className="text-gray-500"> · {order.patient_number}</span>}
              {order.room_number && <span className="text-primary-700"> · Room {order.room_number}</span>}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Ordered <strong>{orderedAt}</strong> · Resulted <strong>{resultedAt}</strong>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {banner}
          {hasNoResultText && !order.result_document_id && (
            <div className="bg-warning-50 border border-warning-200 rounded-lg p-4 flex items-start gap-2">
              <svg className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0l-6.93 12a2 2 0 001.74 3z" />
              </svg>
              <div className="text-sm">
                <p className="font-semibold text-warning-900">No result data recorded</p>
                <p className="text-warning-700 text-xs mt-0.5">
                  The lab marked this test completed but didn't enter a value or upload a file. Ask the lab tech to
                  open this order and record the result.
                </p>
              </div>
            </div>
          )}

          {/* Structured results table */}
          {isStructured && (
            <div className="bg-success-50 rounded-lg border border-success-200 overflow-hidden">
              <div className="px-4 py-2 bg-success-100 border-b border-success-200 text-sm font-semibold text-success-900">
                Results {paramsLoading && <span className="text-xs font-normal text-success-700 ml-2">(loading labels…)</span>}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-success-100/40">
                  <tr className="text-xs text-success-900">
                    <th className="text-left px-4 py-1.5 font-semibold">Parameter</th>
                    <th className="text-right px-4 py-1.5 font-semibold">Value</th>
                    <th className="text-left px-4 py-1.5 font-semibold">Unit</th>
                    <th className="text-left px-4 py-1.5 font-semibold">Reference</th>
                    <th className="text-left px-4 py-1.5 font-semibold">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(structured!.values).map(([code, raw]) => {
                    const def = defByCode.get(code);
                    const label = def?.parameter_name || humanize(code);
                    const unit = def?.unit || '';
                    const ref =
                      def?.reference_range_text ||
                      (def != null && def.normal_low != null && def.normal_high != null
                        ? `${def.normal_low} – ${def.normal_high}`
                        : '');
                    const { label: flagLbl, tone } = flagFor(String(raw), def);
                    const flagClass =
                      tone === 'critical'
                        ? 'bg-danger-100 text-danger-700 border-danger-300'
                        : tone === 'high'
                          ? 'bg-warning-100 text-warning-700 border-warning-300'
                          : tone === 'low'
                            ? 'bg-primary-100 text-primary-700 border-primary-300'
                            : '';
                    return (
                      <tr key={code} className="border-t border-success-100">
                        <td className="px-4 py-1.5 text-gray-800">{label}</td>
                        <td className="px-4 py-1.5 text-right font-mono font-semibold text-gray-900">{String(raw) || '—'}</td>
                        <td className="px-4 py-1.5 text-gray-600 text-xs">{unit || '—'}</td>
                        <td className="px-4 py-1.5 text-gray-600 text-xs">{ref || '—'}</td>
                        <td className="px-4 py-1.5">
                          {flagLbl && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${flagClass}`}>{flagLbl}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {structured!.notes && (
                <div className="px-4 py-3 border-t border-success-200 text-sm">
                  <div className="text-xs font-semibold text-success-900 mb-1">Notes</div>
                  <p className="text-gray-700 whitespace-pre-wrap">{structured!.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Plain text results */}
          {plainText && (
            <div className="bg-success-50 rounded-lg p-4 border border-success-200">
              <h4 className="text-sm font-bold text-success-800 mb-2">Result</h4>
              <p className="text-gray-900 whitespace-pre-wrap">{plainText}</p>
            </div>
          )}

          {/* Attached PDF / image */}
          {order.result_document_id && (
            <div className="bg-primary-50 rounded-lg p-4 border border-primary-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium text-primary-900 truncate">
                  {order.result_document_name || 'Attached result file'}
                </span>
              </div>
              <button
                onClick={openAttachedDoc}
                disabled={pdfLoading}
                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
              >
                {pdfLoading ? 'Opening…' : 'View file'}
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 text-sm text-danger-700">{errorMsg}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end items-center gap-2">
          {footer ?? (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LabResultModal;
