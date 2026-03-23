import React, { useEffect, useState } from 'react';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import PrintableInvoice from '../components/PrintableInvoice';
import { useNotification } from '../context/NotificationContext';
import { TableRowSkeleton } from '../components/Skeleton';

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
    <AppLayout title="Pending Payments">
      <div className="space-y-6">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <h4 className="text-sm font-medium text-green-700">0-30 Days</h4>
              <p className="text-2xl font-bold text-green-900">{summary.bucket_0_30}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
              <h4 className="text-sm font-medium text-yellow-700">31-60 Days</h4>
              <p className="text-2xl font-bold text-yellow-900">{summary.bucket_31_60}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
              <h4 className="text-sm font-medium text-orange-700">61-90 Days</h4>
              <p className="text-2xl font-bold text-orange-900">{summary.bucket_61_90}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <h4 className="text-sm font-medium text-red-700">90+ Days</h4>
              <p className="text-2xl font-bold text-red-900">{summary.bucket_90_plus}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <h4 className="text-sm font-medium text-blue-700">Total Outstanding</h4>
              <p className="text-xl font-bold text-blue-900">GHS {Number(summary.total_balance || 0).toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
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
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    timePeriod === period.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 min-w-[200px]"
              />
              <select
                value={agingFilter}
                onChange={(e) => setAgingFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Ages</option>
                <option value="0-30">0-30 Days</option>
                <option value="31-60">31-60 Days</option>
                <option value="61-90">61-90 Days</option>
                <option value="90+">90+ Days</option>
              </select>
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Reminders</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <TableRowSkeleton key={i} columns={7} />
                    ))}
                  </>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No pending payments found
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{invoice.patient_name}</div>
                        <div className="text-sm text-gray-500">{invoice.patient_number}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-red-600">
                        GHS {Number(invoice.balance || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          invoice.days_outstanding > 90 ? 'bg-red-100 text-red-800' :
                          invoice.days_outstanding > 60 ? 'bg-orange-100 text-orange-800' :
                          invoice.days_outstanding > 30 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {invoice.days_outstanding}d
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-500">
                        {invoice.reminder_count > 0 ? (
                          <span className="text-primary-600">{invoice.reminder_count} sent</span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          {invoice.patient_phone && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Phone</span>
                          )}
                          {invoice.patient_email && (
                            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Email</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleViewInvoice(invoice.id)}
                            className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleSendReminder(invoice)}
                            disabled={sendingReminder === invoice.id}
                            className="text-warning-600 hover:text-warning-900 text-sm font-medium disabled:opacity-50"
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
