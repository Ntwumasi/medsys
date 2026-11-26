import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarDays, endOfMonth, endOfWeek, format, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { getDoctorPatientsReport } from '../api/doctorPatients';
import type { DoctorPatientsReport, ReportAppointment, SeenEncounter } from '../api/doctorPatients';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import { dobAndAge } from '../utils/age';
import { getApiError } from '../utils/apiError';

/**
 * Patients by doctor — the head nurse's read-only view: everyone each doctor
 * saw in a date range, plus their appointments with missed ones flagged red.
 * Nothing here changes data (a missed appointment is never marked no-show).
 */

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
}

const MAX_RANGE_DAYS = 93;
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

type Preset = 'today' | 'week' | 'month';
const presetRange = (p: Preset): { from: string; to: string } => {
  const now = new Date();
  if (p === 'today') return { from: ymd(now), to: ymd(now) };
  if (p === 'month') return { from: ymd(startOfMonth(now)), to: ymd(endOfMonth(now)) };
  return { from: ymd(startOfWeek(now, { weekStartsOn: 1 })), to: ymd(endOfWeek(now, { weekStartsOn: 1 })) };
};

const inputClass =
  'w-full min-h-ds-control px-3 py-2 border border-ds-border-control rounded-lg bg-ds-surface text-ds-text focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent';
const chip = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';

