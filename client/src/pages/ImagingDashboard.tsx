import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import { StatCard, Card, Button, StatusBadge, EmptyState, SkeletonStatCard } from '../components/ui';

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

const ImagingDashboard: React.FC = () => {
  const [routingRequests, setRoutingRequests] = useState<RoutingRequest[]>([]);
  const [walkIns, setWalkIns] = useState<RoutingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'walkins' | 'orders'>('walkins');

  useEffect(() => {
    fetchRoutingRequests();
    fetchWalkIns();
    const interval = setInterval(() => {
      fetchRoutingRequests();
      fetchWalkIns();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRoutingRequests = async () => {
    try {
      const response = await apiClient.get('/department-routing/imaging/queue');
      setRoutingRequests(response.data.queue || []);
    } catch (error) {
      console.error('Error fetching routing requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWalkIns = async () => {
    try {
      const response = await apiClient.get('/department-routing/imaging/walk-ins');
      setWalkIns(response.data.walk_ins || []);
    } catch (error) {
      console.error('Error fetching imaging walk-ins:', error);
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

  const pendingCount = routingRequests.filter(r => r.status === 'pending').length;
  const inProgressCount = routingRequests.filter(r => r.status === 'in-progress').length;
  const completedCount = routingRequests.filter(r => r.status === 'completed').length;

  return (
    <AppLayout title="Imaging Dashboard">
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
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </>
        )}
      </div>

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
              {routingRequests.filter(r => r.status !== 'completed').length > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                  {routingRequests.filter(r => r.status !== 'completed').length}
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
      <Card>
        <Card.Header>Imaging Requests</Card.Header>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : routingRequests.length === 0 ? (
            <EmptyState
              title="No imaging requests"
              description="There are no imaging requests at this time. New requests will appear here."
              icon={
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              }
            />
          ) : (
            routingRequests.map((request) => (
              <div key={request.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {request.patient_name}
                      </h3>
                      <StatusBadge status={request.status} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                      <div className="mt-3 text-sm">
                        <span className="text-gray-500">Notes:</span>
                        <p className="text-gray-700 mt-1 bg-gray-50 rounded-lg p-2">{request.notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex gap-2">
                    {request.status === 'pending' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => updateStatus(request.id, 'in-progress')}
                      >
                        Start Study
                      </Button>
                    )}
                    {request.status === 'in-progress' && (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => updateStatus(request.id, 'completed')}
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
    </AppLayout>
  );
};

export default ImagingDashboard;
