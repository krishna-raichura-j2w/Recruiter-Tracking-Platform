import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { NavCountsProvider } from './context/NavCountsContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import CooUsers from './pages/CooUsers';
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
import FollowUp from './pages/FollowUp';
import ChangePassword from './pages/ChangePassword';
import DemandStatus from './pages/DemandStatus';
import FormBuilder from './pages/FormBuilder';
import Leaderboard from './pages/Leaderboard';
import Skills from './pages/Skills';
import Pods from './pages/Pods';

function ForceChangePasswordGate({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  if (user?.must_change_password) {
    return <ChangePassword user={user} onDone={updateUser} />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'coo' ? '/leaderboard' : '/jobs'} replace />;
}

function UsersRouter() {
  const { user } = useAuth();
  return user?.role === 'coo' ? <CooUsers /> : <Users />;
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
      <NavCountsProvider>
      <BrowserRouter>
        <ForceChangePasswordGate>
          <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Root redirect */}
          <Route path="/" element={<HomeRedirect />} />

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
              <ProtectedRoute allowedRoles={['admin', 'delivery_lead', 'recruiter', 'kam']}>
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

          {/* Only KAM + Admin can submit candidates to a client */}
          <Route
            path="/submissions"
            element={
              <ProtectedRoute allowedRoles={['admin', 'kam']}>
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

          {/* Delivery Lead + Admin + COO */}
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['admin', 'delivery_lead', 'coo']}>
                <UsersRouter />
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

          <Route
            path="/followup"
            element={
              <ProtectedRoute allowedRoles={['admin', 'kam', 'delivery_lead', 'recruiter']}>
                <FollowUp />
              </ProtectedRoute>
            }
          />

          <Route
            path="/demand-status"
            element={
              <ProtectedRoute allowedRoles={['admin', 'kam', 'delivery_lead']}>
                <DemandStatus />
              </ProtectedRoute>
            }
          />

          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/form-builder"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <FormBuilder />
              </ProtectedRoute>
            }
          />

          <Route
            path="/skills"
            element={
              <ProtectedRoute allowedRoles={['admin', 'recruiter', 'delivery_lead', 'kam']}>
                <Skills />
              </ProtectedRoute>
            }
          />

          <Route
            path="/pods"
            element={
              <ProtectedRoute allowedRoles={['admin', 'delivery_lead', 'bh', 'kam', 'coo']}>
                <Pods />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </ForceChangePasswordGate>
      </BrowserRouter>
      </NavCountsProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
