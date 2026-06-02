import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import PatientQuickView from '../components/PatientQuickView';
import AppLayout from '../components/AppLayout';
import { useSmartPolling } from '../hooks/useSmartPolling';
import DashboardHeader, { StatPill } from '../components/DashboardHeader';
import NumberTicker from '../components/ui/NumberTicker';
import InsightCard from '../components/ui/InsightCard';
import Sparkline, { type SparkPoint } from '../components/ui/Sparkline';
import Delta from '../components/ui/Delta';
import LabResultModal, { type LabResultAlert } from '../components/LabResultModal';
import { AutocompleteInput } from '../components/AutocompleteInput';
import PrioritySelect from '../components/PrioritySelect';
import FrequencySelect from '../components/FrequencySelect';
import AppSelect from '../components/ui/AppSelect';
import { branding } from '../config/branding';

// Interfaces
interface LabOrder {
  id: number;
  encounter_id: number;
  patient_id: number;
  test_name: string;
  test_code?: string;
  priority: 'stat' | 'urgent' | 'routine';
  status: string;
  ordered_at: string;
  completed_at?: string;
  patient_name: string;
  patient_number: string;
  patient_allergies?: string;
  encounter_number: string;
  ordering_provider_name: string;
  specimen_collected_at?: string;
  results_available_at?: string;
  results?: string;
  notes?: string;
  specimen_id?: string;
  specimen_type?: string;
  rejection_reason?: string;
  result_document_id?: number | null;
  result_document_name?: string | null;
  result_document_file_type?: string | null;
  patient_dob?: string | null;
  patient_gender?: string | null;
  entered_by?: number | null;
  entered_by_name?: string | null;
  verification_status?: 'not_required' | 'pending' | 'verified' | 'rejected' | null;
  assigned_reviewer_id?: number | null;
  assigned_reviewer_name?: string | null;
  verified_by?: number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  verification_notes?: string | null;
  rejection_count?: number;
  path_no?: string | null;
}

interface LabReviewer {
  id: number;
  first_name: string;
  last_name: string;
  role: string;
}

interface GroupedPatientLabOrders {
  patient_id: number;
  patient_name: string;
  patient_number: string;
  patient_allergies: string | null;
  encounter_id: number;
  encounter_number: string;
  ordering_provider_name: string;
  highest_priority: 'stat' | 'urgent' | 'routine';
  ordered_at: string;
  encounter_clinic?: string | null;
  orders: LabOrder[];
}

interface LabInventoryItem {
  id: number;
  item_name: string;
  item_type: 'reagent' | 'supply' | 'equipment';
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number;
  expiry_date: string;
  lot_number: string;
  supplier: string;
  storage_location: string;
  storage_conditions: string;
  is_low_stock: boolean;
  is_expiring_soon: boolean;
  is_calibration_due?: boolean;
  next_calibration_date?: string;
  last_calibration_date?: string;
}

interface LabInventoryStats {
  total_items: number;
  low_stock_count: number;
  expiring_soon_count: number;
  calibration_due_count: number;
  total_stock_value: number;
}

interface LabAnalytics {
  totals: {
    total_tests: number;
    completed_tests: number;
    pending_tests: number;
    stat_tests: number;
    unique_patients: number;
  };
  turnaround_time: {
    average_tat_hours: number;
    stat_tat_hours: number;
    urgent_tat_hours: number;
    routine_tat_hours: number;
  };
  critical_results: {
    total_critical: number;
    pending_acknowledgment: number;
  };
}

interface CriticalResultAlert {
  id: number;
  lab_order_id: number;
  patient_name: string;
  patient_number: string;
  test_name: string;
  alert_type: 'critical_high' | 'critical_low' | 'panic_value';
  result_value: string;
  ordering_provider_name: string;
  is_acknowledged: boolean;
  acknowledged_by_name?: string;
  created_at: string;
  encounter_number?: string;
  room_number?: string;
}

interface LabTest {
  id: number;
  test_code: string;
  test_name: string;
  category: string;
  specimen_type: string;
  turnaround_time_hours: number;
  base_price: number;
  critical_low: number | null;
  critical_high: number | null;
  normal_range_low: number | null;
  normal_range_high: number | null;
  unit: string;
  is_active: boolean;
}

interface QCResult {
  id: number;
  test_code: string;
  test_name: string;
  control_level: string;
  lot_number: string;
  measured_value: number;
  target_value: number;
  standard_deviation: number;
  unit: string;
  performed_by_name: string;
  performed_at: string;
  is_within_limits: boolean;
  notes: string;
}

interface LeveyJenningsData {
  test_code: string;
  target_value: number;
  standard_deviation: number;
  upper_limit_2sd: number;
  lower_limit_2sd: number;
  upper_limit_3sd: number;
  lower_limit_3sd: number;
  data_points: {
    id: number;
    value: number;
    date: string;
    control_level: string;
    is_within_limits: boolean;
  }[];
}

type LabAccent = 'neutral' | 'primary' | 'secondary' | 'warning' | 'danger' | 'success';
const LAB_ACCENT: Record<LabAccent, { num: string; ring: string }> = {
  neutral:   { num: 'text-text-primary',  ring: 'ring-gray-200/60' },
  primary:   { num: 'text-primary-700',   ring: 'ring-primary-200/60' },
  secondary: { num: 'text-secondary-700', ring: 'ring-secondary-200/60' },
  warning:   { num: 'text-warning-700',   ring: 'ring-warning-200/60' },
  danger:    { num: 'text-danger-700',    ring: 'ring-danger-200/60' },
  success:   { num: 'text-success-700',   ring: 'ring-success-200/60' },
};

interface LabStatProps {
  label: string;
  value: number | string;
  accent: LabAccent;
  active?: boolean;
  onClick: () => void;
  series?: SparkPoint[];
  trendDirection?: 'up-is-good' | 'up-is-bad';
  trendMode?: 'sum' | 'avg';
}

const LabStat: React.FC<LabStatProps> = ({ label, value, accent, active, onClick, series, trendDirection = 'up-is-good', trendMode = 'sum' }) => {
  const a = LAB_ACCENT[accent];
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-3 hover:ring-1 ${a.ring} ${active ? 'ring-2 ring-offset-1 ' + a.ring : ''}`}
    >
      <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${a.num}`}>
        {typeof value === 'number' ? <NumberTicker value={value} /> : value}
      </div>
      {series && series.length > 1 && (
        <div className={`flex items-center gap-1.5 mt-1 ${a.num}`}>
          <Sparkline data={series} width={60} height={18} />
          <Delta series={series.map((p) => p.value)} direction={trendDirection} mode={trendMode} />
        </div>
      )}
    </button>
  );
};

