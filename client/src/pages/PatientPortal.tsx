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
import PortalShell, { PortalIcon } from '../components/portal/PortalShell';
import { PORTAL_NAV } from '../components/portal/portalNav';
import type { PortalView } from '../components/portal/portalNav';

/**
 * Patient portal — phone-first. Its own layout (no staff sidebar/search).
 * Every section loads on its own, so one failure never blanks the page.
 * Results appear once a doctor has reviewed them or 3 days after they were
 * finalised (enforced by the server); until then the patient sees when.
 */


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

type Tone = 'primary' | 'secondary' | 'success' | 'warning';
const TONE: Record<Tone, string> = {
  primary: 'bg-primary-50 text-primary-600',
  secondary: 'bg-secondary-50 text-secondary-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
};

const Card: React.FC<{ title?: string; icon?: PortalView; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, icon, action, children, className = '' }) => (
  <section className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
              <PortalIcon name={icon} className="w-4 h-4" />
            </span>
          )}
          {title && <h3 className="text-base font-semibold text-text-primary truncate">{title}</h3>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

const ListSection: React.FC<{ title: string; icon: PortalView; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section>
    <div className="flex items-center gap-2.5 mb-3">
      <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
        <PortalIcon name={icon} className="w-4 h-4" />
      </span>
      <h2 className="!text-base font-semibold text-text-primary">{title}</h2>
    </div>
    {children}
  </section>
);

const PageHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="mb-5 lg:mb-6">
    <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
    <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
  </div>
);

const SectionState: React.FC<{ loading: boolean; error: boolean; retry: () => void; what: string }> = ({ loading, error, retry, what }) => {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={`Loading ${what}`}>
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-100 rounded animate-pulse w-2/3" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-sm text-danger-700 bg-danger-50 border border-danger-100 rounded-xl p-3 flex items-center justify-between gap-3">
        <span>We couldn't load your {what}.</span>
        <button onClick={retry} className="font-semibold underline underline-offset-2">Try again</button>
      </div>
    );
  }
  return null;
};

const EmptyState: React.FC<{ icon: PortalView; title: string; text?: string; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
  <div className="flex flex-col items-center text-center py-8 px-4">
    <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-50 to-secondary-50 text-primary-500 flex items-center justify-center mb-3">
      <PortalIcon name={icon} className="w-7 h-7" />
    </span>
    <p className="font-semibold text-text-primary">{title}</p>
    {text && <p className="text-sm text-text-secondary mt-1 max-w-xs">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="text-sm font-semibold text-primary-600 hover:text-primary-700 shrink-0">
    {children} →
  </button>
);

const StatTile: React.FC<{ icon: PortalView; tone: Tone; label: string; value: string; hint?: string; onClick: () => void; loading?: boolean }> = ({ icon, tone, label, value, hint, onClick, loading }) => (
  <button
    onClick={onClick}
    className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-left hover:shadow-md hover:border-primary-200 transition-all"
  >
    <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${TONE[tone]}`}>
      <PortalIcon name={icon} />
    </span>
    <p className="text-xs font-medium text-text-secondary mt-3">{label}</p>
    {loading ? (
      <div className="h-6 mt-1 bg-gray-100 rounded animate-pulse w-2/3" />
    ) : (
      <p className="text-lg font-bold text-text-primary leading-tight mt-0.5 truncate">{value}</p>
    )}
    {hint && !loading && <p className="text-xs text-text-secondary mt-0.5 truncate">{hint}</p>}
  </button>
);

const Chip: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`shrink-0 inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${className}`}>{children}</span>
);

const SecondaryButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary-700 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors"
  >
    {children}
  </button>
);

const CLINIC_TEL = branding.clinicPhone ? `tel:${branding.clinicPhone.replace(/[^\d+]/g, '')}` : '';
const CallButton: React.FC<{ light?: boolean; label?: string }> = ({ light, label = 'Call the clinic' }) =>
  CLINIC_TEL ? (
    <a
      href={CLINIC_TEL}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
        light ? 'bg-white text-primary-700 hover:bg-primary-50' : 'bg-primary-500 text-white hover:bg-primary-600'
      }`}
    >
      <PortalIcon name="phone" className="w-4 h-4" />
      {label}
    </a>
  ) : null;

