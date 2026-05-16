import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

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
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setIsAdmin(false);
        setIsModerator(false);
        setIsVerified(false);
        setLoading(false);
      }
    });

    return unsubscribeAuth;
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
