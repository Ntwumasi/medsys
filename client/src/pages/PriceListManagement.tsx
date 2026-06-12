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

interface Payer { id: number; name: string; payer_type: 'insurance' | 'corporate'; }
interface TariffRow { id: number; service_name: string; service_code: string; category: string; cash_price: string | number; payer_price: string | number | null; is_excluded: boolean; }

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

  // Payer Tariffs tab — edit one payer's whole price list at once (+ CSV upload)
  const [view, setView] = useState<'prices' | 'tariffs'>('prices');
  const [payers, setPayers] = useState<Payer[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<Payer | null>(null);
  const [tariffRows, setTariffRows] = useState<TariffRow[]>([]);
  const [tariffEdits, setTariffEdits] = useState<Record<number, { price: string; is_excluded: boolean }>>({});
  const [tariffLoading, setTariffLoading] = useState(false);
  const [tariffSaving, setTariffSaving] = useState(false);
  const [tariffSearch, setTariffSearch] = useState('');
  const [tariffCategory, setTariffCategory] = useState('');
  const [tariffImportMsg, setTariffImportMsg] = useState('');

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

  // ---- Payer Tariffs tab ----
  useEffect(() => {
    if (view !== 'tariffs' || payers.length > 0) return;
    apiClient.get('/charge-master/payers')
      .then((res) => setPayers(res.data.payers || []))
      .catch(() => showToast('Failed to load payers', 'error'));
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPayer = async (payer: Payer | null) => {
    setSelectedPayer(payer);
    setTariffRows([]); setTariffEdits({}); setTariffSearch(''); setTariffCategory(''); setTariffImportMsg('');
    if (!payer) return;
    setTariffLoading(true);
    try {
      const res = await apiClient.get(`/charge-master/payer-schedule/${payer.payer_type}/${payer.id}`);
      const rows: TariffRow[] = res.data.schedule || [];
      setTariffRows(rows);
      const seed: Record<number, { price: string; is_excluded: boolean }> = {};
      rows.forEach((r) => {
        seed[r.id] = {
          price: r.payer_price !== null && r.payer_price !== undefined ? String(r.payer_price) : '',
          is_excluded: !!r.is_excluded,
        };
      });
      setTariffEdits(seed);
    } catch {
      showToast('Failed to load tariff', 'error');
    } finally {
      setTariffLoading(false);
    }
  };

  const saveTariff = async () => {
    if (!selectedPayer) return;
    setTariffSaving(true);
    try {
      const items = tariffRows.map((r) => ({
        charge_master_id: r.id,
        price: tariffEdits[r.id]?.price ?? '',
        is_excluded: tariffEdits[r.id]?.is_excluded ?? false,
      }));
      const res = await apiClient.put(`/charge-master/payer-schedule/${selectedPayer.payer_type}/${selectedPayer.id}`, { items });
      showToast(`Tariff saved — ${res.data.updated} priced${res.data.cleared ? `, ${res.data.cleared} cleared` : ''}`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to save tariff', 'error');
    } finally {
      setTariffSaving(false);
    }
  };

  const handleTariffCsv = async (file: File) => {
    setTariffImportMsg('');
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setTariffImportMsg('File looks empty.'); return; }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const codeIdx = headers.findIndex((h) => h.includes('code'));
      const nameIdx = headers.findIndex((h) => h.includes('service') || h.includes('name') || h.includes('description'));
      const priceIdx = headers.findIndex((h) => h.includes('price') || h.includes('tariff') || h.includes('rate') || h.includes('amount'));
      const exclIdx = headers.findIndex((h) => h.includes('exclud') || h.includes('not covered'));
      if (priceIdx === -1 || (codeIdx === -1 && nameIdx === -1)) {
        setTariffImportMsg('Need a price column and a service code or name column. Headers found: ' + headers.join(', '));
        return;
      }
      const byCode = new Map(tariffRows.map((r) => [String(r.service_code).toLowerCase(), r.id]));
      const byName = new Map(tariffRows.map((r) => [String(r.service_name).toLowerCase().trim(), r.id]));
      let matched = 0; const unmatched: string[] = [];
      const next = { ...tariffEdits };
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const key = codeIdx !== -1 ? cols[codeIdx]?.toLowerCase() : '';
        const nameKey = nameIdx !== -1 ? cols[nameIdx]?.toLowerCase().trim() : '';
        const id = (key && byCode.get(key)) || (nameKey && byName.get(nameKey));
        if (!id) { unmatched.push(cols[codeIdx] || cols[nameIdx] || `row ${i + 1}`); continue; }
        const rawPrice = (cols[priceIdx] || '').replace(/[^0-9.]/g, '');
        const excluded = exclIdx !== -1 ? /^(y|yes|true|1|x|excluded)$/i.test(cols[exclIdx] || '') : false;
        next[id] = { price: excluded ? '' : rawPrice, is_excluded: excluded };
        matched++;
      }
      setTariffEdits(next);
      setTariffImportMsg(`Matched ${matched} service${matched === 1 ? '' : 's'}.` + (unmatched.length ? ` Couldn't match ${unmatched.length}: ${unmatched.slice(0, 8).join(', ')}${unmatched.length > 8 ? '…' : ''}. Review then Save.` : ' Review then Save.'));
    } catch {
      setTariffImportMsg('Could not read that file. Use a CSV with headers.');
    }
  };

  return (
    <AppLayout title="Price List Management">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Price List</h1>
            <p className="text-sm text-gray-500 mt-1">Manage cash/service prices, lab prices, and each insurer's & corporate client's tariff</p>
          </div>
          {view === 'prices' && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Service
            </button>
          )}
        </div>

        {/* View tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {([['prices', 'Service & Lab Prices'], ['tariffs', 'Payer Tariffs']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === v ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'prices' && (<>
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
        </>)}

        {view === 'tariffs' && (() => {
          const categories = Array.from(new Set(tariffRows.map((r) => r.category).filter(Boolean)));
          const visible = tariffRows.filter((r) => {
            if (tariffCategory && r.category !== tariffCategory) return false;
            if (tariffSearch) {
              const q = tariffSearch.toLowerCase();
              if (!r.service_name?.toLowerCase().includes(q) && !r.service_code?.toLowerCase().includes(q)) return false;
            }
            return true;
          });
          const pricedCount = tariffRows.filter((r) => { const e = tariffEdits[r.id]; return e && (e.is_excluded || (e.price !== '' && !isNaN(Number(e.price)))); }).length;
          return (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex flex-wrap items-end gap-4">
                <div className="min-w-[280px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payer (insurer / corporate)</label>
                  <AppSelect
                    value={selectedPayer ? `${selectedPayer.payer_type}:${selectedPayer.id}` : ''}
                    onChange={(val) => {
                      if (!val) { selectPayer(null); return; }
                      const [t, idStr] = val.split(':');
                      const found = payers.find((p) => p.payer_type === (t as any) && p.id === Number(idStr));
                      selectPayer(found || null);
                    }}
                    options={[
                      { value: '', label: '— Select a payer —' },
                      ...payers.filter((p) => p.payer_type === 'insurance').map((p) => ({ value: `insurance:${p.id}`, label: `Insurance: ${p.name}` })),
                      ...payers.filter((p) => p.payer_type === 'corporate').map((p) => ({ value: `corporate:${p.id}`, label: `Corporate: ${p.name}` })),
                    ]}
                  />
                </div>
                {selectedPayer && (
                  <p className="text-sm text-gray-500 pb-2">{pricedCount} of {tariffRows.length} services priced. Blank = uses cash price.</p>
                )}
              </div>

              {!selectedPayer ? (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12 text-center text-gray-500">
                  Pick a payer above to set their negotiated price per service.
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                  <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
                    <input
                      type="text" placeholder="Search service…" value={tariffSearch}
                      onChange={(e) => setTariffSearch(e.target.value)}
                      className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="w-44">
                      <AppSelect
                        value={tariffCategory}
                        onChange={(val) => setTariffCategory(val)}
                        options={[{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
                      />
                    </div>
                    <label className="px-3 py-2 text-sm bg-white text-primary-700 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer font-medium">
                      Upload CSV
                      <input type="file" accept=".csv,text/csv" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTariffCsv(f); e.target.value = ''; }} />
                    </label>
                    <button onClick={saveTariff} disabled={tariffSaving || tariffLoading}
                      className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium text-sm">
                      {tariffSaving ? 'Saving…' : 'Save Tariff'}
                    </button>
                  </div>
                  {tariffImportMsg && (
                    <div className="px-4 py-2 bg-blue-50 text-blue-800 text-xs border-b border-blue-100">{tariffImportMsg}</div>
                  )}
                  <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                    {tariffLoading ? (
                      <div className="py-12 text-center text-gray-500">Loading services…</div>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cash</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Tariff (GHS)</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Excluded</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {visible.map((r) => {
                            const e = tariffEdits[r.id] || { price: '', is_excluded: false };
                            return (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2">
                                  <div className="font-medium text-gray-900">{r.service_name}</div>
                                  <div className="text-xs text-gray-400 font-mono">{r.service_code}</div>
                                </td>
                                <td className="px-4 py-2 text-gray-600 capitalize">{r.category}</td>
                                <td className="px-4 py-2 text-right text-gray-500">{Number(r.cash_price).toFixed(2)}</td>
                                <td className="px-4 py-2 text-center">
                                  <input
                                    type="number" min="0" step="0.01"
                                    disabled={e.is_excluded}
                                    value={e.price}
                                    onChange={(ev) => setTariffEdits((prev) => ({ ...prev, [r.id]: { price: ev.target.value, is_excluded: prev[r.id]?.is_excluded || false } }))}
                                    placeholder="cash"
                                    className="w-24 px-2 py-1 text-right border border-gray-300 rounded disabled:bg-gray-100 disabled:text-gray-400"
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={e.is_excluded}
                                    onChange={(ev) => setTariffEdits((prev) => ({ ...prev, [r.id]: { price: prev[r.id]?.price || '', is_excluded: ev.target.checked } }))}
                                    className="w-4 h-4"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                          {visible.length === 0 && (
                            <tr><td colSpan={5} className="py-8 text-center text-gray-400">No services match.</td></tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
