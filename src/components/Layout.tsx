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

export default function Layout({ children, className }: { children: React.ReactNode; className?: string }) {
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
    '/leaderboard': 'Rank',
    '/affiliate': t('nav.affiliate'),
    '/chat': t('nav.chat'),
    '/profile': t('nav.profile'),
    '/admin': t('nav.admin'),
  };

  const currentTitle = pageTitles[location.pathname] || t('nav.study');

  return (
    <div className={cn("flex flex-col min-h-screen bg-[#F8F9FB] pb-24", className)}>
      {/* Top Bar */}
      <header className={cn(
        "sticky h-16 bg-white/95 backdrop-blur-xl border-b border-[#DDE5F5] px-4 sm:px-6 flex items-center justify-between z-30 shadow-xs top-0"
      )}>
        <div className="flex items-center gap-3">
          <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <DiamondLogo size="sm" layout="icon" />
          </NavLink>
          <div className="h-5 w-[1px] bg-[#DDE5F5]" />
          <h1 className="text-lg sm:text-xl font-serif font-black text-[#0B1E3D] tracking-tight">
            {currentTitle}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <NavLink 
            to="/chat" 
            className="w-10 h-10 rounded-2xl bg-[#EEF3FF] hover:bg-[#E0EAFF] border border-[#D4E0FC] flex items-center justify-center text-[#1B3FA0] transition-all relative shadow-xs active:scale-95 cursor-pointer"
            title="Chat"
          >
            <MessageCircle className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-[#D4AF37] text-[#0B1E3D] text-[10px] font-black rounded-full flex items-center justify-center animate-bounce shadow-md border border-amber-200">
                {unreadCount}
              </span>
            )}
          </NavLink>
          <NavLink 
            to="/profile" 
            className="w-10 h-10 rounded-full bg-[#1B3FA0] hover:bg-[#143282] flex items-center justify-center font-black text-white text-xs shadow-md shadow-[#1B3FA0]/20 hover:scale-105 transition-transform active:scale-95 cursor-pointer"
            title="Profile"
          >
            <User className="w-5 h-5" />
          </NavLink>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* Floating Pill Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto h-16 bg-[#0B1E3D] rounded-full border border-[#1E3B6E] flex items-center justify-around px-2 z-50 shadow-2xl shadow-[#0B1E3D]/40 backdrop-blur-lg">
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
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => cn(
        "flex flex-col items-center justify-center relative flex-1 h-full transition-all group py-1 cursor-pointer",
        isActive ? "text-white font-bold" : "text-slate-300 hover:text-white"
      )}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <div className={cn("relative p-2 rounded-full transition-all duration-300 flex items-center justify-center", isActive ? "bg-[#1B3FA0] text-white scale-105 shadow-md shadow-[#1B3FA0]/40" : "group-hover:scale-105")}>
            <Icon className="w-5 h-5" />
            {badge !== undefined && badge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#D4AF37] text-[#0B1E3D] text-[8px] font-black rounded-full flex items-center justify-center animate-bounce shadow-md">
                {badge}
              </span>
            )}
          </div>
          <span className="text-[9px] tracking-tight mt-0.5">{label}</span>
        </>
      )}
    </NavLink>
  );
}
