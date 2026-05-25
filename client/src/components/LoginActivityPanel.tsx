import React, { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import apiClient from '../api/client';

// Admin viewer for login_attempts. The server has been logging every
// successful and failed login with IP and user-agent since the original
// auth-security migration — this just surfaces it.
//
// The clinic concern that motivated this: "someone may be leaking patient
// data to a competitor." This view answers two forensic questions:
//   1) Did anyone log in outside business hours, or from an unexpected
//      IP / device?
//   2) For a given user, where and when have they been logging in?

interface LoginAttempt {
  id: number;
  user_id: number | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
  latitude: number | string | null;
  longitude: number | string | null;
  geo_accuracy_m: number | null;
  geo_source: string | null;
  distance_from_clinic_m: number | null;
}

// Logins inside the clinic radius are "on-site"; anything farther is flagged.
// Mirrors CLINIC_RADIUS_M on the server (default 500m).
const ONSITE_RADIUS_M = 500;

const formatDistance = (m: number | null): string => {
  if (m === null || m === undefined) return '—';
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
};

const GEO_SOURCE_LABELS: Record<string, string> = {
  browser: 'GPS',
  denied: 'denied',
  unavailable: 'no GPS',
  timeout: 'no signal',
  ip: 'IP-based',
};

// Very lightweight UA parser — enough to show "Chrome on macOS" without
// pulling in a dep. Falls back to the raw UA if we don't recognise it.
const summarizeUserAgent = (ua: string | null): string => {
  if (!ua) return '—';
  let browser = 'Browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';

  let os = '';
  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
};

// Heuristic: "outside business hours" = before 06:00 or after 21:00
// Ghana time. Approximate, but enough to surface logins worth a second
// look. Geo/clinic-radius detection comes in a follow-up.
const isOffHours = (createdAt: string): boolean => {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Accra',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(createdAt)),
      10,
    );
    return hour < 6 || hour >= 21;
  } catch {
    return false;
  }
};

const FAILURE_LABELS: Record<string, string> = {
  user_not_found: 'Unknown user',
  invalid_password: 'Wrong password',
  account_locked: 'Account locked',
  account_disabled: 'Account disabled',
  max_attempts_reached: 'Too many attempts',
};

