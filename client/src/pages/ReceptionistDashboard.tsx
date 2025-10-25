import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

interface Patient {
  id: number;
  patient_number: string;
  first_name?: string;
  last_name?: string;
  date_of_birth: string;
}

interface QueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  room_number?: string;
  nurse_name?: string;
  current_priority: 'green' | 'yellow' | 'red';
  triage_time: string;
  chief_complaint: string;
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

const ReceptionistDashboard: React.FC = () => {
  const { user } = useAuth();
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

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [patientsRes, queueRes, roomsRes, nursesRes] = await Promise.all([
        axios.get('/api/patients'),
        axios.get('/api/workflow/queue'),
        axios.get('/api/workflow/rooms'),
        axios.get('/api/workflow/nurses'),
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

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      await axios.post('/api/workflow/check-in', {
        patient_id: selectedPatient.id,
        chief_complaint: chiefComplaint,
        encounter_type: encounterType,
      });

      setSelectedPatient(null);
      setChiefComplaint('');
      setSearchTerm('');
      loadData();
    } catch (error) {
      console.error('Error checking in patient:', error);
      alert('Failed to check in patient');
    }
  };

  const handleAssignRoom = async (encounterId: number, roomId: number) => {
    try {
      await axios.post('/api/workflow/assign-room', {
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
      await axios.post('/api/workflow/assign-nurse', {
        encounter_id: encounterId,
        nurse_id: nurseId,
      });
      loadData();
    } catch (error) {
      console.error('Error assigning nurse:', error);
      alert('Failed to assign nurse');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'green':
        return 'bg-green-100 border-green-400 text-green-800';
      case 'yellow':
        return 'bg-yellow-100 border-yellow-400 text-yellow-800';
      case 'red':
        return 'bg-red-100 border-red-400 text-red-800';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-800';
    }
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.patient_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-gray-900">
            Receptionist Dashboard - {user?.first_name} {user?.last_name}
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Check-In Section */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Patient Check-In</h2>
              <form onSubmit={handleCheckIn} className="space-y-4">
                <div>
                  <label className="label">Search Patient</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input"
                    placeholder="Patient number or name..."
                  />
                  {searchTerm && (
                    <div className="mt-2 max-h-48 overflow-y-auto border rounded-md">
                      {filteredPatients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => {
                            setSelectedPatient(patient);
                            setSearchTerm(
                              `${patient.first_name} ${patient.last_name} (${patient.patient_number})`
                            );
                          }}
                          className="p-2 hover:bg-gray-100 cursor-pointer"
                        >
                          <div className="font-medium">
                            {patient.first_name} {patient.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{patient.patient_number}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Chief Complaint</label>
                  <textarea
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    className="input"
                    rows={3}
                    required
                    placeholder="Patient's main concern..."
                  />
                </div>

                <div>
                  <label className="label">Encounter Type</label>
                  <select
                    value={encounterType}
                    onChange={(e) => setEncounterType(e.target.value)}
                    className="input"
                  >
                    <option value="walk-in">Walk-in</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!selectedPatient || !chiefComplaint}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  Check In Patient
                </button>
              </form>
            </div>
          </div>

          {/* Patient Queue */}
          <div className="lg:col-span-2">
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Patient Queue ({queue.length})
              </h2>
              <div className="space-y-3">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 border-l-4 rounded-lg ${getPriorityColor(
                      item.current_priority
                    )}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {item.patient_name}
                          <span className="ml-2 text-sm font-normal text-gray-600">
                            ({item.patient_number})
                          </span>
                        </h3>
                        <p className="text-sm text-gray-700 mt-1">{item.chief_complaint}</p>
                        <div className="mt-2 flex gap-4 text-sm">
                          <span>Encounter: {item.encounter_number}</span>
                          {item.room_number && <span>Room: {item.room_number}</span>}
                          {item.nurse_name && <span>Nurse: {item.nurse_name}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold uppercase">{item.current_priority}</div>
                        <div className="text-xs text-gray-600">
                          {new Date(item.triage_time).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      {!item.room_number && (
                        <select
                          onChange={(e) => handleAssignRoom(item.id, Number(e.target.value))}
                          className="text-sm px-3 py-1 border rounded"
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
                          className="text-sm px-3 py-1 border rounded"
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
                ))}

                {queue.length === 0 && (
                  <div className="text-center py-8 text-gray-500">No patients in queue</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rooms Status */}
        <div className="card mt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Room Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`p-4 rounded-lg text-center ${
                  room.is_available ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'
                } border-2`}
              >
                <div className="font-bold text-lg">Room {room.room_number}</div>
                <div className="text-sm mt-1">
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
