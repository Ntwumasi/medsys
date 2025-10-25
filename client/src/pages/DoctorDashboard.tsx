import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

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
      const res = await apiClient.get(`/api/clinical-notes/encounter/${encounterId}`);
      setNotes(res.data.notes || []);
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

    if (!confirm('Are you sure you want to complete this encounter and release the room?')) {
      return;
    }

    try {
      await apiClient.post('/workflow/release-room', {
        encounter_id: selectedEncounter.id,
      });
      alert('Encounter completed and room released');
      setSelectedEncounter(null);
      loadRoomEncounters();
    } catch (error) {
      console.error('Error completing encounter:', error);
      alert('Failed to complete encounter');
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
              Doctor Dashboard - Dr. {user?.first_name} {user?.last_name}
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
          {/* Room View */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Active Patients by Room ({roomEncounters.length})
              </h2>
              <div className="space-y-3">
                {roomEncounters.map((encounter) => (
                  <div
                    key={encounter.id}
                    onClick={() => setSelectedEncounter(encounter)}
                    className={`p-3 border-l-4 border-primary-400 rounded cursor-pointer hover:shadow-md transition-shadow ${
                      selectedEncounter?.id === encounter.id
                        ? 'bg-primary-50 ring-2 ring-primary-500'
                        : 'bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg">Room {encounter.room_number}</div>
                        <div className="font-semibold">{encounter.patient_name}</div>
                        <div className="text-sm text-gray-600">{encounter.patient_number}</div>
                        {encounter.nurse_name && (
                          <div className="text-xs text-gray-500">Nurse: {encounter.nurse_name}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {roomEncounters.length === 0 && (
                  <div className="text-center py-8 text-gray-500">No active patients</div>
                )}
              </div>
            </div>
          </div>

          {/* Patient Details & Actions */}
          <div className="lg:col-span-2">
            {selectedEncounter ? (
              <div className="space-y-6">
                {/* Patient Info */}
                <div className="card">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Patient Information</h2>
                    <Link
                      to={`/patients/${selectedEncounter.patient_id}`}
                      className="text-primary-600 hover:text-primary-800 text-sm"
                    >
                      View Full Chart →
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Name</div>
                      <div className="font-semibold">{selectedEncounter.patient_name}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Patient Number</div>
                      <div className="font-semibold">{selectedEncounter.patient_number}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Encounter Number</div>
                      <div className="font-semibold">{selectedEncounter.encounter_number}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Room</div>
                      <div className="font-semibold">{selectedEncounter.room_number}</div>
                    </div>
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

                  {/* Add New Note */}
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

                  {/* Existing Notes */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-700">All Notes</h3>
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className={`p-4 rounded-lg ${
                          note.is_signed ? 'bg-green-50 border-green-300' : 'bg-gray-50'
                        } border`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm text-gray-600">
                              {note.created_by_name} ({note.created_by_role}) -{' '}
                              {new Date(note.created_at).toLocaleString()}
                            </div>
                            <div className="text-sm font-semibold text-gray-700 mt-1">
                              {note.note_type.replace('_', ' ').toUpperCase()}
                            </div>
                          </div>
                          {!note.is_signed && note.created_by_role === 'doctor' && (
                            <button
                              onClick={() => handleSignNote(note.id)}
                              className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                            >
                              Sign Note
                            </button>
                          )}
                          {note.is_signed && (
                            <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                              SIGNED - {note.signed_by_name}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-sm">{note.content}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Complete Encounter */}
                <div className="card bg-gray-50">
                  <button
                    onClick={handleCompleteEncounter}
                    className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700"
                  >
                    Complete Encounter & Release Room
                  </button>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg">Select a patient from the room list to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DoctorDashboard;
