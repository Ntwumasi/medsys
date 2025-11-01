import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { validateVitalSign } from '../utils/vitalSignsValidation';

interface AssignedPatient {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  room_number?: string;
  room_name?: string;
  current_priority: 'green' | 'yellow' | 'red';
  chief_complaint: string;
  vital_signs?: any;
}

interface VitalSigns {
  temperature?: number;
  temperature_unit?: 'C' | 'F';
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  weight_unit?: 'kg' | 'lbs';
  height?: number;
  height_unit?: 'cm' | 'in';
}

const NurseDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<AssignedPatient | null>(null);
  const [loading, setLoading] = useState(true);

  // Vitals form state
  const [vitals, setVitals] = useState<VitalSigns>({
    temperature_unit: 'F',
    weight_unit: 'lbs',
    height_unit: 'in',
  });

  // Validation errors
  const [vitalErrors, setVitalErrors] = useState<Record<string, string>>({});

  // Notes state
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<'nurse_hmp' | 'nurse_general'>('nurse_hmp');

  useEffect(() => {
    loadAssignedPatients();
    const interval = setInterval(loadAssignedPatients, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAssignedPatients = async () => {
    try {
      const res = await apiClient.get('/workflow/nurse/patients');
      setAssignedPatients(res.data.patients || []);
    } catch (error) {
      console.error('Error loading assigned patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // Removed unused handleStartEncounter function

  const handleSubmitVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    // Clear previous errors
    setVitalErrors({});

    // Validate each vital sign
    const errors: Record<string, string> = {};
    const warnings: string[] = [];

    if (vitals.temperature) {
      const tempType = vitals.temperature_unit === 'C' ? 'temperature_C' : 'temperature_F';
      const result = validateVitalSign(vitals.temperature, tempType);
      if (!result.isValid) {
        errors.temperature = result.message || 'Invalid temperature';
      } else if (result.isCritical) {
        warnings.push(`Temperature: ${result.message}`);
      }
    }

    if (vitals.heart_rate) {
      const result = validateVitalSign(vitals.heart_rate, 'heart_rate');
      if (!result.isValid) {
        errors.heart_rate = result.message || 'Invalid heart rate';
      } else if (result.isCritical) {
        warnings.push(`Heart Rate: ${result.message}`);
      }
    }

    if (vitals.blood_pressure_systolic) {
      const result = validateVitalSign(vitals.blood_pressure_systolic, 'blood_pressure_systolic');
      if (!result.isValid) {
        errors.blood_pressure_systolic = result.message || 'Invalid systolic BP';
      } else if (result.isCritical) {
        warnings.push(`Systolic BP: ${result.message}`);
      }
    }

    if (vitals.blood_pressure_diastolic) {
      const result = validateVitalSign(vitals.blood_pressure_diastolic, 'blood_pressure_diastolic');
      if (!result.isValid) {
        errors.blood_pressure_diastolic = result.message || 'Invalid diastolic BP';
      } else if (result.isCritical) {
        warnings.push(`Diastolic BP: ${result.message}`);
      }
    }

    if (vitals.respiratory_rate) {
      const result = validateVitalSign(vitals.respiratory_rate, 'respiratory_rate');
      if (!result.isValid) {
        errors.respiratory_rate = result.message || 'Invalid respiratory rate';
      } else if (result.isCritical) {
        warnings.push(`Respiratory Rate: ${result.message}`);
      }
    }

    if (vitals.oxygen_saturation) {
      const result = validateVitalSign(vitals.oxygen_saturation, 'oxygen_saturation');
      if (!result.isValid) {
        errors.oxygen_saturation = result.message || 'Invalid oxygen saturation';
      } else if (result.isCritical) {
        warnings.push(`O2 Saturation: ${result.message}`);
      }
    }

    // If there are validation errors, show them and return
    if (Object.keys(errors).length > 0) {
      setVitalErrors(errors);
      alert('Please correct the invalid vital signs before submitting.');
      return;
    }

    // If there are warnings, confirm with user
    if (warnings.length > 0) {
      const warningMessage = 'Critical vital signs detected:\n\n' + warnings.join('\n') + '\n\nDo you want to continue?';
      if (!confirm(warningMessage)) {
        return;
      }
    }

    try {
      const response = await apiClient.post('/workflow/nurse/vitals', {
        encounter_id: selectedPatient.id,
        vital_signs: vitals,
      });

      if (response.data.criticalValues && response.data.criticalValues.length > 0) {
        alert('Vital signs saved successfully.\n\nCritical values detected: ' + response.data.criticalValues.join(', ') + '\nDoctor has been alerted.');
      } else {
        alert('Vital signs saved successfully');
      }

      setVitals({
        temperature_unit: 'F',
        weight_unit: 'lbs',
        height_unit: 'in',
      });
      loadAssignedPatients();
    } catch (error: any) {
      console.error('Error submitting vitals:', error);
      if (error.response?.data?.errors) {
        setVitalErrors(error.response.data.errors);
        alert('Invalid vital signs. Please check the values and try again.');
      } else {
        alert('Failed to save vital signs');
      }
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !noteContent) return;

    try {
      await apiClient.post('/clinical-notes', {
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        note_type: noteType,
        content: noteContent,
      });

      alert('Note added successfully');
      setNoteContent('');
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add note');
    }
  };

  const handleAlertDoctor = async () => {
    if (!selectedPatient) return;

    try {
      await apiClient.post('/workflow/nurse/alert-doctor', {
        encounter_id: selectedPatient.id,
        message: 'Patient is ready for doctor evaluation',
      });

      alert('Doctor has been alerted');
    } catch (error) {
      console.error('Error alerting doctor:', error);
      alert('Failed to alert doctor');
    }
  };

  const handleRouteToDepartment = async (department: string) => {
    if (!selectedPatient) return;

    const departmentNames: Record<string, string> = {
      lab: 'Laboratory',
      pharmacy: 'Pharmacy',
      imaging: 'Imaging',
      receptionist: 'Receptionist',
    };

    if (!confirm(`Send patient to ${departmentNames[department]}?`)) {
      return;
    }

    try {
      await apiClient.post('/department-routing', {
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        department,
        priority: 'routine',
      });

      alert(`Patient routed to ${departmentNames[department]} successfully`);
      loadAssignedPatients();
    } catch (error) {
      console.error('Error routing patient:', error);
      alert('Failed to route patient');
    }
  };

  const handleReleaseRoom = async () => {
    if (!selectedPatient) return;

    if (!confirm('Are you sure you want to release the room? This will complete the encounter.')) {
      return;
    }

    try {
      await apiClient.post('/workflow/release-room', {
        encounter_id: selectedPatient.id,
      });

      alert('Room released and encounter completed');
      setSelectedPatient(null);
      loadAssignedPatients();
    } catch (error) {
      console.error('Error releasing room:', error);
      alert('Failed to release room');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'green':
        return 'bg-green-100 border-green-400';
      case 'yellow':
        return 'bg-yellow-100 border-yellow-400';
      case 'red':
        return 'bg-red-100 border-red-400';
      default:
        return 'bg-gray-100 border-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Nurse Dashboard - {user?.first_name} {user?.last_name}
            </h1>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Assigned Patients List */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                My Assigned Patients ({assignedPatients.length})
              </h2>
              <div className="space-y-3">
                {assignedPatients.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => setSelectedPatient(patient)}
                    className={`p-3 border-l-4 rounded cursor-pointer hover:shadow-md transition-shadow ${getPriorityColor(
                      patient.current_priority
                    )} ${selectedPatient?.id === patient.id ? 'ring-2 ring-primary-500' : ''}`}
                  >
                    <div className="font-semibold">{patient.patient_name}</div>
                    <div className="text-sm text-gray-600">
                      Room {patient.room_number} | {patient.patient_number}
                    </div>
                    <div className="text-xs mt-1 uppercase font-semibold">
                      {patient.current_priority}
                    </div>
                  </div>
                ))}

                {assignedPatients.length === 0 && (
                  <div className="text-center py-8 text-gray-500">No assigned patients</div>
                )}
              </div>
            </div>
          </div>

          {/* Patient Details & Actions */}
          <div className="lg:col-span-2">
            {selectedPatient ? (
              <div className="space-y-6">
                {/* Patient Info */}
                <div className="card">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Patient Information</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Name</div>
                      <div className="font-semibold">{selectedPatient.patient_name}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Patient Number</div>
                      <div className="font-semibold">{selectedPatient.patient_number}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Encounter Number</div>
                      <div className="font-semibold">{selectedPatient.encounter_number}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Room</div>
                      <div className="font-semibold">
                        {selectedPatient.room_number} {selectedPatient.room_name}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm text-gray-600">Chief Complaint</div>
                      <div className="font-semibold">{selectedPatient.chief_complaint}</div>
                    </div>
                  </div>
                </div>

                {/* Vital Signs Form */}
                <div className="card">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Vital Signs</h2>
                  <form onSubmit={handleSubmitVitals} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Temperature</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.1"
                            value={vitals.temperature || ''}
                            onChange={(e) =>
                              setVitals({ ...vitals, temperature: Number(e.target.value) })
                            }
                            className={`input flex-1 ${vitalErrors.temperature ? 'border-red-500' : ''}`}
                            placeholder="98.6"
                          />
                          <select
                            value={vitals.temperature_unit}
                            onChange={(e) =>
                              setVitals({
                                ...vitals,
                                temperature_unit: e.target.value as 'C' | 'F',
                              })
                            }
                            className="input w-16"
                          >
                            <option value="F">°F</option>
                            <option value="C">°C</option>
                          </select>
                        </div>
                        {vitalErrors.temperature && (
                          <p className="text-red-600 text-xs mt-1">{vitalErrors.temperature}</p>
                        )}
                      </div>

                      <div>
                        <label className="label">Heart Rate (bpm)</label>
                        <input
                          type="number"
                          value={vitals.heart_rate || ''}
                          onChange={(e) =>
                            setVitals({ ...vitals, heart_rate: Number(e.target.value) })
                          }
                          className={`input ${vitalErrors.heart_rate ? 'border-red-500' : ''}`}
                          placeholder="72"
                        />
                        {vitalErrors.heart_rate && (
                          <p className="text-red-600 text-xs mt-1">{vitalErrors.heart_rate}</p>
                        )}
                      </div>

                      <div>
                        <label className="label">BP Systolic</label>
                        <input
                          type="number"
                          value={vitals.blood_pressure_systolic || ''}
                          onChange={(e) =>
                            setVitals({
                              ...vitals,
                              blood_pressure_systolic: Number(e.target.value),
                            })
                          }
                          className={`input ${vitalErrors.blood_pressure_systolic ? 'border-red-500' : ''}`}
                          placeholder="120"
                        />
                        {vitalErrors.blood_pressure_systolic && (
                          <p className="text-red-600 text-xs mt-1">{vitalErrors.blood_pressure_systolic}</p>
                        )}
                      </div>

                      <div>
                        <label className="label">BP Diastolic</label>
                        <input
                          type="number"
                          value={vitals.blood_pressure_diastolic || ''}
                          onChange={(e) =>
                            setVitals({
                              ...vitals,
                              blood_pressure_diastolic: Number(e.target.value),
                            })
                          }
                          className={`input ${vitalErrors.blood_pressure_diastolic ? 'border-red-500' : ''}`}
                          placeholder="80"
                        />
                        {vitalErrors.blood_pressure_diastolic && (
                          <p className="text-red-600 text-xs mt-1">{vitalErrors.blood_pressure_diastolic}</p>
                        )}
                      </div>

                      <div>
                        <label className="label">Respiratory Rate</label>
                        <input
                          type="number"
                          value={vitals.respiratory_rate || ''}
                          onChange={(e) =>
                            setVitals({ ...vitals, respiratory_rate: Number(e.target.value) })
                          }
                          className={`input ${vitalErrors.respiratory_rate ? 'border-red-500' : ''}`}
                          placeholder="16"
                        />
                        {vitalErrors.respiratory_rate && (
                          <p className="text-red-600 text-xs mt-1">{vitalErrors.respiratory_rate}</p>
                        )}
                      </div>

                      <div>
                        <label className="label">O2 Saturation (%)</label>
                        <input
                          type="number"
                          value={vitals.oxygen_saturation || ''}
                          onChange={(e) =>
                            setVitals({ ...vitals, oxygen_saturation: Number(e.target.value) })
                          }
                          className={`input ${vitalErrors.oxygen_saturation ? 'border-red-500' : ''}`}
                          placeholder="98"
                        />
                        {vitalErrors.oxygen_saturation && (
                          <p className="text-red-600 text-xs mt-1">{vitalErrors.oxygen_saturation}</p>
                        )}
                      </div>
                    </div>

                    <button type="submit" className="btn-primary">
                      Save Vital Signs
                    </button>
                  </form>
                </div>

                {/* Clinical Notes */}
                <div className="card">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Clinical Notes</h2>
                  <form onSubmit={handleAddNote} className="space-y-4">
                    <div>
                      <label className="label">Note Type</label>
                      <select
                        value={noteType}
                        onChange={(e) =>
                          setNoteType(e.target.value as 'nurse_hmp' | 'nurse_general')
                        }
                        className="input"
                      >
                        <option value="nurse_hmp">History & Physical (H&P)</option>
                        <option value="nurse_general">General Note</option>
                      </select>
                    </div>

                    <div>
                      <label className="label">Note Content</label>
                      <textarea
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        className="input"
                        rows={6}
                        placeholder="Enter clinical notes..."
                        required
                      />
                    </div>

                    <div className="flex gap-2">
                      <button type="submit" className="btn-primary">
                        Add Note
                      </button>
                      <button
                        type="button"
                        onClick={handleAlertDoctor}
                        className="btn-secondary"
                      >
                        Alert Doctor - Patient Ready
                      </button>
                    </div>
                  </form>
                </div>

                {/* Patient Routing Options */}
                <div className="card bg-blue-50 border border-blue-200">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Patient Routing</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    After doctor completes encounter, route patient to appropriate department or discharge:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleRouteToDepartment('lab')}
                      className="bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
                    >
                      Send to Lab
                    </button>
                    <button
                      onClick={() => handleRouteToDepartment('pharmacy')}
                      className="bg-pink-600 text-white py-3 rounded-lg font-semibold hover:bg-pink-700 transition-colors"
                    >
                      Send to Pharmacy
                    </button>
                    <button
                      onClick={() => handleRouteToDepartment('imaging')}
                      className="bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      Send to Imaging
                    </button>
                    <button
                      onClick={() => handleRouteToDepartment('receptionist')}
                      className="bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
                    >
                      Send to Receptionist
                    </button>
                  </div>
                  <div className="mt-4 pt-4 border-t border-blue-300">
                    <button
                      onClick={handleReleaseRoom}
                      className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                    >
                      Release Room & Complete Encounter
                      <span className="block text-xs mt-1 font-normal">Final step after all routing is done</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg">Select a patient from the list to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default NurseDashboard;
