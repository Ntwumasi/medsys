import React, { useEffect, useState, useCallback } from 'react';
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

const LabDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { showToast } = useNotification();

  // Main tab state
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'analytics' | 'alerts'>('orders');
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

  // Patient quick view
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [showPatientQuickView, setShowPatientQuickView] = useState(false);

  // Fetch lab orders
  const fetchLabOrders = useCallback(async () => {
    try {
      const response = await apiClient.get('/orders/lab');
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

      // Show toast for new unacknowledged alerts
      const unackCount = response.data.unacknowledged || 0;
      if (unackCount > 0) {
        showToast(`${unackCount} critical result(s) pending acknowledgment`, 'warning');
      }
    } catch (error) {
      console.error('Error fetching critical alerts:', error);
    }
  }, [showToast]);

  // Initial load and polling
  useEffect(() => {
    fetchLabOrders();
    const interval = setInterval(fetchLabOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchLabOrders]);

  useEffect(() => {
    if (activeTab === 'inventory') fetchInventory();
  }, [activeTab, fetchInventory]);

  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics();
  }, [activeTab, fetchAnalytics]);

  useEffect(() => {
    if (activeTab === 'alerts') fetchCriticalAlerts();
    // Also poll alerts every 30 seconds
    const interval = setInterval(() => {
      if (activeTab === 'alerts') fetchCriticalAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchCriticalAlerts]);

  // Update order status
  const updateStatus = async (orderId: number, status: string, results?: string) => {
    try {
      await apiClient.put(`/orders/lab/${orderId}`, {
        status,
        ...(results && { results }),
      });
      showToast('Order updated successfully', 'success');
      fetchLabOrders();
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Failed to update order', 'error');
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
    if (priorityFilter && order.priority !== priorityFilter) return false;
    if (ordersSubTab === 'pending') {
      return pendingStatuses.includes(order.status);
    } else {
      return order.status === 'completed';
    }
  });

  // Helper functions
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
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-6">
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
          <div className="flex border-b border-gray-200">
            {[
              { id: 'orders', label: 'Orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', count: labOrders.filter(o => o.status !== 'completed').length },
              { id: 'inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', count: inventory.length },
              { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { id: 'alerts', label: 'Critical Alerts', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', count: criticalAlerts.filter(a => !a.is_acknowledged).length, alert: true },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
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
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              </div>
            </div>

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
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                            {order.results_available_at && (
                              <div>
                                <span className="text-gray-500">Resulted:</span>
                                <span className="ml-2 text-gray-900 font-medium">{new Date(order.results_available_at).toLocaleString()}</span>
                              </div>
                            )}
                          </div>

                          {/* Result Entry */}
                          {order.status === 'in_progress' && (
                            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                              <label className="block text-sm font-medium text-blue-800 mb-2">Enter Results:</label>
                              <textarea
                                value={resultInput[order.id] || ''}
                                onChange={(e) => setResultInput({ ...resultInput, [order.id]: e.target.value })}
                                placeholder="Enter test results here..."
                                className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={3}
                              />
                            </div>
                          )}

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
                              onClick={() => {
                                updateStatus(order.id, 'completed', resultInput[order.id]);
                                setResultInput({ ...resultInput, [order.id]: '' });
                              }}
                              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              Complete & Submit
                            </button>
                          )}
                          {order.status === 'completed' && (
                            <button
                              onClick={() => window.print()}
                              className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              Print
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                {(inventorySearch || inventoryTypeFilter || inventoryStatusFilter) && (
                  <button
                    onClick={() => {
                      setInventorySearch('');
                      setInventoryTypeFilter('');
                      setInventoryStatusFilter('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 underline"
                  >
                    Clear Filters
                  </button>
                )}
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
                        <div className="flex gap-1">
                          {item.is_low_stock && <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Low</span>}
                          {item.is_expiring_soon && <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">Expiring</span>}
                          {item.is_calibration_due && <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">Cal Due</span>}
                          {!item.is_low_stock && !item.is_expiring_soon && !item.is_calibration_due && (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">OK</span>
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
    </div>
  );
};

export default LabDashboard;
