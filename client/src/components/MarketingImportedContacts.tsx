import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { getApiError } from '../utils/apiError';

/**
 * Imported marketing contacts: people who are not patients (health-fair
 * sign-ups, company staff lists…), uploaded from an Excel or CSV file. They
 * never become patient records; Bulk SMS can target them.
 *
 * Upload flow: choose a file → the server previews what happens to every row
 * → confirm everyone agreed to receive marketing messages → import.
 */

interface Contact {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  created_at: string;
}

interface Summary {
  total: number;
  with_phone: number;
  with_email: number;
  opted_out: number;
}

interface ImportRecord {
  id: number;
  filename: string | null;
  source: string | null;
  rows_in_file: number;
  added: number;
  updated: number;
  skipped: number;
  still_listed: number;
  imported_by_name: string | null;
  created_at: string;
  removed_at: string | null;
}

interface PreviewRow {
  row: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  status: 'new' | 'update' | 'skip';
  reason?: string;
  also_patient?: boolean;
}

interface Preview {
  columns: Record<'first' | 'last' | 'full' | 'phone' | 'email', string | null>;
  summary: { rows_in_file: number; new: number; update: number; skipped: number; also_patients: number };
  rows: PreviewRow[];
}

const PAGE_SIZE = 50;

const fmtDate = (s: string | null): string => {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
};

/** 233244123456 → 024 412 3456 */
const fmtPhone = (p: string | null): string => {
  if (!p) return '—';
  const local = p.startsWith('233') ? `0${p.slice(3)}` : p;
  return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
};

