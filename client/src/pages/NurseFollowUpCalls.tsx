import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import type { ApiError } from '../types';

interface FollowUpItem {
  encounter_id: number;
  encounter_number: string;
  encounter_date: string;
  chief_complaint: string;
  follow_up_timeframe: string;
  follow_up_reason: string;
  follow_up_due_date: string;
  patient_id: number;
  patient_number: string;
  patient_name: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string;
  doctor_name: string | null;
  last_call_id: number | null;
  last_call_date: string | null;
  last_call_status: string | null;
  last_call_notes: string | null;
  next_review_date: string | null;
}

interface QueueData {
  overdue: FollowUpItem[];
  due_today: FollowUpItem[];
  upcoming: FollowUpItem[];
  later: FollowUpItem[];
  counts: {
    overdue: number;
    due_today: number;
    upcoming: number;
    later: number;
    total: number;
  };
}

interface CallLog {
  id: number;
  encounter_id: number;
  patient_id: number;
  call_date: string;
  call_status: string;
  patient_status_notes: string;
  called_by_name: string;
  patient_name: string;
  patient_number: string;
  patient_phone: string;
  chief_complaint: string;
  encounter_number: string;
  next_review_date: string | null;
}

const CALL_STATUSES = [
  { value: 'reached', label: 'Reached', color: 'bg-success-100 text-success-700' },
  { value: 'no_answer', label: 'No Answer', color: 'bg-warning-100 text-warning-700' },
  { value: 'voicemail', label: 'Voicemail', color: 'bg-primary-100 text-primary-700' },
  { value: 'wrong_number', label: 'Wrong Number', color: 'bg-danger-100 text-danger-700' },
  { value: 'busy', label: 'Busy', color: 'bg-gray-100 text-gray-700' },
];

