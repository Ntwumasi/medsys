import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import NurseDashboard from './pages/NurseDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import LabDashboard from './pages/LabDashboard';
import PharmacyDashboard from './pages/PharmacyDashboard';
import RefillsCalendar from './pages/RefillsCalendar';
import ImagingDashboard from './pages/ImagingDashboard';
import AccountantDashboard from './pages/AccountantDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import PatientList from './pages/PatientList';
import PatientRegistration from './pages/PatientRegistration';
import PatientDetails from './pages/PatientDetails';
import AppointmentsCalendar from './pages/AppointmentsCalendar';
import PatientPortal from './pages/PatientPortal';
import PublicUpdates from './pages/PublicUpdates';
import InvoicesPage from './pages/InvoicesPage';
import PendingPaymentsPage from './pages/PendingPaymentsPage';
import DepartmentFinancesPage from './pages/DepartmentFinancesPage';
import QuickBooksSettings from './pages/QuickBooksSettings';
import QuickBooksData from './pages/QuickBooksData';
import MessagesPage from './pages/MessagesPage';
import ImpersonationBanner from './components/ImpersonationBanner';
import SessionTimeoutModal from './components/SessionTimeoutModal';
import { useSessionTimeout } from './hooks/useSessionTimeout';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

// Role-based Dashboard Router
const RoleDashboard: React.FC = () => {
  const { user, activeRole } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Super admin with no active role selected - show role picker
  if (user.is_super_admin && !activeRole) {
    return <ErrorBoundary><SuperAdminDashboard /></ErrorBoundary>;
  }

  // Use activeRole for super admins, otherwise use user's actual role
  const effectiveRole = user.is_super_admin && activeRole ? activeRole : user.role;
  const userRole = effectiveRole?.toLowerCase();

  console.log('User role:', user.role, 'Active role:', activeRole, 'Effective role:', userRole); // Debug log

  try {
    switch (userRole) {
      case 'receptionist':
        return <ErrorBoundary><ReceptionistDashboard /></ErrorBoundary>;
      case 'nurse':
        return <ErrorBoundary><NurseDashboard /></ErrorBoundary>;
      case 'doctor':
        return <ErrorBoundary><DoctorDashboard /></ErrorBoundary>;
      case 'lab':
        return <ErrorBoundary><LabDashboard /></ErrorBoundary>;
      case 'pharmacy':
      case 'pharmacist':
      case 'pharmacy_tech':
        return <ErrorBoundary><PharmacyDashboard /></ErrorBoundary>;
      case 'imaging':
        return <ErrorBoundary><ImagingDashboard /></ErrorBoundary>;
      case 'accountant':
        return <ErrorBoundary><AccountantDashboard /></ErrorBoundary>;
      case 'admin':
        return <ErrorBoundary><Dashboard /></ErrorBoundary>;
      case 'patient':
        return <ErrorBoundary><PatientPortal /></ErrorBoundary>;
      default:
        console.warn('Unknown role:', user.role, 'Showing default dashboard');
        return <ErrorBoundary><Dashboard /></ErrorBoundary>;
    }
  } catch (error) {
    console.error('Dashboard render error:', error);
    return <ErrorBoundary><div>Error loading dashboard</div></ErrorBoundary>;
  }
};

// Session timeout wrapper
const SessionTimeoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const { isWarningVisible, remainingSeconds, extendSession } = useSessionTimeout({
    timeoutMinutes: 30,    // Logout after 30 min inactivity
    warningMinutes: 5,     // Show warning 5 min before logout
  });

  return (
    <>
      {children}
      <SessionTimeoutModal
        isVisible={isWarningVisible}
        remainingSeconds={remainingSeconds}
        onExtend={extendSession}
        onLogout={logout}
      />
    </>
  );
};

// Wrapper to include impersonation banner within auth context
const AppContent: React.FC = () => {
  return (
    <SessionTimeoutWrapper>
      <ImpersonationBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/updates" element={<PublicUpdates />} />

        <Route path="/dashboard" element={<ProtectedRoute><RoleDashboard /></ProtectedRoute>} />
        <Route path="/nurse/inventory" element={<ProtectedRoute><NurseDashboard /></ProtectedRoute>} />
        <Route path="/refills-calendar" element={<ProtectedRoute><RefillsCalendar /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
        <Route path="/pending-payments" element={<ProtectedRoute><PendingPaymentsPage /></ProtectedRoute>} />
        <Route path="/finances" element={<ProtectedRoute><DepartmentFinancesPage /></ProtectedRoute>} />
        <Route path="/quickbooks" element={<ProtectedRoute><QuickBooksSettings /></ProtectedRoute>} />
        <Route path="/qb/*" element={<ProtectedRoute><QuickBooksData /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/new" element={<PatientRegistration />} />
          <Route path="patients/:id" element={<PatientDetails />} />
          <Route path="appointments" element={<AppointmentsCalendar />} />
          <Route path="reports" element={<div className="p-8"><h1 className="text-2xl font-bold">Reports (Coming Soon)</h1></div>} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </SessionTimeoutWrapper>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
