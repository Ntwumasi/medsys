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
      synced: { bg: 'bg-success-100', text: 'text-success-700', label: 'Synced' },
      pending: { bg: 'bg-warning-100', text: 'text-warning-700', label: 'Pending' },
      error: { bg: 'bg-danger-100', text: 'text-danger-700', label: 'Error' },
      not_synced: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not Synced' },
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
        <h3 className="font-semibold text-danger-800">Error loading services</h3>
        <p className="text-danger-700 text-sm mt-1">{error}</p>
        <button
          onClick={loadServices}
          className="mt-3 px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700"
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
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Total Services</p>
          <p className="text-2xl font-bold text-text-primary">{services.length}</p>
        </div>
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Synced to QB</p>
          <p className="text-2xl font-bold text-success-600">
            {services.filter(s => s.sync_status === 'synced').length}
          </p>
        </div>
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Not Synced</p>
          <p className="text-2xl font-bold text-warning-600">
            {services.filter(s => s.sync_status === 'not_synced').length}
          </p>
        </div>
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Categories</p>
          <p className="text-2xl font-bold text-primary-600">
            {Object.keys(servicesByCategory).length}
          </p>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-surface rounded-xl shadow-card border border-border p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'synced', 'not_synced'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-text-secondary hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? 'All' : f === 'synced' ? 'Synced' : 'Not Synced'}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search services..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={handleImportFromQB}
              disabled={importing}
              className="px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 disabled:opacity-50 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
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
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                {syncing === -1 ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
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
      <div className="bg-surface rounded-xl shadow-card border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === filteredServices.filter(s => s.sync_status === 'not_synced').length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Service Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">QB ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredServices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-secondary">
                  No services found
                </td>
              </tr>
            ) : (
              filteredServices.map((service) => (
                <tr key={service.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {service.sync_status === 'not_synced' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(service.id)}
                        onChange={() => toggleSelect(service.id)}
                        className="rounded border-gray-300"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-text-secondary">{service.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{service.name}</p>
                    {service.description && (
                      <p className="text-xs text-text-secondary truncate max-w-xs">{service.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                      {service.category || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{formatCurrency(service.price)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                    {service.quickbooks_id || '-'}
                  </td>
                  <td className="px-4 py-3">{getSyncStatusBadge(service.sync_status)}</td>
                  <td className="px-4 py-3">
                    {service.sync_status !== 'synced' && (
                      <button
                        onClick={() => handleSyncService(service.id)}
                        disabled={syncing === service.id}
                        className="px-3 py-1 text-sm bg-primary-100 text-primary-700 rounded hover:bg-primary-200 disabled:opacity-50"
                      >
                        {syncing === service.id ? 'Syncing...' : 'Sync'}
                      </button>
                    )}
                    {service.quickbooks_synced_at && (
                      <span className="text-xs text-text-secondary block mt-1">
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
