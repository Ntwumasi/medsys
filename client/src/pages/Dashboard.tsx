import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { appointmentsAPI } from '../api/appointments';
import type { Appointment } from '../types';
import { format } from 'date-fns';
import apiClient from '../api/client';
import PrintableInvoice from '../components/PrintableInvoice';
import SearchBar from '../components/SearchBar';
import SystemUpdates from '../components/SystemUpdates';
import { useNotification } from '../context/NotificationContext';
import {
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Box,
  Chip,
  TextField,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Clear as ClearIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

interface CorporateClient {
  id: number;
  name: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  assigned_doctor_id?: number;
  assigned_doctor_name?: string;
}

interface InsuranceProvider {
  id: number;
  name: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { showToast } = useNotification();
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPastAppointments, setLoadingPastAppointments] = useState(false);
  const [activeTab, setActiveTab] = useState<'appointments' | 'corporate' | 'insurance' | 'invoices' | 'staff' | 'updates'>('staff');
  const [appointmentsSubTab, setAppointmentsSubTab] = useState<'current' | 'past'>('current');

  // Invoice state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<any[]>([]);

  // Corporate clients state
  const [corporateClients, setCorporateClients] = useState<CorporateClient[]>([]);
  const [showCorporateForm, setShowCorporateForm] = useState(false);
  const [corporateForm, setCorporateForm] = useState({ name: '', contact_person: '', contact_email: '', contact_phone: '', assigned_doctor_id: '' });

  // Doctors state
  const [doctors, setDoctors] = useState<any[]>([]);

  // Insurance providers state
  const [insuranceProviders, setInsuranceProviders] = useState<InsuranceProvider[]>([]);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [insuranceForm, setInsuranceForm] = useState({ name: '', contact_person: '', contact_email: '', contact_phone: '' });

  // Staff management state
  const [staff, setStaff] = useState<any[]>([]);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [staffForm, setStaffForm] = useState({
    email: '',
    password: '',
    role: 'doctor',
    first_name: '',
    last_name: '',
    phone: ''
  });

  // Staff filtering, sorting, and pagination state
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>('all');
  const [staffStatusFilter, setStaffStatusFilter] = useState<string>('all');
  const [staffSortBy, setStaffSortBy] = useState<'name' | 'email' | 'role'>('name');
  const [staffSortOrder, setStaffSortOrder] = useState<'asc' | 'desc'>('asc');
  const [staffPage, setStaffPage] = useState(1);
  const staffItemsPerPage = 10;

  useEffect(() => {
    loadTodayAppointments();
    loadCorporateClients();
    loadInsuranceProviders();
    loadPatients();
    loadDoctors();
    loadStaff();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      loadInvoicesByPatient(selectedPatientId);
    }
  }, [selectedPatientId]);

  const loadTodayAppointments = async () => {
    try {
      const response = await appointmentsAPI.getTodayAppointments(user?.id);
      setTodayAppointments(response.appointments || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPastAppointments = async () => {
    try {
      setLoadingPastAppointments(true);
      const response = await apiClient.get('/appointments', {
        params: {
          status: 'completed',
          limit: 50,
        },
      });
      setPastAppointments(response.data.appointments || []);
    } catch (error) {
      console.error('Error loading past appointments:', error);
      setPastAppointments([]);
    } finally {
      setLoadingPastAppointments(false);
    }
  };

  // Load past appointments when the subtab changes
  useEffect(() => {
    if (activeTab === 'appointments' && appointmentsSubTab === 'past') {
      loadPastAppointments();
    }
  }, [activeTab, appointmentsSubTab]);

  const loadCorporateClients = async () => {
    try {
      const response = await apiClient.get('/payer-sources/corporate-clients');
      setCorporateClients(response.data.corporate_clients || []);
    } catch (error) {
      console.error('Error loading corporate clients:', error);
    }
  };

  const loadInsuranceProviders = async () => {
    try {
      const response = await apiClient.get('/payer-sources/insurance-providers');
      setInsuranceProviders(response.data.insurance_providers || []);
    } catch (error) {
      console.error('Error loading insurance providers:', error);
    }
  };

  const loadDoctors = async () => {
    try {
      // For now, use hardcoded doctors from seeded data
      // In production, this should fetch from /users?role=doctor endpoint
      setDoctors([
        { id: 5, first_name: 'John', last_name: 'Williams' }, // doctor@medsys.com
        { id: 6, first_name: 'Emily', last_name: 'Davis' }, // doctor2@medsys.com
      ]);
    } catch (error) {
      console.error('Error loading doctors:', error);
      // Fallback to known doctors
      setDoctors([
        { id: 5, first_name: 'John', last_name: 'Williams' },
        { id: 6, first_name: 'Emily', last_name: 'Davis' },
      ]);
    }
  };

  const loadStaff = async () => {
    try {
      const response = await apiClient.get('/users');
      setStaff(response.data.users || []);
    } catch (error) {
      console.error('Error loading staff:', error);
    }
  };

  // Filter, sort, and paginate staff data
  const getFilteredAndSortedStaff = () => {
    let filteredStaff = [...staff];

    // Apply search filter
    if (staffSearchTerm) {
      const searchLower = staffSearchTerm.toLowerCase();
      filteredStaff = filteredStaff.filter(
        (member) =>
          member.first_name?.toLowerCase().includes(searchLower) ||
          member.last_name?.toLowerCase().includes(searchLower) ||
          member.email?.toLowerCase().includes(searchLower)
      );
    }

    // Apply role filter
    if (staffRoleFilter !== 'all') {
      filteredStaff = filteredStaff.filter((member) => member.role === staffRoleFilter);
    }

    // Apply status filter
    if (staffStatusFilter !== 'all') {
      const isActive = staffStatusFilter === 'active';
      filteredStaff = filteredStaff.filter((member) => member.is_active === isActive);
    }

    // Apply sorting
    filteredStaff.sort((a, b) => {
      let compareA, compareB;

      if (staffSortBy === 'name') {
        compareA = `${a.first_name} ${a.last_name}`.toLowerCase();
        compareB = `${b.first_name} ${b.last_name}`.toLowerCase();
      } else if (staffSortBy === 'email') {
        compareA = a.email?.toLowerCase() || '';
        compareB = b.email?.toLowerCase() || '';
      } else if (staffSortBy === 'role') {
        compareA = a.role?.toLowerCase() || '';
        compareB = b.role?.toLowerCase() || '';
      }

      if (compareA < compareB) return staffSortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return staffSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filteredStaff;
  };

  const getPaginatedStaff = () => {
    const filteredStaff = getFilteredAndSortedStaff();
    const startIndex = (staffPage - 1) * staffItemsPerPage;
    const endIndex = startIndex + staffItemsPerPage;
    return filteredStaff.slice(startIndex, endIndex);
  };

  const getTotalStaffPages = () => {
    const filteredStaff = getFilteredAndSortedStaff();
    return Math.ceil(filteredStaff.length / staffItemsPerPage);
  };

  const handleStaffSort = (column: 'name' | 'email' | 'role') => {
    if (staffSortBy === column) {
      // Toggle sort order
      setStaffSortOrder(staffSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setStaffSortBy(column);
      setStaffSortOrder('asc');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!editingStaff && !staffForm.password) {
        showToast('Password is required for new staff members', 'warning');
        return;
      }

      if (editingStaff) {
        // Update existing staff
        const updateData: any = { ...staffForm };
        if (!staffForm.password) {
          // Don't include password if not provided
          const { password, ...dataWithoutPassword } = updateData;
          await apiClient.put(`/users/${editingStaff.id}`, dataWithoutPassword);
        } else {
          await apiClient.put(`/users/${editingStaff.id}`, updateData);
        }
        showToast('Staff member updated successfully!', 'success');
      } else {
        // Create new staff
        await apiClient.post('/users', staffForm);
        showToast('Staff member created successfully!', 'success');
      }

      setStaffForm({ email: '', password: '', role: 'doctor', first_name: '', last_name: '', phone: '' });
      setShowStaffForm(false);
      setEditingStaff(null);
      loadStaff();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to save staff member';
      showToast(`Error: ${errorMessage}`, 'error');
    }
  };

  const handleEditStaff = (staffMember: any) => {
    setEditingStaff(staffMember);
    setStaffForm({
      email: staffMember.email,
      password: '', // Don't populate password for security
      role: staffMember.role,
      first_name: staffMember.first_name,
      last_name: staffMember.last_name,
      phone: staffMember.phone || ''
    });
    setShowStaffForm(true);
  };

  const handleToggleStaffStatus = async (id: number, currentStatus: boolean) => {
    try {
      if (currentStatus) {
        // Deactivate
        if (!confirm('Are you sure you want to deactivate this staff member?')) return;
        await apiClient.delete(`/users/${id}`);
        showToast('Staff member deactivated successfully!', 'success');
      } else {
        // Activate
        if (!confirm('Are you sure you want to activate this staff member?')) return;
        await apiClient.post(`/users/${id}/activate`);
        showToast('Staff member activated successfully!', 'success');
      }
      loadStaff();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to update staff member status';
      showToast(errorMessage, 'error');
    }
  };

  const handleCreateCorporateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...corporateForm,
        assigned_doctor_id: corporateForm.assigned_doctor_id ? Number(corporateForm.assigned_doctor_id) : null,
      };
      await apiClient.post('/payer-sources/corporate-clients', payload);
      setCorporateForm({ name: '', contact_person: '', contact_email: '', contact_phone: '', assigned_doctor_id: '' });
      setShowCorporateForm(false);
      loadCorporateClients();
      showToast('Corporate client added successfully!', 'success');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to add corporate client';
      showToast(`Error: ${errorMessage}`, 'error');
    }
  };

  const handleCreateInsuranceProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/payer-sources/insurance-providers', insuranceForm);
      setInsuranceForm({ name: '', contact_person: '', contact_email: '', contact_phone: '' });
      setShowInsuranceForm(false);
      loadInsuranceProviders();
      showToast('Insurance provider added successfully!', 'success');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to add insurance provider';
      showToast(`Error: ${errorMessage}`, 'error');
    }
  };

  const handleDeleteCorporateClient = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this corporate client?')) return;
    try {
      await apiClient.delete(`/payer-sources/corporate-clients/${id}`);
      loadCorporateClients();
      showToast('Corporate client deactivated successfully!', 'success');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to deactivate corporate client';
      showToast(errorMessage, 'error');
    }
  };

  const handleDeleteInsuranceProvider = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this insurance provider?')) return;
    try {
      await apiClient.delete(`/payer-sources/insurance-providers/${id}`);
      loadInsuranceProviders();
      showToast('Insurance provider deactivated successfully!', 'success');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to deactivate insurance provider';
      showToast(errorMessage, 'error');
    }
  };

  const loadPatients = async () => {
    try {
      const response = await apiClient.get('/patients');
      setPatients(response.data.patients || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const loadInvoicesByPatient = async (patientId: number) => {
    try {
      const response = await apiClient.get(`/invoices/patient/${patientId}`);
      setInvoices(response.data.invoices || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
      setInvoices([]);
    }
  };

  const handleViewInvoice = async (invoiceId: number) => {
    try {
      const response = await apiClient.get(`/invoices/${invoiceId}`);
      setInvoiceData(response.data.invoice);
      setInvoiceItems(response.data.items || []);
      setInvoicePayerSources(response.data.payer_sources || []);
      setShowInvoice(true);
    } catch (error: any) {
      console.error('Error loading invoice:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to load invoice';
      showToast(errorMessage, 'error');
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Modern Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-full mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Admin Dashboard
                </h1>
                <p className="text-blue-100 text-sm">
                  {user?.first_name} {user?.last_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <SearchBar />
              <button
                onClick={logout}
                className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md hover:shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 bg-white rounded-t-xl shadow-lg">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('staff')}
              className={`${
                activeTab === 'staff'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Staff Management
            </button>
            <button
              onClick={() => setActiveTab('appointments')}
              className={`${
                activeTab === 'appointments'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Appointments
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`${
                activeTab === 'invoices'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Invoices
            </button>
            <button
              onClick={() => setActiveTab('corporate')}
              className={`${
                activeTab === 'corporate'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Corporate Clients
            </button>
            <button
              onClick={() => setActiveTab('insurance')}
              className={`${
                activeTab === 'insurance'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Insurance Providers
            </button>
            <button
              onClick={() => setActiveTab('updates')}
              className={`${
                activeTab === 'updates'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              System Updates
            </button>
          </nav>
        </div>

        {/* Appointments Tab */}
        {activeTab === 'appointments' && (
          <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}>
              <Tabs
                value={appointmentsSubTab}
                onChange={(_, newValue) => setAppointmentsSubTab(newValue)}
                sx={{
                  px: 3,
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontWeight: 600,
                    minHeight: 64,
                  },
                }}
              >
                <Tab label="Current Appointments" value="current" />
                <Tab label="Past Appointments" value="past" />
              </Tabs>
            </Box>

            <Box sx={{ p: 3 }}>
              {appointmentsSubTab === 'current' && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight={600}>
                      Today's Appointments
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {format(new Date(), 'EEEE, MMMM d, yyyy')}
                    </Typography>
                  </Box>

                  {loading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                      <CircularProgress size={40} />
                      <Typography sx={{ mt: 2 }} color="text.secondary">
                        Loading appointments...
                      </Typography>
                    </Box>
                  ) : todayAppointments.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                      <Typography color="text.secondary">No appointments scheduled for today</Typography>
                    </Box>
                  ) : (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f8fafc' }}>
                            <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {todayAppointments.map((appointment) => (
                            <TableRow key={appointment.id} hover>
                              <TableCell>{format(new Date(appointment.appointment_date), 'h:mm a')}</TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  {appointment.patient_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {appointment.patient_number}
                                </Typography>
                              </TableCell>
                              <TableCell>{appointment.appointment_type || 'General'}</TableCell>
                              <TableCell>
                                <Chip
                                  label={appointment.status}
                                  size="small"
                                  color={
                                    appointment.status === 'completed'
                                      ? 'success'
                                      : appointment.status === 'scheduled'
                                      ? 'info'
                                      : appointment.status === 'cancelled'
                                      ? 'error'
                                      : 'default'
                                  }
                                  sx={{ fontWeight: 600 }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  component={Link}
                                  to={`/patients/${appointment.patient_id}`}
                                  variant="text"
                                  size="small"
                                >
                                  View Patient
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}

              {appointmentsSubTab === 'past' && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight={600}>
                      Past Appointments
                    </Typography>
                  </Box>

                  {loadingPastAppointments ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                      <CircularProgress size={40} />
                      <Typography sx={{ mt: 2 }} color="text.secondary">
                        Loading past appointments...
                      </Typography>
                    </Box>
                  ) : pastAppointments.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                      <Typography color="text.secondary">No past appointments found</Typography>
                    </Box>
                  ) : (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f8fafc' }}>
                            <TableCell sx={{ fontWeight: 600 }}>Date & Time</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Provider</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pastAppointments.map((appointment) => (
                            <TableRow key={appointment.id} hover>
                              <TableCell>
                                <Typography variant="body2">
                                  {format(new Date(appointment.appointment_date), 'MMM d, yyyy')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {format(new Date(appointment.appointment_date), 'h:mm a')}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  {appointment.patient_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {appointment.patient_number}
                                </Typography>
                              </TableCell>
                              <TableCell>{appointment.appointment_type || 'General'}</TableCell>
                              <TableCell>{appointment.provider_name || 'N/A'}</TableCell>
                              <TableCell>
                                <Chip label={appointment.status} size="small" color="default" sx={{ fontWeight: 600 }} />
                              </TableCell>
                              <TableCell>
                                <Button
                                  component={Link}
                                  to={`/patients/${appointment.patient_id}`}
                                  variant="text"
                                  size="small"
                                >
                                  View Patient
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}
            </Box>
          </Paper>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Patient Invoices</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Patient Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Patient
                </label>
                <select
                  value={selectedPatientId || ''}
                  onChange={(e) => setSelectedPatientId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Select a Patient --</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.first_name} {patient.last_name} ({patient.patient_number})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Invoices List */}
            {selectedPatientId && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoices for Selected Patient</h3>
                {invoices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No invoices found for this patient</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Invoice #
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Today's Visit
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {invoices.map((invoice) => (
                          <tr key={invoice.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {invoice.invoice_number}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {invoice.chief_complaint || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              ${parseFloat(invoice.total).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  invoice.status === 'paid'
                                    ? 'bg-green-100 text-green-800'
                                    : invoice.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {invoice.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => handleViewInvoice(invoice.id)}
                                className="text-primary-600 hover:text-primary-900 flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Corporate Clients Tab */}
        {activeTab === 'corporate' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Corporate Clients</h2>
              <button
                onClick={() => setShowCorporateForm(!showCorporateForm)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                {showCorporateForm ? 'Cancel' : 'Add New Client'}
              </button>
            </div>

            {showCorporateForm && (
              <form onSubmit={handleCreateCorporateClient} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      value={corporateForm.name}
                      onChange={(e) => setCorporateForm({ ...corporateForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={corporateForm.contact_person}
                      onChange={(e) => setCorporateForm({ ...corporateForm, contact_person: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={corporateForm.contact_email}
                      onChange={(e) => setCorporateForm({ ...corporateForm, contact_email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={corporateForm.contact_phone}
                      onChange={(e) => setCorporateForm({ ...corporateForm, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Assigned Doctor *
                    </label>
                    <select
                      value={corporateForm.assigned_doctor_id}
                      onChange={(e) => setCorporateForm({ ...corporateForm, assigned_doctor_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    >
                      <option value="">Select Doctor</option>
                      {doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          Dr. {doctor.first_name} {doctor.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Save Corporate Client
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact Person
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned Doctor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {corporateClients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {client.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.contact_person || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.contact_email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.contact_phone || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {client.assigned_doctor_name ? (
                          <span className="font-medium text-primary-600">
                            Dr. {client.assigned_doctor_name}
                          </span>
                        ) : (
                          <span className="text-gray-400">Not Assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleDeleteCorporateClient(client.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Insurance Providers Tab */}
        {activeTab === 'insurance' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Insurance Providers</h2>
              <button
                onClick={() => setShowInsuranceForm(!showInsuranceForm)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                {showInsuranceForm ? 'Cancel' : 'Add New Provider'}
              </button>
            </div>

            {showInsuranceForm && (
              <form onSubmit={handleCreateInsuranceProvider} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provider Name *
                    </label>
                    <input
                      type="text"
                      value={insuranceForm.name}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={insuranceForm.contact_person}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contact_person: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={insuranceForm.contact_email}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contact_email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={insuranceForm.contact_phone}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Save Insurance Provider
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provider Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact Person
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {insuranceProviders.map((provider) => (
                    <tr key={provider.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {provider.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provider.contact_person || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provider.contact_email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provider.contact_phone || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleDeleteInsuranceProvider(provider.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Staff Management Tab */}
        {activeTab === 'staff' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Staff Management</h2>
              <button
                onClick={() => {
                  setShowStaffForm(!showStaffForm);
                  if (showStaffForm) {
                    setEditingStaff(null);
                    setStaffForm({ email: '', password: '', role: 'doctor', first_name: '', last_name: '', phone: '' });
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {showStaffForm ? 'Cancel' : 'Add New Staff Member'}
              </button>
            </div>

            {/* Filter and Search Controls */}
            <Box sx={{ mb: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Name or email..."
                value={staffSearchTerm}
                onChange={(e) => {
                  setStaffSearchTerm(e.target.value);
                  setStaffPage(1);
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
                size="medium"
              />

              <FormControl fullWidth size="medium">
                <InputLabel>Role / Department</InputLabel>
                <Select
                  value={staffRoleFilter}
                  label="Role / Department"
                  onChange={(e) => {
                    setStaffRoleFilter(e.target.value);
                    setStaffPage(1);
                  }}
                >
                  <MenuItem value="all">All Roles</MenuItem>
                  <MenuItem value="doctor">Doctor</MenuItem>
                  <MenuItem value="nurse">Nurse</MenuItem>
                  <MenuItem value="receptionist">Receptionist</MenuItem>
                  <MenuItem value="lab">Lab Technician</MenuItem>
                  <MenuItem value="pharmacy">Pharmacy</MenuItem>
                  <MenuItem value="imaging">Imaging/Radiology</MenuItem>
                  <MenuItem value="admin">Administrator</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="medium">
                <InputLabel>Status</InputLabel>
                <Select
                  value={staffStatusFilter}
                  label="Status"
                  onChange={(e) => {
                    setStaffStatusFilter(e.target.value);
                    setStaffPage(1);
                  }}
                >
                  <MenuItem value="all">All Status</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {(staffSearchTerm || staffRoleFilter !== 'all' || staffStatusFilter !== 'all') && (
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<ClearIcon />}
                    onClick={() => {
                      setStaffSearchTerm('');
                      setStaffRoleFilter('all');
                      setStaffStatusFilter('all');
                      setStaffPage(1);
                    }}
                    sx={{ height: '56px' }}
                  >
                    Clear Filters
                  </Button>
                )}
              </Box>
            </Box>

            {showStaffForm && (
              <form onSubmit={handleCreateStaff} className="mb-6 p-6 bg-slate-50 rounded-lg border-2 border-slate-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {editingStaff ? 'Edit Staff Member' : 'New Staff Member'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={staffForm.first_name}
                      onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={staffForm.last_name}
                      onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={staffForm.email}
                      onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={staffForm.phone}
                      onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role / Department *
                    </label>
                    <select
                      value={staffForm.role}
                      onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="doctor">Doctor</option>
                      <option value="nurse">Nurse</option>
                      <option value="receptionist">Receptionist</option>
                      <option value="lab">Lab Technician</option>
                      <option value="pharmacy">Pharmacy</option>
                      <option value="imaging">Imaging/Radiology</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password {editingStaff ? '(leave blank to keep current)' : '*'}
                    </label>
                    <input
                      type="password"
                      value={staffForm.password}
                      onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required={!editingStaff}
                      placeholder={editingStaff ? 'Leave blank to keep current password' : ''}
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
                  >
                    {editingStaff ? 'Update Staff Member' : 'Create Staff Member'}
                  </button>
                  {editingStaff && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStaff(null);
                        setStaffForm({ email: '', password: '', role: 'doctor', first_name: '', last_name: '', phone: '' });
                        setShowStaffForm(false);
                      }}
                      className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th
                      onClick={() => handleStaffSort('name')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                    >
                      <div className="flex items-center gap-2">
                        Name
                        {staffSortBy === 'name' && (
                          <svg className={`w-4 h-4 transition-transform ${staffSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleStaffSort('email')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                    >
                      <div className="flex items-center gap-2">
                        Email
                        {staffSortBy === 'email' && (
                          <svg className={`w-4 h-4 transition-transform ${staffSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleStaffSort('role')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                    >
                      <div className="flex items-center gap-2">
                        Role / Department
                        {staffSortBy === 'role' && (
                          <svg className={`w-4 h-4 transition-transform ${staffSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getPaginatedStaff().map((member) => (
                    <tr key={member.id} className={member.is_active ? '' : 'bg-gray-50 opacity-60'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {member.first_name} {member.last_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{member.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          member.role === 'doctor' ? 'bg-blue-100 text-blue-800' :
                          member.role === 'nurse' ? 'bg-emerald-100 text-emerald-800' :
                          member.role === 'receptionist' ? 'bg-purple-100 text-purple-800' :
                          member.role === 'lab' ? 'bg-yellow-100 text-yellow-800' :
                          member.role === 'pharmacy' ? 'bg-green-100 text-green-800' :
                          member.role === 'imaging' ? 'bg-indigo-100 text-indigo-800' :
                          member.role === 'admin' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{member.phone || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          member.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                        <button
                          onClick={() => handleEditStaff(member)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStaffStatus(member.id, member.is_active)}
                          className={member.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                        >
                          {member.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {getFilteredAndSortedStaff().length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {staff.length === 0 ? (
                    <div>
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900">No staff members found</p>
                      <p className="text-sm text-gray-500 mt-1">Click "Add New Staff Member" to get started.</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900">No matching staff members</p>
                      <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filters</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {getFilteredAndSortedStaff().length > 0 && getTotalStaffPages() > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                <div className="text-sm text-gray-700">
                  Showing {((staffPage - 1) * staffItemsPerPage) + 1} to {Math.min(staffPage * staffItemsPerPage, getFilteredAndSortedStaff().length)} of {getFilteredAndSortedStaff().length} staff members
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStaffPage(staffPage - 1)}
                    disabled={staffPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>

                  {/* Page numbers */}
                  <div className="flex gap-1">
                    {Array.from({ length: getTotalStaffPages() }, (_, i) => i + 1).map((pageNum) => {
                      // Show first page, last page, current page, and pages around current
                      const shouldShow =
                        pageNum === 1 ||
                        pageNum === getTotalStaffPages() ||
                        (pageNum >= staffPage - 1 && pageNum <= staffPage + 1);

                      const shouldShowEllipsis =
                        (pageNum === staffPage - 2 && staffPage > 3) ||
                        (pageNum === staffPage + 2 && staffPage < getTotalStaffPages() - 2);

                      if (shouldShowEllipsis) {
                        return <span key={pageNum} className="px-3 py-2 text-gray-500">...</span>;
                      }

                      if (!shouldShow) return null;

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setStaffPage(pageNum)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            pageNum === staffPage
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setStaffPage(staffPage + 1)}
                    disabled={staffPage === getTotalStaffPages()}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Updates Tab */}
        {activeTab === 'updates' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-100 p-2 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">System Updates & Roadmap</h2>
                <p className="text-sm text-gray-500">Track all system changes, features, and planned updates</p>
              </div>
            </div>
            <SystemUpdates />
          </div>
        )}
      </main>

      {/* Invoice Modal */}
      {showInvoice && invoiceData && (
        <PrintableInvoice
          invoice={invoiceData}
          items={invoiceItems}
          payerSources={invoicePayerSources}
          onClose={() => setShowInvoice(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