const NurseFollowUpCalls: React.FC = () => {
  const { showToast } = useNotification();
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [history, setHistory] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Log call modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [loggingItem, setLoggingItem] = useState<FollowUpItem | null>(null);
  const [callStatus, setCallStatus] = useState('reached');
  const [patientNotes, setPatientNotes] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const res = await apiClient.get('/nurse/call-log/queue');
      setQueue(res.data);
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiClient.get('/nurse/call-log/history?limit=100');
      setHistory(res.data.call_logs || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    loadHistory();
  }, [loadQueue, loadHistory]);

  const openLogModal = (item: FollowUpItem) => {
    setLoggingItem(item);
    setCallStatus('reached');
    setPatientNotes('');
    setNextReviewDate('');
    setShowLogModal(true);
  };

  const handleLogCall = async () => {
    if (!loggingItem) return;
    setSubmitting(true);
    try {
      await apiClient.post('/nurse/call-log', {
        encounter_id: loggingItem.encounter_id,
        patient_id: loggingItem.patient_id,
        call_status: callStatus,
        patient_status_notes: patientNotes,
        next_review_date: nextReviewDate || null,
      });
      showToast(`Call logged for ${loggingItem.patient_name}`, 'success');
      setShowLogModal(false);
      loadQueue();
      loadHistory();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to log call', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch { return d; }
  };

  const renderQueueSection = (
    title: string,
    items: FollowUpItem[],
    badgeColor: string,
    dotColor: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <h3 className="text-sm font-bold text-gray-700 uppercase">{title}</h3>
          <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${badgeColor}`}>
            {items.length}
          </span>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.encounter_id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900">{item.patient_name}</span>
                    <span className="text-xs text-gray-500 font-mono">{item.patient_number}</span>
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    {item.patient_phone || 'No phone'}
                    {item.doctor_name && (
                      <span className="ml-2 text-gray-400">
                        Seen by {item.doctor_name}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">Complaint:</span> {item.chief_complaint || '—'}
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                    <span>Visit: {formatDate(item.encounter_date)}</span>
                    <span>Due: {formatDate(item.follow_up_due_date)}</span>
                    {item.follow_up_reason && (
                      <span>Reason: {item.follow_up_reason}</span>
                    )}
                  </div>
                  {item.last_call_id && (
                    <div className="mt-2 px-2 py-1 bg-gray-50 rounded text-xs text-gray-600 border border-gray-100">
                      Last call: {formatDate(item.last_call_date)} —{' '}
                      <span className="font-medium">{item.last_call_status?.replace('_', ' ')}</span>
                      {item.last_call_notes && ` — ${item.last_call_notes.substring(0, 80)}...`}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => openLogModal(item)}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors flex-shrink-0"
                >
                  Log Call
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <AppLayout title="Follow-Up Calls">
      <div className="max-w-6xl mx-auto">
        {/* Summary Cards */}
        {queue && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Overdue</div>
              <div className="text-2xl font-bold text-danger-600">{queue.counts.overdue}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Due Today</div>
              <div className="text-2xl font-bold text-warning-600">{queue.counts.due_today}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Upcoming</div>
              <div className="text-2xl font-bold text-primary-600">{queue.counts.upcoming}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Total Pending</div>
              <div className="text-2xl font-bold text-gray-900">{queue.counts.total}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'queue'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Call Queue
            {queue && queue.counts.total > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                {queue.counts.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Call History
          </button>
        </div>

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <div>
            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : queue && queue.counts.total === 0 ? (
              <div className="text-center py-16">
                <svg className="w-16 h-16 mx-auto mb-4 text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-semibold text-gray-600">All caught up!</p>
                <p className="text-sm text-gray-400 mt-1">No follow-up calls pending</p>
              </div>
            ) : queue && (
              <>
                {renderQueueSection('Overdue', queue.overdue, 'bg-danger-100 text-danger-700', 'bg-danger-500')}
                {renderQueueSection('Due Today', queue.due_today, 'bg-warning-100 text-warning-700', 'bg-warning-500')}
                {renderQueueSection('Upcoming (Next 7 Days)', queue.upcoming, 'bg-primary-100 text-primary-700', 'bg-primary-500')}
                {renderQueueSection('Later', queue.later, 'bg-gray-100 text-gray-700', 'bg-gray-400')}
              </>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg font-semibold">No calls logged yet</p>
                <p className="text-sm mt-1">Call logs will appear here after you log your first call</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Complaint</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Called By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((log) => {
                      const statusMeta = CALL_STATUSES.find((s) => s.value === log.call_status);
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">{formatDate(log.call_date)}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{log.patient_name}</div>
                            <div className="text-xs text-gray-500">{log.patient_number}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{log.patient_phone || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{log.chief_complaint || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusMeta?.color || 'bg-gray-100 text-gray-700'}`}>
                              {statusMeta?.label || log.call_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-[250px]">
                            <div className="truncate">{log.patient_status_notes || '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{log.called_by_name}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log Call Modal */}
      {showLogModal && loggingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white">Log Follow-Up Call</h3>
              <p className="text-primary-100 text-sm">
                {loggingItem.patient_name} — {loggingItem.patient_phone || 'No phone'}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Patient info summary */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
                <div><span className="font-medium">Doctor:</span> {loggingItem.doctor_name || '—'}</div>
                <div><span className="font-medium">Complaint:</span> {loggingItem.chief_complaint || '—'}</div>
                <div><span className="font-medium">Visit:</span> {formatDate(loggingItem.encounter_date)}</div>
              </div>

              {/* Call Status */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Call Status *</label>
                <div className="grid grid-cols-3 gap-2">
                  {CALL_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setCallStatus(s.value)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        callStatus === s.value
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Patient Status & Recommendation */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Patient's Status & Recommendation
                </label>
                <textarea
                  rows={3}
                  value={patientNotes}
                  onChange={(e) => setPatientNotes(e.target.value)}
                  placeholder="e.g. Patient confirmed he feels much better and does not hear voices anymore."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                />
              </div>

              {/* Next Review Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Next Review Date (optional)
                </label>
                <input
                  type="date"
                  value={nextReviewDate}
                  onChange={(e) => setNextReviewDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowLogModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLogCall}
                disabled={submitting}
                className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Log Call'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default NurseFollowUpCalls;
