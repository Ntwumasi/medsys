import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import HPAccordion from '../components/HPAccordion';

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
  vital_signs?: any;
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

const DoctorDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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

  // H&P Form state
  const [showHPForm, setShowHPForm] = useState(false);
  const [existingHP, setExistingHP] = useState<ClinicalNote | null>(null);

  useEffect(() => {
    loadRoomEncounters();
    const interval = setInterval(loadRoomEncounters, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedEncounter) {
      loadEncounterNotes(selectedEncounter.id);
    }
  }, [selectedEncounter]);

  const loadRoomEncounters = async () => {
    try {
      const res = await apiClient.get('/workflow/doctor/rooms');
      setRoomEncounters(res.data.encounters || []);
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

      // Check if H&P note exists
      const hpNote = allNotes.find((note: ClinicalNote) => note.note_type === 'doctor_hp');
      setExistingHP(hpNote || null);
    } catch (error) {
      console.error('Error loading notes:', error);
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

      alert('Note added successfully');
      setNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add note');
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

      alert('Nurse note added successfully');
      setNurseNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding nurse note:', error);
      alert('Failed to add nurse note');
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

      alert('Procedural note added successfully');
      setProceduralNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding procedural note:', error);
      alert('Failed to add procedural note');
    }
  };

  const handleSignNote = async (noteId: number) => {
    if (!confirm('Are you sure you want to sign this note? It will be locked and cannot be modified.')) {
      return;
    }

    try {
      await apiClient.post(`/api/clinical-notes/${noteId}/sign`);
      alert('Note signed and chart updated');
      if (selectedEncounter) {
        loadEncounterNotes(selectedEncounter.id);
      }
    } catch (error) {
      console.error('Error signing note:', error);
      alert('Failed to sign note');
    }
  };

  // Add orders to pending arrays
  const handleAddLabOrder = () => {
    if (!currentLabOrder.test_name) {
      alert('Please enter a test name');
      return;
    }
    setPendingLabOrders([...pendingLabOrders, currentLabOrder]);
    setCurrentLabOrder({test_name: '', priority: 'routine'});
  };

  const handleAddImagingOrder = () => {
    if (!currentImagingOrder.imaging_type) {
      alert('Please enter imaging type');
      return;
    }
    setPendingImagingOrders([...pendingImagingOrders, currentImagingOrder]);
    setCurrentImagingOrder({imaging_type: '', body_part: '', priority: 'routine'});
  };

  const handleAddPharmacyOrder = () => {
    if (!currentPharmacyOrder.medication_name) {
      alert('Please enter medication name');
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
      alert('Please add at least one order before submitting');
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

      alert(`Successfully submitted ${totalOrders} order(s)!`);

      // Clear all pending orders
      setPendingLabOrders([]);
      setPendingImagingOrders([]);
      setPendingPharmacyOrders([]);
    } catch (error) {
      console.error('Error submitting orders:', error);
      alert('Failed to submit some orders. Please try again.');
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
      alert('Encounter completed. Patient sent back to nurse.');
      setSelectedEncounter(null);
      loadRoomEncounters();
    } catch (error) {
      console.error('Error completing encounter:', error);
      alert('Failed to complete encounter');
    }
  };

  const handleReleaseRoom = async () => {
    if (!selectedEncounter) return;

    if (!confirm('Are you sure you want to release the room? This will mark the encounter as completed.')) {
      return;
    }

    try {
      await apiClient.post('/workflow/release-room', {
        encounter_id: selectedEncounter.id,
      });
      alert('Room released and encounter completed');
      setSelectedEncounter(null);
      loadRoomEncounters();
    } catch (error) {
      console.error('Error releasing room:', error);
      alert('Failed to release room');
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Room View */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Active Patients <span className="text-blue-600">({roomEncounters.length})</span>
                </h2>
              </div>
              <div className="space-y-3">
                {roomEncounters.map((encounter) => (
                  <div
                    key={encounter.id}
                    onClick={() => setSelectedEncounter(encounter)}
                    className={`p-4 border-l-4 border-blue-400 rounded-xl cursor-pointer transition-all hover:shadow-md bg-gradient-to-r from-blue-50 to-indigo-50 ${
                      selectedEncounter?.id === encounter.id
                        ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]'
                        : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="inline-block px-3 py-1 bg-blue-600 text-white text-sm font-bold rounded-lg mb-2">
                          Room {encounter.room_number}
                        </div>
                        <div className="font-bold text-lg text-gray-900">{encounter.patient_name}</div>
                        <div className="text-sm text-gray-600 mt-1">{encounter.patient_number}</div>
                        {encounter.nurse_name && (
                          <div className="text-xs text-blue-600 mt-1 font-medium">
                            👩‍⚕️ Nurse: {encounter.nurse_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {roomEncounters.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <p className="font-medium">No active patients</p>
                  </div>
                )}
              </div>
            </div>
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
                          Room {selectedEncounter.room_number}
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
                      <div className="text-sm text-gray-600">Chief Complaint</div>
                      <div className="font-semibold">{selectedEncounter.chief_complaint}</div>
                    </div>
                    {selectedEncounter.vital_signs && (
                      <div className="col-span-2">
                        <div className="text-sm text-gray-600">Latest Vital Signs</div>
                        <div className="mt-1 text-sm">
                          BP: {selectedEncounter.vital_signs.blood_pressure_systolic}/
                          {selectedEncounter.vital_signs.blood_pressure_diastolic} | HR:{' '}
                          {selectedEncounter.vital_signs.heart_rate} | Temp:{' '}
                          {selectedEncounter.vital_signs.temperature}°
                          {selectedEncounter.vital_signs.temperature_unit} | O2:{' '}
                          {selectedEncounter.vital_signs.oxygen_saturation}%
                        </div>
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

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                        <input
                          type="text"
                          value={currentLabOrder.test_name}
                          onChange={(e) => setCurrentLabOrder({...currentLabOrder, test_name: e.target.value})}
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
                        <input
                          type="text"
                          value={currentImagingOrder.imaging_type}
                          onChange={(e) => setCurrentImagingOrder({...currentImagingOrder, imaging_type: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 bg-white"
                          placeholder="X-Ray, CT, MRI..."
                        />
                        <input
                          type="text"
                          value={currentImagingOrder.body_part}
                          onChange={(e) => setCurrentImagingOrder({...currentImagingOrder, body_part: e.target.value})}
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
                        <input
                          type="text"
                          value={currentPharmacyOrder.medication_name}
                          onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, medication_name: e.target.value})}
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
                          <input
                            type="text"
                            value={currentPharmacyOrder.frequency}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, frequency: e.target.value})}
                            className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                            placeholder="Frequency"
                          />
                          <input
                            type="text"
                            value={currentPharmacyOrder.route}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, route: e.target.value})}
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

                {/* Clinical Notes */}
                <div className="card">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Clinical Notes</h2>

                  {/* H&P Note Display - Special Prominence */}
                  {existingHP && (
                    <div className="mb-6 p-4 rounded-lg bg-blue-50 border-2 border-blue-300">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-blue-900 flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          History & Physical (H&P)
                        </h3>
                        <button
                          onClick={() => setShowHPForm(true)}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                          View/Edit
                        </button>
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {existingHP.created_by_name} - {new Date(existingHP.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-800 max-h-40 overflow-y-auto bg-white p-3 rounded border border-blue-200">
                        {existingHP.content.substring(0, 300)}...
                      </div>
                    </div>
                  )}

                  {/* Nurse Notes Section */}
                  {notes.filter(n => n.created_by_role === 'nurse').length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Nurse Notes
                      </h3>
                      <div className="space-y-2">
                        {notes
                          .filter(n => n.created_by_role === 'nurse')
                          .map((note) => (
                            <div
                              key={note.id}
                              className="p-3 rounded-lg bg-blue-50 border border-blue-200"
                            >
                              <div className="flex justify-between items-start mb-1">
                                <div className="text-xs text-blue-700 font-medium">
                                  {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                </div>
                                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                                  {note.note_type.replace('_', ' ').toUpperCase()}
                                </span>
                              </div>
                              <div className="text-sm text-gray-800">{note.content}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Add New Doctor Note */}
                  <form onSubmit={handleAddDoctorNote} className="mb-6">
                    <div>
                      <label className="label">Add Doctor's Note</label>
                      <textarea
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        className="input"
                        rows={4}
                        placeholder="Enter clinical notes..."
                        required
                      />
                    </div>
                    <button type="submit" className="btn-primary mt-2">
                      Add Note
                    </button>
                  </form>

                  {/* Add Nurse Instructions/Orders */}
                  <form onSubmit={handleAddNurseNote} className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <div>
                      <label className="label flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <span className="text-blue-900 font-semibold">Instructions for Nurse</span>
                      </label>
                      <textarea
                        value={nurseNoteContent}
                        onChange={(e) => setNurseNoteContent(e.target.value)}
                        className="input mt-2"
                        rows={4}
                        placeholder="Enter instructions, orders, or tasks for the nurse..."
                        required
                      />
                    </div>
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors mt-2">
                      Add Nurse Instructions
                    </button>
                  </form>

                  {/* Add Procedural Note */}
                  <form onSubmit={handleAddProceduralNote} className="mb-6 p-4 bg-slate-50 border-2 border-slate-300 rounded-lg">
                    <div>
                      <label className="label flex items-center gap-2">
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        <span className="text-slate-900 font-semibold">Procedural Note</span>
                      </label>
                      <textarea
                        value={proceduralNoteContent}
                        onChange={(e) => setProceduralNoteContent(e.target.value)}
                        className="input mt-2"
                        rows={4}
                        placeholder="Document procedures performed, technique, findings, complications..."
                        required
                      />
                    </div>
                    <button type="submit" className="bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors mt-2">
                      Add Procedural Note
                    </button>
                  </form>

                  {/* Doctor's Notes */}
                  {notes.filter(n => n.created_by_role === 'doctor' && n.note_type !== 'doctor_hp').length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-700 mb-3">Doctor's Notes</h3>
                      <div className="space-y-2">
                        {notes
                          .filter(n => n.created_by_role === 'doctor' && n.note_type !== 'doctor_hp')
                          .map((note) => (
                            <div
                              key={note.id}
                              className={`p-3 rounded-lg ${
                                note.is_signed ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-300'
                              } border`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="text-xs text-gray-600">
                                  {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                </div>
                                <div className="flex gap-2">
                                  {!note.is_signed && (
                                    <button
                                      onClick={() => handleSignNote(note.id)}
                                      className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                                    >
                                      Sign
                                    </button>
                                  )}
                                  {note.is_signed && (
                                    <span className="text-xs bg-emerald-600 text-white px-2 py-1 rounded">
                                      SIGNED
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 text-sm text-gray-800">{note.content}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Complete Encounter & Release Room */}
                <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Encounter Actions</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowHPForm(true)}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 px-4 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="text-left">
                        <div>{existingHP ? 'View/Edit H&P' : 'Fill H&P'}</div>
                        <span className="block text-xs font-normal opacity-90">
                          {existingHP ? 'View or update H&P' : 'History & Physical Examination'}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={handleCompleteEncounter}
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white py-3 px-4 rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-left">
                        <div>Complete Encounter</div>
                        <span className="block text-xs font-normal opacity-90">Send patient back to nurse</span>
                      </div>
                    </button>
                    <button
                      onClick={handleReleaseRoom}
                      className="w-full bg-gradient-to-r from-slate-600 to-gray-700 text-white py-3 px-4 rounded-lg font-semibold hover:from-slate-700 hover:to-gray-800 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                      <div className="text-left">
                        <div>Release Room</div>
                        <span className="block text-xs font-normal opacity-90">Mark encounter as completed</span>
                      </div>
                    </button>
                  </div>
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

      {/* H&P Form Modal */}
      {showHPForm && selectedEncounter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full my-8">
            {/* Header */}
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200 flex justify-between items-center rounded-t-lg">
              <h2 className="text-xl font-bold text-gray-900">History & Physical - {selectedEncounter.patient_name}</h2>
              <button
                onClick={() => setShowHPForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* H&P Accordion Content */}
            <div className="p-6">
              <HPAccordion
                encounterId={selectedEncounter.id}
                patientId={selectedEncounter.patient_id}
                userRole="doctor"
                onSave={() => loadEncounterNotes(selectedEncounter.id)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorDashboard;
