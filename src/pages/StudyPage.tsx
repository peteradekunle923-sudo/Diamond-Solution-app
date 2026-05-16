import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, doc, getDoc, getDocs, where, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ChevronLeft, CheckCircle, ArrowRight, ArrowLeft, Trophy, RotateCcw, XCircle, Info, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import axios from 'axios';

export default function StudyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { t, language } = useLanguage();
  const [course, setCourse] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [translatedContent, setTranslatedContent] = useState<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      if (!loading) navigate('/login');
      return;
    }

    let unsubQuestions: (() => void) | null = null;

    const setupQuestionsListener = () => {
      // Only sync questions if verified
      const q = query(collection(db, 'courses', id!, 'content'), orderBy('order', 'asc'));
      unsubQuestions = onSnapshot(q, async (snapshot) => {
        const fetchedQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setQuestions(fetchedQuestions);

        // Load Progress
        try {
          const progressRef = doc(db, 'studyProgress', `${user.uid}_${id}`);
          const progressSnap = await getDoc(progressRef);
          if (progressSnap.exists()) {
            const pData = progressSnap.data();
            if (pData.completed) {
               setShowResults(true);
               setScore(pData.score || { correct: 0, total: 0 });
            } else {
               setCurrentIndex(pData.currentIndex || 0);
               setScore(pData.score || { correct: 0, total: 0 });
               setSelectedAnswer(pData.selectedAnswer || null);
               setIsSubmitted(pData.isSubmitted || false);
            }
          }
        } catch (err) {
          console.error("Progress fetch error:", err);
        }

        setLoading(false);
      }, (error) => {
        console.error("Questions snapshot error:", error);
        handleFirestoreError(error, OperationType.GET, `courses/${id}/content`);
        setLoading(false);
      });
    };

    const verifyAccess = async () => {
      try {
        console.log("Verifying access for course:", id);
        if (!id) {
          console.error("No course ID provided");
          setLoading(false);
          return;
        }

        const d = await getDoc(doc(db, 'courses', id));
        if (d.exists()) {
          const courseData = d.data();
          setCourse(courseData);
          console.log("Course data found:", courseData);

          // If admin, bypass payment verification
          if (isAdmin) {
            console.log("User is admin, bypassing payment checkout");
            setPaymentVerified(true);
            setupQuestionsListener();
            return;
          }

          // Check if user has paid for this department
          let hasDeptPayment = false;
          if (courseData.department) {
            try {
              console.log("Checking department payment for:", courseData.department);
              const pq = query(
                collection(db, 'payments'),
                where('userId', '==', user.uid),
                where('dept_name', '==', courseData.department),
                where('status', '==', 'success')
              );
              const pd = await getDocs(pq);
              hasDeptPayment = !pd.empty;
              console.log("Dept payment query result:", hasDeptPayment);
            } catch (pErr) {
              console.warn("Department payment query failed (possibly no index or permissions):", pErr);
            }
          }
          
          // Also check for specific course payment (legacy or edge case)
          console.log("Checking specific payments...");
          let hasSpecificPayment = false;
          let hasDeptDocPayment = false;

          try {
            const specificPd = await getDoc(doc(db, 'payments', `${user.uid}_${id}`));
            hasSpecificPayment = specificPd.exists() && specificPd.data().status === 'success';
          } catch (sErr) {
            console.warn("Specific payment check failed:", sErr);
          }

          if (courseData.department) {
            try {
              const deptPayId = `dept_pay_${user.uid}_${courseData.department}`;
              const deptPd = await getDoc(doc(db, 'payments', deptPayId));
              hasDeptDocPayment = deptPd.exists() && deptPd.data().status === 'success';
            } catch (dErr) {
              console.warn("Dept doc payment check failed:", dErr);
            }
          }

          console.log("Final payment status:", { hasSpecificPayment, hasDeptDocPayment, hasDeptPayment });

          if (hasSpecificPayment || hasDeptPayment || hasDeptDocPayment) {
            setPaymentVerified(true);
            setupQuestionsListener();
          } else {
            console.log("Access denied: No valid payment found for user", user.uid);
            setLoading(false);
          }
        } else {
          console.error("Course document does not exist:", id);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Critical Verify Access failure:", err);
        handleFirestoreError(err, OperationType.GET, `courses/${id}`);
        setLoading(false);
      }
    };
    
    verifyAccess();

    return () => {
      if (unsubQuestions) unsubQuestions();
    };
  }, [id, user, isAdmin]);

  useEffect(() => {
    if (selectedAnswer !== null && !isSubmitted && !loading) {
      saveProgress({ selectedAnswer });
    }
  }, [selectedAnswer, isSubmitted, loading]);

  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    if (questions.length > 0 && Array.isArray(questions) && questions[currentIndex]) {
      const q = questions[currentIndex];
      setTimeLeft(q.type === 'application' ? 120 : 30);
    } else {
      setTimeLeft(30);
    }
  }, [currentIndex, questions]);

  useEffect(() => {
    if (loading || showResults || isSubmitted || questions.length === 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentIndex, isSubmitted, loading, showResults, questions.length]);

  useEffect(() => {
    const translateCurrentQuestion = async () => {
      if (language === 'en' || questions.length === 0 || !questions[currentIndex]) return;
      
      const currentQ = questions[currentIndex];
      if (translatedContent[currentQ.id]) return;

      try {
        setTranslationLoading(true);
        const [qTrans, optTrans, expTrans] = await Promise.all([
          axios.post('/api/translate', { text: currentQ.question, targetLang: 'French' }),
          axios.post('/api/translate', { text: currentQ.options, targetLang: 'French' }),
          currentQ.explanation ? axios.post('/api/translate', { text: currentQ.explanation, targetLang: 'French' }) : Promise.resolve({ data: { translated: '' } })
        ]);

        setTranslatedContent(prev => ({
          ...prev,
          [currentQ.id]: {
            question: qTrans.data.translated,
            options: optTrans.data.translated,
            explanation: expTrans.data.translated
          }
        }));
      } catch (err) {
        console.error("Auto-translation failed:", err);
      } finally {
        setTranslationLoading(false);
      }
    };

    translateCurrentQuestion();
  }, [currentIndex, questions, language, translatedContent]);

  const [sessionStartTime] = useState(Date.now());
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());

  // Timer for study duration
  useEffect(() => {
    if (loading || showResults || questions.length === 0) return;

    const syncInterval = setInterval(async () => {
      const now = Date.now();
      const durationSeconds = Math.floor((now - lastSyncTime) / 1000);
      if (durationSeconds >= 30) { // Sync every 30 seconds
        await updateStudyDuration(durationSeconds);
        setLastSyncTime(now);
      }
    }, 30000);

    return () => {
      clearInterval(syncInterval);
      const finalDuration = Math.floor((Date.now() - lastSyncTime) / 1000);
      if (finalDuration > 0) {
        updateStudyDuration(finalDuration);
      }
    };
  }, [loading, showResults, questions.length, lastSyncTime]);

  const updateStudyDuration = async (seconds: number) => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const practiceId = `${user.uid}_${today}`;
    const practiceRef = doc(db, 'dailyPractice', practiceId);

    try {
      const snap = await getDoc(practiceRef);
      if (snap.exists()) {
        const data = snap.data();
        await setDoc(practiceRef, {
          studyDuration: (data.studyDuration || 0) + seconds,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        await setDoc(doc(db, 'users', user.uid), { lastStudyDate: new Date().toISOString() }, { merge: true });
      } else {
        await setDoc(practiceRef, {
          userId: user.uid,
          date: today,
          studyDuration: seconds,
          attempted: 0,
          correct: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastNotificationCheck: new Date().toISOString()
        });
        await setDoc(doc(db, 'users', user.uid), { lastStudyDate: new Date().toISOString() }, { merge: true });
      }
    } catch (err) {
      console.error("Failed to sync study duration:", err);
    }
  };

  const updateDailyPractice = async (isCorrect: boolean) => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const practiceId = `${user.uid}_${today}`;
    const practiceRef = doc(db, 'dailyPractice', practiceId);

    try {
      const snap = await getDoc(practiceRef);
      const now = new Date().toISOString();
      if (snap.exists()) {
        const data = snap.data();
        await setDoc(practiceRef, {
          attempted: (data.attempted || 0) + 1,
          correct: (data.correct || 0) + (isCorrect ? 1 : 0),
          updatedAt: now
        }, { merge: true });
      } else {
        await setDoc(practiceRef, {
          userId: user.uid,
          date: today,
          attempted: 1,
          correct: isCorrect ? 1 : 0,
          createdAt: now,
          updatedAt: now,
          lastNotificationCheck: now
        });
      }
    } catch (err) {
      console.error("Failed to sync daily practice:", err);
    }
  };

  const handleAutoSubmit = () => {
    if (isSubmitted) return;
    
    setIsSubmitted(true);
    const newScore = {
      correct: score.correct,
      total: score.total + 1
    };
    
    setScore(newScore);
    saveProgress({
      currentIndex,
      score: newScore,
      isSubmitted: true,
      selectedAnswer: null
    });
    updateDailyPractice(false);
  };

  const saveProgress = async (updates: any) => {
    if (!user || !id) return;
    try {
      await setDoc(doc(db, 'studyProgress', `${user.uid}_${id}`), {
        userId: user.uid,
        courseId: id,
        updatedAt: new Date().toISOString(),
        ...updates
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `studyProgress/${user.uid}_${id}`);
    }
  };

  const handleSubmit = () => {
    const currentQ = questions[currentIndex];
    const isApplication = currentQ.type === 'application';
    if (!isApplication && selectedAnswer === null) return;
    
    const isCorrect = isApplication ? true : parseInt(selectedAnswer!) === currentQ.correctAnswer;
    
    const newScore = {
      correct: score.correct + (isCorrect ? 1 : 0),
      total: score.total + 1
    };
    
    setScore(newScore);
    setIsSubmitted(true);

    saveProgress({
      currentIndex,
      score: newScore,
      selectedAnswer: selectedAnswer || 'completed',
      isSubmitted: true
    });
    updateDailyPractice(isCorrect);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setSelectedAnswer(null);
      setIsSubmitted(false);

      const nextQ = questions[nextIndex];
      setTimeLeft(nextQ?.type === 'application' ? 120 : 30);

      saveProgress({
        currentIndex: nextIndex,
        selectedAnswer: null,
        isSubmitted: false
      });
    } else {
      setShowResults(true);
      saveProgress({ completed: true });
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      // When going back, we are in "review" mode for that question
      setSelectedAnswer(null); // Or load if we tracked them
      setIsSubmitted(true); // Treat previous as submitted/view-only
      saveProgress({ currentIndex: prevIndex });
    }
  };

  if (loading) return (
    <div className="h-screen bg-navy flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
    </div>
  );

  if (!paymentVerified && !loading) return (
    <div className="h-screen bg-navy flex flex-col items-center justify-center space-y-6 text-center px-6">
      <div className="w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center text-gold mb-4 border border-gold/20 shadow-[0_0_50px_rgba(201,147,10,0.1)]">
        <Lock className="w-10 h-10" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-serif font-black text-text-1">{t('access.restricted')}</h2>
        <p className="text-text-3 text-[10px] font-black uppercase tracking-[0.4em] max-w-sm mx-auto leading-relaxed">
          {t('access.restricted_desc')} {course?.department || ''}.
        </p>
      </div>
      <button 
        onClick={() => navigate(`/courses/${id}`)}
        className="btn btn-gold px-12 py-4 shadow-2xl shadow-gold/20 font-black text-[10px] uppercase tracking-widest"
      >
        {t('access.provision')}
      </button>
    </div>
  );

  if (questions.length === 0) return (
    <div className="h-screen bg-navy flex flex-col items-center justify-center p-6 text-center space-y-4">
      <Info className="w-16 h-16 text-gold/20" />
      <div className="space-y-1">
        <h2 className="text-xl font-serif font-black text-text-1">{t('study.noContent')}</h2>
        <p className="text-text-3 text-xs font-black uppercase tracking-widest leading-loose">{t('study.noContentDesc')}</p>
      </div>
      <button onClick={() => navigate(-1)} className="btn btn-gold px-8 py-3 mt-4">{t('general.back')}</button>
    </div>
  );

  if (showResults) {
    const pct = Math.round((score.correct / score.total) * 100);
    return (
      <div className="min-h-screen bg-navy flex flex-col items-center justify-center p-6 text-center">
         <motion.div 
           initial={{ scale: 0.9, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           className="card-luxury max-w-md w-full p-12 space-y-10"
         >
           <div className="space-y-4">
             <Trophy className="w-20 h-20 text-gold mx-auto drop-shadow-[0_0_20px_rgba(201,147,10,0.4)]" />
             <h2 className="text-3xl font-serif font-black text-text-1">{t('study.concluded')}</h2>
             <p className="text-text-3 text-[10px] font-black uppercase tracking-[0.4em]">{t('study.resultCard')}</p>
           </div>

           <div className="space-y-2">
             <p className="text-6xl font-serif font-black text-gold-light">{score.correct} / {score.total}</p>
             <p className="text-xl font-bold text-text-1">{pct}% {t('study.compliance')}</p>
           </div>

           <div className="w-full h-2 bg-navy-high rounded-full overflow-hidden">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${pct}%` }}
               className="h-full bg-gold"
             />
           </div>

           <div className="grid grid-cols-2 gap-4">
             <button onClick={() => {
               saveProgress({ completed: false, currentIndex: 0, score: { correct: 0, total: 0 }, isSubmitted: false, selectedAnswer: null });
               window.location.reload();
             }} className="btn btn-gold py-4">
               <RotateCcw className="w-4 h-4 mr-2" />
               {t('study.resync')}
             </button>
             <button onClick={() => navigate('/courses')} className="btn btn-ghost py-4 border-gold/20">
               {t('study.exit')}
             </button>
           </div>
         </motion.div>
      </div>
    );
  }

  const current = questions[currentIndex];
  const translated = (language === 'fr' && translatedContent[current?.id]) ? translatedContent[current.id] : null;

  const currentQuestionText = translated?.question || current?.question;
  const currentOptions = translated?.options || current?.options;
  const currentExplanation = translated?.explanation || current?.explanation;

  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="flex flex-col min-h-screen bg-navy text-text-1">
      {translationLoading && (
        <div className="fixed inset-0 z-[100] bg-navy/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
            <span className="text-[10px] font-black text-gold uppercase tracking-widest">{t('study.linguisticSync')}</span>
          </div>
        </div>
      )}
      <header className="sticky top-0 bg-navy-mid border-b border-gold/10 px-6 py-4 flex items-center justify-between z-30 shadow-2xl">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-xl bg-navy-high border border-gold/10 flex items-center justify-center text-text-3 hover:text-gold transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-serif font-black truncate max-w-[150px] sm:max-w-none">{course?.title}</h1>
            <p className="text-[9px] font-black text-gold uppercase tracking-widest mt-0.5">
              {t('study.questionStatus').replace('{n}', (currentIndex + 1).toString()).replace('{m}', questions.length.toString())}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isSubmitted && !showResults && (
            <div className={cn(
              "px-4 py-2 rounded-xl border font-mono text-[10px] font-black tracking-widest transition-all",
              timeLeft <= 10 ? "bg-red-500/10 border-red-500 text-red-500 animate-pulse" : "bg-white/5 border-white/10 text-text-1"
            )}>
              {timeLeft}s
            </div>
          )}
          <div className="px-4 py-2 bg-gold/10 rounded-xl border border-gold/20 font-black text-[10px] text-gold uppercase tracking-widest">
            Score: {score.correct}
          </div>
        </div>
      </header>

      <div className="h-1 bg-navy-mid w-full overflow-hidden">
        <motion.div 
          animate={{ width: `${progress}%` }}
          className="h-full bg-gold shadow-[0_0_10px_rgba(201,147,10,0.5)]"
        />
      </div>

      <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full pb-32">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
          >
            <div className="card-luxury p-10 bg-navy-mid/50 border-gold/20 shadow-2xl">
              <span className="text-[9px] font-black text-text-3 uppercase tracking-[0.4em] mb-4 block">{t('study.archiveQuery')} • {current.category || 'MCQ'}</span>
              <p className="text-xl md:text-2xl font-serif font-black text-text-1 leading-relaxed">
                {currentQuestionText}
              </p>
            </div>

            <div className="grid gap-4">
              {current.type === 'application' ? (
                <div className="w-full">
                  {!isSubmitted ? (
                    <div className="p-8 text-center bg-navy-mid/60 border border-gold/10 rounded-2xl">
                      <p className="text-gray-400 mb-6 text-sm">{t('study.applicationPrompt', 'Review the question and formulate your answer, then click below to reveal the expected response.')}</p>
                      <button 
                        onClick={handleSubmit}
                        className="h-14 px-8 bg-gold/10 hover:bg-gold/20 border border-gold/30 rounded-xl text-gold font-black text-xs uppercase tracking-widest transition-all"
                      >
                        Check Answer
                      </button>
                    </div>
                  ) : (
                    <div className="p-8 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-4">Expected Response provided by System</span>
                      <p className="text-sm md:text-base text-gray-200 leading-relaxed">
                        {current.answerText || current.explanation || 'No expected answer text provided.'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                currentOptions?.map((option: string, idx: number) => {
                  const isSelected = selectedAnswer === idx.toString();
                  const isCorrect = idx === current.correctAnswer;
                  let stateClasses = "border-gold/10 hover:border-gold/30 hover:bg-gold/5";

                  if (isSubmitted) {
                    if (isCorrect) stateClasses = "border-emerald-500 bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]";
                    else if (isSelected) stateClasses = "border-red-500 bg-red-500/10 text-red-500";
                    else stateClasses = "border-navy-border opacity-50";
                  } else if (isSelected) {
                    stateClasses = "border-gold bg-gold/10 text-gold shadow-[0_0_20px_rgba(201,147,10,0.1)]";
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isSubmitted}
                      onClick={() => setSelectedAnswer(idx.toString())}
                      className={cn(
                        "w-full p-6 bg-navy-mid/60 border rounded-[1.25rem] text-left transition-all duration-300 flex items-center gap-6 group",
                        stateClasses
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border transition-all",
                        isSelected || (isSubmitted && isCorrect) ? "bg-gold border-gold text-navy" : "bg-navy border-gold/20 text-text-3 group-hover:border-gold/40"
                      )}>
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className="text-base font-semibold flex-1 leading-snug">{option}</span>
                      {isSubmitted && (isCorrect ? <CheckCircle className="w-6 h-6 ml-2" /> : isSelected && <XCircle className="w-6 h-6 ml-2" />)}
                    </button>
                  );
                })
              )}
            </div>

            {isSubmitted && current.explanation && current.type !== 'application' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gold p-8 rounded-[2rem] space-y-4 shadow-2xl relative"
              >
                <div className="flex items-center gap-3">
                   <Info className="w-4 h-4 text-navy" />
                   <h4 className="text-[10px] font-black text-navy uppercase tracking-[0.3em]">{t('study.institutionalSynthesis')}</h4>
                </div>
                <p className="text-navy font-bold leading-relaxed text-sm">
                  {currentExplanation}
                </p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-6 md:p-8 bg-navy-mid/80 backdrop-blur-xl border-t border-gold/10 z-30 flex items-center justify-center">
        <div className="max-w-4xl w-full flex items-center justify-between gap-6">
           <div className="flex items-center gap-2">
             <button 
               onClick={handlePrev}
               disabled={currentIndex === 0}
               className="w-12 h-12 rounded-xl bg-navy-high border border-gold/10 flex items-center justify-center text-text-3 hover:text-gold transition-all disabled:opacity-20"
               title="View Previous Question"
             >
               <ArrowLeft className="w-5 h-5" />
             </button>
             <div className="hidden md:flex flex-col">
               <span className="text-[9px] font-black text-text-3 uppercase tracking-widest">{t('study.protocolStatus')}</span>
               <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
                 {isSubmitted ? t('study.synthesisComplete') : t('study.awaitingSelection')}
               </span>
             </div>
           </div>
           
           {!isSubmitted ? (
             <button 
               onClick={handleSubmit}
               disabled={!selectedAnswer && current.type !== 'application'}
               className="h-16 px-12 bg-gold disabled:opacity-30 rounded-2xl text-navy font-black text-xs uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all"
             >
               {current.type === 'application' ? 'Check Answer' : t('study.commitSolution')}
             </button>
           ) : (
             <button 
               onClick={handleNext}
               className="h-16 px-12 bg-gold rounded-2xl text-navy font-black text-xs uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-4"
             >
               {currentIndex === questions.length - 1 ? t('study.concludeSession') : t('study.nextQuery')}
               <ArrowRight className="w-4 h-4" />
             </button>
           )}
        </div>
      </footer>
    </div>
  );
}
