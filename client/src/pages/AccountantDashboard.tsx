import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid, subDays, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import PrintableInvoice from '../components/PrintableInvoice';
import { useNotification } from '../context/NotificationContext';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

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

interface OutstandingInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  last_reminder_sent: string | null;
  reminder_count: number;
  next_reminder_date: string | null;
  days_outstanding: number;
  aging_bucket: string;
  patient_id: number;
  patient_number: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
}

interface ReminderSettings {
  first_reminder_days: string;
  second_reminder_days: string;
  third_reminder_days: string;
  sms_enabled: string;
  email_enabled: string;
  auto_send_enabled: string;
  sms_configured: string;
  email_configured: string;
  reminder_template_sms: string;
  reminder_template_email_subject: string;
  reminder_template_email_body: string;
}

interface ReminderPreview {
  patient: {
    name: string;
    phone: string | null;
    email: string | null;
    phoneValid: boolean;
    emailValid: boolean;
  };
  invoice: {
    number: string;
    date: string;
    dueDate: string | null;
    total: number;
    paid: number;
    balance: number;
    reminderCount: number;
    lastReminder: string | null;
  };
  sms?: {
    message: string;
    characterCount: number;
  };
  email?: {
    subject: string;
    body: string;
  };
}

interface ReminderHistory {
  id: number;
  reminder_type: string;
  reminder_number: number;
  contact_method: string;
  message: string;
  status: string;
  sent_at: string;
  sent_by_name: string;
}

