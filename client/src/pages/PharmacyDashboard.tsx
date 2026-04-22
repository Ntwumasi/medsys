import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { format } from 'date-fns';
import AppLayout from '../components/AppLayout';
import DepartmentGuide from '../components/DepartmentGuide';
import { pharmacyGuideSections } from '../components/guides/pharmacyGuideContent';
import { Card, Badge, Modal, EmptyState, SkeletonStatCard } from '../components/ui';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { DispensingAnalytics } from '../components/pharmacy';
// TODO: Integrate these components:
// - ExpiryCalendar: Add to inventory tab for visual batch expiry view
// - MedicationTimeline: Add to patient details panel in orders
// - BatchExpiryWarning: Show during dispense when near-expiry batches selected

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
  inventory_id?: number;
  inventory_quantity?: number;
  inventory_price?: number;
  inventory_medication_name?: string;
  substitute_medication?: string;
  substitute_reason?: string;
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

interface WalkInMedication {
  inventory_id: number;
  medication_name: string;
  quantity: number;
  unit_price: number;
  dosage: string;
  frequency: string;
  duration_days: number | '';
  instructions: string;
}

interface WalkInPatient {
  id: number;
  encounter_id: number;
  patient_id: number;
  patient_name: string;
  patient_number: string;
  payer_type: string;
  chief_complaint: string;
  status: string;
  routed_at: string;
}

