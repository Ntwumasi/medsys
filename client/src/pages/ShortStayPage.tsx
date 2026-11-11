import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNowStrict, parseISO, isValid } from 'date-fns';
import AppLayout from '../components/AppLayout';
import { Modal } from '../components/ui';
import HomeVisitVitalsForm from '../components/HomeVisitVitalsForm';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { getApiError } from '../utils/apiError';
import { dobAndAge } from '../utils/age';

/**
 * Short Stay Unit — the bed board.
 * Every bed at a glance: who's in it, allergies, how long they've been in,
 * when obs are next due (overdue in red). Admit, record obs, log medicines /
 * drips / notes / handovers, move bed, discharge. Past stays underneath.
 */

interface Allergy { allergen: string; reaction?: string | null; severity?: string | null }
interface LastObs {
  recorded_at: string; temperature: string | null; temperature_unit: string | null;
  blood_pressure_systolic: number | null; blood_pressure_diastolic: number | null;
  heart_rate: number | null; respiratory_rate: number | null; oxygen_saturation: number | null;
}
interface Stay {
  id: number; bed_id: number; bed_name: string; patient_id: number; encounter_id: number | null;
  patient_name: string; patient_number: string | null; patient_date_of_birth: string | null; gender: string | null;
  reason: string | null; doctor_id: number | null; doctor_name: string | null; admitted_by_name: string | null;
  admitted_at: string; obs_interval_minutes: number; obs_next_due: string | null; obs_overdue: boolean;
  last_obs_at: string | null; hours_in_bed: number; status: 'admitted' | 'discharged';
  discharged_at: string | null; discharged_by_name: string | null; discharge_condition: string | null;
  discharge_note: string | null; follow_up: string | null; billed_units: number; encounter_number: string | null;
  allergies?: Allergy[]; last_obs?: LastObs | null;
}
interface Bed { id: number; bed_number: string; bed_name: string; is_available: boolean; stay: Stay | null }
interface QueuePatient { id: number; patient_id: number; patient_name: string; patient_number?: string; date_of_birth?: string; status?: string; workflow_status?: string }
interface Doctor { id: number; first_name: string; last_name: string }
interface Entry { id: number; kind: string; detail: string; recorded_at: string; recorded_by_name: string | null }
interface ObsRow extends LastObs { id: number; pain_level: number | null; recorded_by_name: string | null }

const inputClass =
  'w-full min-h-ds-control px-3 py-2 border border-ds-border-control rounded-lg bg-ds-surface text-ds-text focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent';
const labelClass = 'block text-xs font-medium text-ds-text-secondary mb-1';
const btn = 'min-h-ds-touch px-3 rounded-lg border border-ds-border-control text-sm text-ds-text-secondary hover:bg-ds-subtle disabled:opacity-50';
const primaryBtn = 'min-h-ds-touch px-4 rounded-lg bg-ds-accent text-ds-on-accent text-sm font-medium hover:bg-ds-accent-hover disabled:opacity-50';

const INTERVALS = [15, 30, 60, 120, 240, 480];
const intervalLabel = (m: number) => (m < 60 ? `every ${m} min` : m === 60 ? 'hourly' : `every ${m / 60} h`);
const CONDITIONS: { value: string; label: string }[] = [
  { value: 'improved', label: 'Improved — home' },
  { value: 'stable', label: 'Stable — home' },
  { value: 'referred', label: 'Referred / transferred out' },
  { value: 'against_advice', label: 'Left against medical advice' },
  { value: 'deceased', label: 'Deceased' },
  { value: 'other', label: 'Other' },
];
const ENTRY_LABEL: Record<string, string> = {
  medication: 'Medicine given', fluid: 'Drip / fluids', note: 'Nursing note', handover: 'Handover', transfer: 'Bed move',
};

const when = (iso: string | null | undefined, f = 'd MMM, h:mm a') => {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, f) : '';
};
const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? formatDistanceToNowStrict(d) : '';
};
/** Time in bed: neutral under 12 h, amber 12–24 h, red past 24 h (a second short stay day). */
const timeTone = (h: number) =>
  h >= 24 ? 'bg-ds-critical-soft text-ds-critical-text border-ds-critical-border'
  : h >= 12 ? 'bg-ds-warning-soft text-ds-warning-text border-ds-warning-soft'
  : 'bg-ds-subtle text-ds-text-secondary border-ds-border';
