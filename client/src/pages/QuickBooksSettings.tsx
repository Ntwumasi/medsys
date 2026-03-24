import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import { useNotification } from '../context/NotificationContext';

interface QueueStatus {
  pending: number;
  sent: number;
  completed: number;
  error: number;
  waiting: number;
}

interface ConnectionStatus {
  connected: boolean;
  configured: boolean;
  integrationType: string;
  username: string;
  companyFilePath?: string;
  pollIntervalMinutes: number;
  lastPollAt?: string;
  lastSyncAt?: string;
  syncEnabled: boolean;
  autoSyncInvoices: boolean;
  autoSyncPayments: boolean;
  ownerId?: string;
  fileId?: string;
  queueStatus: QueueStatus;
}

interface QueueItem {
  id: number;
  entity_type: string;
  medsys_id: number;
  operation: string;
  status: string;
  error_code?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
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
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [mappings, setMappings] = useState<SyncMapping[]>([]);
  const [activeTab, setActiveTab] = useState<'setup' | 'queue' | 'mappings'>('setup');
  const [queueFilter, setQueueFilter] = useState<string>('');
  const [mappingFilter, setMappingFilter] = useState<string>('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
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

  const loadQueueItems = async (filterStatus?: string) => {
    try {
      const params = filterStatus ? { status: filterStatus } : {};
      const response = await apiClient.get('/quickbooks/queue/items', { params });
      setQueueItems(response.data);
    } catch (error) {
      console.error('Error loading queue items:', error);
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

  const handleDownloadQWC = async () => {
    try {
      const response = await apiClient.get('/quickbooks/qwc-file', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'medsys.qwc');
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('QWC file downloaded', 'success');
    } catch (error) {
      showToast('Failed to download QWC file', 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!confirm('Reset the Web Connector password? You will need to update Web Connector with the new password.')) {
      return;
    }

    try {
      const response = await apiClient.post('/quickbooks/password/reset');
      setNewPassword(response.data.newPassword);
      setShowPassword(true);
      showToast('Password reset. Save the new password shown below!', 'warning');
    } catch (error) {
      showToast('Failed to reset password', 'error');
    }
  };

  const handleSetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }

    try {
      await apiClient.post('/quickbooks/password', { password: newPassword });
      showToast('Password updated', 'success');
      setNewPassword('');
      setShowPassword(false);
    } catch (error) {
      showToast('Failed to set password', 'error');
    }
  };

  const handleQueueSync = async (type: string) => {
    setSyncing(type);
    try {
      const response = await apiClient.post(`/quickbooks/queue/${type}`);
      showToast(`${response.data.queued} ${type} queued for sync`, 'success');
      loadStatus();
    } catch (error) {
      showToast(`Failed to queue ${type}`, 'error');
    } finally {
      setSyncing(null);
    }
  };

  const handleRetryFailed = async () => {
    try {
      const response = await apiClient.post('/quickbooks/queue/retry');
      showToast(`${response.data.count} requests queued for retry`, 'success');
      loadStatus();
      loadQueueItems(queueFilter || undefined);
    } catch (error) {
      showToast('Failed to retry requests', 'error');
    }
  };

  const handleClearQueue = async (status?: string) => {
    const message = status
      ? `Clear all ${status} requests from the queue?`
      : 'Clear the entire queue?';

    if (!confirm(message)) return;

    try {
      await apiClient.delete('/quickbooks/queue', { params: status ? { status } : {} });
      showToast('Queue cleared', 'success');
      loadStatus();
      loadQueueItems(queueFilter || undefined);
    } catch (error) {
      showToast('Failed to clear queue', 'error');
    }
  };

  const handleUpdateSettings = async (key: string, value: boolean | string | number) => {
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

  const handleDisconnect = async () => {
    if (!confirm('Disconnect from QuickBooks? This will clear the sync queue.')) {
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

  const handleImport = async (type: 'customers' | 'items' | 'invoices' | 'all') => {
    setImporting(type);
    try {
      const endpoint = type === 'all' ? '/quickbooks/import/all' : `/quickbooks/import/${type}`;
      const response = await apiClient.post(endpoint);
      showToast(response.data.message, 'success');
      loadStatus();
    } catch (error) {
      showToast(`Failed to queue ${type} import`, 'error');
    } finally {
      setImporting(null);
    }
  };

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
    <AppLayout title="QuickBooks Desktop Integration">
      <div className="space-y-6">
        {/* Connection Status Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Web Connector Status</h2>
              <p className="text-sm text-gray-500 mt-1">
                QuickBooks Desktop integration via Web Connector
              </p>
            </div>
            <div className="flex items-center gap-3">
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
              {status?.connected && (
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {status?.lastPollAt && (
            <p className="text-sm text-gray-600 mb-4">
              Last poll: {format(new Date(status.lastPollAt), 'MMM d, yyyy h:mm a')}
            </p>
          )}

          {/* Queue Summary */}
          {status?.queueStatus && (
            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-700">{status.queueStatus.pending}</div>
                <div className="text-xs text-yellow-600">Pending</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{status.queueStatus.sent}</div>
                <div className="text-xs text-blue-600">In Progress</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{status.queueStatus.completed}</div>
                <div className="text-xs text-green-600">Completed</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-700">{status.queueStatus.error}</div>
                <div className="text-xs text-red-600">Errors</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-700">{status.queueStatus.waiting}</div>
                <div className="text-xs text-gray-600">Waiting</div>
              </div>
            </div>
          )}

          {/* Quick Actions - Push to QuickBooks */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Push to QuickBooks (MedSys → QB)</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleQueueSync('customers')}
                disabled={syncing !== null}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium disabled:opacity-50"
              >
                {syncing === 'customers' ? 'Queuing...' : 'Queue Customers'}
              </button>
              <button
                onClick={() => handleQueueSync('invoices')}
                disabled={syncing !== null}
                className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium disabled:opacity-50"
              >
                {syncing === 'invoices' ? 'Queuing...' : 'Queue Invoices'}
              </button>
              {status?.queueStatus && status.queueStatus.error > 0 && (
                <button
                  onClick={handleRetryFailed}
                  className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-medium"
                >
                  Retry Failed
                </button>
              )}
            </div>
          </div>

          {/* Import from QuickBooks */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Import from QuickBooks (QB → MedSys)</h3>
            <p className="text-xs text-gray-500 mb-3">
              Pull existing data from QuickBooks into MedSys. QuickBooks Desktop must be running.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleImport('customers')}
                disabled={importing !== null}
                className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium disabled:opacity-50"
              >
                {importing === 'customers' ? 'Queuing...' : 'Import Customers → Patients'}
              </button>
              <button
                onClick={() => handleImport('items')}
                disabled={importing !== null}
                className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium disabled:opacity-50"
              >
                {importing === 'items' ? 'Queuing...' : 'Import Items → Charge Master'}
              </button>
              <button
                onClick={() => handleImport('invoices')}
                disabled={importing !== null}
                className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium disabled:opacity-50"
              >
                {importing === 'invoices' ? 'Queuing...' : 'Import Invoices'}
              </button>
              <button
                onClick={() => handleImport('all')}
                disabled={importing !== null}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
              >
                {importing === 'all' ? 'Queuing...' : 'Import All Data'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('setup')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'setup'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Setup Instructions
              </button>
              <button
                onClick={() => {
                  setActiveTab('queue');
                  loadQueueItems(queueFilter || undefined);
                }}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'queue'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Sync Queue
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
            {/* Setup Instructions Tab */}
            {activeTab === 'setup' && (
              <div className="space-y-6">
                {/* Step 1: Download Web Connector */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Step 1: Install QuickBooks Web Connector
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Download and install Web Connector from Intuit on the Windows Server running QuickBooks Desktop.
                  </p>
                  <a
                    href="https://developer.intuit.com/app/developer/qbdesktop/docs/get-started/get-started-with-quickbooks-web-connector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                  >
                    Download Web Connector from Intuit →
                  </a>
                </div>

                {/* Step 2: Set Password */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Step 2: Configure Password
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Set a password for Web Connector authentication. Username: <code className="bg-gray-100 px-1 rounded">{status?.username || 'medsys'}</code>
                  </p>
                  <div className="flex gap-3 items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 8 chars)"
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-64"
                    />
                    <button
                      onClick={handleSetPassword}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
                    >
                      Set Password
                    </button>
                    <button
                      onClick={handleResetPassword}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                    >
                      Generate Random
                    </button>
                  </div>
                  {showPassword && newPassword && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        <strong>Save this password!</strong> You'll need it when adding the app to Web Connector:
                      </p>
                      <code className="block mt-1 text-lg font-mono text-yellow-900">{newPassword}</code>
                    </div>
                  )}
                </div>

                {/* Step 3: Download QWC File */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Step 3: Download QWC Configuration File
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Download the .qwc file and add it to Web Connector.
                  </p>
                  <button
                    onClick={handleDownloadQWC}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
                  >
                    Download medsys.qwc
                  </button>
                </div>

                {/* Step 4: Add to Web Connector */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Step 4: Add Application to Web Connector
                  </h3>
                  <ol className="text-sm text-gray-600 list-decimal list-inside space-y-2">
                    <li>Open QuickBooks Web Connector on the server</li>
                    <li>File → Add an Application</li>
                    <li>Select the medsys.qwc file you downloaded</li>
                    <li>Enter the password you set in Step 2</li>
                    <li>QuickBooks will prompt to authorize - select "Yes, always allow access"</li>
                    <li>Check the checkbox next to MedSys EMR and click "Update Selected"</li>
                  </ol>
                </div>

                {/* Settings */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Settings</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={status?.syncEnabled || false}
                        onChange={(e) => handleUpdateSettings('syncEnabled', e.target.checked)}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">Sync Enabled</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={status?.autoSyncInvoices || false}
                        onChange={(e) => handleUpdateSettings('autoSyncInvoices', e.target.checked)}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">Auto-queue new invoices</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={status?.autoSyncPayments || false}
                        onChange={(e) => handleUpdateSettings('autoSyncPayments', e.target.checked)}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">Auto-queue new payments</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Queue Tab */}
            {activeTab === 'queue' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <select
                    value={queueFilter}
                    onChange={(e) => {
                      setQueueFilter(e.target.value);
                      loadQueueItems(e.target.value || undefined);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="sent">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="error">Errors</option>
                    <option value="waiting">Waiting</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleClearQueue('completed')}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Clear Completed
                    </button>
                    <button
                      onClick={() => handleClearQueue('error')}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Clear Errors
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operation</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {queueItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            No items in queue
                          </td>
                        </tr>
                      ) : (
                        queueItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-600 capitalize">{item.entity_type}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.medsys_id}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 capitalize">{item.operation}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                item.status === 'error' ? 'bg-red-100 text-red-800' :
                                item.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {format(new Date(item.created_at), 'MMM d, h:mm a')}
                            </td>
                            <td className="px-4 py-3 text-sm text-red-600 max-w-xs truncate">
                              {item.error_message || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Mappings Tab */}
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
                            <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">
                              {mapping.quickbooks_id}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {mapping.last_synced_at
                                ? format(new Date(mapping.last_synced_at), 'MMM d, h:mm a')
                                : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                mapping.sync_status === 'synced' ? 'bg-green-100 text-green-800' :
                                mapping.sync_status === 'error' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {mapping.sync_status}
                              </span>
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
      </div>
    </AppLayout>
  );
};

export default QuickBooksSettings;
