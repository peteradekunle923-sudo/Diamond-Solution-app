import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDoc, doc, setDoc, updateDoc, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { Search, Filter, BookOpen, ArrowRight, Layers, Lock, Zap, CheckCircle, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { DEPARTMENTS, DEPARTMENT_STRUCTURE, DEPARTMENT_PRICES } from '../constants';
import { useAuth } from '../context/AuthContext';
import { usePaystackPayment } from 'react-paystack';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import axios from 'axios';

export default function CourseList() {
  const { user, profile, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [courses, setCourses] = useState<any[]>([]);
  const [search, setSearch] = useState(() => sessionStorage.getItem('courseList_search') || '');
  const [deptFilter, setDeptFilter] = useState(() => sessionStorage.getItem('courseList_deptFilter') || 'All');
  const [levelFilter, setLevelFilter] = useState(() => sessionStorage.getItem('courseList_levelFilter') || 'All');

  useEffect(() => {
    sessionStorage.setItem('courseList_search', search);
  }, [search]);

  useEffect(() => {
    sessionStorage.setItem('courseList_deptFilter', deptFilter);
  }, [deptFilter]);

  useEffect(() => {
    sessionStorage.setItem('courseList_levelFilter', levelFilter);
  }, [levelFilter]);
  const [loading, setLoading] = useState(true);
  const [deptAccess, setDeptAccess] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState(false);
  const [allFaculties, setAllFaculties] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch custom faculties from Firestore
    const unsubFaculties = onSnapshot(collection(db, 'faculties'), (snap) => {
      const activeCustom = snap.docs.filter(doc => !doc.data().isDeleted).map(doc => ({ 
        name: doc.data().name, 
        price: doc.data().price || 10000,
        priceUSD: doc.data().priceUSD || Math.ceil((doc.data().price || 10000) / 1500),
        isCustom: true 
      }));
      
      const deletedStaticNames = snap.docs.filter(doc => doc.data().isDeleted).map(doc => doc.data().name);
      
      const staticDepts = DEPARTMENTS.filter(name => !deletedStaticNames.includes(name)).map(name => ({
        name,
        price: DEPARTMENT_PRICES[name]?.ngn || 10000,
        priceUSD: DEPARTMENT_PRICES[name]?.usd || 7,
        isCustom: false
      }));

      // Custom override static
      const merged = [...activeCustom];
      staticDepts.forEach(s => {
        if (!merged.find(m => m.name === s.name)) {
          merged.push(s);
        }
      });
      
      setAllFaculties(merged);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'faculties'));

    return () => unsubFaculties();
  }, []);

  useEffect(() => {
    let q = query(collection(db, 'courses'));
    if (deptFilter !== 'All') {
      q = query(collection(db, 'courses'), where('department', '==', deptFilter));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'courses');
    });

    return unsub;
  }, [deptFilter]);

  useEffect(() => {
    if (user?.uid) {
      const q = query(
        collection(db, 'payments'),
        where('userId', '==', user.uid),
        where('status', '==', 'success')
      );
      
      return onSnapshot(q, (snap) => {
        const access: Record<string, boolean> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.type === 'department_access' || data.dept_name) {
            access[data.dept_name] = true;
          }
        });
        setDeptAccess(access);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));
    }
  }, [user]);

  const [selectedDeptWithPrice, setSelectedDeptWithPrice] = useState<{name: string, price: number, priceUSD: number} | null>(null);

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

  const userCurrency = profile?.currency || 'NGN';
  const currentPrice = selectedDeptWithPrice ? (userCurrency === 'USD' ? selectedDeptWithPrice.priceUSD : selectedDeptWithPrice.price) : 0;

  const paystackConfig = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || '',
    amount: currentPrice * 100,
    publicKey: dynamicPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
    currency: userCurrency,
    metadata: {
      custom_fields: [
        { display_name: "Payment Type", variable_name: "payment_type", value: "department_access" },
        { display_name: "Department", variable_name: "dept_name", value: selectedDeptWithPrice?.name || "" },
        { display_name: "User ID", variable_name: "user_id", value: user?.uid || "" }
      ]
    }
  };

  const initializePayment = usePaystackPayment(paystackConfig);

  const onSuccess = async (reference: any) => {
    if (!user || !selectedDeptWithPrice || !profile) return;
    try {
      const paymentId = `dept_pay_${user.uid}_${selectedDeptWithPrice.name}`;
      
      const existingDoc = await getDoc(doc(db, 'payments', paymentId));
      if (existingDoc.exists() && existingDoc.data()?.status === 'success') {
        alert("Department access already acquired.");
        setPaying(false);
        setSelectedDeptWithPrice(null);
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
        let commissionAmount = currentPrice * commissionRate;
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

      const { default: axios } = await import('axios');
      const response = await axios.post('/api/verify-departmental-payment', {
        reference: finalRef,
        userId: user.uid,
        department: selectedDeptWithPrice.name,
        amount: currentPrice,
        currency: userCurrency,
        courseId: 'all_dept',
        userData: profile,
        referrerEmail,
        referrerName,
        finalCommissionValue,
        referrerId: referrerUid
      });

      if (response.data.success) {
        // Record payment
        await setDoc(doc(db, 'payments', paymentId), {
          id: paymentId,
          userId: user.uid,
          amount: currentPrice,
          currency: userCurrency,
          status: 'success',
          type: 'department_access',
          dept_name: selectedDeptWithPrice.name,
          department: selectedDeptWithPrice.name,
          reference: reference.reference || reference,
          courseId: 'all_dept',
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
            paymentAmount: currentPrice,
            paymentCurrency: userCurrency,
            commissionAmount: finalCommissionValue,
            commissionCurrency: referrerCurrency,
            commissionRate: 0.25,
            status: 'success',
            createdAt: new Date().toISOString()
          });
          // Do NOT increment balance on the users collection. The affiliate's balance is purely derived from affiliates table dynamically in AffiliateDashboard.
        }
        
        alert('Institutional Access Granted! You can now access your courses.');

      } else {
        alert('Payment verification failed.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error verifying payment: ' + (err.response?.data?.error || err.message));
    }
    setPaying(false);
    setSelectedDeptWithPrice(null);
  };

  const onClose = () => {
    setPaying(false);
    setSelectedDeptWithPrice(null);
  };

  const handleDeptPayment = (dept: string) => {
    if (paying) return;
    
    const activeKey = dynamicPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
    if (!activeKey || activeKey === 'pk_test_placeholder') {
      if (window.confirm("DEBUG MODE: Paystack key missing. Would you like to SIMULATE a successful payment for " + dept + "?")) {
        onSuccess({ reference: 'sim_dept_' + Date.now() });
      }
      return;
    }

    setPaying(true);
    const faculty = allFaculties.find(f => f.name === dept);
    setSelectedDeptWithPrice({ 
      name: dept, 
      price: faculty?.price || 10000,
      priceUSD: faculty?.priceUSD || 7
    });
  };

  // Trigger payment when selectedDeptWithPrice is set
  useEffect(() => {
    if (selectedDeptWithPrice && paying) {
      // Ensure the hook has been updated with the new config before calling
      const timer = setTimeout(() => {
        initializePayment({ onSuccess, onClose });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedDeptWithPrice, paying]);

  const hasAccess = isAdmin || deptAccess[deptFilter];
  const originalLevels = DEPARTMENT_STRUCTURE[deptFilter]?.levels || ['100L', '200L', '300L', '400L', '500L'];
  const levels = hasAccess 
    ? originalLevels.filter(lvl => lvl !== 'All') 
    : ['All', ...originalLevels];

  // Auto-switch away from 'All' filter to first actual academic level once access is granted/paid
  useEffect(() => {
    if (hasAccess && levelFilter === 'All') {
      const defaultLvl = originalLevels.find(l => l !== 'All') || '100L';
      setLevelFilter(defaultLvl);
    }
  }, [hasAccess, deptFilter, levelFilter, originalLevels]);

  // Set default level (either 200L or MB 1) when entering a department to prevent blank states
  useEffect(() => {
    if (deptFilter && deptFilter !== 'All') {
      const deptLevels = DEPARTMENT_STRUCTURE[deptFilter]?.levels || [];
      if (deptLevels.length > 0) {
        if (deptLevels.includes('MB 1')) {
          setLevelFilter('MB 1');
        } else if (deptLevels.includes('200L')) {
          setLevelFilter('200L');
        } else {
          setLevelFilter(deptLevels[0]);
        }
      } else {
        setLevelFilter('200L');
      }
    }
  }, [deptFilter]);

  const filteredCourses = courses.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchesLevel = levelFilter === 'All' || c.level === levelFilter;
    return matchesSearch && matchesLevel;
  }).sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  if (deptFilter === 'All') {
    return (
      <Layout>
        <div className="px-6 py-10 space-y-12">
          <div className="space-y-2">
            <h2 className="text-3xl font-serif font-black text-text-1 tracking-tight">{t('courses.faculties')}</h2>
            <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em] leading-none">{t('courses.archives')}</p>
          </div>

          <div className="grid gap-6">
            {allFaculties.map((f) => (
              <button
                key={f.name}
                onClick={() => setDeptFilter(f.name)}
                className="card-luxury p-8 text-left group hover:border-gold/30 transition-all flex items-center justify-between bg-navy-mid/40 shadow-2xl"
              >
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-gold/10 rounded-2xl flex items-center justify-center text-gold border border-gold/20 shadow-lg group-hover:scale-110 transition-all">
                    <Layers className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-serif font-black text-text-1 group-hover:text-gold transition-colors">{t(`dept.${f.name}`)}</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-text-3 uppercase tracking-widest leading-none">{t('courses.faculty')}</span>
                      {(isAdmin || deptAccess[f.name]) && (
                        <div className="flex items-center gap-1 text-emerald-500 text-[8px] font-black uppercase tracking-widest bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                          <CheckCircle className="w-3 h-3" />
                          {t('courses.authorized')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-12 h-12 bg-navy-high rounded-xl flex items-center justify-center border border-gold/10 group-hover:border-gold/30 transition-all">
                  <ChevronRight className="w-6 h-6 text-text-3 group-hover:text-gold translate-x-px" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const getDeptPrice = (name: string) => {
    const f = allFaculties.find(f => f.name === name);
    if (!f) return { val: 10000, curr: '₦' };
    return userCurrency === 'USD' 
      ? { val: f.priceUSD || 7, curr: '$' }
      : { val: f.price || 10000, curr: '₦' };
  };

  const activePrice = getDeptPrice(deptFilter);

  return (
    <Layout>
      <div className="px-6 py-10 space-y-10">
        <div className="space-y-8">
          <button 
            onClick={() => setDeptFilter('All')} 
            className="flex items-center gap-2 text-[10px] font-black text-gold uppercase tracking-widest hover:underline"
          >
            ← {t('courses.back')}
          </button>
          
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h2 className="text-3xl font-serif font-black text-text-1 tracking-tight">{t(`dept.${deptFilter}`)}</h2>
              <p className={cn("text-[10px] font-black uppercase tracking-[0.3em] leading-none", hasAccess ? "text-emerald-500" : "text-text-3")}>
                {hasAccess ? t('courses.authorized') : t('courses.required')}
              </p>
            </div>
            {!hasAccess && (
              <div className="text-right">
                <p className="text-[9px] font-black text-text-3 uppercase tracking-widest mb-1 opacity-60 text-emerald-500">{t('courses.fee')}</p>
                <p className="text-xl font-serif font-black text-white">{activePrice.curr}{activePrice.val.toLocaleString()}</p>
              </div>
            )}
          </div>


          {!hasAccess ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-luxury p-12 bg-navy-mid border-gold/30 text-center space-y-8 relative overflow-hidden transform-gpu isolate"
            >
              <div className="absolute top-0 right-0 w-64 h-64 opacity-20 -mr-24 -mt-24 pointer-events-none" style={{ background: 'radial-gradient(circle, var(--color-gold) 0%, transparent 70%)' }} />
              <div className="w-24 h-24 bg-gold/10 rounded-[2.5rem] flex items-center justify-center text-gold mx-auto border border-gold/20 shadow-[0_0_60px_rgba(201,147,10,0.1)]">
                <Lock className="w-10 h-10" />
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-serif font-black text-text-1 tracking-tight">{t('courses.restricted')}</h3>
                <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em] max-w-sm mx-auto leading-relaxed">
                  {t('courses.restrictionDesc')}
                </p>
              </div>
              
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto py-4 border-y border-gold/10">
                <div className="text-center">
                  <span className="block text-emerald-500 font-serif font-black text-lg">Full</span>
                  <span className="text-[7px] font-black text-text-3 uppercase tracking-widest">{t('courses.levels')}</span>
                </div>
                <div className="text-center">
                  <span className="block text-text-1 font-serif font-black text-lg">∞</span>
                  <span className="text-[7px] font-black text-text-3 uppercase tracking-widest">Access</span>
                </div>
                <div className="text-center">
                   <span className="block text-text-1 font-serif font-black text-lg">High</span>
                   <span className="text-[7px] font-black text-text-3 uppercase tracking-widest">Priority</span>
                </div>
              </div>

              <button 
                onClick={() => handleDeptPayment(deptFilter)}
                disabled={paying}
                className="w-full h-20 bg-gold rounded-[2rem] text-navy font-black text-xs uppercase tracking-[0.4em] shadow-2xl shadow-gold/30 hover:bg-gold-light active:scale-95 transition-all flex items-center justify-center gap-4 group mt-4"
              >
                {paying ? t('general.loading') : (
                  <>
                    <Zap className="w-5 h-5 opacity-50 group-hover:rotate-12 transition-transform" />
                    <span>{t('courses.payAccess').replace('{price}', `${activePrice.curr}${activePrice.val.toLocaleString()}`)}</span>
                  </>
                )}
              </button>
              <p className="text-[8px] font-black text-text-3 uppercase tracking-[0.3em] opacity-40">{t('courses.oneTime')}</p>
            </motion.div>
          ) : (
            <>
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-3 group-focus-within:text-gold transition-colors" />
                <input
                  type="text"
                  placeholder={t('courses.searchPlaceholder')}
                  className="w-full pl-12 pr-4 py-5 bg-navy-mid border border-gold/10 rounded-2xl outline-none text-sm font-medium shadow-2xl"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                <Filter className="w-4 h-4 text-gold flex-shrink-0" />
                {levels.map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setLevelFilter(lvl)}
                    className={`px-6 py-3 rounded-xl font-bold text-[9px] uppercase tracking-[0.2em] transition-all border whitespace-nowrap ${
                      levelFilter === lvl 
                        ? 'bg-gold text-navy border-gold shadow-lg shadow-gold/20' 
                        : 'bg-navy-high text-text-3 border-gold/10 hover:border-gold/30'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <div className="grid gap-5">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-24 space-y-6">
                     <div className="w-10 h-10 border-[3px] border-gold/10 border-t-gold rounded-full animate-spin"></div>
                     <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.3em]">{t('general.loading')}</p>
                  </div>
                ) : filteredCourses.length > 0 ? (
                  filteredCourses.map((course) => (
                    <CourseListItem key={course.id} course={course} />
                  ))
                ) : (
                  <div className="text-center py-24 card-luxury border-dashed border-gold/15">
                    <p className="text-xs font-black text-text-3 uppercase tracking-widest italic">{t('courses.noRecords')}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function CourseListItem({ course }: { course: any, key?: any }) {
  const { t } = useLanguage();
  return (
    <Link 
      to={`/courses/${course.id}`} 
      className="card-luxury group relative overflow-hidden transform-gpu isolate flex flex-col justify-between p-6 min-h-[140px] hover:border-gold/30 transition-all shadow-xl shadow-black/10 bg-gradient-to-br from-navy-mid/60 to-navy-high/80"
    >
      {/* Background with thumbnail acting as a soft, elegant backdrop layer */}
      {course.thumbnail ? (
        <div className="absolute inset-0 z-0 opacity-10 group-hover:opacity-20 transition-opacity duration-700 pointer-events-none">
          <img src={course.thumbnail} alt="" className="w-full h-full object-cover grayscale" />
        </div>
      ) : (
        <div className="absolute top-0 right-0 w-48 h-48 opacity-20 -mr-16 -mt-16 pointer-events-none" style={{ background: 'radial-gradient(circle, var(--color-gold) 0%, transparent 70%)' }} />
      )}
      
      {/* Single, unified background content area with course title styled on the visual tile */}
      <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-text-3 bg-navy-high px-3 py-1 rounded border border-gold/10">
            {course.level}
          </span>
          <div className="w-8 h-8 rounded-lg bg-navy-high/50 border border-gold/10 flex items-center justify-center text-gold/40 group-hover:text-gold transition-colors">
            <BookOpen className="w-4 h-4" />
          </div>
        </div>

        <div>
          <h4 className="font-serif font-black text-text-1 text-[11px] sm:text-[12px] leading-tight group-hover:text-gold-light transition-colors">
            {course.title}
          </h4>
        </div>

        <div className="flex items-center justify-between text-[9px] font-black text-gold uppercase tracking-[0.2em] pt-3 border-t border-gold/5 mt-auto">
          <span>{t('general.view')}</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
}
