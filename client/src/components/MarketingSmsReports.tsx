import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { getApiError } from '../utils/apiError';

/**
 * Bulk SMS reports, like the Arkesel dashboard's: one campaign's report (with
 * a recipients download) and a month-by-month summary. Read-only.
 *
 * "Sent" means handed to Arkesel (submitted + delivered + failed); the
 * delivery rate is delivered ÷ sent. Credits are SMS credits — Arkesel gives
 * no cedi price per credit, so there is no GHS cost.
 */

export interface CampaignReportNumbers {
  recipients: number;
  pending: number;
  submitted: number;
  delivered: number;
  failed: number;
  skipped: number;
  skipped_opted_out: number;
  attempted: number;
  delivery_rate: number | null;
  credits_per_message: number;
  credits_estimated: number;
  credits_used: number;
  credits_charged: number;
  opted_out_since: number;
}

export interface CampaignReport {
  campaign: {
    id: number;
    name: string;
    message: string;
    status: string;
    sandbox: boolean;
    rejection_reason: string | null;
    created_by_name: string | null;
    created_at: string | null;
    approved_by_name: string | null;
    approved_at: string | null;
    sent_by_name: string | null;
    started_at: string | null;
    completed_at: string | null;
  };
  numbers: CampaignReportNumbers;
}

interface MonthSummary {
  month: string;
  campaigns: number;
  attempted: number;
  delivered: number;
  failed: number;
  credits_used: number;
  delivery_rate: number | null;
}

interface Summary {
  include_sandbox: boolean;
  months: MonthSummary[];
  totals: Omit<MonthSummary, 'month'>;
}

const fmtDate = (s?: string | null): string => {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'MMM d, yyyy h:mm a') : '—';
};

const fmtMonth = (ym: string): string => {
  const d = parseISO(`${ym}-01`);
  return isValid(d) ? format(d, 'MMM yyyy') : ym;
};

const fmtRate = (r: number | null): string => (r == null ? '—' : `${r}%`);
const fmtNum = (n: number): string => n.toLocaleString();

/** Same slug rule as the server, used if the filename header isn't readable. */
const slugify = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'campaign';

/** A failed blob request carries its JSON error as a Blob; read it back. */
const blobError = async (e: unknown, fallback: string): Promise<string> => {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.error) return String(parsed.error);
    } catch {
      /* not JSON */
    }
  }
  return getApiError(e, fallback);
};

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: 'default' | 'success' | 'critical' | 'warning' }> = ({ label, value, hint, tone = 'default' }) => {
  const toneClass =
    tone === 'success' ? 'text-ds-success-text'
      : tone === 'critical' ? 'text-ds-critical-text'
      : tone === 'warning' ? 'text-ds-warning-text'
      : 'text-ds-text';
  return (
    <div className="p-3 bg-ds-subtle border border-ds-border rounded-ds-control">
      <div className="text-xs text-ds-text-secondary">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-ds-text-muted mt-0.5">{hint}</div>}
    </div>
  );
};

