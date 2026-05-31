import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import NotificationCenter from './NotificationCenter';
import SuperAdminRoleSwitcher from './SuperAdminRoleSwitcher';
import MessageBadge from './MessageBadge';
import { useGuide } from '../context/GuideContext';
import { useVoIP } from '../context/VoIPContext';
import IncomingCallModal from './IncomingCallModal';
import ActiveCallBar from './ActiveCallBar';
import apiClient from '../api/client';

interface NavItem {
  label: string;
  // Either path (link) or actionId (triggers a global handler) must be set.
  path?: string;
  actionId?: 'open-guide';
  icon: React.ReactNode;
  roles?: string[];
  headNurseOnly?: boolean;
  // When true, only renders if the corresponding action is currently
  // available (e.g., guide only exists for some roles).
  conditional?: 'has-guide';
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Register',
    path: '/register',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
    roles: ['receptionist', 'admin'],
  },
  {
    label: 'Refills',
    path: '/refills-calendar',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'],
  },
  {
    label: 'Patients',
    path: '/patients',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    label: 'Invoices',
    path: '/invoices',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    roles: ['receptionist', 'admin'],
  },
  {
    label: 'Generate Invoice',
    path: '/invoices',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
    roles: ['receptionist', 'admin'],
  },
  {
    label: 'Staff',
    path: '/dashboard?view=staff',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    roles: ['receptionist'],
  },
  {
    label: 'Receipts',
    path: '/receipts',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    roles: ['receptionist', 'admin', 'accountant'],
  },
  {
    label: 'Pending Payments',
    path: '/pending-payments',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    roles: ['receptionist', 'admin'],
  },
  {
    label: 'Appointments',
    path: '/appointments',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['doctor', 'nurse', 'admin'],
  },
  {
    label: 'Calls',
    path: '/nurse/follow-up-calls',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    roles: ['nurse'],
  },
  {
    label: 'Inventory',
    path: '/nurse/inventory',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    roles: ['nurse'],
  },
  {
    label: 'Procurement',
    path: '/nurse/procurement',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
    roles: ['nurse'],
    headNurseOnly: true,
  },
  // Lab nav item removed — it routed to /lab which is the LabDashboard the
  // user is already on after login, so clicking it appeared to do nothing.
  // The Verification tab inside LabDashboard covers the lead-approve flow,
  // so the sidebar entry was redundant. Lab users reach their dashboard via
  // post-login redirect or the Dashboard tile.
  {
    label: 'Pharmacy',
    path: '/pharmacy',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    roles: ['pharmacy'],
  },
  {
    label: 'Imaging',
    path: '/imaging',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    roles: ['imaging'],
  },
  {
    label: 'Finances',
    path: '/finances',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    roles: ['lab', 'pharmacy', 'pharmacist', 'pharmacy_tech', 'imaging', 'nurse'],
  },
  {
    label: 'QB Data',
    path: '/qb',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    roles: ['accountant', 'admin'],
  },
  {
    label: 'QB Settings',
    path: '/quickbooks',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    roles: ['accountant', 'admin'],
  },
  {
    label: 'My Health',
    path: '/portal',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    roles: ['patient'],
  },
  {
    label: 'Clinics',
    path: '/clinics',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    roles: ['admin', 'receptionist'],
  },
  {
    label: 'Price List',
    path: '/price-list',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['admin'],
  },
  // Admin-only deep-links into the Dashboard's secondary tabs. Moved out
  // of the in-page tab bar to keep its row short and put navigation in
  // one place (the sidebar).
  {
    label: 'Past Patients',
    path: '/dashboard?view=pastPatients',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    label: 'Login Records',
    path: '/dashboard?view=logins',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    label: 'System Updates',
    path: '/dashboard?view=updates',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    label: 'Documentation',
    path: '/dashboard?view=docs',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    roles: ['admin'],
  },
  // How-To Guide is a click-action, not a route. Sidebar triggers the
  // GuideContext to open the role-specific walkthrough modal.
  {
    label: 'How-To Guide',
    actionId: 'open-guide',
    conditional: 'has-guide',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.5M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.5h.01" />
      </svg>
    ),
  },
];

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: { label: string; path?: string }[];
}

interface SearchResult {
  type: 'patient' | 'appointment';
  id: number;
  title: string;
  subtitle: string;
  path: string;
}

