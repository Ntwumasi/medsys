import { Fragment, useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

interface Clinic {
  id: number;
  name: string;
  description: string | null;
  consultation_price: number | string | null;
  is_active: boolean;
  created_at: string;
}

interface PayerPrice {
  payer_id: number;
  name: string;
  price: number | null;
  excluded: boolean;
  set: boolean;
}
interface ClinicPricing {
  id: number;
  name: string;
  charge_master_id: number | null;
  self_pay: number | null;
  insurance: PayerPrice[];
  corporate: PayerPrice[];
}

export default function ClinicManagement() {
  const { showToast } = useNotification();
  const { user } = useAuth();
  const canEditPrices = user?.role === 'admin' || user?.role === 'office_manager' || user?.is_super_admin === true;
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [pricing, setPricing] = useState<Record<number, ClinicPricing>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [form, setForm] = useState({ name: '', description: '', consultation_price: '' });
  const [saving, setSaving] = useState(false);

  // Inline price editing within the expanded panel
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [priceForm, setPriceForm] = useState<{
    self_pay: string;
    insurance: Record<number, { price: string; excluded: boolean }>;
    corporate: Record<number, { price: string; excluded: boolean }>;
  }>({ self_pay: '', insurance: {}, corporate: {} });
  const [savingPrices, setSavingPrices] = useState(false);

  const startEditPrices = (p: ClinicPricing) => {
    const ins: Record<number, { price: string; excluded: boolean }> = {};
    for (const x of p.insurance) ins[x.payer_id] = { price: x.price != null ? String(x.price) : '', excluded: x.excluded };
    const corp: Record<number, { price: string; excluded: boolean }> = {};
    for (const x of p.corporate) corp[x.payer_id] = { price: x.price != null ? String(x.price) : '', excluded: x.excluded };
    setPriceForm({ self_pay: p.self_pay != null ? String(p.self_pay) : '', insurance: ins, corporate: corp });
    setEditingPriceId(p.id);
  };

  const savePrices = async (clinicId: number) => {
    setSavingPrices(true);
    try {
      const payers = [
        ...Object.entries(priceForm.insurance).map(([pid, v]) => ({
          payer_type: 'insurance' as const, payer_id: Number(pid),
          price: v.price === '' ? null : Number(v.price), excluded: v.excluded,
        })),
        ...Object.entries(priceForm.corporate).map(([pid, v]) => ({
          payer_type: 'corporate' as const, payer_id: Number(pid),
          price: v.price === '' ? null : Number(v.price), excluded: v.excluded,
        })),
      ];
      const { data } = await apiClient.put(`/clinics/${clinicId}/pricing`, {
        self_pay: priceForm.self_pay === '' ? null : Number(priceForm.self_pay),
        payers,
      });
      const n = (data.changes || []).length;
      showToast(n > 0 ? `Prices updated (${n} change${n !== 1 ? 's' : ''}); admins notified` : 'No price changes', 'success');
      setEditingPriceId(null);
      loadClinics();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update prices', 'error');
    } finally {
      setSavingPrices(false);
    }
  };

  const loadClinics = async () => {
    try {
      const [res, priceRes] = await Promise.all([
        apiClient.get('/clinics'),
        apiClient.get('/clinics/pricing'),
      ]);
      setClinics(res.data.clinics);
      const map: Record<number, ClinicPricing> = {};
      for (const c of priceRes.data.clinics) map[c.id] = c;
      setPricing(map);
    } catch {
      showToast('Failed to load clinics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClinics(); }, []);

  const fmtPayer = (p: PayerPrice): string =>
    p.excluded ? 'Not covered' : p.price === 0 ? 'Covered (free)' : `GHS ${Number(p.price).toFixed(2)}`;

  const openAdd = () => {
    setEditingClinic(null);
    setForm({ name: '', description: '', consultation_price: '' });
    setModalOpen(true);
  };

  const openEdit = (clinic: Clinic) => {
    setEditingClinic(clinic);
    setForm({
      name: clinic.name,
      description: clinic.description || '',
      consultation_price: clinic.consultation_price != null ? String(clinic.consultation_price) : '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Clinic name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingClinic) {
        await apiClient.put(`/clinics/${editingClinic.id}`, form);
        showToast('Clinic updated successfully', 'success');
      } else {
        await apiClient.post('/clinics', form);
        showToast('Clinic created successfully', 'success');
      }
      setModalOpen(false);
      loadClinics();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to save clinic', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (clinic: Clinic) => {
    if (!window.confirm(`Deactivate "${clinic.name}"? It will no longer appear in dropdowns.`)) return;
    try {
      await apiClient.delete(`/clinics/${clinic.id}`);
      showToast('Clinic deactivated', 'success');
      loadClinics();
    } catch {
      showToast('Failed to deactivate clinic', 'error');
    }
  };

  return (
    <AppLayout title="Clinic Management">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clinics</h1>
            <p className="text-sm text-gray-500 mt-1">Manage specialist clinics available for encounters and billing</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Clinic
          </button>
        </div>

        <p className="text-sm text-gray-500">
          {clinics.length} clinic{clinics.length !== 1 ? 's' : ''}
        </p>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clinic Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consultation Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }}></div>
                      </td>
                    </tr>
                  ))
                ) : clinics.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No clinics found. Click "Add Clinic" to create one.
                    </td>
                  </tr>
                ) : (
                  clinics.map((clinic) => {
                    const price = pricing[clinic.id];
                    const hasBreakdown = !!price && price.charge_master_id != null;
                    const isOpen = expanded === clinic.id;
                    return (
                    <Fragment key={clinic.id}>
                    <tr
                      className={`transition-colors ${hasBreakdown ? 'cursor-pointer hover:bg-gray-50' : 'hover:bg-gray-50'}`}
                      onClick={hasBreakdown ? () => setExpanded(isOpen ? null : clinic.id) : undefined}
                    >
                      <td className="px-6 py-3">
                        <span className="flex items-center gap-2 font-medium text-gray-900">
                          {hasBreakdown && (
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          {clinic.name}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-sm text-gray-500">{clinic.description || '—'}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-sm font-medium text-gray-900">
                          {clinic.consultation_price != null ? `GHS ${Number(clinic.consultation_price).toFixed(2)}` : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          clinic.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {clinic.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(clinic); }}
                            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeactivate(clinic); }}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Deactivate"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && hasBreakdown && (() => {
                      const isEditing = editingPriceId === clinic.id;
                      const renderPayerEdit = (kind: 'insurance' | 'corporate', list: PayerPrice[]) => (
                        <div className="space-y-2">
                          {list.map((p) => {
                            const cur = priceForm[kind][p.payer_id] || { price: '', excluded: false };
                            return (
                              <div key={p.payer_id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-gray-700 flex-1 truncate">{p.name}</span>
                                <input
                                  type="number" min="0" step="0.01" value={cur.excluded ? '' : cur.price}
                                  disabled={cur.excluded} placeholder="self-pay"
                                  onChange={(e) => setPriceForm((f) => ({ ...f, [kind]: { ...f[kind], [p.payer_id]: { ...cur, price: e.target.value } } }))}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 disabled:bg-gray-100"
                                />
                                <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                                  <input
                                    type="checkbox" checked={cur.excluded}
                                    onChange={(e) => setPriceForm((f) => ({ ...f, [kind]: { ...f[kind], [p.payer_id]: { ...cur, excluded: e.target.checked } } }))}
                                  />
                                  Not covered
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      );
                      const renderPayerList = (list: PayerPrice[]) => {
                        const shown = list.filter((p) => p.set);
                        if (shown.length === 0) return <p className="text-sm text-gray-400">No special rates — billed at self-pay.</p>;
                        return (
                          <div className="space-y-1">
                            {shown.map((p) => (
                              <div key={p.payer_id} className="flex justify-between text-sm">
                                <span className="text-gray-700">{p.name}</span>
                                <span className={p.excluded ? 'text-gray-400' : p.price === 0 ? 'text-green-600 font-medium' : 'text-gray-900 font-medium'}>{fmtPayer(p)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      };
                      return (
                      <tr key={`${clinic.id}-detail`} className="bg-gray-50/60">
                        <td colSpan={5} className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm">
                              <span className="text-gray-500">Self-pay: </span>
                              {isEditing ? (
                                <input
                                  type="number" min="0" step="0.01" value={priceForm.self_pay}
                                  onChange={(e) => setPriceForm((f) => ({ ...f, self_pay: e.target.value }))}
                                  className="w-28 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                />
                              ) : (
                                <span className="font-medium text-gray-700">{price.self_pay != null ? `GHS ${price.self_pay.toFixed(2)}` : '—'}</span>
                              )}
                            </div>
                            {canEditPrices && (isEditing ? (
                              <div className="flex gap-2">
                                <button onClick={() => setEditingPriceId(null)} disabled={savingPrices}
                                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
                                <button onClick={() => savePrices(clinic.id)} disabled={savingPrices}
                                  className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                                  {savingPrices ? 'Saving…' : 'Save prices'}</button>
                              </div>
                            ) : (
                              <button onClick={() => startEditPrices(price)}
                                className="px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100">
                                Edit prices</button>
                            ))}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Insurance</p>
                              {isEditing ? renderPayerEdit('insurance', price.insurance) : renderPayerList(price.insurance)}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Corporate</p>
                              {isEditing ? renderPayerEdit('corporate', price.corporate) : renderPayerList(price.corporate)}
                            </div>
                          </div>
                          <p className="text-xs text-gray-400 mt-3">
                            Payers left blank are billed the self-pay rate. The matching rate applies automatically on the invoice based on the patient's payer source.{canEditPrices ? ' Admins are notified of any price change.' : ''}
                          </p>
                        </td>
                      </tr>
                      );
                    })()}
                    </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setModalOpen(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingClinic ? 'Edit Clinic' : 'Add New Clinic'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Price (GHS)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.consultation_price}
                    onChange={(e) => setForm({ ...form, consultation_price: e.target.value })}
                    placeholder="e.g. 400.00"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Charged at check-in when this clinic is selected. Leave blank for none.</p>
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
                  {saving ? 'Saving...' : editingClinic ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
