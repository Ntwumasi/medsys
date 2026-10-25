import React, { useEffect, useState } from 'react';
import { format, isValid, parseISO, startOfWeek, startOfMonth } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import PrintableInvoice from '../components/PrintableInvoice';
import { useNotification } from '../context/NotificationContext';
import { TableRowSkeleton } from '../components/Skeleton';
import AppSelect from '../components/ui/AppSelect';

// Safe date formatting helper
const safeFormatDate = (dateValue: string | Date | null | undefined, formatString: string, fallback: string = 'N/A'): string => {
  if (!dateValue) return fallback;
  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (isValid(date)) {
      return format(date, formatString);
    }
    return fallback;
  } catch (error) {
    return fallback;
  }
};

interface InvoiceData {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_id: number;
  patient_number: string;
  patient_name: string;
  patient_email?: string;
  patient_phone?: string;
  patient_address?: string;
  patient_city?: string;
  patient_state?: string;
  encounter_id: number;
  encounter_number?: string;
  subtotal: number;
  tax: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  chief_complaint?: string;
  encounter_date?: string;
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

interface InvoiceStats {
  pending_count: number;
  paid_count: number;
  partial_count: number;
  pending_amount: number;
  paid_amount: number;
  total_collected: number;
}

const InvoicesPage: React.FC = () => {
  useDesignSystemPage();
  const { showToast } = useNotification();
  const [invoicesList, setInvoicesList] = useState<InvoiceData[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesStatusFilter, setInvoicesStatusFilter] = useState('all');
  const [invoicesSearchTerm, setInvoicesSearchTerm] = useState('');
  const [invoicesStats, setInvoicesStats] = useState<InvoiceStats | null>(null);

  // Time period filter - default to today
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');

  // Invoice modal state
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<InvoicePayerSource[]>([]);
  const [currentEncounterId, setCurrentEncounterId] = useState<number | null>(null);

  // Calculate date range based on time period
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
    loadInvoices();
  }, [invoicesStatusFilter, timePeriod]);

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      const response = await apiClient.get('/invoices', {
        params: {
          status: invoicesStatusFilter,
          search: invoicesSearchTerm || undefined,
          start_date: startDate,
          end_date: endDate,
          limit: 100,
        },
      });
      setInvoicesList(response.data.invoices || []);
      setInvoicesStats(response.data.stats || null);
    } catch (error) {
      console.error('Error loading invoices:', error);
      setInvoicesList([]);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const handleInvoiceSearch = () => {
    loadInvoices();
  };

  const handleViewInvoice = async (invoiceId: number) => {
    try {
      const response = await apiClient.get(`/invoices/${invoiceId}`);
      setInvoiceData(response.data.invoice);
      setInvoiceItems(response.data.items || []);
      setInvoicePayerSources(response.data.payer_sources || []);
      setCurrentEncounterId(response.data.invoice.encounter_id);
      setShowInvoice(true);
    } catch (error) {
      console.error('Error loading invoice:', error);
      showToast('Failed to load invoice', 'error');
    }
  };

  const handlePaymentComplete = () => {
    loadInvoices();
    setShowInvoice(false);
  };

  return (
    <AppLayout designSystem title="Invoices">
      <div className="space-y-6">
        {/* Stats Cards */}
        {invoicesStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-ds-surface p-6 rounded-ds-card shadow-ds-card border border-ds-border">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-ds-warning-soft rounded-md p-3">
                  <svg className="h-6 w-6 text-ds-warning-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-ds-text-muted">Pending</p>
                  <p className="text-2xl font-bold text-ds-warning-text">{invoicesStats.pending_count}</p>
                  <p className="text-xs text-ds-text-muted">GHS {Number(invoicesStats.pending_amount || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-ds-surface p-6 rounded-ds-card shadow-ds-card border border-ds-border">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-ds-accent-soft rounded-md p-3">
                  <svg className="h-6 w-6 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-ds-text-muted">Partial</p>
                  <p className="text-2xl font-bold text-ds-accent-text">{invoicesStats.partial_count}</p>
                </div>
              </div>
            </div>
            <div className="bg-ds-surface p-6 rounded-ds-card shadow-ds-card border border-ds-border">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-ds-success-soft rounded-md p-3">
                  <svg className="h-6 w-6 text-ds-success-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-ds-text-muted">Paid (30 days)</p>
                  <p className="text-2xl font-bold text-ds-success-text">{invoicesStats.paid_count}</p>
                  <p className="text-xs text-ds-text-muted">GHS {Number(invoicesStats.paid_amount || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-ds-surface p-6 rounded-ds-card shadow-ds-card border border-ds-border">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-ds-accent-soft rounded-md p-3">
                  <svg className="h-6 w-6 text-ds-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-ds-text-muted">Collected (30 days)</p>
                  <p className="text-2xl font-bold text-ds-accent-text">GHS {Number(invoicesStats.total_collected || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Time Period Filters */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Quick Period Filters */}
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

            {/* Search and Status Filter */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search by invoice #, patient name, or patient #..."
                  value={invoicesSearchTerm}
                  onChange={(e) => setInvoicesSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvoiceSearch()}
                  className="w-full px-4 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
                />
              </div>
              <AppSelect
                value={invoicesStatusFilter}
                onChange={(val) => setInvoicesStatusFilter(val)}
                options={[{value:'all',label:'All Statuses'},{value:'pending',label:'Pending'},{value:'partial',label:'Partial'},{value:'paid',label:'Paid'}]}
              />
              <button
                onClick={handleInvoiceSearch}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Invoice #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase tracking-wider">Visit Reason</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-ds-text-muted uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-ds-text-muted uppercase tracking-wider">Paid</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-ds-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-ds-text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-ds-surface divide-y divide-ds-border">
                {invoicesLoading ? (
                  <>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <TableRowSkeleton key={i} columns={8} />
                    ))}
                  </>
                ) : invoicesList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-ds-text-muted">
                      No invoices found
                    </td>
                  </tr>
                ) : (
                  invoicesList.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-ds-subtle">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-ds-text">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ds-text-muted">
                        {safeFormatDate(invoice.invoice_date, 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-ds-text">{invoice.patient_name}</div>
                        <div className="text-sm text-ds-text-muted">{invoice.patient_number}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-ds-text-muted max-w-xs truncate">
                        {invoice.chief_complaint || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ds-text text-right font-medium">
                        GHS {Number(invoice.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={invoice.amount_paid > 0 ? 'text-ds-success-text font-medium' : 'text-ds-text-muted'}>
                          GHS {Number(invoice.amount_paid || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          invoice.status === 'paid' ? 'bg-ds-success-soft text-ds-success-text' :
                          invoice.status === 'partial' ? 'bg-ds-accent-soft text-ds-accent-text' :
                          'bg-ds-warning-soft text-ds-warning-text'
                        }`}>
                          {invoice.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleViewInvoice(invoice.id)}
                          className="text-ds-accent-text hover:text-ds-accent-text font-medium text-sm"
                        >
                          View
                        </button>
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
      {showInvoice && invoiceData && currentEncounterId && (
        <PrintableInvoice
          invoice={invoiceData}
          items={invoiceItems}
          payerSources={invoicePayerSources}
          encounterId={currentEncounterId}
          onClose={() => setShowInvoice(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </AppLayout>
  );
};

export default InvoicesPage;
