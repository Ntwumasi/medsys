import React, { useEffect, useRef, useState } from 'react';
import { useActiveId } from '../hooks/useActiveId';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { patientsAPI } from '../api/patients';
import { patientPortalAPI } from '../api/patientPortal';
import apiClient from '../api/client';
import type { PatientSummary } from '../types';
import { safeFormatDate } from '../utils/age';
import InteractionExplainButton from '../components/ai/InteractionExplainButton';
import VitalSignsHistory from '../components/VitalSignsHistory';
import LabResultsInline from '../components/LabResultsInline';
import { getApiError } from '../utils/apiError';
import PatientDocumentsPanel from '../components/PatientDocumentsPanel';
import AppLayout from '../components/AppLayout';
import PatientStickyBar from '../components/PatientStickyBar';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import { Card, EmptyState } from '../components/ui';
import { useNotification } from '../context/NotificationContext';
import AppSelect from '../components/ui/AppSelect';
import { useDialog } from '../context/DialogContext';
import { useAuth } from '../context/AuthContext';

interface LabResult {
  id: number;
  test_name: string;
  test_code?: string;
  priority: string;
  status: string;
  ordered_at: string;
  results_available_at?: string;
  results?: string;
  ordering_provider_name: string;
  encounter_number: string;
  notes?: string;
  result_document_id?: number | null;
  result_document_name?: string | null;
  result_document_file_type?: string | null;
}

