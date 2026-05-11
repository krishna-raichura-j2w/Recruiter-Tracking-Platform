import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Candidates from './pages/Candidates';
import CandidateDetail from './pages/CandidateDetail';
import ValidationQueue from './pages/ValidationQueue';
import Submissions from './pages/Submissions';
import Pipeline from './pages/Pipeline';
import Users from './pages/Users';
import MailTracker from './pages/MailTracker';
import Clients from './pages/Clients';
import Export from './pages/Export';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Protected: All roles */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/jobs"
            element={
              <ProtectedRoute>
                <Jobs />
              </ProtectedRoute>
            }
          />

          <Route
            path="/candidates"
            element={
              <ProtectedRoute allowedRoles={['admin', 'delivery_lead', 'recruiter']}>
                <Candidates />
              </ProtectedRoute>
            }
          />

          <Route
            path="/candidates/:id"
            element={
              <ProtectedRoute>
                <CandidateDetail />
              </ProtectedRoute>
            }
          />

          {/* Delivery Lead + Admin */}
          <Route
            path="/validation"
            element={
              <ProtectedRoute allowedRoles={['delivery_lead', 'admin']}>
                <ValidationQueue />
              </ProtectedRoute>
            }
          />

          {/* Delivery Lead + Admin */}
          <Route
            path="/submissions"
            element={
              <ProtectedRoute allowedRoles={['delivery_lead', 'admin', 'kam']}>
                <Submissions />
              </ProtectedRoute>
            }
          />

          <Route
            path="/pipeline"
            element={
              <ProtectedRoute allowedRoles={['delivery_lead', 'admin', 'kam']}>
                <Pipeline />
              </ProtectedRoute>
            }
          />

          {/* Delivery Lead + Admin */}
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['admin', 'delivery_lead']}>
                <Users />
              </ProtectedRoute>
            }
          />

          {/* Recruiter + DL + Admin */}
          <Route
            path="/mail-tracker"
            element={
              <ProtectedRoute allowedRoles={['recruiter', 'delivery_lead', 'admin']}>
                <MailTracker />
              </ProtectedRoute>
            }
          />

          <Route
            path="/clients"
            element={
              <ProtectedRoute allowedRoles={['admin', 'kam', 'delivery_lead']}>
                <Clients />
              </ProtectedRoute>
            }
          />

          <Route
            path="/export"
            element={
              <ProtectedRoute allowedRoles={['admin', 'kam', 'delivery_lead']}>
                <Export />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
