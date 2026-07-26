import React from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, doc, setDoc, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { User, Shield, LogOut, ChevronRight, Bell, CreditCard, HelpCircle, Gift, History } from 'lucide-react';

export default function Profile() {
  const { user, profile, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (user) {
      try {
        const { SessionService } = await import('../lib/SessionService');
        await SessionService.clearSession(user.uid);
      } catch (e) {
        console.warn("Session clean up failed on logout:", e);
      }
    }
    await signOut(auth);
    sessionStorage.removeItem('diamond_onboard_shown');
    navigate('/login');
  };

  return (
    <Layout>
      <div className="px-6 py-8 space-y-8 max-w-2xl mx-auto">
        <header className="flex flex-col items-center space-y-4 bg-white p-8 rounded-3xl border border-[#D8E3FF] shadow-xs">
           <div className="relative">
             <div className="w-24 h-24 bg-[#2563EB] rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20">
               <User className="w-12 h-12 text-white" />
             </div>
             <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-white rounded-xl border border-[#D8E3FF] flex items-center justify-center shadow-xs">
                <Shield className="w-5 h-5 text-[#2563EB]" />
             </div>
           </div>
           <div className="text-center space-y-1">
              <h2 className="text-2xl font-serif font-black text-text-1 tracking-tight">{profile?.displayName || t('profile.defaultName')}</h2>
              {profile?.username && (
                <p className="text-sm font-bold text-[#2563EB] font-mono tracking-wide">@{profile.username}</p>
              )}
              <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em]">{user?.email}</p>
           </div>
           <div className="bg-[#EEF3FF] text-[#2563EB] border border-[#D8E3FF] px-4 py-1.5 rounded-xl flex items-center space-x-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">{profile?.role || t('profile.defaultRole')}</span>
           </div>
        </header>

        <section className="space-y-4">
           <div className="card-luxury p-6 sm:p-8 space-y-6 bg-white border border-[#D8E3FF] rounded-3xl shadow-xs">
              <div className="flex items-center gap-4">
                 <div className="w-1 h-6 bg-[#2563EB] rounded-full" />
                 <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em]">{t('profile.verification')}</h3>
              </div>
              <div className="grid gap-4">
                 <div className="space-y-1 bg-[#EEF3FF] p-4 rounded-2xl border border-[#D8E3FF]">
                    <p className="text-[8px] font-black text-text-3 uppercase tracking-widest">{t('profile.institution')}</p>
                    <p className="text-sm font-bold text-text-1 tracking-tight">{profile?.institutionalName || t('profile.awaiting')}</p>
                 </div>
                 <div className="space-y-1 bg-[#EEF3FF] p-4 rounded-2xl border border-[#D8E3FF]">
                    <p className="text-[8px] font-black text-text-3 uppercase tracking-widest">{t('profile.contact')}</p>
                    <p className="text-sm font-bold text-text-1 tracking-tight font-mono">{profile?.phone || t('profile.notConfigured')}</p>
                 </div>
              </div>
           </div>
        </section>

        <section className="space-y-3">
           <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em] px-2">{t('profile.settings')}</h3>
           <div className="bg-white rounded-3xl border border-[#D8E3FF] divide-y divide-[#D8E3FF] shadow-xs overflow-hidden">
               <NavItem icon={Bell} label={t('profile.notifications')} to="/notifications" />
               <NavItem icon={History} label={t('profile.activityLog')} to="/activity-log" />
               <NavItem icon={Shield} label={t('profile.account')} to="/account" border={false} />
           </div>
        </section>

        <section className="space-y-3">
           <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em] px-2">{t('profile.partnerProgram')}</h3>
           <div className="bg-white rounded-3xl border border-[#D8E3FF] divide-y divide-[#D8E3FF] shadow-xs overflow-hidden">
               <NavItem icon={Gift} label={t('profile.affiliateRepo')} to="/affiliate" />
               <NavItem icon={HelpCircle} label={t('profile.support')} to="/chat" border={false} />
           </div>
        </section>

        {isAdmin && (
          <button 
            onClick={() => navigate('/admin')}
            className="w-full bg-[#2563EB] p-5 sm:p-6 rounded-2xl text-white font-black text-xs uppercase tracking-[0.2em] flex items-center justify-between shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all group cursor-pointer"
          >
            <div className="flex items-center space-x-4">
              <Shield className="w-5 h-5 text-white" />
              <span>{t('profile.admin')}</span>
            </div>
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        )}

        <button 
           onClick={handleLogout}
           className="w-full bg-red-50 p-5 sm:p-6 rounded-2xl text-red-600 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center space-x-3 border border-red-200 hover:bg-red-100 transition-all active:scale-[0.98] cursor-pointer"
        >
          <LogOut className="w-5 h-5" />
          <span>{t('nav.logout')}</span>
        </button>

        <div className="text-center pt-4">
           <p className="text-[9px] text-text-3 font-black uppercase tracking-[0.4em] opacity-50">Diamond Solution Academic v2.0</p>
        </div>
      </div>
    </Layout>
  );
}

function NavItem({ icon: Icon, label, to, border = true }: { icon: any, label: string, to: string, border?: boolean }) {
  return (
    <Link 
      to={to} 
      className={`flex items-center justify-between p-5 hover:bg-[#EEF3FF] transition-all group ${border ? 'border-b border-[#D8E3FF]' : ''}`}
    >
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-[#EEF3FF] flex items-center justify-center rounded-xl border border-[#D8E3FF] group-hover:border-blue-300 transition-all">
           <Icon className="w-5 h-5 text-text-2 group-hover:text-[#2563EB] transition-colors" />
        </div>
        <span className="text-sm font-bold text-text-1 group-hover:text-[#2563EB] tracking-tight transition-colors">{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-text-3 group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}
