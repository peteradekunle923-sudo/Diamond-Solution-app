import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, User, MessageCircle, TrendingUp, ShieldAlert, Send, Shield, Layers } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { sendEmailVerification } from 'firebase/auth';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isVerified, profile } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  const pageTitles: Record<string, string> = {
    '/dashboard': t('nav.home'),
    '/courses': t('nav.study'),
    '/affiliate': t('nav.affiliate'),
    '/chat': t('nav.chat'),
    '/profile': t('nav.profile'),
    '/admin': t('nav.admin'),
  };

  const currentTitle = pageTitles[location.pathname] || t('nav.study');

  const handleResend = async () => {
    if (!user || resending) return;
    setResending(true);
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      await axios.post('/api/send-otp', {
        email: user.email,
        token: otp,
        action: 'registration'
      });
      
      alert(t('auth.otpSent') + ` Token: ${otp}`);
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (error) {
      console.error(error);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-navy pb-24">
      {/* Top Bar */}
      <header className={cn(
        "sticky h-16 bg-navy-mid border-b border-gold/10 px-6 flex items-center justify-between z-30 shadow-lg",
        "top-0"
      )}>
        <div className="flex flex-col">
          <h1 className="text-xl font-serif font-black text-text-1 tracking-tight">
            {currentTitle}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <NavLink to="/chat" className="w-10 h-10 rounded-xl bg-navy-high border border-gold/10 flex items-center justify-center text-gold-light hover:bg-gold/10 transition-all">
            <MessageCircle className="w-5 h-5" />
          </NavLink>
          <NavLink to="/profile" className="w-10 h-10 rounded-full diamond-gradient flex items-center justify-center font-black text-navy text-xs shadow-lg shadow-gold/20">
            DS
          </NavLink>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-navy-mid border-t border-gold/10 flex items-center justify-around px-2 z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
        <Tab icon={Home} label={t('nav.home')} to="/dashboard" />
        <Tab icon={Layers} label={t('nav.study')} to="/courses" />
        <Tab icon={TrendingUp} label={t('nav.affiliate')} to="/affiliate" />
        <Tab icon={MessageCircle} label={t('nav.chat')} to="/chat" />
        <Tab icon={User} label={t('nav.profile')} to="/profile" />
        {isAdmin && <Tab icon={Shield} label={t('nav.admin')} to="/admin" />}
      </nav>
    </div>
  );
}

function Tab({ icon: Icon, label, to }: { icon: any, label: string, to: string }) {
  const { t } = useLanguage();
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => cn(
        "flex flex-col items-center justify-center relative flex-1 h-full transition-all group",
        isActive ? "text-gold" : "text-text-3 hover:text-text-2"
      )}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          {isActive && (
            <motion.div 
              layoutId="tab-dot"
              className="absolute top-2 w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(201,147,10,0.8)]"
            />
          )}
          <Icon className={cn("w-6 h-6 transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-105")} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-1.5">{label}</span>
        </>
      )}
    </NavLink>
  );
}
