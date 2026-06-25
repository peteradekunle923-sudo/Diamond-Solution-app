import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { ChevronLeft, Lock, Play, CheckCircle2, ShieldCheck, Share2, Award, Zap, BookOpen, RotateCcw, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { motion } from 'motion/react';
import axios from 'axios';
import { usePaystackPayment } from 'react-paystack';
import { DEPARTMENT_PRICES } from '../constants';

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [paying, setPaying] = useState(false);
  const [course, setCourse] = useState<any>(null);
  const [hasPaid, setHasPaid] = useState(false);
  const [loading, setLoading] = useState(true);

  const [questions, setQuestions] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [customStartNum, setCustomStartNum] = useState<string>('');
  const [initiating, setInitiating] = useState(false);

  const [facultyPrice, setFacultyPrice] = useState({ ngn: 10000, usd: 7 });
  const userCurrency = profile?.currency || 'NGN';
  
  const displayPrice = userCurrency === 'USD' ? facultyPrice.usd : facultyPrice.ngn;
  const paystackAmount = displayPrice * 100;

  const config: any = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || '',
    amount: paystackAmount,
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder',
    currency: userCurrency,
    metadata: {
      custom_fields: [
        {
          display_name: "Department",
          variable_name: "department",
          value: course?.department || ""
        },
        {
          display_name: "User ID",
          variable_name: "user_id",
          value: user?.uid || ""
        }
      ]
    }
  };

  const initializePayment = usePaystackPayment(config);

  useEffect(() => {
    const fetchCourseAndPrice = async () => {
      const d = await getDoc(doc(db, 'courses', id!));
      if (d.exists()) {
        const courseData = d.data();
        setCourse(courseData);

        // Check if user has paid for this course/department
        let userHasPaidLocal = false;
        if (user) {
          if (isAdmin) {
            userHasPaidLocal = true;
          } else {
            // Check if user has paid for THIS specific department using deterministic ID
            const paymentId = `dept_pay_${user.uid}_${courseData.department}`;
            const pd = await getDoc(doc(db, 'payments', paymentId));
            const legacyPaymentId = `${user.uid}_${id}`;
            const legacyPd = await getDoc(doc(db, 'payments', legacyPaymentId));
            
            if ((pd.exists() && pd.data()?.status === 'success') || (legacyPd.exists() && legacyPd.data()?.status === 'success')) {
               userHasPaidLocal = true;
            }
          }
        }

        setHasPaid(userHasPaidLocal);

        // Fetch course questions content subcollection ONLY if they have paid / authorized to prevent permissions errors
        if (userHasPaidLocal) {
          try {
            const qSnap = await getDocs(query(collection(db, 'courses', id!, 'content'), orderBy('order', 'asc')));
            const fetchedQuestions = qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setQuestions(fetchedQuestions);
          } catch (err) {
            console.error("Failed to fetch course content queries:", err);
          }
        } else {
          setQuestions([]);
        }

        // Fetch price from faculties collection if it exists, else from constants
        const facultySnap = await getDocs(query(collection(db, 'faculties'), where('name', '==', courseData.department)));
        if (!facultySnap.empty) {
          const fData = facultySnap.docs[0].data();
          setFacultyPrice({
            ngn: fData.price || 10000,
            usd: fData.priceUSD || Math.ceil((fData.price || 10000) / 1500)
          });
        } else if (DEPARTMENT_PRICES[courseData.department]) {
          setFacultyPrice(DEPARTMENT_PRICES[courseData.department]);
        }
        
        if (user) {
          // Fetch studyProgress if exists
          try {
            const progressRef = doc(db, 'studyProgress', `${user.uid}_${id}`);
            const progressSnap = await getDoc(progressRef);
            if (progressSnap.exists()) {
              setProgress(progressSnap.data());
            }
          } catch (progressErr) {
            console.error("Failed to fetch user progress:", progressErr);
          }
        }
      }
      setLoading(false);
    };
    fetchCourseAndPrice();
  }, [id, user, isAdmin, profile]);

  const handleStartProtocol = async (startIndex: number, clearState: boolean) => {
    if (!user) return navigate('/login');
    setInitiating(true);
    try {
      const progressRef = doc(db, 'studyProgress', `${user?.uid}_${id}`);
      if (clearState) {
        await setDoc(progressRef, {
          userId: user.uid,
          courseId: id,
          currentIndex: 0,
          completed: false,
          answers: {},
          score: { correct: 0, total: 0 },
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else {
        await setDoc(progressRef, {
          userId: user.uid,
          courseId: id,
          currentIndex: startIndex,
          completed: false,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      navigate(`/courses/${id}/study`);
    } catch (err) {
      console.error("Error launching study protocol:", err);
      navigate(`/courses/${id}/study`);
    } finally {
      setInitiating(false);
    }
  };

  const handleOutlineClick = (range: { start: number; end: number | null; text: string }) => {
    if (!hasPaid) {
      handlePayment();
      return;
    }

    if (range.start < 1) {
      alert("Invalid starting question number detected.");
      return;
    }

    sessionStorage.setItem(`active_study_range_${id}`, JSON.stringify(range));
    handleStartProtocol(range.start - 1, false);
  };

  const onSuccess = async (reference: any) => {
    if (!user || !course || !profile) return;
    setPaying(true);
    
    try {
      const paymentId = `dept_pay_${user.uid}_${course.department}`;
      
      const existingDoc = await getDoc(doc(db, 'payments', paymentId));
      if (existingDoc.exists() && existingDoc.data()?.status === 'success') {
        alert("Department access already acquired.");
        setHasPaid(true);
        setPaying(false);
        return;
      }

      // Handle Affiliate Sync Calculation
      let referrerUid = profile.referredByUid;
      let referrerSnapData: any = null;

      if (!referrerUid && profile.referredBy) {
        let refCode = String(profile.referredBy).trim().toUpperCase().replace('-', '');
        if (!refCode.startsWith('DS')) {
          refCode = 'DS' + refCode;
        }
        const legacyRefCode = 'DS-' + refCode.substring(2);
        const referrerQuery = query(collection(db, 'users'), where('referralCode', 'in', [refCode, legacyRefCode]), limit(1));
        const referrerSnap = await getDocs(referrerQuery);
        if (!referrerSnap.empty) {
          referrerUid = referrerSnap.docs[0].id;
          referrerSnapData = referrerSnap.docs[0].data();
          try { await setDoc(doc(db, 'users', user.uid), { referredByUid: referrerUid }, { merge: true }); } catch (err) {}
        }
      }

      let referrerEmail = "";
      let referrerName = "";
      let finalCommissionValue = 0;
      let referrerCurrency = 'NGN';

      if (referrerUid) {
        const referrerDoc = referrerSnapData ? null : await getDoc(doc(db, 'users', referrerUid));
        const referrerData = referrerSnapData || referrerDoc?.data() || {};
        referrerCurrency = referrerData.currency || 'NGN';
        const commissionRate = 0.25;
        let commissionAmount = displayPrice * commissionRate;
        const NGN_TO_USD = 1500;
        
        let normalizedCommission = commissionAmount;
        if (userCurrency !== referrerCurrency) {
          if (userCurrency === 'USD' && referrerCurrency === 'NGN') normalizedCommission = commissionAmount * NGN_TO_USD;
          else if (userCurrency === 'NGN' && referrerCurrency === 'USD') normalizedCommission = commissionAmount / NGN_TO_USD;
        }
        if (referrerCurrency === 'NGN') normalizedCommission = Math.floor(normalizedCommission);

        referrerEmail = referrerData.email || "";
        referrerName = referrerData.displayName || "Affiliate";
        finalCommissionValue = normalizedCommission;
      }

      let finalRef = '';
      if (typeof reference === 'string') finalRef = reference;
      else if (reference && typeof reference === 'object') finalRef = reference.reference || reference.transaction || reference.trans || reference.trxref;

      // Use backend for verification and email dispatch
      const response = await axios.post('/api/verify-departmental-payment', {
        reference: finalRef,
        userId: user.uid,
        department: course.department,
        amount: displayPrice,
        currency: userCurrency,
        courseId: id,
        userData: profile,
        referrerEmail,
        referrerName,
        finalCommissionValue,
        referrerId: referrerUid
      });

      if (response.data.success) {
        // Record payment locally
        await setDoc(doc(db, 'payments', paymentId), {
          id: paymentId,
          userId: user.uid,
          amount: displayPrice,
          currency: userCurrency,
          status: 'success',
          type: 'department_access',
          dept_name: course.department,
          department: course.department,
          reference: reference.reference || reference,
          courseId: id,
          studentName: profile.displayName || 'Scholar',
          email: user.email || 'no-email',
          paidAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });

        // Mark user as paid
        await setDoc(doc(db, 'users', user.uid), {
          hasPaidCourse: true,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Record affiliate commission
        if (referrerUid) {
          const commissionId = `comm_${paymentId}`;
          await setDoc(doc(db, 'affiliates', commissionId), {
            id: commissionId,
            referrerUid: referrerUid,
            referrerName: referrerName,
            referredUid: user.uid,
            referredName: profile.displayName || 'Scholar',
            paymentAmount: displayPrice,
            paymentCurrency: userCurrency,
            commissionAmount: finalCommissionValue,
            commissionCurrency: referrerCurrency,
            commissionRate: 0.25,
            status: 'success',
            createdAt: new Date().toISOString()
          });
        }

        alert('Institutional Access Granted! Launching study protocol...');
        setHasPaid(true);
        // Auto-launch the course
        handleStartProtocol(0, false);
      } else {
        alert('Payment verification failed. Please contact support.');
      }
    } catch (err: any) {
      console.error('Course payment error:', err);
      alert('Error verifying payment: ' + (err.response?.data?.error || err.message));
    } finally {
      setPaying(false);
    }
  };

  const onClose = () => {
    setPaying(false);
  };

  const handlePayment = () => {
    if (paying) return;
    if (!user) return navigate('/login');
    
    if (!import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY === 'pk_test_placeholder') {
      if (window.confirm("DEBUG MODE: Paystack key missing. SIMULATE course purchase?")) {
        onSuccess({ reference: 'sim_course_' + Date.now() });
      }
      return;
    }

    setPaying(true);
    // Tiny delay to ensure we don't hold the UI thread while the hook function is accessed
    setTimeout(() => {
      initializePayment({ onSuccess, onClose });
    }, 100);
  };

  if (loading) return (
    <div className="h-screen bg-navy flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
    </div>
  );
  
  if (!course) return (
    <div className="h-screen bg-navy flex flex-col items-center justify-center space-y-4">
      <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 border border-red-500/20">
        <ShieldCheck className="w-8 h-8" />
      </div>
      <p className="text-text-3 font-black uppercase tracking-widest text-xs">{t('course.notFound')}</p>
      <button onClick={() => navigate(-1)} className="btn btn-gold px-8 py-3">{t('general.back')}</button>
    </div>
  );

  return (
    <Layout>
      <div className="pt-8 px-6 max-w-4xl mx-auto w-full relative z-20">
        <button 
          onClick={() => navigate('/courses')}
          className="w-10 h-10 md:w-12 md:h-12 bg-navy-mid/80 backdrop-blur-xl border border-gold/20 rounded-2xl flex items-center justify-center text-gold hover:bg-gold hover:text-navy transition-all shadow-xl"
        >
          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 relative right-[1px]" />
        </button>
      </div>

      <div className="px-3 pt-8 relative z-10 space-y-12 pb-24 max-w-4xl mx-auto w-full">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-luxury p-10 bg-gradient-to-br from-navy-card to-navy-mid shadow-[0_50px_100px_rgba(0,0,0,0.6)]"
        >
          <div className="space-y-10">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-light bg-gold/10 px-4 py-2 rounded-xl border border-gold/20 shadow-lg">
                  {t(`dept.${course.department}`)}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-text-3 bg-navy-high/50 px-4 py-2 rounded-xl border border-gold/10">
                  {course.level} {t('course.level')}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-black text-text-1 leading-tight tracking-tight drop-shadow-2xl">
                {course.title}
              </h2>
            </div>
            
            <p className="text-text-2 leading-relaxed text-lg font-medium opacity-90 border-l-2 border-gold/20 pl-6 italic">
              {course.description || "Synthesize your academic competence with expert-reviewed examination protocols and exhaustive logical explanations curated by Diamond's internal collegiate board."}
            </p>
            
            <div className="grid grid-cols-3 gap-6 py-10 border-y border-gold/10">
              <Feature icon={Award} label={t('course.status')} value={t('course.institutional')} />
              <Feature icon={ShieldCheck} label={t('course.security')} value={t('course.encrypted')} />
              <Feature icon={Share2} label={t('course.endowment')} value={t('course.yield')} />
            </div>

            <div className="pt-4">
              {hasPaid ? (
                <div className="space-y-6">
                  {/* Protocol Initiation Dashboard */}
                  <div className="bg-navy bg-opacity-40 p-6 rounded-2xl border border-gold/10 space-y-4 text-left">
                    <span className="text-[10px] font-black text-gold uppercase tracking-[0.3em] block mb-2">Protocol Launch Configurations</span>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {/* Option 1: Resume */}
                      <button 
                        onClick={() => handleStartProtocol(progress?.currentIndex || 0, false)}
                        className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                          progress?.completed
                            ? 'opacity-40 border-gold/5 cursor-not-allowed bg-transparent'
                            : 'bg-navy-mid border-gold/20 hover:border-gold/40 hover:bg-navy-mid/70'
                        }`}
                        disabled={progress?.completed || initiating}
                      >
                        <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center text-gold flex-shrink-0">
                          <Play className="w-4 h-4 fill-gold" />
                        </div>
                        <div className="truncate flex-1">
                          <span className="text-[10px] font-black text-text-1 uppercase tracking-widest block">Resume Session</span>
                          <span className="text-[10px] font-semibold text-text-3 block truncate">
                            {progress?.completed ? 'Session Concluded' : `Continue from Question ${(progress?.currentIndex || 0) + 1}`}
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Option 3: Custom Number */}
                    <div className="pt-4 border-t border-gold/10 flex flex-col md:flex-row gap-4 items-stretch md:items-end justify-between">
                      <div className="flex-1 min-w-0">
                        <label className="text-[9px] font-black text-[#9facb9] uppercase tracking-widest block mb-2">
                          Custom Start Question Number (1 - {questions.length || 1})
                        </label>
                        <input 
                          type="number"
                          min="1"
                          max={questions.length || 1}
                          value={customStartNum}
                          onChange={(e) => setCustomStartNum(e.target.value)}
                          placeholder="e.g. 5"
                          className="w-full h-11 bg-navy-high border border-gold/10 focus:border-gold/40 rounded-xl px-4 text-xs font-bold font-mono text-gold-light tracking-wide outline-none"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const num = parseInt(customStartNum);
                          if (isNaN(num) || num < 1 || num > (questions.length || 1)) {
                            alert(`Please enter a valid question number between 1 and ${questions.length || 1}.`);
                            return;
                          }
                          handleStartProtocol(num - 1, false);
                        }}
                        disabled={initiating || questions.length === 0}
                        className="h-11 px-6 bg-gold hover:bg-gold-light disabled:opacity-45 rounded-xl text-navy font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        <span>Jump to Qn</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={handlePayment}
                  disabled={paying}
                  className="w-full h-20 bg-gold rounded-3xl text-navy font-black text-xs uppercase tracking-[0.4em] shadow-2xl shadow-gold/40 flex items-center justify-center gap-4 hover:bg-gold-light active:scale-[0.98] transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {paying ? (
                    <div className="w-5 h-5 border-2 border-navy/20 border-t-navy rounded-full animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-5 h-5 opacity-50 group-hover:rotate-12 transition-transform" />
                      <span>{t('payment.authorize')}: {userCurrency === 'USD' ? '$' : '₦'}{displayPrice.toLocaleString()}</span>
                    </>
                  )}
                </button>
              )}
              <p className="text-center mt-6 text-[9px] font-black text-text-3 uppercase tracking-[0.3em] opacity-40">
                {t('course.paymentTags')}
              </p>
            </div>
          </div>
        </motion.div>



        {/* Learning Objectives / Course Content */}
        {course.objectives ? (
          <div className="space-y-8 px-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-[1px] bg-gold/30" />
              <h3 className="text-xs font-black text-text-3 uppercase tracking-[0.6em]">{t('course.objectives')}</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {course.objectives.split('\n').map((line: string, idx: number) => {
                const trimmed = line.trim();
                if (!trimmed) return null;
                const range = extractQuestionRange(trimmed);
                return (
                  <ObjectiveItem 
                    key={idx} 
                    text={trimmed} 
                    isClickable={!!range}
                    onClick={range ? () => handleOutlineClick({ ...range, text: trimmed }) : undefined}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-8 px-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-[1px] bg-gold/30" />
              <h3 className="text-xs font-black text-text-3 uppercase tracking-[0.6em]">{t('course.objectives')}</h3>
            </div>
            <p className="text-xs text-text-3 font-semibold italic opacity-60">Awaiting Course Objectives update from the Academic Board...</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

function extractQuestionRange(text: string): { start: number; end: number | null } | null {
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

function Feature({ icon: Icon, label, value }: any) {
  return (
    <div className="flex flex-col items-center text-center space-y-2">
      <div className="w-10 h-10 rounded-xl bg-navy-high flex items-center justify-center text-gold/40 group-hover:text-gold transition-colors">
        <Icon className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <p className="text-[9px] font-black text-text-3 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-text-1 tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function ObjectiveItem({ text, onClick, isClickable }: { text: string; onClick?: () => void; isClickable?: boolean; key?: React.Key }) {
  return (
    <div 
      onClick={onClick}
      className={`card-luxury p-6 flex items-start gap-4 transition-all duration-200 ${
        isClickable 
          ? 'bg-navy-mid/40 hover:bg-gold/5 hover:border-gold/30 cursor-pointer group/item active:scale-[0.99]' 
          : 'bg-navy-mid/40'
      }`}
    >
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border mt-1 transition-colors ${
        isClickable
          ? 'bg-gold/10 text-gold border-gold/20 group-hover/item:bg-gold group-hover/item:text-navy'
          : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
      }`}>
        {isClickable ? <Play className="w-3 h-3 fill-current" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1">
        <p className={`font-semibold text-sm leading-relaxed transition-colors ${
          isClickable ? 'text-text-2 group-hover/item:text-gold' : 'text-text-2'
        }`}>
          {text}
        </p>
        {isClickable && (
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gold/60 mt-1.5 block">
            Click to launch section
          </span>
        )}
      </div>
    </div>
  );
}
