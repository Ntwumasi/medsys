import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';

interface DashboardStats {
  totalCustomers: number;
  syncedCustomers: number;
  unsyncedCustomers: number;
  totalInvoices: number;
  syncedInvoices: number;
  unsyncedInvoices: number;
  totalPayments: number;
  syncedPayments: number;
  pendingQueueItems: number;
  lastSyncTime: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'never_connected';
}

interface RecentActivity {
  id: number;
  sync_type: string;
  entity_type: string;
  direction: string;
  status: string;
  records_processed: number;
  error_details: string | null;
  completed_at: string;
}

const QBDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, activityRes] = await Promise.all([
        apiClient.get('/qb/dashboard'),
        apiClient.get('/quickbooks/sync-log?limit=10'),
      ]);
      setStats(statsRes.data);
      setRecentActivity(activityRes.data || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      await apiClient.post('/quickbooks/queue/customers');
      await apiClient.post('/quickbooks/queue/invoices');
      await loadDashboardData();
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      success: 'bg-ds-success-soft text-ds-success-text',
      completed: 'bg-ds-success-soft text-ds-success-text',
      failed: 'bg-ds-critical-soft text-ds-critical-text',
      error: 'bg-ds-critical-soft text-ds-critical-text',
      pending: 'bg-ds-warning-soft text-ds-warning-text',
      in_progress: 'bg-ds-accent-soft text-ds-accent-text',
    };
    return styles[status] || 'bg-ds-subtle text-ds-text-secondary';
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ds-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      <div className={`rounded-ds-card p-4 flex items-center justify-between ${
        stats?.connectionStatus === 'connected'
          ? 'bg-ds-success-soft border border-ds-success/30'
          : stats?.connectionStatus === 'disconnected'
          ? 'bg-ds-warning-soft border border-ds-warning-border'
          : 'bg-ds-subtle border border-ds-border'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            stats?.connectionStatus === 'connected' ? 'bg-ds-success' : 'bg-ds-border-control'
          }`}></div>
          <div>
            <p className="font-medium text-ds-text">
              {stats?.connectionStatus === 'connected'
                ? 'QuickBooks Connected'
                : stats?.connectionStatus === 'disconnected'
                ? 'QuickBooks Disconnected'
                : 'Never Connected'}
            </p>
            <p className="text-sm text-ds-text-muted">
              Last sync: {formatTime(stats?.lastSyncTime || null)}
            </p>
          </div>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing || stats?.connectionStatus !== 'connected'}
          className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {syncing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-ds-surface border-t-transparent"></div>
              Syncing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync All
            </>
          )}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Customers Card */}
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-ds-accent-soft rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-ds-success-soft text-ds-success-text">
              {stats?.syncedCustomers || 0} synced
            </span>
          </div>
          <p className="text-2xl font-bold text-ds-text">{stats?.totalCustomers || 0}</p>
          <p className="text-sm text-ds-text-muted">Total Customers</p>
          {(stats?.unsyncedCustomers || 0) > 0 && (
            <p className="text-xs text-ds-warning-text mt-1">
              {stats?.unsyncedCustomers} need syncing
            </p>
          )}
        </div>

        {/* Invoices Card */}
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-ds-accent-soft rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-ds-success-soft text-ds-success-text">
              {stats?.syncedInvoices || 0} synced
            </span>
          </div>
          <p className="text-2xl font-bold text-ds-text">{stats?.totalInvoices || 0}</p>
          <p className="text-sm text-ds-text-muted">Total Invoices</p>
          {(stats?.unsyncedInvoices || 0) > 0 && (
            <p className="text-xs text-ds-warning-text mt-1">
              {stats?.unsyncedInvoices} need syncing
            </p>
          )}
        </div>

        {/* Payments Card */}
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-ds-success-soft rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-ds-success-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-ds-success-soft text-ds-success-text">
              {stats?.syncedPayments || 0} synced
            </span>
          </div>
          <p className="text-2xl font-bold text-ds-text">{stats?.totalPayments || 0}</p>
          <p className="text-sm text-ds-text-muted">Total Payments</p>
        </div>

        {/* Queue Status Card */}
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-ds-warning-soft rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-ds-warning-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-ds-text">{stats?.pendingQueueItems || 0}</p>
          <p className="text-sm text-ds-text-muted">Pending Queue Items</p>
          {(stats?.pendingQueueItems || 0) > 0 && (
            <p className="text-xs text-ds-accent-text mt-1">
              Will sync on next Web Connector update
            </p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border">
        <div className="p-5 border-b border-ds-border">
          <h2 className="text-lg font-semibold text-ds-text">Recent Sync Activity</h2>
        </div>
        <div className="divide-y divide-border">
          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-ds-text-muted">
              No sync activity yet
            </div>
          ) : (
            recentActivity.map((activity) => (
              <div key={activity.id} className="p-4 flex items-center justify-between hover:bg-ds-subtle">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    activity.direction === 'push' ? 'bg-ds-accent-soft' : 'bg-ds-accent-soft'
                  }`}>
                    {activity.direction === 'push' ? (
                      <svg className="w-4 h-4 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-ds-text capitalize">
                      {activity.sync_type} {activity.entity_type}
                    </p>
                    <p className="text-sm text-ds-text-muted">
                      {activity.records_processed} records processed
                    </p>
                    {activity.error_details && activity.status === 'failed' && (
                      <p className="text-xs text-ds-critical-text mt-1">
                        {(() => {
                          try {
                            const parsed = typeof activity.error_details === 'string'
                              ? JSON.parse(activity.error_details)
                              : activity.error_details;
                            return parsed.message || parsed.hresult || String(activity.error_details);
                          } catch {
                            return String(activity.error_details);
                          }
                        })()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusBadge(activity.status)}`}>
                    {activity.status}
                  </span>
                  <span className="text-sm text-ds-text-muted">
                    {formatTime(activity.completed_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => window.location.href = '/qb/customers'}
          className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-5 text-left hover:shadow-card-hover transition-shadow"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-ds-accent-soft rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="font-medium text-ds-text">Sync Customers</span>
          </div>
          <p className="text-sm text-ds-text-muted">
            Push new patients to QuickBooks as customers
          </p>
        </button>

        <button
          onClick={() => window.location.href = '/qb/invoices'}
          className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-5 text-left hover:shadow-card-hover transition-shadow"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-ds-accent-soft rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-medium text-ds-text">Manage Invoices</span>
          </div>
          <p className="text-sm text-ds-text-muted">
            View, create, and sync invoices to QuickBooks
          </p>
        </button>

        <button
          onClick={() => window.location.href = '/qb/payments'}
          className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-5 text-left hover:shadow-card-hover transition-shadow"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-ds-success-soft rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-ds-success-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="font-medium text-ds-text">Record Payments</span>
          </div>
          <p className="text-sm text-ds-text-muted">
            Record payments and sync to QuickBooks
          </p>
        </button>
      </div>
    </div>
  );
};

export default QBDashboard;
