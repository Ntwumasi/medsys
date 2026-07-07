import React, { useState } from 'react';
import Modal from '../ui/Modal';
import aiApi, { AIUnavailableError } from '../../api/ai';
import type {
  DosageVerifyResult,
  SubstitutionResult,
  CounselingResult,
} from '../../api/ai';

interface AIPharmacistAssistProps {
  isOpen: boolean;
  onClose: () => void;
  medication: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  patientName?: string;
  /** Free-text allergy string as stored on the order (e.g. "Penicillin, Sulfa"). */
  patientAllergies?: string;
  /** Conditions/diagnoses to give the model context. */
  patientConditions?: string[];
  patientAge?: number;
}

type Tab = 'dosage' | 'substitutes' | 'counseling';

const splitList = (s?: string): string[] =>
  (s || '')
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
    <svg className="w-5 h-5 animate-spin text-primary-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    {label}
  </div>
);

const Unavailable: React.FC = () => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
    AI assistance isn’t configured on this environment. Everything else still works — this
    panel just needs the AI service enabled.
  </div>
);

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{message}</div>
);

const AiDisclaimer: React.FC = () => (
  <p className="mt-4 text-[11px] leading-tight text-gray-400">
    AI-generated for clinical decision support. Verify against approved references before acting.
  </p>
);

