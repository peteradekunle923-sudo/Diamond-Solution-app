import React, { createContext, useContext, useEffect, useState } from 'react';
import { onIdTokenChanged, signOut, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import axios from 'axios';

export let inMemorySessionToken: string | null = null;
export const setSessionToken = (token: string | null) => { inMemorySessionToken = token; };

// Setup axios interceptor
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.data?.error === 'permission-denied' || error.response?.status === 403 || error.code === 'permission-denied') {
      alert("You’ve been logged out because account was accessed from another device");
      await signOut(auth);
    }
    return Promise.reject(error);
  }
);

// Global unhandled error interception for rogue Firestore snapshot listeners
const handleGlobalPermError = async (errMsg: string) => {
  if (errMsg.includes('permission-denied') || errMsg.includes('Missing or insufficient permissions')) {
    if (auth.currentUser) {
      alert("You’ve been logged out because account was accessed from another device");
      await signOut(auth);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    handleGlobalPermError(String(event.reason?.message || event.reason));
  });
  window.addEventListener('error', (event) => {
    handleGlobalPermError(String(event.message || event.error?.message));
  });
}

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isVerified: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isModerator: false,
  isVerified: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    let backgroundTime: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        backgroundTime = Date.now();
      } else if (document.visibilityState === 'visible' && backgroundTime !== null) {
        const elapsedMinutes = (Date.now() - backgroundTime) / (1000 * 60);
        if (elapsedMinutes > 30) {
          import('../lib/SessionService').then(({ SessionService }) => {
            SessionService.forceSignOut('session_expired');
          });
        }
        backgroundTime = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribeAuth = onIdTokenChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // App launch / page refresh session timeout validation
        const lastActive = localStorage.getItem(`last_active_${u.uid}`);
        if (lastActive) {
          const elapsedMinutes = (Date.now() - parseInt(lastActive, 10)) / (1000 * 60);
          if (elapsedMinutes > 30) {
            import('../lib/SessionService').then(({ SessionService }) => {
              SessionService.forceSignOut('session_expired');
            });
            return;
          }
        }
        localStorage.setItem(`last_active_${u.uid}`, Date.now().toString());
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsModerator(false);
        setIsVerified(false);
        setLoading(false);
        inMemorySessionToken = null;
      }
    });

    return () => {
      unsubscribeAuth();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Update last active time on user events
  useEffect(() => {
    if (!user) return;

    const updateActiveTime = () => {
      localStorage.setItem(`last_active_${user.uid}`, Date.now().toString());
    };

    window.addEventListener('mousemove', updateActiveTime);
    window.addEventListener('keydown', updateActiveTime);
    window.addEventListener('click', updateActiveTime);
    window.addEventListener('scroll', updateActiveTime);

    return () => {
      window.removeEventListener('mousemove', updateActiveTime);
      window.removeEventListener('keydown', updateActiveTime);
      window.removeEventListener('click', updateActiveTime);
      window.removeEventListener('scroll', updateActiveTime);
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile(data);
          setIsAdmin(data.role === 'admin' || user.email === 'peteradekunle923@gmail.com');
          setIsModerator(data.role === 'moderator');
          setIsVerified(data.emailVerified === true);

          // FEATURE 1: Check session token mismatch
          const tokenSession = data.sessionToken;
          const localToken = localStorage.getItem(`session_token_${user.uid}`);

          if (!inMemorySessionToken && tokenSession) {
            inMemorySessionToken = tokenSession;
          }

          if (inMemorySessionToken === 'PENDING_LOGIN') {
            // Bypass during active transitions
          } else if (localToken && tokenSession && localToken !== tokenSession) {
            import('../lib/SessionService').then(({ SessionService }) => {
              SessionService.forceSignOut('multi_device');
            });
          }
        } else {
          setProfile(null);
          setIsAdmin(user.email === 'peteradekunle923@gmail.com');
          setIsModerator(false);
        }
        setLoading(false);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        setLoading(false);
      });

      return unsubProfile;
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isModerator, isVerified }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
