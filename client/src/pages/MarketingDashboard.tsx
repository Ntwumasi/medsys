import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import AppLayout from '../components/AppLayout';
import AppSelect from '../components/ui/AppSelect';
import apiClient from '../api/client';
import { taskDueMeta } from '../utils/taskDue';

interface MarketingTask {
  id: number;
  category: string;
  task: string;
  contact_person: string | null;
  responsibility: string | null;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  remarks: string | null;
  cost: string | null;
  due_date: string | null;
  assigned_to_name?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];

/**
 * Marketing dashboard — a minimal role whose only surface is the marketing task
 * list (tasks assigned to marketing, set up like the office-manager task list).
 * The server scopes GET /admin/tasks to marketing-assigned tasks for a marketing
 * session, so this also works when a super admin previews via the role picker.
 */
interface ContactSummary {
  total: number;
  with_phone: number;
  with_email: number;
  excluded_opted_out: number;
}

const MarketingDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [view, setView] = useState<'tasks' | 'contacts'>('tasks');
  const [contactSummary, setContactSummary] = useState<ContactSummary | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsSince, setContactsSince] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  const loadContacts = async () => {
    setContactsLoading(true);
    setContactsError(null);
    try {
      const res = await apiClient.get('/marketing/contacts', {
        params: contactsSince ? { since: contactsSince } : {},
      });
      setContactSummary({
        total: res.data.total,
        with_phone: res.data.with_phone,
        with_email: res.data.with_email,
        excluded_opted_out: res.data.excluded_opted_out,
      });
    } catch (e: any) {
      setContactsError(
        e.response?.status === 403
          ? "Your account doesn't have permission to view the patient contact list."
          : e.response?.data?.error || 'Could not load the contact list.'
      );
      setContactSummary(null);
    } finally {
      setContactsLoading(false);
    }
  };

  const downloadContacts = async (fileFormat: 'csv' | 'xlsx') => {
    setDownloading(true);
    try {
      const res = await apiClient.get('/marketing/contacts/export', {
        params: { format: fileFormat, ...(contactsSince ? { since: contactsSince } : {}) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `patient_contacts_${new Date().toISOString().slice(0, 10)}.${fileFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setContactsError(e.response?.data?.error || 'The download failed.');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (view === 'contacts') loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, contactsSince]);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { assignee_role: 'marketing' };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await apiClient.get('/admin/tasks', { params });
      setTasks(res.data.tasks || []);
      setCounts(res.data.counts || {});
    } catch (e) {
      console.error('Error loading marketing tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const updateStatus = async (id: number, status: string) => {
    try {
      await apiClient.put(`/admin/tasks/${id}`, { status });
      load();
    } catch {
      /* ignore — the select simply reverts on next load */
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const fmt = (s?: string | null): string => {
    if (!s) return '—';
    try {
      const d = parseISO(s);
      return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
    } catch {
      return '—';
    }
  };

  return (
    <AppLayout title="Marketing">
      <div className="max-w-6xl mx-auto">
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {([
            { id: 'tasks' as const, label: 'My Tasks' },
            { id: 'contacts' as const, label: 'Patient Contacts' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === t.id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view === 'contacts' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Patient Contacts</h2>
              <p className="text-sm text-gray-600 mt-1">
                Contact details for campaigns. Patients who have asked not to receive marketing are
                excluded automatically, as are merged duplicates and closed records.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seen since (optional)</label>
                <input
                  type="date"
                  value={contactsSince}
                  onChange={(e) => setContactsSince(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for all active patients.</p>
              </div>
              {contactsSince && (
                <button onClick={() => setContactsSince('')} className="text-sm text-primary-600 hover:underline pb-2">
                  Clear
                </button>
              )}
            </div>

            {contactsLoading ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
                Loading contacts…
              </div>
            ) : contactsError ? (
              <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
                <p className="text-red-700 font-semibold">Couldn't load the contact list</p>
                <p className="text-gray-600 text-sm mt-1">{contactsError}</p>
                <button onClick={loadContacts} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                  Try again
                </button>
              </div>
            ) : contactSummary ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Contacts', value: contactSummary.total, tone: 'text-gray-900' },
                    { label: 'With phone', value: contactSummary.with_phone, tone: 'text-gray-900' },
                    { label: 'With email', value: contactSummary.with_email, tone: 'text-gray-900' },
                    { label: 'Opted out', value: contactSummary.excluded_opted_out, tone: 'text-gray-500' },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">{s.label}</p>
                      <p className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value.toLocaleString()}</p>
                    </div>
                  ))}
                </div>

                {contactSummary.with_email < contactSummary.total && (
                  <p className="text-sm text-gray-600">
                    Only {contactSummary.with_email.toLocaleString()} of {contactSummary.total.toLocaleString()} have a
                    real email address on file — SMS reaches far more people than email does.
                  </p>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
                  <button
                    onClick={() => downloadContacts('csv')}
                    disabled={downloading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                  >
                    {downloading ? 'Preparing…' : 'Download CSV'}
                  </button>
                  <button
                    onClick={() => downloadContacts('xlsx')}
                    disabled={downloading}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
                  >
                    Download Excel
                  </button>
                  <p className="text-xs text-gray-500">
                    Downloads are recorded in the audit log. Patient contact details — please keep the file safe and
                    don't forward it outside the clinic.
                  </p>
                </div>
              </>
            ) : null}
          </div>
        )}

        {view === 'tasks' && (
        <>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">My Tasks</h2>
          <p className="text-sm text-gray-600 mt-1">
            Marketing tasks assigned to you — soonest deadline first.
          </p>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'pending', 'in_progress', 'blocked', 'complete'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && counts[s] !== undefined && (
                <span className="ml-2 text-xs opacity-75">{counts[s]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">No tasks assigned.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Task</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Category</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Deadline</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => {
                    const done = t.status === 'complete';
                    const due = taskDueMeta(t.due_date, done, today);
                    return (
                      <tr key={t.id} className={`border-t border-gray-100 hover:bg-gray-50 ${done ? 'bg-gray-50/60' : ''}`}>
                        <td className={`px-3 py-2 ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.task}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{t.category}</td>
                        <td className="px-3 py-2">
                          <AppSelect
                            value={t.status}
                            onChange={(val) => updateStatus(t.id, val)}
                            className="text-xs cursor-pointer"
                            options={STATUS_OPTIONS}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-2 py-1 rounded border bg-white ${due.inputCls}`}>{fmt(t.due_date)}</span>
                          {due.badge && (
                            <span className={`ml-1 text-[10px] font-semibold uppercase ${due.level === 'overdue' ? 'text-danger-600' : 'text-amber-600'}`}>
                              {due.badge}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs max-w-xs truncate" title={t.remarks || ''}>
                          {t.remarks || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </AppLayout>
  );
};

export default MarketingDashboard;
