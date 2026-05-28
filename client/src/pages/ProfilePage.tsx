import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { authAPI } from '../api/auth';
import apiClient from '../api/client';
import AppLayout from '../components/AppLayout';
import { format } from 'date-fns';

interface ProfileData {
  id: number;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  phone: string;
  employee_id: string;
  username: string;
  created_at: string;
  last_login_at: string;
  password_changed_at: string;
  clinic: string;
}

interface LoginEntry {
  id: number;
  ip_address: string;
  success: boolean;
  attempted_at: string;
  user_agent: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const [profileRes, historyRes] = await Promise.all([
        apiClient.get('/auth/me'),
        authAPI.getLoginHistory().catch(() => ({ history: [] })),
      ]);
      setProfile(profileRes.data.user || profileRes.data);
      setLoginHistory((historyRes.history || historyRes || []).slice(0, 10));
      setPhoneValue(profileRes.data.user?.phone || profileRes.data?.phone || '');
    } catch {
      showToast('Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      await authAPI.changePassword({ current_password: currentPassword, new_password: newPassword });
      showToast('Password changed successfully', 'success');
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = (err && typeof err === 'object' && 'response' in err)
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to change password';
      showToast(msg || 'Failed to change password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleUpdatePhone = async () => {
    try {
      await apiClient.put(`/users/${user?.id}`, { phone: phoneValue });
      showToast('Phone number updated', 'success');
      setEditingPhone(false);
      loadProfile();
    } catch {
      showToast('Failed to update phone', 'error');
    }
  };

  const handleLogoutAllDevices = async () => {
    if (!(await confirm({
      title: 'Sign out everywhere?',
      message: 'This will invalidate all your active sessions on other devices. You will need to log in again.',
      variant: 'warning',
      confirmLabel: 'Sign out everywhere',
    }))) return;

    try {
      await apiClient.post('/auth/logout-all');
      showToast('All other sessions have been signed out', 'success');
    } catch {
      showToast('Failed to sign out other sessions', 'error');
    }
  };

  if (loading) {
    return (
      <AppLayout title="Profile">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </AppLayout>
    );
  }

  const passwordAge = profile?.password_changed_at
    ? Math.floor((Date.now() - new Date(profile.password_changed_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <AppLayout title="Profile">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Profile Header */}
        <div className="bg-white rounded-2xl shadow-card p-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-bold text-2xl">
              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {profile?.first_name} {profile?.last_name}
              </h1>
              <p className="text-gray-500 capitalize">{profile?.role?.replace('_', ' ')}</p>
              {profile?.clinic && (
                <p className="text-sm text-gray-400">{profile.clinic}</p>
              )}
              <p className="text-sm text-gray-400 mt-1">@{profile?.username || user?.email}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Account Details */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Account Details
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Username</span>
                <span className="text-sm font-medium text-gray-900">{profile?.username}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Email</span>
                <span className="text-sm font-medium text-gray-900">{profile?.email}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Phone</span>
                {editingPhone ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="tel"
                      value={phoneValue}
                      onChange={e => setPhoneValue(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-2 py-1 w-36 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                      autoFocus
                    />
                    <button onClick={handleUpdatePhone} className="text-xs text-primary-600 font-medium hover:underline">Save</button>
                    <button onClick={() => setEditingPhone(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{profile?.phone || 'Not set'}</span>
                    <button onClick={() => setEditingPhone(true)} className="text-xs text-primary-500 hover:underline">Edit</button>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Employee ID</span>
                <span className="text-sm font-medium text-gray-900">{profile?.employee_id || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">Member since</span>
                <span className="text-sm font-medium text-gray-900">
                  {profile?.created_at ? format(new Date(profile.created_at), 'MMM d, yyyy') : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Security
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <div>
                  <p className="text-sm text-gray-900 font-medium">Password</p>
                  <p className="text-xs text-gray-400">
                    {passwordAge !== null ? (
                      passwordAge > 75
                        ? <span className="text-amber-600">Changed {passwordAge} days ago — expires soon</span>
                        : `Changed ${passwordAge} days ago`
                    ) : 'Never changed'}
                  </p>
                </div>
                <button
                  onClick={() => setShowChangePassword(!showChangePassword)}
                  className="text-sm text-primary-600 font-medium hover:underline"
                >
                  Change
                </button>
              </div>

              {showChangePassword && (
                <form onSubmit={handleChangePassword} className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    required
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    required
                    minLength={8}
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    required
                  />
                  <p className="text-xs text-gray-400">Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character</p>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={changingPassword}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {changingPassword ? 'Saving...' : 'Update password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowChangePassword(false)}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <div>
                  <p className="text-sm text-gray-900 font-medium">Last login</p>
                  <p className="text-xs text-gray-400">
                    {profile?.last_login_at ? format(new Date(profile.last_login_at), 'MMM d, yyyy h:mm a') : '—'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogoutAllDevices}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out all other devices
              </button>
            </div>
          </div>
        </div>

        {/* Recent Login Activity */}
        {loginHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Recent Login Activity
            </h2>
            <div className="space-y-2">
              {loginHistory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${entry.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="text-sm text-gray-900">{entry.success ? 'Successful login' : 'Failed attempt'}</p>
                      <p className="text-xs text-gray-400">{entry.ip_address}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {format(new Date(entry.attempted_at), 'MMM d, h:mm a')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
