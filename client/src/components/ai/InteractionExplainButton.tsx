import React, { useState } from 'react';
import Modal from '../ui/Modal';
import aiApi, { AIUnavailableError } from '../../api/ai';
import type { InteractionExplainResult } from '../../api/ai';

interface InteractionExplainButtonProps {
  drug1: string;
  drug2: string;
  /** The already-detected interaction (from the med-list screen), for context. */
  existingInteraction?: { severity: string; description: string };
  patientAge?: number;
  patientConditions?: string[];
}

// A compact "Explain" affordance for a single drug-pair interaction. Opens a
// modal with a plain-language AI breakdown (mechanism, effects, risk, what to do,
// alternatives, monitoring). Complements the med-list interaction screen.
const InteractionExplainButton: React.FC<InteractionExplainButtonProps> = ({
  drug1,
  drug2,
  existingInteraction,
  patientAge,
  patientConditions,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InteractionExplainResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAndLoad = async () => {
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const result = await aiApi.explainDrugInteraction({
        drug1,
        drug2,
        patientAge,
        patientConditions: patientConditions?.filter(Boolean),
        existingInteraction,
      });
      setData(result);
    } catch (err) {
      if (err instanceof AIUnavailableError) setUnavailable(true);
      else setError((err as any)?.response?.data?.error || 'Could not load explanation.');
    } finally {
      setLoading(false);
    }
  };

  const riskColor = (risk?: string) => {
    const r = (risk || '').toLowerCase();
    if (r.includes('contra')) return 'bg-red-100 text-red-800';
    if (r.includes('high')) return 'bg-orange-100 text-orange-800';
    if (r.includes('moder')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <>
      <button
        onClick={openAndLoad}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-900 hover:underline"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Explain
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Interaction explained" size="lg">
        <div className="mb-3">
          <p className="text-sm">
            <span className="font-semibold text-gray-900">{drug1}</span>
            <span className="text-gray-400"> + </span>
            <span className="font-semibold text-gray-900">{drug2}</span>
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
            <svg className="w-5 h-5 animate-spin text-primary-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Analysing the interaction…
          </div>
        )}

        {unavailable && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            AI explanations aren’t configured on this environment. The detected interaction and
            recommendation above still apply.
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{error}</div>}

        {data && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${riskColor(data.riskLevel)}`}>
                {data.riskLevel || 'risk'}
              </span>
              {data.cached && <span className="text-xs text-gray-400">(cached)</span>}
            </div>
            {data.explanation && <p className="text-sm text-gray-800">{data.explanation}</p>}
            {data.clinicalEffects?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Clinical effects</div>
                <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
                  {data.clinicalEffects.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {data.recommendations?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">What to do</div>
                <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
                  {data.recommendations.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {data.monitoring?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Monitor</div>
                <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
                  {data.monitoring.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {data.alternatives?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Possible alternatives</div>
                <ul className="text-sm text-gray-800 space-y-1">
                  {data.alternatives.map((a, i) => (
                    <li key={i}><span className="font-medium">{a.name}</span>{a.rationale ? ` — ${a.rationale}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 text-[11px] leading-tight text-gray-400">
              AI-generated for clinical decision support. Verify against approved references before acting.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default InteractionExplainButton;
