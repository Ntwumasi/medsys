import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import NurseDashboard from './pages/NurseDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import PatientList from './pages/PatientList';
import PatientRegistration from './pages/PatientRegistration';
import PatientDetails from './pages/PatientDetails';

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
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  console.log('User role:', user.role); // Debug log

  // Make role comparison case-insensitive
  const userRole = user.role?.toLowerCase();

  switch (userRole) {
    case 'receptionist':
      return <ReceptionistDashboard />;
    case 'nurse':
      return <NurseDashboard />;
    case 'doctor':
      return <DoctorDashboard />;
    case 'admin':
      return <Dashboard />;
    default:
      console.warn('Unknown role:', user.role, 'Showing default dashboard');
      return <Dashboard />;
  }
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard" element={<ProtectedRoute><RoleDashboard /></ProtectedRoute>} />

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
            <Route path="appointments" element={<div className="p-8"><h1 className="text-2xl font-bold">Appointments (Coming Soon)</h1></div>} />
            <Route path="reports" element={<div className="p-8"><h1 className="text-2xl font-bold">Reports (Coming Soon)</h1></div>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
