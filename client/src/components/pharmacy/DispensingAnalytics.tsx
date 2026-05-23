import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, subDays } from 'date-fns';
import apiClient from '../../api/client';
import { StatCard } from '../ui';
import InsightCard from '../ui/InsightCard';
import type { SparkPoint } from '../ui/Sparkline';

interface AnalyticsData {
  hourly: { hour: number; count: number; total_quantity: number }[];
  daily: { date: string; orders_count: number; unique_patients: number; total_units: number }[];
  topMedications: { medication_name: string; order_count: number; total_units: number }[];
  byPriority: { priority: string; count: number }[];
  summary: {
    total_dispensed: number;
    unique_patients: number;
    total_units: number;
    avg_turnaround_minutes: number | null;
  };
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

const DispensingAnalytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });

  // 30-day trends, independent of the date-range picker — the
  // sparklines always show the most recent 30 days so the trend stays
  // meaningful even when the user is exploring older windows.
  const [pharmacyTrends, setPharmacyTrends] = useState<{
    dispensed_count: SparkPoint[];
    unique_patients: SparkPoint[];
    total_units: SparkPoint[];
    avg_turnaround_minutes: SparkPoint[];
  } | null>(null);

  useEffect(() => {
    apiClient
      .get('/pharmacy/trends?days=30')
      .then((res) => {
        const s = res.data.series;
        const map = (arr: Array<{ day: string; value: number }>): SparkPoint[] =>
          arr.map((p) => ({ label: p.day, value: p.value }));
        setPharmacyTrends({
          dispensed_count: map(s.dispensed_count),
          unique_patients: map(s.unique_patients),
          total_units: map(s.total_units),
          avg_turnaround_minutes: map(s.avg_turnaround_minutes),
        });
      })
      .catch((err) => console.error('Failed to load pharmacy trends:', err));
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/analytics/dispensing', {
        params: { from_date: dateRange.from, to_date: dateRange.to },
      });
      setData(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Format hourly data for 24-hour display
  const formatHourlyData = () => {
    if (!data?.hourly) return [];
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      count: 0,
      total_quantity: 0,
    }));
    data.hourly.forEach((h) => {
      hours[h.hour] = { ...hours[h.hour], count: h.count, total_quantity: h.total_quantity };
    });
    return hours;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <button
          onClick={fetchAnalytics}
          className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Dispensed"
          value={data?.summary?.total_dispensed || 0}
          variant={(data?.summary?.total_dispensed || 0) > 0 ? 'primary' : 'neutral'}
          series={pharmacyTrends?.dispensed_count}
          trendDirection="up-is-good"
        />
        <StatCard
          title="Unique Patients"
          value={data?.summary?.unique_patients || 0}
          variant={(data?.summary?.unique_patients || 0) > 0 ? 'secondary' : 'neutral'}
          series={pharmacyTrends?.unique_patients}
          trendDirection="up-is-good"
        />
        <StatCard
          title="Total Units"
          value={data?.summary?.total_units || 0}
          variant={(data?.summary?.total_units || 0) > 0 ? 'success' : 'neutral'}
          series={pharmacyTrends?.total_units}
          trendDirection="up-is-good"
        />
        <StatCard
          title="Avg Turnaround"
          value={data?.summary?.avg_turnaround_minutes ? `${data.summary.avg_turnaround_minutes} min` : 'N/A'}
          variant={data?.summary?.avg_turnaround_minutes ? 'info' : 'neutral'}
          series={pharmacyTrends?.avg_turnaround_minutes}
          trendDirection="up-is-bad"
          trendMode="avg"
        />
      </div>

      {/* Auto-derived insight on turnaround. Heuristic: > 20 min average
          is worth a nudge; < 5 min is worth celebrating. */}
      {(() => {
        const tat = data?.summary?.avg_turnaround_minutes || 0;
        const total = data?.summary?.total_dispensed || 0;
        if (total === 0) return null;
        if (tat >= 20) {
          return (
            <InsightCard
              tone="warning"
              title={`Average dispense turnaround is ${tat} minutes`}
              body="Patients waiting >15 min for a routine fill is worth examining. Check the queue depth at peak hours and whether OTC/walk-ins are being routed correctly."
            />
          );
        }
        if (tat > 0 && tat < 5) {
          return (
            <InsightCard
              tone="positive"
              title={`Fast dispense turnaround at ${tat} minutes`}
              body={`${total} orders dispensed in the window with strong throughput. Keep it up.`}
            />
          );
        }
        return null;
      })()}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Volume Chart */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Hourly Dispensing (Last 24h)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={formatHourlyData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Trends Chart */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Daily Dispensing Trends</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data?.daily || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => format(new Date(value), 'MM/dd')}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
              />
              <Line type="monotone" dataKey="orders_count" stroke="#3b82f6" name="Orders" strokeWidth={2} />
              <Line type="monotone" dataKey="unique_patients" stroke="#10b981" name="Patients" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Medications Chart */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 Medications</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data?.topMedications || []}
              layout="vertical"
              margin={{ left: 100 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="medication_name"
                tick={{ fontSize: 11 }}
                width={100}
              />
              <Tooltip />
              <Bar dataKey="total_units" fill="#8b5cf6" name="Units Dispensed" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Distribution Chart */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Orders by Priority</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data?.byPriority || []}
                dataKey="count"
                nameKey="priority"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {(data?.byPriority || []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DispensingAnalytics;
