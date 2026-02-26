import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { format, isValid, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getDay, parse } from 'date-fns';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import PrintableInvoice from '../components/PrintableInvoice';
import SearchBar from '../components/SearchBar';
import AppLayout from '../components/AppLayout';
import { useNotification } from '../context/NotificationContext';
import type { ApiError } from '../types';
import { Card, Button, Badge, Input, Select, EmptyState } from '../components/ui';

// Setup date-fns localizer for react-big-calendar
const locales = {
  'en-US': enUS,
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

// Safe date formatting helper
const safeFormatDate = (dateValue: string | Date | null | undefined, formatString: string, fallback: string = 'N/A'): string => {
  if (!dateValue) return fallback;

  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (isValid(date)) {
      return format(date, formatString);
    }
    return fallback;
  } catch (error) {
    console.error('Date formatting error:', error, 'Value:', dateValue);
    return fallback;
  }
};

interface Patient {
  id: number;
  patient_number: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: string;
  preferred_clinic?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  pcp_name?: string;
  pcp_phone?: string;
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
  doctor_name?: string;
  current_priority: 'green' | 'yellow' | 'red';
  triage_time: string;
  check_in_time: string;
  chief_complaint: string;
  wait_time_minutes?: number;
  billing_amount?: number;
  status: 'in-progress' | 'with_nurse' | 'with_doctor' | 'completed' | 'discharged';
  workflow_status: 'checked_in' | 'in_room' | 'waiting_for_nurse' | 'with_nurse' | 'ready_for_doctor' | 'with_doctor' | 'at_lab' | 'at_pharmacy' | 'at_imaging' | 'ready_for_checkout' | 'completed' | 'discharged';
  invoice_status?: 'pending' | 'paid' | 'partial';
  clinic?: string;
  pending_lab_orders?: number;
  pending_pharmacy_orders?: number;
  pending_imaging_orders?: number;
}

interface Nurse {
  id: number;
  first_name: string;
  last_name: string;
}

interface Doctor {
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

interface CorporateClient {
  id: number;
  name: string;
}

interface InsuranceProvider {
  id: number;
  name: string;
}

interface PayerSource {
  payer_type: 'self_pay' | 'corporate' | 'insurance';
  corporate_client_id?: number;
  insurance_provider_id?: number;
}

// Invoice-related interfaces for viewing invoices
interface InvoiceData {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_number: string;
  patient_name: string;
  patient_email?: string;
  patient_phone?: string;
  patient_address?: string;
  patient_city?: string;
  patient_state?: string;
  subtotal: number;
  tax: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  chief_complaint?: string;
  encounter_date?: string;
}

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface InvoicePayerSource {
  id: number;
  payer_type: string;
  corporate_client_name?: string;
  insurance_provider_name?: string;
  is_primary: boolean;
}

interface Appointment {
  id: number;
  patient_id: number;
  provider_id: number;
  appointment_date: string;
  duration_minutes: number;
  appointment_type: string;
  reason: string;
  notes?: string;
  status: 'scheduled' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  patient_name?: string;
  patient_number?: string;
  patient_phone?: string;
  provider_name?: string;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: Appointment;
}

const ReceptionistDashboard: React.FC = () => {
  console.log('ReceptionistDashboard: Component rendering');
  const { user } = useAuth();
  console.log('ReceptionistDashboard: User', user);
  const { showToast } = useNotification();
  const [activeView, setActiveView] = useState<'queue' | 'checkin' | 'new-patient' | 'appointments'>('queue');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [corporateClients, setCorporateClients] = useState<CorporateClient[]>([]);
  const [insuranceProviders, setInsuranceProviders] = useState<InsuranceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingNurseForEncounter, setEditingNurseForEncounter] = useState<number | null>(null);

  // Appointments state
  const [, setAppointments] = useState<Appointment[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('week');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [bookingPatient, setBookingPatient] = useState<Patient | null>(null);
  const [bookingPatientSearch, setBookingPatientSearch] = useState('');
  const [bookingDoctor, setBookingDoctor] = useState<number | null>(null);
  const [bookingClinic, setBookingClinic] = useState('');
  const [bookingType, setBookingType] = useState('follow-up');
  const [bookingReason, setBookingReason] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingDuration, setBookingDuration] = useState(30);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Check-in form state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [encounterType, setEncounterType] = useState('walk-in');
  const [selectedClinic, setSelectedClinic] = useState('');
  const [patientHistory, setPatientHistory] = useState<Encounter[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);

  // Queue filter state
  const [queueClinicFilter, setQueueClinicFilter] = useState('');
  const [queueStatusFilter, setQueueStatusFilter] = useState('');
  const [queueSearchTerm, setQueueSearchTerm] = useState('');

  // Ghana regions
  const ghanaRegions = [
    'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Northern',
    'Volta', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo',
    'Western North', 'Oti', 'North East', 'Savannah',
  ];

  // Clinic options
  const clinics = [
    'General Practice', 'ENT (Ear, Nose & Throat)', 'Urology', 'Cardiology',
    'Dermatology', 'Gastroenterology', 'Neurology', 'Obstetrics & Gynecology',
    'Ophthalmology', 'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
    'Rheumatology', 'Endocrinology',
  ];

