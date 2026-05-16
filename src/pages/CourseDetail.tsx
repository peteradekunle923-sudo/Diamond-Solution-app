import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { ChevronLeft, Lock, Play, CheckCircle2, ShieldCheck, Share2, Award, Zap, BookOpen } from 'lucide-react';
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
  const [course, setCourse] = useState<any>(null);
  const [hasPaid, setHasPaid] = useState(false);
  const [loading, setLoading] = useState(true);

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
          if (isAdmin) {
            setHasPaid(true);
          } else {
            // Check if user has paid for THIS specific department using deterministic ID
            const paymentId = `dept_pay_${user.uid}_${courseData.department}`;
            const pd = await getDoc(doc(db, 'payments', paymentId));
            if (pd.exists() && pd.data()?.status === 'success') {
               setHasPaid(true);
            }
          }
        }
      }
      setLoading(false);
    };
    fetchCourseAndPrice();
  }, [id, user, isAdmin]);

  const onSuccess = async (reference: any) => {
    if (!user || !course) return;
    setLoading(true);
    
    try {
      // Use backend for verification and record creation
      const response = await axios.post('/api/verify-departmental-payment', {
        reference: reference.reference,
        userId: user.uid,
        department: course.department,
        amount: displayPrice,
        currency: userCurrency,
        courseId: id
      });

      if (response.data.success) {
        alert('Institutional Access Granted! You can now initiate the study protocol.');
        setHasPaid(true);
      } else {
        alert('Payment verification failed. Please contact support.');
      }
    } catch (err: any) {
      console.error('Course payment error:', err);
      alert('Error verifying payment: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const onClose = () => {
    setLoading(false);
  };

  const handlePayment = () => {
    if (!user) return navigate('/login');
    
    if (!import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY === 'pk_test_placeholder') {
      if (window.confirm("DEBUG MODE: Paystack key missing. SIMULATE course purchase?")) {
        onSuccess({ reference: 'sim_course_' + Date.now() });
      }
      return;
    }

    setLoading(true);
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
      <div className="relative h-80 bg-navy-high overflow-hidden rounded-[2.5rem] mb-12 shadow-2xl border border-gold/10">
        {course.thumbnail ? (
          <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover opacity-40 grayscale-[0.3]" referrerPolicy="no-referrer" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-10">
             <BookOpen className="w-64 h-64 text-gold-light" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-transparent" />
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-8 left-8 w-12 h-12 bg-navy-mid/80 backdrop-blur-xl border border-gold/20 rounded-2xl flex items-center justify-center text-gold hover:bg-gold hover:text-navy transition-all shadow-xl z-20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="px-2 -mt-24 relative z-10 space-y-12 pb-24 max-w-4xl mx-auto w-full">
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
              <h2 className="text-5xl font-serif font-black text-text-1 leading-tight tracking-tight drop-shadow-2xl">
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
                <button 
                  onClick={() => navigate(`/courses/${id}/study`)}
                  className="w-full h-20 bg-emerald-500 rounded-2xl text-navy font-black text-xs uppercase tracking-[0.4em] shadow-2xl shadow-emerald-500/20 flex items-center justify-center gap-4 hover:bg-emerald-400 active:scale-[0.98] transition-all group"
                >
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                    <Zap className="w-6 h-6 fill-navy" />
                  </motion.div>
                  <span>{t('course.initiate_protocol')}</span>
                </button>
              ) : (
                <button 
                  onClick={handlePayment}
                  className="w-full h-20 bg-gold rounded-3xl text-navy font-black text-xs uppercase tracking-[0.4em] shadow-2xl shadow-gold/40 flex items-center justify-center gap-4 hover:bg-gold-light active:scale-[0.98] transition-all group"
                >
                  <Lock className="w-5 h-5 opacity-50 group-hover:rotate-12 transition-transform" />
                  <span>{t('payment.authorize')}: {userCurrency === 'USD' ? '$' : '₦'}{displayPrice.toLocaleString()}</span>
                </button>
              )}
              <p className="text-center mt-6 text-[9px] font-black text-text-3 uppercase tracking-[0.3em] opacity-40">
                {t('course.paymentTags')}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Learning Objectives */}
        <div className="space-y-8 px-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-[1px] bg-gold/30" />
            <h3 className="text-xs font-black text-text-3 uppercase tracking-[0.6em]">{t('course.objectives')}</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <ObjectiveItem text={t('course.obj1')} />
            <ObjectiveItem text={t('course.obj2')} />
            <ObjectiveItem text={t('course.obj3')} />
            <ObjectiveItem text={t('course.obj4')} />
          </div>
        </div>
      </div>
    </Layout>
  );
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

function ObjectiveItem({ text }: { text: string }) {
  return (
    <div className="card-luxury p-6 flex items-start gap-4 bg-navy-mid/40">
      <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 flex-shrink-0 border border-emerald-500/20 mt-1">
        <CheckCircle2 className="w-3.5 h-3.5" />
      </div>
      <p className="text-text-2 font-semibold text-sm leading-relaxed">{text}</p>
    </div>
  );
}
