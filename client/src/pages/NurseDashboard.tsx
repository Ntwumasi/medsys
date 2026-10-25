import React, { useEffect, useRef, useState } from 'react';
import { decideVitalsHandoff } from '../utils/vitalsHandoff';
import { useActiveId } from '../hooks/useActiveId';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../api/client';
import { format, parseISO, isValid } from 'date-fns';
import { validateVitalSign } from '../utils/vitalSignsValidation';
import HPAccordion from '../components/HPAccordion';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { confirmNotDuplicatePatient } from '../utils/duplicatePatientCheck';
import AppLayout from '../components/AppLayout';
import PatientStickyBar from '../components/PatientStickyBar';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import { VoiceDictationButton } from '../components/VoiceDictationButton';
import { SmartTextArea } from '../components/SmartTextArea';
import PatientQuickView from '../components/PatientQuickView';
import VitalSignsHistory from '../components/VitalSignsHistory';
import LabResultsInline from '../components/LabResultsInline';
import PatientDocumentsPanel from '../components/PatientDocumentsPanel';
import AllergyWarningModal from '../components/AllergyWarningModal';
import { playNotificationSound } from '../utils/notificationSound';
import LabTestSetChips from '../components/LabTestSetChips';
import SuggestedTestsPanel from '../components/SuggestedTestsPanel';
import type { LabTestSetItem } from '../api/labTestSets';
import type { ApiError } from '../types';
import { useSmartPolling } from '../hooks/useSmartPolling';
import DashboardHeader, { StatPill } from '../components/DashboardHeader';
import InsightCard from '../components/ui/InsightCard';
import AppSelect from '../components/ui/AppSelect';
import { calculateAge } from '../utils/age';

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
  alert_type?: string;
}

