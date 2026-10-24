import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { getApiError } from '../utils/apiError';

/**
 * Automatic patient texts: reminders (sent by the daily 9am job) and "it's
 * ready" notices (sent the moment it happens). Every kind starts OFF; patients
 * marked "No reminder texts" on their record never get any of them.
 */

type Kind = 'appointment' | 'follow_up' | 'refill' | 'lab_ready' | 'pharmacy_ready' | 'payment_receipt';

const KINDS: { kind: Kind; label: string; when: string; example: string }[] = [
  {
    kind: 'appointment',
    label: 'Appointment reminders',
    when: 'Daily at 9am, for appointments the next day',
    example: 'Hello Ama, reminder: you have an appointment at Medics Clinic tomorrow, Tue 27 Oct at 9:30 am. To reschedule, call …',
  },
  {
    kind: 'follow_up',
    label: 'Follow-up visit reminders',
    when: 'Daily at 9am, a few days before a doctor-ordered follow-up (email if no phone)',
    example: 'Hello Ama, your follow-up visit at Medics Clinic is on Tue 27 Oct at 9:30 am. To reschedule, call …',
  },
  {
    kind: 'refill',
    label: 'Refill reminders',
    when: 'Daily at 9am, a few days before a long-term medication runs out',
    example: 'Hello Ama, one of your medications from Medics Clinic is due for a refill around Tue 27 Oct. Visit our pharmacy or call …',
  },
  {
    kind: 'lab_ready',
    label: 'Lab results ready',
    when: 'When the last lab result of the visit is verified',
    example: 'Hello Ama, your lab results at Medics Clinic are ready. Your doctor will go over them with you. Call …',
  },
  {
    kind: 'pharmacy_ready',
    label: 'Medication ready for pickup',
    when: 'When pharmacy marks the visit’s last prescription Ready',
    example: 'Hello Ama, your medication is ready for pickup at the Medics Clinic pharmacy. Call …',
  },
  {
    kind: 'payment_receipt',
    label: 'Payment receipts',
    when: 'When reception records a payment at checkout',
    example: 'Medics Clinic: payment of GHS 250.00 received for invoice INV-001234. Balance due: GHS 0.00. Thank you.',
  },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.kind, k.label]));

interface LogRow {
  id: number;
  kind: Kind;
  channel: string;
  destination: string | null;
  message: string | null;
  status: 'pending' | 'sent' | 'failed';
  error: string | null;
  created_at: string;
  patient_name: string | null;
  patient_number: string | null;
}

const fmt = (s?: string | null) => {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'MMM d, h:mm a') : '—';
};

