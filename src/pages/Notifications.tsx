import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Bell, ShieldCheck, Mail, Trash2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  return (
    <Layout>
      <div className="px-6 py-12 space-y-12 max-w-4xl mx-auto">
        <header className="space-y-1">
          <h2 className="text-3xl font-serif font-black text-text-1 tracking-tight">Notification Archive</h2>
          <p className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em] leading-none">Institutional Communiqués</p>
        </header>

        {notifications.length === 0 && !loading ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card-luxury p-16 flex flex-col items-center justify-center text-center space-y-8 bg-navy-mid/40 border-dashed border-gold/20"
          >
            <div className="relative">
              <div className="w-24 h-24 bg-gold/5 rounded-full flex items-center justify-center border border-gold/10">
                <Bell className="w-10 h-10 text-gold/20" />
              </div>
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0 bg-gold/5 rounded-full blur-2xl"
              />
            </div>
            
            <div className="space-y-3">
              <p className="text-lg font-serif font-black text-text-1 tracking-tight">Archives Synchronized</p>
              <p className="text-[10px] text-text-3 font-black uppercase tracking-[0.3em] leading-loose max-w-[200px] mx-auto">
                Your institutional inbox is currently void of new protocols.
              </p>
            </div>

            <div className="pt-4 flex items-center gap-4 text-emerald-500 bg-emerald-500/5 px-6 py-3 rounded-2xl border border-emerald-500/10">
               <ShieldCheck className="w-4 h-4" />
               <span className="text-[9px] font-black uppercase tracking-widest leading-none">Security Status: Optimized</span>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {notifications.map((n) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={cn(
                    "card-luxury p-6 flex items-start gap-4 transition-all relative overflow-hidden group",
                    !n.read ? "border-gold/30 bg-gold/5" : "border-gold/10"
                  )}
                  onClick={() => !n.read && markAsRead(n.id)}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                    !n.read ? "bg-gold text-navy" : "bg-navy-high text-gold/40 border border-gold/10"
                  )}>
                    <Bell className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-serif font-black text-text-1 tracking-tight">{n.title}</h4>
                      <span className="text-[9px] font-black text-text-3 uppercase tracking-widest flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : 'Just now'}
                      </span>
                    </div>
                    <p className="text-sm text-text-2 leading-relaxed">{n.body || n.message}</p>
                    {!n.read && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-gold/20 text-gold text-[8px] font-black uppercase tracking-widest rounded">Unread Protocol</span>
                    )}
                  </div>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(n.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-text-3 hover:text-red-500 transition-all active:scale-90"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <section className="space-y-6 pt-12 border-t border-gold/10">
           <div className="flex items-center gap-4 px-2">
             <Mail className="w-4 h-4 text-gold/40" />
             <h3 className="text-[10px] font-black text-text-3 uppercase tracking-[0.4em]">Administrative Archives</h3>
           </div>
           <p className="text-[10px] font-mono text-text-3 italic px-2"> Institutional protocols are purged automatically after 30 days of inactivity.</p>
        </section>
      </div>
    </Layout>
  );
}

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
