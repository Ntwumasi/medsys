import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { getApiError } from '../utils/apiError';
import { branding } from '../config/branding';

/**
 * Bulk SMS for marketing: write a campaign → admin approves → send.
 * Opted-out patients are excluded on the server (and re-checked at send).
 * Outside production the server forces Arkesel sandbox, so nothing is
 * delivered or billed there.
 */

interface SmsStatus {
  configured: boolean;
  sender_id: string | null;
  live: boolean;
  balance_sms: number | null;
  balance_main: string | null;
}

interface Preview {
  recipients: number;
  invalid_phones: number;
  too_many: boolean;
  max_audience: number;
  sample_message: string;
  parts: number;
  unicode: boolean;
  length: number;
  credits: number;
}

interface Campaign {
  id: number;
  name: string;
  message: string;
  filters: { since?: string | null; gender?: string | null; min_age?: number | null; max_age?: number | null };
  status: 'pending_approval' | 'approved' | 'rejected' | 'sending' | 'sent' | 'cancelled';
  sandbox: boolean;
  recipient_count: number;
  credits_per_message: number;
  created_by_name: string | null;
  approved_by_name: string | null;
  rejection_reason: string | null;
  created_at: string;
  completed_at: string | null;
  pending_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  skipped_count: number;
}

interface Recipient {
  id: number;
  phone: string;
  first_name: string | null;
  patient_number: string | null;
  status: string;
  delivery_status: string | null;
  error: string | null;
}

const STATUS_STYLE: Record<Campaign['status'], { label: string; className: string }> = {
  pending_approval: { label: 'Awaiting approval', className: 'bg-warning-100 text-warning-800' },
  approved: { label: 'Approved — ready to send', className: 'bg-primary-100 text-primary-800' },
  rejected: { label: 'Rejected', className: 'bg-danger-100 text-danger-800' },
  sending: { label: 'Sending', className: 'bg-blue-100 text-blue-800' },
  sent: { label: 'Sent', className: 'bg-success-100 text-success-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700' },
};

const fmtDate = (s?: string | null): string => {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'MMM d, yyyy h:mm a') : '—';
};

const describeFilters = (f: Campaign['filters']): string => {
  const parts: string[] = [];
  if (f?.since) parts.push(`visited since ${f.since}`);
  if (f?.gender) parts.push(f.gender === 'male' ? 'men' : 'women');
  if (f?.min_age != null || f?.max_age != null) parts.push(`aged ${f.min_age ?? 0}–${f.max_age ?? '∞'}`);
  return parts.length ? parts.join(', ') : 'all patients';
};

const optOutLine = `To stop these messages, call ${branding.clinicPhone || 'the clinic'}.`;

