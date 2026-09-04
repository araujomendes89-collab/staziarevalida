import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Activity, ArrowLeft, ArrowRight } from "lucide-react";
import { useAppOptional } from "../../context/AppContext";
import { resolveOnboardingState } from "../../services/onboardingStateResolver";
import { OnboardingPersistenceService } from "../../services/onboardingPersistenceService";
import { OnboardingDirectionIllustration } from "./OnboardingDirectionIllustration";
import { OnboardingFinishContent } from "./OnboardingFinishContent";
import { TRANSITION_EASE } from "./motionTokens";

interface OnboardingFinishViewProps {
  onBack?: () => void;
  onComplete?: () => void;
}

export const OnboardingFinishView: React.FC<OnboardingFinishViewProps> = ({
  onBack,
  onComplete,
}) => {
  const navigate = useNavigate();
  const appContext = useAppOptional();
  const user = appContext?.user;
  const firebaseUser = appContext?.firebaseUser;
  const isGuestMode = appContext?.isGuestMode ?? false;
  const profileResolutionStatus = appContext?.profileResolutionStatus ?? "IDLE";
  const retryProfileResolution = appContext?.retryProfileResolution ?? (async () => {});
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handlePrev = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("/onboarding/progress-preview");
    }
  };

  const handleFinish = async () => {
    if (isCompleting) return;

    // Check if user is in persistent onboarding mode
    const isPersistentEligible =
      Boolean(user) &&
      Boolean(firebaseUser) &&
      !isGuestMode &&
      profileResolutionStatus === "READY" &&
      resolveOnboardingState(user).shouldOnboard;

    if (isPersistentEligible && user) {
      setIsCompleting(true);
      setError(null);
      const activeUid = user.id;

      try {
        const result = await OnboardingPersistenceService.completeOnboarding(activeUid);
        if (!isMountedRef.current) return;

        if (result.success) {
          // Sync profile in memory before final navigation
          await retryProfileResolution();
          if (!isMountedRef.current) return;

          if (onComplete) {
            onComplete();
          } else {
            navigate("/");
          }
        } else {
          setIsCompleting(false);
          if (
            result.code === "MISSING_PERSONALIZATION" ||
            result.code === "INVALID_PERSONALIZATION"
          ) {
            setError(
              "Não foi possível concluir sua configuração. Complete as etapas anteriores de personalização."
            );
          } else {
            setError("Não foi possível concluir o onboarding no momento. Tente novamente.");
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        setIsCompleting(false);
        setError("Não foi possível concluir o onboarding no momento. Tente novamente.");
      }
    } else {
      // Safe preview mode: do not write to Firestore, directly navigate
      if (onComplete) {
        onComplete();
      } else {
        navigate("/");
      }
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#06101E] text-slate-100 flex flex-col items-center justify-between overflow-x-hidden selection:bg-teal-500/20 selection:text-teal-200 py-6 px-4 sm:px-6 lg:px-8">
      {/* Ambient Lighting */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 50% 0%, rgba(20, 184, 166, 0.12), rgba(14, 165, 233, 0.05) 50%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      {/* Top Header Navigation */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex items-center justify-between">
        <button
          onClick={handlePrev}
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer min-h-[36px]"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
          <span>Voltar</span>
        </button>

        {/* Brand Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/50 shadow-sm backdrop-blur-xs">
          <div className="w-4 h-4 rounded bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
            <Activity className="w-2.5 h-2.5 text-teal-400" />
          </div>
          <span className="text-[11px] font-bold text-white tracking-tight">
            Stazia<span className="text-teal-400">Med</span>
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-600" />
          <span className="text-[9px] font-black text-teal-400 tracking-wider uppercase">
            PREPARAÇÃO
          </span>
        </div>

        <div className="w-16" aria-hidden="true" />
      </header>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center justify-center my-auto space-y-6 sm:space-y-8 py-4">
        {/* Direction Illustration */}
        <OnboardingDirectionIllustration />

        {/* Text Content */}
        <OnboardingFinishContent />

        {/* Error Feedback */}
        {error && (
          <div
            data-testid="finish-error-message"
            className="text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 text-center max-w-md mx-auto"
          >
            {error}
          </div>
        )}

        {/* Dominant Primary CTA */}
        <motion.div
          initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: isReduced ? 0 : 0.45, ease: TRANSITION_EASE, delay: 0.5 }}
          className="pt-2"
        >
          <button
            onClick={handleFinish}
            disabled={isCompleting}
            data-testid="finish-complete-cta"
            type="button"
            className={`group inline-flex items-center justify-center gap-2.5 px-9 py-4 text-base font-semibold text-white transition-all rounded-xl shadow-xl min-h-[52px] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 ${
              isCompleting
                ? "bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-75 shadow-none"
                : "bg-gradient-to-r from-teal-500 to-emerald-600 shadow-teal-500/25 hover:from-teal-400 hover:to-emerald-500 hover:shadow-teal-500/40 cursor-pointer"
            }`}
          >
            <span>{isCompleting ? "Finalizando..." : "Entrar na StaziaMed"}</span>
            {!isCompleting && (
              <ArrowRight className="w-4 h-4 text-teal-100 group-hover:translate-x-1 transition-transform" />
            )}
          </button>
        </motion.div>
      </main>

      {/* Bottom System Watermark */}
      <footer className="relative z-10 pt-4 pb-2 text-center text-xs text-slate-500 font-medium">
        StaziaMed Revalida • Preparação Médica Estruturada
      </footer>
    </div>
  );
};

export default OnboardingFinishView;
