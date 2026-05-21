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

  const [activeTab, setActiveTab] = useState<'stock' | 'purchase' | 'history'>('stock');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'category' | 'quantity' | 'status'>('name');
  const [showLowOnly, setShowLowOnly] = useState(false);

  // Quick +Stock modal — light alternative to Record Purchase for fast top-ups
  const [quickAddItem, setQuickAddItem] = useState<InventoryItem | null>(null);
  const [quickAddQty, setQuickAddQty] = useState('');
  const [quickAddUnitCost, setQuickAddUnitCost] = useState('');
  const [quickAddSupplier, setQuickAddSupplier] = useState('');
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);

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

  useEffect(() => {
    loadInventory();
    loadPurchases();
  }, [loadInventory, loadPurchases]);

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
          {(['stock', 'purchase', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'stock' ? 'Current Stock' : tab === 'purchase' ? 'Record Purchase' : 'Purchase History'}
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
