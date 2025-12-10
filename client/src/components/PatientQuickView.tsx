import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';

interface PatientData {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  blood_group?: string;
  nationality?: string;
  phone?: string;
  // Health Status
  hiv_status?: string;
  hepatitis_b_status?: string;
  hepatitis_c_status?: string;
  tb_status?: string;
  sickle_cell_status?: string;
  other_health_conditions?: string;
}

interface VitalSigns {
  temperature?: number;
  temperature_unit?: string;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  weight_unit?: string;
  height?: number;
  height_unit?: string;
}

interface LatestEncounter {
  id: number;
  encounter_number: string;
  chief_complaint?: string;
  vital_signs?: VitalSigns;
  created_at: string;
}

interface PatientQuickViewProps {
  patientId: number;
  onClose: () => void;
  showHealthStatus?: boolean; // Only for doctors
}

const PatientQuickView: React.FC<PatientQuickViewProps> = ({
  patientId,
  onClose,
  showHealthStatus = false,
}) => {
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [latestEncounter, setLatestEncounter] = useState<LatestEncounter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch patient details
        const patientRes = await apiClient.get(`/patients/${patientId}`);
        setPatient(patientRes.data.patient);

        // Fetch latest encounter with vital signs
        const encountersRes = await apiClient.get(`/encounters?patient_id=${patientId}&limit=1`);
        if (encountersRes.data.encounters?.length > 0) {
          setLatestEncounter(encountersRes.data.encounters[0]);
        }
      } catch (error) {
        console.error('Error fetching patient data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      fetchData();
    }
  }, [patientId]);

  const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getStatusColor = (status: string | undefined): string => {
    if (!status || status === '' || status === 'Unknown') return 'bg-gray-100 text-gray-600';
    if (status === 'Negative' || status === 'AA') return 'bg-green-100 text-green-700';
    if (status === 'Positive' || status === 'SS' || status === 'SC') return 'bg-red-100 text-red-700';
    if (status === 'AS') return 'bg-yellow-100 text-yellow-700';
    if (status === 'Not Tested') return 'bg-gray-100 text-gray-600';
    return 'bg-gray-100 text-gray-600';
  };

  const vitals = latestEncounter?.vital_signs;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-30 transition-opacity"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="absolute inset-y-0 right-0 max-w-md w-full bg-white shadow-xl transform transition-transform">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Patient Quick View</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : patient ? (
          <div className="overflow-y-auto h-full pb-20">
            {/* Patient Info */}
            <div className="px-6 py-4 border-b">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                  {patient.first_name[0]}{patient.last_name[0]}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {patient.first_name} {patient.last_name}
                  </h3>
                  <p className="text-sm text-gray-500">{patient.patient_number}</p>
                  <p className="text-sm text-gray-600">
                    {calculateAge(patient.date_of_birth)} yrs | {patient.gender}
                    {patient.blood_group && ` | ${patient.blood_group}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Vital Signs Section */}
            <div className="px-6 py-4 border-b">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Latest Vital Signs
              </h4>

              {vitals ? (
                <div className="grid grid-cols-2 gap-3">
                  {/* Blood Pressure */}
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="text-xs text-red-600 font-medium">Blood Pressure</div>
                    <div className="text-lg font-bold text-red-700">
                      {vitals.blood_pressure_systolic && vitals.blood_pressure_diastolic
                        ? `${vitals.blood_pressure_systolic}/${vitals.blood_pressure_diastolic}`
                        : '--/--'} <span className="text-sm font-normal">mmHg</span>
                    </div>
                  </div>

                  {/* Heart Rate */}
                  <div className="bg-pink-50 rounded-lg p-3">
                    <div className="text-xs text-pink-600 font-medium">Heart Rate</div>
                    <div className="text-lg font-bold text-pink-700">
                      {vitals.heart_rate || '--'} <span className="text-sm font-normal">bpm</span>
                    </div>
                  </div>

                  {/* Temperature */}
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="text-xs text-orange-600 font-medium">Temperature</div>
                    <div className="text-lg font-bold text-orange-700">
                      {vitals.temperature || '--'}°{vitals.temperature_unit || 'C'}
                    </div>
                  </div>

                  {/* SpO2 */}
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium">SpO2</div>
                    <div className="text-lg font-bold text-blue-700">
                      {vitals.oxygen_saturation || '--'}<span className="text-sm font-normal">%</span>
                    </div>
                  </div>

                  {/* Respiratory Rate */}
                  <div className="bg-cyan-50 rounded-lg p-3">
                    <div className="text-xs text-cyan-600 font-medium">Resp. Rate</div>
                    <div className="text-lg font-bold text-cyan-700">
                      {vitals.respiratory_rate || '--'} <span className="text-sm font-normal">/min</span>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xs text-green-600 font-medium">Weight</div>
                    <div className="text-lg font-bold text-green-700">
                      {vitals.weight || '--'} <span className="text-sm font-normal">{vitals.weight_unit || 'kg'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                  <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  No vital signs recorded yet
                </div>
              )}

              {latestEncounter && (
                <p className="text-xs text-gray-400 mt-2">
                  From encounter {latestEncounter.encounter_number} on{' '}
                  {new Date(latestEncounter.created_at).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Health Status Section - Only for Doctors */}
            {showHealthStatus && (
              <div className="px-6 py-4 border-b">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Health Status
                </h4>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">HIV Status</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(patient.hiv_status)}`}>
                      {patient.hiv_status || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Hepatitis B</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(patient.hepatitis_b_status)}`}>
                      {patient.hepatitis_b_status || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Hepatitis C</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(patient.hepatitis_c_status)}`}>
                      {patient.hepatitis_c_status || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">TB Status</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(patient.tb_status)}`}>
                      {patient.tb_status || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Sickle Cell</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(patient.sickle_cell_status)}`}>
                      {patient.sickle_cell_status || 'Unknown'}
                    </span>
                  </div>
                  {patient.other_health_conditions && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium mb-1">Other Conditions</p>
                      <p className="text-sm text-gray-700">{patient.other_health_conditions}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Contact Info */}
            <div className="px-6 py-4">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Contact
              </h4>
              {patient.phone ? (
                <p className="text-gray-700">{patient.phone}</p>
              ) : (
                <p className="text-gray-400 italic">No phone number</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            Patient not found
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientQuickView;
