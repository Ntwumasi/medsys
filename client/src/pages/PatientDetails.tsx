import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { patientsAPI } from '../api/patients';
import { patientPortalAPI } from '../api/patientPortal';
import apiClient from '../api/client';
import type { PatientSummary } from '../types';
import { format } from 'date-fns';
import VitalSignsHistory from '../components/VitalSignsHistory';
import AppLayout from '../components/AppLayout';
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
    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 md:col-span-2 mt-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
          Addenda {list.length > 0 && <span className="text-blue-400 font-normal normal-case">({list.length})</span>}
        </p>
        {canAdd && !adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setDraft(''); }}
            className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-100"
          >
            + Add Addendum
          </button>
        )}
      </div>
      {list.length === 0 && !adding && (
        <p className="text-xs text-blue-400 italic">No addenda. Add one for follow-up notes after labs / imaging come back.</p>
      )}
      {list.length > 0 && (
        <ol className="space-y-2">
          {list.map((a, idx) => (
            <li key={a.id} className="bg-white rounded p-2 border border-blue-100">
              <div className="flex items-center justify-between text-[11px] text-blue-700 font-medium mb-1">
                <span>#{idx + 1} — {a.created_by_role === 'doctor' ? 'Dr. ' : ''}{a.created_by_name}</span>
                <span>{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{a.content}</p>
            </li>
          ))}
        </ol>
      )}
      {adding && (
        <div className="mt-2 bg-white rounded p-2 border border-blue-300">
          <textarea
            rows={3}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Lab results received — FBS normal. No change to plan."
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[11px] text-gray-400 mt-1">Append-only. Once saved, this can't be edited.</p>
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <button type="button" onClick={() => { setAdding(false); setDraft(''); }} disabled={saving}
              className="px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !draft.trim()}
              className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-60">
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'overview' | 'encounters' | 'medications' | 'appointments' | 'vitals' | 'labs' | 'imaging' | null) || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'encounters' | 'medications' | 'appointments' | 'vitals' | 'labs' | 'imaging'>(initialTab);
  const [showVitalSignsHistory, setShowVitalSignsHistory] = useState(false);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [labsLoading, setLabsLoading] = useState(false);
  const [imagingResults, setImagingResults] = useState<Array<{id: number; imaging_type: string; body_part?: string; priority: string; status: string; ordered_date: string; completed_date?: string; findings?: string; ordering_provider_name?: string}>>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editPayerType, setEditPayerType] = useState<string>('self_pay');
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
    user?.role === 'receptionist' || user?.role === 'admin' || user?.is_super_admin === true;
  const [sendingLink, setSendingLink] = useState(false);
  const [expandedVisit, setExpandedVisit] = useState<number | null>(null);

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

  useEffect(() => {
    if (id) {
      loadPatientSummary(parseInt(id));
      loadLabResults(parseInt(id));
      loadImagingResults(parseInt(id));
      loadAiSummary(parseInt(id));
    }
  }, [id]);

  const loadImagingResults = async (patientId: number) => {
    try {
      const response = await apiClient.get(`/orders/imaging?patient_id=${patientId}`);
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

  const loadLabResults = async (patientId: number) => {
    setLabsLoading(true);
    try {
      const response = await apiClient.get(`/orders/lab?patient_id=${patientId}`);
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
      setSummary(data);
    } catch (error) {
      console.error('Error loading patient summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAiSummary = async (patientId: number) => {
    setAiSummaryLoading(true);
    try {
      const { data } = await apiClient.get(`/patients/${patientId}/ai-summary`);
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
      mild: 'bg-yellow-100 text-yellow-800',
      moderate: 'bg-orange-100 text-orange-800',
      severe: 'bg-red-100 text-red-800',
    };
    return colors[severity || ''] || 'bg-gray-100 text-gray-800';
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
      <AppLayout title="Patient Details">
        <Card>
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-600">Loading patient information...</p>
          </div>
        </Card>
      </AppLayout>
    );
  }

  if (!summary) {
    return (
      <AppLayout title="Patient Details">
        <Card>
          <EmptyState
            title="Patient not found"
            description="The patient you're looking for doesn't exist or has been removed."
            icon={
              <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  return (
    <AppLayout title={`${patient.first_name} ${patient.last_name}`}>
      <div className="space-y-6">

        {((patient as any).source === 'carecode' || patient.patient_number?.startsWith('CC-')) && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-amber-800">
              <span className="font-semibold">Imported from CareCode (legacy system).</span> This record may duplicate a native MedSys record. Check for a matching patient and ask an admin to merge them under <span className="font-medium">Patients → Review Duplicates</span>.
            </div>
          </div>
        )}

        {/* Patient Info Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="flex justify-end gap-2 mb-2">
            {canSendPortalLink && (
              <button
                onClick={handleSendPortalLink}
                disabled={sendingLink}
                className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-2 disabled:opacity-50"
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
              className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Patient
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Demographics
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Age:</span>
                  <span className="font-semibold text-gray-900">{calculateAge(patient.date_of_birth)} years</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Gender:</span>
                  <span className="font-semibold text-gray-900 capitalize">{patient.gender}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Allergies:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded ${patient.allergies ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}`}>
                    {patient.allergies || 'None reported'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">DOB:</span>
                  <span className="font-semibold text-gray-900">{format(new Date(patient.date_of_birth), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Contact Information
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Phone:</span>
                  <span className="font-semibold text-gray-900">{patient.phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Email:</span>
                  <span className="font-semibold text-gray-900 text-sm">{patient.email || 'N/A'}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-gray-500 text-sm w-24">Address:</span>
                  <span className="font-semibold text-gray-900">
                    {patient.address || 'N/A'}
                    {patient.city && (
                      <span className="block text-gray-600">{patient.city}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Emergency Contact
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Name:</span>
                  <span className="font-semibold text-gray-900">{patient.emergency_contact_name || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Phone:</span>
                  <span className="font-semibold text-gray-900">{patient.emergency_contact_phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Relationship:</span>
                  <span className="font-semibold text-gray-900 capitalize">{patient.emergency_contact_relationship || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Insurance & Billing
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-gray-500 text-sm w-24">Payer:</span>
                  <div>
                    {summary.payer_sources && summary.payer_sources.length > 0 ? (
                      summary.payer_sources.map((ps) => (
                        <div key={ps.id} className="font-semibold text-gray-900 capitalize">
                          {ps.payer_type === 'corporate' ? ps.corporate_client_name :
                           ps.payer_type === 'insurance' ? ps.insurance_provider_name :
                           'Self Pay'}
                          {ps.is_primary && <span className="text-xs text-primary-500 ml-1">(Primary)</span>}
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-24">Balance:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded ${
                    (summary.outstanding_balance || 0) > 0 ? 'bg-danger-100 text-danger-800' : 'bg-success-100 text-success-800'
                  }`}>
                    {(summary.outstanding_balance || 0) > 0
                      ? `GH₵${Number(summary.outstanding_balance).toFixed(2)} owed`
                      : 'No balance'}
                  </span>
                </div>
                {patient.pcp_name && (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-24">PCP:</span>
                    <span className="font-semibold text-gray-900">{patient.pcp_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Allergies Alert */}
        {allergies.length > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="bg-red-500 p-2 rounded-lg">
                <svg className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-800">Known Allergies</h3>
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
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Previous Visits
                {recent_encounters.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{recent_encounters.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('medications')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'medications'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Medications
                {active_medications.length > 0 && (
                  <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded-full">{active_medications.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('appointments')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'appointments'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Appointments
                {upcoming_appointments.length > 0 && (
                  <span className="bg-secondary-600 text-white text-xs px-2 py-0.5 rounded-full">{upcoming_appointments.length}</span>
                )}
              </button>
              <button
                onClick={() => setShowVitalSignsHistory(true)}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'vitals'
                    ? 'border-red-600 text-red-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Lab Results
                {labResults.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{labResults.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('imaging')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${
                  activeTab === 'imaging'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Imaging
                {imagingResults.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{imagingResults.length}</span>
                )}
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* AI Patient Summary */}
                {(aiSummary || aiSummaryLoading) && (
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-200">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">AI Summary</p>
                        {aiSummaryLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin h-3 w-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
                            <span className="text-sm text-indigo-500">Generating summary...</span>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-800 leading-relaxed">{aiSummary}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Encounters Summary */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Recent Visits
                  </h2>
                  {recent_encounters.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium">No previous visits recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recent_encounters.slice(0, 3).map((encounter) => (
                        <div key={encounter.id} className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-bold text-gray-900">
                              {format(new Date(encounter.encounter_date), 'MMM d, yyyy')}
                            </p>
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                              {encounter.encounter_type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-1">
                            <strong>Chief Complaint:</strong> {encounter.chief_complaint || 'N/A'}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500">Provider: {encounter.provider_name}</p>
                            {formatVisitDuration(encounter) && (
                              <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
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
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-100">
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Active Medications
                  </h2>
                  {active_medications.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      <p className="text-sm font-medium">No active medications</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {active_medications.map((medication) => (
                        <div key={medication.id} className="bg-white rounded-lg p-4 border border-emerald-200 shadow-sm">
                          <p className="font-bold text-gray-900">{medication.medication_name}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {medication.dosage} - {medication.frequency}
                          </p>
                          {medication.route && (
                            <p className="text-xs text-gray-500 mt-1">Route: {medication.route}</p>
                          )}
                          <p className="text-xs text-emerald-600 font-medium mt-2">
                            Started: {format(new Date(medication.start_date), 'MMM d, yyyy')}
                          </p>
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
                <h2 className="text-xl font-bold text-gray-900 mb-6">Previous Visits</h2>
                {recent_encounters.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
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
                      <div key={encounter.id} className="bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div
                          className="flex justify-between items-start mb-4 cursor-pointer"
                          onClick={() => setExpandedVisit(isVisitOpen ? null : encounter.id)}
                        >
                          <div>
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                              <svg className={`w-4 h-4 text-gray-400 transition-transform ${isVisitOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {format(new Date(encounter.encounter_date), 'EEEE, MMMM d, yyyy')}
                            </h3>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <p className="text-sm text-gray-600">Provider: {encounter.provider_name}</p>
                              {formatVisitDuration(encounter) && (
                                <span className="text-sm text-blue-700 font-medium flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Duration: {formatVisitDuration(encounter)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold rounded-full">
                            {encounter.encounter_type || 'General'}
                          </span>
                        </div>

                        {isVisitOpen && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {encounter.chief_complaint && (
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Chief Complaint</p>
                              <p className="text-sm text-gray-900">{encounter.chief_complaint}</p>
                            </div>
                          )}

                          {encounter.vital_signs && (
                            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Vital Signs</p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                {encounter.vital_signs.blood_pressure_systolic && (
                                  <p className="text-gray-700">
                                    <span className="font-medium">BP:</span> {encounter.vital_signs.blood_pressure_systolic}/{encounter.vital_signs.blood_pressure_diastolic}
                                  </p>
                                )}
                                {encounter.vital_signs.heart_rate && (
                                  <p className="text-gray-700">
                                    <span className="font-medium">HR:</span> {encounter.vital_signs.heart_rate} bpm
                                  </p>
                                )}
                                {encounter.vital_signs.temperature && (
                                  <p className="text-gray-700">
                                    <span className="font-medium">Temp:</span> {encounter.vital_signs.temperature}°{encounter.vital_signs.temperature_unit || 'F'}
                                  </p>
                                )}
                                {encounter.vital_signs.oxygen_saturation && (
                                  <p className="text-gray-700">
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
                              <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100 md:col-span-2">
                                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3">SOAP / History & Physical</p>
                                <div className="space-y-2">
                                  {sorted.map((hp: any) => (
                                    <div key={hp.section_id} className="border-l-2 border-indigo-300 pl-3">
                                      <span className="text-xs font-bold text-indigo-700 capitalize">
                                        {hp.section_id.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                                      </span>
                                      <p className="text-sm text-gray-900 whitespace-pre-wrap mt-0.5">{hp.content}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {encounter.diagnoses && encounter.diagnoses.length > 0 && (
                            <div className="bg-rose-50 rounded-lg p-4 border border-rose-100 md:col-span-2">
                              <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">Diagnoses</p>
                              <div className="space-y-1">
                                {encounter.diagnoses.map((dx: any) => (
                                  <div key={dx.id} className="flex items-center gap-2 text-sm">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${dx.type === 'primary' ? 'bg-rose-200 text-rose-800' : 'bg-gray-200 text-gray-700'}`}>
                                      {dx.type}
                                    </span>
                                    <span className="text-gray-900">{dx.diagnosis_description}</span>
                                    {dx.diagnosis_code && <span className="text-gray-400 text-xs">({dx.diagnosis_code})</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {encounter.clinical_notes && encounter.clinical_notes.length > 0 && (
                            <div className="bg-purple-50 rounded-lg p-4 border border-purple-100 md:col-span-2">
                              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Clinical Notes</p>
                              <div className="space-y-3">
                                {encounter.clinical_notes.map((note: any) => (
                                  <div key={note.id} className="border-l-2 border-purple-300 pl-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-purple-700 capitalize">{note.note_type.replace(/_/g, ' ')}</span>
                                      <span className="text-xs text-gray-400">by {note.author_name}</span>
                                    </div>
                                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {encounter.assessment && (
                            <div className="bg-amber-50 rounded-lg p-4 border border-amber-100 md:col-span-2">
                              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Assessment</p>
                              <p className="text-sm text-gray-900">{encounter.assessment}</p>
                            </div>
                          )}

                          {encounter.plan && (
                            <div className="bg-secondary-50 rounded-lg p-4 border border-secondary-100 md:col-span-2">
                              <p className="text-xs font-semibold text-secondary-600 uppercase tracking-wider mb-1">Plan</p>
                              <p className="text-sm text-gray-900">{encounter.plan}</p>
                            </div>
                          )}

                          {encounter.prescriptions && encounter.prescriptions.length > 0 && (
                            <div className="bg-teal-50 rounded-lg p-4 border border-teal-100 md:col-span-2">
                              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-2">Prescriptions</p>
                              <div className="space-y-1">
                                {encounter.prescriptions.map((rx: any) => (
                                  <div key={rx.id} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-gray-900">{rx.medication_name}</span>
                                      {rx.dosage && <span className="text-gray-500">{rx.dosage}</span>}
                                      {rx.frequency && <span className="text-gray-500">- {rx.frequency}</span>}
                                      {rx.route && <span className="text-gray-400 text-xs">({rx.route})</span>}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      rx.status === 'dispensed' || rx.status === 'completed' ? 'bg-green-100 text-green-700' :
                                      rx.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                      'bg-yellow-100 text-yellow-700'
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
                <h2 className="text-xl font-bold text-gray-900 mb-6">Active Medications</h2>
                {active_medications.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <p className="text-lg font-medium">No active medications</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Medication
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Dosage
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Frequency
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Start Date
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Prescriber
                          </th>
                          <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {active_medications.map((medication, index) => (
                          <tr key={medication.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-gray-900">{medication.medication_name}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">{medication.dosage}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{medication.frequency}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {format(new Date(medication.start_date), 'MMM d, yyyy')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {medication.prescribing_doctor_name}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleDiscontinueMedication(medication.id, medication.medication_name)}
                                className="px-3 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                              >
                                Discontinue
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'appointments' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Upcoming Appointments</h2>
                {upcoming_appointments.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg font-medium">No upcoming appointments</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {upcoming_appointments.map((appointment) => (
                      <div key={appointment.id} className="bg-gradient-to-br from-secondary-50 to-indigo-50 rounded-xl p-5 border border-secondary-200 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="bg-secondary-600 text-white px-3 py-1 rounded-lg text-sm font-bold">
                            {format(new Date(appointment.appointment_date), 'MMM d')}
                          </div>
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                            appointment.status === 'scheduled'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {appointment.status}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-900 mb-1">
                          {format(new Date(appointment.appointment_date), 'h:mm a')}
                        </p>
                        <p className="text-sm text-gray-600 mb-2">
                          Duration: {appointment.duration_minutes} minutes
                        </p>
                        <p className="text-sm text-gray-600">
                          Provider: {appointment.provider_name}
                        </p>
                        {appointment.reason && (
                          <p className="text-sm text-secondary-700 mt-3 pt-3 border-t border-secondary-200">
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
                <h2 className="text-xl font-bold text-gray-900 mb-6">Lab Results History</h2>
                {labsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-500">Loading lab results...</p>
                  </div>
                ) : labResults.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <p className="text-lg font-medium">No lab results found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {labResults.map((lab) => (
                      <div key={lab.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                        lab.status === 'completed' ? 'border-emerald-200' : 'border-amber-200'
                      }`}>
                        <div className={`px-6 py-3 ${
                          lab.status === 'completed'
                            ? 'bg-gradient-to-r from-emerald-50 to-green-50'
                            : 'bg-gradient-to-r from-amber-50 to-yellow-50'
                        }`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-gray-900">{lab.test_name}</h3>
                              {lab.test_code && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                  {lab.test_code}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                lab.priority === 'stat'
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : lab.priority === 'urgent'
                                    ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                    : 'bg-gray-100 text-gray-600'
                              }`}>
                                {lab.priority.toUpperCase()}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                lab.status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : lab.status === 'in_progress'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}>
                                {lab.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-gray-500">Ordered:</span>
                              <span className="ml-2 font-medium text-gray-900">
                                {format(new Date(lab.ordered_at), 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Encounter:</span>
                              <span className="ml-2 font-medium text-gray-900">{lab.encounter_number}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Provider:</span>
                              <span className="ml-2 font-medium text-gray-900">{lab.ordering_provider_name}</span>
                            </div>
                            {lab.results_available_at && (
                              <div>
                                <span className="text-gray-500">Results:</span>
                                <span className="ml-2 font-medium text-gray-900">
                                  {format(new Date(lab.results_available_at), 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                            )}
                          </div>

                          {lab.results && lab.results.trim() && (
                            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                              <h4 className="text-sm font-bold text-emerald-800 mb-2">Results:</h4>
                              <p className="text-gray-900 whitespace-pre-wrap">{lab.results}</p>
                            </div>
                          )}

                          {/* Status = completed but no result text AND no file — make the gap explicit so the doctor knows the lab tech still needs to record values */}
                          {lab.status === 'completed' && (!lab.results || !lab.results.trim()) && !lab.result_document_id && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0l-6.93 12a2 2 0 001.74 3z" />
                              </svg>
                              <div className="text-sm">
                                <p className="font-semibold text-amber-900">Result data not entered yet</p>
                                <p className="text-amber-700 text-xs mt-0.5">
                                  The lab marked this test completed but didn&apos;t record the value or upload a file.
                                  Ask the lab tech to open this order and enter the result.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Uploaded result file (PDF/image) — separate from inline text */}
                          {lab.result_document_id && (
                            <div className={`${lab.results ? 'mt-3' : ''} bg-blue-50 rounded-lg p-3 border border-blue-200 flex items-center justify-between gap-3`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-sm font-medium text-blue-900 truncate">
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
                                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                              >
                                View file
                              </button>
                            </div>
                          )}

                          {lab.notes && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <span className="text-sm font-medium text-gray-600">Notes:</span>
                              <p className="text-sm text-gray-800 mt-1">{lab.notes}</p>
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
                <h2 className="text-xl font-bold text-gray-900 mb-6">Imaging Results</h2>
                {imagingResults.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    <p className="text-lg font-medium">No imaging orders</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {imagingResults.map((img) => (
                      <div key={img.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className={`px-6 py-3 ${
                          img.status === 'completed'
                            ? 'bg-gradient-to-r from-emerald-50 to-green-50'
                            : img.status === 'in_progress'
                              ? 'bg-gradient-to-r from-blue-50 to-sky-50'
                              : 'bg-gradient-to-r from-gray-50 to-slate-50'
                        }`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-gray-900">{img.imaging_type}</h3>
                              {img.body_part && <span className="text-sm text-gray-600">- {img.body_part}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                img.priority === 'stat' ? 'bg-red-100 text-red-700' :
                                img.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {img.priority.toUpperCase()}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                img.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                img.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {img.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-gray-500">Ordered:</span>
                              <span className="ml-2 font-medium text-gray-900">
                                {format(new Date(img.ordered_date), 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            {img.completed_date && (
                              <div>
                                <span className="text-gray-500">Completed:</span>
                                <span className="ml-2 font-medium text-gray-900">
                                  {format(new Date(img.completed_date), 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                            )}
                          </div>
                          {img.findings && (
                            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                              <h4 className="text-sm font-bold text-emerald-800 mb-2">Findings:</h4>
                              <p className="text-gray-900 whitespace-pre-wrap">{img.findings}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 rounded-t-xl sticky top-0">
              <h3 className="text-lg font-bold text-gray-900">Edit Patient Information</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input type="text" value={editData.first_name || ''} onChange={(e) => setEditData({ ...editData, first_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input type="text" value={editData.last_name || ''} onChange={(e) => setEditData({ ...editData, last_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" value={editData.date_of_birth || ''} onChange={(e) => setEditData({ ...editData, date_of_birth: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <AppSelect
                  label="Gender"
                  value={editData.gender || ''}
                  onChange={(val) => setEditData({ ...editData, gender: val })}
                  options={[{value:'',label:'Select'},{value:'male',label:'Male'},{value:'female',label:'Female'}]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" value={editData.city || ''} onChange={(e) => setEditData({ ...editData, city: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                <input type="text" value={editData.allergies || ''} onChange={(e) => setEditData({ ...editData, allergies: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="e.g., Penicillin, Nuts" />
              </div>
              <h4 className="text-sm font-semibold text-gray-700 pt-2 border-t">Emergency Contact</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={editData.emergency_contact_name || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={editData.emergency_contact_phone || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                  <input type="text" value={editData.emergency_contact_relationship || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_relationship: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <h4 className="text-sm font-semibold text-gray-700 pt-2 border-t">Primary Care Physician</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PCP Name</label>
                  <input type="text" value={editData.pcp_name || ''} onChange={(e) => setEditData({ ...editData, pcp_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PCP Phone</label>
                  <input type="text" value={editData.pcp_phone || ''} onChange={(e) => setEditData({ ...editData, pcp_phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <h4 className="text-sm font-semibold text-gray-700 pt-2 border-t">Insurance & Billing</h4>
              <div className="grid grid-cols-2 gap-4">
                <AppSelect
                  label="Payer Type"
                  value={editPayerType}
                  onChange={(val) => { setEditPayerType(val); setEditPayerId(null); }}
                  options={[{value:'self_pay',label:'Self Pay'},{value:'corporate',label:'Corporate / Employer'},{value:'insurance',label:'Health Insurance'}]}
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
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex gap-3 justify-end sticky bottom-0">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
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