/** Report for one campaign, as a dialog. */
export const SmsCampaignReportDialog: React.FC<{ campaignId: number; onClose: () => void }> = ({ campaignId, onClose }) => {
  const { showToast } = useNotification();
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    setReport(null);
    setError(null);
    apiClient
      .get(`/marketing/sms/campaigns/${campaignId}/report`)
      .then((res) => {
        if (active) setReport(res.data);
      })
      .catch((e) => {
        if (active) setError(getApiError(e, 'Could not load the report'));
      });
    return () => {
      active = false;
    };
  }, [campaignId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      const res = await apiClient.get(`/marketing/sms/campaigns/${campaignId}/recipients/export`, { responseType: 'blob' });
      const header = String(res.headers?.['content-disposition'] || '');
      const match = header.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `campaign-${campaignId}-${slugify(report.campaign.name)}-recipients.xlsx`;
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast(await blobError(e, 'The download failed'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  const c = report?.campaign;
  const n = report?.numbers;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-report-title"
        className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-ds-border flex justify-between items-start gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ds-text-muted">Campaign report</p>
            <h3 id="sms-report-title" className="text-lg font-semibold text-ds-text break-words">{c?.name || 'Loading…'}</h3>
            {c?.sandbox && (
              <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-ds-warning-soft text-ds-warning-text">
                SANDBOX — test send, nothing delivered or charged
              </span>
            )}
          </div>
          <button onClick={onClose} className="min-h-ds-touch min-w-[44px] -mr-2 text-ds-text-muted hover:text-ds-text rounded-ds-control" aria-label="Close report">✕</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {error ? (
            <div className="p-3 rounded-lg border border-ds-critical-border bg-ds-critical-soft text-ds-critical-text text-sm" role="alert">{error}</div>
          ) : !report || !c || !n ? (
            <div className="py-8 text-center text-ds-text-muted" role="status">Loading report…</div>
          ) : (
            <>
              <section aria-label="Delivery">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Recipients" value={fmtNum(n.recipients)} />
                  <Stat label="Sent to Arkesel" value={fmtNum(n.attempted)} hint="submitted + delivered + failed" />
                  <Stat label="Delivered" value={fmtNum(n.delivered)} tone="success" />
                  <Stat label="Delivery rate" value={fmtRate(n.delivery_rate)} hint="delivered ÷ sent" />
                  <Stat label="Awaiting report" value={fmtNum(n.submitted)} hint="accepted, no delivery report yet" />
                  <Stat label="Failed" value={fmtNum(n.failed)} tone={n.failed > 0 ? 'critical' : 'default'} />
                  <Stat label="Not sent yet" value={fmtNum(n.pending)} />
                  <Stat label="Skipped" value={fmtNum(n.skipped)} hint={n.skipped_opted_out > 0 ? `${n.skipped_opted_out} had opted out` : undefined} />
                </div>
              </section>

              <section aria-label="Credits and opt-outs" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 border border-ds-border rounded-ds-control text-sm space-y-1">
                  <div className="font-medium text-ds-text">SMS credits</div>
                  <div>
                    Used: <strong className="tabular-nums">{fmtNum(n.credits_used)}</strong>
                    {c.sandbox && <span className="text-ds-text-muted"> (sandbox — not charged)</span>}
                  </div>
                  <div className="text-ds-text-secondary">
                    {n.credits_per_message} per message · {fmtNum(n.credits_estimated)} estimated for the whole audience
                  </div>
                  <div className="text-xs text-ds-text-muted">Arkesel doesn’t share a cedi price per credit, so cost is shown in credits.</div>
                </div>
                <div className="p-3 border border-ds-border rounded-ds-control text-sm space-y-1">
                  <div className="font-medium text-ds-text">Opted out since</div>
                  <div><strong className="tabular-nums">{fmtNum(n.opted_out_since)}</strong> {n.opted_out_since === 1 ? 'person' : 'people'} who got this message have since opted out of marketing.</div>
                </div>
              </section>

              <section aria-label="Timeline">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><dt className="text-xs text-ds-text-muted">Created by</dt><dd className="text-ds-text">{c.created_by_name || '—'} · {fmtDate(c.created_at)}</dd></div>
                  <div>
                    <dt className="text-xs text-ds-text-muted">{c.status === 'rejected' ? 'Rejected by' : 'Approved by'}</dt>
                    <dd className="text-ds-text">{c.approved_by_name ? `${c.approved_by_name} · ${fmtDate(c.approved_at)}` : 'Not yet'}</dd>
                    {c.status === 'rejected' && c.rejection_reason && <dd className="text-xs text-ds-critical-text">{c.rejection_reason}</dd>}
                  </div>
                  <div><dt className="text-xs text-ds-text-muted">Sending started</dt><dd className="text-ds-text">{fmtDate(c.started_at)}{c.sent_by_name ? ` · by ${c.sent_by_name}` : ''}</dd></div>
                  <div><dt className="text-xs text-ds-text-muted">Sending finished</dt><dd className="text-ds-text">{c.completed_at ? fmtDate(c.completed_at) : c.started_at ? 'Not finished' : '—'}</dd></div>
                </dl>
              </section>

              <section aria-label="Message">
                <div className="text-xs text-ds-text-muted mb-1">Message</div>
                <div className="whitespace-pre-wrap bg-ds-subtle border border-ds-border rounded p-3 text-sm text-ds-text">{c.message}</div>
              </section>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-ds-border flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="min-h-ds-touch px-4 text-sm text-ds-text-secondary rounded-lg hover:bg-ds-subtle">Close</button>
          <button
            onClick={download}
            disabled={!report || downloading}
            className="min-h-ds-touch px-4 text-sm font-medium text-ds-on-accent bg-ds-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50"
          >
            {downloading ? 'Preparing…' : 'Download recipients (Excel)'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Month-by-month summary across campaigns (last 6 months). */
export const SmsCampaignSummary: React.FC = () => {
  const [includeSandbox, setIncludeSandbox] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get('/marketing/sms/reports/summary', { params: includeSandbox ? { include_sandbox: 1 } : {} })
      .then((res) => {
        if (active) setSummary(res.data);
      })
      .catch((e) => {
        if (active) setError(getApiError(e, 'Could not load the reports'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [includeSandbox]);

  return (
    <section className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border" aria-labelledby="sms-summary-title">
      <div className="px-4 py-3 border-b border-ds-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="sms-summary-title" className="font-semibold text-ds-text">Last 6 months</h3>
          <p className="text-xs text-ds-text-muted">A campaign counts in the month it started sending. Delivery rate = delivered ÷ sent.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ds-text-secondary min-h-ds-touch cursor-pointer">
          <input type="checkbox" checked={includeSandbox} onChange={(e) => setIncludeSandbox(e.target.checked)} className="h-5 w-5 rounded border-ds-border-control" />
          Include test (sandbox) campaigns
        </label>
      </div>
      {error ? (
        <div className="m-4 p-3 rounded-lg border border-ds-critical-border bg-ds-critical-soft text-ds-critical-text text-sm" role="alert">{error}</div>
      ) : loading && !summary ? (
        <div className="p-8 text-center text-ds-text-muted" role="status">Loading…</div>
      ) : summary ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ds-subtle text-left text-ds-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2">Month</th>
                <th scope="col" className="px-4 py-2 text-right">Campaigns</th>
                <th scope="col" className="px-4 py-2 text-right">Sent</th>
                <th scope="col" className="px-4 py-2 text-right">Delivered</th>
                <th scope="col" className="px-4 py-2 text-right">Failed</th>
                <th scope="col" className="px-4 py-2 text-right">Delivery rate</th>
                <th scope="col" className="px-4 py-2 text-right">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border">
              {[...summary.months].reverse().map((m) => (
                <tr key={m.month} className={m.campaigns === 0 ? 'text-ds-text-muted' : 'text-ds-text'}>
                  <th scope="row" className="px-4 py-2 text-left font-medium">{fmtMonth(m.month)}</th>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNum(m.campaigns)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNum(m.attempted)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNum(m.delivered)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNum(m.failed)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtRate(m.delivery_rate)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNum(m.credits_used)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ds-subtle font-semibold text-ds-text border-t border-ds-border">
              <tr>
                <th scope="row" className="px-4 py-2 text-left">Total</th>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(summary.totals.campaigns)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(summary.totals.attempted)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(summary.totals.delivered)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(summary.totals.failed)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtRate(summary.totals.delivery_rate)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(summary.totals.credits_used)}</td>
              </tr>
            </tfoot>
          </table>
          {summary.include_sandbox && (
            <p className="px-4 py-2 text-xs text-ds-warning-text">Includes test sends: their credits were not charged.</p>
          )}
        </div>
      ) : null}
    </section>
  );
};
