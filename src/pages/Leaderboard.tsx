import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where, documentId } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Medal, Star, Target, Crown, ArrowLeft, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { cn } from '../lib/utils';
import { format, startOfWeek, endOfWeek } from 'date-fns';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  attempted: number;
  correct: number;
  accuracy: number;
  avatar?: string;
  rank?: number;
}

export default function Leaderboard() {
  const [topScholars, setTopScholars] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'all'>('week');
  const navigate = useNavigate();
  const { t } = useLanguage();

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
        limit(500)
      );
    } else {
      q = query(
        collection(db, 'dailyPractice'),
        orderBy('correct', 'desc'),
        limit(100)
      );
    }

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const userAggregates: Record<string, { attempted: number; correct: number }> = {};
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const uid = data.userId;
        if (!userAggregates[uid]) {
          userAggregates[uid] = { attempted: 0, correct: 0 };
        }
        userAggregates[uid].attempted += data.attempted || 0;
        userAggregates[uid].correct += data.correct || 0;
      });

      const leaderboard: LeaderboardEntry[] = [];
      const userIds = Object.keys(userAggregates);
      
      if (userIds.length === 0) {
        setTopScholars([]);
        setLoading(false);
        return;
      }

      try {
        const sortedEntries = Object.entries(userAggregates)
          .map(([uid, stats]) => ({
            userId: uid,
            userName: 'Scholar',
            attempted: stats.attempted,
            correct: stats.correct,
            accuracy: stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0
          }))
          .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)
          .slice(0, 20);

        const topUserIds = sortedEntries.map(e => e.userId);
        const userMap: Record<string, string> = {};
        
        if (topUserIds.length > 0) {
          const uQuery = query(
            collection(db, 'users'), 
            where(documentId(), 'in', topUserIds),
            where('role', '==', 'student')
          );
          const uSnap = await getDocs(uQuery);
          uSnap.docs.forEach(d => {
            userMap[d.id] = d.data().displayName || 'Scholar';
          });
        }

        const finalLeaderboard = sortedEntries.map((item, index) => ({
          ...item,
          userName: userMap[item.userId] || 'Scholar',
          rank: index + 1
        }));

        setTopScholars(finalLeaderboard);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
      
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'dailyPractice'));

    return () => unsubscribe();
  }, [timeRange]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-text-1 p-6 pb-24 md:p-10">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/dashboard')}
              className="w-10 h-10 rounded-2xl bg-white border border-[#D8E3FF] flex items-center justify-center text-text-2 hover:text-[#2563EB] transition-colors shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-serif font-black tracking-tight flex items-center gap-2 text-text-1">
                <Trophy className="w-6 h-6 text-gold" />
                Diamond Scholar Hall of Fame
              </h1>
              <p className="text-text-3 text-xs">Top performers in clinical practice accuracy</p>
            </div>
          </div>

          <div className="flex bg-[#EEF3FF] border border-[#D8E3FF] p-1 rounded-2xl">
            <button 
              onClick={() => setTimeRange('week')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer",
                timeRange === 'week' ? "bg-[#2563EB] text-white shadow-xs" : "text-text-3 hover:text-text-1"
              )}
            >
              Scholar of the Week
            </button>
            <button 
              onClick={() => setTimeRange('all')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer",
                timeRange === 'all' ? "bg-[#2563EB] text-white shadow-xs" : "text-text-3 hover:text-text-1"
              )}
            >
              All Time
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-[#2563EB] rounded-full animate-spin"></div>
          </div>
        ) : topScholars.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-[#D8E3FF] shadow-xs">
            <TrendingUp className="w-12 h-12 text-blue-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-text-1">The Arena is Empty</h3>
            <p className="text-text-3 max-w-xs mx-auto mt-2 text-xs">Be the first to practice today and claim your spot on the throne!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top 3 Podium */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {topScholars.slice(0, 3).map((scholar, idx) => (
                /* @ts-ignore */
                <PodiumCard key={scholar.userId} scholar={scholar} rank={idx + 1} />
              ))}
            </div>

            {/* List for the rest */}
            <div className="bg-white border border-[#D8E3FF] rounded-3xl overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-[#D8E3FF] bg-[#EEF3FF] flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Scholar Rank</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Accuracy & Vol</span>
              </div>
              <div className="divide-y divide-[#D8E3FF]">
                {topScholars.slice(3).map((scholar) => (
                  <div key={scholar.userId} className="flex items-center justify-between p-5 group hover:bg-[#EEF3FF] transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono font-bold text-text-3 w-6">#{scholar.rank}</span>
                      <div className="w-10 h-10 rounded-2xl bg-[#EEF3FF] border border-[#D8E3FF] flex items-center justify-center font-black text-[#2563EB]">
                        {scholar.userName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-text-1 group-hover:text-[#2563EB] transition-colors">{scholar.userName}</h4>
                        <p className="text-[10px] text-text-3">{scholar.correct} Clinical Victories</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-gold">{scholar.accuracy}%</div>
                      <div className="text-[10px] text-text-3 font-mono italic">{scholar.attempted} attempts</div>
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

function PodiumCard({ scholar, rank }: { scholar: LeaderboardEntry; rank: number }) {
  const rankConfigs = {
    1: { color: 'text-gold', bg: 'bg-amber-500/10', icon: Crown, label: 'Gold' },
    2: { color: 'text-slate-500', bg: 'bg-slate-200/50', icon: Medal, label: 'Silver' },
    3: { color: 'text-amber-700', bg: 'bg-amber-100', icon: Medal, label: 'Bronze' },
  };

  const config = rankConfigs[rank as keyof typeof rankConfigs];
  const Icon = config.icon;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={cn(
        "relative p-6 sm:p-8 rounded-3xl border border-[#D8E3FF] overflow-hidden group shadow-xs",
        rank === 1 ? "bg-gradient-to-br from-blue-50/80 via-white to-white ring-2 ring-blue-300" : "bg-white"
      )}
    >
      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className={cn(
            "w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black border-2",
            rank === 1 ? "bg-[#EEF3FF] border-blue-300 text-[#2563EB]" : "bg-[#EEF3FF] border-[#D8E3FF] text-text-1"
          )}>
            {scholar.userName.charAt(0)}
          </div>
          <div className={cn(
            "absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-md border",
            rank === 1 ? "bg-gold border-amber-200 text-white" : "bg-white border-[#D8E3FF] text-text-2"
          )}>
            <Icon className="w-4 h-4" />
          </div>
        </div>

        <span className={cn("text-[10px] font-black uppercase tracking-[0.2em] mb-1", config.color)}>
          Rank #{rank} • {config.label}
        </span>
        <h3 className="text-lg font-black text-text-1 group-hover:scale-105 transition-transform">{scholar.userName}</h3>
        
        <div className="mt-6 w-full space-y-2.5">
          <div className="flex justify-between items-end border-b border-[#D8E3FF] pb-2">
            <span className="text-[10px] font-black text-text-3 uppercase">Accuracy</span>
            <span className="text-xl font-black text-gold">{scholar.accuracy}%</span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-text-3 uppercase">Attempts</span>
            <span className="text-sm font-bold text-text-1">{scholar.attempted}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
