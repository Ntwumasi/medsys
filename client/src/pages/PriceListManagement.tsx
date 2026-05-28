import { useEffect, useState, useMemo } from 'react';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import {
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Chip,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';

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

const CATEGORIES = ['consultation', 'lab', 'imaging', 'pharmacy', 'procedure', 'registration'];

export default function PriceListManagement() {
  const { showToast } = useNotification();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [form, setForm] = useState({
    service_name: '',
    service_code: '',
    category: 'consultation',
    price: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  // Payer pricing dialog
  const [payerDialogOpen, setPayerDialogOpen] = useState(false);
  const [payerCharge, setPayerCharge] = useState<Charge | null>(null);
  const [payerPrices, setPayerPrices] = useState<PayerPrice[]>([]);
  const [savingPayer, setSavingPayer] = useState(false);

  const loadCharges = async () => {
    try {
      const res = await apiClient.get('/charge-master');
      setCharges(res.data.charges);
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
    setDialogOpen(true);
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
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.service_name.trim() || !form.service_code.trim() || !form.price) {
      showToast('Name, code, and price are required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingCharge) {
        await apiClient.put(`/charge-master/${editingCharge.id}`, {
          ...form,
          price: parseFloat(form.price),
        });
        showToast('Service updated successfully', 'success');
      } else {
        await apiClient.post('/charge-master', {
          ...form,
          price: parseFloat(form.price),
        });
        showToast('Service created successfully', 'success');
      }
      setDialogOpen(false);
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
      setPayerDialogOpen(true);
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
      setPayerDialogOpen(false);
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
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Typography variant="h5" fontWeight={700}>Price List</Typography>
            <Typography variant="body2" color="text.secondary">
              View and manage service prices for cash-paying and insured patients
            </Typography>
          </div>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Add Service
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <TextField
            size="small"
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 260 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch('')}><ClearIcon fontSize="small" /></IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <Tabs
            value={categoryFilter}
            onChange={(_, v) => setCategoryFilter(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0, textTransform: 'capitalize' } }}
          >
            <Tab label="All" value="all" />
            {categories.map((cat) => (
              <Tab key={cat} label={cat} value={cat} />
            ))}
          </Tabs>
        </div>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {filteredCharges.length} service{filteredCharges.length !== 1 ? 's' : ''}
        </Typography>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Service Code</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Service Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Cash Price</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>Loading...</TableCell>
                </TableRow>
              ) : filteredCharges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    No services found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCharges.map((charge) => (
                  <TableRow key={charge.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize={13}>
                        {charge.service_code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={500} fontSize={14}>{charge.service_name}</Typography>
                      {charge.description && (
                        <Typography variant="caption" color="text.secondary">{charge.description}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={charge.category} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={600} fontSize={14}>
                        {formatPrice(charge.price)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(charge)} title="Edit price">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <Button size="small" onClick={() => openPayerPricing(charge)} sx={{ ml: 0.5, fontSize: 12 }}>
                        Payer Prices
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Add/Edit Service Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingCharge ? 'Edit Service' : 'Add New Service'}</DialogTitle>
          <DialogContent>
            <TextField
              label="Service Name"
              value={form.service_name}
              onChange={(e) => setForm({ ...form, service_name: e.target.value })}
              fullWidth
              required
              sx={{ mt: 1, mb: 2 }}
              autoFocus
            />
            <TextField
              label="Service Code"
              value={form.service_code}
              onChange={(e) => setForm({ ...form, service_code: e.target.value.toUpperCase() })}
              fullWidth
              required
              sx={{ mb: 2 }}
              placeholder="e.g. CONS-001"
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={form.category}
                label="Category"
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <MenuItem key={cat} value={cat} sx={{ textTransform: 'capitalize' }}>{cat}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Price (GHS)"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              fullWidth
              required
              type="number"
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: <InputAdornment position="start">GHS</InputAdornment>,
              }}
            />
            <TextField
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingCharge ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Payer Pricing Dialog */}
        <Dialog open={payerDialogOpen} onClose={() => setPayerDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            Payer Prices: {payerCharge?.service_name}
            <Typography variant="body2" color="text.secondary">
              Cash price: {payerCharge ? formatPrice(payerCharge.price) : '—'}
            </Typography>
          </DialogTitle>
          <DialogContent>
            {payerPrices.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No payer-specific prices set. All payers will use the cash price.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Payer</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Price (GHS)</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Excluded</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payerPrices.map((pp, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        {pp.insurance_provider_name || pp.corporate_client_name || '—'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={pp.payer_type}
                          size="small"
                          color={pp.payer_type === 'insurance' ? 'primary' : 'secondary'}
                          variant="outlined"
                          sx={{ textTransform: 'capitalize' }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={pp.is_excluded ? '' : (pp.price || '')}
                          disabled={pp.is_excluded}
                          onChange={(e) => updatePayerPrice(idx, 'price', e.target.value)}
                          sx={{ width: 120 }}
                          InputProps={{
                            startAdornment: <InputAdornment position="start">GHS</InputAdornment>,
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <input
                          type="checkbox"
                          checked={pp.is_excluded}
                          onChange={(e) => updatePayerPrice(idx, 'is_excluded', e.target.checked)}
                          className="w-4 h-4"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPayerDialogOpen(false)}>Cancel</Button>
            {payerPrices.length > 0 && (
              <Button variant="contained" onClick={savePayerPrices} disabled={savingPayer}>
                {savingPayer ? 'Saving...' : 'Save Payer Prices'}
              </Button>
            )}
          </DialogActions>
        </Dialog>
      </div>
    </AppLayout>
  );
}
