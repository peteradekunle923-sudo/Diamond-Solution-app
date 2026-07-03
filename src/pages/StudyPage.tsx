import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, doc, getDoc, getDocs, where, setDoc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ChevronLeft, CheckCircle, ArrowRight, ArrowLeft, Trophy, RotateCcw, XCircle, Info, Lock, BookOpen, Sparkles, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import axios from 'axios';

function playJoyfulSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    // Play a gorgeous, cascading pentatonic chime sequence lasting exactly 5 seconds
    const notes = [
      // 0 - 1 seconds: Gentle starting arpeggio (C Major Pentatonic)
      { f: 523.25, d: 2.0, t: 0.0 },   // C5
      { f: 659.25, d: 2.0, t: 0.2 },   // E5
      { f: 783.99, d: 2.0, t: 0.4 },   // G5
      { f: 880.00, d: 2.0, t: 0.6 },   // A5
      { f: 1046.50, d: 2.0, t: 0.8 },  // C6
      
      // 1 - 2 seconds: Shimmering high sequence
      { f: 783.99, d: 1.8, t: 1.2 },   // G5
      { f: 1046.50, d: 1.8, t: 1.4 },  // C6
      { f: 1318.51, d: 1.8, t: 1.6 },  // E6
      { f: 1567.98, d: 2.2, t: 1.8 },  // G6
      { f: 1760.00, d: 2.5, t: 2.0 },  // A6
      
      // 2 - 3.5 seconds: Elegant downward and upward ripples
      { f: 1318.51, d: 1.5, t: 2.4 },  // E6
      { f: 1046.50, d: 1.5, t: 2.6 },  // C6
      { f: 880.00, d: 1.5, t: 2.8 },   // A5
      { f: 783.99, d: 1.8, t: 3.0 },   // G5
      { f: 1046.50, d: 2.0, t: 3.2 },  // C6
      { f: 1318.51, d: 2.0, t: 3.4 },  // E6

      // 3.5 - 5 seconds: Grand finale crescendo ending on sparkling high C7
      { f: 1567.98, d: 1.5, t: 3.8 },  // G6
      { f: 1760.00, d: 1.5, t: 4.0 },  // A6
      { f: 2093.00, d: 2.5, t: 4.2 },  // C7 (Joyful climax)
      { f: 2637.02, d: 2.0, t: 4.4 }   // E7 (Sparkling peak)
    ];
    
    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      // 'sine' waves produce very pure, crystal-clear glass chime and bell tones
      osc.type = 'sine'; 
      osc.frequency.setValueAtTime(note.f, now + note.t);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + note.t);
      // Soft, non-harsh volume attack
      gain.gain.linearRampToValueAtTime(0.12, now + note.t + 0.06);
      // Gentle decay over the specified duration
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + note.d);
      
      // High-pass filter to keep notes warm and eliminate high piercing frequencies
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2500, now + note.t);
      
      osc.connect(gain);
      gain.connect(filter);
      filter.connect(ctx.destination);
      
      osc.start(now + note.t);
      osc.stop(now + note.t + note.d);
    });
  } catch (error) {
    console.warn("Web Audio API not supported or blocked by user gesture:", error);
  }
}