// ── result / bill cards ────────────────────────────────────────────────────

const LabCard: React.FC<{ lab: PortalLab; me: PortalMe | null; onPopupBlocked: () => void }> = ({ lab, me, onPopupBlocked }) => {
  const [open, setOpen] = useState(false);
  const released = lab.release_state === 'released';
  const outOfRange = released ? labOutOfRange(lab) : 0;
  const parsed = released ? parseLabResult(lab.result) : null;
  const byCode = useMemo(() => new Map(lab.parameters.map((p) => [p.parameter_code, p])), [lab.parameters]);
  const tone = !released ? 'bg-gray-100 text-gray-500' : outOfRange ? 'bg-warning-50 text-warning-600' : 'bg-success-50 text-success-600';

  return (
    <div className={`bg-white rounded-2xl border transition-shadow ${open ? 'border-primary-200 shadow-md' : 'border-gray-100 shadow-sm'}`}>
      <button
        className="w-full text-left p-4 flex items-center gap-3 disabled:cursor-default"
        onClick={() => released && setOpen((o) => !o)}
        aria-expanded={released ? open : undefined}
        disabled={!released}
      >
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <PortalIcon name="results" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary capitalize truncate">{lab.test_name}</p>
          <p className="text-xs text-text-secondary truncate">
            {fmtDate(lab.ordered_date)}{lab.ordered_by ? ` · ${lab.ordered_by}` : ''}
          </p>
          {released ? (
            <p className={`text-sm mt-1 ${outOfRange ? 'text-warning-700' : 'text-success-700'}`}>
              {outOfRange
                ? `${outOfRange} value${outOfRange > 1 ? 's' : ''} outside the normal range`
                : parsed?.kind === 'structured' && lab.parameters.length ? 'All values in the normal range' : 'Result ready'}
            </p>
          ) : (
            <p className="text-sm text-text-secondary mt-1">
              {lab.release_state === 'awaiting_review'
                ? `With your doctor · here by ${fmtDate(lab.available_by, false)}`
                : 'In progress at the lab'}
            </p>
          )}
        </div>
        {released ? (
          <svg className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <Chip className="bg-gray-100 text-gray-600">{lab.release_state === 'awaiting_review' ? 'Reviewing' : 'Pending'}</Chip>
        )}
      </button>

      {released && open && parsed && (
        <div className="px-4 pb-4">
          <div className="border-t border-gray-100 pt-3">
            {lab.doctor_reviewed && (
              <p className="text-xs font-medium text-primary-700 bg-primary-50 inline-block px-2 py-1 rounded-md mb-2">Reviewed by your doctor</p>
            )}
            {parsed.kind === 'structured' ? (
              <ul className="space-y-2">
                {parsed.values.map(({ code, label, value }) => {
                  const def = byCode.get(code);
                  const flag = labFlag(value, def);
                  const range = rangeText(def);
                  return (
                    <li key={code} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{def?.parameter_name || label}</p>
                        {range && <p className="text-xs text-text-secondary">Normal {range}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-text-primary tabular-nums">
                          {value}{def?.unit && !value.includes(def.unit) ? <span className="font-normal text-text-secondary"> {def.unit}</span> : null}
                        </p>
                        {flag !== 'none' && (
                          <span className={`inline-block mt-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded ${FLAG_CLS[flag]}`}>
                            {FLAG_TEXT[flag]}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-text-primary whitespace-pre-wrap">{parsed.text}</p>
            )}
            {parsed.kind === 'structured' && parsed.notes && (
              <p className="text-sm text-text-primary whitespace-pre-wrap mt-3"><span className="font-semibold">Notes: </span>{parsed.notes}</p>
            )}
            {outOfRange > 0 && (
              <p className="text-xs text-text-secondary mt-3">
                A value outside the normal range isn't always a problem — your doctor will discuss it with you.
                {branding.clinicPhone ? ` Worried? Call ${branding.clinicPhone}.` : ''}
              </p>
            )}
            {me && (
              <SecondaryButton onClick={() => { if (!printLabReport(lab, me)) onPopupBlocked(); }}>
                Download report (PDF)
              </SecondaryButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ImagingCard: React.FC<{ scan: PortalImaging }> = ({ scan }) => {
  const [open, setOpen] = useState(false);
  const released = scan.release_state === 'released';
  return (
    <div className={`bg-white rounded-2xl border transition-shadow ${open ? 'border-primary-200 shadow-md' : 'border-gray-100 shadow-sm'}`}>
      <button
        className="w-full text-left p-4 flex items-center gap-3 disabled:cursor-default"
        onClick={() => released && setOpen((o) => !o)}
        aria-expanded={released ? open : undefined}
        disabled={!released}
      >
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${released ? 'bg-secondary-50 text-secondary-600' : 'bg-gray-100 text-gray-500'}`}>
          <PortalIcon name="results" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary truncate">{scan.imaging_type}{scan.body_part ? ` — ${scan.body_part}` : ''}</p>
          <p className="text-xs text-text-secondary">{fmtDate(scan.ordered_date)}</p>
          <p className="text-sm text-text-secondary mt-1">
            {released ? 'Report ready' : scan.release_state === 'awaiting_review' ? `Report here by ${fmtDate(scan.available_by, false)}` : 'Not done yet'}
          </p>
        </div>
        {released ? (
          <svg className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <Chip className="bg-gray-100 text-gray-600">Pending</Chip>
        )}
      </button>
      {released && open && (
        <div className="px-4 pb-4">
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-text-secondary mb-2">The radiologist's report. Your doctor will explain what it means for you.</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap rounded-xl bg-gray-50 p-3">{scan.findings}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const BillCard: React.FC<{ bill: PortalBill; me: PortalMe | null; onPopupBlocked: () => void }> = ({ bill, me, onPopupBlocked }) => {
  const [open, setOpen] = useState(false);
  const owes = bill.balance_due > 0;
  return (
    <div className={`bg-white rounded-2xl border transition-shadow ${open ? 'border-primary-200 shadow-md' : 'border-gray-100 shadow-sm'}`}>
      <button className="w-full text-left p-4 flex items-center gap-3" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${owes ? 'bg-warning-50 text-warning-600' : 'bg-success-50 text-success-600'}`}>
          <PortalIcon name="bills" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary">{fmtDate(bill.invoice_date)}</p>
          <p className="text-xs text-text-secondary truncate">
            {bill.invoice_number}{bill.covered ? ` · ${bill.payer_name || 'Insurance/company'} covers ${ghs(bill.covered_share)}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-text-primary tabular-nums">{ghs(bill.covered ? bill.your_share : bill.total)}</p>
          <Chip className={owes ? 'bg-warning-100 text-warning-800 mt-1' : 'bg-success-100 text-success-800 mt-1'}>
            {owes ? `Owe ${ghs(bill.balance_due)}` : 'Paid'}
          </Chip>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="border-t border-gray-100 pt-3">
            <ul className="space-y-2">
              {bill.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-3 text-sm">
                  <span className="text-text-primary min-w-0">
                    {i.description}{i.quantity > 1 ? ` × ${i.quantity}` : ''}
                    {bill.covered && (
                      <span className={`block text-xs ${i.paid_by === 'you' ? 'text-warning-700' : 'text-text-secondary'}`}>
                        {i.paid_by === 'you' ? 'You pay' : `Covered by ${bill.payer_name || 'your cover'}`}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-text-primary shrink-0">{ghs(i.amount)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 rounded-xl bg-gray-50 p-3 text-sm space-y-1.5">
              {bill.covered && (
                <div className="flex justify-between"><dt className="text-text-secondary">Your share</dt><dd className="tabular-nums">{ghs(bill.your_share)}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-text-secondary">You paid</dt><dd className="tabular-nums">{ghs(bill.you_paid)}</dd></div>
              <div className="flex justify-between font-bold text-text-primary"><dt>Balance due</dt><dd className="tabular-nums">{ghs(bill.balance_due)}</dd></div>
            </dl>
            {bill.payments.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Your payments</p>
                {bill.payments.map((p, idx) => (
                  <p key={idx} className="text-sm text-text-primary">
                    {fmtDate(p.date)} · {ghs(p.amount)}{p.method ? ` · ${p.method.replace(/_/g, ' ')}` : ''}
                  </p>
                ))}
              </div>
            )}
            {me && (
              <SecondaryButton onClick={() => { if (!printBill(bill, me)) onPopupBlocked(); }}>
                Download invoice (PDF)
              </SecondaryButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── page ───────────────────────────────────────────────────────────────────

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const PatientPortal: React.FC = () => {
  const { logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = (PORTAL_NAV.find((v) => v.key === params.get('view'))?.key || 'home') as PortalView;
  const go = (v: PortalView) => {
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
  const totalDue = bills.data?.total_due ?? 0;

  const visitWhen = (a: PortalAppointment) =>
    `${fmtDate(a.appointment_date)}${a.has_time ? ` · ${fmtTime(a.appointment_date)}` : ''}`;

  const fullName = me.data ? `${me.data.first_name} ${me.data.last_name}` : '';

  return (
    <PortalShell
      view={view}
      onNavigate={go}
      onSignOut={logout}
      patientName={fullName || 'My account'}
      badges={{ results: recentResults.length || undefined, bills: totalDue > 0 ? bills.data!.bills.filter((b) => b.balance_due > 0).length : undefined }}
    >
      {popupBlocked && (
        <div className="mb-4 text-sm bg-warning-50 border border-warning-200 text-warning-800 rounded-xl p-3 flex justify-between gap-3">
          <span>Your browser blocked the download. Allow pop-ups for this site, then try again.</span>
          <button onClick={() => setPopupBlocked(false)} className="font-semibold underline">OK</button>
        </div>
      )}

      {view === 'home' && (
        <div className="space-y-5 lg:space-y-6">
          {/* Welcome banner */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 via-primary-500 to-secondary-500 text-white p-6 lg:p-8 shadow-lg">
            <div aria-hidden="true" className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10" />
            <div aria-hidden="true" className="absolute right-24 -bottom-24 w-56 h-56 rounded-full bg-white/10" />
            <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-white/85">{greeting()},</p>
                <h1 className="text-3xl lg:text-4xl font-bold mt-0.5 !text-white">{me.data?.first_name || 'Welcome'}</h1>
                {me.data?.patient_number && <p className="text-sm text-white/80 mt-1">Patient no. {me.data.patient_number}</p>}
              </div>
              <div className="rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 p-4 lg:min-w-[300px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Next visit</p>
                {visits.loading ? (
                  <div className="h-5 mt-2 bg-white/20 rounded animate-pulse w-2/3" />
                ) : nextVisit ? (
                  <>
                    <p className="text-lg font-bold mt-1">{visitWhen(nextVisit)}</p>
                    <p className="text-sm text-white/85">{[nextVisit.provider_name && `With ${nextVisit.provider_name}`, nextVisit.reason].filter(Boolean).join(' · ')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-semibold mt-1">No visit booked</p>
                    <div className="mt-3"><CallButton light label="Call to book" /></div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* At a glance */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <StatTile
              icon="results" tone="primary" label="Results" loading={labs.loading}
              value={labs.error ? '—' : recentResults.length ? `${recentResults.length} new` : releasedLabs.length ? `${releasedLabs.length} ready` : 'None yet'}
              hint={waitingResults ? `${waitingResults} with your doctor` : releasedLabs.length ? 'Up to date' : undefined}
              onClick={() => go('results')}
            />
            <StatTile
              icon="bills" tone={totalDue > 0 ? 'warning' : 'success'} label="Balance" loading={bills.loading}
              value={bills.error ? '—' : totalDue > 0 ? ghs(totalDue) : bills.data?.bills.length ? 'All paid' : 'No bills'}
              hint={totalDue > 0 ? 'Pay at the front desk' : bills.data?.bills.length ? 'Nothing owing' : undefined}
              onClick={() => go('bills')}
            />
            <StatTile
              icon="medicines" tone="secondary" label="Medicines" loading={meds.loading}
              value={meds.error ? '—' : currentMeds.length ? `${currentMeds.length} current` : 'None'}
              hint={currentMeds[0]?.medication_name}
              onClick={() => go('medicines')}
            />
            <StatTile
              icon="visits" tone="primary" label="Visits" loading={visits.loading}
              value={visits.error ? '—' : upcoming.length ? `${upcoming.length} upcoming` : 'None booked'}
              hint={pastVisits.length ? `${pastVisits.length} past visit${pastVisits.length > 1 ? 's' : ''}` : undefined}
              onClick={() => go('visits')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
            <Card title="Latest results" icon="results" className="lg:col-span-2" action={(labs.data?.length ?? 0) > 0 ? <LinkButton onClick={() => go('results')}>See all</LinkButton> : undefined}>
              <SectionState {...labs} what="results" />
              {!labs.loading && !labs.error && (labs.data?.length ? (
                <div className="space-y-3">
                  {labs.data.slice(0, 3).map((l) => <LabCard key={l.id} lab={l} me={me.data} onPopupBlocked={onPopupBlocked} />)}
                </div>
              ) : (
                <EmptyState icon="results" title="No results yet" text="When your doctor orders a test, you'll follow it here — from the lab to your doctor's review." />
              ))}
            </Card>

            <div className="space-y-5 lg:space-y-6">
              <Card title="Your medicines" icon="medicines" action={(meds.data?.length ?? 0) > 0 ? <LinkButton onClick={() => go('medicines')}>All</LinkButton> : undefined}>
                <SectionState {...meds} what="medicines" />
                {!meds.loading && !meds.error && (currentMeds.length ? (
                  <ul className="space-y-2.5">
                    {currentMeds.slice(0, 4).map((m) => (
                      <li key={m.id} className="flex items-start gap-3">
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-secondary-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{m.medication_name}</p>
                          <p className="text-xs text-text-secondary">{[m.dosage, m.frequency].filter(Boolean).join(' · ') || 'As directed'}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon="medicines" title="No current medicines" />
                ))}
              </Card>

              <section className="rounded-2xl bg-gradient-to-br from-secondary-50 to-primary-50 border border-secondary-100 p-5">
                <h3 className="font-semibold text-text-primary">Need help?</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Questions about results, bills or medicines? Our team is happy to help.
                </p>
                {branding.clinicAddress && <p className="text-xs text-text-secondary mt-2">{branding.clinicAddress}</p>}
                <div className="mt-4"><CallButton /></div>
                <p className="text-xs text-text-secondary mt-3">In an emergency, go to the nearest emergency room.</p>
              </section>
            </div>
          </div>
        </div>
      )}

      {view === 'results' && (
        <>
          <PageHeader title="Results" subtitle="Lab tests appear once your doctor has reviewed them, or after 3 days at the latest." />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
            <ListSection title="Lab tests" icon="results">
              <SectionState {...labs} what="lab results" />
              {!labs.loading && !labs.error && (labs.data?.length ? (
                <div className="space-y-3">
                  {labs.data.map((l) => <LabCard key={l.id} lab={l} me={me.data} onPopupBlocked={onPopupBlocked} />)}
                </div>
              ) : <Card><EmptyState icon="results" title="No lab tests yet" /></Card>)}
            </ListSection>
            <ListSection title="Scans and X-rays" icon="results">
              <SectionState {...imaging} what="scans" />
              {!imaging.loading && !imaging.error && (imaging.data?.length ? (
                <div className="space-y-3">{imaging.data.map((s) => <ImagingCard key={s.id} scan={s} />)}</div>
              ) : <Card><EmptyState icon="results" title="No scans or X-rays yet" /></Card>)}
            </ListSection>
          </div>
        </>
      )}

      {view === 'bills' && (
        <>
          <PageHeader title="Bills" subtitle="Every visit's bill, what your insurance or company covers, and what you've paid." />
          <SectionState {...bills} what="bills" />
          {!bills.loading && !bills.error && bills.data && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 items-start">
              <section className={`rounded-2xl p-5 text-white shadow-lg lg:order-2 ${totalDue > 0 ? 'bg-gradient-to-br from-warning-500 to-secondary-500' : 'bg-gradient-to-br from-success-500 to-primary-500'}`}>
                <p className="text-sm font-medium text-white/85">{totalDue > 0 ? 'You owe' : 'Balance'}</p>
                <p className="text-3xl font-bold mt-1">{totalDue > 0 ? ghs(totalDue) : 'All paid up'}</p>
                <p className="text-sm text-white/85 mt-2">
                  {totalDue > 0 ? 'Pay at the front desk on your next visit, or call us to arrange payment.' : 'Thank you — nothing is outstanding.'}
                </p>
                {totalDue > 0 && <div className="mt-4"><CallButton light /></div>}
              </section>
              <div className="lg:col-span-2 lg:order-1">
                {bills.data.bills.length ? (
                  <div className="space-y-3">
                    {bills.data.bills.map((b) => <BillCard key={b.id} bill={b} me={me.data} onPopupBlocked={onPopupBlocked} />)}
                  </div>
                ) : (
                  <Card><EmptyState icon="bills" title="No bills yet" /></Card>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {view === 'medicines' && (
        <>
          <PageHeader title="Medicines" subtitle="What you're taking now, and what you've had before." />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
            <Card title="Current" icon="medicines">
              <SectionState {...meds} what="medicines" />
              {!meds.loading && !meds.error && (currentMeds.length ? (
                <ul className="space-y-3">
                  {currentMeds.map((m) => (
                    <li key={m.id} className="rounded-xl bg-gray-50 p-3">
                      <p className="font-semibold text-text-primary">{m.medication_name}</p>
                      <p className="text-sm text-text-secondary">{[m.dosage, m.frequency, m.route].filter(Boolean).join(' · ') || 'As directed'}</p>
                      <p className="text-xs text-text-secondary mt-1">
                        {[m.prescribed_by && `Prescribed by ${m.prescribed_by}`, m.end_date && `Until ${fmtDate(m.end_date)}`].filter(Boolean).join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon="medicines" title="No current medicines" />)}
              {!meds.loading && !meds.error && currentMeds.length > 0 && (
                <p className="text-xs text-text-secondary mt-4">Running low? Call the clinic or visit our pharmacy for a refill.</p>
              )}
            </Card>
            <Card title="Past" icon="medicines">
              {!meds.loading && !meds.error && (pastMeds.length ? (
                <ul className="divide-y divide-gray-100">
                  {pastMeds.map((m) => (
                    <li key={m.id} className="py-2.5">
                      <p className="text-sm font-medium text-text-primary">{m.medication_name}</p>
                      <p className="text-xs text-text-secondary">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}{m.start_date ? ` · from ${fmtDate(m.start_date)}` : ''}</p>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon="medicines" title="Nothing here yet" />)}
            </Card>
          </div>
        </>
      )}

      {view === 'visits' && (
        <>
          <PageHeader title="Visits" subtitle="Your upcoming appointments and the visits you've had with us." />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
            <Card title="Upcoming" icon="visits">
              <SectionState {...visits} what="visits" />
              {!visits.loading && !visits.error && (upcoming.length ? (
                <ul className="space-y-3">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 rounded-xl bg-primary-50/60 p-3">
                      <span className="w-12 h-12 rounded-xl bg-white text-primary-600 flex flex-col items-center justify-center shadow-sm shrink-0">
                        <span className="text-[10px] font-semibold uppercase leading-none">{new Date(a.appointment_date).toLocaleDateString('en-GB', { month: 'short' })}</span>
                        <span className="text-lg font-bold leading-none mt-0.5">{new Date(a.appointment_date).getDate()}</span>
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-text-primary">{visitWhen(a)}</p>
                        <p className="text-sm text-text-secondary truncate">{[a.provider_name && `With ${a.provider_name}`, a.reason].filter(Boolean).join(' · ')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="visits" title="No visits booked" text="Call us and we'll find a time that suits you." action={<CallButton label="Call to book" />} />
              ))}
            </Card>
            <Card title="Past visits" icon="visits">
              {!visits.loading && !visits.error && (pastVisits.length ? (
                <ul className="divide-y divide-gray-100">
                  {pastVisits.map((a) => {
                    const st = VISIT_STATUS[a.status] || { text: a.status, cls: 'bg-gray-100 text-gray-700' };
                    return (
                      <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary">{fmtDate(a.appointment_date)}</p>
                          <p className="text-xs text-text-secondary truncate">{[a.provider_name, a.reason].filter(Boolean).join(' · ')}</p>
                        </div>
                        <Chip className={st.cls}>{st.text}</Chip>
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyState icon="visits" title="No past visits" />)}
            </Card>
          </div>
        </>
      )}
    </PortalShell>
  );
};

export default PatientPortal;
