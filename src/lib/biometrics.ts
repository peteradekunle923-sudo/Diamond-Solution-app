/**
 * Biometric authentication helper using standard WebAuthn API (credentials.create / credentials.get)
 * Coupled with local storage of obscured credentials to support automated sign-in on standard single-tenant Firebase layouts.
 */

import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from './firebase';

// SHA-256 client-side hashing helper
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface BiometricCredentials {
  email: string;
  token?: string;
  storedAt: string;
}

export async function isBiometricsSupported(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (e) {
    return false;
  }
}

export async function hasEnrolledBiometrics(): Promise<boolean> {
  const stored = localStorage.getItem("diamond_biometric_credentials");
  return !!stored;
}

export async function getEnrolledEmail(): Promise<string> {
  const stored = localStorage.getItem("diamond_biometric_credentials");
  if (!stored) return "";
  try {
    const parsed = JSON.parse(stored) as BiometricCredentials;
    return parsed.email;
  } catch (e) {
    return "";
  }
}

function getOrGenerateDeviceBiometricId(): string {
  let devId = localStorage.getItem("diamond_device_biometric_id");
  if (!devId) {
    devId = "bio_dev_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now().toString(36);
    localStorage.setItem("diamond_device_biometric_id", devId);
  }
  return devId;
}

/**
 * Register the user's platform biometrics (Fingerprint)
 * triggers standard navigator.credentials.create
 */
export async function enrollBiometrics(email: string, password?: string): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    throw new Error("Biometric authentication is not supported on this browser.");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to enroll biometrics.");
  }

  const deviceId = getOrGenerateDeviceBiometricId();

  // Guard: Check if this device is already enrolled to another user
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('biometricDeviceId', '==', deviceId));
    const querySnapshot = await getDocs(q);

    let isLinkedToOther = false;
    let linkedEmail = "";
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (docSnap.id !== currentUser.uid && data.email !== email) {
        isLinkedToOther = true;
        linkedEmail = data.email || "another account";
      }
    });

    if (isLinkedToOther) {
      throw new Error(`This device is already enrolled to another account (${linkedEmail}). A physical device can only be used to unlock a single account.`);
    }
  } catch (err: any) {
    if (err.message && err.message.includes("physical device can only")) {
      throw err;
    }
    console.warn("Could not verify unique device biometric enrolment in database:", err);
  }

  const randomChallenge = new Uint8Array(32);
  window.crypto.getRandomValues(randomChallenge);

  const userIdBuffer = new TextEncoder().encode(email);

  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge: randomChallenge,
    rp: {
      name: "Diamond Academy",
      id: window.location.hostname
    },
    user: {
      id: userIdBuffer,
      name: email,
      displayName: email
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" }, // ES256
      { alg: -257, type: "public-key" } // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "required"
    },
    timeout: 60000
  };

  try {
    const credential = await navigator.credentials.create({
      publicKey: creationOptions
    });

    if (credential) {
      // Generate a high-entropy cryptographically secure clearance token
      const rawToken = Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const tokenHash = await sha256(rawToken);

      // Save device ID and token hash to user's Firestore document
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        biometricDeviceId: deviceId,
        biometricTokenHash: tokenHash,
        biometricEnrolledAt: new Date().toISOString()
      });

      // Store raw clearance token locally
      const payload: BiometricCredentials = {
        email,
        token: rawToken,
        storedAt: new Date().toISOString()
      };
      localStorage.setItem("diamond_biometric_credentials", JSON.stringify(payload));
      return true;
    }
    return false;
  } catch (error: any) {
    const msg = error?.message || "";
    const isIframe = window.self !== window.top;
    if (isIframe || msg.includes("Permissions Policy") || msg.includes("feature is not enabled") || msg.includes("publickey-credentials")) {
      const friendlyError = new Error("Biometric enrollment is restricted inside the preview frame. Please open this app in a new tab to register or use fingerprint unlock.");
      console.warn("Biometric enrollment unavailable in iframe:", friendlyError.message);
      throw friendlyError;
    }
    console.warn("Biometric registration cancelled or failed:", error);
    throw error;
  }
}

/**
 * Perform verification/unlock using the user's platform biometrics (Fingerprint)
 * triggers standard navigator.credentials.get
 */
export async function authenticateBiometrics(): Promise<{ email: string; token?: string } | null> {
  if (!window.PublicKeyCredential) {
    throw new Error("Biometric authentication is not supported on this browser.");
  }

  const stored = localStorage.getItem("diamond_biometric_credentials");
  if (!stored) {
    throw new Error("No fingerprint enrolled on this device.");
  }

  const randomChallenge = new Uint8Array(32);
  window.crypto.getRandomValues(randomChallenge);

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge: randomChallenge,
    rpId: window.location.hostname,
    userVerification: "required",
    timeout: 60000
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: requestOptions
    });

    if (assertion) {
      const parsed = JSON.parse(stored) as BiometricCredentials;
      if (parsed.email && parsed.token) {
        return {
          email: parsed.email,
          token: parsed.token
        };
      }
    }
    return null;
  } catch (error: any) {
    const msg = error?.message || "";
    const isIframe = window.self !== window.top;
    if (isIframe || msg.includes("Permissions Policy") || msg.includes("feature is not enabled") || msg.includes("publickey-credentials")) {
      const friendlyError = new Error("Biometric authentication is restricted inside the preview frame. Please open this app in a new tab to register or use fingerprint unlock.");
      console.warn("Biometric authentication unavailable in iframe:", friendlyError.message);
      throw friendlyError;
    }
    console.warn("Biometric validation cancelled or failed:", error);
    throw error;
  }
}

export async function clearBiometrics() {
  localStorage.removeItem("diamond_biometric_credentials");
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        biometricDeviceId: null,
        biometricEnrolledAt: null
      });
    } catch (e) {
      console.warn("Could not clear biometricDeviceId from Firestore:", e);
    }
  }
}

export function getDeviceBiometricId(): string {
  return getOrGenerateDeviceBiometricId();
}
