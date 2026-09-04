import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { signOut, getIdToken } from 'firebase/auth';
import { auth, db } from './firebase';
import { setSessionToken } from '../context/AuthContext';

export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class SessionService {
  /**
   * Generates a unique session token and saves it both locally and in Firestore under users/{uid}
   */
  static async startSession(uid: string): Promise<string> {
    const sessionToken = generateUUID();
    
    // Web safe local storage setup
    localStorage.setItem(`session_token_${uid}`, sessionToken);
    localStorage.setItem(`last_active_${uid}`, Date.now().toString());

    // Call Context session tracker
    setSessionToken(sessionToken);

    // Generate device model/info
    const deviceInfo = {
      userAgent: navigator.userAgent,
      screen: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    const sessionDeviceId = `${deviceInfo.userAgent || 'web'}-${deviceInfo.screen}-${deviceInfo.timezone}`;

    // Update Firestore users/{uid} and backup user_sessions/{uid} for compatibility
    const userRef = doc(db, 'users', uid);
    try {
      await setDoc(userRef, {
        sessionToken,
        sessionDeviceId,
        lastLoginAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn("User doc session update warning:", err);
    }

    const backupSessionRef = doc(db, 'user_sessions', uid);
    await setDoc(backupSessionRef, {
      deviceId: sessionDeviceId,
      sessionToken,
      lastLogin: new Date().toISOString(),
      deviceInfo
    }, { merge: true }).catch(err => console.warn("Backup user_sessions update failed:", err));

    return sessionToken;
  }

  /**
   * Clears the session token locally and in Firestore under users/{uid}
   */
  static async clearSession(uid: string): Promise<void> {
    localStorage.removeItem(`session_token_${uid}`);
    localStorage.removeItem(`last_active_${uid}`);

    // Call Context session tracker
    setSessionToken(null);

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        sessionToken: null,
        sessionDeviceId: null
      });
    } catch (e) {
      console.warn("Could not clear sessionToken in Firestore users collection:", e);
    }

    try {
      const backupSessionRef = doc(db, 'user_sessions', uid);
      await updateDoc(backupSessionRef, {
        sessionToken: null
      });
    } catch (e) {
      console.warn("Could not clear sessionToken in Firestore user_sessions collection:", e);
    }
  }

  /**
   * Performs quick validation of local session token against Firestore.
   * If mismatch, forces log out and triggers redirect with reason.
   */
  static async validateSessionOnServer(uid: string): Promise<boolean> {
    const localToken = localStorage.getItem(`session_token_${uid}`);
    if (!localToken) return false;

    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const firestoreToken = snap.data().sessionToken;
        if (firestoreToken && firestoreToken !== localToken) {
          return false;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch sessionToken for server validation:", err);
      // Fallback: don't boot user if we are offline
      if (err instanceof Error && err.message.includes('offline')) {
        return true;
      }
    }
    return true;
  }

  /**
   * Validates Firebase ID token. Forces refresh and throws if revoked or expired.
   */
  static async validateIdToken(uid: string): Promise<boolean> {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== uid) return false;

    try {
      // Force refresh of the ID token to validate with the Firebase server
      await getIdToken(currentUser, true);
      return true;
    } catch (err) {
      console.error("Firebase ID Token is invalid or revoked:", err);
      return false;
    }
  }

  /**
   * Force signs out the user with a specific reason parameter for UI prompt
   */
  static async forceSignOut(reason: 'multi_device' | 'session_expired'): Promise<void> {
    const currentUser = auth.currentUser;
    if (currentUser) {
      // Clean up local items first
      localStorage.removeItem(`session_token_${currentUser.uid}`);
      localStorage.removeItem(`last_active_${currentUser.uid}`);
    }
    
    await signOut(auth);
    
    // Redirect to login with reason
    window.location.href = `/login?reason=${reason}`;
  }
}
