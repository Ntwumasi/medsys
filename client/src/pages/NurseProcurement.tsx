import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import type { ApiError } from '../types';

interface InventoryItem {
  id: number;
  item_name: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number;
  location: string;
  supplier: string | null;
}

interface Purchase {
  id: number;
  inventory_id: number;
  item_name: string;
  category: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  batch_number: string | null;
  notes: string | null;
  purchased_by_name: string;
  created_at: string;
}

const NurseProcurement: React.FC = () => {
  const { user, impersonation } = useAuth();
  const { showToast } = useNotification();

  const [activeTab, setActiveTab] = useState<'stock' | 'requisition' | 'purchase' | 'history'>('stock');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'category' | 'quantity' | 'status'>('name');
  const [showLowOnly, setShowLowOnly] = useState(false);

  // Add New Item modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ item_name: '', category: 'Supplies', unit: 'pcs', reorder_level: '10', unit_cost: '', location: '' });
  const [addingItem, setAddingItem] = useState(false);

  // Quick +Stock modal — light alternative to Record Purchase for fast top-ups
  const [quickAddItem, setQuickAddItem] = useState<InventoryItem | null>(null);
  const [quickAddQty, setQuickAddQty] = useState('');
  const [quickAddUnitCost, setQuickAddUnitCost] = useState('');
  const [quickAddSupplier, setQuickAddSupplier] = useState('');
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);

  // Requisition state — running shopping list. One active draft at a time,
  // history of sent ones below.
  interface ReqItem {
    inventory_id: number | null;
    item_name: string;
    quantity: number | string;
    estimated_unit_cost: number | string;
    unit: string;
  }
  interface Requisition {
    id: number;
    status: 'draft' | 'sent' | 'received' | 'cancelled';
    notes: string | null;
    created_by_name: string;
    created_at: string;
    sent_at: string | null;
    received_at: string | null;
    items: any[];
    total_estimated: number;
  }
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [draftItems, setDraftItems] = useState<ReqItem[]>([
    { inventory_id: null, item_name: '', quantity: '', estimated_unit_cost: '', unit: 'pcs' },
  ]);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftId, setDraftId] = useState<number | null>(null);
  const [reqSubmitting, setReqSubmitting] = useState(false);

  // Purchase form
  const [purchaseForm, setPurchaseForm] = useState({
    inventory_id: '',
    quantity: '',
    unit_cost: '',
    supplier: '',
    batch_number: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);


  const loadInventory = useCallback(async () => {
    try {
      const res = await apiClient.get('/nurse/inventory');
      setItems(res.data.items || []);
      setStats(res.data.stats || null);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const res = await apiClient.get('/nurse/inventory/purchases');
      setPurchases(res.data.purchases || []);
    } catch (err) {
      console.error('Failed to load purchases:', err);
    }
  }, []);

  const loadRequisitions = useCallback(async () => {
    try {
      const res = await apiClient.get('/nurse/requisitions');
      const list: Requisition[] = res.data.requisitions || [];
      setRequisitions(list);
      // If there's an existing draft, hydrate the editor with it. Otherwise
      // keep the blank starter row.
      const draft = list.find(r => r.status === 'draft');
      if (draft) {
        setDraftId(draft.id);
        setDraftNotes(draft.notes || '');
        setDraftItems(
          draft.items.length > 0
            ? draft.items.map((it: any) => ({
                inventory_id: it.inventory_id,
                item_name: it.item_name,
                quantity: it.quantity,
                estimated_unit_cost: it.estimated_unit_cost,
                unit: it.unit || 'pcs',
              }))
            : [{ inventory_id: null, item_name: '', quantity: '', estimated_unit_cost: '', unit: 'pcs' }]
        );
      } else {
        setDraftId(null);
        setDraftItems([{ inventory_id: null, item_name: '', quantity: '', estimated_unit_cost: '', unit: 'pcs' }]);
        setDraftNotes('');
      }
    } catch (err) {
      console.error('Failed to load requisitions:', err);
    }
  }, []);

  useEffect(() => {
    loadInventory();
    loadPurchases();
    loadRequisitions();
  }, [loadInventory, loadPurchases, loadRequisitions]);

  const updateDraftRow = (idx: number, patch: Partial<ReqItem>) => {
    setDraftItems(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addDraftRow = () => {
    setDraftItems(prev => [...prev, { inventory_id: null, item_name: '', quantity: '', estimated_unit_cost: '', unit: 'pcs' }]);
  };
  const removeDraftRow = (idx: number) => {
    setDraftItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  const draftTotal = draftItems.reduce((sum, it) => {
    const q = Number(it.quantity) || 0;
    const c = Number(it.estimated_unit_cost) || 0;
    return sum + q * c;
  }, 0);

  const draftPayloadItems = () =>
    draftItems
      .filter(it => it.item_name.trim() && Number(it.quantity) > 0)
      .map(it => ({
        inventory_id: it.inventory_id,
        item_name: it.item_name.trim(),
        quantity: Number(it.quantity),
        estimated_unit_cost: Number(it.estimated_unit_cost) || 0,
        unit: it.unit || 'pcs',
      }));

  const saveDraft = async (sendAfter = false) => {
    const payload = draftPayloadItems();
    if (payload.length === 0) {
      showToast('Add at least one item with a name and quantity', 'error');
      return;
    }
    setReqSubmitting(true);
    try {
      if (draftId) {
        const body: any = { notes: draftNotes, items: payload };
        if (sendAfter) body.status = 'sent';
        await apiClient.put(`/nurse/requisitions/${draftId}`, body);
      } else {
        const created = await apiClient.post('/nurse/requisitions', {
          notes: draftNotes,
          items: payload,
        });
        const newId = created.data?.requisition?.id;
        if (sendAfter && newId) {
          await apiClient.put(`/nurse/requisitions/${newId}`, { status: 'sent' });
        }
      }
      showToast(sendAfter ? 'Requisition sent to procurement' : 'Draft saved', 'success');
      loadRequisitions();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to save requisition', 'error');
    } finally {
      setReqSubmitting(false);
    }
  };

  const discardDraft = async () => {
    if (!draftId) {
      setDraftItems([{ inventory_id: null, item_name: '', quantity: '', estimated_unit_cost: '', unit: 'pcs' }]);
      setDraftNotes('');
      return;
    }
    try {
      await apiClient.delete(`/nurse/requisitions/${draftId}`);
      showToast('Draft discarded', 'success');
      loadRequisitions();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to discard draft', 'error');
    }
  };

  const markReceived = async (id: number) => {
    try {
      await apiClient.put(`/nurse/requisitions/${id}`, { status: 'received' });
      showToast('Marked received', 'success');
      loadRequisitions();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to update status', 'error');
    }
  };
  const cancelRequisition = async (id: number) => {
    try {
      await apiClient.put(`/nurse/requisitions/${id}`, { status: 'cancelled' });
      showToast('Requisition cancelled', 'success');
      loadRequisitions();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to cancel', 'error');
    }
  };

  const handleRecordPurchase = async () => {
    if (!purchaseForm.inventory_id || !purchaseForm.quantity) {
      showToast('Select an item and enter quantity', 'error');
      return;
    }
    setSubmitting(true);
    try {
      let inventoryId: number;

      // "Other" → create the inventory item first, then record the purchase
      // against the new id. Replaces the standalone Add New Item tab.
      if (purchaseForm.inventory_id === 'other') {
        const newName = (purchaseForm as any).custom_item_name?.trim();
        if (!newName) {
          showToast('Type a name for the new item', 'error');
          setSubmitting(false);
          return;
        }
        const createRes = await apiClient.post('/nurse/inventory', {
          item_name: newName,
          category: 'Supplies',
          unit: 'pcs',
          quantity_on_hand: 0,
          reorder_level: 10,
          unit_cost: parseFloat(purchaseForm.unit_cost) || 0,
          location: 'Nurse Station',
          supplier: purchaseForm.supplier || null,
        });
        inventoryId = createRes.data?.item?.id ?? createRes.data?.id;
        if (!inventoryId) throw new Error('Could not create new inventory item');
      } else {
        inventoryId = parseInt(purchaseForm.inventory_id);
      }

      await apiClient.post('/nurse/inventory/purchase', {
        inventory_id: inventoryId,
        quantity: parseInt(purchaseForm.quantity),
        unit_cost: parseFloat(purchaseForm.unit_cost) || 0,
        supplier: purchaseForm.supplier || null,
        batch_number: purchaseForm.batch_number || null,
        notes: purchaseForm.notes || null,
      });
      showToast('Purchase recorded — stock updated', 'success');
      setPurchaseForm({ inventory_id: '', quantity: '', unit_cost: '', supplier: '', batch_number: '', notes: '' });
      loadInventory();
      loadPurchases();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to record purchase', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return d; }
  };

  const formatCurrency = (v: number | string) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return `GHS ${(n || 0).toFixed(2)}`;
  };

  const filteredItems = items
    .filter(i =>
      (categoryFilter === 'all' || i.category === categoryFilter) &&
      (search === '' || i.item_name.toLowerCase().includes(search.toLowerCase())) &&
      (!showLowOnly || i.quantity_on_hand <= i.reorder_level)
    )
    .sort((a, b) => {
      // Natural sort so "Syringe (5ml)" < "Syringe (10ml)" < "Syringe (50ml)"
      const byName = a.item_name.localeCompare(b.item_name, undefined, { numeric: true, sensitivity: 'base' });
      switch (sortBy) {
        case 'category': {
          const c = a.category.localeCompare(b.category);
          return c !== 0 ? c : byName;
        }
        case 'quantity': return a.quantity_on_hand - b.quantity_on_hand || byName;
        case 'status': {
          const aLow = a.quantity_on_hand <= a.reorder_level ? 0 : 1;
          const bLow = b.quantity_on_hand <= b.reorder_level ? 0 : 1;
          return (aLow - bLow) || byName;
        }
        default: return byName;
      }
    });

  const lowStockCount = items.filter(i => i.quantity_on_hand <= i.reorder_level).length;
  const categories = [...new Set(items.map(i => i.category))];

  // Open the quick +Stock modal for a row
  const handleAddNewItem = async () => {
    if (!newItem.item_name.trim() || !newItem.unit_cost) {
      showToast('Item name and unit cost are required', 'error');
      return;
    }
    setAddingItem(true);
    try {
      await apiClient.post('/nurse/inventory', {
        item_name: newItem.item_name.trim(),
        category: newItem.category,
        unit: newItem.unit,
        quantity_on_hand: 0,
        reorder_level: parseInt(newItem.reorder_level) || 10,
        unit_cost: parseFloat(newItem.unit_cost),
        location: newItem.location || null,
      });
      showToast(`${newItem.item_name} added to inventory`, 'success');
      setShowAddItem(false);
      setNewItem({ item_name: '', category: 'Supplies', unit: 'pcs', reorder_level: '10', unit_cost: '', location: '' });
      loadInventory();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to add item', 'error');
    } finally {
      setAddingItem(false);
    }
  };

  const openQuickAdd = (item: InventoryItem) => {
    setQuickAddItem(item);
    setQuickAddQty('');
    setQuickAddUnitCost(item.unit_cost ? String(item.unit_cost) : '');
    setQuickAddSupplier(item.supplier || '');
  };

  const handleQuickAddStock = async () => {
    if (!quickAddItem || !quickAddQty) {
      showToast('Enter a quantity', 'error');
      return;
    }
    setQuickAddSubmitting(true);
    try {
      await apiClient.post('/nurse/inventory/purchase', {
        inventory_id: quickAddItem.id,
        quantity: parseInt(quickAddQty),
        unit_cost: parseFloat(quickAddUnitCost) || 0,
        supplier: quickAddSupplier || null,
      });
      showToast(`Added ${quickAddQty} ${quickAddItem.unit} to ${quickAddItem.item_name}`, 'success');
      setQuickAddItem(null);
      loadInventory();
      loadPurchases();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to add stock', 'error');
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  // Only head nurse or super admin impersonating a nurse should see this page
  const isSuperAdminSession =
    user?.is_super_admin || (impersonation as any)?.originalUser?.is_super_admin;
  if (user?.role === 'nurse' && !user?.is_head_nurse && !isSuperAdminSession) {
    return (
      <AppLayout title="Procurement">
        <div className="text-center py-16">
          <p className="text-lg font-semibold text-gray-600">Access Restricted</p>
          <p className="text-sm text-gray-400 mt-1">Procurement is managed by the Head Nurse</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Nurse Station Procurement">
      <div>
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Total Items</div>
              <div className="text-2xl font-bold text-gray-900">{stats.total_items}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Low Stock</div>
              <div className="text-2xl font-bold text-danger-600">{stats.low_stock}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Categories</div>
              <div className="text-2xl font-bold text-primary-600">{stats.categories}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500">Stock Value</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(stats.total_value)}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 flex-wrap">
          {(['stock', 'requisition', 'purchase', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'stock' ? 'Current Stock'
                : tab === 'requisition' ? 'Requisition'
                : tab === 'purchase' ? 'Record Purchase'
                : 'Purchase History'}
            </button>
          ))}
        </div>

        {/* Stock Tab */}
        {activeTab === 'stock' && (
          <div>
            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <input
                type="text"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
              >
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
              >
                <option value="name">Sort by Name</option>
                <option value="category">Sort by Category</option>
                <option value="quantity">Sort by Quantity</option>
                <option value="status">Sort by Status</option>
              </select>
              <button
                type="button"
                onClick={() => setShowLowOnly(v => !v)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showLowOnly
                    ? 'bg-danger-100 text-danger-700 border-2 border-danger-300'
                    : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Low Stock Only ({lowStockCount})
              </button>
              <button
                type="button"
                onClick={() => setShowAddItem(true)}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No items match. Record a purchase to add the first item.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Reorder</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit Cost</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.map(item => {
                      const isLow = item.quantity_on_hand <= item.reorder_level;
                      return (
                        <tr key={item.id} className={`hover:bg-gray-50 ${isLow ? 'bg-danger-50' : ''}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">{item.item_name}</td>
                          <td className="px-4 py-3 text-gray-600">{item.category}</td>
                          <td className="px-4 py-3 text-right font-semibold">{item.quantity_on_hand} {item.unit}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{item.reorder_level}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(item.unit_cost)}</td>
                          <td className="px-4 py-3 text-gray-600">{item.location}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${isLow ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700'}`}>
                              {isLow ? 'LOW' : 'OK'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openQuickAdd(item)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-success-600 text-white hover:bg-success-700"
                              title="Quick add to stock"
                            >
                              + Stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Requisition Tab — running shopping list for procurement */}
        {activeTab === 'requisition' && (
          <div className="space-y-6">
            {/* Active draft */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Requisition Draft</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Build up items you need to order. Save as you go; send when ready.
                  </p>
                </div>
                {draftId && (
                  <span className="text-xs px-2 py-1 bg-warning-50 text-warning-700 border border-warning-200 rounded">
                    Draft #{draftId}
                  </span>
                )}
              </div>

              <div className="p-5 space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-1">Unit</div>
                  <div className="col-span-2 text-right">Est. Cost</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-1"></div>
                </div>

                {draftItems.map((row, idx) => {
                  const lineTotal = (Number(row.quantity) || 0) * (Number(row.estimated_unit_cost) || 0);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <select
                          value={row.inventory_id ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              updateDraftRow(idx, { inventory_id: null });
                            } else if (val === 'new') {
                              updateDraftRow(idx, { inventory_id: null, item_name: '' });
                            } else {
                              const inv = items.find(i => i.id === Number(val));
                              if (inv) {
                                updateDraftRow(idx, {
                                  inventory_id: inv.id,
                                  item_name: inv.item_name,
                                  unit: inv.unit,
                                  estimated_unit_cost: inv.unit_cost ?? 0,
                                });
                              }
                            }
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">Pick existing item…</option>
                          {items.map(i => (
                            <option key={i.id} value={i.id}>
                              {i.item_name} ({i.quantity_on_hand} {i.unit} in stock)
                            </option>
                          ))}
                          <option value="new">--- Or type a new item ---</option>
                        </select>
                        {row.inventory_id === null && (
                          <input
                            type="text"
                            value={row.item_name}
                            onChange={(e) => updateDraftRow(idx, { item_name: e.target.value })}
                            placeholder="New item name"
                            className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                          />
                        )}
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number" min="1"
                          value={row.quantity}
                          onChange={(e) => updateDraftRow(idx, { quantity: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="text"
                          value={row.unit}
                          onChange={(e) => updateDraftRow(idx, { unit: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number" step="0.01" min="0"
                          value={row.estimated_unit_cost}
                          onChange={(e) => updateDraftRow(idx, { estimated_unit_cost: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-1 text-right text-sm font-medium text-gray-900">
                        {formatCurrency(lineTotal)}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeDraftRow(idx)}
                          className="p-1 text-gray-400 hover:text-danger-600"
                          title="Remove row"
                          disabled={draftItems.length <= 1}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addDraftRow}
                  className="text-sm font-medium text-primary-600 hover:text-primary-800 inline-flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add another item
                </button>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 mt-2">Notes (optional)</label>
                  <textarea
                    rows={2}
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="e.g. Need delivery by Friday, supplier X preferred"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="text-gray-500">Total estimated:</span>{' '}
                  <span className="font-bold text-gray-900 text-lg">{formatCurrency(draftTotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {draftId && (
                    <button
                      type="button"
                      onClick={discardDraft}
                      disabled={reqSubmitting}
                      className="px-3 py-1.5 text-sm font-medium text-danger-600 border border-danger-300 rounded-lg hover:bg-danger-50 disabled:opacity-60"
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => saveDraft(false)}
                    disabled={reqSubmitting}
                    className="px-4 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => saveDraft(true)}
                    disabled={reqSubmitting}
                    className="px-4 py-1.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-60"
                  >
                    {reqSubmitting ? 'Sending…' : 'Send to Procurement'}
                  </button>
                </div>
              </div>
            </div>

            {/* History of sent / received / cancelled */}
            {requisitions.filter(r => r.status !== 'draft').length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-200">
                  <h3 className="text-base font-bold text-gray-900">Previous requisitions</h3>
                </div>
                <ul className="divide-y divide-gray-100">
                  {requisitions
                    .filter(r => r.status !== 'draft')
                    .map(r => (
                      <li key={r.id} className="px-5 py-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">Req #{r.id}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                              r.status === 'sent' ? 'bg-warning-100 text-warning-700' :
                              r.status === 'received' ? 'bg-success-100 text-success-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {r.status}
                            </span>
                            <span className="text-xs text-gray-500">
                              {r.items.length} item{r.items.length !== 1 ? 's' : ''} ·{' '}
                              {formatCurrency(r.total_estimated)} ·{' '}
                              {formatDate(r.created_at)} by {r.created_by_name}
                            </span>
                          </div>
                          {r.status === 'sent' && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => markReceived(r.id)}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-success-600 text-white hover:bg-success-700"
                              >
                                Mark received
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelRequisition(r.id)}
                                className="px-2.5 py-1 text-xs font-medium text-danger-600 border border-danger-300 rounded hover:bg-danger-50"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="mt-1.5 text-xs text-gray-600 truncate">
                          {r.items.slice(0, 5).map(i => `${i.item_name} ×${i.quantity}`).join(' · ')}
                          {r.items.length > 5 ? ` … +${r.items.length - 5} more` : ''}
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Record Purchase Tab */}
        {activeTab === 'purchase' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Record Purchase</h3>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Item *</label>
                <select
                  value={purchaseForm.inventory_id}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, inventory_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select item or choose "Other"...</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.item_name} ({i.quantity_on_hand} {i.unit} in stock)
                    </option>
                  ))}
                  <option value="other">--- Other (type manually) ---</option>
                </select>
                {purchaseForm.inventory_id === 'other' && (
                  <input
                    type="text"
                    value={(purchaseForm as any).custom_item_name || ''}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, custom_item_name: e.target.value } as any)}
                    className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Type item name..."
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={purchaseForm.quantity}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit Cost (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchaseForm.unit_cost}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, unit_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Supplier</label>
                <input
                  type="text"
                  value={purchaseForm.supplier}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Supplier name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Batch #</label>
                  <input
                    type="text"
                    value={purchaseForm.batch_number}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, batch_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Total</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900">
                    {formatCurrency((parseFloat(purchaseForm.unit_cost) || 0) * (parseInt(purchaseForm.quantity) || 0))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={purchaseForm.notes}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <button
                onClick={handleRecordPurchase}
                disabled={submitting}
                className="w-full px-6 py-3 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 disabled:opacity-60"
              >
                {submitting ? 'Recording...' : 'Record Purchase'}
              </button>
            </div>
          </div>
        )}

        {/* Purchase History Tab */}
        {activeTab === 'history' && (
          <div>
            {purchases.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg font-semibold">No purchases recorded yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchases.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(p.created_at)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.item_name}</td>
                        <td className="px-4 py-3 text-right">{p.quantity} {p.unit}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(p.unit_cost)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.total_cost)}</td>
                        <td className="px-4 py-3 text-gray-600">{p.supplier || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{p.purchased_by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Add New Item modal */}
        {showAddItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !addingItem && setShowAddItem(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 rounded-t-xl">
                <h3 className="text-lg font-bold text-gray-900">Add New Inventory Item</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input type="text" value={newItem.item_name} onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="e.g., Syringe 10ml" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                      <option>Supplies</option>
                      <option>Equipment</option>
                      <option>Consumables</option>
                      <option>Medications</option>
                      <option>PPE</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                      <option value="pcs">Pieces</option>
                      <option value="box">Box</option>
                      <option value="pack">Pack</option>
                      <option value="bottle">Bottle</option>
                      <option value="roll">Roll</option>
                      <option value="pair">Pair</option>
                      <option value="set">Set</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (GHS) *</label>
                    <input type="number" step="0.01" value={newItem.unit_cost} onChange={(e) => setNewItem({ ...newItem, unit_cost: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                    <input type="number" value={newItem.reorder_level} onChange={(e) => setNewItem({ ...newItem, reorder_level: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input type="text" value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="e.g., Nurse Station" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                <button onClick={() => setShowAddItem(false)} className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg">Cancel</button>
                <button onClick={handleAddNewItem} disabled={addingItem} className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {addingItem ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick +Stock modal — fast top-up without the full Record Purchase form */}
        {quickAddItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !quickAddSubmitting && setQuickAddItem(null)}
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Add stock to {quickAddItem.item_name}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Current: <span className="font-semibold">{quickAddItem.quantity_on_hand} {quickAddItem.unit}</span>
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Quantity to add <span className="text-danger-500">*</span>
                  </label>
                  <input
                    type="number" min="1" autoFocus
                    value={quickAddQty}
                    onChange={(e) => setQuickAddQty(e.target.value)}
                    placeholder={`Number of ${quickAddItem.unit}`}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Unit cost</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={quickAddUnitCost}
                      onChange={(e) => setQuickAddUnitCost(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Total</label>
                    <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900">
                      {formatCurrency((parseFloat(quickAddUnitCost) || 0) * (parseInt(quickAddQty) || 0))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={quickAddSupplier}
                    onChange={(e) => setQuickAddSupplier(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setQuickAddItem(null)}
                  disabled={quickAddSubmitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleQuickAddStock}
                  disabled={quickAddSubmitting || !quickAddQty}
                  className="px-4 py-2 text-sm font-semibold text-white bg-success-600 rounded-lg hover:bg-success-700 disabled:opacity-60"
                >
                  {quickAddSubmitting ? 'Adding…' : 'Add stock'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default NurseProcurement;
