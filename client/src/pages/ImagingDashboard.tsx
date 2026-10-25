import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../api/client';
import { imagingAPI } from '../api/imaging';
import PatientQuickView from '../components/PatientQuickView';
import AppLayout from '../components/AppLayout';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import { StatCard, Card, Button, StatusBadge, EmptyState, SkeletonStatCard } from '../components/ui';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useSmartPolling } from '../hooks/useSmartPolling';
import AppSelect from '../components/ui/AppSelect';
import DashboardHeader, { StatPill } from '../components/DashboardHeader';
import type { SparkPoint } from '../components/ui/Sparkline';

interface RoutingRequest {
  id: number;
  encounter_id: number;
  patient_id: number;
  department: string;
  status: string;
  notes: string;
  routed_at: string;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  room_number: string;
}

interface ImagingOrder {
  id: number;
  encounter_id: number;
  patient_id: number;
  imaging_type: string;
  body_part: string;
  priority: 'stat' | 'urgent' | 'routine';
  status: string;
  ordered_date: string;
  completed_date?: string;
  clinical_indication?: string;
  notes?: string;
  results?: string;
  findings?: string;
  impression?: string;
  radiologist_notes?: string;
  patient_name: string;
  patient_number: string;
  patient_allergies?: string;
  encounter_number: string;
  ordering_provider_name: string;
  study_instance_uid?: string | null;
  accession_number?: string | null;
}

