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
      // Group by userId and calculate totals
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

      // Fetch user profiles for names
      const leaderboard: LeaderboardEntry[] = [];
      const userIds = Object.keys(userAggregates);
      
      if (userIds.length === 0) {
        setTopScholars([]);
        setLoading(false);
        return;
      }

      // We only need names for top users to be efficient
      // For now we fetch all mentioned users in current query result
      
      try {
        // Sort and slice to top 20 first
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

        // Fetch names only for top 20
        const topUserIds = sortedEntries.map(e => e.userId);
        const userMap: Record<string, string> = {};
        
        if (topUserIds.length > 0) {
          // 'where in' supports up to 30 elements. Added role filter for safety rules.
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
    <div className="min-h-screen bg-[#0a0c14] text-white p-6 pb-24 md:p-10">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/dashboard')}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                <Trophy className="w-6 h-6 text-gold" />
                Diamond Scholar Hall of Fame
              </h1>
              <p className="text-gray-500 text-sm">Top performers in clinical practice accuracy</p>
            </div>
          </div>

          <div className="flex bg-white/5 p-1 rounded-xl">
            <button 
              onClick={() => setTimeRange('week')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                timeRange === 'week' ? "bg-gold text-black shadow-lg" : "text-gray-400 hover:text-white"
              )}
            >
              Scholar of the Week
            </button>
            <button 
              onClick={() => setTimeRange('all')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                timeRange === 'all' ? "bg-gold text-black shadow-lg" : "text-gray-400 hover:text-white"
              )}
            >
              All Time
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-gold/20 border-t-gold rounded-full animate-spin"></div>
          </div>
        ) : topScholars.length === 0 ? (
          <div className="bg-white/5 rounded-3xl p-20 text-center border border-white/10">
            <TrendingUp className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <h3 className="text-lg font-bold">The Arena is Empty</h3>
            <p className="text-gray-500 max-w-xs mx-auto mt-2">Be the first to practice today and claim your spot on the throne!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Top 3 Podium */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {topScholars.slice(0, 3).map((scholar, idx) => (
                /* @ts-ignore */
                <PodiumCard key={scholar.userId} scholar={scholar} rank={idx + 1} />
              ))}
            </div>

            {/* List for the rest */}
            <div className="bg-[#161b2e] border border-[#1e2540] rounded-3xl overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Scholar Rank</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Accuracy & Vol</span>
              </div>
              <div className="divide-y divide-white/5">
                {topScholars.slice(3).map((scholar) => (
                  <div key={scholar.userId} className="flex items-center justify-between p-5 group hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono font-bold text-gray-600 w-6">#{scholar.rank}</span>
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-bold text-gold">
                        {scholar.userName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-[14px] font-bold text-[#e8eaf0] group-hover:text-gold transition-colors">{scholar.userName}</h4>
                        <p className="text-[10px] text-gray-500">{scholar.correct} Clinical Victories</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-gold">{scholar.accuracy}%</div>
                      <div className="text-[10px] text-gray-600 font-mono italic">{scholar.attempted} attempts</div>
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
    1: { color: 'text-[#ffd700]', bg: 'from-[#ffd700]/20 to-transparent', icon: Crown, label: 'Gold' },
    2: { color: 'text-[#c0c0c0]', bg: 'from-[#c0c0c0]/20 to-transparent', icon: Medal, label: 'Silver' },
    3: { color: 'text-[#cd7f32]', bg: 'from-[#cd7f32]/20 to-transparent', icon: Medal, label: 'Bronze' },
  };

  const config = rankConfigs[rank as keyof typeof rankConfigs];
  const Icon = config.icon;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={cn(
        "relative p-8 rounded-[32px] border border-white/10 overflow-hidden group",
        rank === 1 ? "bg-gradient-to-br from-gold/10 via-[#161b2e] to-[#161b2e] ring-2 ring-gold/30" : "bg-[#161b2e]"
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-t opacity-30", config.bg)} />
      
      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className={cn(
            "w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black border-2",
            rank === 1 ? "bg-gold/10 border-gold/50 text-gold" : "bg-white/5 border-white/10 text-white"
          )}>
            {scholar.userName.charAt(0)}
          </div>
          <div className={cn(
            "absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border",
            rank === 1 ? "bg-gold border-yellow-200 text-black" : "bg-white/10 border-white/20 text-white"
          )}>
            <Icon className="w-4 h-4" />
          </div>
        </div>

        <span className={cn("text-[10px] font-black uppercase tracking-[0.2em] mb-1", config.color)}>
          Rank #{rank} • {config.label}
        </span>
        <h3 className="text-lg font-black text-white group-hover:scale-105 transition-transform">{scholar.userName}</h3>
        
        <div className="mt-6 w-full space-y-3">
          <div className="flex justify-between items-end border-b border-white/10 pb-2">
            <span className="text-[10px] font-black text-gray-500 uppercase">Accuracy</span>
            <span className="text-xl font-black text-gold">{scholar.accuracy}%</span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-gray-500 uppercase">Attempts</span>
            <span className="text-sm font-bold text-white">{scholar.attempted}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
