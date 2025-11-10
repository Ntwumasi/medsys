import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { validateVitalSign } from '../utils/vitalSignsValidation';
import HPAccordion from '../components/HPAccordion';

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

interface NurseProcedure {
  id: number;
  encounter_id: number;
  patient_id: number;
  procedure_name: string;
  status: string;
  notes: string;
  ordered_at: string;
  ordered_by_name: string;
  price: number;
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

interface Room {
  id: number;
  room_number: string;
  room_name?: string;
  is_available: boolean;
}

interface LabOrder {
  id: number;
  test_name: string;
  test_code?: string;
  priority: 'stat' | 'urgent' | 'routine';
  status: string;
  ordered_date: string;
  ordering_provider_name: string;
}

interface ImagingOrder {
  id: number;
  imaging_type: string;
  body_part: string;
  priority: 'stat' | 'urgent' | 'routine';
  status: string;
  ordered_date: string;
  ordering_provider_name: string;
}

interface PharmacyOrder {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  priority: 'stat' | 'urgent' | 'routine';
  status: string;
  ordered_date: string;
  ordering_provider_name: string;
}

const NurseDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<AssignedPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [nurseProcedures, setNurseProcedures] = useState<NurseProcedure[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [imagingOrders, setImagingOrders] = useState<ImagingOrder[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);

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

  // Tab state for better UI organization
  const [activeTab, setActiveTab] = useState<'hp' | 'vitals' | 'orders' | 'procedures' | 'notes' | 'routing'>('hp');

  useEffect(() => {
    loadAssignedPatients();
    loadNurseProcedures();
    loadRooms();
    if (selectedPatient) {
      loadOrders();
    }
    const interval = setInterval(() => {
      loadAssignedPatients();
      loadNurseProcedures();
      loadRooms();
      if (selectedPatient) {
        loadOrders();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedPatient]);

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

  const loadNurseProcedures = async () => {
    try {
      const res = await apiClient.get('/nurse-procedures');
      setNurseProcedures(res.data.procedures || []);
    } catch (error) {
      console.error('Error loading nurse procedures:', error);
    }
  };

  const loadRooms = async () => {
    try {
      const res = await apiClient.get('/workflow/rooms');
      setRooms(res.data.rooms || []);
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  };

  const loadOrders = async () => {
    if (!selectedPatient) return;

    try {
      const res = await apiClient.get(`/orders/encounter/${selectedPatient.id}`);
      setLabOrders(res.data.lab_orders || []);
      setImagingOrders(res.data.imaging_orders || []);
      setPharmacyOrders(res.data.pharmacy_orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const handleAssignRoom = async (encounterId: number, roomId: number) => {
    try {
      await apiClient.post('/workflow/assign-room', {
        encounter_id: encounterId,
        room_id: roomId,
      });
      loadAssignedPatients();
      loadRooms();
    } catch (error) {
      console.error('Error assigning room:', error);
      alert('Failed to assign room');
    }
  };

  const handleStartProcedure = async (procedureId: number) => {
    try {
      await apiClient.post(`/nurse-procedures/${procedureId}/start`);
      alert('Procedure started');
      loadNurseProcedures();
    } catch (error) {
      console.error('Error starting procedure:', error);
      alert('Failed to start procedure');
    }
  };

  const handleCompleteProcedure = async (procedureId: number) => {
    if (!confirm('Complete this procedure? This will automatically add charges to the invoice.')) {
      return;
    }

    try {
      await apiClient.post(`/nurse-procedures/${procedureId}/complete`, {});
      alert('Procedure completed and billed successfully');
      loadNurseProcedures();
    } catch (error) {
      console.error('Error completing procedure:', error);
      alert('Failed to complete procedure');
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Modern Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-full mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Nurse Dashboard
                </h1>
                <p className="text-blue-100 text-sm">
                  {user?.first_name} {user?.last_name}
                </p>
              </div>
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
        {/* Room Status - At Top */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-2 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Room Status</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`p-4 rounded-xl text-center border-2 transition-all hover:shadow-lg ${
                  room.is_available
                    ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-400 text-emerald-800 hover:border-emerald-500'
                    : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-400 text-red-800 hover:border-red-500'
                }`}
              >
                <div className="font-bold text-lg">Room {room.room_number}</div>
                <div className="text-sm mt-1 font-medium">
                  {room.is_available ? 'Available' : 'Occupied'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Assigned Patients List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  My Assigned Patients <span className="text-blue-600">({assignedPatients.length})</span>
                </h2>
              </div>
              <div className="space-y-3">
                {assignedPatients.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => setSelectedPatient(patient)}
                    className={`p-4 border-l-4 rounded-xl cursor-pointer transition-all hover:shadow-md ${getPriorityColor(
                      patient.current_priority
                    )} ${selectedPatient?.id === patient.id ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' : ''}`}
                  >
                    <div className="font-bold text-lg">{patient.patient_name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Room {patient.room_number} | {patient.patient_number}
                    </div>
                    <div className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-bold uppercase ${
                      patient.current_priority === 'red' ? 'bg-red-200 text-red-800' :
                      patient.current_priority === 'yellow' ? 'bg-yellow-200 text-yellow-800' :
                      'bg-green-200 text-green-800'
                    }`}>
                      {patient.current_priority}
                    </div>
                  </div>
                ))}

                {assignedPatients.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <p className="font-medium">No assigned patients</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Patient Details & Actions */}
          <div className="lg:col-span-2">
            {selectedPatient ? (
              <div className="space-y-4">
                {/* Patient Info Header */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedPatient.patient_name}</h2>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold">
                          Patient #: {selectedPatient.patient_number}
                        </span>
                        <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg font-semibold">
                          Encounter #: {selectedPatient.encounter_number}
                        </span>
                      </div>
                    </div>
                    <div className={`px-5 py-3 rounded-xl font-bold text-sm shadow-md ${
                      selectedPatient.current_priority === 'red' ? 'bg-gradient-to-r from-red-100 to-red-200 text-red-800' :
                      selectedPatient.current_priority === 'yellow' ? 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800' :
                      'bg-gradient-to-r from-green-100 to-green-200 text-green-800'
                    }`}>
                      PRIORITY: {selectedPatient.current_priority.toUpperCase()}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-gray-200">
                    <div className="bg-gradient-to-br from-slate-50 to-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Room Assignment
                      </div>
                      {selectedPatient.room_number ? (
                        <div className="font-bold text-xl text-gray-900">
                          Room {selectedPatient.room_number} {selectedPatient.room_name}
                        </div>
                      ) : (
                        <div>
                          <select
                            onChange={(e) => handleAssignRoom(selectedPatient.id, Number(e.target.value))}
                            className="w-full px-3 py-2 border-2 border-orange-300 bg-orange-50 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent font-semibold text-orange-900"
                            defaultValue=""
                          >
                            <option value="">⚠️ ASSIGN ROOM FIRST</option>
                            {rooms
                              .filter((r) => r.is_available)
                              .map((room) => (
                                <option key={room.id} value={room.id}>
                                  Room {room.room_number}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
                      <div className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Chief Complaint
                      </div>
                      <div className="font-bold text-lg text-gray-900">{selectedPatient.chief_complaint}</div>
                    </div>
                  </div>
                </div>

                {/* Tabs Navigation */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                  <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 rounded-t-xl">
                    <nav className="flex -mb-px overflow-x-auto">
                      <button
                        onClick={() => setActiveTab('hp')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeTab === 'hp'
                            ? 'border-purple-500 text-purple-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        H&P
                      </button>
                      <button
                        onClick={() => setActiveTab('vitals')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeTab === 'vitals'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Vital Signs
                      </button>
                      <button
                        onClick={() => setActiveTab('orders')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                          activeTab === 'orders'
                            ? 'border-purple-500 text-purple-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Doctor's Orders
                        {(labOrders.length > 0 || imagingOrders.length > 0 || pharmacyOrders.length > 0) && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full">
                            {labOrders.length + imagingOrders.length + pharmacyOrders.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setActiveTab('procedures')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'procedures'
                            ? 'border-green-500 text-green-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Nurse Procedures
                        {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length > 0 && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                            {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setActiveTab('notes')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'notes'
                            ? 'border-indigo-500 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Clinical Notes
                      </button>
                      <button
                        onClick={() => setActiveTab('routing')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'routing'
                            ? 'border-teal-500 text-teal-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Patient Routing
                      </button>
                    </nav>
                  </div>

                  {/* Tab Content */}
                  <div className="p-6">
                    {/* H&P Tab */}
                    {activeTab === 'hp' && selectedPatient && (
                      <div className="-m-6">
                        <HPAccordion
                          encounterId={selectedPatient.id}
                          patientId={selectedPatient.patient_id}
                          userRole="nurse"
                        />
                      </div>
                    )}

                    {/* Vital Signs Tab */}
                    {activeTab === 'vitals' && (
                      <form onSubmit={handleSubmitVitals} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="label">Temperature</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="0.1"
                                value={vitals.temperature || ''}
                                onChange={(e) => {
                                  const value = e.target.value ? parseFloat(e.target.value) : undefined;
                                  setVitals({ ...vitals, temperature: value });
                                  if (value) {
                                    const tempType = vitals.temperature_unit === 'C' ? 'temperature_C' : 'temperature_F';
                                    const result = validateVitalSign(value, tempType);
                                    if (!result.isValid || result.isCritical) {
                                      setVitalErrors({ ...vitalErrors, temperature: result.message || 'Invalid value' });
                                    } else {
                                      const { temperature, ...rest } = vitalErrors;
                                      setVitalErrors(rest);
                                    }
                                  }
                                }}
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
                                className="input w-20"
                              >
                                <option value="F">°F</option>
                                <option value="C">°C</option>
                              </select>
                            </div>
                            {vitalErrors.temperature && (
                              <p className="text-xs text-red-600 mt-1">{vitalErrors.temperature}</p>
                            )}
                          </div>

                          <div>
                            <label className="label">Heart Rate (bpm)</label>
                            <input
                              type="number"
                              value={vitals.heart_rate || ''}
                              onChange={(e) => {
                                const value = e.target.value ? parseInt(e.target.value) : undefined;
                                setVitals({ ...vitals, heart_rate: value });
                                if (value) {
                                  const result = validateVitalSign(value, 'heart_rate');
                                  if (!result.isValid || result.isCritical) {
                                    setVitalErrors({ ...vitalErrors, heart_rate: result.message || 'Invalid value' });
                                  } else {
                                    const { heart_rate, ...rest } = vitalErrors;
                                    setVitalErrors(rest);
                                  }
                                }
                              }}
                              className={`input ${vitalErrors.heart_rate ? 'border-red-500' : ''}`}
                              placeholder="72"
                            />
                            {vitalErrors.heart_rate && (
                              <p className="text-xs text-red-600 mt-1">{vitalErrors.heart_rate}</p>
                            )}
                          </div>

                          <div>
                            <label className="label">BP Systolic</label>
                            <input
                              type="number"
                              value={vitals.blood_pressure_systolic || ''}
                              onChange={(e) => {
                                const value = e.target.value ? parseInt(e.target.value) : undefined;
                                setVitals({ ...vitals, blood_pressure_systolic: value });
                                if (value) {
                                  const result = validateVitalSign(value, 'blood_pressure_systolic');
                                  if (!result.isValid || result.isCritical) {
                                    setVitalErrors({ ...vitalErrors, blood_pressure_systolic: result.message || 'Invalid value' });
                                  } else {
                                    const { blood_pressure_systolic, ...rest } = vitalErrors;
                                    setVitalErrors(rest);
                                  }
                                }
                              }}
                              className={`input ${vitalErrors.blood_pressure_systolic ? 'border-red-500' : ''}`}
                              placeholder="120"
                            />
                            {vitalErrors.blood_pressure_systolic && (
                              <p className="text-xs text-red-600 mt-1">{vitalErrors.blood_pressure_systolic}</p>
                            )}
                          </div>

                          <div>
                            <label className="label">BP Diastolic</label>
                            <input
                              type="number"
                              value={vitals.blood_pressure_diastolic || ''}
                              onChange={(e) => {
                                const value = e.target.value ? parseInt(e.target.value) : undefined;
                                setVitals({ ...vitals, blood_pressure_diastolic: value });
                                if (value) {
                                  const result = validateVitalSign(value, 'blood_pressure_diastolic');
                                  if (!result.isValid || result.isCritical) {
                                    setVitalErrors({ ...vitalErrors, blood_pressure_diastolic: result.message || 'Invalid value' });
                                  } else {
                                    const { blood_pressure_diastolic, ...rest } = vitalErrors;
                                    setVitalErrors(rest);
                                  }
                                }
                              }}
                              className={`input ${vitalErrors.blood_pressure_diastolic ? 'border-red-500' : ''}`}
                              placeholder="80"
                            />
                            {vitalErrors.blood_pressure_diastolic && (
                              <p className="text-xs text-red-600 mt-1">{vitalErrors.blood_pressure_diastolic}</p>
                            )}
                          </div>

                          <div>
                            <label className="label">Respiratory Rate</label>
                            <input
                              type="number"
                              value={vitals.respiratory_rate || ''}
                              onChange={(e) => {
                                const value = e.target.value ? parseInt(e.target.value) : undefined;
                                setVitals({ ...vitals, respiratory_rate: value });
                                if (value) {
                                  const result = validateVitalSign(value, 'respiratory_rate');
                                  if (!result.isValid || result.isCritical) {
                                    setVitalErrors({ ...vitalErrors, respiratory_rate: result.message || 'Invalid value' });
                                  } else {
                                    const { respiratory_rate, ...rest } = vitalErrors;
                                    setVitalErrors(rest);
                                  }
                                }
                              }}
                              className={`input ${vitalErrors.respiratory_rate ? 'border-red-500' : ''}`}
                              placeholder="16"
                            />
                            {vitalErrors.respiratory_rate && (
                              <p className="text-xs text-red-600 mt-1">{vitalErrors.respiratory_rate}</p>
                            )}
                          </div>

                          <div>
                            <label className="label">O2 Saturation (%)</label>
                            <input
                              type="number"
                              value={vitals.oxygen_saturation || ''}
                              onChange={(e) => {
                                const value = e.target.value ? parseInt(e.target.value) : undefined;
                                setVitals({ ...vitals, oxygen_saturation: value });
                                if (value) {
                                  const result = validateVitalSign(value, 'oxygen_saturation');
                                  if (!result.isValid || result.isCritical) {
                                    setVitalErrors({ ...vitalErrors, oxygen_saturation: result.message || 'Invalid value' });
                                  } else {
                                    const { oxygen_saturation, ...rest } = vitalErrors;
                                    setVitalErrors(rest);
                                  }
                                }
                              }}
                              className={`input ${vitalErrors.oxygen_saturation ? 'border-red-500' : ''}`}
                              placeholder="98"
                            />
                            {vitalErrors.oxygen_saturation && (
                              <p className="text-xs text-red-600 mt-1">{vitalErrors.oxygen_saturation}</p>
                            )}
                          </div>

                          <div>
                            <label className="label">Weight</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="0.1"
                                value={vitals.weight || ''}
                                onChange={(e) =>
                                  setVitals({
                                    ...vitals,
                                    weight: e.target.value ? parseFloat(e.target.value) : undefined,
                                  })
                                }
                                className="input flex-1"
                                placeholder="150"
                              />
                              <select
                                value={vitals.weight_unit}
                                onChange={(e) =>
                                  setVitals({
                                    ...vitals,
                                    weight_unit: e.target.value as 'kg' | 'lbs',
                                  })
                                }
                                className="input w-20"
                              >
                                <option value="lbs">lbs</option>
                                <option value="kg">kg</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="label">Height</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="0.1"
                                value={vitals.height || ''}
                                onChange={(e) =>
                                  setVitals({
                                    ...vitals,
                                    height: e.target.value ? parseFloat(e.target.value) : undefined,
                                  })
                                }
                                className="input flex-1"
                                placeholder="68"
                              />
                              <select
                                value={vitals.height_unit}
                                onChange={(e) =>
                                  setVitals({
                                    ...vitals,
                                    height_unit: e.target.value as 'cm' | 'in',
                                  })
                                }
                                className="input w-20"
                              >
                                <option value="in">in</option>
                                <option value="cm">cm</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <button type="submit" className="btn-primary w-full">
                          Save Vital Signs
                        </button>
                      </form>
                    )}

                    {/* Doctor's Orders Tab */}
                    {activeTab === 'orders' && (
                      <div className="space-y-4">
                        {(labOrders.length > 0 || imagingOrders.length > 0 || pharmacyOrders.length > 0) ? (
                          <div>
                            {/* Lab Orders */}
                            {labOrders.length > 0 && (
                              <div className="mb-4">
                                <h3 className="text-lg font-semibold text-purple-700 mb-2">Laboratory Orders</h3>
                                <div className="space-y-2">
                                  {labOrders.map((order) => (
                                    <div key={order.id} className="border border-purple-200 rounded-lg p-3 bg-purple-50">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900">{order.test_name}</h4>
                                          {order.test_code && (
                                            <p className="text-sm text-gray-600">Code: {order.test_code}</p>
                                          )}
                                          <p className="text-xs text-gray-500 mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-red-100 text-red-800' :
                                            order.priority === 'urgent' ? 'bg-orange-100 text-orange-800' :
                                            'bg-green-100 text-green-800'
                                          }`}>
                                            {order.priority.toUpperCase()}
                                          </span>
                                          <div className="text-xs text-gray-600 mt-1">{order.status}</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Imaging Orders */}
                            {imagingOrders.length > 0 && (
                              <div className="mb-4">
                                <h3 className="text-lg font-semibold text-indigo-700 mb-2">Imaging Orders</h3>
                                <div className="space-y-2">
                                  {imagingOrders.map((order) => (
                                    <div key={order.id} className="border border-indigo-200 rounded-lg p-3 bg-indigo-50">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900">{order.imaging_type}</h4>
                                          <p className="text-sm text-gray-600">Body Part: {order.body_part}</p>
                                          <p className="text-xs text-gray-500 mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-red-100 text-red-800' :
                                            order.priority === 'urgent' ? 'bg-orange-100 text-orange-800' :
                                            'bg-green-100 text-green-800'
                                          }`}>
                                            {order.priority.toUpperCase()}
                                          </span>
                                          <div className="text-xs text-gray-600 mt-1">{order.status}</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Pharmacy Orders */}
                            {pharmacyOrders.length > 0 && (
                              <div>
                                <h3 className="text-lg font-semibold text-pink-700 mb-2">Pharmacy Orders</h3>
                                <div className="space-y-2">
                                  {pharmacyOrders.map((order) => (
                                    <div key={order.id} className="border border-pink-200 rounded-lg p-3 bg-pink-50">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900">{order.medication_name}</h4>
                                          <p className="text-sm text-gray-600">
                                            {order.dosage} | {order.frequency} | {order.route}
                                          </p>
                                          <p className="text-xs text-gray-500 mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-red-100 text-red-800' :
                                            order.priority === 'urgent' ? 'bg-orange-100 text-orange-800' :
                                            'bg-green-100 text-green-800'
                                          }`}>
                                            {order.priority.toUpperCase()}
                                          </span>
                                          <div className="text-xs text-gray-600 mt-1">{order.status}</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            No doctor's orders for this patient
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nurse Procedures Tab */}
                    {activeTab === 'procedures' && (
                      <div className="space-y-4">
                        {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length > 0 ? (
                          <div className="space-y-3">
                            {nurseProcedures
                              .filter(p => p.encounter_id === selectedPatient.id)
                              .map((procedure) => (
                                <div
                                  key={procedure.id}
                                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h3 className="font-semibold text-gray-900">{procedure.procedure_name}</h3>
                                      {procedure.notes && (
                                        <p className="text-sm text-gray-600 mt-1">{procedure.notes}</p>
                                      )}
                                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                                        <span>Ordered by: {procedure.ordered_by_name}</span>
                                        <span>Price: ${procedure.price.toFixed(2)}</span>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                          procedure.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                          procedure.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                          'bg-green-100 text-green-800'
                                        }`}>
                                          {procedure.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="ml-4 flex gap-2">
                                      {procedure.status === 'pending' && (
                                        <button
                                          onClick={() => handleStartProcedure(procedure.id)}
                                          className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                                        >
                                          Start
                                        </button>
                                      )}
                                      {procedure.status === 'in_progress' && (
                                        <button
                                          onClick={() => handleCompleteProcedure(procedure.id)}
                                          className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                                        >
                                          Complete & Bill
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            No nurse procedures for this patient
                          </div>
                        )}
                      </div>
                    )}

                    {/* Clinical Notes Tab */}
                    {activeTab === 'notes' && (
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
                    )}

                    {/* Patient Routing Tab */}
                    {activeTab === 'routing' && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
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
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12">
                <div className="text-center text-gray-400">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-blue-200 rounded-full blur-3xl opacity-20"></div>
                    <svg className="w-32 h-32 mx-auto relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <p className="text-2xl font-semibold text-gray-600 mb-2">Select a patient to begin</p>
                  <p className="text-gray-400">Choose a patient from your assigned list to view their details and medical records</p>
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
