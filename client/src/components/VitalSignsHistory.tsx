import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

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

type ViewMode = 'list' | 'charts';

const VitalSignsHistory: React.FC<VitalSignsHistoryProps> = ({ patientId, onClose }) => {
  const [history, setHistory] = useState<VitalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

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

  const formatChartDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isValid(date)) {
        return format(date, 'MM/dd');
      }
      return '';
    } catch {
      return '';
    }
  };

  // Prepare chart data (reverse to show oldest first for trend visualization)
  const chartData = [...history].reverse().map((record) => ({
    date: formatChartDate(record.recorded_at),
    fullDate: formatDate(record.recorded_at),
    systolic: record.blood_pressure_systolic || null,
    diastolic: record.blood_pressure_diastolic || null,
    heartRate: record.heart_rate || null,
    temperature: record.temperature || null,
    spO2: record.oxygen_saturation || null,
    respRate: record.respiratory_rate || null,
    weight: record.weight || null,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">{payload[0]?.payload?.fullDate}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name}: {entry.value} {entry.unit || ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderCharts = () => {
    if (history.length < 2) {
      return (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <p className="text-lg font-medium">Not enough data for trends</p>
          <p className="text-sm mt-1">At least 2 vital sign recordings are needed to display charts</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Blood Pressure Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-danger-500"></div>
            Blood Pressure (mmHg)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis domain={[60, 180]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={120} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'Normal Sys', fontSize: 10, fill: '#fbbf24' }} />
                <ReferenceLine y={80} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'Normal Dia', fontSize: 10, fill: '#fbbf24' }} />
                <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 4 }} name="Systolic" connectNulls />
                <Line type="monotone" dataKey="diastolic" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} name="Diastolic" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heart Rate Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
            Heart Rate (bpm)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis domain={[40, 140]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={60} stroke="#fbbf24" strokeDasharray="5 5" />
                <ReferenceLine y={100} stroke="#fbbf24" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="heartRate" stroke="#ec4899" strokeWidth={2} dot={{ fill: '#ec4899', r: 4 }} name="Heart Rate" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Temperature & SpO2 Charts Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Temperature */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              Temperature (°F)
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis domain={[96, 104]} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={98.6} stroke="#22c55e" strokeDasharray="5 5" label={{ value: '98.6°F', fontSize: 9, fill: '#22c55e' }} />
                  <Line type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} name="Temperature" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SpO2 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary-500"></div>
              Oxygen Saturation (%)
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis domain={[85, 100]} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={95} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'Min Normal', fontSize: 9, fill: '#fbbf24' }} />
                  <Line type="monotone" dataKey="spO2" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 4 }} name="SpO2" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Respiratory Rate & Weight Charts Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Respiratory Rate */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
              Respiratory Rate (/min)
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis domain={[8, 30]} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={12} stroke="#fbbf24" strokeDasharray="5 5" />
                  <ReferenceLine y={20} stroke="#fbbf24" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="respRate" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 4 }} name="Resp Rate" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Weight */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-success-500"></div>
              Weight (lbs)
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="weight" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} name="Weight" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => (
    <div className="space-y-4">
      {history.map((record, index) => (
        <div
          key={record.id}
          className={`border rounded-xl p-4 ${
            index === 0 ? 'border-red-200 bg-danger-50' : 'border-gray-200 bg-white'
          }`}
        >
          {/* Record Header */}
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2">
                {index === 0 && (
                  <span className="bg-danger-500 text-white text-xs font-bold px-2 py-0.5 rounded">
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
              <div className="text-lg font-bold text-danger-600">
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
              <div className="text-lg font-bold text-primary-600">
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
              <div className="text-lg font-bold text-success-600">
                {record.weight || '--'}
                <span className="text-xs font-normal text-gray-500 ml-1">{record.weight_unit || 'lbs'}</span>
              </div>
            </div>

            {/* Height */}
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <div className="text-xs text-gray-500 font-medium mb-1">Height</div>
              <div className="text-lg font-bold text-secondary-600">
                {record.height || '--'}
                <span className="text-xs font-normal text-gray-500 ml-1">{record.height_unit || 'in'}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-danger-500 to-pink-500 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Vital Signs History
          </h2>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-white/20 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-danger-600'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                List
              </button>
              <button
                onClick={() => setViewMode('charts')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'charts'
                    ? 'bg-white text-danger-600'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                Trends
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-danger-500"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-lg font-medium">No vital signs history</p>
              <p className="text-sm mt-1">Vital signs will appear here once recorded</p>
            </div>
          ) : viewMode === 'charts' ? (
            renderCharts()
          ) : (
            renderList()
          )}
        </div>
      </div>
    </div>
  );
};

export default VitalSignsHistory;
