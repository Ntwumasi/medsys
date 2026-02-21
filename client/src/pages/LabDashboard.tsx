import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import apiClient from '../api/client';
import PatientQuickView from '../components/PatientQuickView';
import NotificationCenter from '../components/NotificationCenter';

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
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  ordering_provider_name: string;
  specimen_collected_at?: string;
  results_available_at?: string;
  results?: string;
  notes?: string;
  specimen_id?: string;
  specimen_type?: string;
  rejection_reason?: string;
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

const LabDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { showToast } = useNotification();
  const printRef = useRef<HTMLDivElement>(null);

  // Main tab state
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'analytics' | 'alerts' | 'catalog'>('orders');
  const [ordersSubTab, setOrdersSubTab] = useState<'pending' | 'completed'>('pending');

  // Loading states
  const [loading, setLoading] = useState(true);

  // Orders state
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [resultInput, setResultInput] = useState<{ [key: number]: string }>({});
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

  // Test Catalog state
  const [testCatalog, setTestCatalog] = useState<LabTest[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);

  // Patient quick view
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [showPatientQuickView, setShowPatientQuickView] = useState(false);

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
      const sortedOrders = orders.sort((a: LabOrder, b: LabOrder) => {
        const priorityOrder = { stat: 0, urgent: 1, routine: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      setLabOrders(sortedOrders);
    } catch (error) {
      console.error('Error fetching lab orders:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, priorityFilter]);

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

  // Initial load and polling
  useEffect(() => {
    fetchLabOrders();
    fetchAnalytics(); // Load analytics for stats cards
    const interval = setInterval(fetchLabOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchLabOrders, fetchAnalytics]);

  useEffect(() => {
    if (activeTab === 'inventory') fetchInventory();
  }, [activeTab, fetchInventory]);

  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics();
  }, [activeTab, fetchAnalytics]);

  useEffect(() => {
    if (activeTab === 'alerts') fetchCriticalAlerts();
    const interval = setInterval(() => {
      if (activeTab === 'alerts') fetchCriticalAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchCriticalAlerts]);

  useEffect(() => {
    if (activeTab === 'catalog') fetchTestCatalog();
  }, [activeTab, fetchTestCatalog]);

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

  // Submit structured result
  const submitStructuredResult = async () => {
    if (!selectedOrderForResult) return;
    try {
      const resultText = `${structuredResult.value} ${structuredResult.unit}${structuredResult.notes ? '\n' + structuredResult.notes : ''}`;
      await apiClient.put(`/orders/lab/${selectedOrderForResult.id}`, {
        status: 'completed',
        results: resultText,
      });
      showToast('Result submitted successfully', 'success');
      setShowResultModal(false);
      setStructuredResult({ value: '', unit: '', notes: '', specimen_id: '' });
      setSelectedOrderForResult(null);
      setTestReferenceRanges(null);
      fetchLabOrders();
      fetchCriticalAlerts();
    } catch (error) {
      console.error('Error submitting result:', error);
      showToast('Failed to submit result', 'error');
    }
  };

  // Open result modal with reference ranges
  const openResultModal = async (order: LabOrder) => {
    setSelectedOrderForResult(order);
    setStructuredResult({ value: '', unit: '', notes: '', specimen_id: order.specimen_id || '' });

    // Fetch reference ranges for this test
    try {
      const response = await apiClient.get(`/lab/test-catalog?search=${encodeURIComponent(order.test_name)}`);
      if (response.data.tests && response.data.tests.length > 0) {
        setTestReferenceRanges(response.data.tests[0]);
        setStructuredResult(prev => ({ ...prev, unit: response.data.tests[0].unit || '' }));
      }
    } catch (error) {
      console.error('Error fetching reference ranges:', error);
    }

    setShowResultModal(true);
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
    if (ordersSubTab === 'pending') {
      return pendingStatuses.includes(order.status);
    } else {
      return order.status === 'completed';
    }
  });

  // Helper display functions
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-emerald-100 text-emerald-800';
      case 'cancelled': return 'bg-slate-100 text-slate-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'stat': return 'bg-red-100 text-red-800 border-2 border-red-500';
      case 'urgent': return 'bg-amber-100 text-amber-800 border-2 border-amber-500';
      case 'routine': return 'bg-slate-100 text-slate-800 border border-slate-400';
      default: return 'bg-slate-100 text-slate-800 border border-slate-400';
    }
  };

  const formatTAT = (hours: number | null) => {
    if (!hours) return 'N/A';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${hours.toFixed(1)}h`;
  };

  const generateSpecimenId = () => {
    const now = new Date();
    return `SP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  };

  // Print lab report
  const printLabReport = (order: LabOrder) => {
    setSelectedOrderForPrint(order);
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
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #1e40af; }
            .patient-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .info-row { display: flex; gap: 10px; }
            .label { font-weight: bold; color: #666; }
            .result-section { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .result-value { font-size: 24px; font-weight: bold; color: #1e40af; }
            .reference { color: #666; font-size: 14px; }
            .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; font-size: 12px; color: #666; }
            .signature-line { margin-top: 40px; border-top: 1px solid #333; width: 200px; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-full mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Lab Dashboard</h1>
                <p className="text-blue-100 text-sm">Welcome, {user?.first_name} {user?.last_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <NotificationCenter />
              <button
                onClick={logout}
                className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md hover:shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-full mx-auto px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">
              {labOrders.filter(o => o.status === 'pending').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">In Progress</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {labOrders.filter(o => o.status === 'in_progress').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Completed</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {labOrders.filter(o => o.status === 'completed').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">STAT Orders</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {labOrders.filter(o => o.priority === 'stat' && o.status !== 'completed').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 cursor-pointer hover:bg-red-50" onClick={() => setActiveTab('alerts')}>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Critical Pending</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {criticalAlerts.filter(a => !a.is_acknowledged).length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg TAT</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {analytics?.turnaround_time?.average_tat_hours ? formatTAT(analytics.turnaround_time.average_tat_hours) : 'N/A'}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 cursor-pointer hover:bg-orange-50" onClick={() => setActiveTab('inventory')}>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Low Stock</div>
            <div className="text-2xl font-bold text-orange-600 mt-1">
              {inventoryStats?.low_stock_count || 0}
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {[
              { id: 'orders', label: 'Orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', count: labOrders.filter(o => o.status !== 'completed').length },
              { id: 'inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', count: inventory.length },
              { id: 'catalog', label: 'Test Catalog', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
              { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { id: 'alerts', label: 'Critical Alerts', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', count: criticalAlerts.filter(a => !a.is_acknowledged).length, alert: true },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 min-w-max px-6 py-4 text-center font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
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
                      tab.alert && tab.count > 0 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Priorities</option>
                    <option value="stat">STAT</option>
                    <option value="urgent">Urgent</option>
                    <option value="routine">Routine</option>
                  </select>
                </div>
                <div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="From Date"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="To Date"
                  />
                </div>
                <div>
                  <button
                    onClick={fetchLabOrders}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Batch Actions */}
            {selectedOrders.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="font-medium text-blue-800">{selectedOrders.length} order(s) selected</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => batchUpdateOrders('in_progress')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setOrdersSubTab('pending')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  ordersSubTab === 'pending'
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Pending & In Progress ({labOrders.filter(o => o.status === 'pending' || o.status === 'in_progress').length})
              </button>
              <button
                onClick={() => setOrdersSubTab('completed')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  ordersSubTab === 'completed'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Completed ({labOrders.filter(o => o.status === 'completed').length})
              </button>
            </div>

            {/* Orders List */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className={`px-6 py-4 border-b border-gray-200 rounded-t-xl ${
                ordersSubTab === 'pending' ? 'bg-gradient-to-r from-amber-50 to-orange-50' : 'bg-gradient-to-r from-emerald-50 to-green-50'
              }`}>
                <h2 className="text-xl font-bold text-gray-900">
                  {ordersSubTab === 'pending' ? 'Pending & In Progress Tests' : 'Completed Test Results'}
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredOrders.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">No tests found</p>
                  </div>
                ) : (
                  filteredOrders.map((order) => (
                    <div key={order.id} className={`px-6 py-4 hover:bg-gray-50 transition-colors ${order.priority === 'stat' ? 'bg-red-50 border-l-4 border-red-500' : ''}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {ordersSubTab === 'pending' && (
                              <input
                                type="checkbox"
                                checked={selectedOrders.includes(order.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedOrders([...selectedOrders, order.id]);
                                  } else {
                                    setSelectedOrders(selectedOrders.filter(id => id !== order.id));
                                  }
                                }}
                                className="w-5 h-5 rounded border-gray-300"
                              />
                            )}
                            <h3 className="text-lg font-semibold text-gray-900">{order.patient_name}</h3>
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${getPriorityBadgeClass(order.priority)}`}>
                              {order.priority.toUpperCase()}
                            </span>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(order.status)}`}>
                              {order.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <button
                              onClick={() => {
                                setSelectedPatientId(order.patient_id);
                                setShowPatientQuickView(true);
                              }}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              View Patient
                            </button>
                          </div>
                          <div className="mb-3">
                            <div className="text-md font-semibold text-blue-700">
                              Test: {order.test_name}
                              {order.test_code && <span className="text-sm text-gray-600 ml-2">({order.test_code})</span>}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">Ordered by: {order.ordering_provider_name}</div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Patient #:</span>
                              <span className="ml-2 text-gray-900 font-medium">{order.patient_number}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Encounter #:</span>
                              <span className="ml-2 text-gray-900 font-medium">{order.encounter_number}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Ordered:</span>
                              <span className="ml-2 text-gray-900 font-medium">{new Date(order.ordered_at).toLocaleString()}</span>
                            </div>
                            {order.specimen_id && (
                              <div>
                                <span className="text-gray-500">Specimen ID:</span>
                                <span className="ml-2 text-gray-900 font-medium font-mono">{order.specimen_id}</span>
                              </div>
                            )}
                            {order.results_available_at && (
                              <div>
                                <span className="text-gray-500">Resulted:</span>
                                <span className="ml-2 text-gray-900 font-medium">{new Date(order.results_available_at).toLocaleString()}</span>
                              </div>
                            )}
                          </div>

                          {/* Results Display */}
                          {order.status === 'completed' && order.results && (
                            <div className="mt-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                              <div className="text-sm font-bold text-emerald-800 mb-2">Test Results:</div>
                              <div className="text-gray-900 whitespace-pre-wrap">{order.results}</div>
                            </div>
                          )}
                        </div>
                        <div className="ml-4 flex flex-col gap-2">
                          {order.status === 'pending' && (
                            <button
                              onClick={() => updateStatus(order.id, 'in_progress')}
                              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Start Processing
                            </button>
                          )}
                          {order.status === 'in_progress' && (
                            <button
                              onClick={() => openResultModal(order)}
                              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              Enter Results
                            </button>
                          )}
                          {order.status === 'completed' && (
                            <button
                              onClick={() => printLabReport(order)}
                              className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              Print Report
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

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div>
            {/* Inventory Stats */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Total Items</div>
                <div className="text-2xl font-bold text-gray-700 mt-1">{inventoryStats?.total_items || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 cursor-pointer hover:bg-yellow-50" onClick={() => setInventoryStatusFilter('low_stock')}>
                <div className="text-xs font-medium text-gray-500 uppercase">Low Stock</div>
                <div className="text-2xl font-bold text-yellow-600 mt-1">{inventoryStats?.low_stock_count || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 cursor-pointer hover:bg-orange-50" onClick={() => setInventoryStatusFilter('expiring')}>
                <div className="text-xs font-medium text-gray-500 uppercase">Expiring Soon</div>
                <div className="text-2xl font-bold text-orange-600 mt-1">{inventoryStats?.expiring_soon_count || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Calibration Due</div>
                <div className="text-2xl font-bold text-red-600 mt-1">{inventoryStats?.calibration_due_count || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Stock Value</div>
                <div className="text-2xl font-bold text-green-600 mt-1">${inventoryStats?.total_stock_value?.toFixed(2) || '0.00'}</div>
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
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={inventoryTypeFilter}
                  onChange={(e) => setInventoryTypeFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="reagent">Reagents</option>
                  <option value="supply">Supplies</option>
                  <option value="equipment">Equipment</option>
                </select>
                <select
                  value={inventoryStatusFilter}
                  onChange={(e) => setInventoryStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Status</option>
                  <option value="low_stock">Low Stock Only</option>
                  <option value="expiring">Expiring Soon</option>
                </select>
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                          item.item_type === 'reagent' ? 'bg-purple-100 text-purple-800' :
                          item.item_type === 'supply' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {item.item_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.category}</td>
                      <td className={`px-6 py-4 whitespace-nowrap font-bold ${item.is_low_stock ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.quantity_on_hand} {item.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.reorder_level}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.lot_number || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1 flex-wrap">
                          {item.is_low_stock && <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Low</span>}
                          {item.is_expiring_soon && <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">Expiring</span>}
                          {item.is_calibration_due && <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">Cal Due</span>}
                          {!item.is_low_stock && !item.is_expiring_soon && !item.is_calibration_due && (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">OK</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditInventory(item)}
                            className="text-blue-600 hover:text-blue-800"
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
                            className="text-green-600 hover:text-green-800"
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
                              className="text-purple-600 hover:text-purple-800"
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
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={catalogCategory}
                  onChange={(e) => setCatalogCategory(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Categories</option>
                  {catalogCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                      <td className="px-6 py-4 whitespace-nowrap font-mono font-bold text-blue-600">{test.test_code}</td>
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
                          <span className="text-red-600 font-medium">
                            {test.critical_low !== null && `<${test.critical_low}`}
                            {test.critical_low !== null && test.critical_high !== null && ' / '}
                            {test.critical_high !== null && `>${test.critical_high}`}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">${test.base_price?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => openEditTest(test)}
                          className="text-blue-600 hover:text-blue-800"
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
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                  <input
                    type="date"
                    value={analyticsEndDate}
                    onChange={(e) => setAnalyticsEndDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={fetchAnalytics}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Generate Report
                  </button>
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
                <div className="text-2xl font-bold text-purple-600 mt-1">
                  {formatTAT(analytics?.turnaround_time?.average_tat_hours || null)}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">STAT Tests</div>
                <div className="text-2xl font-bold text-red-600 mt-1">{analytics?.totals?.stat_tests || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Critical Results</div>
                <div className="text-2xl font-bold text-red-600 mt-1">{analytics?.critical_results?.total_critical || 0}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TAT by Priority */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Turnaround Time by Priority</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-red-600">STAT</span>
                    <span className="text-gray-900">{formatTAT(analytics?.turnaround_time?.stat_tat_hours || null)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-amber-600">Urgent</span>
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
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-red-50 to-orange-50 rounded-t-xl">
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
                      className={`px-6 py-4 ${!alert.is_acknowledged ? 'bg-red-50' : 'bg-gray-50'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-lg font-bold text-gray-900">{alert.patient_name}</span>
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                              alert.alert_type === 'critical_high' ? 'bg-red-600 text-white' :
                              alert.alert_type === 'critical_low' ? 'bg-blue-600 text-white' :
                              'bg-purple-600 text-white'
                            }`}>
                              {alert.alert_type.replace('_', ' ').toUpperCase()}
                            </span>
                            {alert.is_acknowledged && (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                ACKNOWLEDGED
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-semibold">Test:</span> {alert.test_name}
                            <span className="mx-2">|</span>
                            <span className="font-semibold">Result:</span> <span className="text-red-600 font-bold">{alert.result_value}</span>
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
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
      </main>

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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={inventoryForm.item_type}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, item_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="reagent">Reagent</option>
                    <option value="supply">Supply</option>
                    <option value="equipment">Equipment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={inventoryForm.category}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <input
                    type="text"
                    value={inventoryForm.unit}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, unit: e.target.value })}
                    placeholder="e.g., test, ml, piece"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Quantity</label>
                  <input
                    type="number"
                    value={inventoryForm.quantity_on_hand}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, quantity_on_hand: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={!!editingItem}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                  <input
                    type="number"
                    value={inventoryForm.reorder_level}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, reorder_level: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={inventoryForm.unit_cost}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, unit_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={inventoryForm.expiry_date}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, expiry_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number</label>
                  <input
                    type="text"
                    value={inventoryForm.lot_number}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, lot_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={inventoryForm.supplier}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, supplier: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Storage Location</label>
                  <input
                    type="text"
                    value={inventoryForm.storage_location}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, storage_location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Storage Conditions</label>
                  <select
                    value={inventoryForm.storage_conditions}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, storage_conditions: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="room_temp">Room Temperature</option>
                    <option value="refrigerated">Refrigerated (2-8°C)</option>
                    <option value="frozen">Frozen (-20°C)</option>
                    <option value="deep_frozen">Deep Frozen (-80°C)</option>
                  </select>
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment Type</label>
                <select
                  value={adjustStockForm.transaction_type}
                  onChange={(e) => setAdjustStockForm({ ...adjustStockForm, transaction_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="purchase">Purchase (Add Stock)</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="expired">Expired (Remove)</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (+ to add, - to remove)</label>
                <input
                  type="number"
                  value={adjustStockForm.adjustment}
                  onChange={(e) => setAdjustStockForm({ ...adjustStockForm, adjustment: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={adjustStockForm.notes}
                  onChange={(e) => setAdjustStockForm({ ...adjustStockForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={calibrationForm.notes}
                  onChange={(e) => setCalibrationForm({ ...calibrationForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="e.g., CBC, HB, GLU"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Name *</label>
                  <input
                    type="text"
                    value={testForm.test_name}
                    onChange={(e) => setTestForm({ ...testForm, test_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={testForm.category}
                    onChange={(e) => setTestForm({ ...testForm, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Hematology, Chemistry"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specimen Type</label>
                  <select
                    value={testForm.specimen_type}
                    onChange={(e) => setTestForm({ ...testForm, specimen_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="blood">Blood</option>
                    <option value="urine">Urine</option>
                    <option value="stool">Stool</option>
                    <option value="swab">Swab</option>
                    <option value="csf">CSF</option>
                    <option value="tissue">Tissue</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">TAT (hours)</label>
                  <input
                    type="number"
                    value={testForm.turnaround_time_hours}
                    onChange={(e) => setTestForm({ ...testForm, turnaround_time_hours: parseInt(e.target.value) || 24 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.base_price}
                    onChange={(e) => setTestForm({ ...testForm, base_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={testForm.unit}
                    onChange={(e) => setTestForm({ ...testForm, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Normal Range High</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.normal_range_high}
                    onChange={(e) => setTestForm({ ...testForm, normal_range_high: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-red-700 mb-1">Critical Low</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.critical_low}
                    onChange={(e) => setTestForm({ ...testForm, critical_low: e.target.value })}
                    className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-red-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-red-700 mb-1">Critical High</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testForm.critical_high}
                    onChange={(e) => setTestForm({ ...testForm, critical_high: e.target.value })}
                    className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-red-50"
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-green-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Enter Test Results</h2>
              <p className="text-sm text-gray-600">{selectedOrderForResult.patient_name} - {selectedOrderForResult.test_name}</p>
            </div>
            <div className="p-6">
              {/* Reference ranges display */}
              {testReferenceRanges && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-800 mb-2">Reference Ranges</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {testReferenceRanges.normal_range_low !== null && testReferenceRanges.normal_range_high !== null && (
                      <div>
                        <span className="text-gray-600">Normal:</span>
                        <span className="ml-2 font-medium">{testReferenceRanges.normal_range_low} - {testReferenceRanges.normal_range_high} {testReferenceRanges.unit}</span>
                      </div>
                    )}
                    {(testReferenceRanges.critical_low !== null || testReferenceRanges.critical_high !== null) && (
                      <div>
                        <span className="text-red-600">Critical:</span>
                        <span className="ml-2 font-medium text-red-600">
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
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg font-bold"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., g/dL"
                  />
                </div>
              </div>

              {/* Critical value warning */}
              {testReferenceRanges && structuredResult.value && !isNaN(parseFloat(structuredResult.value)) && (
                (testReferenceRanges.critical_low !== null && parseFloat(structuredResult.value) < testReferenceRanges.critical_low) ||
                (testReferenceRanges.critical_high !== null && parseFloat(structuredResult.value) > testReferenceRanges.critical_high)
              ) && (
                <div className="mb-4 p-3 bg-red-100 rounded-lg border border-red-300">
                  <div className="flex items-center gap-2 text-red-800 font-bold">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    CRITICAL VALUE - Physician notification required
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes/Comments</label>
                <textarea
                  value={structuredResult.notes}
                  onChange={(e) => setStructuredResult({ ...structuredResult, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Additional observations, methodology notes, etc."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResultModal(false);
                  setSelectedOrderForResult(null);
                  setTestReferenceRanges(null);
                  setStructuredResult({ value: '', unit: '', notes: '', specimen_id: '' });
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitStructuredResult}
                disabled={!structuredResult.value}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Result
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
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
            <div ref={printRef} className="p-8">
              <div className="header text-center border-b-2 border-gray-800 pb-4 mb-6">
                <div className="logo text-2xl font-bold text-blue-800">MedSys Healthcare</div>
                <div className="text-gray-600">Laboratory Department</div>
                <div className="text-sm text-gray-500">123 Medical Center Drive | Phone: (555) 123-4567</div>
              </div>

              <h2 className="text-xl font-bold text-center mb-6">LABORATORY REPORT</h2>

              <div className="patient-info grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="info-row"><span className="label text-gray-600 font-bold">Patient Name:</span> {selectedOrderForPrint.patient_name}</div>
                  <div className="info-row"><span className="label text-gray-600 font-bold">Patient ID:</span> {selectedOrderForPrint.patient_number}</div>
                  <div className="info-row"><span className="label text-gray-600 font-bold">Encounter:</span> {selectedOrderForPrint.encounter_number}</div>
                </div>
                <div>
                  <div className="info-row"><span className="label text-gray-600 font-bold">Order Date:</span> {new Date(selectedOrderForPrint.ordered_at).toLocaleString()}</div>
                  <div className="info-row"><span className="label text-gray-600 font-bold">Report Date:</span> {selectedOrderForPrint.results_available_at ? new Date(selectedOrderForPrint.results_available_at).toLocaleString() : 'N/A'}</div>
                  <div className="info-row"><span className="label text-gray-600 font-bold">Ordering Physician:</span> {selectedOrderForPrint.ordering_provider_name}</div>
                </div>
              </div>

              <div className="result-section bg-gray-100 p-4 rounded-lg mb-6">
                <h3 className="font-bold text-lg mb-2">{selectedOrderForPrint.test_name} {selectedOrderForPrint.test_code && `(${selectedOrderForPrint.test_code})`}</h3>
                <div className="result-value text-2xl font-bold text-blue-800 mb-2">
                  {selectedOrderForPrint.results}
                </div>
                {selectedOrderForPrint.specimen_id && (
                  <div className="text-sm text-gray-600">Specimen ID: {selectedOrderForPrint.specimen_id}</div>
                )}
              </div>

              <div className="footer mt-8 border-t border-gray-300 pt-4 text-sm text-gray-600">
                <p className="mb-4">This report is electronically generated and verified.</p>
                <div className="grid grid-cols-2 gap-8 mt-8">
                  <div>
                    <div className="signature-line border-t border-gray-800 w-48 mt-8"></div>
                    <div>Medical Laboratory Technologist</div>
                  </div>
                  <div>
                    <div className="signature-line border-t border-gray-800 w-48 mt-8"></div>
                    <div>Laboratory Director</div>
                  </div>
                </div>
                <p className="mt-6 text-xs">Report generated: {new Date().toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabDashboard;
