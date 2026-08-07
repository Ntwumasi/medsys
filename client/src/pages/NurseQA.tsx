import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import AppSelect from '../components/ui/AppSelect';
import type { ApiError } from '../types';

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
}

interface QAEncounter {
  encounter_id: number;
  encounter_number: string | null;
  encounter_date: string;
  status: string;
  chief_complaint: string | null;
  assessment: string | null;
  follow_up_required: boolean | null;
  follow_up_timeframe: string | null;
  clinic: string | null;
  patient_id: number;
  patient_number: string;
  patient_name: string;
  gender: string | null;
  date_of_birth: string | null;
  doctor_name: string | null;
  callback_phone: string | null;
  callback_is_emergency_contact: boolean;
  emergency_contact_name: string | null;
  last_call_date: string | null;
  last_call_status: string | null;
}

interface QASummary {
  total_visits: number;
  unique_patients: number;
  reachable: number;
  no_phone: number;
  follow_up_required: number;
  already_called: number;
}

const formatDate = (d: string | null) => {
  if (!d) return '—';
  try {
    return format(new Date(d), 'd MMM yyyy');
  } catch {
    return d;
  }
};

const ageFrom = (dob: string | null): string => {
  if (!dob) return '—';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '—';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age}`;
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  checked_out: 'Checked out',
  'in-progress': 'In progress',
  with_nurse: 'With nurse',
  with_doctor: 'With doctor',
};

const NurseQA: React.FC = () => {
  const { user, impersonation } = useAuth();
  const { showToast } = useNotification();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [providerId, setProviderId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [latestOnly, setLatestOnly] = useState(false);

  const [encounters, setEncounters] = useState<QAEncounter[]>([]);
  const [summary, setSummary] = useState<QASummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    apiClient
      .get('/users/doctors')
      .then((res) => setDoctors(res.data.doctors || []))
      .catch((err) => console.error('Failed to load doctors:', err));
  }, []);

  const runReport = useCallback(async () => {
    if (dateFrom > dateTo) {
      showToast('The "from" date must be on or before the "to" date', 'error');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (providerId !== 'all') params.set('provider_id', providerId);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiClient.get(`/nurse/qa/patients-seen?${params.toString()}`);
      setEncounters(res.data.encounters || []);
      setSummary(res.data.summary || null);
      setHasRun(true);
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to load the patient list', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, providerId, search, showToast]);

  // Load the default window (last 7 days, all doctors) on first open.
  useEffect(() => {
    void runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doctorOptions = useMemo(
    () => [
      { value: 'all', label: 'All doctors' },
      ...doctors.map((d) => ({ value: String(d.id), label: `Dr. ${d.first_name} ${d.last_name}` })),
    ],
    [doctors]
  );

  // One row per patient (their most recent visit) keeps the call list free of
  // duplicates when someone came in twice in the period. The API already
  // returns newest-first, so the first hit per patient is the latest.
  const rows = useMemo(() => {
    if (!latestOnly) return encounters;
    const seen = new Set<number>();
    return encounters.filter((e) => {
      if (seen.has(e.patient_id)) return false;
      seen.add(e.patient_id);
      return true;
    });
  }, [encounters, latestOnly]);

  const exportCsv = () => {
    if (rows.length === 0) {
      showToast('Nothing to export', 'warning');
      return;
    }
    const headers = [
      'Visit Date', 'Patient', 'Patient No.', 'Age', 'Gender', 'Callback Phone',
      'Phone Belongs To', 'Doctor', 'Visit No.', 'Chief Complaint', 'Assessment',
      'Status', 'Follow-up Needed', 'Last Call', 'Last Call Outcome',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = rows.map((r) =>
      [
        formatDate(r.encounter_date),
        r.patient_name,
        r.patient_number,
        ageFrom(r.date_of_birth),
        r.gender || '',
        r.callback_phone || 'No phone on file',
        r.callback_is_emergency_contact ? `Emergency contact${r.emergency_contact_name ? ` (${r.emergency_contact_name})` : ''}` : 'Patient',
        r.doctor_name || '',
        r.encounter_number || '',
        r.chief_complaint || '',
        r.assessment || '',
        STATUS_LABELS[r.status] || r.status,
        r.follow_up_required ? `Yes${r.follow_up_timeframe ? ` — ${r.follow_up_timeframe}` : ''}` : 'No',
        r.last_call_date ? formatDate(r.last_call_date) : '',
        r.last_call_status || '',
      ].map(escape).join(',')
    );

    const doctorLabel =
      providerId === 'all'
        ? 'all-doctors'
        : (doctorOptions.find((o) => o.value === providerId)?.label || 'doctor')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .toLowerCase();

    const blob = new Blob([`${headers.map(escape).join(',')}\n${body.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-patients-seen_${doctorLabel}_${dateFrom}_to_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Same gate as Procurement — QA review is a head-nurse responsibility.
  const isSuperAdminSession =
    user?.is_super_admin || (impersonation as any)?.originalUser?.is_super_admin;
  if (user?.role === 'nurse' && !user?.is_head_nurse && !isSuperAdminSession) {
    return (
      <AppLayout title="QA Review">
        <div className="text-center py-16">
          <p className="text-lg font-semibold text-gray-600">Access Restricted</p>
          <p className="text-sm text-gray-400 mt-1">QA review is managed by the Head Nurse</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="QA Review — Patients Seen">
      <div>
        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Doctor</label>
              <AppSelect
                value={providerId}
                onChange={setProviderId}
                options={doctorOptions}
                placeholder="All doctors"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Search <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void runReport(); }}
                placeholder="Name, patient no. or phone"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={latestOnly}
                onChange={(e) => setLatestOnly(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              One row per patient (most recent visit)
            </label>
            <div className="flex gap-2">
              <button
                onClick={exportCsv}
                disabled={rows.length === 0}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                onClick={() => void runReport()}
                disabled={loading}
                className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-60"
              >
                {loading ? 'Loading…' : 'Show Patients'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Visits</div>
              <div className="text-2xl font-bold text-gray-900">{summary.total_visits}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Unique Patients</div>
              <div className="text-2xl font-bold text-primary-600">{summary.unique_patients}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Reachable</div>
              <div className="text-2xl font-bold text-success-600">{summary.reachable}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">No Phone</div>
              <div className="text-2xl font-bold text-danger-600">{summary.no_phone}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Already Called</div>
              <div className="text-2xl font-bold text-gray-900">{summary.already_called}</div>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-lg font-semibold text-gray-600">
                {hasRun ? 'No patients found' : 'Choose a doctor and date range'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {hasRun
                  ? 'No visits match this doctor and date range.'
                  : 'Then press "Show Patients".'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Visit Date', 'Patient', 'Call Back', 'Doctor', 'Reason for Visit', 'Follow-up', 'Last Call'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.encounter_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(r.encounter_date)}
                        {/* Visits left open are common here, so surface the status —
                            an "in progress" row from last week is worth a QA look. */}
                        <div
                          className={`text-xs ${
                            r.status === 'completed' || r.status === 'checked_out'
                              ? 'text-gray-400'
                              : 'text-warning-600 font-semibold'
                          }`}
                        >
                          {STATUS_LABELS[r.status] || r.status}
                        </div>
                        {r.encounter_number && (
                          <div className="text-xs text-gray-400 font-mono">{r.encounter_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-semibold text-gray-900">{r.patient_name}</div>
                        <div className="text-xs text-gray-400">
                          <span className="font-mono">{r.patient_number}</span>
                          {' · '}
                          {ageFrom(r.date_of_birth)}
                          {r.gender ? ` · ${r.gender}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {r.callback_phone ? (
                          <>
                            <a
                              href={`tel:${r.callback_phone.replace(/\s/g, '')}`}
                              className="font-semibold text-primary-600 hover:underline"
                            >
                              {r.callback_phone}
                            </a>
                            {r.callback_is_emergency_contact && (
                              <div className="text-xs text-warning-600">
                                Emergency contact
                                {r.emergency_contact_name ? ` — ${r.emergency_contact_name}` : ''}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-danger-600">No phone on file</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {r.doctor_name ? `Dr. ${r.doctor_name}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                        <div className="truncate" title={r.chief_complaint || ''}>
                          {r.chief_complaint || '—'}
                        </div>
                        {r.assessment && (
                          <div className="text-xs text-gray-400 truncate" title={r.assessment}>
                            {r.assessment}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {r.follow_up_required ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-warning-100 text-warning-700">
                            {r.follow_up_timeframe || 'Required'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {r.last_call_date ? (
                          <>
                            <div className="text-gray-600">{formatDate(r.last_call_date)}</div>
                            {r.last_call_status && (
                              <div className="text-xs text-gray-400 capitalize">
                                {r.last_call_status.replace(/_/g, ' ')}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Not called</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            Showing {rows.length} {latestOnly ? 'patients' : 'visits'}
            {latestOnly && encounters.length !== rows.length
              ? ` (${encounters.length} visits collapsed to the most recent per patient)`
              : ''}
            .
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default NurseQA;
