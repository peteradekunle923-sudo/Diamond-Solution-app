import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { usePaystackPayment } from 'react-paystack';
import { ShieldAlert, CreditCard, Loader2, Globe, Clock, Banknote } from 'lucide-react';
import { motion } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export default function Reactivation() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  
  const isNigerian = profile?.country === 'Nigeria' || !profile?.country; // Default to Nigeria if not set
  const feeNGN = 1000;
  const feeUSD = 2;
  const amount = isNigerian ? feeNGN : feeUSD;
  const currency = isNigerian ? 'NGN' : 'USD';

  const config = {
    reference: `reactivate_${new Date().getTime()}_${user?.uid}`,
    email: user?.email || '',
    amount: isNigerian ? feeNGN * 100 : Math.round(feeUSD * 1500 * 100), // Approximate USD to NGN for Paystack if it doesn't support USD directly in this setup
    publicKey: 'pk_live_0000000000000000000000000000000000000000', // Mock key
  };

  const onSuccess = async (reference: any) => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      await setDoc(doc(db, 'users', user!.uid), {
        status: 'active',
        suspensionReason: null,
        reactivatedAt: now,
        lastStudyDate: now // Reset study date to now
      }, { merge: true });
      
      // Log payment
      await setDoc(doc(db, 'payments', reference.reference), {
        userId: user?.uid,
        email: user?.email,
        amount: isNigerian ? feeNGN : feeUSD,
        currency,
        purpose: 'reactivation',
        status: 'success',
        reference: reference.reference,
        createdAt: now
      });

      window.location.href = '/dashboard';
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  const onClose = () => {
    console.log('Payment closed');
  };

  const initializePayment = usePaystackPayment(config);

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(201,147,10,0.05)_0%,transparent_70%)]" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-luxury max-w-md w-full p-10 space-y-10 relative overflow-hidden"
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-500/10 blur-[60px] rounded-full" />
        
        <header className="text-center space-y-6">
          <div className="w-24 h-24 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/30">
            <ShieldAlert className="w-12 h-12 text-red-500" />
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-serif font-black text-text-1 uppercase tracking-tight leading-none">
              {t('profile.suspension')}
            </h2>
            <div className="w-20 h-1 bg-red-500/30 mx-auto rounded-full" />
            <p className="text-xs text-text-3 font-medium leading-relaxed max-w-[280px] mx-auto uppercase tracking-widest opacity-80">
              Institutional access has been revoked due to inactivity protocol violation.
            </p>
          </div>
        </header>

        <section className="space-y-6">
           <div className="bg-navy-high/60 border border-gold/10 p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black text-text-3 uppercase tracking-widest">Protocol Fine</span>
                 <span className="text-2xl font-serif font-black text-gold">
                   {isNigerian ? '₦' : '$'}{amount}
                 </span>
              </div>
              <div className="h-[1px] bg-gold/10" />
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <p className="text-[8px] font-black text-text-3 uppercase tracking-widest flex items-center gap-1">
                      <Globe className="w-3 h-3 text-gold" /> Region
                    </p>
                    <p className="text-xs font-bold text-text-1">{profile?.country || 'Nigeria'}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[8px] font-black text-text-3 uppercase tracking-widest flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gold" /> Grace Period
                    </p>
                    <p className="text-xs font-bold text-text-1">Expired</p>
                 </div>
              </div>
           </div>

           <div className="space-y-4">
              <button 
                onClick={() => initializePayment({onSuccess, onClose})}
                disabled={loading}
                className="w-full bg-gold text-navy py-6 rounded-2xl font-black text-sm uppercase tracking-[0.4em] shadow-[0_20px_50px_rgba(201,147,10,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4"
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
              
              <div className="flex items-center justify-center gap-4 text-text-3 opacity-50">
                 <Banknote className="w-4 h-4" />
                 <span className="text-[8px] font-black uppercase tracking-[0.5em]">Secured Institutional Transaction</span>
              </div>
           </div>
        </section>

        <footer className="text-center">
           <p className="text-[10px] text-text-3 font-black uppercase tracking-widest opacity-60">
             Log: {profile?.suspensionReason || 'General Inactivity'}
           </p>
        </footer>
      </motion.div>
    </div>
  );
}
