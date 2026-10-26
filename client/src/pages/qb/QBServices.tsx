import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';

interface Service {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  category: string;
  is_active: boolean;
  quickbooks_id: string | null;
  quickbooks_synced_at: string | null;
  sync_status: 'synced' | 'pending' | 'error' | 'not_synced';
}

const QBServices: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'synced' | 'not_synced'>('all');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadServices();
  }, [filter]);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get(`/qb/services?filter=${filter}`);
      setServices(res.data || []);
    } catch (err: any) {
      console.error('Error loading services:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncService = async (serviceId: number) => {
    try {
      setSyncing(serviceId);
      await apiClient.post(`/qb/services/${serviceId}/sync`);
      await loadServices();
    } catch (error) {
      console.error('Error syncing service:', error);
    } finally {
      setSyncing(null);
    }
  };

  const handleBulkSync = async () => {
    try {
      setSyncing(-1);
      await Promise.all(selectedIds.map(id =>
        apiClient.post(`/qb/services/${id}/sync`)
      ));
      setSelectedIds([]);
      await loadServices();
    } catch (error) {
      console.error('Error bulk syncing:', error);
    } finally {
      setSyncing(null);
    }
  };

  const handleImportFromQB = async () => {
    try {
      setImporting(true);
      await apiClient.post('/quickbooks/import/items');
      await loadServices();
    } catch (error) {
      console.error('Error importing from QB:', error);
    } finally {
      setImporting(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const unsyncedIds = filteredServices
      .filter(s => s.sync_status === 'not_synced')
      .map(s => s.id);

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

  const filteredServices = services.filter(s => {
    const matchesSearch = search === '' ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.code?.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  // Group by category
  const servicesByCategory = filteredServices.reduce((acc, service) => {
    const cat = service.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(service);
    return acc;
  }, {} as Record<string, Service[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ds-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-ds-critical-soft border border-ds-critical-border rounded-lg p-4">
        <h3 className="font-semibold text-ds-critical-text">Error loading services</h3>
        <p className="text-ds-critical-text text-sm mt-1">{error}</p>
        <button
          onClick={loadServices}
          className="min-h-ds-touch mt-3 px-4 py-2 bg-ds-critical text-white rounded-lg hover:bg-ds-critical/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Total Services</p>
          <p className="text-2xl font-bold text-ds-text">{services.length}</p>
        </div>
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Synced to QB</p>
          <p className="text-2xl font-bold text-ds-success-text">
            {services.filter(s => s.sync_status === 'synced').length}
          </p>
        </div>
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Not Synced</p>
          <p className="text-2xl font-bold text-ds-warning-text">
            {services.filter(s => s.sync_status === 'not_synced').length}
          </p>
        </div>
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Categories</p>
          <p className="text-2xl font-bold text-ds-accent-text">
            {Object.keys(servicesByCategory).length}
          </p>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'synced', 'not_synced'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-ds-touch px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-ds-accent-soft text-ds-accent-text'
                    : 'text-ds-text-muted hover:bg-ds-subtle'
                }`}
              >
                {f === 'all' ? 'All' : f === 'synced' ? 'Synced' : 'Not Synced'}
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
                placeholder="Search services..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-ds-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
              />
            </div>
            <button
              onClick={handleImportFromQB}
              disabled={importing}
              className="min-h-ds-touch px-4 py-2 border border-ds-accent text-ds-accent-text rounded-lg hover:bg-ds-accent-soft disabled:opacity-50 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-ds-accent border-t-transparent"></div>
                  Importing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                  </svg>
                  Import from QB
                </>
              )}
            </button>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                    </svg>
                    Sync {selectedIds.length} to QB
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Services List */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-ds-subtle border-b border-ds-border">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === filteredServices.filter(s => s.sync_status === 'not_synced').length}
                  onChange={toggleSelectAll}
                  className="rounded border-ds-border-control"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Service Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">QB ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredServices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ds-text-muted">
                  No services found
                </td>
              </tr>
            ) : (
              filteredServices.map((service) => (
                <tr key={service.id} className="hover:bg-ds-subtle">
                  <td className="px-4 py-3">
                    {service.sync_status === 'not_synced' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(service.id)}
                        onChange={() => toggleSelect(service.id)}
                        className="rounded border-ds-border-control"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-ds-text-muted">{service.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ds-text">{service.name}</p>
                    {service.description && (
                      <p className="text-xs text-ds-text-muted truncate max-w-xs">{service.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-ds-subtle text-ds-text-secondary">
                      {service.category || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-ds-text">{formatCurrency(service.price)}</td>
                  <td className="px-4 py-3 text-sm text-ds-text-muted font-mono">
                    {service.quickbooks_id || '-'}
                  </td>
                  <td className="px-4 py-3">{getSyncStatusBadge(service.sync_status)}</td>
                  <td className="px-4 py-3">
                    {service.sync_status !== 'synced' && (
                      <button
                        onClick={() => handleSyncService(service.id)}
                        disabled={syncing === service.id}
                        className="min-h-ds-touch px-3 py-1 text-sm bg-ds-accent-soft text-ds-accent-text rounded hover:bg-ds-accent-soft disabled:opacity-50"
                      >
                        {syncing === service.id ? 'Syncing...' : 'Sync'}
                      </button>
                    )}
                    {service.quickbooks_synced_at && (
                      <span className="text-xs text-ds-text-muted block mt-1">
                        {new Date(service.quickbooks_synced_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QBServices;
