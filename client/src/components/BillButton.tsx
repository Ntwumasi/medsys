import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';

// Tier price ladder — kept in sync with server (encounterController.SELF_PAY_TIER_PRICES).
// Long-term should be fetched from clinic settings.
const SELF_PAY_TIER_PRICES: Record<number, number> = { 1: 100, 2: 200, 3: 300, 4: 400, 5: 500 };

interface PayerSource {
  id: number;
  patient_id: number;
  payer_type: 'self_pay' | 'insurance' | 'corporate';
  is_primary: boolean;
  insurance_provider_id?: number | null;
  insurance_provider_name?: string | null;
  insurance_member_id?: string | null;
  corporate_client_id?: number | null;
  corporate_client_name?: string | null;
  notes?: string | null;
}

interface BillButtonProps {
  encounterId: number;
  patientId: number;
  /** Current self-pay tier (1-5) on the encounter — drives the active-tier highlight. */
  selfPayTier?: number | null;
  /** Fires when the doctor sets/clears a self-pay tier. Parent should update local state. */
  onTierChange?: (newTier: number | null) => void;
  /** Fires when the doctor assigns an insurance/corporate payer source to the invoice. */
  onPayerChange?: (payerSourceId: number) => void;
}

/**
 * Universal "Bill" button next to Sign Note. Adapts to the patient's
 * available payer_sources:
 *  - self_pay → 5-tier picker (100/200/300/400/500 GHS)
 *  - insurance → list of that patient's insurance providers
 *  - corporate → list of that patient's corporate clients
 *  - mixed → all of the above, grouped
 *
 * Self-pay tier selection hits POST /encounters/:id/self-pay-tier
 * (controller replaces the consult line in one transaction).
 * Insurance/corporate selection hits POST /encounters/:id/billing-payer
 * (controller updates invoices.payer_source_id).
 */
const BillButton: React.FC<BillButtonProps> = ({
  encounterId,
  patientId,
  selfPayTier,
  onTierChange,
  onPayerChange,
}) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sources, setSources] = useState<PayerSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch the patient's payer sources whenever the patient changes.
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    apiClient
      .get(`/payer-sources/patient/${patientId}`)
      .then((res) => {
        if (cancelled) return;
        setSources(res.data?.payer_sources || []);
      })
      .catch(() => {
        if (cancelled) return;
        // A fetch FAILURE is not the same as "no payers on file" — don't show
        // the false "receptionist must add a payer" message and block billing.
        setLoadError(true);
        setSources(null);
      });
    return () => { cancelled = true; };
  }, [patientId, reloadKey]);

  const close = () => { setOpen(false); setError(null); };

  const handleSetTier = async (tier: number | null) => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/encounters/${encounterId}/self-pay-tier`, { tier });
      onTierChange?.(tier);
      close();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to set tier');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPayerSource = async (payerSourceId: number) => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/encounters/${encounterId}/billing-payer`, {
        payer_source_id: payerSourceId,
      });
      onPayerChange?.(payerSourceId);
      close();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to set payer');
    } finally {
      setSaving(false);
    }
  };

  // Group sources by type — only render sections that have entries.
  const selfPay = sources?.filter((s) => s.payer_type === 'self_pay') || [];
  const insurance = sources?.filter((s) => s.payer_type === 'insurance') || [];
  const corporate = sources?.filter((s) => s.payer_type === 'corporate') || [];

  // The button label summarises the current state. If a tier is set, show
  // it; otherwise fall back to the patient's primary payer type, otherwise
  // just "Bill".
  const buttonLabel = (() => {
    if (selfPayTier) return `Tier ${selfPayTier} — GHS ${SELF_PAY_TIER_PRICES[selfPayTier]}`;
    const primary = sources?.find((s) => s.is_primary);
    if (!primary) return 'Bill';
    if (primary.payer_type === 'self_pay') return 'Bill — Self-Pay';
    if (primary.payer_type === 'insurance') return `Bill — ${primary.insurance_provider_name || 'Insurance'}`;
    if (primary.payer_type === 'corporate') return `Bill — ${primary.corporate_client_name || 'Corporate'}`;
    return 'Bill';
  })();

  const buttonColored = !!selfPayTier;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving || (sources === null && !loadError)}
        className={`px-4 py-2 rounded-lg font-medium transition-all text-sm flex items-center gap-2 border ${
          buttonColored
            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        } ${saving ? 'opacity-60 cursor-wait' : ''}`}
        title="Bill — pick the payer / tier"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {sources === null ? (loadError ? 'Bill' : 'Loading…') : buttonLabel}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-40 overflow-hidden">
            {error && (
              <div className="px-3 py-2 text-xs text-danger-700 bg-danger-50 border-b border-danger-100">
                {error}
              </div>
            )}

            {loadError && (
              <div className="px-3 py-4 text-sm text-gray-600 text-center">
                Couldn't load payer info.
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="block mx-auto mt-2 text-xs font-medium text-primary-600 hover:text-primary-700 underline"
                >
                  Retry
                </button>
              </div>
            )}

            {!loadError && sources && sources.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                No payer sources on file for this patient.
                <div className="text-xs text-gray-400 mt-1">
                  Receptionist must add one before billing.
                </div>
              </div>
            )}

            {/* SELF-PAY → Tier picker */}
            {selfPay.length > 0 && (
              <div>
                <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  Self-Pay — Levels of Billing
                </div>
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={`tier-${lvl}`}
                    onClick={() => handleSetTier(lvl)}
                    disabled={saving}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-amber-50 flex items-center justify-between ${
                      selfPayTier === lvl ? 'bg-amber-100 font-semibold' : ''
                    }`}
                  >
                    <span>Level {lvl}</span>
                    <span className="font-mono text-gray-700">GHS {SELF_PAY_TIER_PRICES[lvl]}</span>
                  </button>
                ))}
                {selfPayTier && (
                  <button
                    onClick={() => handleSetTier(null)}
                    disabled={saving}
                    className="w-full px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50 border-t border-gray-100"
                  >
                    Clear tier
                  </button>
                )}
              </div>
            )}

            {/* INSURANCE → patient's insurance providers */}
            {insurance.length > 0 && (
              <div className={selfPay.length > 0 ? 'border-t border-gray-200' : ''}>
                <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  Insurance
                </div>
                {insurance.map((s) => (
                  <button
                    key={`ins-${s.id}`}
                    onClick={() => handleSetPayerSource(s.id)}
                    disabled={saving}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50"
                  >
                    <div className="font-medium text-gray-900">
                      {s.insurance_provider_name || 'Insurance'}
                      {s.is_primary && <span className="ml-1.5 text-[10px] font-bold text-primary-600 uppercase">Primary</span>}
                    </div>
                    {s.insurance_member_id && (
                      <div className="text-xs text-gray-500 font-mono">Member #: {s.insurance_member_id}</div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* CORPORATE → patient's corporate clients */}
            {corporate.length > 0 && (
              <div className={(selfPay.length + insurance.length) > 0 ? 'border-t border-gray-200' : ''}>
                <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  Corporate
                </div>
                {corporate.map((s) => (
                  <button
                    key={`corp-${s.id}`}
                    onClick={() => handleSetPayerSource(s.id)}
                    disabled={saving}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-success-50"
                  >
                    <div className="font-medium text-gray-900">
                      {s.corporate_client_name || 'Corporate'}
                      {s.is_primary && <span className="ml-1.5 text-[10px] font-bold text-success-700 uppercase">Primary</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BillButton;
