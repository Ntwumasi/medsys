import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { imagingAPI } from '../api/imaging';
import PatientQuickView from '../components/PatientQuickView';
import AppLayout from '../components/AppLayout';
import { StatCard, Card, Button, StatusBadge, EmptyState, SkeletonStatCard } from '../components/ui';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useSmartPolling } from '../hooks/useSmartPolling';
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
  const [walkIns, setWalkIns] = useState<RoutingRequest[]>([]);
  const [imagingOrders, setImagingOrders] = useState<ImagingOrder[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchPatientDetailsForPanel = async (patientId: number, encounterId: number) => {
    try {
      // Fetch diagnoses from encounter
      const encounterRes = await apiClient.get(`/encounters/${encounterId}`);
      setPatientDiagnoses(encounterRes.data.diagnoses || []);

      // Fetch allergies from patient record
      const patientRes = await apiClient.get(`/patients/${patientId}`);
      setPatientAllergies(patientRes.data.patient?.allergies || []);

      // Fetch recent imaging history for this patient
      const imagingHistoryRes = await apiClient.get(`/orders/imaging?patient_id=${patientId}&limit=10`);
      setPatientImagingHistory(imagingHistoryRes.data.imaging_orders || []);
    } catch (error) {
      console.error('Error fetching patient details for panel:', error);
    }
  };

  const updateStatus = async (routingId: number, status: string) => {
    try {
      await apiClient.put(`/department-routing/${routingId}/status`, {
        status: status,
      });
      fetchWalkIns();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      await apiClient.put(`/orders/imaging/${orderId}`, { status });
      fetchImagingOrders();
      // If completed, may auto-route patient back to nurse
    } catch (error) {
      console.error('Error updating order status:', error);
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
    <AppLayout>
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Upcoming Scheduled Imaging</h2>
            </div>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-secondary-50 text-secondary-700">{scheduledAppointments.length}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {scheduledAppointments.map((apt) => (
              <div key={apt.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-secondary-100 text-secondary-700 border border-secondary-200">SCHEDULED</span>
                  <span className="font-medium text-gray-900">{apt.patient_name}</span>
                  <span className="text-gray-500">{apt.reason}</span>
                </div>
                <span className="text-xs text-gray-500 tabular-nums">
                  {new Date(apt.appointment_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('walkins')}
            className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
              activeTab === 'walkins'
                ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Walk-ins
              {walkIns.length > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary-500 text-white">
                  {walkIns.length}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
              activeTab === 'orders'
                ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Imaging Orders
              {pendingCount + inProgressCount > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-200 text-gray-700">
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
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </Card.Header>
          <div className="divide-y divide-gray-100">
            {walkIns.length === 0 ? (
              <EmptyState
                title="No walk-in patients"
                description="When receptionist routes a patient for imaging walk-in service, they will appear here."
                icon={
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />
            ) : (
              walkIns.map((walkin) => (
                <div key={walkin.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {walkin.patient_name}
                        </h3>
                        <StatusBadge status={walkin.status} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Patient #:</span>
                          <span className="ml-2 text-gray-900 font-medium">{walkin.patient_number}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Arrived:</span>
                          <span className="ml-2 text-gray-900 font-medium">
                            {new Date(walkin.routed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        {walkin.notes && (
                          <div>
                            <span className="text-gray-500">Reason:</span>
                            <span className="ml-2 text-gray-900">{walkin.notes}</span>
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
                        className="px-2 py-1 bg-primary-600 text-white rounded text-xs font-semibold hover:bg-primary-700"
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
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                ordersSubTab === 'pending'
                  ? 'bg-warning-100 text-warning-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setOrdersSubTab('in_progress')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                ordersSubTab === 'in_progress'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              In Progress ({inProgressCount})
            </button>
            <button
              onClick={() => setOrdersSubTab('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                ordersSubTab === 'completed'
                  ? 'bg-success-100 text-success-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Completed ({completedCount})
            </button>
            <div className="flex-1"></div>
            <button
              onClick={fetchImagingOrders}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
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
            <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">
                  {ordersSubTab === 'pending' ? 'Pending' : ordersSubTab === 'in_progress' ? 'In Progress' : 'Completed'} Imaging Orders
                </h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-[calc(100vh-400px)] overflow-y-auto">
                {ordersLoading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                        <div className="h-3 bg-gray-200 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <EmptyState
                    title={`No ${ordersSubTab.replace('_', ' ')} imaging orders`}
                    description="Orders will appear here when they match this status."
                    icon={
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                    }
                  />
                ) : (
                  filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className={`px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                        order.priority === 'stat' ? 'bg-danger-50 border-l-4 border-danger-500' : ''
                      } ${selectedOrderForDetails?.id === order.id ? 'ring-2 ring-primary-500 bg-primary-50' : ''}`}
                      onClick={() => {
                        setSelectedOrderForDetails(order);
                        fetchPatientDetailsForPanel(order.patient_id, order.encounter_id);
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {order.patient_name}
                            </h3>
                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                              order.priority === 'stat' ? 'bg-danger-100 text-danger-700' :
                              order.priority === 'urgent' ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {order.priority.toUpperCase()}
                            </span>
                            <StatusBadge status={order.status} />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Study:</span>
                              <span className="ml-2 text-gray-900 font-medium">{order.imaging_type}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Body Part:</span>
                              <span className="ml-2 text-gray-900 font-medium">{order.body_part}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Patient #:</span>
                              <span className="ml-2 text-gray-900 font-medium">{order.patient_number}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Ordered:</span>
                              <span className="ml-2 text-gray-900 font-medium">
                                {new Date(order.ordered_date).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          {order.clinical_indication && (
                            <div className="mt-2 text-sm">
                              <span className="text-gray-500">Clinical Indication:</span>
                              <p className="text-gray-700 mt-1 bg-gray-50 rounded p-2">{order.clinical_indication}</p>
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
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors ${
                                  done
                                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                    : inFlight
                                    ? 'bg-warning-300 text-white cursor-wait'
                                    : 'bg-warning-600 hover:bg-warning-700 text-white'
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
            <div className="w-80 bg-white rounded-xl shadow-lg border border-gray-200 flex-shrink-0">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Patient Details</h2>
              </div>
              {selectedOrderForDetails ? (
                <div className="p-6 space-y-6 max-h-[calc(100vh-400px)] overflow-y-auto">
                  {/* Patient Info */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">
                      Patient
                    </h3>
                    <div className="bg-gray-50 rounded p-3 space-y-2">
                      <div className="font-semibold text-gray-900">{selectedOrderForDetails.patient_name}</div>
                      <div className="text-sm text-gray-600">{selectedOrderForDetails.patient_number}</div>
                    </div>
                  </div>

                  {/* Current Study */}
                  <div>
                    <h3 className="text-sm font-semibold text-primary-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                      </svg>
                      Current Study
                    </h3>
                    <div className="bg-primary-50 rounded p-3 border border-primary-200">
                      <div className="font-semibold text-primary-900">{selectedOrderForDetails.imaging_type}</div>
                      <div className="text-sm text-primary-600 mt-1">Body Part: {selectedOrderForDetails.body_part}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                          selectedOrderForDetails.priority === 'stat' ? 'bg-danger-100 text-danger-700' :
                          selectedOrderForDetails.priority === 'urgent' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {selectedOrderForDetails.priority.toUpperCase()}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                          selectedOrderForDetails.status === 'completed' ? 'bg-success-100 text-success-700' :
                          selectedOrderForDetails.status === 'in_progress' ? 'bg-primary-100 text-primary-700' :
                          'bg-warning-100 text-warning-700'
                        }`}>
                          {selectedOrderForDetails.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Allergies */}
                  <div>
                    <h3 className="text-sm font-semibold text-danger-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Allergies
                    </h3>
                    {patientAllergies.length > 0 ? (
                      <div className="space-y-2">
                        {patientAllergies.map((allergy: any, idx: number) => (
                          <div key={idx} className="p-2 bg-danger-50 border border-danger-200 rounded text-sm">
                            <span className="font-medium text-danger-700">{allergy.allergen || allergy}</span>
                            {allergy.reaction && (
                              <span className="text-danger-600 ml-2">- {allergy.reaction}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No known allergies</p>
                    )}
                  </div>

                  {/* Contrast Warning (important for imaging) */}
                  {patientAllergies.some((a: any) =>
                    (a.allergen || a || '').toLowerCase().includes('contrast') ||
                    (a.allergen || a || '').toLowerCase().includes('iodine')
                  ) && (
                    <div className="p-3 bg-danger-100 border-2 border-danger-300 rounded-lg">
                      <div className="flex items-center gap-2 text-danger-700 font-bold">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        CONTRAST ALLERGY ALERT
                      </div>
                      <p className="text-sm text-danger-600 mt-1">
                        Patient has documented allergy to contrast media or iodine. Confirm with ordering physician before proceeding.
                      </p>
                    </div>
                  )}

                  {/* Diagnoses */}
                  <div>
                    <h3 className="text-sm font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Diagnoses
                    </h3>
                    {patientDiagnoses.length > 0 ? (
                      <div className="space-y-2">
                        {patientDiagnoses.map((dx: any, idx: number) => (
                          <div key={idx} className="p-2 bg-purple-50 border border-purple-200 rounded text-sm">
                            <span className="font-medium text-purple-700">{dx.diagnosis_name || dx.name || dx}</span>
                            {dx.icd_code && (
                              <span className="text-purple-600 ml-2 text-xs">({dx.icd_code})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No diagnoses recorded</p>
                    )}
                  </div>

                  {/* Recent Imaging History */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Recent Imaging History
                    </h3>
                    {patientImagingHistory.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {patientImagingHistory.slice(0, 5).map((img: any, idx: number) => (
                          <div key={idx} className="p-2 bg-gray-50 border border-gray-200 rounded text-sm">
                            <div className="font-medium text-gray-700">{img.imaging_type} - {img.body_part}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(img.ordered_date).toLocaleDateString()} -
                              <span className={`ml-1 ${img.status === 'completed' ? 'text-success-600' : 'text-warning-600'}`}>
                                {img.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No previous imaging orders</p>
                    )}
                  </div>

                  {/* View Full Profile Button */}
                  <button
                    onClick={() => {
                      setSelectedPatientId(selectedOrderForDetails.patient_id);
                      setShowPatientQuickView(true);
                    }}
                    className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                  >
                    View Full Patient Profile
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-50 rounded-t-xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {resultsOrder.status === 'completed' ? 'Edit' : 'Enter'} Imaging Results
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {resultsOrder.patient_name} - {resultsOrder.imaging_type} ({resultsOrder.body_part})
                  </p>
                </div>
                <button
                  onClick={() => { setShowResultsModal(false); setResultsOrder(null); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
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
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Study Type:</span>
                  <span className="ml-2 font-medium text-gray-900">{resultsOrder.imaging_type}</span>
                </div>
                <div>
                  <span className="text-gray-500">Body Part:</span>
                  <span className="ml-2 font-medium text-gray-900">{resultsOrder.body_part}</span>
                </div>
                <div>
                  <span className="text-gray-500">Priority:</span>
                  <span className={`ml-2 font-medium ${
                    resultsOrder.priority === 'stat' ? 'text-danger-700' :
                    resultsOrder.priority === 'urgent' ? 'text-orange-700' : 'text-gray-700'
                  }`}>
                    {resultsOrder.priority.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Ordered by:</span>
                  <span className="ml-2 font-medium text-gray-900">{resultsOrder.ordering_provider_name}</span>
                </div>
                {resultsOrder.clinical_indication && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Clinical Indication:</span>
                    <p className="mt-1 text-gray-700">{resultsOrder.clinical_indication}</p>
                  </div>
                )}
              </div>

              {/* Findings */}
              <div>
                <label htmlFor="results-findings" className="block text-sm font-semibold text-gray-700 mb-1">
                  Findings <span className="text-danger-500">*</span>
                </label>
                <textarea
                  id="results-findings"
                  value={resultsFindings}
                  onChange={(e) => setResultsFindings(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-vertical text-sm"
                  placeholder="Describe the imaging findings in detail..."
                />
              </div>

              {/* Impression */}
              <div>
                <label htmlFor="results-impression" className="block text-sm font-semibold text-gray-700 mb-1">
                  Impression <span className="text-danger-500">*</span>
                </label>
                <textarea
                  id="results-impression"
                  value={resultsImpression}
                  onChange={(e) => setResultsImpression(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-vertical text-sm"
                  placeholder="Summary impression / conclusion..."
                />
              </div>

              {/* Radiologist Notes */}
              <div>
                <label htmlFor="results-radiologist-notes" className="block text-sm font-semibold text-gray-700 mb-1">
                  Radiologist Notes
                </label>
                <textarea
                  id="results-radiologist-notes"
                  value={resultsRadiologistNotes}
                  onChange={(e) => setResultsRadiologistNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-vertical text-sm"
                  placeholder="Additional notes, recommendations, follow-up suggestions..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-between items-center">
              <button
                onClick={() => { setShowResultsModal(false); setResultsOrder(null); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-t-xl">
              <h3 className="text-lg font-bold text-gray-900">Add Imaging Studies</h3>
              <p className="text-sm text-gray-600 mt-0.5">{addStudyWalkin.patient_name} — {addStudyWalkin.encounter_number}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <input type="text" value={walkinImagingType} onChange={(e) => setWalkinImagingType(e.target.value)} placeholder="Imaging type (e.g., X-Ray, CT Scan, Ultrasound)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-secondary-500" />
                <input type="text" value={walkinBodyPart} onChange={(e) => setWalkinBodyPart(e.target.value)} placeholder="Body part (optional)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-secondary-500" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={walkinPriority} onChange={(e) => setWalkinPriority(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                  <button onClick={() => { if (!walkinImagingType.trim()) return; setWalkinStudies([...walkinStudies, { imaging_type: walkinImagingType.trim(), body_part: walkinBodyPart.trim(), priority: walkinPriority }]); setWalkinImagingType(''); setWalkinBodyPart(''); }} className="px-3 py-2 bg-secondary-600 text-white rounded-lg text-sm font-medium hover:bg-secondary-700">+ Add to List</button>
                </div>
              </div>
              {walkinStudies.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {walkinStudies.map((s, idx) => (
                    <div key={idx} className="px-4 py-2.5 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-gray-900 text-sm">{s.imaging_type}</span>
                        {s.body_part && <span className="text-gray-500 text-sm ml-1">({s.body_part})</span>}
                        <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded ${s.priority === 'stat' ? 'bg-danger-100 text-danger-700' : s.priority === 'urgent' ? 'bg-warning-100 text-warning-700' : 'bg-gray-100 text-gray-600'}`}>{s.priority.toUpperCase()}</span>
                      </div>
                      <button onClick={() => setWalkinStudies(walkinStudies.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-danger-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-between items-center">
              <span className="text-sm text-gray-500">{walkinStudies.length} study(ies) staged</span>
              <div className="flex gap-2">
                <button onClick={() => setAddStudyWalkin(null)} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg text-sm">Cancel</button>
                <button onClick={handleSubmitWalkinStudies} disabled={walkinStudies.length === 0 || submittingWalkinStudies} className="px-4 py-2 bg-secondary-600 text-white font-medium rounded-lg hover:bg-secondary-700 text-sm disabled:opacity-50">{submittingWalkinStudies ? 'Creating...' : `Create ${walkinStudies.length} Order(s)`}</button>
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
