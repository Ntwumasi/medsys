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
  const { user } = useAuth();
  const { showToast } = useNotification();

  const [activeTab, setActiveTab] = useState<'stock' | 'purchase' | 'history' | 'add'>('stock');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

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

  // Add item form
  const [itemForm, setItemForm] = useState({
    item_name: '', category: 'Supplies', unit: 'pcs',
    quantity_on_hand: '0', reorder_level: '10', unit_cost: '0',
    location: 'Nurse Station', supplier: '',
  });

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
      await apiClient.post('/nurse/inventory/purchase', {
        inventory_id: parseInt(purchaseForm.inventory_id),
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

  const handleAddItem = async () => {
    if (!itemForm.item_name) {
      showToast('Item name is required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/nurse/inventory', {
        item_name: itemForm.item_name,
        category: itemForm.category,
        unit: itemForm.unit,
        quantity_on_hand: parseInt(itemForm.quantity_on_hand) || 0,
        reorder_level: parseInt(itemForm.reorder_level) || 10,
        unit_cost: parseFloat(itemForm.unit_cost) || 0,
        location: itemForm.location,
        supplier: itemForm.supplier || null,
      });
      showToast('Item added to inventory', 'success');
      setItemForm({ item_name: '', category: 'Supplies', unit: 'pcs', quantity_on_hand: '0', reorder_level: '10', unit_cost: '0', location: 'Nurse Station', supplier: '' });
      loadInventory();
      setActiveTab('stock');
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to add item', 'error');
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

  const filteredItems = items.filter(i =>
    (categoryFilter === 'all' || i.category === categoryFilter) &&
    (search === '' || i.item_name.toLowerCase().includes(search.toLowerCase()))
  );

  const categories = [...new Set(items.map(i => i.category))];

  // Only head nurse should see this page
  if (user?.role === 'nurse' && !user?.is_head_nurse) {
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
      <div className="max-w-6xl mx-auto">
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
          {(['stock', 'purchase', 'history', 'add'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'stock' ? 'Current Stock' : tab === 'purchase' ? 'Record Purchase' : tab === 'history' ? 'Purchase History' : 'Add New Item'}
            </button>
          ))}
        </div>

        {/* Stock Tab */}
        {activeTab === 'stock' && (
          <div>
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No items yet. Use "Add New Item" to get started.</p>
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
          <div className="max-w-xl">
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Record Purchase</h3>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Item *</label>
                <select
                  value={purchaseForm.inventory_id}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, inventory_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select item...</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.item_name} ({i.quantity_on_hand} {i.unit} in stock)
                    </option>
                  ))}
                </select>
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

        {/* Add Item Tab */}
        {activeTab === 'add' && (
          <div className="max-w-xl">
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Add New Inventory Item</h3>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Item Name *</label>
                <input type="text" value={itemForm.item_name}
                  onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. Syringes (10ml)" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                  <select value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option>Supplies</option><option>Equipment</option><option>PPE</option><option>Medications</option><option>Linen</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
                  <select value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option>pcs</option><option>boxes</option><option>packs</option><option>rolls</option><option>bottles</option><option>pairs</option><option>sets</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Initial Qty</label>
                  <input type="number" min="0" value={itemForm.quantity_on_hand}
                    onChange={(e) => setItemForm({ ...itemForm, quantity_on_hand: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reorder Level</label>
                  <input type="number" min="0" value={itemForm.reorder_level}
                    onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit Cost</label>
                  <input type="number" step="0.01" min="0" value={itemForm.unit_cost}
                    onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Location</label>
                  <input type="text" value={itemForm.location}
                    onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Supplier</label>
                  <input type="text" value={itemForm.supplier}
                    onChange={(e) => setItemForm({ ...itemForm, supplier: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>

              <button
                onClick={handleAddItem}
                disabled={submitting}
                className="w-full px-6 py-3 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 disabled:opacity-60"
              >
                {submitting ? 'Adding...' : 'Add Item'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default NurseProcurement;
