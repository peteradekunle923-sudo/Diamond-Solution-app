import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, query, collection, where, getDocs, limit, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'motion/react';
import { Mail, Lock, ArrowRight, ShieldCheck, Send, MessageCircle, Facebook, Twitter, Instagram, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { DiamondLogo } from '../components/DiamondLogo';
import { setSessionToken } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { isBiometricsSupported, hasEnrolledBiometrics, enrollBiometrics, authenticateBiometrics, getEnrolledEmail, clearBiometrics, getDeviceBiometricId } from '../lib/biometrics';
import { getFriendlyErrorMessage } from '../utils/firebaseError';
import { getOrGenerateDeviceId } from '../utils/deviceHelper';

import { DEPARTMENTS } from '../constants';

const Platform = {
  OS: typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android'
};

const SafeAreaView = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', minHeight: '100vh', ...style }}>
      {children}
    </div>
  );
};

const KeyboardAvoidingView = ({ children, style, behavior }: { children: React.ReactNode; style?: React.CSSProperties; behavior?: string }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', ...style }} data-behavior={behavior}>
      {children}
    </div>
  );
};

const ScrollView = ({ children, contentContainerStyle, keyboardShouldPersistTaps, showsVerticalScrollIndicator }: { children: React.ReactNode; contentContainerStyle?: React.CSSProperties; keyboardShouldPersistTaps?: string; showsVerticalScrollIndicator?: boolean }) => {
  return (
    <div style={{ overflowY: 'auto', flex: 1, width: '100%', ...contentContainerStyle }} data-taps={keyboardShouldPersistTaps} data-scroll={showsVerticalScrollIndicator}>
      {children}
    </div>
  );
};

const ActivityIndicator = ({ size, color }: { size?: number | string; color?: string }) => {
  const isLarge = size === 'large';
  return (
    <div 
      className={cn("animate-spin rounded-full border-2 border-current", isLarge ? "h-8 w-8" : "h-5 w-5")} 
      style={{ borderColor: color || 'currentColor', borderTopColor: 'transparent' }} 
    />
  );
};

