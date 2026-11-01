import React, { useCallback, useEffect, useState } from 'react';
import { addDays, differenceInYears, format, isToday, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { getApiError } from '../utils/apiError';

/**
 * The doctor's (or accompanying nurse's) home visits for today and the next
 * week: who, where, how to get there, and the buttons used at the house —
 * "On my way" (texts the patient) and "Start visit" (opens the visit).
 */

export interface HomeVisit {
  id: number;
  patient_id: number | null;
  appointment_date: string;
  duration_minutes: number;
  status: string;
  reason: string | null;
  provider_id: number | null;
  nurse_id: number | null;
  encounter_id: number | null;
  encounter_status: string | null;
  visit_address: string | null;
  visit_gps_address: string | null;
  visit_landmark: string | null;
  visit_contact_phone: string | null;
  city: string | null;
  patient_number: string | null;
  date_of_birth: string | null;
  gender: string | null;
  patient_name: string;
  provider_name: string | null;
  nurse_name: string | null;
}

interface Props {
  /** Called with the encounter id once a visit is started (or reopened). */
  onOpenEncounter: (encounterId: number) => void;
  /** Days ahead to show, including today. */
  days?: number;
}

const ageOf = (dob: string | null): string => {
  if (!dob) return '';
  const d = parseISO(dob);
  return isValid(d) && d.getFullYear() > 1900 ? `${differenceInYears(new Date(), d)}y` : '';
};

/** Google Maps search for the GPS code (Ghana Post codes resolve there) or the address. */
const mapsLink = (v: HomeVisit): string | null => {
  const q = v.visit_gps_address || [v.visit_address, v.city].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
};

const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

const HomeVisitsPanel: React.FC<Props> = ({ onOpenEncounter, days = 7 }) => {
  const { showToast } = useNotification();
  const [visits, setVisits] = useState<HomeVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const res = await apiClient.get('/home-visits', {
        params: { from: today, to: format(addDays(new Date(), days - 1), 'yyyy-MM-dd'), scope: 'mine' },
      });
      setVisits(res.data.visits || []);
      setError(null);
    } catch (e) {
      setError(getApiError(e, "Couldn't load your home visits"));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const start = async (v: HomeVisit) => {
    if (v.encounter_id) {
      onOpenEncounter(v.encounter_id);
      return;
    }
    setBusy(v.id);
    try {
      const res = await apiClient.post(`/home-visits/${v.id}/start`);
      showToast(`Home visit started for ${v.patient_name}`, 'success');
      await load();
      onOpenEncounter(res.data.encounter_id);
    } catch (e) {
      showToast(getApiError(e, `Couldn't start the visit for ${v.patient_name}`), 'error');
    } finally {
      setBusy(null);
    }
  };

  const onMyWay = async (v: HomeVisit) => {
    setBusy(v.id);
    try {
      const res = await apiClient.post(`/home-visits/${v.id}/on-my-way`);
      const outcome = res.data.outcome;
      if (outcome === 'sent') showToast(`Texted ${v.patient_name} that you're on the way`, 'success');
      else if (outcome === 'sending') showToast(`Text to ${v.patient_name} is on its way`, 'info');
      else if (outcome === 'skipped') showToast('Not texted — already sent, the patient opted out, or home-visit texts are switched off in SMS settings', 'warning');
      else showToast(`The text to ${v.patient_name} failed`, 'error');
    } catch (e) {
      showToast(getApiError(e, 'Could not text the patient'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return null;
  if (!error && visits.length === 0) return null;

  return (
    <section aria-labelledby="home-visits-title" className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border mb-6 overflow-hidden">
      <div className="px-4 py-3 border-b border-ds-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <h2 id="home-visits-title" className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">Home visits</h2>
          <span className="text-[11px] text-ds-text-muted">today and the next {days - 1} days</span>
        </div>
        <span className="px-2 py-0.5 bg-ds-accent-soft text-ds-accent-text text-xs font-bold rounded-full tabular-nums">{visits.length}</span>
      </div>

      {error ? (
        <div className="p-4 text-sm">
          <p className="text-ds-critical-text">{error}</p>
          <button onClick={load} className="mt-2 min-h-ds-control px-3 text-sm text-ds-accent-text hover:underline">Try again</button>
        </div>
      ) : (
        <ul className="divide-y divide-ds-border">
          {visits.map((v) => {
            const when = parseISO(v.appointment_date);
            const map = mapsLink(v);
            const done = v.status === 'completed' || v.encounter_status === 'discharged';
            const started = !!v.encounter_id && !done;
            const meta = [v.patient_number, ageOf(v.date_of_birth), v.gender].filter(Boolean).join(' · ');
            return (
              <li key={v.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="md:w-28 shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${isToday(when) ? 'text-ds-accent-text' : 'text-ds-text'}`}>
                    {isToday(when) ? 'Today' : format(when, 'EEE d MMM')}
                  </p>
                  <p className="text-xs text-ds-text-muted tabular-nums">{format(when, 'h:mm a')} · {v.duration_minutes} min</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ds-text">
                    {v.patient_name}
                    {meta && <span className="ml-2 text-xs font-normal text-ds-text-muted">{meta}</span>}
                  </p>
                  <p className="text-sm text-ds-text-secondary">
                    {[v.visit_address, v.visit_gps_address].filter(Boolean).join(' · ') || 'No address on file — call the patient'}
                  </p>
                  {v.visit_landmark && <p className="text-xs text-ds-text-muted">{v.visit_landmark}</p>}
                  <p className="text-xs text-ds-text-muted mt-0.5">
                    {v.reason ? `${v.reason} · ` : ''}
                    {v.nurse_name ? `With nurse ${v.nurse_name}` : 'Doctor only'}
                    {v.provider_name ? ` · Dr ${v.provider_name}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {v.visit_contact_phone && (
                    <a href={telLink(v.visit_contact_phone)} className="min-h-ds-touch inline-flex items-center px-3 rounded-lg border border-ds-border-control text-sm text-ds-text-secondary hover:bg-ds-subtle">
                      Call
                    </a>
                  )}
                  {map && (
                    <a href={map} target="_blank" rel="noopener noreferrer" className="min-h-ds-touch inline-flex items-center px-3 rounded-lg border border-ds-border-control text-sm text-ds-text-secondary hover:bg-ds-subtle">
                      Map
                    </a>
                  )}
                  {!done && !started && isToday(when) && v.patient_id && (
                    <button
                      onClick={() => onMyWay(v)}
                      disabled={busy === v.id}
                      className="min-h-ds-touch px-3 rounded-lg border border-ds-border-control text-sm text-ds-text-secondary hover:bg-ds-subtle disabled:opacity-50"
                    >
                      On my way
                    </button>
                  )}
                  {done ? (
                    <span className="min-h-ds-touch inline-flex items-center px-3 text-sm text-ds-success-text font-medium">Done</span>
                  ) : !v.patient_id ? (
                    <span className="min-h-ds-touch inline-flex items-center px-3 text-xs text-ds-warning-text">Patient not registered yet</span>
                  ) : (
                    <button
                      onClick={() => start(v)}
                      disabled={busy === v.id}
                      className="min-h-ds-touch px-4 rounded-lg bg-ds-accent text-ds-on-accent text-sm font-medium hover:bg-ds-accent-hover disabled:opacity-50"
                    >
                      {started ? 'Open visit' : busy === v.id ? 'Starting…' : 'Start visit'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default HomeVisitsPanel;
