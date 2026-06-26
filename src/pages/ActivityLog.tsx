import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  BookOpen, 
  Clock,
  Filter,
  Check,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface LogItem {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  questionId: string;
  questionText: string;
  options: string[];
  selectedAnswer: string | null;
  correctAnswer: number | null;
  isCorrect: boolean;
  explanation: string;
  type: string;
  timestamp: string;
}

export default function ActivityLog() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'correct' | 'incorrect' | 'skipped'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Get all activity logs for this user
    const q = query(
      collection(db, 'activityLogs'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs: LogItem[] = [];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString();

      snapshot.forEach((doc) => {
        const data = doc.data();
        // Standardize timestamp: handle both string formats and Firestore Timestamp objects safely
        const logTimestampStr = typeof data.timestamp === 'string' 
          ? data.timestamp 
          : data.timestamp?.toDate?.()?.toISOString() || '';

        // Client-side filter for previous 7 days to avoid composite index requirements
        if (logTimestampStr && logTimestampStr >= sevenDaysAgoStr) {
          fetchedLogs.push({
            id: doc.id,
            ...data,
            timestamp: logTimestampStr
          } as LogItem);
        }
      });

      // Sort client-side by timestamp descending to avoid composite index requirements
      fetchedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setLogs(fetchedLogs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching activity logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    let result = [...logs];

    if (statusFilter === 'correct') {
      result = result.filter(log => log.isCorrect);
    } else if (statusFilter === 'incorrect') {
      result = result.filter(log => !log.isCorrect && log.selectedAnswer !== null);
    } else if (statusFilter === 'skipped') {
      result = result.filter(log => log.selectedAnswer === null);
    }

    setFilteredLogs(result);
  }, [logs, statusFilter]);

  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => prev === id ? null : id);
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (e) {
      return 'Recent';
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-12">
        {/* Header section with back button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-xl bg-navy-mid border border-gold/10 flex items-center justify-center text-gold hover:bg-gold/10 transition-all active:scale-95"
              id="back_to_profile_btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-3xl font-serif font-black text-text-1 tracking-tight">
                Revision Center
              </h2>
              <p className="text-[10px] font-black text-gold uppercase tracking-[0.4em] mt-0.5">
                Previous 7 Days Activity Logs
              </p>
            </div>
          </div>

          {/* Stats quick overview */}
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center min-w-[70px]">
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block mb-0.5">Correct</span>
              <span className="text-lg font-serif font-black text-emerald-400">{logs.filter(l => l.isCorrect).length}</span>
            </div>
            <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center min-w-[70px]">
              <span className="text-[8px] font-black text-red-400 uppercase tracking-widest block mb-0.5">Wrong</span>
              <span className="text-lg font-serif font-black text-red-400">{logs.filter(l => !l.isCorrect && l.selectedAnswer !== null).length}</span>
            </div>
            <div className="px-4 py-2 bg-gold/10 border border-gold/20 rounded-xl text-center min-w-[70px]">
              <span className="text-[8px] font-black text-gold uppercase tracking-widest block mb-0.5">Total</span>
              <span className="text-lg font-serif font-black text-gold">{logs.length}</span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3 bg-navy-mid/40 p-4 rounded-2xl border border-gold/10">
          <div className="flex items-center gap-2 text-text-3 text-xs font-black uppercase tracking-wider mr-2">
            <Filter className="w-4 h-4 text-gold" />
            <span>Filter:</span>
          </div>
          {(['all', 'correct', 'incorrect', 'skipped'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border",
                statusFilter === status 
                  ? "bg-gold border-gold text-navy shadow-lg shadow-gold/20" 
                  : "bg-navy-high border-gold/10 text-text-3 hover:text-text-1 hover:border-gold/30"
              )}
            >
              {status === 'all' && 'All Answers'}
              {status === 'correct' && 'Correct'}
              {status === 'incorrect' && 'Incorrect'}
              {status === 'skipped' && 'Skipped'}
            </button>
          ))}
        </div>

        {/* List of activity items */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-12 h-12 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            <p className="text-text-3 text-xs font-black uppercase tracking-widest animate-pulse">Loading logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="card-luxury p-12 text-center space-y-6 bg-navy-mid/20 border-gold/10 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-full bg-navy-high border border-gold/10 flex items-center justify-center text-gold/40">
              <BookOpen className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-serif font-black text-text-1">No questions found</h3>
              <p className="text-xs text-text-3 leading-relaxed">
                {statusFilter === 'all' 
                  ? "You haven't practiced any questions in the last 7 days yet. Solve questions in the study section to compile logs."
                  : `No ${statusFilter} answers logged in the past 7 days.`}
              </p>
            </div>
            <button 
              onClick={() => navigate('/courses')}
              className="px-6 py-3 bg-gold text-navy rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-gold/10 hover:scale-[1.02] transition-all active:scale-95"
            >
              Start Studying
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const isSkipped = log.selectedAnswer === null;
              
              return (
                <div 
                  key={log.id} 
                  className={cn(
                    "card-luxury overflow-hidden transition-all duration-300 border bg-navy-mid/40 hover:border-gold/30",
                    log.isCorrect 
                      ? "border-emerald-500/10 hover:border-emerald-500/30" 
                      : isSkipped 
                        ? "border-gold/10 hover:border-gold/30" 
                        : "border-red-500/10 hover:border-red-500/30"
                  )}
                >
                  {/* Collapsed view header */}
                  <div 
                    onClick={() => toggleExpand(log.id)}
                    className="p-6 flex items-start justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] font-black bg-navy-high border border-gold/10 text-gold px-2.5 py-1 rounded-md uppercase tracking-wider font-mono">
                          {log.courseTitle}
                        </span>
                        <div className="flex items-center gap-1.5 text-[9px] font-black text-text-3 uppercase tracking-wider">
                          <Calendar className="w-3 h-3 text-gold/60" />
                          <span>{formatDate(log.timestamp)}</span>
                        </div>
                      </div>
                      <h4 className="font-serif font-black text-text-1 text-sm md:text-base leading-relaxed line-clamp-2">
                        {log.questionText}
                      </h4>
                    </div>

                    <div className="flex items-center gap-4">
                      {log.isCorrect ? (
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Check className="w-4 h-4" />
                        </div>
                      ) : isSkipped ? (
                        <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold">
                          <Clock className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                          <X className="w-4 h-4" />
                        </div>
                      )}
                      
                      <div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-text-3" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-text-3" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                      >
                        <div className="px-6 pb-6 pt-2 border-t border-gold/5 bg-navy-high/20 space-y-6">
                          {/* Full Question Text */}
                          <div className="space-y-2">
                            <p className="text-[9px] font-black text-text-3 uppercase tracking-widest">Question</p>
                            <p className="text-text-1 text-sm md:text-base font-medium leading-relaxed">
                              {log.questionText}
                            </p>
                          </div>

                          {/* Options list */}
                          {log.options && log.options.length > 0 && (
                            <div className="space-y-3">
                              <p className="text-[9px] font-black text-text-3 uppercase tracking-widest">Options</p>
                              <div className="grid gap-2">
                                {log.options.map((option, idx) => {
                                  const isCorrectOption = idx === log.correctAnswer;
                                  const isSelectedOption = log.selectedAnswer !== null && parseInt(log.selectedAnswer) === idx;
                                  
                                  return (
                                    <div 
                                      key={idx}
                                      className={cn(
                                        "p-4 rounded-xl text-xs font-bold border transition-colors flex items-center gap-3",
                                        isCorrectOption 
                                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                          : isSelectedOption 
                                            ? "bg-red-500/10 border-red-500/30 text-red-300"
                                            : "bg-navy-high border-gold/10 text-text-2"
                                      )}
                                    >
                                      <span className="font-mono text-[10px] w-5 h-5 rounded-md bg-navy/40 flex items-center justify-center border border-gold/10 uppercase">
                                        {String.fromCharCode(65 + idx)}
                                      </span>
                                      <span className="flex-1">{option}</span>

                                      {isCorrectOption && (
                                        <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                                          Correct Answer
                                        </span>
                                      )}
                                      {isSelectedOption && !isCorrectOption && (
                                        <span className="text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                                          Your Choice
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Explanation block */}
                          {log.explanation && (
                            <div className="p-5 rounded-xl bg-gold/5 border border-gold/10 space-y-2">
                              <div className="flex items-center gap-2 text-gold">
                                <HelpCircle className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Detailed Explanation</span>
                              </div>
                              <p className="text-text-2 text-xs leading-relaxed font-serif italic">
                                {log.explanation}
                              </p>
                            </div>
                          )}

                          {/* Study Page redirect button */}
                          <div className="flex justify-end pt-2">
                            <button
                              onClick={() => navigate(`/courses/${log.courseId}/study`)}
                              className="px-4 py-2 rounded-xl bg-navy-high border border-gold/10 hover:border-gold/30 text-[9px] font-black uppercase tracking-widest text-gold hover:bg-gold/5 transition-all flex items-center gap-2"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Go to Study Area</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
