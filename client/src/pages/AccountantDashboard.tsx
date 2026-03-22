import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid, subDays } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import PrintableInvoice from '../components/PrintableInvoice';
import { useNotification } from '../context/NotificationContext';

interface FinancialSummary {
  total_invoices: number;
  total_billed: number;
  total_collected: number;
  total_outstanding: number;
  pending_count: number;
  partial_count: number;
  paid_count: number;
  pending_amount: number;
  paid_amount: number;
}

interface CategoryRevenue {
  category: string;
  invoice_count: number;
  total_amount: number;
}

interface DailyRevenue {
  date: string;
  billed: number;
  collected: number;
}

interface TopService {
  description: string;
  times_billed: number;
  total_revenue: number;
}

interface PaymentMethod {
  method: string;
  count: number;
  total: number;
}

interface InsuranceClaims {
  total_claims: number;
  pending_claims: number;
  submitted_claims: number;
  approved_claims: number;
  denied_claims: number;
  total_charged: number;
  total_approved: number;
  total_paid: number;
}

interface AgingInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_number: string;
  patient_name: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  days_outstanding: number;
  aging_bucket: string;
}

interface AgingSummary {
  aging_bucket: string;
  invoice_count: number;
  total_balance: number;
}

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

interface Claim {
  id: number;
  claim_number: string;
  invoice_id: number;
  patient_id: number;
  encounter_id: number;
  insurance_provider_id: number;
  insurance_provider_name: string;
  patient_name: string;
  patient_number: string;
  invoice_number: string;
  member_id: string;
  plan_option: string;
  primary_diagnosis_code: string;
  primary_diagnosis_desc: string;
  total_charged: number;
  amount_approved: number;
  amount_paid: number;
  patient_responsibility: number;
  annual_limit: number;
  used_to_date: number;
  remaining_coverage: number;
  status: string;
  diagnosis_validated: boolean;
  validation_issues: any[];
  reviewed_by_doctor: number;
  reviewed_by_name: string;
  doctor_reviewed_at: string;
  doctor_notes: string;
  submitted_at: string;
  created_at: string;
}

interface ClaimsSummary {
  total: number;
  draft: number;
  pending_review: number;
  approved_by_doctor: number;
  submitted: number;
  approved: number;
  denied: number;
  paid: number;
  total_charged: number;
  total_approved: number;
  total_paid: number;
}

const safeFormatDate = (dateValue: string | Date | null | undefined, formatString: string, fallback: string = 'N/A'): string => {
  if (!dateValue) return fallback;
  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (isValid(date)) {
      return format(date, formatString);
    }
    return fallback;
  } catch {
    return fallback;
  }
};

