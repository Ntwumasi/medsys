import React from 'react';
import { useAuth } from '../context/AuthContext';

const PatientPortal: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="bg-white bg-opacity-20 p-3 rounded-xl">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Patient Portal</h1>
                <p className="text-blue-100 text-sm">Welcome, {user?.first_name} {user?.last_name}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Blank for now */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center">
          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to the Patient Portal</h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-8">
            Your personal health hub is coming soon. Here you'll be able to view your medical records,
            upcoming appointments, test results, and more.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto mt-12">
            <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Medical Records</h3>
              <p className="text-sm text-gray-500">View your visit history and health records</p>
              <span className="inline-block mt-3 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">Coming Soon</span>
            </div>

            <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Appointments</h3>
              <p className="text-sm text-gray-500">Schedule and manage your appointments</p>
              <span className="inline-block mt-3 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">Coming Soon</span>
            </div>

            <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-12 h-12 bg-secondary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Test Results</h3>
              <p className="text-sm text-gray-500">Access your lab and imaging results</p>
              <span className="inline-block mt-3 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">Coming Soon</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          <p>For medical emergencies, please call 911 or visit your nearest emergency room.</p>
          <p className="mt-2">Need help? Contact us at (555) 123-4567</p>
        </div>
      </footer>
    </div>
  );
};

export default PatientPortal;
