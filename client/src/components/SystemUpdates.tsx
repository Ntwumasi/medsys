import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { format, parseISO, isValid } from 'date-fns';
import { useNotification } from '../context/NotificationContext';

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

const SystemUpdates: React.FC = () => {
  const { showToast } = useNotification();
  const [updates, setUpdates] = useState<SystemUpdate[]>([]);
  const [stats, setStats] = useState<UpdateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<SystemUpdate | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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

      const response = await apiClient.get('/system-updates', { params });
      setUpdates(response.data.updates || []);
    } catch (error) {
      console.error('Error loading system updates:', error);
      showToast('Failed to load system updates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await apiClient.get('/system-updates/stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error loading update stats:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUpdate) {
        await apiClient.put(`/system-updates/${editingUpdate.id}`, formData);
        showToast('Update modified successfully', 'success');
      } else {
        await apiClient.post('/system-updates', formData);
        showToast('Update added successfully', 'success');
      }
      setShowForm(false);
      setEditingUpdate(null);
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
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to save update';
      showToast(errorMessage, 'error');
    }
  };

  const handleEdit = (update: SystemUpdate) => {
    setEditingUpdate(update);
    setFormData({
      title: update.title,
      description: update.description,
      category: update.category,
      status: update.status,
      version: update.version || '',
      update_date: update.update_date.split('T')[0],
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this update?')) return;
    try {
      await apiClient.delete(`/system-updates/${id}`);
      showToast('Update deleted successfully', 'success');
      loadUpdates();
      loadStats();
    } catch (error) {
      showToast('Failed to delete update', 'error');
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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{stats.features}</div>
            <div className="text-sm text-blue-600">Features</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{stats.improvements}</div>
            <div className="text-sm text-green-600">Improvements</div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
            <div className="text-2xl font-bold text-orange-700">{stats.bugfixes}</div>
            <div className="text-sm text-orange-600">Bug Fixes</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{stats.planned}</div>
            <div className="text-sm text-purple-600">Planned</div>
          </div>
        </div>
      )}

      {/* Header with filters and add button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="planned">Planned</option>
          </select>
        </div>
        <button
          onClick={() => {
            setEditingUpdate(null);
            setFormData({
              title: '',
              description: '',
              category: 'feature',
              status: 'completed',
              version: '',
              update_date: format(new Date(), 'yyyy-MM-dd'),
            });
            setShowForm(!showForm);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Update
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl p-6 border border-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {editingUpdate ? 'Edit Update' : 'Add New Update'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
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
            <div className="md:col-span-2">
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
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              {editingUpdate ? 'Save Changes' : 'Add Update'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingUpdate(null);
              }}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Timeline */}
      <div className="space-y-6">
        {sortedDates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium">No updates found</p>
            <p className="text-sm mt-1">Click "Add Update" to document your first system update.</p>
          </div>
        ) : (
          sortedDates.map((date) => (
            <div key={date} className="relative">
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md">
                  {formatDate(date)}
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-blue-200 to-transparent"></div>
              </div>

              {/* Updates for this date */}
              <div className="space-y-3 ml-4 border-l-2 border-blue-100 pl-6">
                {groupedUpdates[date].map((update) => (
                  <div
                    key={update.id}
                    className="relative bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-9 top-6 w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow"></div>

                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="font-semibold text-gray-900 text-lg">{update.title}</h4>
                          {update.version && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">
                              v{update.version}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed">{update.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {getCategoryBadge(update.category)}
                          {getStatusBadge(update.status)}
                          {update.created_by_name && (
                            <span className="text-xs text-gray-500">
                              by {update.created_by_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(update)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(update.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SystemUpdates;
