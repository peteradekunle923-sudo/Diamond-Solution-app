import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { Share2, Copy, Users, Wallet, CheckCircle, Clock, Diamond, ShieldCheck, Zap, Lock, ShieldAlert, Landmark, Plus, Trash2, ArrowUpRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { cn } from '../lib/utils';
import { usePaystackPayment } from 'react-paystack';
import { orderBy } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';
import axios from 'axios';

export default function AffiliateDashboard() {
  const { user, profile } = useAuth();
  const { language, t } = useLanguage();
  const [hasPaidCourse, setHasPaidCourse] = useState<boolean | null>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    accountName: '',
    bankCode: ''
  });
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      const q = query(collection(db, 'users'), where('referredByUid', '==', user.uid));
      const unsubRef = onSnapshot(q, (snapshot) => {
        setReferrals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });

      const qW = query(collection(db, 'withdrawals'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
      const unsubWit = onSnapshot(qW, (snapshot) => {
        setWithdrawals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'withdrawals');
      });

      const qC = query(collection(db, 'affiliates'), where('referrerUid', '==', user.uid), orderBy('createdAt', 'desc'));
      const unsubComm = onSnapshot(qC, (snapshot) => {
        setCommissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'affiliates');
      });

      return () => {
        unsubRef();
        unsubWit();
        unsubComm();
      };
    }
  }, [user]);

  useEffect(() => {
    if (profile?.bankDetails) {
      setBankDetails(profile.bankDetails);
    }
  }, [profile]);

  const saveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        bankDetails: bankDetails
      }, { merge: true });
      setShowBankForm(false);
      // Removed alert to use silent or themed notification if needed, keeping functionality
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const totalEarned = commissions.reduce((acc, curr) => acc + (curr.commissionAmount || 0), 0);
  const totalWithdrawn = withdrawals.filter(w => w.status !== 'failed').reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const calculatedBalance = Math.max(0, totalEarned - totalWithdrawn);
  const userCurrency = profile?.currency || 'NGN';

  const handleWithdrawalClick = () => {
    if (!user || !profile) return;
    if (!profile.bankDetails?.accountNumber) {
      alert('Please configure your institutional payment credentials first.');
      setShowBankForm(true);
      return;
    }
    
    const minThreshold = userCurrency === 'USD' ? 10 : 10000;
    const currencySymbol = userCurrency === 'USD' ? '$' : '₦';

    if (calculatedBalance < minThreshold) {
      alert(`Minimum withdrawal threshold is ${currencySymbol}${minThreshold.toLocaleString()}`);
      return;
    }

    setWithdrawAmount(calculatedBalance.toString());
    setWithdrawError(null);
    setWithdrawSuccess(false);
    setShowWithdrawModal(true);
  };

  const submitWithdrawalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const amount = parseFloat(withdrawAmount);
    const minThreshold = userCurrency === 'USD' ? 10 : 10000;
    const currencySymbol = userCurrency === 'USD' ? '$' : '₦';

    if (isNaN(amount) || amount < minThreshold) {
      setWithdrawError(`Minimum withdrawal threshold is ${currencySymbol}${minThreshold.toLocaleString()}`);
      return;
    }

    if (amount > calculatedBalance) {
      setWithdrawError(`Amount exceeds your maximum available balance of ${currencySymbol}${calculatedBalance.toLocaleString()}`);
      return;
    }

    setLoading(true);
    setWithdrawError(null);
    try {
      const withdrawalId = `WD_${user.uid}_${Date.now()}`;
      await setDoc(doc(db, 'withdrawals', withdrawalId), {
        id: withdrawalId,
        userId: user.uid,
        email: user.email,
        accountName: profile.displayName || 'Unnamed Scholar',
        amount: amount,
        currency: userCurrency,
        bankDetails: profile.bankDetails,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      setWithdrawSuccess(true);
      setTimeout(() => {
        setShowWithdrawModal(false);
        setWithdrawSuccess(false);
      }, 2500);
    } catch (error) {
      console.error(error);
      setWithdrawError('Critical transmission failure. Request aborted.');
    }
    setLoading(false);
  };

  const [activationFailed, setActivationFailed] = useState(false);

  const handleJoinProgram = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await axios.post('/api/activate-affiliate', {
        userId: user.uid
      }, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (response.data.success) {
        // Success handled by backend, profile listener will pick up changes
      }
    } catch (error: any) {
      console.warn('Backend activation failed, using client-side fallback:', error.response?.data?.error || error.message);
      try {
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        const referralCode = profile?.referralCode || `DS${randomPart}`;
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          affiliateStatus: "active",
          isAffiliate: true,
          isPartner: true,
          referralCode: referralCode,
          activatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (fallbackError: any) {
        console.error('Affiliate Activation Fallback Error:', fallbackError.message);
        setActivationFailed(true);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    // Only auto-trigger if explicitly needed (e.g. status is null)
    if (user?.uid && profile && !profile.affiliateStatus && !loading && !activationFailed) {
      handleJoinProgram();
    }
  }, [user?.uid, profile?.affiliateStatus, activationFailed]);

  const isPlatformActive = profile?.affiliateStatus === 'active' || profile?.affiliateStatus === 'approved';
  const isAwaitingApproval = profile?.affiliateStatus === 'pending';

  const fallbackCode = `DS${user?.uid?.substring(0, 6).toUpperCase() || 'REF'}`;
  const referralLink = `${window.location.origin}/?ref=${profile?.referralCode || fallbackCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Diamond Solution Affiliate',
          text: `Join Diamond Solution using my referral link and learn!`,
          url: referralLink,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch (err) {
        console.warn('Web Share failed or cancelled:', err);
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  useEffect(() => {
    if (user?.uid) {
      if (profile?.role === 'admin' || profile?.role === 'moderator' || user?.email === 'peteradekunle923@gmail.com') {
        setHasPaidCourse(true);
        return;
      }

      const q = query(
        collection(db, 'payments'),
        where('userId', '==', user.uid)
      );

      const unsub = onSnapshot(q, (snap) => {
        // Filter in memory to handle old/new formats and filter out reactivation payments
        const hasPaid = snap.docs.some(docSnap => {
          const d = docSnap.data();
          const isSuccess = d.status === 'success' || d.status === 'paid';
          const isNotReactivation = d.purpose !== 'reactivation';
          // Payment must have a department, field, course identifier or be of type department_access
          const hasDeptOrCourse = !!(
            d.dept_name || 
            d.department || 
            d.courseId || 
            d.type === 'department_access' || 
            docSnap.id.startsWith('dept_pay_') || 
            docSnap.id.includes('_course_')
          );
          return isSuccess && isNotReactivation && hasDeptOrCourse;
        });
        
        setHasPaidCourse(hasPaid);
      }, (err) => {
        console.error("Failed to check payments for affiliate unlock:", err);
        setHasPaidCourse(false);
      });

      return unsub;
    } else {
      setHasPaidCourse(null);
    }
  }, [user?.uid, profile?.role, user?.email]);

  if (hasPaidCourse === null) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-10 h-10 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37] animate-pulse">
            {language === 'fr' ? 'Validation des autorisations...' : 'Authenticating Access Authorization...'}
          </p>
        </div>
      </Layout>
    );
  }

  if (hasPaidCourse === false) {
    return (
      <Layout>
        <div className="px-6 py-8 flex flex-col items-center justify-center min-h-[70vh] text-center max-w-xl mx-auto space-y-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="w-20 h-20 bg-red-500/10 rounded-3xl border border-red-500/20 flex items-center justify-center text-red-500 shadow-lg shadow-red-500/5 mb-2"
          >
            <Lock className="w-10 h-10" />
          </motion.div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-serif font-black text-[#0B1E3D] tracking-tight">
              {language === 'fr' ? 'Accès Restreint' : 'Affiliate Platform Restricted'}
            </h2>
            <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em] leading-none mb-4">
              {language === 'fr' ? 'Abonnement requis' : 'Course Subscription Required'}
            </p>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            {language === 'fr' 
              ? "L'accès au programme d'affiliation et de partage de revenus est réservé exclusivement aux étudiants inscrits ayant payé au moins un cours départemental. Débloquez votre statut d'affilié dès aujourd'hui en rejoignant votre premier département académique."
              : "Access to the Affiliate & Revenue Sharing program is strictly reserved for subscribed students who have paid for at least one physical/departmental course on the platform. Unlock your affiliate privileges today by securing access to any academic department."}
          </p>

          <div className="pt-4 w-full">
            <a 
              href="/courses"
              className="inline-flex w-full sm:w-auto btn-gold text-[#0B1E3D] font-black text-[11px] uppercase tracking-widest px-8 py-4 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all justify-center items-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-[#0B1E3D]" />
              {language === 'fr' ? 'Explorer les départements' : 'Explore Departments & Enroll'}
            </a>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="py-8 space-y-12">
        <header className="flex items-center justify-between px-1 sm:px-0">
          <div className="space-y-1">
            <h2 className="text-3xl font-serif font-black text-[#0B1E3D] tracking-tight">{t('affiliate.title')}</h2>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] leading-none">{t('affiliate.subtitle')}</p>
          </div>
          <button 
            onClick={handleShare}
            className="w-12 h-12 bg-[#FEF9E7] hover:bg-[#FDF0D0] active:scale-95 transition-all rounded-2xl border border-[#F5E5A4] flex items-center justify-center text-[#D4AF37] shadow-lg shadow-[#D4AF37]/10 relative group cursor-pointer"
            title="Share Referral Link"
          >
            {shared || copied ? (
              <Check className="w-5 h-5 text-emerald-600 animate-pulse" />
            ) : (
              <Share2 className="w-5 h-5" />
            )}
            {(shared || copied) && (
              <span className="absolute -bottom-8 right-0 bg-[#0B1E3D] border border-[#F5E5A4] text-[#D4AF37] text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap z-50 animate-bounce">
                {shared ? 'SHARED!' : 'COPIED!'}
              </span>
            )}
          </button>
        </header>

        {(!isPlatformActive && loading) ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
             <div className="w-10 h-10 border-4 border-[#1B3FA0] border-t-transparent rounded-full animate-spin" />
             <p className="text-[10px] font-black uppercase tracking-widest text-[#1B3FA0] animate-pulse">Synchronizing Partner Archives...</p>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-luxury p-6 sm:p-10 bg-white border border-[#DDE5F5] text-slate-900 space-y-6 sm:space-y-10 relative overflow-hidden shadow-xs rounded-3xl"
          >
             <div className="space-y-2 relative z-10">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] leading-none">{t('affiliate.endowment')}</p>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                  <p className="text-5xl sm:text-6xl font-serif font-black tracking-tight text-[#0B1E3D]">
                    <span className="text-[#1B3FA0] text-3xl sm:text-4xl mr-2">{userCurrency === 'USD' ? '$' : '₦'}</span>{calculatedBalance.toLocaleString()}
                  </p>
                  <button 
                    onClick={handleWithdrawalClick}
                    disabled={loading || calculatedBalance < (userCurrency === 'USD' ? 10 : 10000)}
                    className="w-full sm:w-auto justify-center bg-[#1B3FA0] text-white px-8 py-4 sm:py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-md shadow-[#1B3FA0]/20 hover:bg-[#143282] active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2 cursor-pointer"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    {t('affiliate.place_withdrawal')}
                  </button>
                </div>
             </div>

             <div className="bg-[#EEF3FF] p-4 sm:p-8 rounded-2xl border border-[#D4E0FC] space-y-6 relative z-10">
                <div className="flex items-center justify-between px-2">
                   <div className="flex items-center gap-3">
                      <Landmark className={cn("w-5 h-5", profile?.bankDetails?.accountNumber ? "text-[#1B3FA0]" : "text-slate-400")} />
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">{t('affiliate.payout_creds')}</span>
                   </div>
                   <button 
                    onClick={() => setShowBankForm(true)}
                    className="text-[10px] font-black text-[#1B3FA0] uppercase tracking-widest hover:underline flex items-center gap-2 cursor-pointer"
                   >
                     {profile?.bankDetails?.accountNumber ? t('affiliate.update_authority') : t('affiliate.init_creds')}
                     <Plus className="w-3 h-3" />
                   </button>
                </div>
                
                {profile?.bankDetails?.accountNumber ? (
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2">
                    <div className="space-y-1">
                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest leading-none">{t('affiliate.bank_hierarchy')}</p>
                      <p className="text-[11px] font-serif font-black text-[#0B1E3D]">{profile.bankDetails.bankName}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest leading-none">{t('affiliate.access_id')}</p>
                      <p className="text-[11px] font-mono font-black text-[#1B3FA0] tracking-widest">{profile.bankDetails.accountNumber}</p>
                    </div>
                  </div>
                ) : (
                  <p className="px-2 text-[10px] text-slate-500 italic">{t('affiliate.authorize_bank_desc')}</p>
                )}
             </div>

             <div className="bg-[#EEF3FF] p-4 sm:p-8 rounded-2xl border border-[#D4E0FC] space-y-6 relative z-10">
                <div className="flex items-center justify-between px-2">
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">{t('affiliate.your_id')}</span>
                   <span className="bg-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#1B3FA0] border border-[#D4E0FC] shadow-xs">{profile?.referralCode || fallbackCode}</span>
                </div>
               <div className="relative group">
                  <input 
                    readOnly 
                    value={referralLink}
                    className="w-full bg-white border border-[#D4E0FC] px-4 sm:px-6 py-4 rounded-2xl text-[11px] font-mono pr-16 focus:outline-none truncate text-[#1B3FA0] transition-all"
                  />
                  <button 
                    onClick={copyToClipboard}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#1B3FA0] text-white rounded-xl flex items-center justify-center hover:bg-[#143282] active:scale-95 transition-all shadow-xs cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
               </div>
               {copied && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-[#1B3FA0] font-black text-center uppercase tracking-widest animate-pulse">
                    {t('affiliate.sync_cache')}
                  </motion.p>
                )}
             </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
           <AffStat icon={Users} label={t('affiliate.referred_assets')} value={referrals.length} color="text-[#1B3FA0]" bg="bg-[#EEF3FF]" />
           <AffStat icon={Diamond} label={t('affiliate.total_earned')} value={`${userCurrency === 'USD' ? '$' : '₦'}${totalEarned.toLocaleString()}`} color="text-[#1B3FA0]" bg="bg-[#EEF3FF]" />
           <AffStat icon={Zap} label={t('affiliate.rev_share')} value="25%" color="text-emerald-600" bg="bg-emerald-50" />
           <AffStat icon={Wallet} label={t('affiliate.net_balance')} value={`${userCurrency === 'USD' ? '$' : '₦'}${calculatedBalance.toLocaleString()}`} color="text-[#1B3FA0]" bg="bg-[#EEF3FF]" />
        </div>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
             <div className="w-10 h-[1px] bg-[#DDE5F5]" />
             <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">{t('affiliate.commission_archives')}</h3>
          </div>
          <div className="grid gap-4">
            {commissions.length > 0 ? commissions.map((c) => (
              <div key={c.id} className="card-luxury p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#DDE5F5] bg-white rounded-2xl shadow-xs hover:border-[#1B3FA0]/40 transition-all group">
                 <div className="flex items-center space-x-4 sm:space-x-5">
                    <div className="w-12 h-12 bg-[#EEF3FF] rounded-2xl flex items-center justify-center text-[#1B3FA0] border border-[#D4E0FC] shrink-0">
                      <Diamond className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0B1E3D]">{c.referredName || 'Student'} {t('affiliate.enrollment')}</p>
                      <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Historical Record'} • {t('affiliate.direct_referral')}
                      </p>
                    </div>
                 </div>
                 <div className="text-left sm:text-right w-full sm:w-auto pl-16 sm:pl-0">
                    <p className="text-[14px] font-black text-emerald-600 font-mono tracking-tight">+{userCurrency === 'USD' ? '$' : '₦'}{c.commissionAmount?.toLocaleString()}</p>
                    <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest">25% {t('affiliate.rev_share')}</p>
                 </div>
              </div>
            )) : (
              <div className="text-center py-12 card-luxury border border-dashed border-[#DDE5F5] bg-white rounded-2xl">
                <Clock className="w-12 h-12 text-blue-200 mx-auto mb-4" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] italic">{t('affiliate.awaiting_endowment')}</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
             <div className="w-10 h-[1px] bg-[#DDE5F5]" />
             <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">{t('affiliate.redistributions')}</h3>
          </div>
          <div className="grid gap-4">
            {withdrawals.length > 0 ? withdrawals.map((w) => (
              <div key={w.id} className="card-luxury p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#DDE5F5] bg-white rounded-2xl shadow-xs">
                 <div className="flex items-center space-x-4 sm:space-x-5">
                    <div className="w-12 h-12 bg-[#EEF3FF] rounded-2xl flex items-center justify-center text-[#1B3FA0] border border-[#D4E0FC] shrink-0">
                      <ArrowUpRight className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-[#0B1E3D]">{userCurrency === 'USD' ? '$' : '₦'}{w.amount.toLocaleString()}</p>
                      <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">
                        {w.createdAt ? new Date(w.createdAt).toLocaleDateString() : 'Pending Transmission'}
                      </p>
                    </div>
                 </div>
                 <div className="pl-18 sm:pl-0 w-full sm:w-auto flex justify-start sm:justify-end">
                    <div className={cn(
                       "px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest w-fit",
                       w.status === 'success' ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
                       w.status === 'failed' ? "text-red-700 bg-red-50 border-red-200" :
                       "text-[#1B3FA0] bg-[#EEF3FF] border-[#D4E0FC]"
                    )}>
                       {w.status}
                    </div>
                 </div>
              </div>
            )) : (
              <div className="text-center py-12 card-luxury border border-dashed border-[#DDE5F5] bg-white rounded-2xl">
                <Clock className="w-12 h-12 text-blue-200 mx-auto mb-4" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] italic">{t('affiliate.no_redistributed')}</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
             <div className="w-10 h-[1px] bg-[#D8E3FF]" />
             <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.5em]">{t('affiliate.network_sync')}</h3>
          </div>
          <div className="grid gap-4">
            {referrals.length > 0 ? referrals.map((ref) => (
              <div key={ref.id} className="card-luxury p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#D8E3FF] bg-white rounded-2xl shadow-xs hover:border-[#2563EB] transition-all group">
                 <div className="flex items-center space-x-4 sm:space-x-5">
                    <div className="w-12 h-12 bg-[#EEF3FF] rounded-2xl flex items-center justify-center font-serif font-black text-[#2563EB] border border-[#D8E3FF] group-hover:bg-[#2563EB] group-hover:text-white transition-all shrink-0">
                      {ref.displayName?.charAt(0) || <Diamond className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-base font-bold text-text-1 tracking-tight group-hover:text-[#2563EB] transition-colors">{ref.displayName || t('profile.defaultName')}</p>
                      <p className="text-[9px] text-text-3 uppercase font-black tracking-[0.2em] mt-1 opacity-60">{t('affiliate.verified_user')}</p>
                    </div>
                 </div>
                 <div className="pl-18 sm:pl-0 w-full sm:w-auto flex justify-start sm:justify-end">
                    <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200 w-fit">
                       <ShieldCheck className="w-4 h-4" />
                       <span className="text-[9px] font-black uppercase tracking-widest">{t('affiliate.active')}</span>
                    </div>
                 </div>
              </div>
            )) : (
              <div className="text-center py-20 card-luxury border border-dashed border-[#D8E3FF] bg-white rounded-2xl">
                <Clock className="w-12 h-12 text-blue-200 mx-auto mb-4" />
                <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em] italic opacity-60">{t('affiliate.awaiting_network')}</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {showBankForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBankForm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white border border-[#DDE5F5] rounded-3xl p-8 shadow-xl relative z-10 space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-[#EEF3FF] rounded-2xl flex items-center justify-center text-[#1B3FA0] mx-auto border border-[#D4E0FC] mb-2">
                  <Landmark className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-serif font-black text-[#0B1E3D] tracking-tight">{t('affiliate.payout_authority')}</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('affiliate.sync_creds_desc')}</p>
              </div>

              <form onSubmit={saveBankDetails} className="space-y-4">
                {userCurrency === 'USD' ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Payout Method</label>
                      <select 
                        required
                        value={bankDetails.bankName}
                        onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value, bankCode: 'INTL'})}
                        className="w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl px-5 py-3.5 text-[13px] text-[#0B1E3D] focus:border-[#1B3FA0] outline-none transition-all"
                      >
                        <option value="">Select Method</option>
                        <option value="PayPal">PayPal</option>
                        <option value="USDT TRC20">USDT (TRC20)</option>
                        <option value="Wire Transfer">International Wire</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Address / Account Details</label>
                      <input 
                        type="text" 
                        required
                        value={bankDetails.accountNumber}
                        onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                        placeholder="e.g. paypal@email.com or TRC20 Address"
                        className="w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl px-5 py-3.5 text-[13px] text-[#0B1E3D] focus:border-[#1B3FA0] outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name / Beneficiary</label>
                      <input 
                        type="text" 
                        required
                        value={bankDetails.accountName}
                        onChange={(e) => setBankDetails({...bankDetails, accountName: e.target.value.toUpperCase()})}
                        className="w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl px-5 py-3.5 text-[13px] text-[#0B1E3D] focus:border-[#1B3FA0] outline-none transition-all uppercase font-bold"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('affiliate.financial_institution')}</label>
                      <select 
                        required
                        value={bankDetails.bankCode}
                        onChange={(e) => {
                          const selectedBank = e.target.options[e.target.selectedIndex].text;
                          setBankDetails({...bankDetails, bankCode: e.target.value, bankName: selectedBank});
                        }}
                        className="w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl px-5 py-3.5 text-[13px] text-[#0B1E3D] focus:border-[#1B3FA0] outline-none transition-all"
                      >
                        <option value="">{t('affiliate.select_hub')}</option>
                        <option value="044">Access Bank</option>
                        <option value="058">Guaranty Trust Bank (GTB)</option>
                        <option value="011">First Bank</option>
                        <option value="057">Zenith Bank</option>
                        <option value="033">United Bank for Africa (UBA)</option>
                        <option value="032">Union Bank</option>
                        <option value="070">Fidelity Bank</option>
                        <option value="214">First City Monument Bank (FCMB)</option>
                        <option value="50211">Kuda Bank</option>
                        <option value="999992">OPay Digital Services</option>
                        <option value="999991">PalmPay</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('affiliate.acc_no')}</label>
                      <input 
                        required
                        type="text"
                        maxLength={10}
                        placeholder="0000000000"
                        value={bankDetails.accountNumber}
                        onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                        className="w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl px-5 py-3.5 text-[13px] text-[#0B1E3D] focus:border-[#1B3FA0] outline-none transition-all font-mono tracking-widest"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('affiliate.beneficiary')}</label>
                      <input 
                        required
                        type="text"
                        placeholder="JOHN DOE"
                        value={bankDetails.accountName}
                        onChange={(e) => setBankDetails({...bankDetails, accountName: e.target.value.toUpperCase()})}
                        className="w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl px-5 py-3.5 text-[13px] text-[#0B1E3D] focus:border-[#1B3FA0] outline-none transition-all uppercase font-bold"
                      />
                    </div>
                  </>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-[#1B3FA0] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-md shadow-[#1B3FA0]/20 hover:bg-[#143282] active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer"
                >
                  {loading ? t('general.loading') : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      {t('affiliate.authorize_creds')}
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showWithdrawModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWithdrawModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white border border-[#DDE5F5] rounded-3xl p-8 shadow-xl relative z-10 space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-[#EEF3FF] rounded-2xl flex items-center justify-center text-[#1B3FA0] mx-auto border border-[#D4E0FC] mb-2">
                  <Wallet className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-serif font-black text-[#0B1E3D] tracking-tight">
                  {language === 'fr' ? 'Sélectionner le montant' : 'Select Withdrawal Amount'}
                </h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {language === 'fr' ? 'Solde disponible :' : 'Available Balance:'} <span className="text-[#1B3FA0]">{userCurrency === 'USD' ? '$' : '₦'}{calculatedBalance.toLocaleString()}</span>
                </p>
              </div>

              {withdrawSuccess ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
                    <CheckCircle className="w-8 h-8 animate-bounce" />
                  </div>
                  <p className="text-sm font-bold text-[#0B1E3D]">
                    {language === 'fr' ? 'Demande de retrait enregistrée !' : 'Withdrawal Request Dispatched!'}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
                    {language === 'fr' ? 'La demande a été envoyée aux archives administratives.' : 'Your request has been sent for administrative approval.'}
                  </p>
                </div>
              ) : (
                <form onSubmit={submitWithdrawalRequest} className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      {language === 'fr' ? 'Montant à retirer' : 'Amount to Withdraw'}
                    </label>
                    <div className="relative">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[#1B3FA0] font-serif font-black text-lg">
                        {userCurrency === 'USD' ? '$' : '₦'}
                      </div>
                      <input 
                        type="number"
                        step={userCurrency === 'USD' ? '0.01' : '1'}
                        min={userCurrency === 'USD' ? '10' : '10000'}
                        max={calculatedBalance}
                        required
                        value={withdrawAmount}
                        onChange={(e) => {
                          setWithdrawAmount(e.target.value);
                          setWithdrawError(null);
                        }}
                        className="w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl pl-10 pr-20 py-3.5 text-[15px] font-black text-[#0B1E3D] focus:border-[#1B3FA0] outline-none transition-all font-mono tracking-widest"
                      />
                      <button
                        type="button"
                        onClick={() => setWithdrawAmount(calculatedBalance.toString())}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#1B3FA0] text-white hover:bg-[#143282] px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                      >
                        MAX
                      </button>
                    </div>
                    <div className="flex justify-between items-center px-1">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                        {language === 'fr' ? 'Minimum requis :' : 'Minimum Required:'} <span className="text-[#1B3FA0]">{userCurrency === 'USD' ? '$10' : '₦10,000'}</span>
                      </p>
                    </div>
                  </div>

                  {withdrawError && (
                    <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center animate-pulse">
                      {withdrawError}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setShowWithdrawModal(false)}
                      className="w-1/2 h-14 bg-white border border-[#DDE5F5] text-slate-700 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:border-[#1B3FA0] transition-all cursor-pointer"
                    >
                      {language === 'fr' ? 'Annuler' : 'Cancel'}
                    </button>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-1/2 h-14 bg-emerald-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-md shadow-emerald-500/20 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <ArrowUpRight className="w-4 h-4" />
                          {language === 'fr' ? 'Confirmer' : 'Confirm'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Layout>
  );
}

function AffStat({ icon: Icon, label, value, color, bg }: any) {
  return (
    <div className="card-luxury p-4 sm:p-6 space-y-3 sm:space-y-4 bg-white border border-[#DDE5F5] rounded-3xl shadow-xs flex flex-col justify-between group hover:border-[#1B3FA0]/40 transition-all">
      <div className={cn("p-3 rounded-2xl w-fit border border-[#D4E0FC]", bg)}>
         <Icon className={cn("w-5 h-5", color)} />
      </div>
      <div className="space-y-1">
         <p className="text-2xl font-serif font-black text-[#0B1E3D] tracking-tight group-hover:text-[#1B3FA0] transition-colors">{value}</p>
         <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">{label}</p>
      </div>
    </div>
  );
}
