import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { format } from 'date-fns';

interface Patient {
  id: number;
  patient_number: string;
  first_name?: string;
  last_name?: string;
  date_of_birth: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

interface QueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  date_of_birth: string;
  room_number?: string;
  nurse_name?: string;
  current_priority: 'green' | 'yellow' | 'red';
  triage_time: string;
  check_in_time: string;
  chief_complaint: string;
  wait_time_minutes?: number;
  billing_amount?: number;
}

interface Room {
  id: number;
  room_number: string;
  room_name?: string;
  is_available: boolean;
}

interface Nurse {
  id: number;
  first_name: string;
  last_name: string;
}

interface Encounter {
  id: number;
  encounter_number: string;
  encounter_date: string;
  chief_complaint: string;
  diagnosis?: string;
  treatment?: string;
  billing_amount: number;
}

const ReceptionistDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<'queue' | 'checkin' | 'new-patient' | 'history'>('queue');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loading, setLoading] = useState(true);

  // Check-in form state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [encounterType, setEncounterType] = useState('walk-in');
  const [patientHistory, setPatientHistory] = useState<Encounter[]>([]);

  // New patient form state
  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [patientsRes, queueRes, roomsRes, nursesRes] = await Promise.all([
        apiClient.get('/patients'),
        apiClient.get('/workflow/queue'),
        apiClient.get('/workflow/rooms'),
        apiClient.get('/workflow/nurses'),
      ]);

      setPatients(patientsRes.data.patients || []);
      setQueue(queueRes.data.queue || []);
      setRooms(roomsRes.data.rooms || []);
      setNurses(nursesRes.data.nurses || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatientHistory = async (patientId: number) => {
    try {
      const response = await apiClient.get(`/patients/${patientId}/encounters`);
      setPatientHistory(response.data.encounters || []);
    } catch (error) {
      console.error('Error loading patient history:', error);
      setPatientHistory([]);
    }
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      const billingAmount = 50; // $50 for returning patients

      await apiClient.post('/workflow/check-in', {
        patient_id: selectedPatient.id,
        chief_complaint: chiefComplaint,
        encounter_type: encounterType,
        billing_amount: billingAmount,
      });

      // Store patient name for success message
      const patientName = `${selectedPatient.first_name} ${selectedPatient.last_name}`;

      // Reset form
      setSelectedPatient(null);
      setChiefComplaint('');
      setSearchTerm('');
      setPatientHistory([]);
      setEncounterType('walk-in');

      // Reload data first to get the updated queue
      await loadData();

      // Then switch to queue view
      setActiveView('queue');

      // Show success message after state is updated
      setTimeout(() => {
        alert(`✓ ${patientName} checked in successfully!\n\nBilling: $${billingAmount}\n\nPatient is now in the queue.`);
      }, 100);
    } catch (error: any) {
      console.error('Error checking in patient:', error);

      // Extract error message from API response
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to check in patient';

      alert(`❌ Check-In Failed\n\n${errorMessage}`);
    }
  };

  const handleNewPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Create new patient
      const patientResponse = await apiClient.post('/patients', newPatient);
      const newPatientData = patientResponse.data.patient;

      // Immediately check in the new patient
      const billingAmount = 75; // $75 for new patients

      await apiClient.post('/workflow/check-in', {
        patient_id: newPatientData.id,
        chief_complaint: chiefComplaint,
        encounter_type: encounterType,
        billing_amount: billingAmount,
      });

      // Reset form
      setNewPatient({
        first_name: '',
        last_name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
      });
      setChiefComplaint('');
      setEncounterType('walk-in');

      // Reload data first to get the new patient in the queue
      await loadData();

      // Then switch to queue view to show the patient
      setActiveView('queue');

      // Show success message after state is updated
      setTimeout(() => {
        alert(`✓ Patient registered successfully!\n\nPatient #: ${newPatientData.patient_number}\nBilling: $${billingAmount}\n\nPatient is now in the queue.`);
      }, 100);
    } catch (error: any) {
      console.error('Error creating new patient:', error);

      // Extract error message from API response
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to register new patient';

      alert(`❌ Registration Failed\n\n${errorMessage}`);
    }
  };

  const handleAssignRoom = async (encounterId: number, roomId: number) => {
    try {
      await apiClient.post('/workflow/assign-room', {
        encounter_id: encounterId,
        room_id: roomId,
      });
      loadData();
    } catch (error) {
      console.error('Error assigning room:', error);
      alert('Failed to assign room');
    }
  };

  const handleAssignNurse = async (encounterId: number, nurseId: number) => {
    try {
      await apiClient.post('/workflow/assign-nurse', {
        encounter_id: encounterId,
        nurse_id: nurseId,
      });
      loadData();
    } catch (error) {
      console.error('Error assigning nurse:', error);
      alert('Failed to assign nurse');
    }
  };

  const getWaitTimeColor = (waitTimeMinutes?: number) => {
    if (!waitTimeMinutes) return 'bg-gray-100 border-gray-400 text-gray-800';

    if (waitTimeMinutes <= 15) {
      return 'bg-green-100 border-green-400 text-green-800';
    } else if (waitTimeMinutes <= 30) {
      return 'bg-yellow-100 border-yellow-400 text-yellow-800';
    } else {
      return 'bg-red-100 border-red-400 text-red-800';
    }
  };

  const getWaitTimeLabel = (waitTimeMinutes?: number) => {
    if (!waitTimeMinutes) return 'Unknown';

    if (waitTimeMinutes <= 15) {
      return 'GREEN';
    } else if (waitTimeMinutes <= 30) {
      return 'YELLOW';
    } else {
      return 'RED';
    }
  };

  const calculateWaitTime = (checkInTime: string): number => {
    const checkIn = new Date(checkInTime);
    const now = new Date();
    const diffMs = now.getTime() - checkIn.getTime();
    return Math.floor(diffMs / (1000 * 60)); // Convert to minutes
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.patient_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePatientSelect = async (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchTerm(`${patient.first_name} ${patient.last_name} (${patient.patient_number})`);
    await loadPatientHistory(patient.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Receptionist Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Welcome, {user?.first_name} {user?.last_name}
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <button
            onClick={() => setActiveView('queue')}
            className={`bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 ${
              activeView === 'queue' ? 'border-primary-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
                <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900">Patient Queue</h2>
                <p className="text-2xl font-bold text-primary-600">{queue.length}</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('checkin')}
            className={`bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 ${
              activeView === 'checkin' ? 'border-primary-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900">Check-In</h2>
                <p className="text-sm text-gray-600">Returning Patient</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('new-patient')}
            className={`bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 ${
              activeView === 'new-patient' ? 'border-primary-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900">New Patient</h2>
                <p className="text-sm text-gray-600">Register & Check-In</p>
              </div>
            </div>
          </button>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-100 rounded-md p-3">
                <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900">Available Rooms</h2>
                <p className="text-2xl font-bold text-purple-600">
                  {rooms.filter(r => r.is_available).length}/{rooms.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        {activeView === 'queue' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Current Patient Queue ({queue.length})
              </h2>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span>0-15 min</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span>15-30 min</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                  <span>30+ min</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {queue.map((item) => {
                const waitTime = calculateWaitTime(item.check_in_time);
                return (
                  <div
                    key={item.id}
                    className={`p-6 border-l-4 rounded-lg ${getWaitTimeColor(waitTime)}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-semibold">
                            {item.patient_name}
                          </h3>
                          <span className="text-sm font-medium text-gray-600">
                            Patient #: {item.patient_number}
                          </span>
                          <span className="text-sm font-medium text-gray-600">
                            Encounter #: {item.encounter_number}
                          </span>
                        </div>

                        <div className="mt-2 flex gap-4 text-sm text-gray-700">
                          <span>DOB: {format(new Date(item.date_of_birth), 'MM/dd/yyyy')}</span>
                          <span>Checked in: {format(new Date(item.check_in_time), 'h:mm a')}</span>
                          {item.billing_amount && (
                            <span className="font-semibold text-green-700">
                              Billing: ${item.billing_amount}
                            </span>
                          )}
                        </div>

                        <p className="text-gray-700 mt-2">
                          <span className="font-medium">Chief Complaint:</span> {item.chief_complaint}
                        </p>

                        <div className="mt-3 flex gap-4 text-sm">
                          {item.room_number && (
                            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                              Room: {item.room_number}
                            </span>
                          )}
                          {item.nurse_name && (
                            <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-medium">
                              Nurse: {item.nurse_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-2xl font-bold">{getWaitTimeLabel(waitTime)}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Wait: {waitTime} min
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      {!item.room_number && (
                        <select
                          onChange={(e) => handleAssignRoom(item.id, Number(e.target.value))}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          defaultValue=""
                        >
                          <option value="">Assign Room</option>
                          {rooms
                            .filter((r) => r.is_available)
                            .map((room) => (
                              <option key={room.id} value={room.id}>
                                Room {room.room_number}
                              </option>
                            ))}
                        </select>
                      )}

                      {!item.nurse_name && (
                        <select
                          onChange={(e) => handleAssignNurse(item.id, Number(e.target.value))}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          defaultValue=""
                        >
                          <option value="">Assign Nurse</option>
                          {nurses.map((nurse) => (
                            <option key={nurse.id} value={nurse.id}>
                              {nurse.first_name} {nurse.last_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}

              {queue.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="mt-2 text-lg font-medium">No patients in queue</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'checkin' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Check-In Returning Patient</h2>
              <form onSubmit={handleCheckIn} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Patient
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter patient number or name..."
                  />
                  {searchTerm && !selectedPatient && (
                    <div className="mt-2 max-h-60 overflow-y-auto border border-gray-300 rounded-lg">
                      {filteredPatients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="p-4 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        >
                          <div className="font-semibold text-gray-900">
                            {patient.first_name} {patient.last_name}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Patient #: {patient.patient_number} | DOB: {format(new Date(patient.date_of_birth), 'MM/dd/yyyy')}
                          </div>
                        </div>
                      ))}
                      {filteredPatients.length === 0 && (
                        <div className="p-4 text-center text-gray-500">
                          No patients found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedPatient && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-900 mb-2">Selected Patient</h3>
                    <div className="text-sm space-y-1">
                      <p><span className="font-medium">Name:</span> {selectedPatient.first_name} {selectedPatient.last_name}</p>
                      <p><span className="font-medium">Patient #:</span> {selectedPatient.patient_number}</p>
                      <p><span className="font-medium">DOB:</span> {format(new Date(selectedPatient.date_of_birth), 'MM/dd/yyyy')}</p>
                      {selectedPatient.phone && (
                        <p><span className="font-medium">Phone:</span> {selectedPatient.phone}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chief Complaint
                  </label>
                  <textarea
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    rows={4}
                    required
                    placeholder="Patient's main concern or reason for visit..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Encounter Type
                  </label>
                  <select
                    value={encounterType}
                    onChange={(e) => setEncounterType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="walk-in">Walk-in</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">Billing:</span> $50.00 (Returning Patient)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!selectedPatient || !chiefComplaint}
                  className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Check In Patient
                </button>
              </form>
            </div>

            {selectedPatient && patientHistory.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Past Medical History</h2>
                <div className="space-y-4">
                  {patientHistory.map((encounter) => (
                    <div key={encounter.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-semibold text-gray-900">
                            Encounter #: {encounter.encounter_number}
                          </span>
                          <p className="text-sm text-gray-600">
                            {format(new Date(encounter.encounter_date), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-700">
                          ${encounter.billing_amount}
                        </span>
                      </div>
                      <div className="text-sm space-y-1 text-gray-700">
                        <p><span className="font-medium">Complaint:</span> {encounter.chief_complaint}</p>
                        {encounter.diagnosis && (
                          <p><span className="font-medium">Diagnosis:</span> {encounter.diagnosis}</p>
                        )}
                        {encounter.treatment && (
                          <p><span className="font-medium">Treatment:</span> {encounter.treatment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedPatient && patientHistory.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Past Medical History</h2>
                <div className="text-center py-12 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-2">No previous encounters on record</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'new-patient' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Register New Patient</h2>
            <form onSubmit={handleNewPatientSubmit} className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
                <p className="text-sm text-blue-800">
                  Patient # and Encounter # will be automatically generated upon registration
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={newPatient.first_name}
                    onChange={(e) => setNewPatient({ ...newPatient, first_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={newPatient.last_name}
                    onChange={(e) => setNewPatient({ ...newPatient, last_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    value={newPatient.date_of_birth}
                    onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender *
                  </label>
                  <select
                    value={newPatient.gender}
                    onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newPatient.email}
                    onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={newPatient.address}
                  onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={newPatient.city}
                    onChange={(e) => setNewPatient({ ...newPatient, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State
                  </label>
                  <input
                    type="text"
                    value={newPatient.state}
                    onChange={(e) => setNewPatient({ ...newPatient, state: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={newPatient.emergency_contact_name}
                    onChange={(e) => setNewPatient({ ...newPatient, emergency_contact_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={newPatient.emergency_contact_phone}
                    onChange={(e) => setNewPatient({ ...newPatient, emergency_contact_phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chief Complaint *
                </label>
                <textarea
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={4}
                  required
                  placeholder="Patient's main concern or reason for visit..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Encounter Type
                </label>
                <select
                  value={encounterType}
                  onChange={(e) => setEncounterType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="walk-in">Walk-in</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>

              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-800">
                  <span className="font-semibold">Billing:</span> $75.00 (New Patient)
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
              >
                Register & Check In Patient
              </button>
            </form>
          </div>
        )}

        {/* Rooms Status */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Room Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`p-4 rounded-lg text-center border-2 ${
                  room.is_available
                    ? 'bg-green-50 border-green-400 text-green-800'
                    : 'bg-red-50 border-red-400 text-red-800'
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
      </main>
    </div>
  );
};

export default ReceptionistDashboard;
