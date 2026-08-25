import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, orderBy, deleteDoc, where, limit, setDoc, getDoc, increment, writeBatch, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  Shield, LayoutDashboard, Users, Link as LinkIcon, CreditCard, Wallet,
  BarChart2, Building2, FileText, Bell, Quote, LogOut, Search, 
  Filter, Plus, Edit3, Trash2, CheckCircle2, AlertCircle, XCircle, ArrowRight, ArrowLeft,
  Layers, X, Download, MessageCircle, Check, Target, ShieldAlert, Clock, Menu, BookOpen, RotateCcw,
  Image as ImageIcon, Upload, Camera
} from 'lucide-react';
import { format } from 'date-fns';
import { downloadCSV } from '../lib/csvUtils';
import axios from 'axios';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../context/LanguageContext';
import { DEPARTMENTS, DEPARTMENT_STRUCTURE, DEPARTMENT_PRICES } from '../constants';
import { useNavigate } from 'react-router-dom';
import { isBiometricsSupported, authenticateBiometrics } from '../lib/biometrics';
import ImageUploader from '../components/ImageUploader';
import { compressImage } from '../lib/imageUtils';
import { MediaManager } from '../components/MediaManager';

type Tab = 'dashboard' | 'users' | 'affiliates' | 'withdrawals' | 'payments' | 'analytics' | 'departments' | 'questions' | 'pictures' | 'notifications' | 'quotes' | 'support' | 'logs' | 'settings';

