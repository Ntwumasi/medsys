import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

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

const LabDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [routingRequests, setRoutingRequests] = useState<RoutingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoutingRequests();
    // Poll for new requests every 30 seconds
    const interval = setInterval(fetchRoutingRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRoutingRequests = async () => {
    try {
      const response = await apiClient.get('/department-routing/lab/queue');
      setRoutingRequests(response.data.queue || []);
    } catch (error) {
      console.error('Error fetching routing requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (routingId: number, status: string) => {
    try {
      await apiClient.put(`/department-routing/${routingId}/status`, {
        status: status,
      });
      fetchRoutingRequests();
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
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Pending Requests</div>
            <div className="text-3xl font-bold text-amber-600 mt-2">
              {routingRequests.filter(r => r.status === 'pending').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">In Progress</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {routingRequests.filter(r => r.status === 'in_progress').length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Completed Today</div>
            <div className="text-3xl font-bold text-emerald-600 mt-2">
              {routingRequests.filter(r => r.status === 'completed').length}
            </div>
          </div>
        </div>

        {/* Routing Requests */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 rounded-t-xl">
            <h2 className="text-xl font-bold text-gray-900">Lab Requests</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {routingRequests.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <p className="font-medium">No lab requests at this time</p>
              </div>
            ) : (
              routingRequests.map((request) => (
                <div key={request.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.patient_name}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(request.status)}`}>
                          {request.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Patient #:</span>
                          <span className="ml-2 text-gray-900 font-medium">{request.patient_number}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Encounter #:</span>
                          <span className="ml-2 text-gray-900 font-medium">{request.encounter_number}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Room:</span>
                          <span className="ml-2 text-gray-900 font-medium">{request.room_number || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Requested:</span>
                          <span className="ml-2 text-gray-900 font-medium">
                            {new Date(request.routed_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {request.notes && (
                        <div className="mt-2 text-sm">
                          <span className="text-gray-500">Notes:</span>
                          <p className="text-gray-900 mt-1">{request.notes}</p>
                        </div>
                      )}
                    </div>
                    <div className="ml-4 flex gap-2">
                      {request.status === 'pending' && (
                        <button
                          onClick={() => updateStatus(request.id, 'in_progress')}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Start
                        </button>
                      )}
                      {request.status === 'in_progress' && (
                        <button
                          onClick={() => updateStatus(request.id, 'completed')}
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
