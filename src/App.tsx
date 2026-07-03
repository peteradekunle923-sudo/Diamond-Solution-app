import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { Diamond } from 'lucide-react';
import Login from './pages/Login';

// Pages - to be created
const Splash = React.lazy(() => import('./pages/Splash'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CourseList = React.lazy(() => import('./pages/CourseList'));
const CourseDetail = React.lazy(() => import('./pages/CourseDetail'));
const StudyPage = React.lazy(() => import('./pages/StudyPage'));
const AffiliateDashboard = React.lazy(() => import('./pages/AffiliateDashboard'));
const Profile = React.lazy(() => import('./pages/Profile'));
const ActivityLog = React.lazy(() => import('./pages/ActivityLog'));
const Chat = React.lazy(() => import('./pages/Chat'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const AccountSettings = React.lazy(() => import('./pages/AccountSettings'));
const Reactivation = React.lazy(() => import('./pages/Reactivation'));
const Leaderboard = React.lazy(() => import('./pages/Leaderboard'));

const PageLoader = () => (
  <div className="fixed inset-0 bg-[#07101F] flex flex-col items-center justify-center z-50 px-4">
    <div className="flex flex-col items-center space-y-6">
      <div className="w-16 h-16 bg-[#C9930A] diamond-mark drop-shadow-[0_0_20px_rgba(201,147,10,0.5)] flex items-center justify-center animate-pulse">
        <Diamond className="w-8 h-8 text-[#07101F]" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-serif font-black tracking-[0.25em] text-[#EDE8E1] uppercase animate-pulse">
          DIAMOND SOLUTION
        </h3>
        <p className="text-[#45647E] text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">
          Securing Access...
        </p>
      </div>
    </div>
  </div>
);

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <PageLoader />;
  return user && isAdmin ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  React.useEffect(() => {
    if (user) {
      import('./lib/SessionService').then(({ SessionService }) => {
        // Validate ID token on screen load
        SessionService.validateIdToken(user.uid).then((isValidToken) => {
          if (!isValidToken) {
            SessionService.forceSignOut('session_expired');
          }
        });

        // Compare local session token with Firestore on screen load
        SessionService.validateSessionOnServer(user.uid).then((isValidSession) => {
          if (!isValidSession) {
            SessionService.forceSignOut('multi_device');
          }
        });
      });
    }
  }, [location.pathname, user]);

  if (loading) return <PageLoader />;
  
  if (user && (profile?.status === 'suspended' || profile?.status === 'device_blocked' || profile?.deviceBlockPending) && location.pathname !== '/reactivate') {
    return <Navigate to="/reactivate" replace />;
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <React.Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Splash />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/courses" element={<ProtectedRoute><CourseList /></ProtectedRoute>} />
              <Route path="/courses/:id" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
              <Route path="/courses/:id/study" element={<ProtectedRoute><StudyPage /></ProtectedRoute>} />
              <Route path="/affiliate" element={<ProtectedRoute><AffiliateDashboard /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/activity-log" element={<ProtectedRoute><ActivityLog /></ProtectedRoute>} />
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