const AIPharmacistAssist: React.FC<AIPharmacistAssistProps> = ({
  isOpen,
  onClose,
  medication,
  dosage,
  frequency,
  route,
  patientName,
  patientAllergies,
  patientConditions,
  patientAge,
}) => {
  const [tab, setTab] = useState<Tab>('dosage');

  // Per-tab state
  const [dosageState, setDosageState] = useState<{ loading: boolean; data?: DosageVerifyResult; error?: string; unavailable?: boolean }>({ loading: false });
  const [subState, setSubState] = useState<{ loading: boolean; data?: SubstitutionResult; error?: string; unavailable?: boolean }>({ loading: false });
  const [subReason, setSubReason] = useState('Out of stock / therapeutic alternative needed');
  const [counselState, setCounselState] = useState<{ loading: boolean; data?: CounselingResult; error?: string; unavailable?: boolean }>({ loading: false });

  const conditions = patientConditions?.filter(Boolean) ?? [];
  const allergyList = splitList(patientAllergies);

  const handleError = (err: unknown): { error?: string; unavailable?: boolean } => {
    if (err instanceof AIUnavailableError) return { unavailable: true };
    return { error: (err as any)?.response?.data?.error || 'Something went wrong. Please try again.' };
  };

  const runDosage = async () => {
    if (!dosage || !frequency) return;
    setDosageState({ loading: true });
    try {
      const data = await aiApi.verifyDosage({ medication, dosage, frequency, patientAge });
      setDosageState({ loading: false, data });
    } catch (err) {
      setDosageState({ loading: false, ...handleError(err) });
    }
  };

  const runSubstitutes = async () => {
    setSubState({ loading: true });
    try {
      const data = await aiApi.suggestSubstitutions({
        medication,
        reason: subReason || 'therapeutic alternative needed',
        patientAllergies: allergyList,
        patientConditions: conditions,
        preferGeneric: true,
      });
      setSubState({ loading: false, data });
    } catch (err) {
      setSubState({ loading: false, ...handleError(err) });
    }
  };

  const runCounseling = async () => {
    if (!dosage || !frequency || !route) return;
    setCounselState({ loading: true });
    try {
      const data = await aiApi.generateCounseling({
        medication,
        dosage,
        frequency,
        route,
        patientName,
        conditions,
      });
      setCounselState({ loading: false, data });
    } catch (err) {
      setCounselState({ loading: false, ...handleError(err) });
    }
  };

  const printCounseling = (c: CounselingResult) => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return;
    const section = (title: string, body: string) =>
      body ? `<h3>${title}</h3><p>${body}</p>` : '';
    const list = (title: string, items: string[]) =>
      items?.length ? `<h3>${title}</h3><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';
    w.document.write(`<!doctype html><html><head><title>Counseling — ${c.medicationName}</title>
      <style>body{font-family:Arial,sans-serif;max-width:640px;margin:24px auto;color:#111;line-height:1.5}
      h2{margin:0 0 4px}h3{margin:16px 0 4px;color:#1d4ed8;font-size:14px}ul{margin:4px 0}p{margin:4px 0}</style>
      </head><body>
      <h2>Medication Counseling</h2>
      <p><strong>${c.medicationName}</strong>${patientName ? ` — for ${patientName}` : ''}</p>
      ${c.patientFriendlySummary ? `<p>${c.patientFriendlySummary}</p>` : ''}
      ${section('How to take it', c.howToTake)}
      ${section('Best time', c.timing)}
      ${section('Food', c.withFood)}
      ${list('Common side effects', c.commonSideEffects)}
      ${list('Seek medical attention if', c.seriousSideEffects)}
      ${section('Storage', c.storage)}
      ${section('If you miss a dose', c.missedDose)}
      ${list('Lifestyle notes', c.lifestyleNotes)}
      ${list('Warnings', c.warnings)}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const TabButton: React.FC<{ id: Tab; label: string }> = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        tab === id ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  const riskBadge = (appropriate: boolean, requiresReview: boolean) => {
    if (requiresReview || !appropriate)
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Needs review</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Appropriate</span>;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Pharmacist Assist" size="lg">
      <div className="mb-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{medication}</span>
          {dosage ? ` · ${dosage}` : ''}
          {frequency ? ` · ${frequency}` : ''}
          {route ? ` · ${route}` : ''}
        </p>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-50 p-1 rounded-xl w-fit">
        <TabButton id="dosage" label="Dosage check" />
        <TabButton id="substitutes" label="Substitutes" />
        <TabButton id="counseling" label="Counseling" />
      </div>

      {/* ---- Dosage ---- */}
      {tab === 'dosage' && (
        <div>
          {!dosage || !frequency ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
              This order is missing a dosage or frequency, so it can’t be dose-checked.
            </div>
          ) : (
            <>
              {!dosageState.data && !dosageState.loading && !dosageState.unavailable && !dosageState.error && (
                <button onClick={runDosage} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                  Check dosage
                </button>
              )}
              {dosageState.loading && <Spinner label="Checking dosage against therapeutic range…" />}
              {dosageState.unavailable && <Unavailable />}
              {dosageState.error && <ErrorBox message={dosageState.error} />}
              {dosageState.data && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {riskBadge(dosageState.data.isAppropriate, dosageState.data.requiresReview)}
                    <span className="text-xs text-gray-500">confidence: {dosageState.data.confidence}</span>
                    {dosageState.data.cached && <span className="text-xs text-gray-400">(cached)</span>}
                  </div>
                  {dosageState.data.requiresReview && dosageState.data.reviewReason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                      {dosageState.data.reviewReason}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {dosageState.data.normalRange && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-500 mb-1">Normal range</div>
                        <div className="text-gray-900">
                          {dosageState.data.normalRange.min}–{dosageState.data.normalRange.max} · {dosageState.data.normalRange.frequency}
                        </div>
                      </div>
                    )}
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Daily dose</div>
                      <div className="text-gray-900">
                        {dosageState.data.prescribedDailyDose || '—'}
                        {dosageState.data.maxDailyDose ? ` (max ${dosageState.data.maxDailyDose})` : ''}
                      </div>
                    </div>
                  </div>
                  {dosageState.data.concerns?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Concerns</div>
                      <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
                        {dosageState.data.concerns.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                  {dosageState.data.recommendations?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Recommendations</div>
                      <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
                        {dosageState.data.recommendations.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                  <AiDisclaimer />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- Substitutes ---- */}
      {tab === 'substitutes' && (
        <div>
          <div className="flex gap-2 mb-3">
            <input
              value={subReason}
              onChange={(e) => setSubReason(e.target.value)}
              placeholder="Reason for substitution"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button onClick={runSubstitutes} disabled={subState.loading} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50">
              Find alternatives
            </button>
          </div>
          {subState.loading && <Spinner label="Finding therapeutic alternatives…" />}
          {subState.unavailable && <Unavailable />}
          {subState.error && <ErrorBox message={subState.error} />}
          {subState.data && (
            <div className="space-y-3">
              {subState.data.therapeuticClass && (
                <p className="text-xs text-gray-500">Class: {subState.data.therapeuticClass}</p>
              )}
              {subState.data.alternatives?.length ? (
                subState.data.alternatives.map((alt, i) => (
                  <div key={i} className={`border rounded-lg p-3 ${alt.recommended ? 'border-green-300 bg-green-50/40' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-900 text-sm">
                        {alt.genericName}
                        {alt.brandName ? <span className="font-normal text-gray-500"> ({alt.brandName})</span> : ''}
                      </div>
                      <div className="flex items-center gap-1">
                        {alt.recommended && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">Recommended</span>}
                        {alt.approximateCost && <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600">cost: {alt.approximateCost}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{alt.equivalenceLevel}</div>
                    {alt.rationale && <p className="text-sm text-gray-700 mt-1">{alt.rationale}</p>}
                    {alt.keyDifferences && <p className="text-xs text-gray-500 mt-1">Differences: {alt.keyDifferences}</p>}
                    {alt.contraindications?.length > 0 && (
                      <p className="text-xs text-red-700 mt-1">Caution: {alt.contraindications.join(', ')}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No alternatives suggested.</p>
              )}
              {subState.data.notes && <p className="text-xs text-gray-500">{subState.data.notes}</p>}
              <AiDisclaimer />
            </div>
          )}
        </div>
      )}

      {/* ---- Counseling ---- */}
      {tab === 'counseling' && (
        <div>
          {!dosage || !frequency || !route ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
              Counseling needs the dosage, frequency, and route on the order.
            </div>
          ) : (
            <>
              {!counselState.data && !counselState.loading && !counselState.unavailable && !counselState.error && (
                <button onClick={runCounseling} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                  Generate counseling
                </button>
              )}
              {counselState.loading && <Spinner label="Writing patient counseling…" />}
              {counselState.unavailable && <Unavailable />}
              {counselState.error && <ErrorBox message={counselState.error} />}
              {counselState.data && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button onClick={() => printCounseling(counselState.data!)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                      Print for patient
                    </button>
                  </div>
                  {counselState.data.patientFriendlySummary && (
                    <p className="text-sm text-gray-800 bg-blue-50 border border-blue-100 rounded-lg p-3">
                      {counselState.data.patientFriendlySummary}
                    </p>
                  )}
                  <div className="grid gap-2 text-sm text-gray-800">
                    {counselState.data.howToTake && <p><span className="font-semibold">How to take:</span> {counselState.data.howToTake}</p>}
                    {counselState.data.timing && <p><span className="font-semibold">Timing:</span> {counselState.data.timing}</p>}
                    {counselState.data.withFood && <p><span className="font-semibold">Food:</span> {counselState.data.withFood}</p>}
                    {counselState.data.storage && <p><span className="font-semibold">Storage:</span> {counselState.data.storage}</p>}
                    {counselState.data.missedDose && <p><span className="font-semibold">Missed dose:</span> {counselState.data.missedDose}</p>}
                  </div>
                  {counselState.data.seriousSideEffects?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-red-700 mb-1">Seek medical attention if</div>
                      <ul className="list-disc pl-5 text-sm text-red-800 space-y-0.5">
                        {counselState.data.seriousSideEffects.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                  <AiDisclaimer />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default AIPharmacistAssist;
