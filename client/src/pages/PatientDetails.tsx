import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientsAPI } from '../api/patients';
import type { PatientSummary } from '../types';
import { format } from 'date-fns';

const PatientDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'encounters' | 'medications' | 'appointments'>('overview');

  useEffect(() => {
    if (id) {
      loadPatientSummary(parseInt(id));
    }
  }, [id]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading patient information...</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center bg-white rounded-xl shadow-lg p-8">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600 text-lg mb-4">Patient not found</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { patient, recent_encounters, active_medications, allergies, upcoming_appointments } = summary;

  return (
    <div className="min-h-full">
      <div className="max-w-full mx-auto px-6 py-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {patient.first_name} {patient.last_name}
              </h1>
              <p className="text-gray-500 text-sm">Patient # {patient.patient_number}</p>
            </div>
          </div>
        </div>

        {/* Patient Info Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                  <span className="text-gray-500 text-sm w-24">Blood Group:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded ${patient.blood_group ? 'bg-red-100 text-red-800' : 'text-gray-400'}`}>
                    {patient.blood_group || 'N/A'}
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
                    {patient.city && patient.state && (
                      <span className="block text-gray-600">{patient.city}, {patient.state}</span>
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
                  <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">{upcoming_appointments.length}</span>
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

                          {encounter.assessment && (
                            <div className="bg-amber-50 rounded-lg p-4 border border-amber-100 md:col-span-2">
                              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Assessment</p>
                              <p className="text-sm text-gray-900">{encounter.assessment}</p>
                            </div>
                          )}

                          {encounter.plan && (
                            <div className="bg-purple-50 rounded-lg p-4 border border-purple-100 md:col-span-2">
                              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">Plan</p>
                              <p className="text-sm text-gray-900">{encounter.plan}</p>
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
                      <div key={appointment.id} className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-5 border border-purple-200 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="bg-purple-600 text-white px-3 py-1 rounded-lg text-sm font-bold">
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
                          <p className="text-sm text-purple-700 mt-3 pt-3 border-t border-purple-200">
                            <strong>Reason:</strong> {appointment.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDetails;
