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
const MarketingDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
      </div>
    </AppLayout>
  );
};

export default MarketingDashboard;