// ── Call Panel Button (topbar VoIP dropdown) ──
function CallPanelButton() {
  const { onlineUsers, callUser, callState } = useVoIP();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const otherUsers = onlineUsers.filter(u => u.id !== user?.id);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors relative"
        aria-label="Voice calls"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        {otherUsers.length > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Staff Online</h3>
            <p className="text-xs text-gray-500">{otherUsers.length} available</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {otherUsers.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">No staff online</p>
            ) : (
              otherUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    console.log('[VoIP] Call button clicked, user:', u.id, u.first_name, u.last_name, 'callState:', callState);
                    if (callState === 'idle') {
                      callUser(u.id);
                      setOpen(false);
                    }
                  }}
                  disabled={callState !== 'idle'}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-semibold text-xs">
                      {u.first_name?.[0]}{u.last_name?.[0]}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                      u.status === 'in_call' ? 'bg-amber-400' : 'bg-emerald-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.first_name} {u.last_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{u.role}{u.status === 'in_call' ? ' · On a call' : ''}</p>
                  </div>
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, title, breadcrumbs }) => {
  const { user, logout, activeRole, impersonation } = useAuth();
  const { open: openGuide, hasGuide } = useGuide();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);

  // Close search on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search handler with debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await apiClient.get(`/patients?search=${encodeURIComponent(searchQuery)}&limit=5`);
        const patients = response.data.patients || response.data || [];
        const results: SearchResult[] = patients.map((p: { id: number; first_name: string; last_name: string; date_of_birth: string; mrn?: string }) => ({
          type: 'patient' as const,
          id: p.id,
          title: `${p.first_name} ${p.last_name}`,
          subtitle: `DOB: ${new Date(p.date_of_birth).toLocaleDateString()} ${p.mrn ? `| MRN: ${p.mrn}` : ''}`,
          path: `/patients/${p.id}`,
        }));
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSelect = (result: SearchResult) => {
    navigate(result.path);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleLogout = () => {
    logout(); // Hard redirects to /login
  };

  // Use activeRole for super admins, otherwise use user's actual role
  const effectiveRole = user?.is_super_admin && activeRole ? activeRole : user?.role;

  const isSuperAdminSession =
    user?.is_super_admin || impersonation.originalUser?.is_super_admin;

  const filteredNavItems = navItems.filter((item) => {
    if (item.roles && !item.roles.includes(effectiveRole || '')) return false;
    if (item.headNurseOnly && !user?.is_head_nurse && !isSuperAdminSession) return false;
    if (item.conditional === 'has-guide' && !hasGuide) return false;
    return true;
  });

  // Single source of truth for what each nav item does when clicked.
  // Items with a path render as Link; items with actionId fire a handler.
  const navItemHandler = (item: NavItem): React.MouseEventHandler | undefined => {
    if (item.actionId === 'open-guide') return () => openGuide();
    return undefined;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-warning-100 text-warning-700',
      doctor: 'bg-secondary-100 text-secondary-700',
      nurse: 'bg-success-100 text-success-700',
      receptionist: 'bg-primary-100 text-primary-700',
      lab: 'bg-accent-100 text-accent-700',
      pharmacy: 'bg-primary-100 text-primary-700',
      imaging: 'bg-secondary-100 text-secondary-700',
      patient: 'bg-success-100 text-success-700',
    };
    return colors[role] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Ambient background — three large blurred color blobs at low
          opacity give the canvas quiet depth without competing with
          content. Pure CSS, no render cost. Fixed positioning so the
          blobs stay put while content scrolls above them. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden -z-0">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-primary-200 opacity-20 blur-3xl" />
        <div className="absolute top-1/3 right-[-180px] w-[480px] h-[480px] rounded-full bg-secondary-200 opacity-15 blur-3xl" />
        <div className="absolute bottom-[-200px] left-1/3 w-[520px] h-[520px] rounded-full bg-accent-200 opacity-15 blur-3xl" />
      </div>
      <div className="relative z-10">
      {/* Skip to content link for accessibility */}
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border z-40 flex items-center px-4 lg:px-6">
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-text-secondary hover:bg-primary-50 hover:text-primary-500 mr-2"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Logo */}
        <Link to="/dashboard" className="flex items-center">
          <Logo size="sm" showText={!sidebarCollapsed} />
        </Link>

        {/* Global Search */}
        <div ref={searchRef} className="relative ml-4 lg:ml-8 flex-1 max-w-md hidden sm:block">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchOpen && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-surface rounded-xl shadow-card-hover border border-border overflow-hidden z-50 animate-slide-in-up">
              {searchResults.length > 0 ? (
                <ul className="py-2">
                  {searchResults.map((result) => (
                    <li key={`${result.type}-${result.id}`}>
                      <button
                        onClick={() => handleSearchSelect(result)}
                        className="w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors flex items-center gap-3"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          result.type === 'patient' ? 'bg-primary-100 text-primary-600' : 'bg-secondary-100 text-secondary-600'
                        }`}>
                          {result.type === 'patient' ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{result.title}</p>
                          <p className="text-xs text-text-secondary">{result.subtitle}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !searchLoading ? (
                <div className="px-4 py-6 text-center text-text-secondary text-sm">
                  No results found for "{searchQuery}"
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Spacer (for mobile) */}
        <div className="flex-1 sm:hidden" />

        {/* Right side items */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Super Admin Role Switcher */}
          <SuperAdminRoleSwitcher />

          {/* Action icons group */}
          <div className="flex items-center gap-0.5">
            {/* Messages */}
            <MessageBadge />

            {/* Voice calls (VoIP) */}
            <CallPanelButton />

            {/* Notifications */}
            <NotificationCenter />
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-7 bg-gray-200 mx-2" />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-semibold text-sm ring-2 ring-transparent group-hover:ring-primary-200 transition-all">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>
              <div className="hidden md:block text-left min-w-[100px]">
                <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-gray-500 capitalize leading-tight mt-0.5">
                  {user?.role?.replace('_', ' ')}
                </p>
              </div>
              <svg className="w-4 h-4 text-gray-400 hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 overflow-hidden">
                  {/* User header */}
                  <div className="px-5 py-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-semibold text-sm ring-2 ring-white shadow-sm">
                        {user?.first_name?.[0]}{user?.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {user?.first_name} {user?.last_name}
                        </p>
                        <p className={`text-xs px-2 py-0.5 rounded-full inline-block mt-1 ${getRoleColor(user?.role || '')}`}>
                          {user?.role?.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1.5 px-1.5">
                    <Link
                      to="/profile"
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      My Profile
                    </Link>
                    <Link
                      to="/messages"
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Messages
                    </Link>
                  </div>

                  {/* Sign out */}
                  <div className="border-t border-gray-100 py-1.5 px-1.5">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar - Desktop */}
      <aside
        className={`fixed left-0 top-16 bottom-0 bg-surface border-r border-border z-30 transition-all duration-200 hidden lg:block ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute -right-3 top-6 w-6 h-6 bg-surface border border-border rounded-full flex items-center justify-center text-text-secondary hover:text-primary-500 hover:border-primary-500 transition-colors"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Navigation */}
          <nav aria-label="Main navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
            {filteredNavItems.map((item) => {
              const key = item.path || item.actionId || item.label;
              const isActive = !!item.path && (location.pathname === item.path || location.pathname.startsWith(item.path + '/'));
              const cls = `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full text-left ${
                isActive
                  ? 'bg-primary-50 text-primary-600 font-medium'
                  : 'text-text-secondary hover:bg-primary-50 hover:text-primary-600'
              } ${sidebarCollapsed ? 'justify-center' : ''}`;
              const handler = navItemHandler(item);
              if (handler) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={handler}
                    className={cls}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-label={sidebarCollapsed ? item.label : undefined}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                );
              }
              return (
                <Link
                  key={key}
                  to={item.path!}
                  className={cls}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar footer */}
          {!sidebarCollapsed && (
            <div className="p-4 border-t border-border">
              <div className="text-xs text-text-secondary text-center">
                MedSys EMR
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface z-50 lg:hidden animate-slide-in-right">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Logo size="sm" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-text-secondary hover:bg-primary-50"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {filteredNavItems.map((item) => {
                const key = item.path || item.actionId || item.label;
                const isActive = !!item.path && location.pathname === item.path;
                const cls = `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full text-left ${
                  isActive
                    ? 'bg-primary-50 text-primary-600 font-medium'
                    : 'text-text-secondary hover:bg-primary-50 hover:text-primary-600'
                }`;
                const handler = navItemHandler(item);
                if (handler) {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => { handler(e); setMobileMenuOpen(false); }}
                      className={cls}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                }
                return (
                  <Link
                    key={key}
                    to={item.path!}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cls}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      {/* Main Content */}
      <main
        id="main-content"
        className={`pt-16 min-h-screen transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        {/* Greeting and breadcrumb strips were removed in favor of the slim
            DashboardHeader component each role dashboard renders itself.
            Breadcrumbs are still rendered below for non-dashboard pages
            (patient detail, etc.) where they add real value. */}

        {/* Page header with breadcrumbs and title */}
        {title && location.pathname !== '/dashboard' && (
          <div className="bg-surface border-b border-border px-4 lg:px-6 py-3">
            {/* Auto breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm mb-1">
              <Link
                to="/dashboard"
                className="text-gray-400 hover:text-primary-600 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Dashboard
              </Link>
              {title && location.pathname !== '/dashboard' && (
                <>
                  <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-700 font-medium">{title}</span>
                </>
              )}
              {breadcrumbs && breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {crumb.path ? (
                    <Link to={crumb.path} className="text-gray-400 hover:text-primary-600 transition-colors">{crumb.label}</Link>
                  ) : (
                    <span className="text-gray-700 font-medium">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
            {title && <h1 className="text-xl font-bold text-text-primary">{title}</h1>}
          </div>
        )}

        {/* Page content */}
        <div className="p-4 lg:p-6 pb-20 lg:pb-6">
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-40 lg:hidden safe-area-bottom">
        <div className="flex justify-around items-center h-16">
          {/* Mobile bottom nav: only show items with a real path. Actions
              like How-To Guide are surfaced from the slide-out menu only. */}
          {filteredNavItems.filter((i) => i.path).slice(0, 5).map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path!}
                className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors ${
                  isActive ? 'text-primary-600' : 'text-text-secondary'
                }`}
              >
                <span className={`${isActive ? 'scale-110' : ''} transition-transform`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] mt-1 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {filteredNavItems.length > 5 && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full px-2 text-text-secondary"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[10px] mt-1 font-medium">More</span>
            </button>
          )}
        </div>
      </nav>
      </div>

      {/* VoIP overlays */}
      <IncomingCallModal />
      <ActiveCallBar />
    </div>
  );
};

export default AppLayout;
