import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import AppSelect from '../components/ui/AppSelect';

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
  useCashSalesCustomer: boolean;
  cashSalesCustomerName: string;
  cashSalesCustomerListId?: string;
  usePayerBasedCustomers: boolean;
  defaultItemName: string;
  ownerId?: string;
  fileId?: string;
  queueStatus: QueueStatus;
}

interface PayerMapping {
  id: number;
  name: string;
  quickbooks_customer_name: string | null;
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

interface ImportedPatient {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  quickbooks_id: string;
  last_synced_at: string;
}

interface ImportedService {
  id: number;
  service_code: string;
  service_name: string;
  price: number;
  category: string;
  quickbooks_id: string;
  last_synced_at: string;
}

interface ImportedInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: string;
  patient_name: string;
  quickbooks_id: string;
  last_synced_at: string;
}

interface ImportedData {
  patients: ImportedPatient[];
  services: ImportedService[];
  invoices: ImportedInvoice[];
  summary: {
    patientsCount: number;
    servicesCount: number;
    invoicesCount: number;
  };
}

const QuickBooksSettings: React.FC = () => {
  useDesignSystemPage();
  const { showToast } = useNotification();
  const { confirm: confirmDialog } = useDialog();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [mappings, setMappings] = useState<SyncMapping[]>([]);
  const [importedData, setImportedData] = useState<ImportedData | null>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'queue' | 'mappings' | 'imported'>('setup');
  const [importedSubTab, setImportedSubTab] = useState<'patients' | 'services' | 'invoices'>('patients');
  const [queueFilter, setQueueFilter] = useState<string>('');
  const [mappingFilter, setMappingFilter] = useState<string>('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [corporateMappings, setCorporateMappings] = useState<PayerMapping[]>([]);
  const [insuranceMappings, setInsuranceMappings] = useState<PayerMapping[]>([]);
  const [redriving, setRedriving] = useState(false);

  useEffect(() => {
    loadStatus();
    loadPayerMappings();
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

  const loadImportedData = async () => {
    try {
      const response = await apiClient.get('/quickbooks/imported');
      setImportedData(response.data);
    } catch (error) {
      console.error('Error loading imported data:', error);
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
    if (!(await confirmDialog({
      title: 'Reset Web Connector password?',
      message: 'You will need to update Web Connector with the new password.',
      variant: 'warning',
      confirmLabel: 'Reset',
    }))) {
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

    if (!(await confirmDialog({ title: 'Clear queue?', message, variant: 'warning', confirmLabel: 'Clear' }))) return;

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

  const loadPayerMappings = async () => {
    try {
      const response = await apiClient.get('/quickbooks/payer-mappings');
      setCorporateMappings(response.data.corporate || []);
      setInsuranceMappings(response.data.insurance || []);
    } catch {
      // non-blocking
    }
  };

  // Persist a payer's QB customer name on blur (local edits kept in state while typing).
  const savePayerMapping = async (type: 'corporate' | 'insurance', id: number, quickbooksCustomerName: string) => {
    try {
      await apiClient.put('/quickbooks/payer-mappings', { type, id, quickbooksCustomerName });
      showToast('Payer mapping saved', 'success');
    } catch {
      showToast('Failed to save payer mapping', 'error');
    }
  };

  const handleRedrive = async () => {
    setRedriving(true);
    try {
      const response = await apiClient.post('/quickbooks/redrive');
      showToast(response.data?.message || 'Transactions re-queued', 'success');
      loadStatus();
      loadQueueItems(queueFilter || undefined);
    } catch {
      showToast('Failed to re-drive transactions', 'error');
    } finally {
      setRedriving(false);
    }
  };

  const handleDeleteMapping = async (id: number) => {
    if (!(await confirmDialog({
      title: 'Delete mapping?',
      message: 'The entity will be re-synced on next sync.',
      variant: 'danger',
      confirmLabel: 'Delete',
    }))) {
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
    if (!(await confirmDialog({
      title: 'Disconnect from QuickBooks?',
      message: 'This will clear the sync queue.',
      variant: 'danger',
      confirmLabel: 'Disconnect',
    }))) {
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
      <AppLayout designSystem title="QuickBooks Integration">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ds-accent"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout designSystem title="QuickBooks Desktop Integration">
      <div className="space-y-6">
        {/* Connection Status Card */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-ds-text">Web Connector Status</h2>
              <p className="text-sm text-ds-text-muted mt-1">
                QuickBooks Desktop integration via Web Connector
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                status?.connected
                  ? 'bg-ds-success-soft text-ds-success-text'
                  : 'bg-ds-subtle text-ds-text-secondary'
              }`}>
                <span className={`w-2 h-2 rounded-full mr-2 ${
                  status?.connected ? 'bg-ds-success' : 'bg-ds-border-control'
                }`}></span>
                {status?.connected ? 'Connected' : 'Not Connected'}
              </span>
              {status?.connected && (
                <button
                  onClick={handleDisconnect}
                  className="min-h-ds-touch px-3 py-1 text-sm bg-ds-critical-soft text-ds-critical-text rounded-lg hover:bg-ds-critical-soft"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {status?.lastPollAt && (
            <p className="text-sm text-ds-text-secondary mb-4">
              Last poll: {format(new Date(status.lastPollAt), 'MMM d, yyyy h:mm a')}
            </p>
          )}

          {/* Queue Summary */}
          {status?.queueStatus && (
            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="bg-ds-warning-soft rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ds-warning-text">{status.queueStatus.pending}</div>
                <div className="text-xs text-ds-warning-text">Pending</div>
              </div>
              <div className="bg-ds-info-soft rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ds-info-text">{status.queueStatus.sent}</div>
                <div className="text-xs text-ds-info-text">In Progress</div>
              </div>
              <div className="bg-ds-success-soft rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ds-success-text">{status.queueStatus.completed}</div>
                <div className="text-xs text-ds-success-text">Completed</div>
              </div>
              <div className="bg-ds-critical-soft rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ds-critical-text">{status.queueStatus.error}</div>
                <div className="text-xs text-ds-critical-text">Errors</div>
              </div>
              <div className="bg-ds-subtle rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ds-text-secondary">{status.queueStatus.waiting}</div>
                <div className="text-xs text-ds-text-secondary">Waiting</div>
              </div>
            </div>
          )}

          {/* Quick Actions - Push to QuickBooks */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-ds-text-secondary mb-2">Push to QuickBooks (MedSys → QB)</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleQueueSync('customers')}
                disabled={syncing !== null}
                className="min-h-ds-touch px-4 py-2 bg-ds-info-soft text-ds-info-text rounded-lg hover:bg-ds-info-soft font-medium disabled:opacity-50"
              >
                {syncing === 'customers' ? 'Queuing...' : 'Queue Customers'}
              </button>
              <button
                onClick={() => handleQueueSync('invoices')}
                disabled={syncing !== null}
                className="min-h-ds-touch px-4 py-2 bg-ds-success-soft text-ds-success-text rounded-lg hover:bg-ds-success-soft font-medium disabled:opacity-50"
              >
                {syncing === 'invoices' ? 'Queuing...' : 'Queue Invoices'}
              </button>
              {status?.queueStatus && status.queueStatus.error > 0 && (
                <button
                  onClick={handleRetryFailed}
                  className="min-h-ds-touch px-4 py-2 bg-ds-warning-soft text-ds-warning-text rounded-lg hover:bg-ds-warning-soft font-medium"
                >
                  Retry Failed
                </button>
              )}
            </div>
          </div>

          {/* Import from QuickBooks */}
          <div>
            <h3 className="text-sm font-medium text-ds-text-secondary mb-2">Import from QuickBooks (QB → MedSys)</h3>
            <p className="text-xs text-ds-text-muted mb-3">
              Pull existing data from QuickBooks into MedSys. QuickBooks Desktop must be running.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleImport('customers')}
                disabled={importing !== null}
                className="min-h-ds-touch px-4 py-2 bg-ds-subtle text-ds-brand-plum rounded-lg hover:bg-ds-subtle font-medium disabled:opacity-50"
              >
                {importing === 'customers' ? 'Queuing...' : 'Import Customers → Patients'}
              </button>
              <button
                onClick={() => handleImport('items')}
                disabled={importing !== null}
                className="min-h-ds-touch px-4 py-2 bg-ds-subtle text-ds-brand-plum rounded-lg hover:bg-ds-subtle font-medium disabled:opacity-50"
              >
                {importing === 'items' ? 'Queuing...' : 'Import Items → Charge Master'}
              </button>
              <button
                onClick={() => handleImport('invoices')}
                disabled={importing !== null}
                className="min-h-ds-touch px-4 py-2 bg-ds-subtle text-ds-brand-plum rounded-lg hover:bg-ds-subtle font-medium disabled:opacity-50"
              >
                {importing === 'invoices' ? 'Queuing...' : 'Import Invoices'}
              </button>
              <button
                onClick={() => handleImport('all')}
                disabled={importing !== null}
                className="min-h-ds-touch px-4 py-2 bg-ds-info text-white dark:text-ds-canvas rounded-lg hover:bg-ds-info/90 font-medium disabled:opacity-50"
              >
                {importing === 'all' ? 'Queuing...' : 'Import All Data'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border">
          <div className="border-b border-ds-border">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('setup')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'setup'
                    ? 'border-ds-accent text-ds-accent-text'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text'
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
                    ? 'border-ds-accent text-ds-accent-text'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text'
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
                    ? 'border-ds-accent text-ds-accent-text'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text'
                }`}
              >
                Entity Mappings
              </button>
              <button
                onClick={() => {
                  setActiveTab('imported');
                  loadImportedData();
                }}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'imported'
                    ? 'border-ds-brand-plum text-ds-brand-plum'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text'
                }`}
              >
                Imported Data
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Setup Instructions Tab */}
            {activeTab === 'setup' && (
              <div className="space-y-6">
                {/* Step 1: Download Web Connector */}
                <div className="border border-ds-border rounded-lg p-4">
                  <h3 className="text-lg font-medium text-ds-text mb-2">
                    Step 1: Install QuickBooks Web Connector
                  </h3>
                  <p className="text-sm text-ds-text-secondary mb-3">
                    Download and install Web Connector from Intuit on the Windows Server running QuickBooks Desktop.
                  </p>
                  <a
                    href="https://developer.intuit.com/app/developer/qbdesktop/docs/get-started/get-started-with-quickbooks-web-connector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ds-accent-text hover:text-ds-accent-text text-sm font-medium"
                  >
                    Download Web Connector from Intuit →
                  </a>
                </div>

                {/* Step 2: Set Password */}
                <div className="border border-ds-border rounded-lg p-4">
                  <h3 className="text-lg font-medium text-ds-text mb-2">
                    Step 2: Configure Password
                  </h3>
                  <p className="text-sm text-ds-text-secondary mb-3">
                    Set a password for Web Connector authentication. Username: <code className="bg-ds-subtle px-1 rounded">{status?.username || 'medsys'}</code>
                  </p>
                  <div className="flex gap-3 items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 8 chars)"
                      className="px-4 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring w-64"
                    />
                    <button
                      onClick={handleSetPassword}
                      className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover font-medium"
                    >
                      Set Password
                    </button>
                    <button
                      onClick={handleResetPassword}
                      className="min-h-ds-touch px-4 py-2 bg-ds-subtle text-ds-text-secondary rounded-lg hover:bg-ds-border font-medium"
                    >
                      Generate Random
                    </button>
                  </div>
                  {showPassword && newPassword && (
                    <div className="mt-3 p-3 bg-ds-warning-soft border border-ds-warning-border rounded-lg">
                      <p className="text-sm text-ds-warning-text">
                        <strong>Save this password!</strong> You'll need it when adding the app to Web Connector:
                      </p>
                      <code className="block mt-1 text-lg font-mono text-ds-warning-text">{newPassword}</code>
                    </div>
                  )}
                </div>

                {/* Step 3: Download QWC File */}
                <div className="border border-ds-border rounded-lg p-4">
                  <h3 className="text-lg font-medium text-ds-text mb-2">
                    Step 3: Download QWC Configuration File
                  </h3>
                  <p className="text-sm text-ds-text-secondary mb-3">
                    Download the .qwc file and add it to Web Connector.
                  </p>
                  <button
                    onClick={handleDownloadQWC}
                    className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover font-medium"
                  >
                    Download medsys.qwc
                  </button>
                </div>

                {/* Step 4: Add to Web Connector */}
                <div className="border border-ds-border rounded-lg p-4">
                  <h3 className="text-lg font-medium text-ds-text mb-2">
                    Step 4: Add Application to Web Connector
                  </h3>
                  <ol className="text-sm text-ds-text-secondary list-decimal list-inside space-y-2">
                    <li>Open QuickBooks Web Connector on the server</li>
                    <li>File → Add an Application</li>
                    <li>Select the medsys.qwc file you downloaded</li>
                    <li>Enter the password you set in Step 2</li>
                    <li>QuickBooks will prompt to authorize - select "Yes, always allow access"</li>
                    <li>Check the checkbox next to MedSys EMR and click "Update Selected"</li>
                  </ol>
                </div>

                {/* Important Note */}
                <div className="border border-ds-warning-border bg-ds-warning-soft rounded-lg p-4">
                  <h3 className="text-lg font-medium text-ds-warning-text mb-2">
                    Important: QuickBooks Must Be Open
                  </h3>
                  <p className="text-sm text-ds-warning-text mb-3">
                    For the Web Connector to work, <strong>QuickBooks Desktop must be running</strong> with your company file open before syncing.
                    Alternatively, you can specify the company file path below so Web Connector can open it automatically.
                  </p>
                </div>

                {/* Settings */}
                <div className="border border-ds-border rounded-lg p-4">
                  <h3 className="text-lg font-medium text-ds-text mb-3">Settings</h3>
                  <div className="space-y-4">
                    {/* Company File Path */}
                    <div>
                      <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                        Company File Path (Optional)
                      </label>
                      <p className="text-xs text-ds-text-muted mb-2">
                        Path to your QuickBooks company file (.qbw) on the server. Example: C:\Users\Public\Documents\Intuit\QuickBooks\Company Files\MyCompany.qbw
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={status?.companyFilePath || ''}
                          onChange={(e) => handleUpdateSettings('companyFilePath', e.target.value)}
                          placeholder="C:\path\to\company.qbw"
                          className="flex-1 px-4 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring text-sm font-mono"
                        />
                      </div>
                    </div>

                    <hr className="border-ds-border" />

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={status?.syncEnabled || false}
                        onChange={(e) => handleUpdateSettings('syncEnabled', e.target.checked)}
                        className="w-4 h-4 text-ds-accent-text rounded focus:ring-ds-focus-ring"
                      />
                      <span className="text-sm text-ds-text-secondary">Sync Enabled</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={status?.autoSyncInvoices || false}
                        onChange={(e) => handleUpdateSettings('autoSyncInvoices', e.target.checked)}
                        className="w-4 h-4 text-ds-accent-text rounded focus:ring-ds-focus-ring"
                      />
                      <span className="text-sm text-ds-text-secondary">Auto-queue new invoices</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={status?.autoSyncPayments || false}
                        onChange={(e) => handleUpdateSettings('autoSyncPayments', e.target.checked)}
                        className="w-4 h-4 text-ds-accent-text rounded focus:ring-ds-focus-ring"
                      />
                      <span className="text-sm text-ds-text-secondary">Auto-queue new payments</span>
                    </label>

                    <hr className="border-ds-border" />

                    {/* Payer-based billing */}
                    <div className="bg-ds-success-soft rounded-lg p-4 border border-ds-success/30">
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input
                          type="checkbox"
                          checked={status?.usePayerBasedCustomers ?? false}
                          onChange={(e) => handleUpdateSettings('usePayerBasedCustomers', e.target.checked)}
                          className="w-4 h-4 text-ds-accent-text rounded focus:ring-ds-focus-ring"
                        />
                        <span className="text-sm font-medium text-ds-text">Bill by payer (recommended)</span>
                      </label>
                      <p className="text-xs text-ds-text-secondary mb-3">
                        Books each invoice under the <span className="font-medium">payer's</span> existing QuickBooks customer:
                        self-pay patients go under one shared customer, and each insurer / corporate client goes under the
                        customer you already created in QuickBooks. Map the exact QB customer names below so MedSys points at
                        customers QuickBooks already has (no per-patient customers, no duplicates).
                      </p>

                      {(status?.usePayerBasedCustomers ?? false) && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-ds-text-secondary mb-1">
                                Self-pay customer name (must exist in QuickBooks)
                              </label>
                              <input
                                type="text"
                                value={status?.cashSalesCustomerName || ''}
                                onChange={(e) => setStatus(prev => prev ? { ...prev, cashSalesCustomerName: e.target.value } : null)}
                                onBlur={(e) => handleUpdateSettings('cashSalesCustomerName', e.target.value)}
                                placeholder="Cash Sales"
                                className="px-3 py-1.5 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring text-sm w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-ds-text-secondary mb-1">
                                Invoice line item name (must exist in QuickBooks)
                              </label>
                              <input
                                type="text"
                                value={status?.defaultItemName || ''}
                                onChange={(e) => setStatus(prev => prev ? { ...prev, defaultItemName: e.target.value } : null)}
                                onBlur={(e) => handleUpdateSettings('defaultItemName', e.target.value)}
                                placeholder="Medical Services"
                                className="px-3 py-1.5 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring text-sm w-full"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-ds-warning-text bg-ds-warning-soft border border-ds-warning-border rounded p-2">
                            Create a single service item in QuickBooks (Item List) with the exact name above — all invoice lines
                            use it, so if it's missing QuickBooks rejects the invoice.
                          </p>

                          {/* Insurance mapping */}
                          <div>
                            <h4 className="text-sm font-semibold text-ds-text mb-2">Insurance providers</h4>
                            <div className="space-y-1.5">
                              {insuranceMappings.map((m) => (
                                <div key={`ins-${m.id}`} className="flex items-center gap-2">
                                  <span className="text-xs text-ds-text-secondary w-1/2 truncate" title={m.name}>{m.name}</span>
                                  <input
                                    type="text"
                                    value={m.quickbooks_customer_name ?? ''}
                                    placeholder={`QB customer for ${m.name}`}
                                    onChange={(e) => setInsuranceMappings(prev => prev.map(x => x.id === m.id ? { ...x, quickbooks_customer_name: e.target.value } : x))}
                                    onBlur={(e) => savePayerMapping('insurance', m.id, e.target.value)}
                                    className="px-2 py-1 border border-ds-border-control rounded text-xs w-1/2 focus:ring-2 focus:ring-ds-focus-ring"
                                  />
                                </div>
                              ))}
                              {insuranceMappings.length === 0 && <p className="text-xs text-ds-text-muted">No insurance providers.</p>}
                            </div>
                          </div>

                          {/* Corporate mapping */}
                          <div>
                            <h4 className="text-sm font-semibold text-ds-text mb-2">Corporate clients</h4>
                            <div className="space-y-1.5">
                              {corporateMappings.map((m) => (
                                <div key={`corp-${m.id}`} className="flex items-center gap-2">
                                  <span className="text-xs text-ds-text-secondary w-1/2 truncate" title={m.name}>{m.name}</span>
                                  <input
                                    type="text"
                                    value={m.quickbooks_customer_name ?? ''}
                                    placeholder={`QB customer for ${m.name}`}
                                    onChange={(e) => setCorporateMappings(prev => prev.map(x => x.id === m.id ? { ...x, quickbooks_customer_name: e.target.value } : x))}
                                    onBlur={(e) => savePayerMapping('corporate', m.id, e.target.value)}
                                    className="px-2 py-1 border border-ds-border-control rounded text-xs w-1/2 focus:ring-2 focus:ring-ds-focus-ring"
                                  />
                                </div>
                              ))}
                              {corporateMappings.length === 0 && <p className="text-xs text-ds-text-muted">No corporate clients.</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            <button
                              onClick={handleRedrive}
                              disabled={redriving}
                              className="min-h-ds-touch px-3 py-1.5 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm disabled:opacity-50"
                            >
                              {redriving ? 'Re-queuing…' : 'Re-drive held transactions'}
                            </button>
                            <span className="text-xs text-ds-text-muted">
                              Retries invoices/payments that failed or are waiting — run after filling in the mappings.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Cash Sales Customer Mode (legacy — hidden when billing by payer) */}
                    {!(status?.usePayerBasedCustomers ?? false) && (
                    <div className="bg-ds-info-soft rounded-lg p-4 border border-ds-info/30">
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input
                          type="checkbox"
                          checked={status?.useCashSalesCustomer ?? true}
                          onChange={(e) => handleUpdateSettings('useCashSalesCustomer', e.target.checked)}
                          className="w-4 h-4 text-ds-accent-text rounded focus:ring-ds-focus-ring"
                        />
                        <span className="text-sm font-medium text-ds-text">Use "Cash Sales" Customer for All Invoices</span>
                      </label>
                      <p className="text-xs text-ds-text-secondary mb-3">
                        When enabled, all invoices will be assigned to a single "Cash Sales" customer in QuickBooks
                        instead of creating individual customers for each patient. This keeps your QuickBooks customer
                        list clean while still tracking revenue.
                      </p>
                      {(status?.useCashSalesCustomer ?? true) && (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-ds-text-secondary mb-1">
                              Cash Sales Customer Name (must exist in QuickBooks)
                            </label>
                            <input
                              type="text"
                              value={status?.cashSalesCustomerName || 'Cash Sales'}
                              onChange={(e) => handleUpdateSettings('cashSalesCustomerName', e.target.value)}
                              placeholder="Cash Sales"
                              className="px-3 py-1.5 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring text-sm w-full max-w-xs"
                            />
                          </div>
                          {status?.cashSalesCustomerListId ? (
                            <p className="text-xs text-ds-success-text">
                              Linked to QB Customer: {status.cashSalesCustomerListId}
                            </p>
                          ) : (
                            <p className="text-xs text-ds-warning-text">
                              Not yet linked. Import customers from QuickBooks to find "{status?.cashSalesCustomerName || 'Cash Sales'}".
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Queue Tab */}
            {activeTab === 'queue' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <AppSelect
                    value={queueFilter}
                    onChange={(val) => {
                      setQueueFilter(val);
                      loadQueueItems(val || undefined);
                    }}
                    options={[{value:'',label:'All Statuses'},{value:'pending',label:'Pending'},{value:'sent',label:'In Progress'},{value:'completed',label:'Completed'},{value:'error',label:'Errors'},{value:'waiting',label:'Waiting'}]}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleClearQueue('completed')}
                      className="min-h-ds-touch px-3 py-1 text-sm bg-ds-subtle text-ds-text-secondary rounded hover:bg-ds-border"
                    >
                      Clear Completed
                    </button>
                    <button
                      onClick={() => handleClearQueue('error')}
                      className="min-h-ds-touch px-3 py-1 text-sm bg-ds-critical-soft text-ds-critical-text rounded hover:bg-ds-critical-soft"
                    >
                      Clear Errors
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ds-border">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Entity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Operation</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Created</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ds-border">
                      {queueItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-ds-text-muted">
                            No items in queue
                          </td>
                        </tr>
                      ) : (
                        queueItems.map((item) => (
                          <tr key={item.id} className="hover:bg-ds-subtle">
                            <td className="px-4 py-3 text-sm text-ds-text-secondary capitalize">{item.entity_type}</td>
                            <td className="px-4 py-3 text-sm text-ds-text">{item.medsys_id}</td>
                            <td className="px-4 py-3 text-sm text-ds-text-secondary capitalize">{item.operation}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                item.status === 'completed' ? 'bg-ds-success-soft text-ds-success-text' :
                                item.status === 'error' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                item.status === 'sent' ? 'bg-ds-info-soft text-ds-info-text' :
                                item.status === 'pending' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                'bg-ds-subtle text-ds-text'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-ds-text-secondary">
                              {format(new Date(item.created_at), 'MMM d, h:mm a')}
                            </td>
                            <td className="px-4 py-3 text-sm text-ds-critical-text max-w-xs truncate">
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
                  <AppSelect
                    value={mappingFilter}
                    onChange={(val) => {
                      setMappingFilter(val);
                      loadMappings(val || undefined);
                    }}
                    options={[{value:'',label:'All Entity Types'},{value:'patient',label:'Customers (Patients)'},{value:'service',label:'Items (Services)'},{value:'invoice',label:'Invoices'},{value:'payment',label:'Payments'}]}
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ds-border">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">MedSys ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">QB ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Last Synced</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-ds-text-muted uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ds-border">
                      {mappings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-ds-text-muted">
                            No mappings found
                          </td>
                        </tr>
                      ) : (
                        mappings.map((mapping) => (
                          <tr key={mapping.id} className="hover:bg-ds-subtle">
                            <td className="px-4 py-3 text-sm text-ds-text-secondary capitalize">{mapping.entity_type}</td>
                            <td className="px-4 py-3 text-sm text-ds-text">{mapping.medsys_id}</td>
                            <td className="px-4 py-3 text-sm text-ds-text-secondary font-mono text-xs">
                              {mapping.quickbooks_id}
                            </td>
                            <td className="px-4 py-3 text-sm text-ds-text-secondary">
                              {mapping.last_synced_at
                                ? format(new Date(mapping.last_synced_at), 'MMM d, h:mm a')
                                : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                mapping.sync_status === 'synced' ? 'bg-ds-success-soft text-ds-success-text' :
                                mapping.sync_status === 'error' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                'bg-ds-warning-soft text-ds-warning-text'
                              }`}>
                                {mapping.sync_status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleDeleteMapping(mapping.id)}
                                className="text-ds-critical-text hover:text-ds-critical-text text-sm"
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

            {/* Imported Data Tab */}
            {activeTab === 'imported' && (
              <div>
                {/* Summary Cards */}
                {importedData && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-ds-subtle rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-ds-brand-plum">{importedData.summary.patientsCount}</div>
                      <div className="text-sm text-ds-brand-plum">Patients Imported</div>
                    </div>
                    <div className="bg-ds-info-soft rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-ds-info-text">{importedData.summary.servicesCount}</div>
                      <div className="text-sm text-ds-info-text">Services Imported</div>
                    </div>
                    <div className="bg-ds-info-soft rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-ds-info-text">{importedData.summary.invoicesCount}</div>
                      <div className="text-sm text-ds-info-text">Invoices Imported</div>
                    </div>
                  </div>
                )}

                {/* Sub-tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setImportedSubTab('patients')}
                    className={`min-h-ds-touch px-4 py-2 rounded-lg text-sm font-medium ${
                      importedSubTab === 'patients'
                        ? 'bg-ds-brand-plum text-white dark:text-ds-canvas'
                        : 'bg-ds-subtle text-ds-text-secondary hover:bg-ds-border'
                    }`}
                  >
                    Patients ({importedData?.patients.length || 0})
                  </button>
                  <button
                    onClick={() => setImportedSubTab('services')}
                    className={`min-h-ds-touch px-4 py-2 rounded-lg text-sm font-medium ${
                      importedSubTab === 'services'
                        ? 'bg-ds-info text-white dark:text-ds-canvas'
                        : 'bg-ds-subtle text-ds-text-secondary hover:bg-ds-border'
                    }`}
                  >
                    Services ({importedData?.services.length || 0})
                  </button>
                  <button
                    onClick={() => setImportedSubTab('invoices')}
                    className={`min-h-ds-touch px-4 py-2 rounded-lg text-sm font-medium ${
                      importedSubTab === 'invoices'
                        ? 'bg-ds-info text-white dark:text-ds-canvas'
                        : 'bg-ds-subtle text-ds-text-secondary hover:bg-ds-border'
                    }`}
                  >
                    Invoices ({importedData?.invoices.length || 0})
                  </button>
                </div>

                {/* Patients Table */}
                {importedSubTab === 'patients' && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-ds-border">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Patient #</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">QB ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Imported</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ds-border">
                        {!importedData || importedData.patients.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-ds-text-muted">
                              No patients imported from QuickBooks yet
                            </td>
                          </tr>
                        ) : (
                          importedData.patients.map((patient) => (
                            <tr key={patient.id} className="hover:bg-ds-subtle">
                              <td className="px-4 py-3 text-sm font-medium text-ds-text">{patient.patient_number}</td>
                              <td className="px-4 py-3 text-sm text-ds-text">{patient.first_name} {patient.last_name}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-secondary">{patient.email || '-'}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-secondary">{patient.phone || '-'}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-muted font-mono text-xs">{patient.quickbooks_id}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-secondary">
                                {patient.last_synced_at ? format(new Date(patient.last_synced_at), 'MMM d, h:mm a') : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Services Table */}
                {importedSubTab === 'services' && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-ds-border">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Code</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Category</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ds-text-muted uppercase">Price</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">QB ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Imported</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ds-border">
                        {!importedData || importedData.services.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-ds-text-muted">
                              No services imported from QuickBooks yet
                            </td>
                          </tr>
                        ) : (
                          importedData.services.map((service) => (
                            <tr key={service.id} className="hover:bg-ds-subtle">
                              <td className="px-4 py-3 text-sm font-medium text-ds-text">{service.service_code}</td>
                              <td className="px-4 py-3 text-sm text-ds-text">{service.service_name}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-secondary capitalize">{service.category}</td>
                              <td className="px-4 py-3 text-sm text-ds-text text-right">GHS {Number(service.price || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-muted font-mono text-xs">{service.quickbooks_id}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-secondary">
                                {service.last_synced_at ? format(new Date(service.last_synced_at), 'MMM d, h:mm a') : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Invoices Table */}
                {importedSubTab === 'invoices' && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-ds-border">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Invoice #</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Patient</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Date</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ds-text-muted uppercase">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">QB ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Imported</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ds-border">
                        {!importedData || importedData.invoices.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-ds-text-muted">
                              No invoices imported from QuickBooks yet
                            </td>
                          </tr>
                        ) : (
                          importedData.invoices.map((invoice) => (
                            <tr key={invoice.id} className="hover:bg-ds-subtle">
                              <td className="px-4 py-3 text-sm font-medium text-ds-text">{invoice.invoice_number}</td>
                              <td className="px-4 py-3 text-sm text-ds-text">{invoice.patient_name}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-secondary">
                                {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'MMM d, yyyy') : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-ds-text text-right">GHS {Number(invoice.total_amount || 0).toFixed(2)}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  invoice.status === 'paid' ? 'bg-ds-success-soft text-ds-success-text' :
                                  invoice.status === 'pending' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                  'bg-ds-subtle text-ds-text'
                                }`}>
                                  {invoice.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-ds-text-muted font-mono text-xs">{invoice.quickbooks_id}</td>
                              <td className="px-4 py-3 text-sm text-ds-text-secondary">
                                {invoice.last_synced_at ? format(new Date(invoice.last_synced_at), 'MMM d, h:mm a') : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default QuickBooksSettings;
