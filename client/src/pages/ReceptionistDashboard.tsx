import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { format, isValid, parseISO } from 'date-fns';
import PrintableInvoice from '../components/PrintableInvoice';
import SearchBar from '../components/SearchBar';

// Safe date formatting helper
const safeFormatDate = (dateValue: any, formatString: string, fallback: string = 'N/A'): string => {
  if (!dateValue) return fallback;

  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (isValid(date)) {
      return format(date, formatString);
    }
    return fallback;
  } catch (error) {
    console.error('Date formatting error:', error, 'Value:', dateValue);
    return fallback;
  }
};

interface Patient {
  id: number;
  patient_number: string;
  first_name?: string;
  last_name?: string;
  date_of_birth: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

interface QueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  date_of_birth: string;
  room_number?: string;
  nurse_name?: string;
  current_priority: 'green' | 'yellow' | 'red';
  triage_time: string;
  check_in_time: string;
  chief_complaint: string;
  wait_time_minutes?: number;
  billing_amount?: number;
}

interface Nurse {
  id: number;
  first_name: string;
  last_name: string;
}

interface Encounter {
  id: number;
  encounter_number: string;
  encounter_date: string;
  chief_complaint: string;
  diagnosis?: string;
  treatment?: string;
  billing_amount: number;
}

interface CorporateClient {
  id: number;
  name: string;
}

interface InsuranceProvider {
  id: number;
  name: string;
}

interface PayerSource {
  payer_type: 'self_pay' | 'corporate' | 'insurance';
  corporate_client_id?: number;
  insurance_provider_id?: number;
}

