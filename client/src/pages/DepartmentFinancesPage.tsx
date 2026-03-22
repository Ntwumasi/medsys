import React from 'react';
import AppLayout from '../components/AppLayout';
import DepartmentFinances from '../components/DepartmentFinances';
import { useAuth } from '../context/AuthContext';

const ROLE_TO_DEPARTMENT: Record<string, 'lab' | 'pharmacy' | 'imaging' | 'nursing'> = {
  lab: 'lab',
  pharmacy: 'pharmacy',
  pharmacist: 'pharmacy',
  pharmacy_tech: 'pharmacy',
  imaging: 'imaging',
  nurse: 'nursing',
};

const DEPARTMENT_TITLES: Record<string, string> = {
  lab: 'Laboratory Revenue',
  pharmacy: 'Pharmacy Revenue',
  imaging: 'Imaging Revenue',
  nursing: 'Nursing Procedures Revenue',
};

const DepartmentFinancesPage: React.FC = () => {
  const { user } = useAuth();

  const department = user?.role ? ROLE_TO_DEPARTMENT[user.role] : null;
  const title = department ? DEPARTMENT_TITLES[department] : 'Department Revenue';

  if (!department) {
    return (
      <AppLayout title="Finances">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
          <p className="text-gray-500">
            Financial data is not available for your role.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={title}>
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <DepartmentFinances department={department} title={title} />
      </div>
    </AppLayout>
  );
};

export default DepartmentFinancesPage;
