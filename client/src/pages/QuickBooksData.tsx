import React from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import QBDashboard from './qb/QBDashboard';
import QBCustomers from './qb/QBCustomers';
import QBInvoices from './qb/QBInvoices';
import QBPayments from './qb/QBPayments';
import QBServices from './qb/QBServices';
import QBDocs from '../components/docs/QBDocs';

interface TabItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const tabs: TabItem[] = [
  {
    label: 'Dashboard',
    path: '/qb',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Customers',
    path: '/qb/customers',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: 'Invoices',
    path: '/qb/invoices',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: 'Payments',
    path: '/qb/payments',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    label: 'Services',
    path: '/qb/services',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    label: 'Help',
    path: '/qb/help',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const QuickBooksData: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/qb') {
      return location.pathname === '/qb' || location.pathname === '/qb/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <AppLayout
      title="QuickBooks Data"
      breadcrumbs={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'QuickBooks Data' },
      ]}
    >
      {/* Tab Navigation */}
      <div className="bg-surface rounded-xl shadow-card border border-border mb-6">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive(tab.path)
                  ? 'border-primary-500 text-primary-600 bg-primary-50/50'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <Routes>
        <Route index element={<QBDashboard />} />
        <Route path="customers" element={<QBCustomers />} />
        <Route path="invoices" element={<QBInvoices />} />
        <Route path="payments" element={<QBPayments />} />
        <Route path="services" element={<QBServices />} />
        <Route path="help" element={<QBDocs />} />
        <Route path="*" element={<Navigate to="/qb" replace />} />
      </Routes>
    </AppLayout>
  );
};

export default QuickBooksData;
