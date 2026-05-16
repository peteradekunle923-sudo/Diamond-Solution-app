import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';

// Pages - to be created
const Splash = React.lazy(() => import('./pages/Splash'));
const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CourseList = React.lazy(() => import('./pages/CourseList'));
const CourseDetail = React.lazy(() => import('./pages/CourseDetail'));
const StudyPage = React.lazy(() => import('./pages/StudyPage'));
const AffiliateDashboard = React.lazy(() => import('./pages/AffiliateDashboard'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Chat = React.lazy(() => import('./pages/Chat'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const AccountSettings = React.lazy(() => import('./pages/AccountSettings'));
const Reactivation = React.lazy(() => import('./pages/Reactivation'));
const Leaderboard = React.lazy(() => import('./pages/Leaderboard'));

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return null;
  return user && isAdmin ? <>{children}</> : <Navigate to="/dashboard" />;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  
  if (user && profile?.status === 'suspended' && window.location.pathname !== '/reactivate') {
    return <Navigate to="/reactivate" />;
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <React.Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
            <Routes>
              <Route path="/" element={<Splash />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/courses" element={<ProtectedRoute><CourseList /></ProtectedRoute>} />
              <Route path="/courses/:id" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
              <Route path="/courses/:id/study" element={<ProtectedRoute><StudyPage /></ProtectedRoute>} />
              <Route path="/affiliate" element={<ProtectedRoute><AffiliateDashboard /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
              <Route path="/reactivate" element={<ProtectedRoute><Reactivation /></ProtectedRoute>} />
              <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              {/* Add more routes here */}
            </Routes>
          </React.Suspense>
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
}