export default function AdminDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Lock Screen States
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [hasEnrolledPasscode, setHasEnrolledPasscode] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [passcodeChecking, setPasscodeChecking] = useState(true);

  useEffect(() => {
    const fetchAdminPasscode = async () => {
      try {
        const u = auth.currentUser;
        if (u) {
          const snap = await getDoc(doc(db, 'users', u.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data.adminPasscode) {
              setAdminPasscode(data.adminPasscode);
              setHasEnrolledPasscode(true);
            } else {
              setHasEnrolledPasscode(false);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load admin profile:", err);
      } finally {
        setPasscodeChecking(false);
      }
    };

    fetchAdminPasscode();

    isBiometricsSupported().then(supported => {
      setBiometricsAvailable(supported);
    });
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalRevenue: 0,
    displayRevenue: '₦0',
    newStudents: 0,
    pendingCommissions: 0,
    pendingWithdrawals: 0,
    pendingSupports: 0,
    suspendedCount: 0,
    totalPaidOut: '₦0'
  });

  useEffect(() => {
    // Basic stats sync
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      let suspendedCount = 0;
      snap.docs.forEach(d => {
        if (d.data().status === 'suspended') suspendedCount++;
      });
      setStats(prev => ({ ...prev, totalStudents: snap.size, suspendedCount }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubAffiliates = onSnapshot(query(collection(db, 'affiliates'), where('status', '==', 'pending')), (snap) => {
      setStats(prev => ({ ...prev, pendingCommissions: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'affiliates'));

    const unsubPayments = onSnapshot(collection(db, 'payments'), (snap) => {
      let totalNGN = 0;
      let totalUSD = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'success') {
          if (data.currency === 'USD') {
            totalUSD += data.amount || 0;
          } else {
            totalNGN += data.amount || 0;
          }
        }
      });
      // For display simplicity, let's normalize to a string that shows both
      const displayTotal = totalUSD > 0 
        ? `₦${(totalNGN/1000).toFixed(1)}k + $${totalUSD.toFixed(0)}`
        : `₦${(totalNGN/1000).toLocaleString()}k`;
      
      setStats(prev => ({ ...prev, totalRevenue: totalNGN, displayRevenue: displayTotal }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));

    const unsubWithdrawals = onSnapshot(collection(db, 'withdrawals'), (snap) => {
      let pendingCount = 0;
      let totalNGN = 0;
      let totalUSD = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'pending') {
          pendingCount++;
        } else if (data.status === 'success') {
          const amt = data.amount || 0;
          if (data.currency === 'USD') {
            totalUSD += amt;
          } else {
            totalNGN += amt;
          }
        }
      });
      const displayTotalPaidOut = totalUSD > 0
        ? `₦${totalNGN.toLocaleString()} + $${totalUSD.toLocaleString()}`
        : `₦${totalNGN.toLocaleString()}`;

      setStats(prev => ({ 
        ...prev, 
        pendingWithdrawals: pendingCount,
        totalPaidOut: displayTotalPaidOut
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));

    const unsubChats = onSnapshot(collection(db, 'chats'), (snap) => {
      let totalUnread = 0;
      snap.docs.forEach(d => {
        totalUnread += (d.data().adminUnreadCount || 0);
      });
      setStats(prev => ({ ...prev, pendingSupports: totalUnread }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

    return () => {
      unsubUsers();
      unsubAffiliates();
      unsubPayments();
      unsubWithdrawals();
      unsubChats();
    };
  }, []);

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpTargetId, setOtpTargetId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ 
    type: 'delete' | 'update' | 'payout' | 'withdraw', 
    id: string,
    execute: () => Promise<void> 
  } | null>(null);

  const requestSecurityClearance = async (id: string, action: 'delete' | 'update' | 'payout' | 'withdraw', execute: () => Promise<void>) => {
    setOtpTargetId(id);
    setPendingAction({ type: action, id, execute });
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      setLoading(true);
      const docId = `${action}_${id.toString().replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      await setDoc(doc(db, 'admin_tokens', docId), {
        token,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        targetId: id,
        action,
        adminEmail: 'peteradekunle923@gmail.com'
      });
      
      try {
        const res = await axios.post('/api/send-otp', {
          token,
          action,
          targetId: id,
          email: 'peteradekunle923@gmail.com'
        });
        if (res.data && res.data.emailSent === false) {
           alert(`[DEVELOPMENT MODE] Email delivery failed or key missing.\nToken bypassed for preview:\n\n${token}`);
        } else {
           alert(`[SECURITY AUTHENTICATED] A 6-digit verification token has been dispatched to admin. Check inbox/spam.`); 
        }
      } catch (emailErr: any) {
        console.error('Email Dispatch Error:', emailErr);
        const errorDetail = emailErr.response?.data?.details || emailErr.message;
        alert(`[WARNING] Database record created, but email failed. Reason: ${errorDetail}\n\n[DEVELOPMENT MODE] Token bypassed for preview:\n\n${token}`);
      }
      
      setOtpValue('');
      setShowOtpModal(true);
    } catch (err) {
      console.error('Clearance Request Error:', err);
      alert('SECURITY PROTOCOL ERROR: Failed to dispatch verification token.');
      handleFirestoreError(err, OperationType.WRITE, 'admin_tokens');
    } finally {
      setLoading(false);
    }
  };

  const confirmSecurityAction = async () => {
    if (!otpTargetId || !pendingAction) return;
    setIsVerifying(true);
    try {
      const docId = `${pendingAction.type}_${otpTargetId.toString().replace(/[^a-zA-Z0-9]/g, '_')}`;
      const snap = await getDoc(doc(db, 'admin_tokens', docId));
      
      if (snap.exists()) {
        const entry = snap.data();
        if (entry.token === otpValue && new Date(entry.expiresAt) > new Date()) {
          await pendingAction.execute();
          
          try {
            await deleteDoc(doc(db, 'admin_tokens', docId));
          } catch (e) {
            console.warn('Token cleanup failed', e);
          }
          
          setShowOtpModal(false);
          setOtpValue('');
          setOtpTargetId(null);
          setPendingAction(null);
        } else {
          alert('SECURITY ALERT: Invalid or expired token.');
        }
      } else {
        alert('SECURITY PROTOCOL FAILURE: No active clearance request found.');
      }
    } catch (err) {
      alert('VERIFICATION ERROR: Protocol failure.');
      handleFirestoreError(err, OperationType.GET, 'admin_tokens');
    } finally {
      setIsVerifying(false);
    }
  };

  if (passcodeChecking) {
    return (
      <div className="fixed inset-0 bg-[#F8FAFC] flex flex-col items-center justify-center z-50">
        <div className="w-16 h-16 bg-[#2563EB] flex items-center justify-center animate-pulse rounded-2xl" style={{ clipPath: 'polygon(50% 0%, 100% 35%, 80% 100%, 20% 100%, 0% 35%)' }}></div>
        <div className="text-center mt-6">
          <h3 className="text-sm font-serif font-black tracking-widest text-slate-900 uppercase">DIAMOND SECURITY</h3>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Initializing Secure Enclave...</p>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <AdminLockScreen 
        hasEnrolledPasscode={hasEnrolledPasscode}
        adminPasscode={adminPasscode}
        onUnlock={() => {
          setIsUnlocked(true);
        }}
        setAdminPasscode={setAdminPasscode}
        setHasEnrolledPasscode={setHasEnrolledPasscode}
        biometricsAvailable={biometricsAvailable}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-[#2563EB]/20">
      {/* Sidebar and Main Content ... */}
      {/* ... existing code ... */}
      {/* Sidebar */}
      <aside className={cn(
        "w-60 h-screen bg-white border-r border-[#D8E3FF] flex flex-col fixed top-0 left-0 z-50 transition-transform duration-300 shadow-sm",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-7 flex items-center justify-between border-b border-[#D8E3FF]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#2563EB] flex-shrink-0 rounded-lg flex items-center justify-center text-white font-bold" style={{ clipPath: 'polygon(50% 0%, 100% 35%, 80% 100%, 20% 100%, 0% 35%)' }}></div>
            <div className="font-serif font-extrabold text-sm leading-tight text-slate-900 uppercase tracking-tighter">
              Diamond<br />
              <span className="text-[#2563EB]">Solution</span>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto no-scrollbar">
          <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{t('admin.main')}</div>
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label={t('admin.dashboard')} onClick={() => { setActiveTab('dashboard'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={false} icon={Layers} label="User Dashboard" onClick={() => { navigate('/dashboard'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'users'} icon={Users} label={t('admin.users')} onClick={() => { setActiveTab('users'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'affiliates'} icon={LinkIcon} label={t('admin.affiliates')} onClick={() => { setActiveTab('affiliates'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} badge={stats.pendingCommissions} />
          <NavItem active={activeTab === 'withdrawals'} icon={Wallet} label={t('admin.withdrawals')} onClick={() => { setActiveTab('withdrawals'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} badge={stats.pendingWithdrawals} />

          <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">{t('admin.finance')}</div>
          <NavItem active={activeTab === 'payments'} icon={CreditCard} label={t('admin.payments')} onClick={() => { setActiveTab('payments'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'analytics'} icon={BarChart2} label={t('admin.analytics')} onClick={() => { setActiveTab('analytics'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />

          <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">{t('admin.content')}</div>
          <NavItem active={activeTab === 'departments'} icon={Building2} label={t('admin.departments')} onClick={() => { setActiveTab('departments'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'questions'} icon={FileText} label={t('admin.questions')} onClick={() => { setActiveTab('questions'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'pictures'} icon={ImageIcon} label="Pictures & Media" onClick={() => { setActiveTab('pictures'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'notifications'} icon={Bell} label={t('admin.notifications')} onClick={() => { setActiveTab('notifications'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'quotes'} icon={Quote} label={t('admin.quotes')} onClick={() => { setActiveTab('quotes'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'support'} icon={MessageCircle} label={t('admin.support')} onClick={() => { setActiveTab('support'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} badge={stats.pendingSupports} />
          <NavItem active={activeTab === 'logs'} icon={FileText} label="System Logs" onClick={() => { setActiveTab('logs'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          <NavItem active={activeTab === 'settings'} icon={ShieldAlert} label={t('admin.settings')} onClick={() => { setActiveTab('settings'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
        </nav>

        <div className="p-4 border-t border-[#D8E3FF] flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2563EB] flex items-center justify-center font-bold text-white text-sm uppercase">
            {auth.currentUser?.email?.charAt(0) || 'A'}
          </div>
          <div className="overflow-hidden">
            <div className="text-[13px] font-semibold truncate text-slate-900">{auth.currentUser?.displayName || t('profile.defaultName')}</div>
            <div className="text-[11px] text-slate-500 truncate">{t('admin.superAdmin')}</div>
          </div>
          <button 
            onClick={async () => {
              if (auth.currentUser) {
                try {
                  const { SessionService } = await import('../lib/SessionService');
                  await SessionService.clearSession(auth.currentUser.uid);
                } catch (e) {
                  console.warn("Session clear failed in AdminDashboard:", e);
                }
              }
              auth.signOut();
            }}
            className="ml-auto text-slate-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-300",
        isSidebarOpen ? "lg:ml-60" : "ml-0"
      )}>
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-[#D8E3FF] px-8 py-4 flex items-center justify-between z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-slate-500 hover:text-[#2563EB] transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-serif font-bold text-xl text-slate-900 capitalize hidden sm:block">{activeTab === 'dashboard' ? t('admin.overview') : t(`admin.${activeTab}` as any)}</h1>
          </div>
          <div className="flex items-center gap-3">
          </div>
        </header>

        <div className="p-8 flex-1 overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === 'dashboard' && <DashboardOverview stats={stats} onViewLedger={() => setActiveTab('payments')} />}
              {activeTab === 'users' && <UsersManager requestClearance={requestSecurityClearance} />}
              {activeTab === 'affiliates' && (
                <AffiliateManager requestClearance={requestSecurityClearance} />
              )}
              {activeTab === 'withdrawals' && (
                <WithdrawalsManager requestClearance={requestSecurityClearance} />
              )}
              {activeTab === 'payments' && <PaymentsManager />}
              {activeTab === 'analytics' && <AnalyticsDashboard stats={stats} />}
              {activeTab === 'departments' && (
                <DepartmentsManager 
                  requestClearance={requestSecurityClearance} 
                  onEditArchive={(dept) => {
                    setSelectedDeptFilter(dept);
                    setActiveTab('questions');
                  }} 
                />
              )}
              {activeTab === 'questions' && <QuestionsManager initialFilter={selectedDeptFilter} requestClearance={requestSecurityClearance} />}
              {activeTab === 'pictures' && <MediaManager />}
              {activeTab === 'notifications' && <NotificationsManager />}
              {activeTab === 'quotes' && <QuotesManager />}
              {activeTab === 'support' && <SupportManager />}
              {activeTab === 'logs' && <SystemLogsManager />}
              {activeTab === 'settings' && <SettingsManager />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {showOtpModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOtpModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white border border-red-200 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center border border-red-200">
                  <ShieldAlert className="w-8 h-8 text-red-500" />
                </div>
              </div>
              
              <h3 className="font-serif font-black text-xl text-slate-900 text-center mb-2 uppercase tracking-tight">Security Clearance Required</h3>
              <p className="text-[11px] text-slate-500 text-center mb-8 font-mono leading-relaxed px-4">
                A verification token was sent to <span className="text-[#2563EB] font-bold">peteradekunle923@gmail.com</span> to authorize <span className="text-slate-900 font-bold">{pendingAction?.type.toUpperCase()}</span>.
              </p>

              <div className="space-y-6">
                <input
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="0 0 0 0 0 0"
                  className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-6 py-4 text-center font-mono font-black text-2xl tracking-[0.5em] text-slate-900 focus:outline-none focus:border-red-500 transition-all placeholder:opacity-20"
                />

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowOtpModal(false)}
                    className="py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    Abort
                  </button>
                  <button
                    onClick={confirmSecurityAction}
                    disabled={otpValue.length !== 6 || isVerifying}
                    className="bg-red-500 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-red-500/20 transition-all font-mono"
                  >
                    {isVerifying ? 'Verifying...' : 'Authorize Protocol'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SystemLogsManager() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return onSnapshot(query(collection(db, 'system_logs'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'system_logs'));
  }, []);

  const filtered = logs.filter(l => 
    l.email?.toLowerCase().includes(search.toLowerCase()) ||
    l.purpose?.toLowerCase().includes(search.toLowerCase()) ||
    l.reason?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search security logs (email, purpose, reason)..." 
            className="w-full bg-white border border-[#D8E3FF] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-slate-900 focus:border-[#2563EB] outline-none transition-all shadow-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#EEF3FF]/50 border-b border-[#D8E3FF]">
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Timestamp</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Scholar Email</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Event Type</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Data / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8E3FF]">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-[#EEF3FF]/30 group transition-all">
                  <td className="px-6 py-5 text-[12px] font-mono text-slate-500">
                    {log.createdAt ? format(new Date(log.createdAt), 'MMM d, HH:mm:ss') : '—'}
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-[13px] font-bold text-slate-900">{log.email}</div>
                    <div className="text-[10px] text-slate-400 font-mono">UID: {log.userId}</div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                      log.purpose?.includes('Protocol') ? "bg-red-50 text-red-600 border-red-200" : "bg-[#EEF3FF] text-[#2563EB] border-[#D8E3FF]"
                    )}>
                      {log.purpose || 'Security Alert'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    {log.reason ? (
                      <div className="flex items-center gap-2 text-red-500 text-[11px] font-mono italic">
                        <AlertCircle className="w-3 h-3" />
                        {log.reason}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                         <Shield className="w-4 h-4 text-[#2563EB]" />
                         <span className="text-[16px] font-mono font-black text-[#2563EB] tracking-[0.2em]">
                           {log.otp || '********'}
                         </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-slate-400 font-serif italic">
                    No institutional security logs discovered...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NavItem({ active, icon: Icon, label, onClick, badge }: { active: boolean, icon: any, label: string, onClick: () => void, badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-[calc(100%-16px)] flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 rounded-xl text-sm font-medium transition-all relative group cursor-pointer",
        active 
          ? "bg-[#EEF3FF] text-[#0A33CC] font-bold shadow-xs border-l-4 border-[#0A33CC] rounded-l-none" 
          : "text-slate-600 hover:bg-[#EEF3FF] hover:text-[#0A33CC]"
      )}
    >
      <Icon className={cn("w-[18px]", active ? "text-[#0A33CC]" : "text-slate-400 group-hover:text-[#0A33CC]")} />
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full font-mono leading-none shadow-xs">
          {badge}
        </span>
      )}
    </button>
  );
}

function StatCard({ label, value, sub, colorClass, currency }: { label: string, value: string, sub: string, colorClass: string, currency?: string }) {
  return (
    <div className="bg-white border border-[#D8E3FF] rounded-2xl p-6 relative overflow-hidden group hover:border-[#2563EB]/40 transition-all shadow-sm">
      <div className={cn("absolute top-0 right-0 w-24 h-24 opacity-[0.06] rounded-full translate-x-6 -translate-y-6 transition-transform group-hover:scale-125 bg-current", colorClass)}></div>
      <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3">{label}</div>
      <div className={cn("font-serif text-3xl font-black mb-1 transition-transform group-hover:translate-x-1", colorClass)}>
        {currency ? <span>{currency}</span> : null}{value}
      </div>
      <div className="text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function DashboardOverview({ stats, onViewLedger }: { stats: any; onViewLedger?: () => void }) {
  const { t } = useLanguage();
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<any[]>([]);

  useEffect(() => {
    // Consolidated Payments Listener
    const unsubPayments = onSnapshot(collection(db, 'payments'), (snap) => {
      // 1. Recent Payments (Latest 5)
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const sorted = [...all]
        .filter(p => p.paidAt || p.createdAt)
        .sort((a, b) => {
          const dateA = new Date(a.paidAt || a.createdAt).getTime();
          const dateB = new Date(b.paidAt || b.createdAt).getTime();
          return dateB - dateA;
        });
      setRecentPayments(sorted.slice(0, 5));

      // 2. Revenue Breakdown
      const breakdown: Record<string, { enrolled: number, amount: number }> = {};
      let maxAmount = 0;
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status === 'success' && data.dept_name) {
          if (!breakdown[data.dept_name]) {
            breakdown[data.dept_name] = { enrolled: 0, amount: 0 };
          }
          breakdown[data.dept_name].enrolled += 1;
          breakdown[data.dept_name].amount += data.amount || 0;
          if (breakdown[data.dept_name].amount > maxAmount) maxAmount = breakdown[data.dept_name].amount;
        }
      });

      const colors = ['bg-[#2563EB]', 'bg-[#5b8fff]', 'bg-[#ff9a3c]', 'bg-[#ff5a5a]', 'bg-[#3ddba5]', 'bg-[#a35bff]'];
      const revenueSorted = Object.entries(breakdown)
        .map(([name, data], i) => ({
          name,
          ...data,
          progress: maxAmount > 0 ? (data.amount / maxAmount) * 100 : 0,
          color: colors[i % colors.length]
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6);
      
      setRevenueBreakdown(revenueSorted);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));

    return () => {
      unsubPayments();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
        <StatCard label={t('admin.totalStudents')} value={stats.totalStudents.toLocaleString()} sub={`${stats.suspendedCount || 0} suspended`} colorClass="text-[#2563EB]" />
        <StatCard label="Protocol Violation" value={(stats.suspendedCount || 0).toString()} sub="Total Suspended" colorClass="text-red-500" />
        <StatCard label={t('admin.totalRevenue')} value={stats.displayRevenue} sub="All time success" colorClass="text-emerald-600" />
        <StatCard label={t('admin.totalPaidOut')} value={stats.totalPaidOut} sub="Successful withdrawals" colorClass="text-purple-600" />
        <StatCard label={t('admin.pendingAffiliates')} value={stats.pendingCommissions.toString()} sub="Waiting for approval" colorClass="text-amber-600" />
        <StatCard label={t('admin.pendingPayouts')} value={stats.pendingWithdrawals.toString()} sub="Withdrawal requests" colorClass="text-rose-600" />
        <StatCard label="Support Queries" value={stats.pendingSupports.toString()} sub="People lodged complaints" colorClass="text-[#2563EB]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-[#D8E3FF] flex items-center justify-between bg-[#EEF3FF]/40">
            <h3 className="font-serif font-bold text-base text-slate-900">{t('admin.recentPayments')}</h3>
            <button onClick={onViewLedger} className="text-[12px] text-[#2563EB] font-bold hover:underline">{t('admin.viewLedger')} →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#EEF3FF]/30 border-b border-[#D8E3FF]">
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">{t('admin.scholarlyPayer')}</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">{t('admin.institutionalDept')}</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">{t('admin.endowment')}</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">{t('admin.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E3FF]">
                {recentPayments.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">No recent transactions recorded</td></tr>
                ) : (
                  recentPayments.map((p, i) => (
                    <tr key={i} className="hover:bg-[#EEF3FF]/30 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="text-[13.5px] font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors">{p.studentName || t('profile.defaultName')}</div>
                        <div className="text-[11px] text-slate-400">{p.email || 'no-email'}</div>
                      </td>
                      <td className="px-6 py-5 text-[13px] text-slate-600">{p.dept_name || '—'}</td>
                      <td className="px-6 py-5 text-[13.5px] font-mono font-bold text-emerald-600">{p.currency === 'USD' ? '$' : '₦'}{p.amount?.toLocaleString()}</td>
                      <td className="px-6 py-5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider font-mono",
                          p.status === 'success' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-[#D8E3FF] rounded-2xl p-6 shadow-sm">
          <h3 className="font-serif font-bold text-base text-slate-900 mb-6">{t('admin.revenueBreakdown')}</h3>
          <div className="space-y-6">
            {revenueBreakdown.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs italic">No department revenue data available</div>
            ) : (
              revenueBreakdown.map((d, i) => (
                <div key={i} className="space-y-2 group">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[13px] font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors">{d.name}</div>
                      <div className="text-[11px] text-slate-400">{d.enrolled} enrolled</div>
                    </div>
                    <div className="text-[13px] font-mono font-black text-emerald-600">₦{(d.amount / 1000000).toFixed(2)}M</div>
                  </div>
                  <div className="h-1.5 bg-[#EEF3FF] rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-1000", d.color)} style={{ width: `${d.progress}%` }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersManager({ requestClearance }: { requestClearance: any }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterVerified, setFilterVerified] = useState<'all' | 'verified' | 'unverified' | 'suspended'>('all');

  // Add User states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('student');
  const [newDepartment, setNewDepartment] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Faculties options
  const [faculties, setFaculties] = useState<any[]>([]);

  useEffect(() => {
    if (!showAddModal) {
      setAddError(null);
      setAddSuccess(null);
    }
  }, [showAddModal]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'faculties'), (snap) => {
      setFaculties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'faculties'));
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);

    if (!newEmail || !newPassword) {
      setAddError("Email and password are required.");
      return;
    }
    setSavingUser(true);
    let secondaryApp: any = null;
    try {
      // Create a secondary Firebase App in order to register the user without logging out the current admin
      const secondaryAppName = "secondary-reg-" + Date.now();
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      
      const secondaryAuth = getSecondaryAuth(secondaryApp);
      const secondaryDb = initializeFirestore(secondaryApp, {
        experimentalForceLongPolling: true,
      }, (firebaseConfig as any).firestoreDatabaseId);

      // Create user credentials in Auth table
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const newUid = userCredential.user.uid;

      // Prepare user document payload
      const userDocRef = doc(secondaryDb, 'users', newUid);
      const payload: any = {
        uid: newUid,
        email: newEmail.toLowerCase(),
        displayName: newDisplayName || "Scholar",
        role: "student", // Always starts as 'student' to satisfy basic 'allow create' security policies
        department: newDepartment || "",
        balance: 0,
        affiliateStatus: "none",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Write user document to Firestore using secondary client
      await setDoc(userDocRef, payload);

      // If requested role is moderator or admin, update it using the primary Admin credentials
      if (newRole !== "student") {
        const primaryDocRef = doc(db, 'users', newUid);
        await updateDoc(primaryDocRef, {
          role: newRole,
          updatedAt: new Date().toISOString()
        });

        if (newRole === "admin") {
          const adminDocRef = doc(db, 'admins', newUid);
          await setDoc(adminDocRef, {
            uid: newUid,
            email: newEmail.toLowerCase(),
            displayName: newDisplayName || "Scholar",
            createdAt: new Date().toISOString()
          });
        }
      }

      // Clean up the secondary application auth session
      await secondarySignOut(secondaryAuth);

      setAddSuccess("Scholar created successfully.");
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('student');
      setNewDepartment('');
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || err;
      if (err.code === 'auth/email-already-in-use' || String(err).includes('email-already-in-use')) {
        errorMsg = "This email address is already registered in the system. Please use a different email address or search for the existing scholar beneath.";
      } else if (err.code === 'auth/weak-password' || String(err).includes('weak-password')) {
        errorMsg = "The password is too weak. Please provide a password of at least 6 characters.";
      } else if (err.code === 'auth/invalid-email' || String(err).includes('invalid-email')) {
        errorMsg = "The email address is invalid. Please double check and enter a correct email format.";
      }
      setAddError(errorMsg);
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error("Error deleting secondary app:", e);
        }
      }
      setSavingUser(false);
    }
  };

  const filtered = users.filter(u => {
    const matchesSearch = u.displayName?.toLowerCase().includes(search.toLowerCase()) || 
                         u.email?.toLowerCase().includes(search.toLowerCase()) ||
                         u.suspensionReason?.toLowerCase().includes(search.toLowerCase());
    
    if (filterVerified === 'verified') return matchesSearch && u.emailVerified;
    if (filterVerified === 'unverified') return matchesSearch && !u.emailVerified;
    if (filterVerified === 'suspended') return matchesSearch && u.status === 'suspended';
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search scholars (name, email, or protocol reason)..." 
            className="w-full bg-[#EEF3FF] border border-[#D8E3FF] text-slate-900 rounded-xl pl-10 pr-4 py-2.5 text-[13px] focus:border-[#2563EB] outline-none transition-all shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          value={filterVerified}
          onChange={(e) => setFilterVerified(e.target.value as any)}
          className="bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-[13px] text-slate-600 outline-none hover:border-[#2563EB]/30 transition-all cursor-pointer"
        >
          <option value="all">{t('admin.status')}</option>
          <option value="verified">Authorized Only</option>
          <option value="unverified">Pending Only</option>
          <option value="suspended">Suspended / Protocol Violation</option>
        </select>
        <button 
          onClick={() => downloadCSV(users, 'institutional_users')}
          className="bg-white border border-[#D8E3FF] text-slate-600 px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest hover:border-[#2563EB] hover:text-[#2563EB] transition-all flex items-center gap-2 shadow-sm"
        >
          <Download className="w-4 h-4" />
          {t('admin.export')}
        </button>
        <button onClick={() => setShowAddModal(true)} className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest ml-auto shadow-lg shadow-[#2563EB]/20 hover:scale-105 active:scale-95 transition-all text-nowrap">+ {t('admin.addUser')}</button>
      </div>

      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#EEF3FF]/50 border-b border-[#D8E3FF]">
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.scholarProfile')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Last Active</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.institutionalDept')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.role')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.affiliateStatus')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.status')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8E3FF]">
              {filtered.map((u) => {
                const isSuspended = u.status === 'suspended';
                const lastActive = u.lastStudyDate ? format(new Date(u.lastStudyDate), 'MMM d, p') : 'Never';
                
                const toggleSuspension = async () => {
                  const targetAction = isSuspended ? 'update' : 'delete'; 
                  
                  requestClearance(u.id, 'update', async () => {
                    try {
                      const updatePayload: any = {
                        status: isSuspended ? 'active' : 'suspended',
                        suspensionReason: isSuspended ? "" : 'Suspended by Administrator',
                        suspendedAt: isSuspended ? "" : new Date().toISOString()
                      };
                      await updateDoc(doc(db, 'users', u.id), updatePayload);
                      alert(`User status successfully updated to ${isSuspended ? 'ACTIVE' : 'SUSPENDED'}.`);
                    } catch (err: any) {
                      console.error("Error setting user status:", err);
                      alert(`FAILED TO UPDATE STATUS: ${err.message || err}`);
                      throw err;
                    }
                  });
                };

                return (
                  <tr key={u.id} className="hover:bg-[#EEF3FF]/40 group transition-all">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#EEF3FF] flex items-center justify-center font-serif font-black text-[#2563EB] border border-[#D8E3FF] shadow-sm group-hover:rotate-6 transition-transform">
                          {u.displayName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="text-[14px] font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors">{u.displayName || t('profile.defaultName')}</div>
                          <div className="text-[11px] text-slate-400 font-mono italic">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-[#2563EB]/50" />
                        <span className="text-[12px] font-mono">{lastActive}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-[13px] font-bold text-slate-500 uppercase tracking-wider">{u.department || '—'}</td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] border",
                          u.affiliateStatus === 'active' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-[#EEF3FF] text-[#2563EB] border-[#D8E3FF]"
                        )}>
                          {u.affiliateStatus || 'Inactive'}
                        </span>
                        {u.referralCode && (
                          <span className="text-[10px] font-mono font-bold text-[#2563EB] tracking-tighter opacity-70 truncate max-w-[80px]">{u.referralCode}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] border",
                        u.role === 'admin' ? "bg-[#EEF3FF] text-[#2563EB] border-[#2563EB]/40 shadow-sm" : "bg-slate-100 text-slate-600 border-slate-200"
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={cn(
                        "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest",
                        isSuspended ? "text-red-500" : "text-emerald-600"
                      )}>
                        <div className={cn("w-2 h-2 rounded-full", isSuspended ? "bg-red-500" : "bg-emerald-500 animate-pulse")}></div>
                        {isSuspended ? 'Suspended' : t('admin.protocolActive')}
                      </span>
                      {isSuspended && u.suspensionReason && (
                        <div className="text-[8px] text-red-500 mt-1 font-bold uppercase tracking-widest bg-red-50 px-1 rounded truncate max-w-[120px]">
                          {u.suspensionReason}
                        </div>
                      )}
                      <div className="text-[8px] text-slate-400 mt-1 font-mono uppercase tracking-tighter">Currency: {u.currency || 'NGN'}</div>
                    </td>
                    <td className="px-6 py-5 text-nowrap">
                      <div className="flex items-center gap-2">
                        {!u.isPartner && (
                          <button 
                            onClick={async () => {
                              try {
                                const referralCode = "DS" + Math.random().toString(36).substring(2, 8).toUpperCase();
                                await updateDoc(doc(db, 'users', u.id), {
                                  affiliateStatus: "active",
                                  isAffiliate: true,
                                  isPartner: true,
                                  referralCode: referralCode,
                                  activatedAt: new Date().toISOString(),
                                  updatedAt: new Date().toISOString()
                                });
                                alert('User successfully promoted to Partner STATUS.');
                              } catch (err: any) {
                                alert('Activation Error: ' + err.message);
                              }
                            }}
                            className="bg-[#EEF3FF] text-[#2563EB] border border-[#D8E3FF] px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[#2563EB] hover:text-white transition-all shadow-sm"
                          >
                            {t('admin.approvePartner')}
                          </button>
                        )}

                        <button 
                          onClick={toggleSuspension}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm border",
                            isSuspended 
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20" 
                              : "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20"
                          )}
                        >
                          {isSuspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="font-serif font-black text-xl text-[#2563EB] mb-2 uppercase tracking-tight text-center">Add New Scholar</h3>
              <p className="text-[11px] text-slate-500 text-center mb-6 leading-relaxed">
                Register a new student, moderator, or admin directly.
              </p>

              {addError && (
                <div className="bg-red-500/10 border border-red-500/25 text-red-500 p-3.5 rounded-xl text-[12px] text-center mb-5 break-words font-medium antialiased">
                  {addError}
                </div>
              )}

              {addSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 p-3.5 rounded-xl text-[12px] text-center mb-5 font-medium antialiased">
                  {addSuccess}
                </div>
              )}

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#2563EB] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. johndoe@gmail.com"
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#2563EB] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#2563EB] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-1.5">Institutional Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#2563EB] transition-all cursor-pointer"
                  >
                    <option value="student">student</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-1.5">Department Access</label>
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#2563EB] transition-all cursor-pointer"
                  >
                    <option value="">No Department Preset</option>
                    {faculties.map((f) => (
                      <option key={f.id} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="py-3 rounded-xl font-black text-[11px] uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingUser}
                    className="bg-[#2563EB] hover:bg-[#1d4ed8] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 transition-all font-mono"
                  >
                    {savingUser ? 'Creating...' : 'Register Scholar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AffiliateManager({ requestClearance }: { requestClearance: any }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'commissions' | 'registry'>('commissions');
  const [payouts, setPayouts] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    const unsubComm = onSnapshot(collection(db, 'affiliates'), (snap) => {
      setAffiliates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'affiliates'));

    const unsubPartners = onSnapshot(query(collection(db, 'users'), where('isPartner', '==', true)), (snap) => {
      setPartners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubPayouts = onSnapshot(collection(db, 'withdrawals'), (snap) => {
      setPayouts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));

    return () => {
      unsubComm();
      unsubPartners();
      unsubPayouts();
    };
  }, []);

  const authorizeCommission = async (id: string, currentStatus: string) => {
    if (currentStatus === 'paid') return;
    requestClearance(id, 'payout', async () => {
      await updateDoc(doc(db, 'affiliates', id), {
        status: 'paid',
        paidAt: new Date().toISOString()
      });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-[#D8E3FF] pb-2">
        <button 
          onClick={() => setActiveSubTab('commissions')}
          className={cn(
            "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
            activeSubTab === 'commissions' ? "text-[#2563EB] border-b-2 border-[#2563EB]" : "text-slate-500 hover:text-slate-800"
          )}
        >
          {t('admin.matrix')}
        </button>
        <button 
          onClick={() => setActiveSubTab('registry')}
          className={cn(
            "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
            activeSubTab === 'registry' ? "text-[#2563EB] border-b-2 border-[#2563EB]" : "text-slate-500 hover:text-slate-800"
          )}
        >
          {t('admin.partnerRegistry')}
        </button>
      </div>

      <div className="flex justify-between items-center">
        <button 
          onClick={() => downloadCSV(activeSubTab === 'commissions' ? affiliates : partners, `affiliate_${activeSubTab}`)}
          className="bg-white border border-[#D8E3FF] text-slate-600 px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest hover:border-[#2563EB] hover:text-[#2563EB] transition-all flex items-center gap-2 shadow-sm"
        >
          <Download className="w-4 h-4" />
          {t('admin.export')}
        </button>
      </div>

      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {activeSubTab === 'commissions' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#EEF3FF]/50 border-b border-[#D8E3FF]">
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Commission Referrer</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Accrued Amount</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Protocol Status</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E3FF]">
                {affiliates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-32 text-center">
                      <LinkIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-500 text-[13.5px] font-medium tracking-tight">No partner referral data recorded in archives</p>
                    </td>
                  </tr>
                ) : (
                  affiliates.map((a) => (
                    <tr key={a.id} className="hover:bg-[#EEF3FF]/40 group transition-all">
                      <td className="px-6 py-6 font-bold text-[14.5px] text-slate-900 group-hover:text-[#2563EB] transition-colors">{a.referrerName}</td>
                      <td className="px-6 py-6 font-mono text-[14.5px] font-black text-emerald-600">
                        {a.commissionCurrency === 'USD' ? '$' : '₦'}{a.commissionAmount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-6">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest font-mono border shadow-sm",
                          a.status === 'paid' ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-[#EEF3FF] text-[#2563EB] border-[#D8E3FF]"
                        )}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-6 py-6">
                        <button 
                          onClick={() => authorizeCommission(a.id, a.status)}
                          disabled={a.status === 'paid'}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-sm active:scale-95 border",
                            a.status === 'paid' ? "bg-slate-100 text-slate-400 border-transparent cursor-not-allowed" : "bg-[#EEF3FF] text-[#2563EB] border-[#D8E3FF] hover:bg-[#2563EB] hover:text-white"
                          )}
                        >
                          {a.status === 'paid' ? 'Authenticated' : 'Authorize Payment'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#EEF3FF]/50 border-b border-[#D8E3FF]">
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Partner Name</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Referral Code</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.totalEarned')}</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.totalPaid')}</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.balance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E3FF]">
                {partners.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-32 text-center text-slate-500 italic">No partners founded in registry</td></tr>
                ) : (
                  partners.map((p) => {
                    const earned = affiliates.filter(a => a.referrerUid === p.id).reduce((acc, curr) => acc + (curr.commissionAmount || 0), 0);
                    const paid = payouts.filter(w => w.userId === p.id && w.status !== 'failed').reduce((acc, curr) => acc + (curr.amount || 0), 0);
                    const bal = Math.max(0, earned - paid);
                    const currIcon = p.currency === 'USD' ? '$' : '₦';
                    return (
                      <tr key={p.id} className="hover:bg-[#EEF3FF]/40 group transition-all">
                        <td className="px-6 py-6 text-nowrap">
                          <div className="text-[14px] font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors">{p.displayName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{p.email}</div>
                        </td>
                        <td className="px-6 py-6">
                          <span className="bg-[#EEF3FF] text-[#2563EB] px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-[#D8E3FF]">{p.referralCode}</span>
                        </td>
                        <td className="px-6 py-6 text-[14px] font-mono font-bold text-slate-900">{currIcon}{earned.toLocaleString()}</td>
                        <td className="px-6 py-6 text-[14px] font-mono font-bold text-emerald-600">{currIcon}{paid.toLocaleString()}</td>
                        <td className="px-6 py-6 text-[14px] font-mono font-black text-[#2563EB]">{currIcon}{bal.toLocaleString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentsManager() {
  const { t } = useLanguage();
  const [payments, setPayments] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [gateway, setGateway] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'payments'), (snap) => {
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = all.sort((a: any, b: any) => {
        const dateA = new Date(a.paidAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.paidAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setPayments(sorted);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));
  }, []);

  const filteredPayments = payments.filter((p) => {
    const searchLower = search.toLowerCase();
    const matchesSearch = !search ||
      (p.reference || '').toLowerCase().includes(searchLower) ||
      (p.studentName || '').toLowerCase().includes(searchLower) ||
      (p.email || '').toLowerCase().includes(searchLower) ||
      (p.dept_name || p.department || '').toLowerCase().includes(searchLower);

    const matchesGateway = !gateway || gateway === 'Filter by Gateway' ||
      (gateway === 'Paystack Secure' && ((p.reference || '').startsWith('pay_') || (p.reference || '').startsWith('sim_') || (p.reference || '').startsWith('dept_pay_'))) ||
      (gateway === 'Flutterwave Flow' && (p.reference || '').startsWith('flw_'));

    return matchesSearch && matchesGateway;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder={t('admin.searchTransaction')} 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#EEF3FF] border border-[#D8E3FF] text-slate-900 rounded-xl pl-10 pr-4 py-3 text-[13px] focus:border-[#2563EB] outline-none shadow-sm"
          />
        </div>
        <select 
          value={gateway}
          onChange={(e) => setGateway(e.target.value)}
          className="bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-5 py-3 text-[13px] text-slate-600 outline-none"
        >
          <option value="">Filter by Gateway</option>
          <option value="Paystack Secure">Paystack Secure</option>
          <option value="Flutterwave Flow">Flutterwave Flow</option>
        </select>
        <button 
          onClick={() => downloadCSV(filteredPayments, 'financial_ledger')}
          className="bg-white border border-[#D8E3FF] text-slate-600 px-6 py-3 rounded-xl text-[13px] font-black uppercase tracking-widest hover:border-[#2563EB] hover:text-[#2563EB] transition-all flex items-center gap-2 ml-auto shadow-sm"
        >
          <Download className="w-4 h-4" />
          {t('admin.export')}
        </button>
      </div>

      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#EEF3FF]/50 border-b border-[#D8E3FF]">
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.protocolRef')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.scholarlyPayer')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.endowment')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.status')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.timestamp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8E3FF]">
              {filteredPayments.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-32 text-center text-slate-400 italic">No financial movements detected in secure ledger</td></tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#EEF3FF]/40 group transition-all">
                    <td className="px-6 py-6 text-[12px] font-mono text-slate-400 group-hover:text-[#2563EB] transition-colors">{p.reference || p.id}</td>
                    <td className="px-6 py-6 text-[14.5px] font-bold text-slate-900">
                      {p.studentName || p.studentEmail || p.email || t('profile.defaultName')}
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">{p.email || 'no-email'}</div>
                    </td>
                    <td className="px-6 py-6 text-[14.5px] font-black text-emerald-600 font-mono text-nowrap">
                      {p.currency === 'USD' ? '$' : '₦'}{p.amount?.toLocaleString()}
                    </td>
                    <td className="px-6 py-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest font-mono border shadow-sm text-nowrap",
                        p.status === 'success' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-[#EEF3FF] text-[#2563EB] border-[#D8E3FF]"
                      )}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-[12.5px] text-slate-400 font-mono text-nowrap">
                      {p.paidAt || p.createdAt ? format(new Date(p.paidAt || p.createdAt), 'yyyy.MM.dd | HH:mm') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalyticsDashboard({ stats }: { stats: any }) {
  const { t } = useLanguage();
  const [revenueData, setRevenueData] = useState<number[]>(new Array(12).fill(0));
  const [payoutData, setPayoutData] = useState<number[]>(new Array(12).fill(0));

  useEffect(() => {
    // Process Revenue History
    const unsubPayments = onSnapshot(collection(db, 'payments'), (snap) => {
      const monthly = new Array(12).fill(0);
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status === 'success' && (data.paidAt || data.createdAt)) {
          const date = new Date(data.paidAt || data.createdAt);
          if (date.getFullYear() === new Date().getFullYear()) {
            const amount = data.currency === 'USD' ? (data.amount || 0) * 1500 : (data.amount || 0);
            monthly[date.getMonth()] += amount;
          }
        }
      });
      const maxRev = Math.max(...monthly, 1);
      setRevenueData(monthly.map(v => (v / maxRev) * 100));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));

    // Process Withdrawal History
    const unsubWithdrawals = onSnapshot(collection(db, 'withdrawals'), (snap) => {
      const monthly = new Array(12).fill(0);
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status === 'success' && data.processedAt) {
          const date = new Date(data.processedAt);
          if (date.getFullYear() === new Date().getFullYear()) {
            const amount = data.currency === 'USD' ? (data.amount || 0) * 1500 : (data.amount || 0);
            monthly[date.getMonth()] += amount;
          }
        }
      });
      const maxPay = Math.max(...monthly, 1);
      setPayoutData(monthly.map(v => (v / maxPay) * 100));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));

    return () => {
      unsubPayments();
      unsubWithdrawals();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live Revenue (MTD)" value={`₦${(stats.totalRevenue/1000).toLocaleString()}k`} sub="Verified success rate 99.1%" colorClass="text-emerald-600" />
        <StatCard label="Scholarly Access" value={stats.totalStudents.toLocaleString()} sub="Institutional connections" colorClass="text-[#2563EB]" />
        <StatCard label="Avg Enrollment" value="₦12.9k" sub="Mean tuition value" colorClass="text-[#2563EB]" />
        <StatCard label="Suspension Rate" value="0.4%" sub="Violation deactivations" colorClass="text-red-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#D8E3FF] rounded-2xl p-8 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 text-slate-900"><BarChart2 className="w-20 h-20" /></div>
          <h3 className="font-serif font-black text-lg mb-8 tracking-tight uppercase tracking-[0.2em] text-[#2563EB]">{t('admin.revenueHistory')}</h3>
          <div className="h-64 flex items-end justify-between gap-3">
            {revenueData.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                <div 
                  className="w-full bg-gradient-to-t from-[#2563EB]/10 via-[#2563EB]/40 to-[#2563EB] rounded-t-lg transition-all duration-500 group-hover:brightness-125"
                  style={{ height: `${h}%` }}
                ></div>
                <div className="text-[9px] font-black text-slate-400 group-hover:text-[#2563EB] transition-colors font-mono">M{i+1}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#D8E3FF] rounded-2xl p-8 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 text-slate-900"><Users className="w-20 h-20" /></div>
          <h3 className="font-serif font-black text-lg mb-8 tracking-tight uppercase tracking-[0.2em] text-red-500">{t('admin.payoutHistory')}</h3>
          <div className="h-64 flex items-end justify-between gap-3">
            {payoutData.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                <div 
                  className="w-full bg-gradient-to-t from-red-500/10 via-red-500/40 to-red-500 rounded-t-lg transition-all duration-500 group-hover:brightness-125"
                  style={{ height: `${h}%` }}
                ></div>
                <div className="text-[9px] font-black text-slate-400 group-hover:text-red-500 transition-colors font-mono">M{i+1}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DepartmentsManager({ onEditArchive, requestClearance }: { onEditArchive?: (dept: string) => void; requestClearance: any }) {
  const { t } = useLanguage();
  const [showAddFaculty, setShowAddFaculty] = useState(false);
  const [editingFacultyId, setEditingFacultyId] = useState<string | null>(null);
  const [facultyName, setFacultyName] = useState('');
  const [facultyPrice, setFacultyPrice] = useState(10000);
  const [facultyPriceUSD, setFacultyPriceUSD] = useState(7);
  const [facultyImageUrl, setFacultyImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [customFaculties, setCustomFaculties] = useState<any[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [manualLevelInput, setManualLevelInput] = useState('');

  // Levels Management States
  const [showLevelsModal, setShowLevelsModal] = useState(false);
  const [selectedDeptForLevels, setSelectedDeptForLevels] = useState<any>(null);
  const [modalLevels, setModalLevels] = useState<string[]>([]);
  const [newLevelName, setNewLevelName] = useState('');
  const [editingLevelIndex, setEditingLevelIndex] = useState<number | null>(null);
  const [editingLevelValue, setEditingLevelValue] = useState('');

  const getDeptLevels = (deptName: string) => {
    const matched = customFaculties.find(f => f.name === deptName);
    return matched?.levels || DEPARTMENT_STRUCTURE[deptName]?.levels || ['200L', '300L', '400L', '500L', '600L', 'Application Questions'];
  };

  const openManageLevelsModal = (dept: any) => {
    setSelectedDeptForLevels(dept);
    const levels = getDeptLevels(dept.name);
    setModalLevels([...levels]);
    setNewLevelName('');
    setEditingLevelIndex(null);
    setEditingLevelValue('');
    setShowLevelsModal(true);
  };

  useEffect(() => {
    return onSnapshot(collection(db, 'faculties'), (snap) => {
      setCustomFaculties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'faculties'));
  }, []);

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpTargetId, setOtpTargetId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: 'delete' | 'update' | 'payout' | 'update_levels', data?: any } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const requestSecurityClearance = async (id: string, action: 'delete' | 'update' | 'payout' | 'update_levels', data?: any) => {
    setOtpTargetId(id);
    setPendingAction({ type: action, data });
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      setLoading(true);
      // Construct a safe document ID for the token
      const docId = `${action}_${id.toString().replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      await setDoc(doc(db, 'admin_tokens', docId), {
        token,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        targetId: id,
        action,
        adminEmail: 'peteradekunle923@gmail.com'
      });
      
      // Dispatch Real Email via Backend API
      try {
        const res = await axios.post('/api/send-otp', {
          token,
          action,
          targetId: id,
          email: 'peteradekunle923@gmail.com'
        });
        if (res.data && res.data.emailSent === false) {
           alert(`[DEVELOPMENT MODE] Email delivery failed or key missing.\nToken bypassed for preview:\n\n${token}`);
        } else {
           alert(`[SECURITY AUTHENTICATED] A 6-digit verification token has been dispatched to: peteradekunle923@gmail.com. Please check your inbox (or spam folder).`); 
        }
      } catch (emailErr: any) {
        console.error('Email Dispatch Error:', emailErr);
        // Fallback or warning if the server-side key isn't set yet
        const errorDetail = emailErr.response?.data?.details || emailErr.message;
        alert(`[WARNING] Database authorization record created, but email delivery failed. \n\nReason: ${errorDetail}\n\n[DEVELOPMENT MODE] Token bypassed for preview:\n\n${token}`);
      }
      
      setOtpValue('');
      setShowOtpModal(true);
    } catch (err) {
      console.error('Clearance Request Error:', err);
      alert('SECURITY PROTOCOL ERROR: Failed to dispatch verification token. Please check your network connection.');
      handleFirestoreError(err, OperationType.WRITE, 'admin_tokens');
    } finally {
      setLoading(false);
    }
  };

  const confirmSecurityAction = async () => {
    if (!otpTargetId || !pendingAction) return;
    setIsVerifying(true);
    try {
      const docId = `${pendingAction.type}_${otpTargetId.toString().replace(/[^a-zA-Z0-9]/g, '_')}`;
      const snap = await getDoc(doc(db, 'admin_tokens', docId));
      
      if (snap.exists()) {
        const entry = snap.data();
        if (entry.token === otpValue && new Date(entry.expiresAt) > new Date()) {
          if (pendingAction.type === 'delete') {
            await deleteDoc(doc(db, 'faculties', otpTargetId));
            alert('SECURITY CLEARANCE GRANTED: Faculty record permanently erased.');
          } else if (pendingAction.type === 'update') {
            // Success: Proceed to the edit modal
            openEditModal(pendingAction.data);
          } else if (pendingAction.type === 'payout') {
            // Success: Authorize the commission payout
            await updateDoc(doc(db, 'affiliates', otpTargetId), {
              status: 'paid',
              paidAt: new Date().toISOString()
            });
            alert('SECURITY CLEARANCE GRANTED: Commission payout authorized.');
          } else if (pendingAction.type === 'update_levels') {
            // Success: Update the levels in Firestore!
            const { dept, newLevels } = pendingAction.data;
            if (dept.isStatic) {
              await setDoc(doc(db, 'faculties', dept.name), {
                name: dept.name,
                price: dept.price,
                priceUSD: dept.priceUSD,
                levels: newLevels,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            } else {
              await updateDoc(doc(db, 'faculties', dept.id), {
                levels: newLevels,
                updatedAt: new Date().toISOString()
              });
            }
            alert('SECURITY CLEARANCE GRANTED: Department levels successfully updated.');
            setShowLevelsModal(false);
          }
          
          try {
            await deleteDoc(doc(db, 'admin_tokens', docId)); // Cleanup
          } catch (e) {
            console.warn('Token cleanup failed', e);
          }
          
          setShowOtpModal(false);
          setOtpValue('');
          setOtpTargetId(null);
          setPendingAction(null);
        } else {
          alert('SECURITY ALERT: Invalid or expired token. Authorization denied.');
        }
      } else {
        alert('SECURITY PROTOCOL FAILURE: No active clearance request found for this operation.');
      }
    } catch (err) {
      alert('VERIFICATION ERROR: Protocol communication failure.');
      handleFirestoreError(err, OperationType.GET, 'admin_tokens');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyName) return;
    setLoading(true);

    const standardLevels = ['200L', '300L', '400L', '500L', '600L', 'Application Questions'];
    const finalLevels = standardLevels.filter(lvl => selectedLevels.includes(lvl));
    
    if (manualLevelInput.trim()) {
      const customs = manualLevelInput.split(',').map(s => s.trim()).filter(Boolean);
      customs.forEach(c => {
        if (!finalLevels.includes(c)) {
          finalLevels.push(c);
        }
      });
    }

    try {
      if (editingFacultyId) {
        await updateDoc(doc(db, 'faculties', editingFacultyId), {
          name: facultyName,
          price: facultyPrice,
          priceUSD: facultyPriceUSD,
          levels: finalLevels,
          imageUrl: facultyImageUrl,
          updatedAt: new Date().toISOString()
        });
        alert('Faculty record successfully updated in archives.');
      } else {
        await addDoc(collection(db, 'faculties'), {
          name: facultyName,
          price: facultyPrice,
          priceUSD: facultyPriceUSD,
          levels: finalLevels,
          imageUrl: facultyImageUrl,
          createdAt: new Date().toISOString()
        });
        alert('Faculty successfully manifested in archives.');
      }
      setShowAddFaculty(false);
      setEditingFacultyId(null);
      setFacultyName('');
      setFacultyPrice(10000);
      setFacultyPriceUSD(7);
      setFacultyImageUrl('');
      setSelectedLevels([]);
      setManualLevelInput('');
    } catch (err) {
      handleFirestoreError(err, editingFacultyId ? OperationType.UPDATE : OperationType.CREATE, 'faculties');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (faculty: any) => {
    setEditingFacultyId(faculty.id);
    setFacultyName(faculty.name);
    setFacultyPrice(faculty.price);
    setFacultyPriceUSD(faculty.priceUSD || Math.ceil(faculty.price / 1500));
    setFacultyImageUrl(faculty.imageUrl || '');
    
    const levels = faculty.levels || [];
    const standardLevels = ['200L', '300L', '400L', '500L', '600L', 'Application Questions'];
    const matchedStandards = levels.filter((l: string) => standardLevels.includes(l));
    const customOnes = levels.filter((l: string) => !standardLevels.includes(l));
    
    setSelectedLevels(matchedStandards);
    setManualLevelInput(customOnes.join(', '));
    setShowAddFaculty(true);
  };

  const allDepts = (() => {
    const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
    const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
    return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
  })();

  const handleQuickFacultyImage = async (dept: any, file: File) => {
    try {
      const compressed = await compressImage(file, 480, 480, 0.78);
      if (dept.id && !dept.isStatic) {
        await updateDoc(doc(db, 'faculties', dept.id), {
          imageUrl: compressed,
          updatedAt: new Date().toISOString()
        });
      } else {
        await setDoc(doc(db, 'faculties', dept.name), {
          name: dept.name,
          price: dept.price || 10000,
          priceUSD: dept.priceUSD || 7,
          imageUrl: compressed,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      alert(`Picture updated successfully for ${dept.name}!`);
    } catch (e) {
      console.error(e);
      alert('Failed to upload department picture.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-serif font-black text-slate-900">Departments & Faculties</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage department tuition fees, custom levels, and left-aligned card pictures</p>
        </div>
        <button 
          onClick={() => {
            setEditingFacultyId(null);
            setFacultyName('');
            setFacultyPrice(10000);
            setFacultyPriceUSD(7);
            setFacultyImageUrl('');
            setSelectedLevels([]);
            setManualLevelInput('');
            setShowAddFaculty(true);
          }}
          className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-8 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-[#2563EB]/20 flex items-center gap-3 hover:scale-105 active:scale-95 transition-all text-nowrap cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          {t('admin.addFaculty')}
        </button>
      </div>

      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#EEF3FF]/50 border-b border-[#D8E3FF]">
                <th className="px-6 py-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Picture & Name</th>
                <th className="px-6 py-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.systemSlug')}</th>
                <th className="px-6 py-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.tuitionBase')}</th>
                <th className="px-6 py-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.operationalMode')}</th>
                <th className="px-6 py-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8E3FF]">
              {[...DEPARTMENTS.filter(d => !customFaculties.some(cf => cf.name === d && cf.isDeleted)).map(d => {
                const custom = customFaculties.find(cf => cf.name === d && !cf.isDeleted);
                return custom ? { ...custom, isStatic: false } : { 
                  name: d, 
                  isStatic: true, 
                  price: DEPARTMENT_PRICES[d]?.ngn || 10000, 
                  priceUSD: DEPARTMENT_PRICES[d]?.usd || 7 
                };
              }), ...customFaculties.filter(cf => !cf.isDeleted && !DEPARTMENTS.includes(cf.name))].map((dept, i) => (
                <tr key={i} className="hover:bg-[#EEF3FF]/40 group transition-all text-nowrap">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3.5">
                      <div className="relative group/pic w-12 h-12 rounded-xl overflow-hidden bg-[#EEF3FF] border border-[#D8E3FF] shrink-0 flex items-center justify-center">
                        {dept.imageUrl ? (
                          <img src={dept.imageUrl} alt={dept.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Building2 className="w-5 h-5 text-[#2563EB]" />
                        )}
                        <label className="absolute inset-0 bg-[#0B1E3D]/60 opacity-0 group-hover/pic:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                          <Camera className="w-4 h-4 text-white" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files?.[0]) handleQuickFacultyImage(dept, e.target.files[0]);
                            }} 
                          />
                        </label>
                      </div>
                      <div>
                        <div className="font-serif font-black text-[15px] text-slate-900 group-hover:text-[#2563EB] transition-colors">{dept.name}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{dept.imageUrl ? '✓ Picture Uploaded' : '• No picture set'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-[11px] text-slate-400 font-mono italic tracking-tighter">{dept.name.toLowerCase().replace(/\s+/g, '-')}</td>
                  <td className="px-6 py-6 font-mono font-black">
                    <div className="text-[#2563EB]">₦{dept.price.toLocaleString()}</div>
                    <div className="text-blue-500 text-[10px] tracking-tight group-hover:translate-x-1 transition-transform italic">${(dept.priceUSD || Math.ceil(dept.price / 1500)).toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      {dept.isStatic ? t('admin.defaultInstitutional') : t('admin.adminCustomized')}
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          if (onEditArchive) onEditArchive(dept.name);
                        }}
                        className="text-blue-600 text-[10px] font-black uppercase tracking-widest hover:underline transition-colors cursor-pointer"
                      >
                        {t('admin.archives')}
                      </button>
                      <button 
                        onClick={() => requestClearance(dept.id || dept.name, 'update', async () => openEditModal(dept))}
                        className="text-emerald-600 text-[10px] font-black uppercase tracking-widest hover:underline text-nowrap cursor-pointer"
                      >
                        Edit Details
                      </button>
                      <button 
                        onClick={() => openManageLevelsModal(dept)}
                        className="text-amber-600 hover:text-amber-700 transition-colors p-1.5 rounded hover:bg-amber-50 flex items-center gap-1 cursor-pointer"
                        title="Manage Levels"
                      >
                        <Layers className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Levels</span>
                      </button>
                       <button 
                         onClick={() => requestClearance(dept.id || dept.name, 'delete', async () => {
                           if (dept.isStatic) {
                             await setDoc(doc(db, 'faculties', dept.name), {
                               name: dept.name,
                               isDeleted: true,
                               updatedAt: new Date().toISOString()
                             }, { merge: true });
                           } else {
                             await deleteDoc(doc(db, 'faculties', dept.id));
                           }
                           alert('Faculty record successfully erased.');
                         })}
                         className="text-red-500 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50 flex items-center justify-center cursor-pointer"
                         title="Erase Faculty Record"
                       >
                         <Trash2 className="w-4 h-4 leading-none" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      
      <AnimatePresence mode="wait">
        {showAddFaculty && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setShowAddFaculty(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-serif font-black text-2xl text-slate-900 uppercase tracking-tight">
                  {editingFacultyId ? t('admin.modifyFaculty') : t('admin.initializeFaculty')}
                </h3>
                <button onClick={() => setShowAddFaculty(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddFaculty} className="space-y-5">
                <ImageUploader 
                  value={facultyImageUrl} 
                  onChange={setFacultyImageUrl} 
                  label="Department Picture (Shown on left of card in dashboard)" 
                  placeholderText="Upload department icon or banner (JPG, PNG, WebP)"
                />

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t('admin.facultyName')}</label>
                  <input 
                    required
                    value={facultyName}
                    onChange={e => setFacultyName(e.target.value)}
                    placeholder="e.g., Computer Science"
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t('admin.tuitionFee')} (₦)</label>
                    <input 
                      required
                      type="number"
                      value={Number.isNaN(facultyPrice) ? '' : facultyPrice}
                      onChange={e => setFacultyPrice(parseInt(e.target.value))}
                      className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t('admin.tuitionFee')} ($)</label>
                    <input 
                      required
                      type="number"
                      value={Number.isNaN(facultyPriceUSD) ? '' : facultyPriceUSD}
                      onChange={e => setFacultyPriceUSD(parseInt(e.target.value))}
                      className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Select Department Levels</label>
                  <div className="grid grid-cols-2 gap-2 bg-[#EEF3FF]/50 p-4 border border-[#D8E3FF] rounded-xl">
                    {['200L', '300L', '400L', '500L', '600L', 'Application Questions'].map((lvl) => {
                      const isChecked = selectedLevels.includes(lvl);
                      return (
                        <label key={lvl} className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-700 hover:text-slate-900 select-none">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedLevels(selectedLevels.filter(x => x !== lvl));
                              } else {
                                setSelectedLevels([...selectedLevels, lvl]);
                              }
                            }}
                            className="rounded border-[#D8E3FF] text-[#2563EB] bg-[#EEF3FF] focus:ring-0 focus:ring-offset-0 focus:border-[#2563EB]"
                          />
                          <span>{lvl === 'Application Questions' ? 'App. Questions' : lvl}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Manual Level Input (Optional)</label>
                  <input 
                    value={manualLevelInput}
                    onChange={e => setManualLevelInput(e.target.value)}
                    placeholder="e.g., MB 1, MB 2 (comma separated)"
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                  />
                  <p className="text-[9px] text-slate-400 mt-1">If you need other custom levels, type them above. Separate multiple entries with commas.</p>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-4 rounded-xl font-black text-[12px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 transition-all cursor-pointer"
                >
                  {loading ? 'Processing...' : editingFacultyId ? t('admin.publishUpdates') : t('admin.initializeProtocol')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOtpModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOtpModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white border border-red-200 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center border border-red-200">
                  <ShieldAlert className="w-8 h-8 text-red-500" />
                </div>
              </div>
              
              <h3 className="font-serif font-black text-xl text-slate-900 text-center mb-2 uppercase tracking-tight">{t('admin.facultySecurityClearance')}</h3>
              <p className="text-[11px] text-slate-500 text-center mb-8 font-mono leading-relaxed px-4">
                {t('admin.verificationCodeSent')} <span className="text-[#2563EB]">peteradekunle923@gmail.com</span> to authorize the <span className="text-slate-900 font-bold">{pendingAction?.type.toUpperCase()}</span> of <span className="text-[#2563EB] font-bold">{otpTargetId}</span>.
              </p>

              <div className="space-y-6">
                <input
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="0 0 0 0 0 0"
                  className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-6 py-4 text-center font-mono font-black text-2xl tracking-[0.5em] text-slate-900 focus:outline-none focus:border-red-500 transition-all placeholder:opacity-30"
                />

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowOtpModal(false)}
                    className="py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    {t('admin.abortLaunch')}
                  </button>
                  <button
                    onClick={confirmSecurityAction}
                    disabled={otpValue.length !== 6 || isVerifying}
                    className="bg-red-500 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 transition-all"
                  >
                    {isVerifying ? 'Verifying...' : t('admin.authorizeProtocol')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {showLevelsModal && selectedDeptForLevels && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setShowLevelsModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-2xl z-10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-serif font-black text-xl text-slate-900 uppercase tracking-tight">
                  Levels for {selectedDeptForLevels.name}
                </h3>
                <button onClick={() => setShowLevelsModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Levels List */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 no-scrollbar mb-6">
                {modalLevels.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No levels defined for this department.</p>
                ) : (
                  modalLevels.map((lvl, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-[#EEF3FF]/50 border border-[#D8E3FF] p-3.5 rounded-xl gap-3">
                      {editingLevelIndex === idx ? (
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            value={editingLevelValue}
                            onChange={(e) => setEditingLevelValue(e.target.value)}
                            className="flex-1 bg-white border border-[#2563EB]/40 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              if (editingLevelValue.trim()) {
                                const newLvls = [...modalLevels];
                                newLvls[idx] = editingLevelValue.trim();
                                setModalLevels(newLvls);
                                setEditingLevelIndex(null);
                              }
                            }}
                            className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingLevelIndex(null)}
                            className="text-slate-400 hover:text-slate-700 px-2 py-1.5 text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-slate-800 font-bold">{lvl}</span>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                setEditingLevelIndex(idx);
                                setEditingLevelValue(lvl);
                              }}
                              className="text-blue-600 hover:text-blue-700 transition-colors"
                              title="Rename Level"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setModalLevels(modalLevels.filter((_, i) => i !== idx));
                              }}
                              className="text-red-500 hover:text-red-600 transition-colors"
                              title="Remove Level"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add Level form */}
              <div className="border-t border-[#D8E3FF] pt-6 mb-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Add New Level</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLevelName}
                    onChange={(e) => setNewLevelName(e.target.value)}
                    placeholder="e.g., 700L or MB 3"
                    className="flex-1 bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-3 text-xs text-slate-900 focus:border-[#2563EB] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newLevelName.trim()) {
                        if (modalLevels.includes(newLevelName.trim())) {
                          alert('Level name already exists.');
                          return;
                        }
                        setModalLevels([...modalLevels, newLevelName.trim()]);
                        setNewLevelName('');
                      }
                    }}
                    className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all text-nowrap"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Save levels changes */}
              <button
                type="button"
                onClick={() => {
                  requestSecurityClearance(
                    selectedDeptForLevels.id || selectedDeptForLevels.name,
                    'update_levels',
                    { dept: selectedDeptForLevels, newLevels: modalLevels }
                  );
                }}
                className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-4 rounded-xl font-black text-[12px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 transition-all"
              >
                Save Levels (Requires OTP)
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuestionsManager({ initialFilter, requestClearance }: { initialFilter: string | null; requestClearance?: any }) {
  const { t } = useLanguage();
  const [courses, setCourses] = useState<any[]>([]);
  const [activeCourse, setActiveCourse] = useState<any>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(initialFilter);
  const [questions, setQuestions] = useState<any[]>([]);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customFaculties, setCustomFaculties] = useState<any[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [editCourseData, setEditCourseData] = useState({ id: '', title: '', department: '', level: '', description: '', imageUrl: '' });
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
  const [showCourseContentModal, setShowCourseContentModal] = useState(false);
  const [courseContentInput, setCourseContentInput] = useState('');
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => {
    setQuestionSearch('');
  }, [activeCourse]);

  useEffect(() => {
    return onSnapshot(collection(db, 'faculties'), (snap) => {
      setCustomFaculties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'faculties'));
  }, []);

  const allDepts = (() => {
    const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
    const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
    return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
  })();

  const getDeptLevels = (deptName: string) => {
    const matched = customFaculties.find(f => f.name === deptName);
    return matched?.levels || DEPARTMENT_STRUCTURE[deptName]?.levels || ['100L', '200L', '300L', '400L', '500L', '600L'];
  };
  
  // States for new course
  const [newCourse, setNewCourse] = useState({ title: '', department: initialFilter || allDepts[0], level: '100L', description: '', imageUrl: '' });
  
  // States for new question
  const [newQuestion, setNewQuestion] = useState({
    type: 'objective',
    question: '',
    options: ['', '', '', '', ''],
    correctAnswer: 0,
    answerText: '',
    explanation: '',
    order: 0
  });

  useEffect(() => {
    return onSnapshot(collection(db, 'courses'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setCourses(data);
      if (data.length > 0 && !activeCourse) {
        // Find first course that matches filter if exists
        const allDeptsList = (() => {
          const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
          const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
          return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
        })();
        const filtered = deptFilter ? data.filter(c => c.department === deptFilter) : data;
        if (filtered.length > 0) setActiveCourse(filtered[0]);
        else setActiveCourse(data[0]);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));
  }, [customFaculties]);

  const filteredCourses = deptFilter ? courses.filter(c => c.department === deptFilter) : courses;

  const coursesByTrashState = filteredCourses.filter(c => showTrash ? c.isDeleted === true : !c.isDeleted);

  const searchedCourses = coursesByTrashState.filter(c => 
    c.title.toLowerCase().includes(courseSearch.toLowerCase()) || 
    c.level.toLowerCase().includes(courseSearch.toLowerCase())
  );

  useEffect(() => {
    if (courses.length > 0) {
      if (coursesByTrashState.length > 0) {
        // If current active course is not in filtered list, pick the first one
        if (!activeCourse || !coursesByTrashState.find(c => c.id === activeCourse.id)) {
          setActiveCourse(coursesByTrashState[0]);
        }
      } else {
        setActiveCourse(null);
      }
    }
  }, [deptFilter, courses, showTrash]);

  const exportQuestionsCSV = () => {
    if (!questions.length || !activeCourse) return;
    
    const isAppQuestion = activeCourse.level === 'Application Questions';
    const headers = isAppQuestion
      ? ["Question", "Expected Answer"]
      : ["Question", "Option A", "Option B", "Option C", "Option D", "Option E", "Correct Answer (A-E or 0-4)", "Explanation"];
    
    const csvRows = [
      headers.join(','),
      ...questions.map(q => {
        const row = isAppQuestion
          ? [
              q.question || '',
              q.answerText || q.explanation || ''
            ]
          : [
              q.question || '',
              q.options?.[0] || '',
              q.options?.[1] || '',
              q.options?.[2] || '',
              q.options?.[3] || '',
              q.options?.[4] || '',
              q.correctAnswer?.toString() || '0',
              q.explanation || ''
            ];
        return row.map(cell => `"${(cell + '').replace(/"/g, '""')}"`).join(',');
      })
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `archive_${activeCourse.title.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const downloadTemplate = () => {
    const isAppQuestion = activeCourse?.level === 'Application Questions';
    const headers = isAppQuestion 
      ? ["Question", "Expected Answer"]
      : ["Question", "Option A", "Option B", "Option C", "Option D", "Option E", "Correct Answer (A-E or 0-4)", "Explanation"];
    
    const csvContent = isAppQuestion
      ? headers.join(',') + '\n"Describe the core process...","The core process starts by..."'
      : headers.join(',') + '\n"Sample Question?","Option 1","Option 2","Option 3","Option 4","Option 5","A","Because it is A"';
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "question_import_template.csv";
    link.click();
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCourse) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) return;

      const dataRows = rows.slice(1);
      let currentOrder = questions.length + 1;
      let importedCount = 0;

      try {
        setLoading(true);
        const contentRef = collection(db, 'courses', activeCourse.id, 'content');
        const isAppQuestion = activeCourse.level === 'Application Questions';
        
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const row of dataRows) {
          if (!row) continue;
          if (!isAppQuestion && row.length < 6) continue;
          if (isAppQuestion && row.length < 1) continue;
          
          let correctIdx = 0;
          if (!isAppQuestion) {
            const val = row[6]?.toString().trim().toUpperCase();
            if (['A', 'B', 'C', 'D', 'E'].includes(val)) {
              correctIdx = ['A', 'B', 'C', 'D', 'E'].indexOf(val);
            } else if (!isNaN(parseInt(val)) && parseInt(val) >= 0 && parseInt(val) <= 4) {
              correctIdx = parseInt(val);
            }
          }

          const newDocRef = doc(contentRef);
          batch.set(newDocRef, {
            type: isAppQuestion ? 'application' : 'objective',
            question: row[0] || 'Untitled Question',
            options: isAppQuestion ? [] : [row[1] || 'Opt A', row[2] || 'Opt B', row[3] || 'Opt C', row[4] || 'Opt D', row[5] || 'Opt E'],
            correctAnswer: isAppQuestion ? 0 : correctIdx,
            answerText: isAppQuestion ? (row[1] || '') : '',
            explanation: isAppQuestion ? '' : (row[7] || ''),
            courseId: activeCourse.id,
            order: currentOrder++,
            createdAt: new Date().toISOString()
          });
          
          importedCount++;
          batchCount++;

          // Firestore batches are limited to 500 operations
          if (batchCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }
        
        if (batchCount > 0) {
          await batch.commit();
        }

        alert(`${importedCount} questions successfully synchronized with archive.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `courses/${activeCourse.id}/content`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Helper inside or outside
  const parseCSV = (csvText: string) => {
    const result = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        if (inQuotes) {
            if (char === '"' && nextChar === '"') { cell += '"'; i++; } 
            else if (char === '"') { inQuotes = false; } 
            else { cell += char; }
        } else {
            if (char === '"') { inQuotes = true; } 
            else if (char === ',') { row.push(cell.trim()); cell = ''; } 
            else if (char === '\n' || char === '\r') {
                row.push(cell.trim());
                if (row.length > 1 || (row.length === 1 && row[0] !== '')) result.push(row);
                row = []; cell = '';
                if (char === '\r' && nextChar === '\n') i++;
            } else { cell += char; }
        }
    }
    if (cell !== '' || row.length > 0) { row.push(cell.trim()); result.push(row); }
    return result;
  };

  useEffect(() => {
    if (activeCourse) {
      const q = query(collection(db, 'courses', activeCourse.id, 'content'), orderBy('order', 'asc'));
      return onSnapshot(q, (snap) => {
        setQuestions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => handleFirestoreError(err, OperationType.LIST, `courses/${activeCourse.id}/content`));
    }
  }, [activeCourse]);

  const questionsByTrashState = questions.filter(q => showTrash ? q.isDeleted === true : !q.isDeleted);

  const filteredQuestionsList = questionsByTrashState.filter(q => {
    if (!questionSearch) return true;
    const term = questionSearch.toLowerCase();
    const matchesText = q.question?.toLowerCase().includes(term);
    const matchesExplanation = q.explanation?.toLowerCase().includes(term);
    const matchesOptions = q.options?.some((opt: string) => opt?.toLowerCase().includes(term));
    const matchesAnswer = q.answerText?.toLowerCase().includes(term);
    return matchesText || matchesExplanation || matchesOptions || matchesAnswer;
  });

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'courses'), {
        ...newCourse,
        title: newCourse.title.trim(),
        description: newCourse.description.trim(),
        price: 0,
        imageUrl: newCourse.imageUrl || '',
        thumbnail: newCourse.imageUrl || 'https://images.unsplash.com/photo-1532187875685-d6d1dd2e43f5?auto=format&fit=crop&q=80',
        createdAt: new Date().toISOString()
      });
      setShowAddCourse(false);
      const allDeptsList = (() => {
        const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
        const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
        return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
      })();
      setNewCourse({ title: '', department: allDeptsList[0], level: '100L', description: '', imageUrl: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'courses');
    }
  };

  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const courseRef = doc(db, 'courses', editCourseData.id);
      await updateDoc(courseRef, {
        title: editCourseData.title.trim(),
        department: editCourseData.department,
        level: editCourseData.level,
        description: editCourseData.description.trim(),
        imageUrl: editCourseData.imageUrl || ''
      });
      
      // Update activeCourse state with the edited values
      setActiveCourse({
        ...activeCourse,
        title: editCourseData.title.trim(),
        department: editCourseData.department,
        level: editCourseData.level,
        description: editCourseData.description.trim(),
        imageUrl: editCourseData.imageUrl || ''
      });
      
      setShowEditCourse(false);
      alert('Archive/Course details successfully synchronized.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `courses/${editCourseData.id}`);
    }
  };

  const handleSaveCourseContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse) return;
    try {
      setLoading(true);
      const courseRef = doc(db, 'courses', activeCourse.id);
      await updateDoc(courseRef, {
        objectives: courseContentInput.trim()
      });
      
      // Update local state with objectives so it syncs up live
      setActiveCourse({
        ...activeCourse,
        objectives: courseContentInput.trim()
      });
      
      setShowCourseContentModal(false);
      alert("Academic objectives / course content updated successfully!");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `courses/${activeCourse.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDeleteQuestions = () => {
    if (!activeCourse) return;
    if (questions.length === 0) {
      alert("There are no questions in this archive to delete.");
      return;
    }
    setBulkDeleteConfirmText('');
    setShowBulkDeleteModal(true);
  };

  const executeBulkDeleteQuestions = async () => {
    if (!activeCourse) return;
    const count = questions.length;
    if (count === 0) {
      setShowBulkDeleteModal(false);
      return;
    }
    if (bulkDeleteConfirmText !== 'DELETE ALL') {
      alert('Verification aborted. Input does not match "DELETE ALL".');
      return;
    }

    setLoading(true);
    try {
      const qIds = questions.map(q => q.id);
      await Promise.all(
        qIds.map(qId => deleteDoc(doc(db, 'courses', activeCourse.id, 'content', qId)))
      );
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirmText('');
      alert(`Purge completed: All ${count} questions have been deleted from "${activeCourse.title}".`);
    } catch (err) {
      console.error(err);
      alert('Failed to complete bulk question deletion. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse || !activeCourse.department) {
      console.log("No active course or missing department");
      setLoading(false);
      return;
    }
    const path = `courses/${activeCourse.id}/content`;
    try {
      if (editingQuestionId) {
        await updateDoc(doc(db, 'courses', activeCourse.id, 'content', editingQuestionId), {
          ...newQuestion,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'courses', activeCourse.id, 'content'), {
          ...newQuestion,
          courseId: activeCourse.id,
          order: questions.length + 1,
          createdAt: new Date().toISOString()
        });
      }
      setShowAddQuestion(false);
      setEditingQuestionId(null);
      setNewQuestion({
        type: 'objective',
        question: '',
        options: ['', '', '', '', ''],
        correctAnswer: 0,
        answerText: '',
        explanation: '',
        order: 0
      });
    } catch (err) {
      handleFirestoreError(err, editingQuestionId ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const startEditQuestion = (q: any) => {
    setNewQuestion({
      type: q.type || (activeCourse?.level === 'Application Questions' ? 'application' : 'objective'),
      question: q.question,
      options: q.options ? [...q.options] : ['', '', '', '', ''],
      correctAnswer: q.correctAnswer || 0,
      answerText: q.answerText || '',
      explanation: q.explanation || '',
      order: q.order || 0
    });
    setEditingQuestionId(q.id);
    setShowAddQuestion(true);
  };

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'course' | 'question', id: string } | null>(null);

  const restoreDefaultArchives = async () => {
    try {
      setLoading(true);
      let restoredCount = 0;
      let createdCount = 0;

      const existingCourseMap = new Map();
      courses.forEach(c => {
        const key = `${c.title.trim().toLowerCase()}|${c.department.trim().toLowerCase()}|${c.level.trim().toLowerCase()}`;
        existingCourseMap.set(key, c);
      });

      let batch = writeBatch(db);
      let batchOperations = 0;

      for (const [dept, deptData] of Object.entries(DEPARTMENT_STRUCTURE)) {
        if (!deptData.coursesByLevel) continue;
        
        for (const [catName, catData] of Object.entries(deptData.coursesByLevel)) {
          for (const [levelName, coursesList] of Object.entries(catData as any)) {
            const actualLevel = levelName === 'default' ? 'General' : levelName;
            
            for (const courseTitle of coursesList as string[]) {
              const key = `${courseTitle.trim().toLowerCase()}|${dept.trim().toLowerCase()}|${actualLevel.trim().toLowerCase()}`;
              
              if (existingCourseMap.has(key)) {
                const existingCourse = existingCourseMap.get(key);
                if (existingCourse.isDeleted) {
                  const ref = doc(db, 'courses', existingCourse.id);
                  batch.update(ref, { isDeleted: false, updatedAt: new Date().toISOString() });
                  batchOperations++;
                  restoredCount++;
                }
              } else {
                const ref = doc(collection(db, 'courses'));
                batch.set(ref, {
                  title: courseTitle.trim(),
                  department: dept,
                  level: actualLevel,
                  description: `Default academic curriculum archive for ${dept} (${actualLevel}) under category ${catName}.`,
                  price: 0,
                  thumbnail: 'https://images.unsplash.com/photo-1532187875685-d6d1dd2e43f5?auto=format&fit=crop&q=80',
                  createdAt: new Date().toISOString()
                });
                batchOperations++;
                createdCount++;
              }

              if (batchOperations >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                batchOperations = 0;
              }
            }
          }
        }
      }

      if (batchOperations > 0) {
        await batch.commit();
      }

      alert(`Restoration Complete! Created ${createdCount} new default archives and restored ${restoredCount} archived ones.`);
    } catch (err) {
      console.error(err);
      alert('Failed to complete default archives restoration. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const restoreAllQuestionsInTrash = async () => {
    if (!activeCourse) return;
    const trashedQuestions = questions.filter(q => q.isDeleted === true);
    if (trashedQuestions.length === 0) {
      alert("No trashed questions found to restore in this archive.");
      return;
    }
    setLoading(true);
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const q of trashedQuestions) {
        const ref = doc(db, 'courses', activeCourse.id, 'content', q.id);
        batch.update(ref, { isDeleted: false, updatedAt: new Date().toISOString() });
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      alert(`Successfully restored all ${trashedQuestions.length} questions to "${activeCourse.title}".`);
    } catch (err) {
      console.error(err);
      alert('Failed to restore questions from trash. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const restoreAllCoursesInTrash = async () => {
    const trashedCourses = courses.filter(c => c.isDeleted === true);
    if (trashedCourses.length === 0) {
      alert("No trashed archives found to restore.");
      return;
    }
    setLoading(true);
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const c of trashedCourses) {
        const ref = doc(db, 'courses', c.id);
        batch.update(ref, { isDeleted: false, updatedAt: new Date().toISOString() });
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      alert(`Successfully restored all ${trashedCourses.length} course archives.`);
    } catch (err) {
      console.error(err);
      alert('Failed to restore archives. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestion = async (qId: string) => {
    if (!activeCourse) return;
    const path = `courses/${activeCourse.id}/content/${qId}`;
    try {
      if (showTrash) {
        await deleteDoc(doc(db, 'courses', activeCourse.id, 'content', qId));
        alert('Question permanently deleted.');
      } else {
        await updateDoc(doc(db, 'courses', activeCourse.id, 'content', qId), { isDeleted: true });
        alert('Question sent to Trash.');
      }
      setDeleteConfirmation(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const deleteCourse = async (courseId: string) => {
    try {
      if (showTrash) {
        await deleteDoc(doc(db, 'courses', courseId));
        if (activeCourse?.id === courseId) {
          setActiveCourse(null);
        }
        alert('Course archive permanently deleted.');
      } else {
        await updateDoc(doc(db, 'courses', courseId), { isDeleted: true });
        if (activeCourse?.id === courseId) {
          setActiveCourse(null);
        }
        alert('Course archive sent to Trash.');
      }
      setDeleteConfirmation(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `courses/${courseId}`);
    }
  };

  return (
    <div className="space-y-8 font-sans">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#D8E3FF] pb-6">
          <div className="flex flex-wrap items-center gap-4 flex-1">
            <select 
              value={deptFilter || 'all'}
              onChange={(e) => {
                setDeptFilter(e.target.value === 'all' ? null : e.target.value);
                setCourseSearch('');
              }}
              className="bg-white border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-[#2563EB] outline-none hover:border-[#2563EB]/40 transition-all cursor-pointer shadow-sm"
            >
              <option value="all">{t('admin.allDepts')}</option>
              {(() => {
                const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
                const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
                return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name).filter(Boolean).map(n => n.trim())]));
              })().map((d, i) => (
                <option key={`${d}-${i}`} value={d}>{d}</option>
              ))}
            </select>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Search series/courses..."
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                className="bg-white border border-[#D8E3FF] rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-bold tracking-wider text-slate-900 placeholder-slate-400 outline-none focus:border-[#2563EB] transition-all w-56 font-sans shadow-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 self-end md:self-auto">
            <button 
              onClick={() => setShowAddCourse(true)}
              className="p-3 bg-[#EEF3FF] text-[#2563EB] border border-[#D8E3FF] rounded-xl hover:bg-[#EEF3FF]/80 active:scale-95 transition-all text-nowrap"
              title="Add New Course Archive"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
       </div>

       {/* Course Selection Row */}
       <div className="space-y-2">
         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Query Series Archives:</span>
         <div className="flex flex-wrap gap-3 overflow-x-auto no-scrollbar max-w-full py-1">
            {searchedCourses.map(c => (
              <div key={c.id} className="relative group">
                <button
                  onClick={() => setActiveCourse(c)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap shadow-sm",
                    activeCourse?.id === c.id 
                      ? "bg-[#2563EB] text-white border-[#2563EB] shadow-md shadow-[#2563EB]/20" 
                      : "bg-white text-slate-600 border-[#D8E3FF] hover:border-[#2563EB]/40 hover:text-slate-900"
                  )}
                >
                  {c.title} ({c.level})
                </button>
                {showTrash ? (
                  <>
                    <button 
                     onClick={async (e) => { 
                       e.stopPropagation(); 
                       try {
                         await updateDoc(doc(db, 'courses', c.id), { isDeleted: false });
                         alert(`Course "${c.title}" successfully restored.`);
                       } catch (err) {
                         handleFirestoreError(err, OperationType.UPDATE, `courses/${c.id}`);
                       }
                     }}
                     title="Restore Course Archive"
                     className="absolute -top-2 -left-2 bg-emerald-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110 active:scale-95 transition-transform"
                    >
                     <Check className="w-3 h-3" />
                    </button>
                    <button 
                     onClick={(e) => { 
                       e.stopPropagation(); 
                       setDeleteConfirmation({ type: 'course', id: c.id });
                     }}
                     title="Permanently Delete Course Archive"
                     className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110 active:scale-95 transition-transform"
                    >
                     <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <button 
                   onClick={(e) => { 
                     e.stopPropagation(); 
                     setDeleteConfirmation({ type: 'course', id: c.id });
                   }}
                   title="Move Course Archive to Trash"
                   className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110 active:scale-95 transition-transform"
                  >
                   <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {searchedCourses.length === 0 && (
              <span className="text-[10px] text-slate-400 italic py-2">No matching archives discovered...</span>
            )}
         </div>
       </div>

       {activeCourse ? (
         <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden p-8 md:p-10 shadow-sm relative">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none text-slate-900"><FileText className="w-40 h-40" /></div>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 relative z-10">
              <div className="flex items-center gap-5">
                <div className="relative group/cpic w-20 h-20 rounded-2xl overflow-hidden bg-[#EEF3FF] border-2 border-[#D8E3FF] shrink-0 shadow-sm flex items-center justify-center">
                  {activeCourse.imageUrl || activeCourse.thumbnail ? (
                    <img 
                      src={activeCourse.imageUrl || activeCourse.thumbnail} 
                      alt={activeCourse.title} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer" 
                    />
                  ) : (
                    <BookOpen className="w-8 h-8 text-[#2563EB]" />
                  )}
                  <label className="absolute inset-0 bg-[#0B1E3D]/60 opacity-0 group-hover/cpic:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-white">
                    <Camera className="w-5 h-5 mb-0.5" />
                    <span className="text-[8px] font-black uppercase tracking-wider">Change</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={async (e) => {
                        if (e.target.files?.[0]) {
                          try {
                            const compressed = await compressImage(e.target.files[0], 480, 480, 0.78);
                            await updateDoc(doc(db, 'courses', activeCourse.id), {
                              imageUrl: compressed,
                              thumbnail: compressed
                            });
                            setActiveCourse({ ...activeCourse, imageUrl: compressed, thumbnail: compressed });
                            alert('Course picture updated successfully!');
                          } catch (err) {
                            console.error(err);
                            alert('Failed to upload course picture.');
                          }
                        }
                      }} 
                    />
                  </label>
                </div>
                <div>
                  <h3 className="font-serif font-black text-2xl text-slate-900 tracking-tight">{activeCourse.title}</h3>
                  <div className="flex flex-wrap items-center gap-2.5 mt-2">
                    <span className="text-[9px] font-black bg-[#EEF3FF] text-[#2563EB] px-3 py-1 rounded-full uppercase tracking-widest border border-[#D8E3FF]">
                      {activeCourse.department}
                    </span>
                    <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-3 py-1 rounded-full uppercase tracking-widest border border-slate-200">
                      {activeCourse.level}
                    </span>
                    <button
                      onClick={() => {
                        setEditCourseData({
                          id: activeCourse.id,
                          title: activeCourse.title || '',
                          department: activeCourse.department || '',
                          level: activeCourse.level || '',
                          description: activeCourse.description || '',
                          imageUrl: activeCourse.imageUrl || activeCourse.thumbnail || ''
                        });
                        setShowEditCourse(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF3FF] text-[#2563EB] hover:bg-[#EEF3FF]/80 text-[9px] font-black uppercase tracking-widest border border-[#D8E3FF] transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit Details
                    </button>
                    {showTrash && questions.filter(q => q.isDeleted === true).length > 0 ? (
                      <button
                        onClick={restoreAllQuestionsInTrash}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-[9px] font-black uppercase tracking-widest border border-emerald-200 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore All ({questions.filter(q => q.isDeleted === true).length})
                      </button>
                    ) : (
                      !showTrash && questions.length > 0 && (
                        <button
                          onClick={handleBulkDeleteQuestions}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 text-[9px] font-black uppercase tracking-widest border border-rose-200 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Bulk Delete ({questions.length})
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={downloadTemplate}
                  className="bg-[#EEF3FF] border border-[#D8E3FF] text-[#2563EB] px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#EEF3FF]/80 transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('admin.downloadTemplate')}
                </button>
                <input 
                  type="file" 
                  id="csv-import" 
                  accept=".csv" 
                  onChange={handleImportCSV} 
                  className="hidden" 
                />
                <button 
                  onClick={() => document.getElementById('csv-import')?.click()}
                  disabled={loading}
                  className={cn(
                    "bg-[#EEF3FF] border border-[#D8E3FF] text-[#2563EB] px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2",
                    loading ? "opacity-50 cursor-not-allowed" : "hover:bg-[#EEF3FF]/80"
                  )}
                >
                  <Plus className="w-4 h-4" />
                  {loading ? 'Processing Archives...' : t('admin.importArchive')}
                </button>
                <button 
                  onClick={() => {
                    setCourseContentInput(activeCourse?.objectives || '');
                    setShowCourseContentModal(true);
                  }}
                  disabled={loading}
                  className="bg-[#EEF3FF] border border-[#D8E3FF] text-[#2563EB] px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#EEF3FF]/80 transition-all flex items-center gap-2"
                  title="Configure Course Content Objectives"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Course Content</span>
                </button>
                <button 
                  onClick={exportQuestionsCSV}
                  className="bg-slate-100 border border-slate-200 text-slate-600 px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 hover:text-slate-900 transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('admin.exportArchive')}
                </button>
                <button 
                  onClick={() => {
                    setEditingQuestionId(null);
                    setNewQuestion({
                      type: activeCourse?.level === 'Application Questions' ? 'application' : 'objective',
                      question: '',
                      options: ['', '', '', '', ''],
                      correctAnswer: 0,
                      answerText: '',
                      explanation: '',
                      order: 0
                    });
                    setShowAddQuestion(true);
                  }}
                  className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-8 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all text-nowrap"
                >
                  <Plus className="w-5 h-5 font-black" />
                  {t('admin.addNewQuestion')}
                </button>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              {questions.length > 0 && (
                <div className="relative max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search queries, options, expected answer, or explanation..."
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    className="bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-bold tracking-wider text-slate-900 placeholder-slate-400 outline-none focus:border-[#2563EB] transition-all w-full font-sans"
                  />
                </div>
              )}

              {questions.length === 0 ? (
                <div className="text-center py-32 bg-[#EEF3FF]/30 border-[2px] border-dashed border-[#D8E3FF] rounded-3xl flex flex-col items-center justify-center group hover:border-[#2563EB]/40 transition-all">
                   <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 border border-[#D8E3FF] shadow-sm transition-transform group-hover:scale-110">
                      <FileText className="w-7 h-7 text-slate-400" />
                   </div>
                   <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">No queries found in this archive</h4>
                   <p className="text-[10px] text-slate-400 mt-2 font-mono">Initialize secure data entry via 'New Query'</p>
                </div>
              ) : filteredQuestionsList.length === 0 ? (
                <div className="text-center py-20 bg-[#EEF3FF]/30 border-[2px] border-dashed border-[#D8E3FF] rounded-3xl flex flex-col items-center justify-center">
                   <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">No matching results</h4>
                   <p className="text-[10px] text-slate-400 mt-2 font-mono">Refine your search term to fetch record clearance</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredQuestionsList.map((q, idx) => (
                    <div key={q.id} className="bg-[#EEF3FF]/40 border border-[#D8E3FF] p-6 rounded-2xl flex items-start justify-between group hover:border-[#2563EB]/40 transition-all">
                      <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 rounded-lg bg-[#EEF3FF] border border-[#D8E3FF] flex items-center justify-center text-[#2563EB] font-mono text-[10px] font-black">
                            {idx + 1}
                          </span>
                          <h4 className="text-[15px] font-medium text-slate-900 leading-relaxed">{q.question}</h4>
                        </div>
                        {q.type === 'application' ? (
                          <div className="ml-12 p-4 bg-white rounded-xl border border-[#D8E3FF] text-[12px] text-emerald-700">
                            <span className="font-black uppercase tracking-widest text-[9px] block mb-1 text-[#2563EB]">Expected Answer</span>
                            {q.answerText || q.explanation}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 ml-12">
                            {(q.options || []).map((opt: string, oi: number) => (
                              <div 
                                key={oi} 
                                className={cn(
                                  "p-3 rounded-xl border text-[12px] transition-all",
                                  oi === q.correctAnswer 
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold" 
                                    : "bg-white border-[#D8E3FF] text-slate-600"
                                )}
                              >
                                <span className="font-mono text-[10px] mr-2 opacity-50">{['A', 'B', 'C', 'D', 'E'][oi]}.</span>
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.explanation && (
                          <div className="ml-12 p-4 bg-white rounded-xl border border-[#D8E3FF] text-[11px] text-slate-500 italic">
                            <span className="font-black uppercase tracking-widest text-[9px] block mb-1 text-[#2563EB]">{t('admin.explanation')}</span>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {showTrash ? (
                          <>
                            <button 
                              onClick={async () => {
                                try {
                                  await updateDoc(doc(db, 'courses', activeCourse.id, 'content', q.id), { isDeleted: false });
                                  alert('Question successfully restored.');
                                } catch (err) {
                                  handleFirestoreError(err, OperationType.UPDATE, `courses/${activeCourse.id}/content/${q.id}`);
                                }
                              }}
                              title="Restore Question"
                              className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => setDeleteConfirmation({ type: 'question', id: q.id })}
                              title="Permanently Delete Question"
                              className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => startEditQuestion(q)}
                              className="p-2 text-slate-400 hover:text-[#2563EB] transition-colors"
                            >
                              <Edit3 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => setDeleteConfirmation({ type: 'question', id: q.id })}
                              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
         </div>
       ) : (
         <div className="text-center py-32 bg-white border border-[#D8E3FF] rounded-3xl">
           <Layers className="w-16 h-16 text-slate-300 mx-auto mb-6" />
           <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Select an archive to begin processing</h4>
           <button 
            onClick={() => setShowAddCourse(true)}
            className="mt-6 text-[#2563EB] text-[10px] font-black uppercase tracking-widest hover:underline"
           >
             Create New Archive
           </button>
         </div>
       )}

       {/* Confirmation Modal */}
       <AnimatePresence>
         {deleteConfirmation && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setDeleteConfirmation(null)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="relative w-full max-w-sm bg-white border border-red-200 rounded-3xl p-8 shadow-2xl text-center"
             >
               <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                 <AlertCircle className="w-8 h-8 text-red-500" />
               </div>
               <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
                  {showTrash ? "Confirm Destruction" : "Move to Trash Bin"}
                </h3>
               <p className="text-sm text-slate-500 mb-8">
                 {deleteConfirmation.type === 'course' 
                   ? (showTrash 
                        ? 'This will permanently erase the entire archive and all its associated queries from the database. This cannot be undone.'
                        : 'This will move this archive to the Trash Bin, where you can restore it or permanently delete it later.')
                   : (showTrash 
                        ? 'Are you sure you want to permanently erase this specific query? This action cannot be undone.'
                        : 'This will move this query to the Trash Bin, where you can restore it or permanently delete it later.')}
               </p>
               <div className="flex gap-4">
                 <button 
                   onClick={() => setDeleteConfirmation(null)}
                   className="flex-1 px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={async () => {
                    const id = deleteConfirmation.id;
                    const type = deleteConfirmation.type;
                    setDeleteConfirmation(null);
                    if (type === 'course' && requestClearance) {
                      if (type === 'course') {
                        await requestClearance(id, 'delete', async () => {
                          await deleteDoc(doc(db, 'courses', id));
                          if (activeCourse?.id === id) {
                            setActiveCourse(null);
                          }
                          alert('SECURITY CLEARANCE GRANTED: Course successfully deleted.');
                        });
                      } else {
                        await requestClearance(id, 'delete', async () => {
                          if (activeCourse) {
                            await deleteDoc(doc(db, 'courses', activeCourse.id, 'content', id));
                            alert('SECURITY CLEARANCE GRANTED: Question successfully deleted.');
                          }
                        });
                      }
                    } else {
                      if (type === 'course') deleteCourse(id);
                      else deleteQuestion(id);
                    }
                   }}
                   className="flex-1 px-6 py-3 rounded-xl bg-red-500 text-white font-bold uppercase tracking-widest text-[10px] hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                 >
                   Delete
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
       <AnimatePresence>
         {showAddCourse && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6 overflow-y-auto">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setShowAddCourse(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-lg bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
             >
               <div className="flex items-center justify-between mb-6">
                 <h3 className="font-serif font-black text-2xl text-slate-900">Archive Provisioning</h3>
                 <button onClick={() => setShowAddCourse(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               <form onSubmit={handleAddCourse} className="space-y-4">
                 <ImageUploader
                   value={newCourse.imageUrl || ''}
                   onChange={(url) => setNewCourse({ ...newCourse, imageUrl: url })}
                   label="Course Picture (Shown on left of course cards)"
                   placeholderText="Upload course picture or cover (JPG, PNG, WebP)"
                 />

                 <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Archive Title</label>
                   <input 
                    required
                    value={newCourse.title}
                    onChange={e => setNewCourse({ ...newCourse, title: e.target.value })}
                    placeholder="e.g., General Anatomy"
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Department</label>
                      <select 
                        value={newCourse.department}
                        onChange={e => {
                          const newDept = e.target.value;
                          const levelsArr = getDeptLevels(newDept);
                          setNewCourse({ ...newCourse, department: newDept, level: levelsArr[0] });
                        }}
                        className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-[12px] text-slate-900 focus:border-[#2563EB] outline-none"
                      >
                        {(() => {
                          const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
                          const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
                          return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
                        })().map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Level</label>
                      <select 
                        value={newCourse.level}
                        onChange={e => setNewCourse({ ...newCourse, level: e.target.value })}
                        className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                      >
                        {getDeptLevels(newCourse.department).map((l: string) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                 </div>
                 <button type="submit" className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-4 rounded-xl font-black text-[12px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 cursor-pointer">
                   Execute Provisioning
                 </button>
               </form>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Edit Course Modal */}
       <AnimatePresence>
         {showEditCourse && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6 overflow-y-auto">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setShowEditCourse(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-lg bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
             >
               <div className="flex items-center justify-between mb-6">
                 <h3 className="font-serif font-black text-2xl text-slate-900">Edit Archive Details</h3>
                 <button onClick={() => setShowEditCourse(false)} className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               <form onSubmit={handleUpdateCourse} className="space-y-4">
                 <ImageUploader
                   value={editCourseData.imageUrl || ''}
                   onChange={(url) => setEditCourseData({ ...editCourseData, imageUrl: url })}
                   label="Course Picture (Shown on left of course cards)"
                   placeholderText="Upload course picture or cover (JPG, PNG, WebP)"
                 />

                 <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Archive Title</label>
                   <input 
                    required
                    value={editCourseData.title}
                    onChange={e => setEditCourseData({ ...editCourseData, title: e.target.value })}
                    placeholder="e.g., General Anatomy"
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Department</label>
                      <select 
                        value={editCourseData.department}
                        onChange={e => {
                          const newDept = e.target.value;
                          const levelsArr = getDeptLevels(newDept);
                          setEditCourseData({ ...editCourseData, department: newDept, level: levelsArr[0] });
                        }}
                        className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-[12px] text-slate-900 focus:border-[#2563EB] outline-none"
                      >
                        {(() => {
                          const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
                          const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
                          return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
                        })().map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Level</label>
                      <select 
                        value={editCourseData.level}
                        onChange={e => setEditCourseData({ ...editCourseData, level: e.target.value })}
                        className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                      >
                        {getDeptLevels(editCourseData.department).map((l: string) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                 </div>
                 <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Description (Optional)</label>
                   <textarea 
                    value={editCourseData.description}
                    onChange={e => setEditCourseData({ ...editCourseData, description: e.target.value })}
                    placeholder="Description of the course archive..."
                    rows={3}
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none resize-none font-sans"
                   />
                 </div>
                 <button type="submit" className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-4 rounded-xl font-black text-[12px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 transition-all active:scale-95 cursor-pointer">
                   Save Changes
                 </button>
               </form>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Course Content Modal */}
       <AnimatePresence>
         {showCourseContentModal && (
           <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setShowCourseContentModal(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-lg bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-2xl z-[120]"
             >
               <div className="flex items-center justify-between mb-6">
                 <div>
                   <h3 className="font-serif font-black text-2xl text-slate-900">Course Content Objectives</h3>
                   <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase tracking-widest">
                     For course: {activeCourse?.title}
                   </p>
                 </div>
                 <button onClick={() => setShowCourseContentModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <form onSubmit={handleSaveCourseContent} className="space-y-6">
                 <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">
                     Objectives (Enter each objective on a new line)
                   </label>
                   <textarea 
                     value={courseContentInput}
                     onChange={e => setCourseContentInput(e.target.value)}
                     placeholder="e.g.&#10;Synthesize complex biological systems&#10;Analyze pathological cells under virtual microscope&#10;Establish logic verification queries"
                     rows={8}
                     className="w-full bg-[#EEF3FF] border border-[#D8E3FF] focus:border-[#2563EB] rounded-xl p-4 text-xs font-semibold text-slate-900 outline-none resize-none font-sans leading-relaxed"
                   />
                   <p className="text-[10px] text-slate-400 italic mt-2 font-mono">
                     Each separate line will display as a distinct polished academic objective block in the public detail page.
                   </p>
                 </div>
                 
                 <div className="flex gap-4">
                   <button 
                     type="button"
                     onClick={() => setShowCourseContentModal(false)}
                     className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                   >
                     Cancel
                   </button>
                   <button 
                     type="submit" 
                     className="flex-1 bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 transition-all"
                   >
                     Save Content
                   </button>
                 </div>
               </form>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Bulk Delete Questions Modal */}
       <AnimatePresence>
         {showBulkDeleteModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setShowBulkDeleteModal(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-md bg-white border border-red-200 rounded-3xl p-8 shadow-2xl"
             >
               <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-2 text-rose-600">
                   <AlertCircle className="w-5 h-5 animate-pulse" />
                   <h3 className="font-serif font-black text-xl text-slate-900">Bulk Purge Questions</h3>
                 </div>
                 <button onClick={() => setShowBulkDeleteModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="space-y-4">
                 <p className="text-sm text-slate-600">
                   WARNING: You are about to permanently delete <span className="font-bold text-rose-600">{questions.length} questions</span> from <span className="font-bold text-slate-900">"{activeCourse?.title}"</span> once and for all.
                 </p>
                 <p className="text-xs text-slate-400">
                   This action is highly destructive and cannot be undone. All structure, options, correct answers, and logical explanation data for these questions will be discarded.
                 </p>
                 
                 <div className="pt-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">
                     To proceed, type <span className="text-rose-600 font-bold select-all">DELETE ALL</span> below:
                   </label>
                   <input 
                     required
                     type="text"
                     placeholder="Type DELETE ALL to confirm"
                     value={bulkDeleteConfirmText}
                     onChange={e => setBulkDeleteConfirmText(e.target.value)}
                     className="w-full bg-[#EEF3FF] border border-red-200 rounded-xl p-4 text-center text-sm font-bold text-slate-900 focus:border-red-500 outline-none uppercase tracking-widest"
                   />
                 </div>

                 <div className="flex gap-4 pt-4">
                   <button 
                     onClick={() => setShowBulkDeleteModal(false)}
                     className="flex-1 px-6 py-4 rounded-xl bg-slate-100 text-slate-600 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors"
                   >
                     Cancel
                   </button>
                   <button 
                     onClick={executeBulkDeleteQuestions}
                     disabled={bulkDeleteConfirmText !== 'DELETE ALL' || loading}
                     className="flex-1 bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-200 hover:bg-rose-500 transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                     {loading ? 'Purging...' : 'Purge All'}
                   </button>
                 </div>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Add Question Modal */}
       <AnimatePresence>
         {showAddQuestion && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
               onClick={() => setShowAddQuestion(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-2xl bg-white border border-[#D8E3FF] rounded-3xl p-10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
             >
               <h3 className="font-serif font-black text-2xl text-slate-900 mb-2">
                  {editingQuestionId ? 'Revise Archive Query' : 'Query Entry Terminal'}
                </h3>
               <p className="text-[10px] text-slate-400 font-mono italic mb-8 uppercase tracking-[0.3em]">Institutional examination logic synchronization</p>
               
               <form onSubmit={handleAddQuestion} className="space-y-8">
                 <div className="flex justify-end">
                   <button
                     type="button"
                     onClick={async () => {
                       if (!newQuestion.question) return alert('Enter a question first');
                       try {
                         setLoading(true);
                         const [qTrans, optTrans, expTrans] = await Promise.all([
                           axios.post('/api/translate', { text: newQuestion.question, targetLang: 'French' }),
                           axios.post('/api/translate', { text: newQuestion.options, targetLang: 'French' }),
                           newQuestion.explanation ? axios.post('/api/translate', { text: newQuestion.explanation, targetLang: 'French' }) : Promise.resolve({ data: { translated: '' } })
                         ]);
                         
                         setNewQuestion(prev => ({
                           ...prev,
                            question: qTrans.data.translated,
                            options: qTrans.data.translated ? optTrans.data.translated : prev.options,
                            explanation: qTrans.data.translated ? expTrans.data.translated : prev.explanation
                         }));
                       } catch (err) {
                         alert('Translation failed');
                       } finally {
                         setLoading(false);
                       }
                     }}
                     className="text-[9px] font-black text-[#2563EB] uppercase tracking-widest bg-[#EEF3FF] px-4 py-2 rounded-lg border border-[#D8E3FF] hover:bg-[#EEF3FF]/80 transition-all"
                   >
                     Auto-Translate to French
                   </button>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Question Type</label>
                     <select 
                       value={newQuestion.type || 'objective'}
                       onChange={e => setNewQuestion({ ...newQuestion, type: e.target.value as 'objective' | 'application' })}
                       className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-[13px] text-slate-900 focus:border-[#2563EB] outline-none"
                     >
                       <option value="objective">Objective (Multiple Choice)</option>
                       <option value="application">Application Question</option>
                     </select>
                   </div>
                   <div />
                 </div>
                 
                 <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Examination Query</label>
                   <textarea 
                    required
                    value={newQuestion.question}
                    onChange={e => setNewQuestion({ ...newQuestion, question: e.target.value })}
                    placeholder="Enter the examination question..."
                    className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl p-6 text-[15px] text-slate-900 focus:border-[#2563EB] outline-none min-h-[120px] resize-none"
                   />
                 </div>

                 {newQuestion.type === 'application' ? (
                   <div>
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Expected Answer</label>
                     <textarea 
                      required
                      value={newQuestion.answerText}
                      onChange={e => setNewQuestion({ ...newQuestion, answerText: e.target.value })}
                      placeholder="Enter the expected answer logic here..."
                      className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl p-4 text-sm text-emerald-700 focus:border-emerald-500 outline-none min-h-[100px] resize-none"
                     />
                   </div>
                 ) : (
                   <div className="grid gap-4">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Response Options</label>
                     {newQuestion.options.map((opt, i) => (
                        <div key={i} className="flex gap-4">
                          <div 
                            className={cn(
                              "w-12 h-14 rounded-xl flex items-center justify-center font-mono font-black border transition-all cursor-pointer",
                              newQuestion.correctAnswer === i ? "bg-emerald-500 text-white border-emerald-500" : "bg-[#EEF3FF] border-[#D8E3FF] text-slate-500"
                            )}
                            onClick={() => setNewQuestion({ ...newQuestion, correctAnswer: i })}
                          >
                            {['A', 'B', 'C', 'D', 'E'][i]}
                          </div>
                          <input 
                            required={newQuestion.type !== 'application'}
                            value={opt}
                            onChange={e => {
                              const opts = [...newQuestion.options];
                              opts[i] = e.target.value;
                              setNewQuestion({ ...newQuestion, options: opts });
                            }}
                            placeholder={`Option ${['A', 'B', 'C', 'D', 'E'][i]}...`}
                            className="flex-1 bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl p-4 text-sm text-slate-900 focus:border-[#2563EB] outline-none"
                          />
                       </div>
                     ))}
                   </div>
                 )}

                 {newQuestion.type !== 'application' && (
                   <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Rational Explanation</label>
                      <textarea 
                        value={newQuestion.explanation}
                        onChange={e => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
                        placeholder="Enter the logical reason for the correct response..."
                        className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl p-4 text-sm text-slate-700 focus:border-[#2563EB] outline-none min-h-[80px] resize-none"
                      />
                   </div>
                 )}

                 <div className="flex gap-4 pt-4">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowAddQuestion(false);
                        setEditingQuestionId(null);
                        setNewQuestion({
                          type: 'objective',
                          question: '',
                          options: ['', '', '', '', ''],
                          correctAnswer: 0,
                          answerText: '',
                          explanation: '',
                          order: 0
                        });
                      }}
                      className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-slate-200"
                    >
                      Abort
                    </button>
                    <button 
                      type="submit" 
                      className="flex-[2] bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-4 rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 transition-all"
                    >
                      {editingQuestionId ? 'Log Revisions' : 'Sync to Archives'}
                    </button>
                 </div>
               </form>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
    </div>
  );
}

function NotificationsManager() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return onSnapshot(query(collection(db, 'notifications'), orderBy('createdAt', 'desc')), (snap) => {
      setNotifs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));
  }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title,
        message,
        read: false,
        createdAt: new Date().toISOString()
      });
      setTitle('');
      setMessage('');
      alert('Institutional broadcast successfully transmitted to archives.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notifications');
    } finally {
      setSending(false);
    }
  };

  const deleteNotification = async (id: string) => {
    if (!window.confirm('Revoke this institutional notice?')) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
      <div className="bg-white border border-[#D8E3FF] rounded-2xl p-10 shadow-sm h-fit">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 bg-[#EEF3FF] rounded-xl flex items-center justify-center border border-[#D8E3FF]"><Bell className="w-6 h-6 text-[#2563EB]" /></div>
           <h3 className="font-serif font-black text-xl text-slate-900 tracking-tight">Initiate Transmission</h3>
        </div>
        <form className="space-y-6" onSubmit={handleBroadcast}>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Protocol Header (Title)</label>
            <input 
              className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-5 py-4 text-[14px] outline-none focus:border-[#2563EB] transition-all text-slate-900 placeholder-slate-400 font-medium" 
              placeholder="Announcement identifier..." 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Transmission Payload (Body)</label>
            <textarea 
              className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-5 py-4 text-[14px] outline-none h-40 focus:border-[#2563EB] transition-all text-slate-900 placeholder-slate-400 font-medium resize-none leading-relaxed" 
              placeholder="Enter detailed institutional metadata..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            ></textarea>
          </div>
          
          <button 
            type="submit"
            disabled={sending}
            className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-5 rounded-xl font-black text-[12px] uppercase tracking-[0.3em] shadow-lg shadow-[#2563EB]/20 transition-all disabled:opacity-50"
          >
            {sending ? 'Transmitting...' : 'Broadcast Secure Protocol'}
          </button>
        </form>
      </div>

      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-[#D8E3FF] font-serif font-black text-lg text-slate-900">Transmission History Log</div>
        <div className="divide-y divide-[#D8E3FF] max-h-[600px] overflow-y-auto no-scrollbar">
           {notifs.length === 0 ? (
             <div className="p-32 text-center text-slate-400 italic font-medium">Clear communication log</div>
           ) : (
             notifs.map(n => (
               <div key={n.id} className="p-8 hover:bg-[#EEF3FF]/40 transition-all group border-l-2 border-transparent hover:border-[#2563EB]">
                 <div className="flex justify-between items-start mb-3">
                   <h4 className="font-black text-[15px] text-slate-900 group-hover:text-[#2563EB] transition-colors tracking-tight">{n.title}</h4>
                   <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest bg-[#EEF3FF] px-2 py-0.5 rounded border border-[#D8E3FF] shadow-sm">{format(new Date(n.createdAt), 'MMM dd, yyyy')}</span>
                 </div>
                 <p className="text-[13px] text-slate-600 line-clamp-3 leading-relaxed font-medium italic opacity-80">"{n.message}"</p>
                 <div className="mt-4 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">SENT BY: SUPER ADMIN</span>
                    <button 
                      onClick={() => deleteNotification(n.id)}
                      className="text-[9px] font-black text-red-500/70 uppercase tracking-widest hover:text-red-600 transition-colors"
                    >
                      Revoke Log
                    </button>
                 </div>
               </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}

function QuotesManager() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [authorCredit, setAuthorCredit] = useState('');

  useEffect(() => {
    return onSnapshot(query(collection(db, 'quotes'), orderBy('createdAt', 'desc')), (snap) => {
      setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'quotes'));
  }, []);

  const handlePost = async () => {
    if (!text) return;
    try {
      await addDoc(collection(db, 'quotes'), {
        text,
        author: authorCredit || 'Diamond Intelligence',
        createdAt: new Date().toISOString()
      });
      setText('');
      setAuthorCredit('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quotes');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
      <div className="bg-white border border-[#D8E3FF] rounded-2xl p-10 shadow-sm h-fit">
        <h3 className="font-serif font-black text-xl text-slate-900 mb-8 tracking-tight">Log Mental Framework</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Epistemological Text</label>
            <textarea 
              className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-5 py-4 text-[14px] outline-none h-48 focus:border-[#2563EB] transition-all text-slate-900 font-medium resize-none leading-relaxed italic placeholder-slate-400" 
              placeholder="Manifest scholarly wisdom into reality..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            ></textarea>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Intellectual Origin (Author)</label>
            <input 
              className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-5 py-4 text-[14px] outline-none focus:border-[#2563EB] transition-all text-slate-900 font-medium placeholder-slate-400" 
              placeholder="e.g. Aristotle, Nelson Mandela..."
              value={authorCredit}
              onChange={(e) => setAuthorCredit(e.target.value)}
            />
          </div>
          <button 
            onClick={handlePost}
            className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-5 rounded-xl font-black text-[12px] uppercase tracking-[0.3em] shadow-lg shadow-[#2563EB]/20 transition-all"
          >
            Authenticate & Publish
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {quotes.length === 0 ? (
          <div className="text-center py-40 text-slate-400 italic border border-dashed border-[#D8E3FF] rounded-3xl bg-white">Platform awaits initial wisdom</div>
        ) : (
          quotes.map((q, i) => (
            <div key={i} className="bg-white border border-[#D8E3FF] rounded-2xl p-8 relative group hover:border-[#2563EB]/40 transition-all shadow-sm">
              <Quote className="absolute bottom-6 right-6 w-16 h-16 text-[#2563EB]/5 group-hover:text-[#2563EB]/10 transition-all pointer-events-none" />
              <p className="text-[16px] italic leading-relaxed text-slate-800 font-serif mb-6 relative z-10 transition-colors group-hover:text-slate-900">"{q.text}"</p>
              <div className="flex justify-between items-center relative z-10">
                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2563EB]">— {q.author}</span>
                <div className="flex items-center gap-4">
                   <span className="text-[9px] text-slate-400 font-mono italic opacity-0 group-hover:opacity-100 transition-all">{format(new Date(q.createdAt), 'yyyy.MM.dd')}</span>
                   <button onClick={() => deleteDoc(doc(db, 'quotes', q.id))} className="text-red-500/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-red-50 rounded-lg active:scale-90">
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SupportManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
       setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubChats = onSnapshot(collection(db, 'chats'), (snap) => {
      setChats(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

    return () => {
      unsubUsers();
      unsubChats();
    };
  }, []);

  const threads = chats.map(chat => {
    const user = users.find(u => u.id === chat.id);
    return {
      ...(user || { displayName: chat.userName || `Scholar [${chat.id.substring(0, 5)}]`, department: 'Unknown Origin' }),
      id: chat.id,
      adminUnreadCount: chat.adminUnreadCount || 0
    };
  }).sort((a, b) => (b.adminUnreadCount || 0) - (a.adminUnreadCount || 0));

  useEffect(() => {
    if (selectedUser) {
      // Clear unread count when admin views
      setDoc(doc(db, 'chats', selectedUser.id), { adminUnreadCount: 0 }, { merge: true })
        .catch(err => console.error("Error resetting admin unread count:", err));

      const q = query(collection(db, 'chats', selectedUser.id, 'messages'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => handleFirestoreError(err, OperationType.LIST, `chats/${selectedUser.id}/messages`));
    } else {
      setMessages([]);
    }
  }, [selectedUser]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedUser) return;

    try {
      await addDoc(collection(db, 'chats', selectedUser.id, 'messages'), {
        senderId: 'admin',
        text: replyText,
        createdAt: new Date().toISOString()
      });

      // Notify user by incrementing unreadCount
      await setDoc(doc(db, 'chats', selectedUser.id), {
        unreadCount: increment(1),
        lastMessageAt: new Date().toISOString()
      }, { merge: true });

      setReplyText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `chats/${selectedUser.id}/messages`);
    }
  };

  return (
    <div className={cn("grid gap-6 h-[calc(100vh-180px)]", selectedUser ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3")}>
      {!selectedUser && (
        <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-6 border-b border-[#D8E3FF] flex items-center justify-between">
             <h3 className="font-serif font-black text-lg text-slate-900 uppercase tracking-tight">Active Threads</h3>
             <MessageCircle className="w-5 h-5 text-[#2563EB]/40" />
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {threads.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-serif italic text-xs">
                No active support archives found...
              </div>
            ) : (
              threads.map((u: any) => (
                <button 
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={cn(
                    "w-full p-6 text-left border-b border-[#D8E3FF] transition-all hover:bg-[#EEF3FF]/40 flex items-center gap-4 group",
                    selectedUser?.id === u.id ? "bg-[#EEF3FF] border-l-4 border-l-[#2563EB]" : ""
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EEF3FF] flex items-center justify-center font-serif font-black text-[#2563EB] border border-[#D8E3FF] group-hover:scale-110 transition-transform">
                    {u.displayName?.charAt(0) || 'U'}
                  </div>
                  <div className="overflow-hidden flex-1">
                    <div className="font-bold text-[14px] truncate text-slate-900">{u.displayName || 'Anonymous Scholar'}</div>
                    <div className="text-[10px] text-slate-500 font-mono italic truncate">{u.department || 'General Faculty'}</div>
                  </div>
                  {u.adminUnreadCount > 0 && (
                    <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-md shadow-red-500/20">
                      {u.adminUnreadCount}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className={cn("bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden flex flex-col shadow-sm relative", !selectedUser ? "lg:col-span-2 hidden lg:flex" : "")}>
        {selectedUser ? (
          <>
            <div className="p-6 border-b border-[#D8E3FF] flex items-center justify-between bg-[#EEF3FF]/30">
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-xl bg-[#EEF3FF] flex items-center justify-center text-[#2563EB] border border-[#D8E3FF] font-serif font-black">{selectedUser.displayName?.charAt(0)}</div>
                 <div>
                    <h4 className="font-serif font-black text-slate-900 text-lg">{selectedUser.displayName}</h4>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Active Archives</span>
                    </div>
                 </div>
               </div>
               <button
                 onClick={() => setSelectedUser(null)}
                 className="text-[10px] text-[#2563EB] font-bold uppercase tracking-widest hover:text-[#1d4ed8] transition-all flex items-center gap-2 bg-[#EEF3FF] px-4 py-2 rounded-lg border border-[#D8E3FF]"
               >
                 <ArrowLeft className="w-4 h-4" />
                 Back to Threads
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 flex flex-col scrollbar-none">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-20 space-y-4 text-slate-400">
                   <MessageCircle className="w-16 h-16" />
                   <p className="text-xs font-black uppercase tracking-widest">Secure session initialized</p>
                </div>
              ) : (
                messages.map((m, i) => {
                  const isAdmin = m.senderId === 'admin';
                  return (
                    <div key={i} className={cn("flex", isAdmin ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[70%] p-5 rounded-2xl text-[13.5px] leading-relaxed shadow-sm",
                        isAdmin 
                          ? "bg-[#2563EB] text-white rounded-tr-none font-medium" 
                          : "bg-[#EEF3FF] border border-[#D8E3FF] text-slate-900 rounded-tl-none font-medium"
                      )}>
                        {m.text}
                        <div className={cn(
                          "text-[8px] font-black uppercase tracking-widest mt-2 opacity-60",
                          isAdmin ? "text-white/80" : "text-[#2563EB]"
                        )}>
                          {m.createdAt ? format(new Date(m.createdAt), 'hh:mm a') : 'Archive Record'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleReply} className="p-6 border-t border-[#D8E3FF] flex items-center gap-4">
              <input 
                type="text"
                placeholder="Institutional response..."
                className="flex-1 bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl px-6 py-4 text-sm text-slate-900 placeholder-slate-400 focus:border-[#2563EB] outline-none transition-all"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
              />
              <button 
                type="submit"
                disabled={!replyText.trim()}
                className="w-14 h-14 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-2xl flex items-center justify-center active:scale-90 transition-all shadow-lg shadow-[#2563EB]/20 disabled:opacity-30 disabled:grayscale"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 opacity-30 text-slate-400">
             <div className="w-24 h-24 bg-[#EEF3FF] rounded-full flex items-center justify-center border border-[#D8E3FF]">
                <MessageCircle className="w-10 h-10 text-[#2563EB]" />
             </div>
             <div className="text-center">
                <p className="font-serif font-black text-xl uppercase tracking-widest mb-2 text-slate-800">Support Archives</p>
                <p className="text-[10px] uppercase font-black tracking-[0.3em] text-slate-500">Select a scholar to initiate secure communication</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WithdrawalsManager({ requestClearance }: { requestClearance: any }) {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setWithdrawals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));
  }, []);

  const approveWithdrawal = async (withdrawal: any) => {
    requestClearance(withdrawal.id, 'withdraw', async () => {
      setLoading(withdrawal.id);
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/payout', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            amount: withdrawal.amount,
            accountNumber: withdrawal.bankDetails?.accountNumber,
            bankCode: withdrawal.bankDetails?.bankCode,
            accountName: withdrawal.bankDetails?.accountName,
            reference: `WD_${withdrawal.id}_${Date.now()}`,
            userId: withdrawal.userId,
            hasPaidCourse: true,
            currency: withdrawal.currency || 'NGN'
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || result.details || 'Payout failed');
        }

        await updateDoc(doc(db, 'withdrawals', withdrawal.id), {
          status: 'success',
          processedAt: new Date().toISOString(),
          paystackResponse: result
        });

        if (result.isManual) {
           alert('International withdrawal marked as success. Please ensure you manually transfer the funds via their requested method.');
        } else {
           alert('Withdrawal processed successfully via Paystack.');
        }
      } catch (err: any) {
        console.error(err);
        alert('Withdrawal failed: ' + err.message);
        
        await updateDoc(doc(db, 'withdrawals', withdrawal.id), {
          status: 'failed',
          error: err.message,
          processedAt: new Date().toISOString()
        });
      } finally {
        setLoading(null);
      }
    });
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#EEF3FF]/50 border-b border-[#D8E3FF]">
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Affiliate</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Bank Details</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Amount</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Status</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8E3FF]">
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-32 text-center text-slate-400 italic">No withdrawal requests found in archives</td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-[#EEF3FF]/30 transition-all">
                    <td className="px-6 py-6">
                      <div className="text-[14px] font-bold text-slate-900">{w.accountName || 'Unknown User'}</div>
                      <div className="text-[11px] text-slate-500 font-mono italic">{w.email || 'no-email'}</div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="text-[12px] font-bold text-[#2563EB]">{w.bankDetails?.bankName}</div>
                      <div className="text-[11px] text-slate-500 font-mono tracking-widest">{w.bankDetails?.accountNumber}</div>
                      <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{w.bankDetails?.accountName}</div>
                    </td>
                    <td className="px-6 py-6 text-[14.5px] font-black text-emerald-600 font-mono">{w.currency === 'USD' ? '$' : '₦'}{w.amount?.toLocaleString() || 0}</td>
                    <td className="px-6 py-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                        w.status === 'success' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                        w.status === 'failed' ? "bg-red-50 text-red-600 border-red-200" :
                        "bg-blue-50 text-[#2563EB] border-blue-200"
                      )}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-6 py-6">
                      {w.status === 'pending' ? (
                        <button 
                          onClick={() => approveWithdrawal(w)}
                          disabled={loading === w.id}
                          className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-[#2563EB]/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                        >
                          {loading === w.id ? 'Processing...' : 'Approve payout'}
                        </button>
                      ) : (
                         <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                           {w.processedAt ? format(new Date(w.processedAt), 'yyyy-MM-dd') : 'COMPLETED'}
                         </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SettingsManager() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    telegram: '',
    whatsapp: '',
    facebook: '',
    twitter: '',
    instagram: '',
    supportEmail: ''
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'institutional_links'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(data);
        setFormData({
          telegram: data.telegram || '',
          whatsapp: data.whatsapp || '',
          facebook: data.facebook || '',
          twitter: data.twitter || '',
          instagram: data.instagram || '',
          supportEmail: data.supportEmail || ''
        });
      }
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/institutional_links'));
    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'institutional_links'), {
        ...formData,
        type: 'social',
        updatedAt: new Date().toISOString()
      });
      alert('Institutional settings updated successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/institutional_links');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className="w-12 h-12 border-4 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin"></div>
      <div className="text-[#2563EB] font-serif italic animate-pulse">Synchronizing institutional protocol...</div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6 font-sans">
      <div className="bg-white border border-[#D8E3FF] rounded-2xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <ShieldAlert className="w-24 h-24 text-[#2563EB]" />
        </div>
        
        <div className="relative z-10">
          <h2 className="font-serif font-black text-2xl mb-2 text-slate-900 uppercase tracking-tighter">System Protocol Configuration</h2>
          <p className="text-slate-500 text-[11px] mb-8 font-mono uppercase tracking-widest">Manage institutional social links and support channels.</p>

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Telegram Handle</label>
              <input 
                type="text" 
                placeholder="@telegram_handle"
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3.5 text-[14px] text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                value={formData.telegram}
                onChange={e => setFormData(prev => ({ ...prev, telegram: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">WhatsApp Interface</label>
              <input 
                type="text" 
                placeholder="+234..."
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3.5 text-[14px] text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                value={formData.whatsapp}
                onChange={e => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Support Email Archive</label>
              <input 
                type="email" 
                placeholder="support@institution.com"
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3.5 text-[14px] text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                value={formData.supportEmail}
                onChange={e => setFormData(prev => ({ ...prev, supportEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Twitter (X) Command</label>
              <input 
                type="text" 
                placeholder="@handle"
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3.5 text-[14px] text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                value={formData.twitter}
                onChange={e => setFormData(prev => ({ ...prev, twitter: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Facebook Network</label>
              <input 
                type="text" 
                placeholder="page_url"
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3.5 text-[14px] text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                value={formData.facebook}
                onChange={e => setFormData(prev => ({ ...prev, facebook: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Instagram Feed</label>
              <input 
                type="text" 
                placeholder="@instagram"
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3.5 text-[14px] text-slate-900 focus:border-[#2563EB] outline-none transition-all font-mono"
                value={formData.instagram}
                onChange={e => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2 pt-4">
              <button 
                type="submit"
                disabled={saving}
                className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-black py-4.5 rounded-xl text-[13px] uppercase tracking-[0.4em] shadow-lg shadow-[#2563EB]/20 transition-all disabled:opacity-50"
              >
                {saving ? 'UPDATING ARCHIVES...' : 'EXECUTE PROTOCOL UPDATE'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-700 font-bold text-[13px] mb-1 uppercase tracking-widest">Administrative Warning</h4>
            <p className="text-red-600/80 text-[11px] leading-relaxed font-mono">
              These links are visible to all authenticated scholars. Ensure all handles and URLs are verified before deployment to prevent systematic confusion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminLockScreen({
  hasEnrolledPasscode,
  adminPasscode,
  onUnlock,
  setAdminPasscode,
  setHasEnrolledPasscode,
  biometricsAvailable
}: {
  hasEnrolledPasscode: boolean;
  adminPasscode: string;
  onUnlock: () => void;
  setAdminPasscode: (code: string) => void;
  setHasEnrolledPasscode: (val: boolean) => void;
  biometricsAvailable: boolean;
}) {
  const [pin, setPin] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlockPin = (enteredPin: string) => {
    if (enteredPin === adminPasscode) {
      onUnlock();
    } else {
      setError('INVALID PASSCODE: Access Denied.');
      setPin('');
    }
  };

  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPin.length !== 6 || confirmPin.length !== 6) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    if (setupPin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    setLoading(true);
    try {
      const u = auth.currentUser;
      if (u) {
        await updateDoc(doc(db, 'users', u.uid), {
          adminPasscode: setupPin
        });
        setAdminPasscode(setupPin);
        setHasEnrolledPasscode(true);
        onUnlock();
      }
    } catch (err) {
      console.error(err);
      setError('Failed to establish passcode in Firestore.');
    } finally {
      setLoading(false);
    }
  };

  const handleFingerprint = async () => {
    setError('');
    try {
      const result = await authenticateBiometrics();
      if (result) {
        onUnlock();
      }
    } catch (err: any) {
      setError(err?.message || 'Biometric authentication failed.');
    }
  };

  const handleNumClick = (num: string) => {
    setError('');
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 6) {
        setTimeout(() => handleUnlockPin(newPin), 200);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 font-sans text-slate-900">
      <div className="w-full max-w-sm bg-white border border-[#D8E3FF] rounded-3xl p-8 shadow-2xl relative">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-[#2563EB] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-[#2563EB]/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-serif font-black tracking-wider uppercase text-slate-900">ADMIN SECURITY</h2>
          <p className="text-[10px] font-black text-[#2563EB] uppercase tracking-widest mt-1">
            {hasEnrolledPasscode ? 'Access Restricted' : 'Secure Configuration Required'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs py-3 px-4 rounded-xl text-center mb-6 font-mono font-bold">
            {error}
          </div>
        )}

        {hasEnrolledPasscode ? (
          <div className="space-y-8">
            {/* PIN Dots */}
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border border-[#D8E3FF] transition-all duration-150",
                    pin.length > idx ? "bg-[#2563EB] border-[#2563EB] scale-110 shadow-md shadow-[#2563EB]/30" : "bg-transparent"
                  )}
                />
              ))}
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleNumClick(num)}
                  className="aspect-square rounded-2xl bg-[#EEF3FF] hover:bg-[#EEF3FF]/80 border border-[#D8E3FF] flex items-center justify-center font-serif text-xl font-bold text-slate-900 hover:border-[#2563EB]/40 transition-all active:scale-95 shadow-sm"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleBackspace}
                className="aspect-square rounded-2xl bg-transparent hover:bg-slate-100 flex items-center justify-center text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-all"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleNumClick('0')}
                className="aspect-square rounded-2xl bg-[#EEF3FF] hover:bg-[#EEF3FF]/80 border border-[#D8E3FF] flex items-center justify-center font-serif text-xl font-bold text-slate-900 hover:border-[#2563EB]/40 transition-all active:scale-95 shadow-sm"
              >
                0
              </button>
              {biometricsAvailable ? (
                <button
                  type="button"
                  onClick={handleFingerprint}
                  className="aspect-square rounded-2xl bg-[#EEF3FF] hover:bg-[#EEF3FF]/80 border border-[#D8E3FF] flex items-center justify-center text-[#2563EB] transition-all active:scale-95 shadow-sm"
                  title="Unlock with Fingerprint"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11a13.917 13.917 0 00-2.338-7.657m0 0a14.942 14.942 0 001.076-2.203M12 11c0-2.61-1.114-4.96-2.905-6.607m0 0A13.924 13.924 0 0012 1.1c2.479 0 4.757.647 6.728 1.785M12 11c0 1.258-.208 2.468-.592 3.6m3.497 4.36A14.85 14.85 0 0112 22.197M12 11c0-1.258.208-2.468.592-3.6m0 0a14.85 14.85 0 013.497-4.36M12 11h.01M16 11a4 4 0 00-8 0" />
                  </svg>
                </button>
              ) : (
                <div className="aspect-square" />
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSetupPin} className="space-y-4">
            <p className="text-xs text-slate-500 text-center mb-4 leading-relaxed">
              Create a secure 6-digit passcode to protect your admin workspace. You will use this passcode or your fingerprint to unlock the admin panel in the future.
            </p>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">New 6-Digit Passcode</label>
              <input
                required
                type="password"
                maxLength={6}
                pattern="\d{6}"
                value={setupPin}
                onChange={e => setSetupPin(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3 text-center font-mono font-black text-xl tracking-[0.5em] text-slate-900 focus:outline-none focus:border-[#2563EB] transition-all"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Confirm Passcode</label>
              <input
                required
                type="password"
                maxLength={6}
                pattern="\d{6}"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-3 text-center font-mono font-black text-xl tracking-[0.5em] text-slate-900 focus:outline-none focus:border-[#2563EB] transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#2563EB]/20 active:scale-95 disabled:opacity-30 mt-2"
            >
              {loading ? 'Establishing Enclave...' : 'Initialize Enclave'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
