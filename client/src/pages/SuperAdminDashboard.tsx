import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../components/AppLayout';

interface RoleOption {
  role: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

const roleOptions: RoleOption[] = [
  {
    role: 'admin',
    label: 'Administrator',
    description: 'Manage users, view system settings, and access all data',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    color: 'bg-purple-500',
  },
  {
    role: 'receptionist',
    label: 'Receptionist',
    description: 'Patient registration, check-in, and scheduling',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    color: 'bg-blue-500',
  },
  {
    role: 'nurse',
    label: 'Nurse',
    description: 'Triage, vital signs, and patient care coordination',
    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    color: 'bg-pink-500',
  },
  {
    role: 'doctor',
    label: 'Doctor',
    description: 'Patient consultations, diagnoses, and treatment plans',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    color: 'bg-green-500',
  },
  {
    role: 'lab',
    label: 'Laboratory',
    description: 'Lab orders, sample collection, and test results',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    color: 'bg-yellow-500',
  },
  {
    role: 'pharmacy',
    label: 'Pharmacy',
    description: 'Medication dispensing and prescription management',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    color: 'bg-orange-500',
  },
  {
    role: 'imaging',
    label: 'Imaging',
    description: 'Radiology orders and imaging results',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    color: 'bg-indigo-500',
  },
  {
    role: 'accountant',
    label: 'Accountant',
    description: 'Billing, invoices, and financial reports',
    icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    color: 'bg-teal-500',
  },
];

const SuperAdminDashboard: React.FC = () => {
  const { user, setActiveRole } = useAuth();
  const [switchingRole, setSwitchingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSelect = async (role: string) => {
    setError(null);
    setSwitchingRole(role);
    try {
      await setActiveRole(role);
      // After switching, the new user is the demo for that role and the
      // /dashboard route will rerender into that role's dashboard.
      window.location.href = '/dashboard';
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || err?.message || 'Failed to switch dashboard';
      setError(msg);
      setSwitchingRole(null);
    }
  };

  return (
    <AppLayout title="Super Admin Portal">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Welcome, {user?.first_name} {user?.last_name}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            As a super admin, you have access to all role dashboards. Choose which view you'd like to access.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {roleOptions.map((option) => {
            const isSwitching = switchingRole === option.role;
            const isAnySwitching = switchingRole !== null;
            return (
              <button
                key={option.role}
                onClick={() => handleRoleSelect(option.role)}
                disabled={isAnySwitching}
                className="group relative bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-200 text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {/* Icon */}
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${option.color} text-white mb-4 group-hover:scale-110 transition-transform`}>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={option.icon} />
                  </svg>
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                  {option.label}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {option.description}
                </p>

                {/* Arrow / loading indicator */}
                <div className="absolute top-6 right-6">
                  {isSwitching ? (
                    <svg className="w-5 h-5 text-primary-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick Info */}
        <div className="mt-12 bg-primary-50 border border-primary-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-primary-900 mb-1">
                Super Admin Access
              </h4>
              <p className="text-sm text-primary-700">
                You can switch between dashboards at any time. Use the "Viewing as" role switcher in the header of any dashboard to return here or jump to another role.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default SuperAdminDashboard;
