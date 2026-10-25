import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { getApiError } from '../utils/apiError';

interface ContactRow {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  gender: string | null;
  last_visit: string | null;
}

interface Props {
  since: string;
  search: string;
  has: '' | 'phone' | 'email';
  /** true → list the opted-out patients (to re-include one) instead */
  optedOut: boolean;
  /** called after an opt-out change so the parent can refresh its counts */
  onChanged: () => void;
}

const PAGE_SIZE = 50;

const fmtDate = (s: string | null): string => {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
};

/**
 * The on-screen patient contact list for marketing: paginated server-side
 * (GET /marketing/contacts/list), with a per-row "No marketing" switch so a
 * patient who asks to stop receiving messages can be excluded right here.
 */
const MarketingContactList: React.FC<Props> = ({ since, search, has, optedOut, onChanged }) => {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Any filter change starts again from page 1.
  useEffect(() => {
    setPage(1);
  }, [since, search, has, optedOut]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get('/marketing/contacts/list', {
          params: {
            page,
            limit: PAGE_SIZE,
            ...(since ? { since } : {}),
            ...(search ? { search } : {}),
            ...(has ? { has } : {}),
            ...(optedOut ? { opted_out: 'true' } : {}),
          },
        });
        if (cancelled) return;
        setRows(res.data.contacts || []);
        setTotal(res.data.total || 0);
      } catch (e) {
        if (!cancelled) setError(getApiError(e, 'Could not load the contact list.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [page, since, search, has, optedOut, reloadKey]);

  const toggleOptOut = async (c: ContactRow) => {
    const name = `${c.first_name} ${c.last_name}`.trim();
    const optOut = !optedOut;
    if (optOut) {
      const ok = await confirm({
        title: 'Stop marketing to this patient?',
        message: `${name} will be removed from the contact list and all future downloads. You can undo this under "Opted out".`,
        confirmLabel: 'Remove from list',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setBusyId(c.id);
    try {
      await apiClient.put(`/patients/${c.id}/marketing-opt-out`, { marketing_opt_out: optOut });
      showToast(optOut ? `${name} removed from marketing` : `${name} added back to marketing`, 'success');
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e) {
      showToast(getApiError(e, 'Could not update the marketing preference'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
      {error ? (
        <div className="p-8 text-center">
          <p className="text-ds-critical-text font-semibold">Couldn't load the contact list</p>
          <p className="text-ds-text-secondary text-sm mt-1">{error}</p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-4 px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-medium"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ds-subtle">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Name</th>
                  <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Phone</th>
                  <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Email</th>
                  <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Location</th>
                  <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Gender</th>
                  <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Last visit</th>
                  <th className="px-3 py-2"><span className="sr-only">Marketing</span></th>
                </tr>
              </thead>
              <tbody className={loading ? 'opacity-50' : ''}>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-ds-text-muted">
                      {loading ? 'Loading…' : optedOut ? 'No one has opted out.' : 'No contacts match.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => (
                    <tr key={c.id} className="border-t border-ds-border hover:bg-ds-subtle">
                      <td className="px-3 py-2">
                        <div className="text-ds-text font-medium">{`${c.first_name} ${c.last_name}`.trim() || '—'}</div>
                        <div className="text-xs text-ds-text-muted">{c.patient_number}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-ds-text-secondary">{c.phone || '—'}</td>
                      <td className="px-3 py-2 text-ds-text-secondary break-all">{c.email || '—'}</td>
                      <td className="px-3 py-2 text-ds-text-secondary">{[c.city, c.region].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-ds-text-secondary capitalize">{c.gender || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-ds-text-secondary">{fmtDate(c.last_visit)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => toggleOptOut(c)}
                          disabled={busyId === c.id}
                          className={`text-xs hover:underline disabled:opacity-50 ${optedOut ? 'text-ds-accent-text' : 'text-ds-text-muted'}`}
                          aria-label={optedOut ? `Add ${c.first_name} ${c.last_name} back to marketing` : `Stop marketing to ${c.first_name} ${c.last_name}`}
                        >
                          {optedOut ? 'Add back' : 'No marketing'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-ds-border text-sm text-ds-text-secondary">
            <span>
              {total === 0 ? '0 contacts' : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1 border border-ds-border-control rounded-lg hover:bg-ds-subtle disabled:opacity-40"
              >
                Previous
              </button>
              <span className="tabular-nums">
                Page {page} of {pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages || loading}
                className="px-3 py-1 border border-ds-border-control rounded-lg hover:bg-ds-subtle disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MarketingContactList;
