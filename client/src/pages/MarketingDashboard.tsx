import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO, isValid, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import AppLayout from '../components/AppLayout';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import '../styles/rbc-ds.css';
import AppSelect from '../components/ui/AppSelect';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { taskDueMeta } from '../utils/taskDue';
import { toDsClasses } from '../utils/dsClass';
import { getApiError } from '../utils/apiError';
import MarketingContactList from '../components/MarketingContactList';
import MarketingSmsCampaigns from '../components/MarketingSmsCampaigns';
import MarketingImportedContacts from '../components/MarketingImportedContacts';

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
  // On the "Care" design system: tokens, self-hosted fonts, light/dark.
  useDesignSystemPage();
  const { user } = useAuth();
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [view, setView] = useState<'tasks' | 'calendar' | 'contacts' | 'imported' | 'sms'>('tasks');

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
    <AppLayout title="Marketing" designSystem>
      <div>
        <nav aria-label="Marketing sections" className="flex gap-1 mb-6 border-b border-ds-border overflow-x-auto">
          {([
            { id: 'tasks' as const, label: 'My Tasks' },
            { id: 'calendar' as const, label: 'Calendar' },
            { id: 'contacts' as const, label: 'Patient Contacts' },
            { id: 'imported' as const, label: 'Imported Contacts' },
            { id: 'sms' as const, label: 'Bulk SMS' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? 'page' : undefined}
              className={`min-h-ds-control px-4 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors duration-ds-fast ${
                view === t.id
                  ? 'border-ds-accent text-ds-text font-bold'
                  : 'border-transparent text-ds-text-muted font-medium hover:text-ds-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {view === 'sms' && <MarketingSmsCampaigns />}
        {view === 'imported' && <MarketingImportedContacts />}

        {view === 'contacts' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-ds-text">Patient Contacts</h2>
              <p className="text-sm text-ds-text-secondary mt-1">
                Contact details for campaigns. Patients who have asked not to receive marketing are
                excluded automatically, as are merged duplicates and closed records.
              </p>
            </div>

            <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-ds-text-secondary mb-1">Seen since (optional)</label>
                <input
                  type="date"
                  value={contactsSince}
                  onChange={(e) => setContactsSince(e.target.value)}
                  className="border border-ds-border-control rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-ds-text-muted mt-1">Leave blank for all active patients.</p>
              </div>
              {contactsSince && (
                <button onClick={() => setContactsSince('')} className="text-sm text-ds-accent-text hover:underline pb-2">
                  Clear
                </button>
              )}
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="contact-search" className="block text-sm font-medium text-ds-text-secondary mb-1">Search</label>
                <input
                  id="contact-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Name, phone or patient number"
                  className="w-full border border-ds-border-control rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-ds-text-muted mt-1">&nbsp;</p>
              </div>
              <div>
                <label htmlFor="contact-has" className="block text-sm font-medium text-ds-text-secondary mb-1">Show</label>
                <select
                  id="contact-has"
                  value={contactHas}
                  onChange={(e) => setContactHas(e.target.value as '' | 'phone' | 'email')}
                  className="border border-ds-border-control rounded-lg px-3 py-2 text-sm bg-ds-surface"
                >
                  <option value="">Everyone</option>
                  <option value="phone">Has a phone number</option>
                  <option value="email">Has an email address</option>
                </select>
                <p className="text-xs text-ds-text-muted mt-1">&nbsp;</p>
              </div>
            </div>

            {contactsLoading ? (
              <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-12 text-center text-ds-text-muted">
                Loading contacts…
              </div>
            ) : contactsError ? (
              <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-critical-border p-8 text-center">
                <p className="text-ds-critical-text font-semibold">Couldn't load the contact list</p>
                <p className="text-ds-text-secondary text-sm mt-1">{contactsError}</p>
                <button onClick={() => loadContacts()} className="mt-4 px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-medium">
                  Try again
                </button>
              </div>
            ) : contactSummary ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Contacts', value: contactSummary.total, tone: 'text-ds-text' },
                    { label: 'With phone', value: contactSummary.with_phone, tone: 'text-ds-text' },
                    { label: 'With email', value: contactSummary.with_email, tone: 'text-ds-text' },
                    { label: 'Opted out', value: contactSummary.excluded_opted_out, tone: 'text-ds-text-muted' },
                  ].map((s) => (
                    <div key={s.label} className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4">
                      <p className="text-sm text-ds-text-muted">{s.label}</p>
                      <p className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value.toLocaleString()}</p>
                    </div>
                  ))}
                </div>

                {contactSummary.with_email < contactSummary.total && (
                  <p className="text-sm text-ds-text-secondary">
                    Only {contactSummary.with_email.toLocaleString()} of {contactSummary.total.toLocaleString()} have a
                    real email address on file — SMS reaches far more people than email does.
                  </p>
                )}

                <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4 flex flex-wrap gap-3 items-center">
                  <button
                    onClick={() => downloadContacts('csv')}
                    disabled={downloading}
                    className="px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-medium disabled:opacity-50"
                  >
                    {downloading ? 'Preparing…' : 'Download CSV'}
                  </button>
                  <button
                    onClick={() => downloadContacts('xlsx')}
                    disabled={downloading}
                    className="px-4 py-2 bg-ds-surface border border-ds-border-control text-ds-text-secondary rounded-lg hover:bg-ds-subtle text-sm font-medium disabled:opacity-50"
                  >
                    Download Excel
                  </button>
                  <p className="text-xs text-ds-text-muted">
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
                          ? 'bg-ds-accent text-ds-on-accent border-ds-accent'
                          : 'bg-ds-surface text-ds-text-secondary border-ds-border-control hover:bg-ds-subtle'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {showOptedOut && (
                  <p className="text-sm text-ds-text-secondary">
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
            <h2 className="text-xl font-semibold text-ds-text">My Tasks</h2>
            <p className="text-sm text-ds-text-secondary mt-1">
              Marketing tasks and reminders. Give a task a deadline and it shows on the Calendar tab.
            </p>
          </div>
          <button
            onClick={() => openAdd()}
            className="px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-medium"
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
                  ? 'bg-ds-accent text-ds-on-accent border-ds-accent'
                  : 'bg-ds-surface text-ds-text-secondary border-ds-border-control hover:bg-ds-subtle'
              }`}
            >
              {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && counts[s] !== undefined && (
                <span className="ml-2 text-xs opacity-75">{counts[s]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-ds-text-muted text-sm">Loading…</div>
          ) : visibleTasks.length === 0 ? (
            <div className="py-12 text-center text-ds-text-muted text-sm">No tasks yet.</div>
          ) : (
            <div className="overflow-x-auto">
              {/* Keeps columns readable on phones; the card scrolls sideways instead. */}
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-ds-subtle">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Task</th>
                    <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Category</th>
                    <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Deadline</th>
                    <th className="text-left px-3 py-2 font-semibold text-ds-text-secondary">Remarks</th>
                    <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((t) => {
                    const done = t.status === 'complete';
                    const due = taskDueMeta(t.due_date, done, today);
                    return (
                      <tr key={t.id} className={`border-t border-ds-border hover:bg-ds-subtle ${done ? 'bg-ds-subtle/60' : ''}`}>
                        <td className={`px-3 py-2 ${done ? 'text-ds-text-muted line-through' : 'text-ds-text'}`}>{t.task}</td>
                        <td className="px-3 py-2 text-ds-text-muted text-xs">{t.category}</td>
                        <td className="px-3 py-2">
                          <AppSelect
                            value={t.status}
                            onChange={(val) => updateStatus(t.id, val)}
                            className="text-xs cursor-pointer"
                            options={STATUS_OPTIONS}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-2 py-1 rounded border bg-ds-surface ${toDsClasses(due.inputCls)}`}>{fmt(t.due_date)}</span>
                          {due.badge && (
                            <span className={`ml-1 text-[10px] font-semibold uppercase ${due.level === 'overdue' ? 'text-ds-critical-text' : 'text-ds-warning-text'}`}>
                              {due.badge}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-ds-text-secondary text-xs max-w-xs truncate" title={t.remarks || ''}>
                          {t.remarks || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canDelete(t) && (
                            <button
                              onClick={() => deleteTask(t)}
                              className="text-xs text-ds-critical-text hover:underline"
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
                <h2 className="text-xl font-semibold text-ds-text">Calendar</h2>
                <p className="text-sm text-ds-text-secondary mt-1">
                  Your tasks on their deadlines. Click a day to add a reminder for it; click a task to update it.
                </p>
              </div>
              <button
                onClick={() => openAdd()}
                className="px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-medium"
              >
                + Add reminder
              </button>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-ds-text-secondary">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ds-critical"></span> Overdue</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ds-warning-soft border border-ds-warning-border"></span> Due within 3 days</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ds-accent"></span> Upcoming</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ds-subtle border border-ds-border"></span> Complete</span>
            </div>
            <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4 overflow-x-auto">
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
                    // Design-system tokens: overdue = critical, due soon = warning,
                    // upcoming = accent, done = muted. Each pairs a fill with a text
                    // colour that stays readable in light and dark.
                    const v = (token: string) => `rgb(var(--ds-${token}))`;
                    const [backgroundColor, color] = done
                      ? [v('subtle'), v('text-muted')]
                      : level === 'overdue'
                        ? [v('critical'), '#FFFFFF']
                        : level === 'soon'
                          ? [v('warning-soft'), v('warning-text')]
                          : [v('accent'), v('on-accent')];
                    return { style: { backgroundColor, color, borderRadius: '8px', border: 'none' } };
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="add-task-title">
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-md p-6 space-y-4">
            <h3 id="add-task-title" className="text-lg font-semibold text-ds-text">Add task / reminder</h3>
            <div>
              <label htmlFor="new-task" className="block text-sm font-medium text-ds-text-secondary mb-1">Task</label>
              <input
                id="new-task"
                autoFocus
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTask(); }}
                placeholder="e.g. Call Ecobank HR about staff health screening"
                className="w-full border border-ds-border-control rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-due" className="block text-sm font-medium text-ds-text-secondary mb-1">Deadline (optional)</label>
              <input
                id="new-due"
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-full border border-ds-border-control rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-remarks" className="block text-sm font-medium text-ds-text-secondary mb-1">Notes (optional)</label>
              <textarea
                id="new-remarks"
                value={newRemarks}
                onChange={(e) => setNewRemarks(e.target.value)}
                rows={3}
                className="w-full border border-ds-border-control rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-ds-text-secondary rounded-lg hover:bg-ds-subtle">
                Cancel
              </button>
              <button
                onClick={saveTask}
                disabled={saving || !newTask.trim()}
                className="px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onClick={() => setSelectedTask(null)}>
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 id="task-detail-title" className="text-lg font-semibold text-ds-text">{selectedTask.task}</h3>
            <dl className="text-sm space-y-2">
              <div className="flex gap-2"><dt className="text-ds-text-muted w-20">Deadline</dt><dd className="text-ds-text">{fmt(selectedTask.due_date)}</dd></div>
              <div className="flex gap-2"><dt className="text-ds-text-muted w-20">Category</dt><dd className="text-ds-text">{selectedTask.category}</dd></div>
              {selectedTask.remarks && (
                <div className="flex gap-2"><dt className="text-ds-text-muted w-20">Notes</dt><dd className="text-ds-text whitespace-pre-wrap">{selectedTask.remarks}</dd></div>
              )}
            </dl>
            <div>
              <span className="block text-sm font-medium text-ds-text-secondary mb-1">Status</span>
              <AppSelect
                value={selectedTask.status}
                onChange={(val) => updateStatus(selectedTask.id, val)}
                className="text-sm"
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="flex justify-between gap-2">
              {canDelete(selectedTask) ? (
                <button onClick={() => deleteTask(selectedTask)} className="px-4 py-2 text-sm text-ds-critical-text rounded-lg hover:bg-ds-critical-soft">
                  Delete
                </button>
              ) : <span />}
              <button onClick={() => setSelectedTask(null)} className="px-4 py-2 text-sm text-ds-text-secondary rounded-lg hover:bg-ds-subtle">
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