const PharmacyDashboard: React.FC = () => {
  const { showToast } = useNotification();
  useAuth(); // Ensure user is authenticated

  // All pharmacy roles see the same dashboard - RBAC will be added later
  const title = 'Pharmacy Dashboard';
  const [activeTab, setActiveTab] = useState<'orders' | 'otc' | 'inventory' | 'procurement' | 'suppliers' | 'pricing' | 'revenue' | 'analytics'>('orders');
  const [showGuide, setShowGuide] = useState(false);
  const [ordersSubTab, setOrdersSubTab] = useState<'pending' | 'in_progress' | 'ready' | 'history'>('pending');
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
  const [walkInPatients, setWalkInPatients] = useState<WalkInPatient[]>([]);

  // Walk-in serve modal state
  const [showServeWalkInModal, setShowServeWalkInModal] = useState(false);
  const [servingWalkIn, setServingWalkIn] = useState<WalkInPatient | null>(null);
  const [walkInMedications, setWalkInMedications] = useState<WalkInMedication[]>([]);
  const [walkInMedSearch, setWalkInMedSearch] = useState('');
  const [walkInPrescriptionFiles, setWalkInPrescriptionFiles] = useState<File[]>([]);
  const [walkInPrescriptionPreviews, setWalkInPrescriptionPreviews] = useState<string[]>([]);
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false);

  // Orders state
  const [, setRoutingRequests] = useState<RoutingRequest[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [orderStats, setOrderStats] = useState({ pending: 0, in_progress: 0, dispensed: 0 });
  const [selectedOrder, setSelectedOrder] = useState<PharmacyOrder | null>(null);
  const [patientDiagnoses, setPatientDiagnoses] = useState<Diagnosis[]>([]);
  const [patientAllergies, setPatientAllergies] = useState<Allergy[]>([]);
  const [expandedMedication, setExpandedMedication] = useState<number | null>(null);

  // Group orders by patient
  interface GroupedPatientOrders {
    patient_id: number;
    patient_name: string;
    patient_number: string;
    patient_allergies: string | null;
    payer_type: string;
    payer_name: string;
    encounter_id: number;
    ordered_date: string;
    orders: PharmacyOrder[];
  }

  const groupedOrders: GroupedPatientOrders[] = React.useMemo(() => {
    const groups: Record<string, GroupedPatientOrders> = {};

    pharmacyOrders.forEach(order => {
      const key = `${order.patient_id}-${order.encounter_id}`;
      if (!groups[key]) {
        groups[key] = {
          patient_id: order.patient_id,
          patient_name: order.patient_name || `Patient ${order.patient_id}`,
          patient_number: order.patient_number || '',
          patient_allergies: order.patient_allergies || null,
          payer_type: order.payer_type || 'self_pay',
          payer_name: order.payer_name || 'Self Pay',
          encounter_id: order.encounter_id,
          ordered_date: order.ordered_date,
          orders: []
        };
      }
      groups[key].orders.push(order);
    });

    // Sort by ordered_date ascending (earliest first for FIFO processing)
    return Object.values(groups).sort((a, b) =>
      new Date(a.ordered_date).getTime() - new Date(b.ordered_date).getTime()
    );
  }, [pharmacyOrders]);

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low_stock' | 'expiring' | 'expired'>('all');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategories, setInventoryCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
  const [inventoryBatches, setInventoryBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [batchQuantityEdits, setBatchQuantityEdits] = useState<Record<number, number>>({});
  const [newInventoryForm, setNewInventoryForm] = useState({
    medication_name: '',
    generic_name: '',
    category: '',
    unit: 'tablet',
    quantity_on_hand: 0,
    reorder_level: 10,
    unit_cost: 0,
    selling_price: 0,
    expiry_date: ''
  });

  // Date range state - default to today for dispensed orders
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Drug history modal
  const [showDrugHistory, setShowDrugHistory] = useState(false);
  const [drugHistoryPatientName, setDrugHistoryPatientName] = useState('');
  const [drugHistory, setDrugHistory] = useState<DrugHistory | null>(null);
  const [loadingDrugHistory, setLoadingDrugHistory] = useState(false);

  // Revenue state
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);

  // Medication pricing state
  const [pricingSearch, setPricingSearch] = useState('');
  const [editingPrice, setEditingPrice] = useState<InventoryItem | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>('');

  // Procurement state — invoice-level header + multi-item line items
  const [invoiceHeader, setInvoiceHeader] = useState({
    supplier_id: '',
    invoice_number: '',
    invoice_date: ''
  });
  const emptyLineItem = {
    inventory_id: '',
    quantity: '',
    unit_cost: '',
    discount_percent: '',
    new_selling_price: '',
    batch_number: '',
    expiry_date: ''
  };
  const [procurementItems, setProcurementItems] = useState([{ ...emptyLineItem }]);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [submittingProcurement, setSubmittingProcurement] = useState(false);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<number | null>(null);

  const updateLineItem = (index: number, field: string, value: string) => {
    setProcurementItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };
  const removeLineItem = (index: number) => {
    setProcurementItems(prev => prev.filter((_, i) => i !== index));
  };
  const addLineItem = () => {
    setProcurementItems(prev => [...prev, { ...emptyLineItem }]);
  };

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

  useEffect(() => {
    if (activeTab === 'procurement') {
      fetchPurchaseHistory();
    }
    if (activeTab === 'revenue') {
      fetchRevenueSummary();
    }
    // Clear selected order when switching main tabs
    setSelectedOrder(null);
  }, [activeTab]);

  // Refetch inventory when filter or search changes
  useEffect(() => {
    if (activeTab === 'inventory') {
      fetchInventory();
    }
  }, [inventoryFilter, inventorySearch]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([
      fetchRoutingRequests(),
      fetchPendingOrders(),
      fetchOrderStats(),
      fetchInventory(),
      fetchSuppliers(),
      fetchWalkIns(),
      fetchInventoryCategories(),
    ]);
    setLoading(false);
  };

  const fetchInventoryCategories = async () => {
    try {
      const response = await apiClient.get('/inventory/categories');
      // Extract just the category names from the response
      const categories = (response.data.categories || []).map((c: any) =>
        typeof c === 'string' ? c : c.category
      );
      setInventoryCategories(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const createInventoryItem = async () => {
    const { medication_name, category, unit, quantity_on_hand, reorder_level, unit_cost, selling_price } = newInventoryForm;

    if (!medication_name || !category || !unit) {
      showToast('Please fill in medication name, category, and unit', 'error');
      return;
    }

    try {
      await apiClient.post('/inventory', {
        ...newInventoryForm,
        quantity_on_hand: parseInt(String(quantity_on_hand)) || 0,
        reorder_level: parseInt(String(reorder_level)) || 10,
        unit_cost: parseFloat(String(unit_cost)) || 0,
        selling_price: parseFloat(String(selling_price)) || 0,
      });
      showToast('Inventory item created successfully', 'success');
      setShowAddInventoryModal(false);
      setNewInventoryForm({
        medication_name: '',
        generic_name: '',
        category: '',
        unit: 'tablet',
        quantity_on_hand: 0,
        reorder_level: 10,
        unit_cost: 0,
        selling_price: 0,
        expiry_date: ''
      });
      fetchInventory();
      fetchInventoryCategories();
    } catch (error: any) {
      console.error('Error creating inventory item:', error);
      const message = error.response?.data?.error || 'Failed to create inventory item';
      showToast(message, 'error');
    }
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

  // Walk-in serve functions
  const openServeWalkInModal = (patient: WalkInPatient) => {
    setServingWalkIn(patient);
    setWalkInMedications([]);
    setWalkInMedSearch('');
    setWalkInPrescriptionFiles([]);
    setWalkInPrescriptionPreviews([]);
    setShowServeWalkInModal(true);
  };

  const closeServeWalkInModal = () => {
    setShowServeWalkInModal(false);
    setServingWalkIn(null);
    setWalkInMedications([]);
    setWalkInMedSearch('');
    setWalkInPrescriptionFiles([]);
    setWalkInPrescriptionPreviews([]);
  };

  const addWalkInMedication = (item: InventoryItem) => {
    // Check if already added
    if (walkInMedications.some(m => m.inventory_id === item.id)) {
      showToast('Medication already added', 'warning');
      return;
    }
    setWalkInMedications([...walkInMedications, {
      inventory_id: item.id,
      medication_name: item.medication_name,
      quantity: 1,
      unit_price: item.selling_price,
      dosage: '',
      frequency: '',
      duration_days: '',
      instructions: ''
    }]);
    setWalkInMedSearch('');
  };

  const updateWalkInMedication = (index: number, field: keyof WalkInMedication, value: string | number) => {
    const updated = [...walkInMedications];
    updated[index] = { ...updated[index], [field]: value };
    setWalkInMedications(updated);
  };

  const removeWalkInMedication = (index: number) => {
    setWalkInMedications(walkInMedications.filter((_, i) => i !== index));
  };

  const handlePrescriptionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    const validFiles = newFiles.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');

    if (validFiles.length !== newFiles.length) {
      showToast('Only images and PDFs are allowed', 'warning');
    }

    // Create previews for images
    const newPreviews: string[] = [];
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setWalkInPrescriptionPreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      } else {
        newPreviews.push('pdf'); // Placeholder for PDF
      }
    });

    setWalkInPrescriptionFiles(prev => [...prev, ...validFiles]);
  };

  const removePrescriptionFile = (index: number) => {
    setWalkInPrescriptionFiles(prev => prev.filter((_, i) => i !== index));
    setWalkInPrescriptionPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const submitWalkInOrder = async () => {
    if (!servingWalkIn) return;

    if (walkInMedications.length === 0) {
      showToast('Please add at least one medication', 'error');
      return;
    }

    setSubmittingWalkIn(true);
    try {
      await apiClient.post('/pharmacy/walk-in-dispense', {
        patient_id: servingWalkIn.patient_id,
        encounter_id: servingWalkIn.encounter_id,
        routing_id: servingWalkIn.id,
        medications: walkInMedications,
      });

      // Upload any prescription files as patient documents (stored in DB)
      if (walkInPrescriptionFiles.length > 0) {
        let uploadedCount = 0;
        for (const file of walkInPrescriptionFiles) {
          try {
            const dataUrl: string = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });

            await apiClient.post('/documents', {
              patient_id: servingWalkIn.patient_id,
              encounter_id: servingWalkIn.encounter_id,
              document_type: 'prescription',
              document_name: file.name,
              file_type: file.type,
              file_data: dataUrl,
              description: 'Walk-in prescription',
            });
            uploadedCount++;
          } catch (uploadErr) {
            console.error(`Failed to upload ${file.name}:`, uploadErr);
          }
        }

        if (uploadedCount === walkInPrescriptionFiles.length) {
          showToast(`Walk-in order completed. ${uploadedCount} prescription file(s) uploaded.`, 'success');
        } else if (uploadedCount > 0) {
          showToast(`Walk-in order completed. ${uploadedCount}/${walkInPrescriptionFiles.length} prescription file(s) uploaded.`, 'warning');
        } else {
          showToast('Walk-in order completed, but prescription uploads failed. You can re-upload from the Documents tab.', 'warning');
        }
      } else {
        showToast('Walk-in order completed successfully', 'success');
      }
      closeServeWalkInModal();
      fetchWalkIns();
      fetchInventory(); // Refresh inventory counts
    } catch (error: any) {
      console.error('Error submitting walk-in order:', error);
      showToast(error.response?.data?.error || 'Failed to complete order', 'error');
    } finally {
      setSubmittingWalkIn(false);
    }
  };

  // Filter inventory for walk-in medication search
  const filteredWalkInInventory = walkInMedSearch.length >= 2
    ? inventory.filter(item =>
        item.medication_name.toLowerCase().includes(walkInMedSearch.toLowerCase()) &&
        item.quantity_on_hand > 0
      ).slice(0, 10)
    : [];

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
      // Send only the editable fields with proper null handling
      const updateData = {
        medication_name: item.medication_name || undefined,
        generic_name: item.generic_name || undefined,
        category: item.category || undefined,
        unit: item.unit || undefined,
        reorder_level: isNaN(item.reorder_level) ? undefined : item.reorder_level,
        unit_cost: isNaN(item.unit_cost) ? undefined : item.unit_cost,
        selling_price: isNaN(item.selling_price) ? undefined : item.selling_price,
        expiry_date: item.expiry_date || undefined,
        supplier_id: item.supplier_id || undefined,
      };
      await apiClient.put(`/inventory/${item.id}`, updateData);

      // Save batch quantity changes if any
      const batchChanges = Object.entries(batchQuantityEdits)
        .filter(([batchId, qty]) => {
          const batch = inventoryBatches.find(b => b.id === parseInt(batchId));
          return batch && batch.quantity !== qty;
        })
        .map(([batchId, quantity]) => ({ batchId: parseInt(batchId), quantity }));

      if (batchChanges.length > 0) {
        await apiClient.put(`/inventory/${item.id}/batches`, {
          batches: batchChanges,
          reason: 'Stock adjustment from inventory edit'
        });
      }

      showToast('Inventory updated successfully', 'success');
      setShowInventoryModal(false);
      setEditingInventory(null);
      setBatchQuantityEdits({});
      fetchInventory();
    } catch (error: any) {
      console.error('Error updating inventory:', error);
      const message = error.response?.data?.error || 'Failed to update inventory';
      showToast(message, 'error');
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
        dosage: editingOrder.dosage,
        quantity: editingOrder.quantity,
        notes: editingOrder.notes,
        substitute_medication: editingOrder.substitute_medication || null,
        substitute_reason: editingOrder.substitute_reason || null,
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

  const fetchReadyOrders = async () => {
    try {
      const response = await apiClient.get('/orders/pharmacy?status=ready');
      setPharmacyOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error fetching ready orders:', error);
    }
  };

  const markReadyForPickup = async (orderId: number) => {
    try {
      await apiClient.put(`/orders/pharmacy/${orderId}`, {
        status: 'ready'
      });
      showToast('Medication marked ready for pickup - Nurse notified', 'success');
      fetchInProgressOrders();
      fetchOrderStats();
    } catch (error) {
      console.error('Error marking order ready:', error);
      showToast('Failed to mark medication ready', 'error');
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
      else if (inventoryFilter === 'expired') url += '?expired=true';
      if (inventorySearch) url += `${url.includes('?') ? '&' : '?'}search=${inventorySearch}`;

      const response = await apiClient.get(url);
      setInventory(response.data.inventory || []);
      setInventoryStats(response.data.stats || null);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const fetchInventoryBatches = async (inventoryId: number) => {
    setLoadingBatches(true);
    try {
      const response = await apiClient.get(`/inventory/${inventoryId}/batches`);
      setInventoryBatches(response.data.batches || []);
    } catch (error) {
      console.error('Error fetching batches:', error);
      setInventoryBatches([]);
    } finally {
      setLoadingBatches(false);
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

  const updateMedicationPrice = async (itemId: number, newPrice: number) => {
    if (isNaN(newPrice) || newPrice < 0) {
      showToast('Please enter a valid price', 'error');
      return;
    }
    try {
      await apiClient.put(`/inventory/${itemId}`, { selling_price: newPrice });
      showToast('Price updated successfully', 'success');
      setEditingPrice(null);
      fetchInventory();
    } catch (error: any) {
      console.error('Error updating price:', error);
      const message = error.response?.data?.error || 'Failed to update price';
      showToast(message, 'error');
    }
  };

  // Procurement functions
  const fetchPurchaseHistory = async () => {
    try {
      const response = await apiClient.get('/inventory/purchases');
      setPurchaseHistory(response.data.purchases || []);
    } catch (error) {
      console.error('Error fetching purchase history:', error);
    }
  };

  const submitProcurement = async () => {
    // Validate all line items
    const validItems = procurementItems.filter(item => item.inventory_id && item.quantity && item.unit_cost);
    if (validItems.length === 0) {
      showToast('Please add at least one medication with quantity and unit cost', 'error');
      return;
    }

    for (const item of validItems) {
      const qty = parseInt(item.quantity);
      const cost = parseFloat(item.unit_cost);
      if (isNaN(qty) || qty <= 0) {
        showToast('Please enter valid quantities for all items', 'error');
        return;
      }
      if (isNaN(cost) || cost < 0) {
        showToast('Please enter valid unit costs for all items', 'error');
        return;
      }
    }

    setSubmittingProcurement(true);
    try {
      for (const item of validItems) {
        const cost = parseFloat(item.unit_cost);
        const discount = parseFloat(item.discount_percent) || 0;
        const effectiveCost = cost * (1 - discount / 100);
        const newPrice = parseFloat(item.new_selling_price);

        await apiClient.post('/inventory/purchase', {
          inventory_id: parseInt(item.inventory_id),
          supplier_id: invoiceHeader.supplier_id ? parseInt(invoiceHeader.supplier_id) : null,
          quantity: parseInt(item.quantity),
          unit_cost: effectiveCost,
          discount_percent: discount,
          original_unit_cost: cost,
          new_selling_price: !isNaN(newPrice) && newPrice > 0 ? newPrice : undefined,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          invoice_number: invoiceHeader.invoice_number || null,
          invoice_date: invoiceHeader.invoice_date || null
        });
      }

      showToast(`${validItems.length} item${validItems.length > 1 ? 's' : ''} recorded successfully`, 'success');
      setInvoiceHeader({ supplier_id: '', invoice_number: '', invoice_date: '' });
      setProcurementItems([{ ...emptyLineItem }]);
      fetchInventory();
      fetchPurchaseHistory();
    } catch (error: any) {
      console.error('Error recording purchase:', error);
      const message = error.response?.data?.error || 'Failed to record purchase';
      showToast(message, 'error');
    } finally {
      setSubmittingProcurement(false);
    }
  };

  const handleDeletePurchase = async (purchaseId: number) => {
    if (!confirm('Delete this purchase? This will reverse the inventory quantity change.')) return;
    setDeletingPurchaseId(purchaseId);
    try {
      await apiClient.delete(`/inventory/purchases/${purchaseId}`);
      showToast('Purchase deleted', 'success');
      fetchPurchaseHistory();
      fetchInventory();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to delete purchase';
      showToast(message, 'error');
    } finally {
      setDeletingPurchaseId(null);
    }
  };

  const dispenseMedication = async (orderId: number, medicationName?: string) => {
    // Check for allergy warnings if we have allergy data and medication name
    if (medicationName && patientAllergies.length > 0) {
      const medLower = medicationName.toLowerCase();
      const allergyWarnings = patientAllergies.filter(allergy => {
        const allergenLower = allergy.allergen?.toLowerCase() || '';
        // Check if medication name contains allergen or vice versa
        return medLower.includes(allergenLower) || allergenLower.includes(medLower);
      });

      if (allergyWarnings.length > 0) {
        const allergenNames = allergyWarnings.map(a => a.allergen).join(', ');
        const confirmed = window.confirm(
          `WARNING: Patient has allergies that may be related to this medication!\n\n` +
          `Allergies: ${allergenNames}\n\n` +
          `Are you sure you want to dispense ${medicationName}?`
        );
        if (!confirmed) {
          return;
        }
      }
    }

    try {
      await apiClient.put(`/orders/pharmacy/${orderId}`, {
        status: 'dispensed',
        dispensed_date: new Date().toISOString()
      });
      showToast('Medication dispensed successfully', 'success');
      // Refresh the appropriate tab and stats
      if (ordersSubTab === 'pending') fetchPendingOrders();
      else if (ordersSubTab === 'in_progress') fetchInProgressOrders();
      else if (ordersSubTab === 'ready') fetchReadyOrders();
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
    { id: 'revenue' as const, label: 'Revenue', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )},
    { id: 'analytics' as const, label: 'Analytics', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )},
  ];

  return (
    <AppLayout title={title}>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowGuide(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          How-To Guide
        </button>
      </div>
      <DepartmentGuide isOpen={showGuide} onClose={() => setShowGuide(false)} title="Pharmacy Dashboard Guide" sections={pharmacyGuideSections} />
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
                  onClick={() => { setOrdersSubTab('ready'); fetchReadyOrders(); }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    ordersSubTab === 'ready' ? 'bg-orange-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Ready for Pickup
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
                  else if (ordersSubTab === 'ready') fetchReadyOrders();
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
                     ordersSubTab === 'in_progress' ? 'In Progress Orders' :
                     ordersSubTab === 'ready' ? 'Ready for Pickup' : 'Dispensed Orders'}
                  </h2>
                </div>
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {groupedOrders.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                      No {ordersSubTab === 'pending' ? 'pending' : ordersSubTab === 'in_progress' ? 'in-progress' : ordersSubTab === 'ready' ? 'ready for pickup' : 'dispensed'} orders found
                    </div>
                  ) : (
                    groupedOrders.map((group) => (
                      <div
                        key={`${group.patient_id}-${group.encounter_id}`}
                        className="px-6 py-4"
                      >
                        {/* Patient Header */}
                        <div
                          className="flex justify-between items-start cursor-pointer"
                          onClick={() => {
                            setSelectedOrder(group.orders[0]);
                            fetchPatientDetails(group.patient_id, group.encounter_id);
                          }}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-lg text-gray-900">
                                {group.patient_name}
                              </span>
                              <span className="text-sm text-gray-500">{group.patient_number}</span>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                group.payer_type === 'insurance' ? 'bg-primary-100 text-primary-700' :
                                group.payer_type === 'corporate' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {group.payer_name}
                              </span>
                              {group.patient_allergies && (
                                <span className="px-2 py-0.5 text-xs font-bold bg-danger-100 text-danger-700 rounded-full border border-danger-300">
                                  ⚠️ ALLERGIES: {group.patient_allergies}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Ordered: {format(new Date(group.ordered_date), 'MMM dd, yyyy HH:mm')}
                              <span className="ml-2 text-gray-500">• {group.orders.length} medication{group.orders.length > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {ordersSubTab === 'pending' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Start processing all orders for this patient
                                  group.orders.forEach(o => startProcessingOrder(o.id));
                                }}
                                className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                              >
                                Start All
                              </button>
                            )}
                            {ordersSubTab === 'in_progress' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  group.orders.forEach(o => markReadyForPickup(o.id));
                                }}
                                className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600"
                              >
                                All Ready
                              </button>
                            )}
                            {ordersSubTab === 'ready' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  group.orders.forEach(o => dispenseMedication(o.id, o.medication_name));
                                }}
                                className="px-3 py-1.5 bg-success-600 text-white text-sm rounded-lg hover:bg-success-700"
                              >
                                Dispense All
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchDrugHistory(group.patient_id, group.patient_name);
                              }}
                              className="px-2 py-1.5 bg-primary-100 text-primary-700 text-sm rounded-lg hover:bg-primary-200"
                            >
                              History
                            </button>
                          </div>
                        </div>

                        {/* Medications List */}
                        <div className="mt-3 space-y-2">
                          {group.orders.map((order) => (
                            <div
                              key={order.id}
                              className={`rounded-lg border transition-all ${
                                selectedOrder?.id === order.id
                                  ? 'border-success-400 bg-success-50'
                                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                              }`}
                            >
                              <div
                                className="px-4 py-2 cursor-pointer flex justify-between items-center"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setExpandedMedication(expandedMedication === order.id ? null : order.id);
                                  fetchPatientDetails(order.patient_id, order.encounter_id);
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${
                                    order.priority === 'stat' ? 'bg-danger-500' :
                                    order.priority === 'urgent' ? 'bg-orange-500' :
                                    'bg-gray-400'
                                  }`} />
                                  <div>
                                    <span className="font-medium text-gray-900">{order.medication_name}</span>
                                    <span className="text-sm text-gray-500 ml-2">
                                      {order.dosage} | {order.frequency} | {order.route}
                                    </span>
                                  </div>
                                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getPriorityColor(order.priority)}`}>
                                    {order.priority?.toUpperCase() || 'ROUTINE'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-gray-700">Qty: {order.quantity}</span>
                                  {order.inventory_price != null && (
                                    <span className="text-xs text-gray-500">GHS {Number(order.inventory_price).toFixed(2)}/unit</span>
                                  )}
                                  {order.inventory_quantity != null ? (
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                      order.inventory_quantity >= parseInt(order.quantity)
                                        ? 'bg-success-100 text-success-700'
                                        : order.inventory_quantity > 0
                                        ? 'bg-warning-100 text-warning-700'
                                        : 'bg-danger-100 text-danger-700'
                                    }`}>
                                      {order.inventory_quantity} in stock
                                    </span>
                                  ) : (
                                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                      Not in inventory
                                    </span>
                                  )}
                                  <svg
                                    className={`w-4 h-4 text-gray-400 transition-transform ${
                                      expandedMedication === order.id ? 'rotate-180' : ''
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </div>

                              {/* Expanded Actions */}
                              {expandedMedication === order.id && (
                                <div className="px-4 py-3 border-t border-gray-200 bg-white rounded-b-lg flex items-center justify-between">
                                  <div className="text-sm text-gray-600">
                                    {order.primary_diagnosis && (
                                      <span className="text-primary-600"><span className="font-medium">Dx:</span> {order.primary_diagnosis}</span>
                                    )}
                                    {order.notes && (
                                      <span className="ml-3 text-gray-500">Notes: {order.notes}</span>
                                    )}
                                    {order.substitute_medication && (
                                      <span className="ml-3 text-warning-600 font-medium">Substituted: {order.substitute_medication}</span>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    {ordersSubTab === 'pending' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startProcessingOrder(order.id);
                                        }}
                                        className="px-3 py-1 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
                                      >
                                        Start
                                      </button>
                                    )}
                                    {ordersSubTab === 'in_progress' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markReadyForPickup(order.id);
                                        }}
                                        className="px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600"
                                      >
                                        Ready
                                      </button>
                                    )}
                                    {ordersSubTab === 'ready' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          dispenseMedication(order.id, order.medication_name);
                                        }}
                                        className="px-3 py-1 bg-success-600 text-white text-sm rounded hover:bg-success-700"
                                      >
                                        Dispense
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingOrder(order);
                                        setShowEditOrderModal(true);
                                      }}
                                      className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        printLabel(order);
                                      }}
                                      className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                                    >
                                      Label
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
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
                    {/* Patient Info */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">
                        Patient
                      </h3>
                      <div className="bg-gray-50 rounded p-3 space-y-2">
                        <div className="font-semibold text-gray-900">{selectedOrder.patient_name}</div>
                        <div className="text-sm text-gray-600">{selectedOrder.patient_number}</div>
                      </div>
                    </div>

                    {/* Billing/Payer Info */}
                    <div>
                      <h3 className="text-sm font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Billing
                      </h3>
                      <div className={`p-3 rounded border ${
                        selectedOrder.payer_type === 'insurance' ? 'bg-primary-50 border-primary-200' :
                        selectedOrder.payer_type === 'corporate' ? 'bg-purple-50 border-purple-200' :
                        'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-bold rounded ${
                            selectedOrder.payer_type === 'insurance' ? 'bg-primary-100 text-primary-700' :
                            selectedOrder.payer_type === 'corporate' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {selectedOrder.payer_type === 'insurance' ? 'INSURANCE' :
                             selectedOrder.payer_type === 'corporate' ? 'CORPORATE' : 'SELF PAY'}
                          </span>
                        </div>
                        {selectedOrder.payer_name && selectedOrder.payer_name !== 'Self Pay' && (
                          <div className="mt-2 text-sm font-medium text-gray-700">
                            {selectedOrder.payer_name}
                          </div>
                        )}
                      </div>
                    </div>

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
                      ) : selectedOrder.patient_allergies ? (
                        <div className="p-2 rounded border bg-danger-50 border-danger-200">
                          <div className="font-medium text-danger-700">{selectedOrder.patient_allergies}</div>
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
                                  onClick={() => openServeWalkInModal(patient)}
                                  className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                >
                                  Serve
                                </button>
                              )}
                              {patient.status === 'in-progress' && (
                                <>
                                  <button
                                    onClick={() => openServeWalkInModal(patient)}
                                    className="px-3 py-1 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
                                  >
                                    Add Items
                                  </button>
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
                                    className="px-3 py-1 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors"
                                  >
                                    Complete
                                  </button>
                                </>
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
              <div
                className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow cursor-pointer hover:ring-2 ring-gray-400"
                onClick={() => setInventoryFilter('all')}
              >
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
              <div
                className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow cursor-pointer hover:ring-2 ring-danger-400"
                onClick={() => setInventoryFilter('expired')}
              >
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
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
              >
                <option value="">All Categories</option>
                {inventoryCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={inventoryFilter}
                onChange={(e) => setInventoryFilter(e.target.value as 'all' | 'low_stock' | 'expiring' | 'expired')}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-success-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="low_stock">Low Stock</option>
                <option value="expiring">Expiring Soon</option>
                <option value="expired">Expired</option>
              </select>
              <button
                onClick={() => setShowAddInventoryModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item
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
                  {inventory
                    .filter(item => {
                      // Filter by category
                      if (categoryFilter && item.category !== categoryFilter) return false;
                      // Filter by search
                      if (inventorySearch && !item.medication_name.toLowerCase().includes(inventorySearch.toLowerCase()) &&
                          !item.generic_name?.toLowerCase().includes(inventorySearch.toLowerCase())) return false;
                      return true;
                    })
                    .map((item) => (
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
                            onClick={() => { setEditingInventory(item); fetchInventoryBatches(item.id); setShowInventoryModal(true); }}
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
              {inventory.filter(item => {
                if (categoryFilter && item.category !== categoryFilter) return false;
                if (inventorySearch && !item.medication_name.toLowerCase().includes(inventorySearch.toLowerCase()) &&
                    !item.generic_name?.toLowerCase().includes(inventorySearch.toLowerCase())) return false;
                return true;
              }).length === 0 && (
                <div className="py-12 text-center text-gray-500">
                  {inventory.length === 0 ? 'No inventory items found' : 'No items match your filters'}
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
              <h2 className="text-lg font-semibold mb-1">Record Purchase</h2>
              <p className="text-gray-500 mb-5">Add stock from supplier invoices</p>

              {/* Invoice Header — Supplier, Invoice #, Invoice Date */}
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-5">
                <h3 className="text-sm font-semibold text-primary-800 mb-3">Invoice Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                    <select
                      value={invoiceHeader.supplier_id}
                      onChange={(e) => setInvoiceHeader({ ...invoiceHeader, supplier_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="">Select supplier...</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                    <input
                      type="text"
                      value={invoiceHeader.invoice_number}
                      onChange={(e) => setInvoiceHeader({ ...invoiceHeader, invoice_number: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="e.g., INV-2026-001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                    <input
                      type="date"
                      value={invoiceHeader.invoice_date}
                      onChange={(e) => setInvoiceHeader({ ...invoiceHeader, invoice_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Medications ({procurementItems.length} item{procurementItems.length !== 1 ? 's' : ''})</h3>
                  <button
                    onClick={addLineItem}
                    className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Item
                  </button>
                </div>

                {procurementItems.map((item, idx) => {
                  const selectedMed = inventory.find(i => i.id === parseInt(item.inventory_id));
                  const itemCost = parseFloat(item.unit_cost) || 0;
                  const itemQty = parseInt(item.quantity) || 0;
                  const itemDiscount = parseFloat(item.discount_percent) || 0;
                  const effectiveCost = itemCost * (1 - itemDiscount / 100);
                  const lineTotal = effectiveCost * itemQty;

                  return (
                    <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative">
                      {procurementItems.length > 1 && (
                        <button
                          onClick={() => removeLineItem(idx)}
                          className="absolute top-3 right-3 text-red-400 hover:text-red-600 transition-colors"
                          title="Remove item"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {/* Row 1: Medication + current prices */}
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Medication</label>
                          <select
                            value={item.inventory_id}
                            onChange={(e) => updateLineItem(idx, 'inventory_id', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm"
                          >
                            <option value="">Select medication...</option>
                            {inventory.map((inv) => (
                              <option key={inv.id} value={inv.id}>{inv.medication_name} ({inv.quantity_on_hand} in stock)</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Current Selling</label>
                          <div className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-600">
                            {selectedMed ? `GH₵ ${parseFloat(String(selectedMed.selling_price || 0)).toFixed(2)}` : '—'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Current Cost</label>
                          <div className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-600">
                            {selectedMed ? `GH₵ ${parseFloat(String(selectedMed.unit_cost || 0)).toFixed(2)}` : '—'}
                          </div>
                        </div>

                        {/* Row 2: Qty, Unit Cost, Discount, New Price */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Qty Received</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Unit Cost (GH₵)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_cost}
                            onChange={(e) => updateLineItem(idx, 'unit_cost', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Discount (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={item.discount_percent}
                            onChange={(e) => updateLineItem(idx, 'discount_percent', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">New Selling Price</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.new_selling_price}
                            onChange={(e) => updateLineItem(idx, 'new_selling_price', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="Keep current"
                          />
                        </div>

                        {/* Row 3: Batch, Expiry, Line total */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Batch/Lot #</label>
                          <input
                            type="text"
                            value={item.batch_number}
                            onChange={(e) => updateLineItem(idx, 'batch_number', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="Auto-generated"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
                          <input
                            type="date"
                            value={item.expiry_date}
                            onChange={(e) => updateLineItem(idx, 'expiry_date', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                        {itemCost > 0 && (
                          <div className="md:col-span-2 flex items-end">
                            <div className="text-sm text-gray-600">
                              Eff. Cost: <span className="font-bold text-primary-700">GH₵ {effectiveCost.toFixed(2)}</span>
                              {itemQty > 0 && (
                                <span className="ml-3">Line Total: <span className="font-bold text-primary-700">GH₵ {lineTotal.toFixed(2)}</span></span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Invoice Total + Submit */}
              {(() => {
                const invoiceTotal = procurementItems.reduce((sum, item) => {
                  const cost = parseFloat(item.unit_cost) || 0;
                  const qty = parseInt(item.quantity) || 0;
                  const disc = parseFloat(item.discount_percent) || 0;
                  return sum + cost * (1 - disc / 100) * qty;
                }, 0);
                return invoiceTotal > 0 ? (
                  <div className="mt-4 p-3 bg-success-50 border border-success-200 rounded-lg flex items-center justify-between">
                    <span className="font-semibold text-success-800">Invoice Total</span>
                    <span className="text-xl font-bold text-success-700">GH₵ {invoiceTotal.toFixed(2)}</span>
                  </div>
                ) : null;
              })()}

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={submitProcurement}
                  disabled={submittingProcurement}
                  className="px-6 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingProcurement ? 'Recording...' : `Record ${procurementItems.filter(i => i.inventory_id && i.quantity && i.unit_cost).length} Item${procurementItems.filter(i => i.inventory_id && i.quantity && i.unit_cost).length !== 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={addLineItem}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
                >
                  + Add Another Item
                </button>
              </div>
            </div>

            {/* Purchase History */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Recent Purchases</h2>
              </div>
              {purchaseHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medication</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {purchaseHistory.map((purchase) => (
                        <tr key={purchase.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {format(new Date(purchase.created_at), 'MMM dd, yyyy')}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{purchase.medication_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{purchase.supplier_name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{purchase.invoice_number || '—'}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{purchase.quantity}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            GH₵ {parseFloat(purchase.unit_cost || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                            GH₵ {(parseFloat(purchase.quantity) * parseFloat(purchase.unit_cost || 0)).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{purchase.batch_number || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDeletePurchase(purchase.id)}
                              disabled={deletingPurchaseId === purchase.id}
                              className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors p-1"
                              title="Delete purchase"
                            >
                              {deletingPurchaseId === purchase.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-500 border-t-transparent"></div>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  No purchase history yet. Record your first purchase above.
                </div>
              )}
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
                        // Safe margin calculation - handle zero/null costs
                        const cost = parseFloat(String(item.unit_cost)) || 0;
                        const price = parseFloat(String(item.selling_price)) || 0;
                        const margin = cost > 0
                          ? (((price - cost) / cost) * 100).toFixed(1)
                          : price > 0 ? '100+' : '0';
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
                                  value={editingPriceValue}
                                  onChange={(e) => setEditingPriceValue(e.target.value)}
                                  className="w-24 border border-gray-300 rounded px-2 py-1 text-right"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      updateMedicationPrice(item.id, parseFloat(editingPriceValue));
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
                                    onClick={() => {
                                      updateMedicationPrice(item.id, parseFloat(editingPriceValue));
                                    }}
                                    className="text-success-600 hover:text-success-800 font-medium"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingPrice(null)}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingPrice(item);
                                    setEditingPriceValue(String(item.selling_price || 0));
                                  }}
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

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <DispensingAnalytics />
        )}

      </main>

      {/* Supplier Modal */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => { setShowSupplierModal(false); setEditingSupplier(null); }}
        title={editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
        size="xl"
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

      {/* Add Inventory Modal */}
      <Modal
        isOpen={showAddInventoryModal}
        onClose={() => setShowAddInventoryModal(false)}
        title="Add New Inventory Item"
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Medication Name *</label>
              <input
                type="text"
                value={newInventoryForm.medication_name}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, medication_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., Paracetamol 500mg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
              <input
                type="text"
                value={newInventoryForm.generic_name}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, generic_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., Acetaminophen"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <input
                type="text"
                value={newInventoryForm.category}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., Analgesic"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {inventoryCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select
                value={newInventoryForm.unit}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, unit: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="tablet">Tablet</option>
                <option value="capsule">Capsule</option>
                <option value="bottle">Bottle</option>
                <option value="vial">Vial</option>
                <option value="ampoule">Ampoule</option>
                <option value="pack">Pack</option>
                <option value="tube">Tube</option>
                <option value="sachet">Sachet</option>
                <option value="box">Box</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Quantity</label>
              <input
                type="number"
                min="0"
                value={newInventoryForm.quantity_on_hand}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, quantity_on_hand: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
              <input
                type="number"
                min="0"
                value={newInventoryForm.reorder_level}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, reorder_level: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (GH₵)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newInventoryForm.unit_cost}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, unit_cost: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (GH₵)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newInventoryForm.selling_price}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, selling_price: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={newInventoryForm.expiry_date}
                onChange={(e) => setNewInventoryForm({ ...newInventoryForm, expiry_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowAddInventoryModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={createInventoryItem}
              className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700"
            >
              Add Item
            </button>
          </div>
        </div>
      </Modal>

      {/* Inventory Edit Modal */}
      <Modal
        isOpen={showInventoryModal}
        onClose={() => { setShowInventoryModal(false); setEditingInventory(null); setInventoryBatches([]); setBatchQuantityEdits({}); }}
        title="Edit Inventory Item"
        size="xl"
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
                  placeholder="Type to search categories..."
                  list="edit-category-suggestions"
                />
                <datalist id="edit-category-suggestions">
                  {inventoryCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <select
                  value={editingInventory.unit}
                  onChange={(e) => setEditingInventory({ ...editingInventory, unit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="tablet">Tablet</option>
                  <option value="capsule">Capsule</option>
                  <option value="bottle">Bottle</option>
                  <option value="vial">Vial</option>
                  <option value="ampoule">Ampoule</option>
                  <option value="tube">Tube</option>
                  <option value="sachet">Sachet</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                  <option value="piece">Piece</option>
                  <option value="ml">mL</option>
                  <option value="strip">Strip</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                <input
                  type="number"
                  min="0"
                  value={editingInventory.reorder_level || ''}
                  onChange={(e) => setEditingInventory({ ...editingInventory, reorder_level: e.target.value ? parseInt(e.target.value) : 0 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingInventory.unit_cost || ''}
                  onChange={(e) => setEditingInventory({ ...editingInventory, unit_cost: e.target.value ? parseFloat(e.target.value) : 0 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingInventory.selling_price || ''}
                  onChange={(e) => setEditingInventory({ ...editingInventory, selling_price: e.target.value ? parseFloat(e.target.value) : 0 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Earliest Expiry Date</label>
                <input
                  type="date"
                  value={editingInventory.expiry_date ? editingInventory.expiry_date.split('T')[0] : ''}
                  disabled
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">Shows earliest expiry from batches</p>
              </div>
            </div>

            {/* Batch Inventory Section */}
            <div className="mt-6 border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Batch Inventory (FEFO - First Expired, First Out)</h4>
              {loadingBatches ? (
                <p className="text-sm text-gray-500">Loading batches...</p>
              ) : inventoryBatches.length === 0 ? (
                <p className="text-sm text-gray-500">No batches recorded yet. Use procurement to add stock with batch tracking.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Batch #</th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Qty</th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500">Expiry</th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {inventoryBatches.map((batch, idx) => {
                        const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date();
                        const isExpiringSoon = batch.expiry_date &&
                          new Date(batch.expiry_date) <= new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                        const editedQty = batchQuantityEdits[batch.id];
                        const currentQty = editedQty !== undefined ? editedQty : batch.quantity;
                        const hasChanged = editedQty !== undefined && editedQty !== batch.quantity;
                        return (
                          <tr key={batch.id || idx} className={isExpired ? 'bg-red-50' : isExpiringSoon ? 'bg-yellow-50' : ''}>
                            <td className="px-2 py-1 text-gray-900">{batch.batch_number || '-'}</td>
                            <td className="px-2 py-1 text-right">
                              <input
                                type="number"
                                min="0"
                                value={currentQty}
                                onChange={(e) => {
                                  const newQty = parseInt(e.target.value) || 0;
                                  setBatchQuantityEdits(prev => ({
                                    ...prev,
                                    [batch.id]: newQty
                                  }));
                                }}
                                className={`w-16 px-1 py-0.5 text-right border rounded text-sm font-medium ${
                                  hasChanged ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                                }`}
                              />
                            </td>
                            <td className="px-2 py-1 text-center">
                              {batch.expiry_date ? (
                                <span className={isExpired ? 'text-red-600 font-semibold' : isExpiringSoon ? 'text-yellow-600' : ''}>
                                  {new Date(batch.expiry_date).toLocaleDateString()}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {batch.unit_cost ? `GH₵${parseFloat(batch.unit_cost).toFixed(2)}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t">
                      <tr>
                        <td className="px-2 py-1 font-semibold text-gray-700">Total</td>
                        <td className="px-2 py-1 text-right font-bold text-gray-900">
                          {inventoryBatches.reduce((sum, b) => {
                            const editedQty = batchQuantityEdits[b.id];
                            return sum + (editedQty !== undefined ? editedQty : parseInt(b.quantity) || 0);
                          }, 0)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => { setShowInventoryModal(false); setEditingInventory(null); setInventoryBatches([]); }}
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
        size="xl"
      >
        {editingOrder && (
          <div className="space-y-4">
            {/* Doctor's Original Order — Read Only */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Doctor's Order (Read Only)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Medication</label>
                  <div className="font-medium text-gray-900 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                    {editingOrder.medication_name}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Dosage</label>
                  <div className="font-medium text-gray-900 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                    {editingOrder.dosage || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Frequency</label>
                  <div className="text-gray-900 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                    {editingOrder.frequency || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Route</label>
                  <div className="text-gray-900 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                    {editingOrder.route || '—'}
                  </div>
                </div>
              </div>
              {editingOrder.inventory_price != null && (
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-gray-500">Unit Price: <span className="font-medium text-gray-800">GHS {Number(editingOrder.inventory_price).toFixed(2)}</span></span>
                  {editingOrder.inventory_quantity != null && (
                    <span className={`font-medium ${editingOrder.inventory_quantity > 0 ? 'text-success-600' : 'text-danger-600'}`}>
                      {editingOrder.inventory_quantity} in stock
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Dispense</label>
                <input
                  type="text"
                  value={editingOrder.quantity}
                  onChange={(e) => setEditingOrder({ ...editingOrder, quantity: e.target.value })}
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
            </div>

            {/* Substitute Medication */}
            <div className="bg-warning-50 border border-warning-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-warning-800 mb-2">Substitute Medication (if exact med is unavailable)</h4>
              <input
                type="text"
                value={editingOrder.substitute_medication || ''}
                onChange={(e) => setEditingOrder({ ...editingOrder, substitute_medication: e.target.value })}
                className="w-full border border-warning-300 rounded-lg px-3 py-2 mb-2"
                placeholder="Alternative medication name..."
              />
              <textarea
                value={editingOrder.substitute_reason || ''}
                onChange={(e) => setEditingOrder({ ...editingOrder, substitute_reason: e.target.value })}
                className="w-full border border-warning-300 rounded-lg px-3 py-2"
                rows={2}
                placeholder="Reason for substitution..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={editingOrder.notes || ''}
                onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={2}
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

      {/* Serve Walk-In Patient Modal */}
      <Modal
        isOpen={showServeWalkInModal}
        onClose={closeServeWalkInModal}
        title={`Serve Walk-In Patient - ${servingWalkIn?.patient_name || ''}`}
        size="full"
      >
        {servingWalkIn && (
          <div className="space-y-6">
            {/* Patient Info Header */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Patient</p>
                  <p className="font-semibold text-gray-900">{servingWalkIn.patient_name}</p>
                  <p className="text-sm text-gray-600">{servingWalkIn.patient_number}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Payer Type</p>
                  <span className={`inline-block mt-1 px-2 py-1 text-xs font-medium rounded-full ${
                    servingWalkIn.payer_type === 'insurance' ? 'bg-primary-100 text-primary-700' :
                    servingWalkIn.payer_type === 'corporate' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {servingWalkIn.payer_type === 'self_pay' ? 'Self Pay' : servingWalkIn.payer_type || 'Self Pay'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Chief Complaint</p>
                  <p className="text-sm text-gray-900">{servingWalkIn.chief_complaint || 'OTC Purchase'}</p>
                </div>
              </div>
            </div>

            {/* Prescription Upload Section */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upload Prescription (Optional)
                </h3>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handlePrescriptionUpload}
                  className="hidden"
                  id="prescription-upload"
                />
                <label htmlFor="prescription-upload" className="cursor-pointer px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors">
                  Choose Files
                </label>
              </div>
              {walkInPrescriptionFiles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {walkInPrescriptionFiles.map((file, index) => (
                    <div key={index} className="relative group">
                      {file.type.startsWith('image/') && walkInPrescriptionPreviews[index] ? (
                        <img
                          src={walkInPrescriptionPreviews[index]}
                          alt={`Prescription ${index + 1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                      <button
                        onClick={() => removePrescriptionFile(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                      <p className="text-xs text-gray-500 truncate w-20 mt-1">{file.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Medication Search + Added Medications — Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: '400px' }}>
              {/* Left: Search & Select */}
              <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search Medications
                </h3>
                <input
                  type="text"
                  placeholder="Type medication name..."
                  value={walkInMedSearch}
                  onChange={(e) => setWalkInMedSearch(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-base"
                  autoComplete="off"
                />
                {/* Results list — always visible, fills remaining space */}
                <div className="mt-3 flex-1 overflow-y-auto border border-gray-100 rounded-lg bg-gray-50">
                  {walkInMedSearch.length < 2 ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm p-8">
                      <div className="text-center">
                        <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Type at least 2 characters to search
                      </div>
                    </div>
                  ) : filteredWalkInInventory.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm p-8">
                      No medications found for "{walkInMedSearch}"
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredWalkInInventory.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => { addWalkInMedication(item); setWalkInMedSearch(''); }}
                          className="w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors flex justify-between items-center"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{item.medication_name}</p>
                            <p className="text-xs text-gray-500">{item.generic_name || item.category} • {item.unit}</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-sm font-bold text-success-600">GH₵{parseFloat(String(item.selling_price || 0)).toFixed(2)}</p>
                            <p className={`text-xs ${item.quantity_on_hand > 0 ? 'text-gray-400' : 'text-danger-500 font-medium'}`}>
                              {item.quantity_on_hand > 0 ? `Stock: ${item.quantity_on_hand}` : 'Out of stock'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Added Medications */}
              <div className="lg:col-span-3 bg-white border-2 border-success-200 rounded-xl p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Order Summary
                  </h3>
                  {walkInMedications.length > 0 && (
                    <span className="bg-success-100 text-success-700 px-2.5 py-1 rounded-full text-xs font-bold">
                      {walkInMedications.length} item{walkInMedications.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {walkInMedications.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      Search and select medications from the left
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {walkInMedications.map((med, index) => (
                        <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">{med.medication_name}</p>
                              <p className="text-xs text-success-600">GH₵{Number(med.unit_price).toFixed(2)}/unit</p>
                            </div>
                            <button
                              onClick={() => removeWalkInMedication(index)}
                              className="text-red-400 hover:text-red-600 transition-colors p-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-gray-500">Qty</label>
                              <input
                                type="number"
                                min="1"
                                value={med.quantity}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateWalkInMedication(index, 'quantity', parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Dosage</label>
                              <input
                                type="text"
                                placeholder="500mg"
                                value={med.dosage}
                                onChange={(e) => updateWalkInMedication(index, 'dosage', e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Subtotal</label>
                              <p className="px-2 py-1.5 text-sm font-bold text-success-600">
                                GH₵{(med.unit_price * med.quantity).toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                              <label className="text-xs text-gray-500">Frequency</label>
                              <input
                                type="text"
                                placeholder="e.g., TDS"
                                value={med.frequency}
                                onChange={(e) => updateWalkInMedication(index, 'frequency', e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Days</label>
                              <input
                                type="number"
                                placeholder="e.g., 5"
                                min="1"
                                value={med.duration_days}
                                onChange={(e) => updateWalkInMedication(index, 'duration_days', e.target.value ? Number(e.target.value) : '')}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total — sticky at bottom */}
                    <div className="bg-success-50 rounded-lg p-4 border border-success-200 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-success-800">Total</span>
                        <span className="text-2xl font-bold text-success-600">
                          GH₵{walkInMedications.reduce((sum, med) => sum + (med.unit_price * med.quantity), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={closeServeWalkInModal}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitWalkInOrder}
                disabled={submittingWalkIn || walkInMedications.length === 0}
                className="px-6 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {submittingWalkIn ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Complete & Dispense
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
};

export default PharmacyDashboard;
