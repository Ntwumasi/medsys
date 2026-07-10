import React, { useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { patientsAPI } from '../api/patients';
import type { Encounter } from '../types';

interface PastVisitsPanelProps {
  patientId: number;
  /** The encounter currently open in the workspace — excluded from the list. */
  currentEncounterId?: number;
}

const fmtDate = (s?: string): string => {
  if (!s) return 'N/A';
  try {
    const d = parseISO(s);
    return isValid(d) ? format(d, 'MMM d, yyyy') : 'N/A';
  } catch {
    return 'N/A';
  }
};

/**
 * Inline, collapsible past-visits history for the doctor's encounter workspace.
 * Lets the doctor glance at a patient's prior encounters (date, provider,
 * complaint, diagnoses, meds, notes) without leaving the screen to run a
 * Past-Patients search. Reuses GET /patients/:id/summary, which already returns
 * recent_encounters enriched with diagnoses, prescriptions and clinical notes.
 * Fetches lazily on first expand so opening a patient doesn't add a network call.
 */
const PastVisitsPanel: React.FC<PastVisitsPanelProps> = ({ patientId, currentEncounterId }) => {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visits, setVisits] = useState<Encounter[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await patientsAPI.getPatientSummary(patientId);
      const past = (summary.recent_encounters || []).filter((e) => e.id !== currentEncounterId);
      setVisits(past);
      setLoaded(true);
    } catch {
      setError('Could not load past visits.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) load();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-6 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold text-gray-900">Past Visits</span>
          {loaded && (
            <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
              {visits.length}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-6 pb-6">
          {loading && <div className="text-sm text-gray-500 py-2">Loading past visits…</div>}

          {error && (
            <div className="text-sm text-danger-600 py-2 flex items-center gap-2">
              {error}
              <button onClick={load} className="underline font-medium">
                Retry
              </button>
            </div>
          )}

          {loaded && !loading && visits.length === 0 && (
            <div className="text-sm text-gray-400 italic py-2">No previous visits on record.</div>
          )}

          {loaded && !loading && visits.length > 0 && (
            <div className="space-y-2">
              {visits.map((v) => {
                const isExpanded = expandedId === v.id;
                const diagnoses = v.diagnoses || [];
                const meds = v.prescriptions || [];
                const notes = v.clinical_notes || [];
                return (
                  <div key={v.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : v.id)}
                      className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{fmtDate(v.encounter_date)}</span>
                          {v.encounter_type && (
                            <span className="text-[11px] font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded px-1.5 py-0.5 capitalize">
                              {v.encounter_type}
                            </span>
                          )}
                          {v.provider_name && (
                            <span className="text-xs text-gray-500">{v.provider_name}</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-700 mt-0.5 truncate">
                          {v.chief_complaint || <span className="text-gray-400 italic">No chief complaint recorded</span>}
                        </div>
                        {diagnoses.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {diagnoses.map((d) => (
                              <span
                                key={d.id}
                                className={`text-[11px] font-medium rounded px-1.5 py-0.5 border ${
                                  d.type === 'primary'
                                    ? 'bg-danger-50 text-danger-700 border-danger-200'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                                }`}
                              >
                                {d.diagnosis_description}
                                {d.diagnosis_code ? ` (${d.diagnosis_code})` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/50 p-3 space-y-3 text-sm">
                        {meds.length > 0 && (
                          <div>
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                              Medications
                            </div>
                            <ul className="space-y-0.5">
                              {meds.map((m) => (
                                <li key={m.id} className="text-gray-700">
                                  {m.medication_name}
                                  {m.dosage ? ` — ${m.dosage}` : ''}
                                  {m.frequency ? `, ${m.frequency}` : ''}
                                  {m.status ? (
                                    <span className="text-xs text-gray-400"> ({m.status})</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {notes.length > 0 && (
                          <div>
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                              Notes
                            </div>
                            <div className="space-y-2">
                              {notes.map((n) => (
                                <div key={n.id}>
                                  <div className="text-xs text-gray-500">
                                    {n.note_type ? `${n.note_type} · ` : ''}
                                    {n.author_name || 'Unknown'}
                                  </div>
                                  <div className="text-gray-700 whitespace-pre-wrap">{n.content}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {meds.length === 0 && notes.length === 0 && (
                          <div className="text-gray-400 italic">No medications or notes recorded for this visit.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PastVisitsPanel;
