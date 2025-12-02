import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, parseISO, isValid } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface SystemUpdate {
  id: number;
  title: string;
  description: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'planned';
  status: 'planned' | 'in_progress' | 'completed';
  version?: string;
  update_date: string;
  created_by_name?: string;
  created_at: string;
}

interface UpdateStats {
  total_updates: number;
  features: number;
  improvements: number;
  bugfixes: number;
  planned: number;
  in_progress: number;
  completed: number;
  latest_update_date: string;
}

const PublicUpdates: React.FC = () => {
  const [updates, setUpdates] = useState<SystemUpdate[]>([]);
  const [stats, setStats] = useState<UpdateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'feature',
    status: 'completed',
    version: '',
    update_date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    loadUpdates();
    loadStats();
  }, [filterCategory, filterStatus]);

  const loadUpdates = async () => {
    try {
      const params: any = {};
      if (filterCategory !== 'all') params.category = filterCategory;
      if (filterStatus !== 'all') params.status = filterStatus;

      const response = await axios.get(`${API_URL}/system-updates`, { params });
      setUpdates(response.data.updates || []);
    } catch (error) {
      console.error('Error loading system updates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/system-updates/stats`);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error loading update stats:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/system-updates`, formData);
      setSubmitSuccess(true);
      setShowForm(false);
      setFormData({
        title: '',
        description: '',
        category: 'feature',
        status: 'completed',
        version: '',
        update_date: format(new Date(), 'yyyy-MM-dd'),
      });
      loadUpdates();
      loadStats();
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to add update');
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const badges: { [key: string]: { bg: string; text: string; label: string } } = {
      feature: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Feature' },
      improvement: { bg: 'bg-green-100', text: 'text-green-800', label: 'Improvement' },
      bugfix: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Bug Fix' },
      planned: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Planned' },
    };
    const badge = badges[category] || badges.feature;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: { bg: string; text: string; label: string } } = {
      completed: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Completed' },
      in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'In Progress' },
      planned: { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Planned' },
    };
    const badge = badges[status] || badges.completed;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isValid(date)) {
        return format(date, 'MMM d, yyyy');
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Group updates by date
  const groupedUpdates = updates.reduce((groups: { [key: string]: SystemUpdate[] }, update) => {
    const date = update.update_date.split('T')[0];
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(update);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedUpdates).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">MedSys Updates</h1>
            <p className="text-blue-100 mt-2 text-sm sm:text-base">System changelog and roadmap</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Success Message */}
        {submitSuccess && (
          <div className="mb-6 p-4 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-center font-medium">
            Update added successfully!
          </div>
        )}

        {/* Stats Cards - Mobile Responsive Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm">
              <div className="text-2xl sm:text-3xl font-bold text-blue-700">{stats.features}</div>
              <div className="text-xs sm:text-sm text-blue-600">Features</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-green-200 shadow-sm">
              <div className="text-2xl sm:text-3xl font-bold text-green-700">{stats.improvements}</div>
              <div className="text-xs sm:text-sm text-green-600">Improvements</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-orange-200 shadow-sm">
              <div className="text-2xl sm:text-3xl font-bold text-orange-700">{stats.bugfixes}</div>
              <div className="text-xs sm:text-sm text-orange-600">Bug Fixes</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-purple-200 shadow-sm">
              <div className="text-2xl sm:text-3xl font-bold text-purple-700">{stats.planned}</div>
              <div className="text-xs sm:text-sm text-purple-600">Planned</div>
            </div>
          </div>
        )}

        {/* Filters and Add Button - Mobile Responsive */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Categories</option>
              <option value="feature">Features</option>
              <option value="improvement">Improvements</option>
              <option value="bugfix">Bug Fixes</option>
              <option value="planned">Planned</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="planned">Planned</option>
            </select>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Update
          </button>
        </div>

        {/* Add Form - Mobile Responsive */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Update</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="e.g., Added voice dictation feature"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                  placeholder="Describe the update in detail..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="feature">Feature</option>
                    <option value="improvement">Improvement</option>
                    <option value="bugfix">Bug Fix</option>
                    <option value="planned">Planned</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="completed">Completed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="planned">Planned</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1.2.0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={formData.update_date}
                    onChange={(e) => setFormData({ ...formData, update_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Update'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Timeline - Mobile Responsive */}
        <div className="space-y-6">
          {sortedDates.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium text-gray-600">No updates found</p>
              <p className="text-sm text-gray-500 mt-1">Click "Add Update" to document your first system update.</p>
            </div>
          ) : (
            sortedDates.map((date) => (
              <div key={date} className="relative">
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-sm sm:text-base shadow-md">
                    {formatDate(date)}
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-blue-200 to-transparent"></div>
                </div>

                {/* Updates for this date */}
                <div className="space-y-3 ml-0 sm:ml-4 sm:border-l-2 sm:border-blue-100 sm:pl-6">
                  {groupedUpdates[date].map((update) => (
                    <div
                      key={update.id}
                      className="relative bg-white rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Timeline dot - hidden on mobile */}
                      <div className="hidden sm:block absolute -left-9 top-6 w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow"></div>

                      <div className="space-y-3">
                        {/* Title and Version */}
                        <div className="flex flex-wrap items-start gap-2">
                          <h4 className="font-semibold text-gray-900 text-base sm:text-lg flex-1">{update.title}</h4>
                          {update.version && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono shrink-0">
                              v{update.version}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        <p className="text-gray-600 text-sm leading-relaxed">{update.description}</p>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          {getCategoryBadge(update.category)}
                          {getStatusBadge(update.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center text-gray-500 text-sm">
          <p>MedSys EMR - Electronic Medical Record System</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicUpdates;