const AccountantDashboard: React.FC = () => {
  const { showToast } = useNotification();
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'aging' | 'claims' | 'reminders'>('overview');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Date filters
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activePeriod, setActivePeriod] = useState<string>('month');

  // Quick period filter helper
  const setQuickPeriod = (period: string) => {
    const today = new Date();
    let start: Date;

    switch (period) {
      case 'today':
        start = today;
        break;
      case 'week':
        start = startOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'month':
        start = startOfMonth(today);
        break;
      case 'year':
        start = startOfYear(today);
        break;
      case 'all':
        start = new Date('2020-01-01');
        break;
      default:
        start = subDays(today, 30);
    }

    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(today, 'yyyy-MM-dd'));
    setActivePeriod(period);
  };

  // Chart colors from app theme
  const CHART_COLORS = {
    primary: '#5BC5C8',    // Teal
    secondary: '#8E4585',  // Purple
    success: '#10B981',    // Green
    warning: '#F59E0B',    // Orange
    danger: '#EF4444',     // Red
    accent: '#B8A9C9',     // Lavender
  };

  const CATEGORY_COLORS: Record<string, string> = {
    consultation: CHART_COLORS.primary,
    lab: CHART_COLORS.secondary,
    imaging: CHART_COLORS.warning,
    medication: CHART_COLORS.success,
    procedure: CHART_COLORS.accent,
    service: CHART_COLORS.danger,
  };

  // Financial data
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [categoryRevenue, setCategoryRevenue] = useState<CategoryRevenue[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
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

  // Reminders
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [outstandingSummary, setOutstandingSummary] = useState<any>(null);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings | null>(null);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [reminderFilter, setReminderFilter] = useState('all');
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedReminderInvoice, setSelectedReminderInvoice] = useState<OutstandingInvoice | null>(null);
  const [reminderPreview, setReminderPreview] = useState<ReminderPreview | null>(null);
  const [reminderType, setReminderType] = useState<'sms' | 'email' | 'both'>('sms');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<number[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [reminderHistory, setReminderHistory] = useState<ReminderHistory[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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
    } else if (activeTab === 'reminders') {
      loadOutstandingInvoices();
      loadReminderSettings();
    }
  }, [activeTab, invoiceFilter, claimFilter, reminderFilter]);

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

  const loadOutstandingInvoices = async () => {
    setRemindersLoading(true);
    try {
      const response = await apiClient.get('/reminders/outstanding', {
        params: { aging_bucket: reminderFilter !== 'all' ? reminderFilter : undefined },
      });
      setOutstandingInvoices(response.data.invoices || []);
      setOutstandingSummary(response.data.summary || null);
    } catch (error) {
      console.error('Error loading outstanding invoices:', error);
    } finally {
      setRemindersLoading(false);
    }
  };

  const loadReminderSettings = async () => {
    try {
      const response = await apiClient.get('/reminders/settings');
      setReminderSettings(response.data);
    } catch (error) {
      console.error('Error loading reminder settings:', error);
    }
  };

  const handleOpenReminderModal = async (invoice: OutstandingInvoice) => {
    setSelectedReminderInvoice(invoice);
    setReminderType('sms');
    try {
      const response = await apiClient.get('/reminders/preview', {
        params: { invoiceId: invoice.id },
      });
      setReminderPreview(response.data);
      setShowReminderModal(true);
    } catch (error) {
      console.error('Error loading preview:', error);
      showToast('Failed to load reminder preview', 'error');
    }
  };

  const handleSendReminder = async () => {
    if (!selectedReminderInvoice) return;
    setSendingReminder(true);
    try {
      const response = await apiClient.post('/reminders/send', {
        invoiceId: selectedReminderInvoice.id,
        reminderType: reminderType,
      });
      if (response.data.success) {
        showToast('Reminder sent successfully (logged)', 'success');
        setShowReminderModal(false);
        loadOutstandingInvoices();
      } else {
        showToast('Some reminders failed to send', 'warning');
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      showToast('Failed to send reminder', 'error');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleSendBulkReminders = async () => {
    if (selectedForBulk.length === 0) {
      showToast('No invoices selected', 'warning');
      return;
    }
    setSendingReminder(true);
    try {
      const response = await apiClient.post('/reminders/send-bulk', {
        invoiceIds: selectedForBulk,
        reminderType: 'sms',
      });
      showToast(`Sent ${response.data.sent} of ${response.data.total} reminders`, 'success');
      setSelectedForBulk([]);
      loadOutstandingInvoices();
    } catch (error) {
      console.error('Error sending bulk reminders:', error);
      showToast('Failed to send bulk reminders', 'error');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleViewHistory = async (invoiceId: number) => {
    try {
      const response = await apiClient.get(`/reminders/history/${invoiceId}`);
      setReminderHistory(response.data);
      setShowHistoryModal(true);
    } catch (error) {
      console.error('Error loading history:', error);
      showToast('Failed to load reminder history', 'error');
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<ReminderSettings>) => {
    try {
      await apiClient.put('/reminders/settings', newSettings);
      showToast('Settings updated', 'success');
      loadReminderSettings();
    } catch (error) {
      console.error('Error updating settings:', error);
      showToast('Failed to update settings', 'error');
    }
  };

  const toggleBulkSelection = (invoiceId: number) => {
    setSelectedForBulk(prev =>
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const selectAllForBulk = () => {
    if (selectedForBulk.length === outstandingInvoices.length) {
      setSelectedForBulk([]);
    } else {
      setSelectedForBulk(outstandingInvoices.map(inv => inv.id));
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
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Quick Period Filters */}
            <div className="flex gap-2">
              {[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'year', label: 'This Year' },
                { id: 'all', label: 'All Time' },
              ].map((period) => (
                <button
                  key={period.id}
                  onClick={() => setQuickPeriod(period.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activePeriod === period.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>

            {/* Custom Date Range */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActivePeriod('custom');
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActivePeriod('custom');
                  }}
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
                { id: 'reminders', label: 'Payment Reminders' },
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
                      <div className="bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium opacity-90">Total Billed</h3>
                          <svg className="w-8 h-8 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(summary?.total_billed || 0)}</p>
                        <p className="text-sm opacity-75 mt-1">{summary?.total_invoices || 0} invoices</p>
                      </div>
                      <div className="bg-gradient-to-br from-success-400 to-success-600 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium opacity-90">Total Collected</h3>
                          <svg className="w-8 h-8 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(summary?.total_collected || 0)}</p>
                        <p className="text-sm opacity-75 mt-1">{summary?.paid_count || 0} fully paid</p>
                      </div>
                      <div className="bg-gradient-to-br from-warning-400 to-warning-600 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium opacity-90">Outstanding</h3>
                          <svg className="w-8 h-8 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(summary?.total_outstanding || 0)}</p>
                        <p className="text-sm opacity-75 mt-1">{summary?.pending_count || 0} pending</p>
                      </div>
                      <div className="bg-gradient-to-br from-secondary-400 to-secondary-600 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium opacity-90">Collection Rate</h3>
                          <svg className="w-8 h-8 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <p className="text-3xl font-bold mt-2">
                          {summary?.total_billed && summary.total_billed > 0
                            ? ((parseFloat(summary.total_collected as unknown as string) / parseFloat(summary.total_billed as unknown as string)) * 100).toFixed(1)
                            : 0}%
                        </p>
                        <p className="text-sm opacity-75 mt-1">{summary?.partial_count || 0} partial</p>
                      </div>
                    </div>

                    {/* Revenue Trend Chart */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
                      {dailyRevenue.length > 0 ? (
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyRevenue}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis
                                dataKey="date"
                                tickFormatter={(value) => {
                                  try {
                                    return format(parseISO(value), 'MMM d');
                                  } catch {
                                    return value;
                                  }
                                }}
                                stroke="#6B7280"
                                fontSize={12}
                              />
                              <YAxis
                                tickFormatter={(value) => `GHS ${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                                stroke="#6B7280"
                                fontSize={12}
                              />
                              <Tooltip
                                formatter={(value) => [formatCurrency(value as number), '']}
                                labelFormatter={(label) => {
                                  try {
                                    return format(parseISO(label), 'MMMM d, yyyy');
                                  } catch {
                                    return label;
                                  }
                                }}
                                contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                              />
                              <Legend />
                              <Line
                                type="monotone"
                                dataKey="billed"
                                name="Billed"
                                stroke={CHART_COLORS.primary}
                                strokeWidth={2}
                                dot={{ fill: CHART_COLORS.primary, strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="collected"
                                name="Collected"
                                stroke={CHART_COLORS.success}
                                strokeWidth={2}
                                dot={{ fill: CHART_COLORS.success, strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-72 flex items-center justify-center bg-gray-50 rounded-lg">
                          <div className="text-center">
                            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                            </svg>
                            <p className="text-gray-500">No revenue data for selected period</p>
                            <p className="text-sm text-gray-400 mt-1">Try selecting a different date range</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Revenue by Category & Top Services */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Revenue by Category - Pie Chart */}
                      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Category</h3>
                        {categoryRevenue.length > 0 ? (
                          <div className="flex items-center gap-6">
                            <div className="w-48 h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={categoryRevenue}
                                    dataKey="total_amount"
                                    nameKey="category"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={70}
                                    paddingAngle={2}
                                  >
                                    {categoryRevenue.map((entry, index) => (
                                      <Cell
                                        key={`cell-${index}`}
                                        fill={CATEGORY_COLORS[entry.category] || Object.values(CHART_COLORS)[index % 6]}
                                      />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    formatter={(value) => formatCurrency(value as number)}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex-1 space-y-2">
                              {categoryRevenue.map((cat, idx) => (
                                <div key={cat.category} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: CATEGORY_COLORS[cat.category] || Object.values(CHART_COLORS)[idx % 6] }}
                                    />
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
                        ) : (
                          <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                            <div className="text-center">
                              <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                              </svg>
                              <p className="text-gray-500 text-sm">No category data</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Top Services */}
                      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Services</h3>
                        {topServices.length > 0 ? (
                          <div className="space-y-3">
                            {topServices.slice(0, 5).map((service, idx) => {
                              const maxRevenue = Math.max(...topServices.map(s => s.total_revenue));
                              const percentage = (service.total_revenue / maxRevenue) * 100;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-white bg-primary-500 rounded-full w-5 h-5 flex items-center justify-center">
                                        {idx + 1}
                                      </span>
                                      <span className="text-sm text-gray-700 truncate max-w-[180px]">{service.description}</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(service.total_revenue)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-primary-500 h-2 rounded-full transition-all duration-500"
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-gray-500 w-12">{service.times_billed}x</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                            <div className="text-center">
                              <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <p className="text-gray-500 text-sm">No services billed</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Payment Methods - Bar Chart */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
                      {paymentMethods.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={paymentMethods} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                <XAxis
                                  type="number"
                                  tickFormatter={(value) => `GHS ${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                                  stroke="#6B7280"
                                  fontSize={12}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="method"
                                  tickFormatter={(value) => value.replace('_', ' ').charAt(0).toUpperCase() + value.replace('_', ' ').slice(1)}
                                  stroke="#6B7280"
                                  fontSize={12}
                                  width={100}
                                />
                                <Tooltip
                                  formatter={(value) => [formatCurrency(value as number), 'Amount']}
                                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                                />
                                <Bar dataKey="total" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            {paymentMethods.map((method, idx) => {
                              const colors = [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.secondary];
                              return (
                                <div
                                  key={method.method}
                                  className="rounded-lg p-4 border border-gray-100"
                                  style={{ backgroundColor: `${colors[idx % 4]}10` }}
                                >
                                  <p className="text-sm text-gray-600 capitalize font-medium">{method.method.replace('_', ' ')}</p>
                                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(method.total)}</p>
                                  <p className="text-xs text-gray-500 mt-1">{method.count} transactions</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                          <div className="text-center">
                            <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            <p className="text-gray-500 text-sm">No payment data</p>
                          </div>
                        </div>
                      )}
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

            {/* Payment Reminders Tab */}
            {activeTab === 'reminders' && (
              <div className="space-y-6">
                {/* Summary Cards */}
                {outstandingSummary && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <h4 className="text-sm font-medium text-green-700">0-30 Days</h4>
                      <p className="text-2xl font-bold text-green-900">{outstandingSummary.bucket_0_30}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                      <h4 className="text-sm font-medium text-yellow-700">31-60 Days</h4>
                      <p className="text-2xl font-bold text-yellow-900">{outstandingSummary.bucket_31_60}</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                      <h4 className="text-sm font-medium text-orange-700">61-90 Days</h4>
                      <p className="text-2xl font-bold text-orange-900">{outstandingSummary.bucket_61_90}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <h4 className="text-sm font-medium text-red-700">90+ Days</h4>
                      <p className="text-2xl font-bold text-red-900">{outstandingSummary.bucket_90_plus}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                      <h4 className="text-sm font-medium text-blue-700">Total Outstanding</h4>
                      <p className="text-xl font-bold text-blue-900">{formatCurrency(outstandingSummary.total_outstanding)}</p>
                    </div>
                  </div>
                )}

                {/* Settings Toggle */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="flex items-center gap-2 text-gray-700 font-medium"
                  >
                    <svg className={`w-5 h-5 transition-transform ${showSettings ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Reminder Settings
                    {reminderSettings?.sms_configured === 'false' && reminderSettings?.email_configured === 'false' && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-2">
                        SMS/Email not configured - reminders will be logged only
                      </span>
                    )}
                  </button>

                  {showSettings && reminderSettings && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">First Reminder (days after invoice)</label>
                        <input
                          type="number"
                          value={reminderSettings.first_reminder_days}
                          onChange={(e) => handleUpdateSettings({ first_reminder_days: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Second Reminder (days after first)</label>
                        <input
                          type="number"
                          value={reminderSettings.second_reminder_days}
                          onChange={(e) => handleUpdateSettings({ second_reminder_days: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Third Reminder (days after second)</label>
                        <input
                          type="number"
                          value={reminderSettings.third_reminder_days}
                          onChange={(e) => handleUpdateSettings({ third_reminder_days: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-sm text-gray-600 mb-1">SMS Template</label>
                        <textarea
                          value={reminderSettings.reminder_template_sms}
                          onChange={(e) => handleUpdateSettings({ reminder_template_sms: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Use {patient_name}, {amount}, {invoice_number}, {invoice_date}, {due_date}"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Filters and Actions */}
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex gap-4 items-center">
                    <select
                      value={reminderFilter}
                      onChange={(e) => setReminderFilter(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="all">All Outstanding</option>
                      <option value="0-30">0-30 Days</option>
                      <option value="31-60">31-60 Days</option>
                      <option value="61-90">61-90 Days</option>
                      <option value="90+">90+ Days</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    {selectedForBulk.length > 0 && (
                      <button
                        onClick={handleSendBulkReminders}
                        disabled={sendingReminder}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        {sendingReminder ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        )}
                        Send to Selected ({selectedForBulk.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Outstanding Invoices Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedForBulk.length === outstandingInvoices.length && outstandingInvoices.length > 0}
                            onChange={selectAllForBulk}
                            className="rounded border-gray-300"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Reminders Sent</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Last Reminder</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {remindersLoading ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center">
                            <div className="flex justify-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                            </div>
                          </td>
                        </tr>
                      ) : outstandingInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No outstanding invoices</td>
                        </tr>
                      ) : (
                        outstandingInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedForBulk.includes(inv.id)}
                                onChange={() => toggleBulkSelection(inv.id)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{inv.patient_name}</div>
                              <div className="text-xs text-gray-500">{inv.patient_number}</div>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                            <td className="px-4 py-3 text-sm text-right font-bold text-red-600">{formatCurrency(inv.balance)}</td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                inv.days_outstanding > 90 ? 'bg-red-100 text-red-800' :
                                inv.days_outstanding > 60 ? 'bg-orange-100 text-orange-800' :
                                inv.days_outstanding > 30 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {inv.days_outstanding}d
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              {inv.reminder_count > 0 ? (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                  {inv.reminder_count}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-center text-gray-500">
                              {inv.last_reminder_sent ? safeFormatDate(inv.last_reminder_sent, 'MMM d') : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-1">
                                {inv.patient_phone && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded text-xs">Phone</span>
                                )}
                                {inv.patient_email && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">Email</span>
                                )}
                                {!inv.patient_phone && !inv.patient_email && (
                                  <span className="text-gray-400 text-xs">No contact</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => handleOpenReminderModal(inv)}
                                  className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                                >
                                  Send
                                </button>
                                {inv.reminder_count > 0 && (
                                  <button
                                    onClick={() => handleViewHistory(inv.id)}
                                    className="text-gray-500 hover:text-gray-700 text-sm"
                                  >
                                    History
                                  </button>
                                )}
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

      {/* Send Reminder Modal */}
      {showReminderModal && selectedReminderInvoice && reminderPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Send Payment Reminder</h2>
                <button onClick={() => setShowReminderModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Patient & Invoice Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Patient</h3>
                  <p className="text-sm">{reminderPreview.patient.name}</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <span className={reminderPreview.patient.phoneValid ? 'text-green-600' : 'text-red-600'}>
                        {reminderPreview.patient.phoneValid ? '✓' : '✗'}
                      </span>
                      Phone: {reminderPreview.patient.phone || 'Not set'}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <span className={reminderPreview.patient.emailValid ? 'text-green-600' : 'text-red-600'}>
                        {reminderPreview.patient.emailValid ? '✓' : '✗'}
                      </span>
                      Email: {reminderPreview.patient.email || 'Not set'}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Invoice</h3>
                  <p className="text-sm font-medium">{reminderPreview.invoice.number}</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(reminderPreview.invoice.balance)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Reminders sent: {reminderPreview.invoice.reminderCount}
                  </p>
                </div>
              </div>

              {/* Reminder Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Send via</label>
                <div className="flex gap-4">
                  <label className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer ${
                    reminderType === 'sms' ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
                  } ${!reminderPreview.patient.phoneValid ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      name="reminderType"
                      value="sms"
                      checked={reminderType === 'sms'}
                      onChange={() => setReminderType('sms')}
                      disabled={!reminderPreview.patient.phoneValid}
                      className="text-primary-600"
                    />
                    <span>SMS</span>
                  </label>
                  <label className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer ${
                    reminderType === 'email' ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
                  } ${!reminderPreview.patient.emailValid ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      name="reminderType"
                      value="email"
                      checked={reminderType === 'email'}
                      onChange={() => setReminderType('email')}
                      disabled={!reminderPreview.patient.emailValid}
                      className="text-primary-600"
                    />
                    <span>Email</span>
                  </label>
                  <label className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer ${
                    reminderType === 'both' ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
                  } ${(!reminderPreview.patient.phoneValid || !reminderPreview.patient.emailValid) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      name="reminderType"
                      value="both"
                      checked={reminderType === 'both'}
                      onChange={() => setReminderType('both')}
                      disabled={!reminderPreview.patient.phoneValid || !reminderPreview.patient.emailValid}
                      className="text-primary-600"
                    />
                    <span>Both</span>
                  </label>
                </div>
              </div>

              {/* Message Preview */}
              {(reminderType === 'sms' || reminderType === 'both') && reminderPreview.sms && (
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-gray-900">SMS Preview</h3>
                    <span className="text-xs text-gray-500">{reminderPreview.sms.characterCount} characters</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{reminderPreview.sms.message}</p>
                </div>
              )}

              {(reminderType === 'email' || reminderType === 'both') && reminderPreview.email && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Email Preview</h3>
                  <p className="text-sm font-medium text-gray-700 mb-2">Subject: {reminderPreview.email.subject}</p>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border">
                    {reminderPreview.email.body}
                  </div>
                </div>
              )}

              {/* Info Banner */}
              {reminderSettings?.sms_configured === 'false' && reminderSettings?.email_configured === 'false' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-yellow-800">
                      <strong>Stub Mode:</strong> SMS/Email APIs are not configured. This reminder will be logged but not actually sent. Configure API keys when ready for production.
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowReminderModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendReminder}
                  disabled={sendingReminder || (!reminderPreview.patient.phoneValid && !reminderPreview.patient.emailValid)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {sendingReminder ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                  Send Reminder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reminder History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Reminder History</h2>
                <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              {reminderHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No reminders sent yet</p>
              ) : (
                <div className="space-y-4">
                  {reminderHistory.map((reminder) => (
                    <div key={reminder.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            reminder.reminder_type === 'sms' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {reminder.reminder_type.toUpperCase()}
                          </span>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            reminder.status === 'sent' ? 'bg-green-100 text-green-800' :
                            reminder.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                            reminder.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {reminder.status}
                          </span>
                          <span className="text-xs text-gray-500">Reminder #{reminder.reminder_number}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {safeFormatDate(reminder.sent_at, 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">To: {reminder.contact_method}</p>
                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">{reminder.message}</p>
                      {reminder.sent_by_name && (
                        <p className="text-xs text-gray-400 mt-2">Sent by: {reminder.sent_by_name}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default AccountantDashboard;
