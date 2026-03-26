import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';

interface Payment {
  id: number;
  invoice_id: number;
  invoice_number: string;
  patient_name: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string;
  notes: string;
  created_by_name: string;
  quickbooks_txn_id: string | null;
  quickbooks_synced_at: string | null;
  sync_status: 'synced' | 'pending' | 'error' | 'not_synced';
}

const QBPayments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'synced' | 'not_synced'>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    loadPayments();
  }, [filter, methodFilter, dateRange]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('filter', filter);
      if (methodFilter !== 'all') params.append('method', methodFilter);
      if (dateRange.start) params.append('start', dateRange.start);
      if (dateRange.end) params.append('end', dateRange.end);

      const res = await apiClient.get(`/qb/payments?${params.toString()}`);
      setPayments(res.data || []);
    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPayment = async (paymentId: number) => {
    try {
      setSyncing(paymentId);
      await apiClient.post(`/quickbooks/queue/payment/${paymentId}`);
      await loadPayments();
    } catch (error) {
      console.error('Error syncing payment:', error);
    } finally {
      setSyncing(null);
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

  const getMethodBadge = (method: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      cash: { bg: 'bg-success-100', text: 'text-success-700' },
      card: { bg: 'bg-primary-100', text: 'text-primary-700' },
      mobile_money: { bg: 'bg-warning-100', text: 'text-warning-700' },
      bank_transfer: { bg: 'bg-secondary-100', text: 'text-secondary-700' },
      cheque: { bg: 'bg-gray-100', text: 'text-gray-700' },
      insurance: { bg: 'bg-accent-100', text: 'text-accent-700' },
    };
    const style = styles[method] || { bg: 'bg-gray-100', text: 'text-gray-700' };
    const label = method.replace('_', ' ');
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${style.bg} ${style.text}`}>
        {label}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const filteredPayments = payments.filter(p => {
    const matchesSearch = search === '' ||
      p.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      p.patient_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.reference_number?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Total Payments</p>
          <p className="text-2xl font-bold text-text-primary">{filteredPayments.length}</p>
        </div>
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Total Amount</p>
          <p className="text-2xl font-bold text-success-600">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Synced to QB</p>
          <p className="text-2xl font-bold text-primary-600">
            {filteredPayments.filter(p => p.sync_status === 'synced').length}
          </p>
        </div>
        <div className="bg-surface rounded-xl shadow-card border border-border p-4">
          <p className="text-sm text-text-secondary">Pending Sync</p>
          <p className="text-2xl font-bold text-warning-600">
            {filteredPayments.filter(p => p.sync_status === 'not_synced' || p.sync_status === 'pending').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl shadow-card border border-border p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
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
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="insurance">Insurance</option>
            </select>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-text-secondary">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Payments List */}
      <div className="bg-surface rounded-xl shadow-card border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Method</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">QB Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-secondary">
                  No payments found
                </td>
              </tr>
            ) : (
              filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm text-text-primary">{formatDate(payment.payment_date)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/qb/invoices`}
                      className="text-sm text-primary-600 hover:underline"
                    >
                      {payment.invoice_number}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">{payment.patient_name}</td>
                  <td className="px-4 py-3 text-sm font-medium text-success-600">{formatCurrency(payment.amount)}</td>
                  <td className="px-4 py-3">{getMethodBadge(payment.payment_method)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                    {payment.reference_number || '-'}
                  </td>
                  <td className="px-4 py-3">{getSyncStatusBadge(payment.sync_status)}</td>
                  <td className="px-4 py-3">
                    {payment.sync_status !== 'synced' && (
                      <button
                        onClick={() => handleSyncPayment(payment.id)}
                        disabled={syncing === payment.id}
                        className="px-3 py-1 text-sm bg-primary-100 text-primary-700 rounded hover:bg-primary-200 disabled:opacity-50"
                      >
                        {syncing === payment.id ? 'Syncing...' : 'Sync'}
                      </button>
                    )}
                    {payment.quickbooks_txn_id && (
                      <span className="text-xs text-text-secondary block mt-1">
                        QB: {payment.quickbooks_txn_id}
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

export default QBPayments;
