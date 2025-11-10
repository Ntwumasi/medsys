import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { appointmentsAPI } from '../api/appointments';
import type { Appointment } from '../types';
import { format } from 'date-fns';
import apiClient from '../api/client';
import PrintableInvoice from '../components/PrintableInvoice';

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
  const navigate = useNavigate();
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'appointments' | 'corporate' | 'insurance' | 'invoices' | 'staff'>('appointments');

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

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!editingStaff && !staffForm.password) {
        alert('Password is required for new staff members');
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
        alert('Staff member updated successfully!');
      } else {
        // Create new staff
        await apiClient.post('/users', staffForm);
        alert('Staff member created successfully!');
      }

      setStaffForm({ email: '', password: '', role: 'doctor', first_name: '', last_name: '', phone: '' });
      setShowStaffForm(false);
      setEditingStaff(null);
      loadStaff();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to save staff member';
      alert(`Error: ${errorMessage}`);
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
        alert('Staff member deactivated successfully!');
      } else {
        // Activate
        if (!confirm('Are you sure you want to activate this staff member?')) return;
        await apiClient.post(`/users/${id}/activate`);
        alert('Staff member activated successfully!');
      }
      loadStaff();
    } catch (error) {
      alert('Failed to update staff member status');
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
      alert('Corporate client added successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to add corporate client';
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleCreateInsuranceProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/payer-sources/insurance-providers', insuranceForm);
      setInsuranceForm({ name: '', contact_person: '', contact_email: '', contact_phone: '' });
      setShowInsuranceForm(false);
      loadInsuranceProviders();
      alert('Insurance provider added successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to add insurance provider';
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleDeleteCorporateClient = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this corporate client?')) return;
    try {
      await apiClient.delete(`/payer-sources/corporate-clients/${id}`);
      loadCorporateClients();
      alert('Corporate client deactivated successfully!');
    } catch (error) {
      alert('Failed to deactivate corporate client');
    }
  };

  const handleDeleteInsuranceProvider = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this insurance provider?')) return;
    try {
      await apiClient.delete(`/payer-sources/insurance-providers/${id}`);
      loadInsuranceProviders();
      alert('Insurance provider deactivated successfully!');
    } catch (error) {
      alert('Failed to deactivate insurance provider');
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
    } catch (error) {
      console.error('Error loading invoice:', error);
      alert('Failed to load invoice');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-green-100 text-green-800',
      'checked-in': 'bg-purple-100 text-purple-800',
      'in-progress': 'bg-yellow-100 text-yellow-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
      'no-show': 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome, {user?.first_name} {user?.last_name}
              </h1>
              <span className="text-sm text-gray-600 capitalize">{user?.role}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link to="/patients/new" className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="bg-primary-100 p-3 rounded-lg">
                <svg
                  className="w-6 h-6 text-primary-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">New Patient</p>
                <p className="text-lg font-semibold text-gray-900">Register</p>
              </div>
            </div>
          </Link>

          <Link to="/patients" className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="bg-green-100 p-3 rounded-lg">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">View All</p>
                <p className="text-lg font-semibold text-gray-900">Patients</p>
              </div>
            </div>
          </Link>

          <Link to="/appointments" className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="bg-purple-100 p-3 rounded-lg">
                <svg
                  className="w-6 h-6 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Manage</p>
                <p className="text-lg font-semibold text-gray-900">Appointments</p>
              </div>
            </div>
          </Link>

          <Link to="/reports" className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="bg-orange-100 p-3 rounded-lg">
                <svg
                  className="w-6 h-6 text-orange-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">View</p>
                <p className="text-lg font-semibold text-gray-900">Reports</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('appointments')}
              className={`${
                activeTab === 'appointments'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Today's Appointments
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`${
                activeTab === 'invoices'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Invoices
            </button>
            <button
              onClick={() => setActiveTab('corporate')}
              className={`${
                activeTab === 'corporate'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Corporate Clients
            </button>
            <button
              onClick={() => setActiveTab('insurance')}
              className={`${
                activeTab === 'insurance'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Insurance Providers
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`${
                activeTab === 'staff'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Staff Management
            </button>
          </nav>
        </div>

        {/* Today's Appointments Tab */}
        {activeTab === 'appointments' && (
          <div className="card">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Today's Appointments</h2>
              <span className="text-sm text-gray-600">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </span>
            </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-2 text-gray-600">Loading appointments...</p>
            </div>
          ) : todayAppointments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No appointments scheduled for today</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
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
                  {todayAppointments.map((appointment) => (
                    <tr key={appointment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(appointment.appointment_date), 'h:mm a')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {appointment.patient_name}
                        </div>
                        <div className="text-sm text-gray-500">{appointment.patient_number}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {appointment.appointment_type || 'General'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            appointment.status
                          )}`}
                        >
                          {appointment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          to={`/patients/${appointment.patient_id}`}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View Patient
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="card">
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
                            Chief Complaint
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
          <div className="card">
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
          <div className="card">
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
          <div className="card">
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role / Department
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
                  {staff.map((member) => (
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
              {staff.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No staff members found. Click "Add New Staff Member" to get started.
                </div>
              )}
            </div>
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