const ReceptionistDashboard: React.FC = () => {
  console.log('ReceptionistDashboard: Component rendering');
  const { user, logout } = useAuth();
  console.log('ReceptionistDashboard: User', user);
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'queue' | 'checkin' | 'new-patient' | 'history'>('queue');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [corporateClients, setCorporateClients] = useState<CorporateClient[]>([]);
  const [insuranceProviders, setInsuranceProviders] = useState<InsuranceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check-in form state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [encounterType, setEncounterType] = useState('walk-in');
  const [patientHistory, setPatientHistory] = useState<Encounter[]>([]);

  // New patient form state
  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });

  // Payer source state
  const [selectedPayerTypes, setSelectedPayerTypes] = useState<string[]>([]);
  const [selectedCorporateClient, setSelectedCorporateClient] = useState<number | null>(null);
  const [selectedInsuranceProvider, setSelectedInsuranceProvider] = useState<number | null>(null);

  // Invoice state
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<any[]>([]);
  const [currentEncounterId, setCurrentEncounterId] = useState<number | null>(null);

  // Past Patients / History state
  const [pastPatients, setPastPatients] = useState<any[]>([]);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    console.log('ReceptionistDashboard: loadData starting');
    try {
      setError(null);
      console.log('ReceptionistDashboard: Making API calls');
      const [patientsRes, queueRes, nursesRes, corporateClientsRes, insuranceProvidersRes] = await Promise.all([
        apiClient.get('/patients'),
        apiClient.get('/workflow/queue'),
        apiClient.get('/workflow/nurses'),
        apiClient.get('/payer-sources/corporate-clients'),
        apiClient.get('/payer-sources/insurance-providers'),
      ]);
      console.log('ReceptionistDashboard: API calls succeeded', { patientsRes, queueRes, nursesRes, corporateClientsRes, insuranceProvidersRes });

      setPatients(patientsRes.data.patients || []);
      setQueue(queueRes.data.queue || []);
      setNurses(nursesRes.data.nurses || []);
      setCorporateClients(corporateClientsRes.data.corporate_clients || []);
      setInsuranceProviders(insuranceProvidersRes.data.insurance_providers || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Failed to load dashboard data';
      setError(errorMsg);
      // Set empty arrays so the dashboard still renders
      setPatients([]);
      setQueue([]);
      setNurses([]);
      setCorporateClients([]);
      setInsuranceProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPatientHistory = async (patientId: number) => {
    try {
      const response = await apiClient.get(`/patients/${patientId}/encounters`);
      setPatientHistory(response.data.encounters || []);
    } catch (error) {
      console.error('Error loading patient history:', error);
      setPatientHistory([]);
    }
  };

  const loadPastPatients = async () => {
    try {
      setLoadingHistory(true);
      const params: any = {
        page: historyPage,
        limit: itemsPerPage,
      };

      if (historySearchTerm) {
        params.search = historySearchTerm;
      }

      if (historyDateFrom) {
        params.date_from = historyDateFrom;
      }

      if (historyDateTo) {
        params.date_to = historyDateTo;
      }

      const response = await apiClient.get('/workflow/completed-encounters', { params });
      setPastPatients(response.data.encounters || []);
      setHistoryTotalPages(response.data.totalPages || 1);
    } catch (error) {
      console.error('Error loading past patients:', error);
      setPastPatients([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load past patients when filters change or page changes
  useEffect(() => {
    if (activeView === 'history') {
      loadPastPatients();
    }
  }, [activeView, historyPage, historySearchTerm, historyDateFrom, historyDateTo]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      const billingAmount = 50; // $50 for returning patients

      await apiClient.post('/workflow/check-in', {
        patient_id: selectedPatient.id,
        chief_complaint: chiefComplaint,
        encounter_type: encounterType,
        billing_amount: billingAmount,
      });

      // Store patient name for success message
      const patientName = `${selectedPatient.first_name} ${selectedPatient.last_name}`;

      // Reset form
      setSelectedPatient(null);
      setChiefComplaint('');
      setSearchTerm('');
      setPatientHistory([]);
      setEncounterType('walk-in');

      // Reload data first to get the updated queue
      await loadData();

      // Then switch to queue view
      setActiveView('queue');

      // Show success message after state is updated
      setTimeout(() => {
        alert(`✓ ${patientName} checked in successfully!\n\nBilling: $${billingAmount}\n\nPatient is now in the queue.`);
      }, 100);
    } catch (error: any) {
      console.error('Error checking in patient:', error);

      // Extract error message from API response
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to check in patient';

      alert(`❌ Check-In Failed\n\n${errorMessage}`);
    }
  };

  const handleNewPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Build payer sources array
      const payer_sources: PayerSource[] = [];

      if (selectedPayerTypes.includes('self_pay')) {
        payer_sources.push({ payer_type: 'self_pay' });
      }

      if (selectedPayerTypes.includes('corporate') && selectedCorporateClient) {
        payer_sources.push({
          payer_type: 'corporate',
          corporate_client_id: selectedCorporateClient,
        });
      }

      if (selectedPayerTypes.includes('insurance') && selectedInsuranceProvider) {
        payer_sources.push({
          payer_type: 'insurance',
          insurance_provider_id: selectedInsuranceProvider,
        });
      }

      // Create new patient
      const patientResponse = await apiClient.post('/patients', {
        ...newPatient,
        payer_sources,
      });
      const newPatientData = patientResponse.data.patient;

      // Immediately check in the new patient
      const billingAmount = 75; // $75 for new patients

      await apiClient.post('/workflow/check-in', {
        patient_id: newPatientData.id,
        chief_complaint: chiefComplaint,
        encounter_type: encounterType,
        billing_amount: billingAmount,
      });

      // Reset form
      setNewPatient({
        first_name: '',
        last_name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
      });
      setChiefComplaint('');
      setEncounterType('walk-in');
      setSelectedPayerTypes([]);
      setSelectedCorporateClient(null);
      setSelectedInsuranceProvider(null);

      // Reload data first to get the new patient in the queue
      await loadData();

      // Then switch to queue view to show the patient
      setActiveView('queue');

      // Show success message after state is updated
      setTimeout(() => {
        alert(`✓ Patient registered successfully!\n\nPatient #: ${newPatientData.patient_number}\nBilling: $${billingAmount}\n\nPatient is now in the queue.`);
      }, 100);
    } catch (error: any) {
      console.error('Error creating new patient:', error);

      // Extract error message from API response
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to register new patient';

      alert(`❌ Registration Failed\n\n${errorMessage}`);
    }
  };

  const handleAssignNurse = async (encounterId: number, nurseId: number) => {
    try {
      await apiClient.post('/workflow/assign-nurse', {
        encounter_id: encounterId,
        nurse_id: nurseId,
      });
      loadData();
    } catch (error) {
      console.error('Error assigning nurse:', error);
      alert('Failed to assign nurse');
    }
  };

  const handleViewInvoice = async (encounterId: number) => {
    try {
      const response = await apiClient.get(`/invoices/encounter/${encounterId}`);
      setInvoiceData(response.data.invoice);
      setInvoiceItems(response.data.items || []);
      setInvoicePayerSources(response.data.payer_sources || []);
      setCurrentEncounterId(encounterId);
      setShowInvoice(true);
    } catch (error) {
      console.error('Error loading invoice:', error);
      alert('Failed to load invoice');
    }
  };

  const handlePaymentComplete = () => {
    // Reload the patient queue data after payment is completed
    loadData();
  };

  const getWaitTimeColor = (waitTimeMinutes?: number) => {
    if (!waitTimeMinutes) return 'bg-slate-100 border-slate-400 text-slate-800';

    if (waitTimeMinutes <= 15) {
      return 'bg-emerald-100 border-emerald-400 text-emerald-800';
    } else if (waitTimeMinutes <= 30) {
      return 'bg-amber-100 border-amber-400 text-amber-800';
    } else {
      return 'bg-red-100 border-red-400 text-red-800';
    }
  };

  const getWaitTimeLabel = (waitTimeMinutes?: number) => {
    if (!waitTimeMinutes) return 'Unknown';

    if (waitTimeMinutes <= 15) {
      return 'GREEN';
    } else if (waitTimeMinutes <= 30) {
      return 'YELLOW';
    } else {
      return 'RED';
    }
  };

  const calculateWaitTime = (checkInTime: string): number => {
    const checkIn = new Date(checkInTime);
    const now = new Date();
    const diffMs = now.getTime() - checkIn.getTime();
    return Math.floor(diffMs / (1000 * 60)); // Convert to minutes
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.patient_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePatientSelect = async (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchTerm(`${patient.first_name} ${patient.last_name} (${patient.patient_number})`);
    await loadPatientHistory(patient.id);
  };

  console.log('ReceptionistDashboard: Render check - loading:', loading, 'error:', error);

  if (loading) {
    console.log('ReceptionistDashboard: Showing loading spinner');
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  console.log('ReceptionistDashboard: Rendering main UI');
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-full mx-auto px-6 py-5">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Receptionist Dashboard
                </h1>
                <p className="text-blue-100 text-sm">
                  Welcome, {user?.first_name} {user?.last_name}
                </p>
              </div>
            </div>
            <div className="flex-1 max-w-md">
              <SearchBar
                onPatientSelect={(patient) => {
                  // Switch to check-in view and select the patient
                  setActiveView('checkin');
                  setSelectedPatient(patient);
                  const patientName = patient.full_name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
                  alert(`Patient ${patientName} selected for check-in.`);
                }}
                placeholder="Search patients..."
              />
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3 shadow-md">
            <svg className="w-5 h-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold">Error Loading Dashboard</p>
              <p className="text-sm">{error}</p>
              <button
                onClick={loadData}
                className="mt-2 text-sm underline hover:no-underline"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <button
            onClick={() => setActiveView('queue')}
            className={`bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 ${
              activeView === 'queue' ? 'border-primary-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
                <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900">Patient Queue</h2>
                <p className="text-2xl font-bold text-primary-600">{queue.length}</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('checkin')}
            className={`bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 ${
              activeView === 'checkin' ? 'border-emerald-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-emerald-100 rounded-md p-3">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-bold text-gray-900">Returning Patient</h2>
                <p className="text-sm text-gray-600">Check-In</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('new-patient')}
            className={`bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 ${
              activeView === 'new-patient' ? 'border-blue-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-bold text-gray-900">New Patient</h2>
                <p className="text-sm text-gray-600">Register & Check-In</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('history')}
            className={`bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 ${
              activeView === 'history' ? 'border-slate-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-slate-100 rounded-md p-3">
                <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-bold text-gray-900">Past Patients</h2>
                <p className="text-sm text-gray-600">View History</p>
              </div>
            </div>
          </button>

        </div>

        {/* Main Content Area */}
        {activeView === 'queue' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Current Patient Queue ({queue.length})
              </h2>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                  <span>0-15 min</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-amber-500 rounded"></div>
                  <span>15-30 min</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                  <span>30+ min</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {queue.map((item) => {
                const waitTime = calculateWaitTime(item.check_in_time);
                return (
                  <div
                    key={item.id}
                    className={`p-6 border-l-4 rounded-lg ${getWaitTimeColor(waitTime)}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-semibold">
                            {item.patient_name}
                          </h3>
                          <span className="text-sm font-medium text-gray-600">
                            Patient #: {item.patient_number}
                          </span>
                          <span className="text-sm font-medium text-gray-600">
                            Encounter #: {item.encounter_number}
                          </span>
                        </div>

                        <div className="mt-2 flex gap-4 text-sm text-gray-700">
                          <span>DOB: {safeFormatDate(item.date_of_birth, 'MM/dd/yyyy')}</span>
                          <span>Checked in: {safeFormatDate(item.check_in_time, 'h:mm a')}</span>
                          {item.billing_amount && (
                            <span className="font-semibold text-green-700">
                              Billing: ${item.billing_amount}
                            </span>
                          )}
                        </div>

                        <p className="text-gray-700 mt-2">
                          <span className="font-medium">Chief Complaint:</span> {item.chief_complaint}
                        </p>

                        <div className="mt-3 flex gap-4 text-sm">
                          {item.room_number && (
                            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                              Room: {item.room_number}
                            </span>
                          )}
                          {item.nurse_name && (
                            <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-full font-medium">
                              Nurse: {item.nurse_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-2xl font-bold">{getWaitTimeLabel(waitTime)}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Wait: {waitTime} min
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      {!item.nurse_name && (
                        <select
                          onChange={(e) => handleAssignNurse(item.id, Number(e.target.value))}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          defaultValue=""
                        >
                          <option value="">Assign Nurse</option>
                          {nurses.map((nurse) => (
                            <option key={nurse.id} value={nurse.id}>
                              {nurse.first_name} {nurse.last_name}
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        onClick={() => handleViewInvoice(item.id)}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print Invoice
                      </button>
                    </div>
                  </div>
                );
              })}

              {queue.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="mt-2 text-lg font-medium">No patients in queue</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'checkin' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Check-In Returning Patient</h2>
              <form onSubmit={handleCheckIn} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Patient
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter patient number or name..."
                  />
                  {searchTerm && !selectedPatient && (
                    <div className="mt-2 max-h-60 overflow-y-auto border border-gray-300 rounded-lg">
                      {filteredPatients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="p-4 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        >
                          <div className="font-semibold text-gray-900">
                            {patient.first_name} {patient.last_name}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Patient #: {patient.patient_number} | DOB: {safeFormatDate(patient.date_of_birth, 'MM/dd/yyyy')}
                          </div>
                        </div>
                      ))}
                      {filteredPatients.length === 0 && (
                        <div className="p-4 text-center text-gray-500">
                          No patients found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedPatient && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-900 mb-2">Selected Patient</h3>
                    <div className="text-sm space-y-1">
                      <p><span className="font-medium">Name:</span> {selectedPatient.first_name} {selectedPatient.last_name}</p>
                      <p><span className="font-medium">Patient #:</span> {selectedPatient.patient_number}</p>
                      <p><span className="font-medium">DOB:</span> {safeFormatDate(selectedPatient.date_of_birth, 'MM/dd/yyyy')}</p>
                      {selectedPatient.phone && (
                        <p><span className="font-medium">Phone:</span> {selectedPatient.phone}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chief Complaint
                  </label>
                  <textarea
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    rows={4}
                    required
                    placeholder="Patient's main concern or reason for visit..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Encounter Type
                  </label>
                  <select
                    value={encounterType}
                    onChange={(e) => setEncounterType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="walk-in">Walk-in</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">Billing:</span> $50.00 (Returning Patient)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!selectedPatient || !chiefComplaint}
                  className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Check In Patient
                </button>
              </form>
            </div>

            {selectedPatient && patientHistory.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Past Medical History</h2>
                <div className="space-y-4">
                  {patientHistory.map((encounter) => (
                    <div key={encounter.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-semibold text-gray-900">
                            Encounter #: {encounter.encounter_number}
                          </span>
                          <p className="text-sm text-gray-600">
                            {safeFormatDate(encounter.encounter_date, 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-700">
                          ${encounter.billing_amount}
                        </span>
                      </div>
                      <div className="text-sm space-y-1 text-gray-700">
                        <p><span className="font-medium">Complaint:</span> {encounter.chief_complaint}</p>
                        {encounter.diagnosis && (
                          <p><span className="font-medium">Diagnosis:</span> {encounter.diagnosis}</p>
                        )}
                        {encounter.treatment && (
                          <p><span className="font-medium">Treatment:</span> {encounter.treatment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedPatient && patientHistory.length === 0 && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Past Medical History</h2>
                <div className="text-center py-12 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-2">No previous encounters on record</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'new-patient' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Register New Patient</h2>
            <form onSubmit={handleNewPatientSubmit} className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
                <p className="text-sm text-blue-800">
                  Patient # and Encounter # will be automatically generated upon registration
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={newPatient.first_name}
                    onChange={(e) => setNewPatient({ ...newPatient, first_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={newPatient.last_name}
                    onChange={(e) => setNewPatient({ ...newPatient, last_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    value={newPatient.date_of_birth}
                    onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender *
                  </label>
                  <select
                    value={newPatient.gender}
                    onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newPatient.email}
                    onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={newPatient.address}
                  onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={newPatient.city}
                    onChange={(e) => setNewPatient({ ...newPatient, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State
                  </label>
                  <input
                    type="text"
                    value={newPatient.state}
                    onChange={(e) => setNewPatient({ ...newPatient, state: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={newPatient.emergency_contact_name}
                    onChange={(e) => setNewPatient({ ...newPatient, emergency_contact_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={newPatient.emergency_contact_phone}
                    onChange={(e) => setNewPatient({ ...newPatient, emergency_contact_phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Payer Source(s) *
                </label>
                <div className="space-y-4">
                  {/* Self Pay */}
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="payer-self-pay"
                      checked={selectedPayerTypes.includes('self_pay')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPayerTypes([...selectedPayerTypes, 'self_pay']);
                        } else {
                          setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'self_pay'));
                        }
                      }}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="payer-self-pay" className="ml-3 text-sm text-gray-700 font-medium">
                      Self Pay
                    </label>
                  </div>

                  {/* Corporate */}
                  <div>
                    <div className="flex items-start mb-2">
                      <input
                        type="checkbox"
                        id="payer-corporate"
                        checked={selectedPayerTypes.includes('corporate')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPayerTypes([...selectedPayerTypes, 'corporate']);
                          } else {
                            setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'corporate'));
                            setSelectedCorporateClient(null);
                          }
                        }}
                        className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label htmlFor="payer-corporate" className="ml-3 text-sm text-gray-700 font-medium">
                        Corporate
                      </label>
                    </div>
                    {selectedPayerTypes.includes('corporate') && (
                      <div className="ml-7">
                        <select
                          value={selectedCorporateClient || ''}
                          onChange={(e) => setSelectedCorporateClient(e.target.value ? Number(e.target.value) : null)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required={selectedPayerTypes.includes('corporate')}
                        >
                          <option value="">Select Corporate Client</option>
                          {corporateClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Insurance */}
                  <div>
                    <div className="flex items-start mb-2">
                      <input
                        type="checkbox"
                        id="payer-insurance"
                        checked={selectedPayerTypes.includes('insurance')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPayerTypes([...selectedPayerTypes, 'insurance']);
                          } else {
                            setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'insurance'));
                            setSelectedInsuranceProvider(null);
                          }
                        }}
                        className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label htmlFor="payer-insurance" className="ml-3 text-sm text-gray-700 font-medium">
                        Insurance
                      </label>
                    </div>
                    {selectedPayerTypes.includes('insurance') && (
                      <div className="ml-7">
                        <select
                          value={selectedInsuranceProvider || ''}
                          onChange={(e) => setSelectedInsuranceProvider(e.target.value ? Number(e.target.value) : null)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required={selectedPayerTypes.includes('insurance')}
                        >
                          <option value="">Select Insurance Provider</option>
                          {insuranceProviders.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chief Complaint *
                </label>
                <textarea
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={4}
                  required
                  placeholder="Patient's main concern or reason for visit..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Encounter Type
                </label>
                <select
                  value={encounterType}
                  onChange={(e) => setEncounterType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="walk-in">Walk-in</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>

              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-800">
                  <span className="font-semibold">Billing:</span> $75.00 (New Patient)
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
              >
                Register & Check In Patient
              </button>
            </form>
          </div>
        )}

        {activeView === 'history' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Past Patients</h2>

            {/* Search and Filter Controls */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search
                </label>
                <input
                  type="text"
                  value={historySearchTerm}
                  onChange={(e) => {
                    setHistorySearchTerm(e.target.value);
                    setHistoryPage(1); // Reset to page 1 on search
                  }}
                  placeholder="Patient name, number, or encounter..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  From Date
                </label>
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => {
                    setHistoryDateFrom(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Date
                </label>
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => {
                    setHistoryDateTo(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Clear Filters Button */}
            {(historySearchTerm || historyDateFrom || historyDateTo) && (
              <div className="mb-4">
                <button
                  onClick={() => {
                    setHistorySearchTerm('');
                    setHistoryDateFrom('');
                    setHistoryDateTo('');
                    setHistoryPage(1);
                  }}
                  className="text-sm text-slate-600 hover:text-slate-800 underline"
                >
                  Clear all filters
                </button>
              </div>
            )}

            {/* Loading State */}
            {loadingHistory && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading past patients...</p>
              </div>
            )}

            {/* Past Patients Table */}
            {!loadingHistory && pastPatients.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Encounter #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Chief Complaint
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pastPatients.map((encounter) => (
                      <tr key={encounter.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {encounter.patient_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {encounter.patient_number}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {encounter.encounter_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {safeFormatDate(encounter.encounter_date, 'MM/dd/yyyy')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 max-w-xs truncate">
                            {encounter.chief_complaint || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {encounter.provider_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleViewInvoice(encounter.id)}
                            className="text-slate-600 hover:text-slate-900 font-medium"
                          >
                            View Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty State */}
            {!loadingHistory && pastPatients.length === 0 && (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-2 text-lg font-medium text-gray-900">No past patients found</p>
                <p className="mt-1 text-sm text-gray-500">
                  {historySearchTerm || historyDateFrom || historyDateTo
                    ? 'Try adjusting your search or filters'
                    : 'Completed encounters will appear here'}
                </p>
              </div>
            )}

            {/* Pagination Controls */}
            {!loadingHistory && pastPatients.length > 0 && historyTotalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Page {historyPage} of {historyTotalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHistoryPage(historyPage - 1)}
                    disabled={historyPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setHistoryPage(historyPage + 1)}
                    disabled={historyPage === historyTotalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Invoice Modal */}
      {showInvoice && invoiceData && currentEncounterId && (
        <PrintableInvoice
          invoice={invoiceData}
          items={invoiceItems}
          payerSources={invoicePayerSources}
          encounterId={currentEncounterId}
          onClose={() => setShowInvoice(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
};

export default ReceptionistDashboard;
