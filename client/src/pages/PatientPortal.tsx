import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { setActiveToken } from '../api/client';
import { patientPortalAPI } from '../api/patientPortal';
import type {
  PortalAppointment,
  PortalBill,
  PortalImaging,
  PortalLab,
  PortalMe,
  PortalMedication,
} from '../api/patientPortal';
import { branding } from '../config/branding';
import { parseLabResult, labFlag, rangeText, FLAG_TEXT } from '../components/portal/labDisplay';
import type { LabFlag } from '../components/portal/labDisplay';
import { printBill, printLabReport } from '../components/portal/portalPrint';

/**
 * Patient portal — phone-first. Its own layout (no staff sidebar/search).
 * Every section loads on its own, so one failure never blanks the page.
 * Results appear once a doctor has reviewed them or 3 days after they were
 * finalised (enforced by the server); until then the patient sees when.
 */

type View = 'home' | 'results' | 'bills' | 'medicines' | 'visits';
const VIEWS: { key: View; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'results', label: 'Results' },
  { key: 'bills', label: 'Bills' },
  { key: 'medicines', label: 'Medicines' },
  { key: 'visits', label: 'Visits' },
];

// ── helpers ────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined, withYear = true): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
};
const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
};
const ghs = (n: number) => `GHS ${n.toFixed(2)}`;
const isToday0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const isCurrentMed = (m: PortalMedication) =>
  m.status === 'active' && (!m.end_date || new Date(m.end_date) >= isToday0());

const isUpcoming = (a: PortalAppointment) => {
  const d = new Date(a.appointment_date);
  const cutoff = a.has_time ? new Date() : isToday0();
  return ['scheduled', 'confirmed'].includes(a.status) && d >= cutoff;
};

const VISIT_STATUS: Record<string, { text: string; cls: string }> = {
  scheduled: { text: 'Booked', cls: 'bg-primary-100 text-primary-800' },
  confirmed: { text: 'Confirmed', cls: 'bg-primary-100 text-primary-800' },
  'checked-in': { text: 'Attended', cls: 'bg-gray-100 text-gray-700' },
  'in-progress': { text: 'Attended', cls: 'bg-gray-100 text-gray-700' },
  completed: { text: 'Attended', cls: 'bg-gray-100 text-gray-700' },
  cancelled: { text: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
  'no-show': { text: 'Missed', cls: 'bg-warning-100 text-warning-800' },
};

const FLAG_CLS: Record<LabFlag, string> = {
  none: '',
  normal: 'bg-success-50 text-success-700',
  low: 'bg-warning-100 text-warning-800',
  high: 'bg-warning-100 text-warning-800',
  critical: 'bg-danger-100 text-danger-700',
};

/** Loads one section independently, with its own loading/error/retry. */
function useSection<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    load()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);
  useEffect(() => run(), [run]);
  return { data, error, loading, retry: run };
}

const labOutOfRange = (lab: PortalLab): number => {
  const parsed = parseLabResult(lab.result);
  if (parsed.kind !== 'structured') return 0;
  const byCode = new Map(lab.parameters.map((p) => [p.parameter_code, p]));
  return parsed.values.filter(({ code, value }) => ['low', 'high', 'critical'].includes(labFlag(value, byCode.get(code)))).length;
};

// ── small UI pieces ────────────────────────────────────────────────────────

