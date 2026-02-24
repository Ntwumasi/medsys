import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { format } from 'date-fns';

interface RoutingRequest {
  id: number;
  encounter_id: number;
  patient_id: number;
  department: string;
  status: string;
  notes: string;
  routed_at: string;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  room_number: string;
}

interface PharmacyOrder {
  id: number;
  patient_id: number;
  encounter_id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  quantity: string;
  refills: number;
  priority: string;
  status: string;
  ordered_date: string;
  dispensed_date: string;
  notes: string;
  patient_name?: string;
  patient_number?: string;
  encounter_number?: string;
  provider_name?: string;
}

interface InventoryItem {
  id: number;
  medication_name: string;
  generic_name: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number;
  selling_price: number;
  expiry_date: string;
  supplier: string;
  location: string;
  is_low_stock: boolean;
  is_expiring_soon: boolean;
}

interface InventoryStats {
  total_items: number;
  low_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  total_stock_value: number;
}

interface TopMedication {
  medication_name: string;
  order_count: number;
  total_quantity: number;
}

interface RevenueTotals {
  total_orders: number;
  dispensed_orders: number;
  pending_orders: number;
  unique_patients: number;
}

interface RevenueData {
  totals: RevenueTotals;
  top_medications: TopMedication[];
}

interface Diagnosis {
  id: number;
  diagnosis_code: string;
  diagnosis_description: string;
  type: string;
}

interface Allergy {
  id: number;
  allergen: string;
  reaction: string;
  severity: string;
}

interface ActiveMedication {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  start_date: string;
  end_date?: string;
  doctor_first_name?: string;
  doctor_last_name?: string;
}

interface DrugHistory {
  orders: PharmacyOrder[];
  active_medications: ActiveMedication[];
  allergies: Allergy[];
}

const PharmacyDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'revenue'>('orders');
  const [ordersSubTab, setOrdersSubTab] = useState<'pending' | 'history'>('pending');
  const [loading, setLoading] = useState(true);

  // Orders state
  const [routingRequests, setRoutingRequests] = useState<RoutingRequest[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PharmacyOrder | null>(null);
  const [patientDiagnoses, setPatientDiagnoses] = useState<Diagnosis[]>([]);
  const [patientAllergies, setPatientAllergies] = useState<Allergy[]>([]);

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low_stock' | 'expiring'>('all');
  const [inventorySearch, setInventorySearch] = useState('');

  // Date range state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Drug history modal
  const [showDrugHistory, setShowDrugHistory] = useState(false);
  const [drugHistoryPatientName, setDrugHistoryPatientName] = useState('');
  const [drugHistory, setDrugHistory] = useState<DrugHistory | null>(null);
  const [loadingDrugHistory, setLoadingDrugHistory] = useState(false);

  // Revenue state
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchRoutingRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (ordersSubTab === 'history') {
      fetchOrderHistory();
    }
  }, [ordersSubTab, startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([
      fetchRoutingRequests(),
      fetchPendingOrders(),
      fetchInventory(),
    ]);
    setLoading(false);
  };

  const fetchRoutingRequests = async () => {
    try {
      const response = await apiClient.get('/department-routing/pharmacy/queue');
      setRoutingRequests(response.data.queue || []);
    } catch (error) {
      console.error('Error fetching routing requests:', error);
    }
  };

  const fetchPendingOrders = async () => {
    try {
      const response = await apiClient.get('/orders/pharmacy?status=ordered');
      setPharmacyOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error fetching pharmacy orders:', error);
    }
  };

  const fetchOrderHistory = async () => {
    try {
      let url = '/orders/pharmacy?status=dispensed,completed';
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      const response = await apiClient.get(url);
      setPharmacyOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error fetching order history:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      let url = '/inventory';
      if (inventoryFilter === 'low_stock') url += '?low_stock=true';
      else if (inventoryFilter === 'expiring') url += '?expiring_soon=true';
      if (inventorySearch) url += `${url.includes('?') ? '&' : '?'}search=${inventorySearch}`;

      const response = await apiClient.get(url);
      setInventory(response.data.inventory || []);
      setInventoryStats(response.data.stats || null);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const fetchPatientDetails = async (patientId: number, encounterId: number) => {
    try {
      // Fetch diagnoses
      const encounterRes = await apiClient.get(`/encounters/${encounterId}`);
      setPatientDiagnoses(encounterRes.data.diagnoses || []);

      // Fetch allergies from patient record
      const patientRes = await apiClient.get(`/patients/${patientId}`);
      setPatientAllergies(patientRes.data.patient?.allergies || []);
    } catch (error) {
      console.error('Error fetching patient details:', error);
    }
  };

  const fetchDrugHistory = async (patientId: number, patientName: string) => {
    setDrugHistoryPatientName(patientName);
    setShowDrugHistory(true);
    setLoadingDrugHistory(true);

    try {
      const response = await apiClient.get(`/pharmacy/drug-history/${patientId}`);
      setDrugHistory(response.data);
    } catch (error) {
      console.error('Error fetching drug history:', error);
    } finally {
      setLoadingDrugHistory(false);
    }
  };

  const fetchRevenueSummary = async () => {
    try {
      let url = '/pharmacy/revenue';
      if (startDate) url += `?start_date=${startDate}`;
      if (endDate) url += `${url.includes('?') ? '&' : '?'}end_date=${endDate}`;

      const response = await apiClient.get(url);
      setRevenueData(response.data);
    } catch (error) {
      console.error('Error fetching revenue:', error);
    }
  };

  const dispenseMedication = async (orderId: number) => {
    try {
      await apiClient.put(`/orders/pharmacy/${orderId}`, {
        status: 'dispensed',
        dispensed_date: new Date().toISOString()
      });
      fetchPendingOrders();
    } catch (error) {
      console.error('Error dispensing medication:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'severe': return 'bg-danger-100 text-danger-800 border-danger-300';
      case 'moderate': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'mild': return 'bg-warning-100 text-warning-800 border-warning-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'stat': return 'bg-danger-600 text-white';
      case 'urgent': return 'bg-orange-500 text-white';
      default: return 'bg-primary-100 text-primary-800';
    }
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
      <header className="bg-gradient-to-r from-success-600 to-success-600 shadow-lg">
        <div className="max-w-full mx-auto px-6 py-5">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Pharmacy Dashboard
                </h1>
                <p className="text-success-100 text-sm">
                  Welcome, {user?.first_name} {user?.last_name}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-5 py-2.5 bg-white text-success-600 hover:bg-success-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-6">
          <nav className="flex space-x-8">
            {([
              { id: 'orders', label: 'Prescriptions', icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              )},
              { id: 'inventory', label: 'Inventory', icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              )},
              { id: 'revenue', label: 'Revenue', icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              )},
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'revenue') fetchRevenueSummary();
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-success-500 text-success-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-full mx-auto px-6 py-6">
        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-warning-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Pending Orders</p>
                    <p className="text-2xl font-bold text-warning-600">
                      {pharmacyOrders.filter(o => o.status === 'ordered').length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-primary-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Routing Requests</p>
                    <p className="text-2xl font-bold text-primary-600">
                      {routingRequests.filter(r => r.status === 'pending').length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-secondary-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">In Progress</p>
                    <p className="text-2xl font-bold text-secondary-600">
                      {routingRequests.filter(r => r.status === 'in-progress').length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-danger-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-danger-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Low Stock Alerts</p>
                    <p className="text-2xl font-bold text-danger-600">
                      {inventoryStats?.low_stock_count || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => { setOrdersSubTab('pending'); fetchPendingOrders(); }}
                className={`px-4 py-2 rounded-lg font-medium ${
                  ordersSubTab === 'pending' ? 'bg-success-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Pending Orders
              </button>
              <button
                onClick={() => setOrdersSubTab('history')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  ordersSubTab === 'history' ? 'bg-success-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Order History
              </button>
            </div>

            {/* Date Range Filter for History */}
            {ordersSubTab === 'history' && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-6 flex items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={fetchOrderHistory}
                  className="mt-6 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-medium"
                >
                  Search
                </button>
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); fetchOrderHistory(); }}
                  className="mt-6 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Orders List */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold">
                    {ordersSubTab === 'pending' ? 'Pending Prescriptions' : 'Order History'}
                  </h2>
                </div>
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {pharmacyOrders.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                      No {ordersSubTab === 'pending' ? 'pending' : ''} orders found
                    </div>
                  ) : (
                    pharmacyOrders.map((order) => (
                      <div
                        key={order.id}
                        className={`px-6 py-4 hover:bg-gray-50 cursor-pointer ${
                          selectedOrder?.id === order.id ? 'bg-success-50 border-l-4 border-success-500' : ''
                        }`}
                        onClick={() => {
                          setSelectedOrder(order);
                          fetchPatientDetails(order.patient_id, order.encounter_id);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg text-gray-900">
                                {order.medication_name}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getPriorityColor(order.priority)}`}>
                                {order.priority?.toUpperCase() || 'ROUTINE'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {order.dosage} | {order.frequency} | {order.route}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              Patient: <span className="font-medium">{order.patient_name || `ID: ${order.patient_id}`}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Ordered: {format(new Date(order.ordered_date), 'MMM dd, yyyy HH:mm')}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-lg font-bold text-gray-900">
                              Qty: {order.quantity}
                            </span>
                            {ordersSubTab === 'pending' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dispenseMedication(order.id);
                                }}
                                className="px-3 py-1 bg-success-600 text-white text-sm rounded-lg hover:bg-success-700"
                              >
                                Dispense
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchDrugHistory(order.patient_id, order.patient_name || `Patient ${order.patient_id}`);
                              }}
                              className="px-3 py-1 bg-primary-100 text-primary-700 text-sm rounded-lg hover:bg-primary-200"
                            >
                              Drug History
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Patient Details Panel */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold">Patient Details</h2>
                </div>
                {selectedOrder ? (
                  <div className="p-6 space-y-6">
                    {/* Allergies/Sensitivities */}
                    <div>
                      <h3 className="text-sm font-semibold text-danger-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Medication Sensitivities
                      </h3>
                      {patientAllergies.length > 0 ? (
                        <div className="space-y-2">
                          {patientAllergies.map((allergy) => (
                            <div
                              key={allergy.id}
                              className={`p-2 rounded border ${getSeverityColor(allergy.severity)}`}
                            >
                              <div className="font-medium">{allergy.allergen}</div>
                              <div className="text-xs">{allergy.reaction}</div>
                              <span className="text-xs font-semibold uppercase">{allergy.severity}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No known allergies</p>
                      )}
                    </div>

                    {/* Diagnoses */}
                    <div>
                      <h3 className="text-sm font-semibold text-primary-600 uppercase tracking-wider mb-2">
                        Current Diagnoses
                      </h3>
                      {patientDiagnoses.length > 0 ? (
                        <div className="space-y-2">
                          {patientDiagnoses.map((dx) => (
                            <div key={dx.id} className="p-2 bg-primary-50 rounded">
                              <div className="font-medium text-sm">
                                {dx.diagnosis_code && <span className="text-primary-600">[{dx.diagnosis_code}]</span>}{' '}
                                {dx.diagnosis_description}
                              </div>
                              <span className="text-xs text-primary-600 uppercase">{dx.type}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No diagnoses recorded</p>
                      )}
                    </div>

                    {/* Prescription Details */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">
                        Prescription Details
                      </h3>
                      <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
                        <div><span className="text-gray-500">Medication:</span> <span className="font-medium">{selectedOrder.medication_name}</span></div>
                        <div><span className="text-gray-500">Dosage:</span> {selectedOrder.dosage}</div>
                        <div><span className="text-gray-500">Frequency:</span> {selectedOrder.frequency}</div>
                        <div><span className="text-gray-500">Route:</span> {selectedOrder.route}</div>
                        <div><span className="text-gray-500">Quantity:</span> {selectedOrder.quantity}</div>
                        <div><span className="text-gray-500">Refills:</span> {selectedOrder.refills || 0}</div>
                        {selectedOrder.notes && (
                          <div><span className="text-gray-500">Notes:</span> {selectedOrder.notes}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500">
                    Select an order to view patient details
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div>
            {/* Inventory Stats */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-gray-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Items</p>
                    <p className="text-2xl font-bold text-gray-900">{inventoryStats?.total_items || 0}</p>
                  </div>
                </div>
              </div>
              <div
                className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow cursor-pointer hover:ring-2 ring-warning-400"
                onClick={() => setInventoryFilter('low_stock')}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-warning-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Low Stock</p>
                    <p className="text-2xl font-bold text-warning-600">{inventoryStats?.low_stock_count || 0}</p>
                  </div>
                </div>
              </div>
              <div
                className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow cursor-pointer hover:ring-2 ring-orange-400"
                onClick={() => setInventoryFilter('expiring')}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-orange-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Expiring Soon</p>
                    <p className="text-2xl font-bold text-orange-600">{inventoryStats?.expiring_soon_count || 0}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-danger-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-danger-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Expired</p>
                    <p className="text-2xl font-bold text-danger-600">{inventoryStats?.expired_count || 0}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-success-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Stock Value</p>
                    <p className="text-2xl font-bold text-success-600">
                      GH{'\u20B5'} {parseFloat(String(inventoryStats?.total_stock_value || 0)).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-6 flex items-center gap-4">
              <input
                type="text"
                placeholder="Search medications..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
              />
              <select
                value={inventoryFilter}
                onChange={(e) => setInventoryFilter(e.target.value as 'all' | 'low_stock' | 'expiring')}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
              >
                <option value="all">All Items</option>
                <option value="low_stock">Low Stock Only</option>
                <option value="expiring">Expiring Soon</option>
              </select>
              <button
                onClick={fetchInventory}
                className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-medium"
              >
                Search
              </button>
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medication</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reorder Level</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inventory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{item.medication_name}</div>
                        <div className="text-sm text-gray-500">{item.generic_name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{item.category}</td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${item.is_low_stock ? 'text-danger-600' : 'text-gray-900'}`}>
                          {item.quantity_on_hand}
                        </span>
                        <span className="text-sm text-gray-500 ml-1">{item.unit}s</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{item.reorder_level}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        GH₵ {parseFloat(item.selling_price.toString()).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {item.expiry_date ? (
                          <span className={item.is_expiring_soon ? 'text-orange-600 font-medium' : 'text-gray-600'}>
                            {format(new Date(item.expiry_date), 'MMM yyyy')}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {item.is_low_stock && (
                          <span className="px-2 py-1 bg-warning-100 text-warning-800 text-xs rounded-full">Low Stock</span>
                        )}
                        {item.is_expiring_soon && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full ml-1">Expiring</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inventory.length === 0 && (
                <div className="py-12 text-center text-gray-500">
                  No inventory items found
                </div>
              )}
            </div>
          </div>
        )}

        {/* REVENUE TAB */}
        {activeTab === 'revenue' && (
          <div>
            {/* Date Filter */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-6 flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={fetchRevenueSummary}
                className="mt-6 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-medium"
              >
                Generate Report
              </button>
            </div>

            {revenueData ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 bg-gray-100 rounded-lg p-3">
                        <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Total Orders</p>
                        <p className="text-2xl font-bold text-gray-900">{revenueData.totals?.total_orders || 0}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 bg-success-100 rounded-lg p-3">
                        <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Dispensed</p>
                        <p className="text-2xl font-bold text-success-600">{revenueData.totals?.dispensed_orders || 0}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 bg-warning-100 rounded-lg p-3">
                        <svg className="h-6 w-6 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Pending</p>
                        <p className="text-2xl font-bold text-warning-600">{revenueData.totals?.pending_orders || 0}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 bg-primary-100 rounded-lg p-3">
                        <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Unique Patients</p>
                        <p className="text-2xl font-bold text-primary-600">{revenueData.totals?.unique_patients || 0}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Medications */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6">
                  <div className="px-6 py-4 border-b">
                    <h2 className="text-lg font-semibold">Top 10 Medications</h2>
                  </div>
                  <div className="p-6">
                    {revenueData.top_medications?.length > 0 ? (
                      <div className="space-y-3">
                        {revenueData.top_medications.map((med, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full bg-success-100 text-success-700 flex items-center justify-center font-bold">
                                {index + 1}
                              </span>
                              <span className="font-medium">{med.medication_name}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-gray-900">{med.order_count} orders</div>
                              <div className="text-sm text-gray-500">{med.total_quantity} units</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500">No data available</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
                Select a date range and click "Generate Report" to view revenue summary
              </div>
            )}
          </div>
        )}
      </main>

      {/* Drug History Modal */}
      {showDrugHistory && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowDrugHistory(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-6 py-4 border-b flex justify-between items-center">
                <h2 className="text-xl font-bold">Drug History - {drugHistoryPatientName}</h2>
                <button
                  onClick={() => setShowDrugHistory(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {loadingDrugHistory ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-success-600 mx-auto"></div>
                </div>
              ) : drugHistory ? (
                <div className="p-6 space-y-6">
                  {/* Allergies */}
                  {drugHistory.allergies.length > 0 && (
                    <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
                      <h3 className="font-bold text-danger-700 mb-2">Known Allergies</h3>
                      <div className="space-y-2">
                        {drugHistory.allergies.map((allergy) => (
                          <div key={allergy.id} className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(allergy.severity)}`}>
                              {allergy.severity}
                            </span>
                            <span className="font-medium">{allergy.allergen}</span>
                            <span className="text-sm text-gray-600">- {allergy.reaction}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Medications */}
                  <div>
                    <h3 className="font-bold text-gray-900 mb-3">Active Medications</h3>
                    {drugHistory.active_medications.length > 0 ? (
                      <div className="space-y-2">
                        {drugHistory.active_medications.map((med) => (
                          <div key={med.id} className="p-3 bg-success-50 border border-success-200 rounded-lg">
                            <div className="font-medium">{med.medication_name}</div>
                            <div className="text-sm text-gray-600">
                              {med.dosage} | {med.frequency} | {med.route}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Started: {format(new Date(med.start_date), 'MMM dd, yyyy')}
                              {med.doctor_first_name && ` | By Dr. ${med.doctor_first_name} ${med.doctor_last_name}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">No active medications</p>
                    )}
                  </div>

                  {/* Order History */}
                  <div>
                    <h3 className="font-bold text-gray-900 mb-3">Prescription History</h3>
                    {drugHistory.orders.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {drugHistory.orders.map((order) => (
                          <div key={order.id} className="p-3 bg-gray-50 rounded-lg">
                            <div className="flex justify-between">
                              <span className="font-medium">{order.medication_name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                order.status === 'dispensed' ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {order.status}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600">
                              {order.dosage} | Qty: {order.quantity}
                            </div>
                            <div className="text-xs text-gray-500">
                              {format(new Date(order.ordered_date), 'MMM dd, yyyy')}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">No prescription history</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-gray-500">
                  Failed to load drug history
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacyDashboard;
