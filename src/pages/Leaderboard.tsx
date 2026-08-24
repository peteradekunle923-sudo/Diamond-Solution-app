import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trophy, Medal, Crown, ArrowLeft, TrendingUp, Sparkles, Award, Users, Filter, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS } from '../constants';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  department?: string;
  attempted: number;
  correct: number;
  points: number;
  accuracy: number;
  avatar?: string;
  rank?: number;
}

export default function Leaderboard() {
  const { user, profile, isAdmin } = useAuth();
  const [topScholars, setTopScholars] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'all'>('week');
  const [userPaidDepts, setUserPaidDepts] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Load user's paid departments
  useEffect(() => {
    if (!user) return;
    const fetchUserDepts = async () => {
      try {
        const pq = query(
          collection(db, 'payments'),
          where('userId', '==', user.uid),
          where('status', '==', 'success')
        );
        const pSnap = await getDocs(pq);
        const depts: string[] = [];
        pSnap.docs.forEach(d => {
          const dept = d.data().dept_name || d.data().department;
          if (dept && !depts.includes(dept)) depts.push(dept);
        });

        if (profile?.department && !depts.includes(profile.department)) {
          depts.push(profile.department);
        }

        setUserPaidDepts(depts);

        // Default to user's first department or profile department
        const defaultDept = profile?.department || (depts.length > 0 ? depts[0] : 'All');
        setSelectedDept(defaultDept);
      } catch (e) {
        console.warn("Could not fetch user paid depts for leaderboard:", e);
        if (profile?.department) {
          setSelectedDept(profile.department);
        }
      }
    };
    fetchUserDepts();
  }, [user, profile]);

  useEffect(() => {
    setLoading(true);
    let q;
    
    if (timeRange === 'week') {
      const today = new Date();
      const start = format(startOfWeek(today), 'yyyy-MM-dd');
      const end = format(endOfWeek(today), 'yyyy-MM-dd');
      
      q = query(
        collection(db, 'dailyPractice'),
        where('date', '>=', start),
        where('date', '<=', end),
        orderBy('date', 'desc'),
        limit(1000)
      );
    } else {
      q = query(
        collection(db, 'dailyPractice'),
        orderBy('attempted', 'desc'),
        limit(1000)
      );
    }

    const unsubscribe = onSnapshot(q, async (snapshot) => {
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
        setTopScholars([]);
        setLoading(false);
        return;
      }

      try {
        // Fetch users details in chunks of 30
        const userDetailsMap: Record<string, { displayName: string; department?: string; role?: string }> = {};
        
        // Chunk userIds to avoid Firestore 'in' limit (max 30)
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
                department: uData.department || '',
                role: uData.role || 'student'
              };
            });
          } catch (e) {
            console.warn("Error fetching user chunk:", e);
          }
        }));

        // Build list of scholars with points calculation:
        // Points = (Total Questions Attempted × 2) + (Total Correct Answers × 0.5)
        const entries: LeaderboardEntry[] = userIds
          .map(uid => {
            const stats = userAggregates[uid];
            const uInfo = userDetailsMap[uid] || { displayName: 'Scholar', department: '', role: 'student' };
            const points = (stats.attempted * 2) + (stats.correct * 0.5);
            const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0;
            return {
              userId: uid,
              userName: uInfo.displayName,
              department: uInfo.department,
              attempted: stats.attempted,
              correct: stats.correct,
              points: Math.round(points * 10) / 10,
              accuracy
            };
          })
          // Filter by selected department if not 'All'
          .filter(entry => {
            if (selectedDept === 'All') return true;
            if (!entry.department) return false;
            // Match department flexibly (e.g., handles "BMLS" vs "Biomedical Laboratory Science")
            const selClean = selectedDept.toLowerCase().replace(/[^a-z0-9]/g, '');
            const entryClean = entry.department.toLowerCase().replace(/[^a-z0-9]/g, '');
            return entryClean.includes(selClean) || selClean.includes(entryClean);
          })
          // Rank scholars by Points (descending), then by accuracy
          .sort((a, b) => b.points - a.points || b.accuracy - a.accuracy || b.correct - a.correct)
          .slice(0, 50);

        const ranked = entries.map((item, index) => ({
          ...item,
          rank: index + 1
        }));

        setTopScholars(ranked);
      } catch (err) {
        console.error("Leaderboard aggregation error:", err);
      }
      
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'dailyPractice'));

    return () => unsubscribe();
  }, [timeRange, selectedDept]);

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#0B1E3D] p-6 pb-24 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DDE5F5] pb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)} 
              className="w-10 h-10 rounded-2xl bg-white border border-[#DDE5F5] flex items-center justify-center text-slate-600 hover:text-[#1B3FA0] hover:border-[#1B3FA0] transition-colors shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37] bg-[#FEF9E7] px-2.5 py-0.5 rounded-full border border-[#F5E5A4]">
                  Clinical Arena
                </span>
                {selectedDept !== 'All' && (
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1B3FA0] bg-[#EEF3FF] px-2.5 py-0.5 rounded-full border border-[#D4E0FC]">
                    {selectedDept.split('(')[0].trim()}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#0B1E3D] tracking-tight font-serif mt-1">
                Leaderboard Rankings
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Time filter */}
            <div className="flex bg-white p-1 rounded-2xl border border-[#DDE5F5] shadow-xs">
              <button
                onClick={() => setTimeRange('week')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer",
                  timeRange === 'week' ? "bg-[#1B3FA0] text-white shadow-xs" : "text-slate-600 hover:text-[#1B3FA0]"
                )}
              >
                This Week
              </button>
              <button
                onClick={() => setTimeRange('all')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer",
                  timeRange === 'all' ? "bg-[#1B3FA0] text-white shadow-xs" : "text-slate-600 hover:text-[#1B3FA0]"
                )}
              >
                All Time
              </button>
            </div>
          </div>
        </header>

        {/* Department-Based Filter Pills */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#1B3FA0]" />
              Filter by Department
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              Formula: (Attempts × 2) + (Correct × 0.5)
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedDept('All')}
              className={cn(
                "px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all border cursor-pointer",
                selectedDept === 'All'
                  ? "bg-[#0B1E3D] text-white border-[#0B1E3D] shadow-xs"
                  : "bg-white border-[#DDE5F5] text-slate-600 hover:text-[#1B3FA0] hover:border-[#1B3FA0]"
              )}
            >
              All Departments
            </button>
            {DEPARTMENTS.map((dept) => {
              const isSelected = selectedDept === dept;
              const isUserDept = userPaidDepts.includes(dept) || profile?.department === dept;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={cn(
                    "px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5",
                    isSelected
                      ? "bg-[#1B3FA0] text-white border-[#1B3FA0] shadow-xs"
                      : "bg-white border-[#DDE5F5] text-slate-600 hover:text-[#1B3FA0] hover:border-[#1B3FA0]"
                  )}
                >
                  {isUserDept && <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />}
                  <span>{dept.replace(/\(.*?\)/, '').trim()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-[#1B3FA0] rounded-full animate-spin"></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Calculating Standings...</p>
          </div>
        ) : topScholars.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-[#DDE5F5] shadow-xs">
            <TrendingUp className="w-12 h-12 text-[#1B3FA0]/40 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-[#0B1E3D]">No Rankings Recorded Yet</h3>
            <p className="text-slate-500 max-w-xs mx-auto mt-2 text-xs">
              {selectedDept !== 'All' 
                ? `Be the first scholar in ${selectedDept.split('(')[0].trim()} to practice today and claim #1!`
                : "Be the first to practice today and claim your spot on the throne!"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top 3 Podium */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {topScholars.slice(0, 3).map((scholar, idx) => (
                <PodiumCard key={scholar.userId} scholar={scholar} rank={idx + 1} />
              ))}
            </div>

            {/* List for the rest */}
            <div className="bg-white border border-[#DDE5F5] rounded-3xl overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-[#DDE5F5] bg-[#EEF3FF] flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#0B1E3D]/70">Scholar Rank</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#0B1E3D]/70">Points & Performance</span>
              </div>
              <div className="divide-y divide-[#DDE5F5]">
                {topScholars.slice(3).map((scholar) => (
                  <div key={scholar.userId} className="flex items-center justify-between p-5 group hover:bg-[#EEF3FF]/60 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono font-bold text-slate-500 w-6">#{scholar.rank}</span>
                      <div className="w-10 h-10 rounded-2xl bg-[#EEF3FF] border border-[#D4E0FC] flex items-center justify-center font-black text-[#1B3FA0]">
                        {scholar.userName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#0B1E3D] group-hover:text-[#1B3FA0] transition-colors">{scholar.userName}</h4>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {scholar.correct} correct of {scholar.attempted} attempted
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-[#1B3FA0]">{scholar.points.toLocaleString()} pts</div>
                      <div className="text-[10px] text-slate-400 font-mono">{scholar.accuracy}% accuracy</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumCard({ scholar, rank }: { scholar: LeaderboardEntry; rank: number; key?: any }) {
  const rankConfigs = {
    1: { color: 'text-[#996515]', bg: 'bg-[#FEF9E7]', border: 'border-[#F5E5A4]', badgeBg: 'bg-[#D4AF37]', icon: Crown, label: 'Gold Champion' },
    2: { color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300', badgeBg: 'bg-slate-400', icon: Medal, label: 'Silver Scholar' },
    3: { color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200', badgeBg: 'bg-amber-600', icon: Medal, label: 'Bronze Scholar' },
  };

  const config = rankConfigs[rank as keyof typeof rankConfigs];
  const Icon = config.icon;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={cn(
        "relative p-6 sm:p-8 rounded-3xl border overflow-hidden group shadow-xs transition-all",
        rank === 1 
          ? "bg-white border-[#F5E5A4] shadow-[0_8px_30px_rgba(212,175,55,0.12)] ring-1 ring-[#D4AF37]/30" 
          : "bg-white border-[#DDE5F5]"
      )}
    >
      {rank === 1 && (
        <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-bl from-[#D4AF37]/15 to-transparent rounded-bl-full pointer-events-none" />
      )}
      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className={cn(
            "w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black border-2",
            rank === 1 ? "bg-[#FEF9E7] border-[#F5E5A4] text-[#0B1E3D]" : "bg-[#EEF3FF] border-[#D4E0FC] text-[#0B1E3D]"
          )}>
            {scholar.userName.charAt(0)}
          </div>
          <div className={cn(
            "absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-md text-white border-2 border-white",
            config.badgeBg
          )}>
            <Icon className="w-4 h-4" />
          </div>
        </div>

        <span className={cn("text-[10px] font-black uppercase tracking-[0.2em] mb-1 px-3 py-0.5 rounded-full border", config.bg, config.border, config.color)}>
          Rank #{rank} • {config.label}
        </span>
        <h3 className="text-lg font-black text-[#0B1E3D] group-hover:text-[#1B3FA0] transition-colors mt-2">{scholar.userName}</h3>
        
        <div className="mt-6 w-full space-y-2.5">
          <div className="flex justify-between items-end border-b border-[#DDE5F5] pb-2">
            <span className="text-[10px] font-black text-slate-500 uppercase">Points</span>
            <span className={cn("text-xl font-black", rank === 1 ? "text-[#D4AF37]" : "text-[#1B3FA0]")}>
              {scholar.points.toLocaleString()} <span className="text-xs font-bold text-slate-400">pts</span>
            </span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-slate-500 uppercase">Accuracy</span>
            <span className="text-sm font-bold text-[#0B1E3D]">{scholar.accuracy}%</span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-slate-500 uppercase">Attempts</span>
            <span className="text-xs font-mono font-medium text-slate-500">{scholar.attempted}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
