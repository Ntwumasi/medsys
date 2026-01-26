import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import HPAccordion from '../components/HPAccordion';
import { useNotification } from '../context/NotificationContext';
import NotificationCenter from '../components/NotificationCenter';
import { SmartTextArea } from '../components/SmartTextArea';
import { AutocompleteInput } from '../components/AutocompleteInput';
import PatientQuickView from '../components/PatientQuickView';
import VitalSignsHistory from '../components/VitalSignsHistory';
import type { VitalSigns } from '../types';

interface RoomEncounter {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  room_number: string;
  room_name?: string;
  nurse_name?: string;
  chief_complaint: string;
  vital_signs?: VitalSigns;
}

interface ClinicalNote {
  id: number;
  note_type: string;
  content: string;
  created_by_name: string;
  created_by_role: string;
  is_signed: boolean;
  signed_by_name?: string;
  created_at: string;
}

interface LabOrder {
  id: number;
  test_name: string;
  priority: string;
  status: string;
  results?: string;
  ordered_at: string;
  completed_at?: string;
}

interface ImagingOrder {
  id: number;
  imaging_type: string;
  body_part?: string;
  priority: string;
  status: string;
  results?: string;
  ordered_at: string;
  completed_at?: string;
}

interface DoctorAlert {
  id: number;
  patient_name: string;
  patient_number: string;
  room_number?: string;
  test_name?: string;
  imaging_type?: string;
  body_part?: string;
  medication_name?: string;
  status: string;
  results?: string;
  completed_date?: string;
  priority: string;
}

const DoctorDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const [roomEncounters, setRoomEncounters] = useState<RoomEncounter[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<RoomEncounter | null>(null);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms state
  const [noteContent, setNoteContent] = useState('');
  const [nurseNoteContent, setNurseNoteContent] = useState('');
  const [proceduralNoteContent, setProceduralNoteContent] = useState('');

  // Multi-order state - arrays to hold pending orders
  const [pendingLabOrders, setPendingLabOrders] = useState<Array<{test_name: string, priority: string}>>([]);
  const [pendingImagingOrders, setPendingImagingOrders] = useState<Array<{imaging_type: string, body_part: string, priority: string}>>([]);
  const [pendingPharmacyOrders, setPendingPharmacyOrders] = useState<Array<{medication_name: string, dosage: string, frequency: string, route: string, quantity: string, priority: string}>>([]);

  // Current order being added
  const [currentLabOrder, setCurrentLabOrder] = useState({test_name: '', priority: 'routine'});
  const [currentImagingOrder, setCurrentImagingOrder] = useState({imaging_type: '', body_part: '', priority: 'routine'});
  const [currentPharmacyOrder, setCurrentPharmacyOrder] = useState({medication_name: '', dosage: '', frequency: '', route: '', quantity: '', priority: 'routine'});

  // Clinical Notes Tab state
  const [clinicalNotesTab, setClinicalNotesTab] = useState<'soap' | 'doctor' | 'nurse' | 'instructions' | 'procedural' | 'past'>('soap');

  // Lab and Imaging results state
  const [encounterLabOrders, setEncounterLabOrders] = useState<LabOrder[]>([]);
  const [encounterImagingOrders, setEncounterImagingOrders] = useState<ImagingOrder[]>([]);
  const [resultsTab, setResultsTab] = useState<'lab' | 'imaging'>('lab');

  // Doctor Alerts state
  const [labAlerts, setLabAlerts] = useState<DoctorAlert[]>([]);
  const [imagingAlerts, setImagingAlerts] = useState<DoctorAlert[]>([]);
  const [pharmacyAlerts, setPharmacyAlerts] = useState<DoctorAlert[]>([]);
  const [alertsTab, setAlertsTab] = useState<'lab' | 'imaging' | 'pharmacy'>('lab');

  // Patient Quick View state
  const [quickViewPatientId, setQuickViewPatientId] = useState<number | null>(null);

  // Vital Signs History state
  const [showVitalsHistory, setShowVitalsHistory] = useState(false);

  useEffect(() => {
    loadRoomEncounters();
    loadDoctorAlerts();
    const interval = setInterval(() => {
      loadRoomEncounters();
      loadDoctorAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedEncounter) {
      loadEncounterNotes(selectedEncounter.id);
      loadEncounterOrders(selectedEncounter.id);
    }
  }, [selectedEncounter]);

  const loadRoomEncounters = async () => {
    try {
      const res = await apiClient.get('/workflow/doctor/rooms');
      // Sort by newest first (highest ID = most recent)
      const encounters = (res.data.encounters || []).sort((a: RoomEncounter, b: RoomEncounter) => b.id - a.id);
      setRoomEncounters(encounters);
    } catch (error) {
      console.error('Error loading room encounters:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEncounterNotes = async (encounterId: number) => {
    try {
      const res = await apiClient.get(`/clinical-notes/encounter/${encounterId}`);
      const allNotes = res.data.notes || [];
      setNotes(allNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const loadEncounterOrders = async (encounterId: number) => {
    try {
      const res = await apiClient.get(`/orders/encounter/${encounterId}`);
      setEncounterLabOrders(res.data.lab_orders || []);
      setEncounterImagingOrders(res.data.imaging_orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const loadDoctorAlerts = async () => {
    try {
      const res = await apiClient.get('/orders/doctor-alerts');
      setLabAlerts(res.data.lab_alerts || []);
      setImagingAlerts(res.data.imaging_alerts || []);
      setPharmacyAlerts(res.data.pharmacy_alerts || []);
    } catch (error) {
      console.error('Error loading doctor alerts:', error);
    }
  };

  const handleAddDoctorNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEncounter || !noteContent) return;

    try {
      await apiClient.post('/clinical-notes', {
        encounter_id: selectedEncounter.id,
        patient_id: selectedEncounter.patient_id,
        note_type: 'doctor_general',
        content: noteContent,
      });

      showToast('Note added successfully', 'success');
      setNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding note:', error);
      showToast('Failed to add note', 'error');
    }
  };

  const handleAddNurseNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEncounter || !nurseNoteContent) return;

    try {
      await apiClient.post('/clinical-notes', {
        encounter_id: selectedEncounter.id,
        patient_id: selectedEncounter.patient_id,
        note_type: 'doctor_to_nurse',
        content: nurseNoteContent,
      });

      showToast('Nurse note added successfully', 'success');
      setNurseNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding nurse note:', error);
      showToast('Failed to add nurse note', 'error');
    }
  };

  const handleAddProceduralNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEncounter || !proceduralNoteContent) return;

    try {
      await apiClient.post('/clinical-notes', {
        encounter_id: selectedEncounter.id,
        patient_id: selectedEncounter.patient_id,
        note_type: 'doctor_procedural',
        content: proceduralNoteContent,
      });

      showToast('Procedural note added successfully', 'success');
      setProceduralNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding procedural note:', error);
      showToast('Failed to add procedural note', 'error');
    }
  };

  const handleSignNote = async (noteId: number) => {
    if (!confirm('Are you sure you want to sign this note? It will be locked and cannot be modified.')) {
      return;
    }

    try {
      await apiClient.post(`/api/clinical-notes/${noteId}/sign`);
      showToast('Note signed and chart updated', 'success');
      if (selectedEncounter) {
        loadEncounterNotes(selectedEncounter.id);
      }
    } catch (error) {
      console.error('Error signing note:', error);
      showToast('Failed to sign note', 'error');
    }
  };

  // Add orders to pending arrays
  const handleAddLabOrder = () => {
    if (!currentLabOrder.test_name) {
      showToast('Please enter a test name', 'warning');
      return;
    }
    setPendingLabOrders([...pendingLabOrders, currentLabOrder]);
    setCurrentLabOrder({test_name: '', priority: 'routine'});
  };

  const handleAddImagingOrder = () => {
    if (!currentImagingOrder.imaging_type) {
      showToast('Please enter imaging type', 'warning');
      return;
    }
    setPendingImagingOrders([...pendingImagingOrders, currentImagingOrder]);
    setCurrentImagingOrder({imaging_type: '', body_part: '', priority: 'routine'});
  };

  const handleAddPharmacyOrder = () => {
    if (!currentPharmacyOrder.medication_name) {
      showToast('Please enter medication name', 'warning');
      return;
    }
    setPendingPharmacyOrders([...pendingPharmacyOrders, currentPharmacyOrder]);
    setCurrentPharmacyOrder({medication_name: '', dosage: '', frequency: '', route: '', quantity: '', priority: 'routine'});
  };

  // Remove orders from pending arrays
  const handleRemoveLabOrder = (index: number) => {
    setPendingLabOrders(pendingLabOrders.filter((_, i) => i !== index));
  };

  const handleRemoveImagingOrder = (index: number) => {
    setPendingImagingOrders(pendingImagingOrders.filter((_, i) => i !== index));
  };

  const handleRemovePharmacyOrder = (index: number) => {
    setPendingPharmacyOrders(pendingPharmacyOrders.filter((_, i) => i !== index));
  };

  // Submit all pending orders
  const handleSubmitAllOrders = async () => {
    if (!selectedEncounter) return;

    const totalOrders = pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length;

    if (totalOrders === 0) {
      showToast('Please add at least one order before submitting', 'warning');
      return;
    }

    if (!confirm(`Submit ${totalOrders} order(s)?`)) {
      return;
    }

    try {
      const baseData = {
        patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id,
      };

      // Submit all lab orders
      for (const order of pendingLabOrders) {
        await apiClient.post('/orders/lab', { ...baseData, ...order });
      }

      // Submit all imaging orders
      for (const order of pendingImagingOrders) {
        await apiClient.post('/orders/imaging', { ...baseData, ...order });
      }

      // Submit all pharmacy orders
      for (const order of pendingPharmacyOrders) {
        await apiClient.post('/orders/pharmacy', { ...baseData, ...order });
      }

      showToast(`Successfully submitted ${totalOrders} order(s)!`, 'success');

      // Clear all pending orders
      setPendingLabOrders([]);
      setPendingImagingOrders([]);
      setPendingPharmacyOrders([]);
    } catch (error) {
      console.error('Error submitting orders:', error);
      showToast('Failed to submit some orders. Please try again.', 'error');
    }
  };

  const handleCompleteEncounter = async () => {
    if (!selectedEncounter) return;

    if (!confirm('Are you sure you want to complete this encounter? Patient will be sent back to the nurse.')) {
      return;
    }

    try {
      await apiClient.post('/workflow/doctor/complete-encounter', {
        encounter_id: selectedEncounter.id,
      });
      showToast('Encounter completed. Patient sent back to nurse.', 'success');
      setSelectedEncounter(null);
      loadRoomEncounters();
    } catch (error) {
      console.error('Error completing encounter:', error);
      showToast('Failed to complete encounter', 'error');
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Doctor Dashboard
                </h1>
                <p className="text-blue-100 text-sm">
                  Dr. {user?.first_name} {user?.last_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <NotificationCenter />
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
        </div>
      </header>

      <main className="max-w-full mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Patients List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <h2 className="text-sm font-semibold text-white">
                      Active Patients
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-blue-500 text-white text-xs font-bold rounded-full">
                    {roomEncounters.length}
                  </span>
                </div>
              </div>

              {/* Column Headers */}
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <div className="col-span-3">Room</div>
                <div className="col-span-5">Patient</div>
                <div className="col-span-4 text-right">ID</div>
              </div>

              {/* Patient List */}
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {roomEncounters.map((encounter) => (
                  <div
                    key={encounter.id}
                    onClick={() => setSelectedEncounter(encounter)}
                    className={`px-4 py-3 grid grid-cols-12 gap-2 items-center cursor-pointer transition-all duration-150 hover:bg-blue-50 group ${
                      selectedEncounter?.id === encounter.id
                        ? 'bg-blue-100 border-l-4 border-blue-600'
                        : 'border-l-4 border-transparent hover:border-l-4 hover:border-blue-300'
                    }`}
                  >
                    {/* Room Number */}
                    <div className="col-span-3">
                      <span className="inline-flex items-center px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">
                        Rm {encounter.room_number}
                      </span>
                    </div>

                    {/* Patient Name */}
                    <div className="col-span-5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuickViewPatientId(encounter.patient_id);
                        }}
                        className={`font-semibold text-sm text-left truncate transition-colors ${
                          selectedEncounter?.id === encounter.id
                            ? 'text-blue-800'
                            : 'text-slate-800 group-hover:text-blue-600'
                        }`}
                        title={encounter.patient_name}
                      >
                        {encounter.patient_name}
                      </button>
                      {encounter.nurse_name && (
                        <div className="text-xs text-slate-500 truncate">
                          Nurse: {encounter.nurse_name}
                        </div>
                      )}
                    </div>

                    {/* Patient Number */}
                    <div className="col-span-4 text-right">
                      <span className="text-xs text-slate-500 font-mono">
                        {encounter.patient_number}
                      </span>
                    </div>
                  </div>
                ))}

                {roomEncounters.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <p className="text-sm font-medium">No active patients</p>
                    <p className="text-xs mt-1">Patients will appear when nurses alert you</p>
                  </div>
                )}
              </div>
            </div>

            {/* Results Alerts Section */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <h2 className="text-sm font-semibold text-white">
                      Results Alerts
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-white text-amber-600 text-xs font-bold rounded-full">
                    {labAlerts.length + imagingAlerts.length + pharmacyAlerts.length}
                  </span>
                </div>
              </div>

              {/* Alert Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setAlertsTab('lab')}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                    alertsTab === 'lab'
                      ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Lab ({labAlerts.length})
                </button>
                <button
                  onClick={() => setAlertsTab('imaging')}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                    alertsTab === 'imaging'
                      ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Imaging ({imagingAlerts.length})
                </button>
                <button
                  onClick={() => setAlertsTab('pharmacy')}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                    alertsTab === 'pharmacy'
                      ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Rx ({pharmacyAlerts.length})
                </button>
              </div>

              {/* Alert Content */}
              <div className="max-h-[250px] overflow-y-auto">
                {alertsTab === 'lab' && (
                  <>
                    {labAlerts.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No new lab results
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {labAlerts.map((alert) => (
                          <div key={alert.id} className="px-4 py-3 hover:bg-amber-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">{alert.test_name}</div>
                                <div className="text-xs text-gray-500">{alert.patient_name}</div>
                                {alert.room_number && (
                                  <span className="text-xs text-blue-600">Room {alert.room_number}</span>
                                )}
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                alert.priority === 'stat' ? 'bg-red-100 text-red-700' :
                                alert.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {alert.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {alertsTab === 'imaging' && (
                  <>
                    {imagingAlerts.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No new imaging results
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {imagingAlerts.map((alert) => (
                          <div key={alert.id} className="px-4 py-3 hover:bg-amber-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">{alert.imaging_type} - {alert.body_part}</div>
                                <div className="text-xs text-gray-500">{alert.patient_name}</div>
                                {alert.room_number && (
                                  <span className="text-xs text-blue-600">Room {alert.room_number}</span>
                                )}
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                alert.priority === 'stat' ? 'bg-red-100 text-red-700' :
                                alert.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {alert.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {alertsTab === 'pharmacy' && (
                  <>
                    {pharmacyAlerts.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No pharmacy updates
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {pharmacyAlerts.map((alert) => (
                          <div key={alert.id} className="px-4 py-3 hover:bg-amber-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">{alert.medication_name}</div>
                                <div className="text-xs text-gray-500">{alert.patient_name}</div>
                                {alert.room_number && (
                                  <span className="text-xs text-blue-600">Room {alert.room_number}</span>
                                )}
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                alert.status === 'dispensed' ? 'bg-green-100 text-green-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {alert.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Quick Vitals Section */}
            {selectedEncounter && selectedEncounter.vital_signs && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
                <div className="bg-gradient-to-r from-red-500 to-pink-500 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">Vital Signs</h2>
                    </div>
                    <button
                      onClick={() => setShowVitalsHistory(true)}
                      className="px-2 py-1 bg-white bg-opacity-20 text-white text-xs font-bold rounded hover:bg-opacity-30 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      History
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-red-50 rounded-lg p-2">
                      <div className="text-xs text-red-600 font-medium">BP</div>
                      <div className="font-bold text-red-800">
                        {selectedEncounter.vital_signs.blood_pressure_systolic}/{selectedEncounter.vital_signs.blood_pressure_diastolic}
                      </div>
                    </div>
                    <div className="bg-pink-50 rounded-lg p-2">
                      <div className="text-xs text-pink-600 font-medium">HR</div>
                      <div className="font-bold text-pink-800">
                        {selectedEncounter.vital_signs.heart_rate} <span className="text-xs font-normal">bpm</span>
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2">
                      <div className="text-xs text-orange-600 font-medium">Temp</div>
                      <div className="font-bold text-orange-800">
                        {selectedEncounter.vital_signs.temperature}°{selectedEncounter.vital_signs.temperature_unit || 'F'}
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <div className="text-xs text-blue-600 font-medium">SpO2</div>
                      <div className="font-bold text-blue-800">
                        {selectedEncounter.vital_signs.oxygen_saturation}%
                      </div>
                    </div>
                    {selectedEncounter.vital_signs.respiratory_rate && (
                      <div className="bg-cyan-50 rounded-lg p-2">
                        <div className="text-xs text-cyan-600 font-medium">RR</div>
                        <div className="font-bold text-cyan-800">
                          {selectedEncounter.vital_signs.respiratory_rate} <span className="text-xs font-normal">/min</span>
                        </div>
                      </div>
                    )}
                    {selectedEncounter.vital_signs.weight && (
                      <div className="bg-green-50 rounded-lg p-2">
                        <div className="text-xs text-green-600 font-medium">Wt</div>
                        <div className="font-bold text-green-800">
                          {selectedEncounter.vital_signs.weight} <span className="text-xs font-normal">{selectedEncounter.vital_signs.weight_unit || 'lbs'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Patient Notes Section */}
            {selectedEncounter && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">Patient Notes</h2>
                    </div>
                    {notes.length > 0 && (
                      <span className="px-2 py-0.5 bg-white bg-opacity-20 text-white text-xs font-bold rounded-full">
                        {notes.length}
                      </span>
                    )}
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notes.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {notes.slice(0, 10).map((note) => (
                        <div key={note.id} className="px-4 py-3 hover:bg-indigo-50 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                  note.note_type === 'doctor_general' ? 'bg-blue-100 text-blue-700' :
                                  note.note_type === 'nurse_general' ? 'bg-emerald-100 text-emerald-700' :
                                  note.note_type === 'doctor_to_nurse' ? 'bg-indigo-100 text-indigo-700' :
                                  note.note_type === 'doctor_procedural' ? 'bg-slate-100 text-slate-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {note.note_type === 'doctor_general' ? 'Doctor' :
                                   note.note_type === 'nurse_general' ? 'Nurse' :
                                   note.note_type === 'doctor_to_nurse' ? 'Instructions' :
                                   note.note_type === 'doctor_procedural' ? 'Procedural' :
                                   note.note_type}
                                </span>
                                {note.is_signed && (
                                  <span className="text-xs text-green-600 flex items-center gap-0.5">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    Signed
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-800 line-clamp-2">{note.content}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {note.created_by_name} • {new Date(note.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-gray-400">
                      <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">No notes yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Patient Details & Actions */}
          <div className="lg:col-span-2">
            {selectedEncounter ? (
              <div className="space-y-4">
                {/* Patient Info */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedEncounter.patient_name}</h2>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold">
                          Patient #: {selectedEncounter.patient_number}
                        </span>
                        <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold">
                          Encounter #: {selectedEncounter.encounter_number}
                        </span>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-semibold">
                          {selectedEncounter.room_name || `Room ${selectedEncounter.room_number}`}
                        </span>
                      </div>
                    </div>
                    <Link
                      to={`/patients/${selectedEncounter.patient_id}`}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg font-semibold flex items-center gap-2"
                    >
                      View Full Chart
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-gray-200">
                    <div className="col-span-2">
                      <div className="text-sm text-gray-600">Today's Visit</div>
                      <div className="font-semibold text-lg text-blue-800 bg-blue-50 p-3 rounded-lg border border-blue-200">{selectedEncounter.chief_complaint || 'Not yet documented'}</div>
                    </div>
                    {selectedEncounter.vital_signs ? (
                      <div className="col-span-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                        <div className="text-sm font-medium text-green-800 mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Vital Signs
                          </div>
                          <button
                            onClick={() => setShowVitalsHistory(true)}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            View History
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-white rounded-lg p-2 border border-green-100">
                            <div className="text-xs text-gray-500">Blood Pressure</div>
                            <div className="font-bold text-gray-900">
                              {selectedEncounter.vital_signs.blood_pressure_systolic}/{selectedEncounter.vital_signs.blood_pressure_diastolic}
                              <span className="text-xs font-normal text-gray-500 ml-1">mmHg</span>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-green-100">
                            <div className="text-xs text-gray-500">Heart Rate</div>
                            <div className="font-bold text-gray-900">
                              {selectedEncounter.vital_signs.heart_rate}
                              <span className="text-xs font-normal text-gray-500 ml-1">bpm</span>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-green-100">
                            <div className="text-xs text-gray-500">Temperature</div>
                            <div className="font-bold text-gray-900">
                              {selectedEncounter.vital_signs.temperature}°{selectedEncounter.vital_signs.temperature_unit || 'F'}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-green-100">
                            <div className="text-xs text-gray-500">O2 Saturation</div>
                            <div className="font-bold text-gray-900">
                              {selectedEncounter.vital_signs.oxygen_saturation}
                              <span className="text-xs font-normal text-gray-500 ml-1">%</span>
                            </div>
                          </div>
                          {selectedEncounter.vital_signs.respiratory_rate && (
                            <div className="bg-white rounded-lg p-2 border border-green-100">
                              <div className="text-xs text-gray-500">Respiratory Rate</div>
                              <div className="font-bold text-gray-900">
                                {selectedEncounter.vital_signs.respiratory_rate}
                                <span className="text-xs font-normal text-gray-500 ml-1">/min</span>
                              </div>
                            </div>
                          )}
                          {selectedEncounter.vital_signs.weight && (
                            <div className="bg-white rounded-lg p-2 border border-green-100">
                              <div className="text-xs text-gray-500">Weight</div>
                              <div className="font-bold text-gray-900">
                                {selectedEncounter.vital_signs.weight}
                                <span className="text-xs font-normal text-gray-500 ml-1">{selectedEncounter.vital_signs.weight_unit || 'lbs'}</span>
                              </div>
                            </div>
                          )}
                          {selectedEncounter.vital_signs.height && (
                            <div className="bg-white rounded-lg p-2 border border-green-100">
                              <div className="text-xs text-gray-500">Height</div>
                              <div className="font-bold text-gray-900">
                                {selectedEncounter.vital_signs.height}
                                <span className="text-xs font-normal text-gray-500 ml-1">{selectedEncounter.vital_signs.height_unit || 'in'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-2 bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                        <div className="text-sm text-yellow-800 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>Vital signs not yet recorded by nurse</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Encounter Actions */}
                <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl shadow-2xl p-6 border border-blue-400">
                  <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Encounter Actions
                  </h3>
                  <div className="flex justify-center">
                    <button
                      onClick={handleCompleteEncounter}
                      className="group relative bg-white hover:bg-gradient-to-br hover:from-emerald-500 hover:to-green-500 text-gray-900 hover:text-white py-4 px-5 rounded-xl font-bold transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105 transform flex flex-col items-center gap-2"
                    >
                      <div className="bg-gradient-to-br from-emerald-500 to-green-500 group-hover:bg-white p-3 rounded-full transition-colors">
                        <svg className="w-7 h-7 text-white group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-lg">Alert Nurse</div>
                        <span className="text-xs opacity-70">Notify for Follow-up</span>
                      </div>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-400/0 via-white/10 to-emerald-400/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </button>
                  </div>
                </div>

                {/* Clinical Notes */}
                <div className="card">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Clinical Notes</h2>
                  </div>

                  {/* Modern Tabs */}
                  <div className="border-b border-gray-200 mb-6">
                    <nav className="flex gap-2 overflow-x-auto" aria-label="Clinical Notes Tabs">
                      <button
                        onClick={() => setClinicalNotesTab('soap')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          clinicalNotesTab === 'soap'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          SOAP
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('doctor')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'doctor'
                            ? 'border-blue-600 text-blue-600 bg-blue-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Doctor's Notes
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('nurse')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'nurse'
                            ? 'border-blue-600 text-blue-600 bg-blue-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Nurse Notes
                          {notes.filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general').length > 0 && (
                            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                              {notes.filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general').length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('instructions')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'instructions'
                            ? 'border-blue-600 text-blue-600 bg-blue-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                          Nurse Instructions
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('procedural')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'procedural'
                            ? 'border-blue-600 text-blue-600 bg-blue-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                          Procedural Notes
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('past')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'past'
                            ? 'border-blue-600 text-blue-600 bg-blue-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Past Notes
                          {notes.length > 0 && (
                            <span className="bg-gray-600 text-white text-xs px-2 py-0.5 rounded-full">
                              {notes.length}
                            </span>
                          )}
                        </div>
                      </button>
                    </nav>
                  </div>

                  {/* Tab Content */}
                  <div className="min-h-[400px]">
                    {/* SOAP Tab */}
                    {clinicalNotesTab === 'soap' && selectedEncounter && (
                      <div className="-mx-6 -mb-6">
                        <HPAccordion
                          encounterId={selectedEncounter.id}
                          patientId={selectedEncounter.patient_id}
                          userRole="doctor"
                          vitalSigns={selectedEncounter.vital_signs}
                        />
                      </div>
                    )}

                    {/* Doctor's Notes Tab */}
                    {clinicalNotesTab === 'doctor' && (
                      <div className="space-y-6">
                        <form onSubmit={handleAddDoctorNote} className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border-2 border-blue-200">
                          <SmartTextArea
                            value={noteContent}
                            onChange={setNoteContent}
                            placeholder="Enter clinical notes... Start typing for medical term suggestions."
                            rows={6}
                            sectionId="assessment"
                            showVoiceDictation={true}
                            label="Add New Doctor's Note"
                            required
                          />
                          <button type="submit" className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-md flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Note
                          </button>
                        </form>

                        {notes.filter(n => n.created_by_role === 'doctor' && n.note_type === 'doctor_general').length > 0 ? (
                          <div>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Your Notes</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.created_by_role === 'doctor' && n.note_type === 'doctor_general')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className={`p-4 rounded-xl border-2 ${
                                      note.is_signed
                                        ? 'bg-emerald-50 border-emerald-300'
                                        : 'bg-white border-gray-200 hover:border-blue-300'
                                    } transition-all shadow-sm hover:shadow-md`}
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-gray-600 font-medium">
                                        {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <div className="flex gap-2">
                                        {!note.is_signed && (
                                          <button
                                            onClick={() => handleSignNote(note.id)}
                                            className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-full hover:bg-emerald-700 font-semibold transition-colors"
                                          >
                                            Sign Note
                                          </button>
                                        )}
                                        {note.is_signed && (
                                          <span className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            SIGNED
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-lg font-medium">No doctor's notes yet</p>
                            <p className="text-sm mt-1">Add your first clinical note above</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nurse Notes Tab */}
                    {clinicalNotesTab === 'nurse' && (
                      <div className="space-y-4">
                        {notes.filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general').length > 0 ? (
                          <>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Nurse Notes</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-4 rounded-xl bg-blue-50 border-2 border-blue-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-blue-700 font-semibold">
                                        {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-medium">
                                        NURSE NOTE
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-12 text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="text-lg font-medium">No nurse notes yet</p>
                            <p className="text-sm mt-1">Nurses will add notes during patient care</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nurse Instructions Tab */}
                    {clinicalNotesTab === 'instructions' && (
                      <div className="space-y-6">
                        <form onSubmit={handleAddNurseNote} className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-xl border-2 border-indigo-200">
                          <SmartTextArea
                            value={nurseNoteContent}
                            onChange={setNurseNoteContent}
                            placeholder="Enter instructions, orders, or tasks for the nurse..."
                            rows={6}
                            sectionId="plan"
                            showVoiceDictation={true}
                            label="Add Instructions for Nurse"
                            required
                          />
                          <button type="submit" className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold shadow-md flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Send Instructions
                          </button>
                        </form>

                        {notes.filter(n => n.note_type === 'doctor_to_nurse').length > 0 && (
                          <div>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Sent Instructions</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.note_type === 'doctor_to_nurse')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-4 rounded-xl bg-indigo-50 border-2 border-indigo-200 shadow-sm"
                                  >
                                    <div className="text-xs text-indigo-700 font-medium mb-2">
                                      Sent {new Date(note.created_at).toLocaleString()}
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Procedural Notes Tab */}
                    {clinicalNotesTab === 'procedural' && (
                      <div className="space-y-6">
                        <form onSubmit={handleAddProceduralNote} className="bg-gradient-to-r from-slate-50 to-gray-50 p-6 rounded-xl border-2 border-slate-300">
                          <SmartTextArea
                            value={proceduralNoteContent}
                            onChange={setProceduralNoteContent}
                            placeholder="Document procedures performed, technique, findings, complications..."
                            rows={6}
                            sectionId="physical_exam"
                            showVoiceDictation={true}
                            label="Add Procedural Note"
                            required
                          />
                          <button type="submit" className="mt-4 px-6 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-semibold shadow-md flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Procedural Note
                          </button>
                        </form>

                        {notes.filter(n => n.note_type === 'doctor_procedural').length > 0 ? (
                          <div>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Procedural Notes</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.note_type === 'doctor_procedural')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-4 rounded-xl bg-slate-50 border-2 border-slate-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <div className="text-xs text-slate-700 font-medium mb-2">
                                      {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                            <p className="text-lg font-medium">No procedural notes yet</p>
                            <p className="text-sm mt-1">Document procedures as they are performed</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Past Notes Tab */}
                    {clinicalNotesTab === 'past' && (
                      <div className="space-y-4">
                        {notes.length > 0 ? (
                          <>
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="font-bold text-gray-900 text-lg">All Clinical Notes ({notes.length})</h3>
                            </div>
                            <div className="space-y-3">
                              {notes.map((note) => (
                                <div
                                  key={note.id}
                                  className={`p-4 rounded-xl border-2 shadow-sm hover:shadow-md transition-all ${
                                    note.note_type === 'doctor_general'
                                      ? 'bg-blue-50 border-blue-200'
                                      : note.note_type === 'nurse_general'
                                      ? 'bg-emerald-50 border-emerald-200'
                                      : note.note_type === 'doctor_to_nurse'
                                      ? 'bg-indigo-50 border-indigo-200'
                                      : note.note_type === 'doctor_procedural'
                                      ? 'bg-slate-50 border-slate-200'
                                      : 'bg-gray-50 border-gray-200'
                                  }`}
                                >
                                  <div className="flex justify-between items-start mb-2">
                                    <div>
                                      <div className="text-xs font-semibold text-gray-700">
                                        {note.created_by_name} ({note.created_by_role})
                                      </div>
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        {new Date(note.created_at).toLocaleString()}
                                      </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                        note.note_type === 'doctor_general'
                                          ? 'bg-blue-600 text-white'
                                          : note.note_type === 'nurse_general'
                                          ? 'bg-emerald-600 text-white'
                                          : note.note_type === 'doctor_to_nurse'
                                          ? 'bg-indigo-600 text-white'
                                          : note.note_type === 'doctor_procedural'
                                          ? 'bg-slate-600 text-white'
                                          : 'bg-gray-600 text-white'
                                      }`}>
                                        {note.note_type.replace(/_/g, ' ').toUpperCase()}
                                      </span>
                                      {note.is_signed && (
                                        <span className="text-xs bg-emerald-600 text-white px-2 py-1 rounded-full font-medium">
                                          SIGNED
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-12 text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-lg font-medium">No notes yet</p>
                            <p className="text-sm mt-1">Clinical notes will appear here as they are added</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Orders - New Multi-Order UI */}
                <div className="card">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Place Orders</h2>
                    {(pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length) > 0 && (
                      <span className="px-4 py-2 bg-blue-100 text-blue-800 font-bold rounded-lg">
                        {pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length} Pending
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                    {/* Lab Orders */}
                    <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50">
                      <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Lab Tests
                        {pendingLabOrders.length > 0 && (
                          <span className="ml-auto px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs">
                            {pendingLabOrders.length}
                          </span>
                        )}
                      </h3>

                      <div className="space-y-3">
                        <AutocompleteInput
                          value={currentLabOrder.test_name}
                          onChange={(value) => setCurrentLabOrder({...currentLabOrder, test_name: value})}
                          sectionId="lab_tests"
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="CBC, CMP, Lipid Panel..."
                        />
                        <select
                          value={currentLabOrder.priority}
                          onChange={(e) => setCurrentLabOrder({...currentLabOrder, priority: e.target.value})}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT</option>
                        </select>
                        <button
                          onClick={handleAddLabOrder}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Lab Order
                        </button>

                        {/* Pending Lab Orders */}
                        {pendingLabOrders.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {pendingLabOrders.map((order, index) => (
                              <div key={index} className="bg-white p-3 rounded-lg border border-blue-200 flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{order.test_name}</div>
                                  <div className="text-xs text-blue-600 font-medium mt-1">{order.priority.toUpperCase()}</div>
                                </div>
                                <button
                                  onClick={() => handleRemoveLabOrder(index)}
                                  className="text-red-600 hover:text-red-800 ml-2"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Imaging Orders */}
                    <div className="border-2 border-slate-200 rounded-xl p-4 bg-slate-50">
                      <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        Imaging
                        {pendingImagingOrders.length > 0 && (
                          <span className="ml-auto px-2 py-0.5 bg-slate-600 text-white rounded-full text-xs">
                            {pendingImagingOrders.length}
                          </span>
                        )}
                      </h3>

                      <div className="space-y-3">
                        <AutocompleteInput
                          value={currentImagingOrder.imaging_type}
                          onChange={(value) => setCurrentImagingOrder({...currentImagingOrder, imaging_type: value})}
                          sectionId="imaging_types"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 bg-white"
                          placeholder="X-Ray, CT, MRI..."
                        />
                        <AutocompleteInput
                          value={currentImagingOrder.body_part}
                          onChange={(value) => setCurrentImagingOrder({...currentImagingOrder, body_part: value})}
                          sectionId="imaging_body_parts"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 bg-white"
                          placeholder="Body part (optional)"
                        />
                        <select
                          value={currentImagingOrder.priority}
                          onChange={(e) => setCurrentImagingOrder({...currentImagingOrder, priority: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 bg-white"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT</option>
                        </select>
                        <button
                          onClick={handleAddImagingOrder}
                          className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-semibold flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Imaging Order
                        </button>

                        {/* Pending Imaging Orders */}
                        {pendingImagingOrders.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {pendingImagingOrders.map((order, index) => (
                              <div key={index} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{order.imaging_type}</div>
                                  {order.body_part && <div className="text-sm text-gray-600">{order.body_part}</div>}
                                  <div className="text-xs text-slate-600 font-medium mt-1">{order.priority.toUpperCase()}</div>
                                </div>
                                <button
                                  onClick={() => handleRemoveImagingOrder(index)}
                                  className="text-red-600 hover:text-red-800 ml-2"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pharmacy Orders */}
                    <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50">
                      <h3 className="font-bold text-emerald-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Pharmacy
                        {pendingPharmacyOrders.length > 0 && (
                          <span className="ml-auto px-2 py-0.5 bg-emerald-600 text-white rounded-full text-xs">
                            {pendingPharmacyOrders.length}
                          </span>
                        )}
                      </h3>

                      <div className="space-y-3">
                        <AutocompleteInput
                          value={currentPharmacyOrder.medication_name}
                          onChange={(value) => setCurrentPharmacyOrder({...currentPharmacyOrder, medication_name: value})}
                          sectionId="pharmacy_medications"
                          className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                          placeholder="Medication name"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={currentPharmacyOrder.dosage}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, dosage: e.target.value})}
                            className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                            placeholder="Dosage"
                          />
                          <AutocompleteInput
                            value={currentPharmacyOrder.frequency}
                            onChange={(value) => setCurrentPharmacyOrder({...currentPharmacyOrder, frequency: value})}
                            sectionId="pharmacy_frequencies"
                            className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                            placeholder="Frequency"
                          />
                          <AutocompleteInput
                            value={currentPharmacyOrder.route}
                            onChange={(value) => setCurrentPharmacyOrder({...currentPharmacyOrder, route: value})}
                            sectionId="pharmacy_routes"
                            className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                            placeholder="Route"
                          />
                          <input
                            type="text"
                            value={currentPharmacyOrder.quantity}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, quantity: e.target.value})}
                            className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                            placeholder="Quantity"
                          />
                        </div>
                        <select
                          value={currentPharmacyOrder.priority}
                          onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, priority: e.target.value})}
                          className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT</option>
                        </select>
                        <button
                          onClick={handleAddPharmacyOrder}
                          className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Pharmacy Order
                        </button>

                        {/* Pending Pharmacy Orders */}
                        {pendingPharmacyOrders.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {pendingPharmacyOrders.map((order, index) => (
                              <div key={index} className="bg-white p-3 rounded-lg border border-emerald-200 flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{order.medication_name}</div>
                                  <div className="text-sm text-gray-600">
                                    {order.dosage} {order.frequency && `• ${order.frequency}`}
                                  </div>
                                  {order.route && <div className="text-sm text-gray-600">{order.route} • {order.quantity}</div>}
                                  <div className="text-xs text-emerald-600 font-medium mt-1">{order.priority.toUpperCase()}</div>
                                </div>
                                <button
                                  onClick={() => handleRemovePharmacyOrder(index)}
                                  className="text-red-600 hover:text-red-800 ml-2"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Submit All Orders Button */}
                  {(pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length) > 0 && (
                    <div className="mt-6 pt-6 border-t-2 border-gray-200">
                      <button
                        onClick={handleSubmitAllOrders}
                        className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl font-bold text-lg flex items-center justify-center gap-3"
                      >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Submit All {pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length} Order(s)
                      </button>
                    </div>
                  )}
                </div>

                {/* Lab & Test Results Section */}
                <div className="card">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Lab & Test Results
                    </h2>
                    <button
                      onClick={() => selectedEncounter && loadEncounterOrders(selectedEncounter.id)}
                      className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="border-b border-gray-200 mb-6">
                    <nav className="flex gap-2" aria-label="Results Tabs">
                      <button
                        onClick={() => setResultsTab('lab')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          resultsTab === 'lab'
                            ? 'border-purple-600 text-purple-600 bg-purple-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          Lab Results
                          {encounterLabOrders.length > 0 && (
                            <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
                              {encounterLabOrders.length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setResultsTab('imaging')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          resultsTab === 'imaging'
                            ? 'border-purple-600 text-purple-600 bg-purple-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          Imaging Results
                          {encounterImagingOrders.length > 0 && (
                            <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
                              {encounterImagingOrders.length}
                            </span>
                          )}
                        </div>
                      </button>
                    </nav>
                  </div>

                  {/* Lab Results Tab */}
                  {resultsTab === 'lab' && (
                    <div>
                      {encounterLabOrders.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          <p className="text-lg font-medium">No lab orders for this encounter</p>
                          <p className="text-sm mt-1">Lab orders and results will appear here</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {encounterLabOrders.map((order) => (
                            <div
                              key={order.id}
                              className={`p-4 rounded-xl border-2 ${
                                order.status === 'completed'
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : order.status === 'in_progress'
                                  ? 'border-amber-200 bg-amber-50'
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <h4 className="font-bold text-gray-900 text-lg">{order.test_name}</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      order.status === 'completed'
                                        ? 'bg-emerald-200 text-emerald-800'
                                        : order.status === 'in_progress'
                                        ? 'bg-amber-200 text-amber-800'
                                        : 'bg-gray-200 text-gray-800'
                                    }`}>
                                      {order.status === 'completed' ? 'RESULTED' : order.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      order.priority === 'stat'
                                        ? 'bg-red-100 text-red-700'
                                        : order.priority === 'urgent'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {order.priority.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-500 mt-1">
                                    Ordered: {new Date(order.ordered_at).toLocaleString()}
                                  </div>
                                  {order.status === 'completed' && order.results && (
                                    <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-300">
                                      <div className="text-sm font-semibold text-emerald-800 mb-1">Results:</div>
                                      <div className="text-gray-900 whitespace-pre-wrap">{order.results}</div>
                                      {order.completed_at && (
                                        <div className="text-xs text-gray-500 mt-2">
                                          Resulted: {new Date(order.completed_at).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Imaging Results Tab */}
                  {resultsTab === 'imaging' && (
                    <div>
                      {encounterImagingOrders.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          <p className="text-lg font-medium">No imaging orders for this encounter</p>
                          <p className="text-sm mt-1">Imaging orders and results will appear here</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {encounterImagingOrders.map((order) => (
                            <div
                              key={order.id}
                              className={`p-4 rounded-xl border-2 ${
                                order.status === 'completed'
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : order.status === 'in_progress'
                                  ? 'border-amber-200 bg-amber-50'
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <h4 className="font-bold text-gray-900 text-lg">{order.imaging_type}</h4>
                                    {order.body_part && (
                                      <span className="text-gray-600">- {order.body_part}</span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      order.status === 'completed'
                                        ? 'bg-emerald-200 text-emerald-800'
                                        : order.status === 'in_progress'
                                        ? 'bg-amber-200 text-amber-800'
                                        : 'bg-gray-200 text-gray-800'
                                    }`}>
                                      {order.status === 'completed' ? 'RESULTED' : order.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      order.priority === 'stat'
                                        ? 'bg-red-100 text-red-700'
                                        : order.priority === 'urgent'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {order.priority.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-500 mt-1">
                                    Ordered: {new Date(order.ordered_at).toLocaleString()}
                                  </div>
                                  {order.status === 'completed' && order.results && (
                                    <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-300">
                                      <div className="text-sm font-semibold text-emerald-800 mb-1">Results/Findings:</div>
                                      <div className="text-gray-900 whitespace-pre-wrap">{order.results}</div>
                                      {order.completed_at && (
                                        <div className="text-xs text-gray-500 mt-2">
                                          Resulted: {new Date(order.completed_at).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12">
                <div className="text-center text-gray-400">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-blue-200 rounded-full blur-3xl opacity-20"></div>
                    <svg className="w-32 h-32 mx-auto relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-2xl font-semibold text-gray-600 mb-2">Select a patient to begin</p>
                  <p className="text-gray-400">Choose a patient from the active rooms to view their details and medical records</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Patient Quick View Side Panel */}
      {quickViewPatientId && (
        <PatientQuickView
          patientId={quickViewPatientId}
          onClose={() => setQuickViewPatientId(null)}
          showHealthStatus={true}
        />
      )}

      {/* Vital Signs History Modal */}
      {showVitalsHistory && selectedEncounter && (
        <VitalSignsHistory
          patientId={selectedEncounter.patient_id}
          onClose={() => setShowVitalsHistory(false)}
        />
      )}
    </div>
  );
};

export default DoctorDashboard;