// Inline addenda block — used inside the Previous Visits encounter card so
// doctors can review (and add) addenda directly from a past visit. Append-
// only by design; once saved, addenda can't be edited or deleted.
const EncounterAddenda: React.FC<{ encounterId: number; canAdd: boolean }> = ({ encounterId, canAdd }) => {
  const [list, setList] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`/hp/${encounterId}/addenda`);
        if (!cancelled) setList(res.data.addenda || []);
      } catch {
        if (!cancelled) setList([]);
      }
    })();
    return () => { cancelled = true; };
  }, [encounterId]);
  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await apiClient.post(`/hp/${encounterId}/addenda`, { content: draft.trim() });
      setList(prev => [...prev, res.data.addendum]);
      setDraft('');
      setAdding(false);
    } catch {
      // Surfacing error via toast lives at parent; keep child silent
    } finally {
      setSaving(false);
    }
  };
  if (list.length === 0 && !canAdd) return null;
  return (
    <div className="bg-ds-info-soft rounded-lg p-4 border border-ds-info/30 md:col-span-2 mt-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ds-info-text uppercase tracking-wider">
          Addenda {list.length > 0 && <span className="text-ds-info-text font-normal normal-case">({list.length})</span>}
        </p>
        {canAdd && !adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setDraft(''); }}
            className="min-h-ds-touch px-2.5 py-1 text-xs font-semibold text-ds-info-text bg-ds-surface border border-ds-info/30 rounded hover:bg-ds-info-soft"
          >
            + Add Addendum
          </button>
        )}
      </div>
      {list.length === 0 && !adding && (
        <p className="text-xs text-ds-info-text italic">No addenda. Add one for follow-up notes after labs / imaging come back.</p>
      )}
      {list.length > 0 && (
        <ol className="space-y-2">
          {list.map((a, idx) => (
            <li key={a.id} className="bg-ds-surface rounded p-2 border border-ds-info/30">
              <div className="flex items-center justify-between text-[11px] text-ds-info-text font-medium mb-1">
                <span>#{idx + 1} — {a.created_by_role === 'doctor' ? 'Dr. ' : ''}{a.created_by_name}</span>
                <span>{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-ds-text whitespace-pre-wrap">{a.content}</p>
            </li>
          ))}
        </ol>
      )}
      {adding && (
        <div className="mt-2 bg-ds-surface rounded p-2 border border-ds-info/30">
          <textarea
            rows={3}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Lab results received — FBS normal. No change to plan."
            className="w-full px-2 py-1.5 text-sm border border-ds-border-control rounded focus:outline-none focus:ring-2 focus:ring-ds-info"
          />
          <p className="text-[11px] text-ds-text-muted mt-1">Append-only. Once saved, this can't be edited.</p>
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <button type="button" onClick={() => { setAdding(false); setDraft(''); }} disabled={saving}
              className="min-h-ds-touch px-2.5 py-1 text-xs font-medium text-ds-text-secondary border border-ds-border-control rounded hover:bg-ds-subtle disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !draft.trim()}
              className="min-h-ds-touch px-2.5 py-1 text-xs font-semibold text-white dark:text-ds-canvas bg-ds-info rounded hover:bg-ds-info/90 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// How long the patient was at the clinic for a given encounter, rendered as
// e.g. "2h 34m" or "45m" or "3d 4h" for cross-day stays. Falls back to "In
// progress" when the visit hasn't been checked out yet. Returns null when
// we don't have a check-in time at all (legacy encounters predate the
// timestamp).
const formatVisitDuration = (encounter: {
  checked_in_at?: string | null;
  discharged_at?: string | null;
  encounter_date?: string | null;
}): string | null => {
  const startStr = encounter.checked_in_at || encounter.encounter_date;
  if (!startStr) return null;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return null;

  const endStr = encounter.discharged_at;
  if (!endStr) {
    // Still in progress — only meaningful for the active visit. Skip when
    // there's no checked_in_at to avoid claiming legacy rows are open.
    return encounter.checked_in_at ? 'In progress' : null;
  }
  const end = new Date(endStr);
  if (Number.isNaN(end.getTime())) return null;

  const ms = end.getTime() - start.getTime();
  if (ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const PatientDetails: React.FC = () => {
  useDesignSystemPage();
  const identityRef = useRef<HTMLDivElement>(null);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [summaryLoadFailed, setSummaryLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'overview' | 'encounters' | 'medications' | 'appointments' | 'vitals' | 'labs' | 'imaging' | 'documents' | null) || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'encounters' | 'medications' | 'appointments' | 'vitals' | 'labs' | 'imaging' | 'documents'>(initialTab);
  const [showVitalSignsHistory, setShowVitalSignsHistory] = useState(false);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [labsLoading, setLabsLoading] = useState(false);
  const [imagingResults, setImagingResults] = useState<Array<{id: number; imaging_type: string; body_part?: string; priority: string; status: string; ordered_date: string; completed_date?: string; findings?: string; ordering_provider_name?: string}>>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingAllergies, setEditingAllergies] = useState(false);
  const [allergyDraft, setAllergyDraft] = useState('');
  const [savingAllergies, setSavingAllergies] = useState(false);
  const [interactions, setInteractions] = useState<Array<{ drug1: string; drug2: string; severity: string; description: string; recommendation: string }>>([]);
  const [interactionData, setInteractionData] = useState<{ aiAvailable: boolean; summary: string; loaded: boolean }>({ aiAvailable: false, summary: '', loaded: false });
  const [interactionsLoading, setInteractionsLoading] = useState(false);
  const [editPayerType, setEditPayerType] = useState<string>('self_pay');
  const [editStaffLimit, setEditStaffLimit] = useState<string>('');
  const [staffBenefit, setStaffBenefit] = useState<{ annual_limit: number; used: number; remaining: number } | null>(null);
  const [editPayerId, setEditPayerId] = useState<number | null>(null);
  const [corporateClients, setCorporateClients] = useState<Array<{id: number; name: string}>>([]);
  const [insuranceProviders, setInsuranceProviders] = useState<Array<{id: number; name: string}>>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const { showToast } = useNotification();
  const { confirm: confirmDialog } = useDialog();
  const { user, impersonation } = useAuth();
  // Doctors (or super admins viewing as a doctor) can add addenda
  const canAddAddendum =
    user?.role === 'doctor' ||
    user?.is_super_admin === true ||
    impersonation.originalUser?.is_super_admin === true;

  // Front desk / admins can SMS the patient a portal access link
  const canSendPortalLink =
    user?.role === 'receptionist' || user?.role === 'admin' || user?.role === 'office_manager' || user?.is_super_admin === true;
  const [sendingLink, setSendingLink] = useState(false);
  const [expandedVisit, setExpandedVisit] = useState<number | null>(null);

  // Recording "don't send me marketing" is front-desk work — they're who the
  // patient tells. Marketing can set it too, from a campaign reply.
  const canSetMarketingOptOut =
    user?.role === 'receptionist' || user?.role === 'admin' || user?.role === 'marketing' ||
    user?.role === 'office_manager' || user?.is_super_admin === true;
  const [marketingOptOut, setMarketingOptOut] = useState(false);
  const [savingOptOut, setSavingOptOut] = useState(false);

  const handleToggleMarketingOptOut = async () => {
    if (!summary?.patient?.id) return;
    const next = !marketingOptOut;
    setSavingOptOut(true);
    try {
      const res = await apiClient.put(`/patients/${summary.patient.id}/marketing-opt-out`, {
        marketing_opt_out: next,
      });
      setMarketingOptOut(next);
      showToast(res.data?.message || 'Marketing preference updated', 'success');
    } catch (err) {
      showToast(getApiError(err, 'Could not update the marketing preference'), 'error');
    } finally {
      setSavingOptOut(false);
    }
  };

  // "No reminder texts" — separate from marketing: a patient can refuse
  // promotions and still want appointment reminders, or vice versa.
  const canSetReminderOptOut =
    user?.role === 'receptionist' || user?.role === 'admin' || user?.role === 'nurse' ||
    user?.role === 'doctor' || user?.role === 'office_manager' || user?.is_super_admin === true;
  const [reminderOptOut, setReminderOptOut] = useState(false);
  const [savingReminderOptOut, setSavingReminderOptOut] = useState(false);

  const handleToggleReminderOptOut = async () => {
    if (!summary?.patient?.id) return;
    const next = !reminderOptOut;
    setSavingReminderOptOut(true);
    try {
      const res = await apiClient.put(`/patients/${summary.patient.id}/reminder-opt-out`, {
        sms_reminders_opt_out: next,
      });
      setReminderOptOut(next);
      showToast(res.data?.message || 'Reminder preference updated', 'success');
    } catch (err) {
      showToast(getApiError(err, 'Could not update the reminder preference'), 'error');
    } finally {
      setSavingReminderOptOut(false);
    }
  };

  const handleSendPortalLink = async () => {
    if (!summary?.patient?.id || sendingLink) return;
    setSendingLink(true);
    try {
      const res = await patientPortalAPI.staffSend(summary.patient.id);
      showToast(res.message || 'Portal link sent', 'success');
    } catch (err) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      showToast(apiErr?.response?.data?.error || 'Failed to send portal link', 'error');
    } finally {
      setSendingLink(false);
    }
  };

  // Same component instance is reused across /patients/:id, so moving from
  // patient A's chart to B's must wipe A first — and any late reply for A is
  // ignored (isCurrentPatient) so it can never render under B's URL.
  const isActivePatientId = useActiveId<string | undefined>(id);
  const isCurrentPatient = (patientId: number) => isActivePatientId(String(patientId));
  useEffect(() => {
    setSummary(null);
    setSummaryLoadFailed(false);
    setLoading(true);
    setLabResults([]);
    setImagingResults([]);
    setAiSummary(null);
    setInteractions([]);
    setInteractionData({ aiAvailable: false, summary: '', loaded: false });
    if (id) {
      loadPatientSummary(parseInt(id));
      loadLabResults(parseInt(id));
      loadImagingResults(parseInt(id));
      loadAiSummary(parseInt(id));
    }
  }, [id]);

  const loadInteractions = async (patientId: number) => {
    setInteractionsLoading(true);
    try {
      const { data } = await apiClient.get(`/patients/${patientId}/medication-interactions`);
      if (!isCurrentPatient(patientId)) return;
      setInteractions(data.interactions || []);
      setInteractionData({ aiAvailable: !!data.aiAvailable, summary: data.summary || '', loaded: true });
    } catch (error) {
      console.error('Error loading drug interactions:', error);
      setInteractionData({ aiAvailable: false, summary: '', loaded: true });
    } finally {
      setInteractionsLoading(false);
    }
  };

  // Lazy-load the AI drug-interaction screen the first time the Medications tab is opened
  useEffect(() => {
    if (activeTab === 'medications' && id && !interactionData.loaded && !interactionsLoading) {
      loadInteractions(parseInt(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id]);

  const loadImagingResults = async (patientId: number) => {
    try {
      const response = await apiClient.get(`/orders/imaging?patient_id=${patientId}`);
      if (!isCurrentPatient(patientId)) return;
      setImagingResults(response.data.imaging_orders || []);
    } catch (error) {
      console.error('Error loading imaging results:', error);
    }
  };

  const handleDiscontinueMedication = async (medicationId: number, medicationName: string) => {
    if (!(await confirmDialog({ title: 'Discontinue medication?', message: `Discontinue ${medicationName}?`, variant: 'warning', confirmLabel: 'Discontinue' }))) return;
    try {
      await apiClient.post(`/medications/${medicationId}/discontinue`);
      showToast(`${medicationName} discontinued`, 'success');
      if (id) loadPatientSummary(parseInt(id));
    } catch (error) {
      showToast('Failed to discontinue medication', 'error');
    }
  };

  const startEditAllergies = () => {
    setAllergyDraft(summary?.patient.allergies || '');
    setEditingAllergies(true);
  };

  const handleSaveAllergies = async () => {
    if (!summary) return;
    setSavingAllergies(true);
    try {
      await apiClient.put(`/patients/${summary.patient.id}`, { allergies: allergyDraft.trim() });
      showToast('Allergies updated', 'success');
      setEditingAllergies(false);
      loadPatientSummary(summary.patient.id);
    } catch (error) {
      showToast('Failed to update allergies', 'error');
    } finally {
      setSavingAllergies(false);
    }
  };

  const loadLabResults = async (patientId: number) => {
    setLabsLoading(true);
    try {
      const response = await apiClient.get(`/orders/lab?patient_id=${patientId}`);
      if (!isCurrentPatient(patientId)) return;
      setLabResults(response.data.lab_orders || []);
    } catch (error) {
      console.error('Error loading lab results:', error);
    } finally {
      setLabsLoading(false);
    }
  };

  const loadPatientSummary = async (patientId: number) => {
    try {
      const data = await patientsAPI.getPatientSummary(patientId);
      if (!isCurrentPatient(patientId)) return;
      setSummary(data);
      setMarketingOptOut(Boolean((data as any)?.patient?.marketing_opt_out));
      setReminderOptOut(Boolean((data as any)?.patient?.sms_reminders_opt_out));
    } catch (error) {
      console.error('Error loading patient summary:', error);
      // A 404 really is "not found"; anything else is a failed load and must
      // not be presented as a missing patient.
      if (isCurrentPatient(patientId) && (error as { response?: { status?: number } })?.response?.status !== 404) {
        setSummaryLoadFailed(true);
      }
    } finally {
      if (isCurrentPatient(patientId)) setLoading(false);
    }
  };

  const loadAiSummary = async (patientId: number) => {
    setAiSummaryLoading(true);
    try {
      const { data } = await apiClient.get(`/patients/${patientId}/ai-summary`);
      if (!isCurrentPatient(patientId)) return;
      setAiSummary(data.summary || null);
    } catch {
      // Non-blocking
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const calculateAge = (dob: string) => {
    if (!dob) return 'N/A';
    const today = new Date();
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return 'N/A';
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getSeverityColor = (severity?: string) => {
    const colors: Record<string, string> = {
      mild: 'bg-ds-warning-soft text-ds-warning-text',
      moderate: 'bg-ds-warning-soft text-ds-warning-text',
      severe: 'bg-ds-critical-soft text-ds-critical-text',
    };
    return colors[severity || ''] || 'bg-ds-subtle text-ds-text';
  };

  const openEditModal = async () => {
    if (!summary) return;
    const p = summary.patient;
    setEditData({
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      phone: p.phone || '',
      email: p.email || '',
      date_of_birth: p.date_of_birth || '',
      gender: p.gender || '',
      address: p.address || '',
      city: p.city || '',
      allergies: p.allergies || '',
      emergency_contact_name: p.emergency_contact_name || '',
      emergency_contact_phone: p.emergency_contact_phone || '',
      emergency_contact_relationship: p.emergency_contact_relationship || '',
      pcp_name: p.pcp_name || '',
      pcp_phone: p.pcp_phone || '',
    });

    // Load current payer source
    const primaryPayer = summary.payer_sources?.find((ps) => ps.is_primary) || summary.payer_sources?.[0];
    if (primaryPayer) {
      setEditPayerType(primaryPayer.payer_type);
      setEditPayerId(
        primaryPayer.payer_type === 'corporate' ? primaryPayer.corporate_client_id ?? null :
        primaryPayer.payer_type === 'insurance' ? primaryPayer.insurance_provider_id ?? null : null
      );
    } else {
      setEditPayerType('self_pay');
      setEditPayerId(null);
    }

    // Fetch corporate clients and insurance providers
    try {
      const [ccRes, ipRes] = await Promise.all([
        apiClient.get('/payer-sources/corporate-clients'),
        apiClient.get('/payer-sources/insurance-providers'),
      ]);
      setCorporateClients(ccRes.data.corporate_clients || []);
      setInsuranceProviders(ipRes.data.insurance_providers || []);
    } catch (e) {
      console.error('Error loading payer options:', e);
    }

    // Load the staff package amount (if any) so it can be edited.
    try {
      const { data } = await apiClient.get(`/staff-benefits/patient/${summary.patient.id}`);
      setStaffBenefit(data.benefit ? { annual_limit: data.benefit.annual_limit, used: data.used, remaining: data.remaining } : null);
      setEditStaffLimit(data.benefit ? String(data.benefit.annual_limit) : '');
    } catch (e) {
      console.error('Error loading staff benefit:', e);
      setStaffBenefit(null);
      setEditStaffLimit('');
    }

    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!summary) return;
    setSaving(true);
    try {
      // Update patient demographics
      await apiClient.put(`/patients/${summary.patient.id}`, editData);

      // Update payer sources
      const payerSource: Record<string, unknown> = { payer_type: editPayerType, is_primary: true };
      if (editPayerType === 'corporate' && editPayerId) {
        payerSource.corporate_client_id = editPayerId;
      } else if (editPayerType === 'insurance' && editPayerId) {
        payerSource.insurance_provider_id = editPayerId;
      }
      await apiClient.put(`/payer-sources/patient/${summary.patient.id}`, {
        payer_sources: [payerSource],
      });

      // Save the staff package amount when this patient is billed as staff.
      if (editPayerType === 'staff' && editStaffLimit.trim() !== '') {
        const limit = parseFloat(editStaffLimit);
        if (Number.isFinite(limit) && limit >= 0) {
          await apiClient.put(`/staff-benefits/patient/${summary.patient.id}`, { annual_limit: limit });
        }
      }

      showToast('Patient information updated', 'success');
      setShowEditModal(false);
      loadPatientSummary(summary.patient.id);
    } catch (error) {
      console.error('Error updating patient:', error);
      showToast('Failed to update patient', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout designSystem title="Patient Details">
        <Card>
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-ds-accent"></div>
            <p className="mt-4 text-ds-text-secondary">Loading patient information...</p>
          </div>
        </Card>
      </AppLayout>
    );
  }

  if (!summary && summaryLoadFailed) {
    return (
      <AppLayout designSystem title="Patient Details">
        <Card>
          <EmptyState
            title="Couldn't load this patient"
            description="The patient's record didn't load. Check your connection and try again."
            action={{ label: 'Try again', onClick: () => { if (id) { setSummaryLoadFailed(false); setLoading(true); loadPatientSummary(parseInt(id)); } } }}
          />
        </Card>
      </AppLayout>
    );
  }

  if (!summary) {
    return (
      <AppLayout designSystem title="Patient Details">
        <Card>
          <EmptyState
            title="Patient not found"
            description="The patient you're looking for doesn't exist or has been removed."
            icon={
              <svg className="w-16 h-16 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            action={{ label: 'Go Back', onClick: () => navigate(-1) }}
          />
        </Card>
      </AppLayout>
    );
  }

  const { patient, recent_encounters, active_medications, allergies, upcoming_appointments } = summary;

  // Tests ordered on an earlier visit that haven't been done yet — so whoever
  // opens the profile (front desk at check-in, nurse, lab) sees them.
  const outstandingLabs = labResults.filter((l) => l.status === 'pending');

  return (
    <AppLayout designSystem title={`${patient.first_name} ${patient.last_name}`}>
      <div className="space-y-6">
        <div ref={identityRef} aria-hidden="true" />
        <PatientStickyBar
          watch={identityRef}
          className="-mb-6"
          name={`${patient.first_name} ${patient.last_name}`}
          age={patient.date_of_birth ? `${calculateAge(patient.date_of_birth)}y` : undefined}
          sex={patient.gender}
          patientNumber={patient.patient_number}
          allergies={allergies.length ? allergies.map((a) => a.allergen).join(', ') : patient.allergies || null}
        />

        {outstandingLabs.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-ds-info-soft border border-ds-info/30 rounded-lg" role="status">
            <svg className="w-5 h-5 text-ds-info-text flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <div className="text-sm text-ds-info-text flex-1">
              <p className="font-semibold">
                {outstandingLabs.length} lab test{outstandingLabs.length > 1 ? 's' : ''} ordered but not yet done
              </p>
              <p className="mt-0.5">
                {outstandingLabs
                  .map((l) => `${l.test_name} (ordered ${safeFormatDate(l.ordered_at, 'MMM d')})`)
                  .join(', ')}
                {' '}— send the patient to the lab.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('labs')}
              className="min-h-ds-touch px-3 py-1.5 text-xs font-medium text-ds-info-text bg-ds-surface border border-ds-info/30 rounded-lg hover:bg-ds-info-soft flex-shrink-0"
            >
              View labs
            </button>
          </div>
        )}

        {/* A real, un-merged duplicate exists (same name + DOB) — prompt cleanup.
            Data-driven (has_duplicate from the API), so it only fires when there's
            actually something to merge, not on every CareCode import. */}
        {(patient as any).has_duplicate ? (
          <div className="flex items-start gap-3 p-4 bg-ds-warning-soft border border-ds-warning-border rounded-lg">
            <svg className="w-5 h-5 text-ds-warning-text flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-ds-warning-text">
              <span className="font-semibold">Possible duplicate.</span> Another patient with the same name and date of birth exists. Ask an admin to merge them under <span className="font-medium">Patients → Review Duplicates</span>.
            </div>
          </div>
        ) : ((patient as any).carecode_origin_number || (patient as any).source === 'carecode' || patient.patient_number?.startsWith('CC-')) && (
          /* No live duplicate — show the calm CareCode provenance note. */
          <div className="flex items-start gap-3 p-4 bg-ds-info-soft border border-ds-info/30 rounded-lg">
            <svg className="w-5 h-5 text-ds-info-text flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-ds-info-text">
              <span className="font-semibold">Migrated from CareCode.</span>{' '}
              {(patient as any).carecode_origin_number
                ? <>This patient's legacy CareCode record (<span className="font-medium">{(patient as any).carecode_origin_number}</span>) has been merged into this record.</>
                : <>Imported from the legacy CareCode system. Verify details on the patient's first visit.</>}
            </div>
          </div>
        )}

        {/* Allergies — prominent, inline-editable so any clinician can record allergies
            discovered during the patient journey without opening the full edit modal */}
        <div className={`rounded-ds-card border p-4 flex items-start gap-3 ${patient.allergies ? 'bg-ds-critical-soft border-ds-critical-border' : 'bg-ds-subtle border-ds-border'}`}>
          <svg className={`w-6 h-6 flex-shrink-0 mt-0.5 ${patient.allergies ? 'text-ds-critical-text' : 'text-ds-text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${patient.allergies ? 'text-ds-critical-text' : 'text-ds-text-muted'}`}>Allergies</span>
              {!editingAllergies && (
                <button
                  onClick={startEditAllergies}
                  className="text-xs font-semibold text-ds-accent-text hover:text-ds-accent-text hover:underline"
                >
                  {patient.allergies ? 'Edit' : '+ Add'}
                </button>
              )}
            </div>
            {editingAllergies ? (
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  autoFocus
                  value={allergyDraft}
                  onChange={(e) => setAllergyDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAllergies(); if (e.key === 'Escape') setEditingAllergies(false); }}
                  placeholder="e.g., Penicillin, Peanuts, Sulfa drugs — separate with commas"
                  className="flex-1 px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAllergies}
                    disabled={savingAllergies}
                    className="min-h-ds-touch px-4 py-2 text-sm font-semibold text-ds-on-accent bg-ds-accent rounded-lg hover:bg-ds-accent-hover disabled:opacity-50"
                  >
                    {savingAllergies ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingAllergies(false)}
                    className="min-h-ds-touch px-4 py-2 text-sm font-semibold text-ds-text-secondary bg-ds-subtle rounded-lg hover:bg-ds-border"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className={`mt-0.5 font-semibold ${patient.allergies ? 'text-ds-critical-text' : 'text-ds-text-muted'}`}>
                {patient.allergies || 'No known allergies'}
              </p>
            )}
          </div>
        </div>

        {/* Patient Info Card */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border p-6 mb-6">
          <div className="flex justify-end gap-2 mb-2">
            {/* Marketing opt-out. Reception is who the patient tells, so the
                switch lives on the record rather than in the marketing screen. */}
            {canSetMarketingOptOut && (
              <button
                onClick={handleToggleMarketingOptOut}
                disabled={savingOptOut}
                className={`min-h-ds-touch px-4 py-2 text-sm font-medium border rounded-lg transition-colors disabled:opacity-50 ${
                  marketingOptOut
                    ? 'text-ds-warning-text bg-ds-warning-soft border-ds-warning-border hover:bg-ds-warning-soft'
                    : 'text-ds-text-secondary bg-ds-surface border-ds-border hover:bg-ds-subtle'
                }`}
                title={
                  marketingOptOut
                    ? 'This patient is excluded from marketing lists — click to include them again'
                    : 'Exclude this patient from marketing lists'
                }
              >
                {savingOptOut ? 'Saving…' : marketingOptOut ? 'No marketing ✓' : 'No marketing'}
              </button>
            )}
            {canSetReminderOptOut && (
              <button
                onClick={handleToggleReminderOptOut}
                disabled={savingReminderOptOut}
                className={`min-h-ds-touch px-4 py-2 text-sm font-medium border rounded-lg transition-colors disabled:opacity-50 ${
                  reminderOptOut
                    ? 'text-ds-warning-text bg-ds-warning-soft border-ds-warning-border hover:bg-ds-warning-soft'
                    : 'text-ds-text-secondary bg-ds-surface border-ds-border hover:bg-ds-subtle'
                }`}
                title={
                  reminderOptOut
                    ? 'This patient gets no automatic texts (reminders, results ready, receipts) — click to send them again'
                    : 'Stop automatic texts to this patient (reminders, results ready, receipts)'
                }
              >
                {savingReminderOptOut ? 'Saving…' : reminderOptOut ? 'No reminder texts ✓' : 'No reminder texts'}
              </button>
            )}
            {canSendPortalLink && (
              <button
                onClick={handleSendPortalLink}
                disabled={sendingLink}
                className="min-h-ds-touch px-4 py-2 text-sm font-medium text-ds-success-text bg-ds-success-soft border border-ds-success/30 rounded-lg hover:bg-ds-success-soft transition-colors flex items-center gap-2 disabled:opacity-50"
                title="Text the patient a secure link to access their records"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
                </svg>
                {sendingLink ? 'Sending…' : 'Send Portal Link'}
              </button>
            )}
            <button
              onClick={openEditModal}
              className="min-h-ds-touch px-4 py-2 text-sm font-medium text-ds-accent-text bg-ds-accent-soft border border-ds-accent/30 rounded-lg hover:bg-ds-accent-soft transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Patient
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-ds-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-ds-info-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Demographics
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Age:</span>
                  <span className="font-semibold text-ds-text">{calculateAge(patient.date_of_birth)} years</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Gender:</span>
                  <span className="font-semibold text-ds-text capitalize">{patient.gender}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Allergies:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded ${patient.allergies ? 'bg-ds-critical-soft text-ds-critical-text' : 'text-ds-text-muted'}`}>
                    {patient.allergies || 'None reported'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">DOB:</span>
                  <span className="font-semibold text-ds-text">{safeFormatDate(patient.date_of_birth, 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ds-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-ds-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Contact Information
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Phone:</span>
                  <span className="font-semibold text-ds-text">{patient.phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Email:</span>
                  <span className="font-semibold text-ds-text text-sm">{patient.email || 'N/A'}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Address:</span>
                  <span className="font-semibold text-ds-text">
                    {patient.address || 'N/A'}
                    {patient.city && (
                      <span className="block text-ds-text-secondary">{patient.city}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ds-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-ds-warning-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Emergency Contact
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Name:</span>
                  <span className="font-semibold text-ds-text">{patient.emergency_contact_name || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Phone:</span>
                  <span className="font-semibold text-ds-text">{patient.emergency_contact_phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Relationship:</span>
                  <span className="font-semibold text-ds-text capitalize">{patient.emergency_contact_relationship || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ds-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-ds-brand-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Insurance & Billing
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Payer:</span>
                  <div>
                    {summary.payer_sources && summary.payer_sources.length > 0 ? (
                      summary.payer_sources.map((ps) => (
                        <div key={ps.id} className="font-semibold text-ds-text capitalize">
                          {ps.payer_type === 'corporate' ? ps.corporate_client_name :
                           ps.payer_type === 'insurance' ? ps.insurance_provider_name :
                           ps.payer_type === 'staff' ? 'Staff' :
                           'Self Pay'}
                          {ps.is_primary && <span className="text-xs text-ds-accent-text ml-1">(Primary)</span>}
                        </div>
                      ))
                    ) : (
                      <span className="text-ds-text-muted">Not set</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ds-text-muted text-sm w-24">Balance:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded ${
                    (summary.outstanding_balance || 0) > 0 ? 'bg-ds-critical-soft text-ds-critical-text' : 'bg-ds-success-soft text-ds-success-text'
                  }`}>
                    {(summary.outstanding_balance || 0) > 0
                      ? `GH₵${Number(summary.outstanding_balance).toFixed(2)} owed`
                      : 'No balance'}
                  </span>
                </div>
                {patient.pcp_name && (
                  <div className="flex items-center gap-3">
                    <span className="text-ds-text-muted text-sm w-24">PCP:</span>
                    <span className="font-semibold text-ds-text">{patient.pcp_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Allergies Alert */}
        {allergies.length > 0 && (
          <div className="bg-gradient-to-r from-ds-critical-soft to-ds-critical-soft border-l-4 border-ds-critical rounded-ds-card p-5 mb-6 shadow-ds-card">
            <div className="flex items-start gap-4">
              <div className="bg-ds-critical p-2 rounded-lg">
                <svg className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-ds-critical-text">Known Allergies</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allergies.map((allergy) => (
                    <span
                      key={allergy.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${getSeverityColor(allergy.severity)}`}
                    >
                      {allergy.allergen}
                      {allergy.severity && (
                        <span className="text-xs opacity-75">({allergy.severity})</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modern Tabs */}
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
          <div className="border-b border-ds-border bg-ds-subtle">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'overview'
                    ? 'border-ds-info text-ds-info-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Overview
              </button>
              <button
                onClick={() => setActiveTab('encounters')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'encounters'
                    ? 'border-ds-info text-ds-info-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Previous Visits
                {recent_encounters.length > 0 && (
                  <span className="bg-ds-info text-white dark:text-ds-canvas text-xs px-2 py-0.5 rounded-full">{recent_encounters.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('medications')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'medications'
                    ? 'border-ds-info text-ds-info-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Medications
                {active_medications.length > 0 && (
                  <span className="bg-ds-success text-white dark:text-ds-canvas text-xs px-2 py-0.5 rounded-full">{active_medications.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('appointments')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'appointments'
                    ? 'border-ds-info text-ds-info-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Appointments
                {upcoming_appointments.length > 0 && (
                  <span className="bg-ds-accent text-ds-on-accent text-xs px-2 py-0.5 rounded-full">{upcoming_appointments.length}</span>
                )}
              </button>
              <button
                onClick={() => setShowVitalSignsHistory(true)}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'vitals'
                    ? 'border-ds-critical text-ds-critical-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Vital Signs History
              </button>
              <button
                onClick={() => setActiveTab('labs')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'labs'
                    ? 'border-ds-info text-ds-info-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Lab Results
                {labResults.length > 0 && (
                  <span className="bg-ds-info text-white dark:text-ds-canvas text-xs px-2 py-0.5 rounded-full">{labResults.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('imaging')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'imaging'
                    ? 'border-ds-info text-ds-info-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Imaging
                {imagingResults.length > 0 && (
                  <span className="bg-ds-info text-white dark:text-ds-canvas text-xs px-2 py-0.5 rounded-full">{imagingResults.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'documents'
                    ? 'border-ds-info text-ds-info-text bg-ds-surface'
                    : 'border-transparent text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Documents
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* AI Patient Summary */}
                {(aiSummary || aiSummaryLoading) && (
                  <div className="bg-gradient-to-r from-ds-info-soft to-ds-info-soft rounded-ds-card p-4 border border-ds-info/30">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-ds-info-soft flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-ds-info-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-ds-info-text uppercase tracking-wide mb-1">AI Summary</p>
                        {aiSummaryLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin h-3 w-3 border-2 border-ds-info border-t-transparent rounded-full" />
                            <span className="text-sm text-ds-info-text">Generating summary...</span>
                          </div>
                        ) : (
                          <p className="text-sm text-ds-text leading-relaxed">{aiSummary}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Encounters Summary */}
                <div className="bg-gradient-to-br from-ds-info-soft to-ds-info-soft rounded-ds-card p-6 border border-ds-info/30">
                  <h2 className="text-xl font-bold text-ds-text mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-ds-info-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Recent Visits
                  </h2>
                  {recent_encounters.length === 0 ? (
                    <div className="text-center py-8 text-ds-text-muted">
                      <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium">No previous visits recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recent_encounters.slice(0, 3).map((encounter) => (
                        <div key={encounter.id} className="bg-ds-surface rounded-lg p-4 border border-ds-info/30 shadow-ds-card">
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-bold text-ds-text">
                              {safeFormatDate(encounter.encounter_date, 'MMM d, yyyy')}
                            </p>
                            <span className="px-2 py-1 bg-ds-info-soft text-ds-info-text text-xs font-semibold rounded-full">
                              {encounter.encounter_type}
                            </span>
                          </div>
                          <p className="text-sm text-ds-text-secondary mb-1">
                            <strong>Chief Complaint:</strong> {encounter.chief_complaint || 'N/A'}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-ds-text-muted">Provider: {encounter.provider_name}</p>
                            {formatVisitDuration(encounter) && (
                              <p className="text-xs text-ds-info-text font-medium flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatVisitDuration(encounter)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Medications */}
                <div className="bg-gradient-to-br from-ds-success-soft to-ds-success-soft rounded-ds-card p-6 border border-ds-success/30">
                  <h2 className="text-xl font-bold text-ds-text mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-ds-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Active Medications
                  </h2>
                  {active_medications.filter((m) => m.is_active).length === 0 ? (
                    <div className="text-center py-8 text-ds-text-muted">
                      <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      <p className="text-sm font-medium">No active medications</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {active_medications.filter((m) => m.is_active).map((medication, idx) => (
                        <div key={`${medication.source}-${medication.id}-${idx}`} className="bg-ds-surface rounded-lg p-4 border border-ds-success/30 shadow-ds-card">
                          <p className="font-bold text-ds-text">{medication.medication_name}</p>
                          <p className="text-sm text-ds-text-secondary mt-1">
                            {medication.dosage} - {medication.frequency}
                          </p>
                          {medication.route && (
                            <p className="text-xs text-ds-text-muted mt-1">Route: {medication.route}</p>
                          )}
                          {medication.dispensed_date ? (
                            <p className="text-xs text-ds-success-text font-medium mt-2">
                              Dispensed: {safeFormatDate(medication.dispensed_date, 'MMM d, yyyy')}
                            </p>
                          ) : medication.start_date ? (
                            <p className="text-xs text-ds-success-text font-medium mt-2">
                              Ordered: {safeFormatDate(medication.start_date, 'MMM d, yyyy')}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </div>
            )}

            {activeTab === 'encounters' && (
              <div>
                <h2 className="text-xl font-bold text-ds-text mb-6">Previous Visits</h2>
                {recent_encounters.length === 0 ? (
                  <div className="text-center py-12 text-ds-text-muted">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-lg font-medium">No previous visits recorded</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {recent_encounters.map((encounter) => {
                      const isVisitOpen = expandedVisit === encounter.id;
                      return (
                      <div key={encounter.id} className="bg-gradient-to-r from-ds-subtle to-white rounded-ds-card border border-ds-border p-6 shadow-ds-card">
                        <div
                          className="flex justify-between items-start mb-4 cursor-pointer"
                          onClick={() => setExpandedVisit(isVisitOpen ? null : encounter.id)}
                        >
                          <div>
                            <h3 className="text-lg font-bold text-ds-text flex items-center gap-2">
                              <svg className={`w-4 h-4 text-ds-text-muted transition-transform ${isVisitOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {safeFormatDate(encounter.encounter_date, 'EEEE, MMMM d, yyyy')}
                            </h3>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <p className="text-sm text-ds-text-secondary">Provider: {encounter.provider_name}</p>
                              {formatVisitDuration(encounter) && (
                                <span className="text-sm text-ds-info-text font-medium flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Duration: {formatVisitDuration(encounter)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="px-4 py-1.5 bg-gradient-to-r from-ds-info to-ds-info text-white text-sm font-semibold rounded-full dark:from-ds-info-soft dark:to-ds-info-soft">
                            {encounter.encounter_type || 'General'}
                          </span>
                        </div>

                        {isVisitOpen && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {encounter.chief_complaint && (
                            <div className="bg-ds-info-soft rounded-lg p-4 border border-ds-info/30">
                              <p className="text-xs font-semibold text-ds-info-text uppercase tracking-wider mb-1">Chief Complaint</p>
                              <p className="text-sm text-ds-text">{encounter.chief_complaint}</p>
                            </div>
                          )}

                          {encounter.vital_signs && (
                            <div className="bg-ds-success-soft rounded-lg p-4 border border-ds-success/30">
                              <p className="text-xs font-semibold text-ds-success-text uppercase tracking-wider mb-2">Vital Signs</p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                {encounter.vital_signs.blood_pressure_systolic && (
                                  <p className="text-ds-text-secondary">
                                    <span className="font-medium">BP:</span> {encounter.vital_signs.blood_pressure_systolic}/{encounter.vital_signs.blood_pressure_diastolic}
                                  </p>
                                )}
                                {encounter.vital_signs.heart_rate && (
                                  <p className="text-ds-text-secondary">
                                    <span className="font-medium">HR:</span> {encounter.vital_signs.heart_rate} bpm
                                  </p>
                                )}
                                {encounter.vital_signs.temperature && (
                                  <p className="text-ds-text-secondary">
                                    <span className="font-medium">Temp:</span> {encounter.vital_signs.temperature}°{encounter.vital_signs.temperature_unit || 'F'}
                                  </p>
                                )}
                                {encounter.vital_signs.oxygen_saturation && (
                                  <p className="text-ds-text-secondary">
                                    <span className="font-medium">SpO2:</span> {encounter.vital_signs.oxygen_saturation}%
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {encounter.hp_sections && encounter.hp_sections.length > 0 && (() => {
                            // Render SOAP sections in the same clinical order
                            // the doctor enters them in (HPAccordion), not the
                            // alphabetical order the API returns. Unknown
                            // section_ids fall through to the bottom in their
                            // original relative order.
                            const SOAP_ORDER = [
                              'chief_complaint',
                              'hpi',
                              'past_medical_history',
                              'past_surgical_history',
                              'health_maintenance',
                              'immunization_history',
                              'home_medications',
                              'allergies',
                              'social_history',
                              'family_history',
                              'primary_care_provider',
                              'review_of_systems',
                              'vital_signs',
                              'physical_exam',
                              'lab_results',
                              'imaging_results',
                              'assessment',
                              'plan',
                            ];
                            const orderIndex = (id: string) => {
                              const i = SOAP_ORDER.indexOf(id);
                              return i === -1 ? SOAP_ORDER.length : i;
                            };
                            const sorted = [...encounter.hp_sections]
                              .filter((hp: any) => hp.content && hp.content.trim())
                              .sort((a: any, b: any) => orderIndex(a.section_id) - orderIndex(b.section_id));
                            return (
                              <div className="bg-ds-info-soft rounded-lg p-4 border border-ds-info/30 md:col-span-2">
                                <p className="text-xs font-semibold text-ds-info-text uppercase tracking-wider mb-3">SOAP / History & Physical</p>
                                <div className="space-y-2">
                                  {sorted.map((hp: any) => (
                                    <div key={hp.section_id} className="border-l-2 border-ds-info/30 pl-3">
                                      <span className="text-xs font-bold text-ds-info-text capitalize">
                                        {hp.section_id.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                                      </span>
                                      <p className="text-sm text-ds-text whitespace-pre-wrap mt-0.5">{hp.content}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {encounter.diagnoses && encounter.diagnoses.length > 0 && (
                            <div className="bg-ds-critical-soft rounded-lg p-4 border border-ds-critical-border md:col-span-2">
                              <p className="text-xs font-semibold text-ds-critical-text uppercase tracking-wider mb-2">Diagnoses</p>
                              <div className="space-y-1">
                                {encounter.diagnoses.map((dx: any) => (
                                  <div key={dx.id} className="flex items-center gap-2 text-sm">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${dx.type === 'primary' ? 'bg-ds-critical-soft text-ds-critical-text' : 'bg-ds-border text-ds-text-secondary'}`}>
                                      {dx.type}
                                    </span>
                                    <span className="text-ds-text">{dx.diagnosis_description}</span>
                                    {dx.diagnosis_code && <span className="text-ds-text-muted text-xs">({dx.diagnosis_code})</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {encounter.clinical_notes && encounter.clinical_notes.length > 0 && (
                            <div className="bg-ds-subtle rounded-lg p-4 border border-ds-border md:col-span-2">
                              <p className="text-xs font-semibold text-ds-brand-plum uppercase tracking-wider mb-2">Clinical Notes</p>
                              <div className="space-y-3">
                                {encounter.clinical_notes.map((note: any) => (
                                  <div key={note.id} className="border-l-2 border-ds-border pl-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-ds-brand-plum capitalize">{note.note_type.replace(/_/g, ' ')}</span>
                                      <span className="text-xs text-ds-text-muted">by {note.author_name}</span>
                                    </div>
                                    <p className="text-sm text-ds-text whitespace-pre-wrap">{note.content}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {encounter.assessment && (
                            <div className="bg-ds-warning-soft rounded-lg p-4 border border-ds-warning-border md:col-span-2">
                              <p className="text-xs font-semibold text-ds-warning-text uppercase tracking-wider mb-1">Assessment</p>
                              <p className="text-sm text-ds-text">{encounter.assessment}</p>
                            </div>
                          )}

                          {encounter.plan && (
                            <div className="bg-ds-accent-soft rounded-lg p-4 border border-ds-border md:col-span-2">
                              <p className="text-xs font-semibold text-ds-accent-text uppercase tracking-wider mb-1">Plan</p>
                              <p className="text-sm text-ds-text">{encounter.plan}</p>
                            </div>
                          )}

                          {encounter.prescriptions && encounter.prescriptions.length > 0 && (
                            <div className="bg-ds-accent-soft rounded-lg p-4 border border-ds-accent/30 md:col-span-2">
                              <p className="text-xs font-semibold text-ds-accent-text uppercase tracking-wider mb-2">Prescriptions</p>
                              <div className="space-y-1">
                                {encounter.prescriptions.map((rx: any) => (
                                  <div key={rx.id} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-ds-text">{rx.medication_name}</span>
                                      {rx.dosage && <span className="text-ds-text-muted">{rx.dosage}</span>}
                                      {rx.frequency && <span className="text-ds-text-muted">- {rx.frequency}</span>}
                                      {rx.route && <span className="text-ds-text-muted text-xs">({rx.route})</span>}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      rx.status === 'dispensed' || rx.status === 'completed' ? 'bg-ds-success-soft text-ds-success-text' :
                                      rx.status === 'cancelled' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                      'bg-ds-warning-soft text-ds-warning-text'
                                    }`}>
                                      {rx.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Addenda — append-only follow-up notes for this visit */}
                          <EncounterAddenda encounterId={encounter.id} canAdd={canAddAddendum} />
                        </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'medications' && (
              <div>
                <h2 className="text-xl font-bold text-ds-text mb-6">Medications</h2>

                {/* AI drug-interaction screen across the full medication list
                    (prescribed/dispensed + home meds from the SOAP note) */}
                {interactionsLoading ? (
                  <div className="mb-6 flex items-center gap-2 text-sm text-ds-text-muted">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Screening medications for interactions…
                  </div>
                ) : interactions.length > 0 ? (
                  <div className="mb-6 rounded-ds-card border border-ds-critical-border bg-ds-critical-soft overflow-hidden">
                    <div className="px-5 py-3 bg-ds-critical-soft border-b border-ds-critical-border flex items-center gap-2">
                      <svg className="w-5 h-5 text-ds-critical-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <h3 className="font-bold text-ds-critical-text">
                        {interactions.length} potential drug interaction{interactions.length > 1 ? 's' : ''} detected
                      </h3>
                      {interactionData.aiAvailable && (
                        <span className="ml-auto text-xs font-medium text-ds-critical-text bg-ds-critical-soft/60 px-2 py-0.5 rounded-full">AI-screened</span>
                      )}
                    </div>
                    {interactionData.summary && (
                      <p className="px-5 pt-3 text-sm text-ds-critical-text">{interactionData.summary}</p>
                    )}
                    <div className="divide-y divide-ds-critical-border">
                      {interactions.map((it, i) => {
                        const sev = (it.severity || '').toLowerCase();
                        const sevClass = sev === 'contraindicated' || sev === 'major' || sev === 'severe'
                          ? 'bg-ds-critical text-white'
                          : sev === 'moderate'
                          ? 'bg-ds-warning text-white dark:text-ds-canvas'
                          : 'bg-ds-warning-soft text-ds-warning-text';
                        return (
                          <div key={i} className="px-5 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-ds-text">{it.drug1}</span>
                              <span className="text-ds-text-muted">+</span>
                              <span className="font-semibold text-ds-text">{it.drug2}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${sevClass}`}>{it.severity}</span>
                              <div className="ml-auto">
                                <InteractionExplainButton
                                  drug1={it.drug1}
                                  drug2={it.drug2}
                                  existingInteraction={{ severity: it.severity, description: it.description }}
                                />
                              </div>
                            </div>
                            {it.description && <p className="text-sm text-ds-text-secondary mt-1">{it.description}</p>}
                            {it.recommendation && <p className="text-sm text-ds-critical-text mt-1"><strong>Action:</strong> {it.recommendation}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : interactionData.loaded && interactionData.aiAvailable && active_medications.length + (summary.documented_medications ? 1 : 0) >= 1 ? (
                  <div className="mb-6 rounded-lg border border-ds-success/30 bg-ds-success-soft px-4 py-2.5 flex items-center gap-2 text-sm text-ds-success-text">
                    <svg className="w-4 h-4 text-ds-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    No significant drug interactions detected across the current medication list.
                  </div>
                ) : null}

                {active_medications.length === 0 && !summary.documented_medications ? (
                  <div className="text-center py-12 text-ds-text-muted">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <p className="text-lg font-medium">No medications on record</p>
                  </div>
                ) : (
                  <>
                  {active_medications.length > 0 && (
                  <div className="overflow-hidden rounded-ds-card border border-ds-border">
                    <table className="min-w-full divide-y divide-ds-border">
                      <thead className="bg-gradient-to-r from-ds-subtle to-ds-subtle">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Medication
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Dosage
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Frequency
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Ordered
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Dispensed
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Prescriber
                          </th>
                          <th className="px-6 py-4 text-right text-xs font-bold text-ds-text-secondary uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-ds-surface divide-y divide-ds-border">
                        {active_medications.map((medication, index) => (
                          <tr key={`${medication.source}-${medication.id}-${index}`} className={index % 2 === 0 ? 'bg-ds-surface' : 'bg-ds-subtle'}>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-ds-text">{medication.medication_name}</span>
                              {medication.route && <span className="ml-2 text-xs text-ds-text-muted">{medication.route}</span>}
                            </td>
                            <td className="px-6 py-4 text-sm text-ds-text-secondary">{medication.dosage || '—'}</td>
                            <td className="px-6 py-4 text-sm text-ds-text-secondary">{medication.frequency || '—'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full capitalize ${
                                medication.status === 'dispensed' || medication.status === 'completed'
                                  ? 'bg-ds-success-soft text-ds-success-text'
                                  : medication.status === 'active'
                                  ? 'bg-ds-success-soft text-ds-success-text'
                                  : 'bg-ds-warning-soft text-ds-warning-text'
                              }`}>
                                {medication.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-ds-text-secondary">
                              {medication.start_date ? safeFormatDate(medication.start_date, 'MMM d, yyyy') : '—'}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {medication.dispensed_date ? (
                                <span className="text-ds-success-text font-medium">{safeFormatDate(medication.dispensed_date, 'MMM d, yyyy')}</span>
                              ) : (
                                <span className="text-ds-text-muted">Not dispensed</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-ds-text-secondary">
                              {medication.provider || medication.prescribing_doctor_name || '—'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {medication.source === 'medication' ? (
                                <button
                                  onClick={() => handleDiscontinueMedication(medication.id, medication.medication_name)}
                                  className="min-h-ds-touch px-3 py-1 text-xs font-semibold text-ds-critical-text bg-ds-critical-soft border border-ds-critical-border rounded-lg hover:bg-ds-critical-soft transition-colors"
                                >
                                  Discontinue
                                </button>
                              ) : (
                                <span className="text-xs text-ds-text-muted">Pharmacy</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                  {summary.documented_medications && (
                    <div className="mt-6 rounded-ds-card border border-ds-info/30 bg-ds-info-soft p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-ds-info-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="font-bold text-ds-info-text">Home Medications (documented in notes)</h3>
                        <span className="ml-auto text-xs text-ds-info-text">
                          Recorded {safeFormatDate(summary.documented_medications.encounter_date, 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-sm text-ds-info-text whitespace-pre-wrap">{summary.documented_medications.content}</p>
                      <p className="text-xs text-ds-info-text mt-2">These were entered as free text in the SOAP note and have not been prescribed/dispensed in the system.</p>
                    </div>
                  )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'appointments' && (
              <div>
                <h2 className="text-xl font-bold text-ds-text mb-6">Upcoming Appointments</h2>
                {upcoming_appointments.length === 0 ? (
                  <div className="text-center py-12 text-ds-text-muted">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg font-medium">No upcoming appointments</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {upcoming_appointments.map((appointment) => (
                      <div key={appointment.id} className="bg-gradient-to-br from-ds-subtle to-ds-info-soft rounded-ds-card p-5 border border-ds-border shadow-ds-card">
                        <div className="flex justify-between items-start mb-3">
                          <div className="bg-ds-accent text-ds-on-accent px-3 py-1 rounded-lg text-sm font-bold">
                            {safeFormatDate(appointment.appointment_date, 'MMM d')}
                          </div>
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                            appointment.status === 'scheduled'
                              ? 'bg-ds-info-soft text-ds-info-text'
                              : 'bg-ds-success-soft text-ds-success-text'
                          }`}>
                            {appointment.status}
                          </span>
                        </div>
                        <p className="font-semibold text-ds-text mb-1">
                          {safeFormatDate(appointment.appointment_date, 'h:mm a')}
                        </p>
                        <p className="text-sm text-ds-text-secondary mb-2">
                          Duration: {appointment.duration_minutes} minutes
                        </p>
                        <p className="text-sm text-ds-text-secondary">
                          Provider: {appointment.provider_name}
                        </p>
                        {appointment.reason && (
                          <p className="text-sm text-ds-brand-plum mt-3 pt-3 border-t border-ds-border">
                            <strong>Reason:</strong> {appointment.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'labs' && (
              <div>
                <h2 className="text-xl font-bold text-ds-text mb-6">Lab Results History</h2>
                {labsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-ds-info"></div>
                    <p className="mt-2 text-ds-text-muted">Loading lab results...</p>
                  </div>
                ) : labResults.length === 0 ? (
                  <div className="text-center py-12 text-ds-text-muted">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <p className="text-lg font-medium">No lab results found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {labResults.map((lab) => (
                      <div key={lab.id} className={`bg-ds-surface rounded-ds-card border shadow-ds-card overflow-hidden ${
                        lab.status === 'completed' ? 'border-ds-success/30' : 'border-ds-warning-border'
                      }`}>
                        <div className={`px-6 py-3 ${
                          lab.status === 'completed'
                            ? 'bg-gradient-to-r from-ds-success-soft to-ds-success-soft'
                            : 'bg-gradient-to-r from-ds-warning-soft to-ds-warning-soft'
                        }`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-ds-text">{lab.test_name}</h3>
                              {lab.test_code && (
                                <span className="text-xs text-ds-text-muted bg-ds-subtle px-2 py-0.5 rounded">
                                  {lab.test_code}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                lab.priority === 'stat'
                                  ? 'bg-ds-critical-soft text-ds-critical-text border border-ds-critical-border'
                                  : lab.priority === 'urgent'
                                    ? 'bg-ds-warning-soft text-ds-warning-text border border-ds-warning-border'
                                    : 'bg-ds-subtle text-ds-text-secondary'
                              }`}>
                                {lab.priority.toUpperCase()}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                lab.status === 'completed'
                                  ? 'bg-ds-success-soft text-ds-success-text'
                                  : lab.status === 'in_progress'
                                    ? 'bg-ds-info-soft text-ds-info-text'
                                    : 'bg-ds-warning-soft text-ds-warning-text'
                              }`}>
                                {lab.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-ds-text-muted">Ordered:</span>
                              <span className="ml-2 font-medium text-ds-text">
                                {safeFormatDate(lab.ordered_at, 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            <div>
                              <span className="text-ds-text-muted">Encounter:</span>
                              <span className="ml-2 font-medium text-ds-text">{lab.encounter_number}</span>
                            </div>
                            <div>
                              <span className="text-ds-text-muted">Provider:</span>
                              <span className="ml-2 font-medium text-ds-text">{lab.ordering_provider_name}</span>
                            </div>
                            {lab.results_available_at && (
                              <div>
                                <span className="text-ds-text-muted">Results:</span>
                                <span className="ml-2 font-medium text-ds-text">
                                  {safeFormatDate(lab.results_available_at, 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                            )}
                          </div>

                          {lab.results && lab.results.trim() && (
                            <div className="bg-ds-success-soft rounded-lg p-4 border border-ds-success/30">
                              <h4 className="text-sm font-bold text-ds-success-text mb-2">Results:</h4>
                              {/* Structured results are stored as {parameter_code: value} JSON.
                                  Printing the raw string dumped things like
                                  {"HBA1C_NGSP":"8.2","HBA1C_IFCC":"66"} on screen. LabResultsInline
                                  renders the parameter names, units, reference ranges and
                                  abnormal flags, and falls through to plain text for
                                  single-value or legacy results. */}
                              <LabResultsInline result={lab.results} orderId={lab.id} />
                            </div>
                          )}

                          {/* Status = completed but no result text AND no file — make the gap explicit so the doctor knows the lab tech still needs to record values */}
                          {lab.status === 'completed' && (!lab.results || !lab.results.trim()) && !lab.result_document_id && (
                            <div className="bg-ds-warning-soft border border-ds-warning-border rounded-lg p-3 flex items-start gap-2">
                              <svg className="w-5 h-5 text-ds-warning-text flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0l-6.93 12a2 2 0 001.74 3z" />
                              </svg>
                              <div className="text-sm">
                                <p className="font-semibold text-ds-warning-text">Result data not entered yet</p>
                                <p className="text-ds-warning-text text-xs mt-0.5">
                                  The lab marked this test completed but didn&apos;t record the value or upload a file.
                                  Ask the lab tech to open this order and enter the result.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Uploaded result file (PDF/image) — separate from inline text */}
                          {lab.result_document_id && (
                            <div className={`${lab.results ? 'mt-3' : ''} bg-ds-info-soft rounded-lg p-3 border border-ds-info/30 flex items-center justify-between gap-3`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <svg className="w-5 h-5 text-ds-info-text flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-sm font-medium text-ds-info-text truncate">
                                  {lab.result_document_name || 'Attached result file'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await apiClient.get(`/documents/${lab.result_document_id}`);
                                    // Server returns { document: { file_data: 'data:<mime>;base64,...', ... } }
                                    const doc = res.data?.document;
                                    const fileData: string | undefined = doc?.file_data;
                                    const fileType: string | undefined = doc?.file_type;
                                    const documentName: string | undefined = doc?.document_name;
                                    if (!fileData) {
                                      showToast(
                                        'File no longer accessible. Ask the lab tech to re-upload the result PDF for this test.',
                                        'error'
                                      );
                                      return;
                                    }
                                    const previewable = (fileType || '').startsWith('image/') || fileType === 'application/pdf';
                                    if (previewable) {
                                      const win = window.open();
                                      if (win) {
                                        win.document.write(
                                          `<title>${documentName || 'Lab Result'}</title>` +
                                            ((fileType || '').startsWith('image/')
                                              ? `<img src="${fileData}" style="max-width:100%;height:auto;" />`
                                              : `<iframe src="${fileData}" style="border:0;width:100vw;height:100vh;"></iframe>`)
                                        );
                                      }
                                    } else {
                                      const a = document.createElement('a');
                                      a.href = fileData;
                                      a.download = documentName || 'lab-result';
                                      a.click();
                                    }
                                  } catch (err: any) {
                                    showToast(err?.response?.data?.error || 'Failed to load file', 'error');
                                  }
                                }}
                                className="min-h-ds-touch flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-white dark:text-ds-canvas bg-ds-info rounded-lg hover:bg-ds-info/90"
                              >
                                View file
                              </button>
                            </div>
                          )}

                          {lab.notes && (
                            <div className="mt-3 bg-ds-subtle rounded-lg p-3 border border-ds-border">
                              <span className="text-sm font-medium text-ds-text-secondary">Notes:</span>
                              <p className="text-sm text-ds-text mt-1">{lab.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'imaging' && (
              <div>
                <h2 className="text-xl font-bold text-ds-text mb-6">Imaging Results</h2>
                {imagingResults.length === 0 ? (
                  <div className="text-center py-12 text-ds-text-muted">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    <p className="text-lg font-medium">No imaging orders</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {imagingResults.map((img) => (
                      <div key={img.id} className="bg-ds-surface rounded-ds-card border border-ds-border overflow-hidden shadow-ds-card">
                        <div className={`px-6 py-3 ${
                          img.status === 'completed'
                            ? 'bg-gradient-to-r from-ds-success-soft to-ds-success-soft'
                            : img.status === 'in_progress'
                              ? 'bg-gradient-to-r from-ds-info-soft to-ds-info-soft'
                              : 'bg-gradient-to-r from-ds-subtle to-ds-subtle'
                        }`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-ds-text">{img.imaging_type}</h3>
                              {img.body_part && <span className="text-sm text-ds-text-secondary">- {img.body_part}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                img.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' :
                                img.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' :
                                'bg-ds-subtle text-ds-text-secondary'
                              }`}>
                                {img.priority.toUpperCase()}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                img.status === 'completed' ? 'bg-ds-success-soft text-ds-success-text' :
                                img.status === 'in_progress' ? 'bg-ds-info-soft text-ds-info-text' :
                                'bg-ds-warning-soft text-ds-warning-text'
                              }`}>
                                {img.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-ds-text-muted">Ordered:</span>
                              <span className="ml-2 font-medium text-ds-text">
                                {safeFormatDate(img.ordered_date, 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            {img.completed_date && (
                              <div>
                                <span className="text-ds-text-muted">Completed:</span>
                                <span className="ml-2 font-medium text-ds-text">
                                  {safeFormatDate(img.completed_date, 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                            )}
                          </div>
                          {img.findings && (
                            <div className="bg-ds-success-soft rounded-lg p-4 border border-ds-success/30">
                              <h4 className="text-sm font-bold text-ds-success-text mb-2">Findings:</h4>
                              <p className="text-ds-text whitespace-pre-wrap">{img.findings}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'documents' && id && (
              <PatientDocumentsPanel patientId={Number(id)} />
            )}
          </div>
        </div>
      </div>

      {/* Vital Signs History Modal */}
      {showVitalSignsHistory && patient && (
        <VitalSignsHistory
          patientId={patient.id}
          onClose={() => setShowVitalSignsHistory(false)}
        />
      )}
      {/* Edit Patient Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-ds-border bg-gradient-to-r from-ds-accent-soft to-ds-accent-soft rounded-t-xl sticky top-0">
              <h3 className="text-lg font-bold text-ds-text">Edit Patient Information</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">First Name</label>
                  <input type="text" value={editData.first_name || ''} onChange={(e) => setEditData({ ...editData, first_name: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Last Name</label>
                  <input type="text" value={editData.last_name || ''} onChange={(e) => setEditData({ ...editData, last_name: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Phone</label>
                  <input type="text" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Email</label>
                  <input type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Date of Birth</label>
                  <input type="date" value={editData.date_of_birth || ''} onChange={(e) => setEditData({ ...editData, date_of_birth: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
                <AppSelect
                  label="Gender"
                  value={editData.gender || ''}
                  onChange={(val) => setEditData({ ...editData, gender: val })}
                  options={[{value:'',label:'Select'},{value:'male',label:'Male'},{value:'female',label:'Female'}]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ds-text-secondary mb-1">Address</label>
                <input type="text" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ds-text-secondary mb-1">City</label>
                <input type="text" value={editData.city || ''} onChange={(e) => setEditData({ ...editData, city: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ds-text-secondary mb-1">Allergies</label>
                <input type="text" value={editData.allergies || ''} onChange={(e) => setEditData({ ...editData, allergies: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" placeholder="e.g., Penicillin, Nuts" />
              </div>
              <h4 className="text-sm font-semibold text-ds-text-secondary pt-2 border-t">Emergency Contact</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Name</label>
                  <input type="text" value={editData.emergency_contact_name || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_name: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Phone</label>
                  <input type="text" value={editData.emergency_contact_phone || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_phone: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">Relationship</label>
                  <input type="text" value={editData.emergency_contact_relationship || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_relationship: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
              </div>
              <h4 className="text-sm font-semibold text-ds-text-secondary pt-2 border-t">Primary Care Physician</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">PCP Name</label>
                  <input type="text" value={editData.pcp_name || ''} onChange={(e) => setEditData({ ...editData, pcp_name: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ds-text-secondary mb-1">PCP Phone</label>
                  <input type="text" value={editData.pcp_phone || ''} onChange={(e) => setEditData({ ...editData, pcp_phone: e.target.value })} className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring" />
                </div>
              </div>
              <h4 className="text-sm font-semibold text-ds-text-secondary pt-2 border-t">Insurance & Billing</h4>
              <div className="grid grid-cols-2 gap-4">
                <AppSelect
                  label="Payer Type"
                  value={editPayerType}
                  onChange={(val) => { setEditPayerType(val); setEditPayerId(null); }}
                  options={[{value:'self_pay',label:'Self Pay'},{value:'corporate',label:'Corporate / Employer'},{value:'insurance',label:'Health Insurance'},{value:'staff',label:'Staff (Hospital Employee)'}]}
                />
                {editPayerType === 'corporate' && (
                  <AppSelect
                    label="Corporate Client"
                    value={editPayerId ?? ''}
                    onChange={(val) => setEditPayerId(val ? Number(val) : null)}
                    options={[{value:'',label:'Select corporate client'}, ...corporateClients.map((cc) => ({value:cc.id,label:cc.name}))]}
                  />
                )}
                {editPayerType === 'insurance' && (
                  <AppSelect
                    label="Insurance Provider"
                    value={editPayerId ?? ''}
                    onChange={(val) => setEditPayerId(val ? Number(val) : null)}
                    options={[{value:'',label:'Select insurance provider'}, ...insuranceProviders.map((ip) => ({value:ip.id,label:ip.name}))]}
                  />
                )}
                {editPayerType === 'staff' && (
                  <div>
                    <label className="block text-sm font-medium text-ds-text-secondary mb-1">Annual staff package (GHS)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editStaffLimit}
                      onChange={(e) => setEditStaffLimit(e.target.value)}
                      placeholder="e.g. 1000"
                      className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm"
                    />
                    {staffBenefit && (
                      <p className="text-xs text-ds-text-muted mt-1">
                        Used GHS {staffBenefit.used.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Remaining GHS {staffBenefit.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} this year
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-ds-border bg-ds-subtle rounded-b-ds-card flex gap-3 justify-end sticky bottom-0">
              <button onClick={() => setShowEditModal(false)} className="min-h-ds-touch px-4 py-2 text-ds-text-secondary font-semibold hover:bg-ds-border rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="min-h-ds-touch px-6 py-2 bg-ds-accent text-ds-on-accent font-semibold rounded-lg hover:bg-ds-accent-hover transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default PatientDetails;
