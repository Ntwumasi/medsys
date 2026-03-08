import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { format } from 'date-fns';
import AppLayout from '../components/AppLayout';
import { Card, Badge, Modal, EmptyState, SkeletonStatCard } from '../components/ui';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

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
  patient_allergies?: string;
  encounter_number?: string;
  chief_complaint?: string;
  primary_diagnosis?: string;
  provider_name?: string;
  dispensed_by?: string;
  dispensed_by_name?: string;
  payer_type?: string;
  payer_name?: string;
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
  supplier_id?: number;
  supplier_name?: string;
  location: string;
  is_low_stock: boolean;
  is_expiring_soon: boolean;
}

interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
  is_active: boolean;
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
  const { showToast } = useNotification();
  useAuth(); // Ensure user is authenticated

  // All pharmacy roles see the same dashboard - RBAC will be added later
  const title = 'Pharmacy Dashboard';
  const [activeTab, setActiveTab] = useState<'orders' | 'otc' | 'inventory' | 'procurement' | 'suppliers' | 'pricing' | 'refills' | 'revenue'>('orders');
  const [ordersSubTab, setOrdersSubTab] = useState<'pending' | 'in_progress' | 'history'>('pending');
  const [loading, setLoading] = useState(true);

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_person: '', phone: '', email: '', address: '', city: '', notes: ''
  });

  // Inventory edit modal
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null);

  // Prescription edit modal
  const [showEditOrderModal, setShowEditOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PharmacyOrder | null>(null);

  // Print label modal
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelOrder, setLabelOrder] = useState<PharmacyOrder | null>(null);

  // OTC walk-in patients
  const [walkInPatients, setWalkInPatients] = useState<any[]>([]);

  // Orders state
  const [, setRoutingRequests] = useState<RoutingRequest[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [orderStats, setOrderStats] = useState({ pending: 0, in_progress: 0, dispensed: 0 });
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

  // Refills calendar state
  const [refillsData, setRefillsData] = useState<any[]>([]);
  const [refillsMonth, setRefillsMonth] = useState(new Date());

  // Medication pricing state
  const [pricingSearch, setPricingSearch] = useState('');
  const [editingPrice, setEditingPrice] = useState<InventoryItem | null>(null);

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
      fetchOrderStats(),
      fetchInventory(),
      fetchSuppliers(),
      fetchWalkIns(),
    ]);
    setLoading(false);
  };

  const fetchSuppliers = async () => {
    try {
      const response = await apiClient.get('/suppliers?active_only=true');
      setSuppliers(response.data.suppliers || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchWalkIns = async () => {
    try {
      const response = await apiClient.get('/pharmacy/walk-ins');
      setWalkInPatients(response.data.walk_ins || []);
    } catch (error) {
      console.error('Error fetching walk-in patients:', error);
    }
  };

  const saveSupplier = async () => {
    try {
      if (editingSupplier) {
        await apiClient.put(`/suppliers/${editingSupplier.id}`, supplierForm);
        showToast('Supplier updated successfully', 'success');
      } else {
        await apiClient.post('/suppliers', supplierForm);
        showToast('Supplier created successfully', 'success');
      }
      setShowSupplierModal(false);
      setEditingSupplier(null);
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '', city: '', notes: '' });
      fetchSuppliers();
    } catch (error) {
      console.error('Error saving supplier:', error);
      showToast('Failed to save supplier', 'error');
    }
  };

  const deleteSupplier = async (id: number) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      await apiClient.delete(`/suppliers/${id}`);
      showToast('Supplier deleted', 'success');
      fetchSuppliers();
    } catch (error) {
      console.error('Error deleting supplier:', error);
      showToast('Failed to delete supplier', 'error');
    }
  };

  const updateInventoryItem = async (item: InventoryItem) => {
    try {
      await apiClient.put(`/inventory/${item.id}`, item);
      showToast('Inventory updated successfully', 'success');
      setShowInventoryModal(false);
      setEditingInventory(null);
      fetchInventory();
    } catch (error) {
      console.error('Error updating inventory:', error);
      showToast('Failed to update inventory', 'error');
    }
  };

  const deleteInventoryItem = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this inventory item?')) return;
    try {
      await apiClient.put(`/inventory/${id}`, { is_active: false });
      showToast('Inventory item deactivated', 'success');
      fetchInventory();
    } catch (error) {
      console.error('Error deactivating inventory:', error);
      showToast('Failed to deactivate item', 'error');
    }
  };

  const updatePharmacyOrderDetails = async () => {
    if (!editingOrder) return;
    try {
      await apiClient.put(`/orders/pharmacy/${editingOrder.id}`, {
        medication_name: editingOrder.medication_name,
        dosage: editingOrder.dosage,
        frequency: editingOrder.frequency,
        route: editingOrder.route,
        quantity: editingOrder.quantity,
        notes: editingOrder.notes
      });
      showToast('Prescription updated', 'success');
      setShowEditOrderModal(false);
      setEditingOrder(null);
      if (ordersSubTab === 'pending') fetchPendingOrders();
      else if (ordersSubTab === 'in_progress') fetchInProgressOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      showToast('Failed to update prescription', 'error');
    }
  };

  const printLabel = (order: PharmacyOrder) => {
    setLabelOrder(order);
    setShowLabelModal(true);
  };

  const handlePrintLabel = () => {
    window.print();
  };

  const fetchRoutingRequests = async () => {
    try {
      const response = await apiClient.get('/department-routing/pharmacy/queue');
      setRoutingRequests(response.data.queue || []);
    } catch (error) {
      console.error('Error fetching routing requests:', error);
    }
  };

  const fetchOrderStats = async () => {
    try {
      const [pendingRes, inProgressRes, dispensedRes] = await Promise.all([
        apiClient.get('/orders/pharmacy?status=ordered'),
        apiClient.get('/orders/pharmacy?status=in_progress'),
        apiClient.get('/orders/pharmacy?status=dispensed'),
      ]);
      setOrderStats({
        pending: (pendingRes.data.orders || []).length,
        in_progress: (inProgressRes.data.orders || []).length,
        dispensed: (dispensedRes.data.orders || []).length,
      });
    } catch (error) {
      console.error('Error fetching order stats:', error);
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

  const fetchInProgressOrders = async () => {
    try {
      const response = await apiClient.get('/orders/pharmacy?status=in_progress');
      setPharmacyOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error fetching in-progress orders:', error);
    }
  };

  const startProcessingOrder = async (orderId: number) => {
    try {
      await apiClient.put(`/orders/pharmacy/${orderId}`, {
        status: 'in_progress'
      });
      showToast('Order moved to In Progress', 'success');
      fetchPendingOrders();
      fetchOrderStats();
    } catch (error) {
      console.error('Error starting order:', error);
      showToast('Failed to start processing order', 'error');
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

  const fetchRefillsCalendar = async () => {
    try {
      const year = refillsMonth.getFullYear();
      const month = refillsMonth.getMonth() + 1;
      const response = await apiClient.get(`/pharmacy/refills?year=${year}&month=${month}`);
      setRefillsData(response.data.refills || []);
    } catch (error) {
      console.error('Error fetching refills:', error);
      setRefillsData([]);
    }
  };

  const updateMedicationPrice = async (itemId: number, newPrice: number) => {
    try {
      await apiClient.put(`/inventory/${itemId}`, { selling_price: newPrice });
      showToast('Price updated successfully', 'success');
      setEditingPrice(null);
      fetchInventory();
    } catch (error) {
      console.error('Error updating price:', error);
      showToast('Failed to update price', 'error');
    }
  };

  const dispenseMedication = async (orderId: number) => {
    try {
      await apiClient.put(`/orders/pharmacy/${orderId}`, {
        status: 'dispensed',
        dispensed_date: new Date().toISOString()
      });
      showToast('Medication dispensed successfully', 'success');
      // Refresh the appropriate tab and stats
      if (ordersSubTab === 'pending') fetchPendingOrders();
      else if (ordersSubTab === 'in_progress') fetchInProgressOrders();
      fetchOrderStats();
    } catch (error) {
      console.error('Error dispensing medication:', error);
      showToast('Failed to dispense medication', 'error');
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
      <AppLayout title={title}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <Card>
          <Card.Header>Loading...</Card.Header>
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        </Card>
      </AppLayout>
    );
  }

  const tabs = [
    { id: 'orders' as const, label: 'Prescriptions', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    )},
    { id: 'otc' as const, label: 'OTC / Walk-ins', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )},
    { id: 'inventory' as const, label: 'Inventory', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )},
    { id: 'procurement' as const, label: 'Procurement', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )},
    { id: 'suppliers' as const, label: 'Suppliers', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )},
    { id: 'pricing' as const, label: 'Pricing', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
      </svg>
    )},
    { id: 'refills' as const, label: 'Refills Calendar', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )},
    { id: 'revenue' as const, label: 'Revenue', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )},
  ];

  return (
    <AppLayout title={title}>
      {/* Navigation Tabs */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
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
                      {orderStats.pending}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-primary-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">In Progress</p>
                    <p className="text-2xl font-bold text-primary-600">
                      {orderStats.in_progress}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-success-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Dispensed Today</p>
                    <p className="text-2xl font-bold text-success-600">
                      {orderStats.dispensed}
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
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-4">
                <button
                  onClick={() => { setOrdersSubTab('pending'); fetchPendingOrders(); }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    ordersSubTab === 'pending' ? 'bg-success-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Pending Orders
                </button>
                <button
                  onClick={() => { setOrdersSubTab('in_progress'); fetchInProgressOrders(); }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    ordersSubTab === 'in_progress' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  In Progress
                </button>
                <button
                  onClick={() => { setOrdersSubTab('history'); fetchOrderHistory(); }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    ordersSubTab === 'history' ? 'bg-success-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Dispensed
                </button>
              </div>
              <button
                onClick={() => {
                  if (ordersSubTab === 'pending') fetchPendingOrders();
                  else if (ordersSubTab === 'in_progress') fetchInProgressOrders();
                  else fetchOrderHistory();
                }}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
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

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6">
              {/* Orders List */}
              <div className="xl:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold">
                    {ordersSubTab === 'pending' ? 'Pending Prescriptions' :
                     ordersSubTab === 'in_progress' ? 'In Progress Orders' : 'Dispensed Orders'}
                  </h2>
                </div>
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {pharmacyOrders.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                      No {ordersSubTab === 'pending' ? 'pending' : ordersSubTab === 'in_progress' ? 'in-progress' : 'dispensed'} orders found
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
                            <div className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                              <span>Patient: <span className="font-medium">{order.patient_name || `ID: ${order.patient_id}`}</span></span>
                              {order.payer_type && (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  order.payer_type === 'insurance' ? 'bg-primary-100 text-primary-700' :
                                  order.payer_type === 'corporate' ? 'bg-purple-100 text-purple-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {order.payer_name || order.payer_type}
                                </span>
                              )}
                              {order.patient_allergies && (
                                <span className="px-2 py-0.5 text-xs font-bold bg-danger-100 text-danger-700 rounded-full border border-danger-300 animate-pulse">
                                  ⚠️ ALLERGIES: {order.patient_allergies}
                                </span>
                              )}
                            </div>
                            {order.primary_diagnosis && (
                              <div className="text-xs text-primary-600 mt-1">
                                <span className="font-medium">Dx:</span> {order.primary_diagnosis}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              <span>Ordered: {format(new Date(order.ordered_date), 'MMM dd, yyyy HH:mm')}</span>
                              {order.dispensed_by_name && (
                                <span className="text-success-600">• Dispensed by: {order.dispensed_by_name}</span>
                              )}
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
                                  startProcessingOrder(order.id);
                                }}
                                className="px-3 py-1 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                              >
                                Start Processing
                              </button>
                            )}
                            {ordersSubTab === 'in_progress' && (
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
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingOrder(order);
                                  setShowEditOrderModal(true);
                                }}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                                title="Edit"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  printLabel(order);
                                }}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                                title="Print Label"
                              >
                                Label
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fetchDrugHistory(order.patient_id, order.patient_name || `Patient ${order.patient_id}`);
                                }}
                                className="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded hover:bg-primary-200"
                              >
                                History
                              </button>
                            </div>
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

        {/* OTC / WALK-INS TAB */}
        {activeTab === 'otc' && (
          <div>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-purple-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Walk-in Patients</p>
                    <p className="text-2xl font-bold text-purple-600">{walkInPatients.length}</p>
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
                    <p className="text-2xl font-bold text-warning-600">
                      {walkInPatients.filter(p => p.status === 'pending').length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-primary-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">In Progress</p>
                    <p className="text-2xl font-bold text-primary-600">
                      {walkInPatients.filter(p => p.status === 'in-progress').length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Walk-in Patients List */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">OTC / Walk-in Patients</h2>
                <button
                  onClick={fetchWalkIns}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>
              <div className="p-6">
                {walkInPatients.length === 0 ? (
                  <EmptyState
                    icon={
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    }
                    title="No walk-in patients"
                    description="When receptionist routes a patient for OTC/walk-in pharmacy service, they will appear here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payer</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chief Complaint</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Routed At</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {walkInPatients.map((patient) => (
                          <tr key={patient.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-medium text-gray-900">{patient.patient_name || 'Unknown'}</div>
                              <div className="text-sm text-gray-500">{patient.patient_number}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                patient.payer_type === 'insurance' ? 'bg-primary-100 text-primary-700' :
                                patient.payer_type === 'corporate' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {patient.payer_type === 'self_pay' ? 'Self Pay' : patient.payer_type || 'Self Pay'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900">{patient.chief_complaint || 'OTC Purchase'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(patient.routed_at), 'MMM dd, HH:mm')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={patient.status === 'pending' ? 'warning' : patient.status === 'in-progress' ? 'info' : 'success'}>
                                {patient.status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                              {patient.status === 'pending' && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await apiClient.put(`/department-routing/${patient.id}/status`, { status: 'in-progress' });
                                      showToast('Started attending to patient', 'success');
                                      fetchWalkIns();
                                    } catch (error) {
                                      showToast('Failed to update status', 'error');
                                    }
                                  }}
                                  className="text-primary-600 hover:text-primary-900"
                                >
                                  Start
                                </button>
                              )}
                              {patient.status === 'in-progress' && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await apiClient.put(`/department-routing/${patient.id}/status`, { status: 'completed' });
                                      showToast('Patient service completed', 'success');
                                      fetchWalkIns();
                                    } catch (error) {
                                      showToast('Failed to update status', 'error');
                                    }
                                  }}
                                  className="text-success-600 hover:text-success-900"
                                >
                                  Complete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                      <td className="px-6 py-4 text-sm text-gray-600">{item.supplier_name || item.supplier || '-'}</td>
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
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingInventory(item); setShowInventoryModal(true); }}
                            className="p-1 text-primary-600 hover:text-primary-800"
                            title="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteInventoryItem(item.id)}
                            className="p-1 text-danger-600 hover:text-danger-800"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
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

        {/* PROCUREMENT TAB */}
        {activeTab === 'procurement' && (
          <div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Record Purchase</h2>
              <p className="text-gray-500 mb-4">Add stock from supplier purchases</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medication</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    <option value="">Select medication...</option>
                    {inventory.map((item) => (
                      <option key={item.id} value={item.id}>{item.medication_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    <option value="">Select supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Enter quantity" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (GH₵)</label>
                  <input type="number" step="0.01" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Batch/Lot Number</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              </div>
              <div className="mt-4">
                <button className="px-6 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 font-medium">
                  Record Purchase
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Recent Purchases</h2>
              </div>
              <div className="p-6 text-center text-gray-500">
                Purchase history will appear here
              </div>
            </div>
          </div>
        )}

        {/* SUPPLIERS TAB */}
        {activeTab === 'suppliers' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Supplier Management</h2>
              <button
                onClick={() => {
                  setEditingSupplier(null);
                  setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '', city: '', notes: '' });
                  setShowSupplierModal(true);
                }}
                className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Supplier
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact Person</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{supplier.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{supplier.contact_person}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{supplier.phone}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{supplier.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{supplier.city}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setSupplierForm({
                                name: supplier.name,
                                contact_person: supplier.contact_person || '',
                                phone: supplier.phone || '',
                                email: supplier.email || '',
                                address: supplier.address || '',
                                city: supplier.city || '',
                                notes: supplier.notes || ''
                              });
                              setShowSupplierModal(true);
                            }}
                            className="p-1 text-primary-600 hover:text-primary-800"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteSupplier(supplier.id)}
                            className="p-1 text-danger-600 hover:text-danger-800"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {suppliers.length === 0 && (
                <div className="py-12 text-center text-gray-500">No suppliers found</div>
              )}
            </div>
          </div>
        )}

        {/* PRICING TAB */}
        {activeTab === 'pricing' && (
          <div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-semibold">Medication Pricing</h2>
                  <p className="text-gray-500 text-sm">Set and manage prices for each medication</p>
                </div>
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Search medications..."
                    value={pricingSearch}
                    onChange={(e) => setPricingSearch(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-success-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Medication</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Price</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Selling Price</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Margin</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {inventory
                      .filter(item =>
                        pricingSearch === '' ||
                        item.medication_name.toLowerCase().includes(pricingSearch.toLowerCase()) ||
                        item.generic_name?.toLowerCase().includes(pricingSearch.toLowerCase())
                      )
                      .map((item) => {
                        const margin = item.selling_price && item.unit_cost
                          ? (((item.selling_price - item.unit_cost) / item.unit_cost) * 100).toFixed(1)
                          : '0';
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{item.medication_name}</div>
                              <div className="text-sm text-gray-500">{item.generic_name}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">{item.category}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{item.unit}</td>
                            <td className="px-6 py-4 text-right text-sm text-gray-500">
                              GH₵ {parseFloat(String(item.unit_cost || 0)).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {editingPrice?.id === item.id ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  defaultValue={item.selling_price}
                                  className="w-24 border border-gray-300 rounded px-2 py-1 text-right"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      updateMedicationPrice(item.id, parseFloat((e.target as HTMLInputElement).value));
                                    } else if (e.key === 'Escape') {
                                      setEditingPrice(null);
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span className="font-medium text-gray-900">
                                  GH₵ {parseFloat(String(item.selling_price || 0)).toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={`text-sm font-medium ${
                                parseFloat(margin) >= 30 ? 'text-success-600' :
                                parseFloat(margin) >= 15 ? 'text-warning-600' :
                                'text-danger-600'
                              }`}>
                                {margin}%
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {editingPrice?.id === item.id ? (
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => setEditingPrice(null)}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingPrice(item)}
                                  className="text-primary-600 hover:text-primary-800 font-medium"
                                >
                                  Edit Price
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {inventory.filter(item =>
                pricingSearch === '' ||
                item.medication_name.toLowerCase().includes(pricingSearch.toLowerCase())
              ).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No medications found matching your search
                </div>
              )}
            </div>
          </div>
        )}

        {/* REFILLS CALENDAR TAB */}
        {activeTab === 'refills' && (
          <div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-semibold">Refills Calendar</h2>
                  <p className="text-gray-500 text-sm">Track upcoming medication refills for patients</p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      const newDate = new Date(refillsMonth);
                      newDate.setMonth(newDate.getMonth() - 1);
                      setRefillsMonth(newDate);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="font-medium text-lg">
                    {format(refillsMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    onClick={() => {
                      const newDate = new Date(refillsMonth);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setRefillsMonth(newDate);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={fetchRefillsCalendar}
                    className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 font-medium"
                  >
                    Load Refills
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center py-2 font-medium text-gray-500 text-sm">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const year = refillsMonth.getFullYear();
                  const month = refillsMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const today = new Date();

                  const days = [];

                  // Empty cells for days before the first of the month
                  for (let i = 0; i < firstDay; i++) {
                    days.push(<div key={`empty-${i}`} className="min-h-24 bg-gray-50 rounded-lg"></div>);
                  }

                  // Days of the month
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayRefills = refillsData.filter(r => r.refill_date?.startsWith(dateStr));
                    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;

                    days.push(
                      <div
                        key={day}
                        className={`min-h-24 p-2 rounded-lg border ${
                          isToday ? 'border-success-500 bg-success-50' : 'border-gray-200 bg-white'
                        } hover:shadow-md transition-shadow`}
                      >
                        <div className={`text-sm font-medium ${isToday ? 'text-success-700' : 'text-gray-700'}`}>
                          {day}
                        </div>
                        <div className="mt-1 space-y-1 max-h-16 overflow-y-auto">
                          {dayRefills.map((refill, idx) => (
                            <div
                              key={idx}
                              className="text-xs bg-primary-100 text-primary-800 rounded px-1 py-0.5 truncate"
                              title={`${refill.patient_name}: ${refill.medication_name}`}
                            >
                              {refill.patient_name?.split(' ')[0]}: {refill.medication_name}
                            </div>
                          ))}
                        </div>
                        {dayRefills.length > 2 && (
                          <div className="text-xs text-gray-500 mt-1">
                            +{dayRefills.length - 2} more
                          </div>
                        )}
                      </div>
                    );
                  }

                  return days;
                })()}
              </div>

              {/* Upcoming Refills List */}
              <div className="mt-8">
                <h3 className="font-semibold text-gray-900 mb-4">Upcoming Refills This Month</h3>
                {refillsData.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {refillsData.map((refill, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <span className="font-medium">{refill.patient_name}</span>
                          <span className="text-gray-500 ml-2">({refill.patient_number})</span>
                        </div>
                        <div className="text-sm text-gray-600">{refill.medication_name}</div>
                        <div className="text-sm font-medium text-primary-600">
                          {refill.refill_date ? format(new Date(refill.refill_date), 'MMM dd, yyyy') : 'N/A'}
                        </div>
                        <Badge variant={refill.refills_remaining > 0 ? 'success' : 'warning'}>
                          {refill.refills_remaining} refills left
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p>Click "Load Refills" to see scheduled refills for this month</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Supplier Modal */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => { setShowSupplierModal(false); setEditingSupplier(null); }}
        title={editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
              <input
                type="text"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
              <input
                type="text"
                value={supplierForm.contact_person}
                onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={supplierForm.email}
                onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={supplierForm.city}
                onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              value={supplierForm.address}
              onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={supplierForm.notes}
              onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => { setShowSupplierModal(false); setEditingSupplier(null); }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={saveSupplier}
              className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700"
            >
              {editingSupplier ? 'Update' : 'Create'} Supplier
            </button>
          </div>
        </div>
      </Modal>

      {/* Inventory Edit Modal */}
      <Modal
        isOpen={showInventoryModal}
        onClose={() => { setShowInventoryModal(false); setEditingInventory(null); }}
        title="Edit Inventory Item"
        size="lg"
      >
        {editingInventory && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medication Name</label>
                <input
                  type="text"
                  value={editingInventory.medication_name}
                  onChange={(e) => setEditingInventory({ ...editingInventory, medication_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
                <input
                  type="text"
                  value={editingInventory.generic_name || ''}
                  onChange={(e) => setEditingInventory({ ...editingInventory, generic_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={editingInventory.category || ''}
                  onChange={(e) => setEditingInventory({ ...editingInventory, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <input
                  type="text"
                  value={editingInventory.unit}
                  onChange={(e) => setEditingInventory({ ...editingInventory, unit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                <input
                  type="number"
                  value={editingInventory.reorder_level}
                  onChange={(e) => setEditingInventory({ ...editingInventory, reorder_level: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingInventory.selling_price}
                  onChange={(e) => setEditingInventory({ ...editingInventory, selling_price: parseFloat(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                <select
                  value={editingInventory.supplier_id || ''}
                  onChange={(e) => setEditingInventory({ ...editingInventory, supplier_id: parseInt(e.target.value) || undefined })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={editingInventory.expiry_date ? editingInventory.expiry_date.split('T')[0] : ''}
                  onChange={(e) => setEditingInventory({ ...editingInventory, expiry_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => { setShowInventoryModal(false); setEditingInventory(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => updateInventoryItem(editingInventory)}
                className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Prescription Modal */}
      <Modal
        isOpen={showEditOrderModal}
        onClose={() => { setShowEditOrderModal(false); setEditingOrder(null); }}
        title="Edit Prescription"
        size="lg"
      >
        {editingOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medication</label>
                <input
                  type="text"
                  value={editingOrder.medication_name}
                  onChange={(e) => setEditingOrder({ ...editingOrder, medication_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
                <input
                  type="text"
                  value={editingOrder.dosage}
                  onChange={(e) => setEditingOrder({ ...editingOrder, dosage: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                <input
                  type="text"
                  value={editingOrder.frequency}
                  onChange={(e) => setEditingOrder({ ...editingOrder, frequency: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                <input
                  type="text"
                  value={editingOrder.route}
                  onChange={(e) => setEditingOrder({ ...editingOrder, route: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="text"
                  value={editingOrder.quantity}
                  onChange={(e) => setEditingOrder({ ...editingOrder, quantity: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={editingOrder.notes || ''}
                onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => { setShowEditOrderModal(false); setEditingOrder(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={updatePharmacyOrderDetails}
                className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Print Label Modal */}
      <Modal
        isOpen={showLabelModal}
        onClose={() => { setShowLabelModal(false); setLabelOrder(null); }}
        title="Prescription Label"
        size="md"
      >
        {labelOrder && (
          <div>
            <div className="border-2 border-dashed border-gray-300 p-6 mb-4 print:border-solid" id="prescription-label">
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold">MEDSYS PHARMACY</h3>
                <p className="text-sm text-gray-500">Patient Prescription Label</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">Patient:</span>
                  <span>{labelOrder.patient_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Patient #:</span>
                  <span>{labelOrder.patient_number}</span>
                </div>
                <hr className="my-2" />
                <div className="text-center">
                  <p className="text-lg font-bold">{labelOrder.medication_name}</p>
                  <p className="text-base">{labelOrder.dosage}</p>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between">
                  <span className="font-medium">Take:</span>
                  <span>{labelOrder.frequency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Route:</span>
                  <span>{labelOrder.route}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Quantity:</span>
                  <span>{labelOrder.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Refills:</span>
                  <span>{labelOrder.refills || 0}</span>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Dispensed:</span>
                  <span>{format(new Date(), 'MMM dd, yyyy')}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLabelModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={handlePrintLabel}
                className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Label
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Drug History Modal */}
      <Modal
        isOpen={showDrugHistory}
        onClose={() => setShowDrugHistory(false)}
        title={`Drug History - ${drugHistoryPatientName}`}
        size="xl"
      >
        {loadingDrugHistory ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-success-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading drug history...</p>
          </div>
        ) : drugHistory ? (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-danger-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-danger-600">{drugHistory.allergies.length}</p>
                <p className="text-xs text-danger-700">Allergies</p>
              </div>
              <div className="bg-success-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-success-600">{drugHistory.active_medications.length}</p>
                <p className="text-xs text-success-700">Active Meds</p>
              </div>
              <div className="bg-primary-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-primary-600">{drugHistory.orders.length}</p>
                <p className="text-xs text-primary-700">Total Orders</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-600">
                  {drugHistory.orders.filter(o => o.status === 'dispensed').length}
                </p>
                <p className="text-xs text-gray-700">Dispensed</p>
              </div>
            </div>

            {/* Allergies - Always prominent at top */}
            {drugHistory.allergies.length > 0 && (
              <div className="bg-danger-50 border-2 border-danger-300 rounded-xl p-4 shadow-sm">
                <h3 className="font-bold text-danger-700 mb-3 flex items-center gap-2 text-lg">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  ⚠️ Known Allergies - VERIFY BEFORE DISPENSING
                </h3>
                <div className="grid gap-2">
                  {drugHistory.allergies.map((allergy) => (
                    <div key={allergy.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-danger-200">
                      <Badge variant={allergy.severity === 'severe' ? 'danger' : allergy.severity === 'moderate' ? 'warning' : 'gray'}>
                        {allergy.severity?.toUpperCase()}
                      </Badge>
                      <div>
                        <span className="font-bold text-danger-800">{allergy.allergen}</span>
                        <span className="text-danger-600 ml-2">→ {allergy.reaction}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Active Medications */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
                  <svg className="w-5 h-5 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Active Medications ({drugHistory.active_medications.length})
                </h3>
                {drugHistory.active_medications.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {drugHistory.active_medications.map((med) => (
                      <div key={med.id} className="p-3 bg-success-50 border border-success-200 rounded-lg">
                        <div className="font-semibold text-success-800">{med.medication_name}</div>
                        <div className="text-sm text-success-700">
                          {med.dosage} • {med.frequency} • {med.route}
                        </div>
                        <div className="text-xs text-success-600 mt-1 flex justify-between">
                          <span>Since: {format(new Date(med.start_date), 'MMM dd, yyyy')}</span>
                          {med.doctor_first_name && <span>Dr. {med.doctor_first_name} {med.doctor_last_name}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="text-sm">No active medications</p>
                  </div>
                )}
              </div>

              {/* Order History */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
                  <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Prescription History ({drugHistory.orders.length})
                </h3>
                {drugHistory.orders.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {drugHistory.orders.map((order) => (
                      <div key={order.id} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <span className="font-medium text-gray-900">{order.medication_name}</span>
                            <div className="text-xs text-gray-600 mt-0.5">
                              {order.dosage} • {order.frequency} • {order.route}
                            </div>
                          </div>
                          <Badge variant={order.status === 'dispensed' ? 'success' : order.status === 'ordered' ? 'warning' : 'gray'} size="sm">
                            {order.status}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                          <span>Qty: <span className="font-medium">{order.quantity}</span> {order.refills > 0 && <span className="text-primary-600">• {order.refills} refills</span>}</span>
                          <span>{format(new Date(order.ordered_date), 'MMM dd, yyyy')}</span>
                        </div>
                        {order.provider_name && (
                          <div className="text-xs text-gray-400 mt-1">By: {order.provider_name}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm">No prescription history</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Failed to load"
            description="Unable to load drug history. Please try again."
          />
        )}
      </Modal>
    </AppLayout>
  );
};

export default PharmacyDashboard;
