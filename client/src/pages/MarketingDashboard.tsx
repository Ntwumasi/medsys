import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO, isValid, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import AppLayout from '../components/AppLayout';
import AppSelect from '../components/ui/AppSelect';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { taskDueMeta } from '../utils/taskDue';
import { getApiError } from '../utils/apiError';
import MarketingContactList from '../components/MarketingContactList';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
});

interface TaskEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: true;
  resource: MarketingTask;
}

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
  created_by?: number | null;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];

/**
 * Marketing dashboard — the marketing task list (tasks assigned to marketing,
 * set up like the office-manager task list), a calendar of those tasks by
 * deadline, and the patient contact export. Marketing can add their own
 * tasks/reminders (a reminder is just a task with a deadline) and delete the
 * ones they added; admin-assigned tasks can only have their status changed.
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
  const { user } = useAuth();
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [view, setView] = useState<'tasks' | 'calendar' | 'contacts'>('tasks');

  // Add-task form (shared by the "Add task" button and clicking a calendar day)
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newRemarks, setNewRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedTask, setSelectedTask] = useState<MarketingTask | null>(null);
  const [contactSummary, setContactSummary] = useState<ContactSummary | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsSince, setContactsSince] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactHas, setContactHas] = useState<'' | 'phone' | 'email'>('');
  const [showOptedOut, setShowOptedOut] = useState(false);

  // Debounce the search box so the list (and its audit entry) follows typing
  // pauses, not every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setContactSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // quiet = refresh the counts without swapping the section for a spinner
  // (used after an opt-out change so the list below stays in place).
  const loadContacts = async (quiet = false) => {
    if (!quiet) setContactsLoading(true);
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
        params: {
          format: fileFormat,
          ...(contactsSince ? { since: contactsSince } : {}),
          ...(contactSearch ? { search: contactSearch } : {}),
          ...(contactHas ? { has: contactHas } : {}),
        },
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

  // Always fetch every status — the calendar needs them all; the list filters
  // client-side by the status chip.
  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/tasks', { params: { assignee_role: 'marketing' } });
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
  }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      await apiClient.put(`/admin/tasks/${id}`, { status });
      setSelectedTask((cur) => (cur && cur.id === id ? { ...cur, status: status as MarketingTask['status'] } : cur));
      load();
    } catch {
      showToast('Could not update the task status', 'error');
    }
  };

  const openAdd = (due = '') => {
    setNewTask('');
    setNewDue(due);
    setNewRemarks('');
    setShowAdd(true);
  };

  const saveTask = async () => {
    if (!newTask.trim()) return;
    setSaving(true);
    try {
      await apiClient.post('/admin/tasks', {
        category: 'Marketing',
        task: newTask.trim(),
        due_date: newDue || null,
        remarks: newRemarks.trim() || null,
        assigned_to: user?.id,
      });
      setShowAdd(false);
      showToast('Task added', 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not add the task'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (t: MarketingTask) => {
    const ok = await confirm({
      title: 'Delete task',
      message: `Delete "${t.task}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/admin/tasks/${t.id}`);
      setSelectedTask(null);
      showToast('Task deleted', 'success');
      load();
    } catch (e) {
      showToast(getApiError(e, 'Could not delete the task'), 'error');
    }
  };

  const canDelete = (t: MarketingTask) => !!user && t.created_by === user.id;

  const visibleTasks = statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);

  // Tasks with a deadline, as all-day calendar events on their due date.
  const events: TaskEvent[] = useMemo(
    () =>
      tasks
        .filter((t) => t.due_date)
        .map((t) => {
          const d = parseISO(t.due_date!.slice(0, 10));
          return { title: t.task, start: d, end: d, allDay: true as const, resource: t };
        }),
    [tasks]
  );

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
            { id: 'calendar' as const, label: 'Calendar' },
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
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="contact-search" className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <input
                  id="contact-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Name, phone or patient number"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">&nbsp;</p>
              </div>
              <div>
                <label htmlFor="contact-has" className="block text-sm font-medium text-gray-700 mb-1">Show</label>
                <select
                  id="contact-has"
                  value={contactHas}
                  onChange={(e) => setContactHas(e.target.value as '' | 'phone' | 'email')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Everyone</option>
                  <option value="phone">Has a phone number</option>
                  <option value="email">Has an email address</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">&nbsp;</p>
              </div>
            </div>

            {contactsLoading ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
                Loading contacts…
              </div>
            ) : contactsError ? (
              <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
                <p className="text-red-700 font-semibold">Couldn't load the contact list</p>
                <p className="text-gray-600 text-sm mt-1">{contactsError}</p>
                <button onClick={() => loadContacts()} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
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
                    Downloads match the search and filters above, and are recorded in the audit log. Patient contact
                    details — please keep the file safe and don't forward it outside the clinic.
                  </p>
                </div>

                <div className="flex gap-2">
                  {([
                    { opted: false, label: 'Contacts' },
                    { opted: true, label: `Opted out (${contactSummary.excluded_opted_out.toLocaleString()})` },
                  ]).map((o) => (
                    <button
                      key={o.label}
                      onClick={() => setShowOptedOut(o.opted)}
                      aria-pressed={showOptedOut === o.opted}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        showOptedOut === o.opted
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {showOptedOut && (
                  <p className="text-sm text-gray-600">
                    Patients who asked not to receive marketing. They never appear in downloads. Use "Add back" only if
                    one was switched off by mistake.
                  </p>
                )}

                <MarketingContactList
                  since={contactsSince}
                  search={contactSearch}
                  has={contactHas}
                  optedOut={showOptedOut}
                  onChanged={() => loadContacts(true)}
                />
              </>
            ) : null}
          </div>
        )}

        {view === 'tasks' && (
        <>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">My Tasks</h2>
            <p className="text-sm text-gray-600 mt-1">
              Marketing tasks and reminders. Give a task a deadline and it shows on the Calendar tab.
            </p>
          </div>
          <button
            onClick={() => openAdd()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            + Add task
          </button>
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
          ) : visibleTasks.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">No tasks yet.</div>
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
                    <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((t) => {
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
                        <td className="px-3 py-2 text-right">
                          {canDelete(t) && (
                            <button
                              onClick={() => deleteTask(t)}
                              className="text-xs text-danger-600 hover:underline"
                              aria-label={`Delete task ${t.task}`}
                            >
                              Delete
                            </button>
                          )}
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

        {view === 'calendar' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Calendar</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Your tasks on their deadlines. Click a day to add a reminder for it; click a task to update it.
                </p>
              </div>
              <button
                onClick={() => openAdd()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
              >
                + Add reminder
              </button>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#dc2626' }}></span> Overdue</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#d97706' }}></span> Due within 3 days</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#7c3aed' }}></span> Upcoming</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#9ca3af' }}></span> Complete</span>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto">
              <div style={{ height: 600, minWidth: 560 }}>
                <Calendar
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  views={['month', 'agenda']}
                  view={calendarView}
                  onView={(v: View) => setCalendarView(v)}
                  date={calendarDate}
                  onNavigate={(d: Date) => setCalendarDate(d)}
                  selectable
                  popup
                  onSelectSlot={(slot: { start: Date }) => openAdd(format(slot.start, 'yyyy-MM-dd'))}
                  onSelectEvent={(e: TaskEvent) => setSelectedTask(e.resource)}
                  eventPropGetter={(e: TaskEvent) => {
                    const done = e.resource.status === 'complete';
                    const level = taskDueMeta(e.resource.due_date, done, today).level;
                    const backgroundColor = done ? '#9ca3af' : level === 'overdue' ? '#dc2626' : level === 'soon' ? '#d97706' : '#7c3aed';
                    return { style: { backgroundColor, borderRadius: '4px', border: 'none' } };
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="add-task-title">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 id="add-task-title" className="text-lg font-semibold text-gray-900">Add task / reminder</h3>
            <div>
              <label htmlFor="new-task" className="block text-sm font-medium text-gray-700 mb-1">Task</label>
              <input
                id="new-task"
                autoFocus
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTask(); }}
                placeholder="e.g. Call Ecobank HR about staff health screening"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-due" className="block text-sm font-medium text-gray-700 mb-1">Deadline (optional)</label>
              <input
                id="new-due"
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-remarks" className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                id="new-remarks"
                value={newRemarks}
                onChange={(e) => setNewRemarks(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={saveTask}
                disabled={saving || !newTask.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onClick={() => setSelectedTask(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 id="task-detail-title" className="text-lg font-semibold text-gray-900">{selectedTask.task}</h3>
            <dl className="text-sm space-y-2">
              <div className="flex gap-2"><dt className="text-gray-500 w-20">Deadline</dt><dd className="text-gray-900">{fmt(selectedTask.due_date)}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-500 w-20">Category</dt><dd className="text-gray-900">{selectedTask.category}</dd></div>
              {selectedTask.remarks && (
                <div className="flex gap-2"><dt className="text-gray-500 w-20">Notes</dt><dd className="text-gray-900 whitespace-pre-wrap">{selectedTask.remarks}</dd></div>
              )}
            </dl>
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1">Status</span>
              <AppSelect
                value={selectedTask.status}
                onChange={(val) => updateStatus(selectedTask.id, val)}
                className="text-sm"
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="flex justify-between gap-2">
              {canDelete(selectedTask) ? (
                <button onClick={() => deleteTask(selectedTask)} className="px-4 py-2 text-sm text-danger-600 rounded-lg hover:bg-danger-50">
                  Delete
                </button>
              ) : <span />}
              <button onClick={() => setSelectedTask(null)} className="px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default MarketingDashboard;