const fullName = (c: { first_name: string | null; last_name: string | null }) =>
  `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—';

const ROW_STATUS: Record<PreviewRow['status'], { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-ds-success-soft text-ds-success-text' },
  update: { label: 'Already listed', className: 'bg-ds-info-soft text-ds-info-text' },
  skip: { label: 'Skipped', className: 'bg-ds-warning-soft text-ds-warning-text' },
};

const COLUMN_LABEL: Record<keyof Preview['columns'], string> = {
  full: 'Name',
  first: 'First name',
  last: 'Last name',
  phone: 'Phone',
  email: 'Email',
};

const inputClass = 'w-full border border-ds-border-control rounded-lg px-3 py-2 text-sm bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent';

const MarketingImportedContacts: React.FC = () => {
  const { showToast } = useNotification();
  const { confirm } = useDialog();

  // List
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sources, setSources] = useState<{ source: string; n: number }[]>([]);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [optedOut, setOptedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [imports, setImports] = useState<ImportRecord[]>([]);

  // Upload
  const [showImport, setShowImport] = useState(false);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [importSource, setImportSource] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, sourceFilter, optedOut]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get('/marketing/imported-contacts', {
          params: {
            page,
            limit: PAGE_SIZE,
            ...(search ? { search } : {}),
            ...(sourceFilter ? { source: sourceFilter } : {}),
            ...(optedOut ? { opted_out: 'true' } : {}),
          },
        });
        if (cancelled) return;
        setContacts(res.data.contacts || []);
        setTotal(res.data.total || 0);
        setSummary(res.data.summary || null);
        setSources(res.data.sources || []);
      } catch (e) {
        if (!cancelled) setError(getApiError(e, 'Could not load imported contacts.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [page, search, sourceFilter, optedOut, reloadKey]);

  const loadImports = useCallback(async () => {
    try {
      const res = await apiClient.get('/marketing/imported-contacts/imports');
      setImports(res.data.imports || []);
    } catch {
      setImports([]);
    }
  }, []);

  useEffect(() => {
    loadImports();
  }, [loadImports, reloadKey]);

  const resetImport = () => {
    setFile(null);
    setImportSource('');
    setPreview(null);
    setPreviewError(null);
    setConsent(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const runPreview = async (f: { name: string; base64: string }) => {
    setPreviewing(true);
    setPreview(null);
    setPreviewError(null);
    try {
      const res = await apiClient.post('/marketing/imported-contacts/import', { dataBase64: f.base64, filename: f.name });
      setPreview(res.data);
    } catch (e) {
      setPreviewError(getApiError(e, 'Could not read that file'));
    } finally {
      setPreviewing(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > 3 * 1024 * 1024) {
      setPreviewError('That file is over 3 MB. Split it into smaller files.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const f = { name: chosen.name, base64: result.includes(',') ? result.split(',')[1] : result };
      setFile(f);
      setConsent(false);
      runPreview(f);
    };
    reader.onerror = () => setPreviewError('Could not open that file');
    reader.readAsDataURL(chosen);
  };

  const doImport = async () => {
    if (!file || !preview) return;
    setImporting(true);
    try {
      const res = await apiClient.post('/marketing/imported-contacts/import', {
        dataBase64: file.base64,
        filename: file.name,
        source: importSource.trim() || null,
        consent: true,
        commit: true,
      });
      const { added, updated, skipped } = res.data;
      showToast(
        `Imported ${file.name}: ${added} added${updated ? `, ${updated} already listed` : ''}${skipped ? `, ${skipped} skipped` : ''}`,
        'success'
      );
      setShowImport(false);
      resetImport();
      setOptedOut(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      showToast(getApiError(e, 'Import failed — nothing was saved'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const toggleOptOut = async (c: Contact) => {
    const name = fullName(c);
    const optOut = !optedOut;
    if (optOut) {
      const ok = await confirm({
        title: 'Stop marketing to this contact?',
        message: `${name} won't receive any more campaigns, even if a later spreadsheet lists them again. You can undo this under "Opted out".`,
        confirmLabel: 'Stop marketing',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setBusyId(c.id);
    try {
      await apiClient.put(`/marketing/imported-contacts/${c.id}/opt-out`, { opted_out: optOut });
      showToast(optOut ? `${name} removed from marketing` : `${name} added back to marketing`, 'success');
      setReloadKey((k) => k + 1);
    } catch (e) {
      showToast(getApiError(e, 'Could not update the marketing preference'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removeImport = async (imp: ImportRecord) => {
    const ok = await confirm({
      title: 'Remove this upload?',
      message: `Deletes the ${imp.still_listed} contacts that ${imp.filename || 'this file'} added. Anyone who opted out is kept so they aren't added back later. This can't be undone.`,
      confirmLabel: 'Remove contacts',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await apiClient.post(`/marketing/imported-contacts/imports/${imp.id}/remove`);
      showToast(`Removed ${res.data.removed} contacts from ${imp.filename || 'that upload'}`, 'success');
      setReloadKey((k) => k + 1);
    } catch (e) {
      showToast(getApiError(e, 'Could not remove the upload'), 'error');
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const importable = preview ? preview.summary.new + preview.summary.update : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ds-text">Imported contacts</h2>
          <p className="text-sm text-ds-text-secondary mt-1">
            People who aren't patients — health-fair sign-ups, company staff lists — uploaded from Excel. They don't
            get a patient record. Text them from Bulk SMS.
          </p>
        </div>
        <button
          onClick={() => { resetImport(); setShowImport(true); }}
          className="min-h-ds-control px-4 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-medium"
        >
          Import from Excel
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Contacts', value: summary.total, tone: 'text-ds-text' },
            { label: 'With phone', value: summary.with_phone, tone: 'text-ds-text' },
            { label: 'With email', value: summary.with_email, tone: 'text-ds-text' },
            { label: 'Opted out', value: summary.opted_out, tone: 'text-ds-text-muted' },
          ].map((s) => (
            <div key={s.label} className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4">
              <p className="text-sm text-ds-text-muted">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="imported-search" className="block text-sm font-medium text-ds-text-secondary mb-1">Search</label>
          <input
            id="imported-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, phone or email"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="imported-source" className="block text-sm font-medium text-ds-text-secondary mb-1">From</label>
          <select id="imported-source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={inputClass}>
            <option value="">Every upload</option>
            {sources.map((s) => (
              <option key={s.source} value={s.source}>{s.source} ({s.n})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        {([
          { opted: false, label: 'Contacts' },
          { opted: true, label: `Opted out (${(summary?.opted_out ?? 0).toLocaleString()})` },
        ]).map((o) => (
          <button
            key={o.label}
            onClick={() => setOptedOut(o.opted)}
            aria-pressed={optedOut === o.opted}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              optedOut === o.opted
                ? 'bg-ds-accent text-ds-on-accent border-ds-accent'
                : 'bg-ds-surface text-ds-text-secondary border-ds-border-control hover:bg-ds-subtle'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <p className="text-ds-critical-text font-semibold">Couldn't load imported contacts</p>
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
                    <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">From</th>
                    <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Added</th>
                    <th className="px-3 py-2"><span className="sr-only">Marketing</span></th>
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-50' : ''}>
                  {contacts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-ds-text-muted">
                        {loading
                          ? 'Loading…'
                          : optedOut
                            ? 'No imported contact has opted out.'
                            : search || sourceFilter
                              ? 'No contacts match.'
                              : 'No contacts imported yet. Click “Import from Excel” to upload a list.'}
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c) => (
                      <tr key={c.id} className="border-t border-ds-border hover:bg-ds-subtle">
                        <td className="px-3 py-2 text-ds-text font-medium">{fullName(c)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-ds-text-secondary tabular-nums">{fmtPhone(c.phone)}</td>
                        <td className="px-3 py-2 text-ds-text-secondary break-all">{c.email || '—'}</td>
                        <td className="px-3 py-2 text-ds-text-secondary">{c.source || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-ds-text-secondary">{fmtDate(c.created_at)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => toggleOptOut(c)}
                            disabled={busyId === c.id}
                            className={`min-h-ds-control px-2 text-xs hover:underline disabled:opacity-50 ${optedOut ? 'text-ds-accent-text' : 'text-ds-text-muted'}`}
                            aria-label={optedOut ? `Add ${fullName(c)} back to marketing` : `Stop marketing to ${fullName(c)}`}
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
              <span>{total === 0 ? '0 contacts' : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1 border border-ds-border-control rounded-lg hover:bg-ds-subtle disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="tabular-nums">Page {page} of {pages}</span>
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

      {imports.length > 0 && (
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-x-auto">
          <h3 className="px-4 pt-4 text-base font-semibold text-ds-text">Uploads</h3>
          <table className="w-full text-sm mt-2">
            <thead className="bg-ds-subtle text-left text-ds-text-secondary">
              <tr>
                <th className="px-4 py-2">File</th>
                <th className="px-4 py-2">Result</th>
                <th className="px-4 py-2">By</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border">
              {imports.map((imp) => (
                <tr key={imp.id}>
                  <td className="px-4 py-2">
                    <div className="text-ds-text font-medium break-all">{imp.filename || '—'}</div>
                    {imp.source && <div className="text-xs text-ds-text-muted">{imp.source}</div>}
                  </td>
                  <td className="px-4 py-2 text-ds-text-secondary">
                    {imp.added} added · {imp.updated} already listed · {imp.skipped} skipped
                  </td>
                  <td className="px-4 py-2 text-ds-text-secondary whitespace-nowrap">
                    {imp.imported_by_name || '—'}
                    <div className="text-xs text-ds-text-muted">{fmtDate(imp.created_at)}</div>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {imp.removed_at ? (
                      <span className="text-xs text-ds-text-muted">Removed {fmtDate(imp.removed_at)}</span>
                    ) : imp.still_listed > 0 ? (
                      <button onClick={() => removeImport(imp)} className="min-h-ds-control px-2 text-xs text-ds-critical-text hover:underline">
                        Remove upload
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-3xl max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-ds-border">
              <h3 id="import-title" className="text-lg font-semibold text-ds-text">Import contacts from Excel</h3>
              <p className="text-sm text-ds-text-secondary mt-1">
                Excel (.xlsx, .xls) or CSV. Put headings in the first row — e.g. <strong>Name</strong>, <strong>Phone</strong>,{' '}
                <strong>Email</strong> (or First name / Last name). Each person needs a phone or an email.
              </p>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="import-file" className="block text-sm font-medium text-ds-text-secondary mb-1">Spreadsheet</label>
                  <input
                    id="import-file"
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={onFile}
                    className="block w-full text-sm text-ds-text-secondary file:mr-3 file:min-h-ds-control file:px-4 file:rounded-lg file:border-0 file:bg-ds-subtle file:text-ds-text file:font-medium hover:file:bg-ds-border"
                  />
                </div>
                <div>
                  <label htmlFor="import-source" className="block text-sm font-medium text-ds-text-secondary mb-1">Where are these contacts from? (optional)</label>
                  <input
                    id="import-source"
                    value={importSource}
                    onChange={(e) => setImportSource(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Health fair, Oct 2026"
                    className={inputClass}
                  />
                  <p className="text-xs text-ds-text-muted mt-1">Lets you text just this group later.</p>
                </div>
              </div>

              {previewing && <p className="text-sm text-ds-text-muted" role="status">Reading the file…</p>}
              {previewError && (
                <p className="text-sm text-ds-critical-text bg-ds-critical-soft border border-ds-critical-border rounded-lg p-3" role="alert">
                  {previewError}
                </p>
              )}

              {preview && (
                <>
                  <div className="p-3 bg-ds-subtle border border-ds-border rounded-lg text-sm space-y-1" aria-live="polite">
                    <div>
                      <strong>{preview.summary.rows_in_file}</strong> rows: <strong>{preview.summary.new}</strong> new,{' '}
                      <strong>{preview.summary.update}</strong> already listed, <strong>{preview.summary.skipped}</strong> skipped.
                    </div>
                    {preview.summary.also_patients > 0 && (
                      <div className="text-ds-text-secondary">
                        {preview.summary.also_patients} are also patients — they'll still only get one message per campaign.
                      </div>
                    )}
                    <div className="text-xs text-ds-text-muted">
                      Columns used:{' '}
                      {(Object.keys(COLUMN_LABEL) as (keyof Preview['columns'])[])
                        .filter((k) => preview.columns[k])
                        .map((k) => `${COLUMN_LABEL[k]} ← “${preview.columns[k]}”`)
                        .join(' · ')}
                    </div>
                  </div>

                  <div className="border border-ds-border rounded-lg overflow-x-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="bg-ds-subtle text-left text-ds-text-secondary sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Phone</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ds-border">
                        {preview.rows.map((r) => (
                          <tr key={r.row}>
                            <td className="px-3 py-1.5 tabular-nums text-ds-text-muted">{r.row}</td>
                            <td className="px-3 py-1.5 text-ds-text">{fullName(r)}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-ds-text-secondary">{fmtPhone(r.phone)}</td>
                            <td className="px-3 py-1.5 text-ds-text-secondary break-all">{r.email || '—'}</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROW_STATUS[r.status].className}`}>
                                {ROW_STATUS[r.status].label}
                              </span>
                              {r.reason && <div className="text-xs text-ds-text-secondary mt-0.5">{r.reason}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.summary.rows_in_file > preview.rows.length && (
                    <p className="text-xs text-ds-text-muted">
                      Showing {preview.rows.length} of {preview.summary.rows_in_file} rows (skipped rows first).
                    </p>
                  )}

                  {importable > 0 && (
                    <label className="flex items-start gap-3 p-3 border border-ds-border-control rounded-lg cursor-pointer min-h-ds-control">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0"
                      />
                      <span className="text-sm text-ds-text">
                        Everyone in this file agreed to receive marketing messages from the clinic. This confirmation is
                        recorded with your name.
                      </span>
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-ds-border flex justify-end gap-2">
              <button
                onClick={() => { setShowImport(false); resetImport(); }}
                className="min-h-ds-control px-4 text-sm text-ds-text-secondary rounded-lg hover:bg-ds-subtle"
              >
                Cancel
              </button>
              <button
                onClick={doImport}
                disabled={importing || previewing || !preview || importable === 0 || !consent}
                className="min-h-ds-control px-4 text-sm font-medium text-ds-on-accent bg-ds-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50"
              >
                {importing ? 'Importing…' : importable > 0 ? `Import ${importable} contacts` : 'Nothing to import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingImportedContacts;