const PatientAutoTexts: React.FC = () => {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [env, setEnv] = useState<{ sms_configured: boolean; sandbox: boolean; sender_approved: boolean } | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [details, setDetails] = useState({ clinicName: '', clinicPhone: '', refillDays: '3', followUpDays: '3' });

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        apiClient.get('/patient-texts/settings'),
        apiClient.get('/patient-texts/log', { params: { limit: 100 } }),
      ]);
      const st: Record<string, string> = s.data.settings || {};
      setSettings(st);
      setEnv({ sms_configured: s.data.sms_configured, sandbox: s.data.sandbox, sender_approved: s.data.sender_approved });
      setDetails({
        clinicName: st.patient_sms_clinic_name || '',
        clinicPhone: st.patient_sms_clinic_phone || '',
        refillDays: st.patient_sms_refill_days_before || '3',
        followUpDays: st.follow_up_reminder_days_before || '3',
      });
      setLog(l.data.log || []);
    } catch (e) {
      showToast(getApiError(e, 'Could not load text settings'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (kind: Kind) => {
    const key = `patient_sms_${kind}_enabled`;
    const next = settings[key] === 'true' ? 'false' : 'true';
    if (next === 'true') {
      const ok = await confirm({
        title: `Turn on ${KIND_LABEL[kind].toLowerCase()}?`,
        message: 'Patients will start receiving these texts for real. Patients marked “No reminder texts” are skipped.',
        confirmLabel: 'Turn on',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setSaving(key);
    try {
      await apiClient.put('/patient-texts/settings', { [key]: next });
      setSettings((s) => ({ ...s, [key]: next }));
      showToast(`${KIND_LABEL[kind]} ${next === 'true' ? 'on' : 'off'}`, 'success');
    } catch (e) {
      showToast(getApiError(e, 'Could not save'), 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveDetails = async () => {
    setSaving('details');
    try {
      await apiClient.put('/patient-texts/settings', {
        patient_sms_clinic_name: details.clinicName,
        patient_sms_clinic_phone: details.clinicPhone,
        patient_sms_refill_days_before: details.refillDays,
        follow_up_reminder_days_before: details.followUpDays,
      });
      showToast('Saved', 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not save'), 'error');
    } finally {
      setSaving(null);
    }
  };

  const runNow = async () => {
    const ok = await confirm({
      title: 'Send today’s reminders now?',
      message: 'Sends any appointment, follow-up and refill reminders that are due and switched on. Nobody gets the same reminder twice, so the 9am run won’t repeat them.',
      confirmLabel: 'Send now',
    });
    if (!ok) return;
    setRunning(true);
    try {
      const res = await apiClient.post('/patient-texts/run-daily');
      const r = res.data.result || {};
      const sent = ['appointment', 'follow_up', 'refill'].reduce((n, k) => n + (r[k]?.sent || 0), 0);
      const failed = ['appointment', 'follow_up', 'refill'].reduce((n, k) => n + (r[k]?.failed || 0), 0);
      showToast(`Reminders sent: ${sent}${failed ? `, failed: ${failed}` : ''}`, failed ? 'warning' : 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not run reminders'), 'error');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-gray-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Automatic texts</h2>
          <p className="text-sm text-gray-600 mt-1">
            Reminders and notices sent to patients without anyone clicking. Each type is off until you turn it on.
            Patients marked “No reminder texts” on their record are always skipped. Texts never name a test or medication.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {running ? 'Sending…' : 'Send today’s reminders now'}
        </button>
      </div>

      {env && (!env.sms_configured || env.sandbox || !env.sender_approved) && (
        <div className="p-3 text-sm rounded-lg bg-warning-50 border border-warning-200 text-warning-800">
          {!env.sms_configured
            ? 'No SMS provider is configured here — texts will be logged as failed.'
            : env.sandbox
              ? 'Sandbox mode: texts are recorded by Arkesel but not delivered (normal on staging).'
              : 'The Arkesel Sender ID is not marked approved — texts go through the backup provider only.'}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y">
        {KINDS.map((k) => {
          const key = `patient_sms_${k.kind}_enabled`;
          const on = settings[key] === 'true';
          return (
            <div key={k.kind} className="p-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900">{k.label}</div>
                <div className="text-sm text-gray-600">{k.when}</div>
                <div className="text-xs text-gray-500 mt-1 italic">“{k.example}”</div>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={k.label}
                onClick={() => toggle(k.kind)}
                disabled={saving === key}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-success-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="font-medium text-gray-900 mb-3">Text details</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-gray-700">
            Clinic name in texts
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={details.clinicName}
              onChange={(e) => setDetails((d) => ({ ...d, clinicName: e.target.value }))}
            />
          </label>
          <label className="text-sm text-gray-700">
            Phone patients should call
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={details.clinicPhone}
              onChange={(e) => setDetails((d) => ({ ...d, clinicPhone: e.target.value }))}
            />
          </label>
          <label className="text-sm text-gray-700">
            Follow-up reminder: days before the visit
            <input
              type="number" min={1} max={14}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={details.followUpDays}
              onChange={(e) => setDetails((d) => ({ ...d, followUpDays: e.target.value }))}
            />
          </label>
          <label className="text-sm text-gray-700">
            Refill reminder: days before it runs out
            <input
              type="number" min={1} max={14}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={details.refillDays}
              onChange={(e) => setDetails((d) => ({ ...d, refillDays: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={saveDetails}
            disabled={saving === 'details'}
            className="px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50"
          >
            {saving === 'details' ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 font-medium text-gray-900">Recent automatic texts</div>
        {log.length === 0 ? (
          <div className="px-4 pb-6 text-sm text-gray-500">None sent yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Patient</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">To</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.map((r) => (
                  <tr key={r.id} title={r.message || ''}>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="px-4 py-2">
                      {r.patient_name || '—'}
                      {r.patient_number && <span className="text-gray-500"> · {r.patient_number}</span>}
                    </td>
                    <td className="px-4 py-2">{KIND_LABEL[r.kind] || r.kind}{r.channel === 'email' ? ' (email)' : ''}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.destination || '—'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'sent'
                            ? 'bg-success-100 text-success-800'
                            : r.status === 'failed'
                              ? 'bg-danger-100 text-danger-800'
                              : 'bg-gray-100 text-gray-700'
                        }`}
                        title={r.error || ''}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientAutoTexts;