export default function Login() {
  const { t, language } = useLanguage();
  const [searchParams] = useSearchParams();
  const referralFromUrl = searchParams.get('ref');
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(() => {
    if (location.pathname === '/register') return false;
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (modeParam === 'signup') return false;
    if (modeParam === 'login') return true;
    return true;
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [manualReferralCode, setManualReferralCode] = useState(() => referralFromUrl || sessionStorage.getItem('referralCode') || '');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [institutionalName, setInstitutionalName] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+234');
  const [error, setError] = useState('');
  const [securityModal, setSecurityModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [otpAction, setOtpAction] = useState<'register' | 'deviceCheck'>('register');
  const [tempPassword, setTempPassword] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [tempUserId, setTempUserId] = useState('');
  const [registrationData, setRegistrationData] = useState<any>(null);
  const navigate = useNavigate();
  const [dynamicSocialLinks, setDynamicSocialLinks] = useState<any[]>([]);

  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [biometricsEnrolled, setBiometricsEnrolled] = useState(false);
  const [enableBiometricsOnLogin, setEnableBiometricsOnLogin] = useState(false);
  const [enrolledEmail, setEnrolledEmail] = useState('');
  const [biometricUnlocking, setBiometricUnlocking] = useState(false);
  const [useFingerprintToUnlock, setUseFingerprintToUnlock] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  const [deletedStaticNames, setDeletedStaticNames] = useState<string[]>([]);
  const [allFacultiesList, setAllFacultiesList] = useState<string[]>(DEPARTMENTS);

  useEffect(() => {
    async function initBiometrics() {
      setIsInIframe(window.self !== window.top);
      const supported = await isBiometricsSupported();
      setBiometricsSupported(supported);
      if (supported) {
        const enrolled = await hasEnrolledBiometrics();
        setBiometricsEnrolled(enrolled);
        if (enrolled) {
          const emailStr = await getEnrolledEmail();
          setEnrolledEmail(emailStr);
          // Auto fill email if biometrics enrolled
          setEmail(emailStr);
          setUseFingerprintToUnlock(true);
        }
      }
    }
    initBiometrics();
  }, []);

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if (referralFromUrl && !modeParam && location.pathname === '/login') {
      sessionStorage.setItem('referralCode', referralFromUrl);
      navigate(`/?ref=${referralFromUrl}`, { replace: true });
    } else {
      const code = referralFromUrl || sessionStorage.getItem('referralCode');
      if (code) {
        setManualReferralCode(code);
      }
      
      if (location.pathname === '/register' || modeParam === 'signup') {
        setIsLogin(false);
      } else if (location.pathname === '/login' || modeParam === 'login') {
        setIsLogin(true);
      }
    }
  }, [referralFromUrl, navigate, searchParams, location.pathname]);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'multi_device') {
      setError("Your account has been logged in on another device. You have been signed out.");
      setSecurityModal({
        isOpen: true,
        title: 'Multiple Device Login',
        message: 'Your account has been logged in on another device. You have been signed out to protect your account security.'
      });
      navigate('/login', { replace: true });
    } else if (reason === 'session_expired') {
      setError("Your session has expired. Please log in again.");
      setSecurityModal({
        isOpen: true,
        title: 'Session Expired',
        message: 'Your session has expired due to inactivity. Please log in again.'
      });
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'faculties'), (snap) => {
      const deleted = snap.docs.filter(doc => doc.data().isDeleted).map(doc => doc.data().name);
      setDeletedStaticNames(deleted);
      
      const customActive = snap.docs.filter(doc => !doc.data().isDeleted).map(doc => doc.data().name);
      const combined = Array.from(new Set([...DEPARTMENTS.filter(d => !deleted.includes(d)), ...customActive]));
      setAllFacultiesList(combined.length > 0 ? combined : DEPARTMENTS);
      
      if (combined.length > 0 && !combined.includes(department)) {
        setDepartment(combined[0]);
      }
    });
    return () => unsub();
  }, [department]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'institutional_links'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const links = [];
        if (data.telegram) links.push({ name: 'Telegram', icon: Send, url: `https://t.me/${data.telegram.replace('@', '')}`, color: 'text-[#229ED9]' });
        if (data.whatsapp) links.push({ name: 'WhatsApp', icon: MessageCircle, url: `https://wa.me/${data.whatsapp.replace('+', '')}`, color: 'text-emerald-500' });
        if (data.facebook) links.push({ name: 'Facebook', icon: Facebook, url: data.facebook, color: 'text-blue-600' });
        if (data.twitter) links.push({ name: 'X (Twitter)', icon: Twitter, url: data.twitter.startsWith('http') ? data.twitter : `https://x.com/${data.twitter.replace('@', '')}`, color: 'text-white' });
        if (data.instagram) links.push({ name: 'Instagram', icon: Instagram, url: data.instagram.startsWith('http') ? data.instagram : `https://instagram.com/${data.instagram.replace('@', '')}`, color: 'text-pink-500' });
        
        setDynamicSocialLinks(links);
      } else {
        // Fallback or default links if none exist yet
        setDynamicSocialLinks([
          { name: 'Telegram', icon: Send, url: 'https://t.me/diamondsolution', color: 'text-[#229ED9]' },
          { name: 'WhatsApp', icon: MessageCircle, url: 'https://wa.me/2347065969567', color: 'text-emerald-500' },
          { name: 'Instagram', icon: Instagram, url: 'https://instagram.com/diamondsolution', color: 'text-pink-500' },
          { name: 'Facebook', icon: Facebook, url: 'https://facebook.com/diamondsolution', color: 'text-blue-600' },
          { name: 'X (Twitter)', icon: Twitter, url: 'https://x.com/diamondsolution', color: 'text-white' }
        ]);
      }
    }, (err) => {
      // Non-critical links fetch
      console.warn("Institutional links fetch failed:", err.message);
    });

    return () => unsubscribe();
  }, []);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (otpAction === 'deviceCheck') {
      try {
        const verifyRes = await axios.post('/api/otp/verify', {
          userId: tempUserId,
          purpose: 'device_verification',
          code: otpInput
        });

        if (!verifyRes.data || !verifyRes.data.success) {
          setError('Invalid verification code. Please try again.');
          setLoading(false);
          return;
        }

        setSessionToken('PENDING_LOGIN'); // Bypass onSnapshot auto-logout
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Sign in timeout")), 15000));
        const res = await Promise.race([
          signInWithEmailAndPassword(auth, email, tempPassword),
          timeoutPromise
        ]) as any;

        const deviceInfo = {
          userAgent: navigator.userAgent,
          screen: `${window.screen.width}x${window.screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        
        let deviceId = 'unknown';
        try {
          const deviceString = `${deviceInfo.userAgent || ''}-${deviceInfo.screen || ''}-${deviceInfo.timezone || ''}`;
          const encoder = new TextEncoder();
          const data = encoder.encode(deviceString);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          deviceId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
          console.warn("Device id generation failed", e);
        }

        // Start single-session validation
        const { SessionService } = await import('../lib/SessionService');
        await SessionService.startSession(res.user.uid);
        
        sessionStorage.removeItem('diamond_onboard_shown');
        
        // Delay navigation so AuthContext state updates first (preventing route bounce)
        setTimeout(() => {
          navigate('/dashboard');
          setLoading(false);
        }, 500);
        return;
      } catch (err: any) {
        setError('Login verification failed: ' + (err.response?.data?.error || err.message));
        setLoading(false);
      }
    } else {
      try {
        const userId = auth.currentUser?.uid || tempUserId;
        const verifyRes = await axios.post('/api/otp/verify', {
          userId,
          purpose: 'registration',
          code: otpInput
        });

        if (verifyRes.data && verifyRes.data.success) {
          // Fire and forget verification update
          if (auth.currentUser) {
            setDoc(doc(db, 'users', auth.currentUser.uid), {
              emailVerified: true
            }, { merge: true }).catch(err => console.warn('emailVerified update failed', err));
          }
          setTimeout(() => {
            navigate('/dashboard');
            setLoading(false);
          }, 500);
          return;
        } else {
          setError('Verification failed. Invalid code.');
          setLoading(false);
        }
      } catch (err: any) {
        setError('Verification Error: ' + (err.response?.data?.error || err.message));
        setLoading(false);
      }
    }
  };

  const africanCountries = [
    { code: '+234', flag: '🇳🇬', name: 'Nigeria', currency: 'NGN' },
    { code: '+233', flag: '🇬🇭', name: '🇬🇭 Ghana', currency: 'USD' },
    { code: '+254', flag: '🇰🇪', name: '🇰🇪 Kenya', currency: 'USD' },
    { code: '+221', flag: '🇸🇳', name: '🇸🇳 Senegal', currency: 'USD' },
    { code: '+225', flag: '🇨🇮', name: "🇨🇮 Côte d'Ivoire", currency: 'USD' },
    { code: '+226', flag: '🇧🇫', name: '🇧🇫 Burkina Faso', currency: 'USD' },
    { code: '+227', flag: '🇳🇪', name: '🇳🇪 Niger', currency: 'USD' },
    { code: '+228', flag: '🇹🇬', name: '🇹🇬 Togo', currency: 'USD' },
    { code: '+229', flag: '🇧🇯', name: '🇧🇯 Benin', currency: 'USD' },
    { code: '+241', flag: '🇬🇦', name: '🇬🇦 Gabon', currency: 'USD' },
    { code: '+242', flag: '🇨🇬', name: '🇨🇬 Congo', currency: 'USD' },
    { code: '+243', flag: '🇨🇩', name: '🇨🇩 DR Congo', currency: 'USD' },
    { code: '+223', flag: '🇲🇱', name: '🇲🇱 Mali', currency: 'USD' },
    { code: '+224', flag: '🇬🇳', name: '🇬🇳 Guinea', currency: 'USD' },
    { code: '+27', flag: '🇿🇦', name: '🇿🇦 South Africa', currency: 'USD' },
    { code: '+231', flag: '🇱🇷', name: '🇱🇷 Liberia', currency: 'USD' },
    { code: '+232', flag: '🇸🇱', name: '🇸🇱 Sierra Leone', currency: 'USD' },
    { code: '+256', flag: '🇺🇬', name: '🇺🇬 Uganda', currency: 'USD' },
    { code: '+255', flag: '🇹🇿', name: '🇹🇿 Tanzania', currency: 'USD' },
    { code: '+250', flag: '🇷🇼', name: '🇷🇼 Rwanda', currency: 'USD' },
    { code: '+20', flag: '🇪🇬', name: '🇪🇬 Egypt', currency: 'USD' },
    { code: '+212', flag: '🇲🇦', name: '🇲🇦 Morocco', currency: 'USD' },
    { code: '+216', flag: '🇹🇳', name: '🇹🇳 Tunisia', currency: 'USD' },
    { code: '+213', flag: '🇩🇿', name: '🇩🇿 Algeria', currency: 'USD' },
    { code: '+218', flag: '🇱🇾', name: '🇱🇾 Libya', currency: 'USD' },
    { code: '+249', flag: '🇸🇩', name: '🇸🇩 Sudan', currency: 'USD' },
    { code: '+251', flag: '🇪🇹', name: '🇪🇹 Ethiopia', currency: 'USD' },
    { code: '+252', flag: '🇸🇴', name: '🇸🇴 Somalia', currency: 'USD' },
    { code: '+253', flag: '🇩🇯', name: '🇩🇯 Djibouti', currency: 'USD' },
    { code: '+291', flag: '🇪🇷', name: '🇪🇷 Eritrea', currency: 'USD' },
    { code: '+237', flag: '🇨🇲', name: '🇨🇲 Cameroon', currency: 'USD' },
    { code: '+240', flag: '🇬🇶', name: '🇬🇶 Equatorial Guinea', currency: 'USD' },
    { code: '+236', flag: '🇨🇫', name: '🇨🇫 Central African Republic', currency: 'USD' },
    { code: '+235', flag: '🇹🇩', name: '🇹🇩 Chad', currency: 'USD' },
    { code: '+239', flag: '🇸🇹', name: '🇸🇹 Sao Tome and Principe', currency: 'USD' },
    { code: '+244', flag: '🇦🇴', name: '🇦🇴 Angola', currency: 'USD' },
    { code: '+264', flag: '🇳🇦', name: '🇳🇦 Namibia', currency: 'USD' },
    { code: '+267', flag: '🇧🇼', name: '🇧🇼 Botswana', currency: 'USD' },
    { code: '+263', flag: '🇿🇼', name: '🇿🇼 Zimbabwe', currency: 'USD' },
    { code: '+258', flag: '🇲🇿', name: '🇲🇿 Mozambique', currency: 'USD' },
    { code: '+260', flag: '🇿🇲', name: '🇿🇲 Zambia', currency: 'USD' },
    { code: '+265', flag: '🇲🇼', name: '🇲🇼 Malawi', currency: 'USD' },
    { code: '+266', flag: '🇱🇸', name: '🇱🇸 Lesotho', currency: 'USD' },
    { code: '+268', flag: '🇸🇿', name: '🇸🇿 Eswatini', currency: 'USD' },
    { code: '+261', flag: '🇲🇬', name: '🇲🇬 Madagascar', currency: 'USD' },
    { code: '+230', flag: '🇲🇺', name: '🇲🇺 Mauritius', currency: 'USD' },
    { code: '+248', flag: '🇸🇨', name: '🇸🇨 Seychelles', currency: 'USD' },
    { code: '+269', flag: '🇰🇲', name: '🇰🇲 Comoros', currency: 'USD' },
    { code: '+238', flag: '🇨🇻', name: '🇨🇻 Cape Verde', currency: 'USD' },
  ];

  const validatePassword = (pw: string) => {
    const minLength = pw.length >= 8;
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
  };

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setError('');
    setBiometricUnlocking(true);
    setLoading(true);
    try {
      const credentials = await authenticateBiometrics();
      if (credentials && credentials.email && credentials.password) {
        setEmail(credentials.email);
        setPassword(credentials.password);
        setSessionToken('PENDING_LOGIN'); // Bypass onSnapshot auto-logout
        
        const res = await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
        
        // Safety verification: verify that this user is indeed registered on this device
        const userDoc = await getDoc(doc(db, 'users', res.user.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        const localDeviceId = getDeviceBiometricId();
        
        if (userData && userData.biometricDeviceId && userData.biometricDeviceId !== localDeviceId) {
          await signOut(auth);
          // Clear cached credentials since they do not belong to this physical device
          await clearBiometrics();
          setBiometricsEnrolled(false);
          setEnrolledEmail('');
          setUseFingerprintToUnlock(false);
          throw new Error("This fingerprint credential is registered on a different device and cannot be used on this device.");
        }

        if (userData) {
          const isUserAdmin = userData.role === 'admin' || userData.email === 'peteradekunle923@gmail.com';
          if (!isUserAdmin) {
            const currentDeviceId = getOrGenerateDeviceId();
            const registeredDevices: string[] = userData.registeredDeviceIds || [];

            if (!registeredDevices.includes(currentDeviceId)) {
              if (registeredDevices.length >= 2) {
                const isBlocked = userData.status === 'device_blocked' || userData.deviceBlockPending;
                if (!isBlocked) {
                  const blockDuration = 24 * 60 * 60 * 1000;
                  const futureBlockedUntil = Date.now() + blockDuration;
                  try {
                    await updateDoc(doc(db, 'users', res.user.uid), {
                      status: 'device_blocked',
                      deviceBlockPending: true,
                      blockedUntil: futureBlockedUntil,
                      reactivationPaid: false
                    });
                    userData.status = 'device_blocked';
                    userData.deviceBlockPending = true;
                  } catch (blockErr) {
                    console.warn("Could not update device_blocked status:", blockErr);
                  }
                }
              } else {
                const updatedDevices = [...registeredDevices, currentDeviceId];
                try {
                  await updateDoc(doc(db, 'users', res.user.uid), {
                    registeredDeviceIds: updatedDevices
                  });
                } catch (devErr) {
                  console.warn("Could not update registeredDeviceIds:", devErr);
                }
              }
            }
          }
        }

        const deviceInfo = {
          userAgent: navigator.userAgent,
          screen: `${window.screen.width}x${window.screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };

        const deviceString = `${deviceInfo.userAgent || ''}-${deviceInfo.screen || ''}-${deviceInfo.timezone || ''}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(deviceString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const deviceId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Start single-session validation safely
        try {
          const { SessionService } = await import('../lib/SessionService');
          await SessionService.startSession(res.user.uid);
        } catch (sessionErr) {
          console.warn("SessionService start warning:", sessionErr);
        }

        await res.user.getIdToken(true);
        sessionStorage.removeItem('diamond_onboard_shown');
        if (userData?.status === 'suspended' || userData?.status === 'device_blocked' || userData?.deviceBlockPending) {
          navigate('/reactivate');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError('No valid biometric credentials detected. Please log in with your email and password first.');
      }
    } catch (err: any) {
      console.warn("Biometric unlocking failed:", err);
      setError(err?.message || 'Biometric verification cancelled or not registered.');
    } finally {
      setBiometricUnlocking(false);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (useFingerprintToUnlock) {
      handleBiometricUnlock();
      return;
    }
    
    if (!isLogin) {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (!validatePassword(password)) {
        setError('Password too weak');
        return;
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        setSessionToken('PENDING_LOGIN'); // Bypass onSnapshot auto-logout
        const res = await signInWithEmailAndPassword(auth, email, password);
        const userDocRef = doc(db, 'users', res.user.uid);
        let userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          // Self-healing: create the missing user profile
          const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
          const defaultProfile = {
            uid: res.user.uid,
            email: res.user.email || email,
            displayName: res.user.displayName || email.split('@')[0],
            username: (res.user.displayName || email.split('@')[0]).toLowerCase().replace(/\s/g, ''),
            role: 'student',
            createdAt: new Date().toISOString(),
            referralCode: `DS${randomPart}`,
            affiliateStatus: 'active',
            isAffiliate: true,
            isPartner: true,
            hasPaidAffiliateFee: true,
            hasSeenTour: true,
            hasSeenProfessionalTour: false,
            balance: 0,
            currency: 'NGN',
            language: 'en',
            emailVerified: false
          };
          await setDoc(userDocRef, defaultProfile);
          // Refetch
          userDocSnap = await getDoc(userDocRef);
        }

        const userData = userDocSnap.data() || {};
        const isUserAdmin = userData.role === 'admin' || email === 'peteradekunle923@gmail.com';

        if (!isUserAdmin) {
          const currentDeviceId = getOrGenerateDeviceId();
          const registeredDevices: string[] = userData.registeredDeviceIds || [];

          if (!registeredDevices.includes(currentDeviceId)) {
            if (registeredDevices.length >= 2) {
              const isBlocked = userData.status === 'device_blocked' || userData.deviceBlockPending;
              if (!isBlocked) {
                const blockDuration = 24 * 60 * 60 * 1000;
                const futureBlockedUntil = Date.now() + blockDuration;
                try {
                  await updateDoc(userDocRef, {
                    status: 'device_blocked',
                    deviceBlockPending: true,
                    blockedUntil: futureBlockedUntil,
                    reactivationPaid: false
                  });
                  userData.status = 'device_blocked';
                  userData.deviceBlockPending = true;
                } catch (blockErr) {
                  console.warn("Could not set device_blocked status:", blockErr);
                }
              }
            } else {
              const updatedDevices = [...registeredDevices, currentDeviceId];
              try {
                await updateDoc(userDocRef, {
                  registeredDeviceIds: updatedDevices
                });
              } catch (devErr) {
                console.warn("Could not update registeredDeviceIds:", devErr);
              }
            }
          }
        }

        // Start single-session validation safely
        try {
          const { SessionService } = await import('../lib/SessionService');
          await SessionService.startSession(res.user.uid);
        } catch (sessionErr) {
          console.warn("SessionService start warning:", sessionErr);
        }
        
        if (enableBiometricsOnLogin && biometricsSupported) {
          try {
            await enrollBiometrics(email, password);
          } catch (e: any) {
            console.warn("Could not enroll biometrics:", e);
            alert(e?.message || "Could not enroll fingerprint biometrics.");
          }
        }
        
        await res.user.getIdToken(true);
        // Clear session tour flag on explicit login as requested
        sessionStorage.removeItem('diamond_onboard_shown');
        if (userData?.status === 'suspended' || userData?.status === 'device_blocked' || userData?.deviceBlockPending) {
          navigate('/reactivate');
        } else {
          navigate('/dashboard');
        }
      } else {
        setSessionToken('PENDING_LOGIN'); // Bypass onSnapshot auto-logout
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        const idToken = await userCredential.user.getIdToken();
        const deviceInfo = {
          userAgent: navigator.userAgent,
          screen: `${window.screen.width}x${window.screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        const deviceString = `${deviceInfo.userAgent || ''}-${deviceInfo.screen || ''}-${deviceInfo.timezone || ''}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(deviceString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const deviceId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        let finalReferralCode = (referralFromUrl || manualReferralCode || '').trim();
        let referredByUid = null;
        
        if (finalReferralCode) {
          let cleanCode = finalReferralCode.toUpperCase().replace('-', '');
          if (!cleanCode.startsWith('DS')) {
             cleanCode = 'DS' + cleanCode;
          }
          finalReferralCode = cleanCode;

          const legacyRefCode = 'DS-' + finalReferralCode.substring(2);

          const referrerQuery = query(
            collection(db, 'users'),
            where('referralCode', 'in', [finalReferralCode, legacyRefCode]),
            limit(1)
          );
          const referrerSnap = await getDocs(referrerQuery);
          if (!referrerSnap.empty) {
            referredByUid = referrerSnap.docs[0].id;
          }
        }

        const country = africanCountries.find(c => c.code === countryCode);
        const currency = country?.currency || 'USD';

        // Write the users document first to satisfy firestore.rules create schema requirements
        const currentDeviceId = getOrGenerateDeviceId();
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email,
          displayName: name,
          username: username.toLowerCase().trim() || email.split('@')[0],
          institutionalName: institutionalName,
          department: department,
          phone: `${countryCode}${phone}`,
          role: 'student',
          createdAt: new Date().toISOString(),
          referralCode: 'DS' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          referredBy: finalReferralCode || null,
          referredByUid: referredByUid,
          affiliateStatus: 'active',
          isAffiliate: true,
          isPartner: true,
          hasPaidAffiliateFee: true,
          hasSeenTour: true,
          hasSeenProfessionalTour: false,
          balance: 0,
          currency,
          language,
          emailVerified: false,
          registeredDeviceIds: [currentDeviceId]
        });

        // Start single-session validation safely AFTER user profile document exists
        const { SessionService } = await import('../lib/SessionService');
        await SessionService.startSession(userCredential.user.uid);
        
        await userCredential.user.getIdToken(true);

        try {
          const resOtp = await axios.post('/api/otp/request', {
            userId: userCredential.user.uid,
            email,
            purpose: 'registration'
          });
          
          if (resOtp.data && resOtp.data.emailSent === false) {
             alert(`[PREVIEW MODE] Verification Code bypassed for preview:\n\nGo to developer tools or check backend system logs (collection system_logs) to find your verification code.`);
          }
          
          // Sign out so they are "directed to login page" after registration as requested
          await signOut(auth);
          
          setError('success:Institutional Verification protocol initiated. Check your email to confirm registration, then sign in.');
          setIsLogin(true);
          setStep(1);
          setPassword('');
          setConfirmPassword('');
        } catch (emailErr: any) {
          console.error('Email send failed:', emailErr);
          const detail = emailErr.response?.data?.error || emailErr.message;
          
          await signOut(auth); // Ensure they are signed out even if email fails
          
          setError(`success:Registration successful! (Verification email dispatch failed: ${detail}). Please login.`);
          setIsLogin(true);
          setStep(1);
        }
      }
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {securityModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-white border-2 border-[#2563EB]/40 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-[#2563EB]">
              <DiamondLogo size={20} variant="blue" />
              <h3 className="text-base font-serif font-black uppercase tracking-wider text-slate-900">{securityModal.title}</h3>
            </div>
            <p className="text-slate-600 text-xs font-medium leading-relaxed">{securityModal.message}</p>
            <button
              onClick={() => setSecurityModal(prev => ({ ...prev, isOpen: false }))}
              className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-black text-[10px] uppercase tracking-[0.3em] py-4 rounded-xl shadow-lg transition-all transform active:scale-[0.98] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <div className="flex-1 w-full min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center relative transition-all duration-200" style={{ paddingLeft: 20, paddingRight: 20, display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: '#F8FAFC' }}>
            {loading && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(248, 250, 252, 0.8)',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 999,
                display: 'flex'
              }}>
                <ActivityIndicator size="large" color="#2563EB" />
              </div>
            )}
            <div className="min-h-[100dvh] w-full bg-[#F4F7FE] text-slate-900 relative flex flex-col items-center px-3 sm:px-4 py-6 sm:py-8 md:py-12 overflow-x-hidden overflow-y-auto transition-all duration-200 diamond-mesh" style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: '#F4F7FE' }}>
            {/* Fixed Background Ornaments */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] opacity-15" style={{ background: 'radial-gradient(circle, #0A33CC 0%, rgba(10,51,204,0) 60%)' }} />
              <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] opacity-10" style={{ background: 'radial-gradient(circle, #2563EB 0%, rgba(37,99,235,0) 60%)' }} />
            </div>

            <div className="flex flex-col items-center mb-6 text-center z-10">
              <DiamondLogo size={64} layout="vertical" showText={true} showTagline={true} />
              <p className="text-slate-500 text-xs sm:text-sm font-medium mt-3">
                {showOtpStep ? t('auth.otpSent') : isLogin ? t('auth.signin') : (t('auth.noAccount').split('?')[1]?.trim() || t('auth.login'))}
              </p>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10 w-full max-w-[calc(100vw-24px)] xs:max-w-md p-5 xs:p-6 sm:p-8 md:p-10 border border-[#D8E3FF] rounded-3xl shadow-xl shadow-blue-900/5 bg-white overflow-visible transition-all duration-200"
            >
            <div className="flex flex-col items-center space-y-6">
              {!showOtpStep && !showForgotPassword && (
                <div className="flex border-b border-slate-200 w-full mb-2">
                  <button
                    type="button"
                    onClick={() => { navigate('/login'); setIsLogin(true); setShowForgotPassword(false); setShowOtpStep(false); }}
                    className={cn(
                      "flex-1 py-3 text-center text-xs sm:text-sm font-bold tracking-wide transition-all border-b-2 -mb-[2px] cursor-pointer",
                      isLogin
                        ? "border-[#0A33CC] text-[#0A33CC]"
                        : "border-transparent text-slate-400 hover:text-slate-600 font-medium"
                    )}
                  >
                    {t('auth.signin')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { navigate('/register'); setIsLogin(false); setStep(1); setShowForgotPassword(false); setShowOtpStep(false); }}
                    className={cn(
                      "flex-1 py-3 text-center text-xs sm:text-sm font-bold tracking-wide transition-all border-b-2 -mb-[2px] cursor-pointer",
                      !isLogin
                        ? "border-[#0A33CC] text-[#0A33CC]"
                        : "border-transparent text-slate-400 hover:text-slate-600 font-medium"
                    )}
                  >
                    {t('auth.noAccount').split('?')[1]?.trim() || 'Create Account'}
                  </button>
                </div>
              )}

          {showOtpStep ? (
             <form 
               onSubmit={handleVerifyOtp} 
               className="w-full space-y-4 sm:space-y-6"
               style={{
                 transform: 'translateZ(0)',
                 WebkitTransform: 'translateZ(0)',
                 overflow: 'hidden',
                 position: 'relative'
               }}
             >
               <div className="space-y-4 text-center" style={{ marginBottom: 16 }}>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed" style={{ marginBottom: 6, includeFontPadding: false }}>
                   {t('auth.otpSent')} <span className="text-[#2563EB]">{email}</span>
                 </p>
                 <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                   <input
                     type="text"
                     maxLength={6}
                     placeholder="XXXXXX"
                     className="w-full text-center h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-2xl font-black tracking-[0.5em] text-[#2563EB]"
                     value={otpInput}
                     onChange={(e) => setOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                     required
                     style={{
                       height: 52,
                       width: '100%',
                       maxWidth: '100%',
                       paddingLeft: 14,
                       paddingRight: 14,
                       paddingHorizontal: 14,
                       overflow: 'hidden',
                       zIndex: 1,
                       elevation: 1,
                       includeFontPadding: false,
                       textAlignVertical: 'center',
                       colorScheme: 'light',
                       color: '#2563EB',
                       fontSize: 16,
                       WebkitAppearance: 'none',
                       appearance: 'none',
                       WebkitTransform: 'translateZ(0)',
                       transform: 'translateZ(0)',
                       backfaceVisibility: 'hidden',
                       WebkitBackfaceVisibility: 'hidden',
                       willChange: 'auto',
                       isolation: 'isolate',
                       backgroundColor: '#EEF3FF'
                     }}
                   />
                 </div>
               </div>

               <button
                 type="submit"
                 disabled={loading}
                 className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-black text-[10px] uppercase tracking-[0.3em] h-[52px] rounded-2xl shadow-lg shadow-[#2563EB]/20 transition-all transform active:scale-[0.98] flex items-center justify-center disabled:opacity-50 mt-4"
                 style={{
                   height: 52,
                   width: '100%',
                   maxWidth: '100%',
                   justifyContent: 'center',
                   alignItems: 'center',
                   display: 'flex'
                 }}
               >
                 {loading ? (
                   <ActivityIndicator size="small" color="#FFFFFF" />
                 ) : (
                   t('general.submit')
                 )}
               </button>

               <div className="text-center mt-4">
                  <button 
                   type="button"
                   onClick={() => setShowOtpStep(false)}
                   className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-[#2563EB]"
                  >
                    {t('general.cancel')}
                  </button>
               </div>
             </form>
          ) : (
          <form 
            onSubmit={showForgotPassword ? handleForgotPassword : handleSubmit} 
            className="w-full space-y-4 sm:space-y-5 transition-all duration-200"
            style={{
              transform: 'translateZ(0)',
              WebkitTransform: 'translateZ(0)',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {showForgotPassword ? (
              <div className="space-y-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed mb-2 opacity-70" style={{ includeFontPadding: false }}>
                   {t('auth.forgotPassword')}
                </p>
                <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>{t('auth.email')}</label>
                  <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
                    <input
                      type="email"
                      placeholder="name@university.edu"
                      className="w-full pl-11 pr-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      style={{
                        height: 52,
                        width: '100%',
                        maxWidth: '100%',
                        paddingLeft: 14,
                        paddingRight: 14,
                        paddingHorizontal: 14,
                        overflow: 'hidden',
                        zIndex: 1,
                        elevation: 1,
                        includeFontPadding: false,
                        textAlignVertical: 'center',
                        colorScheme: 'light',
                        color: '#0F172A',
                        fontSize: 16,
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        WebkitTransform: 'translateZ(0)',
                        transform: 'translateZ(0)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        willChange: 'auto',
                        isolation: 'isolate',
                        backgroundColor: '#EEF3FF'
                      }}
                    />
                  </div>
                </div>
                {resetSent ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3" style={{ marginBottom: 16 }}>
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest leading-relaxed" style={{ includeFontPadding: false }}>
                      {t('auth.resetSent')}
                    </p>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-black text-[10px] uppercase tracking-[0.3em] h-[52px] rounded-2xl shadow-lg shadow-[#2563EB]/20 transition-all transform active:scale-[0.98] flex items-center justify-center group disabled:opacity-50"
                    style={{
                      height: 52,
                      width: '100%',
                      maxWidth: '100%',
                      justifyContent: 'center',
                      alignItems: 'center',
                      display: 'flex',
                      marginBottom: 16
                    }}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        {t('general.submit')}
                        <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-[#2563EB] transition-colors"
                  style={{ height: 52, width: '100%', maxWidth: '100%', justifyContent: 'center', alignItems: 'center', display: 'flex' }}
                >
                  {t('general.back')}
                </button>
              </div>
            ) : (isLogin && useFingerprintToUnlock) ? (
              <div className="space-y-6 text-center py-4">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-[#EEF3FF] border border-[#D8E3FF] flex items-center justify-center">
                    <Fingerprint className="w-8 h-8 text-[#2563EB] animate-bounce" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]" style={{ includeFontPadding: false }}>
                    Quick Fingerprint Unlock
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                    Account: <span className="text-[#2563EB] font-black">{enrolledEmail}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBiometricUnlock}
                  disabled={loading || biometricUnlocking}
                  className="w-full h-16 border border-[#D8E3FF] rounded-2xl bg-[#EEF3FF] hover:bg-[#E0E9FF] transition-all flex items-center justify-center gap-4 text-[#2563EB] group relative overflow-hidden active:scale-[0.98] transform"
                >
                  {biometricUnlocking ? (
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse" style={{ includeFontPadding: false }}>
                      Verifying Credentials...
                    </span>
                  ) : (
                    <>
                      <Fingerprint className="w-6 h-6 text-[#2563EB] animate-bounce" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ includeFontPadding: false }}>
                        Unlock with Fingerprint
                      </span>
                    </>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                </button>

                {isInIframe && (
                  <p className="text-[8px] text-[#2563EB]/80 leading-relaxed tracking-normal font-sans" style={{ includeFontPadding: false }}>
                    ⚠️ Fingerprint unlock is restricted inside this preview screen. Click <strong>"Open App in a New Tab"</strong> at the top right to use it securely.
                  </p>
                )}

                <div className="flex flex-col gap-2 pt-2 border-t border-[#D8E3FF]">
                  <button
                    type="button"
                    onClick={() => setUseFingerprintToUnlock(false)}
                    className="text-[9px] font-black text-[#2563EB] uppercase tracking-[0.2em] hover:underline"
                    style={{ includeFontPadding: false }}
                  >
                    Sign in with password
                  </button>
                </div>
              </div>
            ) : isLogin ? (
                  <>
                    <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>{t('auth.email')}</label>
                      <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
                        <input
                          type="email"
                          placeholder="name@university.edu"
                          className="w-full pl-11 pr-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          style={{
                            height: 52,
                            width: '100%',
                            maxWidth: '100%',
                            paddingLeft: 14,
                            paddingRight: 14,
                            paddingHorizontal: 14,
                            overflow: 'hidden',
                            zIndex: 1,
                            elevation: 1,
                            includeFontPadding: false,
                            textAlignVertical: 'center',
                            colorScheme: 'light',
                            color: '#0F172A',
                            fontSize: 16,
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            WebkitTransform: 'translateZ(0)',
                            transform: 'translateZ(0)',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            willChange: 'auto',
                            isolation: 'isolate',
                            backgroundColor: '#EEF3FF'
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                      <div className="flex justify-between items-center px-1" style={{ marginBottom: 6 }}>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest" style={{ includeFontPadding: false }}>{t('auth.password')}</label>
                        <button 
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-[9px] font-black text-[#2563EB]/70 uppercase tracking-widest hover:text-[#2563EB] transition-colors"
                        >
                          {t('auth.forgotPassword')}
                        </button>
                      </div>
                      <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
                        <input
                          type="text"
                          placeholder="••••••••"
                          className="w-full pl-11 pr-12 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          style={{
                            height: 52,
                            width: '100%',
                            maxWidth: '100%',
                            paddingLeft: 14,
                            paddingRight: 14,
                            paddingHorizontal: 14,
                            overflow: 'hidden',
                            zIndex: 1,
                            elevation: 1,
                            includeFontPadding: false,
                            textAlignVertical: 'center',
                            colorScheme: 'light',
                            color: '#0F172A',
                            fontSize: 16,
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            WebkitTransform: 'translateZ(0)',
                            transform: 'translateZ(0)',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            willChange: 'auto',
                            isolation: 'isolate',
                            backgroundColor: '#EEF3FF',
                            WebkitTextSecurity: showPassword ? 'none' : 'disc'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-[#2563EB] transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {biometricsSupported && !biometricsEnrolled && (
                      <div className="flex flex-col gap-1 pt-2 px-1" style={{ marginBottom: 16 }}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="enable-biometrics"
                            className="w-4 h-4 rounded border-[#D8E3FF] text-[#2563EB] focus:ring-[#2563EB] bg-[#EEF3FF] cursor-pointer"
                            checked={enableBiometricsOnLogin}
                            onChange={(e) => setEnableBiometricsOnLogin(e.target.checked)}
                          />
                          <label htmlFor="enable-biometrics" className="text-[9px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none" style={{ includeFontPadding: false }}>
                            Enable Fingerprint Quick Unlock
                          </label>
                        </div>
                        {isInIframe && (
                          <p className="text-[8px] text-[#2563EB]/70 mt-0.5 leading-relaxed tracking-normal pl-7" style={{ includeFontPadding: false }}>
                            ⚠️ Requires opening in a new tab due to frame security.
                          </p>
                        )}
                      </div>
                    )}

                    {biometricsSupported && biometricsEnrolled && email === enrolledEmail && (
                      <div className="pt-2 text-center" style={{ marginBottom: 16 }}>
                        <button
                          type="button"
                          onClick={() => setUseFingerprintToUnlock(true)}
                          className="text-[10px] font-black text-[#2563EB] uppercase tracking-[0.2em] hover:underline"
                          style={{ includeFontPadding: false }}
                        >
                          ← Switch to Fingerprint Quick Unlock
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {step === 1 ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>{t('dashboard.profile')}</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <input
                              type="text"
                              placeholder="Jack Sparrow"
                              className="w-full px-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              required
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>USERNAME</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <input
                              type="text"
                              placeholder="jacksparrow"
                              className="w-full px-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={username}
                              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                              required
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>INSTITUTION</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <input
                              type="text"
                              placeholder="University"
                              className="w-full px-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={institutionalName}
                              onChange={(e) => setInstitutionalName(e.target.value)}
                              required
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>{t('splash.departments')}</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <select 
                              value={department}
                              onChange={(e) => setDepartment(e.target.value)}
                              className="w-full px-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium appearance-none"
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            >
                              {allFacultiesList.map(dept => (
                                <option key={dept} value={dept}>{t(`dept.${dept}`) !== `dept.${dept}` ? t(`dept.${dept}`) : dept}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>PHONE</label>
                          <div className="flex gap-2" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <select 
                              value={countryCode}
                              onChange={(e) => setCountryCode(e.target.value)}
                              className="w-24 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-[10px] font-black text-[#2563EB] px-2"
                              style={{
                                height: 52,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#2563EB',
                                fontSize: 14,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            >
                              {africanCountries.map(c => (
                                <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                              ))}
                            </select>
                            <input
                              type="tel"
                              placeholder="811223344"
                              className="flex-1 px-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              required
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            />
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setStep(2)}
                          className="w-full bg-[#EEF3FF] text-[#2563EB] h-[52px] rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 border border-[#D8E3FF] hover:bg-[#E0E9FF]"
                          style={{
                            height: 52,
                            width: '100%',
                            maxWidth: '100%',
                            justifyContent: 'center',
                            alignItems: 'center',
                            display: 'flex'
                          }}
                        >
                          {t('quiz.next')} <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>{t('auth.email')}</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <input
                              type="email"
                              placeholder="scholar@university.edu"
                              className="w-full px-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>{t('auth.password')}</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
                            <input
                              type="text"
                              placeholder="••••••••"
                              className="w-full pl-11 pr-12 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF',
                                WebkitTextSecurity: showPassword ? 'none' : 'disc'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-[#2563EB] transition-colors"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>{t('auth.confirmPassword')}</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
                            <input
                              type="text"
                              placeholder="••••••••"
                              className="w-full pl-11 pr-12 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              required
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF',
                                WebkitTextSecurity: showConfirmPassword ? 'none' : 'disc'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-[#2563EB] transition-colors"
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5" style={{ marginBottom: 16 }}>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1" style={{ marginBottom: 6, includeFontPadding: false }}>REFERRAL</label>
                          <div className="relative group" style={{ position: 'relative', zIndex: 1, elevation: 1 }}>
                            <input
                              type="text"
                              placeholder="DSXXXXXX"
                              className="w-full px-4 h-[52px] bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl focus:ring-2 focus:ring-[#2563EB]/50 focus:border-[#2563EB] outline-none transition-all duration-200 text-sm font-medium"
                              value={manualReferralCode}
                              onChange={(e) => setManualReferralCode(e.target.value.toUpperCase())}
                              style={{
                                height: 52,
                                width: '100%',
                                maxWidth: '100%',
                                paddingLeft: 14,
                                paddingRight: 14,
                                paddingHorizontal: 14,
                                overflow: 'hidden',
                                zIndex: 1,
                                elevation: 1,
                                includeFontPadding: false,
                                textAlignVertical: 'center',
                                colorScheme: 'light',
                                color: '#0F172A',
                                fontSize: 16,
                                WebkitAppearance: 'none',
                                appearance: 'none',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                willChange: 'auto',
                                isolation: 'isolate',
                                backgroundColor: '#EEF3FF'
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4" style={{ marginBottom: 16 }}>
                           <button 
                            type="button" 
                            onClick={() => setStep(1)}
                            className="bg-[#EEF3FF] border border-[#D8E3FF] text-slate-600 h-[52px] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#E0E9FF]"
                            style={{
                              height: 52,
                              width: '100%',
                              maxWidth: '100%',
                              justifyContent: 'center',
                              alignItems: 'center',
                              display: 'flex'
                            }}
                          >
                            {t('general.back')}
                          </button>
                          <button 
                            type="submit"
                            disabled={loading}
                            className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white h-[52px] rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-[#2563EB]/20"
                            style={{
                              height: 52,
                              width: '100%',
                              maxWidth: '100%',
                              justifyContent: 'center',
                              alignItems: 'center',
                              display: 'flex'
                            }}
                          >
                            {loading ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              t('general.submit')
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div 
                  style={{ 
                    opacity: error ? 1 : 0, 
                    minHeight: 56, 
                    width: '100%', 
                    display: 'flex', 
                    pointerEvents: error ? 'auto' : 'none',
                    marginBottom: 16
                  }}
                  className={cn(
                    "p-4 rounded-xl items-start gap-3 border transition-all duration-200",
                    error && error.startsWith('success:') ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
                  )}
                >
                  <ShieldCheck className={cn("w-4 h-4 flex-shrink-0 mt-0.5", error && error.startsWith('success:') ? "text-emerald-500" : "text-red-500")} />
                  <p className={cn(
                    "text-[10px] font-bold uppercase tracking-widest leading-relaxed",
                    error && error.startsWith('success:') ? "text-emerald-500" : "text-red-500"
                  )}>
                    {error ? (error.startsWith('success:') ? 'OK:' : 'ERR:') : ''} {error ? error.replace('success:', '') : ''}
                  </p>
                </div>

                 {isLogin && !useFingerprintToUnlock && (
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full max-w-full h-[52px] bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl shadow-lg shadow-[#2563EB]/20 transition-all transform active:scale-[0.98] flex items-center justify-center disabled:opacity-50"
                      style={{
                        height: 52,
                        width: '100%',
                        maxWidth: '100%',
                        justifyContent: 'center',
                        alignItems: 'center',
                        display: 'flex',
                        marginBottom: 16
                      }}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          {t('auth.signin')}
                          <ArrowRight className="ml-2 w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}
          </form>
          )}

          <div className="w-full h-[1px] bg-[#D8E3FF]" />

          <div className="w-full text-center space-y-6">
            <button
              onClick={() => {
                if (isLogin) {
                  navigate('/register');
                  setIsLogin(false);
                  setStep(1);
                  setShowForgotPassword(false);
                  setShowOtpStep(false);
                } else {
                  navigate('/login');
                  setIsLogin(true);
                  setShowForgotPassword(false);
                  setShowOtpStep(false);
                }
              }}
              className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] hover:text-[#2563EB] transition-all"
            >
              {isLogin ? (
                <>
                  {t('auth.noAccount').split('?')[0]}?{' '}
                  <span className="text-[#2563EB] ml-2 underline underline-offset-8 decoration-[#2563EB]/30">
                    {t('auth.noAccount').split('?')[1]?.trim() || 'Register Now'}
                  </span>
                </>
              ) : (
                <>
                  {t('auth.login').split('?')[0]}?{' '}
                  <span className="text-[#2563EB] ml-2 underline underline-offset-8 decoration-[#2563EB]/30">
                    {t('auth.signin')}
                  </span>
                </>
              )}
            </button>
            <div className="bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl p-4 space-y-3">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                {language === 'fr' ? 'Archives de Support Institutionnel' : 'Institutional Support Archives'}
              </p>
              <div className="flex justify-center gap-4">
                {dynamicSocialLinks.map((link) => (
                  <a 
                    key={link.name}
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={cn(link.color, "hover:scale-110 transition-transform")}
                  >
                    <link.icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      <p className="text-[10px] sm:text-[11px] text-slate-400 text-center max-w-xs sm:max-w-sm mt-6 leading-relaxed font-sans">
        Diamond Solutions is an independent study platform and is not affiliated with, endorsed by, or sponsored by ASCP BOC.
      </p>
    </div>
  </div>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
);
}
