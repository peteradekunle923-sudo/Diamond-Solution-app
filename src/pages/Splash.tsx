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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 relative flex flex-col justify-center items-center px-4 py-12 md:py-20">
      {/* Language Toggle */}
      <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50 flex items-center gap-2 bg-white border border-[#D8E3FF] p-1.5 rounded-full shadow-md">
        <Globe className="w-4 h-4 text-[#2563EB] ml-2" />
        <button 
          onClick={() => setLanguage('en')}
          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all ${language === 'en' ? 'bg-[#2563EB] text-white shadow-md' : 'text-slate-400 hover:text-[#2563EB]'}`}
        >
          EN
        </button>
        <button 
          onClick={() => setLanguage('fr')}
          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all ${language === 'fr' ? 'bg-[#2563EB] text-white shadow-md' : 'text-slate-400 hover:text-[#2563EB]'}`}
        >
          FR
        </button>
      </div>

      {/* FIXED Background Ornaments */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] opacity-20" style={{ background: 'radial-gradient(circle, #2563EB 0%, transparent 60%)' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] opacity-10" style={{ background: 'radial-gradient(circle, #2563EB 0%, transparent 60%)' }} />
      </div>

      <div className="relative z-10 max-w-2xl w-full p-8 md:p-16 border border-[#D8E3FF] rounded-3xl bg-white shadow-xl animate-in fade-in zoom-in duration-700 my-auto">
        <div className="flex flex-col items-center text-center space-y-10">
          {/* Logo Section */}
          <div className="flex flex-col items-center space-y-6">
            <div className="w-20 h-20 bg-[#2563EB] diamond-mark shadow-lg shadow-[#2563EB]/30 flex items-center justify-center transition-transform hover:rotate-12 duration-500">
              <Diamond className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tight text-slate-900">{t('splash.title')}</h1>
              <p className="text-slate-400 text-xs font-black uppercase tracking-[0.4em]">{t('splash.subtitle')}</p>
            </div>
          </div>

          <div className="w-full h-[1px] bg-[#D8E3FF]" />

          {/* Tagline */}
          <p className="text-lg md:text-xl font-serif italic text-slate-600 leading-relaxed max-w-lg mx-auto">
            {t('splash.tagline')}
          </p>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl overflow-hidden divide-x divide-[#D8E3FF]">
            <StatSmall num="5+" label={t('splash.departments')} />
            <StatSmall num="15,000+" label={t('splash.questions')} />
            <StatSmall num="25%" label={t('splash.commission')} />
          </div>

          {/* Actions */}
          <div className="w-full space-y-4 pt-4">
            <button 
              onClick={() => handleNavigateToLogin(true)}
              className="w-full bg-[#2563EB] text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-lg shadow-[#2563EB]/20 hover:bg-[#1d4ed8] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              💎 {t('splash.initiate')}
              <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleNavigateToLogin(false)}
              className="w-full bg-white border border-[#D8E3FF] text-[#2563EB] py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-[#EEF3FF] transition-all shadow-sm"
            >
              {t('splash.signin')}
            </button>
          </div>

          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
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
      <div className="text-lg md:text-xl font-serif font-black text-[#2563EB]">{num}</div>
      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
    </div>
  );
}
