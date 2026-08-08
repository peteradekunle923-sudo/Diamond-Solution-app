import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, User, MessageCircle, TrendingUp, ShieldAlert, Send, Shield, Layers } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { sendEmailVerification } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DiamondLogo } from './DiamondLogo';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isVerified, profile } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      return onSnapshot(doc(db, 'chats', user.uid), (doc) => {
        if (doc.exists()) {
          setUnreadCount(doc.data().unreadCount || 0);
        } else {
          setUnreadCount(0);
        }
      });
    }
  }, [user]);

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
      await axios.post('/api/otp/request', {
        userId: user.uid,
        email: user.email,
        purpose: 'registration'
      });
      
      alert(t('auth.otpSent') + `. Please check your registered email.`);
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (error: any) {
      console.error(error);
      const errMsg = error.response?.data?.error || error.message;
      alert(`Failed to resend code: ${errMsg}`);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-navy pb-24">
      {/* Top Bar */}
      <header className={cn(
        "sticky h-16 bg-white/90 backdrop-blur-md border-b border-[#D8E3FF] px-6 flex items-center justify-between z-30 shadow-xs",
        "top-0"
      )}>
        <div className="flex items-center gap-3">
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <DiamondLogo size="sm" />
          </NavLink>
          <h1 className="text-xl font-serif font-black text-text-1 tracking-tight">
            {currentTitle}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <NavLink to="/chat" className="w-10 h-10 rounded-2xl bg-[#EEF3FF] border border-[#D8E3FF] flex items-center justify-center text-gold hover:bg-[#D8E3FF] transition-all relative shadow-xs">
            <MessageCircle className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce shadow-md">
                {unreadCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/profile" className="w-10 h-10 rounded-full diamond-gradient flex items-center justify-center font-black text-white text-xs shadow-md shadow-blue-500/20">
            <User className="w-5 h-5" />
          </NavLink>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* Floating Pill Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-4 left-4 right-4 max-w-md mx-auto h-16 bg-[#2563EB] rounded-full border border-blue-400/30 flex items-center justify-around px-3 z-50 shadow-xl shadow-blue-600/30">
        <Tab icon={Home} label={t('nav.home')} to="/dashboard" />
        <Tab icon={Layers} label={t('nav.study')} to="/courses" />
        <Tab icon={MessageCircle} label={t('nav.chat')} to="/chat" badge={unreadCount} />
        <Tab icon={User} label={t('nav.profile')} to="/profile" />
        {isAdmin && <Tab icon={Shield} label={t('nav.admin')} to="/admin" />}
      </nav>
    </div>
  );
}

function Tab({ icon: Icon, label, to, badge }: { icon: any, label: string, to: string, badge?: number }) {
  const { t } = useLanguage();
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => cn(
        "flex flex-col items-center justify-center relative flex-1 h-full transition-all group py-1",
        isActive ? "text-white" : "text-white/65 hover:text-white"
      )}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <div className={cn("relative p-2 rounded-full transition-all duration-300", isActive ? "bg-white/20 scale-105" : "group-hover:scale-105")}>
            <Icon className="w-5 h-5" />
            {badge !== undefined && badge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center animate-bounce shadow-md">
                {badge}
              </span>
            )}
          </div>
          <span className="text-[9px] font-bold tracking-tight mt-0.5">{label}</span>
        </>
      )}
    </NavLink>
  );
}
