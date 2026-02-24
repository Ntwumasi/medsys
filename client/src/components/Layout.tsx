import React from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Navigation */}
      <nav className="bg-gradient-to-r from-primary-600 to-secondary-600 shadow-lg">
        <div className="max-w-full mx-auto px-6">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="bg-white bg-opacity-20 p-2 rounded-lg mr-3">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <Link to="/dashboard" className="text-xl font-bold text-white">
                  MedSys EMR
                </Link>
              </div>
              <div className="hidden sm:ml-10 sm:flex sm:space-x-1">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-all"
                >
                  Dashboard
                </Link>
                <Link
                  to="/patients"
                  className="inline-flex items-center px-4 py-2 text-sm font-semibold text-primary-100 hover:text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-all"
                >
                  Patients
                </Link>
                <Link
                  to="/appointments"
                  className="inline-flex items-center px-4 py-2 text-sm font-semibold text-primary-100 hover:text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-all"
                >
                  Appointments
                </Link>
                {(user?.role === 'doctor' || user?.role === 'admin') && (
                  <Link
                    to="/reports"
                    className="inline-flex items-center px-4 py-2 text-sm font-semibold text-primary-100 hover:text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-all"
                  >
                    Reports
                  </Link>
                )}
              </div>
            </div>

            <div className="hidden sm:flex sm:items-center gap-4">
              <span className="text-sm text-primary-100">
                {user?.first_name} {user?.last_name}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-white text-primary-600 hover:bg-primary-50 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-md hover:shadow-lg text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center sm:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-lg text-white hover:bg-white hover:bg-opacity-20 transition-all"
              >
                <span className="sr-only">Open main menu</span>
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden bg-primary-700 border-t border-primary-500">
            <div className="pt-2 pb-3 space-y-1 px-4">
              <Link
                to="/dashboard"
                className="block px-4 py-2 text-base font-semibold text-white hover:bg-white hover:bg-opacity-20 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/patients"
                className="block px-4 py-2 text-base font-semibold text-primary-100 hover:bg-white hover:bg-opacity-20 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Patients
              </Link>
              <Link
                to="/appointments"
                className="block px-4 py-2 text-base font-semibold text-primary-100 hover:bg-white hover:bg-opacity-20 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Appointments
              </Link>
              {(user?.role === 'doctor' || user?.role === 'admin') && (
                <Link
                  to="/reports"
                  className="block px-4 py-2 text-base font-semibold text-primary-100 hover:bg-white hover:bg-opacity-20 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Reports
                </Link>
              )}
            </div>
            <div className="pt-4 pb-3 border-t border-primary-500 px-4">
              <div className="flex items-center mb-3">
                <div className="text-base font-semibold text-white">
                  {user?.first_name} {user?.last_name}
                </div>
              </div>
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full px-4 py-2 bg-white text-primary-600 rounded-lg font-semibold text-center"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Page Content */}
      <Outlet />
    </div>
  );
};

export default Layout;
