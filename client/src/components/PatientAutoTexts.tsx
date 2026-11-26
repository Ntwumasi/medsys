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

type Kind = 'appointment' | 'follow_up' | 'refill' | 'lab_ready' | 'pharmacy_ready' | 'payment_receipt' | 'visit_summary' | 'home_visit' | 'delivery' | 'portal_invite';

const KINDS: { kind: Kind; label: string; when: string; example: string }[] = [
  {
    kind: 'appointment',
    label: 'Appointment reminders',
    when: 'Daily at 9am, for appointments the next day (home visits get their own wording)',
    example: 'Hello Ama, reminder: you have an appointment at Medics Clinic tomorrow, Tue 27 Oct at 9:30 am. To reschedule, call …',
  },
  {
    kind: 'home_visit',
    label: 'Doctor on the way (home visits)',
    when: 'When the doctor taps “On my way” for a home visit',
    example: 'Hello Ama, Dr Mensah from Medics Clinic is on the way for your home visit. Call …',
  },
  {
    kind: 'delivery',
    label: 'Medicine on its way (deliveries)',
    when: 'When the pharmacy hands a delivery to the courier',
    example: 'Hello Ama, your order from the Medics Clinic pharmacy is on its way to you. Call …',
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
  {
    kind: 'visit_summary',
    label: 'Visit summary & invoice',
    when: 'At checkout (or the next morning for visits closed without a checkout) — a 7-day portal link to that visit',
    example: 'Hello Ama, thank you for visiting Medics Clinic. Your visit summary and invoice: https://…/portal/verify?token=… (valid 7 days).',
  },
];

const KIND_LABEL: Record<string, string> = { ...Object.fromEntries(KINDS.map((k) => [k.kind, k.label])), portal_invite: 'Portal invitation' };

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
  // A failed load must not render every switch as OFF.
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [details, setDetails] = useState({ clinicName: '', clinicPhone: '', refillDays: '3', followUpDays: '3' });

  const load = useCallback(async () => {
    setLoadFailed(false);
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
      setLoadFailed(true);
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
      const sent = ['appointment', 'follow_up', 'refill', 'visit_summary'].reduce((n, k) => n + (r[k]?.sent || 0), 0);
      const failed = ['appointment', 'follow_up', 'refill', 'visit_summary'].reduce((n, k) => n + (r[k]?.failed || 0), 0);
      showToast(`Reminders sent: ${sent}${failed ? `, failed: ${failed}` : ''}`, failed ? 'warning' : 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not run reminders'), 'error');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-ds-text-muted">Loading…</div>;
  if (loadFailed) {
    return (
      <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-6 text-center">
        <p className="font-semibold text-ds-text">Couldn't load the automatic text settings.</p>
        <p className="text-sm text-ds-text-secondary mt-1">Nothing has been changed. Check your connection and try again.</p>
        <button onClick={() => { setLoading(true); load(); }} className="mt-4 px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ds-text">Automatic texts</h2>
          <p className="text-sm text-ds-text-secondary mt-1">
            Reminders and notices sent to patients without anyone clicking. Each type is off until you turn it on.
            Patients marked “No reminder texts” on their record are always skipped. Texts never name a test or medication.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="px-4 py-2 text-sm font-medium text-ds-on-accent bg-ds-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50"
        >
          {running ? 'Sending…' : 'Send today’s reminders now'}
        </button>
      </div>

      {env && (!env.sms_configured || env.sandbox || !env.sender_approved) && (
        <div className="p-3 text-sm rounded-lg bg-ds-warning-soft border border-ds-warning-border text-ds-warning-text">
          {!env.sms_configured
            ? 'No SMS provider is configured here — texts will be logged as failed.'
            : env.sandbox
              ? 'Sandbox mode: texts are recorded by Arkesel but not delivered (normal on staging).'
              : 'The Arkesel Sender ID is not marked approved — texts go through the backup provider only.'}
        </div>
      )}

      <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border divide-y divide-ds-border">
        {KINDS.map((k) => {
          const key = `patient_sms_${k.kind}_enabled`;
          const on = settings[key] === 'true';
          return (
            <div key={k.kind} className="px-6 py-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ds-text">{k.label}</div>
                <div className="text-sm text-ds-text-secondary">{k.when}</div>
                <div className="text-xs text-ds-text-muted mt-1 italic">“{k.example}”</div>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={k.label}
                onClick={() => toggle(k.kind)}
                disabled={saving === key}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-ds-success' : 'bg-ds-border-control'}`}
              >
                <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-ds-surface shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          );
        })}
      </div>

      <PortalInviteCard onSent={load} />

      <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-6">
        <h3 className="font-semibold text-ds-text mb-4">Text details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-ds-text-secondary">
            Clinic name in texts
            <input
              className="mt-1 w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent"
              value={details.clinicName}
              onChange={(e) => setDetails((d) => ({ ...d, clinicName: e.target.value }))}
            />
          </label>
          <label className="text-sm text-ds-text-secondary">
            Phone patients should call
            <input
              className="mt-1 w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent"
              value={details.clinicPhone}
              onChange={(e) => setDetails((d) => ({ ...d, clinicPhone: e.target.value }))}
            />
          </label>
          <label className="text-sm text-ds-text-secondary">
            Follow-up reminder: days before the visit
            <input
              type="number" min={1} max={14}
              className="mt-1 w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent"
              value={details.followUpDays}
              onChange={(e) => setDetails((d) => ({ ...d, followUpDays: e.target.value }))}
            />
          </label>
          <label className="text-sm text-ds-text-secondary">
            Refill reminder: days before it runs out
            <input
              type="number" min={1} max={14}
              className="mt-1 w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent"
              value={details.refillDays}
              onChange={(e) => setDetails((d) => ({ ...d, refillDays: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={saveDetails}
            disabled={saving === 'details'}
            className="px-4 py-2 text-sm font-medium text-ds-accent-text bg-ds-accent-soft border border-ds-accent/40 rounded-lg hover:bg-ds-accent-soft disabled:opacity-50"
          >
            {saving === 'details' ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </div>

      <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border">
        <div className="px-6 py-4 font-semibold text-ds-text border-b border-ds-border">Recent automatic texts</div>
        {log.length === 0 ? (
          <div className="px-4 pb-6 text-sm text-ds-text-muted">None sent yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-ds-subtle text-left text-xs font-medium text-ds-text-muted uppercase">
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
                      {r.patient_number && <span className="text-ds-text-muted"> · {r.patient_number}</span>}
                    </td>
                    <td className="px-4 py-2">{KIND_LABEL[r.kind] || r.kind}{r.channel === 'email' ? ' (email)' : ''}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.destination || '—'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'sent'
                            ? 'bg-ds-success-soft text-ds-success-text'
                            : r.status === 'failed'
                              ? 'bg-ds-critical-soft text-ds-critical-text'
                              : 'bg-ds-subtle text-ds-text-secondary'
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

interface InvitePreview { eligible: number; already_sent: number; months: number; example: string; characters: number; sandbox: boolean }

/**
 * One-off portal invitation. Shows exactly who and what before anything is
 * sent, then sends in small batches until everyone eligible has one.
 */
const PortalInviteCard: React.FC<{ onSent: () => void }> = ({ onSent }) => {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; failed: number } | null>(null);
  const [sending, setSending] = useState(false);

  const loadPreview = useCallback(async () => {
    setFailed(false);
    try {
      const r = await apiClient.get('/patient-texts/portal-invite');
      setPreview(r.data);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { loadPreview(); }, [loadPreview]);

  const send = async () => {
    if (!preview || preview.eligible === 0) return;
    const ok = await confirm({
      title: `Text ${preview.eligible} patient${preview.eligible === 1 ? '' : 's'} about the portal?`,
      message: preview.sandbox
        ? 'Sandbox mode: the texts are recorded but not delivered.'
        : 'Each phone number gets this text once. A family sharing a phone gets one text; anyone on it can sign in.',
      confirmLabel: 'Send invitations',
      variant: 'warning',
    });
    if (!ok) return;
    setSending(true);
    const total = { sent: 0, failed: 0 };
    setProgress(total);
    try {
      // Small batches keep each request short; stop if a batch makes no progress.
      for (let i = 0; i < 100; i++) {
        const r = await apiClient.post('/patient-texts/portal-invite', { limit: 20 });
        total.sent += r.data.sent; total.failed += r.data.failed;
        setProgress({ ...total });
        if (r.data.remaining === 0 || r.data.sent + r.data.failed === 0) break;
      }
      showToast(`Portal invitations sent: ${total.sent}${total.failed ? `, failed: ${total.failed}` : ''}`, total.failed ? 'warning' : 'success');
    } catch (e) {
      showToast(getApiError(e, 'Sending stopped — press Send again to carry on'), 'error');
    } finally {
      setSending(false);
      loadPreview();
      onSent();
    }
  };

  return (
    <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ds-text">Invite patients to the portal</h3>
          <p className="text-sm text-ds-text-secondary mt-1">
            A one-off text to patients seen in the last {preview?.months ?? 6} months, one per phone number. Skips patients who
            opted out, already use the portal, or have no valid date of birth (they couldn’t sign in). It has the portal
            address only — no personal link — so an old number can’t open anyone’s records.
          </p>
        </div>
        <button
          onClick={send}
          disabled={sending || !preview || preview.eligible === 0}
          className="min-h-[44px] px-4 py-2 text-sm font-medium text-ds-on-accent bg-ds-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50"
        >
          {sending ? 'Sending…' : preview && preview.eligible > 0 ? `Send to ${preview.eligible}` : 'Nobody to invite'}
        </button>
      </div>
      {failed && <p className="text-sm text-ds-critical-text mt-3">Couldn’t load the invitation list. Nothing has been sent.</p>}
      {preview && (
        <>
          <div className="text-xs text-ds-text-muted mt-3 italic">“{preview.example}”</div>
          <div className="text-xs text-ds-text-muted mt-1">
            {preview.characters} characters{preview.characters > 160 ? ' — billed as 2 texts' : ''} · already invited: {preview.already_sent}
          </div>
        </>
      )}
      {progress && (
        <div className="text-sm text-ds-text-secondary mt-3" role="status">
          Sent {progress.sent}{progress.failed ? `, failed ${progress.failed}` : ''}{sending ? '…' : ''}
        </div>
      )}
    </div>
  );
};

export default PatientAutoTexts;
