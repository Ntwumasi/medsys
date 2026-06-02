import { useEffect, useState, useMemo } from 'react';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import AppSelect from '../components/ui/AppSelect';

interface Charge {
  id: number;
  service_name: string;
  service_code: string;
  category: string;
  price: string;
  description: string | null;
  is_active: boolean;
}

interface PayerPrice {
  id?: number;
  payer_type: string;
  insurance_provider_id: number | null;
  corporate_client_id: number | null;
  insurance_provider_name?: string;
  corporate_client_name?: string;
  price: string | null;
  is_excluded: boolean;
}

const CATEGORIES = ['consultation', 'lab', 'imaging', 'pharmacy', 'procedure', 'registration', 'service'];

export default function PriceListManagement() {
  const { showToast } = useNotification();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [form, setForm] = useState({
    service_name: '',
    service_code: '',
    category: 'consultation',
    price: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  // Payer pricing modal
  const [payerModalOpen, setPayerModalOpen] = useState(false);
  const [payerCharge, setPayerCharge] = useState<Charge | null>(null);
  const [payerPrices, setPayerPrices] = useState<PayerPrice[]>([]);
  const [savingPayer, setSavingPayer] = useState(false);

  const loadCharges = async () => {
    try {
      // Lab prices live in lab_test_catalog (single source of truth, shared with
      // the Lab Dashboard). Everything else comes from charge_master.
      const [cmRes, labRes] = await Promise.all([
        apiClient.get('/charge-master'),
        apiClient.get('/lab/test-catalog'),
      ]);
      const nonLab = (cmRes.data.charges || []).filter((c: Charge) => c.category !== 'lab');
      const labAsCharges: Charge[] = (labRes.data.tests || []).map((t: any) => ({
        id: t.id,
        service_name: t.test_name,
        service_code: t.test_code,
        category: 'lab',
        price: String(t.base_price ?? 0),
        description: t.category || null,
        is_active: t.is_active,
      }));
      setCharges([...nonLab, ...labAsCharges]);
    } catch {
      showToast('Failed to load price list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCharges(); }, []);

  const filteredCharges = useMemo(() => {
    return charges.filter((c) => {
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.service_name.toLowerCase().includes(q) ||
          c.service_code.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [charges, search, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set(charges.map((c) => c.category));
    return Array.from(cats).sort();
  }, [charges]);

  // Add/Edit handlers
  const openAdd = () => {
    setEditingCharge(null);
    setForm({ service_name: '', service_code: '', category: 'consultation', price: '', description: '' });
    setModalOpen(true);
  };

  const openEdit = (charge: Charge) => {
    setEditingCharge(charge);
    setForm({
      service_name: charge.service_name,
      service_code: charge.service_code,
      category: charge.category,
      price: parseFloat(charge.price).toFixed(2),
      description: charge.description || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.service_name.trim() || !form.service_code.trim() || !form.price) {
      showToast('Name, code, and price are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const isLab = editingCharge ? editingCharge.category === 'lab' : form.category === 'lab';
      if (editingCharge) {
        if (isLab) {
          // Lab prices are stored in lab_test_catalog (reflects on the Lab Dashboard too)
          await apiClient.put(`/lab/test-catalog/${editingCharge.id}`, {
            test_name: form.service_name,
            test_code: form.service_code,
            base_price: parseFloat(form.price),
          });
        } else {
          await apiClient.put(`/charge-master/${editingCharge.id}`, {
            ...form,
            price: parseFloat(form.price),
          });
        }
        showToast('Service updated successfully', 'success');
      } else {
        if (isLab) {
          await apiClient.post('/lab/test-catalog', {
            test_name: form.service_name,
            test_code: form.service_code,
            base_price: parseFloat(form.price),
            category: 'Lab',
          });
        } else {
          await apiClient.post('/charge-master', {
            ...form,
            price: parseFloat(form.price),
          });
        }
        showToast('Service created successfully', 'success');
      }
      setModalOpen(false);
      loadCharges();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to save service', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Payer pricing handlers
  const openPayerPricing = async (charge: Charge) => {
    setPayerCharge(charge);
    try {
      const pricesRes = await apiClient.get(`/charge-master/${charge.id}/payer-prices`);
      setPayerPrices(pricesRes.data.payer_prices);
      setPayerModalOpen(true);
    } catch {
      showToast('Failed to load payer pricing', 'error');
    }
  };

  const updatePayerPrice = (index: number, field: string, value: any) => {
    setPayerPrices((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const savePayerPrices = async () => {
    if (!payerCharge) return;
    setSavingPayer(true);
    try {
      await apiClient.put(`/charge-master/${payerCharge.id}/payer-prices`, {
        payer_prices: payerPrices.map((pp) => ({
          payer_type: pp.payer_type,
          insurance_provider_id: pp.insurance_provider_id,
          corporate_client_id: pp.corporate_client_id,
          price: pp.is_excluded ? null : parseFloat(pp.price || '0'),
          is_excluded: pp.is_excluded,
        })),
      });
      showToast('Payer prices saved', 'success');
      setPayerModalOpen(false);
    } catch {
      showToast('Failed to save payer prices', 'error');
    } finally {
      setSavingPayer(false);
    }
  };

  const formatPrice = (price: string | number) => {
    const n = typeof price === 'string' ? parseFloat(price) : price;
    return `GHS ${n.toFixed(2)}`;
  };

  return (
    <AppLayout title="Price List Management">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Price List</h1>
            <p className="text-sm text-gray-500 mt-1">View and manage service prices for cash-paying and insured patients</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Service
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Category Filters */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
                    categoryFilter === cat
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative min-w-[260px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          {filteredCharges.length} service{filteredCharges.length !== 1 ? 's' : ''}
        </p>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cash Price</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }}></div>
                      </td>
                    </tr>
                  ))
                ) : filteredCharges.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No services found.
                    </td>
                  </tr>
                ) : (
                  filteredCharges.map((charge) => (
                    <tr key={charge.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <span className="font-mono text-sm text-gray-600">{charge.service_code}</span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-900 text-sm">{charge.service_name}</div>
                        {charge.description && (
                          <div className="text-xs text-gray-500 mt-0.5">{charge.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                          {charge.category}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="font-semibold text-gray-900">{formatPrice(charge.price)}</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(charge)}
                            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit service"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {charge.category !== 'lab' && (
                            <button
                              onClick={() => openPayerPricing(charge)}
                              className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              Payer Prices
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
      </div>

      {/* Add/Edit Service Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setModalOpen(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingCharge ? 'Edit Service' : 'Add New Service'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Name *</label>
                  <input
                    type="text"
                    value={form.service_name}
                    onChange={(e) => setForm({ ...form, service_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Code *</label>
                  <input
                    type="text"
                    value={form.service_code}
                    onChange={(e) => setForm({ ...form, service_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CONS-001"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                  />
                </div>

                <AppSelect
                  label="Category *"
                  value={form.category}
                  onChange={(val) => setForm({ ...form, category: val })}
                  options={CATEGORIES.map((cat) => ({ value: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) }))}
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (GHS) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">GHS</span>
                    <input
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingCharge ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payer Pricing Modal */}
      {payerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setPayerModalOpen(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                Payer Prices: {payerCharge?.service_name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Cash price: {payerCharge ? formatPrice(payerCharge.price) : '—'}
              </p>

              <div className="mt-4">
                {payerPrices.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4">
                    No payer-specific prices set. All payers will use the cash price.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payer</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price (GHS)</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Excluded</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {payerPrices.map((pp, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {pp.insurance_provider_name || pp.corporate_client_name || '—'}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                                pp.payer_type === 'insurance'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-purple-100 text-purple-700'
                              }`}>
                                {pp.payer_type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="relative inline-block">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">GHS</span>
                                <input
                                  type="number"
                                  value={pp.is_excluded ? '' : (pp.price || '')}
                                  disabled={pp.is_excluded}
                                  onChange={(e) => updatePayerPrice(idx, 'price', e.target.value)}
                                  className="w-28 pl-10 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
                                  step="0.01"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={pp.is_excluded}
                                onChange={(e) => updatePayerPrice(idx, 'is_excluded', e.target.checked)}
                                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setPayerModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                {payerPrices.length > 0 && (
                  <button
                    onClick={savePayerPrices}
                    disabled={savingPayer}
                    className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {savingPayer ? 'Saving...' : 'Save Payer Prices'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
