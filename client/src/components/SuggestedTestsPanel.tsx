import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';

export interface SuggestedTest {
  test_name: string;
  test_code: string;
  category: string | null;
  base_price: number | null;
  priority: 'routine' | 'urgent' | 'stat';
  rationale: string;
  interval: string | null;
  last_done_months_ago: number | null;
}

interface SuggestedImaging {
  study_type: string;
  body_part?: string;
  priority?: string;
  rationale?: string;
}

interface SuggestionsResponse {
  patient: { age: number | null; gender: string | null };
  visit_tests: SuggestedTest[];
  screening_tests: SuggestedTest[];
  imaging_tests: SuggestedImaging[];
  clinical_note: string;
  cached: boolean;
}

interface SuggestedTestsPanelProps {
  patientId: number;
  /** Current encounter — supplies the chief complaint and the target for nurse alerts. */
  encounterId?: number;
  /**
   * doctor: each suggestion gets an "Add" button that stages a real lab order.
   * nurse: read-only, with "Flag to doctor" instead — ordering authority stays
   * with the doctor.
   */
  mode: 'doctor' | 'nurse';
  /** Called in doctor mode when a suggestion is accepted. */
  onAddOrder?: (test: SuggestedTest) => void;
  /** Test names already ordered on this encounter — shown as "Ordered", not re-orderable. */
  alreadyOrdered?: string[];
}

const priorityChip = (priority: string): string =>
  priority === 'stat'
    ? 'bg-red-100 text-red-700'
    : priority === 'urgent'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-600';