const hoursLabel = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.floor(h)} h ${Math.round((h % 1) * 60)} m` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`);
const obsSummary = (o: LastObs | null | undefined) => {
  if (!o) return null;
  const parts = [
    o.temperature ? `T ${o.temperature}°${o.temperature_unit || ''}` : null,
    o.blood_pressure_systolic ? `BP ${o.blood_pressure_systolic}/${o.blood_pressure_diastolic ?? '–'}` : null,
    o.heart_rate ? `P ${o.heart_rate}` : null,
    o.respiratory_rate ? `RR ${o.respiratory_rate}` : null,
    o.oxygen_saturation ? `SpO₂ ${o.oxygen_saturation}%` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

type Dialog =
  | null
  | { kind: 'admit'; bed: Bed }
  | { kind: 'obs' | 'entry' | 'move' | 'discharge' | 'chart' | 'edit'; stay: Stay };

const ShortStayPage: React.FC = () => {
  const { user, activeRole } = useAuth();
  const role = user?.is_super_admin && activeRole ? activeRole : user?.role;
  const isAdmin = role === 'admin' || role === 'office_manager' || !!user?.is_super_admin;
  const { showToast } = useNotification();
  const [beds, setBeds] = useState<Bed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [history, setHistory] = useState<Stay[] | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/short-stay/beds');
      setBeds(res.data.beds || []);
      setError(null);
    } catch (e) {
      setError(getApiError(e, "Couldn't load the beds"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiClient.get('/short-stay/history');
      setHistory(res.data.stays || []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => { load(); loadHistory(); }, [load, loadHistory]);
  // Refresh every minute so "obs overdue" and time-in-bed stay true.
  useEffect(() => {
    const t = setInterval(() => { load(); setTick((n) => n + 1); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const occupied = beds.filter((b) => b.stay);
  const overdue = occupied.filter((b) => b.stay?.obs_overdue).length;
  const freeBeds = beds.filter((b) => !b.stay);
  const close = () => setDialog(null);
  const done = () => { close(); load(); loadHistory(); };

  return (
    <AppLayout title="Short Stay Unit">
      <div className="space-y-6">
        <section className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ds-text">Short Stay Unit</h1>
            <p className="text-sm text-ds-text-muted">
              {occupied.length} of {beds.length} beds in use · {freeBeds.length} free
              {overdue > 0 && <span className="ml-2 font-semibold text-ds-critical-text">· {overdue} obs overdue</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button className={btn} onClick={() => { load(); loadHistory(); }}>Refresh</button>
            {isAdmin && <AddBedButton onAdded={load} />}
          </div>
        </section>

        {error ? (
          <div className="p-4 rounded-ds-card border border-ds-critical-border bg-ds-critical-soft text-sm text-ds-critical-text">
            {error} <button onClick={load} className="ml-2 underline min-h-ds-control">Try again</button>
          </div>
        ) : loading ? (
          <p className="text-sm text-ds-text-muted">Loading beds…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {beds.map((b) => (
              <BedCard key={b.id} bed={b} onAction={setDialog} />
            ))}
          </div>
        )}

        <section className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
          <div className="px-4 py-3 border-b border-ds-border">
            <h2 className="text-base font-semibold text-ds-text">Past stays</h2>
            <p className="text-xs text-ds-text-muted">Discharged in the last 30 days</p>
          </div>
          {history === null ? (
            <p className="p-4 text-sm text-ds-text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="p-4 text-sm text-ds-text-muted">No discharges in the last 30 days.</p>
          ) : (
            <ul className="divide-y divide-ds-border">
              {history.map((s) => (
                <li key={s.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ds-text">
                      {s.patient_name}
                      <span className="ml-2 text-xs font-normal text-ds-text-muted">{[s.patient_number, dobAndAge(s.patient_date_of_birth)].filter(Boolean).join(' · ')}</span>
                    </p>
                    <p className="text-xs text-ds-text-muted">
                      {s.bed_name} · {when(s.admitted_at)} → {when(s.discharged_at)} ({hoursLabel(s.hours_in_bed)})
                      {s.discharge_condition ? ` · ${CONDITIONS.find((c) => c.value === s.discharge_condition)?.label || s.discharge_condition}` : ''}
                      {s.discharged_by_name ? ` · by ${s.discharged_by_name}` : ''}
                    </p>
                    {s.reason && <p className="text-xs text-ds-text-secondary break-words">{s.reason}</p>}
                  </div>
                  <button className={btn} onClick={() => setDialog({ kind: 'chart', stay: s })}>View stay</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {dialog?.kind === 'admit' && <AdmitDialog bed={dialog.bed} onClose={close} onDone={done} />}
      {dialog?.kind === 'obs' && (
        <Modal isOpen onClose={close} title="Record obs" size="lg">
          <PatientStrip stay={dialog.stay} />
          {dialog.stay.encounter_id ? (
            <HomeVisitVitalsForm
              encounterId={dialog.stay.encounter_id}
              patientName={dialog.stay.patient_name}
              onSaved={() => { showToast(`Obs saved for ${dialog.stay.patient_name}`, 'success'); done(); }}
            />
          ) : (
            <p className="text-sm text-ds-critical-text">This stay has no visit attached, so obs can't be recorded here.</p>
          )}
        </Modal>
      )}
      {dialog?.kind === 'entry' && <EntryDialog stay={dialog.stay} onClose={close} onDone={done} />}
      {dialog?.kind === 'move' && <MoveDialog stay={dialog.stay} freeBeds={freeBeds} onClose={close} onDone={done} />}
      {dialog?.kind === 'discharge' && <DischargeDialog stay={dialog.stay} onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && <EditDialog stay={dialog.stay} onClose={close} onDone={done} />}
      {dialog?.kind === 'chart' && <StayChart stayId={dialog.stay.id} onClose={close} />}
    </AppLayout>
  );
};

/** Name, number, age and allergies — on every dialog that acts on the patient. */
const PatientStrip: React.FC<{ stay: Stay }> = ({ stay }) => (
  <div className="mb-4 p-3 rounded-lg bg-ds-subtle border border-ds-border">
    <p className="text-sm font-semibold text-ds-text">{stay.patient_name}</p>
    <p className="text-xs text-ds-text-muted">
      {[stay.patient_number, dobAndAge(stay.patient_date_of_birth), stay.gender, stay.bed_name].filter(Boolean).join(' · ')}
    </p>
    {stay.allergies && <AllergyLine allergies={stay.allergies} />}
  </div>
);

const AllergyLine: React.FC<{ allergies: Allergy[] }> = ({ allergies }) =>
  allergies.length > 0 ? (
    <p className="mt-2 px-2 py-1 rounded-md border border-ds-critical-border bg-ds-critical-soft text-xs font-semibold text-ds-critical-text">
      ⚠ Allergies: {allergies.map((a) => a.allergen + (a.reaction ? ` (${a.reaction})` : '')).join(', ')}
    </p>
  ) : (
    <p className="mt-2 text-xs text-ds-text-muted">No known allergies recorded</p>
  );

const BedCard: React.FC<{ bed: Bed; onAction: (d: Dialog) => void }> = ({ bed, onAction }) => {
  const s = bed.stay;
  if (!s) {
    return (
      <article className="bg-ds-surface rounded-ds-card shadow-ds-card border border-dashed border-ds-border-control p-4 flex flex-col justify-between min-h-[180px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ds-text-muted">{bed.bed_name}</p>
          <p className="mt-2 text-sm text-ds-success-text font-medium">Free</p>
        </div>
        <button className={`${primaryBtn} mt-4 self-start`} onClick={() => onAction({ kind: 'admit', bed })}>Admit a patient</button>
      </article>
    );
  }
  const obs = obsSummary(s.last_obs);
  return (
    <article className={`bg-ds-surface rounded-ds-card shadow-ds-card border p-4 ${s.obs_overdue ? 'border-ds-critical-border' : 'border-ds-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ds-text-muted">{bed.bed_name}</p>
        <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums ${timeTone(s.hours_in_bed)}`} title={`Admitted ${when(s.admitted_at)}`}>
          {hoursLabel(s.hours_in_bed)} in bed
        </span>
      </div>
      <p className="mt-1 text-base font-semibold text-ds-text">{s.patient_name}</p>
      <p className="text-xs text-ds-text-muted">{[s.patient_number, dobAndAge(s.patient_date_of_birth), s.gender].filter(Boolean).join(' · ')}</p>
      {s.allergies && <AllergyLine allergies={s.allergies} />}
      {s.reason && <p className="mt-2 text-sm text-ds-text-secondary break-words">{s.reason}</p>}
      <p className="mt-1 text-xs text-ds-text-muted">
        {s.doctor_name ? `Dr ${s.doctor_name}` : 'No doctor set'} · admitted {when(s.admitted_at)}{s.admitted_by_name ? ` by ${s.admitted_by_name}` : ''}
      </p>

      <div className={`mt-3 p-2 rounded-lg border text-sm ${s.obs_overdue ? 'bg-ds-critical-soft border-ds-critical-border text-ds-critical-text' : 'bg-ds-subtle border-ds-border text-ds-text-secondary'}`}>
        <p className="font-medium">
          {s.obs_overdue ? `Obs overdue by ${ago(s.obs_next_due)}` : `Next obs in ${ago(s.obs_next_due)}`}
          <span className="font-normal text-xs"> · {intervalLabel(s.obs_interval_minutes)}</span>
        </p>
        <p className="text-xs mt-0.5">
          {obs ? <>Last {ago(s.last_obs_at)} ago: {obs}</> : 'No obs recorded since admission'}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className={primaryBtn} onClick={() => onAction({ kind: 'obs', stay: s })}>Record obs</button>
        <button className={btn} onClick={() => onAction({ kind: 'entry', stay: s })}>Med / drip / note</button>
        <button className={btn} onClick={() => onAction({ kind: 'chart', stay: s })}>Stay chart</button>
        <button className={btn} onClick={() => onAction({ kind: 'edit', stay: s })}>Edit</button>
        <button className={btn} onClick={() => onAction({ kind: 'move', stay: s })}>Move bed</button>
        <button className={`${btn} font-medium text-ds-text`} onClick={() => onAction({ kind: 'discharge', stay: s })}>Discharge</button>
      </div>
    </article>
  );
};

const AdmitDialog: React.FC<{ bed: Bed; onClose: () => void; onDone: () => void }> = ({ bed, onClose, onDone }) => {
  const { showToast } = useNotification();
  const [queue, setQueue] = useState<QueuePatient[] | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<QueuePatient | null>(null);
  const [reason, setReason] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [interval, setInterval_] = useState(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/workflow/queue').then((r) => setQueue(r.data.queue || [])).catch(() => setQueue([]));
    apiClient.get('/users/doctors').then((r) => setDoctors(r.data.doctors || [])).catch(() => setDoctors([]));
  }, []);

  const candidates = useMemo(() => {
    // Doctor-finished visits stay eligible (that's usually when a short stay is
    // ordered); only patients who have already left are hidden.
    const open = (queue || []).filter((q) => !['discharged', 'checked_out', 'cancelled'].includes(String(q.status)));
    const t = search.trim().toLowerCase();
    return t ? open.filter((q) => `${q.patient_name} ${q.patient_number || ''}`.toLowerCase().includes(t)) : open;
  }, [queue, search]);

  const submit = async () => {
    if (!picked) { showToast('Pick the patient', 'warning'); return; }
    setSaving(true);
    try {
      await apiClient.post('/short-stay/assign', {
        bed_id: bed.id, encounter_id: picked.id, patient_id: picked.patient_id,
        reason, doctor_id: doctorId ? Number(doctorId) : undefined, obs_interval_minutes: interval,
      });
      showToast(`${picked.patient_name} admitted to ${bed.bed_name}`, 'success');
      onDone();
    } catch (e) {
      showToast(getApiError(e, 'Could not admit'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen onClose={onClose} title={`Admit to ${bed.bed_name}`} size="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
          <button className={`${btn} flex-1`} onClick={onClose}>Cancel</button>
          <button className={`${primaryBtn} flex-1`} disabled={saving || !picked} onClick={submit}>{saving ? 'Admitting…' : 'Admit'}</button>
        </div>
      }
    >
      <div className="space-y-4">
        {picked ? (
          <div className="p-3 rounded-lg bg-ds-subtle border border-ds-border flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ds-text">{picked.patient_name}</p>
              <p className="text-xs text-ds-text-muted">{[picked.patient_number, dobAndAge(picked.date_of_birth)].filter(Boolean).join(' · ')}</p>
            </div>
            <button className={btn} onClick={() => setPicked(null)}>Change</button>
          </div>
        ) : (
          <div>
            <label htmlFor="ss-search" className={labelClass}>Patient (in clinic today)</label>
            <input id="ss-search" value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} placeholder="Name or patient number" autoFocus />
            <ul className="mt-2 max-h-60 overflow-y-auto border border-ds-border rounded-lg divide-y divide-ds-border">
              {queue === null ? (
                <li className="p-3 text-sm text-ds-text-muted">Loading today's patients…</li>
              ) : candidates.length === 0 ? (
                <li className="p-3 text-sm text-ds-text-muted">No checked-in patient matches. Patients must be checked in today.</li>
              ) : candidates.slice(0, 30).map((q) => (
                <li key={q.id}>
                  <button className="w-full min-h-ds-touch px-3 py-2 text-left hover:bg-ds-subtle" onClick={() => setPicked(q)}>
                    <span className="text-sm font-medium text-ds-text">{q.patient_name}</span>
                    <span className="ml-2 text-xs text-ds-text-muted">{[q.patient_number, dobAndAge(q.date_of_birth)].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <label htmlFor="ss-reason" className={labelClass}>Reason for short stay</label>
          <textarea id="ss-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} resize-none`} placeholder="e.g. IV fluids for dehydration, observation after procedure" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ss-doctor" className={labelClass}>Doctor in charge</label>
            <select id="ss-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputClass}>
              <option value="">The visit's doctor</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.first_name} {d.last_name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ss-interval" className={labelClass}>Obs</label>
            <select id="ss-interval" value={interval} onChange={(e) => setInterval_(Number(e.target.value))} className={inputClass}>
              {INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-ds-text-muted">The SHORT STAY charge is added to the visit bill automatically: one day now, plus one for each further started 24 hours at discharge. Don't add it by hand.</p>
      </div>
    </Modal>
  );
};

const EntryDialog: React.FC<{ stay: Stay; onClose: () => void; onDone: () => void }> = ({ stay, onClose, onDone }) => {
  const { showToast } = useNotification();
  const [kind, setKind] = useState<'medication' | 'fluid' | 'note' | 'handover'>('medication');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const placeholder: Record<string, string> = {
    medication: 'e.g. IV paracetamol 1 g at 14:10',
    fluid: 'e.g. Normal saline 1 L started, 8 h rate',
    note: 'What you observed or did',
    handover: 'For the next nurse: status, what is pending, what to watch',
  };
  const submit = async () => {
    if (!detail.trim()) { showToast('Write what was given or noted', 'warning'); return; }
    setSaving(true);
    try {
      await apiClient.post(`/short-stay/stays/${stay.id}/entries`, { kind, detail });
      showToast(`${ENTRY_LABEL[kind]} saved for ${stay.patient_name}`, 'success');
      onDone();
    } catch (e) {
      showToast(getApiError(e, 'Could not save'), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      isOpen onClose={onClose} title="Add to the stay chart" size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
          <button className={`${btn} flex-1`} onClick={onClose}>Cancel</button>
          <button className={`${primaryBtn} flex-1`} disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      }
    >
      <PatientStrip stay={stay} />
      <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="What are you recording">
        {(['medication', 'fluid', 'note', 'handover'] as const).map((k) => (
          <button
            key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`min-h-ds-touch px-3 rounded-lg border text-sm font-medium ${kind === k ? 'bg-ds-accent-soft border-ds-accent text-ds-accent-text' : 'border-ds-border-control text-ds-text-secondary hover:bg-ds-subtle'}`}
          >
            {ENTRY_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea aria-label="Details" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} className={`${inputClass} resize-none`} placeholder={placeholder[kind]} />
    </Modal>
  );
};

const MoveDialog: React.FC<{ stay: Stay; freeBeds: Bed[]; onClose: () => void; onDone: () => void }> = ({ stay, freeBeds, onClose, onDone }) => {
  const { showToast } = useNotification();
  const [busy, setBusy] = useState(false);
  const move = async (bed: Bed) => {
    setBusy(true);
    try {
      await apiClient.post(`/short-stay/stays/${stay.id}/transfer`, { bed_id: bed.id });
      showToast(`${stay.patient_name} moved to ${bed.bed_name}`, 'success');
      onDone();
    } catch (e) {
      showToast(getApiError(e, 'Could not move the patient'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title="Move to another bed" size="sm">
      <PatientStrip stay={stay} />
      {freeBeds.length === 0 ? (
        <p className="text-sm text-ds-text-muted">No free beds right now.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {freeBeds.map((b) => <button key={b.id} className={primaryBtn} disabled={busy} onClick={() => move(b)}>{b.bed_name}</button>)}
        </div>
      )}
    </Modal>
  );
};

const EditDialog: React.FC<{ stay: Stay; onClose: () => void; onDone: () => void }> = ({ stay, onClose, onDone }) => {
  const { showToast } = useNotification();
  const [reason, setReason] = useState(stay.reason || '');
  const [interval, setInterval_] = useState(stay.obs_interval_minutes);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/short-stay/stays/${stay.id}`, { reason, obs_interval_minutes: interval });
      showToast(`Stay updated for ${stay.patient_name}`, 'success');
      onDone();
    } catch (e) {
      showToast(getApiError(e, 'Could not update'), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      isOpen onClose={onClose} title="Edit stay" size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
          <button className={`${btn} flex-1`} onClick={onClose}>Cancel</button>
          <button className={`${primaryBtn} flex-1`} disabled={saving} onClick={submit}>Save</button>
        </div>
      }
    >
      <PatientStrip stay={stay} />
      <label htmlFor="ss-edit-reason" className={labelClass}>Reason</label>
      <textarea id="ss-edit-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} resize-none mb-3`} />
      <label htmlFor="ss-edit-interval" className={labelClass}>Obs</label>
      <select id="ss-edit-interval" value={interval} onChange={(e) => setInterval_(Number(e.target.value))} className={inputClass}>
        {INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
      </select>
    </Modal>
  );
};

const DischargeDialog: React.FC<{ stay: Stay; onClose: () => void; onDone: () => void }> = ({ stay, onClose, onDone }) => {
  const { showToast } = useNotification();
  const [condition, setCondition] = useState('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);
  const days = Math.max(1, Math.ceil(stay.hours_in_bed / 24));
  const submit = async () => {
    if (!condition) { showToast('Choose the condition at discharge', 'warning'); return; }
    setSaving(true);
    try {
      await apiClient.post(`/short-stay/stays/${stay.id}/discharge`, { condition, note, follow_up: followUp });
      showToast(`${stay.patient_name} discharged from ${stay.bed_name}`, 'success');
      onDone();
    } catch (e) {
      showToast(getApiError(e, 'Could not discharge'), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      isOpen onClose={onClose} title="Discharge from short stay" size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
          <button className={`${btn} flex-1`} onClick={onClose}>Cancel</button>
          <button className={`${primaryBtn} flex-1`} disabled={saving || !condition} onClick={submit}>{saving ? 'Discharging…' : 'Discharge'}</button>
        </div>
      }
    >
      <PatientStrip stay={stay} />
      <div className="space-y-3">
        <div>
          <label htmlFor="ss-cond" className={labelClass}>Condition at discharge</label>
          <select id="ss-cond" value={condition} onChange={(e) => setCondition(e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ss-note" className={labelClass}>Discharge note</label>
          <textarea id="ss-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} resize-none`} placeholder="Summary of the stay and state on leaving" />
        </div>
        <div>
          <label htmlFor="ss-fu" className={labelClass}>Follow-up / instructions</label>
          <textarea id="ss-fu" rows={2} value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={`${inputClass} resize-none`} />
        </div>
        <p className="text-xs text-ds-text-muted">
          {hoursLabel(stay.hours_in_bed)} in bed — SHORT STAY for {days} day{days > 1 ? 's' : ''} goes on the visit bill automatically.
        </p>
      </div>
    </Modal>
  );
};

const StayChart: React.FC<{ stayId: number; onClose: () => void }> = ({ stayId, onClose }) => {
  const [data, setData] = useState<{ stay: Stay; obs: ObsRow[]; entries: Entry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const forId = useRef(stayId);
  useEffect(() => {
    forId.current = stayId;
    setData(null);
    apiClient.get(`/short-stay/stays/${stayId}`)
      .then((r) => { if (forId.current === stayId) setData(r.data); })
      .catch((e) => { if (forId.current === stayId) setError(getApiError(e, "Couldn't load the stay")); });
  }, [stayId]);
  return (
    <Modal isOpen onClose={onClose} title="Stay chart" size="xl">
      {error ? <p className="text-sm text-ds-critical-text">{error}</p> : !data ? <p className="text-sm text-ds-text-muted">Loading…</p> : (
        <div className="space-y-4">
          <PatientStrip stay={data.stay} />
          <p className="text-sm text-ds-text-secondary">
            {data.stay.bed_name} · admitted {when(data.stay.admitted_at)}{data.stay.admitted_by_name ? ` by ${data.stay.admitted_by_name}` : ''}
            {data.stay.doctor_name ? ` · Dr ${data.stay.doctor_name}` : ''}
            {data.stay.discharged_at ? ` · discharged ${when(data.stay.discharged_at)}` : ''}
          </p>
          {data.stay.reason && <p className="text-sm text-ds-text break-words">{data.stay.reason}</p>}
          {data.stay.discharge_note && (
            <div className="p-3 rounded-lg border border-ds-border">
              <p className="text-xs font-semibold text-ds-text-muted uppercase">Discharge</p>
              <p className="text-sm text-ds-text break-words">{data.stay.discharge_note}</p>
              {data.stay.follow_up && <p className="text-sm text-ds-text-secondary mt-1 break-words">Follow-up: {data.stay.follow_up}</p>}
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-ds-text mb-2">Observations ({data.obs.length})</h3>
            {data.obs.length === 0 ? <p className="text-sm text-ds-text-muted">None recorded during this stay.</p> : (
              <div className="overflow-x-auto border border-ds-border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-ds-subtle text-ds-text-muted text-xs">
                    <tr>{['Time', 'Temp', 'BP', 'Pulse', 'RR', 'SpO₂', 'Pain', 'By'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-ds-border">
                    {data.obs.map((o) => (
                      <tr key={o.id} className="text-ds-text">
                        <td className="px-3 py-2 whitespace-nowrap">{when(o.recorded_at, 'd MMM HH:mm')}</td>
                        <td className="px-3 py-2">{o.temperature ? `${o.temperature}°${o.temperature_unit || ''}` : '–'}</td>
                        <td className="px-3 py-2">{o.blood_pressure_systolic ? `${o.blood_pressure_systolic}/${o.blood_pressure_diastolic ?? '–'}` : '–'}</td>
                        <td className="px-3 py-2">{o.heart_rate ?? '–'}</td>
                        <td className="px-3 py-2">{o.respiratory_rate ?? '–'}</td>
                        <td className="px-3 py-2">{o.oxygen_saturation != null ? `${o.oxygen_saturation}%` : '–'}</td>
                        <td className="px-3 py-2">{o.pain_level ?? '–'}</td>
                        <td className="px-3 py-2 text-ds-text-muted whitespace-nowrap">{o.recorded_by_name || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ds-text mb-2">Medicines, drips, notes and handovers ({data.entries.length})</h3>
            {data.entries.length === 0 ? <p className="text-sm text-ds-text-muted">Nothing logged yet.</p> : (
              <ol className="space-y-2">
                {data.entries.map((e) => (
                  <li key={e.id} className="p-2 rounded-lg border border-ds-border">
                    <p className="text-xs text-ds-text-muted">
                      <span className="font-semibold text-ds-text">{ENTRY_LABEL[e.kind] || e.kind}</span> · {when(e.recorded_at)}{e.recorded_by_name ? ` · ${e.recorded_by_name}` : ''}
                    </p>
                    <p className="text-sm text-ds-text whitespace-pre-wrap break-words">{e.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

const AddBedButton: React.FC<{ onAdded: () => void }> = ({ onAdded }) => {
  const { showToast } = useNotification();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const save = async () => {
    try {
      await apiClient.post('/short-stay/beds', { bed_name: name });
      showToast(`${name} added`, 'success');
      setOpen(false);
      setName('');
      onAdded();
    } catch (e) {
      showToast(getApiError(e, 'Could not add the bed'), 'error');
    }
  };
  return (
    <>
      <button className={btn} onClick={() => setOpen(true)}>Add bed</button>
      {open && (
        <Modal
          isOpen onClose={() => setOpen(false)} title="Add a short-stay bed" size="sm"
          footer={<button className={`${primaryBtn} w-full`} disabled={!name.trim()} onClick={save}>Add bed</button>}
        >
          <label htmlFor="ss-bed-name" className={labelClass}>Bed name</label>
          <input id="ss-bed-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Bed 3" />
        </Modal>
      )}
    </>
  );
};

export default ShortStayPage;
