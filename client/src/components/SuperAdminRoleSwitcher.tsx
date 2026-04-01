import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  receptionist: 'Receptionist',
  nurse: 'Nurse',
  doctor: 'Doctor',
  lab: 'Laboratory',
  pharmacy: 'Pharmacy',
  pharmacist: 'Pharmacist',
  pharmacy_tech: 'Pharmacy Tech',
  imaging: 'Imaging',
  accountant: 'Accountant',
};

const SuperAdminRoleSwitcher: React.FC = () => {
  const { user, activeRole, setActiveRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Only show for super admins
  if (!user?.is_super_admin) {
    return null;
  }

  const currentRole = activeRole || user.role;
  const currentLabel = roleLabels[currentRole] || currentRole;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRoleChange = (role: string | null) => {
    setActiveRole(role);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors border border-purple-200"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
        <span>Viewing as: {currentLabel}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
            Switch Dashboard
          </div>

          <button
            onClick={() => handleRoleChange(null)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-purple-600 font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Super Admin Home
          </button>

          <div className="border-t border-gray-100 my-1"></div>

          {Object.entries(roleLabels).map(([role, label]) => (
            <button
              key={role}
              onClick={() => handleRoleChange(role)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                currentRole === role ? 'bg-gray-50 text-primary-600' : 'text-gray-700'
              }`}
            >
              <span>{label}</span>
              {currentRole === role && (
                <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SuperAdminRoleSwitcher;