const MarketingSmsCampaigns: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || !!(user as { is_super_admin?: boolean } | null)?.is_super_admin;
  const { showToast } = useNotification();
  const { confirm, prompt } = useDialog();

  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer
  const [showCompose, setShowCompose] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [since, setSince] = useState('');
  const [gender, setGender] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Sending
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);

  // Details
  const [detail, setDetail] = useState<{ campaign: Campaign; recipients: Recipient[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        apiClient.get('/marketing/sms/status'),
        apiClient.get('/marketing/sms/campaigns'),
      ]);
      setStatus(s.data);
      setCampaigns(c.data.campaigns || []);
    } catch (e) {
      showToast(getApiError(e, 'Could not load SMS campaigns'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filters = { since: since || null, gender: gender || null, min_age: minAge || null, max_age: maxAge || null };
  const filtersKey = JSON.stringify(filters);

  // Debounced live preview: audience size, cost, how the message will look.
  useEffect(() => {
    if (!showCompose) return;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.post('/marketing/sms/preview', { filters: JSON.parse(filtersKey), message });
        setPreview(res.data);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [showCompose, filtersKey, message]);

  const insertAtCursor = (text: string) => {
    const el = messageRef.current;
    if (!el) {
      setMessage((m) => m + text);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + text + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const resetCompose = () => {
    setName('');
    setMessage('');
    setSince('');
    setGender('');
    setMinAge('');
    setMaxAge('');
    setPreview(null);
  };

  const hasOptOut = /stop|opt[\s-]?out|unsubscribe/i.test(message);
  const overBalance = !!(preview && status?.balance_sms != null && preview.credits > status.balance_sms);

  const createCampaign = async () => {
    if (!hasOptOut) {
      const ok = await confirm({
        title: 'No opt-out line',
        message: 'Marketing messages should tell people how to stop receiving them. Submit anyway?',
        confirmLabel: 'Submit anyway',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setCreating(true);
    try {
      await apiClient.post('/marketing/sms/campaigns', { name, message, filters });
      showToast(isAdmin ? 'Campaign saved — approve it to send' : 'Campaign sent to an admin for approval', 'success');
      setShowCompose(false);
      resetCompose();
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not save the campaign'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const approve = async (c: Campaign) => {
    const ok = await confirm({
      title: 'Approve campaign',
      message: (
        <div className="space-y-2 text-sm">
          <p>
            <strong>{c.name}</strong> to <strong>{c.recipient_count}</strong> patients ({describeFilters(c.filters)}),
            about <strong>{c.recipient_count * c.credits_per_message}</strong> SMS credits.
          </p>
          <p className="whitespace-pre-wrap bg-gray-50 border rounded p-2">{c.message}</p>
        </div>
      ),
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    try {
      await apiClient.post(`/marketing/sms/campaigns/${c.id}/approve`);
      showToast('Campaign approved', 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not approve'), 'error');
    }
  };

  const reject = async (c: Campaign) => {
    const reason = await prompt({ title: 'Reject campaign', message: 'Tell marketing why (optional):', placeholder: 'Reason' });
    if (reason === null) return;
    try {
      await apiClient.post(`/marketing/sms/campaigns/${c.id}/reject`, { reason });
      showToast('Campaign rejected', 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not reject'), 'error');
    }
  };

  const cancel = async (c: Campaign) => {
    const ok = await confirm({
      title: 'Cancel campaign',
      message: c.status === 'sending' ? 'Messages already sent can’t be recalled. The rest will not be sent.' : 'This campaign will not be sent.',
      confirmLabel: 'Cancel campaign',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.post(`/marketing/sms/campaigns/${c.id}/cancel`);
      showToast('Campaign cancelled', 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not cancel'), 'error');
    }
  };

  const send = async (c: Campaign) => {
    const live = status?.live && !c.sandbox;
    const ok = await confirm({
      title: live ? 'Send to patients now?' : 'Send in sandbox (test) mode?',
      message: live
        ? `${c.pending_count || c.recipient_count} patients will receive this SMS. This can't be undone.`
        : 'Sandbox: Arkesel records the messages but does NOT deliver or charge for them. Use this to test the flow.',
      confirmLabel: live ? 'Send now' : 'Run test send',
      variant: live ? 'warning' : 'default',
    });
    if (!ok) return;
    setSendingId(c.id);
    stopRef.current = false;
    const total = c.pending_count || c.recipient_count;
    let done = 0;
    setProgress({ done, total });
    try {
      // Batches of 100 until nothing is left; each request stays short.
      for (;;) {
        if (stopRef.current) break;
        const res = await apiClient.post(`/marketing/sms/campaigns/${c.id}/send-batch`);
        const { sent = 0, failed = 0, remaining = 0, halted, error } = res.data;
        done += sent + failed;
        setProgress({ done, total });
        if (halted) {
          showToast(`Sending stopped: ${error || 'Arkesel rejected the batch'}. Fix it and press Send again to continue.`, 'error');
          break;
        }
        if (remaining === 0) {
          showToast(res.data.sandbox ? 'Test send complete (sandbox — nothing delivered)' : 'Campaign sent', 'success');
          break;
        }
      }
    } catch (e) {
      showToast(getApiError(e, 'Sending failed — press Send again to resume'), 'error');
    } finally {
      setSendingId(null);
      setProgress(null);
      load();
    }
  };

  const openDetail = async (c: Campaign) => {
    try {
      const res = await apiClient.get(`/marketing/sms/campaigns/${c.id}`);
      setDetail(res.data);
    } catch (e) {
      showToast(getApiError(e, 'Could not load campaign'), 'error');
    }
  };

  if (loading) return <div className="py-12 text-center text-gray-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Bulk SMS</h2>
          <p className="text-sm text-gray-600 mt-1">
            Text groups of patients. Patients who opted out are always excluded. Every campaign needs an admin’s approval before it is sent.
          </p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
        >
          New campaign
        </button>
      </div>

      {status && (
        <div
          className={`p-3 rounded-lg border text-sm flex flex-wrap gap-x-6 gap-y-1 ${
            !status.configured ? 'bg-danger-50 border-danger-200 text-danger-800'
              : status.live ? 'bg-success-50 border-success-200 text-success-900'
              : 'bg-warning-50 border-warning-200 text-warning-900'
          }`}
          role="status"
        >
          {!status.configured ? (
            <span>SMS is not set up on this environment (no Arkesel key).</span>
          ) : (
            <>
              <span className="font-semibold">{status.live ? 'LIVE — messages are delivered' : 'SANDBOX — test mode, nothing is delivered or charged'}</span>
              <span>Sender ID: <strong>{status.sender_id || 'not set'}</strong></span>
              <span>Balance: <strong>{status.balance_sms != null ? `${status.balance_sms} SMS` : 'unknown'}</strong>{status.balance_main ? ` (${status.balance_main})` : ''}</span>
            </>
          )}
        </div>
      )}

      {sendingId && progress && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between text-sm text-blue-900 mb-2">
            <span>Sending… {progress.done} of {progress.total}</span>
            <button onClick={() => { stopRef.current = true; }} className="text-blue-700 underline">Pause</button>
          </div>
          <div className="h-2 bg-blue-100 rounded" aria-hidden="true">
            <div className="h-2 bg-blue-600 rounded transition-all" style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-x-auto">
        {campaigns.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No campaigns yet. Click “New campaign” to write one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2">Campaign</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Audience</th>
                <th className="px-4 py-2">Progress</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.map((c) => {
                const st = STATUS_STYLE[c.status];
                const busy = sendingId !== null;
                return (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(c)} className="font-medium text-primary-700 hover:underline text-left">{c.name}</button>
                      <div className="text-xs text-gray-500">by {c.created_by_name || '—'} · {fmtDate(c.created_at)}</div>
                      {c.sandbox && <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning-100 text-warning-800">SANDBOX</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.className}`}>{st.label}</span>
                      {c.status === 'rejected' && c.rejection_reason && <div className="text-xs text-danger-700 mt-1">{c.rejection_reason}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div>{c.recipient_count} patients</div>
                      <div className="text-xs text-gray-500">{describeFilters(c.filters)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {['sending', 'sent', 'cancelled'].includes(c.status) ? (
                        <>
                          <div>Sent {c.sent_count} · Delivered {c.delivered_count}</div>
                          <div>Failed {c.failed_count} · Skipped {c.skipped_count} · Left {c.pending_count}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {c.status === 'pending_approval' && isAdmin && (
                          <>
                            <button onClick={() => approve(c)} className="px-3 py-1 text-xs font-medium text-white bg-success-600 rounded hover:bg-success-700">Approve</button>
                            <button onClick={() => reject(c)} className="px-3 py-1 text-xs font-medium text-danger-700 bg-danger-50 rounded hover:bg-danger-100">Reject</button>
                          </>
                        )}
                        {(c.status === 'approved' || (c.status === 'sending' && c.pending_count > 0)) && (
                          <button
                            onClick={() => send(c)}
                            disabled={busy}
                            className="px-3 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
                          >
                            {c.status === 'sending' ? 'Resume sending' : 'Send'}
                          </button>
                        )}
                        {['pending_approval', 'approved', 'sending'].includes(c.status) && (
                          <button onClick={() => cancel(c)} disabled={sendingId === c.id} className="px-3 py-1 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCompose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-labelledby="sms-compose-title">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b">
              <h3 id="sms-compose-title" className="text-lg font-semibold">New SMS campaign</h3>
            </div>
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="sms-name" className="block text-sm font-medium text-gray-700 mb-1">Campaign name (internal)</label>
                  <input id="sms-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. October BP check" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-gray-700">Who gets it</legend>
                  <div>
                    <label htmlFor="sms-since" className="block text-xs text-gray-600 mb-1">Visited since (optional)</label>
                    <input id="sms-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label htmlFor="sms-gender" className="block text-xs text-gray-600 mb-1">Sex</label>
                    <select id="sms-gender" value={gender} onChange={(e) => setGender(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">Everyone</option>
                      <option value="female">Women</option>
                      <option value="male">Men</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label htmlFor="sms-min-age" className="block text-xs text-gray-600 mb-1">Min age</label>
                      <input id="sms-min-age" type="number" min={0} max={130} value={minAge} onChange={(e) => setMinAge(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="sms-max-age" className="block text-xs text-gray-600 mb-1">Max age</label>
                      <input id="sms-max-age" type="number" min={0} max={130} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Age filters leave out patients with no date of birth on file.</p>
                </fieldset>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="sms-message" className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    id="sms-message"
                    ref={messageRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    maxLength={640}
                    placeholder="Hello {first_name}, …"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <div className="flex flex-wrap gap-2 mt-1">
                    <button type="button" onClick={() => insertAtCursor('{first_name}')} className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200">+ First name</button>
                    <button type="button" onClick={() => setMessage((m) => (m.trim() ? `${m.trim()} ${optOutLine}` : optOutLine))} disabled={hasOptOut} className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50">+ Opt-out line</button>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 border rounded-lg text-sm space-y-2" aria-live="polite">
                  {previewLoading && !preview ? (
                    <span className="text-gray-500">Counting…</span>
                  ) : preview ? (
                    <>
                      <div><strong>{preview.recipients}</strong> patients will receive it{preview.invalid_phones > 0 && <span className="text-gray-500"> ({preview.invalid_phones} skipped — invalid number)</span>}</div>
                      <div>
                        {preview.length} characters → <strong>{preview.parts}</strong> SMS each{preview.unicode && <span className="text-warning-700"> (special characters/emoji make each SMS shorter)</span>}
                      </div>
                      <div>Cost: about <strong>{preview.credits}</strong> SMS credits{status?.balance_sms != null && <> · balance {status.balance_sms}</>}</div>
                      {overBalance && <div className="text-danger-700 font-medium">Not enough balance — top up Arkesel before sending.</div>}
                      {preview.too_many && <div className="text-danger-700 font-medium">Too many recipients (max {preview.max_audience}). Narrow the filters.</div>}
                      {message && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">How it will look:</div>
                          <div className="whitespace-pre-wrap bg-white border rounded p-2">{preview.sample_message}</div>
                        </div>
                      )}
                      {message && !hasOptOut && <div className="text-warning-800 text-xs">Tip: add an opt-out line so patients know how to stop these messages.</div>}
                    </>
                  ) : (
                    <span className="text-gray-500">Preview unavailable</span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => { setShowCompose(false); resetCompose(); }} className="px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={createCampaign}
                disabled={creating || !name.trim() || !message.trim() || !preview || preview.recipients === 0 || preview.too_many}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {creating ? 'Saving…' : isAdmin ? 'Save campaign' : 'Submit for approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-labelledby="sms-detail-title" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-start gap-4">
              <div>
                <h3 id="sms-detail-title" className="text-lg font-semibold">{detail.campaign.name}</h3>
                <p className="text-xs text-gray-500">
                  {describeFilters(detail.campaign.filters)} · approved by {detail.campaign.approved_by_name || '—'}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="whitespace-pre-wrap bg-gray-50 border rounded p-3 text-sm">{detail.campaign.message}</div>
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600 bg-gray-50">
                  <tr><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.recipients.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-1.5">{r.first_name || '—'} <span className="text-xs text-gray-500">{r.patient_number}</span></td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.phone}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {r.status}{r.delivery_status ? ` · ${r.delivery_status}` : ''}
                        {r.error && <div className="text-danger-700">{r.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.campaign.recipient_count > detail.recipients.length && (
                <p className="text-xs text-gray-500">Showing the first {detail.recipients.length} of {detail.campaign.recipient_count}.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingSmsCampaigns;
