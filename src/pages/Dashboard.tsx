import React, { useEffect, useState, useRef } from 'react';
import { collection, query, limit, onSnapshot, orderBy, doc, getDoc, setDoc, addDoc, where, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Award, Users, ArrowRight, Quote as QuoteIcon, 
  Wallet, MessageSquare, Zap, Target, CheckCircle, Bell, 
  Globe, Send, Facebook, Twitter, Instagram, MessageCircle, 
  Clock, ShieldAlert, Search, Lock, CheckCircle2, ChevronRight,
  Flame, TrendingUp, Sparkles, Building2
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { format, startOfWeek, endOfWeek, subDays, eachDayOfInterval } from 'date-fns';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import OnboardingTour from '../components/OnboardingTour';
import { DEPARTMENTS } from '../constants';

interface CourseSearchResult {
  id: string;
  title: string;
  department: string;
  level: string;
  questionCount?: number;
  hasAccess: boolean;
}

export default function Dashboard() {
  const { profile: loggedInProfile, user: loggedInUser, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const activeUserUid = loggedInUser?.uid;
  const activeProfile = loggedInProfile;

  const [quote, setQuote] = useState<any>(null);
  const [stats, setStats] = useState({
    attempted: 0,
    avgScore: 0,
    correct: 0,
    studyDuration: 0
  });

  // 7-day practice stats for bar chart & daily breakdown
  const [weeklyStats, setWeeklyStats] = useState<Array<{
    date: string;
    dayLabel: string;
    fullDate: string;
    studyDurationMins: number;
    studyDurationSecs: number;
    attempted: number;
    correct: number;
    accuracy: number;
  }>>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  // Last Activity Course state
  const [lastActivity, setLastActivity] = useState<{
    courseId: string;
    courseTitle: string;
    department: string;
    level: string;
    attempted: number;
    totalQuestions: number;
    accuracy: number;
  } | null>(null);

  // User's department access
  const [userPaidDepts, setUserPaidDepts] = useState<string[]>([]);
  const [facultiesList, setFacultiesList] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'faculties'), (snap) => {
      const active = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((f: any) => !f.isDeleted);
      setFacultiesList(active);
    });
    return () => unsub();
  }, []);

  // Department-based Top This Week Leaderboard state
  const [topWeekScholars, setTopWeekScholars] = useState<Array<{
    userId: string;
    userName: string;
    points: number;
    accuracy: number;
    attempted: number;
    initials: string;
  }>>([]);
  const [topWeekLoading, setTopWeekLoading] = useState(true);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Social handles modal
  const [showSocialMedia, setShowSocialMedia] = useState(false);
  const [dynamicSocialLinks, setDynamicSocialLinks] = useState<any[]>([]);
  
  const activationAttemptedRef = useRef(false);

  // Auto-close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch all courses for live search
  useEffect(() => {
    const qCourses = query(collection(db, 'courses'));
    const unsub = onSnapshot(qCourses, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => !c.isDeleted);
      setAllCourses(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));

    return () => unsub();
  }, []);

  // Fetch user paid departments
  useEffect(() => {
    if (!activeUserUid) return;
    const qPayments = query(
      collection(db, 'payments'),
      where('userId', '==', activeUserUid),
      where('status', '==', 'success')
    );
    const unsub = onSnapshot(qPayments, (snap) => {
      const depts: string[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        const dept = data.dept_name || data.department;
        if (dept && !depts.includes(dept)) depts.push(dept);
      });
      if (activeProfile?.department && !depts.includes(activeProfile.department)) {
        depts.push(activeProfile.department);
      }
      setUserPaidDepts(depts);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));

    return () => unsub();
  }, [activeUserUid, activeProfile?.department]);

  // Handle Search Input Logic (Across all matching levels, with access tags)
  useEffect(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const matches = allCourses.filter(course => {
      const title = (course.title || '').toLowerCase();
      const dept = (course.department || '').toLowerCase();
      const level = (course.level || '').toLowerCase();
      const code = (course.code || '').toLowerCase();
      const objectives = (course.objectives || '').toLowerCase();

      return title.includes(trimmed) || 
             dept.includes(trimmed) || 
             level.includes(trimmed) || 
             code.includes(trimmed) ||
             objectives.includes(trimmed);
    }).map(course => {
      const dept = course.department || '';
      const hasAccess = isAdmin || userPaidDepts.some(d => {
        const cleanD = d.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanCourseD = dept.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanD.includes(cleanCourseD) || cleanCourseD.includes(cleanD);
      });

      return {
        id: course.id,
        title: course.title || 'Untitled Course',
        department: course.department || 'General',
        level: course.level || '200L',
        questionCount: course.questionCount,
        hasAccess: !!hasAccess
      };
    }).slice(0, 10);

    setSearchResults(matches);
  }, [searchQuery, allCourses, userPaidDepts, isAdmin]);

  // Automated Affiliate Activation
  useEffect(() => {
    if (!loggedInUser || !loggedInProfile) return;

    if (loggedInUser?.uid && loggedInProfile && (!loggedInProfile.referralCode || loggedInProfile.affiliateStatus !== 'active')) {
       if (activationAttemptedRef.current) return;
       activationAttemptedRef.current = true;
       
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
  }, [loggedInUser?.uid, loggedInProfile?.referralCode, loggedInProfile?.affiliateStatus]);

  // Listen for Institutional Social Links & Wisdom Quote
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'institutional_links'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const links = [];
        if (data.telegram) links.push({ name: 'Telegram', icon: Send, url: data.telegram, color: 'text-[#229ED9]' });
        if (data.whatsapp) links.push({ name: 'WhatsApp', icon: MessageCircle, url: data.whatsapp, color: 'text-emerald-500' });
        if (data.facebook) links.push({ name: 'Facebook', icon: Facebook, url: data.facebook, color: 'text-blue-600' });
        if (data.twitter) links.push({ name: 'X (Twitter)', icon: Twitter, url: data.twitter, color: 'text-white' });
        if (data.instagram) links.push({ name: 'Instagram', icon: Instagram, url: data.instagram, color: 'text-pink-500' });
        
        setDynamicSocialLinks(links);
      } else {
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

    return () => {
      unsubSettings();
      unsubQuote();
    };
  }, []);

  // Listen to User's Daily Practice Stats
  useEffect(() => {
    if (!activeUserUid) return;

    const qPractice = query(
      collection(db, 'dailyPractice'),
      where('userId', '==', activeUserUid)
    );

    const unsubStats = onSnapshot(qPractice, (snapshot) => {
      const practiceDocs = snapshot.docs.map(doc => doc.data());

      let totalAttempted = 0;
      let totalCorrect = 0;
      let totalDuration = 0;

      const dateMap: Record<string, { attempted: number; correct: number; duration: number }> = {};

      practiceDocs.forEach(d => {
        const attempted = d.attempted || 0;
        const correct = d.correct || 0;
        const duration = d.studyDuration || 0;

        totalAttempted += attempted;
        totalCorrect += correct;
        totalDuration += duration;

        if (d.date) {
          if (!dateMap[d.date]) {
            dateMap[d.date] = { attempted: 0, correct: 0, duration: 0 };
          }
          dateMap[d.date].attempted += attempted;
          dateMap[d.date].correct += correct;
          dateMap[d.date].duration += duration;
        }
      });

      const avgScore = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

      setStats({
        attempted: totalAttempted,
        correct: totalCorrect,
        avgScore,
        studyDuration: totalDuration
      });

      // Construct last 7 days (today and past 6 days in chronological order)
      const now = new Date();
      const last7DaysInterval = eachDayOfInterval({
        start: subDays(now, 6),
        end: now
      });

      const weekly = last7DaysInterval.map((dayDate) => {
        const dateStr = format(dayDate, 'yyyy-MM-dd');
        const dayLabel = format(dayDate, 'EEE'); // Mon, Tue, etc.
        const fullDate = format(dayDate, 'MMM d, yyyy');
        const dayData = dateMap[dateStr] || { attempted: 0, correct: 0, duration: 0 };
        
        const dayAttempted = dayData.attempted;
        const dayCorrect = dayData.correct;
        const dayDuration = dayData.duration;
        const dayAccuracy = dayAttempted > 0 ? Math.round((dayCorrect / dayAttempted) * 100) : 0;
        // Convert duration to minutes (rounded to 1 decimal place)
        const studyDurationMins = Math.round((dayDuration / 60) * 10) / 10;

        return {
          date: dateStr,
          dayLabel,
          fullDate,
          studyDurationMins,
          studyDurationSecs: dayDuration,
          attempted: dayAttempted,
          correct: dayCorrect,
          accuracy: dayAccuracy
        };
      });

      setWeeklyStats(weekly);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dailyPractice');
    });

    return () => unsubStats();
  }, [activeUserUid]);

  // Listen to User's Study Progress for Dynamic "Last Activity" Course Display
  useEffect(() => {
    if (!activeUserUid) return;

    const qProgress = query(
      collection(db, 'studyProgress'),
      where('userId', '==', activeUserUid)
    );

    const unsub = onSnapshot(qProgress, async (snapshot) => {
      if (snapshot.empty) {
        setLastActivity(null);
        return;
      }

      // Sort by updatedAt descending to find the most recent course
      const sortedDocs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return timeB - timeA;
        });

      const latest: any = sortedDocs[0];
      if (!latest) {
        setLastActivity(null);
        return;
      }

      const courseId = latest.courseId;
      let courseTitle = latest.courseTitle;
      let courseDept = latest.department || '';
      let courseLevel = latest.level || '';
      let totalQuestions = 0;

      // Look up course details from allCourses or Firestore if not in studyProgress
      const localCourse = allCourses.find(c => c.id === courseId);
      if (localCourse) {
        courseTitle = courseTitle || localCourse.title;
        courseDept = courseDept || localCourse.department;
        courseLevel = courseLevel || localCourse.level;
        totalQuestions = localCourse.questionCount || 0;
      } else if (courseId) {
        try {
          const cDoc = await getDoc(doc(db, 'courses', courseId));
          if (cDoc.exists()) {
            const cData = cDoc.data();
            courseTitle = courseTitle || cData.title;
            courseDept = courseDept || cData.department;
            courseLevel = courseLevel || cData.level;
            totalQuestions = cData.questionCount || 0;
          }
        } catch (e) {
          console.warn("Could not fetch course doc:", e);
        }
      }

      // Compute accuracy and answered count for this course
      const answers = latest.answers || {};
      const answeredKeys = Object.keys(answers).filter(k => answers[k]?.isSubmitted);
      const attemptedCount = answeredKeys.length;
      
      let correctCount = 0;
      if (latest.score && typeof latest.score.correct === 'number') {
        correctCount = latest.score.correct;
      }

      const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

      setLastActivity({
        courseId: courseId || '',
        courseTitle: courseTitle || 'Current Subject',
        department: courseDept,
        level: courseLevel,
        attempted: attemptedCount,
        totalQuestions: totalQuestions || Math.max(attemptedCount, 50),
        accuracy
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'studyProgress'));

    return () => unsub();
  }, [activeUserUid, allCourses]);

  // Load Department-Based "Top This Week" Leaderboard
  useEffect(() => {
    setTopWeekLoading(true);
    const today = new Date();
    const start = format(startOfWeek(today), 'yyyy-MM-dd');
    const end = format(endOfWeek(today), 'yyyy-MM-dd');
    
    const userDept = activeProfile?.department || (userPaidDepts.length > 0 ? userPaidDepts[0] : 'Biomedical Laboratory Science (BMLS)');

    const q = query(
      collection(db, 'dailyPractice'),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'desc'),
      limit(500)
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const userAggregates: Record<string, { attempted: number; correct: number }> = {};
      
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const uid = data.userId;
        if (!uid) return;
        if (!userAggregates[uid]) {
          userAggregates[uid] = { attempted: 0, correct: 0 };
        }
        userAggregates[uid].attempted += data.attempted || 0;
        userAggregates[uid].correct += data.correct || 0;
      });

      const userIds = Object.keys(userAggregates);
      if (userIds.length === 0) {
        setTopWeekScholars([]);
        setTopWeekLoading(false);
        return;
      }

      try {
        const userDetailsMap: Record<string, { displayName: string; department?: string }> = {};
        
        // Chunk user queries (max 30 per in-query)
        const chunkSize = 30;
        const chunks: string[][] = [];
        for (let i = 0; i < userIds.length; i += chunkSize) {
          chunks.push(userIds.slice(i, i + chunkSize));
        }

        await Promise.all(chunks.map(async (chunk) => {
          try {
            const uQuery = query(collection(db, 'users'), where('__name__', 'in', chunk));
            const uSnap = await getDocs(uQuery);
            uSnap.docs.forEach(d => {
              const uData = d.data();
              userDetailsMap[d.id] = {
                displayName: uData.displayName || 'Scholar',
                department: uData.department || ''
              };
            });
          } catch (e) {
            console.warn("Error fetching user details chunk:", e);
          }
        }));

        // Filter scholars by user's department
        const targetClean = userDept.toLowerCase().replace(/[^a-z0-9]/g, '');

        const entries = userIds.map(uid => {
          const s = userAggregates[uid];
          const uInfo = userDetailsMap[uid] || { displayName: 'Scholar', department: '' };
          // Points Formula: (Attempted * 2) + (Correct * 0.5)
          const points = (s.attempted * 2) + (s.correct * 0.5);
          const accuracy = s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : 0;
          
          const nameParts = uInfo.displayName.trim().split(' ');
          const initials = nameParts.length > 1 
            ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
            : uInfo.displayName.substring(0, 2).toUpperCase();

          return {
            userId: uid,
            userName: uInfo.displayName,
            department: uInfo.department,
            points: Math.round(points * 10) / 10,
            accuracy,
            attempted: s.attempted,
            initials
          };
        })
        .filter(entry => {
          if (!entry.department) return true; // Show unassigned if empty
          const dClean = entry.department.toLowerCase().replace(/[^a-z0-9]/g, '');
          return dClean.includes(targetClean) || targetClean.includes(dClean);
        })
        .sort((a, b) => b.points - a.points || b.accuracy - a.accuracy)
        .slice(0, 5);

        setTopWeekScholars(entries);
      } catch (err) {
        console.error("Error aggregating top week scholars:", err);
      }

      setTopWeekLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'dailyPractice'));

    return () => unsub();
  }, [activeProfile?.department, userPaidDepts]);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('greet.morning');
    if (hour < 17) return t('greet.afternoon');
    return t('greet.evening');
  };

  // Points Formula: Points = (Total Questions Attempted × 2) + (Total Correct Answers × 0.5)
  const totalPoints = (stats.attempted * 2) + (stats.correct * 0.5);
  const formattedPoints = totalPoints > 0 
    ? (totalPoints % 1 === 0 ? totalPoints.toLocaleString() : totalPoints.toFixed(1))
    : '0';

  const userDepartmentName = activeProfile?.department || (userPaidDepts.length > 0 ? userPaidDepts[0] : 'Biomedical Laboratory Science (BMLS)');

  return (
    <Layout>
      <OnboardingTour />
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 font-sans pb-12">

        {/* ============ 1. HERO HEADER WITH POINTS & REAL-TIME SEARCH ============ */}
        <div className="header-mockup p-6 sm:p-8 rounded-3xl shadow-xl shadow-[#0B1E3D]/15 relative">
          <div className="orb1" />
          <div className="orb2" />

          {/* Top Brand Row */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-white to-[#60A5FA] diamond-mark shadow-md animate-pulse" />
              <span className="font-black text-white text-lg tracking-tight font-serif">Diamond Solution</span>
            </div>
            <Link 
              to="/notifications" 
              className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white text-lg hover:bg-white/20 transition-all relative cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FBBF24] ring-2 ring-[#0B1E3D]" />
            </Link>
          </div>

          {/* Greeting */}
          <div className="relative z-10 mt-6">
            <p className="text-xs text-white/70 font-medium">{getTimeGreeting()},</p>
            <h2 className="text-2xl sm:text-3xl font-black text-white font-serif mt-0.5">
              {(() => {
                const rawName = activeProfile?.username || activeProfile?.displayName?.split(' ')[0] || 'Scholar';
                return rawName.charAt(0).toUpperCase() + rawName.slice(1);
              })()}
            </h2>
          </div>

          {/* Real-time Interactive Front Page Search Bar */}
          <div ref={searchContainerRef} className="relative z-20 mt-5">
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  setShowSearchDropdown(false);
                  navigate(`/courses?search=${encodeURIComponent(searchQuery.trim())}`);
                } else {
                  navigate('/courses');
                }
              }} 
            >
              <div className="bg-white/95 rounded-2xl p-3 sm:p-4 flex items-center gap-3 shadow-lg shadow-[#0B1E3D]/25 border border-white/50 focus-within:ring-4 focus-within:ring-[#1B3FA0]/20 transition-all">
                <Search className="w-5 h-5 text-[#1B3FA0] flex-shrink-0" />
                <input 
                  type="text"
                  placeholder="Search a course, topic or exam (e.g. Hematology)..." 
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => setShowSearchDropdown(true)}
                  className="bg-transparent border-none outline-none text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 w-full font-medium"
                />
                {searchQuery && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            </form>

            {/* Live Search Dropdown Across All Levels */}
            <AnimatePresence>
              {showSearchDropdown && searchQuery.trim().length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-[#DDE5F5] overflow-hidden z-50 text-left max-h-80 overflow-y-auto"
                >
                  <div className="p-3 bg-[#EEF3FF] border-b border-[#DDE5F5] flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-[#0B1E3D]/70">
                    <span>Course Search Results ({searchResults.length})</span>
                    <span>All Levels Matching</span>
                  </div>

                  {searchResults.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs">
                      No courses found matching "{searchQuery}".
                    </div>
                  ) : (
                    <div className="divide-y divide-[#DDE5F5]">
                      {searchResults.map((course) => (
                        <div
                          key={course.id}
                          onClick={() => {
                            setShowSearchDropdown(false);
                            if (course.hasAccess) {
                              navigate(`/courses/${course.id}`);
                            } else {
                              navigate(`/courses?department=${encodeURIComponent(course.department)}`);
                            }
                          }}
                          className="p-3.5 hover:bg-[#EEF3FF]/70 transition-colors flex items-center justify-between cursor-pointer group"
                        >
                          <div className="space-y-1 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#1B3FA0]/10 text-[#1B3FA0] border border-[#1B3FA0]/20">
                                {course.level}
                              </span>
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider line-clamp-1">
                                {course.department}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-[#0B1E3D] group-hover:text-[#1B3FA0] transition-colors line-clamp-1">
                              {course.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {course.hasAccess ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Unlocked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                                <Lock className="w-3 h-3" />
                                Unlock Access
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#1B3FA0]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setShowSearchDropdown(false);
                      navigate(`/courses?search=${encodeURIComponent(searchQuery.trim())}`);
                    }}
                    className="w-full p-3 bg-white text-center text-xs font-black text-[#1B3FA0] hover:bg-[#EEF3FF] border-t border-[#DDE5F5] uppercase tracking-wider"
                  >
                    View All Matching Courses →
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Stat Strip: Points = (Attempted * 2) + (Correct * 0.5) */}
          <div className="relative z-10 grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/10 border border-white/20 rounded-2xl p-3 backdrop-blur-md text-center">
              <div className="text-base sm:text-lg font-black text-white font-serif">
                {formattedPoints}
              </div>
              <div className="text-[9px] text-white/70 uppercase tracking-wider font-bold mt-0.5">Points</div>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-2xl p-3 backdrop-blur-md text-center">
              <div className="text-base sm:text-lg font-black text-white font-serif">
                {stats.avgScore ? `${stats.avgScore}%` : '0%'}
              </div>
              <div className="text-[9px] text-white/70 uppercase tracking-wider font-bold mt-0.5">Accuracy</div>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-2xl p-3 backdrop-blur-md text-center">
              <div className="text-base sm:text-lg font-black text-white font-serif flex items-center justify-center gap-1">
                <span>{stats.attempted}</span>
                <Flame className="w-4 h-4 text-[#FBBF24]" />
              </div>
              <div className="text-[9px] text-white/70 uppercase tracking-wider font-bold mt-0.5">Attempted</div>
            </div>
          </div>
        </div>

        {/* ============ 2. WISDOM OF THE DAY (TOP PLACEMENT) ============ */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative group cursor-pointer"
        >
          <div className="card-luxury p-6 sm:p-7 relative overflow-hidden bg-white border border-[#DDE5F5] shadow-xs rounded-3xl">
            <QuoteIcon className="absolute -top-3 -right-3 w-28 h-28 text-[#1B3FA0]/5 -rotate-12 pointer-events-none" />
            <div className="space-y-3 relative z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">
                  {t('dashboard.wisdom') || 'Wisdom of the Day'}
                </span>
              </div>
              <p className="text-base sm:text-lg font-serif font-black text-[#0B1E3D] italic leading-relaxed">
                "{quote?.text || "The secret of getting ahead is getting started. Master your clinical questions one day at a time."}"
              </p>
              <div className="flex items-center gap-2 pt-1">
                <div className="w-6 h-[1px] bg-[#1B3FA0]/30" />
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  — {quote?.author || "Diamond Solution Academy"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ============ 3. DYNAMIC "LAST ACTIVITY" COURSE PROGRESS CARD ============ */}
        <div className="progress-card-mockup p-6 sm:p-7 flex flex-col sm:flex-row items-center gap-6 relative">
          <div className="ring-wrap flex-shrink-0">
            <svg width="74" height="74" viewBox="0 0 74 74">
              <circle className="ring-bg" cx="37" cy="37" r="31" />
              <circle 
                className="ring-fg" 
                cx="37" 
                cy="37" 
                r="31" 
                style={{ 
                  strokeDashoffset: 195 - (195 * (lastActivity?.accuracy || (stats.avgScore > 0 ? stats.avgScore : 65))) / 100 
                }} 
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-black text-white font-serif text-sm">
              {lastActivity ? `${lastActivity.accuracy}%` : (stats.avgScore > 0 ? `${stats.avgScore}%` : '65%')}
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1 relative z-10">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#FBBF24]">
                {lastActivity ? 'Recently Practiced' : 'Continue Studying'}
              </span>
              {lastActivity?.level && (
                <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/10 text-white rounded-md border border-white/20">
                  {lastActivity.level}
                </span>
              )}
            </div>

            <div className="text-lg sm:text-xl font-serif font-black text-white line-clamp-1">
              {lastActivity 
                ? lastActivity.courseTitle 
                : (activeProfile?.department ? activeProfile.department.split('(')[0].trim() : 'Biomedical Laboratory Science')}
            </div>

            <div className="text-xs text-white/75 font-medium">
              {lastActivity 
                ? `${lastActivity.attempted} of ${lastActivity.totalQuestions} questions completed`
                : (stats.attempted > 0 ? `${stats.correct} correct of ${stats.attempted} answered` : 'Pick a course and test your knowledge')}
            </div>

            <button 
              onClick={() => {
                if (lastActivity?.courseId) {
                  navigate(`/courses/${lastActivity.courseId}`);
                } else {
                  navigate('/courses');
                }
              }}
              className="mt-3 inline-flex items-center gap-1.5 bg-[#FBBF24] hover:bg-[#F59E0B] active:scale-95 text-[#0B1E3D] font-black text-xs px-5 py-2.5 rounded-xl shadow-md shadow-[#FBBF24]/30 transition-all cursor-pointer"
            >
              Resume Quiz →
            </button>
          </div>
        </div>

        {/* ============ 4. 7-DAY STUDY STATS & TIME SPENT BAR CHART ============ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#EEF3FF] border border-[#D4E0FC] flex items-center justify-center text-[#1B3FA0]">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif font-black text-base text-[#0B1E3D]">Study Analytics</h3>
                <p className="text-[10px] font-bold text-slate-400">7-day performance & time spent</p>
              </div>
            </div>
            {selectedDayIndex !== null && (
              <button 
                onClick={() => setSelectedDayIndex(null)}
                className="text-[11px] font-bold text-[#1B3FA0] bg-[#EEF3FF] hover:bg-[#E0EAFF] px-2.5 py-1 rounded-lg transition-colors"
              >
                Reset Selection
              </button>
            )}
          </div>

          {/* 4 Stat Overview Badges */}
          {(() => {
            const currentFocus = selectedDayIndex !== null && weeklyStats[selectedDayIndex]
              ? weeklyStats[selectedDayIndex]
              : null;

            const displayAttempted = currentFocus ? currentFocus.attempted : stats.attempted;
            const displayCorrect = currentFocus ? currentFocus.correct : stats.correct;
            const displayAccuracy = currentFocus ? currentFocus.accuracy : stats.avgScore;
            const displayDuration = currentFocus 
              ? `${currentFocus.studyDurationMins}m` 
              : `${Math.round(stats.studyDuration / 60)}m`;

            const labelPrefix = currentFocus ? `${currentFocus.dayLabel} (${currentFocus.fullDate})` : '7-Day Total';

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Time Spent */}
                <div className="card-luxury p-4 bg-white border border-[#DDE5F5] rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Time Spent</span>
                    <Clock className="w-4 h-4 text-[#1B3FA0]" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-serif font-black text-[#0B1E3D]">
                      {displayDuration}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                      {labelPrefix}
                    </div>
                  </div>
                </div>

                {/* Questions Attempted */}
                <div className="card-luxury p-4 bg-white border border-[#DDE5F5] rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attempted</span>
                    <Target className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-serif font-black text-[#0B1E3D]">
                      {displayAttempted}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                      {labelPrefix} questions
                    </div>
                  </div>
                </div>

                {/* Correct Answers */}
                <div className="card-luxury p-4 bg-white border border-[#DDE5F5] rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correct Answers</span>
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-serif font-black text-emerald-700">
                      {displayCorrect}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                      {displayAttempted > 0 ? `${Math.round((displayCorrect / displayAttempted) * 100)}% correct` : 'No attempts'}
                    </div>
                  </div>
                </div>

                {/* Average Score Percentage */}
                <div className="card-luxury p-4 bg-white border border-[#DDE5F5] rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Score</span>
                    <Zap className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-serif font-black text-[#0B1E3D]">
                      {displayAccuracy}%
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                      Accuracy score
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Interactive Bar Chart Card */}
          <div className="card-luxury p-5 sm:p-6 bg-white border border-[#DDE5F5] rounded-3xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#0B1E3D] font-serif">Daily Time Spent & Practice Volume</h4>
                <p className="text-[11px] text-slate-500">
                  Tap or hover any day bar to inspect questions attempted and score percentage.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-md bg-gradient-to-t from-[#0B1E3D] to-[#1B3FA0]" />
                  <span className="font-bold text-slate-600 text-[11px]">Time (Mins)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
                  <span className="font-bold text-slate-600 text-[11px]">Accuracy %</span>
                </div>
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="h-56 sm:h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weeklyStats}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onClick={(state) => {
                    if (state && state.activeTooltipIndex !== undefined) {
                      setSelectedDayIndex(
                        selectedDayIndex === state.activeTooltipIndex ? null : state.activeTooltipIndex
                      );
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF3FF" />
                  <XAxis 
                    dataKey="dayLabel" 
                    tickLine={false} 
                    axisLine={{ stroke: '#DDE5F5' }}
                    tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }}
                  />
                  <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fill: '#94A3B8', fontSize: 10 }}
                    unit="m"
                  />
                  <Tooltip
                    cursor={{ fill: '#EEF3FF', opacity: 0.7 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-[#0B1E3D] text-white p-3 rounded-2xl shadow-xl border border-white/10 text-xs space-y-1.5 z-50">
                            <div className="font-black text-[#FBBF24] uppercase tracking-wider text-[10px]">
                              {data.dayLabel} • {data.fullDate}
                            </div>
                            <div className="flex items-center justify-between gap-4 text-white/90">
                              <span>⏱️ Time Spent:</span>
                              <span className="font-black text-white">{data.studyDurationMins} mins</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-white/90">
                              <span>🎯 Attempted:</span>
                              <span className="font-black text-white">{data.attempted} questions</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-white/90">
                              <span>✅ Correct:</span>
                              <span className="font-black text-emerald-400">{data.correct} correct</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-white/90 pt-1 border-t border-white/10">
                              <span>⚡ Avg Score:</span>
                              <span className="font-black text-[#FBBF24]">{data.accuracy}%</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="studyDurationMins"
                    fill="#1B3FA0"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Daily Pill Strips for quick selection */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 pt-2 border-t border-[#EEF3FF]">
              {weeklyStats.map((day, idx) => {
                const isSelected = selectedDayIndex === idx;
                const isToday = idx === weeklyStats.length - 1;
                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDayIndex(isSelected ? null : idx)}
                    className={cn(
                      "flex flex-col items-center py-2 px-1 rounded-xl transition-all text-center cursor-pointer border",
                      isSelected 
                        ? "bg-[#1B3FA0] text-white border-[#1B3FA0] shadow-md shadow-[#1B3FA0]/20 scale-[1.02]" 
                        : "bg-[#F8F9FB] hover:bg-[#EEF3FF] border-[#DDE5F5] text-[#0B1E3D]"
                    )}
                  >
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider",
                      isSelected ? "text-white/80" : "text-slate-400"
                    )}>
                      {day.dayLabel}
                    </span>
                    <span className={cn(
                      "text-xs font-black mt-0.5",
                      isSelected ? "text-white" : "text-[#0B1E3D]"
                    )}>
                      {day.studyDurationMins}m
                    </span>
                    <div className="flex items-center gap-0.5 mt-1">
                      <span className={cn(
                        "text-[8px] font-bold px-1 rounded",
                        isSelected 
                          ? "bg-white/20 text-[#FBBF24]" 
                          : "bg-white text-slate-600 border border-slate-200"
                      )}>
                        {day.attempted}q
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============ 5. DEPARTMENT NAVIGATION (HORIZONTAL CAROUSEL) ============ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-black text-base text-[#0B1E3D]">Departments</h3>
            <Link to="/courses" className="text-xs font-bold text-[#1B3FA0] hover:underline">
              See all
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
            {(facultiesList.length > 0 ? facultiesList : DEPARTMENTS.map(d => ({ name: d, imageUrl: '' }))).map((dept: any) => {
              const deptName = dept.name;
              const isPaid = userPaidDepts.some(d => d.includes(deptName) || deptName.includes(d));
              return (
                <div 
                  key={deptName} 
                  onClick={() => navigate(`/courses?department=${encodeURIComponent(deptName)}`)}
                  className="card-luxury p-0 overflow-hidden bg-white border border-[#DDE5F5] rounded-3xl flex items-stretch cursor-pointer hover:border-[#1B3FA0]/40 transition-all min-w-[280px] sm:min-w-[320px] shadow-xs group shrink-0"
                >
                  <div className="w-24 sm:w-28 shrink-0 relative bg-[#EEF3FF] overflow-hidden flex items-center justify-center">
                    {dept.imageUrl ? (
                      <img src={dept.imageUrl} alt={deptName} className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                    ) : (
                      <Building2 className="w-8 h-8 text-[#1B3FA0]" />
                    )}
                  </div>
                  <div className="p-4 sm:p-5 flex-1 min-w-0 flex flex-col justify-center space-y-1">
                    {isPaid && (
                      <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 uppercase inline-block mb-1">
                        Active
                      </span>
                    )}
                    <h4 className="text-xs sm:text-sm font-bold text-[#0B1E3D] font-serif group-hover:text-[#1B3FA0] transition-colors leading-snug line-clamp-2">
                      {deptName}
                    </h4>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold pt-0.5">
                      <span>Explore</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ 5. QUICK ACTIONS GRID ============ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-black text-base text-[#0B1E3D]">Quick actions</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div 
              onClick={() => navigate('/courses')}
              className="card-luxury p-4 sm:p-5 flex flex-col gap-2 hover:-translate-y-1 transition-transform cursor-pointer bg-white"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1B3FA0] to-[#0B1E3D] text-white flex items-center justify-center text-base shadow-sm">
                📝
              </div>
              <div>
                <div className="text-sm font-bold text-[#0B1E3D] font-serif">Start Quiz</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Pick a topic and go</div>
              </div>
            </div>

            <div 
              onClick={() => navigate('/leaderboard')}
              className="card-luxury p-4 sm:p-5 flex flex-col gap-2 hover:-translate-y-1 transition-transform cursor-pointer bg-white"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FBBF24] to-[#D97706] text-white flex items-center justify-center text-base shadow-sm">
                🏆
              </div>
              <div>
                <div className="text-sm font-bold text-[#0B1E3D] font-serif">Leaderboard</div>
                <div className="text-[10px] text-slate-500 mt-0.5">See department rank</div>
              </div>
            </div>

            <div 
              onClick={() => navigate('/affiliate')}
              className="card-luxury p-4 sm:p-5 flex flex-col gap-2 hover:-translate-y-1 transition-transform cursor-pointer bg-white"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center text-base shadow-sm">
                👥
              </div>
              <div>
                <div className="text-sm font-bold text-[#0B1E3D] font-serif">Refer & Earn</div>
                <div className="text-[10px] text-slate-500 mt-0.5">25% commission</div>
              </div>
            </div>

            <div 
              onClick={() => setShowSocialMedia(true)}
              className="card-luxury p-4 sm:p-5 flex flex-col gap-2 hover:-translate-y-1 transition-transform cursor-pointer bg-white"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-700 text-white flex items-center justify-center text-base shadow-sm">
                🌐
              </div>
              <div>
                <div className="text-sm font-bold text-[#0B1E3D] font-serif">Channels</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Social updates</div>
              </div>
            </div>
          </div>
        </div>

        {/* ============ 6. REFERRAL PROGRAM CARD ============ */}
        <div 
          onClick={() => navigate('/affiliate')}
          className="card-luxury p-6 sm:p-8 bg-gradient-to-r from-[#0B1E3D] via-[#1B3FA0] to-[#0B1E3D] text-white rounded-3xl cursor-pointer group hover:scale-[1.01] transition-all duration-500 shadow-xl shadow-[#1B3FA0]/20 border border-[#1B3FA0]/30"
        >
          <div className="flex items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="inline-block text-[10px] font-black uppercase tracking-[0.3em] text-[#D4AF37]">Revenue Program</span>
              <h4 className="text-xl sm:text-2xl font-serif font-black text-white tracking-tight">{t('dashboard.refer_earn') || 'Refer & Earn 25%'}</h4>
              <p className="text-white/80 text-xs sm:text-sm font-medium">{t('dashboard.refer_sub') || 'Invite colleagues and earn instant commissions on course activations.'}</p>
              <div className="inline-block mt-3 px-5 py-2 bg-white/10 backdrop-blur-md rounded-2xl font-black text-[#D4AF37] tracking-[0.25em] text-base font-mono border border-white/20 shadow-inner">
                {activeProfile?.referralCode || `DS${activeUserUid?.substring(0, 6).toUpperCase() || 'REF'}`}
              </div>
            </div>
            <div className="hidden sm:flex w-20 h-20 bg-white/10 rounded-full items-center justify-center group-hover:rotate-12 transition-transform border border-white/10">
              <Users className="w-10 h-10 text-[#D4AF37]" />
            </div>
          </div>
        </div>

        {/* ============ 7. TOP THIS WEEK LEADERBOARD (BOTTOM PLACEMENT & DEPT-BASED) ============ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif font-black text-base text-[#0B1E3D]">Top This Week</h3>
              <p className="text-[10px] font-bold text-slate-400">
                Department Arena: <span className="text-[#1B3FA0] font-black">{userDepartmentName.split('(')[0].trim()}</span>
              </p>
            </div>
            <Link to="/leaderboard" className="text-xs font-bold text-[#1B3FA0] hover:underline">
              See Full Rankings →
            </Link>
          </div>

          <div className="card-luxury p-4 sm:p-6 bg-white divide-y divide-[#DDE5F5] rounded-3xl border border-[#DDE5F5]">
            {topWeekLoading ? (
              <div className="py-6 text-center text-xs text-slate-400">Loading standings...</div>
            ) : topWeekScholars.length === 0 ? (
              <div className="py-6 text-center space-y-1">
                <p className="text-xs font-bold text-[#0B1E3D]">No rankings recorded yet for this department this week.</p>
                <p className="text-[11px] text-slate-400">Start answering questions to claim the #1 spot!</p>
              </div>
            ) : (
              topWeekScholars.map((scholar, idx) => (
                <div key={scholar.userId} className="flex items-center gap-3 py-3 hover:bg-[#EEF3FF] rounded-xl px-2 transition-colors">
                  <div className={cn(
                    "w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shadow-xs",
                    idx === 0 
                      ? "bg-gradient-to-br from-[#FBBF24] to-[#D97706] text-white" 
                      : "bg-[#EEF3FF] text-[#1B3FA0]"
                  )}>
                    {idx + 1}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1B3FA0] to-[#0B1E3D] text-white font-bold text-xs flex items-center justify-center font-serif">
                    {scholar.initials}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-[#0B1E3D]">{scholar.userName}</div>
                    <div className="text-[10px] text-slate-400">{scholar.accuracy}% accuracy • {scholar.attempted} q's</div>
                  </div>
                  <div className="text-xs font-black text-[#1B3FA0]">
                    {scholar.points.toLocaleString()} pts
                  </div>
                </div>
              ))
            )}
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
                className="absolute inset-0 bg-[#0B1E3D]/50 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="card-luxury w-full max-w-sm p-8 space-y-8 relative z-10 bg-white border border-[#DDE5F5] shadow-2xl rounded-3xl"
              >
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-serif font-black text-[#0B1E3D]">Institutional Handles</h3>
                  <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.4em]">Diamond Multi-Channel Protocol</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {dynamicSocialLinks.map((link) => (
                    <a 
                      key={link.name}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-luxury p-4 flex flex-col items-center gap-3 hover:bg-[#EEF3FF] transition-all text-center group bg-white border border-[#DDE5F5] rounded-2xl"
                    >
                      <div className={cn("w-12 h-12 rounded-2xl bg-[#EEF3FF] border border-[#D4E0FC] flex items-center justify-center group-hover:scale-110 transition-all", link.color)}>
                        <link.icon className="w-6 h-6" />
                       </div>
                      <span className="text-[9px] font-black text-slate-600 group-hover:text-[#1B3FA0] uppercase tracking-widest">{link.name}</span>
                    </a>
                  ))}
                </div>

                <button 
                  onClick={() => setShowSocialMedia(false)}
                  className="w-full bg-[#EEF3FF] border border-[#D4E0FC] text-[#0B1E3D] py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:text-[#1B3FA0] transition-all cursor-pointer"
                >
                  {t('general.cancel')}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
