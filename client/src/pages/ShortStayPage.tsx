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
import { obsFlags } from '../utils/obsFlags';
import type { ObsKey } from '../utils/obsFlags';
import { useDialog } from '../context/DialogContext';

/**
 * Short Stay Unit — the bed board.
 * Every bed at a glance: who's in it, allergies, how long they've been in,
 * when obs are next due (overdue in red). Admit, record obs, log medicines /
 * drips / notes / handovers, move bed, discharge. Past stays underneath.
 * Doctors land on their rounds list: their patients, obs outside range,
 * results to review, unsigned notes; the stay chart holds the treatment plan
 * and the doctor's progress / procedure notes and discharge summary.
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
  treatment_plan?: string | null; plan_updated_at?: string | null; plan_updated_by_name?: string | null;
  unreviewed_results?: number; unsigned_notes?: number;
}
interface StayLab {
  id: number; test_name: string; status: string; priority: string; ordered_at: string; result_date: string | null;
  result: string | null; verification_status: string | null; doctor_reviewed_at: string | null;
  doctor_reviewed_by_name: string | null; can_review: boolean;
}
interface StayMedicine {
  id: number; medication_name: string; dosage: string | null; frequency: string | null; route: string | null;
  quantity: number | null; status: string; ordered_date: string; prescriber_name: string | null;
}
type NoteType = 'progress' | 'procedure' | 'discharge';
interface DoctorNote {
  id: number; note_type: NoteType; title: string | null; subjective: string | null; examination: string | null;
  assessment_plan: string | null; status: 'draft' | 'signed'; author_id: number; author_name: string | null;
  created_at: string; updated_at: string; signed_at: string | null;
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
const obsParts = (o: LastObs | null | undefined): { key: ObsKey; text: string; high: boolean }[] => {
  if (!o) return [];
  const flags = obsFlags(o);
  const parts: { key: ObsKey; text: string | null }[] = [
    { key: 'temperature', text: o.temperature ? `T ${o.temperature}°${o.temperature_unit || ''}` : null },
    { key: 'bp', text: o.blood_pressure_systolic ? `BP ${o.blood_pressure_systolic}/${o.blood_pressure_diastolic ?? '–'}` : null },
    { key: 'heart_rate', text: o.heart_rate ? `P ${o.heart_rate}` : null },
    { key: 'respiratory_rate', text: o.respiratory_rate ? `RR ${o.respiratory_rate}` : null },
    { key: 'oxygen_saturation', text: o.oxygen_saturation ? `SpO₂ ${o.oxygen_saturation}%` : null },
  ];
  return parts.filter((p): p is { key: ObsKey; text: string } => !!p.text).map((p) => ({ ...p, high: flags.has(p.key) }));
};
/** Last obs with out-of-range values marked (danger tokens + "!" so it isn't colour alone). */
const ObsLine: React.FC<{ obs: LastObs | null | undefined }> = ({ obs }) => {
  const parts = obsParts(obs);
  if (!parts.length) return null;
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={p.key}>
          {i > 0 && ' · '}
          {p.high
            ? <span className="px-1 rounded bg-ds-critical-soft text-ds-critical-text font-semibold" title="Outside the usual range">{p.text}!</span>
            : p.text}
        </React.Fragment>
      ))}
    </>
  );
};
const NOTE_LABEL: Record<NoteType, string> = { progress: 'Progress note', procedure: 'Procedure note', discharge: 'Discharge summary' };
/** Section labels per note type (stored as title / subjective / examination / assessment_plan). */
const NOTE_FIELDS: Record<NoteType, { title?: string; subjective: string; examination: string; assessment_plan: string; hints: [string, string, string] }> = {
  progress: {
    subjective: 'Subjective', examination: 'Examination & results', assessment_plan: 'Assessment & plan',
    hints: ['How the patient feels, new complaints, overnight events', 'Findings on exam; obs and results reviewed', 'Impression and what happens next'],
  },
  procedure: {
    title: 'Procedure', subjective: 'Indication & consent', examination: 'Technique, findings, complications', assessment_plan: 'Plan after the procedure',
    hints: ['Why it was done; consent obtained from whom', 'What was done, what was found, any complications', 'Monitoring, medicines, when to review'],
  },
  discharge: {
    subjective: 'Summary of the stay', examination: 'Condition at discharge', assessment_plan: 'Medicines & follow-up',
    hints: ['Why admitted, what was given, how the patient responded', 'State on leaving, last obs', 'Medicines to continue, follow-up date, when to return'],
  },
};