const AccountantDashboard: React.FC = () => {
  const { showToast } = useNotification();
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'aging' | 'claims'>('overview');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Date filters
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Financial data
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [categoryRevenue, setCategoryRevenue] = useState<CategoryRevenue[]>([]);
  // Daily revenue for charts (future enhancement)
  const [, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  // Legacy insurance claims from financial summary (now using claims API)
  const [, setInsuranceClaims] = useState<InsuranceClaims | null>(null);

  // Invoices
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [invoiceSearch, setInvoiceSearch] = useState('');

  // Aging
  const [agingInvoices, setAgingInvoices] = useState<AgingInvoice[]>([]);
  const [agingSummary, setAgingSummary] = useState<AgingSummary[]>([]);

  // Invoice modal
  const [showInvoice, setShowInvoice] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<InvoicePayerSource[]>([]);

  // Claims
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsSummary, setClaimsSummary] = useState<ClaimsSummary | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimFilter, setClaimFilter] = useState('all');
  const [claimSearch, setClaimSearch] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showCreateClaimModal, setShowCreateClaimModal] = useState(false);
  const [insuranceInvoices, setInsuranceInvoices] = useState<InvoiceData[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [coverageResult, setCoverageResult] = useState<any>(null);

  useEffect(() => {
    loadFinancialSummary();
  }, [startDate, endDate]);

  useEffect(() => {
    if (activeTab === 'invoices') {
      loadInvoices();
    } else if (activeTab === 'aging') {
      loadAgingReport();
    } else if (activeTab === 'claims') {
      loadClaims();
    }
  }, [activeTab, invoiceFilter, claimFilter]);

  const loadFinancialSummary = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/accountant/summary', {
        params: { start_date: startDate, end_date: endDate },
      });
      setSummary(response.data.summary);
      setCategoryRevenue(response.data.revenue_by_category || []);
      setDailyRevenue(response.data.daily_revenue || []);
      setTopServices(response.data.top_services || []);
      setPaymentMethods(response.data.payment_methods || []);
      setInsuranceClaims(response.data.insurance_claims);
    } catch (error) {
      console.error('Error loading financial summary:', error);
      showToast('Failed to load financial data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const response = await apiClient.get('/invoices', {
        params: {
          status: invoiceFilter,
          search: invoiceSearch || undefined,
          start_date: startDate,
          end_date: endDate,
          limit: 100,
        },
      });
      setInvoices(response.data.invoices || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const loadAgingReport = async () => {
    try {
      const response = await apiClient.get('/accountant/reports/aging');
      setAgingInvoices(response.data.invoices || []);
      setAgingSummary(response.data.summary || []);
    } catch (error) {
      console.error('Error loading aging report:', error);
    }
  };

  const loadClaims = async () => {
    setClaimsLoading(true);
    try {
      const response = await apiClient.get('/claims', {
        params: {
          status: claimFilter !== 'all' ? claimFilter : undefined,
          search: claimSearch || undefined,
        },
      });
      setClaims(response.data.claims || []);
      setClaimsSummary(response.data.summary || null);
    } catch (error) {
      console.error('Error loading claims:', error);
    } finally {
      setClaimsLoading(false);
    }
  };

  const loadInsuranceInvoices = async () => {
    try {
      const response = await apiClient.get('/invoices', {
        params: { status: 'all', limit: 100 },
      });
      // Filter to only show invoices that can have claims (with insurance payer)
      setInsuranceInvoices(response.data.invoices || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    }
  };

  const handleCreateClaim = async (invoiceId: number) => {
    try {
      const response = await apiClient.post('/claims', { invoice_id: invoiceId });
      showToast('Claim created successfully', 'success');
      setShowCreateClaimModal(false);
      loadClaims();
      // Open the new claim for editing
      handleViewClaim(response.data.claim.id);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to create claim', 'error');
    }
  };

  const handleViewClaim = async (claimId: number) => {
    try {
      const response = await apiClient.get(`/claims/${claimId}`);
      setSelectedClaim(response.data.claim);
      setValidationResult(null);
      setCoverageResult(null);
      setShowClaimModal(true);
    } catch (error) {
      console.error('Error loading claim:', error);
      showToast('Failed to load claim details', 'error');
    }
  };

  const handleValidateDiagnosis = async (claimId: number) => {
    try {
      const response = await apiClient.post(`/claims/${claimId}/validate`);
      setValidationResult(response.data);
      if (response.data.validated) {
        showToast('All orders validated for diagnosis', 'success');
      } else {
        showToast('Some orders require doctor override', 'warning');
      }
    } catch (error) {
      showToast('Failed to validate diagnosis', 'error');
    }
  };

  const handleCheckCoverage = async (claimId: number) => {
    try {
      const response = await apiClient.get(`/claims/${claimId}/coverage`);
      setCoverageResult(response.data);
      if (response.data.exceeds_limit) {
        showToast(`Claim exceeds coverage by GHS ${response.data.shortfall.toFixed(2)}`, 'warning');
      } else {
        showToast('Claim is within coverage limits', 'success');
      }
    } catch (error) {
      showToast('Failed to check coverage', 'error');
    }
  };

  const handleSubmitForReview = async (claimId: number, overrideReason?: string) => {
    try {
      await apiClient.post(`/claims/${claimId}/submit-for-review`, {
        validation_override_reason: overrideReason,
      });
      showToast('Claim submitted for doctor review', 'success');
      setShowClaimModal(false);
      loadClaims();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to submit for review', 'error');
    }
  };

  const handleUpdateClaimStatus = async (claimId: number, status: string, data?: any) => {
    try {
      await apiClient.put(`/claims/${claimId}/status`, { status, ...data });
      showToast('Claim status updated', 'success');
      setShowClaimModal(false);
      loadClaims();
    } catch (error) {
      showToast('Failed to update claim status', 'error');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending_validation: 'bg-blue-100 text-blue-800',
      pending_doctor_review: 'bg-yellow-100 text-yellow-800',
      doctor_rejected: 'bg-red-100 text-red-800',
      approved_by_doctor: 'bg-green-100 text-green-800',
      submitted: 'bg-purple-100 text-purple-800',
      processing: 'bg-indigo-100 text-indigo-800',
      approved: 'bg-emerald-100 text-emerald-800',
      partial: 'bg-orange-100 text-orange-800',
      denied: 'bg-red-100 text-red-800',
      paid: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleViewInvoice = async (invoiceId: number) => {
    try {
      const response = await apiClient.get(`/invoices/${invoiceId}`);
      setSelectedInvoice(response.data.invoice);
      setInvoiceItems(response.data.items || []);
      setInvoicePayerSources(response.data.payer_sources || []);
      setShowInvoice(true);
    } catch (error) {
      console.error('Error loading invoice:', error);
      showToast('Failed to load invoice', 'error');
    }
  };

  const handleExportInvoices = async () => {
    setExporting(true);
    try {
      const response = await apiClient.get('/accountant/export/invoices', {
        params: {
          start_date: startDate,
          end_date: endDate,
          status: invoiceFilter !== 'all' ? invoiceFilter : undefined,
        },
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoices_${startDate}_to_${endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('Invoices exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting invoices:', error);
      showToast('Failed to export invoices', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportSingleInvoice = async (invoiceId: number) => {
    try {
      const response = await apiClient.get(`/accountant/export/invoice/${invoiceId}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice_${invoiceId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('Invoice exported', 'success');
    } catch (error) {
      console.error('Error exporting invoice:', error);
      showToast('Failed to export invoice', 'error');
    }
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `GHS ${(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <AppLayout
      title="Accountant Portal"
    >
      <div className="space-y-6">
        {/* Date Range Filter */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={loadFinancialSummary}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'invoices', label: 'Invoices' },
                { id: 'aging', label: 'Aging Report' },
                { id: 'claims', label: 'Insurance Claims' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                        <h3 className="text-sm font-medium opacity-90">Total Billed</h3>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(summary?.total_billed || 0)}</p>
                        <p className="text-sm opacity-75 mt-1">{summary?.total_invoices || 0} invoices</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                        <h3 className="text-sm font-medium opacity-90">Total Collected</h3>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(summary?.total_collected || 0)}</p>
                        <p className="text-sm opacity-75 mt-1">{summary?.paid_count || 0} fully paid</p>
                      </div>
                      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                        <h3 className="text-sm font-medium opacity-90">Outstanding</h3>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(summary?.total_outstanding || 0)}</p>
                        <p className="text-sm opacity-75 mt-1">{summary?.pending_count || 0} pending</p>
                      </div>
                      <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                        <h3 className="text-sm font-medium opacity-90">Collection Rate</h3>
                        <p className="text-3xl font-bold mt-2">
                          {summary?.total_billed && summary.total_billed > 0
                            ? ((parseFloat(summary.total_collected as unknown as string) / parseFloat(summary.total_billed as unknown as string)) * 100).toFixed(1)
                            : 0}%
                        </p>
                        <p className="text-sm opacity-75 mt-1">{summary?.partial_count || 0} partial</p>
                      </div>
                    </div>

                    {/* Revenue by Category & Top Services */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Revenue by Category */}
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Category</h3>
                        <div className="space-y-3">
                          {categoryRevenue.map((cat) => (
                            <div key={cat.category} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-primary-500"></div>
                                <span className="text-sm font-medium text-gray-700 capitalize">{cat.category}</span>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-900">{formatCurrency(cat.total_amount)}</p>
                                <p className="text-xs text-gray-500">{cat.invoice_count} items</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top Services */}
                      <div className="bg-gray-50 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Services</h3>
                        <div className="space-y-3">
                          {topServices.slice(0, 5).map((service, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-primary-600">#{idx + 1}</span>
                                <span className="text-sm text-gray-700 truncate max-w-[200px]">{service.description}</span>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-900">{formatCurrency(service.total_revenue)}</p>
                                <p className="text-xs text-gray-500">{service.times_billed}x</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Payment Methods */}
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods (30 days)</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {paymentMethods.map((method) => (
                          <div key={method.method} className="bg-white rounded-lg p-4 shadow-sm">
                            <p className="text-sm text-gray-500 capitalize">{method.method.replace('_', ' ')}</p>
                            <p className="text-xl font-bold text-gray-900">{formatCurrency(method.total)}</p>
                            <p className="text-xs text-gray-400">{method.count} transactions</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex gap-4 items-center flex-1">
                    <input
                      type="text"
                      placeholder="Search invoices..."
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadInvoices()}
                      className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <select
                      value={invoiceFilter}
                      onChange={(e) => setInvoiceFilter(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                    </select>
                    <button
                      onClick={loadInvoices}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      Search
                    </button>
                  </div>
                  <button
                    onClick={handleExportInvoices}
                    disabled={exporting}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    {exporting ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    Export to Excel
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invoicesLoading ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center">
                            <div className="flex justify-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                            </div>
                          </td>
                        </tr>
                      ) : invoices.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No invoices found</td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{safeFormatDate(inv.invoice_date, 'MMM d, yyyy')}</td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{inv.patient_name}</div>
                              <div className="text-xs text-gray-500">{inv.patient_number}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                            <td className="px-4 py-3 text-sm text-right text-green-600">{formatCurrency(inv.amount_paid)}</td>
                            <td className="px-4 py-3 text-sm text-right text-red-600 font-medium">
                              {formatCurrency((parseFloat(inv.total_amount as unknown as string) || 0) - (parseFloat(inv.amount_paid as unknown as string) || 0))}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                                inv.status === 'partial' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {inv.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => handleViewInvoice(inv.id)}
                                  className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleExportSingleInvoice(inv.id)}
                                  className="text-green-600 hover:text-green-900 text-sm font-medium"
                                >
                                  Excel
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
            )}

            {/* Aging Report Tab */}
            {activeTab === 'aging' && (
              <div className="space-y-6">
                {/* Aging Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {agingSummary.map((bucket) => (
                    <div
                      key={bucket.aging_bucket}
                      className={`rounded-xl p-4 ${
                        bucket.aging_bucket === '90+ days' ? 'bg-red-50 border border-red-200' :
                        bucket.aging_bucket === '61-90 days' ? 'bg-orange-50 border border-orange-200' :
                        bucket.aging_bucket === '31-60 days' ? 'bg-yellow-50 border border-yellow-200' :
                        'bg-green-50 border border-green-200'
                      }`}
                    >
                      <h4 className="text-sm font-medium text-gray-700">{bucket.aging_bucket}</h4>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(bucket.total_balance)}</p>
                      <p className="text-xs text-gray-500">{bucket.invoice_count} invoices</p>
                    </div>
                  ))}
                </div>

                {/* Aging Details */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Bucket</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {agingInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{safeFormatDate(inv.invoice_date, 'MMM d, yyyy')}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{inv.patient_name}</div>
                            <div className="text-xs text-gray-500">{inv.patient_number}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">{formatCurrency(inv.total_amount)}</td>
                          <td className="px-4 py-3 text-sm text-right text-green-600">{formatCurrency(inv.amount_paid)}</td>
                          <td className="px-4 py-3 text-sm text-right text-red-600 font-medium">{formatCurrency(inv.balance)}</td>
                          <td className="px-4 py-3 text-sm text-center font-medium">{inv.days_outstanding}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              inv.aging_bucket === '90+ days' ? 'bg-red-100 text-red-800' :
                              inv.aging_bucket === '61-90 days' ? 'bg-orange-100 text-orange-800' :
                              inv.aging_bucket === '31-60 days' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {inv.aging_bucket}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Insurance Claims Tab */}
            {activeTab === 'claims' && (
              <div className="space-y-6">
                {/* Claims Summary Cards */}
                {claimsSummary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                      <h4 className="text-sm font-medium text-blue-700">Total Claims</h4>
                      <p className="text-2xl font-bold text-blue-900">{claimsSummary.total}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700">Draft</h4>
                      <p className="text-2xl font-bold text-gray-900">{claimsSummary.draft}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                      <h4 className="text-sm font-medium text-yellow-700">Pending Review</h4>
                      <p className="text-2xl font-bold text-yellow-900">{claimsSummary.pending_review}</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                      <h4 className="text-sm font-medium text-purple-700">Submitted</h4>
                      <p className="text-2xl font-bold text-purple-900">{claimsSummary.submitted}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <h4 className="text-sm font-medium text-green-700">Approved</h4>
                      <p className="text-2xl font-bold text-green-900">{claimsSummary.approved}</p>
                      <p className="text-xs text-green-600">{formatCurrency(claimsSummary.total_approved)}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <h4 className="text-sm font-medium text-red-700">Denied</h4>
                      <p className="text-2xl font-bold text-red-900">{claimsSummary.denied}</p>
                    </div>
                  </div>
                )}

                {/* Claims Filters and Actions */}
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex gap-4 items-center flex-1">
                    <input
                      type="text"
                      placeholder="Search claims..."
                      value={claimSearch}
                      onChange={(e) => setClaimSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadClaims()}
                      className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <select
                      value={claimFilter}
                      onChange={(e) => setClaimFilter(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="all">All Status</option>
                      <option value="draft">Draft</option>
                      <option value="pending_doctor_review">Pending Doctor Review</option>
                      <option value="approved_by_doctor">Approved by Doctor</option>
                      <option value="submitted">Submitted</option>
                      <option value="approved">Approved</option>
                      <option value="denied">Denied</option>
                      <option value="paid">Paid</option>
                    </select>
                    <button
                      onClick={loadClaims}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      Search
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      loadInsuranceInvoices();
                      setShowCreateClaimModal(true);
                    }}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Claim
                  </button>
                </div>

                {/* Claims Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Claim #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insurance</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {claimsLoading ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center">
                            <div className="flex justify-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                            </div>
                          </td>
                        </tr>
                      ) : claims.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No claims found</td>
                        </tr>
                      ) : (
                        claims.map((claim) => (
                          <tr key={claim.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{claim.claim_number}</td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{claim.patient_name}</div>
                              <div className="text-xs text-gray-500">{claim.patient_number}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{claim.insurance_provider_name}</td>
                            <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(claim.total_charged)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(claim.status)}`}>
                                {formatStatus(claim.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {safeFormatDate(claim.created_at, 'MMM d, yyyy')}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleViewClaim(claim.id)}
                                className="text-primary-600 hover:text-primary-900 text-sm font-medium"
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
            )}
          </div>
        </div>
      </div>

      {/* Invoice Modal */}
      {showInvoice && selectedInvoice && (
        <PrintableInvoice
          invoice={selectedInvoice}
          items={invoiceItems}
          payerSources={invoicePayerSources}
          encounterId={selectedInvoice.encounter_id}
          onClose={() => setShowInvoice(false)}
          onPaymentComplete={() => {
            loadInvoices();
            setShowInvoice(false);
          }}
        />
      )}

      {/* Create Claim Modal */}
      {showCreateClaimModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Create Insurance Claim</h2>
                <button onClick={() => setShowCreateClaimModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">Select an invoice to create an insurance claim</p>
            </div>
            <div className="p-6">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {insuranceInvoices.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No invoices available for claims</p>
                ) : (
                  insuranceInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleCreateClaim(inv.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{inv.invoice_number}</p>
                          <p className="text-sm text-gray-600">{inv.patient_name}</p>
                          <p className="text-xs text-gray-500">{safeFormatDate(inv.invoice_date, 'MMM d, yyyy')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">{formatCurrency(inv.total_amount)}</p>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                            inv.status === 'partial' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {inv.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Claim Detail Modal */}
      {showClaimModal && selectedClaim && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Claim {selectedClaim.claim_number}</h2>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedClaim.status)}`}>
                    {formatStatus(selectedClaim.status)}
                  </span>
                </div>
                <button onClick={() => setShowClaimModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Patient & Insurance Info */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Patient Information</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-500">Name:</span> {selectedClaim.patient_name}</p>
                    <p><span className="text-gray-500">Patient #:</span> {selectedClaim.patient_number}</p>
                    <p><span className="text-gray-500">Invoice:</span> {selectedClaim.invoice_number}</p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Insurance Information</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-500">Provider:</span> {selectedClaim.insurance_provider_name}</p>
                    <p><span className="text-gray-500">Member ID:</span> {selectedClaim.member_id || 'Not set'}</p>
                    <p><span className="text-gray-500">Plan:</span> {selectedClaim.plan_option || 'Not set'}</p>
                  </div>
                </div>
              </div>

              {/* Diagnosis */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Diagnosis</h3>
                <p className="text-sm">
                  <span className="font-medium">{selectedClaim.primary_diagnosis_code}</span>
                  {selectedClaim.primary_diagnosis_desc && ` - ${selectedClaim.primary_diagnosis_desc}`}
                </p>
              </div>

              {/* Coverage Info */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600">Annual Limit</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(selectedClaim.annual_limit || 0)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600">Used to Date</p>
                  <p className="text-xl font-bold text-orange-700">{formatCurrency(selectedClaim.used_to_date || 0)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600">Claim Amount</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(selectedClaim.total_charged)}</p>
                </div>
              </div>

              {/* Validation Result */}
              {validationResult && (
                <div className={`rounded-lg p-4 ${validationResult.validated ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <h3 className="font-semibold mb-2">{validationResult.validated ? 'Validation Passed' : 'Validation Issues'}</h3>
                  {validationResult.issues?.map((issue: any, idx: number) => (
                    <p key={idx} className="text-sm text-red-700">{issue.issue}</p>
                  ))}
                </div>
              )}

              {/* Coverage Result */}
              {coverageResult && (
                <div className={`rounded-lg p-4 ${coverageResult.exceeds_limit ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                  <h3 className="font-semibold mb-2">{coverageResult.message}</h3>
                  <p className="text-sm">Remaining Coverage: {formatCurrency(coverageResult.remaining_coverage)}</p>
                </div>
              )}

              {/* Doctor Review Info */}
              {selectedClaim.reviewed_by_doctor && (
                <div className="bg-purple-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Doctor Review</h3>
                  <p className="text-sm"><span className="text-gray-500">Reviewed by:</span> {selectedClaim.reviewed_by_name}</p>
                  <p className="text-sm"><span className="text-gray-500">Date:</span> {safeFormatDate(selectedClaim.doctor_reviewed_at, 'MMM d, yyyy h:mm a')}</p>
                  {selectedClaim.doctor_notes && <p className="text-sm mt-2"><span className="text-gray-500">Notes:</span> {selectedClaim.doctor_notes}</p>}
                </div>
              )}

              {/* Actions based on status */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                {selectedClaim.status === 'draft' && (
                  <>
                    <button
                      onClick={() => handleValidateDiagnosis(selectedClaim.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Validate Diagnosis
                    </button>
                    <button
                      onClick={() => handleCheckCoverage(selectedClaim.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Check Coverage
                    </button>
                    <button
                      onClick={() => {
                        const reason = validationResult?.issues?.length > 0
                          ? prompt('Enter override reason for validation issues:')
                          : undefined;
                        if (validationResult?.issues?.length > 0 && !reason) return;
                        handleSubmitForReview(selectedClaim.id, reason || undefined);
                      }}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      Submit for Doctor Review
                    </button>
                  </>
                )}
                {selectedClaim.status === 'approved_by_doctor' && (
                  <button
                    onClick={() => handleUpdateClaimStatus(selectedClaim.id, 'submitted')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Mark as Submitted to Insurance
                  </button>
                )}
                {selectedClaim.status === 'submitted' && (
                  <>
                    <button
                      onClick={() => {
                        const amount = prompt('Enter approved amount:');
                        if (amount) handleUpdateClaimStatus(selectedClaim.id, 'approved', { amount_approved: parseFloat(amount) });
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Mark Approved
                    </button>
                    <button
                      onClick={() => handleUpdateClaimStatus(selectedClaim.id, 'denied')}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Mark Denied
                    </button>
                  </>
                )}
                {selectedClaim.status === 'approved' && (
                  <button
                    onClick={() => {
                      const amount = prompt('Enter paid amount:');
                      if (amount) handleUpdateClaimStatus(selectedClaim.id, 'paid', { amount_paid: parseFloat(amount) });
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Record Payment Received
                  </button>
                )}
                <button
                  onClick={() => setShowClaimModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default AccountantDashboard;
