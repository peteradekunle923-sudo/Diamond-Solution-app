import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Diamond, ArrowRight, Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Splash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language, setLanguage } = useLanguage();

  const refCode = searchParams.get('ref');

  React.useEffect(() => {
    if (refCode) {
      sessionStorage.setItem('referralCode', refCode);
    }
  }, [refCode]);

  const handleNavigateToLogin = (isSignUp: boolean = false) => {
    const code = refCode || sessionStorage.getItem('referralCode');
    const mode = isSignUp ? 'signup' : 'login';
    if (code) {
      navigate(`/login?ref=${code}&mode=${mode}`);
    } else {
      navigate(`/login?mode=${mode}`);
    }
  };

  return (
    <div className="min-h-screen bg-navy text-text-1 relative flex flex-col justify-center items-center px-4 py-12 md:py-20">
      {/* Language Toggle */}
      <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50 flex items-center gap-2 bg-navy-card border border-gold/10 p-1.5 rounded-full shadow-lg">
        <Globe className="w-4 h-4 text-gold ml-2" />
        <button 
          onClick={() => setLanguage('en')}
          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all ${language === 'en' ? 'bg-gold text-navy shadow-lg shadow-gold/20' : 'text-text-3 hover:text-gold'}`}
        >
          EN
        </button>
        <button 
          onClick={() => setLanguage('fr')}
          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all ${language === 'fr' ? 'bg-gold text-navy shadow-lg shadow-gold/20' : 'text-text-3 hover:text-gold'}`}
        >
          FR
        </button>
      </div>

      {/* FIXED Background Ornaments to avoid resizing glitches on mobile */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] opacity-10" style={{ background: 'radial-gradient(circle, var(--color-gold) 0%, transparent 60%)' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] opacity-5" style={{ background: 'radial-gradient(circle, var(--color-gold) 0%, transparent 60%)' }} />
      </div>

      <div className="relative z-10 max-w-2xl w-full p-8 md:p-16 border border-gold/15 rounded-3xl bg-navy-card shadow-2xl animate-in fade-in zoom-in duration-700 my-auto">
        <div className="flex flex-col items-center text-center space-y-10">
          {/* Logo Section */}
          <div className="flex flex-col items-center space-y-6">
            <div className="w-20 h-20 bg-gold diamond-mark drop-shadow-[0_0_25px_rgba(201,147,10,0.6)] flex items-center justify-center transition-transform hover:rotate-12 duration-500">
              <Diamond className="w-10 h-10 text-navy" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tight text-text-1">{t('splash.title')}</h1>
              <p className="text-text-3 text-xs font-black uppercase tracking-[0.4em] opacity-80">{t('splash.subtitle')}</p>
            </div>
          </div>

          <div className="w-full h-[1px] bg-gold/10" />

          {/* Tagline */}
          <p className="text-lg md:text-xl font-serif italic text-text-2 leading-relaxed max-w-lg mx-auto">
            {t('splash.tagline')}
          </p>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 w-full bg-navy border border-gold/10 rounded-2xl overflow-hidden divide-x divide-gold/10">
            <StatSmall num="5+" label={t('splash.departments')} />
            <StatSmall num="15,000+" label={t('splash.questions')} />
            <StatSmall num="25%" label={t('splash.commission')} />
          </div>

          {/* Actions */}
          <div className="w-full space-y-4 pt-4">
            <button 
              onClick={() => handleNavigateToLogin(true)}
              className="w-full bg-gold text-navy py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              💎 {t('splash.initiate')}
              <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleNavigateToLogin(false)}
              className="w-full bg-navy-high border border-gold/20 text-gold py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-gold/5 transition-all"
            >
              {t('splash.signin')}
            </button>
          </div>

          <p className="text-[9px] font-black text-text-3 uppercase tracking-[0.2em] opacity-50">
            {t('splash.professional')}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatSmall({ num, label }: { num: string, label: string }) {
  return (
    <div className="py-4 px-2 space-y-1">
      <div className="text-lg md:text-xl font-serif font-black text-gold-light">{num}</div>
      <div className="text-[9px] font-black text-text-3 uppercase tracking-widest">{label}</div>
    </div>
  );
}
