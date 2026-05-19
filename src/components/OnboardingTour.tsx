import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, ArrowLeft, Trophy, Target, BookOpen, GraduationCap, Sparkles, ShieldCheck, Diamond } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TourStep {
  title: string;
  description: string;
  icon: any;
  color: string;
  accent: string;
}

export default function OnboardingTour() {
  const { profile, user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [hasFinishedSession, setHasFinishedSession] = useState(sessionStorage.getItem('diamond_onboard_shown') === 'true');
  const [step, setStep] = useState(0);
  const { t } = useLanguage();

  useEffect(() => {
    // Show on every new session (once per tab session)
    if (profile && !isVisible && !hasFinishedSession) {
      const timer = setTimeout(() => setIsVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, [profile, isVisible, hasFinishedSession]);

  const steps: TourStep[] = [
    {
      title: "Welcome to the Elite Circle",
      description: "You've successfully integrated into the Diamond Solution protocol. Prepare to redefine your clinical mastery.",
      icon: GraduationCap,
      color: "from-gold/20 to-gold/5",
      accent: "text-gold"
    },
    {
      title: "The 50-Question Protocol",
      description: "Top-tier scholars maintain a daily regimen of 50 targeted questions. Consistency is the foundation of excellence.",
      icon: Target,
      color: "from-emerald-500/20 to-emerald-500/5",
      accent: "text-emerald-400"
    },
    {
      title: "Asset Redistribution ($DL)",
      description: "Excel in your assessments to accumulate $DL. These institutional assets can be redistributed for exclusive benefits.",
      icon: Sparkles,
      color: "from-amber-500/20 to-amber-500/5",
      accent: "text-amber-400"
    },
    {
      title: "Institutional Leaderboard",
      description: "Climb the hierarchy of scholars. Your clinical accuracy is your primary credential for status in the Diamond archives.",
      icon: Trophy,
      color: "from-blue-500/20 to-blue-500/5",
      accent: "text-blue-400"
    },
    {
      title: "Secure Support Channels",
      description: "Should you encounter any systemic anomalies, our administrative support is available via secure institutional chat.",
      icon: ShieldCheck,
      color: "from-purple-500/20 to-purple-500/5",
      accent: "text-purple-400"
    }
  ];

  const handleFinish = () => {
    setIsVisible(false);
    setHasFinishedSession(true);
    sessionStorage.setItem('diamond_onboard_shown', 'true');
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      handleFinish();
    }
  };

  const currentStepData = steps[step];
  const Icon = currentStepData.icon;

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-navy/95 backdrop-blur-xl">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 30 }}
          className="relative w-full max-w-xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[48px] border border-gold/20 bg-[#0c0f1a]"
        >
          {/* Animated Background Gradients */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-b ${currentStepData.color} transition-colors duration-1000 opacity-30`} />
            <motion.div 
              animate={{ 
                rotate: [0, 360],
                scale: [1, 1.2, 1]
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -top-1/2 -right-1/2 w-[600px] h-[600px] bg-gold/5 rounded-full blur-[120px]" 
            />
            <motion.div 
              animate={{ 
                rotate: [360, 0],
                scale: [1, 1.3, 1]
              }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute -bottom-1/2 -left-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px]" 
            />
          </div>

          <div className="relative z-10 w-full flex flex-col h-full min-h-[500px]">
            {/* Top Branding */}
            <div className="pt-12 pb-8 px-12 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 diamond-gradient flex items-center justify-center p-1.5 shadow-lg shadow-gold/20 rotate-45">
                   <Diamond className="w-full h-full text-navy -rotate-45" />
                </div>
                <span className="font-serif font-black text-white uppercase tracking-tighter text-sm">Diamond Solution</span>
              </div>
              <div className="text-[10px] font-black text-gold/40 uppercase tracking-[0.4em]">Protocol Version 3.1</div>
            </div>

            {/* Icon Display */}
            <div className="px-12 flex flex-col items-center justify-center flex-1 py-4">
              <motion.div
                key={step}
                initial={{ scale: 0.5, rotate: -15, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                whileHover={{ scale: 1.1, rotate: 5 }}
                className={cn("w-32 h-32 rounded-[2.5rem] bg-navy-mid/60 border border-gold/10 flex items-center justify-center shadow-2xl relative group", currentStepData.accent)}
              >
                <div className="absolute inset-0 bg-current opacity-5 blur-2xl rounded-full" />
                <Icon className="w-14 h-14 relative z-10 drop-shadow-[0_0_15px_currentColor]" />
              </motion.div>

              <div className="mt-12 text-center space-y-6 max-w-sm mx-auto">
                <div className="flex justify-center gap-2 mb-2">
                  {steps.map((_, i) => (
                    <div key={i} className={cn(
                      "h-1 rounded-full transition-all duration-500",
                      i === step ? "w-10 bg-gold shadow-[0_0_10px_rgba(240,192,64,0.5)]" : (i < step ? "w-3 bg-gold/40" : "w-1.5 bg-white/10")
                    )} />
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "circOut" }}
                    className="space-y-4"
                  >
                    <h2 className="text-3xl font-serif font-black text-white leading-tight">{currentStepData.title}</h2>
                    <p className="text-gray-400 leading-relaxed font-medium text-sm px-4">{currentStepData.description}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Actions */}
            <div className="p-12 pt-8 flex items-center justify-between border-t border-white/5 bg-white/[0.02]">
              <button 
                onClick={handleFinish}
                className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] hover:text-white transition-colors"
              >
                Skip Induction
              </button>
              
              <div className="flex gap-4">
                {step > 0 && (
                  <button 
                    onClick={() => setStep(s => s - 1)}
                    className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-95"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={handleNext}
                  className="px-10 py-5 rounded-2xl bg-gold text-navy font-black text-[11px] uppercase tracking-[0.2em] flex items-center gap-3 hover:bg-gold-light active:scale-95 transition-all shadow-2xl shadow-gold/20"
                >
                  {step === steps.length - 1 ? "Initiate Study" : "Next Segment"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <button 
            onClick={handleFinish}
            className="absolute top-10 right-10 z-20 w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all border border-white/5 backdrop-blur-sm"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
