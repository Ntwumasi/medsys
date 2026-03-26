import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';

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
      const res = await apiClient.get(`/qb/invoices?filter=${filter}`);
      setInvoices(res.data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
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

  const getInvoiceStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
      pending: { bg: 'bg-warning-100', text: 'text-warning-700' },
      paid: { bg: 'bg-success-100', text: 'text-success-700' },
      partial: { bg: 'bg-primary-100', text: 'text-primary-700' },
      overdue: { bg: 'bg-danger-100', text: 'text-danger-700' },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-600' },
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="bg-surface rounded-xl shadow-card border border-border p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'unpaid', 'overdue', 'synced', 'not_synced'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-text-secondary hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? 'All' : f === 'unpaid' ? 'Unpaid' : f === 'overdue' ? 'Overdue' : f === 'synced' ? 'Synced' : 'Not Synced'}
              </button>
            ))}
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-surface rounded-xl shadow-card border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Paid</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">QB Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-secondary">
                  No invoices found
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => (
                <React.Fragment key={invoice.id}>
                  <tr
                    className={`hover:bg-gray-50 cursor-pointer ${expandedId === invoice.id ? 'bg-primary-50' : ''}`}
                    onClick={() => setExpandedId(expandedId === invoice.id ? null : invoice.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{invoice.invoice_number}</p>
                      <p className="text-xs text-text-secondary">{formatDate(invoice.created_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">{invoice.patient_name}</td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{formatCurrency(invoice.total_amount)}</td>
                    <td className="px-4 py-3 text-sm text-success-600">{formatCurrency(invoice.amount_paid)}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <span className={invoice.balance_due > 0 ? 'text-danger-600' : 'text-success-600'}>
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
                            className="px-3 py-1 text-sm bg-success-100 text-success-700 rounded hover:bg-success-200"
                          >
                            Pay
                          </button>
                        )}
                        {invoice.sync_status !== 'synced' && (
                          <button
                            onClick={() => handleSyncInvoice(invoice.id)}
                            disabled={syncing === invoice.id}
                            className="px-3 py-1 text-sm bg-primary-100 text-primary-700 rounded hover:bg-primary-200 disabled:opacity-50"
                          >
                            {syncing === invoice.id ? 'Syncing...' : 'Sync'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded Details */}
                  {expandedId === invoice.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <h4 className="text-sm font-medium text-text-secondary mb-2">Invoice Details</h4>
                              <div className="space-y-1 text-sm">
                                <p><span className="text-text-secondary">Due Date:</span> {invoice.due_date ? formatDate(invoice.due_date) : 'N/A'}</p>
                                <p><span className="text-text-secondary">Encounter ID:</span> {invoice.encounter_id}</p>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-text-secondary mb-2">QuickBooks Info</h4>
                              <div className="space-y-1 text-sm">
                                <p><span className="text-text-secondary">QB ID:</span> {invoice.quickbooks_id || 'Not synced'}</p>
                                <p><span className="text-text-secondary">Last Synced:</span> {invoice.quickbooks_synced_at ? new Date(invoice.quickbooks_synced_at).toLocaleString() : 'Never'}</p>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-text-secondary mb-2">Payment Summary</h4>
                              <div className="space-y-1 text-sm">
                                <p><span className="text-text-secondary">Total:</span> {formatCurrency(invoice.total_amount)}</p>
                                <p><span className="text-text-secondary">Paid:</span> <span className="text-success-600">{formatCurrency(invoice.amount_paid)}</span></p>
                                <p><span className="text-text-secondary">Balance:</span> <span className={invoice.balance_due > 0 ? 'text-danger-600 font-medium' : 'text-success-600'}>{formatCurrency(invoice.balance_due)}</span></p>
                              </div>
                            </div>
                          </div>

                          {/* Line Items */}
                          {invoice.items && invoice.items.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-text-secondary mb-2">Line Items</h4>
                              <div className="bg-white rounded-lg border border-border overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Code</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Description</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Qty</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Unit Price</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Total</th>
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
          <div className="bg-surface rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Record Payment</h3>
              <button
                onClick={() => setPaymentModal(null)}
                className="text-text-secondary hover:text-text-primary"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-text-secondary">Invoice</p>
                <p className="font-medium">{paymentModal.invoice_number}</p>
                <p className="text-sm text-text-secondary mt-1">
                  Balance Due: <span className="font-medium text-danger-600">{formatCurrency(paymentModal.balance_due)}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Payment Method</label>
                <select
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm({...paymentForm, payment_method: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="insurance">Insurance</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Reference Number</label>
                <input
                  type="text"
                  value={paymentForm.reference_number}
                  onChange={(e) => setPaymentForm({...paymentForm, reference_number: e.target.value})}
                  placeholder="Transaction ID, Cheque #, etc."
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPaymentModal(null)}
                  className="flex-1 px-4 py-2 border border-border rounded-lg text-text-secondary hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={submittingPayment || paymentForm.amount <= 0}
                  className="flex-1 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 disabled:opacity-50"
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
