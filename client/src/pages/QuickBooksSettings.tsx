import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import { useNotification } from '../context/NotificationContext';

interface ConnectionStatus {
  connected: boolean;
  configured: boolean;
  companyName?: string;
  lastSyncAt?: string;
  syncEnabled: boolean;
  autoSyncInvoices: boolean;
  autoSyncPayments: boolean;
  tokenExpired: boolean;
}

interface SyncResult {
  processed: number;
  succeeded: number;
  failed: number;
}

interface SyncLog {
  id: number;
  sync_type: string;
  entity_type: string;
  direction: string;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  started_at: string;
  completed_at: string;
  status: string;
  error_details?: object;
  created_by_name?: string;
}

interface SyncMapping {
  id: number;
  entity_type: string;
  medsys_id: number;
  quickbooks_id: string;
  last_synced_at: string;
  sync_status: string;
  error_message?: string;
}

const QuickBooksSettings: React.FC = () => {
  const { showToast } = useNotification();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [mappings, setMappings] = useState<SyncMapping[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'logs' | 'mappings'>('status');
  const [mappingFilter, setMappingFilter] = useState<string>('');

  useEffect(() => {
    loadStatus();
    loadSyncLogs();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await apiClient.get('/quickbooks/status');
      setStatus(response.data);
    } catch (error) {
      console.error('Error loading QB status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncLogs = async () => {
    try {
      const response = await apiClient.get('/quickbooks/sync-log');
      setSyncLogs(response.data);
    } catch (error) {
      console.error('Error loading sync logs:', error);
    }
  };

  const loadMappings = async (entityType?: string) => {
    try {
      const params = entityType ? { entityType } : {};
      const response = await apiClient.get('/quickbooks/mappings', { params });
      setMappings(response.data);
    } catch (error) {
      console.error('Error loading mappings:', error);
    }
  };

  const handleConnect = async () => {
    try {
      const response = await apiClient.get('/quickbooks/auth-url');
      window.location.href = response.data.authUrl;
    } catch (error) {
      showToast('Failed to initiate QuickBooks connection', 'error');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect from QuickBooks? All sync mappings will be removed.')) {
      return;
    }

    try {
      await apiClient.post('/quickbooks/disconnect');
      showToast('Disconnected from QuickBooks', 'success');
      loadStatus();
    } catch (error) {
      showToast('Failed to disconnect', 'error');
    }
  };

  const handleSync = async (type: string) => {
    setSyncing(type);
    try {
      let response;
      switch (type) {
        case 'customers':
          response = await apiClient.post('/quickbooks/sync/customers');
          break;
        case 'items':
          response = await apiClient.post('/quickbooks/sync/items');
          break;
        case 'invoices':
          response = await apiClient.post('/quickbooks/sync/invoices');
          break;
        case 'payments':
          response = await apiClient.post('/quickbooks/sync/payments');
          break;
        case 'full':
          response = await apiClient.post('/quickbooks/sync/full');
          break;
        default:
          return;
      }

      const result = response.data;
      if (type === 'full') {
        showToast(`Full sync completed`, 'success');
      } else {
        const r = result as SyncResult;
        showToast(`Synced ${r.succeeded}/${r.processed} ${type}`, r.failed > 0 ? 'warning' : 'success');
      }

      loadStatus();
      loadSyncLogs();
    } catch (error) {
      showToast(`Failed to sync ${type}`, 'error');
    } finally {
      setSyncing(null);
    }
  };

  const handleUpdateSettings = async (key: string, value: boolean) => {
    try {
      await apiClient.put('/quickbooks/settings', { [key]: value });
      setStatus(prev => prev ? { ...prev, [key]: value } : null);
      showToast('Settings updated', 'success');
    } catch (error) {
      showToast('Failed to update settings', 'error');
    }
  };

  const handleDeleteMapping = async (id: number) => {
    if (!confirm('Delete this mapping? The entity will be re-synced on next sync.')) {
      return;
    }

    try {
      await apiClient.delete(`/quickbooks/mappings/${id}`);
      setMappings(prev => prev.filter(m => m.id !== id));
      showToast('Mapping deleted', 'success');
    } catch (error) {
      showToast('Failed to delete mapping', 'error');
    }
  };

  // Check for URL params from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      showToast('Successfully connected to QuickBooks!', 'success');
      window.history.replaceState({}, '', '/quickbooks');
      loadStatus();
    } else if (params.get('error')) {
      showToast(`Connection failed: ${params.get('error')}`, 'error');
      window.history.replaceState({}, '', '/quickbooks');
    }
  }, []);

  if (loading) {
    return (
      <AppLayout title="QuickBooks Integration">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="QuickBooks Integration">
      <div className="space-y-6">
        {/* Connection Status Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Connection Status</h2>
              <div className="mt-2 flex items-center gap-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  status?.connected
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <span className={`w-2 h-2 rounded-full mr-2 ${
                    status?.connected ? 'bg-green-500' : 'bg-gray-400'
                  }`}></span>
                  {status?.connected ? 'Connected' : 'Not Connected'}
                </span>
                {status?.connected && status.companyName && (
                  <span className="text-gray-600">
                    {status.companyName}
                  </span>
                )}
              </div>
              {status?.connected && status.lastSyncAt && (
                <p className="mt-1 text-sm text-gray-500">
                  Last synced: {format(new Date(status.lastSyncAt), 'MMM d, yyyy h:mm a')}
                </p>
              )}
              {status?.tokenExpired && status?.connected && (
                <p className="mt-1 text-sm text-red-600">
                  Token expired - please reconnect
                </p>
              )}
            </div>
            <div>
              {status?.connected ? (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={!status?.configured}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Connect to QuickBooks
                </button>
              )}
            </div>
          </div>

          {!status?.configured && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Configuration Required:</strong> QuickBooks API credentials are not configured.
                Please set the following environment variables:
              </p>
              <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
                <li>QUICKBOOKS_CLIENT_ID</li>
                <li>QUICKBOOKS_CLIENT_SECRET</li>
                <li>QUICKBOOKS_REDIRECT_URI</li>
              </ul>
            </div>
          )}
        </div>

        {/* Sync Controls - Only show when connected */}
        {status?.connected && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Sync Controls</h2>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <button
                onClick={() => handleSync('customers')}
                disabled={syncing !== null}
                className="px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium disabled:opacity-50"
              >
                {syncing === 'customers' ? 'Syncing...' : 'Sync Customers'}
              </button>
              <button
                onClick={() => handleSync('items')}
                disabled={syncing !== null}
                className="px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 font-medium disabled:opacity-50"
              >
                {syncing === 'items' ? 'Syncing...' : 'Sync Items'}
              </button>
              <button
                onClick={() => handleSync('invoices')}
                disabled={syncing !== null}
                className="px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium disabled:opacity-50"
              >
                {syncing === 'invoices' ? 'Syncing...' : 'Sync Invoices'}
              </button>
              <button
                onClick={() => handleSync('payments')}
                disabled={syncing !== null}
                className="px-4 py-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 font-medium disabled:opacity-50"
              >
                {syncing === 'payments' ? 'Syncing...' : 'Sync Payments'}
              </button>
              <button
                onClick={() => handleSync('full')}
                disabled={syncing !== null}
                className="px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50"
              >
                {syncing === 'full' ? 'Syncing...' : 'Full Sync'}
              </button>
            </div>

            {/* Auto-sync Settings */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Auto-Sync Settings</h3>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={status.syncEnabled}
                    onChange={(e) => handleUpdateSettings('syncEnabled', e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Sync Enabled</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={status.autoSyncInvoices}
                    onChange={(e) => handleUpdateSettings('autoSyncInvoices', e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Auto-sync new invoices</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={status.autoSyncPayments}
                    onChange={(e) => handleUpdateSettings('autoSyncPayments', e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Auto-sync new payments</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Tabs for Logs and Mappings */}
        {status?.connected && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'logs'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Sync History
                </button>
                <button
                  onClick={() => {
                    setActiveTab('mappings');
                    loadMappings(mappingFilter || undefined);
                  }}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'mappings'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Entity Mappings
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'logs' && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Processed</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Succeeded</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Failed</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {syncLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            No sync history yet
                          </td>
                        </tr>
                      ) : (
                        syncLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {format(new Date(log.started_at), 'MMM d, h:mm a')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 capitalize">{log.sync_type}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 capitalize">{log.entity_type}</td>
                            <td className="px-4 py-3 text-sm text-center text-gray-600">{log.records_processed}</td>
                            <td className="px-4 py-3 text-sm text-center text-green-600">{log.records_succeeded}</td>
                            <td className="px-4 py-3 text-sm text-center text-red-600">{log.records_failed}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                log.status === 'completed' ? 'bg-green-100 text-green-800' :
                                log.status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'mappings' && (
                <div>
                  <div className="mb-4">
                    <select
                      value={mappingFilter}
                      onChange={(e) => {
                        setMappingFilter(e.target.value);
                        loadMappings(e.target.value || undefined);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">All Entity Types</option>
                      <option value="patient">Customers (Patients)</option>
                      <option value="service">Items (Services)</option>
                      <option value="invoice">Invoices</option>
                      <option value="payment">Payments</option>
                    </select>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MedSys ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">QB ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Synced</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {mappings.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                              No mappings found
                            </td>
                          </tr>
                        ) : (
                          mappings.map((mapping) => (
                            <tr key={mapping.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-600 capitalize">{mapping.entity_type}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{mapping.medsys_id}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{mapping.quickbooks_id}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {mapping.last_synced_at ? format(new Date(mapping.last_synced_at), 'MMM d, h:mm a') : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  mapping.sync_status === 'synced' ? 'bg-green-100 text-green-800' :
                                  mapping.sync_status === 'error' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {mapping.sync_status}
                                </span>
                                {mapping.error_message && (
                                  <p className="mt-1 text-xs text-red-600">{mapping.error_message}</p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleDeleteMapping(mapping.id)}
                                  className="text-red-600 hover:text-red-800 text-sm"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default QuickBooksSettings;