function BalloonContainer() {
  const [balloons, setBalloons] = useState<Array<{ id: number; left: number; delay: number; scale: number; color: string; duration: number }>>([]);

  useEffect(() => {
    const colors = [
      '#FBBF24', // Gold
      '#34D399', // Emerald
      '#F87171', // Red
      '#60A5FA', // Blue
      '#F472B6', // Pink
      '#A78BFA', // Purple
      '#FB923C'  // Orange
    ];
    
    const list = Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: 5 + Math.random() * 90, // percentage from left edge (5% to 95%)
      delay: Math.random() * 2.0, // spread start over first 2 seconds
      scale: 0.6 + Math.random() * 0.7,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 3.5 + Math.random() * 2.5 // each balloon takes 3.5 to 6 seconds to float up
    }));
    setBalloons(list);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[115]">
      {balloons.map((b) => (
        <motion.div
          key={b.id}
          initial={{ y: '110vh', x: 0, opacity: 0.9 }}
          animate={{
            y: '-15vh',
            x: [0, Math.sin(b.id) * 30, Math.cos(b.id) * 20, Math.sin(b.id) * 15],
            opacity: [0.9, 0.9, 0.8, 0]
          }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            ease: 'easeOut'
          }}
          style={{
            left: `${b.left}%`,
            scale: b.scale,
            position: 'absolute'
          }}
          className="flex flex-col items-center"
        >
          {/* Balloon main bubble */}
          <div 
            style={{ backgroundColor: b.color }}
            className="w-14 h-18 rounded-t-full rounded-b-[45px] relative shadow-lg flex items-center justify-center"
          >
            {/* Highlight overlay */}
            <div className="absolute top-2 left-3 w-3.5 h-5 bg-white/30 rounded-full filter blur-[0.5px]" />
            {/* Balloon knot */}
            <div 
              style={{ borderBottomColor: b.color }}
              className="absolute -bottom-[3px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] filter brightness-75"
            />
          </div>
          {/* Hanging string */}
          <div className="w-[1px] h-16 bg-white/30 mt-0.5" />
        </motion.div>
      ))}
    </div>
  );
}

