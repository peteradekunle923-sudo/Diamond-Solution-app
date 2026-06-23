/**
 * Biometric authentication helper using standard WebAuthn API (credentials.create / credentials.get)
 * Coupled with local storage of obscured credentials to support automated sign-in on standard single-tenant Firebase layouts.
 */

// Simple obfuscation helper to avoid storing plain text passwords in localStorage
const OBFUSCATION_KEY = "diamond-learning-key-928374982";

function obfuscate(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}

function deobfuscate(text: string): string {
  try {
    const raw = atob(text);
    let result = "";
    for (let i = 0; i < raw.length; i++) {
      const charCode = raw.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (e) {
    return "";
  }
}

export interface BiometricCredentials {
  email: string;
  password?: string;
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

/**
 * Register the user's platform biometrics (Fingerprint)
 * triggers standard navigator.credentials.create
 */
export async function enrollBiometrics(email: string, password: string): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    throw new Error("Biometric authentication is not supported on this browser.");
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
      // Obfuscate and store credentials locally
      const payload: BiometricCredentials = {
        email,
        password: obfuscate(password),
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
export async function authenticateBiometrics(): Promise<{ email: string; password?: string } | null> {
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
      if (parsed.email && parsed.password) {
        return {
          email: parsed.email,
          password: deobfuscate(parsed.password)
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

export function clearBiometrics() {
  localStorage.removeItem("diamond_biometric_credentials");
}