const LoginActivityPanel: React.FC = () => {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const [startDate, setStartDate] = useState(weekAgo.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'failed'>('all');
  const [filterUser, setFilterUser] = useState('');
  const [filterIp, setFilterIp] = useState('');
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAttempts = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '500' };
      if (startDate) params.start_date = startDate;
      if (endDate) {
        // Include the whole end day
        params.end_date = `${endDate}T23:59:59`;
      }
      if (filterSuccess !== 'all') params.success = String(filterSuccess === 'success');
      const res = await apiClient.get('/admin/login-attempts', { params });
      setAttempts(res.data.login_attempts || []);
    } catch (err) {
      console.error('Failed to load login activity:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side filters that don't need a round-trip
  const filtered = useMemo(() => {
    const userQ = filterUser.trim().toLowerCase();
    const ipQ = filterIp.trim().toLowerCase();
    return attempts.filter((a) => {
      if (userQ) {
        const name = `${a.first_name || ''} ${a.last_name || ''} ${a.email || ''}`.toLowerCase();
        if (!name.includes(userQ)) return false;
      }
      if (ipQ && !(a.ip_address || '').toLowerCase().includes(ipQ)) return false;
      return true;
    });
  }, [attempts, filterUser, filterIp]);

  const stats = useMemo(() => {
    let s = 0;
    let f = 0;
    let off = 0;
    let offsite = 0;
    const uniqUsers = new Set<number>();
    const uniqIps = new Set<string>();
    for (const a of filtered) {
      if (a.success) s++;
      else f++;
      if (isOffHours(a.created_at)) off++;
      if (a.distance_from_clinic_m !== null && a.distance_from_clinic_m > ONSITE_RADIUS_M) {
        offsite++;
      }
      if (a.user_id) uniqUsers.add(a.user_id);
      if (a.ip_address) uniqIps.add(a.ip_address);
    }
    return { s, f, off, offsite, uniqUsers: uniqUsers.size, uniqIps: uniqIps.size };
  }, [filtered]);

  const exportCsv = () => {
    const header = [
      'Timestamp (UTC)', 'User', 'Role', 'Email', 'IP', 'Device', 'Result', 'Reason',
      'Latitude', 'Longitude', 'Accuracy (m)', 'Geo source', 'Distance from clinic (m)',
    ];
    const rows = filtered.map((a) => [
      a.created_at,
      `${a.first_name || ''} ${a.last_name || ''}`.trim() || '—',
      a.role || '—',
      a.email || '—',
      a.ip_address || '—',
      summarizeUserAgent(a.user_agent),
      a.success ? 'success' : 'failed',
      a.success ? '' : FAILURE_LABELS[a.failure_reason || ''] || a.failure_reason || '',
      a.latitude ?? '',
      a.longitude ?? '',
      a.geo_accuracy_m ?? '',
      a.geo_source ?? '',
      a.distance_from_clinic_m ?? '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `login-activity-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Login Activity</h2>
          <p className="text-sm text-gray-600 mt-1">
            Every successful and failed login — who, when, from which IP and device.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm disabled:opacity-40 inline-flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Result</label>
          <select
            value={filterSuccess}
            onChange={(e) => setFilterSuccess(e.target.value as 'all' | 'success' | 'failed')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">User</label>
          <input
            type="text"
            placeholder="name or email"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">IP contains</label>
          <input
            type="text"
            placeholder="e.g. 196.249."
            value={filterIp}
            onChange={(e) => setFilterIp(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <div className="mb-4">
        <button
          onClick={fetchAttempts}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
        >
          Apply filters
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <StatCard label="Successful" value={stats.s} tone="success" />
        <StatCard label="Failed" value={stats.f} tone={stats.f > 0 ? 'danger' : 'neutral'} />
        <StatCard label="Off-hours" value={stats.off} tone={stats.off > 0 ? 'warning' : 'neutral'} note="Before 6am or after 9pm Ghana time" />
        <StatCard label="Off-site" value={stats.offsite} tone={stats.offsite > 0 ? 'warning' : 'neutral'} note={`> ${ONSITE_RADIUS_M}m from clinic`} />
        <StatCard label="Unique users" value={stats.uniqUsers} tone="neutral" />
        <StatCard label="Unique IPs" value={stats.uniqIps} tone={stats.uniqIps > 5 ? 'warning' : 'neutral'} />
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-500 text-sm">No login activity in this window.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Time (Ghana)</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">User</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Role</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">IP</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Location</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Device</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const ghTime = format(
                  new Date(
                    new Date(a.created_at).toLocaleString('en-US', { timeZone: 'Africa/Accra' }),
                  ),
                  'MMM d, h:mm a',
                );
                const offHours = isOffHours(a.created_at);
                const name = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email || 'Unknown';
                return (
                  <tr key={a.id} className={`border-t border-gray-100 hover:bg-gray-50 ${offHours ? 'bg-warning-50/50' : ''}`}>
                    <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                      {ghTime}
                      {offHours && (
                        <span
                          className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning-100 text-warning-700"
                          title="Login outside 6am–9pm Ghana time"
                        >
                          OFF-HRS
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-900 font-medium">{name}</td>
                    <td className="px-3 py-2 text-gray-700 text-xs capitalize">{a.role || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 font-mono text-xs">{a.ip_address || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {a.distance_from_clinic_m !== null && a.distance_from_clinic_m !== undefined ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                            a.distance_from_clinic_m > ONSITE_RADIUS_M
                              ? 'bg-warning-100 text-warning-700'
                              : 'bg-success-100 text-success-700'
                          }`}
                          title={
                            a.latitude && a.longitude
                              ? `Lat ${a.latitude}, Lon ${a.longitude}` +
                                (a.geo_accuracy_m ? ` (±${a.geo_accuracy_m}m)` : '')
                              : ''
                          }
                        >
                          {a.distance_from_clinic_m > ONSITE_RADIUS_M ? 'OFF-SITE' : 'ON-SITE'}
                          <span className="opacity-70">{formatDistance(a.distance_from_clinic_m)}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400" title={a.geo_source || ''}>
                          {a.geo_source ? GEO_SOURCE_LABELS[a.geo_source] || a.geo_source : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-xs" title={a.user_agent || ''}>
                      {summarizeUserAgent(a.user_agent)}
                    </td>
                    <td className="px-3 py-2">
                      {a.success ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success-100 text-success-700">
                          success
                        </span>
                      ) : (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full bg-danger-100 text-danger-700"
                          title={a.failure_reason || ''}
                        >
                          {FAILURE_LABELS[a.failure_reason || ''] || 'failed'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'warning' | 'neutral';
  note?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, tone, note }) => {
  const toneClass =
    tone === 'success'
      ? 'from-success-50 to-success-100 border-success-200 text-success-800'
      : tone === 'danger'
        ? 'from-danger-50 to-danger-100 border-danger-200 text-danger-800'
        : tone === 'warning'
          ? 'from-warning-50 to-warning-100 border-warning-200 text-warning-800'
          : 'from-gray-50 to-gray-100 border-gray-200 text-gray-800';
  return (
    <div className={`rounded-lg p-3 border bg-gradient-to-br ${toneClass}`}>
      <div className="text-xs font-semibold uppercase opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {note && <div className="text-[10px] opacity-70 mt-0.5">{note}</div>}
    </div>
  );
};

export default LoginActivityPanel;
