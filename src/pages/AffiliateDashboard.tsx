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
  const { t } = useLanguage();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    accountName: '',
    bankCode: ''
  });

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

  const handleWithdrawal = async () => {
    if (!user || !profile) return;
    if (!profile.bankDetails?.accountNumber) {
      alert('Please configure your institutional payment credentials first.');
      setShowBankForm(true);
      return;
    }
    
    const amount = calculatedBalance;
    const minThreshold = userCurrency === 'USD' ? 1 : 1000;
    const currencySymbol = userCurrency === 'USD' ? '$' : '₦';

    if (amount < minThreshold) {
      alert(`Minimum withdrawal threshold is ${currencySymbol}${minThreshold.toLocaleString()}`);
      return;
    }

    if (!window.confirm(`Request withdrawal of ${currencySymbol}${amount.toLocaleString()}?`)) return;

    setLoading(true);
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

      // No longer mandatory to update user.balance here as we use calculatedBalance
      // but we can still try for consistency if rules allow (though they probably won't for non-admins)
      try {
        await setDoc(doc(db, 'users', user.uid), {
          balance: 0
        }, { merge: true });
      } catch (e) {
        console.warn('Sync balance field failed, but withdrawal record created.');
      }

      alert('Withdrawal request dispatched to administrative archives.');
    } catch (error) {
      console.error(error);
      alert('Critical transmission failure. Request aborted.');
    }
    setLoading(false);
  };

  const userCurrency = profile?.currency || 'NGN';

  const [activationFailed, setActivationFailed] = useState(false);

  const handleJoinProgram = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const response = await axios.post('/api/activate-affiliate', {
        userId: user.uid
      });
      if (response.data.success) {
        // Success handled by backend, profile listener will pick up changes
      }
    } catch (error: any) {
      console.error('Activation Error:', error.response?.data?.error || error.message);
      setActivationFailed(true);
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

  const fallbackCode = `DS-${user?.uid?.substring(0, 6).toUpperCase() || 'REF'}`;
  const referralLink = `${window.location.origin}/login?ref=${profile?.referralCode || fallbackCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="px-6 py-8 space-y-12">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-serif font-black text-text-1 tracking-tight">{t('affiliate.title')}</h2>
            <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em] leading-none">{t('affiliate.subtitle')}</p>
          </div>
          <div className="w-12 h-12 bg-gold/10 rounded-2xl border border-gold/20 flex items-center justify-center text-gold shadow-lg shadow-gold/5">
            <Share2 className="w-6 h-6" />
          </div>
        </header>

        {(!isPlatformActive && loading) ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
             <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin" />
             <p className="text-[10px] font-black uppercase tracking-widest text-gold animate-pulse">Synchronizing Partner Archives...</p>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-luxury p-10 bg-gradient-to-br from-navy-card to-navy-mid border-gold/20 text-text-1 space-y-10 relative overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.5)]"
          >
            <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-gold/5 diamond-mark blur-[80px]" />
            
             <div className="space-y-2 relative z-10">
                <p className="text-gold-light text-[10px] font-black uppercase tracking-[0.3em] leading-none opacity-60">{t('affiliate.endowment')}</p>
                <div className="flex items-end justify-between">
                  <p className="text-6xl font-serif font-black tracking-tight text-white drop-shadow-2xl">
                    <span className="text-gold text-4xl mr-2">{userCurrency === 'USD' ? '$' : '₦'}</span>{calculatedBalance.toLocaleString()}
                  </p>
                  <button 
                    onClick={handleWithdrawal}
                    disabled={loading || calculatedBalance < (userCurrency === 'USD' ? 1 : 1000)}
                    className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    {t('affiliate.place_withdrawal')}
                  </button>
                </div>
             </div>

             <div className="bg-navy-high/50 backdrop-blur-xl p-8 rounded-[2rem] border border-gold/10 space-y-6 relative z-10 ring-1 ring-gold/5">
                <div className="flex items-center justify-between px-2">
                   <div className="flex items-center gap-3">
                      <Landmark className={cn("w-5 h-5", profile?.bankDetails?.accountNumber ? "text-gold" : "text-text-3 opacity-30")} />
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-text-3">{t('affiliate.payout_creds')}</span>
                   </div>
                   <button 
                    onClick={() => setShowBankForm(true)}
                    className="text-[10px] font-black text-gold uppercase tracking-widest hover:underline flex items-center gap-2"
                   >
                     {profile?.bankDetails?.accountNumber ? t('affiliate.update_authority') : t('affiliate.init_creds')}
                     <Plus className="w-3 h-3" />
                   </button>
                </div>
                
                {profile?.bankDetails?.accountNumber ? (
                  <div className="grid grid-cols-2 gap-4 px-2">
                    <div className="space-y-1">
                      <p className="text-[8px] text-text-3 font-black uppercase tracking-widest leading-none">{t('affiliate.bank_hierarchy')}</p>
                      <p className="text-[11px] font-serif font-black text-white">{profile.bankDetails.bankName}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] text-text-3 font-black uppercase tracking-widest leading-none">{t('affiliate.access_id')}</p>
                      <p className="text-[11px] font-mono font-black text-gold tracking-widest">{profile.bankDetails.accountNumber}</p>
                    </div>
                  </div>
                ) : (
                  <p className="px-2 text-[10px] text-text-3 italic opacity-60">{t('affiliate.authorize_bank_desc')}</p>
                )}
             </div>

             <div className="bg-navy-high/50 backdrop-blur-xl p-8 rounded-[2rem] border border-gold/10 space-y-6 relative z-10 ring-1 ring-gold/5">
                <div className="flex items-center justify-between px-2">
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-text-3">{t('affiliate.your_id')}</span>
                   <span className="bg-gold/10 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-gold border border-gold/20 shadow-lg">{profile?.referralCode || fallbackCode}</span>
                </div>
               <div className="relative group">
                  <input 
                    readOnly 
                    value={referralLink}
                    className="w-full bg-navy-high/40 border border-gold/10 px-6 py-5 rounded-2xl text-[11px] font-mono pr-16 focus:outline-none truncate text-gold-light group-hover:border-gold/30 transition-all shadow-inner"
                  />
                  <button 
                    onClick={copyToClipboard}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 bg-gold text-navy rounded-xl flex items-center justify-center hover:bg-gold-light active:scale-95 transition-all shadow-2xl shadow-gold/20"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
               </div>
               {copied && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-gold-pale font-black text-center uppercase tracking-widest animate-pulse">
                    {t('affiliate.sync_cache')}
                  </motion.p>
                )}
             </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
           <AffStat icon={Users} label={t('affiliate.referred_assets')} value={referrals.length} color="text-gold" bg="bg-gold/10" />
           <AffStat icon={Diamond} label={t('affiliate.total_earned')} value={`${userCurrency === 'USD' ? '$' : '₦'}${totalEarned.toLocaleString()}`} color="text-gold" bg="bg-gold/10" />
           <AffStat icon={Zap} label={t('affiliate.rev_share')} value="25%" color="text-emerald-500" bg="bg-emerald-500/10" />
           <AffStat icon={Wallet} label={t('affiliate.net_balance')} value={`${userCurrency === 'USD' ? '$' : '₦'}${calculatedBalance.toLocaleString()}`} color="text-gold" bg="bg-gold/10" />
        </div>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
             <div className="w-10 h-[1px] bg-gold/20" />
             <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.5em]">{t('affiliate.commission_archives')}</h3>
          </div>
          <div className="grid gap-4">
            {commissions.length > 0 ? commissions.map((c) => (
              <div key={c.id} className="card-luxury p-6 flex items-center justify-between border-gold/10 bg-navy-mid/40 hover:border-gold/30 transition-all group">
                 <div className="flex items-center space-x-5">
                    <div className="w-12 h-12 bg-gold/5 rounded-xl flex items-center justify-center text-gold border border-gold/10">
                      <Diamond className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-1">{c.referredName || 'Student'} {t('affiliate.enrollment')}</p>
                      <p className="text-[9px] text-text-3 uppercase font-black tracking-widest mt-1 opacity-60">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Historical Record'} • {t('affiliate.direct_referral')}
                      </p>
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-[14px] font-black text-emerald-500 font-mono tracking-tight">+{userCurrency === 'USD' ? '$' : '₦'}{c.commissionAmount?.toLocaleString()}</p>
                    <p className="text-[8px] text-text-3 uppercase font-black tracking-widest opacity-40">25% {t('affiliate.rev_share')}</p>
                 </div>
              </div>
            )) : (
              <div className="text-center py-12 card-luxury border-dashed border-gold/10 bg-navy-mid/20">
                <Clock className="w-12 h-12 text-gold/5 mx-auto mb-4" />
                <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em] italic opacity-40">{t('affiliate.awaiting_endowment')}</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
             <div className="w-10 h-[1px] bg-gold/20" />
             <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.5em]">{t('affiliate.redistributions')}</h3>
          </div>
          <div className="grid gap-4">
            {withdrawals.length > 0 ? withdrawals.map((w) => (
              <div key={w.id} className="card-luxury p-6 flex items-center justify-between border-gold/10 bg-navy-mid/40">
                 <div className="flex items-center space-x-5">
                    <div className="w-14 h-14 bg-navy-high rounded-2xl flex items-center justify-center text-gold-light border border-gold/10">
                      <ArrowUpRight className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-text-1">{userCurrency === 'USD' ? '$' : '₦'}{w.amount.toLocaleString()}</p>
                      <p className="text-[9px] text-text-3 uppercase font-black tracking-widest mt-1 opacity-60">
                        {w.createdAt ? new Date(w.createdAt).toLocaleDateString() : 'Pending Transmission'}
                      </p>
                    </div>
                 </div>
                 <div className={cn(
                    "px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest",
                    w.status === 'success' ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
                    w.status === 'failed' ? "text-red-500 bg-red-500/10 border-red-500/20" :
                    "text-gold bg-gold/10 border-gold/20"
                 )}>
                    {w.status}
                 </div>
              </div>
            )) : (
              <div className="text-center py-12 card-luxury border-dashed border-gold/10 bg-navy-mid/20">
                <Clock className="w-12 h-12 text-gold/5 mx-auto mb-4" />
                <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em] italic opacity-40">{t('affiliate.no_redistributed')}</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
             <div className="w-10 h-[1px] bg-gold/20" />
             <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.5em]">{t('affiliate.network_sync')}</h3>
          </div>
          <div className="grid gap-4">
            {referrals.length > 0 ? referrals.map((ref) => (
              <div key={ref.id} className="card-luxury p-6 flex items-center justify-between border-gold/10 bg-navy-mid/40 hover:border-gold/30 transition-all group">
                 <div className="flex items-center space-x-5">
                    <div className="w-14 h-14 bg-navy-high rounded-2xl flex items-center justify-center font-serif font-black text-gold-light border border-gold/10 group-hover:bg-gold group-hover:text-navy transition-all shadow-lg">
                      {ref.displayName?.charAt(0) || <Diamond className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-base font-bold text-text-1 tracking-tight group-hover:text-gold transition-colors">{ref.displayName || t('profile.defaultName')}</p>
                      <p className="text-[9px] text-text-3 uppercase font-black tracking-[0.2em] mt-1 opacity-60">{t('affiliate.verified_user')}</p>
                    </div>
                 </div>
                 <div className="flex items-center space-x-2 text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 shadow-lg">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-[9px] font-black uppercase tracking-widest">{t('affiliate.active')}</span>
                 </div>
              </div>
            )) : (
              <div className="text-center py-24 card-luxury border-dashed border-gold/10 bg-navy-mid/20">
                <Clock className="w-16 h-16 text-gold/10 mx-auto mb-6" />
                <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em] italic opacity-40">{t('affiliate.awaiting_network')}</p>
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
              className="absolute inset-0 bg-navy/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-navy-card border border-gold/30 rounded-[2.5rem] p-10 shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative z-10 space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-gold/10 rounded-2xl flex items-center justify-center text-gold mx-auto border border-gold/20 mb-4">
                  <Landmark className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-serif font-black text-white tracking-tight">{t('affiliate.payout_authority')}</h3>
                <p className="text-[10px] font-black text-text-3 uppercase tracking-widest">{t('affiliate.sync_creds_desc')}</p>
              </div>

              <form onSubmit={saveBankDetails} className="space-y-6">
                {userCurrency === 'USD' ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-text-3 uppercase tracking-widest ml-1">Payout Method</label>
                      <select 
                        required
                        value={bankDetails.bankName}
                        onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value, bankCode: 'INTL'})}
                        className="w-full bg-navy-high/50 border border-gold/20 rounded-2xl px-6 py-4 text-[13px] text-white focus:border-gold outline-none transition-all"
                      >
                        <option value="">Select Method</option>
                        <option value="PayPal">PayPal</option>
                        <option value="USDT TRC20">USDT (TRC20)</option>
                        <option value="Wire Transfer">International Wire</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-text-3 uppercase tracking-widest ml-1">Address / Account Details</label>
                      <input 
                        type="text" 
                        required
                        value={bankDetails.accountNumber}
                        onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                        placeholder="e.g. paypal@email.com or TRC20 Address"
                        className="w-full bg-navy-high/50 border border-gold/20 rounded-2xl px-6 py-4 text-[13px] text-white focus:border-gold outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-text-3 uppercase tracking-widest ml-1">Full Name / Beneficiary</label>
                      <input 
                        type="text" 
                        required
                        value={bankDetails.accountName}
                        onChange={(e) => setBankDetails({...bankDetails, accountName: e.target.value.toUpperCase()})}
                        className="w-full bg-navy-high/50 border border-gold/20 rounded-2xl px-6 py-4 text-[13px] text-white focus:border-gold outline-none transition-all uppercase font-bold"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-text-3 uppercase tracking-widest ml-1">{t('affiliate.financial_institution')}</label>
                      <select 
                        required
                        value={bankDetails.bankCode}
                        onChange={(e) => {
                          const selectedBank = e.target.options[e.target.selectedIndex].text;
                          setBankDetails({...bankDetails, bankCode: e.target.value, bankName: selectedBank});
                        }}
                        className="w-full bg-navy-high/50 border border-gold/20 rounded-2xl px-6 py-4 text-[13px] text-white focus:border-gold outline-none transition-all"
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
                      <label className="text-[9px] font-black text-text-3 uppercase tracking-widest ml-1">{t('affiliate.acc_no')}</label>
                      <input 
                        required
                        type="text"
                        maxLength={10}
                        placeholder="0000000000"
                        value={bankDetails.accountNumber}
                        onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                        className="w-full bg-navy-high/50 border border-gold/20 rounded-2xl px-6 py-4 text-[13px] text-white focus:border-gold outline-none transition-all font-mono tracking-widest placeholder:opacity-20"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-text-3 uppercase tracking-widest ml-1">{t('affiliate.beneficiary')}</label>
                      <input 
                        required
                        type="text"
                        placeholder="JOHN DOE"
                        value={bankDetails.accountName}
                        onChange={(e) => setBankDetails({...bankDetails, accountName: e.target.value.toUpperCase()})}
                        className="w-full bg-navy-high/50 border border-gold/20 rounded-2xl px-6 py-4 text-[13px] text-white focus:border-gold outline-none transition-all uppercase font-bold placeholder:opacity-20"
                      />
                    </div>
                  </>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full h-16 bg-gold text-navy rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-gold/20 hover:bg-gold-light active:scale-95 transition-all flex items-center justify-center gap-3"
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
      </AnimatePresence>
    </Layout>
  );
}

function AffStat({ icon: Icon, label, value, color, bg }: any) {
  return (
    <div className="card-luxury p-8 space-y-6 bg-navy-mid/60 border-gold/10 shadow-xl flex flex-col justify-between group hover:border-gold/30 transition-all">
      <div className={cn("p-4 rounded-[1.25rem] w-fit shadow-inner border border-gold/5", bg)}>
         <Icon className={cn("w-6 h-6", color)} />
      </div>
      <div className="space-y-1">
         <p className="text-3xl font-serif font-black text-text-1 tracking-tight group-hover:text-gold transition-colors">{value}</p>
         <p className="text-[9px] text-text-3 font-black uppercase tracking-[0.3em]">{label}</p>
      </div>
    </div>
  );
}
