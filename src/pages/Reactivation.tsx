import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePaystackPayment } from 'react-paystack';
import { ShieldAlert, CreditCard, Loader2, Globe, Clock, Banknote, Mail, CheckCircle2, AlertTriangle, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { getOrGenerateDeviceId } from '../utils/deviceHelper';

export default function Reactivation() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  
  // Device block specific state
  const [timeLeftStr, setTimeLeftStr] = useState('');
  const [isBlockExpired, setIsBlockExpired] = useState(true);
  const [paystackPaid, setPaystackPaid] = useState(profile?.reactivationPaid === true);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccessMsg, setOtpSuccessMsg] = useState('');
  const [otpToken, setOtpToken] = useState('');

  const isDeviceBlocked = (profile?.status === 'device_blocked' || profile?.deviceBlockPending) && profile?.reactivationPaid !== true;

  // Sync paystackPaid state when profile updates
  useEffect(() => {
    if (profile?.reactivationPaid === true) {
      setPaystackPaid(true);
    }
  }, [profile?.reactivationPaid]);

  // 24 hours countdown logic
  useEffect(() => {
    if (!isDeviceBlocked || !profile?.blockedUntil) {
      setIsBlockExpired(true);
      return;
    }

    const interval = setInterval(() => {
      const blockedUntil = profile.blockedUntil;
      const now = Date.now();
      const diff = blockedUntil - now;

      if (diff <= 0) {
        setTimeLeftStr('');
        setIsBlockExpired(true);
        clearInterval(interval);
      } else {
        setIsBlockExpired(false);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeftStr(
          `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isDeviceBlocked, profile?.blockedUntil]);

  useEffect(() => {
    if (profile && profile.status !== 'suspended' && !isDeviceBlocked) {
      navigate('/dashboard', { replace: true });
    }
  }, [profile, isDeviceBlocked, navigate]);
  
  const isNigerian = profile?.country === 'Nigeria' || !profile?.country; // Default to Nigeria if not set
  const feeNGN = 1000;
  const feeUSD = 2;
  const amount = isNigerian ? feeNGN : feeUSD;
  const currency = isNigerian ? 'NGN' : 'USD';

  const [dynamicPublicKey, setDynamicPublicKey] = useState<string>('');

  useEffect(() => {
    axios.get('/api/config')
      .then(res => {
        if (res.data.paystackPublicKey) {
          setDynamicPublicKey(res.data.paystackPublicKey);
        }
      })
      .catch(err => {
        console.warn("Failed to fetch dynamic configuration:", err);
      });
  }, []);

  const config = {
    reference: `reactivate_${new Date().getTime()}_${user?.uid}`,
    email: user?.email || '',
    amount: isNigerian ? feeNGN * 100 : Math.round(feeUSD * 1500 * 100), // NGN in kobo
    publicKey: dynamicPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
  };

  const onSuccess = async (reference: any) => {
    setLoading(true);
    try {
      const finalRef = typeof reference === 'string' ? reference : (reference.reference || reference.transaction || reference.trans || reference.trxref);
      const idToken = await user!.getIdToken();
      const currentDeviceId = getOrGenerateDeviceId();
      
      const response = await axios.post('/api/verify-reactivation-payment', {
        reference: finalRef,
        deviceId: currentDeviceId
      }, {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      if (!response.data.success) {
        setOtpError('Payment verification failed. Please contact support.');
        return;
      }

      setPaystackPaid(true);

      // Start fresh unique session to immediately logout other devices and authorize this device
      try {
        const { SessionService } = await import('../lib/SessionService');
        await SessionService.startSession(user!.uid);
      } catch (sessErr) {
        console.warn("Session initiation warning:", sessErr);
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      console.error(err);
      setOtpError(err?.response?.data?.error || 'Failed to verify payment. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setOtpLoading(true);
    setOtpError('');
    try {
      await axios.post('/api/otp/request', {
        userId: user!.uid,
        email: user!.email!,
        purpose: 'device_reactivation'
      });
      setOtpSent(true);
      setOtpSuccessMsg('A high-security 6-digit confirmation code has been dispatched to your registered email.');
    } catch (err: any) {
      console.error(err);
      setOtpError(err?.response?.data?.error || 'Failed to dispatch verification code. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Please enter a valid 6-digit verification code.');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await axios.post('/api/otp/verify', {
        userId: user!.uid,
        purpose: 'device_reactivation',
        code: otpCode
      });
      if (res.data.success) {
        setOtpVerified(true);
        setOtpToken(res.data.token || '');
        setOtpSuccessMsg('Code verified successfully.');
      }
    } catch (err: any) {
      console.error(err);
      setOtpError(err?.response?.data?.error || 'Invalid or expired verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleDeviceRegisterAndAccess = async () => {
    setLoading(true);
    try {
      const currentDeviceId = getOrGenerateDeviceId();
      const idToken = await user!.getIdToken();

      // Consumes the short-lived token from /api/otp/verify to atomically swap the
      // registered device and restore access server-side - this used to be a direct
      // Firestore write the client could make on its own, without ever having proven it
      // completed the OTP step.
      await axios.post('/api/complete-device-reactivation', {
        token: otpToken,
        deviceId: currentDeviceId
      }, {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      // Start fresh unique session to immediately logout other devices
      const { SessionService } = await import('../lib/SessionService');
      await SessionService.startSession(user!.uid);

      window.location.href = '/dashboard';
    } catch (err: any) {
      console.error(err);
      setOtpError(err?.response?.data?.error || 'Failed to complete reactivation. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  const onClose = () => {
    console.log('Payment closed');
  };

  const initializePayment = usePaystackPayment(config);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.05)_0%,transparent_70%)]" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full bg-white border border-[#D8E3FF] rounded-3xl p-8 md:p-10 space-y-8 relative overflow-hidden shadow-xl"
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-500/10 blur-[60px] rounded-full" />
        
        <header className="text-center space-y-4">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto border border-red-200">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-serif font-black text-slate-900 uppercase tracking-tight leading-none">
              {isDeviceBlocked ? 'Security Protocol' : t('profile.suspension')}
            </h2>
            <div className="w-16 h-1 bg-red-400 mx-auto rounded-full" />
            <p className="text-[10px] text-slate-500 font-semibold leading-relaxed max-w-[320px] mx-auto uppercase tracking-widest opacity-80">
              {isDeviceBlocked 
                ? 'Multi-device security threshold triggered. Access temporarily restricted.'
                : 'Institutional access has been revoked due to inactivity protocol violation.'
              }
            </p>
          </div>
        </header>

        {isDeviceBlocked ? (
          <section className="space-y-6">
            {/* Countdown / Restriction Status Box */}
            {!isBlockExpired && (
              <div className="bg-red-50 border border-red-200 p-5 rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
                <Clock className="w-6 h-6 text-red-500 animate-pulse" />
                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Temporary Lockout Countdown</span>
                <span className="text-3xl font-mono font-black text-red-600 tracking-wider">
                  {timeLeftStr || '00:00:00'}
                </span>
                <p className="text-[10px] text-slate-500">
                  This account is blocked for 24 hours due to a third-device login attempt. You must wait for the countdown to expire before complete reactivation.
                </p>
              </div>
            )}

            {isBlockExpired && !paystackPaid && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-[11px] text-emerald-800 font-medium">
                  The 24-hour lockout has concluded. You are now permitted to pay and authorize the reactivation.
                </p>
              </div>
            )}

            {/* Protocol Fine Information */}
            {!paystackPaid && (
              <div className="bg-[#EEF3FF] border border-[#D8E3FF] p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Compulsory Activation Fee</span>
                  <span className="text-2xl font-serif font-black text-[#2563EB]">
                    ₦1,000
                  </span>
                </div>
                <div className="h-[1px] bg-[#D8E3FF]" />
                <div className="text-[11px] text-slate-600 leading-relaxed space-y-1">
                  <p>• Max 2 registered devices permitted per account.</p>
                  <p>• This current device will be enrolled as your primary device.</p>
                  <p>• This action will immediately terminate and log out all other active sessions.</p>
                </div>
              </div>
            )}

            {/* Paystack button state */}
            {!paystackPaid && (
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    const activeKey = dynamicPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
                    if (!activeKey || activeKey === 'pk_test_placeholder') {
                      // Simulated payment is a local-dev-only convenience; never offer it in
                      // production, where a missing key means payments are genuinely
                      // misconfigured, not a cue to bypass them.
                      if (import.meta.env.DEV && window.confirm("DEBUG MODE: Paystack key missing. Would you like to SIMULATE successful reactivation payment?")) {
                        onSuccess({ reference: 'sim_reactivate_' + Date.now() });
                      } else if (!import.meta.env.DEV) {
                        alert("Payments are temporarily unavailable. Please try again shortly or contact support.");
                      }
                      return;
                    }
                    initializePayment({onSuccess, onClose});
                  }}
                  disabled={loading || !isBlockExpired}
                  className="w-full bg-[#2563EB] text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-lg shadow-[#2563EB]/20 hover:bg-[#1d4ed8] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>Authorize ₦1,000 Payment</span>
                    </>
                  )}
                </button>
                <p className="text-[9px] text-center text-slate-400 uppercase tracking-widest">
                  Secure Paystack Integration
                </p>
              </div>
            )}

            {/* Payment Confirmed Stage */}
            {paystackPaid && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">Payment Confirmed</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Reactivation fee confirmed. Your account is reactivated and this device is authorized.
                  </p>
                </div>

                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const { SessionService } = await import('../lib/SessionService');
                      if (user?.uid) {
                        await SessionService.startSession(user.uid);
                      }
                      window.location.href = '/dashboard';
                    } catch (e) {
                      window.location.href = '/dashboard';
                    }
                  }}
                  disabled={loading}
                  className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Proceed to Dashboard'}
                </button>
              </motion.div>
            )}

          </section>
        ) : (
          /* Standard suspension view */
          <section className="space-y-6">
             <div className="bg-[#EEF3FF] border border-[#D8E3FF] p-6 rounded-2xl space-y-6">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Fine</span>
                   <span className="text-2xl font-serif font-black text-[#2563EB]">
                     {isNigerian ? '₦' : '$'}{amount}
                   </span>
                </div>
                <div className="h-[1px] bg-[#D8E3FF]" />
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Globe className="w-3 h-3 text-[#2563EB]" /> Region
                      </p>
                      <p className="text-xs font-bold text-slate-900">{profile?.country || 'Nigeria'}</p>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#2563EB]" /> Grace Period
                      </p>
                      <p className="text-xs font-bold text-slate-900">Expired</p>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <button 
                  onClick={() => {
                    const activeKey = dynamicPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
                    if (!activeKey || activeKey === 'pk_test_placeholder') {
                      // Simulated payment is a local-dev-only convenience; never offer it in
                      // production, where a missing key means payments are genuinely
                      // misconfigured, not a cue to bypass them.
                      if (import.meta.env.DEV && window.confirm("DEBUG MODE: Paystack key missing. Would you like to SIMULATE successful reactivation payment?")) {
                        onSuccess({ reference: 'sim_reactivate_' + Date.now() });
                      } else if (!import.meta.env.DEV) {
                        alert("Payments are temporarily unavailable. Please try again shortly or contact support.");
                      }
                      return;
                    }
                    initializePayment({onSuccess, onClose});
                  }}
                  disabled={loading}
                  className="w-full bg-[#2563EB] text-white py-6 rounded-2xl font-black text-sm uppercase tracking-[0.4em] shadow-lg shadow-[#2563EB]/20 hover:bg-[#1d4ed8] active:scale-[0.98] transition-all flex items-center justify-center gap-4"
                >
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-6 h-6" />
                      <span>Authorize Reactivation</span>
                    </>
                  )}
                </button>
                
                <div className="flex items-center justify-center gap-4 text-slate-400">
                   <Banknote className="w-4 h-4 text-[#2563EB]" />
                   <span className="text-[8px] font-black uppercase tracking-[0.5em]">Secured Institutional Transaction</span>
                </div>
             </div>
          </section>
        )}

        <footer className="text-center">
           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest opacity-80">
             Log: {isDeviceBlocked ? 'Security Protocol Violation' : (profile?.suspensionReason || 'General Inactivity')}
           </p>
        </footer>
      </motion.div>
    </div>
  );
}
