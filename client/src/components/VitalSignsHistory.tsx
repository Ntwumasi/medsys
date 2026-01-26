import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';

interface VitalRecord {
  id: number;
  encounter_id: number;
  encounter_number: string;
  temperature?: number;
  temperature_unit?: string;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  weight_unit?: string;
  height?: number;
  height_unit?: string;
  recorded_at: string;
  recorded_by_name?: string;
}

interface VitalSignsHistoryProps {
  patientId: number;
  onClose: () => void;
}

const VitalSignsHistory: React.FC<VitalSignsHistoryProps> = ({ patientId, onClose }) => {
  const [history, setHistory] = useState<VitalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get(`/workflow/vitals-history/${patientId}`);
        setHistory(res.data.history || []);
      } catch (error) {
        console.error('Error fetching vital signs history:', error);
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      fetchHistory();
    }
  }, [patientId]);

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isValid(date)) {
        return format(date, 'MMM d, yyyy h:mm a');
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-pink-500 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Vital Signs History
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-lg font-medium">No vital signs history</p>
              <p className="text-sm mt-1">Vital signs will appear here once recorded</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((record, index) => (
                <div
                  key={record.id}
                  className={`border rounded-xl p-4 ${
                    index === 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* Record Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                            LATEST
                          </span>
                        )}
                        <span className="text-sm font-semibold text-gray-700">
                          {formatDate(record.recorded_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Encounter: {record.encounter_number}
                        {record.recorded_by_name && ` | Recorded by: ${record.recorded_by_name}`}
                      </p>
                    </div>
                  </div>

                  {/* Vitals Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {/* Blood Pressure */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium mb-1">Blood Pressure</div>
                      <div className="text-lg font-bold text-red-600">
                        {record.blood_pressure_systolic && record.blood_pressure_diastolic
                          ? `${record.blood_pressure_systolic}/${record.blood_pressure_diastolic}`
                          : '--/--'}
                        <span className="text-xs font-normal text-gray-500 ml-1">mmHg</span>
                      </div>
                    </div>

                    {/* Heart Rate */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium mb-1">Heart Rate</div>
                      <div className="text-lg font-bold text-pink-600">
                        {record.heart_rate || '--'}
                        <span className="text-xs font-normal text-gray-500 ml-1">bpm</span>
                      </div>
                    </div>

                    {/* Temperature */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium mb-1">Temperature</div>
                      <div className="text-lg font-bold text-orange-600">
                        {record.temperature || '--'}
                        <span className="text-xs font-normal text-gray-500 ml-1">°{record.temperature_unit || 'F'}</span>
                      </div>
                    </div>

                    {/* SpO2 */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium mb-1">SpO2</div>
                      <div className="text-lg font-bold text-blue-600">
                        {record.oxygen_saturation || '--'}
                        <span className="text-xs font-normal text-gray-500 ml-1">%</span>
                      </div>
                    </div>

                    {/* Respiratory Rate */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium mb-1">Resp. Rate</div>
                      <div className="text-lg font-bold text-cyan-600">
                        {record.respiratory_rate || '--'}
                        <span className="text-xs font-normal text-gray-500 ml-1">/min</span>
                      </div>
                    </div>

                    {/* Weight */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium mb-1">Weight</div>
                      <div className="text-lg font-bold text-green-600">
                        {record.weight || '--'}
                        <span className="text-xs font-normal text-gray-500 ml-1">{record.weight_unit || 'lbs'}</span>
                      </div>
                    </div>

                    {/* Height */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium mb-1">Height</div>
                      <div className="text-lg font-bold text-purple-600">
                        {record.height || '--'}
                        <span className="text-xs font-normal text-gray-500 ml-1">{record.height_unit || 'in'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VitalSignsHistory;
