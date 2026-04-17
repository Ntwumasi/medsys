import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import HPAccordion from '../components/HPAccordion';
import DepartmentGuide from '../components/DepartmentGuide';
import { doctorGuideSections } from '../components/guides/doctorGuideContent';
import { useNotification } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import { SmartTextArea } from '../components/SmartTextArea';
import { AutocompleteInput } from '../components/AutocompleteInput';
import PatientQuickView from '../components/PatientQuickView';
import VitalSignsHistory from '../components/VitalSignsHistory';
import type { VitalSigns } from '../types';

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
  vital_signs?: VitalSigns;
  status?: string;
  vip_status?: 'silver' | 'gold' | 'platinum' | null;
  soap_signed?: boolean;
  soap_signed_at?: string;
  soap_signed_by?: number;
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

interface LabOrder {
  id: number;
  test_name: string;
  priority: string;
  status: string;
  results?: string;
  ordered_at: string;
  completed_at?: string;
}

interface ImagingOrder {
  id: number;
  imaging_type: string;
  body_part?: string;
  priority: string;
  status: string;
  // The backend aliases io.findings → results and io.completed_date →
  // completed_at / io.ordered_date → ordered_at so this shape matches
  // LabOrder. `findings` is kept for any consumer that reads the native
  // column name directly.
  results?: string;
  findings?: string;
  ordered_at: string;
  ordered_date?: string;
  completed_at?: string;
  completed_date?: string;
}

interface PharmacyOrder {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  quantity: number;
  refills: number;
  priority: string;
  status: string;
  ordered_date: string;
  dispensed_date?: string;
  dispensed_by_name?: string;
}

interface DoctorAlert {
  id: number;
  patient_name: string;
  patient_number: string;
  room_number?: string;
  test_name?: string;
  imaging_type?: string;
  body_part?: string;
  medication_name?: string;
  status: string;
  results?: string;
  completed_date?: string;
  priority: string;
}

const DoctorDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const [roomEncounters, setRoomEncounters] = useState<RoomEncounter[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<RoomEncounter | null>(null);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);

  // SOAP signing state
  const [soapSigned, setSoapSigned] = useState(false);
  const [soapSignedAt, setSoapSignedAt] = useState<string | null>(null);
  const [soapSignedBy, setSoapSignedBy] = useState<string | null>(null);

  // Forms state
  const [noteContent, setNoteContent] = useState('');
  const [nurseNoteContent, setNurseNoteContent] = useState('');
  const [proceduralNoteContent, setProceduralNoteContent] = useState('');

  // Multi-order state - arrays to hold pending orders
  const [pendingLabOrders, setPendingLabOrders] = useState<Array<{test_name: string, priority: string}>>([]);
  const [pendingImagingOrders, setPendingImagingOrders] = useState<Array<{imaging_type: string, body_part: string, priority: string}>>([]);
  const [pendingPharmacyOrders, setPendingPharmacyOrders] = useState<Array<{medication_name: string, dosage: string, frequency: string, route: string, quantity: string, refills: string, days_supply: string, priority: string, inventory_id?: number, selling_price?: number, quantity_on_hand?: number}>>([]);

  // Current order being added
  const [currentLabOrder, setCurrentLabOrder] = useState({test_name: '', priority: 'routine'});
  const [currentImagingOrder, setCurrentImagingOrder] = useState({imaging_type: '', body_part: '', priority: 'routine'});
  const [currentPharmacyOrder, setCurrentPharmacyOrder] = useState<{medication_name: string, dosage: string, frequency: string, route: string, quantity: string, refills: string, days_supply: string, priority: string, inventory_id?: number, selling_price?: number, quantity_on_hand?: number}>({medication_name: '', dosage: '', frequency: '', route: '', quantity: '', refills: '0', days_supply: '', priority: 'routine'});

  // Medication search state
  const [medSearchResults, setMedSearchResults] = useState<Array<{id: number, medication_name: string, generic_name: string, selling_price: number, quantity_on_hand: number, unit: string}>>([]);
  const [showMedSuggestions, setShowMedSuggestions] = useState(false);
  const medSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const medContainerRef = useRef<HTMLDivElement>(null);

  // Drug interaction state
  const [drugInteractions, setDrugInteractions] = useState<Array<{drug1: string, drug2: string, severity: string, description: string, recommendation: string}>>([]);
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [checkingInteractions, setCheckingInteractions] = useState(false);

  // Clinical Notes Tab state
  const [clinicalNotesTab, setClinicalNotesTab] = useState<'soap' | 'doctor' | 'nurse' | 'instructions' | 'procedural'>('soap');

  // Lab, Imaging and Pharmacy results state
  const [encounterLabOrders, setEncounterLabOrders] = useState<LabOrder[]>([]);
  const [encounterImagingOrders, setEncounterImagingOrders] = useState<ImagingOrder[]>([]);
  const [encounterPharmacyOrders, setEncounterPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [resultsTab, setResultsTab] = useState<'lab' | 'imaging' | 'pharmacy'>('lab');

  // Doctor Alerts state
  const [labAlerts, setLabAlerts] = useState<DoctorAlert[]>([]);
  const [imagingAlerts, setImagingAlerts] = useState<DoctorAlert[]>([]);
  const [pharmacyAlerts, setPharmacyAlerts] = useState<DoctorAlert[]>([]);
  const [alertsTab, setAlertsTab] = useState<'lab' | 'imaging' | 'pharmacy'>('lab');

  // Claims Review state
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [selectedReviewClaim, setSelectedReviewClaim] = useState<any>(null);
  const [showClaimReviewModal, setShowClaimReviewModal] = useState(false);
  const [claimReviewNotes, setClaimReviewNotes] = useState('');

  // Patient Quick View state
  const [quickViewPatientId, setQuickViewPatientId] = useState<number | null>(null);

  // Vital Signs History state
  const [showVitalsHistory, setShowVitalsHistory] = useState(false);

  // Follow-up modal state
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpTimeframe, setFollowUpTimeframe] = useState('2 weeks');
  const [followUpReason, setFollowUpReason] = useState('');
  const [reviewRequired, setReviewRequired] = useState(false);
  const [reviewDate, setReviewDate] = useState('');
  const [reviewReason, setReviewReason] = useState('');

  useEffect(() => {
    loadRoomEncounters();
    loadDoctorAlerts();
    loadPendingClaims();
    const interval = setInterval(() => {
      loadRoomEncounters();
      loadDoctorAlerts();
      loadPendingClaims();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedEncounter) {
      loadEncounterNotes(selectedEncounter.id);
      loadEncounterOrders(selectedEncounter.id);
    }
  }, [selectedEncounter]);

  const loadRoomEncounters = async () => {
    try {
      const res = await apiClient.get('/workflow/doctor/rooms');
      // Sort by newest first (highest ID = most recent)
      const encounters = (res.data.encounters || []).sort((a: RoomEncounter, b: RoomEncounter) => b.id - a.id);
      setRoomEncounters(encounters);
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
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const loadEncounterOrders = async (encounterId: number) => {
    try {
      const res = await apiClient.get(`/orders/encounter/${encounterId}`);
      setEncounterLabOrders(res.data.lab_orders || []);
      setEncounterImagingOrders(res.data.imaging_orders || []);
      setEncounterPharmacyOrders(res.data.pharmacy_orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const loadDoctorAlerts = async () => {
    try {
      const res = await apiClient.get('/orders/doctor-alerts');
      setLabAlerts(res.data.lab_alerts || []);
      setImagingAlerts(res.data.imaging_alerts || []);
      setPharmacyAlerts(res.data.pharmacy_alerts || []);
    } catch (error) {
      console.error('Error loading doctor alerts:', error);
    }
  };

  const loadPendingClaims = async () => {
    try {
      const res = await apiClient.get('/claims/pending-review');
      setPendingClaims(res.data.claims || []);
    } catch (error) {
      console.error('Error loading pending claims:', error);
    }
  };

  const handleReviewClaim = async (claim: any) => {
    try {
      const res = await apiClient.get(`/claims/${claim.id}`);
      setSelectedReviewClaim(res.data.claim);
      setClaimReviewNotes('');
      setShowClaimReviewModal(true);
    } catch (error) {
      showToast('Failed to load claim details', 'error');
    }
  };

  const handleApproveClaim = async () => {
    if (!selectedReviewClaim) return;
    try {
      await apiClient.post(`/claims/${selectedReviewClaim.id}/doctor-approve`, {
        doctor_notes: claimReviewNotes
      });
      showToast('Claim approved successfully', 'success');
      setShowClaimReviewModal(false);
      loadPendingClaims();
    } catch (error) {
      showToast('Failed to approve claim', 'error');
    }
  };

  const handleRejectClaim = async () => {
    if (!selectedReviewClaim || !claimReviewNotes) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }
    try {
      await apiClient.post(`/claims/${selectedReviewClaim.id}/doctor-reject`, {
        doctor_notes: claimReviewNotes
      });
      showToast('Claim rejected', 'success');
      setShowClaimReviewModal(false);
      loadPendingClaims();
    } catch (error) {
      showToast('Failed to reject claim', 'error');
    }
  };

  // Handle signing SOAP note
  const handleSignSOAP = async () => {
    if (!selectedEncounter) return;

    const patientLabel = selectedEncounter.patient_name || 'this patient';
    const encounterLabel = selectedEncounter.encounter_number
      ? ` (Encounter ${selectedEncounter.encounter_number})`
      : '';

    if (
      !confirm(
        `Sign the SOAP note for ${patientLabel}${encounterLabel}?\n\n` +
          `Once signed it cannot be edited.`
      )
    ) {
      return;
    }

    try {
      await apiClient.post(`/hp/${selectedEncounter.id}/sign`);
      setSoapSigned(true);
      setSoapSignedAt(new Date().toLocaleString());
      setSoapSignedBy(user?.first_name && user?.last_name ? `Dr. ${user.first_name} ${user.last_name}` : 'Doctor');
      showToast(`SOAP note signed for ${patientLabel}`, 'success');
    } catch (error) {
      console.error('Error signing SOAP note:', error);
      showToast('Failed to sign SOAP note', 'error');
    }
  };

  // Reset SOAP sign state when encounter changes
  const loadSOAPSignStatus = async (encounterId: number) => {
    try {
      const response = await apiClient.get(`/hp/${encounterId}/status`);
      setSoapSigned(response.data.is_signed || false);
      setSoapSignedAt(response.data.signed_at || null);
      setSoapSignedBy(response.data.signed_by_name || null);
    } catch (error) {
      console.error('Error loading SOAP status:', error);
      setSoapSigned(false);
      setSoapSignedAt(null);
      setSoapSignedBy(null);
    }
  };

  // Handle selecting an encounter - also starts the doctor encounter if not already started
  const handleSelectEncounter = async (encounter: RoomEncounter) => {
    setSelectedEncounter(encounter);
    loadSOAPSignStatus(encounter.id);

    // Call doctor start endpoint to update workflow_status to 'with_doctor'
    // This sets doctor_started_at in the database
    try {
      await apiClient.post('/workflow/doctor/start', {
        encounter_id: encounter.id,
      });
      // Reload encounters to get updated status
      loadRoomEncounters();
    } catch (error) {
      // Don't show error - this might fail if already started, which is fine
      console.error('Error starting doctor encounter:', error);
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

      showToast('Note added successfully', 'success');
      setNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding note:', error);
      showToast('Failed to add note', 'error');
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

      showToast('Nurse note added successfully', 'success');
      setNurseNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding nurse note:', error);
      showToast('Failed to add nurse note', 'error');
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

      showToast('Procedural note added successfully', 'success');
      setProceduralNoteContent('');
      loadEncounterNotes(selectedEncounter.id);
    } catch (error) {
      console.error('Error adding procedural note:', error);
      showToast('Failed to add procedural note', 'error');
    }
  };

  const handleSignNote = async (noteId: number) => {
    if (!confirm('Are you sure you want to sign this note? It will be locked and cannot be modified.')) {
      return;
    }

    try {
      await apiClient.post(`/clinical-notes/${noteId}/sign`);
      showToast('Note signed and chart updated', 'success');
      if (selectedEncounter) {
        loadEncounterNotes(selectedEncounter.id);
      }
    } catch (error) {
      console.error('Error signing note:', error);
      showToast('Failed to sign note', 'error');
    }
  };

  // Add orders to pending arrays
  const handleAddLabOrder = () => {
    if (!currentLabOrder.test_name) {
      showToast('Please enter a test name', 'warning');
      return;
    }
    setPendingLabOrders([...pendingLabOrders, currentLabOrder]);
    setCurrentLabOrder({test_name: '', priority: 'routine'});
  };

  const handleAddImagingOrder = () => {
    if (!currentImagingOrder.imaging_type) {
      showToast('Please enter imaging type', 'warning');
      return;
    }
    setPendingImagingOrders([...pendingImagingOrders, currentImagingOrder]);
    setCurrentImagingOrder({imaging_type: '', body_part: '', priority: 'routine'});
  };

  // Search pharmacy inventory for medication autocomplete
  const searchMedications = (query: string) => {
    setCurrentPharmacyOrder(prev => ({ ...prev, medication_name: query, inventory_id: undefined, selling_price: undefined, quantity_on_hand: undefined }));

    if (medSearchTimeout.current) clearTimeout(medSearchTimeout.current);

    if (query.length < 2) {
      setMedSearchResults([]);
      setShowMedSuggestions(false);
      return;
    }

    medSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/inventory/search?q=${encodeURIComponent(query)}`);
        setMedSearchResults(res.data.medications || []);
        setShowMedSuggestions((res.data.medications || []).length > 0);
      } catch (error) {
        console.error('Error searching medications:', error);
      }
    }, 300);
  };

  const selectMedication = (med: { id: number, medication_name: string, generic_name: string, selling_price: number, quantity_on_hand: number }) => {
    setCurrentPharmacyOrder(prev => ({
      ...prev,
      medication_name: med.medication_name,
      inventory_id: med.id,
      selling_price: med.selling_price,
      quantity_on_hand: med.quantity_on_hand,
    }));
    setShowMedSuggestions(false);
    setMedSearchResults([]);
  };

  // Close medication suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (medContainerRef.current && !medContainerRef.current.contains(e.target as Node)) {
        setShowMedSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddPharmacyOrder = async () => {
    if (!currentPharmacyOrder.medication_name) {
      showToast('Please enter medication name', 'warning');
      return;
    }

    // Check for drug interactions
    if (selectedEncounter) {
      setCheckingInteractions(true);
      try {
        const response = await apiClient.post('/drug-interactions/check', {
          patientId: selectedEncounter.patient_id,
          medication: currentPharmacyOrder.medication_name,
        });

        if (response.data.interactions && response.data.interactions.length > 0) {
          setDrugInteractions(response.data.interactions);
          setShowInteractionModal(true);
          setCheckingInteractions(false);
          return; // Don't add yet, wait for user confirmation
        }
      } catch (error) {
        console.error('Error checking drug interactions:', error);
        // Continue adding even if check fails
      }
      setCheckingInteractions(false);
    }

    // No interactions found, add the medication
    addMedicationToList();
  };

  const addMedicationToList = () => {
    setPendingPharmacyOrders([...pendingPharmacyOrders, currentPharmacyOrder]);
    setCurrentPharmacyOrder({medication_name: '', dosage: '', frequency: '', route: '', quantity: '', refills: '0', days_supply: '', priority: 'routine'});
    setDrugInteractions([]);
    setShowInteractionModal(false);
  };

  const handleConfirmMedicationWithInteraction = () => {
    showToast('Medication added with documented interaction warning', 'warning');
    addMedicationToList();
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
      showToast('Please add at least one order before submitting', 'warning');
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

      showToast(`Successfully submitted ${totalOrders} order(s)!`, 'success');

      // Clear all pending orders
      setPendingLabOrders([]);
      setPendingImagingOrders([]);
      setPendingPharmacyOrders([]);

      // Refresh the orders display so doctor can see what they just ordered
      if (selectedEncounter) {
        loadEncounterOrders(selectedEncounter.id);
      }
    } catch (error) {
      console.error('Error submitting orders:', error);
      showToast('Failed to submit some orders. Please try again.', 'error');
    }
  };

  const handleCompleteEncounter = () => {
    if (!selectedEncounter) {
      showToast('Please select a patient first', 'warning');
      return;
    }
    // Reset follow-up form and open modal
    setFollowUpRequired(false);
    setFollowUpTimeframe('2 weeks');
    setFollowUpReason('');
    setReviewRequired(false);
    setReviewDate('');
    setReviewReason('');
    setShowFollowUpModal(true);
  };

  const handleConfirmCompleteEncounter = async () => {
    if (!selectedEncounter) return;

    try {
      showToast('Alerting nurse...', 'info');
      const response = await apiClient.post('/workflow/doctor/complete-encounter', {
        encounter_id: selectedEncounter.id,
        follow_up_required: followUpRequired,
        follow_up_timeframe: followUpRequired ? followUpTimeframe : null,
        follow_up_reason: followUpRequired ? followUpReason : null,
        review_required: reviewRequired,
        review_date: reviewRequired ? reviewDate : null,
        review_reason: reviewRequired ? reviewReason : null,
      });
      console.log('Alert nurse response:', response.data);

      const message = reviewRequired
        ? 'Nurse alerted. Review call scheduled for ' + reviewDate + '.'
        : followUpRequired
        ? 'Nurse alerted. Follow-up visit marked for scheduling.'
        : 'Nurse has been alerted. Patient is ready for follow-up care.';
      showToast(message, 'success');

      setShowFollowUpModal(false);
      setSelectedEncounter(null);
      loadRoomEncounters();
    } catch (error: any) {
      console.error('Error alerting nurse:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to alert nurse';
      showToast(errorMessage, 'error');
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
    <AppLayout title="Doctor Dashboard">
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowGuide(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          How-To Guide
        </button>
      </div>
      <DepartmentGuide isOpen={showGuide} onClose={() => setShowGuide(false)} title="Doctor Dashboard Guide" sections={doctorGuideSections} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6">
          {/* Active Patients List */}
          <div className="xl:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <h2 className="text-sm font-semibold text-white">
                      Active Patients
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-primary-500 text-white text-xs font-bold rounded-full">
                    {roomEncounters.length}
                  </span>
                </div>
              </div>

              {/* Column Headers */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-3">Room</div>
                <div className="col-span-5">Patient</div>
                <div className="col-span-4 text-right">ID</div>
              </div>

              {/* Patient List */}
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {roomEncounters.map((encounter) => {
                  const isWithNurse = encounter.status === 'with_nurse';
                  return (
                  <div
                    key={encounter.id}
                    onClick={() => handleSelectEncounter(encounter)}
                    className={`px-4 py-3 grid grid-cols-12 gap-2 items-center transition-all duration-150 group cursor-pointer hover:bg-primary-50 ${
                      selectedEncounter?.id === encounter.id
                        ? 'bg-primary-100 border-l-4 border-primary-600'
                        : 'border-l-4 border-transparent hover:border-l-4 hover:border-primary-300'
                    }`}
                  >
                    {/* Room Number */}
                    <div className="col-span-3">
                      <span className="inline-flex items-center px-2 py-1 text-white text-xs font-bold rounded bg-primary-600">
                        Rm {encounter.room_number}
                      </span>
                    </div>

                    {/* Patient Name */}
                    <div className="col-span-5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/patients/${encounter.patient_id}`);
                          }}
                          className={`font-semibold text-sm text-left truncate transition-colors ${
                            selectedEncounter?.id === encounter.id
                              ? 'text-primary-800'
                              : 'text-gray-800 group-hover:text-primary-600'
                          }`}
                          title={encounter.patient_name}
                        >
                          {encounter.patient_name}
                        </button>
                        {encounter.vip_status && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded whitespace-nowrap ${
                            encounter.vip_status === 'platinum'
                              ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800'
                              : encounter.vip_status === 'gold'
                                ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-900'
                                : 'bg-gradient-to-r from-gray-200 to-slate-300 text-gray-700'
                          }`}>
                            {encounter.vip_status === 'platinum' ? '★ VIP' : encounter.vip_status === 'gold' ? '★ VIP' : '★ VIP'}
                          </span>
                        )}
                        {isWithNurse && (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded whitespace-nowrap">
                            With Nurse
                          </span>
                        )}
                      </div>
                      {encounter.nurse_name && (
                        <div className="text-xs truncate text-gray-500">
                          Nurse: {encounter.nurse_name}
                        </div>
                      )}
                    </div>

                    {/* Patient Number */}
                    <div className="col-span-4 text-right">
                      <span className="text-xs font-mono text-gray-500">
                        {encounter.patient_number}
                      </span>
                    </div>
                  </div>
                  );
                })}

                {roomEncounters.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <p className="text-sm font-medium">No active patients</p>
                    <p className="text-xs mt-1">Patients will appear when nurses alert you</p>
                  </div>
                )}
              </div>
            </div>

            {/* Results Alerts Section */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <h2 className="text-sm font-semibold text-white">
                      Results Alerts
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-primary-500 text-white text-xs font-bold rounded-full">
                    {labAlerts.length + imagingAlerts.length + pharmacyAlerts.length}
                  </span>
                </div>
              </div>

              {/* Alert Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setAlertsTab('lab')}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                    alertsTab === 'lab'
                      ? 'text-warning-600 border-b-2 border-warning-600 bg-warning-50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Lab ({labAlerts.length})
                </button>
                <button
                  onClick={() => setAlertsTab('imaging')}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                    alertsTab === 'imaging'
                      ? 'text-warning-600 border-b-2 border-warning-600 bg-warning-50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Imaging ({imagingAlerts.length})
                </button>
                <button
                  onClick={() => setAlertsTab('pharmacy')}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                    alertsTab === 'pharmacy'
                      ? 'text-warning-600 border-b-2 border-warning-600 bg-warning-50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Rx ({pharmacyAlerts.length})
                </button>
              </div>

              {/* Alert Content */}
              <div className="max-h-[250px] overflow-y-auto">
                {alertsTab === 'lab' && (
                  <>
                    {labAlerts.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No new lab results
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {labAlerts.map((alert) => (
                          <div key={alert.id} className="px-4 py-3 hover:bg-warning-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">{alert.test_name}</div>
                                <div className="text-xs text-gray-500">{alert.patient_name}</div>
                                {alert.room_number && (
                                  <span className="text-xs text-primary-600">Room {alert.room_number}</span>
                                )}
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                alert.priority === 'stat' ? 'bg-danger-100 text-danger-700' :
                                alert.priority === 'urgent' ? 'bg-warning-100 text-warning-700' :
                                'bg-success-100 text-success-700'
                              }`}>
                                {alert.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {alertsTab === 'imaging' && (
                  <>
                    {imagingAlerts.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No new imaging results
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {imagingAlerts.map((alert) => (
                          <div key={alert.id} className="px-4 py-3 hover:bg-warning-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">
                                  {alert.imaging_type}
                                  {alert.body_part ? ` — ${alert.body_part}` : ''}
                                </div>
                                <div className="text-xs text-gray-500">{alert.patient_name}</div>
                                {alert.room_number && (
                                  <span className="text-xs text-primary-600">Room {alert.room_number}</span>
                                )}
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                alert.priority === 'stat' ? 'bg-danger-100 text-danger-700' :
                                alert.priority === 'urgent' ? 'bg-warning-100 text-warning-700' :
                                'bg-success-100 text-success-700'
                              }`}>
                                {alert.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {alertsTab === 'pharmacy' && (
                  <>
                    {pharmacyAlerts.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No pharmacy updates
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {pharmacyAlerts.map((alert) => (
                          <div key={alert.id} className="px-4 py-3 hover:bg-warning-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">{alert.medication_name}</div>
                                <div className="text-xs text-gray-500">{alert.patient_name}</div>
                                {alert.room_number && (
                                  <span className="text-xs text-primary-600">Room {alert.room_number}</span>
                                )}
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                alert.status === 'dispensed' ? 'bg-success-100 text-success-700' :
                                'bg-primary-100 text-primary-700'
                              }`}>
                                {alert.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Global Pending Signatures — shows ALL unsigned SOAP notes
                across the doctor's active patients so they don't have to
                click into each patient to find out which notes need signing. */}
            {(() => {
              const unsigned = roomEncounters.filter((e) => !e.soap_signed);
              if (unsigned.length === 0) return null;
              return (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
                  <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <h2 className="text-sm font-semibold text-white">Pending Signatures</h2>
                      </div>
                      <span className="px-2.5 py-1 bg-warning-500 text-white text-xs font-bold rounded-full">
                        {unsigned.length}
                      </span>
                    </div>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto divide-y divide-gray-100">
                    {unsigned.map((enc) => (
                      <div
                        key={enc.id}
                        className="px-4 py-3 hover:bg-warning-50 transition-colors flex items-center justify-between gap-2"
                      >
                        <div
                          className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                          onClick={() => handleSelectEncounter(enc)}
                        >
                          <div className="w-8 h-8 rounded-full bg-warning-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-warning-800 truncate">
                              {enc.patient_name}
                            </div>
                            <div className="text-xs text-warning-600 truncate">
                              {enc.encounter_number ? `Enc ${enc.encounter_number}` : 'SOAP Note'}
                              {enc.room_number ? ` · Rm ${enc.room_number}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            // Select the encounter first so handleSignSOAP has context
                            setSelectedEncounter(enc);
                            loadSOAPSignStatus(enc.id);

                            const label = enc.patient_name || 'this patient';
                            const encLabel = enc.encounter_number
                              ? ` (Encounter ${enc.encounter_number})`
                              : '';
                            if (
                              !confirm(
                                `Sign the SOAP note for ${label}${encLabel}?\n\nOnce signed it cannot be edited.`
                              )
                            ) {
                              return;
                            }
                            try {
                              await apiClient.post(`/hp/${enc.id}/sign`);
                              setSoapSigned(true);
                              setSoapSignedAt(new Date().toLocaleString());
                              setSoapSignedBy(
                                user?.first_name && user?.last_name
                                  ? `Dr. ${user.first_name} ${user.last_name}`
                                  : 'Doctor'
                              );
                              showToast(`SOAP note signed for ${label}`, 'success');
                              // Refresh encounters so the widget updates
                              loadRoomEncounters();
                            } catch {
                              showToast('Failed to sign SOAP note', 'error');
                            }
                          }}
                          className="px-3 py-1.5 bg-warning-600 text-white text-xs font-bold rounded-lg hover:bg-warning-700 transition-colors flex-shrink-0"
                        >
                          Sign Now
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Claims Review Section */}
            {pendingClaims.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
                <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">Claims Pending Review</h2>
                    </div>
                    <span className="px-2.5 py-1 bg-white text-amber-700 text-xs font-bold rounded-full">
                      {pendingClaims.length}
                    </span>
                  </div>
                </div>
                <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100">
                  {pendingClaims.map((claim) => (
                    <div key={claim.id} className="px-4 py-3 hover:bg-amber-50 transition-colors cursor-pointer" onClick={() => handleReviewClaim(claim)}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{claim.claim_number}</div>
                          <div className="text-xs text-gray-600">{claim.patient_name}</div>
                          <div className="text-xs text-gray-500">{claim.insurance_provider_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900 text-sm">GHS {parseFloat(claim.total_charged || 0).toFixed(2)}</div>
                          <button className="text-xs text-amber-600 font-medium hover:underline">Review</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Signatures Section */}
            {selectedEncounter && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">Pending Signatures</h2>
                    </div>
                    <span className="px-2.5 py-1 bg-primary-500 text-white text-xs font-bold rounded-full">
                      {!soapSigned ? 1 : 0}
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  {!soapSigned ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-warning-50 rounded-lg border border-warning-200">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-warning-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-warning-800 truncate">
                              SOAP Note — {selectedEncounter.patient_name}
                            </div>
                            <div className="text-xs text-warning-600 truncate">
                              {selectedEncounter.encounter_number
                                ? `Encounter ${selectedEncounter.encounter_number}`
                                : 'Current visit'}
                              {selectedEncounter.room_number
                                ? ` · Room ${selectedEncounter.room_number}`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={handleSignSOAP}
                          className="px-3 py-1.5 bg-warning-600 text-white text-xs font-bold rounded-lg hover:bg-warning-700 transition-colors flex-shrink-0 ml-2"
                        >
                          Sign Now
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-success-50 rounded-lg border border-success-200">
                      <div className="w-8 h-8 rounded-full bg-success-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-success-800 truncate">
                          SOAP signed — {selectedEncounter.patient_name}
                        </div>
                        <div className="text-xs text-success-600 truncate">
                          {soapSignedBy ? `By ${soapSignedBy}` : 'Signed'}
                          {soapSignedAt ? ` · ${soapSignedAt}` : ''}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Messages Section */}
            {selectedEncounter && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">Messages</h2>
                    </div>
                    {notes.length > 0 && (
                      <span className="px-2.5 py-1 bg-primary-500 text-white text-xs font-bold rounded-full">
                        {notes.length}
                      </span>
                    )}
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notes.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {notes.slice(0, 10).map((note) => (
                        <div key={note.id} className="px-4 py-3 hover:bg-secondary-50 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                  note.note_type === 'doctor_general' ? 'bg-primary-100 text-primary-700' :
                                  note.note_type === 'nurse_general' ? 'bg-success-100 text-success-700' :
                                  note.note_type === 'doctor_to_nurse' ? 'bg-secondary-100 text-secondary-700' :
                                  note.note_type === 'doctor_procedural' ? 'bg-gray-100 text-gray-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {note.note_type === 'doctor_general' ? 'Doctor' :
                                   note.note_type === 'nurse_general' ? 'Nurse' :
                                   note.note_type === 'doctor_to_nurse' ? 'Instructions' :
                                   note.note_type === 'doctor_procedural' ? 'Procedural' :
                                   note.note_type}
                                </span>
                                {note.is_signed && (
                                  <span className="text-xs text-success-600 flex items-center gap-0.5">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    Signed
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-800 line-clamp-2">{note.content}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {note.created_by_name} • {new Date(note.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-gray-400 min-h-[200px] flex flex-col items-center justify-center">
                      <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      <p className="text-sm font-medium">No messages yet</p>
                      <p className="text-xs mt-1">Messages between staff will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Patient Details & Actions */}
          <div className="xl:col-span-2">
            {selectedEncounter ? (
              <div className="space-y-4">
                {/* Patient Info */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedEncounter.patient_name}</h2>
                      <div className="flex flex-wrap gap-2 lg:gap-4 mt-2 text-sm">
                        <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-lg font-semibold whitespace-nowrap">
                          Patient #: {selectedEncounter.patient_number}
                        </span>
                        <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-lg font-semibold whitespace-nowrap">
                          Encounter #: {selectedEncounter.encounter_number}
                        </span>
                        <span className="px-3 py-1 bg-success-50 text-success-700 rounded-lg font-semibold whitespace-nowrap">
                          {selectedEncounter.room_name || `Room ${selectedEncounter.room_number}`}
                        </span>
                      </div>
                    </div>
                    <Link
                      to={`/patients/${selectedEncounter.patient_id}`}
                      className="px-4 py-2 bg-gradient-to-r from-primary-600 to-secondary-600 text-white rounded-lg hover:from-primary-700 hover:to-secondary-700 transition-all shadow-md hover:shadow-lg font-semibold flex items-center gap-2"
                    >
                      View Full Chart
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">Today's Visit</div>
                    <div className="font-semibold text-lg text-primary-800 bg-primary-50 p-3 rounded-lg border border-primary-200">{selectedEncounter.chief_complaint || 'Not yet documented'}</div>
                  </div>

                  {/* Vital Signs Summary */}
                  {selectedEncounter.vital_signs && (
                    <div className="pt-4 mt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Vital Signs
                        </div>
                        <button
                          onClick={() => setShowVitalsHistory(true)}
                          className="px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          View History
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">BP</div>
                          <div className="font-bold text-gray-900">
                            {selectedEncounter.vital_signs.blood_pressure_systolic}/{selectedEncounter.vital_signs.blood_pressure_diastolic}
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">HR</div>
                          <div className="font-bold text-gray-900">
                            {selectedEncounter.vital_signs.heart_rate} <span className="text-xs font-normal">bpm</span>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">Temp</div>
                          <div className="font-bold text-gray-900">
                            {selectedEncounter.vital_signs.temperature}°{selectedEncounter.vital_signs.temperature_unit || 'F'}
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">SpO2</div>
                          <div className="font-bold text-gray-900">
                            {selectedEncounter.vital_signs.oxygen_saturation}%
                          </div>
                        </div>
                        {selectedEncounter.vital_signs.respiratory_rate && (
                          <div className="bg-gray-50 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">RR</div>
                            <div className="font-bold text-gray-900">
                              {selectedEncounter.vital_signs.respiratory_rate} <span className="text-xs font-normal">/min</span>
                            </div>
                          </div>
                        )}
                        {selectedEncounter.vital_signs.weight && (
                          <div className="bg-gray-50 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Weight</div>
                            <div className="font-bold text-gray-900">
                              {selectedEncounter.vital_signs.weight} <span className="text-xs font-normal">{selectedEncounter.vital_signs.weight_unit || 'lbs'}</span>
                            </div>
                          </div>
                        )}
                        {selectedEncounter.vital_signs.height && (
                          <div className="bg-gray-50 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Height</div>
                            <div className="font-bold text-gray-900">
                              {selectedEncounter.vital_signs.height} <span className="text-xs font-normal">{selectedEncounter.vital_signs.height_unit || 'in'}</span>
                            </div>
                          </div>
                        )}
                        {selectedEncounter.vital_signs.weight && selectedEncounter.vital_signs.height && (() => {
                          const vs = selectedEncounter.vital_signs;
                          const w = vs.weight!;
                          const h = vs.height!;
                          const weightKg = vs.weight_unit === 'kg' ? w : w * 0.453592;
                          const heightM = vs.height_unit === 'cm' ? h / 100 : h * 0.0254;
                          if (!heightM || !weightKg) return null;
                          const bmi = weightKg / (heightM * heightM);
                          const category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
                          const color = bmi < 18.5 ? 'text-warning-600' : bmi < 25 ? 'text-success-600' : bmi < 30 ? 'text-warning-600' : 'text-danger-600';
                          return (
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 mb-1">BMI</div>
                              <div className={`font-bold ${color}`}>
                                {bmi.toFixed(1)}
                              </div>
                              <div className={`text-xs ${color}`}>{category}</div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Clinical Notes */}
                <div className="card">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Clinical Notes</h2>
                  </div>

                  {/* Modern Tabs */}
                  <div className="border-b border-gray-200 mb-6">
                    <nav className="flex gap-2 overflow-x-auto" aria-label="Clinical Notes Tabs">
                      <button
                        onClick={() => setClinicalNotesTab('soap')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                          clinicalNotesTab === 'soap'
                            ? 'border-secondary-600 text-secondary-600 bg-secondary-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
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
                        onClick={() => setClinicalNotesTab('doctor')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'doctor'
                            ? 'border-primary-600 text-primary-600 bg-primary-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Doctor's Notes
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('nurse')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'nurse'
                            ? 'border-primary-600 text-primary-600 bg-primary-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Nurse Notes
                          {(notes.filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general').length + notes.filter(n => n.note_type === 'nurse_to_doctor').length) > 0 && (
                            <span className={`text-white text-xs px-2 py-0.5 rounded-full ${notes.filter(n => n.note_type === 'nurse_to_doctor').length > 0 ? 'bg-secondary-600' : 'bg-primary-600'}`}>
                              {notes.filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general').length + notes.filter(n => n.note_type === 'nurse_to_doctor').length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('instructions')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'instructions'
                            ? 'border-primary-600 text-primary-600 bg-primary-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                          Nurse Instructions
                        </div>
                      </button>
                      <button
                        onClick={() => setClinicalNotesTab('procedural')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          clinicalNotesTab === 'procedural'
                            ? 'border-primary-600 text-primary-600 bg-primary-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                          Procedural Notes
                        </div>
                      </button>
                    </nav>
                  </div>

                  {/* Tab Content */}
                  <div className="min-h-[400px] pb-6">
                    {/* SOAP Tab */}
                    {clinicalNotesTab === 'soap' && selectedEncounter && (
                      <div className="-mx-6 space-y-4">
                        {/* Results for this visit — surfaces completed labs
                            and imaging findings inline so the doctor can
                            reference them while charting the SOAP note. */}
                        {(() => {
                          const completedLabs = encounterLabOrders.filter(
                            (o) => o.status === 'completed' && o.results
                          );
                          const completedImaging = encounterImagingOrders.filter(
                            (o) => o.status === 'completed' && (o.results || o.findings)
                          );
                          if (completedLabs.length === 0 && completedImaging.length === 0) {
                            return null;
                          }
                          return (
                            <div className="mx-6 bg-primary-50 border border-primary-200 rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <h4 className="text-sm font-bold text-primary-800">
                                  Results for this visit
                                </h4>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {completedLabs.length > 0 && (
                                  <div>
                                    <div className="text-xs font-semibold text-primary-700 uppercase mb-1.5">
                                      Lab ({completedLabs.length})
                                    </div>
                                    <ul className="space-y-2">
                                      {completedLabs.map((o) => (
                                        <li
                                          key={o.id}
                                          className="bg-white rounded border border-primary-100 px-2.5 py-2"
                                        >
                                          <div className="text-xs font-semibold text-gray-900">
                                            {o.test_name}
                                          </div>
                                          <div className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">
                                            {o.results}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {completedImaging.length > 0 && (
                                  <div>
                                    <div className="text-xs font-semibold text-primary-700 uppercase mb-1.5">
                                      Imaging ({completedImaging.length})
                                    </div>
                                    <ul className="space-y-2">
                                      {completedImaging.map((o) => (
                                        <li
                                          key={o.id}
                                          className="bg-white rounded border border-primary-100 px-2.5 py-2"
                                        >
                                          <div className="text-xs font-semibold text-gray-900">
                                            {o.imaging_type}
                                            {o.body_part ? ` — ${o.body_part}` : ''}
                                          </div>
                                          <div className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">
                                            {o.results || o.findings}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                              <p className="text-[11px] text-primary-600 mt-2">
                                These results live in the Orders tab — copy anything
                                relevant into the Objective section of your SOAP note.
                              </p>
                            </div>
                          );
                        })()}

                        <HPAccordion
                          encounterId={selectedEncounter.id}
                          patientId={selectedEncounter.patient_id}
                          userRole="doctor"
                          vitalSigns={selectedEncounter.vital_signs}
                          onSign={handleSignSOAP}
                          isSigned={soapSigned}
                          signedAt={soapSignedAt || undefined}
                          signedBy={soapSignedBy || undefined}
                        />
                      </div>
                    )}

                    {/* Doctor's Notes Tab */}
                    {clinicalNotesTab === 'doctor' && (
                      <div className="space-y-6">
                        <form onSubmit={handleAddDoctorNote} className="bg-gradient-to-r from-primary-50 to-secondary-50 p-6 rounded-xl border-2 border-primary-200">
                          <SmartTextArea
                            value={noteContent}
                            onChange={setNoteContent}
                            placeholder="Enter clinical notes... Start typing for medical term suggestions."
                            rows={6}
                            sectionId="assessment"
                            showVoiceDictation={true}
                            label="Add New Doctor's Note"
                            required
                          />
                          <button type="submit" className="mt-4 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold shadow-md flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Note
                          </button>
                        </form>

                        {notes.filter(n => n.created_by_role === 'doctor' && n.note_type === 'doctor_general').length > 0 ? (
                          <div>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Notes</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.created_by_role === 'doctor' && n.note_type === 'doctor_general')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className={`p-4 rounded-xl border-2 ${
                                      note.is_signed
                                        ? 'bg-success-50 border-success-300'
                                        : 'bg-white border-gray-200 hover:border-primary-300'
                                    } transition-all shadow-sm hover:shadow-md`}
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-gray-600 font-medium">
                                        {new Date(note.created_at).toLocaleDateString()} - {note.created_by_name} - {note.is_signed ? 'Signed' : 'Unsigned'}
                                      </div>
                                      <div className="flex gap-2">
                                        {!note.is_signed && (
                                          <button
                                            onClick={() => handleSignNote(note.id)}
                                            className="text-xs bg-success-600 text-white px-3 py-1 rounded-full hover:bg-success-700 font-semibold transition-colors"
                                          >
                                            Sign Note
                                          </button>
                                        )}
                                        {note.is_signed && (
                                          <span className="text-xs bg-success-600 text-white px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            SIGNED
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-lg font-medium">No doctor's notes yet</p>
                            <p className="text-sm mt-1">Add your first clinical note above</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nurse Notes Tab */}
                    {clinicalNotesTab === 'nurse' && (
                      <div className="space-y-6">
                        {/* Nurse Messages to Doctor - highlighted section */}
                        {notes.filter(n => n.note_type === 'nurse_to_doctor').length > 0 && (
                          <div className="bg-gradient-to-r from-secondary-50 to-secondary-50 p-4 rounded-xl border-2 border-secondary-300">
                            <h3 className="font-bold text-secondary-800 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                              Messages from Nurse ({notes.filter(n => n.note_type === 'nurse_to_doctor').length})
                            </h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.note_type === 'nurse_to_doctor')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-4 rounded-xl bg-white border-2 border-secondary-200 shadow-sm"
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-secondary-700 font-semibold">
                                        {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <span className="text-xs bg-secondary-600 text-white px-2 py-1 rounded-full font-medium flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                        </svg>
                                        MESSAGE
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Nurse Clinical Notes */}
                        {notes.filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general').length > 0 ? (
                          <>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Nurse Clinical Notes</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.created_by_role === 'nurse' && n.note_type === 'nurse_general')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-4 rounded-xl bg-primary-50 border-2 border-primary-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-primary-700 font-semibold">
                                        {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                      </div>
                                      <span className="text-xs bg-primary-600 text-white px-2 py-1 rounded-full font-medium">
                                        NURSE NOTE
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </>
                        ) : notes.filter(n => n.note_type === 'nurse_to_doctor').length === 0 ? (
                          <div className="text-center py-12 text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="text-lg font-medium">No nurse notes or messages yet</p>
                            <p className="text-sm mt-1">Nurses will add notes and messages during patient care</p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Nurse Instructions Tab */}
                    {clinicalNotesTab === 'instructions' && (
                      <div className="space-y-6">
                        <form onSubmit={handleAddNurseNote} className="bg-gradient-to-r from-secondary-50 to-primary-50 p-6 rounded-xl border-2 border-secondary-200">
                          <SmartTextArea
                            value={nurseNoteContent}
                            onChange={setNurseNoteContent}
                            placeholder="Enter instructions, orders, or tasks for the nurse..."
                            rows={6}
                            sectionId="plan"
                            showVoiceDictation={true}
                            label="Add Instructions for Nurse"
                            required
                          />
                          <button type="submit" className="mt-4 px-6 py-3 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 transition-colors font-semibold shadow-md flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Send Instructions
                          </button>
                        </form>

                        {notes.filter(n => n.note_type === 'doctor_to_nurse').length > 0 && (
                          <div>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Sent Instructions</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.note_type === 'doctor_to_nurse')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-4 rounded-xl bg-secondary-50 border-2 border-secondary-200 shadow-sm"
                                  >
                                    <div className="text-xs text-secondary-700 font-medium mb-2">
                                      Sent {new Date(note.created_at).toLocaleString()}
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Procedural Notes Tab */}
                    {clinicalNotesTab === 'procedural' && (
                      <div className="space-y-6">
                        <form onSubmit={handleAddProceduralNote} className="bg-gradient-to-r from-gray-50 to-gray-50 p-6 rounded-xl border-2 border-gray-300">
                          <SmartTextArea
                            value={proceduralNoteContent}
                            onChange={setProceduralNoteContent}
                            placeholder="Document procedures performed, technique, findings, complications..."
                            rows={6}
                            sectionId="physical_exam"
                            showVoiceDictation={true}
                            label="Add Procedural Note"
                            required
                          />
                          <button type="submit" className="mt-4 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold shadow-md flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Procedural Note
                          </button>
                        </form>

                        {notes.filter(n => n.note_type === 'doctor_procedural').length > 0 ? (
                          <div>
                            <h3 className="font-bold text-gray-900 mb-4 text-lg">Procedural Notes</h3>
                            <div className="space-y-3">
                              {notes
                                .filter(n => n.note_type === 'doctor_procedural')
                                .map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-4 rounded-xl bg-gray-50 border-2 border-gray-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <div className="text-xs text-gray-700 font-medium mb-2">
                                      {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                                    </div>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                            <p className="text-lg font-medium">No procedural notes yet</p>
                            <p className="text-sm mt-1">Document procedures as they are performed</p>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-2xl font-semibold text-gray-600 mb-2">Select a patient to begin</p>
                  <p className="text-gray-400">Choose a patient from the active rooms to view their details and medical records</p>
                </div>
              </div>
            )}
          </div>

          {/* Full-width Orders & Actions */}
          {selectedEncounter && (
            <div className="xl:col-span-3 space-y-4">
              <div className="card">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Orders & Actions</h2>
                    {(pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length) > 0 && (
                      <span className="px-4 py-2 bg-primary-100 text-primary-800 font-bold rounded-lg">
                        {pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length} Pending
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-4 gap-4 xl:gap-6">
                    {/* Alert Nurse Action */}
                    <div className="border-2 border-success-200 rounded-xl p-4 bg-gradient-to-br from-success-50 to-success-50">
                      <h3 className="font-bold text-success-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        Quick Actions
                      </h3>
                      <div className="space-y-3">
                        <button
                          onClick={handleCompleteEncounter}
                          className="w-full px-4 py-4 bg-gradient-to-r from-success-600 to-success-600 text-white rounded-xl hover:from-success-700 hover:to-success-700 transition-all font-bold flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Alert Nurse
                        </button>
                        <p className="text-xs text-success-700 text-center">
                          Notify nurse when patient is ready for follow-up care
                        </p>
                      </div>
                    </div>
                    {/* Lab Orders */}
                    <div className="border-2 border-primary-200 rounded-xl p-4 bg-primary-50">
                      <h3 className="font-bold text-primary-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Lab Tests
                        {pendingLabOrders.length > 0 && (
                          <span className="ml-auto px-2 py-0.5 bg-primary-600 text-white rounded-full text-xs">
                            {pendingLabOrders.length}
                          </span>
                        )}
                      </h3>

                      <div className="space-y-3">
                        <AutocompleteInput
                          value={currentLabOrder.test_name}
                          onChange={(value) => setCurrentLabOrder({...currentLabOrder, test_name: value})}
                          sectionId="lab_tests"
                          className="w-full px-3 py-2 border border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                          placeholder="CBC, CMP, Lipid Panel..."
                        />
                        <select
                          value={currentLabOrder.priority}
                          onChange={(e) => setCurrentLabOrder({...currentLabOrder, priority: e.target.value})}
                          className="w-full px-3 py-2 border border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT</option>
                        </select>
                        <button
                          onClick={handleAddLabOrder}
                          className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center justify-center gap-2"
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
                              <div key={index} className="bg-white p-3 rounded-lg border border-primary-200 flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{order.test_name}</div>
                                  <div className="text-xs text-primary-600 font-medium mt-1">{order.priority.toUpperCase()}</div>
                                </div>
                                <button
                                  onClick={() => handleRemoveLabOrder(index)}
                                  className="text-danger-600 hover:text-danger-800 ml-2"
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
                    <div className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50">
                      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        Imaging
                        {pendingImagingOrders.length > 0 && (
                          <span className="ml-auto px-2 py-0.5 bg-gray-600 text-white rounded-full text-xs">
                            {pendingImagingOrders.length}
                          </span>
                        )}
                      </h3>

                      <div className="space-y-3">
                        <AutocompleteInput
                          value={currentImagingOrder.imaging_type}
                          onChange={(value) => setCurrentImagingOrder({...currentImagingOrder, imaging_type: value})}
                          sectionId="imaging_types"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 bg-white"
                          placeholder="X-Ray, CT, MRI..."
                        />
                        <AutocompleteInput
                          value={currentImagingOrder.body_part}
                          onChange={(value) => setCurrentImagingOrder({...currentImagingOrder, body_part: value})}
                          sectionId="imaging_body_parts"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 bg-white"
                          placeholder="Body part (optional)"
                        />
                        <select
                          value={currentImagingOrder.priority}
                          onChange={(e) => setCurrentImagingOrder({...currentImagingOrder, priority: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 bg-white"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT</option>
                        </select>
                        <button
                          onClick={handleAddImagingOrder}
                          className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold flex items-center justify-center gap-2"
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
                              <div key={index} className="bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{order.imaging_type}</div>
                                  {order.body_part && <div className="text-sm text-gray-600">{order.body_part}</div>}
                                  <div className="text-xs text-gray-600 font-medium mt-1">{order.priority.toUpperCase()}</div>
                                </div>
                                <button
                                  onClick={() => handleRemoveImagingOrder(index)}
                                  className="text-danger-600 hover:text-danger-800 ml-2"
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
                    <div className="border-2 border-success-200 rounded-xl p-4 bg-success-50">
                      <h3 className="font-bold text-success-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Pharmacy
                        {pendingPharmacyOrders.length > 0 && (
                          <span className="ml-auto px-2 py-0.5 bg-success-600 text-white rounded-full text-xs">
                            {pendingPharmacyOrders.length}
                          </span>
                        )}
                      </h3>

                      <div className="space-y-3">
                        {/* Medication search with live inventory lookup */}
                        <div ref={medContainerRef} className="relative">
                          <input
                            type="text"
                            value={currentPharmacyOrder.medication_name}
                            onChange={(e) => searchMedications(e.target.value)}
                            className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white"
                            placeholder="Search medication from inventory..."
                            autoComplete="off"
                          />
                          {showMedSuggestions && medSearchResults.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {medSearchResults.map((med) => (
                                <button
                                  key={med.id}
                                  type="button"
                                  onClick={() => selectMedication(med)}
                                  className="w-full px-3 py-2 text-left hover:bg-success-50 border-b border-gray-100 last:border-0"
                                >
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <span className="font-medium text-gray-900">{med.medication_name}</span>
                                      {med.generic_name && med.generic_name !== med.medication_name && (
                                        <span className="text-xs text-gray-500 ml-2">({med.generic_name})</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className={`font-semibold ${med.quantity_on_hand > 0 ? 'text-success-600' : 'text-danger-600'}`}>
                                        {med.quantity_on_hand > 0 ? `${med.quantity_on_hand} in stock` : 'Out of stock'}
                                      </span>
                                      <span className="text-gray-500">GHS {Number(med.selling_price).toFixed(2)}</span>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {currentPharmacyOrder.inventory_id && (
                            <div className="flex items-center gap-3 mt-1 text-xs">
                              <span className="text-success-600 font-medium">
                                In stock: {currentPharmacyOrder.quantity_on_hand}
                              </span>
                              <span className="text-gray-500">
                                Unit price: GHS {Number(currentPharmacyOrder.selling_price || 0).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={currentPharmacyOrder.dosage}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, dosage: e.target.value})}
                            className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white text-sm"
                            placeholder="Dosage"
                          />
                          <AutocompleteInput
                            value={currentPharmacyOrder.frequency}
                            onChange={(value) => setCurrentPharmacyOrder({...currentPharmacyOrder, frequency: value})}
                            sectionId="pharmacy_frequencies"
                            className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white text-sm"
                            placeholder="Frequency"
                          />
                          <AutocompleteInput
                            value={currentPharmacyOrder.route}
                            onChange={(value) => setCurrentPharmacyOrder({...currentPharmacyOrder, route: value})}
                            sectionId="pharmacy_routes"
                            className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white text-sm"
                            placeholder="Route"
                          />
                          <input
                            type="text"
                            value={currentPharmacyOrder.quantity}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, quantity: e.target.value})}
                            className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white text-sm"
                            placeholder="Quantity"
                          />
                          <input
                            type="number"
                            min="0"
                            value={currentPharmacyOrder.refills}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, refills: e.target.value})}
                            className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white text-sm"
                            placeholder="Refills"
                          />
                          <input
                            type="number"
                            min="1"
                            value={currentPharmacyOrder.days_supply}
                            onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, days_supply: e.target.value})}
                            className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white text-sm"
                            placeholder="Days Supply"
                          />
                        </div>
                        <select
                          value={currentPharmacyOrder.priority}
                          onChange={(e) => setCurrentPharmacyOrder({...currentPharmacyOrder, priority: e.target.value})}
                          className="w-full px-3 py-2 border border-success-300 rounded-lg focus:ring-2 focus:ring-success-500 bg-white"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT</option>
                        </select>
                        <button
                          onClick={handleAddPharmacyOrder}
                          disabled={checkingInteractions}
                          className="w-full px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {checkingInteractions ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Checking Interactions...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add Pharmacy Order
                            </>
                          )}
                        </button>

                        {/* Pending Pharmacy Orders */}
                        {pendingPharmacyOrders.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {pendingPharmacyOrders.map((order, index) => (
                              <div key={index} className="bg-white p-3 rounded-lg border border-success-200 flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{order.medication_name}</div>
                                  <div className="text-sm text-gray-600">
                                    {order.dosage} {order.frequency && `• ${order.frequency}`}
                                  </div>
                                  {order.route && <div className="text-sm text-gray-600">{order.route} • Qty: {order.quantity}</div>}
                                  <div className="text-sm text-gray-600">
                                    {parseInt(order.refills) > 0 && <span className="text-primary-600">{order.refills} refill(s)</span>}
                                    {order.days_supply && <span className="ml-2">• {order.days_supply} days supply</span>}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-success-600 font-medium">{order.priority.toUpperCase()}</span>
                                    {order.selling_price && (
                                      <span className="text-xs text-gray-500">GHS {Number(order.selling_price).toFixed(2)}/unit</span>
                                    )}
                                    {!order.inventory_id && (
                                      <span className="text-xs text-warning-600 font-medium">Not linked to inventory</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleRemovePharmacyOrder(index)}
                                  className="text-danger-600 hover:text-danger-800 ml-2"
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
                        className="w-full px-6 py-4 bg-gradient-to-r from-primary-600 to-secondary-600 text-white rounded-xl hover:from-primary-700 hover:to-secondary-700 transition-all shadow-lg hover:shadow-xl font-bold text-lg flex items-center justify-center gap-3"
                      >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Submit All {pendingLabOrders.length + pendingImagingOrders.length + pendingPharmacyOrders.length} Order(s)
                      </button>
                    </div>
                  )}
                </div>

                {/* Lab & Imaging Results Section */}
                <div className="card">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                      <svg className="w-6 h-6 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Lab, Imaging & Pharmacy
                    </h2>
                    <button
                      onClick={() => selectedEncounter && loadEncounterOrders(selectedEncounter.id)}
                      className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="border-b border-gray-200 mb-6">
                    <nav className="flex gap-2" aria-label="Results Tabs">
                      <button
                        onClick={() => setResultsTab('lab')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          resultsTab === 'lab'
                            ? 'border-secondary-600 text-secondary-600 bg-secondary-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          Lab Results
                          {encounterLabOrders.length > 0 && (
                            <span className="bg-secondary-600 text-white text-xs px-2 py-0.5 rounded-full">
                              {encounterLabOrders.length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setResultsTab('imaging')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          resultsTab === 'imaging'
                            ? 'border-secondary-600 text-secondary-600 bg-secondary-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          Imaging Results
                          {encounterImagingOrders.length > 0 && (
                            <span className="bg-secondary-600 text-white text-xs px-2 py-0.5 rounded-full">
                              {encounterImagingOrders.length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setResultsTab('pharmacy')}
                        className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                          resultsTab === 'pharmacy'
                            ? 'border-success-600 text-success-600 bg-success-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          Pharmacy
                          {encounterPharmacyOrders.length > 0 && (
                            <span className="bg-success-600 text-white text-xs px-2 py-0.5 rounded-full">
                              {encounterPharmacyOrders.length}
                            </span>
                          )}
                        </div>
                      </button>
                    </nav>
                  </div>

                  {/* Lab Results Tab */}
                  {resultsTab === 'lab' && (
                    <div>
                      {encounterLabOrders.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          <p className="text-lg font-medium">No lab orders for this encounter</p>
                          <p className="text-sm mt-1">Lab orders and results will appear here</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {encounterLabOrders.map((order) => (
                            <div
                              key={order.id}
                              className={`p-4 rounded-xl border-2 ${
                                order.status === 'completed'
                                  ? 'border-success-200 bg-success-50'
                                  : order.status === 'in_progress'
                                  ? 'border-warning-200 bg-warning-50'
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <h4 className="font-bold text-gray-900 text-lg">{order.test_name}</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      order.status === 'completed'
                                        ? 'bg-success-200 text-success-800'
                                        : order.status === 'in_progress'
                                        ? 'bg-warning-200 text-warning-800'
                                        : 'bg-gray-200 text-gray-800'
                                    }`}>
                                      {order.status === 'completed' ? 'RESULTED' : order.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      order.priority === 'stat'
                                        ? 'bg-danger-100 text-danger-700'
                                        : order.priority === 'urgent'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-primary-100 text-primary-700'
                                    }`}>
                                      {order.priority.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-500 mt-1">
                                    Ordered: {new Date(order.ordered_at).toLocaleString()}
                                  </div>
                                  {order.status === 'completed' && order.results && (
                                    <div className="mt-3 p-3 bg-white rounded-lg border border-success-300">
                                      <div className="text-sm font-semibold text-success-800 mb-1">Results:</div>
                                      <div className="text-gray-900 whitespace-pre-wrap">{order.results}</div>
                                      {order.completed_at && (
                                        <div className="text-xs text-gray-500 mt-2">
                                          Resulted: {new Date(order.completed_at).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Imaging Results Tab */}
                  {resultsTab === 'imaging' && (
                    <div>
                      {encounterImagingOrders.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          <p className="text-lg font-medium">No imaging orders for this encounter</p>
                          <p className="text-sm mt-1">Imaging orders and results will appear here</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {encounterImagingOrders.map((order) => (
                            <div
                              key={order.id}
                              className={`p-4 rounded-xl border-2 ${
                                order.status === 'completed'
                                  ? 'border-success-200 bg-success-50'
                                  : order.status === 'in_progress'
                                  ? 'border-warning-200 bg-warning-50'
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <h4 className="font-bold text-gray-900 text-lg">{order.imaging_type}</h4>
                                    {order.body_part && (
                                      <span className="text-gray-600">- {order.body_part}</span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      order.status === 'completed'
                                        ? 'bg-success-200 text-success-800'
                                        : order.status === 'in_progress'
                                        ? 'bg-warning-200 text-warning-800'
                                        : 'bg-gray-200 text-gray-800'
                                    }`}>
                                      {order.status === 'completed' ? 'RESULTED' : order.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      order.priority === 'stat'
                                        ? 'bg-danger-100 text-danger-700'
                                        : order.priority === 'urgent'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-primary-100 text-primary-700'
                                    }`}>
                                      {order.priority.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-500 mt-1">
                                    Ordered: {new Date(order.ordered_at).toLocaleString()}
                                  </div>
                                  {order.status === 'completed' && order.results && (
                                    <div className="mt-3 p-3 bg-white rounded-lg border border-success-300">
                                      <div className="text-sm font-semibold text-success-800 mb-1">Results/Findings:</div>
                                      <div className="text-gray-900 whitespace-pre-wrap">{order.results}</div>
                                      {order.completed_at && (
                                        <div className="text-xs text-gray-500 mt-2">
                                          Resulted: {new Date(order.completed_at).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pharmacy Tab */}
                  {resultsTab === 'pharmacy' && (
                    <div>
                      {encounterPharmacyOrders.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          <p className="text-lg font-medium">No pharmacy orders for this encounter</p>
                          <p className="text-sm mt-1">Pharmacy orders and dispensing status will appear here</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {encounterPharmacyOrders.map((order) => (
                            <div
                              key={order.id}
                              className={`p-4 rounded-xl border-2 ${
                                order.status === 'dispensed'
                                  ? 'border-success-200 bg-success-50'
                                  : order.status === 'ready'
                                  ? 'border-primary-200 bg-primary-50'
                                  : order.status === 'processing'
                                  ? 'border-warning-200 bg-warning-50'
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <h4 className="font-bold text-gray-900 text-lg">{order.medication_name}</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      order.status === 'dispensed'
                                        ? 'bg-success-200 text-success-800'
                                        : order.status === 'ready'
                                        ? 'bg-primary-200 text-primary-800'
                                        : order.status === 'processing'
                                        ? 'bg-warning-200 text-warning-800'
                                        : 'bg-gray-200 text-gray-800'
                                    }`}>
                                      {order.status === 'dispensed' ? 'DISPENSED' :
                                       order.status === 'ready' ? 'READY FOR PICKUP' :
                                       order.status === 'processing' ? 'PROCESSING' : 'ORDERED'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      order.priority === 'stat'
                                        ? 'bg-danger-100 text-danger-700'
                                        : order.priority === 'urgent'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-primary-100 text-primary-700'
                                    }`}>
                                      {order.priority.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-600 mt-2">
                                    <span className="font-medium">Dosage:</span> {order.dosage} |
                                    <span className="font-medium ml-2">Frequency:</span> {order.frequency} |
                                    <span className="font-medium ml-2">Route:</span> {order.route}
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    <span className="font-medium">Quantity:</span> {order.quantity}
                                    {order.refills > 0 && (
                                      <span className="ml-3 text-primary-600">
                                        <span className="font-medium">Refills:</span> {order.refills}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-500 mt-2">
                                    Ordered: {new Date(order.ordered_date).toLocaleString()}
                                  </div>
                                  {order.status === 'dispensed' && order.dispensed_date && (
                                    <div className="mt-3 p-3 bg-white rounded-lg border border-success-300">
                                      <div className="text-sm font-semibold text-success-800 mb-1">Dispensed</div>
                                      <div className="text-sm text-gray-600">
                                        {new Date(order.dispensed_date).toLocaleString()}
                                        {order.dispensed_by_name && (
                                          <span className="ml-2">by {order.dispensed_by_name}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </div>
          )}
        </div>

      {/* Patient Quick View Side Panel */}
      {quickViewPatientId && (
        <PatientQuickView
          patientId={quickViewPatientId}
          onClose={() => setQuickViewPatientId(null)}
          showHealthStatus={true}
        />
      )}

      {/* Vital Signs History Modal */}
      {showVitalsHistory && selectedEncounter && (
        <VitalSignsHistory
          patientId={selectedEncounter.patient_id}
          onClose={() => setShowVitalsHistory(false)}
        />
      )}

      {/* Drug Interaction Warning Modal */}
      {showInteractionModal && drugInteractions.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-danger-50 to-warning-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-danger-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-danger-800">Drug Interaction Warning</h3>
                  <p className="text-sm text-danger-600">Potential interaction detected for {currentPharmacyOrder.medication_name}</p>
                </div>
              </div>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-4">
                {drugInteractions.map((interaction, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-l-4 ${
                      interaction.severity === 'severe' || interaction.severity === 'contraindicated'
                        ? 'bg-danger-50 border-danger-500'
                        : interaction.severity === 'moderate'
                          ? 'bg-warning-50 border-warning-500'
                          : 'bg-gray-50 border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${
                        interaction.severity === 'severe' || interaction.severity === 'contraindicated'
                          ? 'bg-danger-600 text-white'
                          : interaction.severity === 'moderate'
                            ? 'bg-warning-600 text-white'
                            : 'bg-gray-500 text-white'
                      }`}>
                        {interaction.severity}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {interaction.drug1} + {interaction.drug2}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{interaction.description}</p>
                    {interaction.recommendation && (
                      <p className="text-sm text-gray-600 bg-white p-2 rounded">
                        <span className="font-semibold">Recommendation:</span> {interaction.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowInteractionModal(false);
                  setDrugInteractions([]);
                }}
                className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMedicationWithInteraction}
                className="px-4 py-2 bg-warning-600 text-white font-semibold rounded-lg hover:bg-warning-700 transition-colors"
              >
                Add Anyway (Document Warning)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claim Review Modal */}
      {showClaimReviewModal && selectedReviewClaim && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-amber-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Review Claim {selectedReviewClaim.claim_number}</h3>
                  <p className="text-sm text-gray-600">Insurance claim requires physician review</p>
                </div>
                <button onClick={() => setShowClaimReviewModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Patient Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Patient</p>
                  <p className="font-semibold text-gray-900">{selectedReviewClaim.patient_name}</p>
                  <p className="text-sm text-gray-600">{selectedReviewClaim.patient_number}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Insurance</p>
                  <p className="font-semibold text-gray-900">{selectedReviewClaim.insurance_provider_name}</p>
                  <p className="text-sm text-gray-600">Member: {selectedReviewClaim.member_id || 'N/A'}</p>
                </div>
              </div>

              {/* Diagnosis */}
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <p className="text-xs text-blue-600 font-medium">Primary Diagnosis</p>
                <p className="font-semibold text-gray-900">
                  {selectedReviewClaim.primary_diagnosis_code} - {selectedReviewClaim.primary_diagnosis_desc || 'No description'}
                </p>
              </div>

              {/* Claim Amount */}
              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <p className="text-xs text-green-600 font-medium">Claim Amount</p>
                <p className="text-2xl font-bold text-green-700">GHS {parseFloat(selectedReviewClaim.total_charged || 0).toFixed(2)}</p>
              </div>

              {/* Validation Issues */}
              {selectedReviewClaim.validation_issues && selectedReviewClaim.validation_issues.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <p className="text-xs text-red-600 font-medium mb-2">Validation Issues</p>
                  {selectedReviewClaim.validation_issues.map((issue: any, idx: number) => (
                    <p key={idx} className="text-sm text-red-700">{issue.issue}</p>
                  ))}
                  {selectedReviewClaim.validation_override_reason && (
                    <p className="text-sm text-gray-700 mt-2 p-2 bg-white rounded">
                      <span className="font-medium">Override reason:</span> {selectedReviewClaim.validation_override_reason}
                    </p>
                  )}
                </div>
              )}

              {/* Review Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Review Notes</label>
                <textarea
                  value={claimReviewNotes}
                  onChange={(e) => setClaimReviewNotes(e.target.value)}
                  placeholder="Enter your review notes (required for rejection)..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setShowClaimReviewModal(false)}
                className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectClaim}
                className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                Reject Claim
              </button>
              <button
                onClick={handleApproveClaim}
                className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
              >
                Approve Claim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Encounter / Follow-Up Modal */}
      {showFollowUpModal && selectedEncounter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Complete Encounter</h3>
                  <p className="text-sm text-gray-600">{selectedEncounter.patient_name}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                The patient will be sent back to the nurse for follow-up care.
              </p>

              <p className="text-xs text-gray-500">A standard follow-up call will be scheduled automatically on the next Monday or Thursday. Use the options below for additional scheduling.</p>

              {/* Follow-up visit checkbox */}
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={followUpRequired}
                  onChange={(e) => { setFollowUpRequired(e.target.checked); if (e.target.checked) setReviewRequired(false); }}
                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="font-medium text-gray-700">Schedule follow-up visit</span>
              </label>

              {followUpRequired && (
                <div className="space-y-4 pl-2 border-l-4 border-primary-200 ml-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe</label>
                    <select
                      value={followUpTimeframe}
                      onChange={(e) => setFollowUpTimeframe(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="1 week">1 week</option>
                      <option value="2 weeks">2 weeks</option>
                      <option value="1 month">1 month</option>
                      <option value="3 months">3 months</option>
                      <option value="6 months">6 months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                    <input
                      type="text"
                      value={followUpReason}
                      onChange={(e) => setFollowUpReason(e.target.value)}
                      placeholder="e.g., Review lab results, Check wound healing"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
              )}

              {/* Review call checkbox */}
              <label className="flex items-center gap-3 p-3 bg-warning-50 rounded-lg cursor-pointer hover:bg-warning-100 transition-colors border border-warning-200">
                <input
                  type="checkbox"
                  checked={reviewRequired}
                  onChange={(e) => { setReviewRequired(e.target.checked); if (e.target.checked) setFollowUpRequired(false); }}
                  className="w-5 h-5 text-warning-600 border-gray-300 rounded focus:ring-warning-500"
                />
                <div>
                  <span className="font-medium text-warning-800">Mark for nurse review call</span>
                  <p className="text-xs text-warning-600">Nurse will call the patient on the specified date instead of the standard follow-up</p>
                </div>
              </label>

              {reviewRequired && (
                <div className="space-y-4 pl-2 border-l-4 border-warning-300 ml-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Review Date *</label>
                    <input
                      type="date"
                      value={reviewDate}
                      onChange={(e) => setReviewDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warning-500 focus:border-warning-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason for review *</label>
                    <input
                      type="text"
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                      placeholder="e.g., Check blood pressure, Verify medication compliance"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warning-500 focus:border-warning-500"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex gap-3 justify-end">
              <button
                onClick={() => setShowFollowUpModal(false)}
                className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCompleteEncounter}
                className="px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Alert Nurse
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default DoctorDashboard;
