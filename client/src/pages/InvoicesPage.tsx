import React, { useEffect, useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import PrintableInvoice from '../components/PrintableInvoice';
import { useNotification } from '../context/NotificationContext';

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
  const { showToast } = useNotification();
  const [invoicesList, setInvoicesList] = useState<InvoiceData[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesStatusFilter, setInvoicesStatusFilter] = useState('all');
  const [invoicesSearchTerm, setInvoicesSearchTerm] = useState('');
  const [invoicesStats, setInvoicesStats] = useState<InvoiceStats | null>(null);

  // Invoice modal state
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<InvoicePayerSource[]>([]);
  const [currentEncounterId, setCurrentEncounterId] = useState<number | null>(null);

  useEffect(() => {
    loadInvoices();
  }, [invoicesStatusFilter]);

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const response = await apiClient.get('/invoices', {
        params: {
          status: invoicesStatusFilter,
          search: invoicesSearchTerm || undefined,
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
    <AppLayout title="Invoices">
      <div className="space-y-6">
        {/* Stats Cards */}
        {invoicesStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-warning-100 rounded-md p-3">
                  <svg className="h-6 w-6 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Pending</p>
                  <p className="text-2xl font-bold text-warning-600">{invoicesStats.pending_count}</p>
                  <p className="text-xs text-gray-400">GHS {Number(invoicesStats.pending_amount || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
                  <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Partial</p>
                  <p className="text-2xl font-bold text-primary-600">{invoicesStats.partial_count}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-success-100 rounded-md p-3">
                  <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Paid (30 days)</p>
                  <p className="text-2xl font-bold text-success-600">{invoicesStats.paid_count}</p>
                  <p className="text-xs text-gray-400">GHS {Number(invoicesStats.paid_amount || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-secondary-100 rounded-md p-3">
                  <svg className="h-6 w-6 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Collected (30 days)</p>
                  <p className="text-2xl font-bold text-secondary-600">GHS {Number(invoicesStats.total_collected || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by invoice #, patient name, or patient #..."
                value={invoicesSearchTerm}
                onChange={(e) => setInvoicesSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvoiceSearch()}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <select
              value={invoicesStatusFilter}
              onChange={(e) => setInvoicesStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
            <button
              onClick={handleInvoiceSearch}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Search
            </button>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visit Reason</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoicesLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : invoicesList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No invoices found
                    </td>
                  </tr>
                ) : (
                  invoicesList.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {safeFormatDate(invoice.invoice_date, 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{invoice.patient_name}</div>
                        <div className="text-sm text-gray-500">{invoice.patient_number}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {invoice.chief_complaint || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                        GHS {Number(invoice.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={invoice.amount_paid > 0 ? 'text-success-600 font-medium' : 'text-gray-400'}>
                          GHS {Number(invoice.amount_paid || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          invoice.status === 'paid' ? 'bg-success-100 text-success-800' :
                          invoice.status === 'partial' ? 'bg-primary-100 text-primary-800' :
                          'bg-warning-100 text-warning-800'
                        }`}>
                          {invoice.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleViewInvoice(invoice.id)}
                          className="text-primary-600 hover:text-primary-900 font-medium text-sm"
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
