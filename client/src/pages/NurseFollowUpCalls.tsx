import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import NurseGuide from '../components/NurseGuide';
import type { ApiError } from '../types';

interface FollowUpTask {
  id: number;
  encounter_id: number;
  patient_id: number;
  type: 'follow_up' | 'review';
  scheduled_date: string;
  status: string;
  notes: string | null;
  call_status: string | null;
  review_reason: string | null;
  review_requested_by_name: string | null;
  patient_name: string;
  patient_phone: string;
  patient_number: string;
  encounter_number: string;
  chief_complaint: string;
  encounter_date: string;
  discharged_at: string;
  doctor_name: string | null;
  called_by_name: string | null;
}

interface TasksData {
  overdue: FollowUpTask[];
  due_today: FollowUpTask[];
  upcoming: FollowUpTask[];
  later: FollowUpTask[];
}

interface TaskCounts {
  overdue: number;
  due_today: number;
  upcoming: number;
  later: number;
  total: number;
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
  const [activeTab, setActiveTab] = useState<'follow_up' | 'review'>('follow_up');
  const [followUpTasks, setFollowUpTasks] = useState<TasksData | null>(null);
  const [followUpCounts, setFollowUpCounts] = useState<TaskCounts | null>(null);
  const [reviewTasks, setReviewTasks] = useState<TasksData | null>(null);
  const [reviewCounts, setReviewCounts] = useState<TaskCounts | null>(null);
  const [loading, setLoading] = useState(true);