const ImagingDashboard: React.FC = () => {
  useDesignSystemPage();
  const [walkIns, setWalkIns] = useState<RoutingRequest[]>([]);
  const [imagingOrders, setImagingOrders] = useState<ImagingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Notification deep-link: ?highlight=<imagingOrderId> (+ optional ?tab=orders)
  // scrolls to + flashes that order. Reacts to every query-string change, not
  // just mount, so clicking "View" while already on the dashboard still works.
  const navigate = useNavigate();
  const location = useLocation();
  const [highlightOrderId, setHighlightOrderId] = useState<number | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const highlight = params.get('highlight');
    if (tab === 'orders') setActiveTab('orders');
    if (highlight) {
      const id = Number(highlight);
      if (!Number.isNaN(id)) setHighlightOrderId(id);
      setActiveTab('orders');
      setOrdersSubTab('pending');
    }
    if (tab || highlight) navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  useEffect(() => {
    if (highlightOrderId == null) return;
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightOrderId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightOrderId, imagingOrders]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'walkins' | 'orders'>('walkins');
  const [ordersSubTab, setOrdersSubTab] = useState<'pending' | 'in_progress' | 'completed'>('pending');

  // Upcoming scheduled imaging appointments
  const [scheduledAppointments, setScheduledAppointments] = useState<Array<{id: number; patient_name: string; appointment_date: string; reason: string; status: string}>>([]);

  // Walk-in add study modal
  const [addStudyWalkin, setAddStudyWalkin] = useState<any | null>(null);
  const [walkinImagingType, setWalkinImagingType] = useState('');
  const [walkinBodyPart, setWalkinBodyPart] = useState('');
  const [walkinPriority, setWalkinPriority] = useState('routine');
  const [walkinStudies, setWalkinStudies] = useState<Array<{imaging_type: string; body_part: string; priority: string}>>([]);
  const [submittingWalkinStudies, setSubmittingWalkinStudies] = useState(false);

  // Patient Details panel state
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<ImagingOrder | null>(null);
  const [patientDiagnoses, setPatientDiagnoses] = useState<any[]>([]);
  const [patientAllergies, setPatientAllergies] = useState<any[]>([]);
  // 'failed' must never render as "No known allergies".
  const [allergiesStatus, setAllergiesStatus] = useState<'loading' | 'loaded' | 'failed'>('loaded');
  const [patientImagingHistory, setPatientImagingHistory] = useState<any[]>([]);

  // Patient Quick View modal
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [showPatientQuickView, setShowPatientQuickView] = useState(false);

  // Results modal state
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [resultsOrder, setResultsOrder] = useState<ImagingOrder | null>(null);
  const [resultsFindings, setResultsFindings] = useState('');
  const [resultsImpression, setResultsImpression] = useState('');
  const [resultsRadiologistNotes, setResultsRadiologistNotes] = useState('');
  const [resultsSaving, setResultsSaving] = useState(false);

  const { showToast } = useNotification();
  const { confirm: confirmDialog } = useDialog();
  // Track which encounters have a release-to-nurse in flight / done
  const [releasingNurse, setReleasingNurse] = useState<Set<number>>(new Set());
  const [releasedToNurse, setReleasedToNurse] = useState<Set<number>>(new Set());

  const sendToNurse = async (encounterId: number, patientName: string) => {
    if (releasingNurse.has(encounterId) || releasedToNurse.has(encounterId)) return;
    const ok = await confirmDialog({
      title: 'Send back to nurse?',
      message: `Send ${patientName} back to the nurse? The nurse will be notified to take over follow-up.`,
      variant: 'warning',
      confirmLabel: 'Send to nurse',
    });
    if (!ok) return;
    setReleasingNurse(prev => new Set(prev).add(encounterId));
    try {
      await apiClient.post('/workflow/release-to-nurse', {
        encounter_id: encounterId,
        from_department: 'imaging',
      });
      setReleasedToNurse(prev => new Set(prev).add(encounterId));
      showToast(`${patientName} sent back to nurse`, 'success');
      fetchImagingOrders();
      fetchWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to release patient', 'error');
    } finally {
      setReleasingNurse(prev => {
        const next = new Set(prev);
        next.delete(encounterId);
        return next;
      });
    }
  };

  const fetchScheduledAppointments = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiClient.get('/appointments', { params: { from_date: today, to_date: today, limit: 50 } });
      const all = res.data.appointments || res.data || [];
      setScheduledAppointments(all.filter((a: any) => a.appointment_type === 'walk-in imaging' && a.status !== 'cancelled'));
    } catch { /* ignore */ }
  };

  const handleSubmitWalkinStudies = async () => {
    if (!addStudyWalkin || walkinStudies.length === 0) return;
    setSubmittingWalkinStudies(true);
    try {
      for (const study of walkinStudies) {
        await apiClient.post('/orders/imaging', {
          patient_id: addStudyWalkin.patient_id,
          encounter_id: addStudyWalkin.encounter_id,
          imaging_type: study.imaging_type,
          body_part: study.body_part || null,
          priority: study.priority,
        });
      }
      showToast(`${walkinStudies.length} imaging order(s) created for ${addStudyWalkin.patient_name}`, 'success');
      setAddStudyWalkin(null);
      setWalkinStudies([]);
      fetchImagingOrders();
      fetchWalkIns();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to create imaging orders', 'error');
    } finally {
      setSubmittingWalkinStudies(false);
    }
  };

  useSmartPolling(() => {
    fetchWalkIns();
    fetchImagingOrders();
    fetchScheduledAppointments();
  }, 30_000, true);

  // 30-day trends for the imaging stat cards' sparklines.
  const [imagingTrends, setImagingTrends] = useState<{
    orders_created: SparkPoint[];
    orders_completed: SparkPoint[];
    stat_orders: SparkPoint[];
  } | null>(null);

  useEffect(() => {
    apiClient
      .get('/imaging/trends?days=30')
      .then((res) => {
        const s = res.data.series;
        const map = (arr: Array<{ day: string; value: number }>): SparkPoint[] =>
          arr.map((p) => ({ label: p.day, value: p.value }));
        setImagingTrends({
          orders_created: map(s.orders_created),
          orders_completed: map(s.orders_completed),
          stat_orders: map(s.stat_orders),
        });
      })
      .catch((err) => console.error('Failed to load imaging trends:', err));
  }, []);

  const fetchWalkIns = async () => {
    try {
      // /queue returns all patients routed here (direct walk-ins AND
      // nurse-routed). /walk-ins filtered to is_walk_in=true only, which
      // missed everyone sent from inside an active encounter.
      const response = await apiClient.get('/department-routing/imaging/queue');
      setWalkIns(response.data.queue || response.data.walk_ins || []);
    } catch (error) {
      console.error('Error fetching imaging queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchImagingOrders = async () => {
    try {
      setOrdersLoading(true);
      const response = await apiClient.get('/orders/imaging');
      setImagingOrders(response.data.imaging_orders || []);
    } catch (error) {
      console.error('Error fetching imaging orders:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Guards against a fetch race (clicking A then B could let A's slower response
  // overwrite B's allergies/contrast-allergy — showing the WRONG patient).
  const activePanelReqRef = useRef(0);
  const fetchPatientDetailsForPanel = async (patientId: number, encounterId: number) => {
    const reqId = ++activePanelReqRef.current;
    const isStale = () => activePanelReqRef.current !== reqId;
    setPatientAllergies([]);
    setAllergiesStatus('loading');
    try {
      // Fetch diagnoses from encounter
      const encounterRes = await apiClient.get(`/encounters/${encounterId}`);
      if (isStale()) return;
      setPatientDiagnoses(encounterRes.data.diagnoses || []);

      // Fetch allergies from patient record
      const patientRes = await apiClient.get(`/patients/${patientId}`);
      if (isStale()) return;
      setPatientAllergies(patientRes.data.patient?.allergies || []);
      setAllergiesStatus('loaded');

      // Fetch recent imaging history for this patient
      const imagingHistoryRes = await apiClient.get(`/orders/imaging?patient_id=${patientId}&limit=10`);
      if (isStale()) return;
      setPatientImagingHistory(imagingHistoryRes.data.imaging_orders || []);
    } catch (error) {
      console.error('Error fetching patient details for panel:', error);
      if (!isStale()) setAllergiesStatus('failed');
    }
  };

  const updateStatus = async (routingId: number, status: string) => {
    try {
      await apiClient.put(`/department-routing/${routingId}/status`, {
        status: status,
      });
      fetchWalkIns();
      showToast('Status updated', 'success');
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Failed to update status', 'error');
    }
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      await apiClient.put(`/orders/imaging/${orderId}`, { status });
      fetchImagingOrders();
      // If completed, may auto-route patient back to nurse
      showToast(status === 'completed' ? 'Study completed' : status === 'in_progress' ? 'Study started' : 'Study updated', 'success');
    } catch (error) {
      console.error('Error updating order status:', error);
      showToast('Failed to update the study — please try again', 'error');
    }
  };

  const openResultsModal = (order: ImagingOrder) => {
    setResultsOrder(order);
    setResultsFindings(order.findings || '');
    setResultsImpression(order.impression || '');
    setResultsRadiologistNotes(order.radiologist_notes || '');
    setShowResultsModal(true);
  };

  const saveResults = async (markCompleted: boolean) => {
    if (!resultsOrder) return;
    setResultsSaving(true);
    try {
      const payload: Record<string, string> = {
        findings: resultsFindings,
        impression: resultsImpression,
        radiologist_notes: resultsRadiologistNotes,
      };
      if (markCompleted) {
        payload.status = 'completed';
      }
      await apiClient.put(`/orders/imaging/${resultsOrder.id}`, payload);
      showToast(markCompleted ? 'Results saved and study marked as completed' : 'Results saved successfully', 'success');
      setShowResultsModal(false);
      setResultsOrder(null);
      fetchImagingOrders();
    } catch (error) {
      console.error('Error saving results:', error);
      showToast('Failed to save results', 'error');
    } finally {
      setResultsSaving(false);
    }
  };

  const pendingCount = imagingOrders.filter(o => o.status === 'pending' || o.status === 'ordered').length;
  const inProgressCount = imagingOrders.filter(o => o.status === 'in_progress').length;
  const completedCount = imagingOrders.filter(o => o.status === 'completed').length;

  // Filter orders by sub-tab
  const filteredOrders = imagingOrders.filter(order => {
    if (ordersSubTab === 'pending') return order.status === 'pending' || order.status === 'ordered';
    if (ordersSubTab === 'in_progress') return order.status === 'in_progress';
    if (ordersSubTab === 'completed') return order.status === 'completed';
    return true;
  });

  return (
    <AppLayout designSystem>
      <DashboardHeader
        title="Imaging Dashboard"
        stats={(
          <>
            <StatPill label="walk-ins" value={walkIns.length} tone={walkIns.length > 0 ? 'warning' : 'neutral'} title="Imaging walk-in queue" />
            <StatPill label="pending" value={pendingCount} tone="primary" title="Orders awaiting study" />
            <StatPill label="in progress" value={inProgressCount} tone="primary" title="Studies in progress" />
            <StatPill label="completed" value={completedCount} tone="success" title="Studies completed" />
          </>
        )}
      />
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {loading ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard
              title="Pending Studies"
              value={pendingCount}
              variant="warning"
              series={imagingTrends?.orders_created}
              trendDirection="up-is-bad"
              onClick={() => { setActiveTab('orders'); setOrdersSubTab('pending'); }}
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              title="In Progress"
              value={inProgressCount}
              variant="primary"
              series={imagingTrends?.stat_orders}
              trendDirection="up-is-bad"
              onClick={() => { setActiveTab('orders'); setOrdersSubTab('in_progress'); }}
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
            <StatCard
              title="Completed Today"
              value={completedCount}
              variant="success"
              series={imagingTrends?.orders_completed}
              trendDirection="up-is-good"
              onClick={() => { setActiveTab('orders'); setOrdersSubTab('completed'); }}
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </>
        )}
      </div>

      {/* Upcoming Scheduled Imaging */}
      {scheduledAppointments.length > 0 && (
        <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border mb-4">
          <div className="px-4 py-3 border-b border-ds-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-ds-brand-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-[11px] font-semibold text-ds-text-muted uppercase tracking-wider">Upcoming Scheduled Imaging</h2>
            </div>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-ds-accent-soft text-ds-brand-plum">{scheduledAppointments.length}</span>
          </div>
          <div className="divide-y divide-ds-border max-h-40 overflow-y-auto">
            {scheduledAppointments.map((apt) => (
              <div key={apt.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-ds-accent-soft text-ds-brand-plum border border-ds-border">SCHEDULED</span>
                  <span className="font-medium text-ds-text">{apt.patient_name}</span>
                  <span className="text-ds-text-muted">{apt.reason}</span>
                </div>
                <span className="text-xs text-ds-text-muted tabular-nums">
                  {new Date(apt.appointment_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border mb-6">
        <div className="flex border-b border-ds-border">
          <button
            onClick={() => setActiveTab('walkins')}
            className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
              activeTab === 'walkins'
                ? 'text-ds-accent-text border-b-2 border-ds-accent bg-ds-accent-soft'
                : 'text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Walk-ins
              {walkIns.length > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-ds-accent text-ds-on-accent">
                  {walkIns.length}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
              activeTab === 'orders'
                ? 'text-ds-accent-text border-b-2 border-ds-accent bg-ds-accent-soft'
                : 'text-ds-text-muted hover:text-ds-text hover:bg-ds-subtle'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Imaging Orders
              {pendingCount + inProgressCount > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-ds-border text-ds-text-secondary">
                  {pendingCount + inProgressCount}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Walk-ins Tab */}
      {activeTab === 'walkins' && (
        <Card>
          <Card.Header>
            <div className="flex justify-between items-center">
              <span>Walk-in Patients</span>
              <button
                onClick={fetchWalkIns}
                className="min-h-ds-touch px-3 py-1 text-sm bg-ds-subtle hover:bg-ds-border rounded-lg flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </Card.Header>
          <div className="divide-y divide-ds-border">
            {walkIns.length === 0 ? (
              <EmptyState
                title="No walk-in patients"
                description="When receptionist routes a patient for imaging walk-in service, they will appear here."
                icon={
                  <svg className="w-12 h-12 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />
            ) : (
              walkIns.map((walkin) => (
                <div key={walkin.id} className="px-6 py-4 hover:bg-ds-subtle transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-ds-text">
                          {walkin.patient_name}
                        </h3>
                        <StatusBadge status={walkin.status} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-ds-text-muted">Patient #:</span>
                          <span className="ml-2 text-ds-text font-medium">{walkin.patient_number}</span>
                        </div>
                        <div>
                          <span className="text-ds-text-muted">Arrived:</span>
                          <span className="ml-2 text-ds-text font-medium">
                            {new Date(walkin.routed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        {walkin.notes && (
                          <div>
                            <span className="text-ds-text-muted">Reason:</span>
                            <span className="ml-2 text-ds-text">{walkin.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex gap-2">
                      <button
                        onClick={() => {
                          setAddStudyWalkin(walkin);
                          setWalkinStudies([]);
                          setWalkinImagingType('');
                          setWalkinBodyPart('');
                        }}
                        className="min-h-ds-touch px-2 py-1 bg-ds-accent text-ds-on-accent rounded text-xs font-semibold hover:bg-ds-accent-hover"
                      >
                        + Add Study
                      </button>
                      {walkin.status === 'pending' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => updateStatus(walkin.id, 'in-progress')}
                        >
                          Start
                        </Button>
                      )}
                      {walkin.status === 'in-progress' && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => updateStatus(walkin.id, 'completed')}
                        >
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Imaging Orders Tab */}
      {activeTab === 'orders' && (
        <div>
          {/* Sub-tabs for order status */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setOrdersSubTab('pending')}
              className={`min-h-ds-touch px-4 py-2 rounded-lg font-medium transition-colors ${
                ordersSubTab === 'pending'
                  ? 'bg-ds-warning-soft text-ds-warning-text'
                  : 'bg-ds-subtle text-ds-text-secondary hover:bg-ds-border'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setOrdersSubTab('in_progress')}
              className={`min-h-ds-touch px-4 py-2 rounded-lg font-medium transition-colors ${
                ordersSubTab === 'in_progress'
                  ? 'bg-ds-accent-soft text-ds-accent-text'
                  : 'bg-ds-subtle text-ds-text-secondary hover:bg-ds-border'
              }`}
            >
              In Progress ({inProgressCount})
            </button>
            <button
              onClick={() => setOrdersSubTab('completed')}
              className={`min-h-ds-touch px-4 py-2 rounded-lg font-medium transition-colors ${
                ordersSubTab === 'completed'
                  ? 'bg-ds-success-soft text-ds-success-text'
                  : 'bg-ds-subtle text-ds-text-secondary hover:bg-ds-border'
              }`}
            >
              Completed ({completedCount})
            </button>
            <div className="flex-1"></div>
            <button
              onClick={fetchImagingOrders}
              className="min-h-ds-touch px-3 py-2 text-sm bg-ds-subtle hover:bg-ds-border rounded-lg flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {/* Orders List and Patient Details */}
          <div className="flex gap-6">
            {/* Left: Orders List */}
            <div className="flex-1 bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">
                  {ordersSubTab === 'pending' ? 'Pending' : ordersSubTab === 'in_progress' ? 'In Progress' : 'Completed'} Imaging Orders
                </h2>
              </div>
              <div className="divide-y divide-ds-border max-h-[calc(100vh-400px)] overflow-y-auto">
                {ordersLoading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-ds-border rounded w-1/3 mb-2" />
                        <div className="h-3 bg-ds-border rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <EmptyState
                    title={`No ${ordersSubTab.replace('_', ' ')} imaging orders`}
                    description="Orders will appear here when they match this status."
                    icon={
                      <svg className="w-12 h-12 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                    }
                  />
                ) : (
                  filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      ref={order.id === highlightOrderId ? highlightRef : undefined}
                      className={`px-6 py-4 hover:bg-ds-subtle transition-colors cursor-pointer ${
                        order.priority === 'stat' ? 'bg-ds-critical-soft border-l-4 border-ds-critical' : ''
                      } ${order.id === highlightOrderId ? 'ring-2 ring-ds-focus-ring bg-ds-accent-soft' : selectedOrderForDetails?.id === order.id ? 'ring-2 ring-ds-focus-ring bg-ds-accent-soft' : ''}`}
                      onClick={() => {
                        setSelectedOrderForDetails(order);
                        fetchPatientDetailsForPanel(order.patient_id, order.encounter_id);
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-ds-text">
                              {order.patient_name}
                            </h3>
                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                              order.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' :
                              order.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' :
                              'bg-ds-subtle text-ds-text-secondary'
                            }`}>
                              {order.priority.toUpperCase()}
                            </span>
                            <StatusBadge status={order.status} />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-ds-text-muted">Study:</span>
                              <span className="ml-2 text-ds-text font-medium">{order.imaging_type}</span>
                            </div>
                            <div>
                              <span className="text-ds-text-muted">Body Part:</span>
                              <span className="ml-2 text-ds-text font-medium">{order.body_part}</span>
                            </div>
                            <div>
                              <span className="text-ds-text-muted">Patient #:</span>
                              <span className="ml-2 text-ds-text font-medium">{order.patient_number}</span>
                            </div>
                            <div>
                              <span className="text-ds-text-muted">Ordered:</span>
                              <span className="ml-2 text-ds-text font-medium">
                                {new Date(order.ordered_date).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          {order.clinical_indication && (
                            <div className="mt-2 text-sm">
                              <span className="text-ds-text-muted">Clinical Indication:</span>
                              <p className="text-ds-text-secondary mt-1 bg-ds-subtle rounded p-2">{order.clinical_indication}</p>
                            </div>
                          )}
                        </div>
                        <div className="ml-4 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                          {(order.status === 'pending' || order.status === 'ordered') && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => updateOrderStatus(order.id, 'in_progress')}
                            >
                              Start Study
                            </Button>
                          )}
                          {order.status === 'in_progress' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openResultsModal(order)}
                            >
                              Enter Results
                            </Button>
                          )}
                          {order.status === 'completed' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openResultsModal(order)}
                            >
                              Edit Results
                            </Button>
                          )}
                          {order.study_instance_uid && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await imagingAPI.openViewerForOrder(order.id);
                                } catch (err: any) {
                                  showToast(err?.response?.data?.detail || err?.message || 'Failed to open viewer', 'error');
                                }
                              }}
                            >
                              View Images
                            </Button>
                          )}
                          {(() => {
                            const inFlight = releasingNurse.has(order.encounter_id);
                            const done = releasedToNurse.has(order.encounter_id);
                            const disabled = inFlight || done;
                            return (
                              <button
                                onClick={() => {
                                  if (disabled) return;
                                  sendToNurse(order.encounter_id, order.patient_name);
                                }}
                                disabled={disabled}
                                className={`min-h-ds-touch px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-ds-card transition-colors ${
                                  done
                                    ? 'bg-ds-border text-ds-text-muted cursor-not-allowed'
                                    : inFlight
                                    ? 'bg-ds-warning text-white dark:text-ds-canvas cursor-wait'
                                    : 'bg-ds-warning hover:bg-ds-warning/90 text-white dark:text-ds-canvas'
                                }`}
                                title={done ? 'Already sent to nurse' : 'Send patient back to nurse'}
                              >
                                {done ? '✓ Sent to nurse' : inFlight ? 'Sending…' : 'Send to Nurse'}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: Patient Details Panel */}
            <div className="w-80 bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border flex-shrink-0">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Patient Details</h2>
              </div>
              {selectedOrderForDetails ? (
                <div className="p-6 space-y-6 max-h-[calc(100vh-400px)] overflow-y-auto">
                  {/* Patient Info */}
                  <div>
                    <h3 className="text-sm font-semibold text-ds-text-secondary uppercase tracking-wider mb-2">
                      Patient
                    </h3>
                    <div className="bg-ds-subtle rounded p-3 space-y-2">
                      <div className="font-semibold text-ds-text">{selectedOrderForDetails.patient_name}</div>
                      <div className="text-sm text-ds-text-secondary">{selectedOrderForDetails.patient_number}</div>
                    </div>
                  </div>

                  {/* Current Study */}
                  <div>
                    <h3 className="text-sm font-semibold text-ds-accent-text uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                      </svg>
                      Current Study
                    </h3>
                    <div className="bg-ds-accent-soft rounded p-3 border border-ds-accent/30">
                      <div className="font-semibold text-ds-accent-text">{selectedOrderForDetails.imaging_type}</div>
                      <div className="text-sm text-ds-accent-text mt-1">Body Part: {selectedOrderForDetails.body_part}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                          selectedOrderForDetails.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' :
                          selectedOrderForDetails.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' :
                          'bg-ds-subtle text-ds-text-secondary'
                        }`}>
                          {selectedOrderForDetails.priority.toUpperCase()}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                          selectedOrderForDetails.status === 'completed' ? 'bg-ds-success-soft text-ds-success-text' :
                          selectedOrderForDetails.status === 'in_progress' ? 'bg-ds-accent-soft text-ds-accent-text' :
                          'bg-ds-warning-soft text-ds-warning-text'
                        }`}>
                          {selectedOrderForDetails.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Allergies */}
                  <div>
                    <h3 className="text-sm font-semibold text-ds-critical-text uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Allergies
                    </h3>
                    {patientAllergies.length > 0 ? (
                      <div className="space-y-2">
                        {patientAllergies.map((allergy: any, idx: number) => (
                          <div key={idx} className="p-2 bg-ds-critical-soft border border-ds-critical-border rounded text-sm">
                            <span className="font-medium text-ds-critical-text">{allergy.allergen || allergy}</span>
                            {allergy.reaction && (
                              <span className="text-ds-critical-text ml-2">- {allergy.reaction}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      allergiesStatus === 'loading' ? (
                        <p className="text-sm text-ds-text-muted italic">Checking allergies…</p>
                      ) : allergiesStatus === 'failed' ? (
                        <p className="text-sm font-medium text-ds-critical-text" role="alert">Allergies couldn't be loaded — check the patient's chart before giving anything.</p>
                      ) : (
                        <p className="text-sm text-ds-text-muted italic">No known allergies</p>
                      )
                    )}
                  </div>

                  {/* Contrast Warning (important for imaging) */}
                  {patientAllergies.some((a: any) =>
                    (a.allergen || a || '').toLowerCase().includes('contrast') ||
                    (a.allergen || a || '').toLowerCase().includes('iodine')
                  ) && (
                    <div className="p-3 bg-ds-critical-soft border-2 border-ds-critical-border rounded-lg">
                      <div className="flex items-center gap-2 text-ds-critical-text font-bold">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        CONTRAST ALLERGY ALERT
                      </div>
                      <p className="text-sm text-ds-critical-text mt-1">
                        Patient has documented allergy to contrast media or iodine. Confirm with ordering physician before proceeding.
                      </p>
                    </div>
                  )}

                  {/* Diagnoses */}
                  <div>
                    <h3 className="text-sm font-semibold text-ds-brand-plum uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Diagnoses
                    </h3>
                    {patientDiagnoses.length > 0 ? (
                      <div className="space-y-2">
                        {patientDiagnoses.map((dx: any, idx: number) => (
                          <div key={idx} className="p-2 bg-ds-subtle border border-ds-border rounded text-sm">
                            <span className="font-medium text-ds-brand-plum">{dx.diagnosis_name || dx.name || dx}</span>
                            {dx.icd_code && (
                              <span className="text-ds-brand-plum ml-2 text-xs">({dx.icd_code})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ds-text-muted italic">No diagnoses recorded</p>
                    )}
                  </div>

                  {/* Recent Imaging History */}
                  <div>
                    <h3 className="text-sm font-semibold text-ds-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Recent Imaging History
                    </h3>
                    {patientImagingHistory.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {patientImagingHistory.slice(0, 5).map((img: any, idx: number) => (
                          <div key={idx} className="p-2 bg-ds-subtle border border-ds-border rounded text-sm">
                            <div className="font-medium text-ds-text-secondary">{img.imaging_type} - {img.body_part}</div>
                            <div className="text-xs text-ds-text-muted mt-1">
                              {new Date(img.ordered_date).toLocaleDateString()} -
                              <span className={`ml-1 ${img.status === 'completed' ? 'text-ds-success-text' : 'text-ds-warning-text'}`}>
                                {img.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ds-text-muted italic">No previous imaging orders</p>
                    )}
                  </div>

                  {/* View Full Profile Button */}
                  <button
                    onClick={() => {
                      setSelectedPatientId(selectedOrderForDetails.patient_id);
                      setShowPatientQuickView(true);
                    }}
                    className="min-h-ds-touch w-full px-4 py-2 bg-ds-accent text-ds-on-accent rounded-lg hover:bg-ds-accent-hover transition-colors text-sm font-medium"
                  >
                    View Full Patient Profile
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center text-ds-text-muted">
                  <svg className="w-12 h-12 mx-auto mb-3 text-ds-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                  </svg>
                  <p>Select an order to view patient details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results Entry Modal */}
      {showResultsModal && resultsOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-ds-border bg-gradient-to-r from-ds-accent-soft to-ds-accent-soft rounded-t-xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-ds-text">
                    {resultsOrder.status === 'completed' ? 'Edit' : 'Enter'} Imaging Results
                  </h2>
                  <p className="text-sm text-ds-text-secondary mt-1">
                    {resultsOrder.patient_name} - {resultsOrder.imaging_type} ({resultsOrder.body_part})
                  </p>
                </div>
                <button
                  onClick={() => { setShowResultsModal(false); setResultsOrder(null); }}
                  className="text-ds-text-muted hover:text-ds-text-secondary transition-colors"
                  aria-label="Close modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Order Info Summary */}
              <div className="bg-ds-subtle rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-ds-text-muted">Study Type:</span>
                  <span className="ml-2 font-medium text-ds-text">{resultsOrder.imaging_type}</span>
                </div>
                <div>
                  <span className="text-ds-text-muted">Body Part:</span>
                  <span className="ml-2 font-medium text-ds-text">{resultsOrder.body_part}</span>
                </div>
                <div>
                  <span className="text-ds-text-muted">Priority:</span>
                  <span className={`ml-2 font-medium ${
                    resultsOrder.priority === 'stat' ? 'text-ds-critical-text' :
                    resultsOrder.priority === 'urgent' ? 'text-ds-warning-text' : 'text-ds-text-secondary'
                  }`}>
                    {resultsOrder.priority.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-ds-text-muted">Ordered by:</span>
                  <span className="ml-2 font-medium text-ds-text">{resultsOrder.ordering_provider_name}</span>
                </div>
                {resultsOrder.clinical_indication && (
                  <div className="col-span-2">
                    <span className="text-ds-text-muted">Clinical Indication:</span>
                    <p className="mt-1 text-ds-text-secondary">{resultsOrder.clinical_indication}</p>
                  </div>
                )}
              </div>

              {/* Findings */}
              <div>
                <label htmlFor="results-findings" className="block text-sm font-semibold text-ds-text-secondary mb-1">
                  Findings <span className="text-ds-critical-text">*</span>
                </label>
                <textarea
                  id="results-findings"
                  value={resultsFindings}
                  onChange={(e) => setResultsFindings(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent resize-vertical text-sm"
                  placeholder="Describe the imaging findings in detail..."
                />
              </div>

              {/* Impression */}
              <div>
                <label htmlFor="results-impression" className="block text-sm font-semibold text-ds-text-secondary mb-1">
                  Impression <span className="text-ds-critical-text">*</span>
                </label>
                <textarea
                  id="results-impression"
                  value={resultsImpression}
                  onChange={(e) => setResultsImpression(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent resize-vertical text-sm"
                  placeholder="Summary impression / conclusion..."
                />
              </div>

              {/* Radiologist Notes */}
              <div>
                <label htmlFor="results-radiologist-notes" className="block text-sm font-semibold text-ds-text-secondary mb-1">
                  Radiologist Notes
                </label>
                <textarea
                  id="results-radiologist-notes"
                  value={resultsRadiologistNotes}
                  onChange={(e) => setResultsRadiologistNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-ds-border-control rounded-lg focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent resize-vertical text-sm"
                  placeholder="Additional notes, recommendations, follow-up suggestions..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-ds-border bg-ds-subtle rounded-b-ds-card flex justify-between items-center">
              <button
                onClick={() => { setShowResultsModal(false); setResultsOrder(null); }}
                className="min-h-ds-touch px-4 py-2 text-ds-text-secondary hover:text-ds-text font-medium transition-colors"
                disabled={resultsSaving}
              >
                Cancel
              </button>
              <div className="flex gap-3">
                {resultsOrder.status !== 'completed' && (
                  <Button
                    variant="secondary"
                    onClick={() => saveResults(false)}
                    disabled={resultsSaving}
                  >
                    {resultsSaving ? 'Saving...' : 'Save Draft'}
                  </Button>
                )}
                <Button
                  variant="success"
                  onClick={() => saveResults(resultsOrder.status !== 'completed')}
                  disabled={resultsSaving || (!resultsFindings.trim() && !resultsImpression.trim())}
                >
                  {resultsSaving ? 'Saving...' : resultsOrder.status === 'completed' ? 'Update Results' : 'Save & Complete'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patient Quick View Modal */}
      {/* Add Study Modal for Walk-in Patients */}
      {addStudyWalkin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setAddStudyWalkin(null)}>
          <div className="bg-ds-surface rounded-ds-card shadow-ds-overlay w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-ds-border bg-gradient-to-r from-ds-subtle to-ds-subtle rounded-t-xl">
              <h3 className="text-lg font-bold text-ds-text">Add Imaging Studies</h3>
              <p className="text-sm text-ds-text-secondary mt-0.5">{addStudyWalkin.patient_name} — {addStudyWalkin.encounter_number}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <input type="text" value={walkinImagingType} onChange={(e) => setWalkinImagingType(e.target.value)} placeholder="Imaging type (e.g., X-Ray, CT Scan, Ultrasound)" className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm focus:ring-2 focus:ring-ds-focus-ring" />
                <input type="text" value={walkinBodyPart} onChange={(e) => setWalkinBodyPart(e.target.value)} placeholder="Body part (optional)" className="w-full px-3 py-2 border border-ds-border-control rounded-lg text-sm focus:ring-2 focus:ring-ds-focus-ring" />
                <div className="grid grid-cols-2 gap-3">
                  <AppSelect value={walkinPriority} onChange={(val) => setWalkinPriority(val)} options={[{value:'routine',label:'Routine'},{value:'urgent',label:'Urgent'},{value:'stat',label:'STAT'}]} />
                  <button onClick={() => { if (!walkinImagingType.trim()) return; setWalkinStudies([...walkinStudies, { imaging_type: walkinImagingType.trim(), body_part: walkinBodyPart.trim(), priority: walkinPriority }]); setWalkinImagingType(''); setWalkinBodyPart(''); }} className="min-h-ds-touch px-3 py-2 bg-ds-accent text-ds-on-accent rounded-lg text-sm font-medium hover:bg-ds-brand-plum/90">+ Add to List</button>
                </div>
              </div>
              {walkinStudies.length > 0 && (
                <div className="border border-ds-border rounded-lg divide-y divide-ds-border">
                  {walkinStudies.map((s, idx) => (
                    <div key={idx} className="px-4 py-2.5 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-ds-text text-sm">{s.imaging_type}</span>
                        {s.body_part && <span className="text-ds-text-muted text-sm ml-1">({s.body_part})</span>}
                        <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded ${s.priority === 'stat' ? 'bg-ds-critical-soft text-ds-critical-text' : s.priority === 'urgent' ? 'bg-ds-warning-soft text-ds-warning-text' : 'bg-ds-subtle text-ds-text-secondary'}`}>{s.priority.toUpperCase()}</span>
                      </div>
                      <button onClick={() => setWalkinStudies(walkinStudies.filter((_, i) => i !== idx))} className="text-ds-text-muted hover:text-ds-critical-text"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-ds-border bg-ds-subtle rounded-b-ds-card flex justify-between items-center">
              <span className="text-sm text-ds-text-muted">{walkinStudies.length} study(ies) staged</span>
              <div className="flex gap-2">
                <button onClick={() => setAddStudyWalkin(null)} className="min-h-ds-touch px-4 py-2 text-ds-text-secondary font-medium hover:bg-ds-border rounded-lg text-sm">Cancel</button>
                <button onClick={handleSubmitWalkinStudies} disabled={walkinStudies.length === 0 || submittingWalkinStudies} className="min-h-ds-touch px-4 py-2 bg-ds-accent text-ds-on-accent font-medium rounded-lg hover:bg-ds-brand-plum/90 text-sm disabled:opacity-50">{submittingWalkinStudies ? 'Creating...' : `Create ${walkinStudies.length} Order(s)`}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPatientQuickView && selectedPatientId && (
        <PatientQuickView
          patientId={selectedPatientId}
          onClose={() => {
            setShowPatientQuickView(false);
            setSelectedPatientId(null);
          }}
        />
      )}
    </AppLayout>
  );
};

export default ImagingDashboard;
