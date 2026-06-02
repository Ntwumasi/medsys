import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import AppLayout from '../components/AppLayout';
import { Badge } from '../components/ui';
import apiClient from '../api/client';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';

interface RefillData {
  id: number;
  medication_name: string;
  patient_name: string;
  patient_number: string;
  patient_phone?: string;
  refill_date: string;
  refills_remaining: number;
  quantity: number;
  days_supply?: number;
  frequency: string;
}

const RefillsCalendar: React.FC = () => {
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialog();
  const [refillsData, setRefillsData] = useState<RefillData[]>([]);
  const [refillsMonth, setRefillsMonth] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [processingRefill, setProcessingRefill] = useState<number | null>(null);

  // Manual "Add Refill" modal
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Array<{ id: number; full_name: string; patient_number: string }>>([]);
  const [addForm, setAddForm] = useState<{ patient_id: number | null; patient_label: string; medication_name: string; refill_date: string; quantity: string; frequency: string }>({
    patient_id: null, patient_label: '', medication_name: '', refill_date: '', quantity: '', frequency: '',
  });

  useEffect(() => {
    fetchRefillsCalendar();
  }, [refillsMonth]);

  useEffect(() => {
    if (patientQuery.trim().length < 2) { setPatientResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/search/patients?q=${encodeURIComponent(patientQuery.trim())}`);
        setPatientResults((res.data.patients || []).slice(0, 8));
      } catch { setPatientResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const openAddRefill = () => {
    setAddForm({ patient_id: null, patient_label: '', medication_name: '', refill_date: '', quantity: '', frequency: '' });
    setPatientQuery(''); setPatientResults([]); setShowAdd(true);
  };

  const submitManualRefill = async () => {
    if (!addForm.patient_id || !addForm.medication_name.trim() || !addForm.refill_date) {
      showToast('Patient, medication and refill date are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/pharmacy/refills/manual', {
        patient_id: addForm.patient_id,
        medication_name: addForm.medication_name.trim(),
        refill_date: addForm.refill_date,
        quantity: addForm.quantity || undefined,
        frequency: addForm.frequency || undefined,
      });
      showToast('Refill added to the calendar', 'success');
      setShowAdd(false);
      // Jump to the month of the new refill so it's visible
      setRefillsMonth(new Date(addForm.refill_date));
      fetchRefillsCalendar();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to add refill', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fetchRefillsCalendar = async () => {
    setLoading(true);
    try {
      const year = refillsMonth.getFullYear();
      const month = refillsMonth.getMonth() + 1;
      const response = await apiClient.get(`/pharmacy/refills?year=${year}&month=${month}`);
      setRefillsData(response.data.refills || []);
    } catch (error) {
      console.error('Error fetching refills:', error);
      setRefillsData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRefill = async (orderId: number, medicationName: string, patientName: string) => {
    if (!(await confirmDialog({
      title: 'Process refill?',
      message: `Process refill for ${medicationName} for ${patientName}?\n\nThis will create a new pharmacy order and decrement the refills remaining.`,
      confirmLabel: 'Process refill',
    }))) {
      return;
    }

    setProcessingRefill(orderId);
    try {
      const response = await apiClient.post(`/orders/pharmacy/${orderId}/refill`);
      showToast(`Refill processed successfully! New order #${response.data.new_order.id} created. ${response.data.refills_remaining} refills remaining.`, 'success');

      // Refresh the calendar to show updated refills count
      fetchRefillsCalendar();
    } catch (error: any) {
      console.error('Error processing refill:', error);
      const message = error.response?.data?.error || 'Failed to process refill';
      showToast(message, 'error');
    } finally {
      setProcessingRefill(null);
    }
  };

  return (
    <AppLayout title="Refills Calendar">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold">Medication Refills Calendar</h2>
            <p className="text-gray-500 text-sm">Track upcoming medication refills for patients</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const newDate = new Date(refillsMonth);
                newDate.setMonth(newDate.getMonth() - 1);
                setRefillsMonth(newDate);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-medium text-lg min-w-[150px] text-center">
              {format(refillsMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => {
                const newDate = new Date(refillsMonth);
                newDate.setMonth(newDate.getMonth() + 1);
                setRefillsMonth(newDate);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setRefillsMonth(new Date())}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
            >
              Today
            </button>
            <button
              onClick={openAddRefill}
              className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Refill
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-success-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading refills...</p>
          </div>
        ) : (
          <>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center py-2 font-medium text-gray-500 text-sm bg-gray-50 rounded">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const year = refillsMonth.getFullYear();
                const month = refillsMonth.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const today = new Date();

                const days = [];

                // Empty cells for days before the first of the month
                for (let i = 0; i < firstDay; i++) {
                  days.push(<div key={`empty-${i}`} className="min-h-28 bg-gray-50 rounded-lg"></div>);
                }

                // Days of the month
                for (let day = 1; day <= daysInMonth; day++) {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayRefills = refillsData.filter(r => r.refill_date?.startsWith(dateStr));
                  const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
                  const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                  days.push(
                    <div
                      key={day}
                      className={`min-h-28 p-2 rounded-lg border ${
                        isToday ? 'border-success-500 bg-success-50 ring-2 ring-success-200' :
                        isPast ? 'border-gray-100 bg-gray-50' :
                        'border-gray-200 bg-white'
                      } hover:shadow-md transition-shadow`}
                    >
                      <div className={`text-sm font-medium ${
                        isToday ? 'text-success-700' :
                        isPast ? 'text-gray-400' :
                        'text-gray-700'
                      }`}>
                        {day}
                      </div>
                      <div className="mt-1 space-y-1 max-h-20 overflow-y-auto">
                        {dayRefills.slice(0, 3).map((refill, idx) => (
                          <div
                            key={idx}
                            className={`text-xs rounded px-1.5 py-0.5 truncate cursor-pointer hover:opacity-80 ${
                              isPast ? 'bg-orange-100 text-orange-700' : 'bg-primary-100 text-primary-800'
                            }`}
                            title={`${refill.patient_name}: ${refill.medication_name} (${refill.refills_remaining} refills left)`}
                          >
                            {refill.patient_name?.split(' ')[0]}
                          </div>
                        ))}
                        {dayRefills.length > 3 && (
                          <div className="text-xs text-gray-500 font-medium">
                            +{dayRefills.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return days;
              })()}
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="bg-primary-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-primary-600">{refillsData.length}</p>
                <p className="text-xs text-primary-700">Total Refills</p>
              </div>
              <div className="bg-warning-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-warning-600">
                  {refillsData.filter(r => {
                    const refillDate = new Date(r.refill_date);
                    const today = new Date();
                    return refillDate <= today;
                  }).length}
                </p>
                <p className="text-xs text-warning-700">Overdue</p>
              </div>
              <div className="bg-success-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-success-600">
                  {refillsData.filter(r => {
                    const refillDate = new Date(r.refill_date);
                    const today = new Date();
                    const nextWeek = new Date(today);
                    nextWeek.setDate(today.getDate() + 7);
                    return refillDate > today && refillDate <= nextWeek;
                  }).length}
                </p>
                <p className="text-xs text-success-700">This Week</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-600">
                  {new Set(refillsData.map(r => r.patient_number)).size}
                </p>
                <p className="text-xs text-gray-700">Patients</p>
              </div>
            </div>

            {/* Upcoming Refills List */}
            <div className="mt-8">
              <h3 className="font-semibold text-gray-900 mb-4">Refills This Month</h3>
              {refillsData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medication</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Refill Date</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Refills Left</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {refillsData.map((refill, idx) => {
                        const refillDate = new Date(refill.refill_date);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const isOverdue = refillDate < today;
                        const isToday = refillDate.toDateString() === today.toDateString();

                        return (
                          <tr key={idx} className={`hover:bg-gray-50 ${isOverdue ? 'bg-orange-50' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{refill.patient_name}</div>
                              <div className="text-sm text-gray-500">{refill.patient_number}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{refill.medication_name}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={isOverdue ? 'text-orange-600 font-medium' : isToday ? 'text-success-600 font-medium' : 'text-gray-600'}>
                                {format(refillDate, 'MMM dd, yyyy')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={refill.refills_remaining > 1 ? 'success' : refill.refills_remaining === 1 ? 'warning' : 'danger'}>
                                {refill.refills_remaining}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isOverdue ? (
                                <Badge variant="warning">Overdue</Badge>
                              ) : isToday ? (
                                <Badge variant="success">Due Today</Badge>
                              ) : (
                                <Badge variant="gray">Upcoming</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleProcessRefill(refill.id, refill.medication_name, refill.patient_name)}
                                disabled={processingRefill === refill.id}
                                className="px-3 py-1.5 bg-success-600 text-white text-xs font-medium rounded-lg hover:bg-success-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 mx-auto"
                              >
                                {processingRefill === refill.id ? (
                                  <>
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Process Refill
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-lg font-medium">No refills scheduled this month</p>
                  <p className="text-sm">Refills are calculated based on dispensed medications with remaining refills</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowAdd(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Refill to Calendar</h3>
              <div className="space-y-4">
                {/* Patient search */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
                  {addForm.patient_id ? (
                    <div className="flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                      <span className="text-sm text-gray-900">{addForm.patient_label}</span>
                      <button onClick={() => { setAddForm({ ...addForm, patient_id: null, patient_label: '' }); setPatientQuery(''); }} className="text-xs text-gray-500 hover:text-gray-700">Change</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)}
                        placeholder="Search name or patient number…" autoFocus
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:outline-none"
                      />
                      {patientResults.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                          {patientResults.map((p) => (
                            <button key={p.id}
                              onClick={() => { setAddForm({ ...addForm, patient_id: p.id, patient_label: `${p.full_name} (${p.patient_number})` }); setPatientResults([]); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                              <span className="text-gray-900">{p.full_name}</span> <span className="text-gray-400">{p.patient_number}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medication *</label>
                  <input type="text" value={addForm.medication_name}
                    onChange={(e) => setAddForm({ ...addForm, medication_name: e.target.value })}
                    placeholder="e.g. Amlodipine 5mg"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Refill Date *</label>
                  <input type="date" value={addForm.refill_date}
                    onChange={(e) => setAddForm({ ...addForm, refill_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input type="text" value={addForm.quantity}
                      onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <input type="text" value={addForm.frequency}
                      onChange={(e) => setAddForm({ ...addForm, frequency: e.target.value })}
                      placeholder="e.g. OD, BD"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">Cancel</button>
                <button onClick={submitManualRefill} disabled={saving}
                  className="px-5 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 font-medium disabled:opacity-50">
                  {saving ? 'Adding…' : 'Add Refill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default RefillsCalendar;
