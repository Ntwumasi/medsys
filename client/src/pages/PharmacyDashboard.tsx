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

const PharmacyDashboard: React.FC = () => {
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
      const response = await apiClient.get('/department-routing/pharmacy/queue');
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
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pharmacy Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome, {user?.first_name} {user?.last_name}</p>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Pending Prescriptions</div>
            <div className="text-3xl font-bold text-yellow-600 mt-2">
              {routingRequests.filter(r => r.status === 'pending').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">In Progress</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {routingRequests.filter(r => r.status === 'in-progress').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Completed Today</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              {routingRequests.filter(r => r.status === 'completed').length}
            </div>
          </div>
        </div>

        {/* Routing Requests */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Pharmacy Requests</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {routingRequests.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                No pharmacy requests at this time
              </div>
            ) : (
              routingRequests.map((request) => (
                <div key={request.id} className="px-6 py-4 hover:bg-gray-50">
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
                          onClick={() => updateStatus(request.id, 'in-progress')}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                          Start
                        </button>
                      )}
                      {request.status === 'in-progress' && (
                        <button
                          onClick={() => updateStatus(request.id, 'completed')}
                          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
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
      </div>
    </div>
  );
};

export default PharmacyDashboard;
