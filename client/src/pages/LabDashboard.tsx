import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

interface LabOrder {
  id: number;
  encounter_id: number;
  patient_id: number;
  test_name: string;
  test_code?: string;
  priority: 'stat' | 'urgent' | 'routine';
  status: string;
  ordered_at: string;
  patient_name: string;
  patient_number: string;
  encounter_number: string;
  ordering_provider_name: string;
  specimen_collected_at?: string;
  results_available_at?: string;
}

const LabDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLabOrders();
    // Poll for new orders every 30 seconds
    const interval = setInterval(fetchLabOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLabOrders = async () => {
    try {
      const response = await apiClient.get('/orders/lab');
      const orders = response.data.lab_orders || [];

      // Sort by priority: stat first, then urgent, then routine
      const sortedOrders = orders.sort((a: LabOrder, b: LabOrder) => {
        const priorityOrder = { stat: 0, urgent: 1, routine: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      setLabOrders(sortedOrders);
    } catch (error) {
      console.error('Error fetching lab orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: number, status: string) => {
    try {
      await apiClient.put(`/orders/lab/${orderId}`, {
        status: status,
      });
      fetchLabOrders();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-emerald-100 text-emerald-800';
      case 'cancelled':
        return 'bg-slate-100 text-slate-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getPriorityBadgeClass = (priority: 'stat' | 'urgent' | 'routine') => {
    switch (priority) {
      case 'stat':
        return 'bg-red-100 text-red-800 border-2 border-red-500';
      case 'urgent':
        return 'bg-amber-100 text-amber-800 border-2 border-amber-500';
      case 'routine':
        return 'bg-slate-100 text-slate-800 border border-slate-400';
      default:
        return 'bg-slate-100 text-slate-800 border border-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Modern Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-full mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Lab Dashboard
                </h1>
                <p className="text-blue-100 text-sm">
                  Welcome, {user?.first_name} {user?.last_name}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-full mx-auto px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Pending Orders</div>
            <div className="text-3xl font-bold text-amber-600 mt-2">
              {labOrders.filter(o => o.status === 'pending').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">In Progress</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {labOrders.filter(o => o.status === 'in_progress').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Completed Today</div>
            <div className="text-3xl font-bold text-emerald-600 mt-2">
              {labOrders.filter(o => o.status === 'completed').length}
            </div>
          </div>
        </div>

        {/* Lab Orders */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 rounded-t-xl">
            <h2 className="text-xl font-bold text-gray-900">Lab Orders</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {labOrders.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <p className="font-medium">No lab orders at this time</p>
              </div>
            ) : (
              labOrders.map((order) => (
                <div key={order.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {order.patient_name}
                        </h3>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${getPriorityBadgeClass(order.priority)}`}>
                          {order.priority.toUpperCase()}
                        </span>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(order.status)}`}>
                          {order.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="mb-3">
                        <div className="text-md font-semibold text-blue-700">
                          Test: {order.test_name}
                          {order.test_code && <span className="text-sm text-gray-600 ml-2">({order.test_code})</span>}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Ordered by: {order.ordering_provider_name}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Patient #:</span>
                          <span className="ml-2 text-gray-900 font-medium">{order.patient_number}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Encounter #:</span>
                          <span className="ml-2 text-gray-900 font-medium">{order.encounter_number}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Ordered:</span>
                          <span className="ml-2 text-gray-900 font-medium">
                            {new Date(order.ordered_at).toLocaleString()}
                          </span>
                        </div>
                        {order.specimen_collected_at && (
                          <div>
                            <span className="text-gray-500">Specimen Collected:</span>
                            <span className="ml-2 text-gray-900 font-medium">
                              {new Date(order.specimen_collected_at).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex gap-2">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => updateStatus(order.id, 'in_progress')}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Start
                        </button>
                      )}
                      {order.status === 'in_progress' && (
                        <button
                          onClick={() => updateStatus(order.id, 'completed')}
                          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default LabDashboard;
