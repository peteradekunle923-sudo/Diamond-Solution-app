import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { DiamondLogo } from '../components/DiamondLogo';

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
    const basePath = isSignUp ? '/register' : '/login';
    if (code) {
      navigate(`${basePath}?ref=${code}`);
    } else {
      navigate(basePath);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FE] text-slate-900 relative flex flex-col justify-center items-center px-4 py-12 md:py-20 diamond-mesh">
      {/* Language Toggle */}
      <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50 flex items-center gap-2 bg-white border border-[#DDE5F5] p-1.5 rounded-full shadow-md">
        <Globe className="w-4 h-4 text-[#1B3FA0] ml-2" />
        <button 
          onClick={() => setLanguage('en')}
          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer ${language === 'en' ? 'bg-[#1B3FA0] text-white shadow-md' : 'text-slate-500 hover:text-[#1B3FA0]'}`}
        >
          EN
        </button>
        <button 
          onClick={() => setLanguage('fr')}
          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer ${language === 'fr' ? 'bg-[#1B3FA0] text-white shadow-md' : 'text-slate-500 hover:text-[#1B3FA0]'}`}
        >
          FR
        </button>
      </div>

      {/* Background Ornaments */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] opacity-15" style={{ background: 'radial-gradient(circle, #1B3FA0 0%, transparent 60%)' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] opacity-10" style={{ background: 'radial-gradient(circle, #0B1E3D 0%, transparent 60%)' }} />
      </div>

      <div className="relative z-10 max-w-2xl w-full p-8 md:p-14 border border-[#DDE5F5] rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl shadow-[#0B1E3D]/5 animate-in fade-in zoom-in duration-700 my-auto">
        <div className="flex flex-col items-center text-center space-y-8">
          {/* Logo Section */}
          <div className="flex flex-col items-center">
            <DiamondLogo size={80} layout="vertical" showText={true} showTagline={true} />
          </div>

          <div className="w-full h-[1px] bg-[#DDE5F5]" />

          {/* Tagline */}
          <p className="text-base md:text-lg font-serif italic text-slate-600 leading-relaxed max-w-lg mx-auto">
            {t('splash.tagline')}
          </p>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 w-full bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl overflow-hidden divide-x divide-[#D4E0FC]">
            <StatSmall num="5+" label={t('splash.departments')} />
            <StatSmall num="15,000+" label={t('splash.questions')} />
            <StatSmall num="25%" label={t('splash.commission')} />
          </div>

          {/* Actions */}
          <div className="w-full space-y-3 pt-2">
            <button 
              onClick={() => handleNavigateToLogin(true)}
              className="w-full btn-primary py-4 text-xs tracking-[0.25em] uppercase font-black shadow-lg shadow-[#1B3FA0]/20"
            >
              💎 {t('splash.initiate')}
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
            <button 
              onClick={() => handleNavigateToLogin(false)}
              className="w-full btn-secondary py-4 text-xs tracking-[0.25em] uppercase font-black"
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
    <div className="py-3.5 px-2 space-y-1">
      <div className="text-lg md:text-xl font-serif font-black text-[#0A33CC]">{num}</div>
      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</div>
    </div>
  );
}
