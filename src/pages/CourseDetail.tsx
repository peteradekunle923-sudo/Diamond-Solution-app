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
  
  const [dynamicPublicKey, setDynamicPublicKey] = useState<string>('');

  useEffect(() => {
    axios.get('/api/config')
      .then(res => {
        if (res.data.paystackPublicKey) {
          setDynamicPublicKey(res.data.paystackPublicKey);
        }
      })
      .catch(err => {
        console.warn("Failed to fetch dynamic configuration:", err);
      });
  }, []);

  const displayPrice = userCurrency === 'USD' ? facultyPrice.usd : facultyPrice.ngn;
  const paystackAmount = displayPrice * 100;

  const config: any = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || '',
    amount: paystackAmount,
    publicKey: dynamicPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder',
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
      if (d.exists() && !d.data()?.isDeleted) {
        const courseData = d.data();
        setCourse(courseData);

        // Save the level and department of the course to sessionStorage so when navigating back to course list, we are at the right level
        sessionStorage.setItem('courseList_deptFilter', courseData.department);
        sessionStorage.setItem('courseList_levelFilter', courseData.level);

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
            const fetchedQuestions = qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((q: any) => !q.isDeleted);
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

       const idToken = await user.getIdToken();
       // Use backend for verification and email dispatch
       const response = await axios.post('/api/verify-departmental-payment', {
         reference: finalRef,
         department: course.department,
         amount: displayPrice,
         currency: userCurrency,
         userData: {
           uid: user.uid,
           email: user.email || '',
           displayName: profile?.displayName || '',
           username: profile?.username || ''
         },
         referrerEmail,
         referrerName,
         finalCommissionValue,
         referrerId: referrerUid
       }, {
         headers: { Authorization: `Bearer ${idToken}` }
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
    
    const activeKey = dynamicPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
    if (!activeKey || activeKey === 'pk_test_placeholder') {
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
    <div className="h-screen bg-[#F8F9FB] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-[#1B3FA0] rounded-full animate-spin" />
    </div>
  );
  
  if (!course) return (
    <div className="h-screen bg-[#F8F9FB] flex flex-col items-center justify-center space-y-4">
      <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 border border-red-500/20">
        <ShieldCheck className="w-8 h-8" />
      </div>
      <p className="text-slate-500 font-black uppercase tracking-widest text-xs">{t('course.notFound')}</p>
      <button onClick={() => navigate(-1)} className="btn-primary">{t('general.back')}</button>
    </div>
  );

  return (
    <Layout>
      <div className="pt-8 px-6 max-w-4xl mx-auto w-full relative z-20 page-wrapper">
        <button 
          onClick={() => navigate('/courses')}
          className="w-10 h-10 md:w-12 md:h-12 bg-white border border-[#DDE5F5] rounded-2xl flex items-center justify-center text-[#1B3FA0] hover:bg-[#1B3FA0] hover:text-white transition-all shadow-xs cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 relative right-[1px]" />
        </button>
      </div>

      <div className="px-3 pt-8 relative z-10 space-y-12 pb-24 max-w-4xl mx-auto w-full section-container">
        <div 
          className="card-luxury p-8 sm:p-10 bg-white border border-[#DDE5F5] shadow-xs rounded-3xl"
          style={{ willChange: 'auto', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
        >
          <div className="space-y-10">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#D4AF37] bg-[#FEF9E7] px-4 py-2 rounded-xl border border-[#F5E5A4] shadow-xs">
                  {t(`dept.${course.department}`)}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 bg-[#EEF3FF] px-4 py-2 rounded-xl border border-[#D4E0FC]">
                  {course.level} {t('course.level')}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-black text-[#0B1E3D] leading-tight tracking-tight">
                {course.title}
              </h2>
            </motion.div>
            
            <motion.p 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-slate-600 leading-relaxed text-lg font-medium border-l-2 border-[#D4AF37]/40 pl-6 italic"
            >
              {course.description || "Synthesize your academic competence with expert-reviewed examination protocols and exhaustive logical explanations curated by Diamond's internal collegiate board."}
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-3 gap-6 py-10 border-y border-[#DDE5F5]"
            >
              <Feature icon={Award} label={t('course.status')} value={t('course.institutional')} />
              <Feature icon={ShieldCheck} label={t('course.security')} value={t('course.encrypted')} />
              <Feature icon={Share2} label={t('course.endowment')} value={t('course.yield')} />
            </motion.div>

            <div className="pt-4">
              {hasPaid ? (
                <div className="space-y-6">
                  {/* Protocol Initiation Dashboard */}
                  <div className="bg-[#EEF3FF] p-6 rounded-3xl border border-[#D4E0FC] space-y-4 text-left">
                    <span className="text-[10px] font-black text-[#1B3FA0] uppercase tracking-[0.3em] block mb-2">Protocol Launch Configurations</span>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {/* Option 1: Resume */}
                      <button 
                        onClick={() => handleStartProtocol(progress?.currentIndex || 0, false)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
                          progress?.completed
                            ? 'opacity-40 border-[#DDE5F5] cursor-not-allowed bg-transparent'
                            : 'bg-white border-[#DDE5F5] hover:border-[#1B3FA0]/40'
                        }`}
                        disabled={progress?.completed || initiating}
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#EEF3FF] flex items-center justify-center text-[#1B3FA0] flex-shrink-0 border border-[#D4E0FC]">
                          <Play className="w-4 h-4 fill-[#1B3FA0]" />
                        </div>
                        <div className="truncate flex-1">
                          <span className="text-[10px] font-black text-[#0B1E3D] uppercase tracking-widest block">Resume Session</span>
                          <span className="text-[10px] font-semibold text-slate-500 block truncate">
                            {progress?.completed ? 'Session Concluded' : `Continue from Question ${(progress?.currentIndex || 0) + 1}`}
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Option 3: Custom Number */}
                    <div className="pt-4 border-t border-[#D4E0FC] flex flex-col md:flex-row gap-4 items-stretch md:items-end justify-between">
                      <div className="flex-1 min-w-0">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                          Custom Start Question Number (1 - {questions.length || 1})
                        </label>
                        <input 
                          type="number"
                          min="1"
                          max={questions.length || 1}
                          value={customStartNum}
                          onChange={(e) => setCustomStartNum(e.target.value)}
                          placeholder="e.g. 5"
                          className="w-full h-11 bg-white border border-[#D4E0FC] focus:border-[#1B3FA0] rounded-2xl px-4 text-xs font-bold font-mono text-[#0B1E3D] tracking-wide outline-none"
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
                        className="h-11 px-6 btn-primary disabled:opacity-45 rounded-2xl text-[10px] uppercase tracking-widest cursor-pointer"
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
                  className="w-full h-16 btn-primary rounded-3xl text-xs uppercase tracking-[0.3em] font-black shadow-lg shadow-[#1B3FA0]/20 flex items-center justify-center gap-4 cursor-pointer"
                >
                  {paying ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-5 h-5 opacity-80 group-hover:rotate-12 transition-transform" />
                      <span>{t('payment.authorize')}: {userCurrency === 'USD' ? '$' : '₦'}{displayPrice.toLocaleString()}</span>
                    </>
                  )}
                </button>
              )}
              <p className="text-center mt-6 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">
                {t('course.paymentTags')}
              </p>
            </div>
          </div>
        </div>



        {/* Learning Objectives / Course Content */}
        {course.objectives ? (
          <div className="space-y-8 px-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-[1px] bg-[#DDE5F5]" />
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.6em]">{t('course.objectives')}</h3>
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
              <div className="w-12 h-[1px] bg-[#DDE5F5]" />
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.6em]">{t('course.objectives')}</h3>
            </div>
            <p className="text-xs text-slate-500 font-semibold italic">Awaiting Course Objectives update from the Academic Board...</p>
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
      <div className="w-10 h-10 rounded-2xl bg-[#EEF3FF] flex items-center justify-center text-[#1B3FA0] border border-[#D4E0FC]">
        <Icon className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-[#0B1E3D] tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function ObjectiveItem({ text, onClick, isClickable }: { text: string; onClick?: () => void; isClickable?: boolean; key?: React.Key }) {
  return (
    <div 
      onClick={onClick}
      className={`card-luxury p-6 flex items-start gap-4 transition-all duration-200 bg-white border border-[#DDE5F5] rounded-3xl ${
        isClickable 
          ? 'hover:bg-[#EEF3FF] hover:border-[#1B3FA0]/40 cursor-pointer group/item active:scale-[0.99]' 
          : ''
      }`}
    >
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border mt-1 transition-colors ${
        isClickable
          ? 'bg-[#EEF3FF] text-[#1B3FA0] border-[#D4E0FC] group-hover/item:bg-[#1B3FA0] group-hover/item:text-white'
          : 'bg-emerald-50 text-emerald-600 border-emerald-200'
      }`}>
        {isClickable ? <Play className="w-3 h-3 fill-current" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1">
        <p className={`font-semibold text-sm leading-relaxed transition-colors ${
          isClickable ? 'text-[#0B1E3D] group-hover/item:text-[#1B3FA0]' : 'text-[#0B1E3D]'
        }`}>
          {text}
        </p>
        {isClickable && (
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#1B3FA0] mt-1.5 block">
            Click to launch section
          </span>
        )}
      </div>
    </div>
  );
}
