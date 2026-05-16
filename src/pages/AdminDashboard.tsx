import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, orderBy, deleteDoc, where, limit, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Shield, LayoutDashboard, Users, Link as LinkIcon, CreditCard, Wallet,
  BarChart2, Building2, FileText, Bell, Quote, LogOut, Search, 
  Filter, Plus, Edit3, Trash2, CheckCircle2, AlertCircle, XCircle, ArrowRight,
  Layers, X, Download, MessageCircle, Check, Target, ShieldAlert, Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { downloadCSV } from '../lib/csvUtils';
import axios from 'axios';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../context/LanguageContext';
import { DEPARTMENTS, DEPARTMENT_STRUCTURE, DEPARTMENT_PRICES } from '../constants';

type Tab = 'dashboard' | 'users' | 'affiliates' | 'withdrawals' | 'payments' | 'analytics' | 'departments' | 'questions' | 'notifications' | 'quotes' | 'support' | 'logs' | 'settings';

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalRevenue: 0,
    displayRevenue: '₦0',
    newStudents: 0,
    pendingCommissions: 0,
    pendingWithdrawals: 0
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

    const unsubWithdrawals = onSnapshot(query(collection(db, 'withdrawals'), where('status', '==', 'pending')), (snap) => {
      setStats(prev => ({ ...prev, pendingWithdrawals: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));

    return () => {
      unsubUsers();
      unsubAffiliates();
      unsubPayments();
      unsubWithdrawals();
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
        await axios.post('/api/send-otp', {
          token,
          action,
          targetId: id,
          email: 'peteradekunle923@gmail.com'
        });
        alert(`[SECURITY AUTHENTICATED] A 6-digit verification token has been dispatched to admin. Check inbox/spam.`); 
      } catch (emailErr: any) {
        console.error('Email Dispatch Error:', emailErr);
        alert(`[WARNING] Database record created, but email failed. Reason: ${emailErr.message}`);
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

  return (
    <div className="flex min-h-screen bg-[#0a0c10] text-[#e8eaf0] font-sans selection:bg-gold/30">
      {/* Sidebar and Main Content ... */}
      {/* ... existing code ... */}
      {/* Sidebar */}
      <aside className="w-60 min-h-screen bg-[#111420] border-r border-[#1e2540] flex flex-col fixed top-0 left-0 z-50">
        <div className="p-7 flex items-center gap-3 border-b border-[#1e2540]">
          <div className="w-8 h-8 bg-gold flex-shrink-0" style={{ clipPath: 'polygon(50% 0%, 100% 35%, 80% 100%, 20% 100%, 0% 35%)' }}></div>
          <div className="font-serif font-extrabold text-sm leading-tight text-white uppercase tracking-tighter">
            Diamond<br />
            <span className="text-gold">Solution</span>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto no-scrollbar">
          <div className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">{t('admin.main')}</div>
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label={t('admin.dashboard')} onClick={() => setActiveTab('dashboard')} />
          <NavItem active={activeTab === 'users'} icon={Users} label={t('admin.users')} onClick={() => setActiveTab('users')} />
          <NavItem active={activeTab === 'affiliates'} icon={LinkIcon} label={t('admin.affiliates')} onClick={() => setActiveTab('affiliates')} badge={stats.pendingCommissions} />
          <NavItem active={activeTab === 'withdrawals'} icon={Wallet} label={t('admin.withdrawals')} onClick={() => setActiveTab('withdrawals')} badge={stats.pendingWithdrawals} />

          <div className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest mt-4">{t('admin.finance')}</div>
          <NavItem active={activeTab === 'payments'} icon={CreditCard} label={t('admin.payments')} onClick={() => setActiveTab('payments')} />
          <NavItem active={activeTab === 'analytics'} icon={BarChart2} label={t('admin.analytics')} onClick={() => setActiveTab('analytics')} />

          <div className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest mt-4">{t('admin.content')}</div>
          <NavItem active={activeTab === 'departments'} icon={Building2} label={t('admin.departments')} onClick={() => setActiveTab('departments')} />
          <NavItem active={activeTab === 'questions'} icon={FileText} label={t('admin.questions')} onClick={() => setActiveTab('questions')} />
          <NavItem active={activeTab === 'notifications'} icon={Bell} label={t('admin.notifications')} onClick={() => setActiveTab('notifications')} />
          <NavItem active={activeTab === 'quotes'} icon={Quote} label={t('admin.quotes')} onClick={() => setActiveTab('quotes')} />
          <NavItem active={activeTab === 'support'} icon={MessageCircle} label={t('admin.support')} onClick={() => setActiveTab('support')} />
          <NavItem active={activeTab === 'logs'} icon={FileText} label="System Logs" onClick={() => setActiveTab('logs')} />
          <NavItem active={activeTab === 'settings'} icon={ShieldAlert} label={t('admin.settings')} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="p-4 border-t border-[#1e2540] flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold to-blue-400 flex items-center justify-center font-bold text-navy text-sm uppercase">
            {auth.currentUser?.email?.charAt(0) || 'A'}
          </div>
          <div className="overflow-hidden">
            <div className="text-[13px] font-semibold truncate text-[#e8eaf0]">{auth.currentUser?.displayName || t('profile.defaultName')}</div>
            <div className="text-[11px] text-gray-500 truncate">{t('admin.superAdmin')}</div>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="ml-auto text-gray-500 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-60 flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 bg-[#0a0c10]/80 backdrop-blur-md border-b border-[#1e2540] px-8 py-4 flex items-center justify-between z-40">
          <h1 className="font-serif font-bold text-xl text-white capitalize">{activeTab === 'dashboard' ? t('admin.overview') : t(`admin.${activeTab}` as any)}</h1>
          <div className="flex items-center gap-3">
            <button className="bg-[#161b2e] border border-[#1e2540] text-[#e8eaf0] px-4 py-2 rounded-lg text-[13px] font-medium flex items-center gap-2 hover:border-gold/50 transition-all">
              <Bell className="w-4 h-4 text-gold" />
              <span>{t('admin.broadcastProtocol')}</span>
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="bg-gold text-navy px-4 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 hover:bg-gold-light transition-all shadow-lg shadow-gold/10"
            >
              <Plus className="w-4 h-4" />
              <span>{t('admin.refreshArchives')}</span>
            </button>
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
              {activeTab === 'dashboard' && <DashboardOverview stats={stats} />}
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
              {activeTab === 'questions' && <QuestionsManager initialFilter={selectedDeptFilter} />}
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
              className="absolute inset-0 bg-navy/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-[#161b2e] border border-red-500/30 rounded-3xl p-8 shadow-[0_0_50px_rgba(239,68,68,0.1)]"
            >
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                  <ShieldAlert className="w-8 h-8 text-red-500" />
                </div>
              </div>
              
              <h3 className="font-serif font-black text-xl text-text-1 text-center mb-2 uppercase tracking-tight">Security Clearance Required</h3>
              <p className="text-[11px] text-gray-500 text-center mb-8 font-mono leading-relaxed px-4">
                A verification token was sent to <span className="text-gold">peteradekunle923@gmail.com</span> to authorize <span className="text-white font-bold">{pendingAction?.type.toUpperCase()}</span>.
              </p>

              <div className="space-y-6">
                <input
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="0 0 0 0 0 0"
                  className="w-full bg-[#1e2540] border border-[#2d365e] rounded-xl px-6 py-4 text-center font-mono font-black text-2xl tracking-[0.5em] text-white focus:outline-none focus:border-red-500/50 transition-all placeholder:opacity-20"
                />

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowOtpModal(false)}
                    className="py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                  >
                    Abort
                  </button>
                  <button
                    onClick={confirmSecurityAction}
                    disabled={otpValue.length !== 6 || isVerifying}
                    className="bg-red-500 hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-red-500/20 transition-all font-mono"
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search security logs (email, purpose, reason)..." 
            className="w-full bg-[#161b2e] border border-[#1e2540] rounded-xl pl-10 pr-4 py-2.5 text-[13px] focus:border-gold outline-none transition-all shadow-lg"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Timestamp</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Scholar Email</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Event Type</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Data / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2540]">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.01] group transition-all">
                  <td className="px-6 py-5 text-[12px] font-mono text-gray-400">
                    {log.createdAt ? format(new Date(log.createdAt), 'MMM d, HH:mm:ss') : '—'}
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-[13px] font-bold text-[#e8eaf0]">{log.email}</div>
                    <div className="text-[10px] text-gray-500 font-mono">UID: {log.userId}</div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                      log.purpose?.includes('Protocol') ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    )}>
                      {log.purpose || 'Security Alert'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    {log.reason ? (
                      <div className="flex items-center gap-2 text-red-500/80 text-[11px] font-mono italic">
                        <AlertCircle className="w-3 h-3" />
                        {log.reason}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                         <Shield className="w-4 h-4 text-gold/50" />
                         <span className="text-[16px] font-mono font-black text-gold tracking-[0.2em]">
                           {log.otp || '********'}
                         </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-gray-600 font-serif italic">
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
        "w-[calc(100%-16px)] flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 rounded-lg text-sm font-medium transition-all relative group",
        active 
          ? "bg-gold/10 text-gold shadow-[0_0_20px_rgba(240,192,64,0.05)] border-l-2 border-gold rounded-l-none" 
          : "text-gray-500 hover:bg-[#1c2236] hover:text-[#e8eaf0]"
      )}
    >
      <Icon className={cn("w-[18px]", active ? "text-gold" : "text-gray-500 group-hover:text-[#e8eaf0]")} />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full font-mono leading-none">
          {badge}
        </span>
      )}
    </button>
  );
}

