import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { format, parseISO, isValid } from 'date-fns';
import { validateVitalSign } from '../utils/vitalSignsValidation';
import HPAccordion from '../components/HPAccordion';
import { useNotification } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import { VoiceDictationButton } from '../components/VoiceDictationButton';
import { SmartTextArea } from '../components/SmartTextArea';
import PatientQuickView from '../components/PatientQuickView';
import VitalSignsHistory from '../components/VitalSignsHistory';
import type { ApiError } from '../types';

interface ClinicalNote {
  id: number;
  encounter_id: number;
  patient_id: number;
  note_type: string;
  content: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at?: string;
}

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
  vital_signs?: VitalSigns;
  from_doctor?: boolean;
  status?: string;
  workflow_status?: string;
  current_department?: string;
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
  pain_level?: number;
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

interface ShortStayBed {
  id: number;
  bed_number: string;
  bed_name: string;
  is_available: boolean;
  current_encounter_id: number | null;
  patient_id: number | null;
  patient_name: string | null;
  assigned_at: string | null;
  notes: string | null;
}

interface DoctorNotification {
  id: number;
  encounter_id: number;
  patient_name: string;
  patient_number: string;
  message: string;
  doctor_name: string;
  created_at: string;
  is_read: boolean;
}

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface LabOrderForm {
  test_name: string;
  test_code: string;
  priority: 'stat' | 'urgent' | 'routine';
  ordering_provider_id: number | null;
  notes: string;
}

interface ImagingOrderForm {
  study_type: string;
  body_part: string;
  priority: 'stat' | 'urgent' | 'routine';
  ordering_provider_id: number | null;
  clinical_indication: string;
  notes: string;
}

// Safe date formatting helper
const safeFormatDate = (dateValue: string | Date | null | undefined, formatString: string, fallback: string = ''): string => {
  if (!dateValue) return fallback;
  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (isValid(date)) {
      return format(date, formatString);
    }
    return fallback;
  } catch {
    return fallback;
  }
};

const NurseDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<AssignedPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [nurseProcedures, setNurseProcedures] = useState<NurseProcedure[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [imagingOrders, setImagingOrders] = useState<ImagingOrder[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([]);

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
  const [doctorMessageContent, setDoctorMessageContent] = useState('');

  // Tab state for better UI organization
  const [activeTab, setActiveTab] = useState<'hp' | 'vitals' | 'orders' | 'procedures' | 'notes' | 'routing' | 'documents'>('hp');

  // Room editing state
  const [editingRoom, setEditingRoom] = useState(false);

  // Today's Visit (Chief Complaint) editing state
  const [editingTodaysVisit, setEditingTodaysVisit] = useState(false);
  const [todaysVisitValue, setTodaysVisitValue] = useState('');

  // Patient Quick View state
  const [quickViewPatientId, setQuickViewPatientId] = useState<number | null>(null);

  // Vital Signs History state
  const [showVitalsHistory, setShowVitalsHistory] = useState(false);

  // Track which patients have had their doctor alerted
  const [doctorAlertedPatients, setDoctorAlertedPatients] = useState<Set<number>>(new Set());

  // Track routing status for each encounter (key: encounterId-department)
  const [routedDepartments, setRoutedDepartments] = useState<Set<string>>(new Set());

  // Auto-save timer for vitals
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [vitalsModified, setVitalsModified] = useState(false);

  // Short Stay Unit state
  const [shortStayBeds, setShortStayBeds] = useState<ShortStayBed[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<number | null>(null);
  const [shortStayNotes, setShortStayNotes] = useState('');

  // Doctor Notifications state
  const [doctorNotifications, setDoctorNotifications] = useState<DoctorNotification[]>([]);

  // Lab Order Creation state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [showLabOrderModal, setShowLabOrderModal] = useState(false);
  const [labOrderForm, setLabOrderForm] = useState<LabOrderForm>({
    test_name: '',
    test_code: '',
    priority: 'routine',
    ordering_provider_id: null,
    notes: '',
  });
  const [creatingLabOrder, setCreatingLabOrder] = useState(false);

  // Imaging Order Creation state
  const [showImagingOrderModal, setShowImagingOrderModal] = useState(false);
  const [imagingOrderForm, setImagingOrderForm] = useState<ImagingOrderForm>({
    study_type: '',
    body_part: '',
    priority: 'routine',
    ordering_provider_id: null,
    clinical_indication: '',
    notes: '',
  });
  const [creatingImagingOrder, setCreatingImagingOrder] = useState(false);

  useEffect(() => {
    loadAssignedPatients();
    loadNurseProcedures();
    loadRooms();
    loadShortStayBeds();
    loadDoctorNotifications();
    loadDoctors();
    if (selectedPatient) {
      loadOrders();
      loadClinicalNotes();
    }
    const interval = setInterval(() => {
      loadAssignedPatients();
      loadNurseProcedures();
      loadRooms();
      loadShortStayBeds();
      loadDoctorNotifications();
      if (selectedPatient) {
        loadOrders();
        loadClinicalNotes();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedPatient]);

  const loadAssignedPatients = async () => {
    try {
      const res = await apiClient.get('/workflow/nurse/patients');
      const patients = res.data.patients || [];
      // Deduplicate patients by encounter ID (id field)
      const uniquePatients = patients.filter((patient: AssignedPatient, index: number, self: AssignedPatient[]) =>
        index === self.findIndex((p) => p.id === patient.id)
      );
      setAssignedPatients(uniquePatients);

      // Update selectedPatient with fresh data if currently selected
      if (selectedPatient) {
        const updatedSelectedPatient = uniquePatients.find((p: AssignedPatient) => p.id === selectedPatient.id);
        if (updatedSelectedPatient) {
          setSelectedPatient(updatedSelectedPatient);
        }
      }
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

  const loadShortStayBeds = async () => {
    try {
      const res = await apiClient.get('/short-stay/beds');
      setShortStayBeds(res.data.beds || []);
    } catch (error) {
      console.error('Error loading short stay beds:', error);
    }
  };

  const loadDoctorNotifications = async () => {
    try {
      const res = await apiClient.get('/workflow/nurse/notifications');
      setDoctorNotifications(res.data.notifications || []);
    } catch (error) {
      console.error('Error loading doctor notifications:', error);
    }
  };

  const loadDoctors = async () => {
    try {
      const res = await apiClient.get('/users/doctors');
      setDoctors(res.data.doctors || []);
    } catch (error) {
      console.error('Error loading doctors:', error);
    }
  };

  // Start encounter when nurse begins working with a patient
  const handleSelectPatient = async (patient: AssignedPatient) => {
    setSelectedPatient(patient);
    setEditingRoom(false);

    // Only call start if patient hasn't been started yet (status is not 'with_nurse' or from_doctor)
    // This updates nurse_started_at in the database
    if (patient.status !== 'with_nurse' && !patient.from_doctor) {
      try {
        await apiClient.post('/workflow/nurse/start', {
          encounter_id: patient.id,
        });
        // Reload patients to get updated status
        loadAssignedPatients();
      } catch (error) {
        console.error('Error starting encounter:', error);
        // Don't show error to user - this is a background update
      }
    }
  };

  const handleCreateLabOrder = async () => {
    if (!selectedPatient) {
      showToast('Please select a patient first', 'warning');
      return;
    }

    if (!labOrderForm.test_name.trim()) {
      showToast('Please enter a test name', 'warning');
      return;
    }

    if (!labOrderForm.ordering_provider_id) {
      showToast('Please select a doctor', 'warning');
      return;
    }

    setCreatingLabOrder(true);
    try {
      await apiClient.post('/orders/lab', {
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        test_name: labOrderForm.test_name.trim(),
        test_code: labOrderForm.test_code.trim() || null,
        priority: labOrderForm.priority,
        ordering_provider_id: labOrderForm.ordering_provider_id,
        notes: labOrderForm.notes.trim() || null,
      });

      showToast('Lab order created successfully', 'success');
      setShowLabOrderModal(false);
      setLabOrderForm({
        test_name: '',
        test_code: '',
        priority: 'routine',
        ordering_provider_id: null,
        notes: '',
      });
      loadOrders();
    } catch (error) {
      const apiError = error as ApiError;
      console.error('Error creating lab order:', error);
      showToast(apiError.response?.data?.error || 'Failed to create lab order', 'error');
    } finally {
      setCreatingLabOrder(false);
    }
  };

  const handleCreateImagingOrder = async () => {
    if (!selectedPatient) {
      showToast('Please select a patient first', 'warning');
      return;
    }

    if (!imagingOrderForm.study_type.trim()) {
      showToast('Please enter a study type', 'warning');
      return;
    }

    if (!imagingOrderForm.ordering_provider_id) {
      showToast('Please select a doctor', 'warning');
      return;
    }

    setCreatingImagingOrder(true);
    try {
      await apiClient.post('/orders/imaging', {
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        study_type: imagingOrderForm.study_type.trim(),
        body_part: imagingOrderForm.body_part.trim() || null,
        priority: imagingOrderForm.priority,
        ordering_provider_id: imagingOrderForm.ordering_provider_id,
        clinical_indication: imagingOrderForm.clinical_indication.trim() || null,
        notes: imagingOrderForm.notes.trim() || null,
      });

      showToast('Imaging order created successfully', 'success');
      setShowImagingOrderModal(false);
      setImagingOrderForm({
        study_type: '',
        body_part: '',
        priority: 'routine',
        ordering_provider_id: null,
        clinical_indication: '',
        notes: '',
      });
      loadOrders();
    } catch (error) {
      const apiError = error as ApiError;
      console.error('Error creating imaging order:', error);
      showToast(apiError.response?.data?.error || 'Failed to create imaging order', 'error');
    } finally {
      setCreatingImagingOrder(false);
    }
  };

  const handleAssignShortStayBed = async () => {
    if (!selectedPatient || !selectedBedId) {
      showToast('Please select a patient and a bed', 'warning');
      return;
    }

    try {
      await apiClient.post('/short-stay/assign', {
        bed_id: selectedBedId,
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        notes: shortStayNotes || null,
      });

      showToast('Patient assigned to Short Stay bed', 'success');
      setSelectedBedId(null);
      setShortStayNotes('');
      loadShortStayBeds();
    } catch (error) {
      const apiError = error as ApiError;
      console.error('Error assigning short stay bed:', error);
      showToast(apiError.response?.data?.error || 'Failed to assign bed', 'error');
    }
  };

  const handleReleaseShortStayBed = async (bedId: number) => {
    if (!confirm('Are you sure you want to release this bed?')) {
      return;
    }

    try {
      await apiClient.post(`/short-stay/release/${bedId}`);
      showToast('Bed released successfully', 'success');
      loadShortStayBeds();
    } catch (error) {
      console.error('Error releasing bed:', error);
      showToast('Failed to release bed', 'error');
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

  const loadClinicalNotes = async () => {
    if (!selectedPatient) return;

    try {
      const res = await apiClient.get(`/clinical-notes/encounter/${selectedPatient.id}`);
      setClinicalNotes(res.data.notes || []);
    } catch (error) {
      console.error('Error loading clinical notes:', error);
    }
  };

  const handleAssignRoom = async (encounterId: number, roomId: number) => {
    if (!roomId || roomId === 0) {
      showToast('Please select a room', 'warning');
      return;
    }

    try {
      await apiClient.post('/workflow/assign-room', {
        encounter_id: encounterId,
        room_id: roomId,
      });
      showToast('Room assigned successfully', 'success');

      // Reload data and update selected patient
      const [patientsRes, roomsRes] = await Promise.all([
        apiClient.get('/workflow/nurse/patients'),
        apiClient.get('/workflow/rooms')
      ]);

      const updatedPatients = patientsRes.data.patients || [];
      setAssignedPatients(updatedPatients);
      setRooms(roomsRes.data.rooms || []);

      // Update selected patient with fresh data
      if (selectedPatient) {
        const updatedPatient = updatedPatients.find((p: AssignedPatient) => p.id === selectedPatient.id);
        if (updatedPatient) {
          setSelectedPatient(updatedPatient);
        }
      }
    } catch (error) {
      const apiError = error as ApiError;
      console.error('Error assigning room:', error);
      const errorMessage = apiError.response?.data?.error || apiError.response?.data?.message || 'Failed to assign room';
      showToast(errorMessage, 'error');
    }
  };

  const handleStartProcedure = async (procedureId: number) => {
    try {
      await apiClient.post(`/nurse-procedures/${procedureId}/start`);
      showToast('Procedure started', 'success');
      loadNurseProcedures();
    } catch (error) {
      console.error('Error starting procedure:', error);
      showToast('Failed to start procedure', 'error');
    }
  };

  const handleCompleteProcedure = async (procedureId: number) => {
    if (!confirm('Complete this procedure? This will automatically add charges to the invoice.')) {
      return;
    }

    try {
      await apiClient.post(`/nurse-procedures/${procedureId}/complete`, {});
      showToast('Procedure completed and billed successfully', 'success');
      loadNurseProcedures();
    } catch (error) {
      console.error('Error completing procedure:', error);
      showToast('Failed to complete procedure', 'error');
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
      showToast('Please correct the invalid vital signs before submitting', 'warning');
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
        showToast(`Vital signs saved successfully. Critical values detected: ${response.data.criticalValues.join(', ')}. Doctor has been alerted.`, 'warning');
      } else {
        showToast('Vital signs saved successfully', 'success');
      }

      setVitals({
        temperature_unit: 'F',
        weight_unit: 'lbs',
        height_unit: 'in',
      });
      loadAssignedPatients();
    } catch (error) {
      const apiError = error as ApiError & { response?: { data?: { errors?: Record<string, string> } } };
      console.error('Error submitting vitals:', error);
      if (apiError.response?.data?.errors) {
        setVitalErrors(apiError.response.data.errors);
        showToast('Invalid vital signs. Please check the values and try again.', 'error');
      } else {
        showToast('Failed to save vital signs', 'error');
      }
    }
  };

  // Auto-save vitals with debounce
  const autoSaveVitals = async () => {
    if (!selectedPatient || !vitalsModified) return;

    // Check if there are any vital values to save
    const hasValues = vitals.temperature || vitals.heart_rate ||
                     vitals.blood_pressure_systolic || vitals.blood_pressure_diastolic ||
                     vitals.respiratory_rate || vitals.oxygen_saturation ||
                     vitals.weight || vitals.height;

    if (!hasValues) return;

    try {
      await apiClient.post('/workflow/nurse/vitals', {
        encounter_id: selectedPatient.id,
        vital_signs: vitals,
      });
      setVitalsModified(false);
      showToast('Vital signs auto-saved', 'info');
      loadAssignedPatients();
    } catch (error) {
      console.error('Error auto-saving vitals:', error);
    }
  };

  // Trigger auto-save when vitals change (with 3 second debounce)
  useEffect(() => {
    if (vitalsModified && selectedPatient) {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      const timer = setTimeout(() => {
        autoSaveVitals();
      }, 3000);
      setAutoSaveTimer(timer);
    }
    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
    };
  }, [vitals, vitalsModified, selectedPatient]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !noteContent) return;

    try {
      await apiClient.post('/clinical-notes', {
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        note_type: 'nurse_general',
        content: noteContent,
      });

      showToast('Note added successfully', 'success');
      setNoteContent('');
      loadClinicalNotes();
    } catch (error) {
      console.error('Error adding note:', error);
      showToast('Failed to add note', 'error');
    }
  };

  const handleSendDoctorMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !doctorMessageContent) return;

    try {
      await apiClient.post('/clinical-notes', {
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        note_type: 'nurse_to_doctor',
        content: doctorMessageContent,
      });

      showToast('Message sent to doctor', 'success');
      setDoctorMessageContent('');
      loadClinicalNotes();
    } catch (error) {
      console.error('Error sending message to doctor:', error);
      showToast('Failed to send message', 'error');
    }
  };

  const handleAlertDoctor = async () => {
    if (!selectedPatient) return;

    try {
      await apiClient.post('/workflow/nurse/alert-doctor', {
        encounter_id: selectedPatient.id,
        message: 'Patient is ready for doctor evaluation',
      });

      // Mark this patient as having doctor alerted
      setDoctorAlertedPatients(prev => new Set([...prev, selectedPatient.id]));
      showToast('Doctor has been alerted', 'success');
    } catch (error) {
      console.error('Error alerting doctor:', error);
      showToast('Failed to alert doctor', 'error');
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

    const routingKey = `${selectedPatient.id}-${department}`;

    // Check if already routed
    if (routedDepartments.has(routingKey)) {
      showToast(`Patient already sent to ${departmentNames[department]}`, 'info');
      return;
    }

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

      // Mark as routed
      setRoutedDepartments(prev => new Set(prev).add(routingKey));
      showToast(`Patient routed to ${departmentNames[department]} successfully`, 'success');
      loadAssignedPatients();
    } catch (error) {
      console.error('Error routing patient:', error);
      showToast('Failed to route patient', 'error');
    }
  };

  const handleReleaseRoom = async () => {
    if (!selectedPatient) return;

    if (!confirm('Are you sure you want to release the room?')) {
      return;
    }

    try {
      await apiClient.post('/workflow/release-room', {
        encounter_id: selectedPatient.id,
        release_only: true, // Only release room, don't complete encounter
      });

      showToast('Room released successfully', 'success');
      loadAssignedPatients();
      loadRooms();
    } catch (error) {
      console.error('Error releasing room:', error);
      showToast('Failed to release room', 'error');
    }
  };

  const handleCompleteEncounter = async () => {
    if (!selectedPatient) return;

    if (!confirm('Are you sure you want to complete this encounter? This is the final step.')) {
      return;
    }

    try {
      await apiClient.post('/workflow/release-room', {
        encounter_id: selectedPatient.id,
      });

      showToast('Encounter completed successfully', 'success');
      setSelectedPatient(null);
      // Clear routing status for this patient
      setRoutedDepartments(prev => {
        const newSet = new Set(prev);
        ['lab', 'pharmacy', 'imaging', 'receptionist'].forEach(dept => {
          newSet.delete(`${selectedPatient.id}-${dept}`);
        });
        return newSet;
      });
      loadAssignedPatients();
      loadRooms();
    } catch (error) {
      console.error('Error completing encounter:', error);
      showToast('Failed to complete encounter', 'error');
    }
  };

  const handleUpdateTodaysVisit = async () => {
    if (!selectedPatient || !todaysVisitValue.trim()) {
      showToast('Please enter a reason for today\'s visit', 'warning');
      return;
    }

    try {
      await apiClient.patch(`/encounters/${selectedPatient.id}/chief-complaint`, {
        chief_complaint: todaysVisitValue.trim(),
      });

      showToast('Today\'s visit reason updated successfully', 'success');
      setEditingTodaysVisit(false);
      loadAssignedPatients();
    } catch (error) {
      console.error('Error updating today\'s visit:', error);
      showToast('Failed to update today\'s visit reason', 'error');
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
    <AppLayout title="Nurse Dashboard">
      {/* Room Status - At Top */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-gradient-to-r from-primary-600 to-secondary-600 p-2 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Room Status</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {rooms.map((room) => {
              // Find if there's a patient in this room
              const patientInRoom = assignedPatients.find(
                (p) => p.room_number === room.room_number
              );

              return (
                <div
                  key={room.id}
                  className={`p-4 rounded-xl text-center border-2 transition-all hover:shadow-lg ${
                    room.is_available
                      ? 'bg-success-50 border-success-500 text-success-900'
                      : 'bg-gray-100 border-slate-400 text-gray-900'
                  }`}
                >
                  <div className="font-bold text-lg">Room {room.room_number}</div>
                  {room.is_available ? (
                    <div className="text-sm mt-1 font-medium">Available</div>
                  ) : patientInRoom ? (
                    <button
                      onClick={() => navigate(`/patients/${patientInRoom.patient_id}`)}
                      className="text-sm mt-1 font-medium text-primary-700 hover:text-primary-900 hover:underline truncate block w-full"
                      title={`Click to view ${patientInRoom.patient_name}'s medical history`}
                    >
                      {patientInRoom.patient_name}
                    </button>
                  ) : (
                    <div className="text-sm mt-1 font-medium">Occupied</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6">
          {/* Left Column */}
          <div className="xl:col-span-1">
            {/* Doctor Notifications */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <svg className="w-5 h-5 text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    Doctor Notifications
                  </h3>
                  {doctorNotifications.length > 0 && (
                    <span className="bg-warning-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {doctorNotifications.filter(n => !n.is_read).length} new
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {doctorNotifications.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {doctorNotifications.slice(0, 5).map((notification) => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                          !notification.is_read ? 'bg-warning-50' : ''
                        }`}
                        onClick={() => {
                          // Find and select the patient from the notification
                          const patient = assignedPatients.find(p => p.id === notification.encounter_id);
                          if (patient) {
                            setSelectedPatient(patient);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {notification.patient_name}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              From Dr. {notification.doctor_name} • {safeFormatDate(notification.created_at, 'h:mm a', 'N/A')}
                            </p>
                          </div>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-warning-500 rounded-full flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <p className="text-sm">No notifications</p>
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Patients List */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
              {/* Header */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <h2 className="text-sm font-semibold text-white">
                      My Assigned Patients
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-primary-500 text-white text-xs font-bold rounded-full">
                    {assignedPatients.length}
                  </span>
                </div>
              </div>

              {/* Column Headers */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-1"></div>
                <div className="col-span-5">Patient</div>
                <div className="col-span-3">Room</div>
                <div className="col-span-3 text-right">ID</div>
              </div>

              {/* Patient List */}
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {assignedPatients.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => handleSelectPatient(patient)}
                    className={`px-4 py-2.5 grid grid-cols-12 gap-2 items-center cursor-pointer transition-all duration-150 hover:bg-primary-50 group ${
                      selectedPatient?.id === patient.id
                        ? 'bg-primary-100 border-l-4 border-primary-600'
                        : 'border-l-4 border-transparent hover:border-l-4 hover:border-primary-300'
                    }`}
                  >
                    {/* Priority Indicator */}
                    <div className="col-span-1 flex justify-center">
                      <div className={`w-3 h-3 rounded-full shadow-sm ${
                        patient.current_priority === 'red'
                          ? 'bg-danger-500 animate-pulse shadow-danger-300'
                          : patient.current_priority === 'yellow'
                          ? 'bg-warning-400 shadow-warning-200'
                          : 'bg-success-500 shadow-success-200'
                      }`} title={`Priority: ${patient.current_priority.toUpperCase()}`} />
                    </div>

                    {/* Patient Name */}
                    <div className="col-span-5">
                      <div className="flex items-center gap-1">
                        {patient.from_doctor && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-secondary-100 text-secondary-700 border border-secondary-300" title="Returned from Doctor">
                            <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Dr
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/patients/${patient.patient_id}`);
                          }}
                          className={`font-semibold text-sm text-left truncate transition-colors ${
                            selectedPatient?.id === patient.id
                              ? 'text-primary-800'
                              : 'text-gray-800 group-hover:text-primary-600'
                          }`}
                          title={patient.patient_name}
                        >
                          {patient.patient_name}
                        </button>
                      </div>
                    </div>

                    {/* Room */}
                    <div className="col-span-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        patient.room_number
                          ? 'text-gray-700'
                          : 'text-warning-600'
                      }`}>
                        {patient.room_number ? (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            Rm {patient.room_number}
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            No Room
                          </>
                        )}
                      </span>
                    </div>

                    {/* Patient Number */}
                    <div className="col-span-3 text-right">
                      <span className="text-xs text-gray-500 font-mono">
                        {patient.patient_number}
                      </span>
                    </div>
                  </div>
                ))}

                {assignedPatients.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <p className="text-sm font-medium">No assigned patients</p>
                  </div>
                )}
              </div>

              {/* Footer with Legend */}
              {assignedPatients.length > 0 && (
                <div className="bg-gray-50 border-t border-gray-200 px-4 py-2">
                  <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-success-500"></span> Low
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-warning-400"></span> Medium
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-danger-500"></span> High
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Short Stay Unit */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    <h2 className="text-sm font-semibold text-white">Short Stay Unit</h2>
                  </div>
                  <span className="px-2.5 py-1 bg-secondary-500 text-white text-xs font-bold rounded-full">
                    {shortStayBeds.filter(b => b.is_available).length}/{shortStayBeds.length}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Bed Status Cards */}
                <div className="grid grid-cols-2 gap-2">
                  {shortStayBeds.map((bed) => (
                    <div
                      key={bed.id}
                      className={`p-3 rounded-lg border-2 ${
                        bed.is_available
                          ? 'border-success-300 bg-success-50'
                          : 'border-danger-300 bg-danger-50'
                      }`}
                    >
                      <div className="font-semibold text-gray-900 text-sm">{bed.bed_name}</div>
                      {bed.is_available ? (
                        <div className="flex items-center gap-1 text-success-700 text-xs mt-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Available
                        </div>
                      ) : (
                        <div className="mt-1">
                          <div className="text-danger-700 text-xs font-medium truncate">{bed.patient_name}</div>
                          <button
                            onClick={() => handleReleaseShortStayBed(bed.id)}
                            className="text-xs text-danger-600 hover:text-danger-800 underline mt-1"
                          >
                            Release
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Assignment Form */}
                {selectedPatient && shortStayBeds.some(b => b.is_available) && (
                  <div className="space-y-2 pt-2 border-t border-violet-200">
                    <select
                      value={selectedBedId || ''}
                      onChange={(e) => setSelectedBedId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-secondary-500 bg-white text-sm"
                    >
                      <option value="">Select a bed...</option>
                      {shortStayBeds.filter(b => b.is_available).map((bed) => (
                        <option key={bed.id} value={bed.id}>{bed.bed_name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={shortStayNotes}
                      onChange={(e) => setShortStayNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-secondary-500 bg-white text-sm"
                      placeholder="Reason (optional)"
                    />
                    <button
                      onClick={handleAssignShortStayBed}
                      disabled={!selectedBedId}
                      className="w-full px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Assign to Bed
                    </button>
                  </div>
                )}

                {!selectedPatient && (
                  <p className="text-sm text-secondary-600 text-center py-2">
                    Select a patient to assign
                  </p>
                )}

                {selectedPatient && !shortStayBeds.some(b => b.is_available) && (
                  <p className="text-sm text-danger-600 text-center py-2">
                    All beds are occupied
                  </p>
                )}
              </div>
            </div>

          </div>

          {/* Patient Details & Actions */}
          <div className="xl:col-span-2">
            {selectedPatient ? (
              <div className="space-y-4">
                {/* Patient Info Header */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedPatient.patient_name}</h2>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-lg font-semibold">
                          Patient #: {selectedPatient.patient_number}
                        </span>
                        <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-lg font-semibold">
                          Encounter #: {selectedPatient.encounter_number}
                        </span>
                      </div>
                    </div>
                    <div className={`px-5 py-3 rounded-xl font-bold text-sm shadow-md ${
                      selectedPatient.current_priority === 'red' ? 'bg-danger-100 text-danger-800 border border-danger-300' :
                      selectedPatient.current_priority === 'yellow' ? 'bg-warning-100 text-warning-800 border border-warning-300' :
                      'bg-success-100 text-success-800 border border-success-300'
                    }`}>
                      PRIORITY: {selectedPatient.current_priority.toUpperCase()}
                    </div>
                  </div>

                  {/* Progress Indicator */}
                  <div className="mt-6 mb-4">
                    {(() => {
                      // Calculate progress based on workflow_status
                      const workflowStatus = selectedPatient.workflow_status || 'checked_in';
                      const hasOrders = labOrders.length > 0 || imagingOrders.length > 0 || pharmacyOrders.length > 0;
                      const allOrdersComplete = hasOrders &&
                        [...labOrders, ...imagingOrders, ...pharmacyOrders].every(order => order.status === 'completed');

                      // Map workflow_status to stage and progress
                      const statusMap: Record<string, { stage: string; progress: number; color: string }> = {
                        'checked_in': { stage: 'Checked In', progress: 10, color: 'bg-gray-500' },
                        'in_room': { stage: 'In Room', progress: 15, color: 'bg-blue-500' },
                        'vitals_complete': { stage: 'Vitals Complete', progress: 30, color: 'bg-blue-600' },
                        'with_nurse': { stage: 'With Nurse', progress: 35, color: 'bg-primary-500' },
                        'waiting_for_doctor': { stage: 'Waiting for Doctor', progress: 45, color: 'bg-yellow-500' },
                        'with_doctor': { stage: 'With Doctor', progress: 55, color: 'bg-purple-500' },
                        'at_lab': { stage: 'At Lab', progress: 65, color: 'bg-teal-500' },
                        'at_imaging': { stage: 'At Imaging', progress: 65, color: 'bg-indigo-500' },
                        'at_pharmacy': { stage: 'At Pharmacy', progress: 75, color: 'bg-green-500' },
                        'ready_for_checkout': { stage: 'Ready for Checkout', progress: 90, color: 'bg-success-500' },
                      };

                      let { stage, progress, color } = statusMap[workflowStatus] || statusMap['checked_in'];

                      // Adjust for orders completion
                      if (allOrdersComplete && progress < 85) {
                        progress = 85;
                        stage = 'Orders Complete';
                      }

                      // Get location color for badge
                      const isAtDepartment = ['at_lab', 'at_imaging', 'at_pharmacy'].includes(workflowStatus);

                      return (
                        <div className="bg-gradient-to-br from-gray-50 via-primary-50 to-secondary-50 p-6 rounded-2xl border-2 border-primary-200 shadow-lg">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Patient Journey</div>
                              <div className="flex items-center gap-3">
                                <div className="text-lg font-bold text-gray-900">{stage}</div>
                                {isAtDepartment && (
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold text-white animate-pulse ${
                                    workflowStatus === 'at_lab' ? 'bg-teal-500' :
                                    workflowStatus === 'at_imaging' ? 'bg-indigo-500' :
                                    'bg-green-500'
                                  }`}>
                                    {workflowStatus === 'at_lab' ? '🔬 Currently at Lab' :
                                     workflowStatus === 'at_imaging' ? '📷 Currently at Imaging' :
                                     '💊 Currently at Pharmacy'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-black bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                                {progress}%
                              </div>
                              <div className="text-xs text-gray-500 font-semibold">Complete</div>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                            <div
                              className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out shadow-lg ${
                                isAtDepartment ? color : 'bg-gradient-to-r from-primary-500 via-secondary-500 to-secondary-500'
                              }`}
                              style={{ width: `${progress}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent animate-pulse"></div>
                            </div>

                            {/* Milestone markers */}
                            <div className="absolute top-1/2 -translate-y-1/2 w-full flex justify-between px-1">
                              {[15, 30, 45, 65, 85, 100].map((milestone) => (
                                <div
                                  key={milestone}
                                  className={`w-2 h-2 rounded-full border-2 transition-all duration-300 ${
                                    progress >= milestone
                                      ? 'bg-white border-primary-600 scale-110 shadow-lg'
                                      : 'bg-gray-300 border-gray-400'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Order Status Badges */}
                          {hasOrders && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider w-full mb-1">
                                Active Orders:
                              </div>
                              {labOrders.length > 0 && (
                                <div className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
                                  labOrders.every(o => o.status === 'completed')
                                    ? 'bg-success-100 text-success-800 border border-success-300'
                                    : labOrders.some(o => o.status === 'in_progress')
                                    ? 'bg-primary-100 text-primary-800 border border-primary-300 animate-pulse'
                                    : 'bg-warning-100 text-warning-800 border border-warning-300'
                                }`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                  </svg>
                                  Labs ({labOrders.length})
                                  {labOrders.every(o => o.status === 'completed') ? ' ✓' :
                                   labOrders.some(o => o.status === 'in_progress') ? ' ⏳' : ' ⏸'}
                                </div>
                              )}
                              {pharmacyOrders.length > 0 && (
                                <div className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
                                  pharmacyOrders.every(o => o.status === 'completed')
                                    ? 'bg-success-100 text-success-800 border border-success-300'
                                    : pharmacyOrders.some(o => o.status === 'in_progress')
                                    ? 'bg-primary-100 text-primary-800 border border-primary-300 animate-pulse'
                                    : 'bg-warning-100 text-warning-800 border border-warning-300'
                                }`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                  </svg>
                                  Pharmacy ({pharmacyOrders.length})
                                  {pharmacyOrders.every(o => o.status === 'completed') ? ' ✓' :
                                   pharmacyOrders.some(o => o.status === 'in_progress') ? ' ⏳' : ' ⏸'}
                                </div>
                              )}
                              {imagingOrders.length > 0 && (
                                <div className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
                                  imagingOrders.every(o => o.status === 'completed')
                                    ? 'bg-success-100 text-success-800 border border-success-300'
                                    : imagingOrders.some(o => o.status === 'in_progress')
                                    ? 'bg-primary-100 text-primary-800 border border-primary-300 animate-pulse'
                                    : 'bg-warning-100 text-warning-800 border border-warning-300'
                                }`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                  </svg>
                                  Imaging ({imagingOrders.length})
                                  {imagingOrders.every(o => o.status === 'completed') ? ' ✓' :
                                   imagingOrders.some(o => o.status === 'in_progress') ? ' ⏳' : ' ⏸'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-4 mt-4 border-t border-gray-200">
                    <div className="bg-gradient-to-br from-gray-50 to-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Room Assignment
                      </div>
                      {selectedPatient.room_number && !editingRoom ? (
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-xl text-gray-900">
                            {selectedPatient.room_name || `Room ${selectedPatient.room_number}`}
                          </div>
                          <button
                            onClick={() => setEditingRoom(true)}
                            className="px-3 py-1 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-semibold"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAssignRoom(selectedPatient.id, Number(e.target.value));
                                setEditingRoom(false);
                              }
                            }}
                            className="w-full px-3 py-2 border-2 border-warning-300 bg-warning-50 rounded-lg focus:ring-2 focus:ring-warning-500 focus:border-transparent font-semibold text-amber-900"
                            defaultValue=""
                          >
                            <option value="">
                              {selectedPatient.room_number ? '🔄 Select new room' : '⚠️ ASSIGN ROOM'}
                            </option>
                            {rooms
                              .filter((r) => r.is_available)
                              .map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.room_name || `Room ${room.room_number}`}
                                </option>
                              ))}
                          </select>
                          {editingRoom && (
                            <button
                              onClick={() => setEditingRoom(false)}
                              className="w-full px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors font-semibold"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="bg-gradient-to-br from-primary-50 to-secondary-50 p-4 rounded-xl border border-primary-200">
                      <div className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Today's Visit
                      </div>
                      {selectedPatient.chief_complaint && !editingTodaysVisit ? (
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-lg text-gray-900">{selectedPatient.chief_complaint}</div>
                          <button
                            onClick={() => {
                              setTodaysVisitValue(selectedPatient.chief_complaint);
                              setEditingTodaysVisit(true);
                            }}
                            className="px-3 py-1 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-semibold"
                          >
                            Edit
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <textarea
                              value={todaysVisitValue}
                              onChange={(e) => setTodaysVisitValue(e.target.value)}
                              className="flex-1 px-3 py-2 border-2 border-warning-300 bg-warning-50 rounded-lg focus:ring-2 focus:ring-warning-500 focus:border-transparent font-semibold text-amber-900 resize-none"
                              rows={2}
                              placeholder="Enter patient's reason for today's visit... (or use voice)"
                              autoFocus
                            />
                            <VoiceDictationButton
                              onTranscriptChange={setTodaysVisitValue}
                              currentValue={todaysVisitValue}
                              appendMode={true}
                              size="md"
                              showStatus={false}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleUpdateTodaysVisit}
                              className="flex-1 px-3 py-1.5 bg-success-600 text-white text-sm rounded-lg hover:bg-success-700 transition-colors font-semibold"
                            >
                              Save
                            </button>
                            {selectedPatient.chief_complaint && (
                              <button
                                onClick={() => {
                                  setEditingTodaysVisit(false);
                                  setTodaysVisitValue('');
                                }}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors font-semibold"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`p-4 rounded-xl border flex items-center justify-center ${
                      doctorAlertedPatients.has(selectedPatient.id)
                        ? 'bg-gradient-to-br from-primary-50 to-secondary-50 border-primary-200'
                        : 'bg-gradient-to-br from-success-50 to-success-50 border-success-200'
                    }`}>
                      {doctorAlertedPatients.has(selectedPatient.id) ? (
                        <div className="w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Doctor Alerted
                        </div>
                      ) : (
                        <button
                          onClick={handleAlertDoctor}
                          className="w-full px-6 py-3 bg-gradient-to-r from-success-600 to-success-600 text-white rounded-xl hover:from-success-700 hover:to-success-700 transition-all duration-300 font-bold text-sm shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          Alert Doctor
                          <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Action Buttons - Lab, Imaging, Documents */}
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <button
                      onClick={() => setShowLabOrderModal(true)}
                      className="p-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-primary-50 text-primary-700 border-2 border-primary-200 hover:bg-primary-100 hover:border-primary-300"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      Order Labs
                    </button>
                    <button
                      onClick={() => setShowImagingOrderModal(true)}
                      className="p-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-secondary-50 text-secondary-700 border-2 border-secondary-200 hover:bg-secondary-100 hover:border-secondary-300"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                      Order Imaging
                    </button>
                    <button
                      onClick={() => setActiveTab('documents')}
                      className={`p-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'documents'
                          ? 'bg-warning-100 text-warning-800 border-2 border-warning-300'
                          : 'bg-warning-50 text-warning-700 border-2 border-warning-200 hover:bg-warning-100 hover:border-warning-300'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Documents
                    </button>
                  </div>
                </div>

                {/* Clinical Notes Section */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                  <div className="flex justify-between items-center p-6 pb-0 mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">Clinical Notes</h2>
                  </div>
                  <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-50 px-6">
                    <nav className="flex -mb-px overflow-x-auto">
                      <button
                        onClick={() => setActiveTab('hp')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeTab === 'hp'
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        SOAP
                      </button>
                      <button
                        onClick={() => setActiveTab('vitals')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeTab === 'vitals'
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Vital Signs
                      </button>
                      <button
                        onClick={() => setActiveTab('orders')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                          activeTab === 'orders'
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Doctor's Orders
                        {(labOrders.length > 0 || imagingOrders.length > 0 || pharmacyOrders.length > 0) && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-primary-100 text-primary-800 rounded-full">
                            {labOrders.length + imagingOrders.length + pharmacyOrders.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setActiveTab('procedures')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'procedures'
                            ? 'border-success-500 text-success-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Nurse Procedures
                        {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length > 0 && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-success-100 text-success-800 rounded-full">
                            {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setActiveTab('notes')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'notes'
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Clinical Notes
                      </button>
                      <button
                        onClick={() => setActiveTab('routing')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'routing'
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Patient Routing
                      </button>
                      <button
                        onClick={() => setActiveTab('documents')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'documents'
                            ? 'border-warning-500 text-warning-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Documents
                      </button>
                    </nav>
                  </div>

                  {/* Tab Content */}
                  <div className="p-6">
                    {/* SOAP Tab */}
                    {activeTab === 'hp' && selectedPatient && (
                      <div>
                        <HPAccordion
                          encounterId={selectedPatient.id}
                          patientId={selectedPatient.patient_id}
                          userRole="nurse"
                          vitalSigns={selectedPatient.vital_signs}
                        />
                      </div>
                    )}

                    {/* Vital Signs Tab */}
                    {activeTab === 'vitals' && (
                      <div className="space-y-6">
                        {/* Display Current Vital Signs */}
                        {selectedPatient?.vital_signs && Object.keys(selectedPatient.vital_signs).length > 0 ? (
                          <div className="bg-gradient-to-br from-primary-50 to-secondary-50 border border-primary-200 rounded-xl p-5">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Current Vital Signs
                              </h3>
                              <button
                                onClick={() => setShowVitalsHistory(true)}
                                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 font-medium"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                View History
                              </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {selectedPatient.vital_signs.temperature && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Temperature</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.temperature}°{selectedPatient.vital_signs.temperature_unit || 'F'}
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.heart_rate && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Heart Rate</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.heart_rate} <span className="text-sm font-normal">bpm</span>
                                  </div>
                                </div>
                              )}
                              {(selectedPatient.vital_signs.blood_pressure_systolic || selectedPatient.vital_signs.blood_pressure_diastolic) && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Blood Pressure</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.blood_pressure_systolic || '--'}/{selectedPatient.vital_signs.blood_pressure_diastolic || '--'} <span className="text-sm font-normal">mmHg</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.respiratory_rate && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Resp. Rate</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.respiratory_rate} <span className="text-sm font-normal">/min</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.oxygen_saturation && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">SpO2</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.oxygen_saturation}%
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.weight && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Weight</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.weight} <span className="text-sm font-normal">{selectedPatient.vital_signs.weight_unit || 'lbs'}</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.height && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Height</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.height} <span className="text-sm font-normal">{selectedPatient.vital_signs.height_unit || 'in'}</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.pain_level !== undefined && selectedPatient.vital_signs.pain_level !== null && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Pain Level</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.pain_level}/10
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 text-warning-800 flex items-center gap-3">
                            <svg className="w-5 h-5 text-warning-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="font-medium">No vital signs recorded yet. Please enter vital signs below.</span>
                          </div>
                        )}

                        {/* Vital Signs Entry Form */}
                        <div className="bg-white border border-gray-200 rounded-xl p-5">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                              <svg className="w-5 h-5 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              {selectedPatient?.vital_signs && Object.keys(selectedPatient.vital_signs).length > 0 ? 'Update Vital Signs' : 'Record New Vital Signs'}
                            </h3>
                            {vitalsModified && (
                              <span className="text-sm text-warning-600 flex items-center gap-1">
                                <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Auto-saving...
                              </span>
                            )}
                          </div>
                          <form onSubmit={handleSubmitVitals} className="space-y-5">
                            {/* Row 1: Temperature & Heart Rate */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Temperature */}
                              <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                                <label className="flex items-center gap-2 text-sm font-semibold text-orange-800 mb-3">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                  </svg>
                                  Temperature
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={vitals.temperature || ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? parseFloat(e.target.value) : undefined;
                                      setVitals({ ...vitals, temperature: value });
                                      setVitalsModified(true);
                                      if (value) {
                                        const tempType = vitals.temperature_unit === 'C' ? 'temperature_C' : 'temperature_F';
                                        const result = validateVitalSign(value, tempType);
                                        if (!result.isValid || result.isCritical) {
                                          setVitalErrors({ ...vitalErrors, temperature: result.message || 'Invalid value' });
                                        } else {
                                          const newErrors = { ...vitalErrors };
                                          delete newErrors.temperature;
                                          setVitalErrors(newErrors);
                                        }
                                      }
                                    }}
                                    className={`flex-1 min-w-0 text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none ${vitalErrors.temperature ? 'border-danger-500 bg-danger-50' : 'border-orange-300'}`}
                                    placeholder="98.6"
                                  />
                                  <select
                                    value={vitals.temperature_unit}
                                    onChange={(e) => setVitals({ ...vitals, temperature_unit: e.target.value as 'C' | 'F' })}
                                    className="flex-shrink-0 text-base sm:text-lg font-semibold py-3 px-2 sm:px-3 border-2 border-orange-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                                  >
                                    <option value="F">°F</option>
                                    <option value="C">°C</option>
                                  </select>
                                </div>
                                {vitalErrors.temperature && (
                                  <p className="text-xs text-danger-600 mt-2 font-medium">{vitalErrors.temperature}</p>
                                )}
                              </div>

                              {/* Heart Rate */}
                              <div className="bg-pink-50 rounded-xl p-4 border border-pink-200">
                                <label className="flex items-center gap-2 text-sm font-semibold text-pink-800 mb-3">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                  </svg>
                                  Heart Rate
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={vitals.heart_rate || ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                                      setVitals({ ...vitals, heart_rate: value });
                                      setVitalsModified(true);
                                      if (value) {
                                        const result = validateVitalSign(value, 'heart_rate');
                                        if (!result.isValid || result.isCritical) {
                                          setVitalErrors({ ...vitalErrors, heart_rate: result.message || 'Invalid value' });
                                        } else {
                                          const newErrors = { ...vitalErrors };
                                          delete newErrors.heart_rate;
                                          setVitalErrors(newErrors);
                                        }
                                      }
                                    }}
                                    className={`flex-1 min-w-0 text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 rounded-lg bg-white focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none ${vitalErrors.heart_rate ? 'border-danger-500 bg-danger-50' : 'border-pink-300'}`}
                                    placeholder="72"
                                  />
                                  <span className="flex-shrink-0 text-base sm:text-lg font-semibold text-pink-700 bg-pink-100 py-3 px-2 sm:px-3 rounded-lg border-2 border-pink-200">bpm</span>
                                </div>
                                {vitalErrors.heart_rate && (
                                  <p className="text-xs text-danger-600 mt-2 font-medium">{vitalErrors.heart_rate}</p>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Blood Pressure */}
                            <div className="bg-danger-50 rounded-xl p-4 border border-danger-200">
                              <label className="flex items-center gap-2 text-sm font-semibold text-danger-800 mb-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Blood Pressure
                              </label>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-danger-600 font-medium mb-1 text-center">Systolic</div>
                                  <input
                                    type="number"
                                    value={vitals.blood_pressure_systolic || ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                                      setVitals({ ...vitals, blood_pressure_systolic: value });
                                      setVitalsModified(true);
                                      if (value) {
                                        const result = validateVitalSign(value, 'blood_pressure_systolic');
                                        if (!result.isValid || result.isCritical) {
                                          setVitalErrors({ ...vitalErrors, blood_pressure_systolic: result.message || 'Invalid value' });
                                        } else {
                                          const newErrors = { ...vitalErrors };
                                          delete newErrors.blood_pressure_systolic;
                                          setVitalErrors(newErrors);
                                        }
                                      }
                                    }}
                                    className={`w-full text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 rounded-lg bg-white focus:ring-2 focus:ring-danger-500 focus:border-danger-500 outline-none ${vitalErrors.blood_pressure_systolic ? 'border-danger-500 bg-danger-100' : 'border-danger-300'}`}
                                    placeholder="120"
                                  />
                                </div>
                                <span className="flex-shrink-0 text-2xl sm:text-3xl font-bold text-danger-400">/</span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-danger-600 font-medium mb-1 text-center">Diastolic</div>
                                  <input
                                    type="number"
                                    value={vitals.blood_pressure_diastolic || ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                                      setVitals({ ...vitals, blood_pressure_diastolic: value });
                                      setVitalsModified(true);
                                      if (value) {
                                        const result = validateVitalSign(value, 'blood_pressure_diastolic');
                                        if (!result.isValid || result.isCritical) {
                                          setVitalErrors({ ...vitalErrors, blood_pressure_diastolic: result.message || 'Invalid value' });
                                        } else {
                                          const newErrors = { ...vitalErrors };
                                          delete newErrors.blood_pressure_diastolic;
                                          setVitalErrors(newErrors);
                                        }
                                      }
                                    }}
                                    className={`w-full text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 rounded-lg bg-white focus:ring-2 focus:ring-danger-500 focus:border-danger-500 outline-none ${vitalErrors.blood_pressure_diastolic ? 'border-danger-500 bg-danger-100' : 'border-danger-300'}`}
                                    placeholder="80"
                                  />
                                </div>
                                <span className="flex-shrink-0 text-sm sm:text-lg font-semibold text-danger-700 bg-danger-100 py-3 px-2 sm:px-3 rounded-lg border-2 border-danger-200">mmHg</span>
                              </div>
                              {(vitalErrors.blood_pressure_systolic || vitalErrors.blood_pressure_diastolic) && (
                                <p className="text-xs text-danger-600 mt-2 font-medium">
                                  {vitalErrors.blood_pressure_systolic || vitalErrors.blood_pressure_diastolic}
                                </p>
                              )}
                            </div>

                            {/* Row 3: Respiratory Rate & O2 Saturation */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Respiratory Rate */}
                              <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-200">
                                <label className="flex items-center gap-2 text-sm font-semibold text-cyan-800 mb-3">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                  Resp. Rate
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={vitals.respiratory_rate || ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                                      setVitals({ ...vitals, respiratory_rate: value });
                                      setVitalsModified(true);
                                      if (value) {
                                        const result = validateVitalSign(value, 'respiratory_rate');
                                        if (!result.isValid || result.isCritical) {
                                          setVitalErrors({ ...vitalErrors, respiratory_rate: result.message || 'Invalid value' });
                                        } else {
                                          const newErrors = { ...vitalErrors };
                                          delete newErrors.respiratory_rate;
                                          setVitalErrors(newErrors);
                                        }
                                      }
                                    }}
                                    className={`flex-1 min-w-0 text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 rounded-lg bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none ${vitalErrors.respiratory_rate ? 'border-danger-500 bg-danger-50' : 'border-cyan-300'}`}
                                    placeholder="16"
                                  />
                                  <span className="flex-shrink-0 text-base sm:text-lg font-semibold text-cyan-700 bg-cyan-100 py-3 px-2 sm:px-3 rounded-lg border-2 border-cyan-200">/min</span>
                                </div>
                                {vitalErrors.respiratory_rate && (
                                  <p className="text-xs text-danger-600 mt-2 font-medium">{vitalErrors.respiratory_rate}</p>
                                )}
                              </div>

                              {/* O2 Saturation */}
                              <div className="bg-primary-50 rounded-xl p-4 border border-primary-200">
                                <label className="flex items-center gap-2 text-sm font-semibold text-primary-800 mb-3">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                  </svg>
                                  SpO2
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={vitals.oxygen_saturation || ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                                      setVitals({ ...vitals, oxygen_saturation: value });
                                      setVitalsModified(true);
                                      if (value) {
                                        const result = validateVitalSign(value, 'oxygen_saturation');
                                        if (!result.isValid || result.isCritical) {
                                          setVitalErrors({ ...vitalErrors, oxygen_saturation: result.message || 'Invalid value' });
                                        } else {
                                          const newErrors = { ...vitalErrors };
                                          delete newErrors.oxygen_saturation;
                                          setVitalErrors(newErrors);
                                        }
                                      }
                                    }}
                                    className={`flex-1 min-w-0 text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ${vitalErrors.oxygen_saturation ? 'border-danger-500 bg-danger-50' : 'border-primary-300'}`}
                                    placeholder="98"
                                  />
                                  <span className="flex-shrink-0 text-base sm:text-lg font-semibold text-primary-700 bg-primary-100 py-3 px-2 sm:px-3 rounded-lg border-2 border-primary-200">%</span>
                                </div>
                                {vitalErrors.oxygen_saturation && (
                                  <p className="text-xs text-danger-600 mt-2 font-medium">{vitalErrors.oxygen_saturation}</p>
                                )}
                              </div>
                            </div>

                            {/* Row 4: Weight & Height */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Weight */}
                              <div className="bg-success-50 rounded-xl p-4 border border-success-200">
                                <label className="flex items-center gap-2 text-sm font-semibold text-success-800 mb-3">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                  </svg>
                                  Weight
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={vitals.weight || ''}
                                    onChange={(e) => {
                                      setVitals({ ...vitals, weight: e.target.value ? parseFloat(e.target.value) : undefined });
                                      setVitalsModified(true);
                                    }}
                                    className="flex-1 min-w-0 text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 border-success-300 rounded-lg bg-white focus:ring-2 focus:ring-success-500 focus:border-success-500 outline-none"
                                    placeholder="150"
                                  />
                                  <select
                                    value={vitals.weight_unit}
                                    onChange={(e) => setVitals({ ...vitals, weight_unit: e.target.value as 'kg' | 'lbs' })}
                                    className="flex-shrink-0 text-base sm:text-lg font-semibold py-3 px-2 sm:px-3 border-2 border-success-300 rounded-lg bg-white focus:ring-2 focus:ring-success-500 focus:border-success-500 outline-none"
                                  >
                                    <option value="lbs">lbs</option>
                                    <option value="kg">kg</option>
                                  </select>
                                </div>
                              </div>

                              {/* Height */}
                              <div className="bg-secondary-50 rounded-xl p-4 border border-secondary-200">
                                <label className="flex items-center gap-2 text-sm font-semibold text-secondary-800 mb-3">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                                  </svg>
                                  Height
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={vitals.height || ''}
                                    onChange={(e) => {
                                      setVitals({ ...vitals, height: e.target.value ? parseFloat(e.target.value) : undefined });
                                      setVitalsModified(true);
                                    }}
                                    className="flex-1 min-w-0 text-xl sm:text-2xl font-bold text-center py-3 px-2 border-2 border-secondary-300 rounded-lg bg-white focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500 outline-none"
                                    placeholder="68"
                                  />
                                  <select
                                    value={vitals.height_unit}
                                    onChange={(e) => setVitals({ ...vitals, height_unit: e.target.value as 'cm' | 'in' })}
                                    className="flex-shrink-0 text-base sm:text-lg font-semibold py-3 px-2 sm:px-3 border-2 border-secondary-300 rounded-lg bg-white focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500 outline-none"
                                  >
                                    <option value="in">in</option>
                                    <option value="cm">cm</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            <button type="submit" className="btn-primary w-full py-4 text-lg font-bold">
                              Save Vital Signs
                            </button>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Doctor's Orders Tab */}
                    {activeTab === 'orders' && (
                      <div className="space-y-4">
                        {/* Create Lab Order Button */}
                        <div className="flex justify-end mb-4">
                          <button
                            onClick={() => setShowLabOrderModal(true)}
                            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 flex items-center gap-2 text-sm font-medium"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Create Lab Order
                          </button>
                        </div>

                        {/* Doctor's Instructions for Nurse */}
                        {clinicalNotes.filter(n => n.note_type === 'doctor_to_nurse').length > 0 && (
                          <div className="mb-6">
                            <h3 className="text-lg font-bold text-primary-700 mb-3 flex items-center gap-2">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              </svg>
                              Doctor's Instructions for Nurse
                            </h3>
                            <div className="space-y-2">
                              {clinicalNotes
                                .filter(n => n.note_type === 'doctor_to_nurse')
                                .map((note) => (
                                  <div key={note.id} className="border-2 border-primary-300 rounded-lg p-4 bg-primary-50 shadow-md">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-primary-700 font-semibold">
                                        Dr. {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <span className="px-2 py-1 bg-primary-600 text-white text-xs font-bold rounded-full">
                                        NURSE INSTRUCTIONS
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-900 font-medium whitespace-pre-wrap bg-white p-3 rounded border border-primary-200">
                                      {note.content}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Doctor's Procedural Notes */}
                        {clinicalNotes.filter(n => n.note_type === 'doctor_procedural').length > 0 && (
                          <div className="mb-6">
                            <h3 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                              Doctor's Procedural Notes
                            </h3>
                            <div className="space-y-2">
                              {clinicalNotes
                                .filter(n => n.note_type === 'doctor_procedural')
                                .map((note) => (
                                  <div key={note.id} className="border-2 border-gray-300 rounded-lg p-4 bg-gray-50 shadow-md">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-gray-700 font-semibold">
                                        Dr. {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <span className="px-2 py-1 bg-gray-600 text-white text-xs font-bold rounded-full">
                                        PROCEDURE
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-900 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200">
                                      {note.content}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {(labOrders.length > 0 || imagingOrders.length > 0 || pharmacyOrders.length > 0) ? (
                          <div>
                            {/* Lab Orders */}
                            {labOrders.length > 0 && (
                              <div className="mb-4">
                                <h3 className="text-lg font-semibold text-primary-700 mb-2">Laboratory Orders</h3>
                                <div className="space-y-2">
                                  {labOrders.map((order) => (
                                    <div key={order.id} className="border border-primary-200 rounded-lg p-3 bg-primary-50">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900">{order.test_name}</h4>
                                          {order.test_code && (
                                            <p className="text-sm text-gray-600">Code: {order.test_code}</p>
                                          )}
                                          <p className="text-xs text-gray-500 mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                          <p className="text-xs text-gray-400 mt-0.5">
                                            {safeFormatDate(order.ordered_date, 'MMM d, yyyy h:mm a')}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-danger-100 text-danger-800' :
                                            order.priority === 'urgent' ? 'bg-warning-100 text-warning-800' :
                                            'bg-success-100 text-success-800'
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
                                <h3 className="text-lg font-semibold text-primary-700 mb-2">Imaging Orders</h3>
                                <div className="space-y-2">
                                  {imagingOrders.map((order) => (
                                    <div key={order.id} className="border border-primary-200 rounded-lg p-3 bg-primary-50">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900">{order.imaging_type}</h4>
                                          <p className="text-sm text-gray-600">Body Part: {order.body_part}</p>
                                          <p className="text-xs text-gray-500 mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                          <p className="text-xs text-gray-400 mt-0.5">
                                            {safeFormatDate(order.ordered_date, 'MMM d, yyyy h:mm a')}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-danger-100 text-danger-800' :
                                            order.priority === 'urgent' ? 'bg-warning-100 text-warning-800' :
                                            'bg-success-100 text-success-800'
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
                                <h3 className="text-lg font-semibold text-primary-700 mb-2">Pharmacy Orders</h3>
                                <div className="space-y-2">
                                  {pharmacyOrders.map((order) => (
                                    <div key={order.id} className="border border-primary-200 rounded-lg p-3 bg-primary-50">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900">{order.medication_name}</h4>
                                          <p className="text-sm text-gray-600">
                                            {order.dosage} | {order.frequency} | {order.route}
                                          </p>
                                          <p className="text-xs text-gray-500 mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                          <p className="text-xs text-gray-400 mt-0.5">
                                            {safeFormatDate(order.ordered_date, 'MMM d, yyyy h:mm a')}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-danger-100 text-danger-800' :
                                            order.priority === 'urgent' ? 'bg-warning-100 text-warning-800' :
                                            'bg-success-100 text-success-800'
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
                                          procedure.status === 'pending' ? 'bg-warning-100 text-warning-800' :
                                          procedure.status === 'in_progress' ? 'bg-primary-100 text-primary-800' :
                                          'bg-success-100 text-success-800'
                                        }`}>
                                          {procedure.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-400 mt-1">
                                        {safeFormatDate(procedure.ordered_at, 'MMM d, yyyy h:mm a')}
                                      </p>
                                    </div>
                                    <div className="ml-4 flex gap-2">
                                      {procedure.status === 'pending' && (
                                        <button
                                          onClick={() => handleStartProcedure(procedure.id)}
                                          className="px-3 py-1 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700"
                                        >
                                          Start
                                        </button>
                                      )}
                                      {procedure.status === 'in_progress' && (
                                        <button
                                          onClick={() => handleCompleteProcedure(procedure.id)}
                                          className="px-3 py-1 text-sm font-medium text-white bg-success-600 rounded hover:bg-success-700"
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
                      <div className="space-y-6">
                        {/* Message to Doctor Form */}
                        <form onSubmit={handleSendDoctorMessage} className="bg-gradient-to-r from-secondary-50 to-secondary-50 p-4 rounded-xl border-2 border-secondary-200">
                          <h4 className="font-bold text-secondary-800 mb-3 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            Send Message to Doctor
                          </h4>
                          <SmartTextArea
                            value={doctorMessageContent}
                            onChange={setDoctorMessageContent}
                            placeholder="Type your message to the doctor about this patient..."
                            rows={4}
                            sectionId="assessment"
                            showVoiceDictation={true}
                            required
                          />
                          <button type="submit" className="mt-3 px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 transition-colors font-semibold flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                            Send to Doctor
                          </button>
                        </form>

                        {/* Add Clinical Note Form */}
                        <form onSubmit={handleAddNote} className="space-y-4">
                          <SmartTextArea
                            value={noteContent}
                            onChange={setNoteContent}
                            placeholder="Enter clinical notes... Start typing for medical term suggestions.\n\nUse the SOAP tab for detailed clinical documentation."
                            rows={6}
                            sectionId="hpi"
                            showVoiceDictation={true}
                            label="Add Clinical Note"
                            required
                          />

                          <div className="flex gap-2">
                            <button type="submit" className="btn-primary">
                              Add Note
                            </button>
                          </div>
                        </form>

                        {/* Clinical Notes */}
                        {clinicalNotes.length > 0 && (
                          <div className="mt-8">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Clinical Notes
                            </h3>
                            <div className="space-y-3">
                              {clinicalNotes.map((note: ClinicalNote, index: number) => (
                                <div
                                  key={note.id || index}
                                  className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                                        {note.note_type || 'Nurse Note'}
                                      </span>
                                      {note.created_by && (
                                        <span className="text-sm text-gray-600">
                                          by {note.created_by}
                                        </span>
                                      )}
                                    </div>
                                    {note.created_at && (
                                      <span className="text-xs text-gray-500">
                                        {new Date(note.created_at).toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                          hour: 'numeric',
                                          minute: '2-digit',
                                          hour12: true
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {clinicalNotes.length === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="mt-2">No clinical notes yet</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Patient Routing Tab */}
                    {activeTab === 'routing' && (
                      <div className="space-y-4">
                        <div className="bg-primary-50 border border-primary-200 rounded-lg p-6">
                          {/* Show current location if patient is at a department */}
                          {(() => {
                            const workflowStatus = selectedPatient?.workflow_status;
                            const isAtDepartment = ['at_lab', 'at_imaging', 'at_pharmacy'].includes(workflowStatus || '');
                            const currentDept = workflowStatus === 'at_lab' ? 'Lab' :
                                               workflowStatus === 'at_imaging' ? 'Imaging' :
                                               workflowStatus === 'at_pharmacy' ? 'Pharmacy' : null;

                            if (isAtDepartment && currentDept) {
                              return (
                                <div className={`mb-4 p-4 rounded-lg border-2 ${
                                  workflowStatus === 'at_lab' ? 'bg-teal-50 border-teal-300' :
                                  workflowStatus === 'at_imaging' ? 'bg-indigo-50 border-indigo-300' :
                                  'bg-green-50 border-green-300'
                                }`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full animate-pulse ${
                                      workflowStatus === 'at_lab' ? 'bg-teal-500' :
                                      workflowStatus === 'at_imaging' ? 'bg-indigo-500' :
                                      'bg-green-500'
                                    }`}></div>
                                    <span className="font-bold text-gray-900">
                                      Patient is currently at {currentDept}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600 mt-2">
                                    Patient must complete {currentDept} and return before being routed to another department.
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <p className="text-sm text-gray-600 mb-4">
                                Route patient to one department at a time. Patient will return to nurse after completing each department.
                              </p>
                            );
                          })()}
                          <div className="grid grid-cols-2 gap-3">
                            {(() => {
                              const workflowStatus = selectedPatient?.workflow_status;
                              const isAtDepartment = ['at_lab', 'at_imaging', 'at_pharmacy'].includes(workflowStatus || '');
                              const atLab = workflowStatus === 'at_lab';
                              const atImaging = workflowStatus === 'at_imaging';
                              const atPharmacy = workflowStatus === 'at_pharmacy';

                              return (
                                <>
                                  <button
                                    onClick={() => handleRouteToDepartment('lab')}
                                    disabled={atLab || (isAtDepartment && !atLab)}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${
                                      atLab
                                        ? 'bg-teal-600 text-white cursor-default'
                                        : isAtDepartment
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-primary-600 text-white hover:bg-primary-700'
                                    }`}
                                  >
                                    {atLab ? '🔬 At Lab' : 'Send to Lab'}
                                  </button>
                                  <button
                                    onClick={() => handleRouteToDepartment('pharmacy')}
                                    disabled={atPharmacy || (isAtDepartment && !atPharmacy)}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${
                                      atPharmacy
                                        ? 'bg-green-600 text-white cursor-default'
                                        : isAtDepartment
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-primary-600 text-white hover:bg-primary-700'
                                    }`}
                                  >
                                    {atPharmacy ? '💊 At Pharmacy' : 'Send to Pharmacy'}
                                  </button>
                                  <button
                                    onClick={() => handleRouteToDepartment('imaging')}
                                    disabled={atImaging || (isAtDepartment && !atImaging)}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${
                                      atImaging
                                        ? 'bg-indigo-600 text-white cursor-default'
                                        : isAtDepartment
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-primary-600 text-white hover:bg-primary-700'
                                    }`}
                                  >
                                    {atImaging ? '📷 At Imaging' : 'Send to Imaging'}
                                  </button>
                                  <button
                                    onClick={() => handleRouteToDepartment('receptionist')}
                                    disabled={isAtDepartment}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${
                                      isAtDepartment
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-primary-600 text-white hover:bg-primary-700'
                                    }`}
                                  >
                                    Send to Receptionist
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                          <div className="mt-4 pt-4 border-t border-primary-300 grid grid-cols-2 gap-3">
                            <button
                              onClick={handleReleaseRoom}
                              className="bg-warning-600 text-white py-3 rounded-lg font-semibold hover:bg-warning-700 transition-colors"
                            >
                              Release Room
                              <span className="block text-xs mt-1 font-normal">Free up the room</span>
                            </button>
                            <button
                              onClick={handleCompleteEncounter}
                              className="bg-danger-600 text-white py-3 rounded-lg font-semibold hover:bg-danger-700 transition-colors"
                            >
                              Complete Encounter
                              <span className="block text-xs mt-1 font-normal">Final step</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Documents Tab */}
                    {activeTab === 'documents' && (
                      <div className="space-y-4">
                        <div className="bg-warning-50 border border-warning-200 rounded-lg p-6">
                          <h3 className="text-lg font-bold text-warning-800 mb-4 flex items-center gap-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Scanned Documents
                          </h3>
                          <p className="text-sm text-gray-600 mb-4">
                            Upload and manage scanned documents for this patient (lab results, imaging reports, referral letters, etc.)
                          </p>

                          {/* Upload Area */}
                          <div className="border-2 border-dashed border-warning-300 rounded-lg p-8 text-center bg-white mb-4">
                            <svg className="w-12 h-12 mx-auto text-warning-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <p className="text-warning-700 font-semibold mb-2">Upload Document</p>
                            <p className="text-sm text-gray-500 mb-3">Drag and drop files here, or click to browse</p>
                            <button className="px-4 py-2 bg-warning-600 text-white rounded-lg hover:bg-warning-700 transition-colors font-semibold">
                              Select Files
                            </button>
                            <p className="text-xs text-gray-400 mt-2">PDF, JPG, PNG up to 10MB each</p>
                          </div>

                          {/* Document Categories */}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-white border border-warning-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-warning-700 font-semibold mb-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                Lab Results
                              </div>
                              <p className="text-sm text-gray-500">No documents uploaded</p>
                            </div>
                            <div className="bg-white border border-warning-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-warning-700 font-semibold mb-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                                Imaging Reports
                              </div>
                              <p className="text-sm text-gray-500">No documents uploaded</p>
                            </div>
                            <div className="bg-white border border-warning-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-warning-700 font-semibold mb-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Referral Letters
                              </div>
                              <p className="text-sm text-gray-500">No documents uploaded</p>
                            </div>
                            <div className="bg-white border border-warning-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-warning-700 font-semibold mb-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                                Other Documents
                              </div>
                              <p className="text-sm text-gray-500">No documents uploaded</p>
                            </div>
                          </div>

                          <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm text-primary-700">
                            <strong>Note:</strong> Document upload functionality coming soon. This feature will allow you to scan and attach documents directly to the patient's record.
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
                    <div className="absolute inset-0 bg-primary-200 rounded-full blur-3xl opacity-20"></div>
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

      {/* Patient Quick View Side Panel */}
      {quickViewPatientId && (
        <PatientQuickView
          patientId={quickViewPatientId}
          onClose={() => setQuickViewPatientId(null)}
          showHealthStatus={false}
        />
      )}

      {/* Vital Signs History Modal */}
      {showVitalsHistory && selectedPatient && (
        <VitalSignsHistory
          patientId={selectedPatient.patient_id}
          onClose={() => setShowVitalsHistory(false)}
        />
      )}

      {/* Lab Order Modal */}
      {showLabOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Create Lab Order</h2>
                <button
                  onClick={() => setShowLabOrderModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Select Doctor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ordering Doctor <span className="text-danger-500">*</span>
                  </label>
                  <select
                    value={labOrderForm.ordering_provider_id || ''}
                    onChange={(e) => setLabOrderForm({ ...labOrderForm, ordering_provider_id: Number(e.target.value) || null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select a doctor...</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        Dr. {doctor.first_name} {doctor.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Test Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Test Name <span className="text-danger-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={labOrderForm.test_name}
                    onChange={(e) => setLabOrderForm({ ...labOrderForm, test_name: e.target.value })}
                    placeholder="e.g., Complete Blood Count (CBC)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                {/* Test Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Test Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={labOrderForm.test_code}
                    onChange={(e) => setLabOrderForm({ ...labOrderForm, test_code: e.target.value })}
                    placeholder="e.g., CBC-001"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <div className="flex gap-3">
                    {(['routine', 'urgent', 'stat'] as const).map((priority) => (
                      <label
                        key={priority}
                        className={`flex-1 text-center px-3 py-2 rounded-lg cursor-pointer border-2 transition-colors ${
                          labOrderForm.priority === priority
                            ? priority === 'stat'
                              ? 'bg-danger-100 border-danger-500 text-danger-800'
                              : priority === 'urgent'
                              ? 'bg-warning-100 border-warning-500 text-warning-800'
                              : 'bg-success-100 border-success-500 text-success-800'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <input
                          type="radio"
                          name="priority"
                          value={priority}
                          checked={labOrderForm.priority === priority}
                          onChange={(e) => setLabOrderForm({ ...labOrderForm, priority: e.target.value as 'stat' | 'urgent' | 'routine' })}
                          className="sr-only"
                        />
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={labOrderForm.notes}
                    onChange={(e) => setLabOrderForm({ ...labOrderForm, notes: e.target.value })}
                    placeholder="Additional instructions or clinical notes..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowLabOrderModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateLabOrder}
                  disabled={creatingLabOrder}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed"
                >
                  {creatingLabOrder ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Imaging Order Modal */}
      {showImagingOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Create Imaging Order</h2>
                <button
                  onClick={() => setShowImagingOrderModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Select Doctor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ordering Doctor <span className="text-danger-500">*</span>
                  </label>
                  <select
                    value={imagingOrderForm.ordering_provider_id || ''}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, ordering_provider_id: Number(e.target.value) || null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  >
                    <option value="">Select a doctor...</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        Dr. {doctor.first_name} {doctor.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Study Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Study Type <span className="text-danger-500">*</span>
                  </label>
                  <select
                    value={imagingOrderForm.study_type}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, study_type: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  >
                    <option value="">Select study type...</option>
                    <option value="X-Ray">X-Ray</option>
                    <option value="CT Scan">CT Scan</option>
                    <option value="MRI">MRI</option>
                    <option value="Ultrasound">Ultrasound</option>
                    <option value="Mammogram">Mammogram</option>
                    <option value="Fluoroscopy">Fluoroscopy</option>
                    <option value="PET Scan">PET Scan</option>
                    <option value="Nuclear Medicine">Nuclear Medicine</option>
                  </select>
                </div>

                {/* Body Part */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Body Part / Region
                  </label>
                  <input
                    type="text"
                    value={imagingOrderForm.body_part}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, body_part: e.target.value })}
                    placeholder="e.g., Chest, Abdomen, Left Knee"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <div className="flex gap-3">
                    {(['routine', 'urgent', 'stat'] as const).map((priority) => (
                      <label
                        key={priority}
                        className={`flex-1 text-center px-3 py-2 rounded-lg cursor-pointer border-2 transition-colors ${
                          imagingOrderForm.priority === priority
                            ? priority === 'stat'
                              ? 'bg-danger-100 border-danger-500 text-danger-800'
                              : priority === 'urgent'
                              ? 'bg-warning-100 border-warning-500 text-warning-800'
                              : 'bg-success-100 border-success-500 text-success-800'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <input
                          type="radio"
                          name="imaging-priority"
                          value={priority}
                          checked={imagingOrderForm.priority === priority}
                          onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, priority: e.target.value as 'stat' | 'urgent' | 'routine' })}
                          className="sr-only"
                        />
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Clinical Indication */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Clinical Indication
                  </label>
                  <input
                    type="text"
                    value={imagingOrderForm.clinical_indication}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, clinical_indication: e.target.value })}
                    placeholder="e.g., Rule out fracture, Chest pain"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={imagingOrderForm.notes}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, notes: e.target.value })}
                    placeholder="Additional instructions or clinical notes..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowImagingOrderModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateImagingOrder}
                  disabled={creatingImagingOrder}
                  className="flex-1 px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 disabled:bg-secondary-400 disabled:cursor-not-allowed"
                >
                  {creatingImagingOrder ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default NurseDashboard;
