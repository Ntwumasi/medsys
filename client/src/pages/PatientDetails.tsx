import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientsAPI } from '../api/patients';
import apiClient from '../api/client';
import type { PatientSummary } from '../types';
import { format } from 'date-fns';
import VitalSignsHistory from '../components/VitalSignsHistory';
import AppLayout from '../components/AppLayout';
import { Card, EmptyState } from '../components/ui';
import { useNotification } from '../context/NotificationContext';

interface LabResult {
  id: number;
  test_name: string;
  test_code?: string;
  priority: string;
  status: string;
  ordered_at: string;
  results_available_at?: string;
  results?: string;
  ordering_provider_name: string;
  encounter_number: string;
  notes?: string;
}

const PatientDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'encounters' | 'medications' | 'appointments' | 'vitals' | 'labs' | 'imaging'>('overview');
  const [showVitalSignsHistory, setShowVitalSignsHistory] = useState(false);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [labsLoading, setLabsLoading] = useState(false);
  const [imagingResults, setImagingResults] = useState<Array<{id: number; imaging_type: string; body_part?: string; priority: string; status: string; ordered_date: string; completed_date?: string; findings?: string; ordering_provider_name?: string}>>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useNotification();

  useEffect(() => {
    if (id) {
      loadPatientSummary(parseInt(id));
      loadLabResults(parseInt(id));
      loadImagingResults(parseInt(id));
    }
  }, [id]);

  const loadImagingResults = async (patientId: number) => {
    try {
      const response = await apiClient.get(`/orders/imaging?patient_id=${patientId}`);
      setImagingResults(response.data.imaging_orders || []);
    } catch (error) {
      console.error('Error loading imaging results:', error);
    }
  };

  const handleDiscontinueMedication = async (medicationId: number, medicationName: string) => {
    if (!confirm(`Discontinue ${medicationName}?`)) return;
    try {
      await apiClient.post(`/medications/${medicationId}/discontinue`);
      showToast(`${medicationName} discontinued`, 'success');
      if (id) loadPatientSummary(parseInt(id));
    } catch (error) {
      showToast('Failed to discontinue medication', 'error');
    }
  };

  const loadLabResults = async (patientId: number) => {
    setLabsLoading(true);
    try {
      const response = await apiClient.get(`/orders/lab?patient_id=${patientId}`);
      setLabResults(response.data.lab_orders || []);
    } catch (error) {
      console.error('Error loading lab results:', error);
    } finally {
      setLabsLoading(false);
    }
  };

  const loadPatientSummary = async (patientId: number) => {
    try {
      const data = await patientsAPI.getPatientSummary(patientId);
      setSummary(data);
    } catch (error) {
      console.error('Error loading patient summary:', error);
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

  const getSeverityColor = (severity?: string) => {
    const colors: Record<string, string> = {
      mild: 'bg-yellow-100 text-yellow-800',
      moderate: 'bg-orange-100 text-orange-800',
      severe: 'bg-red-100 text-red-800',
    };
    return colors[severity || ''] || 'bg-gray-100 text-gray-800';
  };

  const openEditModal = () => {
    if (!summary) return;
    const p = summary.patient;
    setEditData({
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      phone: p.phone || '',
      email: p.email || '',
      date_of_birth: p.date_of_birth || '',
      gender: p.gender || '',
      address: p.address || '',
      city: p.city || '',
      allergies: p.allergies || '',
      emergency_contact_name: p.emergency_contact_name || '',
      emergency_contact_phone: p.emergency_contact_phone || '',
      emergency_contact_relationship: p.emergency_contact_relationship || '',
      pcp_name: p.pcp_name || '',
      pcp_phone: p.pcp_phone || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!summary) return;
    setSaving(true);
    try {
      await apiClient.put(`/patients/${summary.patient.id}`, editData);
      showToast('Patient information updated', 'success');
      setShowEditModal(false);
      loadPatientSummary(summary.patient.id);
    } catch (error) {
      console.error('Error updating patient:', error);
      showToast('Failed to update patient', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Patient Details">
        <Card>
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-600">Loading patient information...</p>
          </div>
        </Card>
      </AppLayout>
    );
  }

  if (!summary) {
    return (
      <AppLayout title="Patient Details">
        <Card>
          <EmptyState
            title="Patient not found"
            description="The patient you're looking for doesn't exist or has been removed."
            icon={
              <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            action={{ label: 'Go Back', onClick: () => navigate(-1) }}
          />
        </Card>
      </AppLayout>
    );
  }

  const { patient, recent_encounters, active_medications, allergies, upcoming_appointments } = summary;

  return (
    <AppLayout title={`${patient.first_name} ${patient.last_name}`}>
      <div className="space-y-6">

        {/* Patient Info Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="flex justify-end mb-2">
            <button
              onClick={openEditModal}
              className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Patient
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Demographics
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Age:</span>
                  <span className="font-semibold text-gray-900">{calculateAge(patient.date_of_birth)} years</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Gender:</span>
                  <span className="font-semibold text-gray-900 capitalize">{patient.gender}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Allergies:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded ${patient.allergies ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}`}>
                    {patient.allergies || 'None reported'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">DOB:</span>
                  <span className="font-semibold text-gray-900">{format(new Date(patient.date_of_birth), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Contact Information
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Phone:</span>
                  <span className="font-semibold text-gray-900">{patient.phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Email:</span>
                  <span className="font-semibold text-gray-900 text-sm">{patient.email || 'N/A'}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-gray-500 text-sm w-24">Address:</span>
                  <span className="font-semibold text-gray-900">
                    {patient.address || 'N/A'}
                    {patient.city && (
                      <span className="block text-gray-600">{patient.city}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Emergency Contact
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Name:</span>
                  <span className="font-semibold text-gray-900">{patient.emergency_contact_name || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Phone:</span>
                  <span className="font-semibold text-gray-900">{patient.emergency_contact_phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Relationship:</span>
                  <span className="font-semibold text-gray-900 capitalize">{patient.emergency_contact_relationship || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Insurance & Billing
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-gray-500 text-sm w-24">Payer:</span>
                  <div>
                    {summary.payer_sources && summary.payer_sources.length > 0 ? (
                      summary.payer_sources.map((ps) => (
                        <div key={ps.id} className="font-semibold text-gray-900 capitalize">
                          {ps.payer_type === 'corporate' ? ps.corporate_client_name :
                           ps.payer_type === 'insurance' ? ps.insurance_provider_name :
                           'Self Pay'}
                          {ps.is_primary && <span className="text-xs text-primary-500 ml-1">(Primary)</span>}
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Balance:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded ${
                    (summary.outstanding_balance || 0) > 0 ? 'bg-danger-100 text-danger-800' : 'bg-success-100 text-success-800'
                  }`}>
                    {(summary.outstanding_balance || 0) > 0
                      ? `GH₵${Number(summary.outstanding_balance).toFixed(2)} owed`
                      : 'No balance'}
                  </span>
                </div>
                {patient.pcp_name && (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-24">PCP:</span>
                    <span className="font-semibold text-gray-900">{patient.pcp_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Allergies Alert */}
        {allergies.length > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="bg-red-500 p-2 rounded-lg">
                <svg className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-800">Known Allergies</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allergies.map((allergy) => (
                    <span
                      key={allergy.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${getSeverityColor(allergy.severity)}`}
                    >
                      {allergy.allergen}
                      {allergy.severity && (
                        <span className="text-xs opacity-75">({allergy.severity})</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modern Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Overview
              </button>
              <button
                onClick={() => setActiveTab('encounters')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'encounters'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Previous Visits
                {recent_encounters.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{recent_encounters.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('medications')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'medications'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Medications
                {active_medications.length > 0 && (
                  <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded-full">{active_medications.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('appointments')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'appointments'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Appointments
                {upcoming_appointments.length > 0 && (
                  <span className="bg-secondary-600 text-white text-xs px-2 py-0.5 rounded-full">{upcoming_appointments.length}</span>
                )}
              </button>
              <button
                onClick={() => setShowVitalSignsHistory(true)}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'vitals'
                    ? 'border-red-600 text-red-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Vital Signs History
              </button>
              <button
                onClick={() => setActiveTab('labs')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'labs'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Lab Results
                {labResults.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{labResults.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('imaging')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'imaging'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Imaging
                {imagingResults.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{imagingResults.length}</span>
                )}
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Encounters Summary */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Recent Visits
                  </h2>
                  {recent_encounters.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium">No previous visits recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recent_encounters.slice(0, 3).map((encounter) => (
                        <div key={encounter.id} className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-bold text-gray-900">
                              {format(new Date(encounter.encounter_date), 'MMM d, yyyy')}
                            </p>
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                              {encounter.encounter_type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-1">
                            <strong>Chief Complaint:</strong> {encounter.chief_complaint || 'N/A'}
                          </p>
                          <p className="text-xs text-gray-500">Provider: {encounter.provider_name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Medications */}
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-100">
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Active Medications
                  </h2>
                  {active_medications.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      <p className="text-sm font-medium">No active medications</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {active_medications.map((medication) => (
                        <div key={medication.id} className="bg-white rounded-lg p-4 border border-emerald-200 shadow-sm">
                          <p className="font-bold text-gray-900">{medication.medication_name}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {medication.dosage} - {medication.frequency}
                          </p>
                          {medication.route && (
                            <p className="text-xs text-gray-500 mt-1">Route: {medication.route}</p>
                          )}
                          <p className="text-xs text-emerald-600 font-medium mt-2">
                            Started: {format(new Date(medication.start_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'encounters' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Previous Visits</h2>
                {recent_encounters.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-lg font-medium">No previous visits recorded</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {recent_encounters.map((encounter) => (
                      <div key={encounter.id} className="bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">
                              {format(new Date(encounter.encounter_date), 'EEEE, MMMM d, yyyy')}
                            </h3>
                            <p className="text-sm text-gray-600">Provider: {encounter.provider_name}</p>
                          </div>
                          <span className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold rounded-full">
                            {encounter.encounter_type || 'General'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {encounter.chief_complaint && (
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Chief Complaint</p>
                              <p className="text-sm text-gray-900">{encounter.chief_complaint}</p>
                            </div>
                          )}

                          {encounter.vital_signs && (
                            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Vital Signs</p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                {encounter.vital_signs.blood_pressure_systolic && (
                                  <p className="text-gray-700">
                                    <span className="font-medium">BP:</span> {encounter.vital_signs.blood_pressure_systolic}/{encounter.vital_signs.blood_pressure_diastolic}
                                  </p>
                                )}
                                {encounter.vital_signs.heart_rate && (
                                  <p className="text-gray-700">
                                    <span className="font-medium">HR:</span> {encounter.vital_signs.heart_rate} bpm
                                  </p>
                                )}
                                {encounter.vital_signs.temperature && (
                                  <p className="text-gray-700">
                                    <span className="font-medium">Temp:</span> {encounter.vital_signs.temperature}°{encounter.vital_signs.temperature_unit || 'F'}
                                  </p>
                                )}
                                {encounter.vital_signs.oxygen_saturation && (
                                  <p className="text-gray-700">
                                    <span className="font-medium">SpO2:</span> {encounter.vital_signs.oxygen_saturation}%
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {encounter.diagnoses && encounter.diagnoses.length > 0 && (
                            <div className="bg-rose-50 rounded-lg p-4 border border-rose-100 md:col-span-2">
                              <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">Diagnoses</p>
                              <div className="space-y-1">
                                {encounter.diagnoses.map((dx: any) => (
                                  <div key={dx.id} className="flex items-center gap-2 text-sm">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${dx.type === 'primary' ? 'bg-rose-200 text-rose-800' : 'bg-gray-200 text-gray-700'}`}>
                                      {dx.type}
                                    </span>
                                    <span className="text-gray-900">{dx.diagnosis_description}</span>
                                    {dx.diagnosis_code && <span className="text-gray-400 text-xs">({dx.diagnosis_code})</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {encounter.clinical_notes && encounter.clinical_notes.length > 0 && (
                            <div className="bg-purple-50 rounded-lg p-4 border border-purple-100 md:col-span-2">
                              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Clinical Notes</p>
                              <div className="space-y-3">
                                {encounter.clinical_notes.map((note: any) => (
                                  <div key={note.id} className="border-l-2 border-purple-300 pl-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-purple-700 capitalize">{note.note_type.replace(/_/g, ' ')}</span>
                                      <span className="text-xs text-gray-400">by {note.author_name}</span>
                                    </div>
                                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {encounter.assessment && (
                            <div className="bg-amber-50 rounded-lg p-4 border border-amber-100 md:col-span-2">
                              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Assessment</p>
                              <p className="text-sm text-gray-900">{encounter.assessment}</p>
                            </div>
                          )}

                          {encounter.plan && (
                            <div className="bg-secondary-50 rounded-lg p-4 border border-secondary-100 md:col-span-2">
                              <p className="text-xs font-semibold text-secondary-600 uppercase tracking-wider mb-1">Plan</p>
                              <p className="text-sm text-gray-900">{encounter.plan}</p>
                            </div>
                          )}

                          {encounter.prescriptions && encounter.prescriptions.length > 0 && (
                            <div className="bg-teal-50 rounded-lg p-4 border border-teal-100 md:col-span-2">
                              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-2">Prescriptions</p>
                              <div className="space-y-1">
                                {encounter.prescriptions.map((rx: any) => (
                                  <div key={rx.id} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-gray-900">{rx.medication_name}</span>
                                      {rx.dosage && <span className="text-gray-500">{rx.dosage}</span>}
                                      {rx.frequency && <span className="text-gray-500">- {rx.frequency}</span>}
                                      {rx.route && <span className="text-gray-400 text-xs">({rx.route})</span>}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      rx.status === 'dispensed' || rx.status === 'completed' ? 'bg-green-100 text-green-700' :
                                      rx.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                      'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {rx.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'medications' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Active Medications</h2>
                {active_medications.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <p className="text-lg font-medium">No active medications</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Medication
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Dosage
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Frequency
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Start Date
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Prescriber
                          </th>
                          <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {active_medications.map((medication, index) => (
                          <tr key={medication.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-gray-900">{medication.medication_name}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">{medication.dosage}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{medication.frequency}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {format(new Date(medication.start_date), 'MMM d, yyyy')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {medication.prescribing_doctor_name}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleDiscontinueMedication(medication.id, medication.medication_name)}
                                className="px-3 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                              >
                                Discontinue
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

            {activeTab === 'appointments' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Upcoming Appointments</h2>
                {upcoming_appointments.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg font-medium">No upcoming appointments</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {upcoming_appointments.map((appointment) => (
                      <div key={appointment.id} className="bg-gradient-to-br from-secondary-50 to-indigo-50 rounded-xl p-5 border border-secondary-200 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="bg-secondary-600 text-white px-3 py-1 rounded-lg text-sm font-bold">
                            {format(new Date(appointment.appointment_date), 'MMM d')}
                          </div>
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                            appointment.status === 'scheduled'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {appointment.status}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-900 mb-1">
                          {format(new Date(appointment.appointment_date), 'h:mm a')}
                        </p>
                        <p className="text-sm text-gray-600 mb-2">
                          Duration: {appointment.duration_minutes} minutes
                        </p>
                        <p className="text-sm text-gray-600">
                          Provider: {appointment.provider_name}
                        </p>
                        {appointment.reason && (
                          <p className="text-sm text-secondary-700 mt-3 pt-3 border-t border-secondary-200">
                            <strong>Reason:</strong> {appointment.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'labs' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Lab Results History</h2>
                {labsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-500">Loading lab results...</p>
                  </div>
                ) : labResults.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <p className="text-lg font-medium">No lab results found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {labResults.map((lab) => (
                      <div key={lab.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                        lab.status === 'completed' ? 'border-emerald-200' : 'border-amber-200'
                      }`}>
                        <div className={`px-6 py-3 ${
                          lab.status === 'completed'
                            ? 'bg-gradient-to-r from-emerald-50 to-green-50'
                            : 'bg-gradient-to-r from-amber-50 to-yellow-50'
                        }`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-gray-900">{lab.test_name}</h3>
                              {lab.test_code && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                  {lab.test_code}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                lab.priority === 'stat'
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : lab.priority === 'urgent'
                                    ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                    : 'bg-gray-100 text-gray-600'
                              }`}>
                                {lab.priority.toUpperCase()}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                lab.status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : lab.status === 'in_progress'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}>
                                {lab.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-gray-500">Ordered:</span>
                              <span className="ml-2 font-medium text-gray-900">
                                {format(new Date(lab.ordered_at), 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Encounter:</span>
                              <span className="ml-2 font-medium text-gray-900">{lab.encounter_number}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Provider:</span>
                              <span className="ml-2 font-medium text-gray-900">{lab.ordering_provider_name}</span>
                            </div>
                            {lab.results_available_at && (
                              <div>
                                <span className="text-gray-500">Results:</span>
                                <span className="ml-2 font-medium text-gray-900">
                                  {format(new Date(lab.results_available_at), 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                            )}
                          </div>

                          {lab.results && (
                            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                              <h4 className="text-sm font-bold text-emerald-800 mb-2">Results:</h4>
                              <p className="text-gray-900 whitespace-pre-wrap">{lab.results}</p>
                            </div>
                          )}

                          {lab.notes && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <span className="text-sm font-medium text-gray-600">Notes:</span>
                              <p className="text-sm text-gray-800 mt-1">{lab.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'imaging' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Imaging Results</h2>
                {imagingResults.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    <p className="text-lg font-medium">No imaging orders</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {imagingResults.map((img) => (
                      <div key={img.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className={`px-6 py-3 ${
                          img.status === 'completed'
                            ? 'bg-gradient-to-r from-emerald-50 to-green-50'
                            : img.status === 'in_progress'
                              ? 'bg-gradient-to-r from-blue-50 to-sky-50'
                              : 'bg-gradient-to-r from-gray-50 to-slate-50'
                        }`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-gray-900">{img.imaging_type}</h3>
                              {img.body_part && <span className="text-sm text-gray-600">- {img.body_part}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                img.priority === 'stat' ? 'bg-red-100 text-red-700' :
                                img.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {img.priority.toUpperCase()}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                img.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                img.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {img.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-gray-500">Ordered:</span>
                              <span className="ml-2 font-medium text-gray-900">
                                {format(new Date(img.ordered_date), 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            {img.completed_date && (
                              <div>
                                <span className="text-gray-500">Completed:</span>
                                <span className="ml-2 font-medium text-gray-900">
                                  {format(new Date(img.completed_date), 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                            )}
                          </div>
                          {img.findings && (
                            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                              <h4 className="text-sm font-bold text-emerald-800 mb-2">Findings:</h4>
                              <p className="text-gray-900 whitespace-pre-wrap">{img.findings}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vital Signs History Modal */}
      {showVitalSignsHistory && patient && (
        <VitalSignsHistory
          patientId={patient.id}
          onClose={() => setShowVitalSignsHistory(false)}
        />
      )}
      {/* Edit Patient Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 rounded-t-xl sticky top-0">
              <h3 className="text-lg font-bold text-gray-900">Edit Patient Information</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input type="text" value={editData.first_name || ''} onChange={(e) => setEditData({ ...editData, first_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input type="text" value={editData.last_name || ''} onChange={(e) => setEditData({ ...editData, last_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" value={editData.date_of_birth || ''} onChange={(e) => setEditData({ ...editData, date_of_birth: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select value={editData.gender || ''} onChange={(e) => setEditData({ ...editData, gender: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" value={editData.city || ''} onChange={(e) => setEditData({ ...editData, city: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                <input type="text" value={editData.allergies || ''} onChange={(e) => setEditData({ ...editData, allergies: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="e.g., Penicillin, Nuts" />
              </div>
              <h4 className="text-sm font-semibold text-gray-700 pt-2 border-t">Emergency Contact</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={editData.emergency_contact_name || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={editData.emergency_contact_phone || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                  <input type="text" value={editData.emergency_contact_relationship || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_relationship: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <h4 className="text-sm font-semibold text-gray-700 pt-2 border-t">Primary Care Physician</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PCP Name</label>
                  <input type="text" value={editData.pcp_name || ''} onChange={(e) => setEditData({ ...editData, pcp_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PCP Phone</label>
                  <input type="text" value={editData.pcp_phone || ''} onChange={(e) => setEditData({ ...editData, pcp_phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex gap-3 justify-end sticky bottom-0">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default PatientDetails;