const lastDoneLabel = (months: number | null): string | null => {
  if (months === null) return null;
  if (months === 0) return 'Done this month';
  if (months === 1) return 'Done last month';
  if (months < 12) return `Done ${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'Done about a year ago' : `Done about ${years} years ago`;
};

/**
 * AI-suggested tests for the patient in front of the clinician, driven by their
 * history and demographics rather than by a typed complaint.
 *
 * Shared by the doctor and nurse dashboards so the two views can never disagree
 * about what is being suggested. Everything shown is validated server-side
 * against lab_test_catalog, so each row is a real, priced, orderable test.
 *
 * Advisory only — nothing here orders anything on its own. The doctor stages an
 * order with an explicit click; the nurse can only flag it for the doctor.
 *
 * Renders nothing at all when the AI service is unconfigured (503), rather than
 * putting a broken card on every patient in the clinic.
 */
const SuggestedTestsPanel: React.FC<SuggestedTestsPanelProps> = ({
  patientId,
  encounterId,
  mode,
  onAddOrder,
  alreadyOrdered = [],
}) => {
  const { showToast } = useNotification();
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/patients/${patientId}/suggested-tests`, {
        params: encounterId ? { encounter_id: encounterId } : undefined,
      });
      setData(res.data);
    } catch (err: any) {
      if (err?.response?.status === 503) {
        setUnavailable(true);
      } else {
        setError('Could not load suggestions');
      }
    } finally {
      setLoading(false);
    }
  }, [patientId, encounterId]);

  useEffect(() => {
    setData(null);
    setAdded([]);
    setUnavailable(false);
    load();
  }, [load]);

  const isOrdered = (test: SuggestedTest): boolean => {
    const name = test.test_name.toLowerCase().trim();
    const code = test.test_code.toLowerCase();
    return (
      added.includes(code) ||
      alreadyOrdered.some((o) => {
        const v = String(o).toLowerCase().trim();
        return v === name || v === code;
      })
    );
  };

  const handleAdd = (test: SuggestedTest) => {
    onAddOrder?.(test);
    setAdded((prev) => [...prev, test.test_code.toLowerCase()]);
    showToast(`${test.test_name} added to pending orders`, 'success');
  };

  const handleFlag = async () => {
    if (!encounterId || !data) return;
    const names = [...data.visit_tests, ...data.screening_tests].map((t) => t.test_name);
    if (names.length === 0) return;
    setFlagging(true);
    try {
      await apiClient.post('/workflow/nurse/alert-doctor', {
        encounter_id: encounterId,
        message: `Suggested tests for review: ${names.join(', ')}`,
      });
      showToast('Doctor notified', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Could not notify the doctor', 'error');
    } finally {
      setFlagging(false);
    }
  };

  // AI off for this deployment — stay out of the way entirely.
  if (unavailable) return null;

  const total = data ? data.visit_tests.length + data.screening_tests.length + data.imaging_tests.length : 0;

  const renderTest = (test: SuggestedTest, key: string) => {
    const ordered = isOrdered(test);
    const done = lastDoneLabel(test.last_done_months_ago);
    return (
      <div
        key={key}
        className="flex items-start justify-between gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{test.test_name}</span>
            <span className="text-[11px] text-gray-400 tabular-nums">{test.test_code}</span>
            {test.priority !== 'routine' && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${priorityChip(test.priority)}`}>
                {test.priority}
              </span>
            )}
            {test.base_price != null && test.base_price > 0 && (
              <span className="text-[11px] text-gray-500 tabular-nums">GHS {test.base_price.toFixed(2)}</span>
            )}
          </div>
          {test.rationale && <p className="text-xs text-gray-600 mt-0.5">{test.rationale}</p>}
          <div className="flex items-center gap-2 mt-1">
            {test.interval && <span className="text-[11px] text-gray-400">{test.interval}</span>}
            {done && <span className="text-[11px] text-amber-600">{done}</span>}
          </div>
        </div>
        {mode === 'doctor' && (
          <button
            type="button"
            onClick={() => handleAdd(test)}
            disabled={ordered}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
              ordered
                ? 'bg-gray-100 text-gray-400 cursor-default'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {ordered ? 'Ordered' : 'Add'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Suggested Tests</h2>
          {total > 0 && (
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full tabular-nums">
              {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
            title="Regenerate suggestions"
          >
            Refresh
          </button>
          {total > 0 && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {collapsed ? 'Show' : 'Hide'}
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Reviewing history and demographics…</p>}

      {!loading && error && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{error}</p>
          <button type="button" onClick={load} className="text-xs font-semibold text-primary-600 hover:text-primary-700">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && total === 0 && (
        <p className="text-sm text-gray-400">Nothing outstanding for this patient right now.</p>
      )}

      {!loading && !error && data && total > 0 && !collapsed && (
        <div className="space-y-4">
          {data.clinical_note && <p className="text-xs text-gray-600 italic">{data.clinical_note}</p>}

          {data.visit_tests.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">This Visit</h3>
              <div className="space-y-2">{data.visit_tests.map((t, i) => renderTest(t, `v-${i}`))}</div>
            </div>
          )}

          {data.screening_tests.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Health Maintenance
                {data.patient.age !== null && (
                  <span className="ml-1 normal-case font-normal text-gray-400">
                    · based on age {data.patient.age}
                    {data.patient.gender ? `, ${data.patient.gender}` : ''} and history
                  </span>
                )}
              </h3>
              <div className="space-y-2">{data.screening_tests.map((t, i) => renderTest(t, `s-${i}`))}</div>
            </div>
          )}

          {data.imaging_tests.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Imaging</h3>
              <div className="space-y-2">
                {data.imaging_tests.map((img, i) => (
                  <div key={`i-${i}`} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {img.study_type}
                        {img.body_part ? ` — ${img.body_part}` : ''}
                      </span>
                      {img.priority && img.priority !== 'routine' && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${priorityChip(img.priority)}`}>
                          {img.priority}
                        </span>
                      )}
                    </div>
                    {img.rationale && <p className="text-xs text-gray-600 mt-0.5">{img.rationale}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-gray-400">
              AI suggestions for clinician review — not a diagnosis. Confirm before ordering.
            </p>
            {mode === 'nurse' && encounterId && (
              <button
                type="button"
                onClick={handleFlag}
                disabled={flagging}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {flagging ? 'Sending…' : 'Flag to doctor'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestedTestsPanel;