  // New patient form state
  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    gps_address: '',
    city: '',
    region: '',
    preferred_clinic: '',
    vip_status: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    pcp_name: '',
    pcp_phone: '',
    allergies: '',
    nationality: '',
    // Health status (doctors only can see detailed info)
    hiv_status: '',
    hepatitis_b_status: '',
    hepatitis_c_status: '',
    tb_status: '',
    sickle_cell_status: '',
    other_health_conditions: '',
  });

  // Payer source state
  const [selectedPayerTypes, setSelectedPayerTypes] = useState<string[]>([]);
  const [selectedCorporateClient, setSelectedCorporateClient] = useState<number | null>(null);
  const [selectedInsuranceProvider, setSelectedInsuranceProvider] = useState<number | null>(null);

  // Invoice state
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<InvoicePayerSource[]>([]);
  const [currentEncounterId, setCurrentEncounterId] = useState<number | null>(null);

  // Billing alerts state
  interface BillingAlert {
    id: number;
    encounter_id: number;
    patient_id: number;
    patient_name: string;
    patient_number: string;
    encounter_number: string;
    clinic: string;
    room_number: string;
    from_user_name: string;
    message: string;
    created_at: string;
  }
  const [billingAlerts, setBillingAlerts] = useState<BillingAlert[]>([]);

  useEffect(() => {
    loadData();
    loadBillingAlerts();
    loadTodayAppointments(); // Load today's appointments for counter
    const interval = setInterval(() => {
      loadData();
      loadBillingAlerts();
      loadTodayAppointments();
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    console.log('ReceptionistDashboard: loadData starting');
    try {
      setError(null);
      console.log('ReceptionistDashboard: Making API calls');
      const [patientsRes, queueRes, nursesRes, doctorsRes, corporateClientsRes, insuranceProvidersRes] = await Promise.all([
        apiClient.get('/patients'),
        apiClient.get('/workflow/queue'),
        apiClient.get('/workflow/nurses'),
        apiClient.get('/workflow/doctors'),
        apiClient.get('/payer-sources/corporate-clients'),
        apiClient.get('/payer-sources/insurance-providers'),
      ]);
      console.log('ReceptionistDashboard: API calls succeeded', { patientsRes, queueRes, nursesRes, doctorsRes, corporateClientsRes, insuranceProvidersRes });

      setPatients(patientsRes.data.patients || []);
      setQueue(queueRes.data.queue || []);
      setNurses(nursesRes.data.nurses || []);
      setDoctors(doctorsRes.data.doctors || []);
      setCorporateClients(corporateClientsRes.data.corporate_clients || []);
      setInsuranceProviders(insuranceProvidersRes.data.insurance_providers || []);
    } catch (error) {
      console.error('Error loading data:', error);
      const apiError = error as ApiError;
      const errorMsg = apiError.response?.data?.message || apiError.response?.data?.error || 'Failed to load dashboard data';
      setError(errorMsg);
      // Set empty arrays so the dashboard still renders
      setPatients([]);
      setQueue([]);
      setNurses([]);
      setDoctors([]);
      setCorporateClients([]);
      setInsuranceProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const loadBillingAlerts = async () => {
    try {
      const response = await apiClient.get('/workflow/receptionist/alerts');
      setBillingAlerts(response.data.alerts || []);
    } catch (error) {
      console.error('Error loading billing alerts:', error);
    }
  };

  const handleDismissBillingAlert = async (alertId: number) => {
    try {
      await apiClient.post(`/workflow/alerts/${alertId}/read`);
      setBillingAlerts(prev => prev.filter(alert => alert.id !== alertId));
      showToast('Alert dismissed', 'info');
    } catch (error) {
      console.error('Error dismissing alert:', error);
      showToast('Failed to dismiss alert', 'error');
    }
  };

  const handleBillingAlertClick = (alert: BillingAlert) => {
    // Find the queue item matching this encounter and open the invoice view
    const queueItem = queue.find(q => q.encounter_number === alert.encounter_number);
    if (queueItem) {
      handleViewInvoice(queueItem.id);
    }
    // Dismiss the alert
    handleDismissBillingAlert(alert.id);
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

  // Load appointments when view changes to appointments or calendar date changes
  useEffect(() => {
    if (activeView === 'appointments') {
      loadAppointments();
      loadTodayAppointments();
    }
  }, [activeView, calendarDate, calendarView]);

  const loadAppointments = async () => {
    try {
      // Calculate date range based on calendar view
      let fromDate: Date;
      let toDate: Date;

      if (calendarView === 'month') {
        fromDate = startOfMonth(calendarDate);
        toDate = endOfMonth(calendarDate);
      } else if (calendarView === 'week') {
        fromDate = startOfWeek(calendarDate, { weekStartsOn: 0 });
        toDate = endOfWeek(calendarDate, { weekStartsOn: 0 });
      } else {
        fromDate = new Date(calendarDate);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(calendarDate);
        toDate.setHours(23, 59, 59, 999);
      }

      const response = await apiClient.get('/appointments', {
        params: {
          from_date: fromDate.toISOString(),
          to_date: toDate.toISOString(),
          limit: 500,
        },
      });

      const appts = response.data.appointments || [];
      setAppointments(appts);

      // Convert to calendar events
      const events: CalendarEvent[] = appts.map((appt: Appointment) => {
        const startDate = new Date(appt.appointment_date);
        const endDate = new Date(startDate.getTime() + (appt.duration_minutes || 30) * 60000);
        return {
          id: appt.id,
          title: `${appt.patient_name || 'Unknown'} - ${appt.appointment_type}`,
          start: startDate,
          end: endDate,
          resource: appt,
        };
      });
      setCalendarEvents(events);
    } catch (error) {
      console.error('Error loading appointments:', error);
      setAppointments([]);
      setCalendarEvents([]);
    }
  };

  const loadTodayAppointments = async () => {
    try {
      const response = await apiClient.get('/appointments/today');
      setTodayAppointments(response.data.appointments || []);
    } catch (error) {
      console.error('Error loading today appointments:', error);
      setTodayAppointments([]);
    }
  };

  const handleSlotSelect = useCallback(({ start, end }: { start: Date; end: Date }) => {
    setSelectedSlot({ start, end });
    setShowBookingModal(true);
    // Reset booking form
    setBookingPatient(null);
    setBookingPatientSearch('');
    setBookingDoctor(null);
    setBookingClinic('');
    setBookingType('follow-up');
    setBookingReason('');
    setBookingNotes('');
    setBookingDuration(30);
  }, []);

  const handleEventSelect = useCallback((event: CalendarEvent) => {
    setSelectedAppointment(event.resource);
  }, []);

  const handleBookAppointment = async () => {
    const patientName = bookingPatient
      ? `${bookingPatient.first_name} ${bookingPatient.last_name}`
      : bookingPatientSearch.trim();

    if (!patientName || !selectedSlot) {
      showToast('Please enter a patient name', 'warning');
      return;
    }

    setSavingAppointment(true);
    try {
      await apiClient.post('/appointments', {
        patient_id: bookingPatient?.id || null,
        patient_name: patientName,
        provider_id: bookingDoctor || null,
        appointment_date: selectedSlot.start.toISOString(),
        duration_minutes: bookingDuration,
        appointment_type: bookingType,
        reason: bookingReason || bookingClinic,
        notes: bookingNotes,
      });

      showToast('Appointment booked successfully', 'success');
      setShowBookingModal(false);
      setBookingPatientSearch('');
      setBookingPatient(null);
      loadAppointments();
      loadTodayAppointments();
    } catch (error) {
      console.error('Error booking appointment:', error);
      const apiError = error as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to book appointment', 'error');
    } finally {
      setSavingAppointment(false);
    }
  };

  const handleCancelAppointment = async (appointmentId: number, reason?: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      await apiClient.post(`/appointments/${appointmentId}/cancel`, { reason });
      showToast('Appointment cancelled', 'success');
      setSelectedAppointment(null);
      loadAppointments();
      loadTodayAppointments();
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      showToast('Failed to cancel appointment', 'error');
    }
  };

  const handleCheckInFromAppointment = async (appointment: Appointment) => {
    // Find the patient and switch to check-in view
    const patient = patients.find(p => p.id === appointment.patient_id);
    if (patient) {
      setSelectedPatient(patient);
      setSearchTerm(`${patient.first_name} ${patient.last_name} (${patient.patient_number})`);
      setEncounterType('scheduled');
      setChiefComplaint(appointment.reason || '');
      setActiveView('checkin');
    } else {
      showToast('Patient not found', 'error');
    }
  };

  const filteredBookingPatients = patients.filter(
    (p) =>
      bookingPatientSearch &&
      (p.patient_number.toLowerCase().includes(bookingPatientSearch.toLowerCase()) ||
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(bookingPatientSearch.toLowerCase()))
  );

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      const billingAmount = 50; // $50 for returning patients

      setCheckingIn(true);
      await apiClient.post('/workflow/check-in', {
        patient_id: selectedPatient.id,
        chief_complaint: chiefComplaint.trim() || '',
        encounter_type: encounterType,
        billing_amount: billingAmount,
        clinic: selectedClinic || null,
      });

      // Store patient name for success message
      const patientName = `${selectedPatient.first_name} ${selectedPatient.last_name}`;

      // Reset form
      setSelectedPatient(null);
      setChiefComplaint('');
      setSearchTerm('');
      setPatientHistory([]);
      setEncounterType('walk-in');
      setSelectedClinic('');

      // Reload data first to get the updated queue
      await loadData();

      // Then switch to queue view
      setActiveView('queue');

      // Show success message
      showToast(`${patientName} checked in successfully! Billing: GH₵${billingAmount}`, 'success');
    } catch (error) {
      console.error('Error checking in patient:', error);

      // Extract error message from API response
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || apiError.response?.data?.error || 'Failed to check in patient';

      showToast(errorMessage, 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleNewPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Build payer sources array
      const payer_sources: PayerSource[] = [];

      if (selectedPayerTypes.includes('self_pay')) {
        payer_sources.push({ payer_type: 'self_pay' });
      }

      if (selectedPayerTypes.includes('corporate') && selectedCorporateClient) {
        payer_sources.push({
          payer_type: 'corporate',
          corporate_client_id: selectedCorporateClient,
        });
      }

      if (selectedPayerTypes.includes('insurance') && selectedInsuranceProvider) {
        payer_sources.push({
          payer_type: 'insurance',
          insurance_provider_id: selectedInsuranceProvider,
        });
      }

      // Create new patient
      const patientResponse = await apiClient.post('/patients', {
        ...newPatient,
        payer_sources,
      });
      const newPatientData = patientResponse.data.patient;

      // Immediately check in the new patient
      const billingAmount = 75; // $75 for new patients

      await apiClient.post('/workflow/check-in', {
        patient_id: newPatientData.id,
        chief_complaint: '', // Now entered by nurse
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
        gps_address: '',
        city: '',
        region: '',
        preferred_clinic: '',
        vip_status: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        emergency_contact_relationship: '',
        pcp_name: '',
        pcp_phone: '',
        allergies: '',
        nationality: '',
        hiv_status: '',
        hepatitis_b_status: '',
        hepatitis_c_status: '',
        tb_status: '',
        sickle_cell_status: '',
        other_health_conditions: '',
      });
      setChiefComplaint('');
      setEncounterType('walk-in');
      setSelectedPayerTypes([]);
      setSelectedCorporateClient(null);
      setSelectedInsuranceProvider(null);

      // Reload data first to get the new patient in the queue
      await loadData();

      // Then switch to queue view to show the patient
      setActiveView('queue');

      // Show success message
      showToast(`Patient registered successfully! Patient #: ${newPatientData.patient_number}, Billing: GH₵${billingAmount}`, 'success');
    } catch (error) {
      console.error('Error creating new patient:', error);

      // Extract error message from API response
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || apiError.response?.data?.error || 'Failed to register new patient';

      showToast(errorMessage, 'error');
    }
  };

  const handleAssignNurse = async (encounterId: number, nurseId: number) => {
    try {
      await apiClient.post('/workflow/assign-nurse', {
        encounter_id: encounterId,
        nurse_id: nurseId,
      });
      await loadData();
      setEditingNurseForEncounter(null);
      showToast('Nurse assigned successfully!', 'success');
    } catch (error) {
      console.error('Error assigning nurse:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || apiError.response?.data?.error || 'Failed to assign nurse';
      showToast(errorMessage, 'error');
    }
  };

  const handleViewInvoice = async (encounterId: number) => {
    try {
      const response = await apiClient.get(`/invoices/encounter/${encounterId}`);
      setInvoiceData(response.data.invoice);
      setInvoiceItems(response.data.items || []);
      setInvoicePayerSources(response.data.payer_sources || []);
      setCurrentEncounterId(encounterId);
      setShowInvoice(true);
    } catch (error) {
      console.error('Error loading invoice:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || apiError.response?.data?.error || 'Failed to load invoice';
      showToast(errorMessage, 'error');
    }
  };

  const handlePaymentComplete = () => {
    // Reload the patient queue data after payment is completed
    loadData();
  };

  const handleCheckout = async (encounterId: number, patientName: string) => {
    if (!confirm(`Are you sure you want to checkout ${patientName}? This will close the entire patient visit.`)) {
      return;
    }

    try {
      await apiClient.post('/workflow/checkout', { encounter_id: encounterId });
      showToast(`${patientName} has been checked out successfully`, 'success');
      await loadData();
    } catch (error) {
      console.error('Error checking out patient:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || apiError.response?.data?.error || 'Failed to checkout patient';
      showToast(errorMessage, 'error');
    }
  };

  const getWaitTimeColor = (waitTimeMinutes: number | null | undefined, workflowStatus?: string) => {
    // If patient is actively being seen, use a neutral/positive color
    if (workflowStatus === 'with_nurse' || workflowStatus === 'with_doctor') {
      return 'bg-primary-50 border-primary-400 text-primary-800';
    }

    if (waitTimeMinutes === null || waitTimeMinutes === undefined) return 'bg-gray-100 border-slate-400 text-gray-800';

    if (waitTimeMinutes <= 15) {
      return 'bg-success-100 border-success-400 text-success-800';
    } else if (waitTimeMinutes <= 30) {
      return 'bg-warning-100 border-warning-400 text-warning-800';
    } else {
      return 'bg-danger-100 border-danger-400 text-danger-800';
    }
  };

  const getWaitTimeLabel = (waitTimeMinutes: number | null | undefined, workflowStatus?: string) => {
    // If patient is actively being seen, don't show wait time priority
    if (workflowStatus === 'with_nurse' || workflowStatus === 'with_doctor') {
      return 'IN CARE';
    }

    if (waitTimeMinutes === null || waitTimeMinutes === undefined) return 'JUST ARRIVED';

    if (waitTimeMinutes <= 15) {
      return 'GREEN';
    } else if (waitTimeMinutes <= 30) {
      return 'YELLOW';
    } else {
      return 'RED';
    }
  };

  const calculateWaitTime = (checkInTime: string | null | undefined): number | null => {
    if (!checkInTime) return null;
    const checkIn = new Date(checkInTime);
    if (isNaN(checkIn.getTime())) return null;
    const now = new Date();
    const diffMs = now.getTime() - checkIn.getTime();
    return Math.floor(diffMs / (1000 * 60)); // Convert to minutes
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.patient_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter queue based on search, clinic, and status filters
  const filteredQueue = queue.filter((item) => {
    // Search filter
    if (queueSearchTerm) {
      const searchLower = queueSearchTerm.toLowerCase();
      const matchesSearch =
        item.patient_name.toLowerCase().includes(searchLower) ||
        item.patient_number.toLowerCase().includes(searchLower) ||
        item.encounter_number.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Clinic filter
    if (queueClinicFilter && item.clinic !== queueClinicFilter) {
      return false;
    }

    // Status filter
    if (queueStatusFilter && item.workflow_status !== queueStatusFilter) {
      return false;
    }

    return true;
  });

  const handlePatientSelect = async (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchTerm(`${patient.first_name} ${patient.last_name} (${patient.patient_number})`);
    // Pre-fill clinic from patient's preferred clinic if available
    if (patient.preferred_clinic) {
      setSelectedClinic(patient.preferred_clinic);
    }
    await loadPatientHistory(patient.id);
  };

  console.log('ReceptionistDashboard: Render check - loading:', loading, 'error:', error);

  if (loading) {
    console.log('ReceptionistDashboard: Showing loading spinner');
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  console.log('ReceptionistDashboard: Rendering main UI');
  return (
    <AppLayout title="Receptionist Dashboard">
      {/* Search Bar */}
      <div className="mb-6">
        <SearchBar
          onPatientSelect={(patient) => {
            setActiveView('checkin');
            setSelectedPatient(patient);
            const patientName = patient.full_name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
            showToast(`Patient ${patientName} selected for check-in`, 'info');
          }}
          placeholder="Search patients..."
        />
      </div>

      {error && (
          <div className="mb-6 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-xl flex items-start gap-3 shadow-md">
            <svg className="w-5 h-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold">Error Loading Dashboard</p>
              <p className="text-sm">{error}</p>
              <button
                onClick={loadData}
                className="mt-2 text-sm underline hover:no-underline"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 mb-8">
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
            className={`bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 ${
              activeView === 'checkin' ? 'border-success-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-success-100 rounded-md p-3">
                <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-bold text-gray-900">Returning Patient</h2>
                <p className="text-sm text-gray-600">Check-In</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('new-patient')}
            className={`bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 ${
              activeView === 'new-patient' ? 'border-primary-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
                <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-bold text-gray-900">New Patient</h2>
                <p className="text-sm text-gray-600">Register & Check-In</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('appointments')}
            className={`bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 ${
              activeView === 'appointments' ? 'border-secondary-500' : 'border-transparent'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-secondary-100 rounded-md p-3">
                <svg className="h-6 w-6 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-bold text-gray-900">Appointments</h2>
                <p className="text-2xl font-bold text-secondary-600">{todayAppointments.length}</p>
              </div>
            </div>
          </button>

        </div>

        {/* Main Content Area */}
        {activeView === 'queue' && (
          <>
            {/* Billing Alerts Banner */}
            {billingAlerts.length > 0 && (
              <div className="mb-6 bg-gradient-to-r from-success-50 to-success-50 border-2 border-success-300 rounded-xl p-4 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-success-500 p-2 rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-success-800">Ready for Billing</h3>
                      <p className="text-sm text-success-600">{billingAlerts.length} patient{billingAlerts.length !== 1 ? 's' : ''} ready for checkout</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {billingAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between bg-white rounded-lg p-3 border border-success-200 hover:border-success-400 transition-colors cursor-pointer"
                      onClick={() => handleBillingAlertClick(alert)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-success-100 p-2 rounded-full">
                          <svg className="w-5 h-5 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{alert.patient_name}</p>
                          <p className="text-sm text-gray-500">
                            {alert.patient_number} • {alert.clinic || 'No clinic'} • Encounter #{alert.encounter_number}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {new Date(alert.created_at).toLocaleTimeString()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismissBillingAlert(alert.id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          title="Dismiss"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <button
                          className="px-4 py-1.5 bg-success-600 text-white text-sm font-medium rounded-lg hover:bg-success-700 transition-colors"
                        >
                          View Invoice
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <Card>
            <Card.Header
              action={
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-success-500 rounded-full"></div>
                    <span className="text-gray-600">0-15 min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-warning-500 rounded-full"></div>
                    <span className="text-gray-600">15-30 min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-danger-500 rounded-full"></div>
                    <span className="text-gray-600">30+ min</span>
                  </div>
                </div>
              }
            >
              <span className="text-xl">Current Patient Queue</span>
              <Badge variant="primary" size="lg" className="ml-3">
                {filteredQueue.length}{filteredQueue.length !== queue.length && ` of ${queue.length}`}
              </Badge>
            </Card.Header>

            <Card.Body>
              {/* Queue Filters */}
              <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input
                  value={queueSearchTerm}
                  onChange={(e) => setQueueSearchTerm(e.target.value)}
                  placeholder="Search patient name or number..."
                  leftIcon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  }
                />
                <Select
                  value={queueClinicFilter}
                  onChange={(e) => setQueueClinicFilter(e.target.value)}
                  options={[
                    { value: '', label: 'All Clinics' },
                    ...clinics.map((clinic) => ({ value: clinic, label: clinic }))
                  ]}
                />
                <Select
                  value={queueStatusFilter}
                  onChange={(e) => setQueueStatusFilter(e.target.value)}
                  options={[
                    { value: '', label: 'All Statuses' },
                    { value: 'checked_in', label: 'Checked In' },
                    { value: 'in_room', label: 'In Room' },
                    { value: 'waiting_for_nurse', label: 'Waiting for Nurse' },
                    { value: 'with_nurse', label: 'With Nurse' },
                    { value: 'ready_for_doctor', label: 'Ready for Doctor' },
                    { value: 'with_doctor', label: 'With Doctor' },
                    { value: 'at_lab', label: 'At Lab' },
                    { value: 'at_pharmacy', label: 'At Pharmacy' },
                    { value: 'at_imaging', label: 'At Imaging' },
                    { value: 'ready_for_checkout', label: 'Ready for Checkout' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'discharged', label: 'Checked Out' },
                  ]}
                />
                {(queueSearchTerm || queueClinicFilter || queueStatusFilter) && (
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQueueSearchTerm('');
                        setQueueClinicFilter('');
                        setQueueStatusFilter('');
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>

            <div className="space-y-4">
              {filteredQueue.map((item) => {
                const waitTime = calculateWaitTime(item.check_in_time);
                const isCompleted = item.status === 'completed';
                const isPaid = item.invoice_status === 'paid';

                // Status badge configuration based on workflow_status
                const getStatusConfig = (): { text: string; variant: 'success' | 'warning' | 'secondary' | 'primary' | 'info' | 'gray' | 'danger'; icon: string } => {
                  if (item.workflow_status === 'discharged' || item.status === 'discharged') {
                    return { text: 'Checked Out', variant: 'gray', icon: '✓' };
                  }
                  if (isCompleted && isPaid) {
                    return { text: 'Completed & Paid', variant: 'success', icon: '✓' };
                  } else if (isCompleted) {
                    return { text: 'Awaiting Payment', variant: 'warning', icon: '⏳' };
                  }

                  switch (item.workflow_status) {
                    case 'with_doctor':
                      return { text: 'With Doctor', variant: 'secondary', icon: '👨‍⚕️' };
                    case 'ready_for_doctor':
                      return { text: 'Ready for Doctor', variant: 'warning', icon: '⏳' };
                    case 'with_nurse':
                      return { text: 'With Nurse', variant: 'primary', icon: '👩‍⚕️' };
                    case 'waiting_for_nurse':
                      return { text: 'Waiting for Nurse', variant: 'info', icon: '⏳' };
                    case 'in_room':
                      return { text: 'In Room', variant: 'info', icon: '🚪' };
                    case 'checked_in':
                      return { text: 'Checked In', variant: 'gray', icon: '✓' };
                    case 'at_lab':
                      return { text: 'At Lab', variant: 'info', icon: '🧪' };
                    case 'at_pharmacy':
                      return { text: 'At Pharmacy', variant: 'info', icon: '💊' };
                    case 'at_imaging':
                      return { text: 'At Imaging', variant: 'info', icon: '📷' };
                    case 'ready_for_checkout':
                      return { text: 'Ready for Checkout', variant: 'success', icon: '✓' };
                    default:
                      return { text: 'In Progress', variant: 'gray', icon: '🔄' };
                  }
                };

                const statusConfig = getStatusConfig();

                return (
                  <div
                    key={item.id}
                    className={`p-6 border-l-4 rounded-lg ${isCompleted ? 'bg-gray-50 border-gray-300' : getWaitTimeColor(waitTime, item.workflow_status)} ${isCompleted ? 'opacity-75' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-xl font-semibold">
                            {item.patient_name}
                          </h3>
                          <span className="text-sm font-medium text-gray-600">
                            Patient #: {item.patient_number}
                          </span>
                          <span className="text-sm font-medium text-gray-600">
                            Encounter #: {item.encounter_number}
                          </span>
                          <Badge variant={statusConfig.variant} size="md" dot>
                            {statusConfig.icon} {statusConfig.text}
                          </Badge>
                        </div>

                        <div className="mt-2 flex gap-4 text-sm text-gray-700 flex-wrap">
                          <span>DOB: {safeFormatDate(item.date_of_birth, 'MM/dd/yyyy')}</span>
                          <span>Checked in: {safeFormatDate(item.check_in_time, 'h:mm a')}</span>
                          {item.billing_amount && (
                            <span className={`font-semibold ${isPaid ? 'text-success-700' : 'text-warning-700'}`}>
                              Billing: GH₵{item.billing_amount} {isPaid ? '(Paid)' : '(Pending)'}
                            </span>
                          )}
                        </div>

                        {item.chief_complaint && (
                          <p className="text-gray-700 mt-2">
                            <span className="font-medium">Today's Visit:</span> {item.chief_complaint}
                          </p>
                        )}

                        <div className="mt-3 flex gap-2 text-sm flex-wrap items-center">
                          {item.room_number && (
                            <Badge variant="primary" size="md">
                              <svg className="w-3 h-3 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              Room {item.room_number}
                            </Badge>
                          )}
                          {item.nurse_name && (
                            <Badge variant="gray" size="md" className="flex items-center gap-1">
                              Nurse: {item.nurse_name}
                              {!isCompleted && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingNurseForEncounter(item.id);
                                  }}
                                  className="hover:bg-gray-300 rounded p-0.5 transition-colors ml-1"
                                  title="Change nurse"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}
                            </Badge>
                          )}
                          {item.doctor_name && (
                            <Badge variant="secondary" size="md">
                              <svg className="w-3 h-3 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Dr. {item.doctor_name}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        {!isCompleted ? (
                          <>
                            <div className="text-2xl font-bold">{getWaitTimeLabel(waitTime, item.workflow_status)}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {item.workflow_status === 'with_nurse' || item.workflow_status === 'with_doctor'
                                ? `In care for ${waitTime || 0} min`
                                : waitTime !== null
                                  ? `Wait: ${waitTime} min`
                                  : 'Just checked in'}
                            </div>
                          </>
                        ) : (
                          <div className="text-lg font-semibold text-gray-500">
                            Visit Complete
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3 flex-wrap">
                      {!isCompleted && !item.nurse_name && (
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

                      {!isCompleted && editingNurseForEncounter === item.id && item.nurse_name && (
                        <div className="flex items-center gap-2">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAssignNurse(item.id, Number(e.target.value));
                              }
                            }}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            defaultValue=""
                          >
                            <option value="">Select new nurse</option>
                            {nurses.map((nurse) => (
                              <option key={nurse.id} value={nurse.id}>
                                {nurse.first_name} {nurse.last_name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setEditingNurseForEncounter(null)}
                            className="px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                            title="Cancel"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}

                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleViewInvoice(item.id)}
                        leftIcon={
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        }
                      >
                        {isPaid ? 'View Invoice' : 'Print Invoice'}
                      </Button>

                      {/* Checkout button - show for completed patients or those ready for checkout */}
                      {(isCompleted || item.workflow_status === 'ready_for_checkout') && item.workflow_status !== 'discharged' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleCheckout(item.id, item.patient_name)}
                          leftIcon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                          }
                        >
                          Checkout
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredQueue.length === 0 && (
                <EmptyState
                  title={queue.length === 0 ? 'No patients in queue' : 'No patients match your filters'}
                  description={queue.length === 0
                    ? 'Patients will appear here after check-in'
                    : 'Try adjusting your search or filter criteria'
                  }
                  icon={
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  }
                  action={queue.length > 0 && (queueSearchTerm || queueClinicFilter || queueStatusFilter) ? {
                    label: 'Clear all filters',
                    onClick: () => {
                      setQueueSearchTerm('');
                      setQueueClinicFilter('');
                      setQueueStatusFilter('');
                    }
                  } : undefined}
                />
              )}
            </div>
            </Card.Body>
          </Card>
          </>
        )}

        {activeView === 'checkin' && (
          <div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
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
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold text-gray-900">
                                {patient.first_name} {patient.last_name}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Patient #: {patient.patient_number}
                                {patient.gender && ` | ${patient.gender}`}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded">
                                DOB: {safeFormatDate(patient.date_of_birth, 'MM/dd/yyyy')}
                              </div>
                            </div>
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
                  <div className="bg-primary-50 p-4 rounded-lg border border-primary-200">
                    <h3 className="font-semibold text-primary-900 mb-2">Selected Patient</h3>
                    <div className="text-sm space-y-1">
                      <p><span className="font-medium">Name:</span> {selectedPatient.first_name} {selectedPatient.last_name}</p>
                      <p><span className="font-medium">Patient #:</span> {selectedPatient.patient_number}</p>
                      <p><span className="font-medium">DOB:</span> {safeFormatDate(selectedPatient.date_of_birth, 'MM/dd/yyyy')}</p>
                      {selectedPatient.gender && (
                        <p><span className="font-medium">Gender:</span> {selectedPatient.gender}</p>
                      )}
                      {selectedPatient.phone && (
                        <p><span className="font-medium">Phone:</span> {selectedPatient.phone}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Clinic *
                  </label>
                  <select
                    value={selectedClinic}
                    onChange={(e) => setSelectedClinic(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Clinic</option>
                    {clinics.map((clinic) => (
                      <option key={clinic} value={clinic}>{clinic}</option>
                    ))}
                  </select>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chief Complaint / Reason for Visit
                  </label>
                  <textarea
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    placeholder="Brief description of symptoms or reason for visit (optional - can be entered by nurse)"
                  />
                </div>

                <div className="bg-success-50 p-4 rounded-lg border border-success-200">
                  <p className="text-sm text-success-800">
                    <span className="font-semibold">Billing:</span> GH₵50.00 (Returning Patient)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!selectedPatient || checkingIn}
                  className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {checkingIn ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Checking In...
                    </>
                  ) : (
                    'Check In Patient'
                  )}
                </button>
              </form>
            </div>

            {selectedPatient && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                {/* PCP Information */}
                <div className="mb-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Primary Care Physician (PCP)</h3>
                  <p className="text-gray-700">
                    {selectedPatient.pcp_name || 'Not specified'}
                    {selectedPatient.pcp_phone && (
                      <span className="ml-2 text-sm text-gray-500">| {selectedPatient.pcp_phone}</span>
                    )}
                  </p>
                </div>

                {/* Visit History */}
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Visit History</h2>
                {patientHistory.length > 0 ? (
                  <div className="space-y-4">
                    {patientHistory.map((encounter) => (
                      <div key={encounter.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-semibold text-gray-900">
                              Encounter #: {encounter.encounter_number}
                            </span>
                            <p className="text-sm text-gray-600">
                              {safeFormatDate(encounter.encounter_date, 'MMM dd, yyyy')}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-success-700">
                            GH₵{encounter.billing_amount}
                          </span>
                        </div>
                        <div className="text-sm space-y-1 text-gray-700">
                          <p><span className="font-medium">Today's Visit:</span> {encounter.chief_complaint}</p>
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
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="mt-2">No previous visits on record</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeView === 'new-patient' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Register New Patient</h2>
            <form onSubmit={handleNewPatientSubmit} className="space-y-6">
              <div className="bg-primary-50 p-4 rounded-lg border border-primary-200 mb-6">
                <p className="text-sm text-primary-800">
                  Patient # and Encounter # will be automatically generated upon registration
                </p>
              </div>

              {/* Personal Information */}
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getDate() : ''}
                      onChange={(e) => {
                        const day = parseInt(e.target.value);
                        const month = newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getMonth() : 0;
                        const year = newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getFullYear() : 2000;
                        if (day) {
                          const newDate = new Date(year, month, day);
                          setNewPatient({ ...newPatient, date_of_birth: newDate.toISOString().split('T')[0] });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                      required
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <select
                      value={newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getMonth() : ''}
                      onChange={(e) => {
                        const month = parseInt(e.target.value);
                        const day = newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getDate() : 1;
                        const year = newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getFullYear() : 2000;
                        if (!isNaN(month)) {
                          const newDate = new Date(year, month, day);
                          setNewPatient({ ...newPatient, date_of_birth: newDate.toISOString().split('T')[0] });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                      required
                    >
                      <option value="">Month</option>
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => (
                        <option key={i} value={i}>{month}</option>
                      ))}
                    </select>
                    <select
                      value={newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getFullYear() : ''}
                      onChange={(e) => {
                        const year = parseInt(e.target.value);
                        const day = newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getDate() : 1;
                        const month = newPatient.date_of_birth ? new Date(newPatient.date_of_birth).getMonth() : 0;
                        if (year) {
                          const newDate = new Date(year, month, day);
                          setNewPatient({ ...newPatient, date_of_birth: newDate.toISOString().split('T')[0] });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                      required
                    >
                      <option value="">Year</option>
                      {Array.from({ length: 120 }, (_, i) => new Date().getFullYear() - i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
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
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Allergies
                  </label>
                  <input
                    type="text"
                    value={newPatient.allergies}
                    onChange={(e) => setNewPatient({ ...newPatient, allergies: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., Penicillin, Peanuts, Latex"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nationality
                  </label>
                  <input
                    type="text"
                    value={newPatient.nationality}
                    onChange={(e) => setNewPatient({ ...newPatient, nationality: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., Ghanaian"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Clinic
                  </label>
                  <select
                    value={newPatient.preferred_clinic}
                    onChange={(e) => setNewPatient({ ...newPatient, preferred_clinic: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Clinic</option>
                    {clinics.map((clinic) => (
                      <option key={clinic} value={clinic}>{clinic}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Concierge
                  </label>
                  <select
                    value={newPatient.vip_status}
                    onChange={(e) => setNewPatient({ ...newPatient, vip_status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">None</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                    <option value="platinum">Platinum</option>
                  </select>
                </div>
              </div>

              {/* Contact Information */}
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mt-6">
                <svg className="w-5 h-5 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., 0244123456"
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Residential Address
                  </label>
                  <input
                    type="text"
                    value={newPatient.address}
                    onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="House number, Street name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GPS Address Code
                  </label>
                  <input
                    type="text"
                    value={newPatient.gps_address}
                    onChange={(e) => setNewPatient({ ...newPatient, gps_address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., GA-123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    City/Town
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
                    Region
                  </label>
                  <select
                    value={newPatient.region}
                    onChange={(e) => setNewPatient({ ...newPatient, region: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Region</option>
                    {ghanaRegions.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Emergency Contact */}
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mt-6">
                <svg className="w-5 h-5 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Name
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
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={newPatient.emergency_contact_phone}
                    onChange={(e) => setNewPatient({ ...newPatient, emergency_contact_phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Relationship
                  </label>
                  <select
                    value={newPatient.emergency_contact_relationship}
                    onChange={(e) => setNewPatient({ ...newPatient, emergency_contact_relationship: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Relationship</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Parent">Parent</option>
                    <option value="Child">Child</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Friend">Friend</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* PCP Information */}
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mt-6">
                <svg className="w-5 h-5 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Primary Care Physician
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PCP Name
                  </label>
                  <div className="space-y-2">
                    <select
                      value={newPatient.pcp_name && !doctors.some(d => `Dr. ${d.first_name} ${d.last_name}` === newPatient.pcp_name) ? '__other__' : newPatient.pcp_name}
                      onChange={(e) => {
                        if (e.target.value === '__other__') {
                          setNewPatient({ ...newPatient, pcp_name: '' });
                        } else {
                          setNewPatient({ ...newPatient, pcp_name: e.target.value });
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="">Select Doctor</option>
                      {doctors.map((doctor) => (
                        <option key={doctor.id} value={`Dr. ${doctor.first_name} ${doctor.last_name}`}>
                          Dr. {doctor.first_name} {doctor.last_name}
                        </option>
                      ))}
                      <option value="__other__">-- Enter Other Doctor --</option>
                    </select>
                    {(newPatient.pcp_name === '' || (newPatient.pcp_name && !doctors.some(d => `Dr. ${d.first_name} ${d.last_name}` === newPatient.pcp_name))) && (
                      <input
                        type="text"
                        value={newPatient.pcp_name === '__other__' ? '' : newPatient.pcp_name}
                        onChange={(e) => setNewPatient({ ...newPatient, pcp_name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Enter doctor name (e.g., Dr. John Smith)"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PCP Phone
                  </label>
                  <input
                    type="tel"
                    value={newPatient.pcp_phone}
                    onChange={(e) => setNewPatient({ ...newPatient, pcp_phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Payer Source(s) *
                </label>
                <div className="space-y-4">
                  {/* Self Pay */}
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="payer-self-pay"
                      checked={selectedPayerTypes.includes('self_pay')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPayerTypes([...selectedPayerTypes, 'self_pay']);
                        } else {
                          setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'self_pay'));
                        }
                      }}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="payer-self-pay" className="ml-3 text-sm text-gray-700 font-medium">
                      Self Pay
                    </label>
                  </div>

                  {/* Corporate */}
                  <div>
                    <div className="flex items-start mb-2">
                      <input
                        type="checkbox"
                        id="payer-corporate"
                        checked={selectedPayerTypes.includes('corporate')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPayerTypes([...selectedPayerTypes, 'corporate']);
                          } else {
                            setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'corporate'));
                            setSelectedCorporateClient(null);
                          }
                        }}
                        className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label htmlFor="payer-corporate" className="ml-3 text-sm text-gray-700 font-medium">
                        Corporate
                      </label>
                    </div>
                    {selectedPayerTypes.includes('corporate') && (
                      <div className="ml-7">
                        <select
                          value={selectedCorporateClient || ''}
                          onChange={(e) => setSelectedCorporateClient(e.target.value ? Number(e.target.value) : null)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required={selectedPayerTypes.includes('corporate')}
                        >
                          <option value="">Select Corporate Client</option>
                          {corporateClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Insurance */}
                  <div>
                    <div className="flex items-start mb-2">
                      <input
                        type="checkbox"
                        id="payer-insurance"
                        checked={selectedPayerTypes.includes('insurance')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPayerTypes([...selectedPayerTypes, 'insurance']);
                          } else {
                            setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'insurance'));
                            setSelectedInsuranceProvider(null);
                          }
                        }}
                        className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label htmlFor="payer-insurance" className="ml-3 text-sm text-gray-700 font-medium">
                        Insurance
                      </label>
                    </div>
                    {selectedPayerTypes.includes('insurance') && (
                      <div className="ml-7">
                        <select
                          value={selectedInsuranceProvider || ''}
                          onChange={(e) => setSelectedInsuranceProvider(e.target.value ? Number(e.target.value) : null)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required={selectedPayerTypes.includes('insurance')}
                        >
                          <option value="">Select Insurance Provider</option>
                          {insuranceProviders.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
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

              <div className="bg-success-50 p-4 rounded-lg border border-success-200">
                <p className="text-sm text-success-800">
                  <span className="font-semibold">Billing:</span> GH₵75.00 (New Patient)
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

        {/* Appointments View */}
        {activeView === 'appointments' && (
          <div className="space-y-6">
            {/* Today's Appointments Summary */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6">
              {/* Today's Schedule */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Today's Appointments</h3>
                  <span className="px-3 py-1 bg-secondary-100 text-violet-700 rounded-full text-sm font-bold">
                    {todayAppointments.length}
                  </span>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {todayAppointments.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No appointments today</p>
                  ) : (
                    todayAppointments.map((appt) => (
                      <div
                        key={appt.id}
                        className={`p-3 rounded-lg border-2 ${
                          appt.status === 'cancelled' ? 'border-danger-200 bg-danger-50' :
                          appt.status === 'checked_in' ? 'border-success-200 bg-success-50' :
                          appt.status === 'completed' ? 'border-gray-200 bg-gray-50' :
                          'border-violet-200 bg-secondary-50'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-gray-900">{appt.patient_name}</p>
                            <p className="text-sm text-gray-600">
                              {safeFormatDate(appt.appointment_date, 'h:mm a')} - {appt.appointment_type}
                            </p>
                            {appt.reason && (
                              <p className="text-xs text-gray-500 mt-1">{appt.reason}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              appt.status === 'cancelled' ? 'bg-danger-100 text-danger-700' :
                              appt.status === 'checked_in' ? 'bg-success-100 text-success-700' :
                              appt.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                              appt.status === 'confirmed' ? 'bg-primary-100 text-primary-700' :
                              'bg-warning-100 text-warning-700'
                            }`}>
                              {appt.status.replace('_', ' ').toUpperCase()}
                            </span>
                            {appt.status === 'scheduled' || appt.status === 'confirmed' ? (
                              <button
                                onClick={() => handleCheckInFromAppointment(appt)}
                                className="text-xs text-success-600 hover:text-success-800 font-medium"
                              >
                                Check In →
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Quick Stats</h3>
                  <button
                    onClick={() => {
                      setSelectedSlot({ start: new Date(), end: new Date(Date.now() + 30 * 60000) });
                      setShowBookingModal(true);
                    }}
                    className="px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-semibold flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Book Appointment
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-secondary-50 p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-secondary-600">
                      {todayAppointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length}
                    </p>
                    <p className="text-sm text-gray-600">Upcoming</p>
                  </div>
                  <div className="bg-success-50 p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-success-600">
                      {todayAppointments.filter(a => a.status === 'checked_in').length}
                    </p>
                    <p className="text-sm text-gray-600">Checked In</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-gray-600">
                      {todayAppointments.filter(a => a.status === 'completed').length}
                    </p>
                    <p className="text-sm text-gray-600">Completed</p>
                  </div>
                  <div className="bg-danger-50 p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-danger-600">
                      {todayAppointments.filter(a => a.status === 'cancelled' || a.status === 'no_show').length}
                    </p>
                    <p className="text-sm text-gray-600">Cancelled</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Appointment Calendar</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCalendarView('day')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      calendarView === 'day' ? 'bg-secondary-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Day
                  </button>
                  <button
                    onClick={() => setCalendarView('week')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      calendarView === 'week' ? 'bg-secondary-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setCalendarView('month')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      calendarView === 'month' ? 'bg-secondary-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Month
                  </button>
                </div>
              </div>
              <div style={{ height: 600 }}>
                <Calendar
                  localizer={localizer}
                  events={calendarEvents}
                  startAccessor="start"
                  endAccessor="end"
                  view={calendarView}
                  onView={(view: View) => setCalendarView(view as 'month' | 'week' | 'day')}
                  date={calendarDate}
                  onNavigate={(date: Date) => setCalendarDate(date)}
                  selectable
                  onSelectSlot={handleSlotSelect}
                  onSelectEvent={handleEventSelect}
                  min={new Date(2020, 0, 1, 8, 0)} // 8 AM
                  max={new Date(2020, 0, 1, 18, 0)} // 6 PM
                  step={30}
                  timeslots={1}
                  eventPropGetter={(event: CalendarEvent) => {
                    const status = event.resource.status;
                    let backgroundColor = '#7c3aed'; // violet
                    if (status === 'cancelled') backgroundColor = '#ef4444';
                    else if (status === 'checked_in') backgroundColor = '#22c55e';
                    else if (status === 'completed') backgroundColor = '#6b7280';
                    else if (status === 'confirmed') backgroundColor = '#3b82f6';
                    return { style: { backgroundColor, borderRadius: '4px' } };
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Booking Modal */}
        {showBookingModal && selectedSlot && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Book Appointment</h3>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Date/Time */}
                <div className="bg-secondary-50 p-4 rounded-lg">
                  <p className="text-sm text-violet-700 font-medium">Selected Time Slot</p>
                  <p className="text-lg font-bold text-violet-900">
                    {safeFormatDate(selectedSlot.start, 'EEEE, MMMM d, yyyy')}
                  </p>
                  <p className="text-violet-700">
                    {safeFormatDate(selectedSlot.start, 'h:mm a')} - {safeFormatDate(selectedSlot.end, 'h:mm a')}
                  </p>
                </div>

                {/* Patient Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Patient *</label>
                  {bookingPatient ? (
                    <div className="flex items-center justify-between bg-success-50 p-3 rounded-lg border border-success-200">
                      <div>
                        <p className="font-semibold text-gray-900">{bookingPatient.first_name} {bookingPatient.last_name}</p>
                        <p className="text-sm text-gray-600">{bookingPatient.patient_number}</p>
                      </div>
                      <button
                        onClick={() => {
                          setBookingPatient(null);
                          setBookingPatientSearch('');
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={bookingPatientSearch}
                        onChange={(e) => setBookingPatientSearch(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
                        placeholder="Enter patient name or search existing..."
                      />
                      {filteredBookingPatients.length > 0 && bookingPatientSearch && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredBookingPatients.slice(0, 5).map((patient) => (
                            <div
                              key={patient.id}
                              onClick={() => {
                                setBookingPatient(patient);
                                setBookingPatientSearch('');
                              }}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                            >
                              <p className="font-semibold text-gray-900">{patient.first_name} {patient.last_name}</p>
                              <p className="text-sm text-gray-600">{patient.patient_number}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {bookingPatientSearch && !bookingPatient && (
                        <p className="text-xs text-gray-500 mt-1">New patient? Just type their name - they can register at check-in</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Appointment Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Appointment Type</label>
                  <select
                    value={bookingType}
                    onChange={(e) => setBookingType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
                  >
                    <option value="follow-up">Follow-up Visit</option>
                    <option value="new-patient">New Patient</option>
                    <option value="consultation">Consultation</option>
                    <option value="procedure">Procedure</option>
                    <option value="checkup">General Checkup</option>
                  </select>
                </div>

                {/* Clinic */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Clinic</label>
                  <select
                    value={bookingClinic}
                    onChange={(e) => setBookingClinic(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
                  >
                    <option value="">Select a clinic...</option>
                    {clinics.map((clinic) => (
                      <option key={clinic} value={clinic}>{clinic}</option>
                    ))}
                  </select>
                </div>

                {/* Doctor (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Doctor (Optional)</label>
                  <select
                    value={bookingDoctor || ''}
                    onChange={(e) => setBookingDoctor(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
                  >
                    <option value="">Any available doctor</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>Dr. {doctor.first_name} {doctor.last_name}</option>
                    ))}
                  </select>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                  <select
                    value={bookingDuration}
                    onChange={(e) => setBookingDuration(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Visit</label>
                  <textarea
                    value={bookingReason}
                    onChange={(e) => setBookingReason(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent resize-none"
                    placeholder="Brief description of the appointment reason..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowBookingModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBookAppointment}
                    disabled={(!bookingPatient && !bookingPatientSearch.trim()) || savingAppointment}
                    className="flex-1 px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingAppointment ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Booking...
                      </>
                    ) : (
                      'Book Appointment'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Appointment Details Modal */}
        {selectedAppointment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Appointment Details</h3>
                <button
                  onClick={() => setSelectedAppointment(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Patient</p>
                  <p className="font-semibold text-gray-900">{selectedAppointment.patient_name}</p>
                  <p className="text-sm text-gray-600">{selectedAppointment.patient_number}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Date & Time</p>
                  <p className="font-semibold text-gray-900">
                    {safeFormatDate(selectedAppointment.appointment_date, 'EEEE, MMMM d, yyyy')}
                  </p>
                  <p className="text-gray-600">
                    {safeFormatDate(selectedAppointment.appointment_date, 'h:mm a')} ({selectedAppointment.duration_minutes} min)
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-semibold text-gray-900">{selectedAppointment.appointment_type}</p>
                </div>

                {selectedAppointment.reason && (
                  <div>
                    <p className="text-sm text-gray-500">Reason</p>
                    <p className="text-gray-900">{selectedAppointment.reason}</p>
                  </div>
                )}

                {selectedAppointment.provider_name && (
                  <div>
                    <p className="text-sm text-gray-500">Doctor</p>
                    <p className="font-semibold text-gray-900">Dr. {selectedAppointment.provider_name}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    selectedAppointment.status === 'cancelled' ? 'bg-danger-100 text-danger-700' :
                    selectedAppointment.status === 'checked_in' ? 'bg-success-100 text-success-700' :
                    selectedAppointment.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                    selectedAppointment.status === 'confirmed' ? 'bg-primary-100 text-primary-700' :
                    'bg-warning-100 text-warning-700'
                  }`}>
                    {selectedAppointment.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  {(selectedAppointment.status === 'scheduled' || selectedAppointment.status === 'confirmed') && (
                    <>
                      <button
                        onClick={() => {
                          handleCheckInFromAppointment(selectedAppointment);
                          setSelectedAppointment(null);
                        }}
                        className="flex-1 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-medium"
                      >
                        Check In
                      </button>
                      <button
                        onClick={() => handleCancelAppointment(selectedAppointment.id)}
                        className="flex-1 px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedAppointment(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Invoice Modal */}
      {showInvoice && invoiceData && currentEncounterId && (
        <PrintableInvoice
          invoice={invoiceData}
          items={invoiceItems}
          payerSources={invoicePayerSources}
          encounterId={currentEncounterId}
          onClose={() => setShowInvoice(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </AppLayout>
  );
};

export default ReceptionistDashboard;
