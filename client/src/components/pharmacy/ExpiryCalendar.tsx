import React, { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import apiClient from '../../api/client';

interface BatchExpiry {
  id: number;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  medication_name: string;
  inventory_id: number;
  status: 'expired' | 'critical' | 'warning' | 'ok';
}

interface CalendarData {
  batches: BatchExpiry[];
  byDate: Record<string, BatchExpiry[]>;
  summary: {
    expired_count: number;
    critical_count: number;
    warning_count: number;
  };
  year: number;
  month: number;
}

const ExpiryCalendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/inventory/expiry-calendar', {
        params: {
          year: currentDate.getFullYear(),
          month: currentDate.getMonth() + 1,
        },
      });
      setData(response.data);
    } catch (error) {
      console.error('Error fetching expiry calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <button
        onClick={() => setCurrentDate(subMonths(currentDate, 1))}
        className="p-2 hover:bg-gray-100 rounded-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="text-xl font-semibold text-gray-800">
        {format(currentDate, 'MMMM yyyy')}
      </h2>
      <button
        onClick={() => setCurrentDate(addMonths(currentDate, 1))}
        className="p-2 hover:bg-gray-100 rounded-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map((day) => (
          <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const dateKey = format(day, 'yyyy-MM-dd');
        const batches = data?.byDate[dateKey] || [];
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isToday = isSameDay(day, new Date());
        const isSelected = selectedDate === dateKey;

        // Count by status
        const expiredCount = batches.filter((b) => b.status === 'expired').length;
        const criticalCount = batches.filter((b) => b.status === 'critical').length;
        const warningCount = batches.filter((b) => b.status === 'warning').length;

        days.push(
          <div
            key={day.toString()}
            onClick={() => batches.length > 0 && setSelectedDate(isSelected ? null : dateKey)}
            className={`
              min-h-[80px] p-1 border border-gray-200 cursor-pointer transition-colors
              ${!isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white'}
              ${isToday ? 'ring-2 ring-primary-500' : ''}
              ${isSelected ? 'bg-primary-50' : ''}
              ${batches.length > 0 ? 'hover:bg-gray-50' : ''}
            `}
          >
            <div className="text-right text-sm mb-1">{format(day, 'd')}</div>
            {batches.length > 0 && (
              <div className="space-y-0.5">
                {expiredCount > 0 && (
                  <div className="text-xs bg-red-100 text-red-700 rounded px-1 truncate">
                    {expiredCount} expired
                  </div>
                )}
                {criticalCount > 0 && (
                  <div className="text-xs bg-orange-100 text-orange-700 rounded px-1 truncate">
                    {criticalCount} critical
                  </div>
                )}
                {warningCount > 0 && (
                  <div className="text-xs bg-yellow-100 text-yellow-700 rounded px-1 truncate">
                    {warningCount} warning
                  </div>
                )}
              </div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7">
          {days}
        </div>
      );
      days = [];
    }
    return <div>{rows}</div>;
  };

  const renderSummary = () => (
    <div className="grid grid-cols-3 gap-4 mb-4">
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-red-600">{data?.summary?.expired_count || 0}</div>
        <div className="text-sm text-red-700">Expired</div>
      </div>
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-orange-600">{data?.summary?.critical_count || 0}</div>
        <div className="text-sm text-orange-700">Critical (&lt;30 days)</div>
      </div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-yellow-600">{data?.summary?.warning_count || 0}</div>
        <div className="text-sm text-yellow-700">Warning (&lt;90 days)</div>
      </div>
    </div>
  );

  const renderSelectedDateDetails = () => {
    if (!selectedDate || !data?.byDate[selectedDate]) return null;

    const batches = data.byDate[selectedDate];
    return (
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Batches Expiring on {format(new Date(selectedDate), 'MMMM d, yyyy')}
        </h3>
        <div className="space-y-2">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                batch.status === 'expired'
                  ? 'bg-red-50 border border-red-200'
                  : batch.status === 'critical'
                  ? 'bg-orange-50 border border-orange-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              <div>
                <div className="font-medium text-gray-900">{batch.medication_name}</div>
                <div className="text-sm text-gray-500">Batch: {batch.batch_number}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{batch.quantity} units</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    batch.status === 'expired'
                      ? 'bg-red-200 text-red-800'
                      : batch.status === 'critical'
                      ? 'bg-orange-200 text-orange-800'
                      : 'bg-yellow-200 text-yellow-800'
                  }`}
                >
                  {batch.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      {renderSummary()}
      {renderHeader()}
      {renderDays()}
      {renderCells()}
      {renderSelectedDateDetails()}
    </div>
  );
};

export default ExpiryCalendar;
