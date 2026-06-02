import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
  profile_photo?: string;
}

interface LoginEntry {
  id: number;
  ip_address: string;
  success: boolean;
  attempted_at: string;
  user_agent: string;
}

interface Preferences {
  theme: 'light' | 'dark';
  textAlerts: boolean;
  soundEnabled: boolean;
  language: string;
}

const DEFAULT_PREFS: Preferences = {
  theme: 'light',
  textAlerts: true,
  soundEnabled: true,
  language: 'en',
};

function loadPreferences(): Preferences {
  try {
    const saved = localStorage.getItem('medsys_preferences');
    if (saved) return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_PREFS;
}

function savePreferences(prefs: Preferences) {
  localStorage.setItem('medsys_preferences', JSON.stringify(prefs));
}

// date-fns format() throws a RangeError on an unparseable/invalid date, which
// (on a route without an ErrorBoundary) blanks the whole app. Guard every
// format call so a bad timestamp degrades to an em-dash instead of crashing.
function safeFormat(value: string | null | undefined, pattern: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : format(d, pattern);
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { showToast, unreadCount: notifUnreadCount } = useNotification();
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
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [messageUnread, setMessageUnread] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
    loadMessageCount();
  }, []);

  const loadProfile = async () => {
    try {
      const profileRes = await apiClient.get('/auth/me');
      const p = profileRes.data.user || profileRes.data;
      setProfile(p);
      setPhoneValue(p?.phone || '');
      if (p?.profile_photo) setProfilePhoto(p.profile_photo);

      // Login history is non-critical — load separately
      try {
        const historyRes = await authAPI.getLoginHistory();
        const history = historyRes?.login_history || historyRes?.history || [];
        setLoginHistory(Array.isArray(history) ? history.slice(0, 10) : []);
      } catch {
        setLoginHistory([]);
      }
    } catch {
      showToast('Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMessageCount = async () => {
    try {
      const { data } = await apiClient.get('/messages/unread-count');
      setMessageUnread(data.unread_count || 0);
    } catch { /* ignore */ }
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

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfilePhoto(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Attempt upload
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await apiClient.post(`/users/${user?.id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('Profile photo updated', 'success');
    } catch {
      showToast('Photo upload coming soon', 'info');
    }
  };

  const updatePref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    savePreferences(updated);
    showToast('Preference saved', 'success');
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

  const successfulLogins = loginHistory.filter(e => e.success);
  const lastLogin = successfulLogins[0];

  return (
    <AppLayout title="Profile">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Profile Header with cover background */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-primary-500 via-primary-400 to-secondary-500" />
          <div className="px-6 pb-6 -mt-12">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              {/* Avatar with photo upload */}
              <div className="relative group cursor-pointer" onClick={handlePhotoClick}>
                <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold text-3xl">
                      {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                    </span>
                  )}
                </div>
                {/* Camera overlay on hover */}
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-4 border-transparent">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </div>

              <div className="flex-1 pb-1">
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile?.first_name} {profile?.last_name}
                </h1>
                <p className="text-gray-500 capitalize">{profile?.role?.replace('_', ' ')}</p>
                {profile?.clinic && (
                  <p className="text-sm text-gray-400 mt-0.5">{profile.clinic}</p>
                )}
              </div>

              <p className="text-sm text-gray-400 pb-1">@{profile?.username || user?.email}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/messages"
            className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 group-hover:bg-primary-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Messages</p>
              <p className="text-xs text-gray-500">
                {messageUnread > 0 ? `${messageUnread} unread` : 'No unread messages'}
              </p>
            </div>
          </Link>

          <Link
            to="/notifications"
            className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              <p className="text-xs text-gray-500">
                {notifUnreadCount > 0 ? `${notifUnreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </Link>

          <Link
            to="/call"
            className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Internal Calls</p>
              <p className="text-xs text-gray-500">VoIP call staff members</p>
            </div>
          </Link>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

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
                <span className="text-sm font-medium text-gray-900">{profile?.employee_id || '\u2014'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">Member since</span>
                <span className="text-sm font-medium text-gray-900">
                  {safeFormat(profile?.created_at, 'MMM d, yyyy')}
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
                    {safeFormat(profile?.last_login_at, 'MMM d, yyyy h:mm a')}
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

          {/* Preferences */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Preferences
            </h2>
            <div className="space-y-4">
              {/* Theme */}
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-900">Theme</p>
                  <p className="text-xs text-gray-400">Choose your display theme</p>
                </div>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => updatePref('theme', 'light')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      prefs.theme === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Light
                  </button>
                  <button
                    onClick={() => updatePref('theme', 'dark')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      prefs.theme === 'dark' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Dark
                  </button>
                </div>
              </div>

              {/* Text/SMS alerts */}
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-900">Text alerts</p>
                  <p className="text-xs text-gray-400">Receive SMS notifications</p>
                </div>
                <button
                  onClick={() => updatePref('textAlerts', !prefs.textAlerts)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    prefs.textAlerts ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle text alerts"
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    prefs.textAlerts ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Sound */}
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-900">Sound</p>
                  <p className="text-xs text-gray-400">Notification sounds</p>
                </div>
                <button
                  onClick={() => updatePref('soundEnabled', !prefs.soundEnabled)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    prefs.soundEnabled ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle notification sound"
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    prefs.soundEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Language */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">Language</p>
                  <p className="text-xs text-gray-400">Display language</p>
                </div>
                <select
                  value={prefs.language}
                  onChange={e => updatePref('language', e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                >
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Summary + Login History row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Activity Summary */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Activity Summary
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last login</p>
                  <p className="text-sm font-medium text-gray-900">
                    {safeFormat(lastLogin?.attempted_at, 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500">IP address</p>
                  <p className="text-sm font-medium text-gray-900">
                    {lastLogin?.ip_address || '\u2014'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-secondary-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Logins this month</p>
                  <p className="text-sm font-medium text-gray-900">{successfulLogins.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Login Activity */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Recent Login Activity
            </h2>
            {loginHistory.length > 0 ? (
              <div className="space-y-2">
                {loginHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="text-sm text-gray-900">{entry.success ? 'Successful login' : 'Failed attempt'}</p>
                        <p className="text-xs text-gray-400">{entry.ip_address}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {safeFormat(entry.attempted_at, 'MMM d, h:mm a')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">No login history available</p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
