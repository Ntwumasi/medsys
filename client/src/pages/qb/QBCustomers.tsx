import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';

interface Customer {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  quickbooks_id: string | null;
  quickbooks_synced_at: string | null;
  sync_status: 'synced' | 'pending' | 'error' | 'not_synced';
  outstanding_balance: number;
  total_invoices: number;
}

const QBCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'synced' | 'not_synced' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    loadCustomers();
  }, [filter]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/qb/customers?filter=${filter}`);
      setCustomers(res.data || []);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCustomer = async (customerId: number) => {
    try {
      setSyncing(customerId);
      await apiClient.post(`/quickbooks/queue/customer/${customerId}`);
      await loadCustomers();
    } catch (error) {
      console.error('Error syncing customer:', error);
    } finally {
      setSyncing(null);
    }
  };

  const handleBulkSync = async () => {
    try {
      setSyncing(-1); // Indicates bulk syncing
      await Promise.all(selectedIds.map(id =>
        apiClient.post(`/quickbooks/queue/customer/${id}`)
      ));
      setSelectedIds([]);
      await loadCustomers();
    } catch (error) {
      console.error('Error bulk syncing:', error);
    } finally {
      setSyncing(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const unsyncedIds = filteredCustomers
      .filter(c => c.sync_status === 'not_synced')
      .map(c => c.id);

    if (selectedIds.length === unsyncedIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(unsyncedIds);
    }
  };

  const getSyncStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      synced: { bg: 'bg-ds-success-soft', text: 'text-ds-success-text', label: 'Synced' },
      pending: { bg: 'bg-ds-warning-soft', text: 'text-ds-warning-text', label: 'Pending' },
      error: { bg: 'bg-ds-critical-soft', text: 'text-ds-critical-text', label: 'Error' },
      not_synced: { bg: 'bg-ds-subtle', text: 'text-ds-text-secondary', label: 'Not Synced' },
    };
    const style = styles[status] || styles.not_synced;
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
        {style.label}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount);
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = search === '' ||
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      c.patient_number?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ds-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'synced', 'not_synced', 'pending'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-ds-touch px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-ds-accent-soft text-ds-accent-text'
                    : 'text-ds-text-muted hover:bg-ds-subtle'
                }`}
              >
                {f === 'all' ? 'All' : f === 'synced' ? 'Synced' : f === 'not_synced' ? 'Not Synced' : 'Pending'}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ds-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-ds-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
              />
            </div>
            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkSync}
                disabled={syncing !== null}
                className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50 flex items-center gap-2"
              >
                {syncing === -1 ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-ds-surface border-t-transparent"></div>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync {selectedIds.length} Selected
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Customer List */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-ds-subtle border-b border-ds-border">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === filteredCustomers.filter(c => c.sync_status === 'not_synced').length}
                  onChange={toggleSelectAll}
                  className="rounded border-ds-border-control"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Patient #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">QB ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ds-text-muted">
                  No customers found
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => (
                <React.Fragment key={customer.id}>
                  <tr
                    className={`hover:bg-ds-subtle cursor-pointer ${expandedId === customer.id ? 'bg-ds-accent-soft' : ''}`}
                    onClick={() => setExpandedId(expandedId === customer.id ? null : customer.id)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {customer.sync_status === 'not_synced' && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          className="rounded border-ds-border-control"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-ds-text">{customer.first_name} {customer.last_name}</p>
                        <p className="text-sm text-ds-text-muted">{customer.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-ds-text-muted">{customer.patient_number}</td>
                    <td className="px-4 py-3 text-sm text-ds-text-muted font-mono">
                      {customer.quickbooks_id || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={customer.outstanding_balance > 0 ? 'text-ds-critical-text font-medium' : 'text-ds-text-muted'}>
                        {formatCurrency(customer.outstanding_balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{getSyncStatusBadge(customer.sync_status)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        {customer.sync_status !== 'synced' && (
                          <button
                            onClick={() => handleSyncCustomer(customer.id)}
                            disabled={syncing === customer.id}
                            className="min-h-ds-touch px-3 py-1 text-sm bg-ds-accent-soft text-ds-accent-text rounded hover:bg-ds-accent-soft disabled:opacity-50"
                          >
                            {syncing === customer.id ? 'Syncing...' : 'Sync'}
                          </button>
                        )}
                        <a
                          href={`/patients/${customer.id}`}
                          className="px-3 py-1 text-sm bg-ds-subtle text-ds-text-muted rounded hover:bg-ds-border"
                        >
                          View
                        </a>
                        {customer.outstanding_balance > 0 && (
                          <a
                            href={`${import.meta.env.VITE_API_URL || ''}/api/accountant/statement/${customer.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 text-sm bg-ds-info-soft text-ds-info-text rounded hover:bg-ds-info-soft flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Statement
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded Details */}
                  {expandedId === customer.id && (
                    <tr className="bg-ds-subtle">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <h4 className="text-sm font-medium text-ds-text-muted mb-2">Contact Information</h4>
                            <div className="space-y-1 text-sm">
                              <p><span className="text-ds-text-muted">Phone:</span> {customer.phone || 'N/A'}</p>
                              <p><span className="text-ds-text-muted">Email:</span> {customer.email || 'N/A'}</p>
                              <p><span className="text-ds-text-muted">Address:</span> {customer.address || 'N/A'}</p>
                              <p><span className="text-ds-text-muted">City:</span> {customer.city || 'N/A'}</p>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-ds-text-muted mb-2">QuickBooks Info</h4>
                            <div className="space-y-1 text-sm">
                              <p><span className="text-ds-text-muted">QB ID:</span> {customer.quickbooks_id || 'Not synced'}</p>
                              <p><span className="text-ds-text-muted">Last Synced:</span> {customer.quickbooks_synced_at ? new Date(customer.quickbooks_synced_at).toLocaleString() : 'Never'}</p>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-ds-text-muted mb-2">Invoice Summary</h4>
                            <div className="space-y-1 text-sm">
                              <p><span className="text-ds-text-muted">Total Invoices:</span> {customer.total_invoices}</p>
                              <p><span className="text-ds-text-muted">Outstanding:</span> <span className={customer.outstanding_balance > 0 ? 'text-ds-critical-text' : ''}>{formatCurrency(customer.outstanding_balance)}</span></p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QBCustomers;
