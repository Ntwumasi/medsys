import React from 'react';
import { Link } from 'react-router-dom';
import type { Appointment } from '../../types';
import { safeFormatDate } from '../../utils/age';
import { TableRowSkeleton } from '../Skeleton';

/**
 * Admin dashboard → Appointments tab. Same card / tab / table styling as the
 * rest of the site (it used to be the one MUI screen in the app).
 */

type SubTab = 'current' | 'future' | 'past';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'current', label: "Today's Appointments" },
  { id: 'future', label: 'Future Appointments' },
  { id: 'past', label: 'Past Appointments' },
];

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-primary-100 text-primary-800',
  confirmed: 'bg-success-100 text-success-800',
  'checked-in': 'bg-secondary-100 text-secondary-800',
  'in-progress': 'bg-secondary-100 text-secondary-800',
  completed: 'bg-success-100 text-success-800',
  cancelled: 'bg-danger-100 text-danger-800',
  'no-show': 'bg-warning-100 text-warning-800',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full capitalize ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-700'}`}>
    {status.replace('-', ' ')}
  </span>
);

const TH = 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase';
const TD = 'px-4 py-3 text-sm text-gray-700 whitespace-nowrap';

interface Props {
  subTab: SubTab;
  onSubTabChange: (tab: SubTab) => void;
  today: Appointment[];
  future: Appointment[];
  past: Appointment[];
  loadingToday: boolean;
  loadingFuture: boolean;
  loadingPast: boolean;
}

const AppointmentsPanel: React.FC<Props> = ({ subTab, onSubTabChange, today, future, past, loadingToday, loadingFuture, loadingPast }) => {
  const showDate = subTab !== 'current';
  const rows = subTab === 'current' ? today : subTab === 'future' ? future : past;
  const loading = subTab === 'current' ? loadingToday : subTab === 'future' ? loadingFuture : loadingPast;
  const empty =
    subTab === 'current' ? 'No appointments scheduled for today.'
      : subTab === 'future' ? 'No future appointments scheduled.'
        : 'No past appointments found.';
  const columns = showDate ? 6 : 5;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200">
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px overflow-x-auto" aria-label="Appointment views">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onSubTabChange(t.id)}
              aria-current={subTab === t.id ? 'page' : undefined}
              className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                subTab === t.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{SUB_TABS.find((t) => t.id === subTab)?.label}</h3>
          {subTab === 'current' && <p className="text-sm text-gray-500">{safeFormatDate(new Date().toISOString(), 'EEEE, MMMM d, yyyy')}</p>}
          {subTab === 'future' && <p className="text-sm text-gray-500">Upcoming scheduled appointments</p>}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className={TH}>{showDate ? 'Date & Time' : 'Time'}</th>
                <th className={TH}>Patient</th>
                <th className={TH}>Type</th>
                {showDate && <th className={TH}>Provider</th>}
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={columns} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns} className="px-4 py-12 text-center text-sm text-gray-500">{empty}</td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className={TD}>
                      {showDate ? (
                        <>
                          <div className="font-medium text-gray-900">{safeFormatDate(a.appointment_date, 'MMM d, yyyy')}</div>
                          <div className="text-xs text-gray-500">{safeFormatDate(a.appointment_date, 'h:mm a')}</div>
                        </>
                      ) : (
                        safeFormatDate(a.appointment_date, 'h:mm a')
                      )}
                    </td>
                    <td className={TD}>
                      <div className="font-medium text-gray-900">{a.patient_name}</div>
                      <div className="text-xs text-gray-500">{a.patient_number}</div>
                    </td>
                    <td className={TD}>{a.appointment_type || 'General'}</td>
                    {showDate && <td className={TD}>{a.provider_name || '—'}</td>}
                    <td className={TD}><StatusBadge status={a.status} /></td>
                    <td className={`${TD} text-right`}>
                      <Link to={`/patients/${a.patient_id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700">
                        View patient
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AppointmentsPanel;
