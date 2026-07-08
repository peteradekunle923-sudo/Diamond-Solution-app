import React, { useEffect, useState, useRef } from 'react';
import { collection, query, limit, onSnapshot, orderBy, doc, getDoc, setDoc, addDoc, where, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Award, Users, ArrowRight, Quote as QuoteIcon, Wallet, MessageSquare, Zap, Target, CheckCircle, Bell, Globe, Send, Facebook, Twitter, Instagram, MessageCircle, Clock, ShieldAlert } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, subDays, startOfDay, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import OnboardingTour from '../components/OnboardingTour';

export default function Dashboard() {
  const { profile: loggedInProfile, user: loggedInUser, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryUserId = searchParams.get('userId');

  const [targetProfile, setTargetProfile] = useState<any>(null);
  const [isViewingOther] = useState(false);

  useEffect(() => {
    // Viewing other users' dashboards has been disabled for privacy/security reasons
  }, []);

  const activeUserUid = loggedInUser?.uid;
  const activeProfile = loggedInProfile;

  const [quote, setQuote] = useState<any>(null);
  const [inactivityStats, setInactivityStats] = useState({
    daysSinceStudy: 0,
    monthlyGoalDays: 0
  });
  const [stats, setStats] = useState({
    attempted: 0,
    avgScore: 0,
    correct: 0,
    studyDuration: 0
  });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [showSocialMedia, setShowSocialMedia] = useState(false);
  const [showGoalPrompt, setShowGoalPrompt] = useState(false);
  const [dynamicSocialLinks, setDynamicSocialLinks] = useState<any[]>([]);
  
  const activationAttemptedRef = useRef(false);
  const goalCheckAttemptedRef = useRef(false);

  useEffect(() => {
    if (isViewingOther) return;
    if (!loggedInUser || !loggedInProfile) return;

    // Automated Activation: ensure every user has a referral code and is an affiliate
    if (loggedInUser?.uid && loggedInProfile && (!loggedInProfile.referralCode || loggedInProfile.affiliateStatus !== 'active')) {
       if (activationAttemptedRef.current) return;
       activationAttemptedRef.current = true;
       
       // Silent background activation
       loggedInUser.getIdToken().then((idToken) => {
         axios.post('/api/activate-affiliate', { userId: loggedInUser.uid }, {
           headers: { Authorization: `Bearer ${idToken}` }
         }).catch(async (error) => {
           console.warn("Dashboard auto-activation endpoint failed, trying client fallback...", error.message);
           try {
             const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
             const referralCode = loggedInProfile?.referralCode || `DS${randomPart}`;
             await setDoc(doc(db, 'users', loggedInUser.uid), {
               affiliateStatus: "active",
               isAffiliate: true,
               isPartner: true,
               referralCode: referralCode,
               activatedAt: new Date().toISOString(),
               updatedAt: new Date().toISOString()
             }, { merge: true });
           } catch (err: any) {
             console.error("Dashboard auto-activation client-side fallback failed:", err.message);
           }
         });
       }).catch((tokenErr) => {
         console.error("Failed to retrieve ID token for auto-activation:", tokenErr);
       });
    }
  }, [loggedInUser?.uid, loggedInProfile?.referralCode, loggedInProfile?.affiliateStatus, isViewingOther]);

  useEffect(() => {
    // Fetch system settings for social links
    const unsubSettings = onSnapshot(doc(db, 'settings', 'institutional_links'), (snap) => {
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
          { name: 'Telegram', icon: Send, url: 'https://t.me/diamondsolution', color: 'text-blue-400' },
          { name: 'WhatsApp', icon: MessageCircle, url: 'https://wa.me/2347065969567', color: 'text-emerald-500' },
          { name: 'Instagram', icon: Instagram, url: 'https://instagram.com/diamondsolution', color: 'text-pink-500' },
          { name: 'Facebook', icon: Facebook, url: 'https://facebook.com/diamondsolution', color: 'text-blue-600' },
          { name: 'X (Twitter)', icon: Twitter, url: 'https://x.com/diamondsolution', color: 'text-white' }
        ]);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/institutional_links'));

    const q = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'), limit(1));
    const unsubQuote = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setQuote(snapshot.docs[0].data());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'quotes');
    });

    if (!activeUserUid) return;

    // Set up a single real-time listener for all dailyPractice documents of this user
    const qPractice = query(
      collection(db, 'dailyPractice'),
      where('userId', '==', activeUserUid)
    );

    const unsubStats = onSnapshot(qPractice, (snapshot) => {
      const practiceDocs = snapshot.docs.map(doc => doc.data());

      // 1. Calculate Daily Stats (refreshed daily)
      const today = new Date().toISOString().split('T')[0];
      const todayDoc = practiceDocs.find(d => d.date === today);

      const attempted = todayDoc ? (todayDoc.attempted || 0) : 0;
      const correct = todayDoc ? (todayDoc.correct || 0) : 0;
      const studyDuration = todayDoc ? (todayDoc.studyDuration || 0) : 0;
      const avgScore = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

      setStats({
        attempted,
        correct,
        avgScore,
        studyDuration
      });

      // 2. Calculate Weekly Analytics Chart Data
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), i);
        return format(d, 'yyyy-MM-dd');
      }).reverse();

      const weekStats = dates.map(dateString => {
        const matchedDoc = practiceDocs.find(d => d.date === dateString);
        const durationSec = matchedDoc ? matchedDoc.studyDuration || 0 : 0;
        return {
          date: dateString,
          label: format(new Date(dateString), 'EEE'),
          minutes: Math.round(durationSec / 60)
        };
      });
      setWeeklyData(weekStats);

      // 3. Calculate Inactivity Stats
      let daysSince = 0;
      const activeDocs = practiceDocs.filter(d => (d.attempted || 0) > 0 || (d.studyDuration || 0) > 0);
      if (activeDocs.length > 0) {
        const datesArray = activeDocs.map(d => d.date);
        datesArray.sort();
        const latestDateStr = datesArray[datesArray.length - 1];
        
        const latestStudyDate = startOfDay(new Date(latestDateStr));
        const todayDate = startOfDay(new Date());
        daysSince = differenceInDays(todayDate, latestStudyDate);
        if (daysSince < 0) daysSince = 0;
      } else if (activeProfile?.lastStudyDate) {
        daysSince = differenceInDays(startOfDay(new Date()), startOfDay(new Date(activeProfile.lastStudyDate)));
        if (daysSince < 0) daysSince = 0;
      }

      // 4. Calculate monthly goal days
      const now = new Date();
      const firstDayOfMonth = startOfMonth(now);
      const firstDayStr = format(firstDayOfMonth, 'yyyy-MM-dd');
      
      let metGoalDays = 0;
      practiceDocs.forEach(d => {
        if (d.date >= firstDayStr && (d.attempted || 0) >= 50) {
          metGoalDays++;
        }
      });

      setInactivityStats({
        daysSinceStudy: daysSince,
        monthlyGoalDays: metGoalDays
      });

      // 5. Daily Goal Notification Check (Every 3 hours if < 50 questions)
      if (todayDoc && !isViewingOther && !goalCheckAttemptedRef.current) {
        const attempted = todayDoc.attempted || 0;
        const lastCheck = todayDoc.lastNotificationCheck ? new Date(todayDoc.lastNotificationCheck) : null;
        const hoursSinceLastCheck = lastCheck ? (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60) : 4;

        if (hoursSinceLastCheck >= 3 && attempted < 50) {
          goalCheckAttemptedRef.current = true;
          setShowGoalPrompt(true);
          const practiceRef = doc(db, 'dailyPractice', `${activeUserUid}_${today}`);
          updateDoc(practiceRef, { 
            lastNotificationCheck: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }).catch(err => console.error("Could not update lastNotificationCheck:", err));
          
          addDoc(collection(db, 'notifications'), {
            userId: activeUserUid,
            title: "Daily Practice Goal",
            body: `Scholar, you have only attempted ${attempted} questions today. Your daily goal is 50. Keep pushing!`,
            read: false,
            createdAt: new Date().toISOString()
          });
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dailyPractice');
    });

    return () => {
      unsubSettings();
      unsubQuote();
      unsubStats();
    };
  }, [activeUserUid, activeProfile?.lastStudyDate, isViewingOther]);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('greet.morning');
    if (hour < 17) return t('greet.afternoon');
    return t('greet.evening');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  };

  const weeklyTotalMins = weeklyData.reduce((acc, curr) => acc + curr.minutes, 0);
  const weeklyTotalStr = weeklyTotalMins >= 60 
    ? `${Math.floor(weeklyTotalMins / 60)}h ${weeklyTotalMins % 60}m` 
    : `${weeklyTotalMins}m`;

  return (
    <Layout>
      <OnboardingTour />
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {isViewingOther && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-blue-500/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h4 className="font-serif font-black text-blue-400 text-sm">Administrative Preview Mode</h4>
                <p className="text-[11px] text-gray-400 font-medium">
                  Viewing study telemetry stats & operational metrics for: <span className="text-gold font-bold">{activeProfile?.displayName || 'Scholar'}</span> ({activeProfile?.email || 'N/A'})
                </p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/admin-dashboard')}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 border border-blue-500/30 font-mono"
            >
              Return to Console
            </button>
          </div>
        )}

        {showGoalPrompt && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card-luxury p-6 bg-red-500/10 border-red-500/30 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-serif font-black text-text-1">{t('dashboard.goal')}</h4>
                <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-0.5">
                  {t('stats.attempted')}: {stats.attempted}. Goal: 50
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowGoalPrompt(false)}
              className="text-text-3 hover:text-text-1 text-xs font-black uppercase tracking-widest"
            >
              {t('general.cancel')}
            </button>
          </motion.div>
        )}

        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-4xl font-serif font-black text-text-1 tracking-tight">
              {getTimeGreeting()} {activeProfile?.username || activeProfile?.displayName?.split(' ')[0] || 'Scholar'} 👋
            </h2>
            <div className="inline-flex mt-2 items-center px-3 py-1 rounded-lg bg-gold/10 border border-gold/20 text-[10px] font-black text-gold uppercase tracking-widest">
              {activeProfile?.department ? t(`dept.${activeProfile.department}`) : 'Scholar'}
            </div>
          </div>
        </div>

        {/* Daily Quote Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative group cursor-pointer"
        >
          <div className="absolute inset-0 bg-gold/5 blur-3xl rounded-full -z-10 opacity-50 group-hover:opacity-100 transition-opacity" />
          <div className="card-luxury p-8 relative overflow-hidden bg-gradient-to-br from-navy-card to-navy-mid">
            <QuoteIcon className="absolute -top-4 -right-4 w-32 h-32 text-gold/5 -rotate-12" />
            <div className="space-y-4">
              <span className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">{t('dashboard.wisdom')}</span>
              <p className="text-xl font-serif font-black text-text-1 italic leading-relaxed">
                "{quote?.text || "The secret of getting ahead is getting started. Study hard today for a brighter tomorrow."}"
              </p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-[1px] bg-gold/30" />
                <p className="text-xs font-bold text-text-3 uppercase tracking-widest">
                  — {quote?.author || "HQ"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Inactivity Protocol Counters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="card-luxury p-6 bg-red-500/5 border-red-500/10 flex items-center justify-between group">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-navy-high border border-red-500/20 flex items-center justify-center text-red-500">
                   <Clock className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-2xl font-serif font-black text-text-1">{inactivityStats.daysSinceStudy} / 14</p>
                   <p className="text-[10px] font-black text-text-3 uppercase tracking-widest mt-1">{t('dashboard.study_limit')}</p>
                </div>
             </div>
             <div className="w-1.5 h-12 bg-red-500/20 rounded-full overflow-hidden">
                <div 
                  className="w-full bg-red-500 transition-all duration-1000" 
                  style={{ height: `${Math.min((inactivityStats.daysSinceStudy / 14) * 100, 100)}%` }} 
                />
             </div>
          </div>

          <div className="card-luxury p-6 bg-gold/5 border-gold/10 flex items-center justify-between group">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-navy-high border border-gold/20 flex items-center justify-center text-gold">
                   <Target className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-2xl font-serif font-black text-text-1">{inactivityStats.monthlyGoalDays} / 14</p>
                   <p className="text-[10px] font-black text-text-3 uppercase tracking-widest mt-1">{t('dashboard.question_goal')}</p>
                </div>
             </div>
             <div className="w-1.5 h-12 bg-gold/20 rounded-full overflow-hidden">
                <div 
                  className="w-full bg-gold transition-all duration-1000" 
                  style={{ height: `${Math.min((inactivityStats.monthlyGoalDays / 14) * 100, 100)}%` }} 
                />
             </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard icon={Target} value={stats.attempted} label={t('stats.attempted')} color="text-gold" />
          <StatCard icon={Zap} value={`${stats.avgScore}%`} label={t('stats.avg_score')} color="text-emerald-500" />
          <StatCard icon={CheckCircle} value={stats.correct} label={t('stats.correct')} color="text-blue-500" />
          <StatCard icon={Clock} value={formatDuration(stats.studyDuration)} label={t('quiz.time')} color="text-amber-500" />
        </div>

        {/* Weekly Analytics Chart */}
        <div className="card-luxury p-8 space-y-8 bg-navy-mid/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xl font-serif font-black text-text-1">{t('dashboard.progress')}</h3>
              <p className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">{t('dashboard.stats')}</p>
            </div>
            <div className="px-4 py-2 bg-gold/10 border border-gold/20 rounded-xl">
              <span className="text-[10px] font-black text-gold uppercase tracking-widest block mb-1">Weekly</span>
              <span className="text-xl font-serif font-black text-text-1">{weeklyTotalStr}</span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a2b8', fontSize: 10, fontWeight: 900 }}
                  dy={10}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(201, 147, 10, 0.05)' }}
                  contentStyle={{ 
                    backgroundColor: '#0a0a1a', 
                    border: '1px solid rgba(201, 147, 10, 0.2)',
                    borderRadius: '12px',
                    fontSize: '10px'
                  }}
                  itemStyle={{ color: '#C9930A', fontWeight: 900, textTransform: 'uppercase' }}
                  labelStyle={{ color: '#94a2b8', marginBottom: '4px' }}
                />
                <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                  {weeklyData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index === weeklyData.length - 1 ? '#C9930A' : 'rgba(201, 147, 10, 0.3)'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-[1px] bg-gold/30" />
            <h3 className="text-xs font-black text-text-3 uppercase tracking-[0.4em]">{t('dashboard.stats')}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <ActionButton 
              icon={BookOpen} 
              label={t('nav.study')} 
              sub={t('study.browse')} 
              onClick={() => navigate('/courses')} 
            />
            <ActionButton 
              icon={Award} 
              label="Hall of Fame" 
              sub="Leaderboards" 
              onClick={() => navigate('/leaderboard')} 
            />
            <ActionButton 
              icon={Users} 
              label={t('nav.affiliate')} 
              sub={t('dashboard.refer_earn')} 
              onClick={() => navigate('/affiliate')} 
            />
            <ActionButton 
              icon={Globe} 
              label="Social Media" 
              sub="Connect" 
              onClick={() => setShowSocialMedia(true)} 
            />
          </div>
        </div>

        {/* Social Media Modal */}
        <AnimatePresence>
          {showSocialMedia && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSocialMedia(false)}
                className="absolute inset-0 bg-navy/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="card-luxury w-full max-w-sm p-8 space-y-8 relative z-10 bg-navy-mid"
              >
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-serif font-black text-text-1">Institutional Handles</h3>
                  <p className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">Diamond Multi-Channel Protocol</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {dynamicSocialLinks.map((link) => (
                    <a 
                      key={link.name}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-luxury p-4 flex flex-col items-center gap-3 hover:bg-gold/5 transition-all text-center group"
                    >
                      <div className={cn("w-12 h-12 rounded-2xl bg-navy-high border border-gold/10 flex items-center justify-center group-hover:scale-110 transition-all", link.color)}>
                        <link.icon className="w-6 h-6" />
                       </div>
                      <span className="text-[9px] font-black text-text-3 group-hover:text-gold uppercase tracking-widest">{link.name}</span>
                    </a>
                  ))}
                </div>

                <button 
                  onClick={() => setShowSocialMedia(false)}
                  className="w-full bg-navy-high border border-gold/10 text-text-3 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:text-gold transition-all"
                >
                  {t('general.cancel')}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Referral Card - Visible for everyone */}
        <div 
          onClick={() => navigate('/affiliate')}
          className="card-luxury p-8 bg-gradient-to-r from-gold via-gold-light to-gold-pale cursor-pointer group hover:scale-[1.01] transition-all duration-500 shadow-2xl shadow-gold/20"
        >
          <div className="flex items-center justify-between gap-8">
            <div className="space-y-2">
              <h4 className="text-2xl font-serif font-black text-navy tracking-tight">{t('dashboard.refer_earn')}</h4>
              <p className="text-navy/70 text-sm font-medium">{t('dashboard.refer_sub')}</p>
              <div className="inline-block mt-4 px-6 py-2 bg-navy rounded-xl font-black text-gold tracking-[0.4em] text-lg font-mono">
                {activeProfile?.referralCode || `DS${activeUserUid?.substring(0, 6).toUpperCase() || 'REF'}`}
              </div>
            </div>
            <div className="hidden sm:flex w-24 h-24 bg-navy/10 rounded-full items-center justify-center group-hover:rotate-12 transition-transform">
              <Users className="w-12 h-12 text-navy" />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon: Icon, value, label, color }: any) {
  return (
    <div className="card-luxury p-6 group hover:border-gold/30 transition-all bg-navy-mid/40">
      <div className="space-y-4">
        <div className={cn("w-10 h-10 rounded-xl bg-navy-high flex items-center justify-center border border-gold/10", color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-3xl font-serif font-black text-text-1 tracking-tight">{value}</p>
          <p className="text-[10px] font-black text-text-3 uppercase tracking-widest mt-1">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, sub, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="card-luxury p-6 flex flex-col items-start gap-4 text-left group hover:bg-gold/5 transition-all w-full"
    >
      <div className="w-12 h-12 rounded-2xl bg-navy-high border border-gold/10 flex items-center justify-center text-gold group-hover:scale-110 group-hover:bg-gold group-hover:text-navy transition-all duration-500">
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="font-serif text-lg font-black text-text-1 leading-none">{label}</p>
        <p className="text-[10px] font-black text-text-3 uppercase tracking-widest mt-2">{sub}</p>
      </div>
    </button>
  );
}