const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const pretty = (s: string | null | undefined) => (s ? s.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
const when = (iso: string) => {
  const d = parseISO(iso);
  return isValid(d) ? { day: format(d, 'EEE d MMM'), time: format(d, 'h:mm a') } : { day: '—', time: '' };
};

/** Patient name, number and DOB/age — always shown together (clinical UI rule 1). */
const PatientIdentity: React.FC<{ name: string | null; number: string | null; dob: string | null }> = ({ name, number, dob }) => (
  <div className="min-w-0">
    <p className="text-sm font-semibold text-ds-text break-words">{name || 'Unnamed patient'}</p>
    <p className="text-xs text-ds-text-muted tabular-nums break-words">
      {[number || 'No patient number', dobAndAge(dob)].join(' · ')}
    </p>
  </div>
);

const PhoneLink: React.FC<{ phone: string | null; name: string | null; strong?: boolean }> = ({ phone, name, strong }) =>
  phone ? (
    <a
      href={telLink(phone)}
      aria-label={`Call ${name || 'patient'} on ${phone}`}
      className={`min-h-ds-touch inline-flex items-center gap-1 px-3 rounded-lg border text-sm tabular-nums ${
        strong
          ? 'border-ds-critical-border text-ds-critical-text bg-ds-surface font-semibold hover:bg-ds-subtle'
          : 'border-ds-border-control text-ds-text-secondary hover:bg-ds-subtle'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
      {strong ? `Call ${phone}` : phone}
    </a>
  ) : (
    <span className="text-xs text-ds-text-muted">No phone on file</span>
  );

const SeenRow: React.FC<{ e: SeenEncounter }> = ({ e }) => {
  const w = when(e.encounter_date);
  const reason = e.primary_diagnosis || e.chief_complaint;
  return (
    <li className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
      <div className="md:w-28 shrink-0">
        <p className="text-sm font-semibold text-ds-text tabular-nums">{w.day}</p>
        <p className="text-xs text-ds-text-muted tabular-nums">{w.time}</p>
      </div>
      <div className="flex-1 min-w-0">
        <PatientIdentity name={e.patient_name} number={e.patient_number} dob={e.date_of_birth} />
        {reason && (
          <p className="text-sm text-ds-text-secondary mt-0.5 break-words">
            <span className="text-ds-text-muted">{e.primary_diagnosis ? 'Diagnosis: ' : 'Complaint: '}</span>
            {reason}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {e.is_home_visit ? (
          <span className={`${chip} bg-ds-info-soft text-ds-info-text`}>Home visit</span>
        ) : (
          e.encounter_type && <span className={`${chip} bg-ds-subtle text-ds-text-secondary`}>{pretty(e.encounter_type)}</span>
        )}
        <span className={`${chip} ${e.status === 'completed' || e.status === 'discharged' || e.status === 'checked_out' ? 'bg-ds-success-soft text-ds-success-text' : 'bg-ds-subtle text-ds-text-secondary'}`}>
          {pretty(e.status)}
        </span>
        <PhoneLink phone={e.phone} name={e.patient_name} />
      </div>
    </li>
  );
};

const AppointmentRow: React.FC<{ a: ReportAppointment }> = ({ a }) => {
  const w = when(a.appointment_date);
  return (
    <li
      className={`px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 ${
        a.missed ? 'bg-ds-critical-soft border-l-4 border-ds-critical-border' : 'border-l-4 border-transparent'
      }`}
    >
      <div className="md:w-28 shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${a.missed ? 'text-ds-critical-text' : 'text-ds-text'}`}>{w.day}</p>
        <p className={`text-xs tabular-nums ${a.missed ? 'text-ds-critical-text' : 'text-ds-text-muted'}`}>{w.time}</p>
      </div>
      <div className="flex-1 min-w-0">
        <PatientIdentity name={a.patient_name} number={a.patient_number} dob={a.date_of_birth} />
        {(a.reason || a.appointment_type) && (
          <p className="text-sm text-ds-text-secondary mt-0.5 break-words">
            {[pretty(a.appointment_type), a.reason].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {a.missed && (
          <span className={`${chip} bg-ds-surface text-ds-critical-text border border-ds-critical-border font-bold uppercase tracking-wide`}>
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            Missed
          </span>
        )}
        {a.location_type === 'home' && <span className={`${chip} bg-ds-info-soft text-ds-info-text`}>Home visit</span>}
        <span className={`${chip} bg-ds-subtle text-ds-text-secondary`}>{pretty(a.status)}</span>
        <PhoneLink phone={a.phone} name={a.patient_name} strong={a.missed} />
      </div>
    </li>
  );
};

const GroupCard: React.FC<{ title: string; count: number; missed?: number; children: React.ReactNode }> = ({ title, count, missed, children }) => (
  <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
    <div className="px-4 py-3 border-b border-ds-border flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-ds-text">{title}</h3>
      <div className="flex items-center gap-2">
        {missed ? (
          <span className={`${chip} bg-ds-critical-soft text-ds-critical-text border border-ds-critical-border font-bold tabular-nums`}>{missed} missed</span>
        ) : null}
        <span className={`${chip} bg-ds-accent-soft text-ds-accent-text font-bold tabular-nums`}>{count}</span>
      </div>
    </div>
    <ul className="divide-y divide-ds-border">{children}</ul>
  </div>
);

const doctorTitle = (id: number | null, name: string) => (id == null ? name : `Dr ${name}`);

const DoctorPatientsPage: React.FC = () => {
  useDesignSystemPage();
  const initial = presetRange('week');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [doctorId, setDoctorId] = useState<string>('all');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsError, setDoctorsError] = useState(false);
  const [report, setReport] = useState<DoctorPatientsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missedOnly, setMissedOnly] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    apiClient
      .get('/users/doctors')
      .then((res) => setDoctors(res.data.doctors || []))
      .catch(() => setDoctorsError(true));
  }, []);

  const rangeError = useMemo(() => {
    const f = parseISO(from);
    const t = parseISO(to);
    if (!isValid(f) || !isValid(t)) return 'Pick a start and end date.';
    if (t < f) return 'The end date is before the start date.';
    if (differenceInCalendarDays(t, f) + 1 > MAX_RANGE_DAYS) return `Pick ${MAX_RANGE_DAYS} days or fewer.`;
    return null;
  }, [from, to]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (rangeError) {
      setReport(null);
      setLoading(false);
      return;
    }
    // Clear the previous filter's rows so they're never shown under the new filter.
    setReport(null);
    setLoading(true);
    setError(null);
    try {
      const data = await getDoctorPatientsReport({ from, to, doctor_id: doctorId === 'all' ? null : Number(doctorId) });
      if (seq !== requestSeq.current) return; // a newer filter is already loading
      setReport(data);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(getApiError(e, "Couldn't load patients by doctor"));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [from, to, doctorId, rangeError]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (p: Preset) => {
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
  };
  const activePreset = (['today', 'week', 'month'] as Preset[]).find((p) => {
    const r = presetRange(p);
    return r.from === from && r.to === to;
  });

  const apptGroups = useMemo(() => {
    const groups = report?.appointments.groups || [];
    if (!missedOnly) return groups;
    return groups
      .map((g) => ({ ...g, appointments: g.appointments.filter((a) => a.missed) }))
      .filter((g) => g.appointments.length > 0);
  }, [report, missedOnly]);

  const rangeLabel = (() => {
    const f = parseISO(from);
    const t = parseISO(to);
    if (!isValid(f) || !isValid(t)) return '';
    return from === to ? format(f, 'EEE d MMM yyyy') : `${format(f, 'd MMM')} – ${format(t, 'd MMM yyyy')}`;
  })();

  return (
    <AppLayout title="Patients by doctor" designSystem>
      <div className="space-y-6 min-w-0">
        {/* Filters */}
        <section aria-label="Filters" className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-sm text-ds-text-secondary">
              Doctor
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={`${inputClass} mt-1`}>
                <option value="all">All doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    Dr {d.first_name} {d.last_name}
                  </option>
                ))}
              </select>
              {doctorsError && <span className="block mt-1 text-xs text-ds-warning-text">Couldn't load the doctor list — showing all doctors.</span>}
            </label>
            <label className="block text-sm text-ds-text-secondary">
              From
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm text-ds-text-secondary">
              To
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick date ranges">
            {([['today', 'Today'], ['week', 'This week'], ['month', 'This month']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                aria-pressed={activePreset === key}
                className={`min-h-ds-touch px-4 rounded-lg border text-sm font-medium ${
                  activePreset === key
                    ? 'bg-ds-accent text-ds-on-accent border-ds-accent'
                    : 'border-ds-border-control text-ds-text-secondary hover:bg-ds-subtle'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {rangeError && <p className="text-sm text-ds-warning-text" role="alert">{rangeError}</p>}
        </section>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-live="polite">
          <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4">
            <p className="text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Seen</p>
            <p className="text-2xl font-bold text-ds-text tabular-nums">{report ? report.seen.total : '—'}</p>
            <p className="text-xs text-ds-text-muted">{rangeLabel}</p>
          </div>
          <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4">
            <p className="text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Appointments</p>
            <p className="text-2xl font-bold text-ds-text tabular-nums">{report ? report.appointments.total : '—'}</p>
            <p className="text-xs text-ds-text-muted">Not counting cancelled</p>
          </div>
          <div
            className={`rounded-ds-card shadow-ds-card border p-4 ${
              report && report.appointments.missed_count > 0 ? 'bg-ds-critical-soft border-ds-critical-border' : 'bg-ds-surface border-ds-border'
            }`}
          >
            <p className={`text-xs font-semibold uppercase tracking-wider ${report && report.appointments.missed_count > 0 ? 'text-ds-critical-text' : 'text-ds-text-muted'}`}>
              Missed appointments
            </p>
            <p className={`text-2xl font-bold tabular-nums ${report && report.appointments.missed_count > 0 ? 'text-ds-critical-text' : 'text-ds-text'}`}>
              {report ? report.appointments.missed_count : '—'}
            </p>
            <p className={`text-xs ${report && report.appointments.missed_count > 0 ? 'text-ds-critical-text' : 'text-ds-text-muted'}`}>
              No-show, or time passed with no visit that day
            </p>
          </div>
        </div>

        {loading && !rangeError ? (
          <div className="bg-ds-surface rounded-ds-card border border-ds-border p-6 text-sm text-ds-text-muted" role="status">
            Loading patients…
          </div>
        ) : error ? (
          <div className="bg-ds-surface rounded-ds-card border border-ds-critical-border p-4 text-sm">
            <p className="text-ds-critical-text">{error}</p>
            <button onClick={load} className="mt-2 min-h-ds-touch px-3 rounded-lg text-sm text-ds-accent-text hover:underline">
              Try again
            </button>
          </div>
        ) : report ? (
          <>
            {/* Section 1: Seen */}
            <section aria-labelledby="seen-title" className="space-y-3">
              <h2 id="seen-title" className="text-base font-semibold text-ds-text">
                Seen by doctor <span className="text-ds-text-muted font-normal">({report.seen.total})</span>
              </h2>
              {report.seen.truncated && (
                <p className="text-sm text-ds-warning-text">Showing the first {report.seen.total} visits — narrow the dates to see the rest.</p>
              )}
              {report.seen.groups.length === 0 ? (
                <p className="bg-ds-surface rounded-ds-card border border-ds-border p-4 text-sm text-ds-text-muted">No visits in this range.</p>
              ) : (
                report.seen.groups.map((g) => (
                  <GroupCard key={`seen-${g.doctor_id ?? 'none'}`} title={doctorTitle(g.doctor_id, g.doctor_name)} count={g.count}>
                    {g.encounters.map((e) => (
                      <SeenRow key={e.encounter_id} e={e} />
                    ))}
                  </GroupCard>
                ))
              )}
            </section>

            {/* Section 2: Appointments and missed */}
            <section aria-labelledby="appts-title" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="appts-title" className="text-base font-semibold text-ds-text">
                  Appointments <span className="text-ds-text-muted font-normal">({report.appointments.total})</span>
                  {report.appointments.missed_count > 0 && (
                    <span className="ml-2 text-ds-critical-text font-semibold">{report.appointments.missed_count} missed</span>
                  )}
                </h2>
                <button
                  type="button"
                  onClick={() => setMissedOnly((v) => !v)}
                  aria-pressed={missedOnly}
                  className={`min-h-ds-touch px-4 rounded-lg border text-sm font-medium ${
                    missedOnly
                      ? 'bg-ds-critical-soft text-ds-critical-text border-ds-critical-border'
                      : 'border-ds-border-control text-ds-text-secondary hover:bg-ds-subtle'
                  }`}
                >
                  {missedOnly ? 'Showing missed only' : 'Missed only'}
                </button>
              </div>
              {report.appointments.truncated && (
                <p className="text-sm text-ds-warning-text">Showing the first {report.appointments.total} appointments — narrow the dates to see the rest.</p>
              )}
              {apptGroups.length === 0 ? (
                <p className="bg-ds-surface rounded-ds-card border border-ds-border p-4 text-sm text-ds-text-muted">
                  {missedOnly ? 'No missed appointments in this range.' : 'No appointments in this range.'}
                </p>
              ) : (
                apptGroups.map((g) => (
                  <GroupCard
                    key={`appt-${g.doctor_id ?? 'none'}`}
                    title={doctorTitle(g.doctor_id, g.doctor_name)}
                    count={missedOnly ? g.appointments.length : g.count}
                    missed={missedOnly ? undefined : g.missed_count}
                  >
                    {g.appointments.map((a) => (
                      <AppointmentRow key={a.appointment_id} a={a} />
                    ))}
                  </GroupCard>
                ))
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
};

export default DoctorPatientsPage;
