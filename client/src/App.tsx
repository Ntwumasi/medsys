import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { GuideProvider } from './context/GuideContext';
import { CommandPaletteProvider } from './context/CommandPaletteContext';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import SessionTimeoutModal from './components/SessionTimeoutModal';
import { useSessionTimeout } from './hooks/useSessionTimeout';

// Lazy-loaded dashboard pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ReceptionistDashboard = lazy(() => import('./pages/ReceptionistDashboard'));
const NurseDashboard = lazy(() => import('./pages/NurseDashboard'));
const DoctorDashboard = lazy(() => import('./pages/DoctorDashboard'));
const LabDashboard = lazy(() => import('./pages/LabDashboard'));
const PharmacyDashboard = lazy(() => import('./pages/PharmacyDashboard'));
const RefillsCalendar = lazy(() => import('./pages/RefillsCalendar'));
const ImagingDashboard = lazy(() => import('./pages/ImagingDashboard'));
const AccountantDashboard = lazy(() => import('./pages/AccountantDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const PatientList = lazy(() => import('./pages/PatientList'));
const PatientRegistration = lazy(() => import('./pages/PatientRegistration'));
const PatientDetails = lazy(() => import('./pages/PatientDetails'));
const AppointmentsCalendar = lazy(() => import('./pages/AppointmentsCalendar'));
const PatientRegistrationPage = lazy(() => import('./pages/PatientRegistrationPage'));
const PatientPortal = lazy(() => import('./pages/PatientPortal'));
const DuplicatePatients = lazy(() => import('./pages/DuplicatePatients'));
const PortalLogin = lazy(() => import('./pages/portal/PortalLogin'));
const PortalVerify = lazy(() => import('./pages/portal/PortalVerify'));
const PublicUpdates = lazy(() => import('./pages/PublicUpdates'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const ReceiptsPage = lazy(() => import('./pages/ReceiptsPage'));
const PendingPaymentsPage = lazy(() => import('./pages/PendingPaymentsPage'));
const DepartmentFinancesPage = lazy(() => import('./pages/DepartmentFinancesPage'));
const QuickBooksSettings = lazy(() => import('./pages/QuickBooksSettings'));
const QuickBooksData = lazy(() => import('./pages/QuickBooksData'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const NurseFollowUpCalls = lazy(() => import('./pages/NurseFollowUpCalls'));
const NurseProcurement = lazy(() => import('./pages/NurseProcurement'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StaffProfilePage = lazy(() => import('./pages/StaffProfilePage'));
const FeedPage = lazy(() => import('./pages/FeedPage'));
const PeoplePage = lazy(() => import('./pages/PeoplePage'));
const ClinicManagement = lazy(() => import('./pages/ClinicManagement'));
const PriceListManagement = lazy(() => import('./pages/PriceListManagement'));

// Loading spinner shown while lazy chunks are fetched
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  );
}

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

  // Super admin landing logic:
  //   - Clinical-role super admins (e.g. Sedo: is_super_admin + role='doctor')
  //     skip the role picker and land directly on their real role's dashboard.
  //     Their day job is the clinical role; super admin is a privilege accessed
  //     via the top-nav switcher when needed.
  //   - Pure-admin super admins (role='admin' or missing) still see the role
  //     picker (SuperAdminDashboard) on first load.
  if (user.is_super_admin && !activeRole) {
    if (!user.role || user.role === 'admin') {
      return <ErrorBoundary><SuperAdminDashboard /></ErrorBoundary>;
    }
    // Fall through using user.role as the effective role.
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
      case 'office_manager': // curated admin view (oversight sections hidden)
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
  const { logout, user } = useAuth();
  const { isWarningVisible, remainingSeconds, extendSession } = useSessionTimeout({
    timeoutMinutes: 30,    // Logout after 30 min inactivity
    warningMinutes: 5,     // Show warning 5 min before logout
    // Patients keep a persistent session (they access from personal devices and
    // should be able to return anytime); idle-logout is a staff security control.
    disabled: user?.role === 'patient',
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

const AppContent: React.FC = () => {
  return (
    <SessionTimeoutWrapper>
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/updates" element={<PublicUpdates />} />

        {/* Public patient portal access (passwordless SMS link + DOB) */}
        <Route path="/portal" element={<PortalLogin />} />
        <Route path="/portal/verify" element={<PortalVerify />} />

        <Route path="/dashboard" element={<ProtectedRoute><RoleDashboard /></ProtectedRoute>} />
        <Route path="/nurse/inventory" element={<ProtectedRoute><NurseDashboard /></ProtectedRoute>} />
        <Route path="/nurse/follow-up-calls" element={<ProtectedRoute><NurseFollowUpCalls /></ProtectedRoute>} />
        <Route path="/nurse/procurement" element={<ProtectedRoute><NurseProcurement /></ProtectedRoute>} />
        <Route path="/refills-calendar" element={<ProtectedRoute><RefillsCalendar /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
        <Route path="/receipts" element={<ProtectedRoute><ReceiptsPage /></ProtectedRoute>} />
        <Route path="/pending-payments" element={<ProtectedRoute><PendingPaymentsPage /></ProtectedRoute>} />
        <Route path="/finances" element={<ProtectedRoute><DepartmentFinancesPage /></ProtectedRoute>} />
        <Route path="/quickbooks" element={<ProtectedRoute><QuickBooksSettings /></ProtectedRoute>} />
        <Route path="/qb/*" element={<ProtectedRoute><QuickBooksData /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ErrorBoundary><ProfilePage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/profile/:userId" element={<ProtectedRoute><ErrorBoundary><StaffProfilePage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><ErrorBoundary><FeedPage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/people" element={<ProtectedRoute><ErrorBoundary><PeoplePage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/clinics" element={<ProtectedRoute><ClinicManagement /></ProtectedRoute>} />
        <Route path="/price-list" element={<ProtectedRoute><PriceListManagement /></ProtectedRoute>} />

        {/* Pages below already wrap themselves in <AppLayout>; they used
            to be nested under a legacy <Layout /> which double-stacked the
            top nav. Routes are now flat so only AppLayout's sidebar shows. */}
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/patients" element={<ProtectedRoute><PatientList /></ProtectedRoute>} />
        <Route path="/duplicate-patients" element={<ProtectedRoute><ErrorBoundary><DuplicatePatients /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/patients/new" element={<ProtectedRoute><PatientRegistration /></ProtectedRoute>} />
        <Route path="/patients/:id" element={<ProtectedRoute><PatientDetails /></ProtectedRoute>} />
        <Route path="/register" element={<ProtectedRoute><PatientRegistrationPage /></ProtectedRoute>} />
        <Route path="/appointments" element={<ProtectedRoute><AppointmentsCalendar /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><div className="p-8"><h1 className="text-2xl font-bold">Reports (Coming Soon)</h1></div></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
      </Suspense>
    </SessionTimeoutWrapper>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          {/* GuideProvider must wrap CommandPaletteProvider — the palette
              calls useGuide() to surface the "Open How-To Guide" action. */}
          <GuideProvider>
            <CommandPaletteProvider>
              <AppContent />
            </CommandPaletteProvider>
          </GuideProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