// Infer notification category from message content for visual badges
const getNotificationBadge = (notification: DoctorNotification): { label: string; color: string } => {
  const msg = (notification.message || '').toLowerCase();
  if (msg.includes('critical') || msg.includes('urgent') || msg.includes('stat'))
    return { label: 'Critical', color: 'bg-ds-critical-soft text-ds-critical-text' };
  if (msg.includes('follow-up') || msg.includes('follow up') || msg.includes('review'))
    return { label: 'Follow-up', color: 'bg-ds-subtle text-ds-brand-plum' };
  if (msg.includes('ready') || msg.includes('completed') || msg.includes('returned'))
    return { label: 'Routine', color: 'bg-ds-info-soft text-ds-info-text' };
  return { label: 'Info', color: 'bg-ds-subtle text-ds-text-secondary' };
};

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
  useDesignSystemPage();
  const patientHeaderRef = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Notification deep-link: ?highlight=<encounterId> selects + flashes that
  // patient (e.g. "patient checked in / ready" notifications land the nurse on
  // the right patient instead of doing nothing).
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useNotification();
  const { confirm: confirmDialog, prompt: promptDialog } = useDialog();
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<AssignedPatient | null>(null);
  const selectedPatientRef = useRef<AssignedPatient | null>(null);
  // Every path that changes the selection (including notifications) keeps the
  // ref current — loaders use it to drop replies for a patient no longer open.
  useEffect(() => { selectedPatientRef.current = selectedPatient; }, [selectedPatient]);
  const prevPatientCountRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [nurseProcedures, setNurseProcedures] = useState<NurseProcedure[]>([]);
  const [availableProcedures, setAvailableProcedures] = useState<AvailableProcedure[]>([]);

  // ---- Nurse walk-ins (wound dressing / on-the-spot procedures) ----
  // Mirrors the lab/pharmacy walk-in flow: a nurse can check in a patient
  // directly, perform & bill procedures, then send them to reception for
  // checkout — no doctor encounter required.
  const [showNurseWalkins, setShowNurseWalkins] = useState(false);
  const [nurseWalkIns, setNurseWalkIns] = useState<any[]>([]);
  const [showNewNurseWalkin, setShowNewNurseWalkin] = useState(false);
  const [nurseWalkinSearch, setNurseWalkinSearch] = useState('');
  const [nurseWalkinSearchResults, setNurseWalkinSearchResults] = useState<any[]>([]);
  const [creatingNurseWalkin, setCreatingNurseWalkin] = useState(false);
  const [showNurseQuickRegister, setShowNurseQuickRegister] = useState(false);
  const [nurseQuickRegForm, setNurseQuickRegForm] = useState({ first_name: '', last_name: '', phone: '', date_of_birth: '', gender: '' });
  const [addProcWalkin, setAddProcWalkin] = useState<any | null>(null);
  const [walkinProcedureId, setWalkinProcedureId] = useState<number | ''>('');
  const [walkinProcNotes, setWalkinProcNotes] = useState('');
  const [walkinProcList, setWalkinProcList] = useState<Array<{ charge_master_id: number; procedure_name: string; price: number; notes: string }>>([]);
  const [submittingWalkinProcs, setSubmittingWalkinProcs] = useState(false);

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
  const [activeTab, setActiveTab] = useState<'hp' | 'vitals' | 'orders' | 'pharmacy' | 'procedures' | 'notes' | 'routing' | 'documents' | 'billing'>('hp');
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

  // Medication administration loading
  const [administeringOrderId, setAdministeringOrderId] = useState<number | null>(null);

  // AI suggestions
  const [aiTriageSuggestion, setAiTriageSuggestion] = useState<{ suggested_priority: string; confidence: string; reasoning: string; key_concerns: string[]; recommended_actions: string[] } | null>(null);
  const [loadingTriageSuggestion, setLoadingTriageSuggestion] = useState(false);

  // Auto-save for vitals — the debounce timer lives inside the useEffect,
  // so we only need a flag to know whether the user has touched anything.
  const [vitalsModified, setVitalsModified] = useState(false);

  // Short Stay Unit state
  const [shortStayBeds, setShortStayBeds] = useState<ShortStayBed[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<number | null>(null);
  const [shortStayNotes, setShortStayNotes] = useState('');

  // Main view state - derived from route
  const mainView = location.pathname === '/nurse/inventory' ? 'inventory' : 'patients';

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
    loadNurseWalkIns();
    loadRooms();
    loadShortStayBeds();
    loadDoctorNotifications();
    loadDueTasks();
    loadDoctors();
  }, []);

  // Load orders/notes when selected patient changes — clearing the previous
  // patient's first, so they can never show under the new one.
  useEffect(() => {
    setLabOrders([]);
    setImagingOrders([]);
    setPharmacyOrders([]);
    setPatientLabHistory([]);
    setClinicalNotes([]);
    if (selectedPatient) {
      loadOrders();
      loadClinicalNotes();
    }
  }, [selectedPatient?.id]);
  const stillSelected = useActiveId<number | null>(selectedPatient?.id ?? null);

  // Smart polling: pauses when tab is hidden, refreshes immediately on
  // tab return. selectedPatientRef avoids re-subscribing on each patient
  // selection.
  useSmartPolling(() => {
    loadAssignedPatients();
    loadNurseProcedures();
    loadAvailableProcedures();
    loadNurseWalkIns();
    loadRooms();
    loadShortStayBeds();
    loadDoctorNotifications();
    loadDueTasks();
    if (selectedPatientRef.current) {
      loadOrders();
      loadClinicalNotes();
    }
  }, 30_000, true);

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
      // Deduplicate: first by encounter ID, then by patient_id (keep latest encounter per patient)
      const byEncounter = patients.filter((patient: AssignedPatient, index: number, self: AssignedPatient[]) =>
        index === self.findIndex((p) => p.id === patient.id)
      );
      const uniquePatients = byEncounter.filter((patient: AssignedPatient, index: number, self: AssignedPatient[]) =>
        index === self.findIndex((p) => p.patient_id === patient.patient_id)
      );
      // Play notification sound when a new patient is assigned
      const activeCount = uniquePatients.filter((p: AssignedPatient) => !p.is_checked_out).length;
      if (prevPatientCountRef.current > 0 && activeCount > prevPatientCountRef.current) {
        playNotificationSound();
      }
      prevPatientCountRef.current = activeCount;

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
      showToast('Failed to load procedure history', 'error');
    }
  };

  // ---- Nurse walk-in handlers ----
  const loadNurseWalkIns = async () => {
    try {
      const res = await apiClient.get('/department-routing/nurse/queue');
      setNurseWalkIns(res.data.queue || res.data.walk_ins || []);
    } catch (error) {
      console.error('Error loading nurse walk-ins:', error);
    }
  };

  const searchNurseWalkinPatients = async (query: string) => {
    setNurseWalkinSearch(query);
    if (query.length < 2) { setNurseWalkinSearchResults([]); return; }
    try {
      const res = await apiClient.get(`/patients?search=${encodeURIComponent(query)}&limit=5`);
      setNurseWalkinSearchResults(res.data.patients || []);
    } catch { setNurseWalkinSearchResults([]); }
  };

  const handleNewNurseWalkin = async (patient: any) => {
    setCreatingNurseWalkin(true);
    try {
      await apiClient.post('/workflow/check-in', {
        patient_id: patient.id,
        encounter_type: 'walk-in',
        chief_complaint: 'Nurse walk-in',
        clinic: 'Nurse (Procedures/Walk-in)',
      });
      showToast(`${patient.first_name} ${patient.last_name} checked in for nurse procedures`, 'success');
      setShowNewNurseWalkin(false);
      setNurseWalkinSearch('');
      setNurseWalkinSearchResults([]);
      loadNurseWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.response?.data?.error || 'Failed to check in patient', 'error');
    } finally {
      setCreatingNurseWalkin(false);
    }
  };

  const handleNurseQuickRegister = async () => {
    if (!nurseQuickRegForm.first_name || !nurseQuickRegForm.last_name || !nurseQuickRegForm.phone) {
      showToast('First name, last name, and phone are required', 'warning');
      return;
    }
    if (!(await confirmNotDuplicatePatient(confirmDialog, nurseQuickRegForm))) return;
    setCreatingNurseWalkin(true);
    try {
      const patientRes = await apiClient.post('/patients', {
        first_name: nurseQuickRegForm.first_name,
        last_name: nurseQuickRegForm.last_name,
        phone: nurseQuickRegForm.phone,
        date_of_birth: nurseQuickRegForm.date_of_birth || undefined,
        gender: nurseQuickRegForm.gender || undefined,
      });
      const newPatient = patientRes.data.patient;
      await apiClient.post('/workflow/check-in', {
        patient_id: newPatient.id,
        encounter_type: 'walk-in',
        chief_complaint: 'Nurse walk-in',
        clinic: 'Nurse (Procedures/Walk-in)',
      });
      showToast(`${nurseQuickRegForm.first_name} ${nurseQuickRegForm.last_name} registered and checked in`, 'success');
      setShowNewNurseWalkin(false);
      setShowNurseQuickRegister(false);
      setNurseQuickRegForm({ first_name: '', last_name: '', phone: '', date_of_birth: '', gender: '' });
      loadNurseWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to register patient', 'error');
    } finally {
      setCreatingNurseWalkin(false);
    }
  };

  const addWalkinProcedureToList = () => {
    if (!walkinProcedureId) return;
    const proc = availableProcedures.find(p => p.id === Number(walkinProcedureId));
    if (!proc) return;
    setWalkinProcList(prev => [...prev, {
      charge_master_id: proc.id,
      procedure_name: proc.service_name,
      price: Number(proc.price) || 0,
      notes: walkinProcNotes,
    }]);
    setWalkinProcedureId('');
    setWalkinProcNotes('');
  };

  // Order each procedure then immediately complete it so the charge lands on
  // the walk-in invoice — reception can then collect payment at checkout.
  const handleSubmitWalkinProcedures = async () => {
    if (!addProcWalkin || walkinProcList.length === 0) return;
    setSubmittingWalkinProcs(true);
    try {
      for (const p of walkinProcList) {
        const res = await apiClient.post('/nurse-procedures', {
          encounter_id: addProcWalkin.encounter_id,
          patient_id: addProcWalkin.patient_id,
          charge_master_id: p.charge_master_id,
          procedure_name: p.procedure_name,
          notes: p.notes || null,
        });
        await apiClient.post(`/nurse-procedures/${res.data.procedure.id}/complete`, {});
      }
      showToast(`${walkinProcList.length} procedure(s) recorded & billed for ${addProcWalkin.patient_name}`, 'success');
      setAddProcWalkin(null);
      setWalkinProcList([]);
      setWalkinProcedureId('');
      setWalkinProcNotes('');
      loadNurseWalkIns();
      loadNurseProcedures();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to record procedures', 'error');
    } finally {
      setSubmittingWalkinProcs(false);
    }
  };

  const handleNurseWalkinCheckout = async (walkin: any) => {
    const ok = await confirmDialog({
      title: 'Send to checkout?',
      message: `Send ${walkin.patient_name} to reception for checkout? Make sure every procedure has been added — they are billed on the walk-in invoice.`,
      variant: 'success',
      confirmLabel: 'Send to checkout',
    });
    if (!ok) return;
    try {
      await apiClient.post('/workflow/release-to-nurse', { encounter_id: walkin.encounter_id, from_department: 'nurse' });
      showToast(`${walkin.patient_name} sent to reception for checkout`, 'success');
      loadNurseWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to send to checkout', 'error');
    }
  };

  const removeNurseWalkin = async (walkin: any) => {
    const ok = await confirmDialog({
      title: 'Remove from queue?',
      message: `Remove ${walkin.patient_name} from the walk-in queue? Use this if they were checked in by mistake.`,
      variant: 'warning',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await apiClient.put(`/department-routing/${walkin.id}/status`, { status: 'cancelled' });
      showToast(`${walkin.patient_name} removed from queue`, 'success');
      loadNurseWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to remove', 'error');
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
    // Vitals typed for the previous patient must never follow the nurse to the
    // next one (the 3s auto-save used to post them to the newly selected
    // encounter). Save them to the patient they were typed for, then clear.
    const previous = selectedPatientRef.current;
    const handoff = decideVitalsHandoff({
      previousPatientId: previous?.id,
      nextPatientId: patient.id,
      vitals: vitals as unknown as Record<string, unknown>,
      modified: vitalsModified,
      errorCount: Object.keys(vitalErrors).length,
    });
    if (previous && handoff === 'save-to-previous') {
      const pendingVitals = vitals;
      apiClient
        .post('/workflow/nurse/vitals', { encounter_id: previous.id, vital_signs: pendingVitals })
        .then(() => showToast(`Vitals saved for ${previous.patient_name}`, 'info'))
        .catch(() => showToast(`Vitals for ${previous.patient_name} were NOT saved — reopen them and save again.`, 'error'));
    } else if (previous && handoff === 'discard') {
      showToast(`Unsaved vitals for ${previous.patient_name} were discarded (some values were out of range).`, 'warning');
    }
    if (previous && previous.id !== patient.id) {
      // Clear the form; with vitalsModified false the pending 3s auto-save
      // timer is cancelled by its effect cleanup.
      setVitals({ temperature_unit: 'C', weight_unit: 'kg', height_unit: 'cm' });
      setVitalsModified(false);
      setVitalErrors({});
    }
    setSelectedPatient(patient);
    selectedPatientRef.current = patient;
    setEditingRoom(false);
    setShowProcedureHistory(false);
    setProcedureHistory([]);
    setShowAddProcedure(false);

    // Load existing department routing history for this encounter
    try {
      const routingRes = await apiClient.get(`/department-routing/encounter/${patient.id}`);
      const routings = routingRes.data.routings || [];
      setRoutedDepartments(prev => {
        const newSet = new Set(prev);
        routings.forEach((r: { department: string; status: string }) => {
          if (r.status !== 'cancelled') {
            newSet.add(`${patient.id}-${r.department}`);
          }
        });
        return newSet;
      });
    } catch {
      // Non-critical — routing buttons will still work
    }

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

  // Parse ?highlight=<encounterId> from a notification deep-link (reacts to
  // every query-string change, not just mount), then strip it from the URL.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const highlight = params.get('highlight');
    if (highlight) {
      const id = Number(highlight);
      if (!Number.isNaN(id)) setHighlightId(id);
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Once the assigned-patients list is loaded, select + scroll to the
  // highlighted patient, flash it, then clear.
  useEffect(() => {
    if (highlightId == null) return;
    const match = assignedPatients.find((p) => p.id === highlightId);
    if (match) {
      handleSelectPatient(match);
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
      const t = setTimeout(() => setHighlightId(null), 4000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, assignedPatients]);

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
      if (!stillSelected(selectedPatient.id)) return;
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
      if (!stillSelected(selectedPatient.id)) return;
      setPatientLabHistory(histRes.data.lab_orders || []);
    } catch (error) {
      console.error('Error loading patient lab history:', error);
      if (stillSelected(selectedPatient.id)) setPatientLabHistory([]);
    }
  };

  const loadClinicalNotes = async () => {
    if (!selectedPatient) return;

    try {
      const res = await apiClient.get(`/clinical-notes/encounter/${selectedPatient.id}`);
      if (!stillSelected(selectedPatient.id)) return;
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

    // Don't auto-commit invalid / out-of-range values (e.g. a typo like temp
    // 370 or HR 900). Mirrors handleSubmitVitals — wait until the flagged fields
    // are corrected, otherwise a bad reading silently enters the record.
    if (Object.keys(vitalErrors).length > 0) return;

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
      // Surface the failure — previously this was silent, so a nurse could walk
      // away believing vitals were recorded when the save had failed.
      showToast('Vitals NOT saved — auto-save failed. Use the Save button to retry.', 'error');
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

  // AI triage suggestion
  const handleGetTriageSuggestion = async () => {
    if (!selectedPatient) return;
    setLoadingTriageSuggestion(true);
    setAiTriageSuggestion(null);
    try {
      const res = await apiClient.post('/ai/triage-suggest', {
        chiefComplaint: selectedPatient.chief_complaint,
        vitals: vitals,
      });
      setAiTriageSuggestion(res.data);
    } catch {
      showToast('AI triage suggestion unavailable', 'info');
    } finally {
      setLoadingTriageSuggestion(false);
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
    if (administeringOrderId) return; // Prevent double-click
    setAdministeringOrderId(orderId);
    try {
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
            setAdministeringOrderId(null);
            return;
          }
        } catch (error) {
          console.error('Error checking allergies:', error);
          showToast('Allergy check failed — proceeding with caution', 'warning');
        }
      }

      await executeAdministration(orderId, medicationName);
    } finally {
      setAdministeringOrderId(null);
    }
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
    } catch (error: any) {
      console.error('Error alerting doctor:', error);
      const msg = error.response?.data?.error || 'Failed to alert doctor';
      showToast(msg, 'error');
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ds-accent"></div>
      </div>
    );
  }

  const unreadNotifications = doctorNotifications.filter((n) => !n.is_read).length;
  return (
    <AppLayout designSystem>
      <DashboardHeader
        title="Nurse Dashboard"
        stats={(
          <>
            <StatPill label="patients" value={assignedPatients.length} tone={assignedPatients.length > 0 ? 'primary' : 'neutral'} title="Assigned patients" />
            <StatPill label="from doctor" value={unreadNotifications} tone={unreadNotifications > 0 ? 'warning' : 'neutral'} title="Unread doctor notifications" />
            <StatPill label="procedures" value={nurseProcedures.length} tone="neutral" title="Active nurse procedures" />
          </>
        )}
      />

      {/* Sub-view toggle: My Patients vs Walk-ins (wound dressing / procedures) */}
      {mainView === 'patients' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setShowNurseWalkins(false)}
            className={`min-h-ds-touch px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              !showNurseWalkins ? 'bg-ds-accent text-ds-on-accent border-ds-accent' : 'bg-ds-surface text-ds-text-secondary border-ds-border-control hover:bg-ds-subtle'
            }`}
          >
            My Patients
          </button>
          <button
            onClick={() => { setShowNurseWalkins(true); loadNurseWalkIns(); }}
            className={`min-h-ds-touch px-4 py-2 text-sm font-semibold rounded-lg border transition-colors flex items-center gap-2 ${
              showNurseWalkins ? 'bg-ds-accent text-ds-on-accent border-ds-accent' : 'bg-ds-surface text-ds-text-secondary border-ds-border-control hover:bg-ds-subtle'
            }`}
          >
            Walk-ins
            {nurseWalkIns.length > 0 && (
              <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${showNurseWalkins ? 'bg-ds-on-accent/20 text-ds-on-accent' : 'bg-ds-accent-soft text-ds-accent-text'}`}>
                {nurseWalkIns.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Quick Stats Row — matches Doctor Dashboard stat card pattern */}
      {mainView === 'patients' && !showNurseWalkins && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-ds-surface rounded-ds-card border border-ds-border p-4 flex flex-col items-center">
            <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider">Active Patients</p>
            <p className="text-2xl font-bold text-ds-text mt-1">{assignedPatients.filter(p => !p.is_checked_out).length}</p>
            <p className="text-xs text-ds-text-muted mt-0.5">in care today</p>
          </div>
          <div className="bg-ds-surface rounded-ds-card border border-ds-border p-4 flex flex-col items-center">
            <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider">Vitals Pending</p>
            <p className="text-2xl font-bold text-ds-warning-text mt-1">{assignedPatients.filter(p => !p.is_checked_out && (!p.vital_signs || Object.keys(p.vital_signs).length === 0)).length}</p>
            <p className="text-xs text-ds-text-muted mt-0.5">need vitals</p>
          </div>
          <div className="bg-ds-surface rounded-ds-card border border-ds-border p-4 flex flex-col items-center">
            <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider">Procedures</p>
            <p className="text-2xl font-bold text-ds-success-text mt-1">{nurseProcedures.filter(p => p.status === 'in_progress' || p.status === 'pending').length}</p>
            <p className="text-xs text-ds-text-muted mt-0.5">active / pending</p>
          </div>
          <div className="bg-ds-surface rounded-ds-card border border-ds-border p-4 flex flex-col items-center">
            <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider">Doctor Alerts</p>
            <p className={`text-2xl font-bold mt-1 ${unreadNotifications > 0 ? 'text-ds-warning-text' : 'text-ds-text'}`}>{unreadNotifications}</p>
            <p className="text-xs text-ds-text-muted mt-0.5">unread messages</p>
          </div>
        </div>
      )}

      {/* Room Status — refined card grid. Color reserved for state
          accent (left stripe + tiny dot), surface stays neutral. */}
      {mainView === 'patients' && !showNurseWalkins && (() => {
        const availableRooms = rooms.filter((r) => r.is_available).length;
        const occupiedRooms = rooms.length - availableRooms;
        return (
          <>
            <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-ds-text">Room Status</h2>
                  <span className="text-xs text-ds-text-muted">
                    {availableRooms} available · {occupiedRooms} occupied
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {rooms.map((room) => {
                  const patientInRoom = assignedPatients.find(
                    (p) => p.room_number === room.room_number,
                  );
                  const stripe = room.is_available ? 'bg-ds-success' : 'bg-ds-accent';
                  const dotColor = room.is_available ? 'bg-ds-success' : 'bg-ds-accent';
                  return (
                    <div
                      key={room.id}
                      className="relative bg-ds-surface rounded-ds-card border border-ds-border shadow-ds-card overflow-hidden flex"
                    >
                      <div className={`w-1 ${stripe}`} />
                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-ds-text-muted uppercase tracking-wider">
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          Room {room.room_number}
                        </div>
                        {room.is_available ? (
                          <div className="text-sm font-medium text-ds-text mt-1">Available</div>
                        ) : patientInRoom ? (
                          <button
                            onClick={() => navigate(`/patients/${patientInRoom.patient_id}`)}
                            className="text-sm mt-1 font-semibold text-ds-accent-text hover:text-ds-accent-text hover:underline truncate block w-full text-left"
                            title={`Click to view ${patientInRoom.patient_name}'s medical history`}
                          >
                            {patientInRoom.patient_name}
                          </button>
                        ) : (
                          <div className="text-sm font-medium text-ds-text mt-1">Occupied</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Auto-derived nurse insight */}
            {(() => {
              if (unreadNotifications >= 3) {
                return (
                  <div className="mb-4">
                    <InsightCard
                      tone="warning"
                      title={`${unreadNotifications} unread notes from doctors`}
                      body="Doctor follow-up notifications include reasons and target dates. Acknowledge them so they leave the queue."
                    />
                  </div>
                );
              }
              if (availableRooms === 0 && rooms.length > 0) {
                return (
                  <div className="mb-4">
                    <InsightCard
                      tone="warning"
                      title="All rooms occupied"
                      body="No rooms are free for new check-ins. Reception will queue incoming patients until a room opens up."
                    />
                  </div>
                );
              }
              return null;
            })()}
          </>
        );
      })()}

        {/* Walk-ins View — nurse-initiated walk-ins (wound dressing, dressings,
            injections, etc.). Same flow as lab/pharmacy walk-ins. */}
        {mainView === 'patients' && showNurseWalkins && (
          <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
            <div className="p-4 border-b border-ds-border flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Walk-in Patients</h2>
                <p className="text-sm text-ds-text-muted mt-0.5">Check in a patient for a procedure (e.g. wound dressing), record &amp; bill it, then send them to reception for checkout.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNewNurseWalkin(true)}
                  className="min-h-ds-touch px-3 py-1.5 text-sm bg-ds-accent text-ds-on-accent hover:bg-ds-accent-hover rounded-lg flex items-center gap-1 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Walk-in
                </button>
                <button
                  onClick={loadNurseWalkIns}
                  className="min-h-ds-touch px-3 py-1 text-sm bg-ds-subtle hover:bg-ds-border rounded-lg flex items-center gap-1"
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* New Walk-in Search */}
            {showNewNurseWalkin && (
              <div className="p-4 bg-ds-accent-soft border-b border-ds-accent/30">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-ds-accent-text">Check in a walk-in patient</h3>
                  <button onClick={() => { setShowNewNurseWalkin(false); setNurseWalkinSearch(''); setNurseWalkinSearchResults([]); setShowNurseQuickRegister(false); }} className="text-ds-text-muted hover:text-ds-text-secondary ml-auto">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <input
                  type="text"
                  value={nurseWalkinSearch}
                  onChange={(e) => searchNurseWalkinPatients(e.target.value)}
                  placeholder="Search patient by name or number..."
                  className="w-full px-3 py-2 border border-ds-accent/30 rounded-lg text-sm focus:ring-2 focus:ring-ds-focus-ring bg-ds-surface"
                  autoFocus
                />
                {nurseWalkinSearchResults.length > 0 && (
                  <div className="mt-2 bg-ds-surface border border-ds-border rounded-lg divide-y divide-ds-border max-h-48 overflow-y-auto">
                    {nurseWalkinSearchResults.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => handleNewNurseWalkin(p)}
                        disabled={creatingNurseWalkin}
                        className="min-h-ds-touch w-full px-4 py-2.5 flex justify-between items-center text-left hover:bg-ds-accent-soft transition-colors disabled:opacity-50"
                      >
                        <div>
                          <span className="font-medium text-ds-text text-sm">{p.first_name} {p.last_name}</span>
                          <span className="text-xs text-ds-text-muted ml-2">{p.patient_number}</span>
                        </div>
                        <span className="text-xs text-ds-accent-text font-medium">Check in →</span>
                      </button>
                    ))}
                  </div>
                )}
                {nurseWalkinSearch.length >= 2 && nurseWalkinSearchResults.length === 0 && !showNurseQuickRegister && (
                  <div className="mt-2 text-center py-3">
                    <p className="text-sm text-ds-text-muted mb-2">No patients found</p>
                    <button
                      onClick={() => {
                        const parts = nurseWalkinSearch.trim().split(/\s+/);
                        setNurseQuickRegForm({ first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '', phone: '', date_of_birth: '', gender: '' });
                        setShowNurseQuickRegister(true);
                      }}
                      className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg text-sm font-medium hover:bg-ds-accent-hover"
                    >
                      + Register New Patient
                    </button>
                  </div>
                )}
                {showNurseQuickRegister && (
                  <div className="mt-3 bg-ds-surface border border-ds-accent/30 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-ds-text">Quick Registration</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={nurseQuickRegForm.first_name} onChange={(e) => setNurseQuickRegForm({ ...nurseQuickRegForm, first_name: e.target.value })} placeholder="First Name *" className="px-3 py-2 border border-ds-border-control rounded-lg text-sm" />
                      <input type="text" value={nurseQuickRegForm.last_name} onChange={(e) => setNurseQuickRegForm({ ...nurseQuickRegForm, last_name: e.target.value })} placeholder="Last Name *" className="px-3 py-2 border border-ds-border-control rounded-lg text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={nurseQuickRegForm.phone} onChange={(e) => setNurseQuickRegForm({ ...nurseQuickRegForm, phone: e.target.value })} placeholder="Phone Number *" className="px-3 py-2 border border-ds-border-control rounded-lg text-sm" />
                      <div>
                        <label className="block text-[11px] text-ds-text-muted mb-0.5">Date of Birth</label>
                        <input type="date" value={nurseQuickRegForm.date_of_birth} onChange={(e) => setNurseQuickRegForm({ ...nurseQuickRegForm, date_of_birth: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <AppSelect
                        value={nurseQuickRegForm.gender}
                        onChange={(val) => setNurseQuickRegForm({ ...nurseQuickRegForm, gender: val })}
                        options={[
                          { value: 'male', label: 'Male' },
                          { value: 'female', label: 'Female' },
                        ]}
                        placeholder="Gender"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowNurseQuickRegister(false)} className="min-h-ds-touch px-3 py-2 text-ds-text-secondary border border-ds-border-control rounded-lg text-sm hover:bg-ds-subtle">Cancel</button>
                      <button onClick={handleNurseQuickRegister} disabled={creatingNurseWalkin} className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg text-sm font-medium hover:bg-ds-accent-hover disabled:opacity-50 flex-1">
                        {creatingNurseWalkin ? 'Registering...' : 'Register & Check In'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {nurseWalkIns.length === 0 ? (
              <div className="p-12 text-center text-ds-text-muted">
                <svg className="w-16 h-16 mx-auto mb-4 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-lg font-medium">No walk-in patients</p>
                <p className="text-sm mt-1">Click “New Walk-in” to check a patient in for a procedure.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-ds-border">
                <thead className="bg-ds-subtle">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Encounter</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Arrived</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ds-text-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ds-border">
                  {nurseWalkIns.map((walkin) => (
                    <tr key={walkin.id} className="hover:bg-ds-subtle">
                      <td className="px-6 py-4">
                        <div className="font-medium text-ds-text">{walkin.patient_name}</div>
                        <div className="text-sm text-ds-text-muted">{walkin.patient_number}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-ds-text-secondary">{walkin.encounter_number}</td>
                      <td className="px-6 py-4 text-sm text-ds-text-secondary">{walkin.notes || walkin.chief_complaint || '-'}</td>
                      <td className="px-6 py-4 text-sm text-ds-text-secondary">
                        {walkin.routed_at ? new Date(walkin.routed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          walkin.status === 'pending' ? 'bg-ds-warning-soft text-ds-warning-text' :
                          walkin.status === 'in-progress' ? 'bg-ds-info-soft text-ds-info-text' :
                          'bg-ds-subtle text-ds-text'
                        }`}>
                          {walkin.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-sm">
                          <button
                            onClick={() => { setAddProcWalkin(walkin); setWalkinProcList([]); setWalkinProcedureId(''); setWalkinProcNotes(''); }}
                            className="min-h-ds-touch px-2 py-1 bg-ds-accent text-ds-on-accent rounded text-xs font-semibold hover:bg-ds-accent-hover"
                          >
                            + Add Procedure
                          </button>
                          <button
                            onClick={() => navigate(`/patients/${walkin.patient_id}`)}
                            className="text-ds-accent-text hover:text-ds-accent-text font-medium"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleNurseWalkinCheckout(walkin)}
                            className="text-ds-success-text hover:text-ds-success-text font-medium"
                            title="Send to reception for checkout"
                          >
                            Checkout
                          </button>
                          <button
                            onClick={() => removeNurseWalkin(walkin)}
                            className="text-ds-critical-text hover:text-ds-critical-text font-medium"
                            title="Remove from queue (checked in by mistake)"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Add Procedure modal for a nurse walk-in */}
        {addProcWalkin && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b border-ds-border flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-ds-text">Add Procedure</h3>
                  <p className="text-sm text-ds-text-muted">{addProcWalkin.patient_name} · {addProcWalkin.patient_number}</p>
                </div>
                <button onClick={() => { setAddProcWalkin(null); setWalkinProcList([]); }} className="text-ds-text-muted hover:text-ds-text text-2xl leading-none">×</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-3">
                <div>
                  <label className="block text-xs font-medium text-ds-text-secondary mb-1">Procedure</label>
                  <AppSelect
                    value={walkinProcedureId === '' ? '' : String(walkinProcedureId)}
                    onChange={(val) => setWalkinProcedureId(val ? Number(val) : '')}
                    options={availableProcedures.map(p => ({ value: String(p.id), label: `${p.service_name} — GHS ${Number(p.price || 0).toFixed(2)}` }))}
                    placeholder="Select a procedure (e.g. wound dressing)..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ds-text-secondary mb-1">Notes (optional)</label>
                  <input type="text" value={walkinProcNotes} onChange={(e) => setWalkinProcNotes(e.target.value)} placeholder="e.g. dressing change, left leg" className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm" />
                </div>
                <button onClick={addWalkinProcedureToList} disabled={!walkinProcedureId} className="min-h-ds-touch px-3 py-2 bg-ds-subtle text-ds-text rounded-lg text-sm font-medium hover:bg-ds-border disabled:opacity-50">
                  + Add to list
                </button>

                {walkinProcList.length > 0 && (
                  <div className="border border-ds-border rounded-lg divide-y divide-ds-border">
                    {walkinProcList.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-ds-text">{p.procedure_name}</span>
                          {p.notes && <span className="text-ds-text-muted ml-2">— {p.notes}</span>}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-ds-text-secondary">GHS {p.price.toFixed(2)}</span>
                          <button onClick={() => setWalkinProcList(prev => prev.filter((_, i) => i !== idx))} className="text-ds-critical-text hover:text-ds-critical-text text-xs">Remove</button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 text-sm font-semibold bg-ds-subtle">
                      <span>Total</span>
                      <span>GHS {walkinProcList.reduce((s, p) => s + p.price, 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-ds-border bg-ds-subtle rounded-b-ds-card flex justify-end gap-2">
                <button onClick={() => { setAddProcWalkin(null); setWalkinProcList([]); }} className="min-h-ds-touch px-4 py-2 text-ds-text-secondary bg-ds-surface border border-ds-border-control rounded-lg hover:bg-ds-subtle">Cancel</button>
                <button onClick={handleSubmitWalkinProcedures} disabled={walkinProcList.length === 0 || submittingWalkinProcs} className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50">
                  {submittingWalkinProcs ? 'Saving...' : `Record & Bill ${walkinProcList.length || ''} Procedure${walkinProcList.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Patients View */}
        {mainView === 'patients' && !showNurseWalkins && (
        <>
        {/* Row 1: Three info cards side by side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 items-stretch">
          {/* Notifications */}
          <div className="flex">
            <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden w-full flex flex-col max-h-64">
              <div className="px-4 py-3 border-b border-ds-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-ds-warning-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <h2 className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">Notifications</h2>
                  </div>
                  {(dueTasksToday.length + dueTasksTomorrow.length) > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-ds-warning-soft text-ds-warning-text">
                      {dueTasksToday.length + dueTasksTomorrow.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                {dueTasksToday.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ds-critical-text uppercase mb-1">Due Today ({dueTasksToday.length})</p>
                    {dueTasksToday.map((task) => (
                      <div key={task.id} className="flex items-center justify-between py-1.5 px-2 bg-ds-critical-soft rounded mb-1">
                        <div>
                          <span className="text-sm font-medium text-ds-text">{task.patient_name}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${task.type === 'review' ? 'bg-ds-warning-soft text-ds-warning-text' : 'bg-ds-accent-soft text-ds-accent-text'}`}>
                            {task.type === 'review' ? 'Call' : 'Visit'}
                          </span>
                        </div>
                        {task.patient_phone && <span className="text-xs text-ds-text-muted">{task.patient_phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {dueTasksTomorrow.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ds-warning-text uppercase mb-1">Due Tomorrow ({dueTasksTomorrow.length})</p>
                    {dueTasksTomorrow.map((task) => (
                      <div key={task.id} className="flex items-center justify-between py-1.5 px-2 bg-ds-warning-soft rounded mb-1">
                        <div>
                          <span className="text-sm font-medium text-ds-text">{task.patient_name}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${task.type === 'review' ? 'bg-ds-warning-soft text-ds-warning-text' : 'bg-ds-accent-soft text-ds-accent-text'}`}>
                            {task.type === 'review' ? 'Call' : 'Visit'}
                          </span>
                        </div>
                        {task.patient_phone && <span className="text-xs text-ds-text-muted">{task.patient_phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {dueTasksToday.length === 0 && dueTasksTomorrow.length === 0 && (
                  <p className="text-xs text-ds-text-muted text-center py-2">No calls due today or tomorrow</p>
                )}
                <a href="/nurse/follow-up-calls" className="block text-center text-xs text-ds-accent-text hover:text-ds-accent-text font-medium pt-1">
                  View all calls →
                </a>
              </div>
            </div>

          </div>
          {/* Doctor Notifications */}
          <div className="flex">
            <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden w-full flex flex-col max-h-64">
              <div className="px-4 py-3 border-b border-ds-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-ds-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <h2 className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">Doctor Notifications</h2>
                  </div>
                  {doctorNotifications.filter(n => !n.is_read).length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-ds-warning-soft text-ds-warning-text">
                      {doctorNotifications.filter(n => !n.is_read).length}
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {doctorNotifications.length > 0 ? (
                  <div className="divide-y divide-ds-border">
                    {doctorNotifications.slice(0, 5).map((notification) => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 hover:bg-ds-subtle cursor-pointer ${
                          !notification.is_read ? 'bg-ds-warning-soft' : ''
                        }`}
                        onClick={() => openNotificationModal(notification)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-ds-text truncate">
                                {notification.patient_name}
                              </p>
                              {(() => {
                                const badge = getNotificationBadge(notification);
                                return <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${badge.color}`}>{badge.label}</span>;
                              })()}
                            </div>
                            <p className="text-xs text-ds-text-secondary mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-ds-text-muted mt-1">
                              From Dr. {notification.doctor_name} • {safeFormatDate(notification.created_at, 'h:mm a', 'N/A')}
                            </p>
                          </div>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-ds-warning rounded-full flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-ds-text-muted">
                    <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <p className="text-sm">No notifications</p>
                  </div>
                )}
              </div>
            </div>

          </div>
          {/* Assigned Patients */}
          <div className="flex">
            <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden w-full flex flex-col max-h-64">
              {/* Header */}
              <div className="px-4 py-3 border-b border-ds-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <h2 className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">
                      My Assigned Patients
                    </h2>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full tabular-nums ${
                    assignedPatients.length > 0 ? 'bg-ds-accent-soft text-ds-accent-text' : 'bg-ds-subtle text-ds-text-muted'
                  }`}>
                    {assignedPatients.length}
                  </span>
                </div>
              </div>

              {/* Column Headers */}
              <div className="bg-ds-subtle border-b border-ds-border px-4 py-2 grid grid-cols-12 gap-2 text-xs font-semibold text-ds-text-muted uppercase tracking-wider">
                <div className="col-span-1"></div>
                <div className="col-span-5">Patient</div>
                <div className="col-span-3">Room</div>
                <div className="col-span-3 text-right">ID</div>
              </div>

              {/* Patient List */}
              <div className="divide-y divide-ds-border max-h-[400px] overflow-y-auto">
                {assignedPatients.map((patient) => (
                  <div
                    key={patient.id}
                    ref={patient.id === highlightId ? highlightRef : undefined}
                    onClick={() => handleSelectPatient(patient)}
                    className={`px-4 py-2.5 grid grid-cols-12 gap-2 items-center cursor-pointer transition-all duration-150 group ${
                      patient.id === highlightId ? 'ring-2 ring-ds-focus-ring bg-ds-accent-soft ' : ''
                    }${
                      selectedPatient?.id === patient.id
                        ? 'bg-ds-accent-soft border-l-4 border-ds-accent'
                        : patient.is_checked_out
                        ? 'opacity-70 border-l-4 border-transparent hover:bg-ds-subtle hover:border-ds-border-control'
                        : 'border-l-4 border-transparent hover:bg-ds-accent-soft hover:border-l-4 hover:border-ds-accent/30'
                    }`}
                  >
                    {/* Priority Indicator */}
                    <div className="col-span-1 flex justify-center">
                      <div className={`w-3 h-3 rounded-full shadow-ds-card ${
                        patient.current_priority === 'red'
                          ? 'bg-ds-critical animate-pulse shadow-danger-300'
                          : patient.current_priority === 'yellow'
                          ? 'bg-ds-warning shadow-warning-200'
                          : 'bg-ds-success shadow-success-200'
                      }`} title={`Priority: ${patient.current_priority.toUpperCase()}`} />
                    </div>

                    {/* Patient Name */}
                    <div className="col-span-5">
                      <div className="flex items-center gap-1">
                        {patient.is_checked_out && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-ds-border text-ds-text-secondary border border-ds-border-control" title="Receptionist has checked this patient out — still editable until end of day.">
                            ✓ Out
                          </span>
                        )}
                        {patient.from_doctor && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-ds-accent-soft text-ds-brand-plum border border-ds-border" title="Returned from Doctor">
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
                              ? 'text-ds-accent-text'
                              : 'text-ds-text group-hover:text-ds-accent-text'
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
                          ? 'text-ds-text-secondary'
                          : 'text-ds-warning-text'
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
                      <span className="text-xs text-ds-text-muted font-mono">
                        {patient.patient_number}
                      </span>
                    </div>
                  </div>
                ))}

                {assignedPatients.length === 0 && (
                  <div className="text-center py-8 text-ds-text-muted">
                    <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <p className="text-sm font-medium">No assigned patients</p>
                  </div>
                )}
              </div>

              {/* Footer with Legend */}
              {assignedPatients.length > 0 && (
                <div className="bg-ds-subtle border-t border-ds-border px-4 py-2">
                  <div className="flex items-center justify-center gap-4 text-xs text-ds-text-muted">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-ds-success"></span> Low
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-ds-warning"></span> Medium
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-ds-critical"></span> High
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Short Stay Unit — compact horizontal layout above patient tabs */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-ds-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <h2 className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">Short Stay Unit</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full tabular-nums ${
                shortStayBeds.length === 0 ? 'bg-ds-subtle text-ds-text-muted' :
                shortStayBeds.filter(b => b.is_available).length > 0 ? 'bg-ds-accent-soft text-ds-brand-plum' : 'bg-ds-subtle text-ds-text-muted'
              }`}>
                {shortStayBeds.length === 0 ? '0 beds' : `${shortStayBeds.filter(b => b.is_available).length}/${shortStayBeds.length} available`}
              </span>
              {selectedPatient && shortStayBeds.some(b => b.is_available) && (
                <div className="flex items-center gap-2">
                  <AppSelect
                    value={selectedBedId || ''}
                    onChange={(val) => setSelectedBedId(val ? Number(val) : null)}
                    options={shortStayBeds.filter(b => b.is_available).map((bed) => ({ value: bed.id, label: bed.bed_name }))}
                    placeholder="Select bed..."
                  />
                  <button
                    onClick={handleAssignShortStayBed}
                    disabled={!selectedBedId}
                    className="min-h-ds-touch px-3 py-1.5 bg-ds-accent text-ds-on-accent rounded-lg text-xs font-semibold hover:bg-ds-accent-hover disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          </div>
          {shortStayBeds.length > 0 ? (
            <div className="px-4 py-2 flex gap-2 flex-wrap">
              {shortStayBeds.map((bed) => (
                <div
                  key={bed.id}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                    bed.is_available
                      ? 'border-ds-success/30 bg-ds-success-soft text-ds-success-text'
                      : 'border-ds-critical-border bg-ds-critical-soft text-ds-critical-text'
                  }`}
                >
                  {bed.bed_name}: {bed.is_available ? 'Available' : (
                    <span>
                      {bed.patient_name}
                      <button
                        onClick={() => handleReleaseShortStayBed(bed.id)}
                        className="ml-2 underline hover:text-ds-critical-text"
                      >
                        Release
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-ds-text-muted text-center">
              No beds configured
            </div>
          )}
        </div>

        {/* Folder Tabs for Patients */}
        {assignedPatients.length > 0 && (
          <div className="flex items-end gap-0.5 overflow-x-auto pb-0 -mb-px">
            {assignedPatients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => handleSelectPatient(patient)}
                className={`min-h-ds-touch px-5 py-2.5 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors whitespace-nowrap flex items-center gap-2 ${
                  selectedPatient?.id === patient.id
                    ? 'bg-ds-surface text-ds-text border-ds-border shadow-ds-card relative z-10'
                    : 'bg-ds-subtle text-ds-text-muted border-ds-border hover:bg-ds-subtle hover:text-ds-text'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  patient.current_priority === 'red' ? 'bg-ds-critical animate-pulse' :
                  patient.current_priority === 'yellow' ? 'bg-ds-warning' :
                  patient.is_checked_out ? 'bg-ds-border-control' :
                  'bg-ds-success'
                }`} />
                {patient.patient_name}
                {patient.room_number && <span className="text-xs text-ds-text-muted">Rm {patient.room_number}</span>}
                {patient.is_checked_out && <span className="text-[10px] text-ds-text-muted">Out</span>}
              </button>
            ))}
          </div>
        )}

        {/* Patient Content */}
        {selectedPatient ? (
          <div className="bg-ds-surface rounded-b-ds-card rounded-tr-xl shadow-ds-card border border-ds-border p-6 space-y-4">
                <PatientStickyBar
                  watch={patientHeaderRef}
                  name={selectedPatient.patient_name}
                  age={(selectedPatient as any).date_of_birth ? calculateAge((selectedPatient as any).date_of_birth) : undefined}
                  sex={(selectedPatient as any).gender}
                  patientNumber={selectedPatient.patient_number}
                  encounterNumber={selectedPatient.encounter_number}
                />
                {/* Patient Info Header */}
                <div className="pb-4 border-b border-ds-border">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 ref={patientHeaderRef} className="text-3xl font-bold text-ds-text mb-2">
                        {selectedPatient.patient_name}
                        {(selectedPatient as any).date_of_birth && (
                          <span className="text-lg font-normal text-ds-text-muted ml-2">
                            {calculateAge((selectedPatient as any).date_of_birth)}
                            {(selectedPatient as any).gender && <span className="ml-1">· {(selectedPatient as any).gender}</span>}
                          </span>
                        )}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                        <span className="text-ds-text-muted">
                          <span className="font-semibold text-ds-text-muted uppercase tracking-wider mr-1">Patient #</span>
                          <span className="font-mono text-ds-text-secondary">{selectedPatient.patient_number}</span>
                        </span>
                        <span className="text-ds-text-muted">&middot;</span>
                        <span className="text-ds-text-muted">
                          <span className="font-semibold text-ds-text-muted uppercase tracking-wider mr-1">Encounter</span>
                          <span className="font-mono text-ds-text-secondary">{selectedPatient.encounter_number}</span>
                        </span>
                        {selectedPatient.room_number && (
                          <>
                            <span className="text-ds-text-muted">&middot;</span>
                            <span className="inline-flex items-center px-2 py-0.5 bg-ds-success-soft text-ds-success-text text-xs font-semibold rounded">
                              {selectedPatient.room_name || `Room ${selectedPatient.room_number}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-ds-text-muted mr-1">TRIAGE:</span>
                      {(['green', 'yellow', 'red'] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => handleUpdateTriagePriority(p)}
                          className={`min-h-ds-touch px-3 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
                            selectedPatient.current_priority === p
                              ? p === 'red' ? 'bg-ds-critical text-white border-ds-critical shadow-ds-card'
                                : p === 'yellow' ? 'bg-ds-warning text-white dark:text-ds-canvas border-ds-warning shadow-ds-card'
                                : 'bg-ds-success text-white dark:text-ds-canvas border-ds-success shadow-ds-card'
                              : p === 'red' ? 'bg-ds-surface text-ds-critical-text border-ds-critical-border hover:bg-ds-critical-soft'
                                : p === 'yellow' ? 'bg-ds-surface text-ds-warning-text border-ds-warning-border hover:bg-ds-warning-soft'
                                : 'bg-ds-surface text-ds-success-text border-ds-success/30 hover:bg-ds-success-soft'
                          }`}
                        >
                          {p.toUpperCase()}
                        </button>
                      ))}
                      <button
                        onClick={handleGetTriageSuggestion}
                        disabled={loadingTriageSuggestion}
                        className="min-h-ds-touch ml-2 px-2 py-2 rounded-lg text-xs font-semibold bg-ds-info-soft text-ds-info-text border border-ds-info/30 hover:bg-ds-info/15 transition-colors"
                        title="AI triage suggestion"
                      >
                        {loadingTriageSuggestion ? '...' : '✨ AI'}
                      </button>
                    </div>
                    {/* AI Triage Suggestion */}
                    {aiTriageSuggestion && (
                      <div className={`mt-2 p-3 rounded-lg border text-xs ${
                        aiTriageSuggestion.suggested_priority === 'red' ? 'bg-ds-critical-soft border-ds-critical-border' :
                        aiTriageSuggestion.suggested_priority === 'yellow' ? 'bg-ds-warning-soft border-ds-warning-border' :
                        'bg-ds-success-soft border-ds-success/30'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">
                            AI Suggests: {aiTriageSuggestion.suggested_priority.toUpperCase()}
                            <span className="font-normal text-ds-text-muted ml-1">({aiTriageSuggestion.confidence} confidence)</span>
                          </span>
                          <button onClick={() => setAiTriageSuggestion(null)} className="text-ds-text-muted hover:text-ds-text-secondary">✕</button>
                        </div>
                        <p className="text-ds-text-secondary mb-1">{aiTriageSuggestion.reasoning}</p>
                        {aiTriageSuggestion.key_concerns?.length > 0 && (
                          <div className="mt-1">
                            <span className="font-semibold">Concerns: </span>
                            {aiTriageSuggestion.key_concerns.join(' • ')}
                          </div>
                        )}
                        {aiTriageSuggestion.suggested_priority !== selectedPatient.current_priority && (
                          <button
                            onClick={() => handleUpdateTriagePriority(aiTriageSuggestion.suggested_priority as 'green' | 'yellow' | 'red')}
                            className="min-h-ds-touch mt-2 px-3 py-1 bg-ds-info text-white dark:text-ds-canvas rounded font-semibold hover:bg-ds-info/90 transition-colors"
                          >
                            Apply {aiTriageSuggestion.suggested_priority.toUpperCase()} priority
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Vitals Summary Cards */}
                  {selectedPatient.vital_signs && Object.keys(selectedPatient.vital_signs).length > 0 && (
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {selectedPatient.vital_signs.blood_pressure_systolic && (
                        <div className="bg-ds-critical-soft rounded-lg p-2.5 text-center border border-ds-critical-border">
                          <p className="text-[10px] font-semibold text-ds-critical-text uppercase">BP</p>
                          <p className="text-sm font-bold text-ds-critical-text">{selectedPatient.vital_signs.blood_pressure_systolic}/{selectedPatient.vital_signs.blood_pressure_diastolic}</p>
                          <p className="text-[10px] text-ds-critical-text">mmHg</p>
                        </div>
                      )}
                      {selectedPatient.vital_signs.heart_rate && (
                        <div className="bg-ds-subtle rounded-lg p-2.5 text-center border border-ds-border">
                          <p className="text-[10px] font-semibold text-ds-brand-plum uppercase">HR</p>
                          <p className="text-sm font-bold text-ds-brand-plum">{selectedPatient.vital_signs.heart_rate}</p>
                          <p className="text-[10px] text-ds-brand-plum">bpm</p>
                        </div>
                      )}
                      {selectedPatient.vital_signs.temperature && (
                        <div className="bg-ds-warning-soft rounded-lg p-2.5 text-center border border-ds-warning-border">
                          <p className="text-[10px] font-semibold text-ds-warning-text uppercase">Temp</p>
                          <p className="text-sm font-bold text-ds-warning-text">{selectedPatient.vital_signs.temperature}°{selectedPatient.vital_signs.temperature_unit || 'C'}</p>
                          <p className="text-[10px] text-ds-warning-text">{selectedPatient.vital_signs.temperature_unit || 'Celsius'}</p>
                        </div>
                      )}
                      {selectedPatient.vital_signs.oxygen_saturation && (
                        <div className="bg-ds-info-soft rounded-lg p-2.5 text-center border border-ds-info/30">
                          <p className="text-[10px] font-semibold text-ds-info-text uppercase">SpO2</p>
                          <p className="text-sm font-bold text-ds-info-text">{selectedPatient.vital_signs.oxygen_saturation}%</p>
                          <p className="text-[10px] text-ds-info-text">Saturation</p>
                        </div>
                      )}
                      {selectedPatient.vital_signs.respiratory_rate && (
                        <div className="bg-ds-info-soft rounded-lg p-2.5 text-center border border-ds-info/30">
                          <p className="text-[10px] font-semibold text-ds-info-text uppercase">RR</p>
                          <p className="text-sm font-bold text-ds-info-text">{selectedPatient.vital_signs.respiratory_rate}</p>
                          <p className="text-[10px] text-ds-info-text">breaths/min</p>
                        </div>
                      )}
                      {selectedPatient.vital_signs.pain_level != null && (
                        <div className={`rounded-lg p-2.5 text-center border ${
                          selectedPatient.vital_signs.pain_level >= 7 ? 'bg-ds-critical-soft border-ds-critical-border' :
                          selectedPatient.vital_signs.pain_level >= 4 ? 'bg-ds-warning-soft border-ds-warning-border' :
                          'bg-ds-success-soft border-ds-success/30'
                        }`}>
                          <p className="text-[10px] font-semibold text-ds-text-secondary uppercase">Pain</p>
                          <p className="text-sm font-bold text-ds-text">{selectedPatient.vital_signs.pain_level}/10</p>
                          <p className="text-[10px] text-ds-text-muted">Level</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Patient Journey Timeline */}
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
                        'checked_in': { stage: 'Checked In', progress: 10, color: 'bg-ds-text-muted' },
                        'in_room': { stage: 'In Room', progress: 15, color: 'bg-ds-info' },
                        'vitals_complete': { stage: 'Vitals Complete', progress: 30, color: 'bg-ds-info' },
                        'with_nurse': { stage: 'With Nurse', progress: 35, color: 'bg-ds-accent' },
                        'waiting_for_doctor': { stage: 'Waiting for Doctor', progress: 45, color: 'bg-ds-warning' },
                        'with_doctor': { stage: 'With Doctor', progress: 55, color: 'bg-ds-brand-plum' },
                        'at_lab': { stage: 'At Lab', progress: 65, color: 'bg-ds-accent' },
                        'at_imaging': { stage: 'At Imaging', progress: 65, color: 'bg-ds-info' },
                        'at_pharmacy': { stage: 'At Pharmacy', progress: 75, color: 'bg-ds-success' },
                        'ready_for_checkout': { stage: 'Ready for Checkout', progress: 90, color: 'bg-ds-success' },
                        'completed': { stage: 'Completed', progress: 95, color: 'bg-ds-success' },
                        'discharged': { stage: 'Discharged', progress: 100, color: 'bg-ds-text-muted' },
                        'checked_out': { stage: 'Checked Out', progress: 100, color: 'bg-ds-text-muted' },
                      };

                      let { stage, progress } = statusMap[workflowStatus] || statusMap['checked_in'];

                      // Only allow "Ready for Checkout" if all orders are complete
                      if (workflowStatus === 'ready_for_checkout' && hasOrders && !allOrdersComplete) {
                        if (!labsComplete) {
                          stage = 'At Lab';
                          progress = 65;
                        } else if (!imagingComplete) {
                          stage = 'At Imaging';
                          progress = 65;
                        } else if (!pharmacyComplete) {
                          stage = 'At Pharmacy';
                          progress = 75;
                        } else {
                          stage = 'Orders Pending';
                          progress = 70;
                        }
                      }

                      // Adjust for orders completion
                      if (allOrdersComplete && progress < 85) {
                        progress = 85;
                        stage = 'Orders Complete';
                      }

                      // Define journey steps
                      const baseSteps = [
                        { key: 'checked_in', label: 'Check In', threshold: 10 },
                        { key: 'in_room', label: 'Room', threshold: 15 },
                        { key: 'vitals_complete', label: 'Vitals', threshold: 30 },
                        { key: 'with_nurse', label: 'Nurse', threshold: 35 },
                        { key: 'with_doctor', label: 'Doctor', threshold: 55 },
                      ];

                      // Conditionally add order steps
                      const orderSteps: { key: string; label: string; threshold: number }[] = [];
                      if (labOrders.length > 0) orderSteps.push({ key: 'at_lab', label: 'Lab', threshold: 65 });
                      if (imagingOrders.length > 0) orderSteps.push({ key: 'at_imaging', label: 'Imaging', threshold: 65 });
                      if (pharmacyOrders.length > 0) orderSteps.push({ key: 'at_pharmacy', label: 'Pharmacy', threshold: 75 });

                      const endSteps = [
                        { key: 'ready_for_checkout', label: 'Checkout', threshold: 90 },
                        { key: 'done', label: 'Done', threshold: 100 },
                      ];

                      const steps = [...baseSteps, ...orderSteps, ...endSteps];

                      return (
                        <div className="bg-ds-surface p-5 rounded-ds-card border border-ds-border">
                          <div className="flex items-center justify-between mb-4">
                            <div className="text-xs font-bold text-ds-text-muted uppercase tracking-wider">Patient Journey</div>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              progress >= 90 ? 'bg-ds-success-soft text-ds-success-text' :
                              progress >= 55 ? 'bg-ds-accent-soft text-ds-accent-text' :
                              'bg-ds-subtle text-ds-text-secondary'
                            }`}>
                              {stage}
                            </span>
                          </div>

                          {/* Step Timeline */}
                          <div className="flex items-start">
                            {steps.map((step, idx) => {
                              const isCompleted = progress > step.threshold;
                              const isCurrent = progress >= step.threshold && (idx === steps.length - 1 || progress < steps[idx + 1].threshold);

                              return (
                                <div key={step.key} className="flex items-start flex-1 min-w-0">
                                  <div className="flex flex-col items-center">
                                    {/* Circle */}
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                                      isCompleted
                                        ? 'bg-ds-accent border-ds-accent'
                                        : isCurrent
                                        ? 'bg-ds-accent border-ds-accent ring-4 ring-ds-focus-ring/30'
                                        : 'bg-ds-surface border-ds-border-control'
                                    }`}>
                                      {isCompleted ? (
                                        <svg className="w-3.5 h-3.5 text-ds-on-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : isCurrent ? (
                                        <div className="w-2.5 h-2.5 bg-ds-surface rounded-full animate-pulse" />
                                      ) : null}
                                    </div>
                                    {/* Label */}
                                    <span className={`mt-1.5 text-[10px] leading-tight text-center font-medium ${
                                      isCompleted ? 'text-ds-accent-text' :
                                      isCurrent ? 'text-ds-accent-text font-bold' :
                                      'text-ds-text-muted'
                                    }`}>
                                      {step.label}
                                    </span>
                                  </div>
                                  {/* Connecting line */}
                                  {idx < steps.length - 1 && (
                                    <div className={`flex-1 h-0.5 mt-3.5 mx-1 ${
                                      isCompleted ? 'bg-ds-accent' : 'bg-ds-border border-t border-dashed border-ds-border-control'
                                    }`} style={{ minWidth: '12px' }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Active Order Pills */}
                          {hasOrders && (
                            <div className="mt-4 pt-3 border-t border-ds-border flex flex-wrap gap-2">
                              {labOrders.length > 0 && (
                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                  labsComplete ? 'bg-ds-success-soft text-ds-success-text' : 'bg-ds-accent-soft text-ds-accent-text'
                                }`}>
                                  Lab ({labOrders.filter(o => o.status === 'completed').length}/{labOrders.length})
                                </span>
                              )}
                              {imagingOrders.length > 0 && (
                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                  imagingComplete ? 'bg-ds-success-soft text-ds-success-text' : 'bg-ds-info-soft text-ds-info-text'
                                }`}>
                                  Imaging ({imagingOrders.filter(o => o.status === 'completed').length}/{imagingOrders.length})
                                </span>
                              )}
                              {pharmacyOrders.length > 0 && (
                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                  pharmacyComplete ? 'bg-ds-success-soft text-ds-success-text' : 'bg-ds-warning-soft text-ds-warning-text'
                                }`}>
                                  Pharmacy ({pharmacyOrders.filter(o => o.status === 'completed' || o.status === 'dispensed').length}/{pharmacyOrders.length})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Room + Visit + Alert — clean single row */}
                  <div className="flex items-center gap-4 pt-4 mt-4 border-t border-ds-border">
                    {/* Room */}
                    <div className="w-48 flex-shrink-0">
                      <div className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider mb-1">Room</div>
                      {selectedPatient.room_number && !editingRoom ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ds-text">{selectedPatient.room_name || `Room ${selectedPatient.room_number}`}</span>
                          <button onClick={() => setEditingRoom(true)} className="text-xs text-ds-accent-text hover:text-ds-accent-text font-medium">Change</button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <AppSelect
                            value=""
                            onChange={(val) => { if (val) { handleAssignRoom(selectedPatient.id, Number(val)); setEditingRoom(false); } }}
                            options={rooms.filter((r) => r.is_available).map((room) => ({ value: room.id, label: room.room_name || `Room ${room.room_number}` }))}
                            placeholder={selectedPatient.room_number ? 'Change room...' : 'Assign room...'}
                          />
                          {editingRoom && <button onClick={() => setEditingRoom(false)} className="text-xs text-ds-text-muted hover:text-ds-text">Cancel</button>}
                        </div>
                      )}
                    </div>

                    {/* Today's Visit */}
                    <div className="flex-1">
                      <div className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider mb-1">Today's Visit</div>
                      {selectedPatient.chief_complaint && !editingTodaysVisit ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ds-text">{selectedPatient.chief_complaint}</span>
                          <button onClick={() => { setTodaysVisitValue(selectedPatient.chief_complaint); setEditingTodaysVisit(true); }} className="text-xs text-ds-accent-text hover:text-ds-accent-text font-medium">Edit</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={todaysVisitValue}
                            onChange={(e) => setTodaysVisitValue(e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-ds-border-control rounded-lg text-sm focus:ring-1 focus:ring-ds-focus-ring focus:border-ds-accent"
                            placeholder="Reason for visit..."
                            autoFocus
                          />
                          <VoiceDictationButton onTranscriptChange={setTodaysVisitValue} currentValue={todaysVisitValue} appendMode={true} size="sm" showStatus={false} />
                          <button onClick={handleUpdateTodaysVisit} className="min-h-ds-touch px-3 py-1.5 bg-ds-accent text-ds-on-accent text-xs rounded-lg hover:bg-ds-accent-hover font-semibold">Save</button>
                          {selectedPatient.chief_complaint && (
                            <button onClick={() => { setEditingTodaysVisit(false); setTodaysVisitValue(''); }} className="min-h-ds-touch px-3 py-1.5 bg-ds-subtle text-ds-text-secondary text-xs rounded-lg hover:bg-ds-border font-medium">Cancel</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Alert Doctor */}
                    <div className="flex-shrink-0">
                      <div className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-wider mb-1">&nbsp;</div>
                      {doctorAlertedPatients.has(selectedPatient.id) ? (
                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-ds-success-soft text-ds-success-text border border-ds-success/30 rounded-lg text-sm font-semibold">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          Doctor Alerted
                        </span>
                      ) : (
                        <button onClick={handleAlertDoctor} className="min-h-ds-touch inline-flex items-center gap-1.5 px-4 py-1.5 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover text-sm font-semibold transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                          Alert Doctor
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions Row */}
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => setShowLabOrderModal(true)} className="min-h-ds-touch px-3 py-1.5 text-xs bg-ds-surface text-ds-text-secondary border border-ds-border rounded-lg hover:bg-ds-subtle font-medium flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                      Order Labs
                    </button>
                    <button onClick={() => setShowImagingOrderModal(true)} className="min-h-ds-touch px-3 py-1.5 text-xs bg-ds-surface text-ds-text-secondary border border-ds-border rounded-lg hover:bg-ds-subtle font-medium flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
                      Order Imaging
                    </button>
                    <button onClick={() => setActiveTab('documents')} className="min-h-ds-touch px-3 py-1.5 text-xs bg-ds-surface text-ds-text-secondary border border-ds-border rounded-lg hover:bg-ds-subtle font-medium flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Documents
                    </button>
                  </div>
                </div>

                {/* Clinical Notes Section */}
                <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border">
                  <div className="flex justify-between items-center p-6 pb-0 mb-4">
                    <h2 className="text-2xl font-bold text-ds-text">Clinical Notes</h2>
                  </div>
                  <div className="border-b border-ds-border px-6">
                    <nav className="flex gap-2 overflow-x-auto" aria-label="Clinical Notes Tabs">
                      <button
                        onClick={() => setActiveTab('hp')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'hp'
                            ? 'border-ds-brand-plum text-ds-accent-text bg-ds-accent-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
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
                        onClick={() => setActiveTab('vitals')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'vitals'
                            ? 'border-ds-critical text-ds-critical-text bg-ds-critical-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          Vital Signs
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab('orders')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'orders'
                            ? 'border-ds-accent text-ds-accent-text bg-ds-accent-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                          Doctor's Orders
                          {(labOrders.length > 0 || imagingOrders.length > 0 || pharmacyOrders.length > 0) && (
                            <span className="px-2 py-0.5 text-xs bg-ds-accent-soft text-ds-accent-text rounded-full">
                              {labOrders.length + imagingOrders.length + pharmacyOrders.length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab('pharmacy')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'pharmacy'
                            ? 'border-ds-warning text-ds-warning-text bg-ds-warning-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          Pharmacy
                          {pharmacyOrders.length > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-ds-warning-soft text-ds-warning-text rounded-full">
                              {pharmacyOrders.length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab('procedures')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'procedures'
                            ? 'border-ds-success text-ds-success-text bg-ds-success-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                          Nurse Procedures
                          {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-ds-success-soft text-ds-success-text rounded-full">
                              {nurseProcedures.filter(p => p.encounter_id === selectedPatient.id).length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab('notes')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'notes'
                            ? 'border-ds-info text-ds-info-text bg-ds-info-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Clinical Notes
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab('routing')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'routing'
                            ? 'border-ds-accent text-ds-accent-text bg-ds-accent-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                          Patient Routing
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab('documents')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'documents'
                            ? 'border-ds-warning text-ds-warning-text bg-ds-warning-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          Documents
                        </div>
                      </button>
                      <button
                        onClick={async () => {
                          setActiveTab('billing');
                          if (selectedPatient) {
                            try {
                              const res = await apiClient.get(`/invoices/encounter/${selectedPatient.id}`);
                              const inv = res.data.invoice || res.data;
                              inv.items = res.data.items || [];
                              setEncounterInvoice(inv);
                            } catch {
                              setEncounterInvoice(null);
                              showToast('No invoice found for this encounter', 'info');
                            }
                          }
                        }}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          activeTab === 'billing'
                            ? 'border-ds-success text-ds-success-text bg-ds-success-soft'
                            : 'border-transparent text-ds-text-secondary hover:text-ds-text hover:border-ds-border-control'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Billing
                        </div>
                      </button>
                    </nav>
                  </div>

                  {/* Tab Content */}
                  <div className="p-6">
                    {/* AI-suggested tests — history + demographics driven. Read-only
                        for nurses; ordering authority stays with the doctor.
                        Deliberately ABOVE the tab content rather than inside the
                        Orders tab: buried there, nurses never found it, while the
                        doctor's copy sits inline on the encounter view. */}
                    {selectedPatient && (
                      <div className="mb-6">
                        <SuggestedTestsPanel
                          patientId={selectedPatient.patient_id}
                          encounterId={selectedPatient.id}
                          mode="nurse"
                          alreadyOrdered={labOrders.map(l => l.test_name || '')}
                        />
                      </div>
                    )}

                    {/* SOAP Tab */}
                    {activeTab === 'hp' && selectedPatient && (
                      <div>
                        <HPAccordion
                          key={selectedPatient.id}
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
                          <div className="bg-gradient-to-br from-ds-accent-soft to-ds-subtle border border-ds-accent/30 rounded-ds-card p-5">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="text-lg font-bold text-ds-text flex items-center gap-2">
                                <svg className="w-5 h-5 text-ds-accent-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                  className="flex items-center gap-1 text-sm text-ds-success-text hover:text-ds-success-text font-medium"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Edit Vitals
                                </button>
                                <button
                                  onClick={() => setShowVitalsHistory(true)}
                                  className="flex items-center gap-1 text-sm text-ds-accent-text hover:text-ds-accent-text font-medium"
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
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">Temperature</div>
                                  <div className="text-xl font-bold text-ds-text">
                                    {selectedPatient.vital_signs.temperature}°{selectedPatient.vital_signs.temperature_unit || 'C'}
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.heart_rate && (
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">Heart Rate</div>
                                  <div className="text-xl font-bold text-ds-text">
                                    {selectedPatient.vital_signs.heart_rate} <span className="text-sm font-normal">bpm</span>
                                  </div>
                                </div>
                              )}
                              {(selectedPatient.vital_signs.blood_pressure_systolic || selectedPatient.vital_signs.blood_pressure_diastolic) && (
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">Blood Pressure</div>
                                  <div className="text-xl font-bold text-ds-text">
                                    {selectedPatient.vital_signs.blood_pressure_systolic || '--'}/{selectedPatient.vital_signs.blood_pressure_diastolic || '--'} <span className="text-sm font-normal">mmHg</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.respiratory_rate && (
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">Resp. Rate</div>
                                  <div className="text-xl font-bold text-ds-text">
                                    {selectedPatient.vital_signs.respiratory_rate} <span className="text-sm font-normal">/min</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.oxygen_saturation && (
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">SpO2</div>
                                  <div className="text-xl font-bold text-ds-text">
                                    {selectedPatient.vital_signs.oxygen_saturation}%
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.weight && (
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">Weight</div>
                                  <div className="text-xl font-bold text-ds-text">
                                    {selectedPatient.vital_signs.weight} <span className="text-sm font-normal">{selectedPatient.vital_signs.weight_unit || 'kg'}</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.height && (
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">Height</div>
                                  <div className="text-xl font-bold text-ds-text">
                                    {selectedPatient.vital_signs.height} <span className="text-sm font-normal">{selectedPatient.vital_signs.height_unit || 'cm'}</span>
                                  </div>
                                </div>
                              )}
                              {selectedPatient.vital_signs.pain_level !== undefined && selectedPatient.vital_signs.pain_level !== null && (
                                <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                  <div className="text-xs text-ds-text-muted uppercase font-medium">Pain Level</div>
                                  <div className="text-xl font-bold text-ds-text">
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
                                    <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                      <div className="text-xs text-ds-text-muted uppercase font-medium">BMI</div>
                                      <div className="text-sm text-ds-text-muted mt-1">Enter weight & height</div>
                                    </div>
                                  );
                                }
                                const weightKg = vs.weight_unit === 'kg' ? w : w * 0.453592;
                                const heightM = vs.height_unit === 'cm' ? h / 100 : h * 0.0254;
                                if (!heightM || !weightKg) return null;
                                const bmi = weightKg / (heightM * heightM);
                                const category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
                                const color = bmi < 18.5 ? 'text-ds-warning-text' : bmi < 25 ? 'text-ds-success-text' : bmi < 30 ? 'text-ds-warning-text' : 'text-ds-critical-text';
                                return (
                                  <div className="bg-ds-surface rounded-lg p-3 shadow-ds-card">
                                    <div className="text-xs text-ds-text-muted uppercase font-medium">BMI</div>
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
                          <div className="bg-ds-warning-soft border border-ds-warning-border rounded-ds-card p-4 text-ds-warning-text flex items-center gap-3">
                            <svg className="w-5 h-5 text-ds-warning-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="font-medium">No vital signs recorded yet. Please enter vital signs below.</span>
                          </div>
                        )}

                        {/* Vital Signs Entry Form */}
                        <div ref={vitalsFormRef} className="bg-ds-surface border border-ds-border rounded-ds-card p-5">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-ds-text flex items-center gap-2">
                              <svg className="w-5 h-5 text-ds-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              {selectedPatient?.vital_signs && Object.keys(selectedPatient.vital_signs).length > 0 ? 'Update Vital Signs' : 'Record New Vital Signs'}
                            </h3>
                            {vitalsModified && (
                              <span className="text-sm text-ds-warning-text flex items-center gap-1">
                                <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Auto-saving...
                              </span>
                            )}
                          </div>
                          <form onSubmit={handleSubmitVitals} className="space-y-4">
                            {/* Row 1: Temperature & Heart Rate */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Temperature */}
                              <div className="bg-ds-surface rounded-lg p-3 border border-ds-border border-l-4 border-l-ds-warning">
                                <label className="flex items-center gap-2 text-xs font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                                  <svg className="w-4 h-4 text-ds-warning-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    className={`flex-1 min-w-0 text-base font-semibold py-2 px-3 border rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none ${vitalErrors.temperature ? 'border-ds-critical bg-ds-critical-soft' : 'border-ds-border-control'}`}
                                    placeholder="37.0"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setVitals({ ...vitals, temperature_unit: vitals.temperature_unit === 'C' ? 'F' : 'C' })}
                                    className="min-h-ds-touch flex-shrink-0 px-3 py-2 text-xs font-bold border border-ds-border-control rounded-lg bg-ds-subtle hover:bg-ds-subtle text-ds-text-secondary transition-colors"
                                  >
                                    °{vitals.temperature_unit || 'C'}
                                  </button>
                                </div>
                                {vitalErrors.temperature && (
                                  <p className="text-xs text-ds-critical-text mt-2 font-medium">{vitalErrors.temperature}</p>
                                )}
                              </div>

                              {/* Heart Rate */}
                              <div className="bg-ds-surface rounded-lg p-3 border border-ds-border border-l-4 border-l-ds-brand-plum">
                                <label className="flex items-center gap-2 text-xs font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                                  <svg className="w-4 h-4 text-ds-brand-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    className={`flex-1 min-w-0 text-base font-semibold py-2 px-3 border rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none ${vitalErrors.heart_rate ? 'border-ds-critical bg-ds-critical-soft' : 'border-ds-border-control'}`}
                                    placeholder="72"
                                  />
                                  <span className="flex-shrink-0 text-xs font-medium text-ds-text-muted">bpm</span>
                                </div>
                                {vitalErrors.heart_rate && (
                                  <p className="text-xs text-ds-critical-text mt-2 font-medium">{vitalErrors.heart_rate}</p>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Blood Pressure */}
                            <div className="bg-ds-surface rounded-lg p-3 border border-ds-border border-l-4 border-l-ds-critical">
                              <label className="flex items-center gap-2 text-xs font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                                <svg className="w-4 h-4 text-ds-critical-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Blood Pressure
                              </label>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-ds-text-muted font-medium mb-1 text-center">Systolic</div>
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
                                    className={`w-full text-base font-semibold text-center py-2 px-3 border rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none ${vitalErrors.blood_pressure_systolic ? 'border-ds-critical bg-ds-critical-soft' : 'border-ds-border-control'}`}
                                    placeholder="120"
                                  />
                                </div>
                                <span className="flex-shrink-0 text-lg font-bold text-ds-text-muted">/</span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-ds-text-muted font-medium mb-1 text-center">Diastolic</div>
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
                                    className={`w-full text-base font-semibold text-center py-2 px-3 border rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none ${vitalErrors.blood_pressure_diastolic ? 'border-ds-critical bg-ds-critical-soft' : 'border-ds-border-control'}`}
                                    placeholder="80"
                                  />
                                </div>
                                <span className="flex-shrink-0 text-xs font-medium text-ds-text-muted">mmHg</span>
                              </div>
                              {(vitalErrors.blood_pressure_systolic || vitalErrors.blood_pressure_diastolic) && (
                                <p className="text-xs text-ds-critical-text mt-2 font-medium">
                                  {vitalErrors.blood_pressure_systolic || vitalErrors.blood_pressure_diastolic}
                                </p>
                              )}
                            </div>

                            {/* Row 3: Respiratory Rate & O2 Saturation */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Respiratory Rate */}
                              <div className="bg-ds-surface rounded-lg p-3 border border-ds-border border-l-4 border-l-ds-info">
                                <label className="flex items-center gap-2 text-xs font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                                  <svg className="w-4 h-4 text-ds-info-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    className={`flex-1 min-w-0 text-base font-semibold py-2 px-3 border rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none ${vitalErrors.respiratory_rate ? 'border-ds-critical bg-ds-critical-soft' : 'border-ds-border-control'}`}
                                    placeholder="16"
                                  />
                                  <span className="flex-shrink-0 text-xs font-medium text-ds-text-muted">/min</span>
                                </div>
                                {vitalErrors.respiratory_rate && (
                                  <p className="text-xs text-ds-critical-text mt-2 font-medium">{vitalErrors.respiratory_rate}</p>
                                )}
                              </div>

                              {/* O2 Saturation */}
                              <div className="bg-ds-surface rounded-lg p-3 border border-ds-border border-l-4 border-l-ds-info">
                                <label className="flex items-center gap-2 text-xs font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                                  <svg className="w-4 h-4 text-ds-info-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    className={`flex-1 min-w-0 text-base font-semibold py-2 px-3 border rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none ${vitalErrors.oxygen_saturation ? 'border-ds-critical bg-ds-critical-soft' : 'border-ds-border-control'}`}
                                    placeholder="98"
                                  />
                                  <span className="flex-shrink-0 text-xs font-medium text-ds-text-muted">%</span>
                                </div>
                                {vitalErrors.oxygen_saturation && (
                                  <p className="text-xs text-ds-critical-text mt-2 font-medium">{vitalErrors.oxygen_saturation}</p>
                                )}
                              </div>
                            </div>

                            {/* Row 4: Weight & Height */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Weight */}
                              <div className="bg-ds-surface rounded-lg p-3 border border-ds-border border-l-4 border-l-ds-success">
                                <label className="flex items-center gap-2 text-xs font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                                  <svg className="w-4 h-4 text-ds-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    className="flex-1 min-w-0 text-base font-semibold py-2 px-3 border border-ds-border-control rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none"
                                    placeholder="70"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setVitals({ ...vitals, weight_unit: vitals.weight_unit === 'kg' ? 'lbs' : 'kg' })}
                                    className="min-h-ds-touch flex-shrink-0 px-3 py-2 text-xs font-bold border border-ds-border-control rounded-lg bg-ds-subtle hover:bg-ds-subtle text-ds-text-secondary transition-colors"
                                  >
                                    {vitals.weight_unit || 'kg'}
                                  </button>
                                </div>
                              </div>

                              {/* Height */}
                              <div className="bg-ds-surface rounded-lg p-3 border border-ds-border border-l-4 border-l-ds-brand-plum">
                                <label className="flex items-center gap-2 text-xs font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                                  <svg className="w-4 h-4 text-ds-brand-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    className="flex-1 min-w-0 text-base font-semibold py-2 px-3 border border-ds-border-control rounded-lg bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent outline-none"
                                    placeholder="170"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setVitals({ ...vitals, height_unit: vitals.height_unit === 'cm' ? 'in' : 'cm' })}
                                    className="min-h-ds-touch flex-shrink-0 px-3 py-2 text-xs font-bold border border-ds-border-control rounded-lg bg-ds-subtle hover:bg-ds-subtle text-ds-text-secondary transition-colors"
                                  >
                                    {vitals.height_unit || 'cm'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* BMI Auto-calculation */}
                            {vitals.weight && vitals.height && (
                              <div className="bg-ds-surface rounded-lg p-3 border border-ds-border">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-ds-info-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-xs font-semibold text-ds-text-secondary uppercase tracking-wider">BMI (Auto-calculated)</span>
                                  </div>
                                  {(() => {
                                    // Convert to metric for BMI calculation
                                    const weightKg = vitals.weight_unit === 'kg' ? vitals.weight : vitals.weight * 0.453592;
                                    const heightM = vitals.height_unit === 'cm' ? vitals.height / 100 : vitals.height * 0.0254;
                                    const bmi = weightKg / (heightM * heightM);
                                    const bmiCategory = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
                                    const categoryColor = bmi < 18.5 ? 'text-ds-info-text' : bmi < 25 ? 'text-ds-success-text' : bmi < 30 ? 'text-ds-warning-text' : 'text-ds-critical-text';
                                    const categoryBg = bmi < 18.5 ? 'bg-ds-info-soft' : bmi < 25 ? 'bg-ds-success-soft' : bmi < 30 ? 'bg-ds-warning-soft' : 'bg-ds-critical-soft';
                                    return (
                                      <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-ds-text">{bmi.toFixed(1)}</span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${categoryColor} ${categoryBg}`}>
                                          {bmiCategory}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

                            <div className="flex justify-end">
                              <button type="submit" className="min-h-ds-touch px-6 py-2.5 bg-ds-accent text-ds-on-accent rounded-lg font-semibold text-sm hover:bg-ds-accent-hover transition-colors">
                                Save Vital Signs
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Doctor's Orders Tab */}
                    {activeTab === 'orders' && (
                      <div className="space-y-4">
                        {/* Create Lab Order */}
                        <div className="flex justify-end gap-2 mb-4">
                          <button
                            onClick={() => setShowLabOrderModal(true)}
                            className="min-h-ds-touch bg-ds-accent text-ds-on-accent px-4 py-2 rounded-lg hover:bg-ds-accent-hover flex items-center gap-2 text-sm font-medium"
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
                            <h3 className="text-lg font-bold text-ds-accent-text mb-3 flex items-center gap-2">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              </svg>
                              Doctor's Instructions for Nurse
                            </h3>
                            <div className="space-y-2">
                              {clinicalNotes
                                .filter(n => n.note_type === 'doctor_to_nurse')
                                .map((note) => (
                                  <div key={note.id} className="border-2 border-ds-accent/30 rounded-lg p-4 bg-ds-accent-soft shadow-ds-card">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-ds-accent-text font-semibold">
                                        Dr. {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <span className="px-2 py-1 bg-ds-accent text-ds-on-accent text-xs font-bold rounded-full">
                                        NURSE INSTRUCTIONS
                                      </span>
                                    </div>
                                    <div className="text-sm text-ds-text font-medium whitespace-pre-wrap bg-ds-surface p-3 rounded border border-ds-accent/30">
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
                            <h3 className="text-lg font-bold text-ds-text-secondary mb-3 flex items-center gap-2">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                              Doctor's Procedural Notes
                            </h3>
                            <div className="space-y-2">
                              {clinicalNotes
                                .filter(n => n.note_type === 'doctor_procedural')
                                .map((note) => (
                                  <div key={note.id} className="border-2 border-ds-border-control rounded-lg p-4 bg-ds-subtle shadow-ds-card">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-ds-text-secondary font-semibold">
                                        Dr. {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <span className="px-2 py-1 bg-ds-text-secondary text-ds-canvas text-xs font-bold rounded-full">
                                        PROCEDURE
                                      </span>
                                    </div>
                                    <div className="text-sm text-ds-text whitespace-pre-wrap bg-ds-surface p-3 rounded border border-ds-border">
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
                                <h3 className="text-lg font-semibold text-ds-accent-text mb-2">Laboratory Orders</h3>
                                <div className="space-y-2">
                                  {labOrders.map((order) => (
                                    <div key={order.id} className={`border rounded-lg p-3 ${order.results ? 'border-ds-success/50 bg-ds-success-soft' : 'border-ds-accent/30 bg-ds-accent-soft'}`}>
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-ds-text">{order.test_name}</h4>
                                          {order.test_code && (
                                            <p className="text-sm text-ds-text-secondary">Code: {order.test_code}</p>
                                          )}
                                          <p className="text-xs text-ds-text-muted mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                          <p className="text-xs text-ds-text-muted mt-0.5">
                                            {safeFormatDate(order.ordered_date, 'MMM d, yyyy h:mm a')}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                            order.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                            'bg-ds-success-soft text-ds-success-text'
                                          }`}>
                                            {order.priority.toUpperCase()}
                                          </span>
                                          <div className={`text-xs mt-1 font-medium ${
                                            order.status === 'completed' ? 'text-ds-success-text' : 'text-ds-text-secondary'
                                          }`}>{order.status}</div>
                                        </div>
                                      </div>
                                      {/* Lab Results */}
                                      {order.results && (
                                        <div className="mt-2 p-2 bg-ds-surface rounded border border-ds-success/30">
                                          <div className="flex items-center gap-1 mb-1">
                                            <svg className="w-4 h-4 text-ds-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-xs font-semibold text-ds-success-text">Results Available</span>
                                            {order.results_available_at && (
                                              <span className="text-xs text-ds-text-muted ml-auto">
                                                {safeFormatDate(order.results_available_at, 'MMM d, yyyy h:mm a')}
                                              </span>
                                            )}
                                          </div>
                                          <LabResultsInline result={order.results} orderId={order.id} compact />
                                        </div>
                                      )}
                                      {order.notes && !order.results && (
                                        <p className="mt-1 text-xs text-ds-text-muted italic">Notes: {order.notes}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Patient Lab History — completed labs from prior encounters */}
                            {patientLabHistory.filter(o => o.encounter_id !== selectedPatient.id).length > 0 && (
                              <div className="mb-4 border border-ds-border rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => setShowLabHistory(v => !v)}
                                  className="min-h-ds-touch w-full flex items-center justify-between px-4 py-2.5 bg-ds-subtle hover:bg-ds-subtle text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-ds-accent-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-ds-text-secondary">
                                      Past Lab Results
                                    </span>
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-ds-accent-soft text-ds-accent-text">
                                      {patientLabHistory.filter(o => o.encounter_id !== selectedPatient.id).length}
                                    </span>
                                  </div>
                                  <svg className={`w-4 h-4 text-ds-text-muted transition-transform ${showLabHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {showLabHistory && (
                                  <div className="divide-y divide-ds-border max-h-96 overflow-y-auto">
                                    {patientLabHistory
                                      .filter(o => o.encounter_id !== selectedPatient.id)
                                      .map(order => (
                                        <div key={order.id} className="p-3 bg-ds-surface">
                                          <div className="flex justify-between items-start mb-1">
                                            <div>
                                              <div className="font-semibold text-sm text-ds-text">{order.test_name}</div>
                                              <div className="text-xs text-ds-text-muted">
                                                {order.results_available_at
                                                  ? safeFormatDate(order.results_available_at, 'MMM d, yyyy')
                                                  : safeFormatDate(order.ordered_date, 'MMM d, yyyy')}
                                                {order.ordering_provider_name && ` · ordered by ${order.ordering_provider_name}`}
                                              </div>
                                            </div>
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-ds-success-soft text-ds-success-text">
                                              {order.status}
                                            </span>
                                          </div>
                                          {order.results && (
                                            <pre className="mt-1 text-xs text-ds-text whitespace-pre-wrap font-sans bg-ds-subtle rounded p-2 border border-ds-border">
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
                                <h3 className="text-lg font-semibold text-ds-accent-text mb-2">Imaging Orders</h3>
                                <div className="space-y-2">
                                  {imagingOrders.map((order) => (
                                    <div key={order.id} className="border border-ds-accent/30 rounded-lg p-3 bg-ds-accent-soft">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-ds-text">{order.imaging_type}</h4>
                                          <p className="text-sm text-ds-text-secondary">Body Part: {order.body_part}</p>
                                          <p className="text-xs text-ds-text-muted mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                          <p className="text-xs text-ds-text-muted mt-0.5">
                                            {safeFormatDate(order.ordered_date, 'MMM d, yyyy h:mm a')}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                            order.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                            'bg-ds-success-soft text-ds-success-text'
                                          }`}>
                                            {order.priority.toUpperCase()}
                                          </span>
                                          <div className="text-xs text-ds-text-secondary mt-1">{order.status}</div>
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
                                <h3 className="text-lg font-semibold text-ds-accent-text mb-2">Pharmacy Orders</h3>
                                <div className="space-y-2">
                                  {pharmacyOrders.map((order) => (
                                    <div key={order.id} className={`border rounded-lg p-3 ${
                                      order.status === 'ready' ? 'border-ds-warning-border bg-ds-warning-soft' :
                                      order.status === 'dispensed' ? 'border-ds-success/30 bg-ds-success-soft' :
                                      'border-ds-accent/30 bg-ds-accent-soft'
                                    }`}>
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-ds-text">{order.medication_name}</h4>
                                          <p className="text-sm text-ds-text-secondary">
                                            {order.dosage} | {order.frequency} | {order.route}
                                          </p>
                                          <p className="text-xs text-ds-text-muted mt-1">
                                            Ordered by: {order.ordering_provider_name}
                                          </p>
                                          <p className="text-xs text-ds-text-muted mt-0.5">
                                            {safeFormatDate(order.ordered_date, 'MMM d, yyyy h:mm a')}
                                          </p>
                                        </div>
                                        <div className="ml-4 text-right flex flex-col items-end gap-2">
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            order.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                            order.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                            'bg-ds-success-soft text-ds-success-text'
                                          }`}>
                                            {order.priority.toUpperCase()}
                                          </span>
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            order.status === 'ready' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                            order.status === 'dispensed' ? 'bg-ds-success-soft text-ds-success-text' :
                                            order.status === 'in_progress' ? 'bg-ds-accent-soft text-ds-accent-text' :
                                            'bg-ds-subtle text-ds-text'
                                          }`}>
                                            {order.status === 'ready' ? '📦 Ready for Pickup' :
                                             order.status === 'dispensed' ? '✓ Dispensed' :
                                             order.status === 'in_progress' ? 'Preparing' :
                                             order.status}
                                          </span>
                                          {order.status === 'ready' && (
                                            <button
                                              onClick={() => confirmMedicationPickup(order.id)}
                                              className="min-h-ds-touch px-3 py-1 bg-ds-success text-white dark:text-ds-canvas text-xs rounded-lg hover:bg-ds-success/90"
                                            >
                                              Confirm Pickup
                                            </button>
                                          )}
                                          {order.status === 'dispensed' && (
                                            <button
                                              onClick={() => handleAdministerMedication(order.id, order.medication_name)}
                                              disabled={administeringOrderId === order.id}
                                              className="min-h-ds-touch px-3 py-1 bg-ds-accent text-ds-on-accent text-xs rounded-lg hover:bg-ds-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {administeringOrderId === order.id ? 'Checking...' : 'Record Administration'}
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
                          <div className="text-center py-8 text-ds-text-muted">
                            No doctor's orders for this patient
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pharmacy Tab */}
                    {activeTab === 'pharmacy' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-ds-warning-text">Pharmacy Orders</h3>
                          <span className="text-sm text-ds-text-muted">{pharmacyOrders.length} order{pharmacyOrders.length !== 1 ? 's' : ''}</span>
                        </div>
                        {pharmacyOrders.length > 0 ? (
                          <div className="space-y-2">
                            {pharmacyOrders.map((order) => (
                              <div key={order.id} className={`border rounded-lg p-4 ${
                                order.status === 'ready' ? 'border-ds-warning-border bg-ds-warning-soft' :
                                order.status === 'dispensed' ? 'border-ds-success/30 bg-ds-success-soft' :
                                'border-ds-warning-border bg-ds-warning-soft'
                              }`}>
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-ds-text">{order.medication_name}</h4>
                                    <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-ds-text-secondary">
                                      <div><span className="font-medium text-ds-text-muted">Dosage:</span> {order.dosage}</div>
                                      <div><span className="font-medium text-ds-text-muted">Frequency:</span> {order.frequency}</div>
                                      <div><span className="font-medium text-ds-text-muted">Route:</span> {order.route}</div>
                                      <div><span className="font-medium text-ds-text-muted">Priority:</span>{' '}
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                          order.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                          order.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                          'bg-ds-success-soft text-ds-success-text'
                                        }`}>
                                          {order.priority.toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-xs text-ds-text-muted mt-2">
                                      Ordered by: {order.ordering_provider_name} &middot; {safeFormatDate(order.ordered_date, 'MMM d, yyyy h:mm a')}
                                    </p>
                                  </div>
                                  <div className="ml-4 flex flex-col items-end gap-2">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      order.status === 'ready' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                      order.status === 'dispensed' ? 'bg-ds-success-soft text-ds-success-text' :
                                      order.status === 'in_progress' ? 'bg-ds-accent-soft text-ds-accent-text' :
                                      'bg-ds-subtle text-ds-text'
                                    }`}>
                                      {order.status === 'ready' ? 'Ready for Pickup' :
                                       order.status === 'dispensed' ? 'Dispensed' :
                                       order.status === 'in_progress' ? 'Preparing' :
                                       order.status}
                                    </span>
                                    {order.status === 'ready' && (
                                      <button
                                        onClick={() => confirmMedicationPickup(order.id)}
                                        className="min-h-ds-touch px-3 py-1.5 bg-ds-success text-white dark:text-ds-canvas text-xs font-semibold rounded-lg hover:bg-ds-success/90"
                                      >
                                        Confirm Pickup
                                      </button>
                                    )}
                                    {order.status === 'dispensed' && (
                                      <button
                                        onClick={() => handleAdministerMedication(order.id, order.medication_name)}
                                        disabled={administeringOrderId === order.id}
                                        className="min-h-ds-touch px-3 py-1.5 bg-ds-accent text-ds-on-accent text-xs font-semibold rounded-lg hover:bg-ds-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {administeringOrderId === order.id ? 'Checking...' : 'Record Administration'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-ds-text-muted">
                            No pharmacy orders for this patient
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nurse Procedures Tab */}
                    {activeTab === 'procedures' && (
                      <div className="space-y-4">
                        {/* Add Procedure Button */}
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-semibold text-ds-text">Procedures</h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowProcedureHistory(!showProcedureHistory);
                                if (!showProcedureHistory) {
                                  loadProcedureHistory(selectedPatient.id);
                                }
                              }}
                              className="min-h-ds-touch px-3 py-2 text-sm font-medium text-ds-text-secondary bg-ds-subtle rounded-lg hover:bg-ds-border transition-colors"
                            >
                              {showProcedureHistory ? 'Hide History' : 'View History'}
                            </button>
                            <button
                              onClick={() => setShowAddProcedure(!showAddProcedure)}
                              className="min-h-ds-touch px-4 py-2 text-sm font-medium text-white dark:text-ds-canvas bg-ds-success rounded-lg hover:bg-ds-success/90 transition-colors flex items-center gap-2"
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
                          <div className="bg-ds-success-soft border-2 border-ds-success/30 rounded-ds-card p-4">
                            <h4 className="font-bold text-ds-success-text mb-3">Select Procedure</h4>
                            <div className="space-y-3">
                              <div>
                                <AppSelect
                                  value={selectedProcedureId || ''}
                                  onChange={(val) => setSelectedProcedureId(val ? parseInt(val) : null)}
                                  options={availableProcedures.map((proc) => ({
                                    value: proc.id,
                                    label: `${proc.service_name} — GHS ${Number(proc.price).toFixed(2)}`,
                                  }))}
                                  placeholder="-- Select a procedure --"
                                  label="Procedure"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-ds-text-secondary mb-1">Notes (optional)</label>
                                <textarea
                                  value={procedureNotes}
                                  onChange={(e) => setProcedureNotes(e.target.value)}
                                  placeholder="e.g., Left forearm, wound from fall..."
                                  className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-success focus:border-ds-success"
                                  rows={2}
                                />
                              </div>
                              {selectedProcedureId && (
                                <div className="bg-ds-surface rounded-lg p-3 border border-ds-success/30">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-ds-text">
                                      {availableProcedures.find(p => p.id === selectedProcedureId)?.service_name}
                                    </span>
                                    <span className="font-bold text-ds-success-text">
                                      GHS {Number(availableProcedures.find(p => p.id === selectedProcedureId)?.price || 0).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={handleOrderProcedure}
                                  disabled={!selectedProcedureId || orderingProcedure}
                                  className="min-h-ds-touch px-4 py-2 text-sm font-medium text-white dark:text-ds-canvas bg-ds-success rounded-lg hover:bg-ds-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {orderingProcedure ? 'Adding...' : 'Add & Start'}
                                </button>
                                <button
                                  onClick={() => {
                                    setShowAddProcedure(false);
                                    setSelectedProcedureId(null);
                                    setProcedureNotes('');
                                  }}
                                  className="min-h-ds-touch px-4 py-2 text-sm font-medium text-ds-text-secondary bg-ds-subtle rounded-lg hover:bg-ds-border transition-colors"
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
                                    procedure.status === 'in_progress' ? 'border-ds-accent/30 bg-ds-accent-soft' : 'border-ds-border bg-ds-subtle'
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h3 className="font-semibold text-ds-text">{procedure.procedure_name}</h3>
                                      {procedure.notes && (
                                        <p className="text-sm text-ds-text-secondary mt-1">{procedure.notes}</p>
                                      )}
                                      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-ds-text-secondary">
                                        <span>Ordered by: {procedure.ordered_by_name}</span>
                                        {procedure.performed_by_name && (
                                          <span>Performed by: {procedure.performed_by_name}</span>
                                        )}
                                        <span>GHS {Number(procedure.price || 0).toFixed(2)}</span>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                          procedure.status === 'pending' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                          procedure.status === 'in_progress' ? 'bg-ds-accent-soft text-ds-accent-text' :
                                          'bg-ds-success-soft text-ds-success-text'
                                        }`}>
                                          {procedure.status === 'in_progress' ? 'IN PROGRESS' : procedure.status.toUpperCase()}
                                        </span>
                                      </div>
                                      <p className="text-xs text-ds-text-muted mt-1">
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
                                          className="min-h-ds-touch px-3 py-1 text-sm font-medium text-ds-text-secondary bg-ds-subtle border border-ds-border rounded-lg hover:bg-ds-subtle"
                                        >
                                          Edit
                                        </button>
                                      )}
                                      {procedure.status === 'pending' && (
                                        <>
                                          <button
                                            onClick={() => handleStartProcedure(procedure.id)}
                                            className="min-h-ds-touch px-3 py-1 text-sm font-medium text-ds-on-accent bg-ds-accent rounded-lg hover:bg-ds-accent-hover"
                                          >
                                            Start
                                          </button>
                                          <button
                                            onClick={() => handleCancelProcedure(procedure.id)}
                                            className="min-h-ds-touch px-3 py-1 text-sm font-medium text-ds-critical-text bg-ds-critical-soft border border-ds-critical-border rounded-lg hover:bg-ds-critical-soft"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      )}
                                      {procedure.status === 'in_progress' && (
                                        <>
                                          <button
                                            onClick={() => handleCompleteProcedure(procedure.id)}
                                            className="min-h-ds-touch px-3 py-1 text-sm font-medium text-white dark:text-ds-canvas bg-ds-success rounded-lg hover:bg-ds-success/90"
                                          >
                                            Complete & Bill
                                          </button>
                                          <button
                                            onClick={() => handleCancelProcedure(procedure.id)}
                                            className="min-h-ds-touch px-3 py-1 text-sm font-medium text-ds-critical-text bg-ds-critical-soft border border-ds-critical-border rounded-lg hover:bg-ds-critical-soft"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {/* Inline Edit Form */}
                                  {editingProcedureId === procedure.id && (
                                    <div className="mt-3 p-3 bg-ds-subtle rounded-lg border border-ds-border space-y-3">
                                      <div>
                                        <AppSelect
                                          value={editProcedureChargeId ?? ''}
                                          onChange={(val) => setEditProcedureChargeId(val ? Number(val) : null)}
                                          options={availableProcedures.map(ap => ({
                                            value: ap.id,
                                            label: `${ap.service_name} — GHS ${Number(ap.price || 0).toFixed(2)}`,
                                          }))}
                                          placeholder={`— Keep current (${procedure.procedure_name}) —`}
                                          label="Procedure type"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-ds-text-secondary mb-1">Notes</label>
                                        <textarea
                                          rows={2}
                                          value={editProcedureNotes}
                                          onChange={(e) => setEditProcedureNotes(e.target.value)}
                                          className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm focus:ring-2 focus:ring-ds-focus-ring"
                                          placeholder="Update procedure notes..."
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <button
                                          onClick={() => setEditingProcedureId(null)}
                                          className="min-h-ds-touch px-3 py-1 text-xs text-ds-text-secondary border border-ds-border-control rounded-lg hover:bg-ds-subtle"
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
                                          className="min-h-ds-touch px-3 py-1 text-xs text-ds-on-accent bg-ds-accent rounded-lg hover:bg-ds-accent-hover"
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
                              <svg className="w-12 h-12 mx-auto text-ds-text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <p className="text-ds-text-muted mb-3">No active procedures for this patient</p>
                              <button
                                onClick={() => setShowAddProcedure(true)}
                                className="min-h-ds-touch px-4 py-2 text-sm font-medium text-ds-success-text bg-ds-success-soft border border-ds-success/30 rounded-lg hover:bg-ds-success-soft transition-colors"
                              >
                                Add a Procedure
                              </button>
                            </div>
                          )
                        )}

                        {/* Procedure History */}
                        {showProcedureHistory && (
                          <div className="border-t border-ds-border pt-4 mt-4">
                            <h4 className="font-semibold text-ds-text-secondary mb-3">Procedure History</h4>
                            {procedureHistory.filter(p => p.status === 'completed' || p.status === 'cancelled').length > 0 ? (
                              <div className="space-y-2">
                                {procedureHistory
                                  .filter(p => p.status === 'completed' || p.status === 'cancelled')
                                  .map((procedure) => (
                                    <div
                                      key={procedure.id}
                                      className={`border rounded-lg p-3 ${
                                        procedure.status === 'completed' ? 'border-ds-success/30 bg-ds-success-soft' : 'border-ds-border bg-ds-subtle opacity-60'
                                      }`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <div>
                                          <span className="font-medium text-ds-text">{procedure.procedure_name}</span>
                                          {procedure.notes && (
                                            <p className="text-xs text-ds-text-muted mt-0.5">{procedure.notes}</p>
                                          )}
                                          <div className="flex items-center gap-3 mt-1 text-xs text-ds-text-muted">
                                            {procedure.performed_by_name && <span>By: {procedure.performed_by_name}</span>}
                                            <span>GHS {Number(procedure.price || 0).toFixed(2)}</span>
                                            {procedure.completed_at && (
                                              <span>{safeFormatDate(procedure.completed_at, 'MMM d, yyyy h:mm a')}</span>
                                            )}
                                          </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                          procedure.status === 'completed' ? 'bg-ds-success-soft text-ds-success-text' : 'bg-ds-border text-ds-text-secondary'
                                        }`}>
                                          {procedure.status.toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-sm text-ds-text-muted text-center py-4">No procedure history</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Clinical Notes Tab */}
                    {activeTab === 'notes' && (
                      <div className="space-y-6">
                        {/* Message to Doctor Form */}
                        <form onSubmit={handleSendDoctorMessage} className="bg-gradient-to-r from-ds-subtle to-ds-subtle p-4 rounded-ds-card border-2 border-ds-border">
                          <h4 className="font-bold text-ds-brand-plum mb-3 flex items-center gap-2">
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
                          <button type="submit" className="min-h-ds-touch mt-3 px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-brand-plum/90 transition-colors font-semibold flex items-center gap-2">
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
                            <h3 className="text-lg font-bold text-ds-text mb-4 flex items-center gap-2">
                              <svg className="w-5 h-5 text-ds-accent-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Clinical Notes
                            </h3>
                            <div className="space-y-3">
                              {clinicalNotes.map((note: ClinicalNote, index: number) => (
                                <div
                                  key={note.id || index}
                                  className="bg-ds-surface border border-ds-border rounded-lg p-4 shadow-ds-card hover:shadow-ds-overlay transition-shadow"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-ds-accent-soft text-ds-accent-text">
                                        {note.note_type || 'Nurse Note'}
                                      </span>
                                      {note.created_by && (
                                        <span className="text-sm text-ds-text-secondary">
                                          by {note.created_by}
                                        </span>
                                      )}
                                    </div>
                                    {note.created_at && (
                                      <span className="text-xs text-ds-text-muted">
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
                                  <p className="text-ds-text whitespace-pre-wrap">{note.content}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {clinicalNotes.length === 0 && (
                          <div className="text-center py-8 text-ds-text-muted">
                            <svg className="mx-auto h-12 w-12 text-ds-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                        <div className="bg-ds-accent-soft border border-ds-accent/30 rounded-lg p-6">
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
                                  workflowStatus === 'at_lab' ? 'bg-ds-accent-soft border-ds-accent/30' :
                                  workflowStatus === 'at_imaging' ? 'bg-ds-info-soft border-ds-info/30' :
                                  'bg-ds-success-soft border-ds-success/50'
                                }`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full animate-pulse ${
                                      workflowStatus === 'at_lab' ? 'bg-ds-accent' :
                                      workflowStatus === 'at_imaging' ? 'bg-ds-info' :
                                      'bg-ds-success'
                                    }`}></div>
                                    <span className="font-bold text-ds-text">
                                      Patient is currently at {currentDept}
                                    </span>
                                  </div>
                                  <p className="text-sm text-ds-text-secondary mt-2">
                                    Patient must complete {currentDept} and return before being routed to another department.
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <p className="text-sm text-ds-text-secondary mb-4">
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
                                        ? 'bg-ds-accent text-ds-on-accent cursor-default'
                                        : isAtDepartment
                                        ? 'bg-ds-border-control text-ds-text-muted cursor-not-allowed'
                                        : 'bg-ds-accent text-ds-on-accent hover:bg-ds-accent-hover'
                                    }`}
                                  >
                                    {atLab ? '🔬 At Lab' : 'Send to Lab'}
                                  </button>
                                  <button
                                    onClick={() => handleRouteToDepartment('pharmacy')}
                                    disabled={atPharmacy || (isAtDepartment && !atPharmacy)}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${
                                      atPharmacy
                                        ? 'bg-ds-success text-white dark:text-ds-canvas cursor-default'
                                        : isAtDepartment
                                        ? 'bg-ds-border-control text-ds-text-muted cursor-not-allowed'
                                        : 'bg-ds-accent text-ds-on-accent hover:bg-ds-accent-hover'
                                    }`}
                                  >
                                    {atPharmacy ? '💊 At Pharmacy' : 'Send to Pharmacy'}
                                  </button>
                                  <button
                                    onClick={() => handleRouteToDepartment('imaging')}
                                    disabled={atImaging || (isAtDepartment && !atImaging)}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${
                                      atImaging
                                        ? 'bg-ds-info text-white dark:text-ds-canvas cursor-default'
                                        : isAtDepartment
                                        ? 'bg-ds-border-control text-ds-text-muted cursor-not-allowed'
                                        : 'bg-ds-accent text-ds-on-accent hover:bg-ds-accent-hover'
                                    }`}
                                  >
                                    {atImaging ? '📷 At Imaging' : 'Send to Imaging'}
                                  </button>
                                  <button
                                    onClick={() => handleRouteToDepartment('receptionist')}
                                    disabled={isAtDepartment}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${
                                      isAtDepartment
                                        ? 'bg-ds-border-control text-ds-text-muted cursor-not-allowed'
                                        : 'bg-ds-accent text-ds-on-accent hover:bg-ds-accent-hover'
                                    }`}
                                  >
                                    Send to Receptionist
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                          <div className="mt-4 pt-4 border-t border-ds-accent/30 grid grid-cols-2 gap-3">
                            <button
                              onClick={handleReleaseRoom}
                              className="bg-ds-warning text-white dark:text-ds-canvas py-3 rounded-lg font-semibold hover:bg-ds-warning/90 transition-colors"
                            >
                              Release Room
                              <span className="block text-xs mt-1 font-normal">Free up the room</span>
                            </button>
                            <button
                              onClick={handleCompleteEncounter}
                              className="bg-ds-critical text-white py-3 rounded-lg font-semibold hover:bg-ds-critical/90 transition-colors"
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
                        <h3 className="text-lg font-bold text-ds-text mb-4">Encounter Billing Summary</h3>
                        {encounterInvoice ? (
                          <div className="space-y-4">
                            {/* Invoice Header */}
                            <div className="bg-ds-subtle rounded-lg p-4 border border-ds-border">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <div className="text-xs text-ds-text-muted">Invoice #</div>
                                  <div className="font-semibold text-ds-text">{encounterInvoice.invoice_number || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-ds-text-muted">Status</div>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                    encounterInvoice.status === 'paid' ? 'bg-ds-success-soft text-ds-success-text' :
                                    encounterInvoice.status === 'pending' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                    'bg-ds-subtle text-ds-text-secondary'
                                  }`}>
                                    {(encounterInvoice.status || 'N/A').toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <div className="text-xs text-ds-text-muted">Total</div>
                                  <div className="font-bold text-lg text-ds-text">GHS {Number(encounterInvoice.total_amount || encounterInvoice.total || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-ds-text-muted">Paid</div>
                                  <div className="font-bold text-lg text-ds-success-text">GHS {Number(encounterInvoice.amount_paid || 0).toFixed(2)}</div>
                                </div>
                              </div>
                            </div>

                            {/* Invoice Items */}
                            {encounterInvoice.items && encounterInvoice.items.length > 0 ? (
                              <div className="border border-ds-border rounded-lg overflow-hidden">
                                <table className="w-full">
                                  <thead className="bg-ds-subtle">
                                    <tr>
                                      <th className="text-left text-xs font-medium text-ds-text-muted px-4 py-2">Description</th>
                                      <th className="text-center text-xs font-medium text-ds-text-muted px-4 py-2">Qty</th>
                                      <th className="text-right text-xs font-medium text-ds-text-muted px-4 py-2">Unit Price</th>
                                      <th className="text-right text-xs font-medium text-ds-text-muted px-4 py-2">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-ds-border">
                                    {encounterInvoice.items.map((item: any, idx: number) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 text-sm text-ds-text">{item.description}</td>
                                        <td className="px-4 py-2 text-sm text-ds-text-secondary text-center">{item.quantity}</td>
                                        <td className="px-4 py-2 text-sm text-ds-text-secondary text-right">GHS {Number(item.unit_price || 0).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-sm font-medium text-ds-text text-right">GHS {Number(item.total_price || item.total || 0).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-ds-border bg-ds-subtle">
                                      <td colSpan={3} className="px-4 py-3 text-right font-bold text-ds-text-secondary">Total</td>
                                      <td className="px-4 py-3 text-right font-bold text-ds-text">GHS {Number(encounterInvoice.total_amount || encounterInvoice.total || 0).toFixed(2)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-ds-text-muted">No charges recorded yet for this encounter.</p>
                            )}

                            {/* Balance */}
                            {(Number(encounterInvoice.total_amount || encounterInvoice.total || 0) - Number(encounterInvoice.amount_paid || 0)) > 0 && (
                              <div className="bg-ds-warning-soft border border-ds-warning-border rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  <svg className="w-5 h-5 text-ds-warning-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  <span className="text-sm font-semibold text-ds-warning-text">
                                    Outstanding Balance: GHS {(Number(encounterInvoice.total_amount || encounterInvoice.total || 0) - Number(encounterInvoice.amount_paid || 0)).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-ds-text-muted">
                            <svg className="w-12 h-12 mx-auto text-ds-text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-12 mt-4">
            <div className="text-center text-ds-text-muted">
              <svg className="w-20 h-20 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-xl font-semibold text-ds-text-muted mb-1">Select a patient to begin</p>
              <p className="text-sm text-ds-text-muted">Choose from the patient tabs above</p>
            </div>
          </div>
        )}
        </>
        )}

        {/* Inventory View */}
        {mainView === 'inventory' && (
          <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-ds-accent to-ds-brand-plum px-6 py-4 dark:from-ds-accent-soft dark:to-ds-subtle">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <div>
                    <h2 className="text-xl font-bold text-white">Nurse Station Inventory</h2>
                    <p className="text-ds-on-accent text-sm">Manage supplies and equipment</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-ds-on-accent text-sm">
                    Total Value: <span className="font-bold text-white">GHS {nurseInventory.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0).toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingInventoryItem(null);
                      setInventoryForm({ name: '', category: 'Supplies', quantity: 0, unit: 'pcs', min_quantity: 0, location: '' });
                      setShowInventoryModal(true);
                    }}
                    className="min-h-ds-touch flex items-center gap-2 px-4 py-2 bg-ds-surface text-ds-accent-text rounded-lg font-semibold text-sm hover:bg-ds-accent-soft transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Item
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-ds-subtle border-b">
              <div className="bg-ds-surface rounded-lg p-4 border border-ds-border">
                <div className="text-sm text-ds-text-muted">Total Items</div>
                <div className="text-2xl font-bold text-ds-text">{nurseInventory.length}</div>
              </div>
              <div className="bg-ds-surface rounded-lg p-4 border border-ds-border">
                <div className="text-sm text-ds-text-muted">Low Stock Items</div>
                <div className="text-2xl font-bold text-ds-critical-text">{nurseInventory.filter(i => i.quantity <= i.min_quantity).length}</div>
              </div>
              <div className="bg-ds-surface rounded-lg p-4 border border-ds-border">
                <div className="text-sm text-ds-text-muted">Categories</div>
                <div className="text-2xl font-bold text-ds-text">{new Set(nurseInventory.map(i => i.category)).size}</div>
              </div>
              <div className="bg-ds-surface rounded-lg p-4 border border-ds-border">
                <div className="text-sm text-ds-text-muted">Locations</div>
                <div className="text-2xl font-bold text-ds-text">{new Set(nurseInventory.map(i => i.location)).size}</div>
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
                  className="w-full px-4 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
                />
              </div>
              <AppSelect
                value={inventoryCategoryFilter}
                onChange={(val) => setInventoryCategoryFilter(val)}
                options={[
                  { value: 'all', label: 'All Categories' },
                  { value: 'Supplies', label: 'Supplies' },
                  { value: 'Equipment', label: 'Equipment' },
                  { value: 'PPE', label: 'PPE' },
                  { value: 'Medications', label: 'Medications' },
                ]}
              />
              <AppSelect
                value={inventorySortBy}
                onChange={(val) => setInventorySortBy(val as any)}
                options={[
                  { value: 'name', label: 'Sort by Name' },
                  { value: 'category', label: 'Sort by Category' },
                  { value: 'quantity', label: 'Sort by Quantity' },
                  { value: 'status', label: 'Sort by Status' },
                ]}
              />
              <button
                onClick={() => setInventoryShowLowOnly(!inventoryShowLowOnly)}
                className={`min-h-ds-touch px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  inventoryShowLowOnly
                    ? 'bg-ds-critical-soft text-ds-critical-text border-2 border-ds-critical-border'
                    : 'border border-ds-border-control text-ds-text-secondary hover:bg-ds-subtle'
                }`}
              >
                Low Stock Only ({nurseInventory.filter(i => i.quantity <= i.min_quantity).length})
              </button>
            </div>

            {/* Inventory Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ds-subtle border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Quantity</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Min Stock</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Total Value</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-ds-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ds-border">
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
                    <tr key={item.id} className={`hover:bg-ds-subtle ${item.quantity <= item.min_quantity ? 'bg-ds-critical-soft' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ds-text">{item.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          item.category === 'PPE' ? 'bg-ds-info-soft text-ds-info-text' :
                          item.category === 'Equipment' ? 'bg-ds-subtle text-ds-brand-plum' :
                          item.category === 'Medications' ? 'bg-ds-success-soft text-ds-success-text' :
                          'bg-ds-subtle text-ds-text'
                        }`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ds-text-secondary text-sm">{item.location}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${item.quantity <= item.min_quantity ? 'text-ds-critical-text' : 'text-ds-text'}`}>
                          {item.quantity} {item.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-ds-text-muted">{item.min_quantity} {item.unit}</td>
                      <td className="px-4 py-3 text-right text-sm text-ds-text-secondary">GHS {Number(item.unit_cost || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-ds-text-secondary">GHS {(Number(item.quantity || 0) * Number(item.unit_cost || 0)).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.quantity <= item.min_quantity ? (
                          <span className="px-2 py-1 bg-ds-critical-soft text-ds-critical-text rounded-full text-xs font-bold">LOW STOCK</span>
                        ) : item.quantity <= item.min_quantity * 1.5 ? (
                          <span className="px-2 py-1 bg-ds-warning-soft text-ds-warning-text rounded-full text-xs font-bold">WARNING</span>
                        ) : (
                          <span className="px-2 py-1 bg-ds-success-soft text-ds-success-text rounded-full text-xs font-bold">OK</span>
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
                            className="text-ds-success-text hover:text-ds-success-text font-medium text-sm"
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
                            className="text-ds-accent-text hover:text-ds-accent-text font-medium text-sm"
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
              <div className="p-12 text-center text-ds-text-muted">
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
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-ds-text">Create Lab Order</h2>
                <button
                  onClick={() => setShowLabOrderModal(false)}
                  className="text-ds-text-muted hover:text-ds-text-secondary"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Select Doctor */}
                <div>
                  <AppSelect
                    value={labOrderForm.ordering_provider_id || ''}
                    onChange={(val) => setLabOrderForm({ ...labOrderForm, ordering_provider_id: Number(val) || null })}
                    options={doctors.map((doctor) => ({
                      value: doctor.id,
                      label: `Dr. ${doctor.first_name} ${doctor.last_name}`,
                    }))}
                    placeholder="Select a doctor..."
                    label="Ordering Doctor"
                    required
                  />
                </div>

                {/* Read-only test sets — nurse can apply, only doctors create */}
                <div className="border-t border-ds-border pt-3">
                  <LabTestSetChips pendingLabOrders={[]} onApplySet={handleApplySetForNurse} />
                </div>

                {/* Test Name */}
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Test Name <span className="text-ds-critical-text">*</span>
                  </label>
                  <input
                    type="text"
                    value={labOrderForm.test_name}
                    onChange={(e) => setLabOrderForm({ ...labOrderForm, test_name: e.target.value })}
                    placeholder="e.g., Complete Blood Count (CBC)"
                    className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
                  />
                </div>

                {/* Test Code */}
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Test Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={labOrderForm.test_code}
                    onChange={(e) => setLabOrderForm({ ...labOrderForm, test_code: e.target.value })}
                    placeholder="e.g., CBC-001"
                    className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Priority
                  </label>
                  <div className="flex gap-3">
                    {(['routine', 'urgent', 'stat'] as const).map((priority) => (
                      <label
                        key={priority}
                        className={`flex-1 text-center px-3 py-2 rounded-lg cursor-pointer border-2 transition-colors ${
                          labOrderForm.priority === priority
                            ? priority === 'stat'
                              ? 'bg-ds-critical-soft border-ds-critical text-ds-critical-text'
                              : priority === 'urgent'
                              ? 'bg-ds-warning-soft border-ds-warning text-ds-warning-text'
                              : 'bg-ds-success-soft border-ds-success text-ds-success-text'
                            : 'bg-ds-subtle border-ds-border text-ds-text-secondary hover:bg-ds-subtle'
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
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={labOrderForm.notes}
                    onChange={(e) => setLabOrderForm({ ...labOrderForm, notes: e.target.value })}
                    placeholder="Additional instructions or clinical notes..."
                    rows={3}
                    className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowLabOrderModal(false)}
                  className="min-h-ds-touch flex-1 px-4 py-2 border border-ds-border-control rounded-lg text-ds-text-secondary hover:bg-ds-subtle"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateLabOrder}
                  disabled={creatingLabOrder}
                  className="min-h-ds-touch flex-1 px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover disabled:bg-ds-accent/50 disabled:cursor-not-allowed"
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
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-ds-text">Create Imaging Order</h2>
                <button
                  onClick={() => setShowImagingOrderModal(false)}
                  className="text-ds-text-muted hover:text-ds-text-secondary"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Select Doctor */}
                <div>
                  <AppSelect
                    value={imagingOrderForm.ordering_provider_id || ''}
                    onChange={(val) => setImagingOrderForm({ ...imagingOrderForm, ordering_provider_id: Number(val) || null })}
                    options={doctors.map((doctor) => ({
                      value: doctor.id,
                      label: `Dr. ${doctor.first_name} ${doctor.last_name}`,
                    }))}
                    placeholder="Select a doctor..."
                    label="Ordering Doctor"
                    required
                  />
                </div>

                {/* Study Type */}
                <div>
                  <AppSelect
                    value={imagingOrderForm.study_type}
                    onChange={(val) => setImagingOrderForm({ ...imagingOrderForm, study_type: val })}
                    options={[
                      { value: 'X-Ray', label: 'X-Ray' },
                      { value: 'CT Scan', label: 'CT Scan' },
                      { value: 'MRI', label: 'MRI' },
                      { value: 'Ultrasound', label: 'Ultrasound' },
                      { value: 'Mammogram', label: 'Mammogram' },
                      { value: 'Fluoroscopy', label: 'Fluoroscopy' },
                      { value: 'PET Scan', label: 'PET Scan' },
                      { value: 'Nuclear Medicine', label: 'Nuclear Medicine' },
                    ]}
                    placeholder="Select study type..."
                    label="Study Type"
                    required
                  />
                </div>

                {/* Body Part */}
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Body Part / Region
                  </label>
                  <input
                    type="text"
                    value={imagingOrderForm.body_part}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, body_part: e.target.value })}
                    placeholder="e.g., Chest, Abdomen, Left Knee"
                    className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-brand-plum"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Priority
                  </label>
                  <div className="flex gap-3">
                    {(['routine', 'urgent', 'stat'] as const).map((priority) => (
                      <label
                        key={priority}
                        className={`flex-1 text-center px-3 py-2 rounded-lg cursor-pointer border-2 transition-colors ${
                          imagingOrderForm.priority === priority
                            ? priority === 'stat'
                              ? 'bg-ds-critical-soft border-ds-critical text-ds-critical-text'
                              : priority === 'urgent'
                              ? 'bg-ds-warning-soft border-ds-warning text-ds-warning-text'
                              : 'bg-ds-success-soft border-ds-success text-ds-success-text'
                            : 'bg-ds-subtle border-ds-border text-ds-text-secondary hover:bg-ds-subtle'
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
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Clinical Indication
                  </label>
                  <input
                    type="text"
                    value={imagingOrderForm.clinical_indication}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, clinical_indication: e.target.value })}
                    placeholder="e.g., Rule out fracture, Chest pain"
                    className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-brand-plum"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={imagingOrderForm.notes}
                    onChange={(e) => setImagingOrderForm({ ...imagingOrderForm, notes: e.target.value })}
                    placeholder="Additional instructions or clinical notes..."
                    rows={3}
                    className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-brand-plum resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowImagingOrderModal(false)}
                  className="min-h-ds-touch flex-1 px-4 py-2 border border-ds-border-control rounded-lg text-ds-text-secondary hover:bg-ds-subtle"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateImagingOrder}
                  disabled={creatingImagingOrder}
                  className="min-h-ds-touch flex-1 px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-brand-plum/90 disabled:bg-ds-brand-plum/50 disabled:cursor-not-allowed"
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
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-ds-text">
                  {editingInventoryItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
                </h2>
                <button
                  onClick={() => setShowInventoryModal(false)}
                  className="text-ds-text-muted hover:text-ds-text-secondary"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={inventoryForm.name}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                    placeholder="e.g., Syringes (10ml)"
                    className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <AppSelect
                      value={inventoryForm.category}
                      onChange={(val) => setInventoryForm({ ...inventoryForm, category: val })}
                      options={[
                        { value: 'Supplies', label: 'Supplies' },
                        { value: 'Equipment', label: 'Equipment' },
                        { value: 'PPE', label: 'PPE' },
                        { value: 'Medications', label: 'Medications' },
                      ]}
                      label="Category"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ds-text-secondary mb-1">Location</label>
                    <input
                      type="text"
                      value={inventoryForm.location}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, location: e.target.value })}
                      placeholder="e.g., Cabinet A"
                      className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ds-text-secondary mb-1">Quantity *</label>
                    <input
                      type="number"
                      value={inventoryForm.quantity}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, quantity: Number(e.target.value) })}
                      min="0"
                      className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
                    />
                  </div>
                  <div>
                    <AppSelect
                      value={inventoryForm.unit}
                      onChange={(val) => setInventoryForm({ ...inventoryForm, unit: val })}
                      options={[
                        { value: 'pcs', label: 'pcs' },
                        { value: 'boxes', label: 'boxes' },
                        { value: 'rolls', label: 'rolls' },
                        { value: 'packs', label: 'packs' },
                        { value: 'bottles', label: 'bottles' },
                      ]}
                      label="Unit"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ds-text-secondary mb-1">Min Qty</label>
                    <input
                      type="number"
                      value={inventoryForm.min_quantity}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, min_quantity: Number(e.target.value) })}
                      min="0"
                      className="w-full border border-ds-border-control rounded-lg px-3 py-2 focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent"
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
                    className="min-h-ds-touch px-4 py-2 border border-ds-critical-border text-ds-critical-text rounded-lg hover:bg-ds-critical-soft"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setShowInventoryModal(false)}
                  className="min-h-ds-touch flex-1 px-4 py-2 border border-ds-border-control rounded-lg text-ds-text-secondary hover:bg-ds-subtle"
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
                  className="min-h-ds-touch flex-1 px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50 flex items-center justify-center gap-2"
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
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-ds-border bg-ds-success-soft rounded-t-xl">
              <h3 className="text-lg font-bold text-ds-success-text">Add Stock</h3>
              <p className="text-sm text-ds-success-text">{addStockItem.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-ds-subtle rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ds-text-muted">Current Stock:</span>
                  <span className="font-semibold">{addStockItem.quantity} {addStockItem.unit}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ds-text-secondary mb-1">Quantity to Add</label>
                <input
                  type="number"
                  min="1"
                  value={addStockQuantity || ''}
                  onChange={(e) => setAddStockQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-success"
                  placeholder="Enter quantity..."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ds-text-secondary mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={addStockNotes}
                  onChange={(e) => setAddStockNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-success"
                  placeholder="e.g., Received from pharmacy"
                />
              </div>
              {addStockQuantity > 0 && (
                <div className="bg-ds-success-soft rounded-lg p-3 text-sm text-ds-success-text">
                  New total: <span className="font-bold">{addStockItem.quantity + addStockQuantity} {addStockItem.unit}</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-ds-border flex gap-3">
              <button
                onClick={() => setShowAddStockModal(false)}
                className="min-h-ds-touch flex-1 px-4 py-2 border border-ds-border-control text-ds-text-secondary rounded-lg hover:bg-ds-subtle"
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
                className="min-h-ds-touch flex-1 px-4 py-2 bg-ds-success text-white dark:text-ds-canvas rounded-lg hover:bg-ds-success/90 disabled:opacity-50 font-medium"
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
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-ds-border bg-ds-subtle rounded-t-ds-card">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-ds-text">Doctor's note</h2>
                  <p className="text-sm text-ds-text-muted mt-1">
                    {openNotification.patient_name} · From Dr. {openNotification.doctor_name}
                  </p>
                </div>
                <button
                  onClick={closeNotificationModal}
                  className="text-ds-text-muted hover:text-ds-text text-2xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Full alert message */}
              <div>
                <p className="text-xs font-semibold text-ds-text-muted uppercase tracking-wider mb-1">Message</p>
                <p className="text-sm text-ds-text whitespace-pre-wrap">{openNotification.message}</p>
              </div>

              {loadingDetails ? (
                <div className="text-sm text-ds-text-muted italic">Loading details...</div>
              ) : (
                <>
                  {/* Encounter notes from the doctor */}
                  {notificationDetails?.encounter && (
                    <div className="bg-ds-subtle rounded-lg p-4 border border-ds-border space-y-2">
                      <p className="text-xs font-semibold text-ds-text-muted uppercase tracking-wider">
                        Encounter context
                      </p>
                      {notificationDetails.encounter.chief_complaint && (
                        <div>
                          <span className="text-xs font-medium text-ds-text-secondary">Chief complaint: </span>
                          <span className="text-sm text-ds-text">{notificationDetails.encounter.chief_complaint}</span>
                        </div>
                      )}
                      {notificationDetails.encounter.assessment && (
                        <div>
                          <span className="text-xs font-medium text-ds-text-secondary">Assessment: </span>
                          <span className="text-sm text-ds-text whitespace-pre-wrap">{notificationDetails.encounter.assessment}</span>
                        </div>
                      )}
                      {notificationDetails.encounter.plan && (
                        <div>
                          <span className="text-xs font-medium text-ds-text-secondary">Plan: </span>
                          <span className="text-sm text-ds-text whitespace-pre-wrap">{notificationDetails.encounter.plan}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Follow-up appointment */}
                  {notificationDetails?.follow_up_appointment ? (
                    <div className="bg-ds-info-soft rounded-lg p-4 border border-ds-info/30">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-semibold text-ds-info-text uppercase tracking-wider">
                          Follow-up visit
                        </p>
                        <span className="text-xs text-ds-info-text">on the calendar</span>
                      </div>
                      {notificationDetails.encounter?.follow_up_reason && (
                        <p className="text-sm text-ds-text mb-2">
                          <span className="font-medium">Reason:</span> {notificationDetails.encounter.follow_up_reason}
                        </p>
                      )}
                      <div className="flex items-end gap-2 mt-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-ds-text-secondary mb-1">Scheduled date</label>
                          <input
                            type="date"
                            value={editingFollowUpDate}
                            onChange={(e) => setEditingFollowUpDate(e.target.value)}
                            className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm"
                          />
                        </div>
                        <button
                          onClick={rescheduleFollowUpAppointment}
                          disabled={savingReschedule || !editingFollowUpDate ||
                            editingFollowUpDate === new Date(notificationDetails.follow_up_appointment.appointment_date).toISOString().slice(0, 10)}
                          className="min-h-ds-touch px-4 py-2 bg-ds-info text-white dark:text-ds-canvas rounded-lg hover:bg-ds-info/90 disabled:opacity-50 text-sm"
                        >
                          {savingReschedule ? 'Saving...' : 'Reschedule'}
                        </button>
                      </div>
                    </div>
                  ) : notificationDetails?.encounter?.follow_up_required ? (
                    <div className="bg-ds-info-soft rounded-lg p-4 border border-ds-info/30 text-sm text-ds-text-secondary">
                      Follow-up visit was requested ({notificationDetails.encounter.follow_up_timeframe || 'no timeframe'}), but no appointment was auto-created.
                    </div>
                  ) : null}

                  {/* Review call task */}
                  {notificationDetails?.review_task ? (
                    <div className="bg-ds-warning-soft rounded-lg p-4 border border-ds-warning-border">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-semibold text-ds-warning-text uppercase tracking-wider">
                          Review call
                        </p>
                        <span className="text-xs text-ds-warning-text">in your Calls queue</span>
                      </div>
                      {notificationDetails.review_task.review_reason && (
                        <p className="text-sm text-ds-text mb-2">
                          <span className="font-medium">Reason:</span> {notificationDetails.review_task.review_reason}
                        </p>
                      )}
                      <div className="flex items-end gap-2 mt-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-ds-text-secondary mb-1">Scheduled date</label>
                          <input
                            type="date"
                            value={editingReviewDate}
                            onChange={(e) => setEditingReviewDate(e.target.value)}
                            className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm"
                          />
                        </div>
                        <button
                          onClick={rescheduleReviewTask}
                          disabled={savingReschedule || !editingReviewDate ||
                            editingReviewDate === new Date(notificationDetails.review_task.scheduled_date).toISOString().slice(0, 10)}
                          className="min-h-ds-touch px-4 py-2 bg-ds-warning text-white dark:text-ds-canvas rounded-lg hover:bg-ds-warning/90 disabled:opacity-50 text-sm"
                        >
                          {savingReschedule ? 'Saving...' : 'Reschedule'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!notificationDetails?.follow_up_appointment &&
                   !notificationDetails?.review_task &&
                   !notificationDetails?.encounter?.follow_up_required && (
                    <div className="text-sm text-ds-text-muted italic">
                      No follow-up or review tasks scheduled for this encounter.
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-ds-border bg-ds-subtle rounded-b-ds-card flex justify-end gap-2">
              <button
                onClick={closeNotificationModal}
                className="min-h-ds-touch px-4 py-2 text-ds-text-secondary bg-ds-surface border border-ds-border-control rounded-lg hover:bg-ds-subtle"
              >
                Close
              </button>
              <button
                onClick={openPatientFromNotification}
                className="min-h-ds-touch px-4 py-2 bg-ds-text text-ds-canvas rounded-lg hover:bg-ds-text"
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
