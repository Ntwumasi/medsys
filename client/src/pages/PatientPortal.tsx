import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { format } from 'date-fns';

interface PatientInfo {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  address?: string;
  city?: string;
  state?: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  pcp_name?: string;
  pcp_phone?: string;
}

interface Encounter {
  id: number;
  encounter_number: string;
  encounter_date: string;
  encounter_type: string;
  chief_complaint: string;
  provider_name: string;
  status: string;
}

interface Medication {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  status: string;
  prescribed_date: string;
  prescribed_by: string;
}

interface Appointment {
  id: number;
  appointment_date: string;
  appointment_type: string;
  provider_name: string;
  status: string;
  reason?: string;
}

interface LabResult {
  id: number;
  test_name: string;
  status: string;
  ordered_at: string;
  results?: string;
  results_available_at?: string;
}

const PatientPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'visits' | 'medications' | 'appointments' | 'results'>('overview');
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);

  useEffect(() => {
    loadPatientData();
  }, []);

  const loadPatientData = async () => {
    setLoading(true);
    try {
      // In a real app, we'd get the patient ID from the authenticated user
      // For demo purposes, we'll fetch summary data
      const summaryRes = await apiClient.get(`/patients/${user?.id}/summary`);

      if (summaryRes.data) {
        setPatientInfo(summaryRes.data.patient);
        setEncounters(summaryRes.data.recent_encounters || []);
        setMedications(summaryRes.data.active_medications || []);
        setAppointments(summaryRes.data.upcoming_appointments || []);
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
      // Set demo data if API fails
      setPatientInfo({
        id: 1,
        patient_number: 'P000001',
        first_name: user?.first_name || 'Demo',
        last_name: user?.last_name || 'Patient',
        email: user?.email || 'demo@example.com',
        phone: '(555) 123-4567',
        date_of_birth: '1985-06-15',
        gender: 'Male',
        address: '123 Main Street',
        city: 'Medical City',
        state: 'MC',
        blood_group: 'O+',
        emergency_contact_name: 'Jane Doe',
        emergency_contact_phone: '(555) 987-6543',
        pcp_name: 'Dr. Smith',
        pcp_phone: '(555) 111-2222',
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (dob: string) => {
    if (!dob) return 'N/A';
    const today = new Date();
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return 'N/A';
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="bg-white bg-opacity-20 p-3 rounded-xl">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Patient Portal</h1>
                <p className="text-blue-100 text-sm">Welcome, {patientInfo?.first_name} {patientInfo?.last_name}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200">
            {[
              { id: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'visits', label: 'Visit History', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { id: 'medications', label: 'Medications', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
              { id: 'appointments', label: 'Appointments', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
              { id: 'results', label: 'Test Results', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-4 py-4 text-center font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  <span className="hidden sm:inline">{tab.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && patientInfo && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Patient Info Card */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                My Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Patient Number</label>
                    <p className="text-lg font-semibold text-blue-600">{patientInfo.patient_number}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Full Name</label>
                    <p className="text-lg font-semibold">{patientInfo.first_name} {patientInfo.last_name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Date of Birth</label>
                    <p className="text-gray-900">{patientInfo.date_of_birth ? format(new Date(patientInfo.date_of_birth), 'MMMM d, yyyy') : 'N/A'} ({calculateAge(patientInfo.date_of_birth)} years)</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Gender</label>
                    <p className="text-gray-900 capitalize">{patientInfo.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Blood Group</label>
                    <p className="text-gray-900">{patientInfo.blood_group || 'N/A'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Email</label>
                    <p className="text-gray-900">{patientInfo.email || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Phone</label>
                    <p className="text-gray-900">{patientInfo.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Address</label>
                    <p className="text-gray-900">
                      {patientInfo.address || 'N/A'}
                      {patientInfo.city && `, ${patientInfo.city}`}
                      {patientInfo.state && `, ${patientInfo.state}`}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Primary Care Physician</label>
                    <p className="text-gray-900">{patientInfo.pcp_name || 'N/A'}</p>
                    {patientInfo.pcp_phone && <p className="text-sm text-gray-500">{patientInfo.pcp_phone}</p>}
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Name</label>
                    <p className="text-gray-900">{patientInfo.emergency_contact_name || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">Phone</label>
                    <p className="text-gray-900">{patientInfo.emergency_contact_phone || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                    <span className="text-gray-600">Total Visits</span>
                    <span className="text-2xl font-bold text-blue-600">{encounters.length}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                    <span className="text-gray-600">Active Medications</span>
                    <span className="text-2xl font-bold text-emerald-600">{medications.filter(m => m.status === 'active').length}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                    <span className="text-gray-600">Upcoming Appointments</span>
                    <span className="text-2xl font-bold text-purple-600">{appointments.length}</span>
                  </div>
                </div>
              </div>

              {/* Upcoming Appointment Preview */}
              {appointments.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Next Appointment</h3>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="text-lg font-bold text-purple-800">
                      {format(new Date(appointments[0].appointment_date), 'EEEE, MMM d')}
                    </div>
                    <div className="text-purple-600">
                      {format(new Date(appointments[0].appointment_date), 'h:mm a')}
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      with {appointments[0].provider_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {appointments[0].appointment_type}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Visits Tab */}
        {activeTab === 'visits' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Visit History</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {encounters.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="font-medium">No visit history available</p>
                </div>
              ) : (
                encounters.map((encounter) => (
                  <div key={encounter.id} className="p-6 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-lg font-semibold text-gray-900">
                            {format(new Date(encounter.encounter_date), 'MMMM d, yyyy')}
                          </span>
                          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            {encounter.encounter_type}
                          </span>
                        </div>
                        <p className="text-gray-600 mb-2">
                          <span className="font-medium">Today's Visit:</span> {encounter.chief_complaint || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-500">
                          Provider: {encounter.provider_name}
                        </p>
                      </div>
                      <span className="text-sm text-gray-500">
                        #{encounter.encounter_number}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Medications Tab */}
        {activeTab === 'medications' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Current Medications</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {medications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <p className="font-medium">No active medications</p>
                </div>
              ) : (
                medications.map((med) => (
                  <div key={med.id} className="p-6 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{med.medication_name}</h3>
                        <p className="text-gray-600">
                          {med.dosage} - {med.frequency}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Prescribed by: {med.prescribed_by}
                        </p>
                      </div>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        med.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {med.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Appointments Tab */}
        {activeTab === 'appointments' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Upcoming Appointments</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {appointments.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-medium">No upcoming appointments</p>
                  <p className="text-sm mt-1">Contact us to schedule your next visit</p>
                </div>
              ) : (
                appointments.map((apt) => (
                  <div key={apt.id} className="p-6 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-lg font-semibold text-gray-900">
                            {format(new Date(apt.appointment_date), 'EEEE, MMMM d, yyyy')}
                          </span>
                          <span className="text-lg font-bold text-blue-600">
                            {format(new Date(apt.appointment_date), 'h:mm a')}
                          </span>
                        </div>
                        <p className="text-gray-600">
                          <span className="font-medium">Provider:</span> {apt.provider_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">Type:</span> {apt.appointment_type}
                          {apt.reason && ` - ${apt.reason}`}
                        </p>
                      </div>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        apt.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                        apt.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {apt.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Test Results Tab */}
        {activeTab === 'results' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">Test Results</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {labResults.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="font-medium">No test results available</p>
                  <p className="text-sm mt-1">Your test results will appear here once available</p>
                </div>
              ) : (
                labResults.map((result) => (
                  <div key={result.id} className="p-6 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{result.test_name}</h3>
                        <p className="text-sm text-gray-500">
                          Ordered: {format(new Date(result.ordered_at), 'MMM d, yyyy')}
                        </p>
                        {result.results && (
                          <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                            <p className="text-sm font-medium text-emerald-800">Results:</p>
                            <p className="text-gray-900">{result.results}</p>
                          </div>
                        )}
                      </div>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        result.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                        result.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {result.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          <p>For medical emergencies, please call 911 or visit your nearest emergency room.</p>
          <p className="mt-2">Need help? Contact us at (555) 123-4567</p>
        </div>
      </footer>
    </div>
  );
};

export default PatientPortal;
