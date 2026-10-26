import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import AppSelect from '../../components/ui/AppSelect';

interface Invoice {
  id: number;
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  encounter_id: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  due_date: string;
  created_at: string;
  quickbooks_id: string | null;
  quickbooks_synced_at: string | null;
  sync_status: 'synced' | 'pending' | 'error' | 'not_synced';
  items: InvoiceItem[];
}

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  charge_master_code: string;
}

interface PaymentFormData {
  amount: number;
  payment_method: string;
  reference_number: string;
  notes: string;
}

const QBInvoices: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'synced' | 'not_synced' | 'unpaid' | 'overdue'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    amount: 0,
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [filter]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get(`/qb/invoices?filter=${filter}`);
      setInvoices(res.data || []);
    } catch (err: any) {
      console.error('Error loading invoices:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncInvoice = async (invoiceId: number) => {
    try {
      setSyncing(invoiceId);
      await apiClient.post(`/quickbooks/queue/invoice/${invoiceId}`);
      await loadInvoices();
    } catch (error) {
      console.error('Error syncing invoice:', error);
    } finally {
      setSyncing(null);
    }
  };

  const openPaymentModal = (invoice: Invoice) => {
    setPaymentModal(invoice);
    setPaymentForm({
      amount: invoice.balance_due,
      payment_method: 'cash',
      reference_number: '',
      notes: '',
    });
  };

  const handleRecordPayment = async () => {
    if (!paymentModal) return;

    try {
      setSubmittingPayment(true);
      await apiClient.post(`/qb/invoices/${paymentModal.id}/payment`, paymentForm);
      setPaymentModal(null);
      await loadInvoices();
    } catch (error) {
      console.error('Error recording payment:', error);
    } finally {
      setSubmittingPayment(false);
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

  const getInvoiceStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      draft: { bg: 'bg-ds-subtle', text: 'text-ds-text-secondary' },
      pending: { bg: 'bg-ds-warning-soft', text: 'text-ds-warning-text' },
      paid: { bg: 'bg-ds-success-soft', text: 'text-ds-success-text' },
      partial: { bg: 'bg-ds-accent-soft', text: 'text-ds-accent-text' },
      overdue: { bg: 'bg-ds-critical-soft', text: 'text-ds-critical-text' },
      cancelled: { bg: 'bg-ds-subtle', text: 'text-ds-text-secondary' },
    };
    const style = styles[status] || styles.pending;
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${style.bg} ${style.text}`}>
        {status}
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

  const filteredInvoices = invoices.filter(i => {
    const matchesSearch = search === '' ||
      i.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      i.patient_name?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

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
        <h3 className="font-semibold text-ds-critical-text">Error loading invoices</h3>
        <p className="text-ds-critical-text text-sm mt-1">{error}</p>
        <button
          onClick={loadInvoices}
          className="min-h-ds-touch mt-3 px-4 py-2 bg-ds-critical text-white rounded-lg hover:bg-ds-critical/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'unpaid', 'overdue', 'synced', 'not_synced'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-ds-touch px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-ds-accent-soft text-ds-accent-text'
                    : 'text-ds-text-muted hover:bg-ds-subtle'
                }`}
              >
                {f === 'all' ? 'All' : f === 'unpaid' ? 'Unpaid' : f === 'overdue' ? 'Overdue' : f === 'synced' ? 'Synced' : 'Not Synced'}
              </button>
            ))}
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ds-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-ds-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
            />
          </div>
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-ds-surface rounded-ds-card shadow-card border border-ds-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-ds-subtle border-b border-ds-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Paid</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">QB Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ds-text-muted">
                  No invoices found
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => (
                <React.Fragment key={invoice.id}>
                  <tr
                    className={`hover:bg-ds-subtle cursor-pointer ${expandedId === invoice.id ? 'bg-ds-accent-soft' : ''}`}
                    onClick={() => setExpandedId(expandedId === invoice.id ? null : invoice.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ds-text">{invoice.invoice_number}</p>
                      <p className="text-xs text-ds-text-muted">{formatDate(invoice.created_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-ds-text">{invoice.patient_name}</td>
                    <td className="px-4 py-3 text-sm font-medium text-ds-text">{formatCurrency(invoice.total_amount)}</td>
                    <td className="px-4 py-3 text-sm text-ds-success-text">{formatCurrency(invoice.amount_paid)}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <span className={invoice.balance_due > 0 ? 'text-ds-critical-text' : 'text-ds-success-text'}>
                        {formatCurrency(invoice.balance_due)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{getInvoiceStatusBadge(invoice.status)}</td>
                    <td className="px-4 py-3">{getSyncStatusBadge(invoice.sync_status)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        {invoice.balance_due > 0 && (
                          <button
                            onClick={() => openPaymentModal(invoice)}
                            className="min-h-ds-touch px-3 py-1 text-sm bg-ds-success-soft text-ds-success-text rounded hover:bg-ds-success-soft"
                          >
                            Pay
                          </button>
                        )}
                        {invoice.sync_status !== 'synced' && (
                          <button
                            onClick={() => handleSyncInvoice(invoice.id)}
                            disabled={syncing === invoice.id}
                            className="min-h-ds-touch px-3 py-1 text-sm bg-ds-accent-soft text-ds-accent-text rounded hover:bg-ds-accent-soft disabled:opacity-50"
                          >
                            {syncing === invoice.id ? 'Syncing...' : 'Sync'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded Details */}
                  {expandedId === invoice.id && (
                    <tr className="bg-ds-subtle">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <h4 className="text-sm font-medium text-ds-text-muted mb-2">Invoice Details</h4>
                              <div className="space-y-1 text-sm">
                                <p><span className="text-ds-text-muted">Due Date:</span> {invoice.due_date ? formatDate(invoice.due_date) : 'N/A'}</p>
                                <p><span className="text-ds-text-muted">Encounter ID:</span> {invoice.encounter_id}</p>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-ds-text-muted mb-2">QuickBooks Info</h4>
                              <div className="space-y-1 text-sm">
                                <p><span className="text-ds-text-muted">QB ID:</span> {invoice.quickbooks_id || 'Not synced'}</p>
                                <p><span className="text-ds-text-muted">Last Synced:</span> {invoice.quickbooks_synced_at ? new Date(invoice.quickbooks_synced_at).toLocaleString() : 'Never'}</p>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-ds-text-muted mb-2">Payment Summary</h4>
                              <div className="space-y-1 text-sm">
                                <p><span className="text-ds-text-muted">Total:</span> {formatCurrency(invoice.total_amount)}</p>
                                <p><span className="text-ds-text-muted">Paid:</span> <span className="text-ds-success-text">{formatCurrency(invoice.amount_paid)}</span></p>
                                <p><span className="text-ds-text-muted">Balance:</span> <span className={invoice.balance_due > 0 ? 'text-ds-critical-text font-medium' : 'text-ds-success-text'}>{formatCurrency(invoice.balance_due)}</span></p>
                              </div>
                            </div>
                          </div>

                          {/* Line Items */}
                          {invoice.items && invoice.items.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-ds-text-muted mb-2">Line Items</h4>
                              <div className="bg-ds-surface rounded-lg border border-ds-border overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-ds-subtle">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-ds-text-muted">Code</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-ds-text-muted">Description</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-ds-text-muted">Qty</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-ds-text-muted">Unit Price</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-ds-text-muted">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {invoice.items.map((item) => (
                                      <tr key={item.id}>
                                        <td className="px-3 py-2 font-mono text-xs">{item.charge_master_code}</td>
                                        <td className="px-3 py-2">{item.description}</td>
                                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(item.unit_price)}</td>
                                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
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

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ds-text">Record Payment</h3>
              <button
                onClick={() => setPaymentModal(null)}
                className="text-ds-text-muted hover:text-text-primary"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-ds-subtle rounded-lg p-3">
                <p className="text-sm text-ds-text-muted">Invoice</p>
                <p className="font-medium">{paymentModal.invoice_number}</p>
                <p className="text-sm text-ds-text-muted mt-1">
                  Balance Due: <span className="font-medium text-ds-critical-text">{formatCurrency(paymentModal.balance_due)}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ds-text-muted mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-ds-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
                />
              </div>

              <AppSelect
                label="Payment Method"
                value={paymentForm.payment_method}
                onChange={(val) => setPaymentForm({...paymentForm, payment_method: val})}
                options={[{value:'cash',label:'Cash'},{value:'card',label:'Card'},{value:'mobile_money',label:'Mobile Money'},{value:'bank_transfer',label:'Bank Transfer'},{value:'cheque',label:'Cheque'},{value:'insurance',label:'Insurance'}]}
              />

              <div>
                <label className="block text-sm font-medium text-ds-text-muted mb-1">Reference Number</label>
                <input
                  type="text"
                  value={paymentForm.reference_number}
                  onChange={(e) => setPaymentForm({...paymentForm, reference_number: e.target.value})}
                  placeholder="Transaction ID, Cheque #, etc."
                  className="w-full px-3 py-2 border border-ds-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ds-text-muted mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full px-3 py-2 border border-ds-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPaymentModal(null)}
                  className="min-h-ds-touch flex-1 px-4 py-2 border border-ds-border rounded-lg text-ds-text-muted hover:bg-ds-subtle"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={submittingPayment || paymentForm.amount <= 0}
                  className="min-h-ds-touch flex-1 px-4 py-2 bg-ds-success text-white dark:text-ds-canvas rounded-lg hover:bg-ds-success/90 disabled:opacity-50"
                >
                  {submittingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QBInvoices;
