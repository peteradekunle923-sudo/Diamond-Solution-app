import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, ArrowLeft, Trophy, Target, BookOpen, GraduationCap, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TourStep {
  title: string;
  description: string;
  icon: any;
  color: string;
}

export default function OnboardingTour() {
  const { profile, user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [hasFinishedSession, setHasFinishedSession] = useState(false);
  const [step, setStep] = useState(0);
  const { t } = useLanguage();

  useEffect(() => {
    // Show once per session
    if (profile && !isVisible && !hasFinishedSession) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [profile, isVisible, hasFinishedSession]);

  const steps: TourStep[] = [
    {
      title: "Welcome to Diamond Solution",
      description: "You've just joined the most elite circle of clinical excellence. Let's show you how to master your exams.",
      icon: GraduationCap,
      color: "bg-gold/80 text-black"
    },
    {
      title: "Daily Practice Goal",
      description: "Aim for at least 50 questions every day. This consistency is what separates the average from the top 1%.",
      icon: Target,
      color: "bg-emerald-500/80 text-white"
    },
    {
      title: "Earn $DL (Diamond Links)",
      description: "Excel in your studies and refer colleagues to earn $DL. Convert them to real currency when you reach your milestones.",
      icon: Sparkles,
      color: "bg-amber-500/80 text-white"
    },
    {
      title: "Hall of Fame",
      description: "Monitor the Leaderboards and challenge the top scholars. Clinical accuracy is your passport to the leaderboard.",
      icon: Trophy,
      color: "bg-blue-500/80 text-white"
    },
    {
      title: "Your Journey Starts Now",
      description: "Explore your courses, track your progress, and reach out to support if you need guidance.",
      icon: BookOpen,
      color: "bg-purple-500/80 text-white"
    }
  ];

  const handleFinish = async () => {
    setIsVisible(false); // Hide immediately
    setHasFinishedSession(true); // Don't show again this session
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          hasSeenTour: true
        });
      } catch (err) {
        console.error("Failed to update tour status:", err);
      }
    }
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
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-[40px] border border-white/10"
        >
          {/* Background Image */}
          <div 
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ 
              backgroundImage: 'url("/tour-bg.jpg")' 
            }}
          />
          {/* Overlay to ensure text is readable */}
          <div className="absolute inset-0 z-0 bg-[#0a0c14]/80 backdrop-blur-[2px]" />

          <div className="relative z-10 w-full h-full flex flex-col">
            {/* Header Graphic */}
            <div className={cn("h-48 flex items-center justify-center relative overflow-hidden transition-colors duration-500", currentStepData.color)}>
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white rounded-full blur-[100px]" />
              </div>
              <motion.div
                key={step}
                initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 10 }}
              >
                <Icon className="w-24 h-24" />
              </motion.div>
            </div>

            <div className="p-10 pt-12">
              <div className="flex gap-2 mb-6">
                {steps.map((_, i) => (
                  <div key={i} className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step ? "w-8 bg-gold" : (i < step ? "w-4 bg-gold/30" : "w-1.5 bg-white/10")
                  )} />
                ))}
              </div>

              <motion.div
                key={step}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                className="space-y-4"
              >
                <h2 className="text-3xl font-black text-white leading-tight drop-shadow-md">{currentStepData.title}</h2>
                <p className="text-gray-300 leading-relaxed font-medium drop-shadow-sm">{currentStepData.description}</p>
              </motion.div>

              <div className="mt-12 flex items-center justify-between">
                <button 
                  onClick={handleFinish}
                  className="text-sm font-bold text-gray-300 hover:text-white transition-colors drop-shadow-sm"
                >
                  Skip Tour
                </button>
                
                <div className="flex gap-4">
                  {step > 0 && (
                    <button 
                      onClick={() => setStep(s => s - 1)}
                      className="p-4 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/20 transition-colors backdrop-blur-md"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={handleNext}
                    className="px-8 py-4 rounded-2xl bg-gold text-black font-black text-sm flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-gold/20"
                  >
                    {step === steps.length - 1 ? "Let's Begin" : "Next Milestone"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={handleFinish}
            className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors backdrop-blur-md"
          >
            <X className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
