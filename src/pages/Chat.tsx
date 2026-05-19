import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, limit, setDoc, doc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { Send, LifeBuoy, Diamond, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';

export default function Chat() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && messages.length > 0) {
      // Reset unread count when messages change (user is active in chat)
      setDoc(doc(db, 'chats', user.uid), { unreadCount: 0 }, { merge: true })
        .catch(err => console.error("Error resetting unread count:", err));
    }
  }, [user, messages.length]);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'chats', user.uid, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(50)
      );

      return onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }, (err) => handleFirestoreError(err, OperationType.LIST, `chats/${user.uid}/messages`));
    }
  }, [user]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;

    const text = inputText;
    setInputText('');

    try {
      // Ensure the parent chat document exists so it shows up in admin list
      await setDoc(doc(db, 'chats', user.uid), {
        lastMessageAt: new Date().toISOString(),
        userId: user.uid,
        userName: profile?.displayName || user.displayName || 'Scholar',
        adminUnreadCount: increment(1)
      }, { merge: true });

      await addDoc(collection(db, 'chats', user.uid, 'messages'), {
        senderId: user.uid,
        text,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Chat error:", err);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-160px)] px-2">
        <header className="card-luxury p-6 flex items-center justify-between border-gold/20 shadow-2xl bg-navy-mid/60 backdrop-blur-xl mb-4">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-gold/10 rounded-2xl border border-gold/20 flex items-center justify-center text-gold shadow-lg shadow-gold/5">
                <LifeBuoy className="w-6 h-6" />
             </div>
             <div className="space-y-0.5">
               <h2 className="font-serif font-black text-text-1 tracking-tight">{t('chat.title')}</h2>
               <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                   <span className="text-[9px] text-text-3 font-black uppercase tracking-[0.25em]">{t('chat.boardOnline')}</span>
               </div>
             </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-navy-high border border-gold/10 rounded-xl">
             <ShieldCheck className="w-3.5 h-3.5 text-gold-light" />
             <span className="text-[9px] font-black text-text-3 uppercase tracking-widest leading-none">{t('chat.security')}</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-none">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-30">
               <div className="w-24 h-24 bg-gold/5 diamond-mark flex items-center justify-center animate-pulse">
                 <Diamond className="w-10 h-10 text-gold" />
               </div>
               <div className="space-y-2">
                 <p className="text-sm font-serif font-black text-text-1 uppercase tracking-widest leading-loose">{t('chat.channelEstablished')}</p>
                 <p className="text-[10px] text-text-3 font-black uppercase tracking-[0.3em]">{t('chat.queriesSync')}</p>
               </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isAdminMsg = msg.senderId !== user?.uid;
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id} 
                  className={`flex ${isAdminMsg ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[85%] space-y-2`}>
                    <div className={cn(
                      "px-6 py-4 rounded-[1.5rem] text-sm font-medium shadow-xl",
                      isAdminMsg 
                        ? 'bg-navy-high border border-gold/15 text-text-1 rounded-tl-none ring-1 ring-gold/5' 
                        : 'bg-gold text-navy rounded-tr-none shadow-gold/10'
                    )}>
                      {msg.text}
                    </div>
                    <div className={cn(
                      "flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] opacity-40 px-2",
                      isAdminMsg ? "justify-start" : "justify-end"
                    )}>
                      {isAdminMsg && <span className="text-gold">{t('chat.senderAdmin')}</span>}
                      <span>{msg.createdAt ? format(new Date(msg.createdAt), 'hh:mm a') : '...'}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-navy-mid/40 border-t border-gold/10 mt-auto flex items-center gap-4">
          <div className="flex-1 relative">
            <input 
              type="text"
              placeholder={t('chat.placeholder')}
              className="w-full bg-navy-high border border-gold/10 pl-6 pr-12 py-5 rounded-3xl text-sm font-medium focus:border-gold outline-none transition-all shadow-inner"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="w-14 h-14 bg-gold text-navy rounded-2xl flex items-center justify-center hover:bg-gold-light active:scale-90 transition-all shadow-2xl shadow-gold/20 disabled:grayscale disabled:opacity-30"
          >
            <Send className="w-6 h-6 translate-x-0.5 -translate-y-0.5" />
          </button>
        </form>
      </div>
    </Layout>
  );
}