const Card: React.FC<{ title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, action, children, className = '' }) => (
  <section className={`bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-5 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-3">
        {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
        {action}
      </div>
    )}
    {children}
  </section>
);

const SectionState: React.FC<{ loading: boolean; error: boolean; retry: () => void; what: string }> = ({ loading, error, retry, what }) => {
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label={`Loading ${what}`}>
        <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
        <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3 flex items-center justify-between gap-3">
        <span>We couldn't load your {what}.</span>
        <button onClick={retry} className="font-medium underline">Try again</button>
      </div>
    );
  }
  return null;
};

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="text-sm font-medium text-primary-700 hover:text-primary-800">
    {children}
  </button>
);

const Empty: React.FC<{ text: string }> = ({ text }) => <p className="text-sm text-gray-500 py-2">{text}</p>;

// ── result cards ───────────────────────────────────────────────────────────

const LabCard: React.FC<{ lab: PortalLab; me: PortalMe | null; onPopupBlocked: () => void }> = ({ lab, me, onPopupBlocked }) => {
  const [open, setOpen] = useState(false);
  const released = lab.release_state === 'released';
  const outOfRange = released ? labOutOfRange(lab) : 0;
  const parsed = released ? parseLabResult(lab.result) : null;
  const byCode = useMemo(() => new Map(lab.parameters.map((p) => [p.parameter_code, p])), [lab.parameters]);

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        className="w-full text-left p-4 flex items-start justify-between gap-3"
        onClick={() => released && setOpen((o) => !o)}
        aria-expanded={released ? open : undefined}
        disabled={!released}
      >
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 capitalize">{lab.test_name}</p>
          <p className="text-sm text-gray-500">
            Ordered {fmtDate(lab.ordered_date)}{lab.ordered_by ? ` · ${lab.ordered_by}` : ''}
          </p>
          {released && (
            <p className={`text-sm mt-1 ${outOfRange ? 'text-warning-800' : 'text-success-700'}`}>
              {outOfRange
                ? `${outOfRange} value${outOfRange > 1 ? 's' : ''} outside the normal range — your doctor will discuss ${outOfRange > 1 ? 'them' : 'it'} with you.`
                : parsed?.kind === 'structured' && lab.parameters.length ? 'All values in the normal range.' : 'Result ready.'}
            </p>
          )}
          {lab.release_state === 'awaiting_review' && (
            <p className="text-sm text-gray-600 mt-1">
              Done — your doctor is reviewing it. You can see it here by {fmtDate(lab.available_by, false)}.
            </p>
          )}
          {lab.release_state === 'in_progress' && <p className="text-sm text-gray-600 mt-1">In progress at the lab.</p>}
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
            released ? 'bg-success-100 text-success-800' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {released ? (open ? 'Hide' : 'View') : lab.release_state === 'awaiting_review' ? 'With doctor' : 'Pending'}
        </span>
      </button>

      {released && open && parsed && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {lab.doctor_reviewed && <p className="text-xs text-gray-500 mt-3">Reviewed by your doctor.</p>}
          {parsed.kind === 'structured' ? (
            <ul className="divide-y divide-gray-100 mt-2">
              {parsed.values.map(({ code, label, value }) => {
                const def = byCode.get(code);
                const flag = labFlag(value, def);
                const range = rangeText(def);
                return (
                  <li key={code} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{def?.parameter_name || label}</p>
                      {range && <p className="text-xs text-gray-500">Normal: {range}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">
                        {value}{def?.unit && !value.includes(def.unit) ? ` ${def.unit}` : ''}
                      </p>
                      {flag !== 'none' && (
                        <span className={`inline-block mt-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded ${FLAG_CLS[flag]}`}>
                          {FLAG_TEXT[flag]}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap mt-3">{parsed.text}</p>
          )}
          {parsed.kind === 'structured' && parsed.notes && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2"><span className="font-medium">Notes: </span>{parsed.notes}</p>
          )}
          {outOfRange > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              A value outside the normal range isn't always a problem. If you're worried, call the clinic
              {branding.clinicPhone ? ` on ${branding.clinicPhone}` : ''}.
            </p>
          )}
          {me && (
            <button
              onClick={() => { if (!printLabReport(lab, me)) onPopupBlocked(); }}
              className="mt-3 w-full sm:w-auto px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100"
            >
              Download report (PDF)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ImagingCard: React.FC<{ scan: PortalImaging }> = ({ scan }) => {
  const [open, setOpen] = useState(false);
  const released = scan.release_state === 'released';
  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        className="w-full text-left p-4 flex items-start justify-between gap-3"
        onClick={() => released && setOpen((o) => !o)}
        aria-expanded={released ? open : undefined}
        disabled={!released}
      >
        <div>
          <p className="font-semibold text-gray-900">{scan.imaging_type}{scan.body_part ? ` — ${scan.body_part}` : ''}</p>
          <p className="text-sm text-gray-500">Ordered {fmtDate(scan.ordered_date)}</p>
          {scan.release_state === 'awaiting_review' && (
            <p className="text-sm text-gray-600 mt-1">Done — the report will be here by {fmtDate(scan.available_by, false)}.</p>
          )}
          {scan.release_state === 'in_progress' && <p className="text-sm text-gray-600 mt-1">Not done yet.</p>}
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${released ? 'bg-success-100 text-success-800' : 'bg-gray-100 text-gray-700'}`}>
          {released ? (open ? 'Hide' : 'View') : 'Pending'}
        </span>
      </button>
      {released && open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mt-3">This is the radiologist's report. Your doctor will explain what it means for you.</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap mt-2">{scan.findings}</p>
        </div>
      )}
    </div>
  );
};