function StatCard({ label, value, sub, colorClass, currency }: { label: string, value: string, sub: string, colorClass: string, currency?: string }) {
  return (
    <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-6 relative overflow-hidden group hover:border-[#2a3556] transition-all">
      <div className={cn("absolute top-0 right-0 w-24 h-24 opacity-[0.04] rounded-full translate-x-6 -translate-y-6 transition-transform group-hover:scale-125 bg-current", colorClass)}></div>
      <div className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-3">{label}</div>
      <div className={cn("font-serif text-3xl font-black mb-1 transition-transform group-hover:translate-x-1", colorClass)}>
        {currency ? <span>{currency}</span> : null}{value}
      </div>
      <div className="text-[11px] text-gray-500">{sub}</div>
    </div>
  );
}

function DashboardOverview({ stats }: { stats: any }) {
  const { t } = useLanguage();
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<any[]>([]);

  useEffect(() => {
    // Consolidated Payments Listener
    const unsubPayments = onSnapshot(collection(db, 'payments'), (snap) => {
      // 1. Recent Payments (Latest 5)
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const sorted = [...all]
        .filter(p => p.paidAt)
        .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
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

      const colors = ['bg-gold', 'bg-[#5b8fff]', 'bg-[#ff9a3c]', 'bg-[#ff5a5a]', 'bg-[#3ddba5]', 'bg-[#a35bff]'];
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label={t('admin.totalStudents')} value={stats.totalStudents.toLocaleString()} sub={`${(stats as any).suspendedCount || 0} suspended`} colorClass="text-gold" />
        <StatCard label="Protocol Violation" value={((stats as any).suspendedCount || 0).toString()} sub="Total Suspended" colorClass="text-red-500" />
        <StatCard label={t('admin.totalRevenue')} value={stats.displayRevenue} sub="All time success" colorClass="text-[#3ddba5]" />
        <StatCard label={t('admin.pendingAffiliates')} value={stats.pendingCommissions.toString()} sub="Waiting for approval" colorClass="text-[#ff9a3c]" />
        <StatCard label={t('admin.pendingPayouts')} value={stats.pendingWithdrawals.toString()} sub="Withdrawal requests" colorClass="text-[#ff5a5a]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-[#1e2540] flex items-center justify-between">
            <h3 className="font-serif font-bold text-base">{t('admin.recentPayments')}</h3>
            <button className="text-[12px] text-blue-400 font-medium hover:underline">{t('admin.viewLedger')} →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider font-mono">{t('admin.scholarlyPayer')}</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider font-mono">{t('admin.institutionalDept')}</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider font-mono">{t('admin.endowment')}</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider font-mono">{t('admin.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2540]">
                {recentPayments.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">No recent transactions recorded</td></tr>
                ) : (
                  recentPayments.map((p, i) => (
                    <tr key={i} className="hover:bg-white/[0.01] transition-colors group">
                      <td className="px-6 py-5">
                        <div className="text-[13.5px] font-bold group-hover:text-gold transition-colors">{p.studentName || t('profile.defaultName')}</div>
                        <div className="text-[11px] text-gray-500">{p.email || 'no-email'}</div>
                      </td>
                      <td className="px-6 py-5 text-[13px] text-gray-400">{p.dept_name || '—'}</td>
                      <td className="px-6 py-5 text-[13.5px] font-mono font-bold text-[#3ddba5]">₦{p.amount?.toLocaleString()}</td>
                      <td className="px-6 py-5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider font-mono",
                          p.status === 'success' ? "bg-[#3ddba5]/15 text-[#3ddba5]" : "bg-gold/15 text-gold"
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

        <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-6 shadow-xl">
          <h3 className="font-serif font-bold text-base mb-6">{t('admin.revenueBreakdown')}</h3>
          <div className="space-y-6">
            {revenueBreakdown.length === 0 ? (
              <div className="py-10 text-center text-gray-600 text-xs italic">No department revenue data available</div>
            ) : (
              revenueBreakdown.map((d, i) => (
                <div key={i} className="space-y-2 group">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[13px] font-bold group-hover:text-gold transition-colors">{d.name}</div>
                      <div className="text-[11px] text-gray-500">{d.enrolled} enrolled</div>
                    </div>
                    <div className="text-[13px] font-mono font-black text-[#3ddba5]">₦{(d.amount / 1000000).toFixed(2)}M</div>
                  </div>
                  <div className="h-1.5 bg-[#1e2540] rounded-full overflow-hidden shadow-inner">
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
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterVerified, setFilterVerified] = useState<'all' | 'verified' | 'unverified' | 'suspended'>('all');

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
  }, []);

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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search scholars (name, email, or protocol reason)..." 
            className="w-full bg-[#161b2e] border border-[#1e2540] rounded-xl pl-10 pr-4 py-2.5 text-[13px] focus:border-gold outline-none transition-all shadow-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          value={filterVerified}
          onChange={(e) => setFilterVerified(e.target.value as any)}
          className="bg-[#161b2e] border border-[#1e2540] rounded-xl px-4 py-2.5 text-[13px] text-gray-400 outline-none hover:border-gold/30 transition-all cursor-pointer"
        >
          <option value="all">{t('admin.status')}</option>
          <option value="verified">Authorized Only</option>
          <option value="unverified">Pending Only</option>
          <option value="suspended">Suspended / Protocol Violation</option>
        </select>
        <button 
          onClick={() => downloadCSV(users, 'institutional_users')}
          className="bg-white/5 border border-white/10 text-gray-400 px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest hover:border-gold/30 hover:text-gold transition-all flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {t('admin.export')}
        </button>
        <button className="bg-gold text-navy px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest ml-auto shadow-2xl shadow-gold/20 hover:scale-105 active:scale-95 transition-all text-nowrap">+ {t('admin.addUser')}</button>
      </div>

      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.scholarProfile')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Last Active</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.institutionalDept')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.role')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.affiliateStatus')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.status')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2540]">
              {filtered.map((u) => {
                const isSuspended = u.status === 'suspended';
                const lastActive = u.lastStudyDate ? format(new Date(u.lastStudyDate), 'MMM d, p') : 'Never';
                
                const toggleSuspension = async () => {
                  const targetAction = isSuspended ? 'update' : 'delete'; // use 'delete' as an alias for suspension for higher visibility label in email? 
                  // No, let's keep it 'update' but maybe add a 'suspend' action type to OTP.
                  
                  requestClearance(u.id, 'update', async () => {
                    await setDoc(doc(db, 'users', u.id), {
                      status: isSuspended ? 'active' : 'suspended',
                      suspensionReason: isSuspended ? null : 'Suspended by Administrator',
                      suspendedAt: isSuspended ? null : new Date().toISOString()
                    }, { merge: true });
                    alert(`User status successfully updated to ${isSuspended ? 'ACTIVE' : 'SUSPENDED'}.`);
                  });
                };

                return (
                  <tr key={u.id} className="hover:bg-white/[0.01] group transition-all">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#1e2540] flex items-center justify-center font-serif font-black text-gold border border-gold/10 shadow-lg group-hover:rotate-6 transition-transform">
                          {u.displayName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="text-[14px] font-bold text-[#e8eaf0] group-hover:text-gold transition-colors">{u.displayName || t('profile.defaultName')}</div>
                          <div className="text-[11px] text-gray-500 font-mono italic">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Clock className="w-3.5 h-3.5 text-gold/50" />
                        <span className="text-[12px] font-mono">{lastActive}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-[13px] font-bold text-gray-400 uppercase tracking-wider">{u.department || '—'}</td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] border",
                          u.affiliateStatus === 'active' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-md shadow-emerald-500/5" : "bg-gold/10 text-gold border-gold/20"
                        )}>
                          {u.affiliateStatus || 'Inactive'}
                        </span>
                        {u.referralCode && (
                          <span className="text-[10px] font-mono font-bold text-gold tracking-tighter opacity-70 truncate max-w-[80px]">{u.referralCode}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] border",
                        u.role === 'admin' ? "bg-gold/10 text-gold border-gold/40 shadow-lg shadow-gold/5" : "bg-[#1e2540] text-gray-400 border-transparent shadow-inner"
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={cn(
                        "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest",
                        isSuspended ? "text-red-500" : "text-[#3ddba5]"
                      )}>
                        <div className={cn("w-2 h-2 rounded-full", isSuspended ? "bg-red-500" : "bg-[#3ddba5] animate-pulse")}></div>
                        {isSuspended ? 'Suspended' : t('admin.protocolActive')}
                      </span>
                      {isSuspended && u.suspensionReason && (
                        <div className="text-[8px] text-red-500/80 mt-1 font-bold uppercase tracking-widest bg-red-500/10 px-1 rounded truncate max-w-[120px]">
                          {u.suspensionReason}
                        </div>
                      )}
                      <div className="text-[8px] text-gray-600 mt-1 font-mono uppercase tracking-tighter">Currency: {u.currency || 'NGN'}</div>
                    </td>
                    <td className="px-6 py-5 text-nowrap">
                      <div className="flex items-center gap-2">
                        <button className="bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:bg-blue-500/20 active:scale-95 shadow-sm">View</button>
                        
                        {!u.isPartner && (
                          <button 
                            onClick={async () => {
                              try {
                                const token = await auth.currentUser?.getIdToken();
                                await axios.post('/api/admin/approve-affiliate', 
                                  { targetUserId: u.id },
                                  { headers: { Authorization: `Bearer ${token}` } }
                                );
                                alert('User successfully promoted to Partner STATUS.');
                              } catch (err: any) {
                                alert('Activation Error: ' + (err.response?.data?.error || err.message));
                              }
                            }}
                            className="bg-gold/10 text-gold border border-gold/20 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gold hover:text-navy transition-all shadow-sm"
                          >
                            {t('admin.approvePartner')}
                          </button>
                        )}

                        <button 
                          onClick={toggleSuspension}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm border",
                            isSuspended 
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20" 
                              : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
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
      <div className="flex items-center gap-4 border-b border-[#1e2540] pb-2">
        <button 
          onClick={() => setActiveSubTab('commissions')}
          className={cn(
            "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
            activeSubTab === 'commissions' ? "text-gold border-b-2 border-gold" : "text-gray-500 hover:text-gray-300"
          )}
        >
          {t('admin.matrix')}
        </button>
        <button 
          onClick={() => setActiveSubTab('registry')}
          className={cn(
            "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
            activeSubTab === 'registry' ? "text-gold border-b-2 border-gold" : "text-gray-500 hover:text-gray-300"
          )}
        >
          {t('admin.partnerRegistry')}
        </button>
      </div>

      <div className="flex justify-between items-center">
        <button 
          onClick={() => downloadCSV(activeSubTab === 'commissions' ? affiliates : partners, `affiliate_${activeSubTab}`)}
          className="bg-white/5 border border-white/10 text-gray-400 px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest hover:border-gold/30 hover:text-gold transition-all flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {t('admin.export')}
        </button>
      </div>

      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          {activeSubTab === 'commissions' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Commission Referrer</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Accrued Amount</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Protocol Status</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2540]">
                {affiliates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-32 text-center">
                      <LinkIcon className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                      <p className="text-gray-500 text-[13.5px] font-medium tracking-tight">No partner referral data recorded in archives</p>
                    </td>
                  </tr>
                ) : (
                  affiliates.map((a) => (
                    <tr key={a.id} className="hover:bg-white/[0.01] group transition-all">
                      <td className="px-6 py-6 font-bold text-[14.5px] group-hover:text-gold transition-colors">{a.referrerName}</td>
                      <td className="px-6 py-6 font-mono text-[14.5px] font-black text-[#3ddba5]">
                        {a.commissionCurrency === 'USD' ? '$' : '₦'}{a.commissionAmount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-6">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest font-mono border shadow-sm",
                          a.status === 'paid' ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-gold/15 text-gold border-gold/30"
                        )}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-6 py-6">
                        <button 
                          onClick={() => authorizeCommission(a.id, a.status)}
                          disabled={a.status === 'paid'}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-md active:scale-95 border",
                            a.status === 'paid' ? "bg-gray-500/10 text-gray-600 border-transparent cursor-not-allowed" : "bg-gold/10 text-gold border-gold/30 hover:bg-gold hover:text-navy"
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
                <tr className="bg-white/[0.02]">
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Partner Name</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Referral Code</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.totalEarned')}</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.totalPaid')}</th>
                  <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.balance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2540]">
                {partners.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-32 text-center text-gray-500 italic">No partners founded in registry</td></tr>
                ) : (
                  partners.map((p) => {
                    const earned = affiliates.filter(a => a.referrerUid === p.id).reduce((acc, curr) => acc + (curr.commissionAmount || 0), 0);
                    const paid = payouts.filter(w => w.userId === p.id && w.status !== 'failed').reduce((acc, curr) => acc + (curr.amount || 0), 0);
                    const bal = Math.max(0, earned - paid);
                    return (
                      <tr key={p.id} className="hover:bg-white/[0.01] group transition-all">
                        <td className="px-6 py-6 text-nowrap">
                          <div className="text-[14px] font-bold text-white group-hover:text-gold transition-colors">{p.displayName}</div>
                          <div className="text-[11px] text-gray-500 font-mono">{p.email}</div>
                        </td>
                        <td className="px-6 py-6">
                          <span className="bg-gold/10 text-gold px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gold/20">{p.referralCode}</span>
                        </td>
                        <td className="px-6 py-6 text-[14px] font-mono font-bold text-white">₦{earned.toLocaleString()}</td>
                        <td className="px-6 py-6 text-[14px] font-mono font-bold text-emerald-500">₦{paid.toLocaleString()}</td>
                        <td className="px-6 py-6 text-[14px] font-mono font-black text-gold">₦{bal.toLocaleString()}</td>
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

  useEffect(() => {
    return onSnapshot(query(collection(db, 'payments'), orderBy('paidAt', 'desc'), limit(50)), (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder={t('admin.searchTransaction')} 
            className="w-full bg-[#161b2e] border border-[#1e2540] rounded-xl pl-10 pr-4 py-3 text-[13px] focus:border-gold outline-none shadow-lg"
          />
        </div>
        <select className="bg-[#161b2e] border border-[#1e2540] rounded-xl px-5 py-3 text-[13px] text-gray-400 outline-none">
          <option>Filter by Gateway</option>
          <option>Paystack Secure</option>
          <option>Flutterwave Flow</option>
        </select>
        <button 
          onClick={() => downloadCSV(payments, 'financial_ledger')}
          className="bg-white/5 border border-white/10 text-gray-400 px-6 py-3 rounded-xl text-[13px] font-black uppercase tracking-widest hover:border-gold/30 hover:text-gold transition-all flex items-center gap-2 ml-auto"
        >
          <Download className="w-4 h-4" />
          {t('admin.export')}
        </button>
      </div>

      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.protocolRef')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.scholarlyPayer')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.endowment')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.status')}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.timestamp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2540]">
              {payments.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-32 text-center text-gray-600 italic">No financial movements detected in secure ledger</td></tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.01] group transition-all">
                    <td className="px-6 py-6 text-[12px] font-mono text-gray-500 group-hover:text-gold transition-colors">{p.reference}</td>
                    <td className="px-6 py-6 text-[14.5px] font-bold">
                      {p.studentName}
                      <div className="text-[10px] font-mono text-gray-500 mt-0.5">{p.email}</div>
                    </td>
                    <td className="px-6 py-6 text-[14.5px] font-black text-[#3ddba5] font-mono text-nowrap">
                      {p.currency === 'USD' ? '$' : '₦'}{p.amount?.toLocaleString()}
                    </td>
                    <td className="px-6 py-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest font-mono border shadow-sm text-nowrap",
                        p.status === 'success' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-md shadow-emerald-500/5" : "bg-gold/10 text-gold border-gold/20"
                      )}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-[12.5px] text-gray-500 font-mono text-nowrap">
                      {p.paidAt ? format(new Date(p.paidAt), 'yyyy.MM.dd | HH:mm') : '—'}
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
        if (data.status === 'success' && data.paidAt) {
          const date = new Date(data.paidAt);
          if (date.getFullYear() === new Date().getFullYear()) {
            monthly[date.getMonth()] += data.amount || 0;
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
        if (data.status === 'completed' && data.processedAt) {
          const date = new Date(data.processedAt);
          if (date.getFullYear() === new Date().getFullYear()) {
            monthly[date.getMonth()] += data.amount || 0;
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
        <StatCard label="Live Revenue (MTD)" value={`₦${(stats.totalRevenue/1000).toLocaleString()}k`} sub="Verified success rate 99.1%" colorClass="text-[#3ddba5]" />
        <StatCard label="Scholarly Access" value={stats.totalStudents.toLocaleString()} sub="Institutional connections" colorClass="text-[#5b8fff]" />
        <StatCard label="Avg Enrollment" value="₦12.9k" sub="Mean tuition value" colorClass="text-gold" />
        <StatCard label="Suspension Rate" value="0.4%" sub="Violation deactivations" colorClass="text-red-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><BarChart2 className="w-20 h-20" /></div>
          <h3 className="font-serif font-black text-lg mb-8 tracking-tight uppercase tracking-[0.2em] text-gold/80">{t('admin.revenueHistory')}</h3>
          <div className="h-64 flex items-end justify-between gap-3">
            {revenueData.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                <div 
                  className="w-full bg-gradient-to-t from-[#3ddba5]/5 via-[#3ddba5]/40 to-[#3ddba5] rounded-t-lg transition-all duration-500 group-hover:brightness-150 group-hover:shadow-[0_0_20px_rgba(61,219,165,0.2)]"
                  style={{ height: `${h}%` }}
                ></div>
                <div className="text-[9px] font-black text-gray-600 group-hover:text-gold transition-colors font-mono">M{i+1}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><Users className="w-20 h-20" /></div>
          <h3 className="font-serif font-black text-lg mb-8 tracking-tight uppercase tracking-[0.2em] text-[#ff5a5a]/80">{t('admin.payoutHistory')}</h3>
          <div className="h-64 flex items-end justify-between gap-3">
            {payoutData.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                <div 
                  className="w-full bg-gradient-to-t from-[#ff5a5a]/5 via-[#ff5a5a]/40 to-[#ff5a5a] rounded-t-lg transition-all duration-500 group-hover:brightness-150 group-hover:shadow-[0_0_20px_rgba(255,90,90,0.2)]"
                  style={{ height: `${h}%` }}
                ></div>
                <div className="text-[9px] font-black text-gray-600 group-hover:text-[#ff5a5a] transition-colors font-mono">M{i+1}</div>
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
  const [loading, setLoading] = useState(false);
  const [customFaculties, setCustomFaculties] = useState<any[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'faculties'), (snap) => {
      setCustomFaculties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'faculties'));
  }, []);

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpTargetId, setOtpTargetId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: 'delete' | 'update' | 'payout', data?: any } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const requestSecurityClearance = async (id: string, action: 'delete' | 'update' | 'payout', data?: any) => {
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
        await axios.post('/api/send-otp', {
          token,
          action,
          targetId: id,
          email: 'peteradekunle923@gmail.com'
        });
        alert(`[SECURITY AUTHENTICATED] A 6-digit verification token has been dispatched to: peteradekunle923@gmail.com. Please check your inbox (or spam folder).`); 
      } catch (emailErr: any) {
        console.error('Email Dispatch Error:', emailErr);
        // Fallback or warning if the server-side key isn't set yet
        const errorDetail = emailErr.response?.data?.details || emailErr.message;
        alert(`[WARNING] Database authorization record created, but email delivery failed. \n\nReason: ${errorDetail}\n\nCONTACT SYSTEM ADMIN TO CONFIGURE 'RESEND_API_KEY'.`);
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
    try {
      if (editingFacultyId) {
        await updateDoc(doc(db, 'faculties', editingFacultyId), {
          name: facultyName,
          price: facultyPrice,
          priceUSD: facultyPriceUSD,
          updatedAt: new Date().toISOString()
        });
        alert('Faculty record successfully updated in archives.');
      } else {
        await addDoc(collection(db, 'faculties'), {
          name: facultyName,
          price: facultyPrice,
          priceUSD: facultyPriceUSD,
          createdAt: new Date().toISOString()
        });
        alert('Faculty successfully manifested in archives.');
      }
      setShowAddFaculty(false);
      setEditingFacultyId(null);
      setFacultyName('');
      setFacultyPrice(10000);
      setFacultyPriceUSD(7);
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
    setShowAddFaculty(true);
  };

  const allDepts = (() => {
    const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
    const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
    return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
  })();

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button 
          onClick={() => {
            setEditingFacultyId(null);
            setFacultyName('');
            setFacultyPrice(10000);
            setFacultyPriceUSD(7);
            setShowAddFaculty(true);
          }}
          className="bg-gold text-navy px-8 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-gold/20 flex items-center gap-3 hover:scale-105 active:scale-95 transition-all text-nowrap"
        >
          <Plus className="w-5 h-5" />
          {t('admin.addFaculty')}
        </button>
      </div>

      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className="px-6 py-6 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.facultyName')}</th>
                <th className="px-6 py-6 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.systemSlug')}</th>
                <th className="px-6 py-6 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.tuitionBase')}</th>
                <th className="px-6 py-6 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.operationalMode')}</th>
                <th className="px-6 py-6 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">{t('admin.actions')}</th>
              </tr>
            </thead>
    <tbody className="divide-y divide-[#1e2540]">
              {[...DEPARTMENTS.filter(d => !customFaculties.some(cf => cf.name === d && cf.isDeleted)).map(d => {
                const custom = customFaculties.find(cf => cf.name === d && !cf.isDeleted);
                return custom ? { ...custom, isStatic: false } : { 
                  name: d, 
                  isStatic: true, 
                  price: DEPARTMENT_PRICES[d]?.ngn || 10000, 
                  priceUSD: DEPARTMENT_PRICES[d]?.usd || 7 
                };
              }), ...customFaculties.filter(cf => !cf.isDeleted && !DEPARTMENTS.includes(cf.name))].map((dept, i) => (
                <tr key={i} className="hover:bg-white/[0.01] group transition-all text-nowrap">
                  <td className="px-6 py-6 font-serif font-black text-[15px] group-hover:text-gold transition-colors">{dept.name}</td>
                  <td className="px-6 py-6 text-[11px] text-gray-600 font-mono italic tracking-tighter">{dept.name.toLowerCase().replace(/\s+/g, '-')}</td>
                  <td className="px-6 py-6 font-mono font-black">
                    <div className="text-gold">₦{dept.price.toLocaleString()}</div>
                    <div className="text-blue-400 text-[10px] tracking-tight group-hover:translate-x-1 transition-transform italic">${(dept.priceUSD || Math.ceil(dept.price / 1500)).toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="flex items-center gap-2 text-[10px] font-black text-[#3ddba5] uppercase tracking-widest">
                      <div className="w-2 h-2 rounded-full bg-[#3ddba5]"></div>
                      {dept.isStatic ? t('admin.defaultInstitutional') : t('admin.adminCustomized')}
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex gap-4">
                      <button 
                        onClick={() => {
                          if (onEditArchive) onEditArchive(dept.name);
                        }}
                        className="text-blue-400 text-[10px] font-black uppercase tracking-widest hover:underline hover:text-blue-300 transition-colors"
                      >
                        {t('admin.archives')}
                      </button>
                      <button 
                        onClick={() => requestClearance(dept.id || dept.name, 'update', async () => openEditModal(dept))}
                        className="text-emerald-500 text-[10px] font-black uppercase tracking-widest hover:underline"
                      >
                        Update Fee
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
                         className="text-red-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10"
                         title="Erase Faculty Record"
                       >
                         <Trash2 className="w-5 h-5 leading-none" />
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-navy/80 backdrop-blur-md"
              onClick={() => setShowAddFaculty(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#161b2e] border border-gold/20 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="font-serif font-black text-2xl text-text-1 mb-6 uppercase tracking-tight">
                {editingFacultyId ? t('admin.modifyFaculty') : t('admin.initializeFaculty')}
              </h3>
              <form onSubmit={handleAddFaculty} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-text-3 uppercase tracking-widest mb-2 block">{t('admin.facultyName')}</label>
                  <input 
                    required
                    value={facultyName}
                    onChange={e => setFacultyName(e.target.value)}
                    placeholder="e.g., Computer Science"
                    className="w-full bg-navy border border-white/10 rounded-xl p-4 text-sm text-white focus:border-gold outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-text-3 uppercase tracking-widest mb-2 block">{t('admin.tuitionFee')} (₦)</label>
                    <input 
                      required
                      type="number"
                      value={Number.isNaN(facultyPrice) ? '' : facultyPrice}
                      onChange={e => setFacultyPrice(parseInt(e.target.value))}
                      className="w-full bg-navy border border-white/10 rounded-xl p-4 text-sm text-white focus:border-gold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-text-3 uppercase tracking-widest mb-2 block">{t('admin.tuitionFee')} ($)</label>
                    <input 
                      required
                      type="number"
                      value={Number.isNaN(facultyPriceUSD) ? '' : facultyPriceUSD}
                      onChange={e => setFacultyPriceUSD(parseInt(e.target.value))}
                      className="w-full bg-navy border border-white/10 rounded-xl p-4 text-sm text-white focus:border-gold outline-none"
                    />
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-gold text-navy py-4 rounded-xl font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-gold/20 transition-all hover:bg-gold-light"
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
              className="absolute inset-0 bg-navy/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-[#161b2e] border border-red-500/30 rounded-3xl p-8 shadow-[0_0_50px_rgba(239,68,68,0.1)]"
            >
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                  <ShieldAlert className="w-8 h-8 text-red-500" />
                </div>
              </div>
              
              <h3 className="font-serif font-black text-xl text-text-1 text-center mb-2 uppercase tracking-tight">{t('admin.facultySecurityClearance')}</h3>
              <p className="text-[11px] text-gray-500 text-center mb-8 font-mono leading-relaxed px-4">
                {t('admin.verificationCodeSent')} <span className="text-gold">peteradekunle923@gmail.com</span> to authorize the <span className="text-white font-bold">{pendingAction?.type.toUpperCase()}</span> of <span className="text-gold font-bold">{otpTargetId}</span>.
              </p>

              <div className="space-y-6">
                <input
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="0 0 0 0 0 0"
                  className="w-full bg-[#1e2540] border border-[#2d365e] rounded-xl px-6 py-4 text-center font-mono font-black text-2xl tracking-[0.5em] text-white focus:outline-none focus:border-red-500/50 transition-all placeholder:opacity-20"
                />

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowOtpModal(false)}
                    className="py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                  >
                    {t('admin.abortLaunch')}
                  </button>
                  <button
                    onClick={confirmSecurityAction}
                    disabled={otpValue.length !== 6 || isVerifying}
                    className="bg-red-500 hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-red-500/20 transition-all"
                  >
                    {isVerifying ? 'Verifying...' : t('admin.authorizeProtocol')}
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

function QuestionsManager({ initialFilter }: { initialFilter: string | null }) {
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
  
  // States for new course
  const [newCourse, setNewCourse] = useState({ title: '', department: initialFilter || allDepts[0], level: '100L', description: '' });
  
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

  useEffect(() => {
    if (courses.length > 0) {
      if (filteredCourses.length > 0) {
        // If current active course is not in filtered list, pick the first one
        if (!activeCourse || !filteredCourses.find(c => c.id === activeCourse.id)) {
          setActiveCourse(filteredCourses[0]);
        }
      } else {
        setActiveCourse(null);
      }
    }
  }, [deptFilter, courses]);

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
        setLoading(true); // Assuming there's a loading state or similar
        const contentRef = collection(db, 'courses', activeCourse.id, 'content');
        const isAppQuestion = activeCourse.level === 'Application Questions';
        
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

          await addDoc(contentRef, {
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

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'courses'), {
        ...newCourse,
        title: newCourse.title.trim(),
        description: newCourse.description.trim(),
        price: 0,
        thumbnail: 'https://images.unsplash.com/photo-1532187875685-d6d1dd2e43f5?auto=format&fit=crop&q=80',
        createdAt: new Date().toISOString()
      });
      setShowAddCourse(false);
      const allDeptsList = (() => {
        const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
        const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
        return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
      })();
      setNewCourse({ title: '', department: allDeptsList[0], level: '100L', description: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'courses');
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

  const deleteQuestion = async (qId: string) => {
    if (!activeCourse) return;
    const path = `courses/${activeCourse.id}/content/${qId}`;
    try {
      await deleteDoc(doc(db, 'courses', activeCourse.id, 'content', qId));
      setDeleteConfirmation(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const deleteCourse = async (courseId: string) => {
    try {
      await deleteDoc(doc(db, 'courses', courseId));
      if (activeCourse?.id === courseId) {
        setActiveCourse(null);
      }
      setDeleteConfirmation(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `courses/${courseId}`);
    }
  };

  return (
    <div className="space-y-8">
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <select 
              value={deptFilter || 'all'}
              onChange={(e) => setDeptFilter(e.target.value === 'all' ? null : e.target.value)}
              className="bg-[#161b2e] border border-[#1e2540] rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-gold outline-none hover:border-gold/30 transition-all cursor-pointer"
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
            <div className="flex flex-wrap gap-3 overflow-x-auto no-scrollbar max-w-full">
               {filteredCourses.map(c => (
                 <div key={c.id} className="relative group">
                   <button
                     onClick={() => setActiveCourse(c)}
                     className={cn(
                       "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap shadow-sm",
                       activeCourse?.id === c.id 
                         ? "bg-gold text-navy border-gold shadow-gold/20" 
                         : "bg-[#161b2e] text-gray-500 border-[#1e2540] hover:border-gold/30 hover:text-gray-300"
                     )}
                   >
                     {c.title} ({c.level})
                   </button>
                   <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setDeleteConfirmation({ type: 'course', id: c.id });
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                   >
                    <X className="w-3 h-3" />
                   </button>
                 </div>
               ))}
               {filteredCourses.length === 0 && (
                 <span className="text-[10px] text-gray-600 italic py-2">No archives discovered for this faculty...</span>
               )}
            </div>
          </div>
          <button 
            onClick={() => setShowAddCourse(true)}
            className="p-3 bg-gold/10 text-gold border border-gold/20 rounded-xl hover:bg-gold/20 active:scale-95 transition-all text-nowrap"
          >
            <Plus className="w-5 h-5" />
          </button>
       </div>

       {activeCourse ? (
         <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden p-10 shadow-2xl relative">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none"><FileText className="w-40 h-40" /></div>
            <div className="flex items-center justify-between mb-12 relative z-10">
              <div>
                <h3 className="font-serif font-black text-2xl text-white tracking-tight">{activeCourse.title}</h3>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[9px] font-black bg-gold/10 text-gold px-3 py-1 rounded-full uppercase tracking-widest border border-gold/20">
                    {activeCourse.department}
                  </span>
                  <span className="text-[9px] font-black bg-white/5 text-gray-400 px-3 py-1 rounded-full uppercase tracking-widest border border-white/10">
                    {activeCourse.level}
                  </span>
                </div>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={downloadTemplate}
                  className="bg-gold/10 border border-gold/20 text-gold px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gold/20 transition-all flex items-center gap-2"
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
                    "bg-gold/10 border border-gold/20 text-gold px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2",
                    loading ? "opacity-50 cursor-not-allowed" : "hover:bg-gold/20"
                  )}
                >
                  <Plus className="w-4 h-4" />
                  {loading ? 'Processing Archives...' : t('admin.importArchive')}
                </button>
                <button 
                  onClick={exportQuestionsCSV}
                  className="bg-white/5 border border-white/10 text-gray-400 px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:border-gold/30 hover:text-gold transition-all flex items-center gap-2"
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
                  className="bg-gold text-navy px-8 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-gold/20 flex items-center gap-2 hover:scale-[1.05] active:scale-95 transition-all text-nowrap"
                >
                  <Plus className="w-5 h-5 font-black" />
                  {t('admin.addNewQuestion')}
                </button>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              {questions.length === 0 ? (
                <div className="text-center py-32 bg-white/[0.01] border-[2px] border-dashed border-[#1e2540] rounded-3xl flex flex-col items-center justify-center group hover:border-gold/20 transition-all">
                   <div className="w-16 h-16 bg-navy-high rounded-2xl flex items-center justify-center mb-6 border border-gold/5 shadow-inner transition-transform group-hover:scale-110">
                      <FileText className="w-7 h-7 text-gray-700" />
                   </div>
                   <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">No queries found in this archive</h4>
                   <p className="text-[10px] text-gray-600 mt-2 font-mono">Initialize secure data entry via 'New Query'</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="bg-navy-high/50 border border-[#1e2540] p-6 rounded-2xl flex items-start justify-between group hover:border-gold/20 transition-all">
                      <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-gold font-mono text-[10px] font-black">
                            {idx + 1}
                          </span>
                          <h4 className="text-[15px] font-medium text-white leading-relaxed">{q.question}</h4>
                        </div>
                        {q.type === 'application' ? (
                          <div className="ml-12 p-4 bg-white/5 rounded-xl border border-white/5 text-[12px] text-emerald-400">
                            <span className="font-black uppercase tracking-widest text-[9px] block mb-1 text-gold/60">Expected Answer</span>
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
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                                    : "bg-[#1e2540]/30 border-white/5 text-gray-400"
                                )}
                              >
                                <span className="font-mono text-[10px] mr-2 opacity-40">{['A', 'B', 'C', 'D', 'E'][oi]}.</span>
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.explanation && (
                          <div className="ml-12 p-4 bg-white/5 rounded-xl border border-white/5 text-[11px] text-gray-500 italic">
                            <span className="font-black uppercase tracking-widest text-[9px] block mb-1 text-gold/60">{t('admin.explanation')}</span>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => startEditQuestion(q)}
                          className="p-2 text-gray-600 hover:text-gold transition-colors"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmation({ type: 'question', id: q.id })}
                          className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
         </div>
       ) : (
         <div className="text-center py-32 bg-[#161b2e] border border-[#1e2540] rounded-3xl">
           <Layers className="w-16 h-16 text-gray-700 mx-auto mb-6" />
           <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Select an archive to begin processing</h4>
           <button 
            onClick={() => setShowAddCourse(true)}
            className="mt-6 text-gold text-[10px] font-black uppercase tracking-widest hover:underline"
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
               className="fixed inset-0 bg-navy/90 backdrop-blur-sm"
               onClick={() => setDeleteConfirmation(null)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="relative w-full max-w-sm bg-[#1a1f35] border border-red-500/30 rounded-3xl p-8 shadow-2xl text-center"
             >
               <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                 <AlertCircle className="w-8 h-8 text-red-500" />
               </div>
               <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Confirm Destruction</h3>
               <p className="text-sm text-gray-400 mb-8">
                 {deleteConfirmation.type === 'course' 
                   ? 'This will permanently erase the entire archive and all its associated queries from the database.'
                   : 'Are you sure you want to erase this specific query? This action cannot be undone.'}
               </p>
               <div className="flex gap-4">
                 <button 
                   onClick={() => setDeleteConfirmation(null)}
                   className="flex-1 px-6 py-3 rounded-xl bg-white/5 text-gray-400 font-bold uppercase tracking-widest text-[10px] hover:bg-white/10 transition-colors"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={() => {
                    if (deleteConfirmation.type === 'course') deleteCourse(deleteConfirmation.id);
                    else deleteQuestion(deleteConfirmation.id);
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
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 bg-navy/80 backdrop-blur-md"
               onClick={() => setShowAddCourse(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-md bg-[#161b2e] border border-gold/20 rounded-3xl p-8 shadow-2xl"
             >
               <h3 className="font-serif font-black text-2xl text-text-1 mb-6">Archive Provisioning</h3>
               <form onSubmit={handleAddCourse} className="space-y-4">
                 <div>
                   <label className="text-[10px] font-black text-text-3 uppercase tracking-widest mb-2 block">Archive Title</label>
                   <input 
                    required
                    value={newCourse.title}
                    onChange={e => setNewCourse({ ...newCourse, title: e.target.value })}
                    placeholder="e.g., General Anatomy"
                    className="w-full bg-navy border border-white/10 rounded-xl p-4 text-sm text-white focus:border-gold outline-none"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest mb-2 block">Department</label>
                      <select 
                        value={newCourse.department}
                        onChange={e => {
                          const newDept = e.target.value;
                          const levelsArr = DEPARTMENT_STRUCTURE[newDept]?.levels || ['100L', '200L', '300L', '400L', '500L', '600L'];
                          setNewCourse({ ...newCourse, department: newDept, level: levelsArr[0] });
                        }}
                        className="w-full bg-navy border border-white/10 rounded-xl p-4 text-[12px] text-white focus:border-gold outline-none"
                      >
                        {(() => {
                          const activeCustomFaculties = customFaculties.filter(f => !f.isDeleted);
                          const deletedStaticNames = customFaculties.filter(f => f.isDeleted).map(f => f.name);
                          return Array.from(new Set([...DEPARTMENTS.filter(d => !deletedStaticNames.includes(d)), ...activeCustomFaculties.map(f => f.name)]));
                        })().map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-text-3 uppercase tracking-widest mb-2 block">Level</label>
                      <select 
                        value={newCourse.level}
                        onChange={e => setNewCourse({ ...newCourse, level: e.target.value })}
                        className="w-full bg-navy border border-white/10 rounded-xl p-4 text-sm text-white focus:border-gold outline-none"
                      >
                        {(DEPARTMENT_STRUCTURE[newCourse.department]?.levels || ['100L', '200L', '300L', '400L', '500L', '600L']).map((l: string) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                 </div>
                 <button type="submit" className="w-full bg-gold text-navy py-4 rounded-xl font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-gold/20">
                   Execute Provisioning
                 </button>
               </form>
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
               className="fixed inset-0 bg-navy/80 backdrop-blur-md"
               onClick={() => setShowAddQuestion(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-2xl bg-[#161b2e] border border-gold/20 rounded-3xl p-10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
             >
               <h3 className="font-serif font-black text-2xl text-text-1 mb-2">
                  {editingQuestionId ? 'Revise Archive Query' : 'Query Entry Terminal'}
                </h3>
               <p className="text-[10px] text-gray-500 font-mono italic mb-8 uppercase tracking-[0.3em]">Institutional examination logic synchronization</p>
               
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
                     className="text-[9px] font-black text-gold uppercase tracking-widest bg-gold/10 px-4 py-2 rounded-lg border border-gold/20 hover:bg-gold/20 transition-all"
                   >
                     Auto-Translate to French
                   </button>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] font-black text-gold uppercase tracking-widest mb-3 block">Question Type</label>
                     <select 
                       value={newQuestion.type || 'objective'}
                       onChange={e => setNewQuestion({ ...newQuestion, type: e.target.value as 'objective' | 'application' })}
                       className="w-full bg-navy border border-white/10 rounded-xl p-4 text-[13px] text-white focus:border-gold outline-none"
                     >
                       <option value="objective">Objective (Multiple Choice)</option>
                       <option value="application">Application Question</option>
                     </select>
                   </div>
                   <div />
                 </div>
                 
                 <div>
                   <label className="text-[10px] font-black text-gold uppercase tracking-widest mb-3 block">Examination Query</label>
                   <textarea 
                    required
                    value={newQuestion.question}
                    onChange={e => setNewQuestion({ ...newQuestion, question: e.target.value })}
                    placeholder="Enter the examination question..."
                    className="w-full bg-navy border border-white/10 rounded-2xl p-6 text-[15px] text-white focus:border-gold outline-none min-h-[120px] resize-none"
                   />
                 </div>

                 {newQuestion.type === 'application' ? (
                   <div>
                     <label className="text-[10px] font-black text-gold uppercase tracking-widest mb-3 block">Expected Answer</label>
                     <textarea 
                      required
                      value={newQuestion.answerText}
                      onChange={e => setNewQuestion({ ...newQuestion, answerText: e.target.value })}
                      placeholder="Enter the expected answer logic here..."
                      className="w-full bg-navy border border-white/10 rounded-2xl p-4 text-sm text-emerald-400 focus:border-emerald-500 outline-none min-h-[100px] resize-none"
                     />
                   </div>
                 ) : (
                   <div className="grid gap-4">
                     <label className="text-[10px] font-black text-gold uppercase tracking-widest block">Response Options</label>
                     {newQuestion.options.map((opt, i) => (
                        <div key={i} className="flex gap-4">
                          <div 
                            className={cn(
                              "w-12 h-14 rounded-xl flex items-center justify-center font-mono font-black border transition-all cursor-pointer",
                              newQuestion.correctAnswer === i ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-white/5 border-white/10 text-gray-500"
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
                            className="flex-1 bg-navy border border-white/10 rounded-xl p-4 text-sm text-white focus:border-gold outline-none"
                          />
                       </div>
                     ))}
                   </div>
                 )}

                 {newQuestion.type !== 'application' && (
                   <div>
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest mb-3 block">Rational Explanation</label>
                      <textarea 
                        value={newQuestion.explanation}
                        onChange={e => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
                        placeholder="Enter the logical reason for the correct response..."
                        className="w-full bg-navy border border-white/10 rounded-2xl p-4 text-sm text-gray-400 focus:border-gold outline-none min-h-[80px] resize-none"
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
                      className="flex-1 bg-white/5 text-gray-500 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-white/10"
                    >
                      Abort
                    </button>
                    <button 
                      type="submit" 
                      className="flex-[2] bg-gold text-navy py-4 rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-gold/20 hover:scale-[1.02] active:scale-95 transition-all"
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
      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-10 shadow-2xl h-fit">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 bg-gold/10 rounded-xl flex items-center justify-center"><Bell className="w-6 h-6 text-gold" /></div>
           <h3 className="font-serif font-black text-xl text-white tracking-tight">Initiate Transmission</h3>
        </div>
        <form className="space-y-6" onSubmit={handleBroadcast}>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Protocol Header (Title)</label>
            <input 
              className="w-full bg-[#1c2236] border border-[#1e2540] rounded-xl px-5 py-4 text-[14px] outline-none focus:border-gold transition-all text-white placeholder-gray-600 font-medium" 
              placeholder="Announcement identifier..." 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Transmission Payload (Body)</label>
            <textarea 
              className="w-full bg-[#1c2236] border border-[#1e2540] rounded-xl px-5 py-4 text-[14px] outline-none h-40 focus:border-gold transition-all text-white placeholder-gray-600 font-medium resize-none leading-relaxed" 
              placeholder="Enter detailed institutional metadata..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            ></textarea>
          </div>
          
          <button 
            type="submit"
            disabled={sending}
            className="w-full bg-gold text-navy py-5 rounded-xl font-black text-[12px] uppercase tracking-[0.3em] shadow-2xl shadow-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {sending ? 'Transmitting...' : 'Broadcast Secure Protocol'}
          </button>
        </form>
      </div>

      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-8 py-6 border-b border-[#1e2540] font-serif font-black text-lg text-white">Transmission History Log</div>
        <div className="divide-y divide-[#1e2540] max-h-[600px] overflow-y-auto no-scrollbar">
           {notifs.length === 0 ? (
             <div className="p-32 text-center text-gray-700 italic font-medium">Clear communication log</div>
           ) : (
             notifs.map(n => (
               <div key={n.id} className="p-8 hover:bg-white/[0.01] transition-all group border-l-2 border-transparent hover:border-gold">
                 <div className="flex justify-between items-start mb-3">
                   <h4 className="font-black text-[15px] text-[#e8eaf0] group-hover:text-gold transition-colors tracking-tight">{n.title}</h4>
                   <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest bg-navy-high px-2 py-0.5 rounded border border-gold/5 shadow-sm">{format(new Date(n.createdAt), 'MMM dd, yyyy')}</span>
                 </div>
                 <p className="text-[13px] text-gray-500 line-clamp-3 leading-relaxed font-medium italic opacity-80">"{n.message}"</p>
                 <div className="mt-4 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest font-mono">SENT BY: SUPER ADMIN</span>
                    <button 
                      onClick={() => deleteNotification(n.id)}
                      className="text-[9px] font-black text-red-500/50 uppercase tracking-widest hover:text-red-500 transition-colors"
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
      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-10 shadow-2xl h-fit">
        <h3 className="font-serif font-black text-xl text-white mb-8 tracking-tight">Log Mental Framework</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Epistemological Text</label>
            <textarea 
              className="w-full bg-[#1c2236] border border-[#1e2540] rounded-xl px-5 py-4 text-[14px] outline-none h-48 focus:border-gold transition-all text-white font-medium resize-none leading-relaxed italic" 
              placeholder="Manifest scholarly wisdom into reality..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            ></textarea>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Intellectual Origin (Author)</label>
            <input 
              className="w-full bg-[#1c2236] border border-[#1e2540] rounded-xl px-5 py-4 text-[14px] outline-none focus:border-gold transition-all text-white font-medium" 
              placeholder="e.g. Aristotle, Nelson Mandela..."
              value={authorCredit}
              onChange={(e) => setAuthorCredit(e.target.value)}
            />
          </div>
          <button 
            onClick={handlePost}
            className="w-full bg-gold text-navy py-5 rounded-xl font-black text-[12px] uppercase tracking-[0.3em] shadow-2xl shadow-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Authenticate & Publish
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {quotes.length === 0 ? (
          <div className="text-center py-40 text-gray-700 italic border border-dashed border-[#1e2540] rounded-3xl">Platform awaits initial wisdom</div>
        ) : (
          quotes.map((q, i) => (
            <div key={i} className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-8 relative group hover:border-gold/30 transition-all shadow-xl">
              <Quote className="absolute bottom-6 right-6 w-16 h-16 text-gold/5 group-hover:text-gold/10 transition-all pointer-events-none" />
              <p className="text-[16px] italic leading-relaxed text-gray-300 font-serif mb-6 relative z-10 transition-colors group-hover:text-white">"{q.text}"</p>
              <div className="flex justify-between items-center relative z-10">
                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-gold/80 group-hover:text-gold transition-all">— {q.author}</span>
                <div className="flex items-center gap-4">
                   <span className="text-[9px] text-gray-600 font-mono italic opacity-0 group-hover:opacity-100 transition-all">{format(new Date(q.createdAt), 'yyyy.MM.dd')}</span>
                   <button onClick={() => deleteDoc(doc(db, 'quotes', q.id))} className="text-red-500/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-red-500/5 rounded-lg active:scale-90">
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
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
       setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
  }, []);

  useEffect(() => {
    if (selectedUser) {
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
      setReplyText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `chats/${selectedUser.id}/messages`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-180px)]">
      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="p-6 border-b border-[#1e2540] flex items-center justify-between">
           <h3 className="font-serif font-black text-lg uppercase tracking-tight">Active Threads</h3>
           <MessageCircle className="w-5 h-5 text-gold/40" />
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {users.map(u => (
            <button 
              key={u.id}
              onClick={() => setSelectedUser(u)}
              className={cn(
                "w-full p-6 text-left border-b border-[#1e2540] transition-all hover:bg-white/5 flex items-center gap-4 group",
                selectedUser?.id === u.id ? "bg-gold/5 border-l-4 border-l-gold" : ""
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-[#1c2236] flex items-center justify-center font-serif font-black text-gold border border-gold/10 group-hover:scale-110 transition-transform">
                {u.displayName?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden">
                <div className="font-bold text-[14px] truncate text-white">{u.displayName || 'Anonymous Scholar'}</div>
                <div className="text-[10px] text-gray-500 font-mono italic truncate">{u.department || 'General Faculty'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden flex flex-col shadow-2xl relative">
        {selectedUser ? (
          <>
            <div className="p-6 border-b border-[#1e2540] flex items-center gap-4 bg-navy-mid/40">
               <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold border border-gold/20 font-serif font-black">{selectedUser.displayName?.charAt(0)}</div>
               <div>
                  <h4 className="font-serif font-black text-white text-lg">{selectedUser.displayName}</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Active Archives</span>
                  </div>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 flex flex-col scrollbar-none">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-20 space-y-4">
                   <MessageCircle className="w-16 h-16" />
                   <p className="text-xs font-black uppercase tracking-widest">Secure session initialized</p>
                </div>
              ) : (
                messages.map((m, i) => {
                  const isAdmin = m.senderId === 'admin';
                  return (
                    <div key={i} className={cn("flex", isAdmin ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[70%] p-5 rounded-2xl text-[13.5px] leading-relaxed shadow-lg",
                        isAdmin 
                          ? "bg-gold text-navy rounded-tr-none font-bold" 
                          : "bg-[#1c2236] border border-gold/10 text-white rounded-tl-none"
                      )}>
                        {m.text}
                        <div className={cn(
                          "text-[8px] font-black uppercase tracking-widest mt-2 opacity-50",
                          isAdmin ? "text-navy" : "text-gold"
                        )}>
                          {m.createdAt ? format(new Date(m.createdAt), 'hh:mm a') : '...'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleReply} className="p-6 border-t border-[#1e2540] flex items-center gap-4">
              <input 
                type="text"
                placeholder="Institutional response..."
                className="flex-1 bg-[#1c2236] border border-[#1e2540] rounded-2xl px-6 py-4 text-sm focus:border-gold outline-none transition-all shadow-inner"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
              />
              <button 
                type="submit"
                disabled={!replyText.trim()}
                className="w-14 h-14 bg-gold text-navy rounded-2xl flex items-center justify-center hover:bg-gold-light active:scale-90 transition-all shadow-2xl shadow-gold/20 disabled:opacity-30 disabled:grayscale"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 opacity-20">
             <div className="w-24 h-24 bg-gold/5 rounded-full flex items-center justify-center border border-gold/10">
                <MessageCircle className="w-10 h-10 text-gold" />
             </div>
             <div className="text-center">
                <p className="font-serif font-black text-xl uppercase tracking-widest mb-2">Support Archives</p>
                <p className="text-[10px] uppercase font-black tracking-[0.3em]">Select a scholar to initiate secure communication</p>
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
        const response = await fetch('/api/payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: withdrawal.amount,
            accountNumber: withdrawal.bankDetails?.accountNumber,
            bankCode: withdrawal.bankDetails?.bankCode,
            accountName: withdrawal.bankDetails?.accountName,
            reference: `WD_${withdrawal.id}_${Date.now()}`,
            userId: withdrawal.userId
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

        alert('Withdrawal processed successfully via Paystack.');
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
    <div className="space-y-6">
      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Affiliate</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Bank Details</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Amount</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Status</th>
                <th className="px-6 py-5 text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2540]">
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-32 text-center text-gray-600 italic">No withdrawal requests found in archives</td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-white/[0.01] transition-all">
                    <td className="px-6 py-6">
                      <div className="text-[14px] font-bold text-white">{w.accountName || 'Unknown User'}</div>
                      <div className="text-[11px] text-gray-500 font-mono italic">{w.email || 'no-email'}</div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="text-[12px] font-bold text-gold">{w.bankDetails?.bankName}</div>
                      <div className="text-[11px] text-gray-500 font-mono tracking-widest">{w.bankDetails?.accountNumber}</div>
                      <div className="text-[9px] text-gray-600 uppercase font-black tracking-widest">{w.bankDetails?.accountName}</div>
                    </td>
                    <td className="px-6 py-6 text-[14.5px] font-black text-[#3ddba5] font-mono">₦{w.amount.toLocaleString()}</td>
                    <td className="px-6 py-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                        w.status === 'success' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                        w.status === 'failed' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        "bg-gold/10 text-gold border-gold/20"
                      )}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-6 py-6">
                      {w.status === 'pending' ? (
                        <button 
                          onClick={() => approveWithdrawal(w)}
                          disabled={loading === w.id}
                          className="bg-gold text-navy px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-gold/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                        >
                          {loading === w.id ? 'Processing...' : 'Approve payout'}
                        </button>
                      ) : (
                         <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest">
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
      <div className="w-12 h-12 border-4 border-gold/20 border-t-gold rounded-full animate-spin"></div>
      <div className="text-gold font-serif italic animate-pulse">Synchronizing institutional protocol...</div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-[#161b2e] border border-[#1e2540] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <ShieldAlert className="w-24 h-24 text-gold" />
        </div>
        
        <div className="relative z-10">
          <h2 className="font-serif font-black text-2xl mb-2 text-white uppercase tracking-tighter">System Protocol Configuration</h2>
          <p className="text-gray-500 text-[11px] mb-8 font-mono uppercase tracking-widest">Manage institutional social links and support channels.</p>

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Telegram Handle</label>
              <input 
                type="text" 
                placeholder="@telegram_handle"
                className="w-full bg-[#0a0c10] border border-[#1e2540] rounded-xl px-4 py-3.5 text-[14px] text-white focus:border-gold outline-none transition-all font-mono"
                value={formData.telegram}
                onChange={e => setFormData(prev => ({ ...prev, telegram: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">WhatsApp Interface</label>
              <input 
                type="text" 
                placeholder="+234..."
                className="w-full bg-[#0a0c10] border border-[#1e2540] rounded-xl px-4 py-3.5 text-[14px] text-white focus:border-gold outline-none transition-all font-mono"
                value={formData.whatsapp}
                onChange={e => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Support Email Archive</label>
              <input 
                type="email" 
                placeholder="support@institution.com"
                className="w-full bg-[#0a0c10] border border-[#1e2540] rounded-xl px-4 py-3.5 text-[14px] text-white focus:border-gold outline-none transition-all font-mono"
                value={formData.supportEmail}
                onChange={e => setFormData(prev => ({ ...prev, supportEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Twitter (X) Command</label>
              <input 
                type="text" 
                placeholder="@handle"
                className="w-full bg-[#0a0c10] border border-[#1e2540] rounded-xl px-4 py-3.5 text-[14px] text-white focus:border-gold outline-none transition-all font-mono"
                value={formData.twitter}
                onChange={e => setFormData(prev => ({ ...prev, twitter: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Facebook Network</label>
              <input 
                type="text" 
                placeholder="page_url"
                className="w-full bg-[#0a0c10] border border-[#1e2540] rounded-xl px-4 py-3.5 text-[14px] text-white focus:border-gold outline-none transition-all font-mono"
                value={formData.facebook}
                onChange={e => setFormData(prev => ({ ...prev, facebook: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Instagram Feed</label>
              <input 
                type="text" 
                placeholder="@instagram"
                className="w-full bg-[#0a0c10] border border-[#1e2540] rounded-xl px-4 py-3.5 text-[14px] text-white focus:border-gold outline-none transition-all font-mono"
                value={formData.instagram}
                onChange={e => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2 pt-4">
              <button 
                type="submit"
                disabled={saving}
                className="w-full bg-gold text-navy font-black py-4.5 rounded-xl text-[13px] uppercase tracking-[0.4em] shadow-2xl shadow-gold/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {saving ? 'UPDATING ARCHIVES...' : 'EXECUTE PROTOCOL UPDATE'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-500 font-bold text-[13px] mb-1 uppercase tracking-widest">Administrative Warning</h4>
            <p className="text-red-400/60 text-[11px] leading-relaxed font-mono">
              These links are visible to all authenticated scholars. Ensure all handles and URLs are verified before deployment to prevent systematic confusion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