const LabDashboard: React.FC = () => {
  const { showToast } = useNotification();
  const { confirm: confirmDialog, prompt: promptDialog } = useDialog();
  const printRef = useRef<HTMLDivElement>(null);

  // Main tab state
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'analytics' | 'alerts' | 'catalog' | 'qc' | 'walkins' | 'verification'>('orders');
  const [walkIns, setWalkIns] = useState<any[]>([]);

  // Deep-link from a notification: ?tab=orders|inventory|... opens that section.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const valid = ['orders', 'inventory', 'analytics', 'alerts', 'catalog', 'qc', 'walkins', 'verification'];
    if (tab && valid.includes(tab)) {
      setActiveTab(tab as typeof activeTab);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  const [ordersSubTab, setOrdersSubTab] = useState<'pending' | 'completed'>('pending');
  const [statusFilter, setStatusFilter] = useState<string>(''); // '', 'pending', 'in_progress', 'stat'

  // Walk-in add tests modal
  const [addTestsWalkin, setAddTestsWalkin] = useState<any | null>(null);
  const [walkinTestName, setWalkinTestName] = useState('');
  const [walkinPriority, setWalkinPriority] = useState('routine');
  const [walkinNotes, setWalkinNotes] = useState('');
  const [walkinFrequency, setWalkinFrequency] = useState('once');
  const [walkinTests, setWalkinTests] = useState<Array<{test_name: string; priority: string; notes: string; frequency?: string}>>([]);
  const [submittingWalkinTests, setSubmittingWalkinTests] = useState(false);
  const [showNewWalkin, setShowNewWalkin] = useState(false);
  const [walkinSearch, setWalkinSearch] = useState('');
  const [walkinSearchResults, setWalkinSearchResults] = useState<any[]>([]);
  const [creatingWalkin, setCreatingWalkin] = useState(false);
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [quickRegForm, setQuickRegForm] = useState({ first_name: '', last_name: '', phone: '', gender: '' });

  // Loading states
  const [loading, setLoading] = useState(true);

  // Orders state
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const pendingStatuses = ['pending', 'in_progress'];
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);

  // Inventory state
  const [inventory, setInventory] = useState<LabInventoryItem[]>([]);
  const [inventoryStats, setInventoryStats] = useState<LabInventoryStats | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState<string>('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<string>('');

  // Analytics state
  const [analytics, setAnalytics] = useState<LabAnalytics | null>(null);
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');
  const [testVolumeData, setTestVolumeData] = useState<any[]>([]);
  const [topTests, setTopTests] = useState<any[]>([]);

  // Alerts state
  const [criticalAlerts, setCriticalAlerts] = useState<CriticalResultAlert[]>([]);

  // 30-day trends for the lab stat strip sparklines.
  const [labTrends, setLabTrends] = useState<{
    orders_created: SparkPoint[];
    orders_completed: SparkPoint[];
    stat_orders: SparkPoint[];
    avg_tat_hours: SparkPoint[];
    critical_alerts: SparkPoint[];
  } | null>(null);

  useEffect(() => {
    apiClient
      .get('/lab/trends?days=30')
      .then((res) => {
        const s = res.data.series;
        const map = (arr: Array<{ day: string; value: number }>): SparkPoint[] =>
          arr.map((p) => ({ label: p.day, value: p.value }));
        setLabTrends({
          orders_created: map(s.orders_created),
          orders_completed: map(s.orders_completed),
          stat_orders: map(s.stat_orders),
          avg_tat_hours: map(s.avg_tat_hours),
          critical_alerts: map(s.critical_alerts),
        });
      })
      .catch((err) => console.error('Failed to load lab trends:', err));
  }, []);

  // Test Catalog state
  const [testCatalog, setTestCatalog] = useState<LabTest[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);

  // QC state
  const [qcResults, setQCResults] = useState<QCResult[]>([]);
  const [qcSummary, setQCSummary] = useState<any>(null);
  const [qcAvailableTests, setQCAvailableTests] = useState<{test_code: string, test_name: string}[]>([]);
  const [selectedQCTest, setSelectedQCTest] = useState('');
  const [leveyJenningsData, setLeveyJenningsData] = useState<LeveyJenningsData | null>(null);
  const [showQCModal, setShowQCModal] = useState(false);
  const [qcForm, setQCForm] = useState({
    test_code: '',
    test_name: '',
    control_level: 'normal',
    lot_number: '',
    measured_value: '',
    target_value: '',
    standard_deviation: '',
    unit: '',
    notes: '',
  });

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Patient quick view
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [showPatientQuickView, setShowPatientQuickView] = useState(false);

  // Upcoming scheduled lab appointments
  const [scheduledAppointments, setScheduledAppointments] = useState<Array<{id: number; patient_name: string; appointment_date: string; reason: string; status: string}>>([]);

  // Patient Details panel state (for Orders tab)
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<LabOrder | null>(null);
  const [patientDiagnoses, setPatientDiagnoses] = useState<any[]>([]);
  const [patientAllergies, setPatientAllergies] = useState<any[]>([]);
  const [patientLabHistory, setPatientLabHistory] = useState<any[]>([]);
  const [patientDOB, setPatientDOB] = useState<string | null>(null);
  const [encounterDetails, setEncounterDetails] = useState<any>(null);

  // Modal states
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showAdjustStockModal, setShowAdjustStockModal] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LabInventoryItem | null>(null);
  const [editingTest, setEditingTest] = useState<LabTest | null>(null);
  const [selectedOrderForResult, setSelectedOrderForResult] = useState<LabOrder | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<LabOrder | null>(null);
  const [testReferenceRanges, setTestReferenceRanges] = useState<LabTest | null>(null);

  // Form states
  const [inventoryForm, setInventoryForm] = useState({
    item_name: '',
    item_type: 'reagent',
    category: '',
    unit: '',
    quantity_on_hand: 0,
    reorder_level: 10,
    unit_cost: 0,
    expiry_date: '',
    lot_number: '',
    supplier: '',
    storage_location: 'Main Lab',
    storage_conditions: 'room_temp',
  });

  const [adjustStockForm, setAdjustStockForm] = useState({
    adjustment: 0,
    transaction_type: 'adjustment',
    notes: '',
  });

  const [calibrationForm, setCalibrationForm] = useState({
    next_calibration_date: '',
    notes: '',
  });

  const [testForm, setTestForm] = useState({
    test_code: '',
    test_name: '',
    category: '',
    specimen_type: 'blood',
    turnaround_time_hours: 24,
    base_price: 0,
    critical_low: '',
    critical_high: '',
    normal_range_low: '',
    normal_range_high: '',
    unit: '',
  });

  const [structuredResult, setStructuredResult] = useState({
    value: '',
    unit: '',
    notes: '',
    specimen_id: '',
  });

  // Structured parameter template (multi-row entry form). When the lab tech
  // opens the result modal, we fetch the template for the test+patient. If
  // one exists, we render a row per parameter; if not, we fall back to the
  // legacy single-field form above (structuredResult).
  interface ParameterDef {
    id: number;
    parameter_name: string;
    parameter_code: string | null;
    value_type: 'numeric' | 'qualitative' | 'text';
    unit: string | null;
    normal_low: number | string | null;
    normal_high: number | string | null;
    critical_low: number | string | null;
    critical_high: number | string | null;
    reference_range_text: string | null;
    qualitative_options: string | null;
    default_qualitative_value: string | null;
    section_label: string | null;
    sort_order: number;
  }
  const [templateParams, setTemplateParams] = useState<ParameterDef[]>([]);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateNotes, setTemplateNotes] = useState('');

  // Peer-review verification state
  const { user: currentUser } = useAuth();
  const [labReviewers, setLabReviewers] = useState<LabReviewer[]>([]);
  const [assignedReviewerId, setAssignedReviewerId] = useState<number | ''>('');
  const [skipVerification, setSkipVerification] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<LabOrder[]>([]);
  const [rejectingOrder, setRejectingOrder] = useState<LabOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [verifyingOrder, setVerifyingOrder] = useState<LabOrder | null>(null);
  const [verifyNotes, setVerifyNotes] = useState('');

  // Fetch lab orders with filters
  const fetchLabOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (priorityFilter) params.append('priority', priorityFilter);

      const url = `/orders/lab${params.toString() ? '?' + params.toString() : ''}`;
      const response = await apiClient.get(url);
      const orders = response.data.lab_orders || [];
      // Sort by priority first, then by ordered_at ascending (oldest first, newest at bottom)
      const sortedOrders = orders.sort((a: LabOrder, b: LabOrder) => {
        const priorityOrder: Record<string, number> = { stat: 0, urgent: 1, routine: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Within same priority, sort by oldest first (newest at bottom)
        return new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime();
      });
      setLabOrders(sortedOrders);
    } catch (error) {
      console.error('Error fetching lab orders:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, priorityFilter]);

  const fetchPatientDetailsForPanel = async (patientId: number, encounterId: number) => {
    try {
      // Fetch diagnoses and encounter details
      const encounterRes = await apiClient.get(`/encounters/${encounterId}`);
      setPatientDiagnoses(encounterRes.data.diagnoses || []);
      setEncounterDetails(encounterRes.data.encounter || null);

      // Fetch allergies and DOB from patient record
      const patientRes = await apiClient.get(`/patients/${patientId}`);
      setPatientAllergies(patientRes.data.patient?.allergies || []);
      setPatientDOB(patientRes.data.patient?.date_of_birth || null);

      // Fetch recent lab history for this patient
      const labHistoryRes = await apiClient.get(`/orders/lab?patient_id=${patientId}&limit=10`);
      setPatientLabHistory(labHistoryRes.data.lab_orders || []);
    } catch (error) {
      console.error('Error fetching patient details for panel:', error);
    }
  };

  // Fetch all patients routed to lab — direct walk-ins AND patients sent
  // here from inside an active encounter (nurse routing). The /walk-ins
  // endpoint filters to is_walk_in=true only, which missed nurse-routed
  // patients. Use /queue so anyone routed to lab shows up here.
  const fetchWalkIns = useCallback(async () => {
    try {
      const response = await apiClient.get('/department-routing/lab/queue');
      setWalkIns(response.data.queue || response.data.walk_ins || []);
    } catch (error) {
      console.error('Error fetching lab queue:', error);
    }
  }, []);

  // Fetch inventory
  const fetchInventory = useCallback(async () => {
    try {
      let url = '/lab-inventory';
      const params = new URLSearchParams();
      if (inventoryTypeFilter) params.append('item_type', inventoryTypeFilter);
      if (inventoryStatusFilter === 'low_stock') params.append('low_stock', 'true');
      if (inventoryStatusFilter === 'expiring') params.append('expiring_soon', 'true');
      if (inventorySearch) params.append('search', inventorySearch);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await apiClient.get(url);
      setInventory(response.data.inventory || []);
      setInventoryStats(response.data.stats || null);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  }, [inventoryTypeFilter, inventoryStatusFilter, inventorySearch]);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      let url = '/lab/analytics';
      const params = new URLSearchParams();
      if (analyticsStartDate) params.append('start_date', analyticsStartDate);
      if (analyticsEndDate) params.append('end_date', analyticsEndDate);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await apiClient.get(url);
      setAnalytics(response.data);

      // Fetch volume by type
      const volumeResponse = await apiClient.get(`/lab/analytics/volume-by-type${params.toString() ? '?' + params.toString() : ''}`);
      setTestVolumeData(volumeResponse.data.by_category || []);
      setTopTests(volumeResponse.data.top_tests || []);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  }, [analyticsStartDate, analyticsEndDate]);

  // Fetch critical alerts
  const fetchCriticalAlerts = useCallback(async () => {
    try {
      const response = await apiClient.get('/lab/critical-alerts');
      setCriticalAlerts(response.data.alerts || []);

      const unackCount = response.data.unacknowledged || 0;
      if (unackCount > 0) {
        showToast(`${unackCount} critical result(s) pending acknowledgment`, 'warning');
      }
    } catch (error) {
      console.error('Error fetching critical alerts:', error);
    }
  }, [showToast]);

  // List of lab users available to act as reviewer on a result. The current
  // user is excluded (self-review is blocked on the server). Used to populate
  // the "Assign reviewer" dropdown when entering a result.
  const fetchLabReviewers = useCallback(async () => {
    try {
      const response = await apiClient.get('/users/lab-reviewers');
      setLabReviewers((response.data.reviewers || []) as LabReviewer[]);
    } catch (error) {
      console.error('Could not load lab reviewer list:', error);
      setLabReviewers([]);
    }
  }, []);

  // Pull the list of lab results waiting on peer review. The server hides
  // rows the current user entered themselves, so this is exactly the queue
  // of items they can act on.
  const fetchPendingVerification = useCallback(async () => {
    try {
      const response = await apiClient.get('/orders/lab/pending-verification');
      setPendingVerification(response.data.pending || []);
    } catch (error) {
      console.error('Error fetching pending verification queue:', error);
    }
  }, []);

  // Fetch test catalog
  const fetchTestCatalog = useCallback(async () => {
    try {
      let url = '/lab/test-catalog';
      const params = new URLSearchParams();
      if (catalogCategory) params.append('category', catalogCategory);
      if (catalogSearch) params.append('search', catalogSearch);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await apiClient.get(url);
      setTestCatalog(response.data.tests || []);
      const cats = (response.data.categories || []).map((c: any) => c.category);
      setCatalogCategories(cats);
    } catch (error) {
      console.error('Error fetching test catalog:', error);
    }
  }, [catalogCategory, catalogSearch]);

  // Fetch QC data
  const fetchQCData = useCallback(async () => {
    try {
      const response = await apiClient.get('/lab/qc/summary');
      setQCSummary(response.data.summary || null);
      setQCResults(response.data.recent_runs || []);
      setQCAvailableTests(response.data.available_tests || []);
    } catch (error) {
      console.error('Error fetching QC data:', error);
    }
  }, []);

  // Fetch Levey-Jennings chart data
  const fetchLeveyJenningsData = useCallback(async (testCode: string) => {
    if (!testCode) {
      setLeveyJenningsData(null);
      return;
    }
    try {
      const response = await apiClient.get(`/lab/qc/levey-jennings/${testCode}?days=30`);
      setLeveyJenningsData(response.data.chart_data || null);
    } catch (error) {
      console.error('Error fetching Levey-Jennings data:', error);
    }
  }, []);

  const fetchScheduledAppointments = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiClient.get('/appointments', { params: { from_date: today, to_date: today, limit: 50 } });
      const all = res.data.appointments || res.data || [];
      setScheduledAppointments(all.filter((a: any) => a.appointment_type === 'walk-in lab' && a.status !== 'cancelled'));
    } catch { /* ignore */ }
  }, []);

  // One-time bootstrap of reviewers + analytics (cards), independent of
  // polling cadence.
  useEffect(() => {
    fetchAnalytics();
    fetchLabReviewers();
    fetchScheduledAppointments();
  }, [fetchAnalytics, fetchLabReviewers, fetchScheduledAppointments]);

  // Smart polling: pauses when tab hidden, fires immediately on return.
  useSmartPolling(() => {
    fetchLabOrders();
    fetchPendingVerification();
    fetchScheduledAppointments();
  }, 30_000, true);

  useEffect(() => {
    if (activeTab === 'inventory') fetchInventory();
  }, [activeTab, fetchInventory]);

  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics();
  }, [activeTab, fetchAnalytics]);

  useSmartPolling(fetchCriticalAlerts, 30_000, activeTab === 'alerts');

  useEffect(() => {
    if (activeTab === 'catalog') fetchTestCatalog();
  }, [activeTab, fetchTestCatalog]);

  useEffect(() => {
    if (activeTab === 'qc') {
      fetchQCData();
    }
  }, [activeTab, fetchQCData]);

  // Walk-ins queue refreshes faster (15s) since techs watch it actively.
  useSmartPolling(fetchWalkIns, 15_000, activeTab === 'walkins');

  useEffect(() => {
    if (selectedQCTest) {
      fetchLeveyJenningsData(selectedQCTest);
    }
  }, [selectedQCTest, fetchLeveyJenningsData]);

  // Update order status
  const updateStatus = async (orderId: number, status: string, results?: string) => {
    try {
      await apiClient.put(`/orders/lab/${orderId}`, {
        status,
        ...(results && { results }),
      });
      showToast('Order updated successfully', 'success');
      fetchLabOrders();
      fetchCriticalAlerts(); // Refresh alerts in case critical result was created
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Failed to update order', 'error');
    }
  };

  // Delete a completed result with a paper trail. Requires a reason
  // (e.g. 'attached to wrong patient'). Sends order back to in-progress.
  const deleteLabResult = async (order: LabOrder) => {
    const reason = await promptDialog({
      title: `Delete result for ${order.test_name}?`,
      message:
        `Patient: ${order.patient_name}\n\n` +
        `This clears the result and sends the order back to In Progress so it can be re-entered. ` +
        `A reason is required for the audit log.`,
      placeholder: 'e.g. Result attached to wrong patient',
      required: true,
      multiline: true,
      confirmLabel: 'Delete result',
    });
    if (!reason) return; // user cancelled
    try {
      await apiClient.post(`/orders/lab/${order.id}/delete-result`, { reason });
      showToast('Result cleared. Order is back in In Progress.', 'success');
      fetchLabOrders();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to clear result', 'error');
    }
  };

  // Fetch the uploaded result file and open it (PDF/image preview in new tab,
  // download otherwise). Used both by the lab tech to verify what they
  // uploaded and by anyone clicking View File on a completed lab order.
  const viewLabResultFile = async (documentId: number) => {
    try {
      const res = await apiClient.get(`/documents/${documentId}`);
      // Server returns { document: { file_data, file_type, document_name, ... } }
      // where file_data is already a 'data:<mime>;base64,...' URL.
      const doc = res.data?.document;
      const fileData: string | undefined = doc?.file_data;
      const fileType: string | undefined = doc?.file_type;
      const documentName: string | undefined = doc?.document_name;
      if (!fileData) {
        showToast(
          'This file is no longer accessible — it was uploaded before the storage upgrade. Please re-upload the result PDF.',
          'error'
        );
        return;
      }
      const previewable = (fileType || '').startsWith('image/') || fileType === 'application/pdf';
      if (previewable) {
        // Render a small wrapper page so the browser frames the file with a
        // title. Data URLs can't be opened directly as window.open in some
        // browsers (popup blockers / about:blank quirks).
        const win = window.open();
        if (win) {
          win.document.write(
            `<title>${documentName || 'Lab Result'}</title>` +
              ((fileType || '').startsWith('image/')
                ? `<img src="${fileData}" style="max-width:100%;height:auto;" />`
                : `<iframe src="${fileData}" style="border:0;width:100vw;height:100vh;"></iframe>`)
          );
        }
      } else {
        const a = document.createElement('a');
        a.href = fileData;
        a.download = documentName || 'lab-result';
        a.click();
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load file', 'error');
    }
  };

  // Remove a routing entry from the Walk-ins list. 'completed' = work done.
  // 'cancelled' = routed in error / shouldn't have been here. Either way
  // the patient drops off the queue.
  const updateRoutingEntry = async (
    routingId: number,
    patientName: string,
    nextStatus: 'completed' | 'cancelled'
  ) => {
    const verb = nextStatus === 'completed' ? 'mark as done' : 'remove';
    const ok = await confirmDialog({
      title: nextStatus === 'completed' ? 'Mark as done?' : 'Remove from queue?',
      message:
        nextStatus === 'completed'
          ? `Mark ${patientName} as done in the lab? They will be removed from this list.`
          : `Remove ${patientName} from the lab queue? Use this if they were routed by mistake.`,
      variant: nextStatus === 'completed' ? 'success' : 'warning',
      confirmLabel: nextStatus === 'completed' ? 'Mark done' : 'Remove',
    });
    if (!ok) return;
    try {
      await apiClient.put(`/department-routing/${routingId}/status`, { status: nextStatus });
      showToast(
        nextStatus === 'completed'
          ? `${patientName} marked done`
          : `${patientName} removed from queue`,
        'success'
      );
      fetchWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || `Failed to ${verb}`, 'error');
    }
  };

  // Submit walk-in tests — creates lab orders + bills them
  const handleSubmitWalkinTests = async () => {
    if (!addTestsWalkin || walkinTests.length === 0) return;
    setSubmittingWalkinTests(true);
    try {
      for (const test of walkinTests) {
        await apiClient.post('/orders/lab', {
          patient_id: addTestsWalkin.patient_id,
          encounter_id: addTestsWalkin.encounter_id,
          test_name: test.test_name,
          priority: test.priority,
          notes: test.notes || null,
        });
      }
      showToast(`${walkinTests.length} lab order(s) created for ${addTestsWalkin.patient_name}`, 'success');
      setAddTestsWalkin(null);
      setWalkinTests([]);
      setWalkinTestName('');
      setWalkinPriority('routine');
      setWalkinNotes('');
      fetchLabOrders();
      fetchWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to create lab orders', 'error');
    } finally {
      setSubmittingWalkinTests(false);
    }
  };

  // Quick register + check in a new patient for lab walk-in
  const handleQuickRegister = async () => {
    if (!quickRegForm.first_name || !quickRegForm.last_name || !quickRegForm.phone) {
      showToast('First name, last name, and phone are required', 'warning');
      return;
    }
    setCreatingWalkin(true);
    try {
      // Create the patient first
      const patientRes = await apiClient.post('/patients', {
        first_name: quickRegForm.first_name,
        last_name: quickRegForm.last_name,
        phone: quickRegForm.phone,
        gender: quickRegForm.gender || undefined,
      });
      const newPatient = patientRes.data.patient;
      // Then check them in as lab walk-in
      await apiClient.post('/workflow/check-in', {
        patient_id: newPatient.id,
        encounter_type: 'walk-in',
        chief_complaint: 'Lab walk-in',
        clinic: 'Lab (Walk-in)',
      });
      showToast(`${quickRegForm.first_name} ${quickRegForm.last_name} registered and checked in`, 'success');
      setShowNewWalkin(false);
      setShowQuickRegister(false);
      setQuickRegForm({ first_name: '', last_name: '', phone: '', gender: '' });
      fetchWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to register patient', 'error');
    } finally {
      setCreatingWalkin(false);
    }
  };

  // Search patients for new walk-in
  const searchWalkinPatients = async (query: string) => {
    setWalkinSearch(query);
    if (query.length < 2) { setWalkinSearchResults([]); return; }
    try {
      const res = await apiClient.get(`/patients?search=${encodeURIComponent(query)}&limit=5`);
      setWalkinSearchResults(res.data.patients || []);
    } catch { setWalkinSearchResults([]); }
  };

  // Check in a walk-in patient directly from the lab
  const handleNewWalkin = async (patient: any) => {
    setCreatingWalkin(true);
    try {
      await apiClient.post('/workflow/check-in', {
        patient_id: patient.id,
        encounter_type: 'walk-in',
        chief_complaint: 'Lab walk-in',
        clinic: 'Lab (Walk-in)',
      });
      showToast(`${patient.first_name} ${patient.last_name} checked in for lab`, 'success');
      setShowNewWalkin(false);
      setWalkinSearch('');
      setWalkinSearchResults([]);
      fetchWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.response?.data?.error || 'Failed to check in patient', 'error');
    } finally {
      setCreatingWalkin(false);
    }
  };

  // Release patient back to the nurse — the nurse decides what's next
  // (more orders, another department, or final checkout). Lab tests keep
  // processing; the encounter is NOT closed and the room is NOT released.
  const [releasing, setReleasing] = useState<Set<number>>(new Set());
  const [released, setReleased] = useState<Set<number>>(new Set());

  const releasePatient = async (
    encounterId: number,
    patientName: string,
    pendingCount: number,
    encounterClinic?: string | null
  ) => {
    if (releasing.has(encounterId) || released.has(encounterId)) return;
    const isWalkIn = encounterClinic === 'Lab (Walk-in)';
    const ok = await confirmDialog({
      title: isWalkIn ? 'Ready for checkout?' : 'Send back to nurse?',
      message: isWalkIn
        ? `Send ${patientName} to the receptionist for checkout? Tests will continue processing and the patient will be notified when results are ready.`
        : `Send ${patientName} back to the nurse? ${pendingCount} test(s) will keep processing in the background. The nurse will be notified to take over follow-up.`,
      variant: 'warning',
      confirmLabel: isWalkIn ? 'Ready for checkout' : 'Send to nurse',
    });
    if (!ok) return;
    setReleasing(prev => new Set(prev).add(encounterId));
    try {
      await apiClient.post('/workflow/release-to-nurse', {
        encounter_id: encounterId,
        from_department: 'lab',
      });
      setReleased(prev => new Set(prev).add(encounterId));
      showToast(isWalkIn ? `${patientName} sent to receptionist for checkout.` : `${patientName} sent back to nurse. Tests continue processing.`, 'success');
      fetchLabOrders();
      fetchWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to release patient', 'error');
    } finally {
      setReleasing(prev => {
        const next = new Set(prev);
        next.delete(encounterId);
        return next;
      });
    }
  };

  // Batch update orders
  const batchUpdateOrders = async (status: string) => {
    try {
      for (const orderId of selectedOrders) {
        await apiClient.put(`/orders/lab/${orderId}`, { status });
      }
      showToast(`${selectedOrders.length} orders updated successfully`, 'success');
      setSelectedOrders([]);
      fetchLabOrders();
    } catch (error) {
      console.error('Error batch updating:', error);
      showToast('Failed to update some orders', 'error');
    }
  };

  // Acknowledge critical alert
  const acknowledgeAlert = async (alertId: number) => {
    try {
      await apiClient.post(`/lab/critical-alerts/${alertId}/acknowledge`);
      showToast('Critical result acknowledged', 'success');
      fetchCriticalAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      showToast('Failed to acknowledge alert', 'error');
    }
  };

  // Inventory CRUD operations
  const saveInventoryItem = async () => {
    try {
      if (editingItem) {
        await apiClient.put(`/lab-inventory/${editingItem.id}`, inventoryForm);
        showToast('Item updated successfully', 'success');
      } else {
        await apiClient.post('/lab-inventory', inventoryForm);
        showToast('Item created successfully', 'success');
      }
      setShowInventoryModal(false);
      resetInventoryForm();
      fetchInventory();
    } catch (error) {
      console.error('Error saving inventory item:', error);
      showToast('Failed to save item', 'error');
    }
  };

  const adjustStock = async () => {
    if (!editingItem) return;
    try {
      await apiClient.post(`/lab-inventory/${editingItem.id}/adjust`, adjustStockForm);
      showToast('Stock adjusted successfully', 'success');
      setShowAdjustStockModal(false);
      setAdjustStockForm({ adjustment: 0, transaction_type: 'adjustment', notes: '' });
      fetchInventory();
    } catch (error: any) {
      console.error('Error adjusting stock:', error);
      showToast(error.response?.data?.error || 'Failed to adjust stock', 'error');
    }
  };

  const recordCalibration = async () => {
    if (!editingItem) return;
    try {
      await apiClient.post(`/lab-inventory/${editingItem.id}/calibration`, calibrationForm);
      showToast('Calibration recorded successfully', 'success');
      setShowCalibrationModal(false);
      setCalibrationForm({ next_calibration_date: '', notes: '' });
      fetchInventory();
    } catch (error) {
      console.error('Error recording calibration:', error);
      showToast('Failed to record calibration', 'error');
    }
  };

  // Test catalog operations
  const saveTest = async () => {
    try {
      const data = {
        ...testForm,
        critical_low: testForm.critical_low ? parseFloat(testForm.critical_low) : null,
        critical_high: testForm.critical_high ? parseFloat(testForm.critical_high) : null,
        normal_range_low: testForm.normal_range_low ? parseFloat(testForm.normal_range_low) : null,
        normal_range_high: testForm.normal_range_high ? parseFloat(testForm.normal_range_high) : null,
      };

      if (editingTest) {
        await apiClient.put(`/lab/test-catalog/${editingTest.id}`, data);
        showToast('Test updated successfully', 'success');
      } else {
        await apiClient.post('/lab/test-catalog', data);
        showToast('Test created successfully', 'success');
      }
      setShowTestModal(false);
      resetTestForm();
      fetchTestCatalog();
    } catch (error: any) {
      console.error('Error saving test:', error);
      showToast(error.response?.data?.error || 'Failed to save test', 'error');
    }
  };

  // Submit structured result with optional file upload
  const submitStructuredResult = async () => {
    if (!selectedOrderForResult) return;

    // Verification flow: any result entered against an order that has not
    // already been verified must be assigned to a peer reviewer. The server
    // enforces this too, but we want to give a clear inline error instead of
    // bouncing off a 400 response.
    const alreadyVerified = selectedOrderForResult.verification_status === 'verified';
    if (!alreadyVerified && !skipVerification) {
      if (!assignedReviewerId) {
        showToast('Pick a reviewer or check "Skip Verification" before submitting.', 'error');
        return;
      }
      if (labReviewers.length === 0) {
        showToast(
          'No other lab user is available to verify this result. Use "Skip Verification" to submit directly.',
          'error',
        );
        return;
      }
    }

    // If we're editing a result on a previously completed order, require a
    // reason for the audit trail. Skip when this is the first save.
    let reason: string | null | undefined;
    if (selectedOrderForResult.status === 'completed') {
      reason = await promptDialog({
        title: 'Reason for edit',
        message:
          `This order was already marked completed. Provide a reason for the change — it will be recorded in the audit log.`,
        placeholder: 'e.g. Wrong value entered, corrected after lab re-run',
        required: true,
        multiline: true,
        confirmLabel: 'Save edit',
      });
      if (!reason) return; // user cancelled the reason prompt
    }

    try {
      // Templated tests submit a JSON payload keyed by parameter_code so the
      // server can run per-parameter critical-value checks and the printed
      // report can render a structured table. Non-templated tests fall back
      // to the legacy free-text result string.
      const hasTemplate = templateParams.length > 0;
      const resultText = hasTemplate
        ? JSON.stringify({
            ...templateValues,
            ...(templateNotes.trim() ? { __notes: templateNotes.trim() } : {}),
          })
        : `${structuredResult.value} ${structuredResult.unit}${
            structuredResult.notes ? '\n' + structuredResult.notes : ''
          }`;

      if (hasTemplate) {
        const missingRequired = templateParams.find((p) => {
          const key = p.parameter_code || p.parameter_name;
          return p.value_type === 'numeric' && !templateValues[key];
        });
        if (missingRequired) {
          showToast(
            `Enter a value for ${missingRequired.parameter_name} (or any other missing numeric field).`,
            'error',
          );
          return;
        }
      }

      // First update the lab order
      await apiClient.put(`/orders/lab/${selectedOrderForResult.id}`, {
        // Server moves us to 'in-progress' + verification_status='pending'
        // when a reviewer is assigned. We pass 'completed' for legacy /
        // grandfathered (verification_status='not_required') rows so the
        // existing finalisation path runs.
        status: 'completed',
        results: resultText,
        specimen_id: structuredResult.specimen_id,
        ...(skipVerification ? { skip_verification: true } : alreadyVerified ? {} : { assigned_reviewer_id: assignedReviewerId }),
        ...(reason ? { reason } : {}),
      });

      // If file is selected, upload it
      if (selectedFile) {
        setUploadingFile(true);
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await apiClient.post('/documents', {
              patient_id: selectedOrderForResult.patient_id,
              encounter_id: selectedOrderForResult.encounter_id,
              lab_order_id: selectedOrderForResult.id,
              document_type: 'lab_result',
              document_name: selectedFile.name,
              file_data: reader.result,
              file_type: selectedFile.type,
              description: `Lab result for ${selectedOrderForResult.test_name}`,
              ...(reason ? { reason } : {}),
            });
            showToast('Result and document uploaded successfully', 'success');
          } catch (uploadError) {
            console.error('Error uploading document:', uploadError);
            showToast('Result saved but document upload failed', 'warning');
          } finally {
            setUploadingFile(false);
          }
        };
        reader.readAsDataURL(selectedFile);
      } else {
        showToast(
          alreadyVerified
            ? 'Result updated.'
            : skipVerification
            ? 'Result submitted and completed (verification skipped).'
            : 'Result submitted for verification. A reviewer will be notified.',
          'success',
        );
      }

      setShowResultModal(false);
      setStructuredResult({ value: '', unit: '', notes: '', specimen_id: '' });
      setSelectedOrderForResult(null);
      setTestReferenceRanges(null);
      setSelectedFile(null);
      setAssignedReviewerId('');
      setSkipVerification(false);
      setTemplateParams([]);
      setTemplateValues({});
      setTemplateNotes('');
      fetchLabOrders();
      fetchCriticalAlerts();
      fetchPendingVerification();
    } catch (error) {
      console.error('Error submitting result:', error);
      showToast('Failed to submit result', 'error');
    }
  };

  // Record QC result
  const recordQCResult = async () => {
    try {
      const response = await apiClient.post('/lab/qc', {
        ...qcForm,
        measured_value: parseFloat(qcForm.measured_value),
        target_value: parseFloat(qcForm.target_value),
        standard_deviation: parseFloat(qcForm.standard_deviation),
      });

      if (response.data.warning) {
        showToast(response.data.warning, 'warning');
      } else {
        showToast('QC result recorded successfully', 'success');
      }

      setShowQCModal(false);
      setQCForm({
        test_code: '',
        test_name: '',
        control_level: 'normal',
        lot_number: '',
        measured_value: '',
        target_value: '',
        standard_deviation: '',
        unit: '',
        notes: '',
      });
      fetchQCData();
      if (selectedQCTest === qcForm.test_code) {
        fetchLeveyJenningsData(selectedQCTest);
      }
    } catch (error: any) {
      console.error('Error recording QC result:', error);
      showToast(error.response?.data?.error || 'Failed to record QC result', 'error');
    }
  };

  // Export analytics
  const exportAnalytics = async (reportType: string) => {
    try {
      const params = new URLSearchParams();
      params.append('report_type', reportType);
      if (analyticsStartDate) params.append('start_date', analyticsStartDate);
      if (analyticsEndDate) params.append('end_date', analyticsEndDate);

      const response = await apiClient.get(`/lab/analytics/export?${params.toString()}`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lab_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('Report exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting analytics:', error);
      showToast('Failed to export report', 'error');
    }
  };

  // Render a lab result either as a structured parameter table (when the
  // payload is JSON keyed by parameter code) or as plain text (legacy).
  // Used in the order list, the verification queue, and the details panel.
  const renderResultPayload = (
    raw: string | null | undefined,
    opts?: { compact?: boolean },
  ): React.ReactNode => {
    if (!raw || !raw.trim()) return null;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) {
      return <div className="text-sm whitespace-pre-wrap">{raw}</div>;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, string>;
      const entries = Object.entries(parsed).filter(([k]) => k !== '__notes');
      const notes = typeof parsed.__notes === 'string' ? parsed.__notes : null;
      if (entries.length === 0) {
        return notes ? <div className="text-sm italic text-gray-600">{notes}</div> : null;
      }
      return (
        <div>
          <table className={`w-full text-sm ${opts?.compact ? '' : 'border border-gray-200 rounded'}`}>
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k} className="border-t border-gray-100">
                  <td className="py-1 pr-3 text-gray-600 align-top w-1/2">{k}</td>
                  <td className="py-1 font-mono">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {notes && (
            <div className="text-xs italic text-gray-600 mt-1">Remarks: {notes}</div>
          )}
        </div>
      );
    } catch {
      return <div className="text-sm whitespace-pre-wrap">{raw}</div>;
    }
  };

  // Peer-review verification actions. The server enforces the same
  // constraints (lab role, can't verify own work), so these handlers are
  // intentionally thin — they just POST and refresh.
  const submitVerification = async () => {
    if (!verifyingOrder) return;
    try {
      await apiClient.post(`/orders/lab/${verifyingOrder.id}/verify`, {
        notes: verifyNotes.trim() || undefined,
      });
      showToast('Result verified. Doctor will be notified.', 'success');
      setVerifyingOrder(null);
      setVerifyNotes('');
      fetchPendingVerification();
      fetchLabOrders();
      fetchCriticalAlerts();
    } catch (error: any) {
      console.error('Error verifying result:', error);
      showToast(error.response?.data?.error || 'Failed to verify result', 'error');
    }
  };

  const submitRejection = async () => {
    if (!rejectingOrder) return;
    if (!rejectReason.trim()) {
      showToast('A reason is required when rejecting a result.', 'error');
      return;
    }
    try {
      await apiClient.post(`/orders/lab/${rejectingOrder.id}/reject`, {
        reason: rejectReason.trim(),
      });
      showToast('Result sent back to the entry tech.', 'success');
      setRejectingOrder(null);
      setRejectReason('');
      fetchPendingVerification();
      fetchLabOrders();
    } catch (error: any) {
      console.error('Error rejecting result:', error);
      showToast(error.response?.data?.error || 'Failed to reject result', 'error');
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB', 'error');
        return;
      }
      // Check file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        showToast('Only PDF and image files are allowed', 'error');
        return;
      }
      setSelectedFile(file);
    }
  };

  // Open result modal with reference ranges
  const openResultModal = async (order: LabOrder) => {
    setSelectedOrderForResult(order);
    setStructuredResult({ value: '', unit: '', notes: '', specimen_id: order.specimen_id || '' });
    setTemplateParams([]);
    setTemplateValues({});
    setTemplateNotes('');
    setTemplateLoading(true);

    // Two lookups in parallel:
    //   - structured parameter template (multi-row entry form)
    //   - single-test reference range (legacy form fallback + critical banner)
    try {
      const [tmplResp, catalogResp] = await Promise.all([
        apiClient.get(`/lab/orders/${order.id}/parameters`).catch(() => null),
        apiClient
          .get(`/lab/test-catalog?search=${encodeURIComponent(order.test_name)}`)
          .catch(() => null),
      ]);

      if (tmplResp?.data?.has_template && Array.isArray(tmplResp.data.parameters)) {
        const params = tmplResp.data.parameters as ParameterDef[];
        setTemplateParams(params);
        // Pre-fill qualitative defaults so the lab tech can submit without
        // touching every dropdown when the result is "all negative".
        const initial: Record<string, string> = {};
        params.forEach((p) => {
          const key = p.parameter_code || p.parameter_name;
          if (p.value_type === 'qualitative' && p.default_qualitative_value) {
            initial[key] = p.default_qualitative_value;
          } else {
            initial[key] = '';
          }
        });
        // If we're editing an already-entered structured result, pre-fill
        // from the existing JSON payload.
        if (order.results) {
          const trimmed = order.results.trim();
          if (trimmed.startsWith('{')) {
            try {
              const existing = JSON.parse(trimmed);
              if (existing && typeof existing === 'object') {
                Object.assign(initial, existing);
                if (typeof existing.__notes === 'string') {
                  setTemplateNotes(existing.__notes);
                }
              }
            } catch {
              /* ignore — fall back to blank */
            }
          }
        }
        setTemplateValues(initial);
      }

      if (catalogResp?.data?.tests && catalogResp.data.tests.length > 0) {
        setTestReferenceRanges(catalogResp.data.tests[0]);
        setStructuredResult((prev) => ({ ...prev, unit: catalogResp.data.tests[0].unit || '' }));
      }
    } catch (error) {
      console.error('Error fetching template / reference ranges:', error);
    } finally {
      setTemplateLoading(false);
    }

    setShowResultModal(true);
  };

  // Compose a display string for the Reference column. Falls back to
  // building one from normal_low/normal_high when the server didn't supply
  // an explicit reference_range_text — keeps the column populated even on
  // older seeds.
  const formatReference = (p: ParameterDef): string => {
    if (p.reference_range_text && p.reference_range_text.trim()) {
      return p.reference_range_text;
    }
    // Qualitative parameters: show the expected/default value as the
    // reference (e.g. "Negative" for urine Glucose, "Normal" for Urobilinogen).
    if (p.value_type === 'qualitative' && p.default_qualitative_value) {
      return p.default_qualitative_value;
    }
    const lo = p.normal_low != null ? String(p.normal_low) : null;
    const hi = p.normal_high != null ? String(p.normal_high) : null;
    const rawUnit = p.unit || '';
    const unit = rawUnit.startsWith('10^') ? `x${rawUnit}` : rawUnit;
    if (lo == null && hi == null) return '';
    if (lo != null && hi != null) return `${lo} - ${hi}${unit ? ' ' + unit : ''}`;
    if (lo != null) return `> ${lo}${unit ? ' ' + unit : ''}`;
    return `< ${hi}${unit ? ' ' + unit : ''}`;
  };

  // Helper: classify a parameter value as NORMAL / LOW / HIGH / CRITICAL.
  // Used for the live flag column in the structured entry table.
  const classifyValue = (
    p: ParameterDef,
    raw: string,
  ): 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | null => {
    if (p.value_type !== 'numeric' || !raw) return null;
    const v = parseFloat(raw);
    if (Number.isNaN(v)) return null;
    const cl = p.critical_low != null ? parseFloat(String(p.critical_low)) : null;
    const ch = p.critical_high != null ? parseFloat(String(p.critical_high)) : null;
    const nl = p.normal_low != null ? parseFloat(String(p.normal_low)) : null;
    const nh = p.normal_high != null ? parseFloat(String(p.normal_high)) : null;
    if (cl != null && v < cl) return 'CRITICAL_LOW';
    if (ch != null && v > ch) return 'CRITICAL_HIGH';
    if (nl != null && v < nl) return 'LOW';
    if (nh != null && v > nh) return 'HIGH';
    return 'NORMAL';
  };

  // Helper functions
  const resetInventoryForm = () => {
    setInventoryForm({
      item_name: '',
      item_type: 'reagent',
      category: '',
      unit: '',
      quantity_on_hand: 0,
      reorder_level: 10,
      unit_cost: 0,
      expiry_date: '',
      lot_number: '',
      supplier: '',
      storage_location: 'Main Lab',
      storage_conditions: 'room_temp',
    });
    setEditingItem(null);
  };

  const resetTestForm = () => {
    setTestForm({
      test_code: '',
      test_name: '',
      category: '',
      specimen_type: 'blood',
      turnaround_time_hours: 24,
      base_price: 0,
      critical_low: '',
      critical_high: '',
      normal_range_low: '',
      normal_range_high: '',
      unit: '',
    });
    setEditingTest(null);
  };

  const openEditInventory = (item: LabInventoryItem) => {
    setEditingItem(item);
    setInventoryForm({
      item_name: item.item_name,
      item_type: item.item_type,
      category: item.category,
      unit: item.unit,
      quantity_on_hand: item.quantity_on_hand,
      reorder_level: item.reorder_level,
      unit_cost: item.unit_cost,
      expiry_date: item.expiry_date?.split('T')[0] || '',
      lot_number: item.lot_number || '',
      supplier: item.supplier || '',
      storage_location: item.storage_location || 'Main Lab',
      storage_conditions: item.storage_conditions || 'room_temp',
    });
    setShowInventoryModal(true);
  };

  const openEditTest = (test: LabTest) => {
    setEditingTest(test);
    setTestForm({
      test_code: test.test_code,
      test_name: test.test_name,
      category: test.category,
      specimen_type: test.specimen_type,
      turnaround_time_hours: test.turnaround_time_hours,
      base_price: test.base_price,
      critical_low: test.critical_low?.toString() || '',
      critical_high: test.critical_high?.toString() || '',
      normal_range_low: test.normal_range_low?.toString() || '',
      normal_range_high: test.normal_range_high?.toString() || '',
      unit: test.unit || '',
    });
    setShowTestModal(true);
  };

  // Filter orders
  const filteredOrders = labOrders.filter(order => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matches =
        order.patient_name.toLowerCase().includes(searchLower) ||
        order.patient_number.toLowerCase().includes(searchLower) ||
        order.test_name.toLowerCase().includes(searchLower);
      if (!matches) return false;
    }

    // Apply specific status filter from stats card click
    if (statusFilter === 'stat') {
      return order.priority === 'stat' && order.status !== 'completed';
    }
    if (statusFilter === 'pending') {
      return order.status === 'pending';
    }
    if (statusFilter === 'in_progress') {
      return order.status === 'in_progress';
    }

    // Default sub-tab filtering
    if (ordersSubTab === 'pending') {
      return pendingStatuses.includes(order.status);
    } else {
      // For completed tab, only show today's completed orders
      if (order.status !== 'completed') return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const completedDate = order.completed_at ? new Date(order.completed_at) : null;
      if (!completedDate) return false;
      completedDate.setHours(0, 0, 0, 0);
      return completedDate.getTime() === today.getTime();
    }
  });

  // Group filtered orders by patient + encounter
  const groupedLabOrders: GroupedPatientLabOrders[] = React.useMemo(() => {
    const groups: Record<string, GroupedPatientLabOrders> = {};
    const priorityRank: Record<string, number> = { stat: 0, urgent: 1, routine: 2 };

    filteredOrders.forEach(order => {
      const key = `${order.patient_id}-${order.encounter_id}`;
      if (!groups[key]) {
        groups[key] = {
          patient_id: order.patient_id,
          patient_name: order.patient_name,
          patient_number: order.patient_number,
          patient_allergies: order.patient_allergies || null,
          encounter_id: order.encounter_id,
          encounter_number: order.encounter_number,
          ordering_provider_name: order.ordering_provider_name,
          highest_priority: order.priority,
          ordered_at: order.ordered_at,
          encounter_clinic: (order as any).encounter_clinic || null,
          orders: [],
        };
      }
      if (priorityRank[order.priority] < priorityRank[groups[key].highest_priority]) {
        groups[key].highest_priority = order.priority;
      }
      if (new Date(order.ordered_at) < new Date(groups[key].ordered_at)) {
        groups[key].ordered_at = order.ordered_at;
      }
      groups[key].orders.push(order);
    });

    return Object.values(groups).sort((a, b) => {
      const pDiff = priorityRank[a.highest_priority] - priorityRank[b.highest_priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime();
    });
  }, [filteredOrders]);

  // Helper display functions
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-warning-100 text-warning-800';
      case 'in_progress': return 'bg-primary-100 text-primary-800';
      case 'completed': return 'bg-success-100 text-success-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'stat': return 'bg-danger-100 text-danger-800 border-2 border-danger-500';
      case 'urgent': return 'bg-warning-100 text-warning-800 border-2 border-warning-500';
      case 'routine': return 'bg-gray-100 text-gray-800 border border-slate-400';
      default: return 'bg-gray-100 text-gray-800 border border-slate-400';
    }
  };

  const formatTAT = (hours: number | string | null) => {
    if (hours === null || hours === undefined || hours === '') return 'N/A';
    const numHours = typeof hours === 'string' ? parseFloat(hours) : hours;
    if (isNaN(numHours)) return 'N/A';
    if (numHours < 1) return `${Math.round(numHours * 60)}m`;
    return `${numHours.toFixed(1)}h`;
  };

  const generateSpecimenId = () => {
    const now = new Date();
    return `SP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  };

  // Format "<age>/<M|F>" from a patient's DOB + gender — matches the Medics
  // .docx templates where age/sex appears as e.g. "28/M" or "10/F".
  const formatAgeSex = (dob?: string | null, gender?: string | null): string => {
    if (!dob && !gender) return '';
    let age = '';
    if (dob) {
      const birth = new Date(dob);
      if (!isNaN(birth.getTime())) {
        const now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
        age = String(years);
      }
    }
    const sex = (gender || '').toLowerCase().startsWith('m') ? 'M'
      : (gender || '').toLowerCase().startsWith('f') ? 'F'
      : '';
    if (age && sex) return `${age}/${sex}`;
    return age || sex;
  };

  // Short date for the lab template (DD/MM/YYYY — matches the .docx style).
  const formatDateShort = (d?: string | null): string => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  };

  // Print lab report. Loads the parameter template so the printed table can
  // include units, reference ranges, and flags per parameter (matches the
  // .docx layout). Falls back gracefully when no template exists.
  const printLabReport = async (order: LabOrder) => {
    setSelectedOrderForPrint(order);
    // Reuse templateParams state so the print render finds units/ranges per
    // parameter. Even if the modal is closed, this state survives.
    try {
      const tmplResp = await apiClient.get(`/lab/orders/${order.id}/parameters`);
      if (tmplResp.data?.has_template && Array.isArray(tmplResp.data.parameters)) {
        setTemplateParams(tmplResp.data.parameters as ParameterDef[]);
      } else {
        setTemplateParams([]);
      }
    } catch (error) {
      console.error('Failed to load template for print:', error);
      setTemplateParams([]);
    }
    setShowPrintModal(true);
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Lab Report - ${selectedOrderForPrint?.patient_name}</title>
          <style>
            @page { size: A4; margin: 15mm 12mm; }
            * { box-sizing: border-box; }
            body { font-family: 'Times New Roman', Times, serif; color: #000; margin: 0; padding: 0; }
            .lab-report { padding: 0; }
            .header { text-align: center; margin-bottom: 6px; }
            .header img { height: 70px; }
            .header .text-xs { font-size: 11px; color: #444; margin-top: 2px; }
            h2 { font-size: 14px; font-weight: 700; text-align: center; letter-spacing: 0.05em; margin: 12px 0; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            .patient-info td { padding: 4px 8px; font-size: 12px; }
            .investigation { background: #f0f0f0; padding: 6px 10px; font-weight: 700; font-size: 12px; }
            .results { border: 1px solid #000; }
            .results th { padding: 6px 8px; border: 1px solid #000; background: #f0f0f0; text-align: left; }
            .results td { padding: 6px 8px; border: 1px solid #000; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 60px; font-size: 11px; }
            .signatures > div > div:first-child { border-top: 1px solid #000; width: 90%; margin-bottom: 4px; }
            @media print {
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              .lab-report { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const pendingCount = labOrders.filter((o) => o.status === 'pending').length;
  const inProgressCount = labOrders.filter((o) => o.status === 'in_progress').length;
  const unackedCritical = criticalAlerts.filter((a) => !a.is_acknowledged).length;
  return (
    <AppLayout>
      <DashboardHeader
        title="Lab Dashboard"
        stats={(
          <>
            <StatPill label="pending" value={pendingCount} tone={pendingCount > 0 ? 'warning' : 'neutral'} title="Orders waiting on collection" />
            <StatPill label="in progress" value={inProgressCount} tone="primary" title="Specimens being processed" />
            <StatPill label="verification" value={pendingVerification.length} tone={pendingVerification.length > 0 ? 'warning' : 'neutral'} title="Results awaiting peer review" />
            <StatPill label="critical" value={unackedCritical} tone={unackedCritical > 0 ? 'danger' : 'neutral'} title="Unacknowledged critical alerts" />
          </>
        )}
      />
      {/* Stat cards — refined number-first style, click to drill in. */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <LabStat label="Pending" value={labOrders.filter(o => o.status === 'pending').length}
          accent={labOrders.filter(o => o.status === 'pending').length > 0 ? 'warning' : 'neutral'}
          active={activeTab === 'orders' && statusFilter === 'pending'}
          series={labTrends?.orders_created}
          trendDirection="up-is-bad"
          onClick={() => { setActiveTab('orders'); setOrdersSubTab('pending'); setStatusFilter('pending'); }} />
        <LabStat label="In Progress" value={labOrders.filter(o => o.status === 'in_progress').length}
          accent="primary"
          active={activeTab === 'orders' && statusFilter === 'in_progress'}
          onClick={() => { setActiveTab('orders'); setOrdersSubTab('pending'); setStatusFilter('in_progress'); }} />
        <LabStat label="Completed" value={labOrders.filter(o => o.status === 'completed').length}
          accent="success"
          active={activeTab === 'orders' && ordersSubTab === 'completed' && !statusFilter}
          series={labTrends?.orders_completed}
          trendDirection="up-is-good"
          onClick={() => { setActiveTab('orders'); setOrdersSubTab('completed'); setStatusFilter(''); }} />
        <LabStat label="STAT" value={labOrders.filter(o => o.priority === 'stat' && o.status !== 'completed').length}
          accent={labOrders.filter(o => o.priority === 'stat' && o.status !== 'completed').length > 0 ? 'danger' : 'neutral'}
          active={activeTab === 'orders' && statusFilter === 'stat'}
          series={labTrends?.stat_orders}
          trendDirection="up-is-bad"
          onClick={() => { setActiveTab('orders'); setOrdersSubTab('pending'); setStatusFilter('stat'); }} />
        <LabStat label="Critical" value={criticalAlerts.filter(a => !a.is_acknowledged).length}
          accent={criticalAlerts.filter(a => !a.is_acknowledged).length > 0 ? 'danger' : 'neutral'}
          active={activeTab === 'alerts'}
          series={labTrends?.critical_alerts}
          trendDirection="up-is-bad"
          onClick={() => setActiveTab('alerts')} />
        <LabStat label="Avg TAT"
          value={analytics?.turnaround_time?.average_tat_hours ? formatTAT(analytics.turnaround_time.average_tat_hours) : 'N/A'}
          accent="secondary"
          active={activeTab === 'analytics'}
          series={labTrends?.avg_tat_hours}
          trendDirection="up-is-bad"
          trendMode="avg"
          onClick={() => setActiveTab('analytics')} />
        <LabStat label="Low Stock" value={inventoryStats?.low_stock_count || 0}
          accent={(inventoryStats?.low_stock_count || 0) > 0 ? 'warning' : 'neutral'}
          active={activeTab === 'inventory'}
          onClick={() => setActiveTab('inventory')} />
      </div>

      {/* Auto-derived insight */}
      {(() => {
        const statCount = labOrders.filter(o => o.priority === 'stat' && o.status !== 'completed').length;
        const critical = criticalAlerts.filter(a => !a.is_acknowledged).length;
        if (critical > 0) {
          return (
            <div className="mb-4">
              <InsightCard
                tone="warning"
                title={`${critical} unacknowledged critical alert${critical === 1 ? '' : 's'}`}
                body="Critical values flag results that may need urgent provider attention. Acknowledge them after the on-call doctor has been notified."
                action={{ label: 'Open alerts', onClick: () => setActiveTab('alerts') }}
              />
            </div>
          );
        }
        if (statCount >= 3) {
          return (
            <div className="mb-4">
              <InsightCard
                tone="warning"
                title={`${statCount} open STAT orders`}
                body="STAT orders should be processed first — pull them to the top of the bench queue."
                action={{ label: 'View STAT orders', onClick: () => { setActiveTab('orders'); setStatusFilter('stat'); } }}
              />
            </div>
          );
        }
        return null;
      })()}

        {/* Upcoming Scheduled Tests */}
        {scheduledAppointments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Upcoming Scheduled Tests</h2>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-secondary-50 text-secondary-700">{scheduledAppointments.length}</span>
            </div>
            <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
              {scheduledAppointments.map((apt) => (
                <div key={apt.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-secondary-100 text-secondary-700 border border-secondary-200">SCHEDULED</span>
                    <span className="font-medium text-gray-900">{apt.patient_name}</span>
                    <span className="text-gray-500">{apt.reason}</span>
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {new Date(apt.appointment_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {[
              { id: 'walkins', label: 'Walk-ins', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', count: walkIns.length },
              { id: 'orders', label: 'Orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', count: labOrders.filter(o => o.status !== 'completed').length },
              { id: 'verification', label: 'Verification', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z', count: pendingVerification.length, alert: pendingVerification.length > 0 },
              { id: 'inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', count: inventory.length },
              { id: 'catalog', label: 'Test Catalog', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
              { id: 'qc', label: 'Quality Control', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
              { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { id: 'alerts', label: 'Critical Alerts', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', count: criticalAlerts.filter(a => !a.is_acknowledged).length, alert: true },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 min-w-max px-6 py-4 text-center font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      tab.alert && tab.count > 0 ? 'bg-danger-500 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Walk-ins Tab */}
        {activeTab === 'walkins' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Walk-in Patients</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNewWalkin(true)}
                  className="px-3 py-1.5 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded-lg flex items-center gap-1 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Walk-in
                </button>
                <button
                  onClick={fetchWalkIns}
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
                >
                  Refresh
                </button>
              </div>
            </div>
            {/* New Walk-in Search */}
            {showNewWalkin && (
              <div className="p-4 bg-primary-50 border-b border-primary-200">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-primary-800">Check in a walk-in patient for lab</h3>
                  <button onClick={() => { setShowNewWalkin(false); setWalkinSearch(''); setWalkinSearchResults([]); }} className="text-gray-400 hover:text-gray-600 ml-auto">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <input
                  type="text"
                  value={walkinSearch}
                  onChange={(e) => searchWalkinPatients(e.target.value)}
                  placeholder="Search patient by name or number..."
                  className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 bg-white"
                  autoFocus
                />
                {walkinSearchResults.length > 0 && (
                  <div className="mt-2 bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {walkinSearchResults.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => handleNewWalkin(p)}
                        disabled={creatingWalkin}
                        className="w-full px-4 py-2.5 flex justify-between items-center text-left hover:bg-primary-50 transition-colors disabled:opacity-50"
                      >
                        <div>
                          <span className="font-medium text-gray-900 text-sm">{p.first_name} {p.last_name}</span>
                          <span className="text-xs text-gray-500 ml-2">{p.patient_number}</span>
                        </div>
                        <span className="text-xs text-primary-600 font-medium">Check in →</span>
                      </button>
                    ))}
                  </div>
                )}
                {walkinSearch.length >= 2 && walkinSearchResults.length === 0 && !showQuickRegister && (
                  <div className="mt-2 text-center py-3">
                    <p className="text-sm text-gray-500 mb-2">No patients found</p>
                    <button
                      onClick={() => {
                        const parts = walkinSearch.trim().split(/\s+/);
                        setQuickRegForm({ first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '', phone: '', gender: '' });
                        setShowQuickRegister(true);
                      }}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
                    >
                      + Register New Patient
                    </button>
                  </div>
                )}
                {showQuickRegister && (
                  <div className="mt-3 bg-white border border-primary-200 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900">Quick Registration</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={quickRegForm.first_name} onChange={(e) => setQuickRegForm({ ...quickRegForm, first_name: e.target.value })} placeholder="First Name *" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      <input type="text" value={quickRegForm.last_name} onChange={(e) => setQuickRegForm({ ...quickRegForm, last_name: e.target.value })} placeholder="Last Name *" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={quickRegForm.phone} onChange={(e) => setQuickRegForm({ ...quickRegForm, phone: e.target.value })} placeholder="Phone Number *" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      <AppSelect
                        value={quickRegForm.gender}
                        onChange={(val) => setQuickRegForm({ ...quickRegForm, gender: val })}
                        options={[
                          { value: 'male', label: 'Male' },
                          { value: 'female', label: 'Female' },
                        ]}
                        placeholder="Gender"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowQuickRegister(false)} className="px-3 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                      <button onClick={handleQuickRegister} disabled={creatingWalkin} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 flex-1">
                        {creatingWalkin ? 'Registering...' : 'Register & Check In'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {walkIns.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-lg font-medium">No patients waiting for lab</p>
                <p className="text-sm mt-1">Patients sent here by reception or by the nurse will appear here.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Encounter</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Arrived</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {walkIns.map((walkin) => (
                    <tr key={walkin.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{walkin.patient_name}</div>
                        <div className="text-sm text-gray-500">{walkin.patient_number}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{walkin.encounter_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{walkin.notes || walkin.chief_complaint || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(walkin.routed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          walkin.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          walkin.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {walkin.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-sm">
                          <button
                            onClick={() => {
                              setAddTestsWalkin(walkin);
                              setWalkinTests([]);
                              setWalkinTestName('');
                            }}
                            className="px-2 py-1 bg-primary-600 text-white rounded text-xs font-semibold hover:bg-primary-700"
                          >
                            + Add Tests
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPatientId(walkin.patient_id);
                              setShowPatientQuickView(true);
                            }}
                            className="text-primary-600 hover:text-primary-800 font-medium"
                          >
                            View
                          </button>
                          <button
                            onClick={() => updateRoutingEntry(walkin.id, walkin.patient_name, 'completed')}
                            className="text-success-600 hover:text-success-800 font-medium"
                            title="Mark this patient as done in the lab"
                          >
                            Done
                          </button>
                          <button
                            onClick={() => updateRoutingEntry(walkin.id, walkin.patient_name, 'cancelled')}
                            className="text-danger-600 hover:text-danger-800 font-medium"
                            title="Remove from queue (routed by mistake)"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div>
            {/* Search and Filters */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    placeholder="Search by patient name, number, or test..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <AppSelect
                    value={priorityFilter}
                    onChange={(val) => setPriorityFilter(val)}
                    options={[
                      { value: 'stat', label: 'STAT' },
                      { value: 'urgent', label: 'Urgent' },
                      { value: 'routine', label: 'Routine' },
                    ]}
                    placeholder="All Priorities"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="From Date"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="To Date"
                  />
                </div>
                <div>
                  <button
                    onClick={fetchLabOrders}
                    className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Batch Actions */}
            {selectedOrders.length > 0 && (
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="font-medium text-primary-800">{selectedOrders.length} order(s) selected</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => batchUpdateOrders('in_progress')}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Start All
                  </button>
                  <button
                    onClick={() => setSelectedOrders([])}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            {/* Orders Sub-tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => { setOrdersSubTab('pending'); setStatusFilter(''); }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  ordersSubTab === 'pending' && !statusFilter
                    ? 'bg-warning-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Pending & In Progress ({labOrders.filter(o => o.status === 'pending' || o.status === 'in_progress').length})
              </button>
              <button
                onClick={() => { setOrdersSubTab('completed'); setStatusFilter(''); }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  ordersSubTab === 'completed' && !statusFilter
                    ? 'bg-success-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Completed ({labOrders.filter(o => o.status === 'completed').length})
              </button>
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter('')}
                  className="px-4 py-2 rounded-lg font-medium bg-gray-800 text-white flex items-center gap-2"
                >
                  Filtered: {statusFilter === 'stat' ? 'STAT Orders' : statusFilter === 'pending' ? 'Pending Only' : 'In Progress Only'}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Orders List with Patient Details Panel */}
            <div className="flex gap-6">
              {/* Left: Orders List */}
              <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200">
                <div className={`px-6 py-4 border-b border-gray-200 rounded-t-xl ${
                  ordersSubTab === 'pending' ? 'bg-gradient-to-r from-warning-50 to-orange-50' : 'bg-gradient-to-r from-success-50 to-success-50'
                }`}>
                  <h2 className="text-xl font-bold text-gray-900">
                    {ordersSubTab === 'pending' ? 'Pending & In Progress Tests' : 'Completed Test Results'}
                  </h2>
                </div>
                <div className="divide-y divide-gray-200">
                {groupedLabOrders.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">No tests found</p>
                  </div>
                ) : (
                  groupedLabOrders.map((group) => (
                    <div key={`${group.patient_id}-${group.encounter_id}`} className="border-b border-gray-200 last:border-b-0">
                      {/* Patient Group Header */}
                      <div
                        className={`px-6 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors ${
                          group.highest_priority === 'stat' ? 'bg-danger-50 border-l-4 border-danger-500' : ''
                        }`}
                        onClick={() => {
                          setSelectedOrderForDetails(group.orders[0]);
                          fetchPatientDetailsForPanel(group.patient_id, group.encounter_id);
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-semibold text-gray-900">{group.patient_name}</h3>
                            <span className="text-sm text-gray-500">{group.patient_number}</span>
                            {group.patient_allergies && (
                              <span className="px-2 py-0.5 text-xs font-bold bg-danger-100 text-danger-700 rounded-full border border-danger-300">
                                Allergies: {group.patient_allergies}
                              </span>
                            )}
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${getPriorityBadgeClass(group.highest_priority)}`}>
                              {group.highest_priority.toUpperCase()}
                            </span>
                            <span className="text-sm text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                              {group.orders.length} test{group.orders.length > 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPatientId(group.patient_id);
                                setShowPatientQuickView(true);
                              }}
                              className="px-2 py-1 text-xs bg-primary-100 text-primary-700 rounded hover:bg-primary-200"
                            >
                              View Patient
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            {ordersSubTab === 'pending' && group.orders.every(o => o.status === 'pending') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  group.orders.forEach(o => updateStatus(o.id, 'in_progress'));
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                              >
                                Start All Processing
                              </button>
                            )}
                            {(group.encounter_clinic === 'Lab (Walk-in)' || (ordersSubTab === 'pending' && group.orders.some(o => o.status === 'in_progress' || o.status === 'pending'))) && (() => {
                              const inFlight = releasing.has(group.encounter_id);
                              const done = released.has(group.encounter_id);
                              const disabled = inFlight || done;
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (disabled) return;
                                    const pending = group.orders.filter(o => o.status === 'pending' || o.status === 'in_progress').length;
                                    releasePatient(group.encounter_id, group.patient_name, pending, group.encounter_clinic);
                                  }}
                                  disabled={disabled}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors ${
                                    done
                                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                      : inFlight
                                      ? 'bg-warning-300 text-white cursor-wait'
                                      : 'bg-warning-600 hover:bg-warning-700 text-white'
                                  }`}
                                  title={
                                    done
                                      ? 'Already released to nurse'
                                      : group.encounter_clinic === 'Lab (Walk-in)' ? 'Send to receptionist for checkout' : 'Send patient back to nurse — tests keep processing'
                                  }
                                >
                                  {done ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                  )}
                                  {done ? 'Sent' : inFlight ? 'Sending…' : group.encounter_clinic === 'Lab (Walk-in)' ? 'Ready for Checkout' : 'Send to Nurse'}
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Ordered by: {group.ordering_provider_name} | Encounter: {group.encounter_number} | {new Date(group.ordered_at).toLocaleString()}
                        </div>
                      </div>

                      {/* Individual Test Items */}
                      {group.orders.map((order) => (
                        <div
                          key={order.id}
                          className={`px-6 py-3 pl-10 hover:bg-gray-50 transition-colors cursor-pointer border-t border-gray-100 ${
                            selectedOrderForDetails?.id === order.id ? 'ring-2 ring-primary-500 bg-primary-50' : ''
                          }`}
                          onClick={() => {
                            setSelectedOrderForDetails(order);
                            fetchPatientDetailsForPanel(order.patient_id, order.encounter_id);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3 flex-1">
                              {ordersSubTab === 'pending' && (
                                <input
                                  type="checkbox"
                                  checked={selectedOrders.includes(order.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (e.target.checked) {
                                      setSelectedOrders([...selectedOrders, order.id]);
                                    } else {
                                      setSelectedOrders(selectedOrders.filter(oid => oid !== order.id));
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-gray-300"
                                />
                              )}
                              <div className="flex items-center gap-2">
                                <span className="text-md font-semibold text-primary-700">
                                  {order.test_name}
                                </span>
                                {order.test_code && <span className="text-sm text-gray-500">({order.test_code})</span>}
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(order.status)}`}>
                                {order.status.replace('_', ' ').toUpperCase()}
                              </span>
                              {order.specimen_id && (
                                <span className="text-xs text-gray-500">Specimen: {order.specimen_id}</span>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4">
                              {order.status === 'pending' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'in_progress'); }}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                                >
                                  Start Processing
                                </button>
                              )}
                              {order.status === 'in_progress' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openResultModal(order); }}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-success-600 rounded-lg hover:bg-success-700"
                                >
                                  Enter Results
                                </button>
                              )}
                              {order.status === 'completed' && order.result_document_id && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); viewLabResultFile(order.result_document_id as number); }}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1"
                                  title={order.result_document_name || 'View uploaded file'}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  View File
                                </button>
                              )}
                              {order.status === 'completed' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openResultModal(order); }}
                                  className="px-3 py-1.5 text-xs font-medium text-warning-700 bg-warning-100 rounded-lg hover:bg-warning-200 flex items-center gap-1"
                                  title="Re-enter or re-upload the result"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Edit / Re-upload
                                </button>
                              )}
                              {order.status === 'completed' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteLabResult(order); }}
                                  className="px-3 py-1.5 text-xs font-medium text-danger-700 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100 flex items-center gap-1"
                                  title="Clear the result (e.g. attached to wrong patient) — requires a reason and is audit-logged"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                                  </svg>
                                  Delete Result
                                </button>
                              )}
                              {order.status === 'completed' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); printLabReport(order); }}
                                  className="px-3 py-1.5 text-xs font-medium text-success-700 bg-success-100 rounded-lg hover:bg-success-200 flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                  </svg>
                                  Print
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Inline results for completed orders */}
                          {order.status === 'completed' && order.results && order.results.trim() && (
                            <div className="mt-2 p-3 bg-success-50 rounded border border-success-200 ml-7">
                              <div className="text-xs font-bold text-success-800 mb-1">Results:</div>
                              {renderResultPayload(order.results, { compact: true })}
                            </div>
                          )}
                          {/* Attached file indicator — lab tech can verify what they uploaded */}
                          {order.status === 'completed' && order.result_document_id && (
                            <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200 ml-7 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-sm text-blue-900 min-w-0">
                                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="truncate">
                                  <span className="font-medium">Attached file: </span>{order.result_document_name || 'lab result'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); viewLabResultFile(order.result_document_id as number); }}
                                className="flex-shrink-0 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700"
                              >
                                View
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

              {/* Right: Patient Details Panel */}
              <div className="w-80 bg-white rounded-xl shadow-lg border border-gray-200 flex-shrink-0">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold">Patient Details</h2>
                </div>
                {selectedOrderForDetails ? (
                  <div className="p-6 space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto">
                    {/* Patient Info */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">
                        Patient
                      </h3>
                      <div className="bg-gray-50 rounded p-3 space-y-2">
                        <div className="font-semibold text-gray-900">{selectedOrderForDetails.patient_name}</div>
                        <div className="text-sm text-gray-600">{selectedOrderForDetails.patient_number}</div>
                        {patientDOB && (
                          <div className="text-sm text-gray-600">
                            DOB: {new Date(patientDOB).toLocaleDateString()}{' '}
                            <span className="text-gray-500">
                              ({Math.floor((Date.now() - new Date(patientDOB).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} yrs)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Current Test */}
                    <div>
                      <h3 className="text-sm font-semibold text-primary-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Current Test
                      </h3>
                      <div className="bg-primary-50 rounded p-3 border border-primary-200">
                        <div className="font-semibold text-primary-900">{selectedOrderForDetails.test_name}</div>
                        {selectedOrderForDetails.test_code && (
                          <div className="text-sm text-primary-600 mt-1">Code: {selectedOrderForDetails.test_code}</div>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                            selectedOrderForDetails.priority === 'stat' ? 'bg-danger-100 text-danger-700' :
                            selectedOrderForDetails.priority === 'urgent' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {selectedOrderForDetails.priority.toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                            selectedOrderForDetails.status === 'completed' ? 'bg-success-100 text-success-700' :
                            selectedOrderForDetails.status === 'in_progress' ? 'bg-primary-100 text-primary-700' :
                            'bg-warning-100 text-warning-700'
                          }`}>
                            {selectedOrderForDetails.status.replace('_', ' ').toUpperCase()}
                          </span>
                          {selectedOrderForDetails.verification_status === 'pending' && (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-warning-100 text-warning-700">
                              PENDING REVIEW
                            </span>
                          )}
                          {selectedOrderForDetails.verification_status === 'rejected' && (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-danger-100 text-danger-700">
                              SENT BACK
                            </span>
                          )}
                        </div>
                        {/* Provenance: who entered, who verified. Helps the
                            doctor (and audit) see the peer review trail at a
                            glance without opening the audit log. */}
                        {(selectedOrderForDetails.entered_by_name || selectedOrderForDetails.verified_by_name) && (
                          <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                            {selectedOrderForDetails.entered_by_name && (
                              <div>Entered by {selectedOrderForDetails.entered_by_name}</div>
                            )}
                            {selectedOrderForDetails.verified_by_name && (
                              <div>
                                Verified by {selectedOrderForDetails.verified_by_name}
                                {selectedOrderForDetails.verified_at && (
                                  <> · {new Date(selectedOrderForDetails.verified_at).toLocaleString()}</>
                                )}
                              </div>
                            )}
                            {selectedOrderForDetails.verification_status === 'rejected' &&
                              selectedOrderForDetails.rejection_reason && (
                                <div className="text-warning-700">
                                  Reason for send-back: {selectedOrderForDetails.rejection_reason}
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Allergies */}
                    <div>
                      <h3 className="text-sm font-semibold text-danger-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Allergies
                      </h3>
                      {patientAllergies.length > 0 ? (
                        <div className="space-y-2">
                          {patientAllergies.map((allergy: any, idx: number) => (
                            <div key={idx} className="p-2 bg-danger-50 border border-danger-200 rounded text-sm">
                              <span className="font-medium text-danger-700">{allergy.allergen || allergy}</span>
                              {allergy.reaction && (
                                <span className="text-danger-600 ml-2">- {allergy.reaction}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No known allergies</p>
                      )}
                    </div>

                    {/* Diagnoses */}
                    <div>
                      <h3 className="text-sm font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Diagnoses
                      </h3>
                      {patientDiagnoses.length > 0 ? (
                        <div className="space-y-2">
                          {patientDiagnoses.map((dx: any, idx: number) => (
                            <div key={idx} className="p-2 bg-purple-50 border border-purple-200 rounded text-sm">
                              <span className="font-medium text-purple-700">{dx.diagnosis_description || dx.diagnosis_name || dx.name || String(dx)}</span>
                              {(dx.diagnosis_code || dx.icd_code) && (
                                <span className="text-purple-600 ml-2 text-xs">({dx.diagnosis_code || dx.icd_code})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : encounterDetails?.chief_complaint ? (
                        <div className="space-y-2">
                          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                            <div className="text-xs font-semibold text-yellow-600 uppercase mb-1">Presumptive / Chief Complaint</div>
                            <span className="font-medium text-yellow-800">{encounterDetails.chief_complaint}</span>
                          </div>
                          {encounterDetails?.assessment && (
                            <div className="p-2 bg-purple-50 border border-purple-200 rounded text-sm">
                              <div className="text-xs font-semibold text-purple-600 uppercase mb-1">Assessment</div>
                              <span className="font-medium text-purple-700">{encounterDetails.assessment}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No diagnoses recorded</p>
                      )}
                    </div>

                    {/* Recent Lab History */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Recent Lab History
                      </h3>
                      {patientLabHistory.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {patientLabHistory.slice(0, 5).map((lab: any, idx: number) => (
                            <div key={idx} className="p-2 bg-gray-50 border border-gray-200 rounded text-sm">
                              <div className="font-medium text-gray-700">{lab.test_name}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {new Date(lab.ordered_at).toLocaleDateString()} -
                                <span className={`ml-1 ${lab.status === 'completed' ? 'text-success-600' : 'text-warning-600'}`}>
                                  {lab.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No previous lab orders</p>
                      )}
                    </div>

                    {/* View Full Profile Button */}
                    <button
                      onClick={() => {
                        setSelectedPatientId(selectedOrderForDetails.patient_id);
                        setShowPatientQuickView(true);
                      }}
                      className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                    >
                      View Full Patient Profile
                    </button>
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p>Select an order to view patient details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Verification Tab — peer-review queue */}
        {activeTab === 'verification' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Results awaiting verification</h2>
                <p className="text-xs text-gray-500 mt-1">
                  These results have been entered by another lab tech and are waiting for a peer review before the doctor can see them.
                </p>
              </div>
              <button
                onClick={fetchPendingVerification}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
              >
                Refresh
              </button>
            </div>
            {pendingVerification.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-medium">All caught up</p>
                <p className="text-sm mt-1">No results are waiting on you. Nice.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {pendingVerification.map((order) => {
                  const assignedToMe =
                    currentUser?.id != null && order.assigned_reviewer_id === currentUser.id;
                  return (
                    <div key={order.id} className="p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">{order.test_name}</span>
                            {order.priority === 'stat' && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-danger-100 text-danger-700 font-bold uppercase">
                                STAT
                              </span>
                            )}
                            {order.priority === 'urgent' && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-warning-100 text-warning-700 font-bold uppercase">
                                Urgent
                              </span>
                            )}
                            {assignedToMe && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 text-primary-700 font-semibold">
                                Assigned to you
                              </span>
                            )}
                            {(order.rejection_count || 0) > 0 && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-warning-50 text-warning-700">
                                Resubmitted ({order.rejection_count}×)
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {order.patient_name} · {order.patient_number}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Entered by {order.entered_by_name || 'unknown'} · Assigned to{' '}
                            {order.assigned_reviewer_name || 'anyone'}
                          </div>
                          {order.results && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                              {renderResultPayload(order.results, { compact: true })}
                            </div>
                          )}
                          {order.result_document_id && (
                            <a
                              href={`/api/documents/${order.result_document_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block mt-2 text-sm text-primary-600 hover:underline"
                            >
                              View attached document ({order.result_document_name || 'file'})
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => setVerifyingOrder(order)}
                            className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 text-sm font-medium"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => setRejectingOrder(order)}
                            className="px-4 py-2 bg-white border border-danger-300 text-danger-700 rounded-lg hover:bg-danger-50 text-sm font-medium"
                          >
                            Send back
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div>
            {/* Inventory Stats */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Total Items</div>
                <div className="text-2xl font-bold text-gray-700 mt-1">{inventoryStats?.total_items || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 cursor-pointer hover:bg-warning-50" onClick={() => setInventoryStatusFilter('low_stock')}>
                <div className="text-xs font-medium text-gray-500 uppercase">Low Stock</div>
                <div className="text-2xl font-bold text-warning-600 mt-1">{inventoryStats?.low_stock_count || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 cursor-pointer hover:bg-orange-50" onClick={() => setInventoryStatusFilter('expiring')}>
                <div className="text-xs font-medium text-gray-500 uppercase">Expiring Soon</div>
                <div className="text-2xl font-bold text-orange-600 mt-1">{inventoryStats?.expiring_soon_count || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Calibration Due</div>
                <div className="text-2xl font-bold text-danger-600 mt-1">{inventoryStats?.calibration_due_count || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Stock Value</div>
                <div className="text-2xl font-bold text-success-600 mt-1">${typeof inventoryStats?.total_stock_value === 'number' ? inventoryStats.total_stock_value.toFixed(2) : parseFloat(inventoryStats?.total_stock_value || '0').toFixed(2)}</div>
              </div>
            </div>

            {/* Inventory Filters */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input
                  type="text"
                  placeholder="Search items..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <AppSelect
                  value={inventoryTypeFilter}
                  onChange={(val) => setInventoryTypeFilter(val)}
                  options={[
                    { value: 'reagent', label: 'Reagents' },
                    { value: 'supply', label: 'Supplies' },
                    { value: 'equipment', label: 'Equipment' },
                  ]}
                  placeholder="All Types"
                />
                <AppSelect
                  value={inventoryStatusFilter}
                  onChange={(val) => setInventoryStatusFilter(val)}
                  options={[
                    { value: 'low_stock', label: 'Low Stock Only' },
                    { value: 'expiring', label: 'Expiring Soon' },
                  ]}
                  placeholder="All Status"
                />
                <button
                  onClick={() => {
                    setInventorySearch('');
                    setInventoryTypeFilter('');
                    setInventoryStatusFilter('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear Filters
                </button>
                <button
                  onClick={() => {
                    resetInventoryForm();
                    setShowInventoryModal(true);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  + Add Item
                </button>
              </div>
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reorder</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lot #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inventory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{item.item_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.item_type === 'reagent' ? 'bg-secondary-100 text-secondary-800' :
                          item.item_type === 'supply' ? 'bg-primary-100 text-primary-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {item.item_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.category}</td>
                      <td className={`px-6 py-4 whitespace-nowrap font-bold ${item.is_low_stock ? 'text-danger-600' : 'text-gray-900'}`}>
                        {item.quantity_on_hand} {item.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.reorder_level}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.lot_number || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1 flex-wrap">
                          {item.is_low_stock && <span className="px-2 py-1 text-xs bg-danger-100 text-danger-800 rounded-full">Low</span>}
                          {item.is_expiring_soon && <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">Expiring</span>}
                          {item.is_calibration_due && <span className="px-2 py-1 text-xs bg-secondary-100 text-secondary-800 rounded-full">Cal Due</span>}
                          {!item.is_low_stock && !item.is_expiring_soon && !item.is_calibration_due && (
                            <span className="px-2 py-1 text-xs bg-success-100 text-success-800 rounded-full">OK</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditInventory(item)}
                            className="text-primary-600 hover:text-primary-800"
                            title="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setShowAdjustStockModal(true);
                            }}
                            className="text-success-600 hover:text-success-800"
                            title="Adjust Stock"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </button>
                          {item.item_type === 'equipment' && (
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setCalibrationForm({
                                  next_calibration_date: '',
                                  notes: '',
                                });
                                setShowCalibrationModal(true);
                              }}
                              className="text-secondary-600 hover:text-secondary-800"
                              title="Record Calibration"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inventory.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-500">No inventory items found</div>
              )}
            </div>
          </div>
        )}

        {/* Test Catalog Tab */}
        {activeTab === 'catalog' && (
          <div>
            {/* Catalog Filters */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder="Search tests..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <AppSelect
                  value={catalogCategory}
                  onChange={(val) => setCatalogCategory(val)}
                  options={catalogCategories.map(cat => ({ value: cat, label: cat }))}
                  placeholder="All Categories"
                />
                <button
                  onClick={() => {
                    setCatalogSearch('');
                    setCatalogCategory('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear Filters
                </button>
                <button
                  onClick={() => {
                    resetTestForm();
                    setShowTestModal(true);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  + Add Test
                </button>
              </div>
            </div>

            {/* Test Catalog Table */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specimen</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">TAT</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Normal Range</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Critical Range</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {testCatalog.map((test) => (
                    <tr key={test.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-mono font-bold text-primary-600">{test.test_code}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{test.test_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{test.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{test.specimen_type}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{test.turnaround_time_hours}h</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {test.normal_range_low !== null && test.normal_range_high !== null
                          ? `${test.normal_range_low} - ${test.normal_range_high} ${test.unit || ''}`
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {test.critical_low !== null || test.critical_high !== null ? (
                          <span className="text-danger-600 font-medium">
                            {test.critical_low !== null && `<${test.critical_low}`}
                            {test.critical_low !== null && test.critical_high !== null && ' / '}
                            {test.critical_high !== null && `>${test.critical_high}`}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">GHS {(Number(test.base_price) || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => openEditTest(test)}
                          className="text-primary-600 hover:text-primary-800"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {testCatalog.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-500">No tests found</div>
              )}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div>
            {/* Date Filter */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-6">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                  <input
                    type="date"
                    value={analyticsStartDate}
                    onChange={(e) => setAnalyticsStartDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                  <input
                    type="date"
                    value={analyticsEndDate}
                    onChange={(e) => setAnalyticsEndDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={fetchAnalytics}
                    className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Generate Report
                  </button>
                </div>
                <div className="flex-1" />
                <div className="flex items-end gap-2">
                  <div className="relative group">
                    <button
                      className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export CSV
                    </button>
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 hidden group-hover:block z-10">
                      <button onClick={() => exportAnalytics('summary')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">Summary Report</button>
                      <button onClick={() => exportAnalytics('tests')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">All Tests</button>
                      <button onClick={() => exportAnalytics('tat')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">TAT Report</button>
                      <button onClick={() => exportAnalytics('volume')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">Volume Report</button>
                      <button onClick={() => exportAnalytics('critical')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">Critical Results</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Analytics Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Total Tests</div>
                <div className="text-2xl font-bold text-gray-700 mt-1">{analytics?.totals?.total_tests || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Avg TAT</div>
                <div className="text-2xl font-bold text-secondary-600 mt-1">
                  {formatTAT(analytics?.turnaround_time?.average_tat_hours || null)}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">STAT Tests</div>
                <div className="text-2xl font-bold text-danger-600 mt-1">{analytics?.totals?.stat_tests || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Critical Results</div>
                <div className="text-2xl font-bold text-danger-600 mt-1">{analytics?.critical_results?.total_critical || 0}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TAT by Priority */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Turnaround Time by Priority</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-danger-600">STAT</span>
                    <span className="text-gray-900">{formatTAT(analytics?.turnaround_time?.stat_tat_hours || null)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-warning-600">Urgent</span>
                    <span className="text-gray-900">{formatTAT(analytics?.turnaround_time?.urgent_tat_hours || null)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-600">Routine</span>
                    <span className="text-gray-900">{formatTAT(analytics?.turnaround_time?.routine_tat_hours || null)}</span>
                  </div>
                </div>
              </div>

              {/* Test Volume by Category */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Test Volume by Category</h3>
                <div className="space-y-2">
                  {testVolumeData.slice(0, 6).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="text-gray-600">{item.category}</span>
                      <span className="font-bold text-gray-900">{item.test_count}</span>
                    </div>
                  ))}
                  {testVolumeData.length === 0 && (
                    <p className="text-gray-500 text-center">No data available</p>
                  )}
                </div>
              </div>

              {/* Top Tests */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 lg:col-span-2">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Top 10 Most Ordered Tests</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-gray-600 font-medium">Test Name</th>
                        <th className="text-right py-2 text-gray-600 font-medium">Order Count</th>
                        <th className="text-right py-2 text-gray-600 font-medium">Completed</th>
                        <th className="text-right py-2 text-gray-600 font-medium">Avg TAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topTests.map((test: any, idx: number) => (
                        <tr key={idx} className="border-b">
                          <td className="py-2 text-gray-900">{test.test_name}</td>
                          <td className="py-2 text-right font-bold text-gray-900">{test.order_count}</td>
                          <td className="py-2 text-right text-gray-600">{test.completed_count}</td>
                          <td className="py-2 text-right text-gray-600">{formatTAT(test.avg_tat_hours)}</td>
                        </tr>
                      ))}
                      {topTests.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-gray-500">No data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Critical Alerts Tab */}
        {activeTab === 'alerts' && (
          <div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-danger-50 to-orange-50 rounded-t-xl">
                <h2 className="text-xl font-bold text-gray-900">Critical Result Alerts</h2>
                <p className="text-sm text-gray-600 mt-1">Results requiring immediate physician review</p>
              </div>
              <div className="divide-y divide-gray-200">
                {criticalAlerts.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">No critical alerts</p>
                  </div>
                ) : (
                  criticalAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`px-6 py-4 ${!alert.is_acknowledged ? 'bg-danger-50' : 'bg-gray-50'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-lg font-bold text-gray-900">{alert.patient_name}</span>
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                              alert.alert_type === 'critical_high' ? 'bg-danger-600 text-white' :
                              alert.alert_type === 'critical_low' ? 'bg-primary-600 text-white' :
                              'bg-secondary-600 text-white'
                            }`}>
                              {alert.alert_type.replace('_', ' ').toUpperCase()}
                            </span>
                            {alert.is_acknowledged && (
                              <span className="px-2 py-1 text-xs bg-success-100 text-success-800 rounded-full">
                                ACKNOWLEDGED
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-semibold">Test:</span> {alert.test_name}
                            <span className="mx-2">|</span>
                            <span className="font-semibold">Result:</span> <span className="text-danger-600 font-bold">{alert.result_value}</span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            <span>Ordering Physician: {alert.ordering_provider_name}</span>
                            {alert.room_number && <span className="ml-4">Room: {alert.room_number}</span>}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Created: {new Date(alert.created_at).toLocaleString()}
                            {alert.is_acknowledged && alert.acknowledged_by_name && (
                              <span className="ml-4">Acknowledged by: {alert.acknowledged_by_name}</span>
                            )}
                          </div>
                        </div>
                        <div>
                          {!alert.is_acknowledged && (
                            <button
                              onClick={() => acknowledgeAlert(alert.id)}
                              className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors"
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quality Control Tab */}
        {activeTab === 'qc' && (
          <div>
            {/* QC Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Total QC Runs</div>
                <div className="text-2xl font-bold text-gray-700 mt-1">{qcSummary?.total_qc_runs || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Within Limits</div>
                <div className="text-2xl font-bold text-success-600 mt-1">{qcSummary?.within_limits || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Out of Limits</div>
                <div className="text-2xl font-bold text-danger-600 mt-1">{qcSummary?.out_of_limits || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Tests with QC</div>
                <div className="text-2xl font-bold text-primary-600 mt-1">{qcSummary?.tests_with_qc || 0}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Levey-Jennings Chart */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Levey-Jennings Chart</h3>
                  <AppSelect
                    value={selectedQCTest}
                    onChange={(val) => setSelectedQCTest(val)}
                    options={qcAvailableTests.map(test => ({ value: test.test_code, label: `${test.test_code} - ${test.test_name}` }))}
                    placeholder="Select Test"
                  />
                </div>

                {leveyJenningsData ? (
                  <div className="relative h-64 bg-gray-50 rounded-lg p-4">
                    {/* Simple Levey-Jennings visualization */}
                    <div className="h-full flex flex-col justify-between relative">
                      {/* Y-axis labels */}
                      <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between text-xs text-gray-500">
                        <span>+3SD ({Number(leveyJenningsData.upper_limit_3sd).toFixed(1)})</span>
                        <span>+2SD ({Number(leveyJenningsData.upper_limit_2sd).toFixed(1)})</span>
                        <span>Target ({Number(leveyJenningsData.target_value).toFixed(1)})</span>
                        <span>-2SD ({Number(leveyJenningsData.lower_limit_2sd).toFixed(1)})</span>
                        <span>-3SD ({Number(leveyJenningsData.lower_limit_3sd).toFixed(1)})</span>
                      </div>

                      {/* Chart area */}
                      <div className="ml-20 h-full relative border border-gray-200 bg-white rounded">
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex flex-col justify-between">
                          <div className="border-b border-danger-300 border-dashed" style={{ height: '10%' }}></div>
                          <div className="border-b border-orange-300 border-dashed" style={{ height: '20%' }}></div>
                          <div className="border-b border-success-500" style={{ height: '40%' }}></div>
                          <div className="border-b border-orange-300 border-dashed" style={{ height: '20%' }}></div>
                          <div style={{ height: '10%' }}></div>
                        </div>

                        {/* Data points */}
                        <div className="absolute inset-0 flex items-end justify-around px-2">
                          {leveyJenningsData.data_points.slice(-20).map((point) => {
                            const upper3sd = Number(leveyJenningsData.upper_limit_3sd);
                            const lower3sd = Number(leveyJenningsData.lower_limit_3sd);
                            const pointValue = Number(point.value);
                            const range = upper3sd - lower3sd;
                            const percentFromBottom = ((pointValue - lower3sd) / range) * 100;
                            const clampedPercent = Math.max(5, Math.min(95, percentFromBottom));

                            return (
                              <div
                                key={point.id}
                                className="relative group"
                                style={{ height: `${clampedPercent}%` }}
                              >
                                <div
                                  className={`w-3 h-3 rounded-full ${point.is_within_limits ? 'bg-primary-600' : 'bg-danger-600'}`}
                                />
                                {/* Tooltip */}
                                <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10">
                                  {pointValue.toFixed(2)} - {new Date(point.date).toLocaleDateString()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex gap-4 mt-2 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-primary-600"></div>
                        <span>Within limits</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-danger-600"></div>
                        <span>Out of limits</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500">
                    Select a test to view Levey-Jennings chart
                  </div>
                )}
              </div>

              {/* Record QC Result */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Record QC Result</h3>
                  <button
                    onClick={() => setShowQCModal(true)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    + New QC Entry
                  </button>
                </div>

                {/* Recent QC Results */}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {qcResults.slice(0, 10).map((result) => (
                    <div
                      key={result.id}
                      className={`p-3 rounded-lg border ${result.is_within_limits ? 'bg-success-50 border-success-200' : 'bg-danger-50 border-danger-200'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-mono font-bold text-primary-600">{result.test_code}</span>
                          <span className="ml-2 text-gray-600">{result.control_level}</span>
                        </div>
                        <span className={`text-sm font-bold ${result.is_within_limits ? 'text-success-600' : 'text-danger-600'}`}>
                          {result.measured_value} {result.unit}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Target: {result.target_value} | SD: {result.standard_deviation} | {new Date(result.performed_at).toLocaleString()}
                      </div>
                      {result.performed_by_name && (
                        <div className="text-xs text-gray-400">By: {result.performed_by_name}</div>
                      )}
                    </div>
                  ))}
                  {qcResults.length === 0 && (
                    <div className="text-center text-gray-500 py-4">No QC results recorded</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Add Tests Modal for Walk-in Patients */}
      {addTestsWalkin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setAddTestsWalkin(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 rounded-t-xl">
              <h3 className="text-lg font-bold text-gray-900">Add Lab Tests</h3>
              <p className="text-sm text-gray-600 mt-0.5">{addTestsWalkin.patient_name} — {addTestsWalkin.encounter_number}</p>
            </div>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {/* Add test form */}
              <div className="space-y-3">
                <AutocompleteInput
                  value={walkinTestName}
                  onChange={(value) => setWalkinTestName(value)}
                  sectionId="lab_tests"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 bg-white"
                  placeholder="Test name (e.g., CBC, FBS, Urinalysis)"
                />
                <div className="grid grid-cols-2 gap-3">
                  <PrioritySelect
                    value={walkinPriority}
                    onChange={(val) => setWalkinPriority(val)}
                    showScheduled={false}
                  />
                  <FrequencySelect
                    value={walkinFrequency}
                    onChange={(val) => setWalkinFrequency(val)}
                  />
                </div>
                <input
                  type="text"
                  value={walkinNotes}
                  onChange={(e) => setWalkinNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={() => {
                    if (!walkinTestName.trim()) return;
                    const freq = walkinFrequency;
                    const freqLabel = freq === 'once' ? '' : freq === 'daily' ? 'Daily' : freq === 'weekly' ? 'Weekly' : freq === 'custom' ? 'Custom' : `Q${freq.toUpperCase()}`;
                    setWalkinTests([...walkinTests, {
                      test_name: walkinTestName.trim(),
                      priority: walkinPriority,
                      notes: walkinNotes + (freqLabel ? ` | Frequency: ${freqLabel}` : ''),
                      frequency: freq,
                    }]);
                    setWalkinTestName('');
                    setWalkinNotes('');
                    setWalkinFrequency('once');
                  }}
                  className="w-full px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add to List
                </button>
              </div>

              {/* Staged tests */}
              {walkinTests.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {walkinTests.map((test, idx) => (
                    <div key={idx} className="px-4 py-2.5 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-gray-900 text-sm">{test.test_name}</span>
                        {test.frequency && test.frequency !== 'once' && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-secondary-100 text-secondary-700">
                            {test.frequency === 'daily' ? 'Daily' : test.frequency === 'weekly' ? 'Weekly' : `Q${test.frequency.toUpperCase()}`}
                          </span>
                        )}
                        <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded ${
                          test.priority === 'stat' ? 'bg-danger-100 text-danger-700' :
                          test.priority === 'urgent' ? 'bg-warning-100 text-warning-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{test.priority.toUpperCase()}</span>
                      </div>
                      <button
                        onClick={() => setWalkinTests(walkinTests.filter((_, i) => i !== idx))}
                        className="text-gray-400 hover:text-danger-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-between items-center">
              <span className="text-sm text-gray-500">{walkinTests.length} test(s) staged</span>
              <div className="flex gap-2">
                <button onClick={() => setAddTestsWalkin(null)} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg text-sm">Cancel</button>
                <button
                  onClick={handleSubmitWalkinTests}
                  disabled={walkinTests.length === 0 || submittingWalkinTests}
                  className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50"
                >
                  {submittingWalkinTests ? 'Creating...' : `Create ${walkinTests.length} Order(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patient Quick View Modal */}
      {showPatientQuickView && selectedPatientId && (
        <PatientQuickView
          patientId={selectedPatientId}
          onClose={() => setShowPatientQuickView(false)}
        />
      )}

      {/* Inventory Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">
                {editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={inventoryForm.item_name}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, item_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <AppSelect
                    label="Type *"
                    value={inventoryForm.item_type}
                    onChange={(val) => setInventoryForm({ ...inventoryForm, item_type: val })}
                    options={[
                      { value: 'reagent', label: 'Reagent' },
                      { value: 'supply', label: 'Supply' },
                      { value: 'equipment', label: 'Equipment' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={inventoryForm.category}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <input
                    type="text"
                    value={inventoryForm.unit}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, unit: e.target.value })}
                    placeholder="e.g., test, ml, piece"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Quantity</label>
                  <input
                    type="number"
                    value={inventoryForm.quantity_on_hand}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, quantity_on_hand: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    disabled={!!editingItem}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                  <input
                    type="number"
                    value={inventoryForm.reorder_level}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, reorder_level: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={inventoryForm.unit_cost}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, unit_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={inventoryForm.expiry_date}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, expiry_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number</label>
                  <input
                    type="text"
                    value={inventoryForm.lot_number}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, lot_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={inventoryForm.supplier}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, supplier: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Storage Location</label>
                  <input
                    type="text"
                    value={inventoryForm.storage_location}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, storage_location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <AppSelect
                    label="Storage Conditions"
                    value={inventoryForm.storage_conditions}
                    onChange={(val) => setInventoryForm({ ...inventoryForm, storage_conditions: val })}
                    options={[
                      { value: 'room_temp', label: 'Room Temperature' },
                      { value: 'refrigerated', label: 'Refrigerated (2-8°C)' },
                      { value: 'frozen', label: 'Frozen (-20°C)' },
                      { value: 'deep_frozen', label: 'Deep Frozen (-80°C)' },
                    ]}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowInventoryModal(false);
                  resetInventoryForm();
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveInventoryItem}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                {editingItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustStockModal && editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Adjust Stock</h2>
              <p className="text-sm text-gray-600">{editingItem.item_name}</p>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600">Current Stock: <span className="font-bold">{editingItem.quantity_on_hand} {editingItem.unit}</span></p>
              </div>
              <div className="mb-4">
                <AppSelect
                  label="Adjustment Type"
                  value={adjustStockForm.transaction_type}
                  onChange={(val) => setAdjustStockForm({ ...adjustStockForm, transaction_type: val })}
                  options={[
                    { value: 'purchase', label: 'Purchase (Add Stock)' },
                    { value: 'adjustment', label: 'Adjustment' },
                    { value: 'expired', label: 'Expired (Remove)' },
                    { value: 'transfer', label: 'Transfer' },
                  ]}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (+ to add, - to remove)</label>
                <input
                  type="number"
                  value={adjustStockForm.adjustment}
                  onChange={(e) => setAdjustStockForm({ ...adjustStockForm, adjustment: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={adjustStockForm.notes}
                  onChange={(e) => setAdjustStockForm({ ...adjustStockForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={2}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAdjustStockModal(false);
                  setAdjustStockForm({ adjustment: 0, transaction_type: 'adjustment', notes: '' });
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={adjustStock}
                className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700"
              >
                Adjust Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calibration Modal */}
      {showCalibrationModal && editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Record Calibration</h2>
              <p className="text-sm text-gray-600">{editingItem.item_name}</p>
            </div>
            <div className="p-6">
              {editingItem.last_calibration_date && (
                <div className="mb-4">
                  <p className="text-sm text-gray-600">
                    Last Calibration: <span className="font-bold">{new Date(editingItem.last_calibration_date).toLocaleDateString()}</span>
                  </p>
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Next Calibration Date *</label>
                <input
                  type="date"
                  value={calibrationForm.next_calibration_date}
                  onChange={(e) => setCalibrationForm({ ...calibrationForm, next_calibration_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={calibrationForm.notes}
                  onChange={(e) => setCalibrationForm({ ...calibrationForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={2}
                  placeholder="Calibration details, technician name, etc."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCalibrationModal(false);
                  setCalibrationForm({ next_calibration_date: '', notes: '' });
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={recordCalibration}
                className="px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700"
              >
                Record Calibration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Catalog Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTest ? 'Edit Test' : 'Add New Test'}
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Code *</label>
                  <input
                    type="text"
                    value={testForm.test_code}
                    onChange={(e) => setTestForm({ ...testForm, test_code: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono"
                    placeholder="e.g., CBC, HB, GLU"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Name *</label>
                  <input
                    type="text"
                    value={testForm.test_name}
                    onChange={(e) => setTestForm({ ...testForm, test_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={testForm.category}
                    onChange={(e) => setTestForm({ ...testForm, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g., Hematology, Chemistry"
                  />
                </div>
                <div>
                  <AppSelect
                    label="Specimen Type"
                    value={testForm.specimen_type}
                    onChange={(val) => setTestForm({ ...testForm, specimen_type: val })}
                    options={[
                      { value: 'blood', label: 'Blood' },
                      { value: 'urine', label: 'Urine' },
                      { value: 'stool', label: 'Stool' },
                      { value: 'swab', label: 'Swab' },
                      { value: 'csf', label: 'CSF' },
                      { value: 'tissue', label: 'Tissue' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">TAT (hours)</label>
                  <input
                    type="number"
                    value={testForm.turnaround_time_hours}
                    onChange={(e) => setTestForm({ ...testForm, turnaround_time_hours: parseInt(e.target.value) || 24 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Price (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.base_price}
                    onChange={(e) => setTestForm({ ...testForm, base_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={testForm.unit}
                    onChange={(e) => setTestForm({ ...testForm, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g., g/dL, mmol/L"
                  />
                </div>
                <div className="col-span-2 border-t pt-4 mt-2">
                  <h3 className="font-medium text-gray-900 mb-3">Reference Ranges</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Normal Range Low</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.normal_range_low}
                    onChange={(e) => setTestForm({ ...testForm, normal_range_low: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Normal Range High</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.normal_range_high}
                    onChange={(e) => setTestForm({ ...testForm, normal_range_high: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-danger-700 mb-1">Critical Low</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.critical_low}
                    onChange={(e) => setTestForm({ ...testForm, critical_low: e.target.value })}
                    className="w-full px-4 py-2 border border-danger-300 rounded-lg focus:ring-2 focus:ring-danger-500 bg-danger-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-danger-700 mb-1">Critical High</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.critical_high}
                    onChange={(e) => setTestForm({ ...testForm, critical_high: e.target.value })}
                    className="w-full px-4 py-2 border border-danger-300 rounded-lg focus:ring-2 focus:ring-danger-500 bg-danger-50"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowTestModal(false);
                  resetTestForm();
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveTest}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                {editingTest ? 'Update Test' : 'Add Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Structured Result Entry Modal */}
      {showResultModal && selectedOrderForResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`bg-white rounded-xl shadow-2xl w-full ${templateParams.length > 0 ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-success-50 to-success-50 rounded-t-xl">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Enter Test Results</h2>
                  <p className="text-sm text-gray-600">{selectedOrderForResult.patient_name} - {selectedOrderForResult.test_name}</p>
                </div>
                {selectedOrderForResult.path_no && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase">Path No</div>
                    <div className="text-lg font-mono font-bold text-primary-700">{selectedOrderForResult.path_no}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              {/* Structured template form (multi-row) */}
              {templateParams.length > 0 && (() => {
                // Group parameters by section_label for visual hierarchy
                const sections: Array<{ label: string | null; rows: ParameterDef[] }> = [];
                templateParams.forEach((p) => {
                  const lastSection = sections[sections.length - 1];
                  if (!lastSection || lastSection.label !== (p.section_label || null)) {
                    sections.push({ label: p.section_label || null, rows: [p] });
                  } else {
                    lastSection.rows.push(p);
                  }
                });
                return (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-2">
                      Structured entry — flags show next to each value as you type.
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-700">Parameter</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-700 w-40">Value</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-700 w-24">Unit</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-700 w-24">Flag</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-700">Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sections.map((section, sIdx) => (
                            <React.Fragment key={`section-${sIdx}`}>
                              {section.label && (
                                <tr className="bg-gray-50 border-t border-gray-200">
                                  <td colSpan={5} className="px-3 py-1 text-xs font-bold text-gray-600 uppercase">
                                    {section.label}
                                  </td>
                                </tr>
                              )}
                              {section.rows.map((p) => {
                                const key = p.parameter_code || p.parameter_name;
                                const value = templateValues[key] || '';
                                const flag = classifyValue(p, value);
                                const flagClass =
                                  flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH'
                                    ? 'bg-danger-100 text-danger-700 font-bold'
                                    : flag === 'LOW' || flag === 'HIGH'
                                    ? 'bg-warning-100 text-warning-700 font-semibold'
                                    : flag === 'NORMAL'
                                    ? 'text-success-700'
                                    : 'text-gray-400';
                                const flagLabel =
                                  flag === 'CRITICAL_LOW' ? 'CRIT-LOW'
                                  : flag === 'CRITICAL_HIGH' ? 'CRIT-HIGH'
                                  : flag === 'LOW' ? 'LOW'
                                  : flag === 'HIGH' ? 'HIGH'
                                  : flag === 'NORMAL' ? '—'
                                  : '';

                                return (
                                  <tr key={p.id} className="border-t border-gray-200 hover:bg-gray-50">
                                    <td className="px-3 py-2">{p.parameter_name}</td>
                                    <td className="px-3 py-2">
                                      {p.value_type === 'qualitative' && p.qualitative_options ? (
                                        <AppSelect
                                          value={value}
                                          onChange={(val) =>
                                            setTemplateValues({ ...templateValues, [key]: val })
                                          }
                                          options={p.qualitative_options.split('|').map((opt) => ({ value: opt, label: opt }))}
                                          placeholder="—"
                                        />
                                      ) : (
                                        <input
                                          type={p.value_type === 'numeric' ? 'text' : 'text'}
                                          inputMode={p.value_type === 'numeric' ? 'decimal' : 'text'}
                                          value={value}
                                          onChange={(e) =>
                                            setTemplateValues({ ...templateValues, [key]: e.target.value })
                                          }
                                          className="w-full px-2 py-1 border border-gray-300 rounded font-mono"
                                          placeholder={p.value_type === 'numeric' ? '0.0' : ''}
                                        />
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{p.unit || ''}</td>
                                    <td className={`px-3 py-2 ${flagClass}`}>{flagLabel}</td>
                                    <td className="px-3 py-2 text-gray-500 text-xs">
                                      {formatReference(p)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Remarks / Comments</label>
                      <textarea
                        value={templateNotes}
                        onChange={(e) => setTemplateNotes(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Methodology notes, observations, lot numbers, etc."
                      />
                    </div>
                  </div>
                );
              })()}

              {templateLoading && templateParams.length === 0 && (
                <div className="mb-4 text-sm text-gray-500">Looking up template…</div>
              )}

              {/* Legacy single-value form — only when no structured template */}
              {!templateLoading && templateParams.length === 0 && (
                <>
              {/* Reference ranges display */}
              {testReferenceRanges && (
                <div className="mb-4 p-3 bg-primary-50 rounded-lg border border-primary-200">
                  <h4 className="font-medium text-primary-800 mb-2">Reference Ranges</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {testReferenceRanges.normal_range_low !== null && testReferenceRanges.normal_range_high !== null && (
                      <div>
                        <span className="text-gray-600">Normal:</span>
                        <span className="ml-2 font-medium">{testReferenceRanges.normal_range_low} - {testReferenceRanges.normal_range_high} {testReferenceRanges.unit}</span>
                      </div>
                    )}
                    {(testReferenceRanges.critical_low !== null || testReferenceRanges.critical_high !== null) && (
                      <div>
                        <span className="text-danger-600">Critical:</span>
                        <span className="ml-2 font-medium text-danger-600">
                          {testReferenceRanges.critical_low !== null && `<${testReferenceRanges.critical_low}`}
                          {testReferenceRanges.critical_low !== null && testReferenceRanges.critical_high !== null && ' or '}
                          {testReferenceRanges.critical_high !== null && `>${testReferenceRanges.critical_high}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Specimen ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={structuredResult.specimen_id}
                    onChange={(e) => setStructuredResult({ ...structuredResult, specimen_id: e.target.value })}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono"
                    placeholder="SP20240221-ABC123"
                  />
                  <button
                    onClick={() => setStructuredResult({ ...structuredResult, specimen_id: generateSpecimenId() })}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    title="Generate ID"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Result Value *</label>
                  <input
                    type="text"
                    value={structuredResult.value}
                    onChange={(e) => setStructuredResult({ ...structuredResult, value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-lg font-bold"
                    placeholder="Enter result"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={structuredResult.unit}
                    onChange={(e) => setStructuredResult({ ...structuredResult, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g., g/dL"
                  />
                </div>
              </div>

              {/* Critical value warning */}
              {testReferenceRanges && structuredResult.value && !isNaN(parseFloat(structuredResult.value)) && (
                (testReferenceRanges.critical_low !== null && parseFloat(structuredResult.value) < testReferenceRanges.critical_low) ||
                (testReferenceRanges.critical_high !== null && parseFloat(structuredResult.value) > testReferenceRanges.critical_high)
              ) && (
                <div className="mb-4 p-3 bg-danger-100 rounded-lg border border-danger-300">
                  <div className="flex items-center gap-2 text-danger-800 font-bold">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    CRITICAL VALUE - Physician notification required
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes/Comments</label>
                <textarea
                  value={structuredResult.notes}
                  onChange={(e) => setStructuredResult({ ...structuredResult, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={2}
                  placeholder="Additional observations, methodology notes, etc."
                />
              </div>
                </>
              )}

              {/* Specimen ID — shown in both flows */}
              {templateParams.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specimen ID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={structuredResult.specimen_id}
                      onChange={(e) => setStructuredResult({ ...structuredResult, specimen_id: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                      placeholder="SP20240221-ABC123"
                    />
                    <button
                      type="button"
                      onClick={() => setStructuredResult({ ...structuredResult, specimen_id: generateSpecimenId() })}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              )}

              {/* Reviewer assignment — required when the order has not been
                  verified yet. Hidden on grandfathered/already-verified rows
                  where the server skips the verification flow. */}
              {selectedOrderForResult.verification_status !== 'verified' && (
                <div className="mb-4 border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Peer Review
                      </label>
                      <p className="text-xs text-gray-500">
                        Result goes to the doctor after another lab tech reviews and approves it.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipVerification}
                        onChange={(e) => {
                          setSkipVerification(e.target.checked);
                          if (e.target.checked) setAssignedReviewerId('');
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-warning-600 focus:ring-warning-500"
                      />
                      <span className="text-sm font-medium text-warning-700">Skip Verification</span>
                    </label>
                  </div>
                  {skipVerification ? (
                    <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm text-warning-800">
                      <strong>Verification skipped.</strong> Result will go directly to the doctor without peer review.
                    </div>
                  ) : (
                    <>
                      <AppSelect
                        label="Assign reviewer *"
                        value={assignedReviewerId}
                        onChange={(val) =>
                          setAssignedReviewerId(val ? parseInt(val, 10) : '')
                        }
                        options={labReviewers.map((r) => ({ value: r.id, label: `${r.first_name} ${r.last_name} (${r.role})` }))}
                        placeholder="— Pick a reviewer —"
                      />
                      {labReviewers.length === 0 && (
                        <p className="text-xs text-danger-600 mt-1">
                          No other lab user is set up. Check &quot;Skip Verification&quot; to submit directly.
                        </p>
                      )}
                    </>
                  )}
                  {selectedOrderForResult.verification_status === 'rejected' &&
                    selectedOrderForResult.rejection_reason && (
                      <div className="mt-3 p-3 bg-warning-50 border border-warning-200 rounded-lg text-sm">
                        <div className="font-semibold text-warning-800">
                          Previously rejected — reason:
                        </div>
                        <div className="text-warning-700">
                          {selectedOrderForResult.rejection_reason}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* File Upload Section */}
              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload Lab Result Document (Optional)</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.gif"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Choose File
                  </button>
                  {selectedFile && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-success-600">{selectedFile.name}</span>
                      <button
                        onClick={() => setSelectedFile(null)}
                        className="text-danger-500 hover:text-danger-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">PDF or image files up to 10MB. This will be attached to the patient's profile.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResultModal(false);
                  setSelectedOrderForResult(null);
                  setTestReferenceRanges(null);
                  setStructuredResult({ value: '', unit: '', notes: '', specimen_id: '' });
                  setSelectedFile(null);
                  setAssignedReviewerId('');
                  setSkipVerification(false);
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitStructuredResult}
                disabled={
                  // Legacy form requires a single value; structured form
                  // requires at least one parameter to be filled in.
                  (templateParams.length === 0 && !structuredResult.value) ||
                  (templateParams.length > 0 &&
                    !templateParams.some((p) => {
                      const key = p.parameter_code || p.parameter_name;
                      return (templateValues[key] || '').trim() !== '';
                    })) ||
                  uploadingFile ||
                  (selectedOrderForResult.verification_status !== 'verified' && !assignedReviewerId)
                }
                className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploadingFile && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {uploadingFile
                  ? 'Uploading...'
                  : selectedOrderForResult.verification_status === 'verified'
                  ? 'Save changes'
                  : 'Submit for verification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify modal — reuses the rich lab-result viewer the doctor sees,
          with reviewer-notes banner + approve footer slotted in. The lab
          tech now sees structured parameters (name, value, unit, ref
          range, abnormal flag) and any attached PDF before approving. */}
      {verifyingOrder && (() => {
        const orderForModal: LabResultAlert = {
          id: verifyingOrder.id,
          test_name: verifyingOrder.test_name,
          test_code: verifyingOrder.test_code,
          path_no: (verifyingOrder as unknown as { path_no?: string }).path_no,
          patient_name: verifyingOrder.patient_name,
          patient_number: verifyingOrder.patient_number,
          priority: verifyingOrder.priority,
          status: verifyingOrder.status,
          ordered_date: verifyingOrder.ordered_at,
          result_date: verifyingOrder.results_available_at,
          result: verifyingOrder.results,
          result_document_id: verifyingOrder.result_document_id ?? null,
          result_document_name: verifyingOrder.result_document_name ?? null,
        };
        const closeVerify = () => {
          setVerifyingOrder(null);
          setVerifyNotes('');
        };
        return (
          <LabResultModal
            order={orderForModal}
            onClose={closeVerify}
            banner={
              <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 space-y-2">
                <p className="text-sm text-warning-900">
                  <span className="font-semibold">Peer review.</span> Approving will mark the order
                  completed and notify the doctor. Critical-value alerts (if any) will fire now.
                </p>
                <div>
                  <label className="block text-xs font-medium text-warning-900 mb-1">
                    Reviewer notes (optional)
                  </label>
                  <textarea
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-warning-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                    placeholder="e.g. Cross-checked against control"
                  />
                </div>
              </div>
            }
            footer={
              <>
                <button
                  onClick={closeVerify}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={submitVerification}
                  className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 text-sm inline-flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Approve & release to doctor
                </button>
              </>
            }
          />
        );
      })()}

      {/* Reject modal */}
      {rejectingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Send result back</h2>
              <p className="text-sm text-gray-600 mt-1">
                {rejectingOrder.test_name} for {rejectingOrder.patient_name}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                The result will go back to <span className="font-medium">{rejectingOrder.entered_by_name || 'the entry tech'}</span> for correction. The doctor will not see it.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-danger-600">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                  placeholder="e.g. Value looks like a typo (10× expected); please rerun"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectingOrder(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Report Modal */}
      {showPrintModal && selectedOrderForPrint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Lab Report Preview</h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  onClick={() => {
                    setShowPrintModal(false);
                    setSelectedOrderForPrint(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
            <div ref={printRef} className="lab-report p-8 font-serif text-black">
              {/* Header — Medics Group logo + clinic info */}
              <div className="header text-center mb-2">
                {branding.clinicLogo ? (
                  <img src={branding.clinicLogo} alt={branding.clinicName} className="mx-auto mb-1" style={{ height: 70 }} />
                ) : (
                  <h2 className="text-xl font-bold mb-1">{branding.clinicName}</h2>
                )}
                <div className="text-xs text-gray-700">{[branding.clinicAddress, branding.clinicEmail].filter(Boolean).join(' · ') || 'Laboratory Report'}</div>
              </div>

              <div style={{ borderTop: '2px solid #000', margin: '4px 0 10px' }} />

              <h2 className="text-base font-bold text-center mb-4" style={{ letterSpacing: '0.05em' }}>
                MEDICAL LABORATORY REPORT
              </h2>

              {/* Patient info — 2-column block matching the .docx layout */}
              <table className="patient-info w-full text-sm mb-3" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 8px', width: '15%' }}><strong>Patient Name:</strong></td>
                    <td style={{ padding: '4px 8px', width: '40%' }}>{selectedOrderForPrint.patient_name?.toUpperCase()}</td>
                    <td style={{ padding: '4px 8px', width: '15%' }}><strong>Age / Sex:</strong></td>
                    <td style={{ padding: '4px 8px', width: '30%' }}>{formatAgeSex(selectedOrderForPrint.patient_dob, selectedOrderForPrint.patient_gender) || '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 8px' }}><strong>Path No:</strong></td>
                    <td style={{ padding: '4px 8px' }}>{selectedOrderForPrint.path_no || selectedOrderForPrint.patient_number}</td>
                    <td style={{ padding: '4px 8px' }}><strong>Registration Date:</strong></td>
                    <td style={{ padding: '4px 8px' }}>{formatDateShort(selectedOrderForPrint.ordered_at)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Investigation banner */}
              <div className="investigation text-sm font-bold mb-1" style={{ background: '#f0f0f0', padding: '6px 10px' }}>
                INVESTIGATION: {(selectedOrderForPrint.test_name || '').toUpperCase()}
              </div>

              {/* Sample / Report Date row */}
              <table className="w-full text-xs mb-2" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 10px', width: '50%' }}><strong>SAMPLE DATE:</strong> {formatDateShort(selectedOrderForPrint.specimen_collected_at || selectedOrderForPrint.ordered_at)}</td>
                    <td style={{ padding: '4px 10px', width: '50%', textAlign: 'right' }}><strong>REPORT DATE:</strong> {formatDateShort(selectedOrderForPrint.results_available_at || undefined)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Results table — renders one row per parameter when the
                  result payload is a structured JSON object (FBC, chem
                  panels, urinalysis). Falls back to a single row when it's
                  legacy free-text. The parameter template (loaded earlier)
                  provides units, reference ranges, and flag thresholds so
                  the printed report matches William's docx layout. */}
              {(() => {
                const raw = (selectedOrderForPrint.results || '').trim();
                let structured: Record<string, string> | null = null;
                if (raw.startsWith('{')) {
                  try { structured = JSON.parse(raw); } catch { structured = null; }
                }
                if (structured) {
                  const entries = Object.entries(structured).filter(([k]) => k !== '__notes');
                  const notes = typeof structured.__notes === 'string' ? structured.__notes : null;
                  // Build a lookup from the template (loaded for printPreview)
                  // so we can include units + reference ranges. If template
                  // wasn't loaded (printing a different order), entries still
                  // render but without reference range / unit decoration.
                  const paramByKey = new Map<string, ParameterDef>();
                  templateParams.forEach((p) => {
                    paramByKey.set(p.parameter_code || p.parameter_name, p);
                  });
                  return (
                    <table className="results w-full text-xs mb-6" style={{ borderCollapse: 'collapse', border: '1px solid #000' }}>
                      <thead>
                        <tr style={{ background: '#f0f0f0' }}>
                          <th style={{ padding: '5px 8px', border: '1px solid #000', textAlign: 'left' }}>TEST</th>
                          <th style={{ padding: '5px 8px', border: '1px solid #000', textAlign: 'left' }}>VALUE</th>
                          <th style={{ padding: '5px 8px', border: '1px solid #000', textAlign: 'left' }}>UNIT</th>
                          <th style={{ padding: '5px 8px', border: '1px solid #000', textAlign: 'left' }}>FLAG</th>
                          <th style={{ padding: '5px 8px', border: '1px solid #000', textAlign: 'left' }}>REFERENCE RANGE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(([k, v]) => {
                          const p = paramByKey.get(k);
                          const flag = p ? classifyValue(p, String(v)) : null;
                          const flagText = flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH' ? '*' + (flag === 'CRITICAL_LOW' ? 'LOW' : 'HIGH') + '*'
                            : flag === 'LOW' ? 'LOW' : flag === 'HIGH' ? 'HIGH' : '';
                          return (
                            <tr key={k}>
                              <td style={{ padding: '4px 8px', border: '1px solid #000' }}>{p?.parameter_name || k}</td>
                              <td style={{ padding: '4px 8px', border: '1px solid #000', fontFamily: 'monospace' }}>{String(v) || '—'}</td>
                              <td style={{ padding: '4px 8px', border: '1px solid #000' }}>{p?.unit || ''}</td>
                              <td style={{ padding: '4px 8px', border: '1px solid #000', fontWeight: flag && flag !== 'NORMAL' ? 700 : 400 }}>{flagText}</td>
                              <td style={{ padding: '4px 8px', border: '1px solid #000' }}>{p ? formatReference(p) : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {notes && (
                        <tfoot>
                          <tr>
                            <td colSpan={5} style={{ padding: '6px 8px', borderTop: '1px solid #000', fontStyle: 'italic' }}>
                              <strong>REMARKS:</strong> {notes}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  );
                }
                // Legacy / single-value fallback
                return (
                  <table className="results w-full text-sm mb-6" style={{ borderCollapse: 'collapse', border: '1px solid #000' }}>
                    <thead>
                      <tr style={{ background: '#f0f0f0' }}>
                        <th style={{ padding: '6px 8px', border: '1px solid #000', textAlign: 'left', width: '40%' }}>TEST</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #000', textAlign: 'left', width: '30%' }}>RESULTS OBSERVED</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #000', textAlign: 'left', width: '30%' }}>REFERENCE RANGE</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '6px 8px', border: '1px solid #000' }}>{selectedOrderForPrint.test_name}</td>
                        <td style={{ padding: '6px 8px', border: '1px solid #000', whiteSpace: 'pre-wrap' }}>
                          {selectedOrderForPrint.results || '—'}
                        </td>
                        <td style={{ padding: '6px 8px', border: '1px solid #000' }}>—</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}

              {selectedOrderForPrint.specimen_id && (
                <div className="text-xs text-gray-700 mb-4">Specimen ID: {selectedOrderForPrint.specimen_id}</div>
              )}

              {selectedOrderForPrint.notes && (
                <div className="text-xs text-gray-700 mb-4"><strong>REMARKS:</strong> {selectedOrderForPrint.notes}</div>
              )}

              {/* Signature block — two lines, matching the .docx layout */}
              <div className="signatures grid grid-cols-2 gap-8 mt-16 text-xs">
                <div>
                  <div style={{ borderTop: '1px solid #000', width: '90%', marginBottom: 4 }} />
                  <div>Medical Laboratory Technologist</div>
                </div>
                <div>
                  <div style={{ borderTop: '1px solid #000', width: '90%', marginBottom: 4 }} />
                  <div>Laboratory Director</div>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 mt-6 text-center">
                Report generated electronically on {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QC Entry Modal */}
      {showQCModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-secondary-50 to-secondary-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Record QC Result</h2>
              <p className="text-sm text-gray-600">Enter quality control measurement data</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Code *</label>
                  <input
                    type="text"
                    value={qcForm.test_code}
                    onChange={(e) => setQCForm({ ...qcForm, test_code: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 font-mono"
                    placeholder="e.g., GLU, HB"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Name</label>
                  <input
                    type="text"
                    value={qcForm.test_name}
                    onChange={(e) => setQCForm({ ...qcForm, test_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500"
                    placeholder="e.g., Blood Glucose"
                  />
                </div>
                <div>
                  <AppSelect
                    label="Control Level *"
                    value={qcForm.control_level}
                    onChange={(val) => setQCForm({ ...qcForm, control_level: val })}
                    options={[
                      { value: 'low', label: 'Low Control' },
                      { value: 'normal', label: 'Normal Control' },
                      { value: 'high', label: 'High Control' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number</label>
                  <input
                    type="text"
                    value={qcForm.lot_number}
                    onChange={(e) => setQCForm({ ...qcForm, lot_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500"
                    placeholder="Control lot #"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Measured Value *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={qcForm.measured_value}
                    onChange={(e) => setQCForm({ ...qcForm, measured_value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500"
                    placeholder="Your reading"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={qcForm.unit}
                    onChange={(e) => setQCForm({ ...qcForm, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500"
                    placeholder="e.g., mg/dL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Value *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={qcForm.target_value}
                    onChange={(e) => setQCForm({ ...qcForm, target_value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500"
                    placeholder="Expected value"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standard Deviation *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={qcForm.standard_deviation}
                    onChange={(e) => setQCForm({ ...qcForm, standard_deviation: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500"
                    placeholder="SD"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={qcForm.notes}
                    onChange={(e) => setQCForm({ ...qcForm, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500"
                    rows={2}
                    placeholder="Additional notes, corrective actions, etc."
                  />
                </div>
              </div>

              {/* Preview calculation */}
              {qcForm.measured_value && qcForm.target_value && qcForm.standard_deviation && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
                  <div className="text-sm">
                    <span className="font-medium">Deviation: </span>
                    {Math.abs(parseFloat(qcForm.measured_value) - parseFloat(qcForm.target_value)).toFixed(2)}
                    <span className="ml-4 font-medium">Status: </span>
                    {Math.abs(parseFloat(qcForm.measured_value) - parseFloat(qcForm.target_value)) <= 2 * parseFloat(qcForm.standard_deviation) ? (
                      <span className="text-success-600 font-bold">Within 2SD (OK)</span>
                    ) : (
                      <span className="text-danger-600 font-bold">Outside 2SD (OUT OF CONTROL)</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowQCModal(false);
                  setQCForm({
                    test_code: '',
                    test_name: '',
                    control_level: 'normal',
                    lot_number: '',
                    measured_value: '',
                    target_value: '',
                    standard_deviation: '',
                    unit: '',
                    notes: '',
                  });
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={recordQCResult}
                disabled={!qcForm.test_code || !qcForm.measured_value || !qcForm.target_value || !qcForm.standard_deviation}
                className="px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Record QC Result
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default LabDashboard;