const BillCard: React.FC<{ bill: PortalBill; me: PortalMe | null; onPopupBlocked: () => void }> = ({ bill, me, onPopupBlocked }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg">
      <button className="w-full text-left p-4 flex items-start justify-between gap-3" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{fmtDate(bill.invoice_date)}</p>
          <p className="text-sm text-gray-500">
            Invoice {bill.invoice_number} · {ghs(bill.total)}
            {bill.covered ? ` · ${bill.payer_name || 'Insurance/company'} covers ${ghs(bill.covered_share)}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
            bill.balance_due > 0 ? 'bg-warning-100 text-warning-800' : 'bg-success-100 text-success-800'
          }`}
        >
          {bill.balance_due > 0 ? `You owe ${ghs(bill.balance_due)}` : 'Paid'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <ul className="divide-y divide-gray-100 mt-2">
            {bill.items.map((i, idx) => (
              <li key={idx} className="py-2 flex justify-between gap-3 text-sm">
                <span className="text-gray-800 min-w-0">
                  {i.description}{i.quantity > 1 ? ` × ${i.quantity}` : ''}
                  {bill.covered && (
                    <span className="block text-xs text-gray-500">{i.paid_by === 'you' ? 'You pay' : `Covered by ${bill.payer_name || 'your cover'}`}</span>
                  )}
                </span>
                <span className="tabular-nums text-gray-900 shrink-0">{ghs(i.amount)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 text-sm space-y-1">
            {bill.covered && (
              <div className="flex justify-between"><dt className="text-gray-600">Your share</dt><dd className="tabular-nums">{ghs(bill.your_share)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-gray-600">You paid</dt><dd className="tabular-nums">{ghs(bill.you_paid)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{ghs(bill.balance_due)}</dd></div>
          </dl>
          {bill.payments.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Your payments</p>
              {bill.payments.map((p, idx) => (
                <p key={idx} className="text-sm text-gray-700">
                  {fmtDate(p.date)} · {ghs(p.amount)}{p.method ? ` · ${p.method.replace(/_/g, ' ')}` : ''}
                </p>
              ))}
            </div>
          )}
          {me && (
            <button
              onClick={() => { if (!printBill(bill, me)) onPopupBlocked(); }}
              className="mt-3 w-full sm:w-auto px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100"
            >
              Download invoice (PDF)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── page ───────────────────────────────────────────────────────────────────

const PatientPortal: React.FC = () => {
  const { logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.key === params.get('view'))?.key || 'home') as View;
  const go = (v: View) => {
    setParams(v === 'home' ? {} : { view: v });
    window.scrollTo({ top: 0 });
  };
  const [popupBlocked, setPopupBlocked] = useState(false);
  const onPopupBlocked = () => setPopupBlocked(true);

  const loadMe = useCallback(async () => {
    const me = await patientPortalAPI.me();
    // Sliding session: keep the renewed token if the server issued one.
    if (me.renewed_token) {
      localStorage.setItem('token', me.renewed_token);
      setActiveToken(me.renewed_token);
    }
    return me;
  }, []);
  const me = useSection(loadMe);
  const labs = useSection(patientPortalAPI.labs);
  const imaging = useSection(patientPortalAPI.imaging);
  const meds = useSection(patientPortalAPI.medications);
  const visits = useSection(patientPortalAPI.appointments);
  const bills = useSection(patientPortalAPI.bills);

  const releasedLabs = (labs.data || []).filter((l) => l.release_state === 'released');
  const recentResults = releasedLabs.filter((l) => l.released_at && Date.now() - new Date(l.released_at).getTime() < 14 * 86400000);
  const waitingResults = (labs.data || []).filter((l) => l.release_state === 'awaiting_review').length
    + (imaging.data || []).filter((s) => s.release_state === 'awaiting_review').length;
  const currentMeds = (meds.data || []).filter(isCurrentMed);
  const pastMeds = (meds.data || []).filter((m) => !isCurrentMed(m));
  const upcoming = (visits.data || []).filter(isUpcoming).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
  const pastVisits = (visits.data || []).filter((a) => !isUpcoming(a));
  const nextVisit = upcoming[0];

  const visitLine = (a: PortalAppointment) =>
    `${fmtDate(a.appointment_date)}${a.has_time ? ` at ${fmtTime(a.appointment_date)}` : ''}`;

  const callButton = branding.clinicPhone ? (
    <a
      href={`tel:${branding.clinicPhone.replace(/[^\d+]/g, '')}`}
      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
    >
      Call the clinic
    </a>
  ) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {branding.clinicLogo && <img src={branding.clinicLogo} alt="" className="h-8 w-auto" />}
            <span className="font-semibold text-gray-900 truncate">{branding.clinicName}</span>
          </div>
          <button
            onClick={logout}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
        <nav className="max-w-2xl mx-auto px-2 flex gap-1 overflow-x-auto" aria-label="Portal sections">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => go(v.key)}
              aria-current={view === v.key ? 'page' : undefined}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
                view === v.key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {popupBlocked && (
          <div className="text-sm bg-warning-50 border border-warning-200 text-warning-800 rounded-lg p-3 flex justify-between gap-3">
            <span>Your browser blocked the download window. Allow pop-ups for this site, then try again.</span>
            <button onClick={() => setPopupBlocked(false)} className="font-medium underline">OK</button>
          </div>
        )}

        {view === 'home' && (
          <>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {me.data?.first_name ? `Hello, ${me.data.first_name}` : 'Your health records'}
              </h1>
              {me.data?.patient_number && <p className="text-sm text-gray-500">Patient no. {me.data.patient_number}</p>}
            </div>

            <Card title="Next visit" action={(visits.data?.length ?? 0) > 0 ? <LinkButton onClick={() => go('visits')}>All visits</LinkButton> : undefined}>
              <SectionState {...visits} what="visits" />
              {!visits.loading && !visits.error && (nextVisit ? (
                <div>
                  <p className="text-lg font-semibold text-gray-900">{visitLine(nextVisit)}</p>
                  <p className="text-sm text-gray-600">
                    {[nextVisit.provider_name && `With ${nextVisit.provider_name}`, nextVisit.reason].filter(Boolean).join(' · ')}
                  </p>
                  {branding.clinicPhone && <p className="text-xs text-gray-500 mt-2">Need to change it? Call {branding.clinicPhone}.</p>}
                </div>
              ) : <Empty text="No upcoming visits booked." />)}
            </Card>

            <Card title="Results" action={<LinkButton onClick={() => go('results')}>See all</LinkButton>}>
              <SectionState {...labs} what="results" />
              {!labs.loading && !labs.error && (
                <div className="space-y-1">
                  <p className="text-sm text-gray-800">
                    {recentResults.length
                      ? `${recentResults.length} new result${recentResults.length > 1 ? 's' : ''} in the last 2 weeks.`
                      : releasedLabs.length ? 'No new results.' : 'No results yet.'}
                  </p>
                  {waitingResults > 0 && (
                    <p className="text-sm text-gray-600">{waitingResults} more being reviewed by your doctor.</p>
                  )}
                </div>
              )}
            </Card>

            <Card title="Bills" action={<LinkButton onClick={() => go('bills')}>See all</LinkButton>}>
              <SectionState {...bills} what="bills" />
              {!bills.loading && !bills.error && bills.data && (
                bills.data.total_due > 0 ? (
                  <p className="text-lg font-semibold text-warning-800">You owe {ghs(bills.data.total_due)}</p>
                ) : (
                  <p className="text-sm text-success-700 font-medium">{bills.data.bills.length ? "You're all paid up." : 'No bills yet.'}</p>
                )
              )}
            </Card>

            <Card title="Medicines" action={(meds.data?.length ?? 0) > 0 ? <LinkButton onClick={() => go('medicines')}>See all</LinkButton> : undefined}>
              <SectionState {...meds} what="medicines" />
              {!meds.loading && !meds.error && (currentMeds.length ? (
                <ul className="space-y-1">
                  {currentMeds.slice(0, 3).map((m) => (
                    <li key={m.id} className="text-sm text-gray-800">
                      <span className="font-medium">{m.medication_name}</span>
                      {[m.dosage, m.frequency].filter(Boolean).length > 0 && (
                        <span className="text-gray-500"> · {[m.dosage, m.frequency].filter(Boolean).join(', ')}</span>
                      )}
                    </li>
                  ))}
                  {currentMeds.length > 3 && <li className="text-sm text-gray-500">and {currentMeds.length - 3} more</li>}
                </ul>
              ) : <Empty text="No current medicines." />)}
            </Card>

            <Card title="Need help?">
              <p className="text-sm text-gray-600 mb-3">
                Questions about your results, bills or medicines? We're happy to help.
                {branding.clinicAddress ? ` ${branding.clinicAddress}.` : ''}
              </p>
              {callButton}
              <p className="text-xs text-gray-500 mt-3">In an emergency, go to the nearest emergency room.</p>
            </Card>
          </>
        )}

        {view === 'results' && (
          <>
            <Card title="Lab results">
              <SectionState {...labs} what="lab results" />
              {!labs.loading && !labs.error && (labs.data?.length ? (
                <div className="space-y-3">
                  {labs.data.map((l) => <LabCard key={l.id} lab={l} me={me.data} onPopupBlocked={onPopupBlocked} />)}
                </div>
              ) : <Empty text="No lab tests yet." />)}
              <p className="text-xs text-gray-500 mt-3">
                Results appear here once your doctor has reviewed them, or after 3 days at the latest.
              </p>
            </Card>
            <Card title="Scans and X-rays">
              <SectionState {...imaging} what="scans" />
              {!imaging.loading && !imaging.error && (imaging.data?.length ? (
                <div className="space-y-3">{imaging.data.map((s) => <ImagingCard key={s.id} scan={s} />)}</div>
              ) : <Empty text="No scans or X-rays yet." />)}
            </Card>
          </>
        )}

        {view === 'bills' && (
          <Card title="Bills">
            <SectionState {...bills} what="bills" />
            {!bills.loading && !bills.error && bills.data && (
              <>
                <div className={`rounded-lg p-3 mb-3 ${bills.data.total_due > 0 ? 'bg-warning-50 text-warning-800' : 'bg-success-50 text-success-700'}`}>
                  <p className="font-semibold">
                    {bills.data.total_due > 0 ? `Total you owe: ${ghs(bills.data.total_due)}` : "You're all paid up."}
                  </p>
                  {bills.data.total_due > 0 && <p className="text-sm">Pay at the front desk on your next visit, or call us to arrange payment.</p>}
                </div>
                {bills.data.bills.length ? (
                  <div className="space-y-3">
                    {bills.data.bills.map((b) => <BillCard key={b.id} bill={b} me={me.data} onPopupBlocked={onPopupBlocked} />)}
                  </div>
                ) : <Empty text="No bills yet." />}
              </>
            )}
          </Card>
        )}

        {view === 'medicines' && (
          <>
            <Card title="Current medicines">
              <SectionState {...meds} what="medicines" />
              {!meds.loading && !meds.error && (currentMeds.length ? (
                <ul className="divide-y divide-gray-100">
                  {currentMeds.map((m) => (
                    <li key={m.id} className="py-3">
                      <p className="font-medium text-gray-900">{m.medication_name}</p>
                      <p className="text-sm text-gray-600">{[m.dosage, m.frequency, m.route].filter(Boolean).join(' · ')}</p>
                      <p className="text-xs text-gray-500">
                        {m.prescribed_by ? `Prescribed by ${m.prescribed_by}` : ''}
                        {m.end_date ? `${m.prescribed_by ? ' · ' : ''}Until ${fmtDate(m.end_date)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <Empty text="No current medicines." />)}
              {!meds.loading && !meds.error && currentMeds.length > 0 && (
                <p className="text-xs text-gray-500 mt-3">Running low? Call the clinic or visit our pharmacy for a refill.</p>
              )}
            </Card>
            {pastMeds.length > 0 && (
              <Card title="Past medicines">
                <ul className="divide-y divide-gray-100">
                  {pastMeds.map((m) => (
                    <li key={m.id} className="py-2">
                      <p className="text-sm text-gray-800">{m.medication_name}</p>
                      <p className="text-xs text-gray-500">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}{m.start_date ? ` · from ${fmtDate(m.start_date)}` : ''}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}

        {view === 'visits' && (
          <>
            <Card title="Upcoming visits">
              <SectionState {...visits} what="visits" />
              {!visits.loading && !visits.error && (upcoming.length ? (
                <ul className="divide-y divide-gray-100">
                  {upcoming.map((a) => (
                    <li key={a.id} className="py-3">
                      <p className="font-medium text-gray-900">{visitLine(a)}</p>
                      <p className="text-sm text-gray-600">{[a.provider_name && `With ${a.provider_name}`, a.reason].filter(Boolean).join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              ) : <Empty text="No upcoming visits booked." />)}
              {branding.clinicPhone && <p className="text-xs text-gray-500 mt-3">To book or change a visit, call {branding.clinicPhone}.</p>}
            </Card>
            {pastVisits.length > 0 && (
              <Card title="Past visits">
                <ul className="divide-y divide-gray-100">
                  {pastVisits.map((a) => {
                    const st = VISIT_STATUS[a.status] || { text: a.status, cls: 'bg-gray-100 text-gray-700' };
                    return (
                      <li key={a.id} className="py-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900">{fmtDate(a.appointment_date)}</p>
                          <p className="text-xs text-gray-500">{[a.provider_name, a.reason].filter(Boolean).join(' · ')}</p>
                        </div>
                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default PatientPortal;
