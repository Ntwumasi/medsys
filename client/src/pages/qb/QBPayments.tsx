import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import AppSelect from '../../components/ui/AppSelect';

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

  const getMethodBadge = (method: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      cash: { bg: 'bg-ds-success-soft', text: 'text-ds-success-text' },
      card: { bg: 'bg-ds-accent-soft', text: 'text-ds-accent-text' },
      mobile_money: { bg: 'bg-ds-warning-soft', text: 'text-ds-warning-text' },
      bank_transfer: { bg: 'bg-ds-accent-soft', text: 'text-ds-brand-plum' },
      cheque: { bg: 'bg-ds-subtle', text: 'text-ds-text-secondary' },
      insurance: { bg: 'bg-accent-100', text: 'text-ds-accent-text' },
    };
    const style = styles[method] || { bg: 'bg-ds-subtle', text: 'text-ds-text-secondary' };
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

  const totalAmount = filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ds-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Total Payments</p>
          <p className="text-2xl font-bold text-ds-text">{filteredPayments.length}</p>
        </div>
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Total Amount</p>
          <p className="text-2xl font-bold text-ds-success-text">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Synced to QB</p>
          <p className="text-2xl font-bold text-ds-accent-text">
            {filteredPayments.filter(p => p.sync_status === 'synced').length}
          </p>
        </div>
        <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
          <p className="text-sm text-ds-text-muted">Pending Sync</p>
          <p className="text-2xl font-bold text-ds-warning-text">
            {filteredPayments.filter(p => p.sync_status === 'not_synced' || p.sync_status === 'pending').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
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
            <AppSelect
              value={methodFilter}
              onChange={(val) => setMethodFilter(val)}
              options={[{value:'all',label:'All Methods'},{value:'cash',label:'Cash'},{value:'card',label:'Card'},{value:'mobile_money',label:'Mobile Money'},{value:'bank_transfer',label:'Bank Transfer'},{value:'cheque',label:'Cheque'},{value:'insurance',label:'Insurance'}]}
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                className="px-3 py-1.5 text-sm border border-ds-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
              />
              <span className="text-ds-text-muted">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                className="px-3 py-1.5 text-sm border border-ds-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
              />
            </div>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ds-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-ds-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
            />
          </div>
        </div>
      </div>

      {/* Payments List */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-ds-subtle border-b border-ds-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Method</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">QB Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ds-text-muted">
                  No payments found
                </td>
              </tr>
            ) : (
              filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-ds-subtle">
                  <td className="px-4 py-3">
                    <p className="text-sm text-ds-text">{formatDate(payment.payment_date)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/qb/invoices`}
                      className="text-sm text-ds-accent-text hover:underline"
                    >
                      {payment.invoice_number}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-ds-text">{payment.patient_name}</td>
                  <td className="px-4 py-3 text-sm font-medium text-ds-success-text">{formatCurrency(Number(payment.amount || 0))}</td>
                  <td className="px-4 py-3">{getMethodBadge(payment.payment_method)}</td>
                  <td className="px-4 py-3 text-sm text-ds-text-muted font-mono">
                    {payment.reference_number || '-'}
                  </td>
                  <td className="px-4 py-3">{getSyncStatusBadge(payment.sync_status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`${import.meta.env.VITE_API_URL || ''}/api/accountant/receipt/${payment.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 text-sm bg-ds-success-soft text-ds-success-text rounded hover:bg-ds-success-soft flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Receipt
                      </a>
                      {payment.sync_status !== 'synced' && (
                        <button
                          onClick={() => handleSyncPayment(payment.id)}
                          disabled={syncing === payment.id}
                          className="min-h-ds-touch px-3 py-1 text-sm bg-ds-accent-soft text-ds-accent-text rounded hover:bg-ds-accent-soft disabled:opacity-50"
                        >
                          {syncing === payment.id ? 'Syncing...' : 'Sync'}
                        </button>
                      )}
                    </div>
                    {payment.quickbooks_txn_id && (
                      <span className="text-xs text-ds-text-muted block mt-1">
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
