import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, query, collection, where, getDocs, limit, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'motion/react';
import { Diamond, Mail, Lock, ArrowRight, ShieldCheck, Send, MessageCircle, Facebook, Twitter, Instagram } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

import { DEPARTMENTS } from '../constants';

export default function Login() {
  const { t, language } = useLanguage();
  const [searchParams] = useSearchParams();
  const referralFromUrl = searchParams.get('ref');
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [manualReferralCode, setManualReferralCode] = useState('');
  const [name, setName] = useState('');
  const [institutionalName, setInstitutionalName] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+234');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [registrationData, setRegistrationData] = useState<any>(null);
  const navigate = useNavigate();
  const [dynamicSocialLinks, setDynamicSocialLinks] = useState<any[]>([]);

  const [deletedStaticNames, setDeletedStaticNames] = useState<string[]>([]);
  const [allFacultiesList, setAllFacultiesList] = useState<string[]>(DEPARTMENTS);

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
    if (otpInput === generatedOtp) {
      setLoading(true);
      try {
        await setDoc(doc(db, 'users', auth.currentUser!.uid), {
          emailVerified: true
        }, { merge: true });
        navigate('/dashboard');
      } catch (err: any) {
        setError('Verification Error: ' + err.message);
      } finally {
        setLoading(false);
      }
    } else {
      setError(t('auth.otpSent') + ' ERROR');
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
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
        await signInWithEmailAndPassword(auth, email, password);
        // Clear session tour flag on explicit login as requested
        sessionStorage.removeItem('diamond_onboard_shown');
        navigate('/dashboard');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        let finalReferralCode = referralFromUrl || manualReferralCode;
        if (finalReferralCode && !finalReferralCode.startsWith('DS-')) {
          finalReferralCode = 'DS-' + finalReferralCode;
        }

        let referredByUid = null;
        if (finalReferralCode) {
          const referrerQuery = query(
            collection(db, 'users'),
            where('referralCode', '==', finalReferralCode),
            limit(1)
          );
          const referrerSnap = await getDocs(referrerQuery);
          if (!referrerSnap.empty) {
            referredByUid = referrerSnap.docs[0].id;
          }
        }

        const country = africanCountries.find(c => c.code === countryCode);
        const currency = country?.currency || 'USD';

        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email,
          displayName: name,
          institutionalName: institutionalName,
          department: department,
          phone: `${countryCode}${phone}`,
          role: 'student',
          createdAt: new Date().toISOString(),
          referralCode: 'DS-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
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
          emailVerified: false 
        });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedOtp(otp);
        
        try {
          await axios.post('/api/send-otp', {
            email,
            token: otp,
            action: 'registration'
          });
          
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy text-text-1 relative overflow-hidden flex flex-col justify-center items-center px-4 py-12">
      {/* Background Ornaments */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-gold/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-gold/5 rounded-full blur-[80px] -z-10 opacity-50" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-card max-w-md w-full p-10 py-12 border-gold/15 bg-navy-mid/80 backdrop-blur-2xl shadow-2xl shadow-black/60"
      >
        <div className="flex flex-col items-center space-y-10">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 bg-gold diamond-mark shadow-[0_0_30px_rgba(201,147,10,0.4)] flex items-center justify-center">
              <Diamond className="w-8 h-8 text-navy" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-3xl font-serif font-black tracking-tight text-text-1">
                {showOtpStep ? t('auth.verifyEmail') : isLogin ? t('auth.signin') : t('auth.noAccount').split('?')[1]?.trim() || t('auth.login')}
              </h2>
              <p className="text-text-3 text-[10px] font-black uppercase tracking-[0.4em] leading-relaxed">
                {showOtpStep ? t('auth.otpSent') : t('splash.professional')}
              </p>
            </div>
          </div>

          {showOtpStep ? (
             <form onSubmit={handleVerifyOtp} className="w-full space-y-6">
                <div className="space-y-4 text-center">
                  <p className="text-[10px] font-black text-text-3 uppercase tracking-widest leading-relaxed">
                    {t('auth.otpSent')} <span className="text-gold">{email}</span>
                  </p>
                  <div className="relative group">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="XXXXXX"
                      className="w-full text-center py-5 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-2xl font-black tracking-[0.5em] text-gold"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gold text-navy font-black text-[10px] uppercase tracking-[0.3em] py-5 px-6 rounded-2xl shadow-2xl shadow-gold/20 transition-all transform active:scale-[0.98] flex items-center justify-center disabled:opacity-50"
                >
                  {loading ? t('general.loading') : t('general.submit')}
                </button>

                <div className="text-center">
                   <button 
                    type="button"
                    onClick={() => setShowOtpStep(false)}
                    className="text-[9px] font-black text-text-3 uppercase tracking-widest hover:text-gold"
                   >
                     {t('general.cancel')}
                   </button>
                </div>
             </form>
          ) : (
          <form onSubmit={showForgotPassword ? handleForgotPassword : handleSubmit} className="w-full space-y-5">
            {showForgotPassword ? (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                <p className="text-[10px] font-black text-text-3 uppercase tracking-widest leading-relaxed mb-2 opacity-70">
                   {t('auth.forgotPassword')}
                </p>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">{t('auth.email')}</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 group-focus-within:text-gold transition-colors" />
                    <input
                      type="email"
                      placeholder="name@university.edu"
                      className="w-full pl-11 pr-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                {resetSent ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest leading-relaxed">
                      {t('auth.resetSent')}
                    </p>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gold text-navy font-black text-[10px] uppercase tracking-[0.3em] py-5 px-6 rounded-2xl shadow-2xl shadow-gold/20 transition-all transform active:scale-[0.98] flex items-center justify-center group disabled:opacity-50"
                  >
                    {loading ? t('general.loading') : t('general.submit')}
                    {!loading && <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full text-text-3 font-black text-[10px] uppercase tracking-widest hover:text-gold transition-colors"
                >
                  {t('general.back')}
                </button>
              </div>
            ) : isLogin ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">{t('auth.email')}</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 group-focus-within:text-gold transition-colors" />
                    <input
                      type="email"
                      placeholder="name@university.edu"
                      className="w-full pl-11 pr-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-text-3 uppercase tracking-widest">{t('auth.password')}</label>
                    <button 
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-[9px] font-black text-gold/60 uppercase tracking-widest hover:text-gold transition-colors"
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 group-focus-within:text-gold transition-colors" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full pl-11 pr-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {step === 1 ? (
                  <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">{t('dashboard.profile')}</label>
                      <input
                        type="text"
                        placeholder="Jack Sparrow"
                        className="w-full px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">INSTITUTION</label>
                      <input
                        type="text"
                        placeholder="University"
                        className="w-full px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                        value={institutionalName}
                        onChange={(e) => setInstitutionalName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">{t('splash.departments')}</label>
                      <select 
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium appearance-none"
                      >
                        {allFacultiesList.map(dept => (
                          <option key={dept} value={dept}>{t(`dept.${dept}`) !== `dept.${dept}` ? t(`dept.${dept}`) : dept}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">PHONE</label>
                      <div className="flex gap-2">
                        <select 
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                          className="w-24 bg-navy-high border border-gold/10 rounded-2xl text-[10px] font-black text-gold px-2 focus:border-gold outline-none"
                        >
                          {africanCountries.map(c => (
                            <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          placeholder="811223344"
                          className="flex-1 px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setStep(2)}
                      className="w-full bg-gold/10 text-gold py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      {t('quiz.next')} <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">{t('auth.email')}</label>
                      <input
                        type="email"
                        placeholder="scholar@university.edu"
                        className="w-full px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">{t('auth.password')}</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        className="w-full px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">{t('auth.forgotPassword')}</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        className="w-full px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest ml-1">REFERRAL</label>
                      <input
                        type="text"
                        placeholder="DS-XXXXXX"
                        className="w-full px-4 py-4 bg-navy-high border border-gold/10 rounded-2xl focus:border-gold outline-none transition-all text-sm font-medium"
                        value={manualReferralCode}
                        onChange={(e) => setManualReferralCode(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <button 
                        type="button" 
                        onClick={() => setStep(1)}
                        className="bg-navy-high border border-gold/10 text-text-3 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest"
                      >
                        {t('general.back')}
                      </button>
                      <button 
                        type="submit"
                        disabled={loading}
                        className="bg-gold text-navy py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-gold/20"
                      >
                        {t('general.submit')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className={cn(
                "p-4 rounded-xl flex items-start gap-3 border",
                error.startsWith('success:') ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
              )}>
                <ShieldCheck className={cn("w-4 h-4 flex-shrink-0 mt-0.5", error.startsWith('success:') ? "text-emerald-500" : "text-red-500")} />
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-widest leading-relaxed",
                  error.startsWith('success:') ? "text-emerald-500" : "text-red-500"
                )}>
                  {error.startsWith('success:') ? 'OK:' : 'ERR:'} {error.replace('success:', '')}
                </p>
              </div>
            )}

            {isLogin && (
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold hover:bg-gold-light text-navy font-black text-[10px] uppercase tracking-[0.3em] py-5 px-6 rounded-2xl shadow-2xl shadow-gold/20 transition-all transform active:scale-[0.98] flex items-center justify-center group disabled:opacity-50"
              >
                {loading ? t('general.loading') : t('auth.signin')}
                {!loading && <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </button>
            )}
          </form>
          )}

          <div className="w-full h-[1px] bg-gold/10" />

          <div className="w-full text-center space-y-6">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-text-3 font-black text-[10px] uppercase tracking-[0.2em] hover:text-gold transition-all"
            >
              {isLogin ? (
                <>
                  {t('auth.noAccount').split('?')[0]}?{' '}
                  <span className="text-gold ml-2 underline underline-offset-8 decoration-gold/30">
                    {t('auth.noAccount').split('?')[1]?.trim() || 'Register Now'}
                  </span>
                </>
              ) : (
                <>
                  {t('auth.login').split('?')[0]}?{' '}
                  <span className="text-gold ml-2 underline underline-offset-8 decoration-gold/30">
                    {t('auth.signin')}
                  </span>
                </>
              )}
            </button>
            <div className="bg-gold/5 border border-gold/10 rounded-2xl p-4 space-y-3">
              <p className="text-[9px] font-black text-text-3 uppercase tracking-widest leading-relaxed">
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
    </div>
  );
}
