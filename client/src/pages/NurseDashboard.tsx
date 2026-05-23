import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../api/client';
import { format, parseISO, isValid } from 'date-fns';
import { validateVitalSign } from '../utils/vitalSignsValidation';
import HPAccordion from '../components/HPAccordion';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import AppLayout from '../components/AppLayout';
import { VoiceDictationButton } from '../components/VoiceDictationButton';
import { SmartTextArea } from '../components/SmartTextArea';
import PatientQuickView from '../components/PatientQuickView';
import VitalSignsHistory from '../components/VitalSignsHistory';
import PatientDocumentsPanel from '../components/PatientDocumentsPanel';
import NurseGuide from '../components/NurseGuide';
import AllergyWarningModal from '../components/AllergyWarningModal';
import LabTestSetChips from '../components/LabTestSetChips';
import type { LabTestSetItem } from '../api/labTestSets';
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
  is_checked_out?: boolean;
}

interface NurseProcedure {
  id: number;
  encounter_id: number;
  patient_id: number;
  procedure_name: string;
  status: string;
  notes: string;
  ordered_at: string;
  started_at: string;
  completed_at: string;
  ordered_by_name: string;
  performed_by_name: string;
  price: number;
}

interface AvailableProcedure {
  id: number;
  service_code: string;
  service_name: string;
  category: string;
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
  results?: string;
  results_available_at?: string;
  notes?: string;
  encounter_id?: number;
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
  const location = useLocation();
  const { showToast } = useNotification();
  const { confirm: confirmDialog, prompt: promptDialog } = useDialog();
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<AssignedPatient | null>(null);
  const selectedPatientRef = useRef<AssignedPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [nurseProcedures, setNurseProcedures] = useState<NurseProcedure[]>([]);
  const [availableProcedures, setAvailableProcedures] = useState<AvailableProcedure[]>([]);
  const [showAddProcedure, setShowAddProcedure] = useState(false);
  const [selectedProcedureId, setSelectedProcedureId] = useState<number | null>(null);
  const [procedureNotes, setProcedureNotes] = useState('');
  const [showProcedureHistory, setShowProcedureHistory] = useState(false);
  const [procedureHistory, setProcedureHistory] = useState<NurseProcedure[]>([]);
  const [orderingProcedure, setOrderingProcedure] = useState(false);
  const [editingProcedureId, setEditingProcedureId] = useState<number | null>(null);
  const [editProcedureNotes, setEditProcedureNotes] = useState('');
  const [editProcedureChargeId, setEditProcedureChargeId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [imagingOrders, setImagingOrders] = useState<ImagingOrder[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  // Patient-wide lab history (all encounters, completed only) so the nurse
  // can review past results without flipping through historical encounters.
  const [patientLabHistory, setPatientLabHistory] = useState<LabOrder[]>([]);
  const [showLabHistory, setShowLabHistory] = useState(false);
  const [nurseAllergyWarnings, setNurseAllergyWarnings] = useState<Array<{allergen: string, reaction: string, severity: string, match_type: string, explanation: string}>>([]);
  const [showNurseAllergyModal, setShowNurseAllergyModal] = useState(false);
  const [pendingAdminOrder, setPendingAdminOrder] = useState<{id: number; name: string} | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([]);

  // Follow-up/review task notifications
  const [dueTasksToday, setDueTasksToday] = useState<Array<{id: number, type: string, patient_name: string, patient_phone: string, review_reason: string}>>([]);
  const [dueTasksTomorrow, setDueTasksTomorrow] = useState<Array<{id: number, type: string, patient_name: string, patient_phone: string, review_reason: string}>>([]);

  // Vitals form state
  const [vitals, setVitals] = useState<VitalSigns>({
    temperature_unit: 'C',
    weight_unit: 'kg',
    height_unit: 'cm',
  });

  // Validation errors
  const [vitalErrors, setVitalErrors] = useState<Record<string, string>>({});

  // Notes state
  const [noteContent, setNoteContent] = useState('');
  const [doctorMessageContent, setDoctorMessageContent] = useState('');

  // Tab state for better UI organization
  const [activeTab, setActiveTab] = useState<'hp' | 'vitals' | 'orders' | 'procedures' | 'notes' | 'routing' | 'documents' | 'billing'>('hp');
  const [encounterInvoice, setEncounterInvoice] = useState<any>(null);

  // Room editing state
  const [editingRoom, setEditingRoom] = useState(false);

  // Today's Visit (Chief Complaint) editing state
  const [editingTodaysVisit, setEditingTodaysVisit] = useState(false);
  const [todaysVisitValue, setTodaysVisitValue] = useState('');

  // Patient Quick View state
  const [quickViewPatientId, setQuickViewPatientId] = useState<number | null>(null);

  // Vital Signs History state
  const [showVitalsHistory, setShowVitalsHistory] = useState(false);

  // Ref for scrolling to vitals form
  const vitalsFormRef = useRef<HTMLDivElement>(null);

  // Track which patients have had their doctor alerted
  const [doctorAlertedPatients, setDoctorAlertedPatients] = useState<Set<number>>(new Set());

  // Track routing status for each encounter (key: encounterId-department)
  const [routedDepartments, setRoutedDepartments] = useState<Set<string>>(new Set());

  // Auto-save for vitals — the debounce timer lives inside the useEffect,
  // so we only need a flag to know whether the user has touched anything.
  const [vitalsModified, setVitalsModified] = useState(false);

  // Short Stay Unit state
  const [shortStayBeds, setShortStayBeds] = useState<ShortStayBed[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<number | null>(null);
  const [shortStayNotes, setShortStayNotes] = useState('');

  // Main view state - derived from route
  const mainView = location.pathname === '/nurse/inventory' ? 'inventory' : 'patients';
  const [showGuide, setShowGuide] = useState(false);

  // Nurse Inventory state
  interface NurseInventoryItem {
    id: number;
    name: string;
    category: string;
    quantity: number;
    unit: string;
    min_quantity: number;
    location: string;
    unit_cost: number;
    last_restocked?: string;
  }
  const [nurseInventory, setNurseInventory] = useState<NurseInventoryItem[]>([]);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState<NurseInventoryItem | null>(null);
  const [inventoryForm, setInventoryForm] = useState({ name: '', category: 'Supplies', quantity: 0, unit: 'pcs', min_quantity: 0, location: '' });
  const [inventorySearch, setInventorySearch] = useState('');
  const [savingInventory, setSavingInventory] = useState(false);
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('all');
  const [inventorySortBy, setInventorySortBy] = useState<'name' | 'category' | 'quantity' | 'status'>('name');
  const [inventoryShowLowOnly, setInventoryShowLowOnly] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [addStockItem, setAddStockItem] = useState<NurseInventoryItem | null>(null);
  const [addStockQuantity, setAddStockQuantity] = useState(0);
  const [addStockNotes, setAddStockNotes] = useState('');

  // Doctor Notifications state
  const [doctorNotifications, setDoctorNotifications] = useState<DoctorNotification[]>([]);

  // Modal for expanding a Doctor Notification — shows full message,
  // doctor's follow-up + review context, and lets the nurse reschedule
  // either date inline.
  const [openNotification, setOpenNotification] = useState<DoctorNotification | null>(null);
  const [notificationDetails, setNotificationDetails] = useState<{
    alert: any;
    encounter: any;
    follow_up_appointment: any;
    review_task: any;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [editingFollowUpDate, setEditingFollowUpDate] = useState('');
  const [editingReviewDate, setEditingReviewDate] = useState('');
  const [savingReschedule, setSavingReschedule] = useState(false);

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

  // Initial load — runs once
  useEffect(() => {
    loadAssignedPatients();
    loadNurseProcedures();
    loadAvailableProcedures();
    loadRooms();
    loadShortStayBeds();
    loadDoctorNotifications();
    loadDueTasks();
    loadDoctors();
  }, []);

  // Load orders/notes when selected patient changes
  useEffect(() => {
    if (selectedPatient) {
      loadOrders();
      loadClinicalNotes();
    }
  }, [selectedPatient?.id]);

  // Polling — uses ref to avoid re-creating interval on patient selection
  useEffect(() => {
    const interval = setInterval(() => {
      loadAssignedPatients();
      loadNurseProcedures();
      loadRooms();
      loadShortStayBeds();
      loadDoctorNotifications();
      if (selectedPatientRef.current) {
        loadOrders();
        loadClinicalNotes();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load nurse inventory from API
  const loadNurseInventory = async () => {
    try {
      const res = await apiClient.get('/nurse/inventory');
      const items = (res.data.items || []).map((item: any) => ({
        id: item.id,
        name: item.item_name,
        category: item.category,
        quantity: item.quantity_on_hand,
        unit: item.unit,
        min_quantity: item.reorder_level,
        location: item.location || '',
        unit_cost: parseFloat(item.unit_cost) || 0,
        last_restocked: item.updated_at,
      }));
      setNurseInventory(items);
    } catch (error) {
      console.error('Error loading nurse inventory:', error);
    }
  };

  useEffect(() => {
    if (mainView === 'inventory') {
      loadNurseInventory();
    }
  }, [mainView]);

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
      // Use ref to avoid triggering useEffect loops
      if (selectedPatientRef.current) {
        const updatedSelectedPatient = uniquePatients.find((p: AssignedPatient) => p.id === selectedPatientRef.current!.id);
        if (updatedSelectedPatient) {
          // Only update state if data actually changed to avoid unnecessary re-renders
          setSelectedPatient(prev => {
            if (!prev || JSON.stringify(prev) !== JSON.stringify(updatedSelectedPatient)) {
              selectedPatientRef.current = updatedSelectedPatient;
              return updatedSelectedPatient;
            }
            return prev;
          });
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

  const loadAvailableProcedures = async () => {
    try {
      const res = await apiClient.get('/nurse-procedures/available');
      setAvailableProcedures(res.data.procedures || []);
    } catch (error) {
      console.error('Error loading available procedures:', error);
    }
  };

  const loadProcedureHistory = async (encounterId: number) => {
    try {
      const res = await apiClient.get(`/nurse-procedures?encounter_id=${encounterId}&status=all`);
      setProcedureHistory(res.data.procedures || []);
    } catch (error) {
      console.error('Error loading procedure history:', error);
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

  // Open the notification modal with full context (full message, follow-up
  // appointment, review task). Also marks the notification as read.
  const openNotificationModal = async (notification: DoctorNotification) => {
    setOpenNotification(notification);
    setNotificationDetails(null);
    setLoadingDetails(true);

    if (!notification.is_read) {
      try {
        await apiClient.post(`/workflow/alerts/${notification.id}/read`);
      } catch (_) { /* ignore */ }
    }

    try {
      const res = await apiClient.get(`/workflow/alerts/${notification.id}/details`);
      setNotificationDetails(res.data);
      // Pre-fill the edit fields with current scheduled dates so the nurse
      // can tweak instead of retyping
      const apptDate = res.data?.follow_up_appointment?.appointment_date;
      const reviewDate = res.data?.review_task?.scheduled_date;
      setEditingFollowUpDate(apptDate ? new Date(apptDate).toISOString().slice(0, 10) : '');
      setEditingReviewDate(reviewDate ? new Date(reviewDate).toISOString().slice(0, 10) : '');
    } catch (error) {
      console.error('Error loading notification details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeNotificationModal = () => {
    setOpenNotification(null);
    setNotificationDetails(null);
    setEditingFollowUpDate('');
    setEditingReviewDate('');
    // Refresh notifications list so the unread badge updates
    loadDoctorNotifications();
  };

  const rescheduleFollowUpAppointment = async () => {
    if (!notificationDetails?.follow_up_appointment || !editingFollowUpDate) return;
    setSavingReschedule(true);
    try {
      await apiClient.post('/workflow/follow-up/reschedule', {
        appointment_id: notificationDetails.follow_up_appointment.id,
        new_date: editingFollowUpDate,
      });
      showToast('Follow-up appointment rescheduled', 'success');
      // Refresh details
      const res = await apiClient.get(`/workflow/alerts/${openNotification!.id}/details`);
      setNotificationDetails(res.data);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to reschedule', 'error');
    } finally {
      setSavingReschedule(false);
    }
  };

  const rescheduleReviewTask = async () => {
    if (!notificationDetails?.review_task || !editingReviewDate) return;
    setSavingReschedule(true);
    try {
      await apiClient.post('/workflow/follow-up/reschedule', {
        follow_up_task_id: notificationDetails.review_task.id,
        new_date: editingReviewDate,
      });
      showToast('Review call rescheduled', 'success');
      // Refresh details
      const res = await apiClient.get(`/workflow/alerts/${openNotification!.id}/details`);
      setNotificationDetails(res.data);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to reschedule', 'error');
    } finally {
      setSavingReschedule(false);
    }
  };

  const openPatientFromNotification = () => {
    if (!openNotification) return;
    const patient = assignedPatients.find(p => p.id === openNotification.encounter_id);
    if (patient) {
      setSelectedPatient(patient);
    }
    closeNotificationModal();
  };

  const loadDueTasks = async () => {
    try {
      const res = await apiClient.get('/nurse/follow-up-tasks/due');
      setDueTasksToday(res.data.due_today || []);
      setDueTasksTomorrow(res.data.due_tomorrow || []);
    } catch (error) {
      console.error('Error loading due tasks:', error);
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
    selectedPatientRef.current = patient;
    setEditingRoom(false);
    setShowProcedureHistory(false);
    setProcedureHistory([]);
    setShowAddProcedure(false);

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

  // Apply a saved test set inside the nurse lab order modal — batch-creates
  // one lab_order per item using the doctor currently selected in the form.
  // Nurses can read + apply but cannot create new sets (that's doctor-only).
  const handleApplySetForNurse = async (items: LabTestSetItem[]) => {
    if (!selectedPatient) {
      showToast('Please select a patient first', 'warning');
      return;
    }
    if (!labOrderForm.ordering_provider_id) {
      showToast('Pick the ordering doctor first, then click the set.', 'warning');
      return;
    }
    setCreatingLabOrder(true);
    try {
      await Promise.all(
        items.map(it =>
          apiClient.post('/orders/lab', {
            encounter_id: selectedPatient.id,
            patient_id: selectedPatient.patient_id,
            test_name: it.test_name,
            priority: it.default_priority || 'routine',
            ordering_provider_id: labOrderForm.ordering_provider_id,
          })
        )
      );
      showToast(`Created ${items.length} lab order(s) from set`, 'success');
      setShowLabOrderModal(false);
      setLabOrderForm({
        test_name: '',
        test_code: '',
        priority: 'routine',
        ordering_provider_id: null,
        notes: '',
      });
      loadOrders();
    } catch (err) {
      const apiError = err as ApiError;
      showToast(apiError.response?.data?.error || 'Failed to apply test set', 'error');
    } finally {
      setCreatingLabOrder(false);
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
    if (!(await confirmDialog({ title: 'Release bed?', message: 'Are you sure you want to release this bed?', confirmLabel: 'Release' }))) {
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

    // Patient-wide lab history (completed only, last 20). Fires in parallel.
    try {
      const histRes = await apiClient.get(
        `/orders/lab?patient_id=${selectedPatient.patient_id}&status=completed&limit=20`
      );
      setPatientLabHistory(histRes.data.lab_orders || []);
    } catch (error) {
      console.error('Error loading patient lab history:', error);
      setPatientLabHistory([]);
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

      const patients = patientsRes.data.patients || [];
      // Deduplicate patients by encounter ID
      const updatedPatients = patients.filter((patient: AssignedPatient, index: number, self: AssignedPatient[]) =>
        index === self.findIndex((p) => p.id === patient.id)
      );
      setAssignedPatients(updatedPatients);
      setRooms(roomsRes.data.rooms || []);

      // Update selected patient with fresh data
      if (selectedPatientRef.current) {
        const updatedPatient = updatedPatients.find((p: AssignedPatient) => p.id === selectedPatientRef.current!.id);
        if (updatedPatient) {
          setSelectedPatient(updatedPatient);
          selectedPatientRef.current = updatedPatient;
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
    if (!(await confirmDialog({ title: 'Complete procedure?', message: 'This will automatically add charges to the invoice.', variant: 'success', confirmLabel: 'Complete' }))) {
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

  const handleOrderProcedure = async () => {
    if (!selectedPatient || !selectedProcedureId) return;

    const procedure = availableProcedures.find(p => p.id === selectedProcedureId);
    if (!procedure) return;

    setOrderingProcedure(true);
    try {
      const res = await apiClient.post('/nurse-procedures', {
        encounter_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        charge_master_id: procedure.id,
        procedure_name: procedure.service_name,
        notes: procedureNotes || null,
      });
      // Auto-start the procedure so nurse doesn't have to click Start separately
      if (res.data.procedure?.id) {
        await apiClient.post(`/nurse-procedures/${res.data.procedure.id}/start`);
      }
      showToast(`${procedure.service_name} started successfully`, 'success');
      setShowAddProcedure(false);
      setSelectedProcedureId(null);
      setProcedureNotes('');
      loadNurseProcedures();
    } catch (error) {
      console.error('Error ordering procedure:', error);
      showToast('Failed to add procedure', 'error');
    } finally {
      setOrderingProcedure(false);
    }
  };

  const handleCancelProcedure = async (procedureId: number) => {
    const reason = await promptDialog({
      title: 'Cancel procedure',
      message: 'Reason for cancellation (optional):',
      placeholder: 'Reason',
      multiline: true,
      confirmLabel: 'Cancel procedure',
      cancelLabel: 'Keep',
    });
    if (reason === null) return;

    try {
      await apiClient.post(`/nurse-procedures/${procedureId}/cancel`, { reason: reason || 'Cancelled by nurse' });
      showToast('Procedure cancelled', 'success');
      loadNurseProcedures();
    } catch (error) {
      console.error('Error cancelling procedure:', error);
      showToast('Failed to cancel procedure', 'error');
    }
  };

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
      if (!(await confirmDialog({
        title: 'Critical vital signs detected',
        message: warnings.join('\n') + '\n\nDo you want to continue?',
        variant: 'danger',
        confirmLabel: 'Continue',
      }))) {
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
        temperature_unit: 'C',
        weight_unit: 'kg',
        height_unit: 'cm',
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

  // Trigger auto-save when vitals change (with 3 second debounce).
  // Stringify vitals so React compares by value, not object reference —
  // otherwise this effect fires on every render and floods the API.
  const vitalsJson = JSON.stringify(vitals);
  useEffect(() => {
    if (!vitalsModified || !selectedPatient) return;

    const timer = setTimeout(() => {
      autoSaveVitals();
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitalsJson, vitalsModified, selectedPatient]);

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

  // Update triage priority
  const handleUpdateTriagePriority = async (priority: 'green' | 'yellow' | 'red') => {
    if (!selectedPatient) return;
    if (priority === selectedPatient.current_priority) return;

    const labels: Record<string, string> = { green: 'Green (Stable)', yellow: 'Yellow (Urgent)', red: 'Red (Critical)' };
    if (!(await confirmDialog({ title: 'Change triage priority?', message: `Change priority to ${labels[priority]}?`, variant: priority === 'red' ? 'danger' : priority === 'yellow' ? 'warning' : 'default', confirmLabel: 'Change priority' }))) return;

    try {
      await apiClient.post('/workflow/nurse/triage-priority', {
        encounter_id: selectedPatient.id,
        priority,
      });
      showToast(`Priority updated to ${priority.toUpperCase()}`, priority === 'red' ? 'warning' : 'success');
      setSelectedPatient({ ...selectedPatient, current_priority: priority });
      loadAssignedPatients();
    } catch (error) {
      showToast('Failed to update priority', 'error');
    }
  };

  // Record medication administration
  const handleAdministerMedication = async (orderId: number, medicationName: string) => {
    // Check allergy cross-reactivity before administering
    if (selectedPatient) {
      try {
        const res = await apiClient.post('/allergy-check', {
          patient_id: selectedPatient.patient_id,
          medication_name: medicationName,
        });

        if (res.data.warnings && res.data.warnings.length > 0) {
          setNurseAllergyWarnings(res.data.warnings);
          setPendingAdminOrder({ id: orderId, name: medicationName });
          setShowNurseAllergyModal(true);
          return;
        }
      } catch (error) {
        console.error('Error checking allergies:', error);
      }
    }

    await executeAdministration(orderId, medicationName);
  };

  const executeAdministration = async (orderId: number, medicationName: string) => {
    const notes = await promptDialog({
      title: 'Record administration',
      message: `Record administration notes for ${medicationName} (optional):`,
      placeholder: 'Notes',
      multiline: true,
      confirmLabel: 'Record',
    });
    if (notes === null) return;

    try {
      await apiClient.post('/workflow/nurse/administer-medication', {
        pharmacy_order_id: orderId,
        notes: notes || null,
      });
      showToast(`${medicationName} administration recorded`, 'success');
      if (selectedPatient) {
        const res = await apiClient.get(`/orders/encounter/${selectedPatient.id}`);
        setPharmacyOrders(res.data.pharmacy_orders || []);
      }
    } catch (error) {
      showToast('Failed to record administration', 'error');
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

  // Confirm medication pickup (changes status from 'ready' to 'dispensed')
  const confirmMedicationPickup = async (orderId: number) => {
    try {
      await apiClient.put(`/orders/pharmacy/${orderId}`, {
        status: 'dispensed'
      });
      showToast('Medication pickup confirmed', 'success');
      // Refresh pharmacy orders using the correct encounter-based endpoint
      if (selectedPatient) {
        const res = await apiClient.get(`/orders/encounter/${selectedPatient.id}`);
        setPharmacyOrders(res.data.pharmacy_orders || []);
      }
    } catch (error) {
      console.error('Error confirming pickup:', error);
      showToast('Failed to confirm pickup', 'error');
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

    if (!(await confirmDialog({ title: 'Send patient?', message: `Send patient to ${departmentNames[department]}?`, confirmLabel: 'Send' }))) {
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

    if (!(await confirmDialog({ title: 'Release room?', message: 'Are you sure you want to release the room?', confirmLabel: 'Release' }))) {
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

    if (!(await confirmDialog({ title: 'Complete encounter?', message: 'Are you sure you want to complete this encounter? This is the final step.', variant: 'success', confirmLabel: 'Complete' }))) {
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
      {/* Help / Guide button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          How-To Guide
        </button>
      </div>

      <NurseGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />

      {/* Room Status - At Top (only on patients view) */}
      {mainView === 'patients' && (
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
      )}

        {/* Patients View */}
        {mainView === 'patients' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6">
          {/* Left Column */}
          <div className="xl:col-span-1">
            {/* Follow-Up & Review Notifications */}
            <div className="bg-white rounded-xl shadow-lg border border-warning-200 overflow-hidden mb-4">
              <div className="bg-gradient-to-r from-warning-500 to-orange-500 px-4 py-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-white text-sm font-bold flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Notifications
                  </h3>
                  {(dueTasksToday.length + dueTasksTomorrow.length) > 0 && (
                    <span className="bg-white text-warning-700 px-2 py-0.5 rounded-full text-xs font-bold">
                      {dueTasksToday.length + dueTasksTomorrow.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                {dueTasksToday.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-danger-600 uppercase mb-1">Due Today ({dueTasksToday.length})</p>
                    {dueTasksToday.map((task) => (
                      <div key={task.id} className="flex items-center justify-between py-1.5 px-2 bg-danger-50 rounded mb-1">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{task.patient_name}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${task.type === 'review' ? 'bg-warning-100 text-warning-700' : 'bg-primary-100 text-primary-700'}`}>
                            {task.type === 'review' ? 'Review' : 'Follow-up'}
                          </span>
                        </div>
                        {task.patient_phone && <span className="text-xs text-gray-500">{task.patient_phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {dueTasksTomorrow.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-warning-600 uppercase mb-1">Due Tomorrow ({dueTasksTomorrow.length})</p>
                    {dueTasksTomorrow.map((task) => (
                      <div key={task.id} className="flex items-center justify-between py-1.5 px-2 bg-warning-50 rounded mb-1">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{task.patient_name}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${task.type === 'review' ? 'bg-warning-100 text-warning-700' : 'bg-primary-100 text-primary-700'}`}>
                            {task.type === 'review' ? 'Review' : 'Follow-up'}
                          </span>
                        </div>
                        {task.patient_phone && <span className="text-xs text-gray-500">{task.patient_phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {dueTasksToday.length === 0 && dueTasksTomorrow.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">No calls due today or tomorrow</p>
                )}
                <a href="/nurse/follow-up-calls" className="block text-center text-xs text-primary-600 hover:text-primary-800 font-medium pt-1">
                  View all calls →
                </a>
              </div>
            </div>

            {/* Doctor Notifications */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-white text-sm font-bold flex items-center gap-2">
                    <svg className="w-4 h-4 text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                        onClick={() => openNotificationModal(notification)}
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
                    className={`px-4 py-2.5 grid grid-cols-12 gap-2 items-center cursor-pointer transition-all duration-150 group ${
                      selectedPatient?.id === patient.id
                        ? 'bg-primary-100 border-l-4 border-primary-600'
                        : patient.is_checked_out
                        ? 'opacity-70 border-l-4 border-transparent hover:bg-gray-50 hover:border-gray-300'
                        : 'border-l-4 border-transparent hover:bg-primary-50 hover:border-l-4 hover:border-primary-300'
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
                        {patient.is_checked_out && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-gray-200 text-gray-700 border border-gray-300" title="Receptionist has checked this patient out — still editable until end of day.">
                            ✓ Out
                          </span>
                        )}
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
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-gray-500 mr-1">TRIAGE:</span>
                      {(['green', 'yellow', 'red'] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => handleUpdateTriagePriority(p)}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
                            selectedPatient.current_priority === p
                              ? p === 'red' ? 'bg-danger-600 text-white border-danger-600 shadow-md'
                                : p === 'yellow' ? 'bg-warning-500 text-white border-warning-500 shadow-md'
                                : 'bg-success-600 text-white border-success-600 shadow-md'
                              : p === 'red' ? 'bg-white text-danger-600 border-danger-200 hover:bg-danger-50'
                                : p === 'yellow' ? 'bg-white text-warning-600 border-warning-200 hover:bg-warning-50'
                                : 'bg-white text-success-600 border-success-200 hover:bg-success-50'
                          }`}
                        >
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Progress Indicator */}
                  <div className="mt-6 mb-4">
                    {(() => {
                      // Calculate progress based on workflow_status
                      const workflowStatus = selectedPatient.workflow_status || 'checked_in';
                      const hasOrders = labOrders.length > 0 || imagingOrders.length > 0 || pharmacyOrders.length > 0;

                      // Check if all orders are complete (including 'dispensed' for pharmacy)
                      const labsComplete = labOrders.length === 0 || labOrders.every(order => order.status === 'completed');
                      const imagingComplete = imagingOrders.length === 0 || imagingOrders.every(order => order.status === 'completed');
                      const pharmacyComplete = pharmacyOrders.length === 0 || pharmacyOrders.every(order => order.status === 'completed' || order.status === 'dispensed');
                      const allOrdersComplete = hasOrders && labsComplete && imagingComplete && pharmacyComplete;

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

                      // Only allow "Ready for Checkout" if all orders are complete
                      if (workflowStatus === 'ready_for_checkout' && hasOrders && !allOrdersComplete) {
                        // Orders still pending - show appropriate status instead
                        if (!labsComplete) {
                          stage = 'At Lab';
                          progress = 65;
                          color = 'bg-teal-500';
                        } else if (!imagingComplete) {
                          stage = 'At Imaging';
                          progress = 65;
                          color = 'bg-indigo-500';
                        } else if (!pharmacyComplete) {
                          stage = 'At Pharmacy';
                          progress = 75;
                          color = 'bg-green-500';
                        } else {
                          stage = 'Orders Pending';
                          progress = 70;
                          color = 'bg-yellow-500';
                        }
                      }

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
                                  pharmacyOrders.every(o => o.status === 'completed' || o.status === 'dispensed')
                                    ? 'bg-success-100 text-success-800 border border-success-300'
                                    : pharmacyOrders.some(o => o.status === 'in_progress' || o.status === 'ready')
                                    ? 'bg-primary-100 text-primary-800 border border-primary-300 animate-pulse'
                                    : 'bg-warning-100 text-warning-800 border border-warning-300'
                                }`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                  </svg>
                                  Pharmacy ({pharmacyOrders.length})
                                  {pharmacyOrders.every(o => o.status === 'completed' || o.status === 'dispensed') ? ' ✓' :
                                   pharmacyOrders.some(o => o.status === 'in_progress' || o.status === 'ready') ? ' ⏳' : ' ⏸'}
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
                      <button
                        onClick={async () => {
                          setActiveTab('billing');
                          if (selectedPatient) {
                            try {
                              const res = await apiClient.get(`/invoices/encounter/${selectedPatient.id}`);
                              setEncounterInvoice(res.data.invoice || res.data);
                            } catch {
                              setEncounterInvoice(null);
                            }
                          }
                        }}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'billing'
                            ? 'border-success-500 text-success-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Billing
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
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    if (selectedPatient?.vital_signs) {
                                      setVitals({
                                        temperature: selectedPatient.vital_signs.temperature,
                                        temperature_unit: selectedPatient.vital_signs.temperature_unit || 'C',
                                        heart_rate: selectedPatient.vital_signs.heart_rate,
                                        blood_pressure_systolic: selectedPatient.vital_signs.blood_pressure_systolic,
                                        blood_pressure_diastolic: selectedPatient.vital_signs.blood_pressure_diastolic,
                                        respiratory_rate: selectedPatient.vital_signs.respiratory_rate,
                                        oxygen_saturation: selectedPatient.vital_signs.oxygen_saturation,
                                        weight: selectedPatient.vital_signs.weight,
                                        weight_unit: selectedPatient.vital_signs.weight_unit || 'kg',
                                        height: selectedPatient.vital_signs.height,
                                        height_unit: selectedPatient.vital_signs.height_unit || 'cm',
                                        pain_level: selectedPatient.vital_signs.pain_level,
                                      });
                                      setVitalErrors({});
                                      setTimeout(() => {
                                        vitalsFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      }, 100);
                                    }
                                  }}
                                  className="flex items-center gap-1 text-sm text-success-600 hover:text-success-800 font-medium"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Edit Vitals
                                </button>
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
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {selectedPatient.vital_signs.temperature && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Temperature</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.temperature}°{selectedPatient.vital_signs.temperature_unit || 'C'}
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
                                    {selectedPatient.vital_signs.weight} <span className="text-sm font-normal">{selectedPatient.vital_signs.weight_unit || 'kg'}</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.height && (
                                <div className="bg-white rounded-lg p-3 shadow-sm">
                                  <div className="text-xs text-gray-500 uppercase font-medium">Height</div>
                                  <div className="text-xl font-bold text-gray-900">
                                    {selectedPatient.vital_signs.height} <span className="text-sm font-normal">{selectedPatient.vital_signs.height_unit || 'cm'}</span>
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
                              {(() => {
                                const vs = selectedPatient.vital_signs;
                                const w = vs.weight;
                                const h = vs.height;
                                if (!w || !h) {
                                  return (
                                    <div className="bg-white rounded-lg p-3 shadow-sm">
                                      <div className="text-xs text-gray-500 uppercase font-medium">BMI</div>
                                      <div className="text-sm text-gray-400 mt-1">Enter weight & height</div>
                                    </div>
                                  );
                                }
                                const weightKg = vs.weight_unit === 'kg' ? w : w * 0.453592;
                                const heightM = vs.height_unit === 'cm' ? h / 100 : h * 0.0254;
                                if (!heightM || !weightKg) return null;
                                const bmi = weightKg / (heightM * heightM);
                                const category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
                                const color = bmi < 18.5 ? 'text-warning-600' : bmi < 25 ? 'text-success-600' : bmi < 30 ? 'text-warning-600' : 'text-danger-600';
                                return (
                                  <div className="bg-white rounded-lg p-3 shadow-sm">
                                    <div className="text-xs text-gray-500 uppercase font-medium">BMI</div>
                                    <div className={`text-xl font-bold ${color}`}>
                                      {bmi.toFixed(1)}
                                    </div>
                                    <div className={`text-xs ${color}`}>{category}</div>
                                  </div>
                                );
                              })()}
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
                        <div ref={vitalsFormRef} className="bg-white border border-gray-200 rounded-xl p-5">
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
                                    placeholder="37.0"
                                  />
                                  <select
                                    value={vitals.temperature_unit}
                                    onChange={(e) => setVitals({ ...vitals, temperature_unit: e.target.value as 'C' | 'F' })}
                                    className="flex-shrink-0 text-base sm:text-lg font-semibold py-3 px-2 sm:px-3 border-2 border-orange-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                                  >
                                    <option value="C">°C</option>
                                    <option value="F">°F</option>
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
                                    placeholder="70"
                                  />
                                  <select
                                    value={vitals.weight_unit}
                                    onChange={(e) => setVitals({ ...vitals, weight_unit: e.target.value as 'kg' | 'lbs' })}
                                    className="flex-shrink-0 text-base sm:text-lg font-semibold py-3 px-2 sm:px-3 border-2 border-success-300 rounded-lg bg-white focus:ring-2 focus:ring-success-500 focus:border-success-500 outline-none"
                                  >
                                    <option value="kg">kg</option>
                                    <option value="lbs">lbs</option>
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
                                    placeholder="170"
                                  />
                                  <select
                                    value={vitals.height_unit}
                                    onChange={(e) => setVitals({ ...vitals, height_unit: e.target.value as 'cm' | 'in' })}
                                    className="flex-shrink-0 text-base sm:text-lg font-semibold py-3 px-2 sm:px-3 border-2 border-secondary-300 rounded-lg bg-white focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500 outline-none"
                                  >
                                    <option value="cm">cm</option>
                                    <option value="in">in</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* BMI Auto-calculation */}
                            {vitals.weight && vitals.height && (
                              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-indigo-800">BMI (Auto-calculated)</span>
                                  </div>
                                  {(() => {
                                    // Convert to metric for BMI calculation
                                    const weightKg = vitals.weight_unit === 'kg' ? vitals.weight : vitals.weight * 0.453592;
                                    const heightM = vitals.height_unit === 'cm' ? vitals.height / 100 : vitals.height * 0.0254;
                                    const bmi = weightKg / (heightM * heightM);
                                    const bmiCategory = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
                                    const categoryColor = bmi < 18.5 ? 'text-blue-600' : bmi < 25 ? 'text-green-600' : bmi < 30 ? 'text-yellow-600' : 'text-red-600';
                                    const categoryBg = bmi < 18.5 ? 'bg-blue-100' : bmi < 25 ? 'bg-green-100' : bmi < 30 ? 'bg-yellow-100' : 'bg-red-100';
                                    return (
                                      <div className="flex items-center gap-3">
                                        <span className="text-2xl font-bold text-indigo-900">{bmi.toFixed(1)}</span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${categoryColor} ${categoryBg}`}>
                                          {bmiCategory}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

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
                                    <div key={order.id} className={`border rounded-lg p-3 ${order.results ? 'border-success-300 bg-success-50' : 'border-primary-200 bg-primary-50'}`}>
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
                                          <div className={`text-xs mt-1 font-medium ${
                                            order.status === 'completed' ? 'text-success-600' : 'text-gray-600'
                                          }`}>{order.status}</div>
                                        </div>
                                      </div>
                                      {/* Lab Results */}
                                      {order.results && (
                                        <div className="mt-2 p-2 bg-white rounded border border-success-200">
                                          <div className="flex items-center gap-1 mb-1">
                                            <svg className="w-4 h-4 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-xs font-semibold text-success-700">Results Available</span>
                                            {order.results_available_at && (
                                              <span className="text-xs text-gray-400 ml-auto">
                                                {safeFormatDate(order.results_available_at, 'MMM d, yyyy h:mm a')}
                                              </span>
                                            )}
                                          </div>
                                          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{order.results}</pre>
                                        </div>
                                      )}
                                      {order.notes && !order.results && (
                                        <p className="mt-1 text-xs text-gray-500 italic">Notes: {order.notes}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Patient Lab History — completed labs from prior encounters */}
                            {patientLabHistory.filter(o => o.encounter_id !== selectedPatient.id).length > 0 && (
                              <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => setShowLabHistory(v => !v)}
                                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-gray-700">
                                      Past Lab Results
                                    </span>
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary-100 text-primary-700">
                                      {patientLabHistory.filter(o => o.encounter_id !== selectedPatient.id).length}
                                    </span>
                                  </div>
                                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${showLabHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {showLabHistory && (
                                  <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                                    {patientLabHistory
                                      .filter(o => o.encounter_id !== selectedPatient.id)
                                      .map(order => (
                                        <div key={order.id} className="p-3 bg-white">
                                          <div className="flex justify-between items-start mb-1">
                                            <div>
                                              <div className="font-semibold text-sm text-gray-900">{order.test_name}</div>
                                              <div className="text-xs text-gray-500">
                                                {order.results_available_at
                                                  ? safeFormatDate(order.results_available_at, 'MMM d, yyyy')
                                                  : safeFormatDate(order.ordered_date, 'MMM d, yyyy')}
                                                {order.ordering_provider_name && ` · ordered by ${order.ordering_provider_name}`}
                                              </div>
                                            </div>
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-success-100 text-success-700">
                                              {order.status}
                                            </span>
                                          </div>
                                          {order.results && (
                                            <pre className="mt-1 text-xs text-gray-800 whitespace-pre-wrap font-sans bg-gray-50 rounded p-2 border border-gray-100">
                                              {order.results}
                                            </pre>
                                          )}
                                        </div>
                                      ))}
                                  </div>
                                )}
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
                                    <div key={order.id} className={`border rounded-lg p-3 ${
                                      order.status === 'ready' ? 'border-orange-300 bg-orange-50' :
                                      order.status === 'dispensed' ? 'border-success-200 bg-success-50' :
                                      'border-primary-200 bg-primary-50'
                                    }`}>
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
                                        <div className="ml-4 text-right flex flex-col items-end gap-2">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-danger-100 text-danger-800' :
                                            order.priority === 'urgent' ? 'bg-warning-100 text-warning-800' :
                                            'bg-success-100 text-success-800'
                                          }`}>
                                            {order.priority.toUpperCase()}
                                          </span>
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            order.status === 'ready' ? 'bg-orange-100 text-orange-800' :
                                            order.status === 'dispensed' ? 'bg-success-100 text-success-800' :
                                            order.status === 'in_progress' ? 'bg-primary-100 text-primary-800' :
                                            'bg-gray-100 text-gray-800'
                                          }`}>
                                            {order.status === 'ready' ? '📦 Ready for Pickup' :
                                             order.status === 'dispensed' ? '✓ Dispensed' :
                                             order.status === 'in_progress' ? 'Preparing' :
                                             order.status}
                                          </span>
                                          {order.status === 'ready' && (
                                            <button
                                              onClick={() => confirmMedicationPickup(order.id)}
                                              className="px-3 py-1 bg-success-600 text-white text-xs rounded-lg hover:bg-success-700"
                                            >
                                              Confirm Pickup
                                            </button>
                                          )}
                                          {order.status === 'dispensed' && (
                                            <button
                                              onClick={() => handleAdministerMedication(order.id, order.medication_name)}
                                              className="px-3 py-1 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700"
                                            >
                                              Record Administration
                                            </button>
                                          )}
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
                        {/* Add Procedure Button */}
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-semibold text-gray-800">Procedures</h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowProcedureHistory(!showProcedureHistory);
                                if (!showProcedureHistory) {
                                  loadProcedureHistory(selectedPatient.id);
                                }
                              }}
                              className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              {showProcedureHistory ? 'Hide History' : 'View History'}
                            </button>
                            <button
                              onClick={() => setShowAddProcedure(!showAddProcedure)}
                              className="px-4 py-2 text-sm font-medium text-white bg-success-600 rounded-lg hover:bg-success-700 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add Procedure
                            </button>
                          </div>
                        </div>

                        {/* Add Procedure Form */}
                        {showAddProcedure && (
                          <div className="bg-success-50 border-2 border-success-200 rounded-xl p-4">
                            <h4 className="font-bold text-success-800 mb-3">Select Procedure</h4>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Procedure</label>
                                <select
                                  value={selectedProcedureId || ''}
                                  onChange={(e) => setSelectedProcedureId(e.target.value ? parseInt(e.target.value) : null)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:border-success-500"
                                >
                                  <option value="">-- Select a procedure --</option>
                                  {availableProcedures.map((proc) => (
                                    <option key={proc.id} value={proc.id}>
                                      {proc.service_name} — GHS {Number(proc.price).toFixed(2)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                                <textarea
                                  value={procedureNotes}
                                  onChange={(e) => setProcedureNotes(e.target.value)}
                                  placeholder="e.g., Left forearm, wound from fall..."
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:border-success-500"
                                  rows={2}
                                />
                              </div>
                              {selectedProcedureId && (
                                <div className="bg-white rounded-lg p-3 border border-success-200">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-gray-800">
                                      {availableProcedures.find(p => p.id === selectedProcedureId)?.service_name}
                                    </span>
                                    <span className="font-bold text-success-700">
                                      GHS {Number(availableProcedures.find(p => p.id === selectedProcedureId)?.price || 0).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={handleOrderProcedure}
                                  disabled={!selectedProcedureId || orderingProcedure}
                                  className="px-4 py-2 text-sm font-medium text-white bg-success-600 rounded-lg hover:bg-success-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {orderingProcedure ? 'Adding...' : 'Add & Start'}
                                </button>
                                <button
                                  onClick={() => {
                                    setShowAddProcedure(false);
                                    setSelectedProcedureId(null);
                                    setProcedureNotes('');
                                  }}
                                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Active Procedures List */}
                        {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length > 0 ? (
                          <div className="space-y-3">
                            {nurseProcedures
                              .filter(p => p.encounter_id === selectedPatient.id)
                              .map((procedure) => (
                                <div
                                  key={procedure.id}
                                  className={`border rounded-lg p-4 ${
                                    procedure.status === 'in_progress' ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-gray-50'
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h3 className="font-semibold text-gray-900">{procedure.procedure_name}</h3>
                                      {procedure.notes && (
                                        <p className="text-sm text-gray-600 mt-1">{procedure.notes}</p>
                                      )}
                                      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
                                        <span>Ordered by: {procedure.ordered_by_name}</span>
                                        {procedure.performed_by_name && (
                                          <span>Performed by: {procedure.performed_by_name}</span>
                                        )}
                                        <span>GHS {Number(procedure.price || 0).toFixed(2)}</span>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                          procedure.status === 'pending' ? 'bg-warning-100 text-warning-800' :
                                          procedure.status === 'in_progress' ? 'bg-primary-100 text-primary-800' :
                                          'bg-success-100 text-success-800'
                                        }`}>
                                          {procedure.status === 'in_progress' ? 'IN PROGRESS' : procedure.status.toUpperCase()}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-400 mt-1">
                                        Ordered: {safeFormatDate(procedure.ordered_at, 'MMM d, yyyy h:mm a')}
                                        {procedure.started_at && ` | Started: ${safeFormatDate(procedure.started_at, 'h:mm a')}`}
                                      </p>
                                    </div>
                                    <div className="ml-4 flex gap-2">
                                      {(procedure.status === 'pending' || procedure.status === 'in_progress') && (
                                        <button
                                          onClick={() => {
                                            setEditingProcedureId(procedure.id);
                                            setEditProcedureNotes(procedure.notes || '');
                                            // Default the charge picker to the procedure's current type
                                            const current = availableProcedures.find(
                                              ap => ap.service_name === procedure.procedure_name
                                            );
                                            setEditProcedureChargeId(current?.id ?? null);
                                          }}
                                          className="px-3 py-1 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
                                        >
                                          Edit
                                        </button>
                                      )}
                                      {procedure.status === 'pending' && (
                                        <>
                                          <button
                                            onClick={() => handleStartProcedure(procedure.id)}
                                            className="px-3 py-1 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                                          >
                                            Start
                                          </button>
                                          <button
                                            onClick={() => handleCancelProcedure(procedure.id)}
                                            className="px-3 py-1 text-sm font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      )}
                                      {procedure.status === 'in_progress' && (
                                        <>
                                          <button
                                            onClick={() => handleCompleteProcedure(procedure.id)}
                                            className="px-3 py-1 text-sm font-medium text-white bg-success-600 rounded-lg hover:bg-success-700"
                                          >
                                            Complete & Bill
                                          </button>
                                          <button
                                            onClick={() => handleCancelProcedure(procedure.id)}
                                            className="px-3 py-1 text-sm font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {/* Inline Edit Form */}
                                  {editingProcedureId === procedure.id && (
                                    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Procedure type</label>
                                        <select
                                          value={editProcedureChargeId ?? ''}
                                          onChange={(e) => setEditProcedureChargeId(e.target.value ? Number(e.target.value) : null)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 bg-white"
                                        >
                                          <option value="">— Keep current ({procedure.procedure_name}) —</option>
                                          {availableProcedures.map(ap => (
                                            <option key={ap.id} value={ap.id}>
                                              {ap.service_name} — GHS {Number(ap.price || 0).toFixed(2)}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                                        <textarea
                                          rows={2}
                                          value={editProcedureNotes}
                                          onChange={(e) => setEditProcedureNotes(e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                                          placeholder="Update procedure notes..."
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <button
                                          onClick={() => setEditingProcedureId(null)}
                                          className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={async () => {
                                            try {
                                              const body: any = { notes: editProcedureNotes };
                                              // If the nurse picked a different procedure type, send name + charge id
                                              if (editProcedureChargeId) {
                                                const picked = availableProcedures.find(ap => ap.id === editProcedureChargeId);
                                                if (picked) {
                                                  body.procedure_name = picked.service_name;
                                                  body.charge_master_id = picked.id;
                                                }
                                              }
                                              await apiClient.put(`/nurse-procedures/${procedure.id}`, body);
                                              showToast('Procedure updated', 'success');
                                              setEditingProcedureId(null);
                                              loadNurseProcedures();
                                            } catch (err: any) {
                                              showToast(err.response?.data?.error || 'Failed to update', 'error');
                                            }
                                          }}
                                          className="px-3 py-1 text-xs text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        ) : (
                          !showAddProcedure && (
                            <div className="text-center py-8">
                              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <p className="text-gray-500 mb-3">No active procedures for this patient</p>
                              <button
                                onClick={() => setShowAddProcedure(true)}
                                className="px-4 py-2 text-sm font-medium text-success-700 bg-success-50 border border-success-200 rounded-lg hover:bg-success-100 transition-colors"
                              >
                                Add a Procedure
                              </button>
                            </div>
                          )
                        )}

                        {/* Procedure History */}
                        {showProcedureHistory && (
                          <div className="border-t border-gray-200 pt-4 mt-4">
                            <h4 className="font-semibold text-gray-700 mb-3">Procedure History</h4>
                            {procedureHistory.filter(p => p.status === 'completed' || p.status === 'cancelled').length > 0 ? (
                              <div className="space-y-2">
                                {procedureHistory
                                  .filter(p => p.status === 'completed' || p.status === 'cancelled')
                                  .map((procedure) => (
                                    <div
                                      key={procedure.id}
                                      className={`border rounded-lg p-3 ${
                                        procedure.status === 'completed' ? 'border-success-200 bg-success-50' : 'border-gray-200 bg-gray-50 opacity-60'
                                      }`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <div>
                                          <span className="font-medium text-gray-900">{procedure.procedure_name}</span>
                                          {procedure.notes && (
                                            <p className="text-xs text-gray-500 mt-0.5">{procedure.notes}</p>
                                          )}
                                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                            {procedure.performed_by_name && <span>By: {procedure.performed_by_name}</span>}
                                            <span>GHS {Number(procedure.price || 0).toFixed(2)}</span>
                                            {procedure.completed_at && (
                                              <span>{safeFormatDate(procedure.completed_at, 'MMM d, yyyy h:mm a')}</span>
                                            )}
                                          </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                          procedure.status === 'completed' ? 'bg-success-100 text-success-800' : 'bg-gray-200 text-gray-600'
                                        }`}>
                                          {procedure.status.toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400 text-center py-4">No procedure history</p>
                            )}
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
                      <PatientDocumentsPanel
                        patientId={selectedPatient.patient_id}
                        encounterId={selectedPatient.id}
                      />
                    )}

                    {/* Billing Tab */}
                    {activeTab === 'billing' && (
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Encounter Billing Summary</h3>
                        {encounterInvoice ? (
                          <div className="space-y-4">
                            {/* Invoice Header */}
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <div className="text-xs text-gray-500">Invoice #</div>
                                  <div className="font-semibold text-gray-900">{encounterInvoice.invoice_number || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">Status</div>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                    encounterInvoice.status === 'paid' ? 'bg-success-100 text-success-700' :
                                    encounterInvoice.status === 'pending' ? 'bg-warning-100 text-warning-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {(encounterInvoice.status || 'N/A').toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">Total</div>
                                  <div className="font-bold text-lg text-gray-900">GHS {Number(encounterInvoice.total_amount || encounterInvoice.total || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">Paid</div>
                                  <div className="font-bold text-lg text-success-600">GHS {Number(encounterInvoice.amount_paid || 0).toFixed(2)}</div>
                                </div>
                              </div>
                            </div>

                            {/* Invoice Items */}
                            {encounterInvoice.items && encounterInvoice.items.length > 0 ? (
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="w-full">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Description</th>
                                      <th className="text-center text-xs font-medium text-gray-500 px-4 py-2">Qty</th>
                                      <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">Unit Price</th>
                                      <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {encounterInvoice.items.map((item: any, idx: number) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 text-sm text-gray-900">{item.description}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600 text-center">{item.quantity}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600 text-right">GHS {Number(item.unit_price || 0).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">GHS {Number(item.total_price || item.total || 0).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                                      <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-700">Total</td>
                                      <td className="px-4 py-3 text-right font-bold text-gray-900">GHS {Number(encounterInvoice.total_amount || encounterInvoice.total || 0).toFixed(2)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No charges recorded yet for this encounter.</p>
                            )}

                            {/* Balance */}
                            {(Number(encounterInvoice.total_amount || encounterInvoice.total || 0) - Number(encounterInvoice.amount_paid || 0)) > 0 && (
                              <div className="bg-warning-50 border border-warning-200 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  <svg className="w-5 h-5 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  <span className="text-sm font-semibold text-warning-800">
                                    Outstanding Balance: GHS {(Number(encounterInvoice.total_amount || encounterInvoice.total || 0) - Number(encounterInvoice.amount_paid || 0)).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p>No invoice found for this encounter</p>
                          </div>
                        )}
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
        )}

        {/* Inventory View */}
        {mainView === 'inventory' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <div>
                    <h2 className="text-xl font-bold text-white">Nurse Station Inventory</h2>
                    <p className="text-primary-100 text-sm">Manage supplies and equipment</p>
                  </div>
                </div>
                <div className="text-primary-100 text-sm">
                  Total Value: <span className="font-bold text-white">GHS {nurseInventory.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-gray-50 border-b">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-500">Total Items</div>
                <div className="text-2xl font-bold text-gray-900">{nurseInventory.length}</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-500">Low Stock Items</div>
                <div className="text-2xl font-bold text-danger-600">{nurseInventory.filter(i => i.quantity <= i.min_quantity).length}</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-500">Categories</div>
                <div className="text-2xl font-bold text-gray-900">{new Set(nurseInventory.map(i => i.category)).size}</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-500">Locations</div>
                <div className="text-2xl font-bold text-gray-900">{new Set(nurseInventory.map(i => i.location)).size}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="p-4 border-b flex flex-wrap gap-3 items-center">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search items..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <select
                value={inventoryCategoryFilter}
                onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
              >
                <option value="all">All Categories</option>
                <option value="Supplies">Supplies</option>
                <option value="Equipment">Equipment</option>
                <option value="PPE">PPE</option>
                <option value="Medications">Medications</option>
              </select>
              <select
                value={inventorySortBy}
                onChange={(e) => setInventorySortBy(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
              >
                <option value="name">Sort by Name</option>
                <option value="category">Sort by Category</option>
                <option value="quantity">Sort by Quantity</option>
                <option value="status">Sort by Status</option>
              </select>
              <button
                onClick={() => setInventoryShowLowOnly(!inventoryShowLowOnly)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  inventoryShowLowOnly
                    ? 'bg-danger-100 text-danger-700 border-2 border-danger-300'
                    : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Low Stock Only ({nurseInventory.filter(i => i.quantity <= i.min_quantity).length})
              </button>
            </div>

            {/* Inventory Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Min Stock</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Value</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {nurseInventory
                    .filter(item =>
                      (inventoryCategoryFilter === 'all' || item.category === inventoryCategoryFilter) &&
                      (inventorySearch === '' || item.name.toLowerCase().includes(inventorySearch.toLowerCase())) &&
                      (!inventoryShowLowOnly || item.quantity <= item.min_quantity)
                    )
                    .sort((a, b) => {
                      // Natural sort so "Syringe (5ml)" comes before "Syringe (10ml)"
                      // instead of lexicographic order where "(10ml)" beats "(5ml)".
                      const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                      switch (inventorySortBy) {
                        case 'category': {
                          const c = a.category.localeCompare(b.category);
                          return c !== 0 ? c : byName;
                        }
                        case 'quantity': return a.quantity - b.quantity || byName;
                        case 'status': return (a.quantity <= a.min_quantity ? 0 : 1) - (b.quantity <= b.min_quantity ? 0 : 1) || byName;
                        default: return byName;
                      }
                    })
                    .map((item) => (
                    <tr key={item.id} className={`hover:bg-gray-50 ${item.quantity <= item.min_quantity ? 'bg-danger-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          item.category === 'PPE' ? 'bg-blue-100 text-blue-800' :
                          item.category === 'Equipment' ? 'bg-purple-100 text-purple-800' :
                          item.category === 'Medications' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{item.location}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${item.quantity <= item.min_quantity ? 'text-danger-600' : 'text-gray-900'}`}>
                          {item.quantity} {item.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">{item.min_quantity} {item.unit}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">GHS {Number(item.unit_cost || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-700">GHS {(Number(item.quantity || 0) * Number(item.unit_cost || 0)).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.quantity <= item.min_quantity ? (
                          <span className="px-2 py-1 bg-danger-100 text-danger-700 rounded-full text-xs font-bold">LOW STOCK</span>
                        ) : item.quantity <= item.min_quantity * 1.5 ? (
                          <span className="px-2 py-1 bg-warning-100 text-warning-700 rounded-full text-xs font-bold">WARNING</span>
                        ) : (
                          <span className="px-2 py-1 bg-success-100 text-success-700 rounded-full text-xs font-bold">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setAddStockItem(item);
                              setAddStockQuantity(0);
                              setAddStockNotes('');
                              setShowAddStockModal(true);
                            }}
                            className="text-success-600 hover:text-success-800 font-medium text-sm"
                            title="Add stock"
                          >
                            +Stock
                          </button>
                          <button
                            onClick={() => {
                              setEditingInventoryItem(item);
                              setInventoryForm({
                                name: item.name,
                                category: item.category,
                                quantity: item.quantity,
                                unit: item.unit,
                                min_quantity: item.min_quantity,
                                location: item.location
                              });
                              setShowInventoryModal(true);
                            }}
                            className="text-primary-600 hover:text-primary-800 font-medium text-sm"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {nurseInventory.filter(item =>
              (inventoryCategoryFilter === 'all' || item.category === inventoryCategoryFilter) &&
              (inventorySearch === '' || item.name.toLowerCase().includes(inventorySearch.toLowerCase()))
            ).length === 0 && (
              <div className="p-12 text-center text-gray-500">
                No inventory items found
              </div>
            )}
          </div>
        )}

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

                {/* Read-only test sets — nurse can apply, only doctors create */}
                <div className="border-t border-gray-200 pt-3">
                  <LabTestSetChips pendingLabOrders={[]} onApplySet={handleApplySetForNurse} />
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

      {/* Nurse Inventory Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingInventoryItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
                </h2>
                <button
                  onClick={() => setShowInventoryModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={inventoryForm.name}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                    placeholder="e.g., Syringes (10ml)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={inventoryForm.category}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="Supplies">Supplies</option>
                      <option value="Equipment">Equipment</option>
                      <option value="PPE">PPE</option>
                      <option value="Medications">Medications</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={inventoryForm.location}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, location: e.target.value })}
                      placeholder="e.g., Cabinet A"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                    <input
                      type="number"
                      value={inventoryForm.quantity}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, quantity: Number(e.target.value) })}
                      min="0"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select
                      value={inventoryForm.unit}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, unit: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="pcs">pcs</option>
                      <option value="boxes">boxes</option>
                      <option value="rolls">rolls</option>
                      <option value="packs">packs</option>
                      <option value="bottles">bottles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Qty</label>
                    <input
                      type="number"
                      value={inventoryForm.min_quantity}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, min_quantity: Number(e.target.value) })}
                      min="0"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                {editingInventoryItem && (
                  <button
                    onClick={async () => {
                      try {
                        await apiClient.put(`/nurse/inventory/${editingInventoryItem.id}`, { is_active: false });
                        showToast('Item deleted', 'success');
                        loadNurseInventory();
                      } catch (error) {
                        showToast('Failed to delete item', 'error');
                      }
                      setShowInventoryModal(false);
                    }}
                    className="px-4 py-2 border border-danger-300 text-danger-700 rounded-lg hover:bg-danger-50"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setShowInventoryModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  disabled={savingInventory || !inventoryForm.name}
                  onClick={async () => {
                    if (!inventoryForm.name) return;
                    setSavingInventory(true);
                    try {
                      if (editingInventoryItem) {
                        await apiClient.put(`/nurse/inventory/${editingInventoryItem.id}`, {
                          item_name: inventoryForm.name,
                          category: inventoryForm.category,
                          quantity_on_hand: inventoryForm.quantity,
                          unit: inventoryForm.unit,
                          reorder_level: inventoryForm.min_quantity,
                          location: inventoryForm.location,
                        });
                        showToast('Item updated successfully', 'success');
                      } else {
                        await apiClient.post('/nurse/inventory', {
                          item_name: inventoryForm.name,
                          category: inventoryForm.category,
                          quantity_on_hand: inventoryForm.quantity,
                          unit: inventoryForm.unit,
                          reorder_level: inventoryForm.min_quantity,
                          location: inventoryForm.location,
                        });
                        showToast('Item added successfully', 'success');
                      }
                      await loadNurseInventory();
                      setShowInventoryModal(false);
                      setInventoryForm({ name: '', category: 'Supplies', quantity: 0, unit: 'pcs', min_quantity: 0, location: '' });
                      setEditingInventoryItem(null);
                    } catch (error: any) {
                      const msg = error?.response?.data?.error || 'Failed to save item';
                      showToast(msg, 'error');
                      console.error('Save inventory error:', error?.response?.data || error);
                    } finally {
                      setSavingInventory(false);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingInventory ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    editingInventoryItem ? 'Save Changes' : 'Add Item'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Add Stock Modal */}
      {showAddStockModal && addStockItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 bg-success-50 rounded-t-xl">
              <h3 className="text-lg font-bold text-success-800">Add Stock</h3>
              <p className="text-sm text-success-600">{addStockItem.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Current Stock:</span>
                  <span className="font-semibold">{addStockItem.quantity} {addStockItem.unit}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Add</label>
                <input
                  type="number"
                  min="1"
                  value={addStockQuantity || ''}
                  onChange={(e) => setAddStockQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500"
                  placeholder="Enter quantity..."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={addStockNotes}
                  onChange={(e) => setAddStockNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500"
                  placeholder="e.g., Received from pharmacy"
                />
              </div>
              {addStockQuantity > 0 && (
                <div className="bg-success-50 rounded-lg p-3 text-sm text-success-700">
                  New total: <span className="font-bold">{addStockItem.quantity + addStockQuantity} {addStockItem.unit}</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowAddStockModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (addStockQuantity <= 0) return;
                  try {
                    await apiClient.post('/nurse/inventory/purchase', {
                      inventory_id: addStockItem.id,
                      quantity: addStockQuantity,
                      notes: addStockNotes || 'Stock added by nurse',
                    });
                    showToast(`Added ${addStockQuantity} ${addStockItem.unit} to ${addStockItem.name}`, 'success');
                    setShowAddStockModal(false);
                    loadNurseInventory();
                  } catch (err: any) {
                    showToast(err.response?.data?.error || 'Failed to add stock', 'error');
                  }
                }}
                disabled={addStockQuantity <= 0}
                className="flex-1 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 disabled:opacity-50 font-medium"
              >
                Add Stock
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Allergy Warning Modal */}
      <AllergyWarningModal
        isOpen={showNurseAllergyModal}
        medicationName={pendingAdminOrder?.name || ''}
        warnings={nurseAllergyWarnings}
        onConfirm={(reason) => {
          showToast(`Allergy override documented: ${reason}`, 'warning');
          setShowNurseAllergyModal(false);
          setNurseAllergyWarnings([]);
          if (pendingAdminOrder) {
            executeAdministration(pendingAdminOrder.id, pendingAdminOrder.name);
          }
          setPendingAdminOrder(null);
        }}
        onCancel={() => {
          setShowNurseAllergyModal(false);
          setNurseAllergyWarnings([]);
          setPendingAdminOrder(null);
        }}
      />

      {/* Doctor Notification details modal — full message + follow-up /
          review context with inline date editing. Opened when the nurse
          clicks a row in the Doctor Notifications card. */}
      {openNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-800 to-gray-900 rounded-t-xl">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-white">Doctor's note</h2>
                  <p className="text-sm text-gray-300 mt-1">
                    {openNotification.patient_name} · From Dr. {openNotification.doctor_name}
                  </p>
                </div>
                <button
                  onClick={closeNotificationModal}
                  className="text-gray-300 hover:text-white text-2xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Full alert message */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Message</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{openNotification.message}</p>
              </div>

              {loadingDetails ? (
                <div className="text-sm text-gray-500 italic">Loading details...</div>
              ) : (
                <>
                  {/* Encounter notes from the doctor */}
                  {notificationDetails?.encounter && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Encounter context
                      </p>
                      {notificationDetails.encounter.chief_complaint && (
                        <div>
                          <span className="text-xs font-medium text-gray-600">Chief complaint: </span>
                          <span className="text-sm text-gray-900">{notificationDetails.encounter.chief_complaint}</span>
                        </div>
                      )}
                      {notificationDetails.encounter.assessment && (
                        <div>
                          <span className="text-xs font-medium text-gray-600">Assessment: </span>
                          <span className="text-sm text-gray-900 whitespace-pre-wrap">{notificationDetails.encounter.assessment}</span>
                        </div>
                      )}
                      {notificationDetails.encounter.plan && (
                        <div>
                          <span className="text-xs font-medium text-gray-600">Plan: </span>
                          <span className="text-sm text-gray-900 whitespace-pre-wrap">{notificationDetails.encounter.plan}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Follow-up appointment */}
                  {notificationDetails?.follow_up_appointment ? (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                          Follow-up visit
                        </p>
                        <span className="text-xs text-blue-600">on the calendar</span>
                      </div>
                      {notificationDetails.encounter?.follow_up_reason && (
                        <p className="text-sm text-gray-900 mb-2">
                          <span className="font-medium">Reason:</span> {notificationDetails.encounter.follow_up_reason}
                        </p>
                      )}
                      <div className="flex items-end gap-2 mt-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Scheduled date</label>
                          <input
                            type="date"
                            value={editingFollowUpDate}
                            onChange={(e) => setEditingFollowUpDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <button
                          onClick={rescheduleFollowUpAppointment}
                          disabled={savingReschedule || !editingFollowUpDate ||
                            editingFollowUpDate === new Date(notificationDetails.follow_up_appointment.appointment_date).toISOString().slice(0, 10)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                          {savingReschedule ? 'Saving...' : 'Reschedule'}
                        </button>
                      </div>
                    </div>
                  ) : notificationDetails?.encounter?.follow_up_required ? (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 text-sm text-gray-700">
                      Follow-up visit was requested ({notificationDetails.encounter.follow_up_timeframe || 'no timeframe'}), but no appointment was auto-created.
                    </div>
                  ) : null}

                  {/* Review call task */}
                  {notificationDetails?.review_task ? (
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                          Review call
                        </p>
                        <span className="text-xs text-amber-600">in your Calls queue</span>
                      </div>
                      {notificationDetails.review_task.review_reason && (
                        <p className="text-sm text-gray-900 mb-2">
                          <span className="font-medium">Reason:</span> {notificationDetails.review_task.review_reason}
                        </p>
                      )}
                      <div className="flex items-end gap-2 mt-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Scheduled date</label>
                          <input
                            type="date"
                            value={editingReviewDate}
                            onChange={(e) => setEditingReviewDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <button
                          onClick={rescheduleReviewTask}
                          disabled={savingReschedule || !editingReviewDate ||
                            editingReviewDate === new Date(notificationDetails.review_task.scheduled_date).toISOString().slice(0, 10)}
                          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                        >
                          {savingReschedule ? 'Saving...' : 'Reschedule'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!notificationDetails?.follow_up_appointment &&
                   !notificationDetails?.review_task &&
                   !notificationDetails?.encounter?.follow_up_required && (
                    <div className="text-sm text-gray-500 italic">
                      No follow-up or review tasks scheduled for this encounter.
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-2">
              <button
                onClick={closeNotificationModal}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={openPatientFromNotification}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
              >
                Open patient visit
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default NurseDashboard;
