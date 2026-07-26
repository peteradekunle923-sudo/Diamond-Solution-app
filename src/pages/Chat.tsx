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
import axios from 'axios';

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

      // Notify Admin via WhatsApp
      const idToken = await user.getIdToken();
      await axios.post('/api/whatsapp/notify-admin', {
        userId: user.uid,
        userName: profile?.displayName || user.displayName || 'Scholar',
        text
      }, {
        headers: { Authorization: `Bearer ${idToken}` }
      }).catch(err => console.error("WhatsApp notification failed:", err));

    } catch (err) {
      console.error("Chat error:", err);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-160px)] px-2">
        <header className="card-luxury p-6 flex items-center justify-between border border-[#D8E3FF] shadow-xs bg-white rounded-3xl mb-4">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-[#EEF3FF] rounded-2xl border border-[#D8E3FF] flex items-center justify-center text-[#2563EB] shadow-xs">
                <LifeBuoy className="w-6 h-6" />
             </div>
             <div className="space-y-0.5">
               <h2 className="font-serif font-black text-text-1 tracking-tight">{t('chat.title')}</h2>
               <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-xs" />
                   <span className="text-[9px] text-text-3 font-black uppercase tracking-[0.25em]">{t('chat.boardOnline')}</span>
               </div>
             </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl">
             <ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />
             <span className="text-[9px] font-black text-text-3 uppercase tracking-widest leading-none">{t('chat.security')}</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-none">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-30">
               <div className="w-24 h-24 bg-[#EEF3FF] rounded-3xl border border-[#D8E3FF] flex items-center justify-center animate-pulse">
                 <Diamond className="w-10 h-10 text-[#2563EB]" />
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
                  <div className={`max-w-[85%] space-y-1.5`}>
                    <div className={cn(
                      "px-6 py-4 rounded-3xl text-sm font-medium shadow-xs",
                      isAdminMsg 
                        ? 'bg-[#EEF3FF] border border-[#D8E3FF] text-text-1 rounded-tl-none' 
                        : 'bg-[#2563EB] text-white rounded-tr-none shadow-blue-500/10'
                    )}>
                      {msg.text}
                    </div>
                    <div className={cn(
                      "flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] opacity-50 px-2",
                      isAdminMsg ? "justify-start text-text-3" : "justify-end text-text-3"
                    )}>
                      {isAdminMsg && <span className="text-[#2563EB]">{t('chat.senderAdmin')}</span>}
                      <span>{msg.createdAt ? format(new Date(msg.createdAt), 'hh:mm a') : '...'}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-white border-t border-[#D8E3FF] mt-auto flex items-center gap-3">
          <div className="flex-1 relative">
            <input 
              type="text"
              placeholder={t('chat.placeholder')}
              className="w-full bg-[#EEF3FF] border border-[#D8E3FF] pl-6 pr-12 py-4 rounded-2xl text-sm font-medium focus:border-[#2563EB] outline-none transition-all text-text-1"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="w-12 h-12 bg-[#2563EB] text-white rounded-2xl flex items-center justify-center hover:bg-blue-600 active:scale-90 transition-all shadow-md shadow-blue-500/20 disabled:grayscale disabled:opacity-30 cursor-pointer"
          >
            <Send className="w-5 h-5 translate-x-0.5 -translate-y-0.5" />
          </button>
        </form>
      </div>
    </Layout>
  );
}
