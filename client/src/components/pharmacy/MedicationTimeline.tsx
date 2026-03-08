import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import apiClient from '../../api/client';

interface TimelineEntry {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  quantity: string;
  start_date: string;
  dispensed_date: string | null;
  status: string;
  notes: string | null;
  prescriber_name: string;
}

interface ActiveMedication {
  medication_name: string;
  dosage: string;
  frequency: string;
  last_dispensed: string;
}

interface MedicationTimelineProps {
  patientId: number;
}

const MedicationTimeline: React.FC<MedicationTimelineProps> = ({ patientId }) => {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [activeMeds, setActiveMeds] = useState<ActiveMedication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (patientId) {
      fetchTimeline();
    }
  }, [patientId]);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/patients/${patientId}/medication-timeline`);
      setTimeline(response.data.timeline || []);
      setActiveMeds(response.data.activeMedications || []);
    } catch (error) {
      console.error('Error fetching medication timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'dispensed':
        return 'bg-green-500';
      case 'ready':
        return 'bg-blue-500';
      case 'in_progress':
        return 'bg-yellow-500';
      case 'ordered':
        return 'bg-gray-400';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      dispensed: 'bg-green-100 text-green-800',
      ready: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      ordered: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Medications Summary */}
      {activeMeds.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-green-800 mb-2">
            Active Medications (Last 30 Days)
          </h4>
          <div className="flex flex-wrap gap-2">
            {activeMeds.map((med, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs"
              >
                {med.medication_name} {med.dosage}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No medication history found for this patient.
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

          <div className="space-y-4">
            {timeline.map((entry) => (
              <div key={entry.id} className="relative pl-10">
                {/* Timeline dot */}
                <div
                  className={`absolute left-2.5 w-3 h-3 rounded-full ${getStatusColor(entry.status)} ring-4 ring-white`}
                ></div>

                {/* Content card */}
                <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {entry.medication_name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(entry.status)}`}>
                          {entry.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {entry.dosage} | {entry.frequency} | Qty: {entry.quantity}
                      </div>
                      {entry.prescriber_name && (
                        <div className="text-xs text-gray-500 mt-1">
                          Prescribed by: {entry.prescriber_name}
                        </div>
                      )}
                      {entry.notes && (
                        <div className="text-xs text-gray-500 mt-1 italic">
                          Note: {entry.notes}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div>Ordered: {format(new Date(entry.start_date), 'MMM d, yyyy')}</div>
                      {entry.dispensed_date && (
                        <div className="text-green-600">
                          Dispensed: {format(new Date(entry.dispensed_date), 'MMM d, yyyy')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicationTimeline;
