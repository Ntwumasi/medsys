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
  const [orderType, setOrderType] = useState<'lab' | 'imaging' | 'pharmacy'>('lab');

  // Lab order
  const [labTestName, setLabTestName] = useState('');
  const [labPriority, setLabPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');

  // Imaging order
  const [imagingType, setImagingType] = useState('');
  const [bodyPart, setBodyPart] = useState('');

  // Pharmacy order
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [route, setRoute] = useState('');
  const [quantity, setQuantity] = useState('');

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

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEncounter) return;

    try {
      let orderData: any = {
        patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id,
      };

      if (orderType === 'lab') {
        orderData = { ...orderData, test_name: labTestName, priority: labPriority };
        await apiClient.post('/orders/lab', orderData);
        setLabTestName('');
      } else if (orderType === 'imaging') {
        orderData = { ...orderData, imaging_type: imagingType, body_part: bodyPart, priority: labPriority };
        await apiClient.post('/orders/imaging', orderData);
        setImagingType('');
        setBodyPart('');
      } else if (orderType === 'pharmacy') {
        orderData = {
          ...orderData,
          medication_name: medicationName,
          dosage,
          frequency,
          route,
          quantity,
          priority: labPriority,
        };
        await apiClient.post('/orders/pharmacy', orderData);
        setMedicationName('');
        setDosage('');
        setFrequency('');
        setRoute('');
        setQuantity('');
      }

      alert('Order submitted successfully');
    } catch (error) {
      console.error('Error submitting order:', error);
      alert('Failed to submit order');
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
                        <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg font-semibold">
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

                {/* Orders */}
                <div className="card">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Place Orders</h2>
                  <form onSubmit={handleSubmitOrder} className="space-y-4">
                    <div>
                      <label className="label">Order Type</label>
                      <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value as any)}
                        className="input"
                      >
                        <option value="lab">Lab Test</option>
                        <option value="imaging">Imaging / X-Ray</option>
                        <option value="pharmacy">Pharmacy / Medication</option>
                      </select>
                    </div>

                    {orderType === 'lab' && (
                      <>
                        <div>
                          <label className="label">Test Name</label>
                          <input
                            type="text"
                            value={labTestName}
                            onChange={(e) => setLabTestName(e.target.value)}
                            className="input"
                            placeholder="CBC, CMP, Lipid Panel, etc."
                            required
                          />
                        </div>
                      </>
                    )}

                    {orderType === 'imaging' && (
                      <>
                        <div>
                          <label className="label">Imaging Type</label>
                          <input
                            type="text"
                            value={imagingType}
                            onChange={(e) => setImagingType(e.target.value)}
                            className="input"
                            placeholder="X-Ray, CT, MRI, Ultrasound"
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Body Part</label>
                          <input
                            type="text"
                            value={bodyPart}
                            onChange={(e) => setBodyPart(e.target.value)}
                            className="input"
                            placeholder="Chest, Abdomen, etc."
                          />
                        </div>
                      </>
                    )}

                    {orderType === 'pharmacy' && (
                      <>
                        <div>
                          <label className="label">Medication Name</label>
                          <input
                            type="text"
                            value={medicationName}
                            onChange={(e) => setMedicationName(e.target.value)}
                            className="input"
                            placeholder="Medication name"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="label">Dosage</label>
                            <input
                              type="text"
                              value={dosage}
                              onChange={(e) => setDosage(e.target.value)}
                              className="input"
                              placeholder="500mg"
                            />
                          </div>
                          <div>
                            <label className="label">Frequency</label>
                            <input
                              type="text"
                              value={frequency}
                              onChange={(e) => setFrequency(e.target.value)}
                              className="input"
                              placeholder="Twice daily"
                            />
                          </div>
                          <div>
                            <label className="label">Route</label>
                            <input
                              type="text"
                              value={route}
                              onChange={(e) => setRoute(e.target.value)}
                              className="input"
                              placeholder="Oral, IV, etc."
                            />
                          </div>
                          <div>
                            <label className="label">Quantity</label>
                            <input
                              type="text"
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              className="input"
                              placeholder="30 tablets"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="label">Priority</label>
                      <select
                        value={labPriority}
                        onChange={(e) => setLabPriority(e.target.value as any)}
                        className="input"
                      >
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="stat">STAT</option>
                      </select>
                    </div>

                    <button type="submit" className="btn-primary">
                      Submit Order
                    </button>
                  </form>
                </div>

                {/* Clinical Notes */}
                <div className="card">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Clinical Notes</h2>

                  {/* H&P Note Display - Special Prominence */}
                  {existingHP && (
                    <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          History & Physical (H&P)
                        </h3>
                        <button
                          onClick={() => setShowHPForm(true)}
                          className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                        >
                          View/Edit
                        </button>
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {existingHP.created_by_name} - {new Date(existingHP.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-800 max-h-40 overflow-y-auto bg-white p-3 rounded border border-indigo-200">
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
                  <form onSubmit={handleAddNurseNote} className="mb-6 p-4 bg-gradient-to-r from-teal-50 to-cyan-50 border-2 border-teal-300 rounded-lg">
                    <div>
                      <label className="label flex items-center gap-2">
                        <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <span className="text-teal-900 font-semibold">Instructions for Nurse</span>
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
                    <button type="submit" className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors mt-2">
                      Add Nurse Instructions
                    </button>
                  </form>

                  {/* Add Procedural Note */}
                  <form onSubmit={handleAddProceduralNote} className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-lg">
                    <div>
                      <label className="label flex items-center gap-2">
                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        <span className="text-purple-900 font-semibold">Procedural Note</span>
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
                    <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors mt-2">
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
                                note.is_signed ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300'
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
                                      className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                                    >
                                      Sign
                                    </button>
                                  )}
                                  {note.is_signed && (
                                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
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
                      className={`w-full ${existingHP ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'} text-white py-3 px-4 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2`}
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
                      className="w-full bg-gradient-to-r from-emerald-600 to-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-emerald-700 hover:to-green-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
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
