import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Key, ShieldCheck, Mail, ArrowLeft, Loader2, Landmark, Save, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { getFriendlyErrorMessage } from '../utils/firebaseError';

export default function AccountSettings() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');

  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    accountName: '',
    bankCode: ''
  });

  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);

  useEffect(() => {
    if (profile?.username) {
      setNewUsername(profile.username);
    }
  }, [profile]);

  const saveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanUsername = newUsername.toLowerCase().replace(/\s/g, '').trim();
    if (!cleanUsername) {
      alert('Username cannot be empty.');
      return;
    }
    setUsernameLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        username: cleanUsername
      }, { merge: true });
      alert('Username updated successfully.');
    } catch (err: any) {
      console.error(err);
      alert('Failed to update username: ' + err.message);
    }
    setUsernameLoading(false);
  };

  useEffect(() => {
    if (profile?.bankDetails) {
      setBankDetails(profile.bankDetails);
    }
  }, [profile]);

  const saveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBankLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        bankDetails: bankDetails
      }, { merge: true });
      alert('Institutional payment credentials synchronized successfully.');
    } catch (error: any) {
      console.error(error);
      alert('Synchonization failed: ' + error.message);
    }
    setBankLoading(false);
  };

  const handleInitiateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (passwords.new !== passwords.confirm) {
      setError(t('auth.passwordMismatch') || 'Passwords do not match');
      return;
    }

    if (passwords.new.length < 6) {
      setError(t('auth.passwordTooShort') || 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      // 1. Reauthenticate first to make sure current password is correct
      const credential = EmailAuthProvider.credential(user?.email || '', passwords.current);
      await reauthenticateWithCredential(user!, credential);
      
      // 2. Request OTP via server API
      try {
        const res = await axios.post('/api/otp/request', {
          userId: user?.uid,
          email: user?.email,
          purpose: 'password_change',
          name: user?.displayName || 'Scholar'
        });
        if (res.data && res.data.emailSent === false) {
          alert(`[PREVIEW MODE] Verification Code bypassed for preview:\n\nGo to developer tools or check backend system logs (collection system_logs) to find your verification code.`);
        }
      } catch (otpErr: any) {
        console.error('OTP request failed:', otpErr);
        setError('Failed to initiate verification: ' + (otpErr.response?.data?.error || otpErr.message));
        setLoading(false);
        return;
      }

      setStep('otp');
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    setLoading(true);
    try {
      const verifyRes = await axios.post('/api/otp/verify', {
        userId: user?.uid,
        purpose: 'password_change',
        code: otp
      });

      if (!verifyRes.data || !verifyRes.data.success) {
        setError('Invalid security token. Please check your email.');
        setLoading(false);
        return;
      }

      await updatePassword(user!, passwords.new);
      alert('Institutional Password successfully updated.');
      navigate('/profile');
    } catch (err: any) {
      setError(err.response?.data?.error || getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="px-6 py-12 max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/profile')}
            className="w-12 h-12 bg-white border border-[#D8E3FF] rounded-2xl flex items-center justify-center text-[#2563EB] hover:bg-[#EEF3FF] transition-all shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-3xl font-serif font-black text-slate-900 tracking-tight">{t('profile.account')}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-1">Security Configuration</p>
          </div>
        </header>

        <section className="bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-sm">
           <header className="flex items-center gap-4 mb-8">
             <div className="w-10 h-10 bg-[#EEF3FF] rounded-xl flex items-center justify-center text-[#2563EB] border border-[#D8E3FF]">
               <User className="w-5 h-5" />
             </div>
             <div>
               <h3 className="text-lg font-serif font-black text-slate-900 uppercase">User Identity</h3>
               <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Update Your Academic Username</p>
             </div>
           </header>

           <form onSubmit={saveUsername} className="space-y-6">
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
               <input 
                 required
                 type="text"
                 placeholder="jacksparrow"
                 value={newUsername}
                 onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                 className="w-full bg-[#EEF3FF]/50 border border-[#D8E3FF] rounded-2xl px-5 py-3.5 text-xs text-slate-900 focus:border-[#2563EB] outline-none transition-all lowercase"
               />
             </div>

             <button 
               type="submit"
               disabled={usernameLoading}
               className="w-full h-14 bg-[#2563EB] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#1d4ed8] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-md shadow-[#2563EB]/20"
             >
               {usernameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                 <>
                   <Save className="w-4 h-4" />
                   <span>Save Username</span>
                 </>
               )}
             </button>
           </form>
        </section>

        <section className="bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-sm">
           <header className="flex items-center gap-4 mb-8">
             <div className="w-10 h-10 bg-[#EEF3FF] rounded-xl flex items-center justify-center text-[#2563EB] border border-[#D8E3FF]">
               <Landmark className="w-5 h-5" />
             </div>
             <div>
               <h3 className="text-lg font-serif font-black text-slate-900 uppercase">{t('affiliate.payout_creds')}</h3>
               <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{t('affiliate.sync_creds_desc')}</p>
             </div>
           </header>

           <form onSubmit={saveBankDetails} className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('affiliate.financial_institution')}</label>
               <select 
                 required
                 value={bankDetails.bankCode}
                 onChange={(e) => {
                   const selectedBank = e.target.options[e.target.selectedIndex].text;
                   setBankDetails({...bankDetails, bankCode: e.target.value, bankName: selectedBank});
                 }}
                 className="w-full bg-[#EEF3FF]/50 border border-[#D8E3FF] rounded-2xl px-5 py-3.5 text-xs text-slate-900 focus:border-[#2563EB] outline-none transition-all"
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
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('affiliate.acc_no')}</label>
               <input 
                 required
                 type="text"
                 maxLength={10}
                 placeholder="0000000000"
                 value={bankDetails.accountNumber}
                 onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                 className="w-full bg-[#EEF3FF]/50 border border-[#D8E3FF] rounded-2xl px-5 py-3.5 text-xs text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono tracking-widest placeholder:opacity-40"
               />
             </div>

             <div className="space-y-1.5 md:col-span-2">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('affiliate.beneficiary')}</label>
               <input 
                 required
                 type="text"
                 placeholder="JOHN DOE"
                 value={bankDetails.accountName}
                 onChange={(e) => setBankDetails({...bankDetails, accountName: e.target.value.toUpperCase()})}
                 className="w-full bg-[#EEF3FF]/50 border border-[#D8E3FF] rounded-2xl px-5 py-3.5 text-xs text-slate-900 focus:border-[#2563EB] outline-none transition-all uppercase font-bold placeholder:opacity-40"
               />
             </div>

             <button 
               type="submit"
               disabled={bankLoading}
               className="md:col-span-2 w-full h-14 bg-[#2563EB] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#1d4ed8] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-md shadow-[#2563EB]/20"
             >
               {bankLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                 <>
                   <Save className="w-4 h-4" />
                   <span>{t('affiliate.authorize_creds')}</span>
                 </>
               )}
             </button>
           </form>
        </section>

        <section className="bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-sm">
           <header className="flex items-center gap-4 mb-8">
             <div className="w-10 h-10 bg-[#EEF3FF] rounded-xl flex items-center justify-center text-[#2563EB] border border-[#D8E3FF]">
               <Key className="w-5 h-5" />
             </div>
             <div>
               <h3 className="text-lg font-serif font-black text-slate-900 uppercase">Security Override</h3>
               <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Master Key Configuration</p>
             </div>
           </header>
           
           <AnimatePresence mode="wait">
             {step === 'form' ? (
               <motion.form 
                key="form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleInitiateChange} 
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('profile.current_password')}</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563EB]" />
                      <input 
                        type="password"
                        required
                        value={passwords.current}
                        onChange={e => setPasswords({...passwords, current: e.target.value})}
                        className="w-full bg-[#EEF3FF]/50 border border-[#D8E3FF] rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('profile.new_password')}</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563EB]" />
                      <input 
                        type="password"
                        required
                        value={passwords.new}
                        onChange={e => setPasswords({...passwords, new: e.target.value})}
                        className="w-full bg-[#EEF3FF]/50 border border-[#D8E3FF] rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('profile.confirm_password')}</label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563EB]" />
                      <input 
                        type="password"
                        required
                        value={passwords.confirm}
                        onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                        className="w-full bg-[#EEF3FF]/50 border border-[#D8E3FF] rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center bg-red-50 py-3 rounded-xl border border-red-200">
                    {error}
                  </p>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#2563EB] text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-lg shadow-[#2563EB]/20 hover:bg-[#1d4ed8] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>{t('profile.change_password')}</span>
                    </>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.form 
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerifyAndSave}
                className="space-y-8"
              >
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-[#EEF3FF] rounded-full flex items-center justify-center mx-auto text-[#2563EB]">
                    <Mail className="w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-serif font-black text-slate-900 uppercase">Security Token Required</h3>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                      Enter the 6-digit verification code dispatched to <br/>
                      <span className="text-[#2563EB] font-black">{user?.email}</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <input 
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl py-6 text-center text-4xl font-serif font-black tracking-[0.5em] text-[#2563EB] focus:border-[#2563EB] outline-none transition-all"
                    placeholder="000000"
                  />
                  
                  {error && (
                    <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
                      {error}
                    </p>
                  )}

                  <p className="text-center">
                    <button 
                      type="button"
                      onClick={() => setStep('form')}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-[#2563EB] transition-colors"
                    >
                      Wait, go back
                    </button>
                  </p>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#2563EB] text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-lg shadow-[#2563EB]/20 hover:bg-[#1d4ed8] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>Verify & Commit Changes</span>
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </section>

        <div className="bg-white border border-[#D8E3FF] rounded-2xl p-8 space-y-4 shadow-sm">
           <div className="flex items-center gap-4 text-[#2563EB]">
              <ShieldCheck className="w-6 h-6" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em]">Institutional Protocol</h4>
           </div>
           <p className="text-xs text-slate-500 leading-relaxed">
             Password revisions require multi-layer authentication. Your institutional email serves as the primary verification vector. Ensure you maintain access to your email account at all times.
           </p>
        </div>
      </div>
    </Layout>
  );
}