type Dialog =
  | null
  | { kind: 'admit'; bed: Bed }
  | { kind: 'obs' | 'entry' | 'move' | 'discharge' | 'chart' | 'edit'; stay: Stay };

const ShortStayPage: React.FC = () => {
  const { user, activeRole } = useAuth();
  const role = user?.is_super_admin && activeRole ? activeRole : user?.role;
  const isAdmin = role === 'admin' || role === 'office_manager' || !!user?.is_super_admin;
  // Notes and the treatment plan are written by doctors (and admins).
  const canDoctor = role === 'doctor' || role === 'admin' || !!user?.is_super_admin;
  const [view, setView] = useState<'rounds' | 'beds'>(role === 'doctor' ? 'rounds' : 'beds');
  const [mineOnly, setMineOnly] = useState(true);
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
  const roundStays = occupied
    .map((b) => b.stay as Stay)
    .filter((s) => !mineOnly || s.doctor_id === user?.id);

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
          <div className="flex flex-wrap gap-2">
            {canDoctor && (
              <div className="inline-flex rounded-lg border border-ds-border-control overflow-hidden" role="tablist" aria-label="View">
                {(['rounds', 'beds'] as const).map((v) => (
                  <button
                    key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className={`min-h-ds-touch px-3 text-sm font-medium ${view === v ? 'bg-ds-accent text-ds-on-accent' : 'text-ds-text-secondary hover:bg-ds-subtle'}`}
                  >
                    {v === 'rounds' ? 'Rounds' : 'Bed board'}
                  </button>
                ))}
              </div>
            )}
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
        ) : canDoctor && view === 'rounds' ? (
          <section className="space-y-3" aria-label="Rounds">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ds-text">
                {mineOnly ? 'My patients' : 'All patients'} on short stay ({roundStays.length})
              </h2>
              <label className="inline-flex items-center gap-2 text-sm text-ds-text-secondary min-h-ds-touch">
                <input type="checkbox" className="w-5 h-5" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                Only patients under me
              </label>
            </div>
            {roundStays.length === 0 ? (
              <p className="p-4 rounded-ds-card border border-ds-border bg-ds-surface text-sm text-ds-text-muted">
                {mineOnly && occupied.length > 0
                  ? `No patient on short stay is under you. ${occupied.length} other patient${occupied.length > 1 ? 's are' : ' is'} in a bed. Untick the box to see them.`
                  : 'No patients on short stay right now.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {roundStays.map((s) => <RoundsRow key={s.id} stay={s} onOpen={() => setDialog({ kind: 'chart', stay: s })} />)}
              </ul>
            )}
          </section>
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
      {dialog?.kind === 'chart' && (
        <StayChart stay={dialog.stay} canDoctor={canDoctor} meId={user?.id} onClose={close} onChanged={() => { load(); }} />
      )}
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
  const hasObs = obsParts(s.last_obs).length > 0;
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
          {hasObs ? <>Last {ago(s.last_obs_at)} ago: <ObsLine obs={s.last_obs} /></> : 'No obs recorded since admission'}
        </p>
      </div>

      {s.treatment_plan && (
        <div className="mt-3 p-2 rounded-lg border border-ds-info/30 bg-ds-info-soft text-sm">
          <p className="text-xs font-semibold text-ds-info-text">Doctor's plan{s.plan_updated_by_name ? ` · ${s.plan_updated_by_name}` : ''}{s.plan_updated_at ? `, ${when(s.plan_updated_at)}` : ''}</p>
          <p className="text-ds-text whitespace-pre-wrap break-words line-clamp-4">{s.treatment_plan}</p>
        </div>
      )}

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

/** One patient on the doctor's rounds list. */
const RoundsRow: React.FC<{ stay: Stay; onOpen: () => void }> = ({ stay: s, onOpen }) => {
  const hasObs = obsParts(s.last_obs).length > 0;
  return (
    <li className={`bg-ds-surface rounded-ds-card shadow-ds-card border p-4 ${s.obs_overdue ? 'border-ds-critical-border' : 'border-ds-border'}`}>
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ds-text-muted">
            {s.bed_name} · {hoursLabel(s.hours_in_bed)} in bed · admitted {when(s.admitted_at)}
          </p>
          <p className="mt-0.5 text-base font-semibold text-ds-text">{s.patient_name}</p>
          <p className="text-xs text-ds-text-muted">
            {[s.patient_number, dobAndAge(s.patient_date_of_birth), s.gender, s.doctor_name ? `Dr ${s.doctor_name}` : null].filter(Boolean).join(' · ')}
          </p>
          {s.allergies && <AllergyLine allergies={s.allergies} />}
          {s.reason && <p className="mt-1 text-sm text-ds-text-secondary break-words">{s.reason}</p>}
          <p className={`mt-2 text-sm ${s.obs_overdue ? 'text-ds-critical-text font-medium' : 'text-ds-text-secondary'}`}>
            {hasObs ? <>Obs {ago(s.last_obs_at)} ago: <ObsLine obs={s.last_obs} /></> : 'No obs since admission'}
            {s.obs_overdue && ' · obs overdue'}
          </p>
          {s.treatment_plan && <p className="mt-1 text-sm text-ds-text break-words line-clamp-2"><span className="font-semibold">Plan:</span> {s.treatment_plan}</p>}
        </div>
        <div className="flex md:flex-col items-start md:items-end gap-2 flex-wrap">
          {(s.unreviewed_results || 0) > 0 && (
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-ds-warning-soft text-ds-warning-text border border-ds-warning-border">
              {s.unreviewed_results} result{s.unreviewed_results! > 1 ? 's' : ''} to review
            </span>
          )}
          {(s.unsigned_notes || 0) > 0 && (
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-ds-info-soft text-ds-info-text border border-ds-info/30">
              {s.unsigned_notes} unsigned note{s.unsigned_notes! > 1 ? 's' : ''}
            </span>
          )}
          {!s.treatment_plan && (
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-ds-subtle text-ds-text-secondary border border-ds-border">No plan yet</span>
          )}
          <button className={primaryBtn} onClick={onOpen}>Open patient</button>
        </div>
      </div>
    </li>
  );
};

/**
 * The stay chart: one page per patient for doctors and nurses — plan, results,
 * obs, medicines ordered and given, doctor notes, nursing entries. Doctors can
 * update the plan, review results and write/sign notes.
 */
const StayChart: React.FC<{ stay: Stay; canDoctor: boolean; meId?: number; onClose: () => void; onChanged: () => void }> = ({
  stay: initial, canDoctor, meId, onClose, onChanged,
}) => {
  const stayId = initial.id;
  const { showToast } = useNotification();
  const [data, setData] = useState<{
    stay: Stay; obs: ObsRow[]; entries: Entry[]; labs: StayLab[]; medicines: StayMedicine[]; doctor_notes: DoctorNote[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ type: NoteType; note?: DoctorNote } | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const forId = useRef(stayId);

  const reload = useCallback(async () => {
    try {
      const r = await apiClient.get(`/short-stay/stays/${stayId}`);
      if (forId.current === stayId) { setData(r.data); setError(null); }
    } catch (e) {
      if (forId.current === stayId) setError(getApiError(e, "Couldn't load the stay"));
    }
  }, [stayId]);
  useEffect(() => { forId.current = stayId; setData(null); reload(); }, [stayId, reload]);

  const changed = () => { reload(); onChanged(); };
  const stay = data?.stay || initial;
  const open = stay.status === 'admitted';

  const review = async (lab: StayLab) => {
    setReviewing(lab.id);
    try {
      await apiClient.post(`/orders/lab/${lab.id}/doctor-review`);
      showToast(`${lab.test_name} reviewed for ${stay.patient_name}. They can now see it in the portal.`, 'success');
      changed();
    } catch (e) {
      showToast(getApiError(e, 'Could not mark this result reviewed'), 'error');
    } finally {
      setReviewing(null);
    }
  };

  const section = 'pt-4 border-t border-ds-border';
  const h3 = 'text-sm font-semibold text-ds-text mb-2';

  return (
    <Modal isOpen onClose={onClose} title={`Stay chart · ${stay.patient_name}`} size="xl">
      {/* Identity stays on screen while scrolling the chart. */}
      <div className="sticky top-0 z-10 -mx-1 px-1 pb-1 bg-ds-surface">
        <PatientStrip stay={data?.stay || initial} />
      </div>
      {error ? <p className="text-sm text-ds-critical-text">{error}</p> : !data ? <p className="text-sm text-ds-text-muted">Loading…</p> : (
        <div className="space-y-4">
          <p className="text-sm text-ds-text-secondary">
            {stay.bed_name} · admitted {when(stay.admitted_at)}{stay.admitted_by_name ? ` by ${stay.admitted_by_name}` : ''}
            {stay.doctor_name ? ` · Dr ${stay.doctor_name}` : ''}
            {stay.discharged_at ? ` · discharged ${when(stay.discharged_at)}` : ` · ${hoursLabel(stay.hours_in_bed)} in bed`}
          </p>
          {stay.reason && <p className="text-sm text-ds-text break-words"><span className="font-semibold">Reason:</span> {stay.reason}</p>}

          <PlanBlock stay={stay} canEdit={canDoctor && open} onSaved={changed} />

          {stay.discharge_note && (
            <div className="p-3 rounded-lg border border-ds-border">
              <p className="text-xs font-semibold text-ds-text-muted uppercase">Discharge</p>
              <p className="text-sm text-ds-text break-words">{stay.discharge_note}</p>
              {stay.follow_up && <p className="text-sm text-ds-text-secondary mt-1 break-words">Follow-up: {stay.follow_up}</p>}
            </div>
          )}

          <div className={section}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-ds-text">Doctor's notes ({data.doctor_notes.length})</h3>
              {canDoctor && (
                <div className="flex flex-wrap gap-2">
                  {(['progress', 'procedure', 'discharge'] as const).map((t) => (
                    <button key={t} className={btn} onClick={() => setEditor({ type: t })}>+ {NOTE_LABEL[t]}</button>
                  ))}
                </div>
              )}
            </div>
            {editor && (
              <NoteEditor
                stay={stay} type={editor.type} note={editor.note}
                onCancel={() => setEditor(null)}
                onSaved={() => { setEditor(null); changed(); }}
              />
            )}
            {data.doctor_notes.length === 0 ? <p className="text-sm text-ds-text-muted">No doctor's notes yet.</p> : (
              <ol className="space-y-2">
                {data.doctor_notes.map((n) => (
                  <DoctorNoteCard
                    key={n.id} note={n}
                    canEdit={canDoctor && n.status === 'draft' && n.author_id === meId && editor?.note?.id !== n.id}
                    onEdit={() => setEditor({ type: n.note_type, note: n })}
                  />
                ))}
              </ol>
            )}
          </div>

          <div className={section}>
            <h3 className={h3}>Results ({data.labs.length})</h3>
            {data.labs.length === 0 ? <p className="text-sm text-ds-text-muted">No tests ordered on this visit.</p> : (
              <ul className="divide-y divide-ds-border border border-ds-border rounded-lg">
                {data.labs.map((l) => (
                  <li key={l.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ds-text">{l.test_name}</p>
                      <p className="text-xs text-ds-text-muted">
                        {l.status !== 'completed' ? 'Waiting for the lab'
                          : ['pending', 'rejected'].includes(l.verification_status || '') ? 'Done, waiting for lab verification'
                          : l.doctor_reviewed_at ? `Reviewed by ${l.doctor_reviewed_by_name || 'a doctor'}, ${when(l.doctor_reviewed_at)}`
                          : `Ready ${when(l.result_date)} · not reviewed yet`}
                      </p>
                      {l.result && <p className="text-sm text-ds-text whitespace-pre-wrap break-words mt-1">{l.result}</p>}
                    </div>
                    {canDoctor && l.can_review && (
                      <button className={primaryBtn} disabled={reviewing === l.id} onClick={() => review(l)}>
                        {reviewing === l.id ? 'Saving…' : 'Mark reviewed'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canDoctor && data.labs.some((l) => l.can_review) && (
              <p className="mt-1 text-xs text-ds-text-muted">Marking a result reviewed signs it off and releases it to the patient portal.</p>
            )}
          </div>

          <div className={section}>
            <h3 className={h3}>Observations ({data.obs.length})</h3>
            {data.obs.length === 0 ? <p className="text-sm text-ds-text-muted">None recorded during this stay.</p> : (
              <div className="overflow-x-auto border border-ds-border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-ds-subtle text-ds-text-muted text-xs">
                    <tr>{['Time', 'Temp', 'BP', 'Pulse', 'RR', 'SpO₂', 'Pain', 'By'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-ds-border">
                    {data.obs.map((o) => {
                      const f = obsFlags(o);
                      const cell = (k: ObsKey, text: string) =>
                        f.has(k) ? <span className="px-1 rounded bg-ds-critical-soft text-ds-critical-text font-semibold" title="Outside the usual range">{text}!</span> : text;
                      return (
                        <tr key={o.id} className="text-ds-text">
                          <td className="px-3 py-2 whitespace-nowrap">{when(o.recorded_at, 'd MMM HH:mm')}</td>
                          <td className="px-3 py-2">{o.temperature ? cell('temperature', `${o.temperature}°${o.temperature_unit || ''}`) : '–'}</td>
                          <td className="px-3 py-2">{o.blood_pressure_systolic ? cell('bp', `${o.blood_pressure_systolic}/${o.blood_pressure_diastolic ?? '–'}`) : '–'}</td>
                          <td className="px-3 py-2">{o.heart_rate != null ? cell('heart_rate', String(o.heart_rate)) : '–'}</td>
                          <td className="px-3 py-2">{o.respiratory_rate != null ? cell('respiratory_rate', String(o.respiratory_rate)) : '–'}</td>
                          <td className="px-3 py-2">{o.oxygen_saturation != null ? cell('oxygen_saturation', `${o.oxygen_saturation}%`) : '–'}</td>
                          <td className="px-3 py-2">{o.pain_level ?? '–'}</td>
                          <td className="px-3 py-2 text-ds-text-muted whitespace-nowrap">{o.recorded_by_name || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={section}>
            <h3 className={h3}>Medicines prescribed on this visit ({data.medicines.length})</h3>
            {data.medicines.length === 0 ? <p className="text-sm text-ds-text-muted">None prescribed.</p> : (
              <ul className="divide-y divide-ds-border border border-ds-border rounded-lg">
                {data.medicines.map((m) => (
                  <li key={m.id} className="p-3 text-sm">
                    <span className="font-medium text-ds-text">{m.medication_name}</span>
                    <span className="text-ds-text-secondary"> {[m.dosage, m.route, m.frequency].filter(Boolean).join(' · ')}</span>
                    <span className="block text-xs text-ds-text-muted">
                      {m.status.replace(/_/g, ' ')}{m.prescriber_name ? ` · ${m.prescriber_name}` : ''} · {when(m.ordered_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={section}>
            <h3 className={h3}>Nursing: medicines given, drips, notes, handovers ({data.entries.length})</h3>
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

/** The doctor's current treatment plan — nurses read it on the bed card. */
const PlanBlock: React.FC<{ stay: Stay; canEdit: boolean; onSaved: () => void }> = ({ stay, canEdit, onSaved }) => {
  const { showToast } = useNotification();
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(stay.treatment_plan || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setPlan(stay.treatment_plan || ''); }, [stay.treatment_plan, editing]);
  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/short-stay/stays/${stay.id}/plan`, { treatment_plan: plan });
      showToast(`Treatment plan saved for ${stay.patient_name}`, 'success');
      setEditing(false);
      onSaved();
    } catch (e) {
      showToast(getApiError(e, 'Could not save the plan'), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="p-3 rounded-lg border border-ds-info/30 bg-ds-info-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ds-info-text">
          Treatment plan
          {stay.plan_updated_at && <span className="font-normal text-xs"> · {stay.plan_updated_by_name || 'updated'}, {when(stay.plan_updated_at)}</span>}
        </p>
        {canEdit && !editing && <button className={btn} onClick={() => setEditing(true)}>{stay.treatment_plan ? 'Update plan' : 'Write plan'}</button>}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <label htmlFor="ss-plan" className="sr-only">Treatment plan</label>
          <textarea
            id="ss-plan" rows={5} value={plan} onChange={(e) => setPlan(e.target.value)} className={`${inputClass} resize-y`}
            placeholder={'e.g. IV ceftriaxone 1 g 12-hourly\nObs 2-hourly, call if SBP < 90 or T > 38.5\nRepeat FBC in the morning\nReview 08:00'}
          />
          <div className="flex gap-2">
            <button className={primaryBtn} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save plan'}</button>
            <button className={btn} onClick={() => { setEditing(false); setPlan(stay.treatment_plan || ''); }}>Cancel</button>
          </div>
          <p className="text-xs text-ds-text-muted">Nurses see the plan on the bed card. Prescribe medicines and order tests as usual from the doctor's screen.</p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-ds-text whitespace-pre-wrap break-words">{stay.treatment_plan || 'No plan written yet.'}</p>
      )}
    </div>
  );
};

const DoctorNoteCard: React.FC<{ note: DoctorNote; canEdit: boolean; onEdit: () => void }> = ({ note: n, canEdit, onEdit }) => {
  const f = NOTE_FIELDS[n.note_type];
  const parts: [string, string | null][] = [[f.subjective, n.subjective], [f.examination, n.examination], [f.assessment_plan, n.assessment_plan]];
  return (
    <li className={`p-3 rounded-lg border ${n.status === 'draft' ? 'border-ds-warning-border bg-ds-warning-soft' : 'border-ds-border'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold text-ds-text">{NOTE_LABEL[n.note_type]}{n.title ? `: ${n.title}` : ''}</span>
          <span className="text-xs text-ds-text-muted"> · {n.author_name || 'Doctor'} · {when(n.signed_at || n.updated_at)}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${n.status === 'signed' ? 'bg-ds-success-soft text-ds-success-text' : 'bg-ds-surface text-ds-warning-text border border-ds-warning-border'}`}>
            {n.status === 'signed' ? 'Signed' : 'Draft, not signed'}
          </span>
          {canEdit && <button className={btn} onClick={onEdit}>Edit / sign</button>}
        </div>
      </div>
      <dl className="mt-2 space-y-1">
        {parts.filter(([, v]) => v).map(([label, v]) => (
          <div key={label}>
            <dt className="text-xs font-semibold text-ds-text-muted">{label}</dt>
            <dd className="text-sm text-ds-text whitespace-pre-wrap break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
};

const NoteEditor: React.FC<{ stay: Stay; type: NoteType; note?: DoctorNote; onCancel: () => void; onSaved: () => void }> = ({
  stay, type, note, onCancel, onSaved,
}) => {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const f = NOTE_FIELDS[type];
  const [title, setTitle] = useState(note?.title || '');
  const [subjective, setSubjective] = useState(note?.subjective || '');
  const [examination, setExamination] = useState(note?.examination || '');
  const [plan, setPlan] = useState(note?.assessment_plan || '');
  const [saving, setSaving] = useState(false);

  const save = async (sign: boolean) => {
    if (sign) {
      const ok = await confirm({
        title: `Sign ${NOTE_LABEL[type].toLowerCase()}?`,
        message: `This signs the note for ${stay.patient_name} (${stay.patient_number || 'no number'}). A signed note can't be changed.`,
        confirmLabel: 'Sign',
      });
      if (!ok) return;
    }
    setSaving(true);
    const body = { note_type: type, title, subjective, examination, assessment_plan: plan, sign };
    try {
      if (note) await apiClient.put(`/short-stay/notes/${note.id}`, body);
      else await apiClient.post(`/short-stay/stays/${stay.id}/notes`, body);
      showToast(`${NOTE_LABEL[type]} ${sign ? 'signed' : 'saved as draft'} for ${stay.patient_name}`, 'success');
      onSaved();
    } catch (e) {
      showToast(getApiError(e, 'Could not save the note'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const area = (id: string, label: string, hint: string, value: string, set: (v: string) => void) => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <textarea id={id} rows={3} value={value} onChange={(e) => set(e.target.value)} className={`${inputClass} resize-y`} placeholder={hint} />
    </div>
  );

  return (
    <div className="mb-3 p-3 rounded-lg border border-ds-accent bg-ds-surface space-y-3">
      <p className="text-sm font-semibold text-ds-text">{note ? 'Edit' : 'New'} {NOTE_LABEL[type].toLowerCase()} for {stay.patient_name}</p>
      {f.title && (
        <div>
          <label htmlFor="dn-title" className={labelClass}>{f.title}</label>
          <input id="dn-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Incision and drainage of abscess, left thigh" />
        </div>
      )}
      {area('dn-s', f.subjective, f.hints[0], subjective, setSubjective)}
      {area('dn-e', f.examination, f.hints[1], examination, setExamination)}
      {area('dn-p', f.assessment_plan, f.hints[2], plan, setPlan)}
      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <button className={btn} onClick={onCancel} disabled={saving}>Cancel</button>
        <button className={btn} onClick={() => save(false)} disabled={saving}>Save draft</button>
        <button className={primaryBtn} onClick={() => save(true)} disabled={saving}>{saving ? 'Saving…' : 'Sign'}</button>
      </div>
    </div>
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
