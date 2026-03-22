import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import apiClient from '../api/client';
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
} from 'recharts';
import { Skeleton, CardSkeleton, GradientCardSkeleton, LineChartSkeleton, ChartSkeleton } from './Skeleton';

interface LineItemDetail {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_name: string;
  patient_number: string;
  description: string;
  quantity: number;
  unit_price: string;
  total_price: string;
}

interface DepartmentRevenueData {
  department: string;
  period: string;
  summary: {
    total_orders: number;
    total_revenue: string;
    active_days: number;
    avg_order_value: string;
    percent_change: string;
    trend: 'up' | 'down';
  };
  daily_revenue: Array<{
    date: string;
    order_count: number;
    revenue: string;
  }>;
  top_items: Array<{
    description: string;
    times_billed: number;
    total_revenue: string;
    avg_price: string;
  }>;
}

// Skeleton for department finances
const DepartmentFinancesSkeleton: React.FC = () => (
  <div className="space-y-6">
    {/* Header skeleton */}
    <div className="flex items-center justify-between">
      <Skeleton className="h-7 w-48" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
    </div>

    {/* Summary cards skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <GradientCardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>

    {/* Chart skeleton */}
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <Skeleton className="h-6 w-32 mb-4" />
      <LineChartSkeleton />
    </div>

    {/* Top items skeleton */}
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <Skeleton className="h-6 w-40 mb-4" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

interface Props {
  department: 'lab' | 'pharmacy' | 'imaging' | 'nursing';
  title?: string;
}

const CHART_COLORS = {
  primary: '#5BC5C8',
  secondary: '#8E4585',
  success: '#10B981',
  warning: '#F59E0B',
};

const DEPARTMENT_COLORS: Record<string, string> = {
  lab: CHART_COLORS.secondary,
  pharmacy: CHART_COLORS.success,
  imaging: CHART_COLORS.warning,
  nursing: CHART_COLORS.primary,
};

const formatCurrency = (value: number | string) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

const DepartmentFinances: React.FC<Props> = ({ department, title }) => {
  const [data, setData] = useState<DepartmentRevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  // Drill-down state
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItemDetail[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const [showDrillDown, setShowDrillDown] = useState(false);

  const departmentColor = DEPARTMENT_COLORS[department] || CHART_COLORS.primary;

  useEffect(() => {
    loadData();
  }, [department, period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/accountant/department/${department}/revenue`, {
        params: { period },
      });
      setData(response.data);
    } catch (error) {
      console.error('Error loading department revenue:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLineItems = async (itemDescription: string) => {
    setLineItemsLoading(true);
    setSelectedItem(itemDescription);
    setShowDrillDown(true);
    try {
      const response = await apiClient.get(`/accountant/department/${department}/line-items`, {
        params: { period, description: itemDescription },
      });
      setLineItems(response.data.items || []);
    } catch (error) {
      console.error('Error loading line items:', error);
      setLineItems([]);
    } finally {
      setLineItemsLoading(false);
    }
  };

  const closeDrillDown = () => {
    setShowDrillDown(false);
    setSelectedItem(null);
    setLineItems([]);
  };

  if (loading) {
    return <DepartmentFinancesSkeleton />;
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Unable to load revenue data</p>
      </div>
    );
  }

  const totalRevenue = parseFloat(data.summary.total_revenue || '0');
  const percentChange = parseFloat(data.summary.percent_change || '0');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          {title || `${department.charAt(0).toUpperCase() + department.slice(1)} Revenue`}
        </h2>
        <div className="flex gap-2">
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'year', label: 'This Year' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                period === p.id
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={period === p.id ? { backgroundColor: departmentColor } : {}}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          className="rounded-xl p-5 text-white"
          style={{ background: `linear-gradient(135deg, ${departmentColor}, ${departmentColor}dd)` }}
        >
          <p className="text-sm opacity-90">Total Revenue</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalRevenue)}</p>
          <div className="flex items-center mt-2 text-sm">
            {data.summary.trend === 'up' ? (
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            ) : (
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
            <span>{Math.abs(percentChange).toFixed(1)}% vs previous</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary.total_orders || 0}</p>
          <p className="text-xs text-gray-400 mt-2">Billable items</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">Avg Order Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(data.summary.avg_order_value || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-2">Per item</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">Active Days</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary.active_days || 0}</p>
          <p className="text-xs text-gray-400 mt-2">With revenue</p>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Revenue</h3>
        {data.daily_revenue.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily_revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => {
                    try {
                      return format(parseISO(value), 'MMM d');
                    } catch {
                      return value;
                    }
                  }}
                  stroke="#6B7280"
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value) => `${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                  stroke="#6B7280"
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value as number), 'Revenue']}
                  labelFormatter={(label) => {
                    try {
                      return format(parseISO(label), 'MMMM d, yyyy');
                    } catch {
                      return label;
                    }
                  }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={departmentColor}
                  strokeWidth={2}
                  dot={{ fill: departmentColor, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              <p className="text-gray-500">No revenue data for this period</p>
            </div>
          </div>
        )}
      </div>

      {/* Top Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Items by Revenue</h3>
        {data.top_items.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top_items.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => `${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                    stroke="#6B7280"
                    fontSize={12}
                  />
                  <YAxis
                    type="category"
                    dataKey="description"
                    width={150}
                    stroke="#6B7280"
                    fontSize={11}
                    tickFormatter={(value) => value.length > 20 ? value.substring(0, 20) + '...' : value}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value as number), 'Revenue']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                  />
                  <Bar dataKey="total_revenue" fill={departmentColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {data.top_items.slice(0, 5).map((item, idx) => {
                const maxRevenue = Math.max(...data.top_items.map((i) => parseFloat(i.total_revenue)));
                const percentage = (parseFloat(item.total_revenue) / maxRevenue) * 100;
                return (
                  <button
                    key={idx}
                    onClick={() => loadLineItems(item.description)}
                    className="w-full text-left space-y-1 p-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold text-white rounded-full w-5 h-5 flex items-center justify-center"
                          style={{ backgroundColor: departmentColor }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-sm text-gray-700 truncate max-w-[200px] group-hover:text-gray-900">{item.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{formatCurrency(item.total_revenue)}</span>
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: departmentColor }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-12">{item.times_billed}x</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">No items billed this period</p>
            </div>
          </div>
        )}
      </div>

      {/* Drill-down Modal */}
      {showDrillDown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div
              className="px-6 py-4 text-white flex items-center justify-between"
              style={{ backgroundColor: departmentColor }}
            >
              <div>
                <h3 className="text-lg font-semibold">Line Item Details</h3>
                <p className="text-sm opacity-90">{selectedItem}</p>
              </div>
              <button
                onClick={closeDrillDown}
                className="p-1 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {lineItemsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="animate-pulse flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40 flex-1" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : lineItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No line items found for this period</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="mb-4 p-4 rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Total Transactions: <span className="font-semibold text-gray-900">{lineItems.length}</span></span>
                      <span className="text-gray-600">Total Revenue: <span className="font-semibold text-gray-900">{formatCurrency(lineItems.reduce((sum, item) => sum + parseFloat(item.total_price), 0))}</span></span>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {lineItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-600">
                              {(() => {
                                try {
                                  return format(parseISO(item.invoice_date), 'MMM d, yyyy');
                                } catch {
                                  return item.invoice_date;
                                }
                              })()}
                            </td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.invoice_number}</td>
                            <td className="px-3 py-2">
                              <div className="text-sm text-gray-900">{item.patient_name}</div>
                              <div className="text-xs text-gray-500">{item.patient_number}</div>
                            </td>
                            <td className="px-3 py-2 text-sm text-right text-gray-600">{item.quantity}</td>
                            <td className="px-3 py-2 text-sm text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                            <td className="px-3 py-2 text-sm text-right font-semibold text-gray-900">{formatCurrency(item.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={closeDrillDown}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentFinances;