  // Log call modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [loggingTask, setLoggingTask] = useState<FollowUpTask | null>(null);
  const [callStatus, setCallStatus] = useState('reached');
  const [patientNotes, setPatientNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const loadFollowUps = useCallback(async () => {
    try {
      const res = await apiClient.get('/nurse/follow-up-tasks?type=follow_up');
      setFollowUpTasks(res.data.tasks);
      setFollowUpCounts(res.data.counts);
    } catch (err) {
      console.error('Failed to load follow-ups:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const res = await apiClient.get('/nurse/follow-up-tasks?type=review');
      setReviewTasks(res.data.tasks);
      setReviewCounts(res.data.counts);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    }
  }, []);

  useEffect(() => {
    loadFollowUps();
    loadReviews();
  }, [loadFollowUps, loadReviews]);

  const openLogModal = (task: FollowUpTask) => {
    setLoggingTask(task);
    setCallStatus('reached');
    setPatientNotes('');
    setShowLogModal(true);
  };

  const handleLogCall = async () => {
    if (!loggingTask) return;
    setSubmitting(true);
    try {
      await apiClient.post('/nurse/follow-up-tasks/complete', {
        task_id: loggingTask.id,
        call_status: callStatus,
        notes: patientNotes,
      });
      showToast(`Call logged for ${loggingTask.patient_name}`, 'success');
      setShowLogModal(false);
      loadFollowUps();
      loadReviews();
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

  const renderTaskSection = (
    title: string,
    items: FollowUpTask[],
    badgeColor: string,
    dotColor: string,
    isReview: boolean
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
          {items.map((task) => (
            <div
              key={task.id}
              className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${
                isReview ? 'border-warning-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900">{task.patient_name}</span>
                    <span className="text-xs text-gray-500 font-mono">{task.patient_number}</span>
                    {isReview && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warning-100 text-warning-700 font-medium">Review</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    {task.patient_phone || 'No phone'}
                    {task.doctor_name && (
                      <span className="ml-2 text-gray-400">
                        Seen by {task.doctor_name}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">Complaint:</span> {task.chief_complaint || '—'}
                  </div>
                  {isReview && task.review_reason && (
                    <div className="text-sm text-warning-700 mt-1">
                      <span className="font-medium">Review reason:</span> {task.review_reason}
                      {task.review_requested_by_name && (
                        <span className="text-gray-400 ml-2">— Dr. {task.review_requested_by_name}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                    <span>Visit: {formatDate(task.encounter_date)}</span>
                    <span>Scheduled: {formatDate(task.scheduled_date)}</span>
                  </div>
                </div>
                <button
                  onClick={() => openLogModal(task)}
                  className={`px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0 ${
                    isReview ? 'bg-warning-600 hover:bg-warning-700' : 'bg-primary-600 hover:bg-primary-700'
                  }`}
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

  const currentTasks = activeTab === 'follow_up' ? followUpTasks : reviewTasks;
  const currentCounts = activeTab === 'follow_up' ? followUpCounts : reviewCounts;

  return (
    <AppLayout title="Follow-Up Calls">
      <div className="max-w-6xl mx-auto">
        {/* Help button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            How-To Guide
          </button>
        </div>

        <NurseGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />

        {/* Summary Cards */}
        {currentCounts && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Overdue</div>
              <div className="text-2xl font-bold text-danger-600">{currentCounts.overdue}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Due Today</div>
              <div className="text-2xl font-bold text-warning-600">{currentCounts.due_today}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Upcoming</div>
              <div className="text-2xl font-bold text-primary-600">{currentCounts.upcoming}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Total Pending</div>
              <div className="text-2xl font-bold text-gray-900">{currentCounts.total}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('follow_up')}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'follow_up'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Follow-Up
            {followUpCounts && followUpCounts.total > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                {followUpCounts.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'review'
                ? 'border-warning-600 text-warning-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Review
            {reviewCounts && reviewCounts.total > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-warning-100 text-warning-700 rounded-full">
                {reviewCounts.total}
              </span>
            )}
          </button>
        </div>

        {/* Task List */}
        <div>
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : currentTasks && currentCounts && currentCounts.total === 0 ? (
            <div className="text-center py-16">
              <svg className="w-16 h-16 mx-auto mb-4 text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-semibold text-gray-600">All caught up!</p>
              <p className="text-sm text-gray-400 mt-1">
                {activeTab === 'follow_up' ? 'No follow-up calls pending' : 'No review calls pending'}
              </p>
            </div>
          ) : currentTasks && (
            <>
              {renderTaskSection('Overdue', currentTasks.overdue, 'bg-danger-100 text-danger-700', 'bg-danger-500', activeTab === 'review')}
              {renderTaskSection('Due Today', currentTasks.due_today, 'bg-warning-100 text-warning-700', 'bg-warning-500', activeTab === 'review')}
              {renderTaskSection('Upcoming (Next 7 Days)', currentTasks.upcoming, 'bg-primary-100 text-primary-700', 'bg-primary-500', activeTab === 'review')}
              {renderTaskSection('Later', currentTasks.later, 'bg-gray-100 text-gray-700', 'bg-gray-400', activeTab === 'review')}
            </>
          )}
        </div>
      </div>

      {/* Log Call Modal */}
      {showLogModal && loggingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className={`px-6 py-4 ${
              loggingTask.type === 'review'
                ? 'bg-gradient-to-r from-warning-600 to-orange-600'
                : 'bg-gradient-to-r from-primary-600 to-secondary-600'
            }`}>
              <h3 className="text-lg font-bold text-white">
                Log {loggingTask.type === 'review' ? 'Review' : 'Follow-Up'} Call
              </h3>
              <p className="text-white/80 text-sm">
                {loggingTask.patient_name} — {loggingTask.patient_phone || 'No phone'}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Patient info summary */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
                <div><span className="font-medium">Doctor:</span> {loggingTask.doctor_name || '—'}</div>
                <div><span className="font-medium">Complaint:</span> {loggingTask.chief_complaint || '—'}</div>
                <div><span className="font-medium">Visit:</span> {formatDate(loggingTask.encounter_date)}</div>
                {loggingTask.review_reason && (
                  <div><span className="font-medium text-warning-700">Review reason:</span> {loggingTask.review_reason}</div>
                )}
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

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={patientNotes}
                  onChange={(e) => setPatientNotes(e.target.value)}
                  placeholder="e.g. Patient confirmed feeling better. Medication is working well."
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
