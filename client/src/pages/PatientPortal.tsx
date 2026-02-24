import React from 'react';
import AppLayout from '../components/AppLayout';

const PatientPortal: React.FC = () => {

  return (
    <AppLayout title="Patient Portal">
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

      {/* Footer */}
      <footer className="mt-12 py-6 bg-white border-t border-gray-200 -mx-6 -mb-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          <p>For medical emergencies, please call 911 or visit your nearest emergency room.</p>
          <p className="mt-2">Need help? Contact us at (555) 123-4567</p>
        </div>
      </footer>
    </AppLayout>
  );
};

export default PatientPortal;
