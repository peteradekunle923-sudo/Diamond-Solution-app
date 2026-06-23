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
    let sessionUnsub: (() => void) | null = null;
    let oldSessionToken: string | null = null;

    const unsubscribeAuth = onIdTokenChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fallback: Listen to Firestore instead of JWT since Admin SDK can't set custom claims
        sessionUnsub = onSnapshot(doc(db, 'user_sessions', u.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const tokenSession = data.sessionToken;
            
            if (!inMemorySessionToken && tokenSession) {
               inMemorySessionToken = tokenSession;
               oldSessionToken = tokenSession;
            } else if (inMemorySessionToken === 'PENDING_LOGIN') {
               // Bypass log out during login transitions
            } else if (inMemorySessionToken && tokenSession && inMemorySessionToken !== tokenSession) {
              alert("You’ve been logged out because account was accessed from another device");
              signOut(auth);
            }
          }
        }, (error) => {
          console.warn("Session snapshot listener error (could be normal during logout):", error);
        });
      } else {
        if (sessionUnsub) {
          sessionUnsub();
          sessionUnsub = null;
        }
        setProfile(null);
        setIsAdmin(false);
        setIsModerator(false);
        setIsVerified(false);
        setLoading(false);
        inMemorySessionToken = null;
        oldSessionToken = null;
      }
    });

    return () => {
      unsubscribeAuth();
      if (sessionUnsub) sessionUnsub();
    };
  }, []);

  useEffect(() => {
    if (user) {
      const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile(data);
        setIsAdmin(data.role === 'admin' || user.email === 'peteradekunle923@gmail.com');
        setIsModerator(data.role === 'moderator');
        setIsVerified(data.emailVerified === true);

        // Sync verification status to Firestore
        /* Verification protocol disabled by administrative order */
      } else {
        // Handle case where user is authenticated but profile doc doesn't exist yet
        setProfile(null);
        setIsAdmin(user.email === 'peteradekunle923@gmail.com');
        setIsModerator(false);
        
        // Even if profile doesn't exist, we can try to create a basic one or just wait
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
