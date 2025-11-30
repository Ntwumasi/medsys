import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { patientsAPI } from '../api/patients';
import type { PatientSummary } from '../types';
import { format } from 'date-fns';

const PatientDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading patient information...</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Patient not found</p>
          <Link to="/patients" className="text-primary-600 hover:text-primary-900 mt-4 inline-block">
            Back to Patients
          </Link>
        </div>
      </div>
    );
  }

  const { patient, recent_encounters, active_medications, allergies, upcoming_appointments } = summary;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/patients" className="text-sm text-primary-600 hover:text-primary-900 mb-2 inline-block">
                ← Back to Patients
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">
                {patient.first_name} {patient.last_name}
              </h1>
              <p className="text-sm text-gray-600">Patient # {patient.patient_number}</p>
            </div>
            <Link to={`/encounters/new?patient_id=${patient.id}`} className="btn-primary">
              New Encounter
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Patient Info Card */}
        <div className="card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Demographics</h3>
              <div className="mt-2 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Age:</span> {calculateAge(patient.date_of_birth)} years
                </p>
                <p className="text-sm">
                  <span className="font-medium">Gender:</span> {patient.gender}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Blood Group:</span> {patient.blood_group || 'N/A'}
                </p>
                <p className="text-sm">
                  <span className="font-medium">DOB:</span> {format(new Date(patient.date_of_birth), 'MMM d, yyyy')}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Contact Information</h3>
              <div className="mt-2 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Phone:</span> {patient.phone || 'N/A'}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Email:</span> {patient.email || 'N/A'}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Address:</span> {patient.address || 'N/A'}
                </p>
                {patient.city && patient.state && (
                  <p className="text-sm">
                    {patient.city}, {patient.state}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Emergency Contact</h3>
              <div className="mt-2 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Name:</span> {patient.emergency_contact_name || 'N/A'}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Phone:</span> {patient.emergency_contact_phone || 'N/A'}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Relationship:</span>{' '}
                  {patient.emergency_contact_relationship || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Allergies Alert */}
        {allergies.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Allergies</h3>
                <div className="mt-2 text-sm text-red-700">
                  <ul className="list-disc list-inside space-y-1">
                    {allergies.map((allergy) => (
                      <li key={allergy.id}>
                        <strong>{allergy.allergen}</strong>
                        {allergy.severity && (
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs ${getSeverityColor(allergy.severity)}`}>
                            {allergy.severity}
                          </span>
                        )}
                        {allergy.reaction && ` - ${allergy.reaction}`}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('overview')}
                className={`${
                  activeTab === 'overview'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('encounters')}
                className={`${
                  activeTab === 'encounters'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Previous Visits ({recent_encounters.length})
              </button>
              <button
                onClick={() => setActiveTab('medications')}
                className={`${
                  activeTab === 'medications'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Medications ({active_medications.length})
              </button>
              <button
                onClick={() => setActiveTab('appointments')}
                className={`${
                  activeTab === 'appointments'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Appointments ({upcoming_appointments.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Encounters Summary */}
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Visits</h2>
              {recent_encounters.length === 0 ? (
                <p className="text-gray-500 text-sm">No previous visits recorded</p>
              ) : (
                <div className="space-y-4">
                  {recent_encounters.slice(0, 3).map((encounter) => (
                    <div key={encounter.id} className="border-l-4 border-primary-500 pl-4">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(encounter.encounter_date), 'MMM d, yyyy')}
                        </p>
                        <span className="text-xs text-gray-500">{encounter.encounter_type}</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        <strong>Today's Visit:</strong> {encounter.chief_complaint || 'N/A'}
                      </p>
                      {encounter.assessment && (
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Assessment:</strong> {encounter.assessment.substring(0, 100)}
                          {encounter.assessment.length > 100 && '...'}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">Provider: {encounter.provider_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Medications */}
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Medications</h2>
              {active_medications.length === 0 ? (
                <p className="text-gray-500 text-sm">No active medications</p>
              ) : (
                <div className="space-y-3">
                  {active_medications.map((medication) => (
                    <div key={medication.id} className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-900">{medication.medication_name}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {medication.dosage} - {medication.frequency}
                      </p>
                      {medication.route && (
                        <p className="text-xs text-gray-500">Route: {medication.route}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
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
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Previous Visits</h2>
            {recent_encounters.length === 0 ? (
              <p className="text-gray-500">No previous visits recorded</p>
            ) : (
              <div className="space-y-6">
                {recent_encounters.map((encounter) => (
                  <div key={encounter.id} className="border-b border-gray-200 pb-6 last:border-0">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-md font-semibold text-gray-900">
                          {format(new Date(encounter.encounter_date), 'EEEE, MMMM d, yyyy')}
                        </h3>
                        <p className="text-sm text-gray-600">Provider: {encounter.provider_name}</p>
                      </div>
                      <span className="px-3 py-1 bg-primary-100 text-primary-800 text-xs font-medium rounded-full">
                        {encounter.encounter_type || 'General'}
                      </span>
                    </div>

                    {encounter.chief_complaint && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700">Today's Visit:</p>
                        <p className="text-sm text-gray-600 mt-1">{encounter.chief_complaint}</p>
                      </div>
                    )}

                    {encounter.history_of_present_illness && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700">History of Present Illness:</p>
                        <p className="text-sm text-gray-600 mt-1">{encounter.history_of_present_illness}</p>
                      </div>
                    )}

                    {encounter.vital_signs && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700">Vital Signs:</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                          {encounter.vital_signs.blood_pressure_systolic && (
                            <p className="text-sm text-gray-600">
                              BP: {encounter.vital_signs.blood_pressure_systolic}/
                              {encounter.vital_signs.blood_pressure_diastolic} mmHg
                            </p>
                          )}
                          {encounter.vital_signs.heart_rate && (
                            <p className="text-sm text-gray-600">HR: {encounter.vital_signs.heart_rate} bpm</p>
                          )}
                          {encounter.vital_signs.temperature && (
                            <p className="text-sm text-gray-600">
                              Temp: {encounter.vital_signs.temperature}°{encounter.vital_signs.temperature_unit || 'C'}
                            </p>
                          )}
                          {encounter.vital_signs.oxygen_saturation && (
                            <p className="text-sm text-gray-600">
                              SpO2: {encounter.vital_signs.oxygen_saturation}%
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {encounter.physical_examination && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700">Physical Examination:</p>
                        <p className="text-sm text-gray-600 mt-1">{encounter.physical_examination}</p>
                      </div>
                    )}

                    {encounter.assessment && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700">Assessment:</p>
                        <p className="text-sm text-gray-600 mt-1">{encounter.assessment}</p>
                      </div>
                    )}

                    {encounter.plan && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700">Plan:</p>
                        <p className="text-sm text-gray-600 mt-1">{encounter.plan}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'medications' && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Medications</h2>
            {active_medications.length === 0 ? (
              <p className="text-gray-500">No active medications</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Medication
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Dosage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Frequency
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Prescriber
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {active_medications.map((medication) => (
                      <tr key={medication.id}>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {medication.medication_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{medication.dosage}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{medication.frequency}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {format(new Date(medication.start_date), 'MMM d, yyyy')}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
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
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Appointments</h2>
            {upcoming_appointments.length === 0 ? (
              <p className="text-gray-500">No upcoming appointments</p>
            ) : (
              <div className="space-y-4">
                {upcoming_appointments.map((appointment) => (
                  <div key={appointment.id} className="border-l-4 border-primary-500 pl-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(appointment.appointment_date), 'EEEE, MMMM d, yyyy')}
                        </p>
                        <p className="text-sm text-gray-600">
                          {format(new Date(appointment.appointment_date), 'h:mm a')} -{' '}
                          {appointment.duration_minutes} minutes
                        </p>
                        <p className="text-sm text-gray-600">Provider: {appointment.provider_name}</p>
                        {appointment.reason && (
                          <p className="text-sm text-gray-600 mt-1">Reason: {appointment.reason}</p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          appointment.status === 'scheduled'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {appointment.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PatientDetails;
