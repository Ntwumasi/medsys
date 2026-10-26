import React, { useEffect, useState } from 'react';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import PrintableInvoice from '../components/PrintableInvoice';
import { useNotification } from '../context/NotificationContext';
import { TableRowSkeleton } from '../components/Skeleton';
import AppSelect from '../components/ui/AppSelect';

interface PendingInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_id: number;
  patient_number: string;
  patient_name: string;
  patient_email?: string;
  patient_phone?: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  days_outstanding: number;
  last_reminder_sent?: string;
  reminder_count: number;
}

interface InvoiceData {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_number: string;
  patient_name: string;
  patient_email?: string;
  patient_phone?: string;
  patient_address?: string;
  patient_city?: string;
  patient_state?: string;
  subtotal: number;
  tax: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  chief_complaint?: string;
  encounter_date?: string;
  encounter_id?: number;
}

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface InvoicePayerSource {
  id: number;
  payer_type: string;
  corporate_client_name?: string;
  insurance_provider_name?: string;
  is_primary: boolean;
}

const PendingPaymentsPage: React.FC = () => {
  useDesignSystemPage();
  const { showToast } = useNotification();
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [agingFilter, setAgingFilter] = useState<string>('all');

  // Summary stats
  const [summary, setSummary] = useState<{
    total_count: number;
    total_balance: number;
    bucket_0_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_90_plus: number;
  } | null>(null);

  // Invoice modal
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<InvoicePayerSource[]>([]);

  // Reminder state
  const [sendingReminder, setSendingReminder] = useState<number | null>(null);

  const getDateRange = () => {
    const today = new Date();
    const endDate = format(today, 'yyyy-MM-dd');
    let startDate: string;

    switch (timePeriod) {
      case 'today':
        startDate = endDate;
        break;
      case 'week':
        startDate = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        break;
      case 'month':
        startDate = format(startOfMonth(today), 'yyyy-MM-dd');
        break;
      case 'all':
      default:
        startDate = '2020-01-01';
        break;
    }

    return { startDate, endDate };
  };

  useEffect(() => {
    loadPendingInvoices();
  }, [timePeriod, agingFilter]);

  const loadPendingInvoices = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      const response = await apiClient.get('/invoices/pending-payments', {
        params: {
          start_date: startDate,
          end_date: endDate,
          aging_bucket: agingFilter !== 'all' ? agingFilter : undefined,
          search: searchTerm || undefined,
        },
      });
      setInvoices(response.data.invoices || []);
      setSummary(response.data.summary || null);
    } catch (error) {
      console.error('Error loading pending payments:', error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadPendingInvoices();
  };

  const handleViewInvoice = async (invoiceId: number) => {
    try {
      const response = await apiClient.get(`/invoices/${invoiceId}`);
      setInvoiceData(response.data.invoice);
      setInvoiceItems(response.data.items || []);
      setInvoicePayerSources(response.data.payer_sources || []);
      setShowInvoice(true);
    } catch (error) {
      console.error('Error loading invoice:', error);
      showToast('Failed to load invoice', 'error');
    }
  };

  const handleSendReminder = async (invoice: PendingInvoice) => {
    setSendingReminder(invoice.id);
    try {
      await apiClient.post('/reminders/send', {
        invoiceId: invoice.id,
        reminderType: 'sms',
      });
      showToast('Reminder sent successfully (logged)', 'success');
      loadPendingInvoices();
    } catch (error) {
      console.error('Error sending reminder:', error);
      showToast('Failed to send reminder', 'error');
    } finally {
      setSendingReminder(null);
    }
  };

  const handlePaymentComplete = () => {
    loadPendingInvoices();
    setShowInvoice(false);
  };

  return (
    <AppLayout designSystem title="Pending Payments">
      <div className="space-y-6">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-ds-success-soft rounded-ds-card p-4 border border-ds-success/30">
              <h4 className="text-sm font-medium text-ds-success-text">0-30 Days</h4>
              <p className="text-2xl font-bold text-ds-success-text">{summary.bucket_0_30}</p>
            </div>
            <div className="bg-ds-warning-soft rounded-ds-card p-4 border border-ds-warning-border">
              <h4 className="text-sm font-medium text-ds-warning-text">31-60 Days</h4>
              <p className="text-2xl font-bold text-ds-warning-text">{summary.bucket_31_60}</p>
            </div>
            <div className="bg-ds-warning-soft rounded-ds-card p-4 border border-ds-warning-border">
              <h4 className="text-sm font-medium text-ds-warning-text">61-90 Days</h4>
              <p className="text-2xl font-bold text-ds-warning-text">{summary.bucket_61_90}</p>
            </div>
            <div className="bg-ds-critical-soft rounded-ds-card p-4 border border-ds-critical-border">
              <h4 className="text-sm font-medium text-ds-critical-text">90+ Days</h4>
              <p className="text-2xl font-bold text-ds-critical-text">{summary.bucket_90_plus}</p>
            </div>
            <div className="bg-ds-info-soft rounded-ds-card p-4 border border-ds-info/30">
              <h4 className="text-sm font-medium text-ds-info-text">Total Outstanding</h4>
              <p className="text-xl font-bold text-ds-info-text">GHS {Number(summary.total_balance || 0).toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Time Period Filters */}
            <div className="flex gap-2">
              {[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'all', label: 'All Time' },
              ].map((period) => (
                <button
                  key={period.id}
                  onClick={() => setTimePeriod(period.id as 'today' | 'week' | 'month' | 'all')}
                  className={`min-h-ds-touch px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    timePeriod === period.id
                      ? 'bg-ds-accent text-ds-on-accent'
                      : 'bg-ds-subtle text-ds-text-secondary hover:bg-ds-border'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>

            {/* Search and Aging Filter */}
            <div className="flex flex-wrap gap-4 items-center">
              <input
                type="text"
                placeholder="Search by patient name or invoice #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="px-4 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring min-w-[200px]"
              />
              <AppSelect
                value={agingFilter}
                onChange={(val) => setAgingFilter(val)}
                options={[{value:'all',label:'All Ages'},{value:'0-30',label:'0-30 Days'},{value:'31-60',label:'31-60 Days'},{value:'61-90',label:'61-90 Days'},{value:'90+',label:'90+ Days'}]}
              />
              <button
                onClick={handleSearch}
                className="min-h-ds-touch px-6 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover transition-colors font-medium"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ds-border">
              <thead className="bg-ds-subtle">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Invoice #</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-ds-text-muted uppercase">Balance</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-ds-text-muted uppercase">Days</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-ds-text-muted uppercase">Reminders</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-ds-text-muted uppercase">Contact</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-ds-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-ds-surface divide-y divide-ds-border">
                {loading ? (
                  <>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <TableRowSkeleton key={i} columns={7} />
                    ))}
                  </>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-ds-text-muted">
                      No pending payments found
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-ds-subtle">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-ds-text">{invoice.patient_name}</div>
                        <div className="text-sm text-ds-text-muted">{invoice.patient_number}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-ds-text">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-ds-critical-text">
                        GHS {Number(invoice.balance || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          invoice.days_outstanding > 90 ? 'bg-ds-critical-soft text-ds-critical-text' :
                          invoice.days_outstanding > 60 ? 'bg-ds-warning-soft text-ds-warning-text' :
                          invoice.days_outstanding > 30 ? 'bg-ds-warning-soft text-ds-warning-text' :
                          'bg-ds-success-soft text-ds-success-text'
                        }`}>
                          {invoice.days_outstanding}d
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-ds-text-muted">
                        {invoice.reminder_count > 0 ? (
                          <span className="text-ds-accent-text">{invoice.reminder_count} sent</span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          {invoice.patient_phone && (
                            <span className="text-xs bg-ds-info-soft text-ds-info-text px-2 py-1 rounded">Phone</span>
                          )}
                          {invoice.patient_email && (
                            <span className="text-xs bg-ds-subtle text-ds-brand-plum px-2 py-1 rounded">Email</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleViewInvoice(invoice.id)}
                            className="text-ds-accent-text hover:text-ds-accent-text text-sm font-medium"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleSendReminder(invoice)}
                            disabled={sendingReminder === invoice.id}
                            className="text-ds-warning-text hover:text-ds-warning-text text-sm font-medium disabled:opacity-50"
                          >
                            {sendingReminder === invoice.id ? 'Sending...' : 'Remind'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Invoice Modal */}
      {showInvoice && invoiceData && (
        <PrintableInvoice
          invoice={invoiceData}
          items={invoiceItems}
          payerSources={invoicePayerSources}
          onClose={() => setShowInvoice(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </AppLayout>
  );
};

export default PendingPaymentsPage;
