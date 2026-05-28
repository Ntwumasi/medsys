import { useEffect, useState } from 'react';
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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

interface Clinic {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export default function ClinicManagement() {
  const { showToast } = useNotification();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const loadClinics = async () => {
    try {
      const res = await apiClient.get('/clinics');
      setClinics(res.data.clinics);
    } catch {
      showToast('Failed to load clinics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClinics(); }, []);

  const openAdd = () => {
    setEditingClinic(null);
    setForm({ name: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (clinic: Clinic) => {
    setEditingClinic(clinic);
    setForm({ name: clinic.name, description: clinic.description || '' });
    setDialogOpen(true);
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
      setDialogOpen(false);
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
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Typography variant="h5" fontWeight={700}>Clinics</Typography>
            <Typography variant="body2" color="text.secondary">
              Manage specialist clinics available for encounters and billing
            </Typography>
          </div>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Add Clinic
          </Button>
        </div>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Clinic Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>Loading...</TableCell>
                </TableRow>
              ) : clinics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    No clinics found. Click "Add Clinic" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                clinics.map((clinic) => (
                  <TableRow key={clinic.id} hover>
                    <TableCell>
                      <Typography fontWeight={500}>{clinic.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {clinic.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={clinic.is_active ? 'Active' : 'Inactive'}
                        color={clinic.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(clinic)} title="Edit">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDeactivate(clinic)} title="Deactivate" color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingClinic ? 'Edit Clinic' : 'Add New Clinic'}</DialogTitle>
          <DialogContent>
            <TextField
              label="Clinic Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              fullWidth
              required
              sx={{ mt: 1, mb: 2 }}
              autoFocus
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
              {saving ? 'Saving...' : editingClinic ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </AppLayout>
  );
}
