import React, { useEffect, useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, parseISO } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import { Card, Modal, Input, Select, Textarea, Button } from '../components/ui';

interface Appointment {
  id: number;
  patient_id: number;
  provider_id: number;
  patient_name: string;
  patient_number: string;
  patient_phone?: string;
  provider_name: string;
  appointment_date: string;
  duration_minutes: number;
  appointment_type: string;
  reason: string;
  status: 'scheduled' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
}

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
}

interface PatientSearchResult {
  id: number;
  patient_number: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string;
}

const AppointmentsCalendar: React.FC = () => {
  const { showToast } = useNotification();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month');

  // New appointment modal state
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [patients, setPatients] = useState<PatientSearchResult[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [newAppointment, setNewAppointment] = useState({
    patient_id: '',
    provider_id: '',
    appointment_date: '',
    appointment_time: '09:00',
    duration_minutes: 30,
    appointment_type: 'follow-up',
    reason: '',
  });

  useEffect(() => {
    loadDoctors();
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [currentMonth, selectedDoctor]);

  useEffect(() => {
    if (patientSearch.length >= 2) {
      searchPatients();
    } else {
      setPatients([]);
    }
  }, [patientSearch]);

  const loadDoctors = async () => {
    try {
      const res = await apiClient.get('/users?role=doctor');
      setDoctors(res.data.users || []);
    } catch (error) {
      console.error('Error loading doctors:', error);
    }
  };

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const fromDate = startOfMonth(currentMonth).toISOString();
      const toDate = endOfMonth(currentMonth).toISOString();

      let url = `/appointments?from_date=${fromDate}&to_date=${toDate}`;
      if (selectedDoctor !== 'all') {
        url += `&provider_id=${selectedDoctor}`;
      }

      const res = await apiClient.get(url);
      setAppointments(res.data.appointments || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
      showToast('Failed to load appointments', 'error');
    } finally {
      setLoading(false);
    }
  };

  const searchPatients = async () => {
    try {
      const res = await apiClient.get(`/patients?search=${patientSearch}`);
      setPatients(res.data.patients || []);
    } catch (error) {
      console.error('Error searching patients:', error);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newAppointment.patient_id || !newAppointment.provider_id) {
      showToast('Please select a patient and doctor', 'warning');
      return;
    }

    try {
      const appointmentDateTime = `${newAppointment.appointment_date}T${newAppointment.appointment_time}:00`;

      await apiClient.post('/appointments', {
        patient_id: parseInt(newAppointment.patient_id),
        provider_id: parseInt(newAppointment.provider_id),
        appointment_date: appointmentDateTime,
        duration_minutes: newAppointment.duration_minutes,
        appointment_type: newAppointment.appointment_type,
        reason: newAppointment.reason,
      });

      showToast('Appointment created successfully', 'success');
      setShowNewAppointment(false);
      setNewAppointment({
        patient_id: '',
        provider_id: '',
        appointment_date: '',
        appointment_time: '09:00',
        duration_minutes: 30,
        appointment_type: 'follow-up',
        reason: '',
      });
      setPatientSearch('');
      loadAppointments();
    } catch (error) {
      console.error('Error creating appointment:', error);
      showToast('Failed to create appointment', 'error');
    }
  };

  const handleCancelAppointment = async (appointmentId: number) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      await apiClient.post(`/appointments/${appointmentId}/cancel`, {
        reason: 'Cancelled by staff',
      });
      showToast('Appointment cancelled', 'success');
      loadAppointments();
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      showToast('Failed to cancel appointment', 'error');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'confirmed': return 'bg-green-100 text-green-800 border-green-300';
      case 'checked_in': return 'bg-secondary-100 text-secondary-800 border-secondary-300';
      case 'completed': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      case 'no_show': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(apt =>
      isSameDay(parseISO(apt.appointment_date), date)
    );
  };

  const renderCalendarHeader = () => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Doctor Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Doctor:</label>
          <select
            value={selectedDoctor}
            onChange={(e) => setSelectedDoctor(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Doctors</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                Dr. {doctor.first_name} {doctor.last_name}
              </option>
            ))}
          </select>
        </div>

        {/* View Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'month' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'day' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Day
          </button>
        </div>

        {/* New Appointment Button */}
        <button
          onClick={() => {
            setNewAppointment({
              ...newAppointment,
              appointment_date: format(selectedDate, 'yyyy-MM-dd'),
            });
            setShowNewAppointment(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Appointment
        </button>
      </div>
    </div>
  );

  const renderDaysOfWeek = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 border-b border-gray-200">
        {days.map((day) => (
          <div key={day} className="p-3 text-center text-sm font-semibold text-gray-600 bg-gray-50">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCalendarCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDay = day;
        const dayAppointments = getAppointmentsForDate(currentDay);
        const isToday = isSameDay(day, new Date());
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelected = isSameDay(day, selectedDate);

        days.push(
          <div
            key={day.toString()}
            onClick={() => {
              setSelectedDate(currentDay);
              if (viewMode === 'month' && dayAppointments.length > 0) {
                setViewMode('day');
              }
            }}
            className={`min-h-[120px] p-2 border-r border-b border-gray-200 cursor-pointer transition-colors
              ${!isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'hover:bg-blue-50'}
              ${isSelected ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : ''}
            `}
          >
            <div className={`text-sm font-semibold mb-1 ${
              isToday ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center' : ''
            }`}>
              {format(day, 'd')}
            </div>
            <div className="space-y-1">
              {dayAppointments.slice(0, 3).map((apt) => (
                <div
                  key={apt.id}
                  className={`text-xs p-1 rounded truncate border ${getStatusColor(apt.status)}`}
                  title={`${format(parseISO(apt.appointment_date), 'h:mm a')} - ${apt.patient_name}`}
                >
                  {format(parseISO(apt.appointment_date), 'h:mm a')} {apt.patient_name.split(' ')[0]}
                </div>
              ))}
              {dayAppointments.length > 3 && (
                <div className="text-xs text-blue-600 font-medium">
                  +{dayAppointments.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7">
          {days}
        </div>
      );
      days = [];
    }
    return <div className="border-l border-t border-gray-200">{rows}</div>;
  };

  const renderDayView = () => {
    const dayAppointments = getAppointmentsForDate(selectedDate);

    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {dayAppointments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg font-medium">No appointments scheduled</p>
            <p className="text-sm">Click "New Appointment" to schedule one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {dayAppointments
              .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
              .map((apt) => (
                <div
                  key={apt.id}
                  className={`p-4 rounded-lg border-2 ${getStatusColor(apt.status)}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-bold">
                          {format(parseISO(apt.appointment_date), 'h:mm a')}
                        </span>
                        <span className="text-sm text-gray-600">
                          ({apt.duration_minutes} min)
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getStatusColor(apt.status)}`}>
                          {apt.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-lg font-semibold text-gray-900">{apt.patient_name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Patient #:</span> {apt.patient_number}
                        {apt.patient_phone && (
                          <span className="ml-3"><span className="font-medium">Phone:</span> {apt.patient_phone}</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Provider:</span> Dr. {apt.provider_name}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Type:</span> {apt.appointment_type}
                        {apt.reason && (
                          <span className="ml-3"><span className="font-medium">Reason:</span> {apt.reason}</span>
                        )}
                      </div>
                    </div>
                    {apt.status !== 'cancelled' && apt.status !== 'completed' && (
                      <button
                        onClick={() => handleCancelAppointment(apt.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded border border-red-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  };

  const doctorOptions = doctors.map((doctor) => ({
    value: doctor.id,
    label: `Dr. ${doctor.first_name} ${doctor.last_name}`,
  }));

  const durationOptions = [
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 45, label: '45 minutes' },
    { value: 60, label: '60 minutes' },
  ];

  const appointmentTypeOptions = [
    { value: 'new-patient', label: 'New Patient' },
    { value: 'follow-up', label: 'Follow-up' },
    { value: 'consultation', label: 'Consultation' },
    { value: 'routine-checkup', label: 'Routine Checkup' },
    { value: 'urgent', label: 'Urgent' },
  ];

  const renderNewAppointmentModal = () => (
    <Modal
      isOpen={showNewAppointment}
      onClose={() => setShowNewAppointment(false)}
      title="New Appointment"
      size="md"
      footer={
        <div className="flex gap-3 w-full">
          <Button
            variant="secondary"
            onClick={() => setShowNewAppointment(false)}
            fullWidth
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateAppointment}
            fullWidth
          >
            Create Appointment
          </Button>
        </div>
      }
    >
      <form onSubmit={handleCreateAppointment} className="space-y-4">
        {/* Patient Search */}
        <div>
          <Input
            label="Patient"
            required
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Search by name or patient number..."
          />
          {patients.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  onClick={() => {
                    setNewAppointment({ ...newAppointment, patient_id: patient.id.toString() });
                    setPatientSearch(`${patient.first_name} ${patient.last_name} (${patient.patient_number})`);
                    setPatients([]);
                  }}
                  className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                >
                  <div className="font-medium">{patient.first_name} {patient.last_name}</div>
                  <div className="text-sm text-gray-500">{patient.patient_number}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Select
          label="Doctor"
          required
          value={newAppointment.provider_id}
          onChange={(e) => setNewAppointment({ ...newAppointment, provider_id: e.target.value })}
          options={doctorOptions}
          placeholder="Select Doctor"
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            required
            value={newAppointment.appointment_date}
            onChange={(e) => setNewAppointment({ ...newAppointment, appointment_date: e.target.value })}
          />
          <Input
            label="Time"
            type="time"
            required
            value={newAppointment.appointment_time}
            onChange={(e) => setNewAppointment({ ...newAppointment, appointment_time: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Duration"
            value={newAppointment.duration_minutes}
            onChange={(e) => setNewAppointment({ ...newAppointment, duration_minutes: parseInt(e.target.value) })}
            options={durationOptions}
          />
          <Select
            label="Type"
            value={newAppointment.appointment_type}
            onChange={(e) => setNewAppointment({ ...newAppointment, appointment_type: e.target.value })}
            options={appointmentTypeOptions}
          />
        </div>

        <Textarea
          label="Reason for Visit"
          value={newAppointment.reason}
          onChange={(e) => setNewAppointment({ ...newAppointment, reason: e.target.value })}
          rows={3}
          placeholder="Brief description of the reason for this appointment..."
        />
      </form>
    </Modal>
  );

  if (loading && appointments.length === 0) {
    return (
      <AppLayout title="Appointments Calendar">
        <Card>
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Appointments Calendar">
      <div className="space-y-6">
        <Card>
          <div className="p-6">
            {renderCalendarHeader()}

            {viewMode === 'month' ? (
              <>
                {renderDaysOfWeek()}
                {renderCalendarCells()}
              </>
            ) : (
              renderDayView()
            )}
          </div>
        </Card>

        {/* Legend */}
        <Card>
          <div className="p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300"></div>
                <span>Scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 border border-green-300"></div>
                <span>Confirmed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-secondary-100 border border-secondary-300"></div>
                <span>Checked In</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-100 border border-gray-300"></div>
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-100 border border-red-300"></div>
                <span>Cancelled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-amber-100 border border-amber-300"></div>
                <span>No Show</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {renderNewAppointmentModal()}
    </AppLayout>
  );
};

export default AppointmentsCalendar;