export default function StudyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, profile } = useAuth();
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
  const [answers, setAnswers] = useState<Record<string, { selectedAnswer: string | null; isSubmitted: boolean }>>({});
  const [allRanges, setAllRanges] = useState<Array<{ start: number; end: number | null; text: string }>>([]);
  const [activeRange, setActiveRange] = useState<{ start: number; end: number | null; text: string } | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showBalloons, setShowBalloons] = useState(false);

  useEffect(() => {
    if (showCompletionModal) {
      setShowBalloons(true);
      playJoyfulSound();
      const timer = setTimeout(() => {
        setShowBalloons(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showCompletionModal]);

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
        const fetchedQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((q: any) => !q.isDeleted);
        setQuestions(fetchedQuestions);

        // Load Progress
        try {
          const progressRef = doc(db, 'studyProgress', `${user.uid}_${id}`);
          const progressSnap = await getDoc(progressRef);
          if (progressSnap.exists()) {
            const pData = progressSnap.data();
            const savedAnswers = pData.answers || {};
            setAnswers(savedAnswers);

            // Recompute score to be 100% accurate
            let correctCount = 0;
            let totalCount = 0;
            fetchedQuestions.forEach((q: any) => {
              const ans = savedAnswers[q.id];
              if (ans && ans.isSubmitted) {
                totalCount++;
                const isCorrect = q.type === 'application' ? true : parseInt(ans.selectedAnswer) === q.correctAnswer;
                if (isCorrect) correctCount++;
              }
            });
            setScore({ correct: correctCount, total: totalCount });

            if (pData.completed) {
               setShowResults(true);
            } else {
               const savedIndex = pData.currentIndex || 0;
               setCurrentIndex(savedIndex);

               // Load state for this index
               const qId = fetchedQuestions[savedIndex]?.id;
               if (qId && savedAnswers[qId]) {
                 setSelectedAnswer(savedAnswers[qId].selectedAnswer);
                 setIsSubmitted(savedAnswers[qId].isSubmitted);
               } else {
                 setSelectedAnswer(null);
                 setIsSubmitted(false);
               }
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
        if (d.exists() && !d.data()?.isDeleted) {
          const courseData = d.data();
          setCourse(courseData);
          console.log("Course data found:", courseData);

          // If admin or has global course access, bypass payment verification
          if (isAdmin) {
            console.log("User is admin or has global payment access, bypassing payment checkout");
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
  }, [id, user, isAdmin, profile]);

  useEffect(() => {
    if (course && course.objectives) {
      const ranges: Array<{ start: number; end: number | null; text: string }> = [];
      course.objectives.split('\n').forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const r = extractQuestionRangeInStudy(trimmed);
        if (r) {
          ranges.push({
            start: r.start,
            end: r.end,
            text: trimmed
          });
        }
      });
      setAllRanges(ranges);

      // Try to load active range from sessionStorage
      const stored = sessionStorage.getItem(`active_study_range_${id}`);
      if (stored) {
        try {
          setActiveRange(JSON.parse(stored));
        } catch (e) {
          console.warn("Failed to parse active range from sessionStorage:", e);
        }
      }
    }
  }, [course, id]);

  function extractQuestionRangeInStudy(text: string): { start: number; end: number | null } | null {
    const patterns = [
      /(?:questions?|qn?|q)\s*(\d+)\s*(?:-|to|–)\s*(?:questions?|qn?|q)?\s*(\d+)/i,
      /[(\[]\s*(\d+)\s*(?:-|to|–)\s*(\d+)\s*[)\]]/,
      /(\d+)\s*(?:-|to|–)\s*(\d+)/
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = parseInt(match[2], 10);
        if (!isNaN(start) && !isNaN(end)) {
          return { start, end };
        }
      }
    }

    const singleRegex = /(?:questions?|qn?|q)\s*(\d+)/i;
    const singleMatch = text.match(singleRegex);
    if (singleMatch) {
      const start = parseInt(singleMatch[1], 10);
      if (!isNaN(start)) {
        return { start, end: null };
      }
    }

    return null;
  }

  useEffect(() => {
    if (selectedAnswer !== null && !isSubmitted && !loading && questions[currentIndex]) {
      const qId = questions[currentIndex].id;
      const updatedAnswers = {
        ...answers,
        [qId]: { selectedAnswer, isSubmitted: false }
      };
      setAnswers(updatedAnswers);
      saveProgress({
        answers: updatedAnswers,
        currentIndex
      });
    }
  }, [selectedAnswer, isSubmitted, loading]);

  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    if (questions.length > 0 && Array.isArray(questions) && questions[currentIndex]) {
      const q = questions[currentIndex];
      setTimeLeft(q.type === 'application' ? 120 : 60);
    } else {
      setTimeLeft(60);
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
  const lastSyncTimeRef = useRef(Date.now());

  // Timer for study duration
  useEffect(() => {
    if (loading || showResults || questions.length === 0) return;

    // Reset sync time when active studying starts
    lastSyncTimeRef.current = Date.now();

    const syncInterval = setInterval(async () => {
      const now = Date.now();
      const durationSeconds = Math.floor((now - lastSyncTimeRef.current) / 1000);
      if (durationSeconds >= 30) { // Sync every 30 seconds
        await updateStudyDuration(durationSeconds);
        lastSyncTimeRef.current = now;
      }
    }, 15000); // Check more frequently to be highly robust

    return () => {
      clearInterval(syncInterval);
      const finalDuration = Math.floor((Date.now() - lastSyncTimeRef.current) / 1000);
      if (finalDuration > 0) {
        updateStudyDuration(finalDuration);
      }
    };
  }, [loading, showResults, questions.length]);

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
    
    const currentQ = questions[currentIndex];
    
    const updatedAnswers = {
      ...answers,
      [currentQ.id]: { selectedAnswer: null, isSubmitted: true }
    };
    setAnswers(updatedAnswers);
    setIsSubmitted(true);

    let correctCount = 0;
    let totalCount = 0;
    questions.forEach((q: any) => {
      const ans = updatedAnswers[q.id];
      if (ans && ans.isSubmitted) {
        totalCount++;
        const isCorrectQ = q.type === 'application' ? true : parseInt(ans.selectedAnswer!) === q.correctAnswer;
        if (isCorrectQ) correctCount++;
      }
    });
    const newScore = { correct: correctCount, total: totalCount };
    setScore(newScore);

    saveProgress({
      currentIndex,
      answers: updatedAnswers,
      score: newScore,
      isSubmitted: true
    });
    updateDailyPractice(false);
    logStudyActivity(currentQ, null, false);
  };

  const logStudyActivity = async (question: any, selectedAns: string | null, isCorrect: boolean) => {
    if (!user || !id || !question) return;
    try {
      // Clean data to prevent undefined values which crash Firestore addDoc calls
      const logData = {
        userId: user.uid,
        courseId: id,
        courseTitle: course?.title || 'Course',
        questionId: question.id || '',
        questionText: question.question || question.text || 'No question text',
        options: Array.isArray(question.options) ? question.options : [],
        selectedAnswer: selectedAns !== undefined ? selectedAns : null,
        correctAnswer: typeof question.correctAnswer === 'number' ? question.correctAnswer : null,
        isCorrect: !!isCorrect,
        explanation: question.explanation || question.answerText || '',
        type: question.type || 'mcq',
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(db, 'activityLogs'), logData);
    } catch (err) {
      console.error("Failed to log study activity:", err);
    }
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
    
    const updatedAnswers = {
      ...answers,
      [currentQ.id]: { selectedAnswer: selectedAnswer || 'completed', isSubmitted: true }
    };
    setAnswers(updatedAnswers);
    setIsSubmitted(true);

    let correctCount = 0;
    let totalCount = 0;
    questions.forEach((q: any) => {
      const ans = updatedAnswers[q.id];
      if (ans && ans.isSubmitted) {
        totalCount++;
        const isCorrectQ = q.type === 'application' ? true : parseInt(ans.selectedAnswer!) === q.correctAnswer;
        if (isCorrectQ) correctCount++;
      }
    });
    const newScore = { correct: correctCount, total: totalCount };
    setScore(newScore);

    saveProgress({
      currentIndex,
      answers: updatedAnswers,
      score: newScore,
      isSubmitted: true
    });
    updateDailyPractice(isCorrect);
    logStudyActivity(currentQ, selectedAnswer, isCorrect);
  };

  const handleProceedToNextSection = (targetRange: typeof activeRange) => {
    if (!targetRange) return;
    
    // Update sessionStorage
    sessionStorage.setItem(`active_study_range_${id}`, JSON.stringify(targetRange));
    setActiveRange(targetRange);
    setShowCompletionModal(false);

    // Jump to the start of the next range
    const nextIdx = targetRange.start - 1;
    if (nextIdx >= 0 && nextIdx < questions.length) {
      const nextQ = questions[nextIdx];
      const savedNext = answers[nextQ.id] || { selectedAnswer: null, isSubmitted: false };

      setCurrentIndex(nextIdx);
      setSelectedAnswer(savedNext.selectedAnswer);
      setIsSubmitted(savedNext.isSubmitted);
      setTimeLeft(nextQ?.type === 'application' ? 120 : 60);

      saveProgress({
        currentIndex: nextIdx,
        isSubmitted: savedNext.isSubmitted
      });
    }
  };

  const handleContinueNormally = () => {
    setShowCompletionModal(false);
    // Clear active range so they are in general practice now
    sessionStorage.removeItem(`active_study_range_${id}`);
    setActiveRange(null);
    
    // Perform normal next transition
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextQ = questions[nextIndex];
      const savedNext = answers[nextQ.id] || { selectedAnswer: null, isSubmitted: false };

      setCurrentIndex(nextIndex);
      setSelectedAnswer(savedNext.selectedAnswer);
      setIsSubmitted(savedNext.isSubmitted);
      setTimeLeft(nextQ?.type === 'application' ? 120 : 60);

      saveProgress({
        currentIndex: nextIndex,
        isSubmitted: savedNext.isSubmitted
      });
    } else {
      setShowResults(true);
      saveProgress({ completed: true });
    }
  };

  const handleNext = () => {
    const isAtEndOfRange = activeRange && (
      (activeRange.end && currentIndex + 1 === activeRange.end) ||
      (!activeRange.end && currentIndex + 1 === activeRange.start) ||
      (currentIndex === questions.length - 1)
    );

    if (isAtEndOfRange) {
      setShowCompletionModal(true);
      return;
    }

    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextQ = questions[nextIndex];
      const savedNext = answers[nextQ.id] || { selectedAnswer: null, isSubmitted: false };

      setCurrentIndex(nextIndex);
      setSelectedAnswer(savedNext.selectedAnswer);
      setIsSubmitted(savedNext.isSubmitted);
      setTimeLeft(nextQ?.type === 'application' ? 120 : 60);

      saveProgress({
        currentIndex: nextIndex,
        isSubmitted: savedNext.isSubmitted
      });
    } else {
      setShowResults(true);
      saveProgress({ completed: true });
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      const prevQ = questions[prevIndex];
      const savedPrev = answers[prevQ.id] || { selectedAnswer: null, isSubmitted: false };

      setCurrentIndex(prevIndex);
      setSelectedAnswer(savedPrev.selectedAnswer);
      setIsSubmitted(savedPrev.isSubmitted);

      saveProgress({
        currentIndex: prevIndex,
        isSubmitted: savedPrev.isSubmitted
      });
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
            <button onClick={async () => {
                try {
                  if (user?.uid && id) {
                    await deleteDoc(doc(db, 'studyProgress', `${user.uid}_${id}`));
                  }
                } catch (err) {
                  console.error("Error clearing progress:", err);
                }
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
      {/* Outline Section Completion Modal */}
      <AnimatePresence>
        {showCompletionModal && activeRange && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-navy/95 backdrop-blur-md overflow-y-auto flex justify-center items-start p-4 sm:p-6 md:p-10"
          >
            {showBalloons && <BalloonContainer />}
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="card-luxury max-w-xl w-full p-6 sm:p-10 space-y-6 sm:space-y-8 bg-gradient-to-b from-navy-mid to-navy shadow-[0_50px_100px_rgba(0,0,0,0.8)] border-gold/20 my-auto"
            >
              {(() => {
                // Calculate score only for this specific active range
                const rangeStartIdx = activeRange.start - 1;
                const rangeQuestions = questions.slice(
                  Math.max(0, rangeStartIdx), 
                  Math.min(questions.length, activeRange.end ? activeRange.end : rangeStartIdx + 1)
                );
                
                let rangeCorrect = 0;
                let rangeAttempted = 0;
                rangeQuestions.forEach((q) => {
                  const ans = answers[q.id];
                  if (ans && ans.selectedAnswer !== null) {
                    rangeAttempted++;
                    const isCorrect = q.type === 'application' ? true : parseInt(ans.selectedAnswer) === q.correctAnswer;
                    if (isCorrect) {
                      rangeCorrect++;
                    }
                  }
                });
                
                const rangeTotal = rangeQuestions.length;
                const rangePercent = rangeTotal > 0 ? Math.round((rangeCorrect / rangeTotal) * 100) : 0;
                
                // Get next range if it exists
                const currentRangeIndex = allRanges.findIndex(r => r.start === activeRange.start && r.end === activeRange.end);
                const nextRange = currentRangeIndex !== -1 && currentRangeIndex < allRanges.length - 1 ? allRanges[currentRangeIndex + 1] : null;

                // Select a beautiful motivational heading and subtitle based on performance
                let heading = "Excellent Progress, Scholar!";
                let congratsMsg = "You have successfully conquered this section of the course outline.";
                if (rangePercent >= 90) {
                  heading = "Outstanding Mastery!";
                  congratsMsg = "A stellar, flawless exhibition of academic brilliance! You have thoroughly mastered this outline section.";
                } else if (rangePercent >= 70) {
                  heading = "Academic Excellence achieved!";
                  congratsMsg = "Remarkable understanding displayed. You are well on your way to complete mastery of this subject.";
                }

                return (
                  <div className="space-y-8">
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold mx-auto shadow-lg shadow-gold/5">
                        <Sparkles className="w-8 h-8 animate-pulse text-gold" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">Section Mastered</span>
                        <h3 className="text-3xl font-serif font-black text-white leading-tight">{heading}</h3>
                        <p className="text-text-3 text-xs max-w-sm mx-auto leading-relaxed mt-2">{congratsMsg}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-navy bg-opacity-40 p-5 rounded-2xl border border-gold/10 flex flex-col justify-center items-center text-center space-y-1">
                        <span className="text-[9px] font-black text-text-3 uppercase tracking-wider">Outline Score</span>
                        <p className="text-3xl font-serif font-black text-gold">
                          {rangeCorrect} <span className="text-sm font-sans font-medium text-text-3">/ {rangeTotal}</span>
                        </p>
                        <span className="text-[9px] font-black text-gold-light tracking-wide bg-gold/10 px-2 py-0.5 rounded-full mt-1">
                          Correct Answers
                        </span>
                      </div>

                      <div className="bg-navy bg-opacity-40 p-5 rounded-2xl border border-gold/10 flex flex-col justify-center items-center text-center space-y-1">
                        <span className="text-[9px] font-black text-text-3 uppercase tracking-wider">Mastery Rate</span>
                        <p className="text-3xl font-serif font-black text-emerald-400">
                          {rangePercent}%
                        </p>
                        <span className="text-[9px] font-black text-emerald-400/80 tracking-wide bg-emerald-500/10 px-2 py-0.5 rounded-full mt-1">
                          Objective Sync
                        </span>
                      </div>
                    </div>

                    <div className="bg-navy bg-opacity-30 p-6 rounded-2xl border border-white/5 space-y-2.5">
                      <span className="text-[9px] font-black text-text-3 uppercase tracking-widest block">Completed Outline Section:</span>
                      <p className="text-xs font-bold text-gold-light leading-relaxed italic">
                        "{activeRange.text}"
                      </p>
                    </div>

                    {/* Scholastic Motivation Card */}
                    <div className="p-6 bg-gold/[0.02] border border-gold/10 rounded-2xl relative overflow-hidden text-center space-y-2">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gold" />
                      <span className="text-[8px] font-black text-gold uppercase tracking-[0.3em] block">Scholar Motivation</span>
                      <p className="text-xs text-text-2 leading-relaxed italic">
                        "Remember, scholar, consistency is the foundation of true academic excellence. Every outline mastered is another stone laid in the castle of your intellectual future. Keep pushing for greatness!"
                      </p>
                    </div>

                    {nextRange ? (
                      <div className="space-y-6">
                        <div className="p-5 bg-navy-mid/60 border border-white/5 rounded-2xl space-y-2">
                          <span className="text-[9px] font-black text-text-3 uppercase tracking-widest block">Next Outline in Sequence:</span>
                          <p className="text-xs font-bold text-text-2 leading-relaxed">
                            "{nextRange.text}"
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                          <button 
                            onClick={() => handleProceedToNextSection(nextRange)}
                            className="h-14 bg-gold hover:bg-gold-light rounded-xl text-navy font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Proceed to Next Section</span>
                          </button>
                          <button 
                            onClick={() => navigate(`/courses/${id}`)}
                            className="h-14 bg-navy-high hover:bg-navy-high/80 border border-gold/10 hover:border-gold/30 rounded-xl text-gold font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center"
                          >
                            Return to Outlines List
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="p-5 bg-navy-mid/60 border border-white/5 rounded-2xl text-center">
                          <p className="text-xs font-bold text-emerald-400">
                            Excellent job, Scholar! You have successfully completed all designated course outline sections!
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                          <button 
                            onClick={() => {
                              setShowCompletionModal(false);
                              setShowResults(true);
                              saveProgress({ completed: true });
                            }}
                            className="h-14 bg-gold hover:bg-gold-light rounded-xl text-navy font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2"
                          >
                            <Trophy className="w-3.5 h-3.5" />
                            <span>View Final Results</span>
                          </button>
                          <button 
                            onClick={() => navigate(`/courses/${id}`)}
                            className="h-14 bg-navy-high hover:bg-navy-high/80 border border-gold/10 hover:border-gold/30 rounded-xl text-gold font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center"
                          >
                            Return to Outlines List
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <button onClick={() => navigate(`/courses/${id}`)} className="w-10 h-10 rounded-xl bg-navy-high border border-gold/10 flex items-center justify-center text-text-3 hover:text-gold transition-all">
            <ChevronLeft className="w-5 h-5 relative right-[1px]" />
          </button>
          <div>
            <h1 className="text-xs sm:text-sm font-serif font-black text-text-1 leading-tight">{course?.title}</h1>
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

      <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full pb-16 md:pb-8">
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

      <footer className="sticky md:relative bottom-0 left-0 right-0 p-6 md:p-8 bg-navy-mid/95 border-t border-gold/10 z-30 flex items-center justify-center">
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
