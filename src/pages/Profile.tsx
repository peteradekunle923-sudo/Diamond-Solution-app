import React from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, doc, setDoc, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { User, Shield, LogOut, ChevronRight, Bell, CreditCard, HelpCircle, Gift } from 'lucide-react';

export default function Profile() {
  const { user, profile, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    sessionStorage.removeItem('diamond_onboard_shown');
    navigate('/login');
  };

  return (
    <Layout>
      <div className="px-6 py-12 space-y-12">
        <header className="flex flex-col items-center space-y-6">
           <div className="relative">
             <div className="w-28 h-28 diamond-gradient diamond-mark flex items-center justify-center p-1 shadow-2xl shadow-gold/30">
               <div className="w-full h-full bg-navy/20 diamond-mark flex items-center justify-center backdrop-blur-md">
                  <User className="w-12 h-12 text-navy" />
               </div>
             </div>
             <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-navy-mid rounded-xl border border-gold/30 flex items-center justify-center shadow-2xl">
                <Shield className="w-5 h-5 text-gold" />
             </div>
           </div>
           <div className="text-center space-y-2">
              <h2 className="text-3xl font-serif font-black text-text-1 tracking-tight">{profile?.displayName || t('profile.defaultName')}</h2>
              <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em]">{user?.email}</p>
           </div>
           <div className="bg-gold text-navy px-5 py-1.5 rounded-lg flex items-center space-x-2 shadow-lg shadow-gold/20">
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">{profile?.role || t('profile.defaultRole')}</span>
           </div>
        </header>

        <section className="space-y-4">
           <div className="card-luxury p-8 space-y-6 bg-navy-mid/60 border-gold/10">
              <div className="flex items-center gap-4">
                 <div className="w-1 h-8 bg-gold rounded-full" />
                 <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em]">{t('profile.verification')}</h3>
              </div>
              <div className="grid gap-6">
                 <div className="space-y-1">
                    <p className="text-[8px] font-black text-text-3 uppercase tracking-widest">{t('profile.institution')}</p>
                    <p className="text-sm font-bold text-text-1 tracking-tight">{profile?.institutionalName || t('profile.awaiting')}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[8px] font-black text-text-3 uppercase tracking-widest">{t('profile.contact')}</p>
                    <p className="text-sm font-bold text-text-1 tracking-tight font-mono">{profile?.phone || t('profile.notConfigured')}</p>
                 </div>
              </div>
           </div>
        </section>

        <section className="space-y-5">
           <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em] px-2">{t('profile.settings')}</h3>
           <div className="card-luxury divide-y divide-gold/10 shadow-2xl shadow-black/20">
               <NavItem icon={Bell} label={t('profile.notifications')} to="/notifications" />
               <NavItem icon={Shield} label={t('profile.account')} to="/account" border={false} />
           </div>
        </section>

        <section className="space-y-5">
           <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em] px-2">{t('profile.partnerProgram')}</h3>
           <div className="card-luxury divide-y divide-gold/10 border-gold/20 shadow-2xl shadow-black/20">
               <NavItem icon={Gift} label={t('profile.affiliateRepo')} to="/affiliate" />
               <NavItem icon={HelpCircle} label={t('profile.support')} to="/chat" border={false} />
           </div>
        </section>

        {isAdmin && (
          <button 
            onClick={() => navigate('/admin')}
            className="w-full bg-gold p-6 rounded-2xl text-navy font-black text-xs uppercase tracking-[0.3em] flex items-center justify-between shadow-2xl shadow-gold/20 active:scale-[0.98] transition-all group"
          >
            <div className="flex items-center space-x-5">
              <Shield className="w-6 h-6 text-navy" />
              <span>{t('profile.admin')}</span>
            </div>
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        )}



        <button 
           onClick={handleLogout}
           className="w-full bg-red-500/10 p-6 rounded-2xl text-red-500 font-black text-xs uppercase tracking-[0.3em] flex items-center justify-center space-x-4 border border-red-500/20 hover:bg-red-500/20 transition-all active:scale-[0.98]"
        >
          <LogOut className="w-5 h-5" />
          <span>{t('nav.logout')}</span>
        </button>

        <div className="text-center pt-8">
           <p className="text-[9px] text-text-3 font-black uppercase tracking-[0.5em] opacity-50">Diamond Solution Academic v2.0</p>
        </div>
      </div>
    </Layout>
  );
}

function NavItem({ icon: Icon, label, to, border = true }: { icon: any, label: string, to: string, border?: boolean }) {
  return (
    <Link 
      to={to} 
      className={`flex items-center justify-between p-6 hover:bg-gold/5 transition-all group ${border ? 'border-b border-gold/10' : ''}`}
    >
      <div className="flex items-center space-x-5">
        <div className="w-12 h-12 bg-navy-mid flex items-center justify-center rounded-xl border border-gold/10 group-hover:border-gold/30 transition-all">
           <Icon className="w-6 h-6 text-text-3 group-hover:text-gold transition-colors" />
        </div>
        <span className="text-sm font-bold text-text-2 group-hover:text-text-1 tracking-tight transition-colors">{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-gold/20 group-hover:text-gold transition-all" />
    </Link>
  );
}
