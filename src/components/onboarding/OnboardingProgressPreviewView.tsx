import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Activity, ArrowLeft, ArrowRight, Sparkles, Target, HelpCircle } from "lucide-react";
import { ProgressPreviewLocationState } from "./progressPreviewTypes";
import { ProgressPreviewAreaCard } from "./ProgressPreviewAreaCard";
import { ProgressPreviewEvolution } from "./ProgressPreviewEvolution";
import { ProgressPreviewReviews } from "./ProgressPreviewReviews";
import { MEDICAL_AREAS_OPTIONS } from "./personalizationSteps";
import { TRANSITION_EASE } from "./motionTokens";

interface OnboardingProgressPreviewViewProps {
  onBack?: () => void;
  onContinue?: () => void;
}

export const OnboardingProgressPreviewView: React.FC<OnboardingProgressPreviewViewProps> = ({
  onBack,
  onContinue,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  // Safe extraction of ephemeral state
  const state = (location.state as ProgressPreviewLocationState) || {};
  const { selfReportedWeakAreas = [], dontKnowWeakAreas = false } = state;

  const handlePrev = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("/onboarding/personalize");
    }
  };

  const handleNext = () => {
    if (onContinue) {
      onContinue();
    } else {
      navigate("/onboarding/finish");
    }
  };

  // Resolve area labels and colors for self-reported weak areas
  const reportedAreas = selfReportedWeakAreas
    .map((id) => MEDICAL_AREAS_OPTIONS.find((a) => a.id === id))
    .filter(Boolean);

  return (
    <div className="relative min-h-screen w-full bg-[#06101E] text-slate-100 flex flex-col items-center justify-start overflow-x-hidden selection:bg-teal-500/20 selection:text-teal-200 py-8 px-4 sm:px-6 lg:px-8">
      {/* Ambient Background Glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 50% 0%, rgba(20, 184, 166, 0.12), rgba(14, 165, 233, 0.05) 50%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col space-y-6 my-auto">
        {/* Top Header Navigation & Badges */}
        <header className="w-full flex items-center justify-between">
          <button
            onClick={handlePrev}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer min-h-[36px]"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
            <span>Voltar</span>
          </button>

          {/* Central Brand & Preview Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/50 shadow-sm backdrop-blur-xs">
            <div className="w-4 h-4 rounded bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
              <Activity className="w-2.5 h-2.5 text-teal-400" />
            </div>
            <span className="text-[11px] font-bold text-white tracking-tight">
              Stazia<span className="text-teal-400">Med</span>
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-600" />
            <span className="text-[9px] font-black text-teal-400 tracking-wider uppercase">
              PRÉVIA
            </span>
          </div>

          {/* Discrete Preview Label */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-950/60 border border-teal-500/30 text-[10px] font-semibold text-teal-300">
            <Sparkles className="w-3 h-3 text-teal-400" />
            <span>Prévia do seu acompanhamento</span>
          </div>
        </header>

        {/* Hero Section */}
        <motion.div
          initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
          className="text-center space-y-2 max-w-2xl mx-auto pt-2"
        >
          {/* Mobile Preview Badge */}
          <div className="sm:hidden inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-950/60 border border-teal-500/30 text-[10px] font-semibold text-teal-300 mb-1">
            <Sparkles className="w-3 h-3 text-teal-400" />
            <span>Prévia do seu acompanhamento</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Acompanhe sua evolução de verdade.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto">
            À medida que você estuda, a StaziaMed organiza seu histórico para mostrar onde você avançou e o que ainda precisa revisar.
          </p>
        </motion.div>

        {/* Contextual Self-Report Banner (Autopercepção) */}
        {reportedAreas.length > 0 && !dontKnowWeakAreas && (
          <motion.div
            initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: isReduced ? 0 : 0.35, ease: TRANSITION_EASE, delay: 0.05 }}
            className="w-full bg-[#0B1A30]/80 border border-teal-500/30 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
          >
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <Target className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-200">
                  Você indicou que quer dar mais atenção a:
                </span>
                <span className="text-xs text-slate-400 ml-1 sm:inline block">
                  (com base na sua percepção inicial)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
              {reportedAreas.map((area) => (
                <span
                  key={area!.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#132644] border border-slate-700 text-white shadow-xs"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: area!.color }}
                    aria-hidden="true"
                  />
                  <span>{area!.label}</span>
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {dontKnowWeakAreas && (
          <motion.div
            initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: isReduced ? 0 : 0.35, ease: TRANSITION_EASE, delay: 0.05 }}
            className="w-full bg-[#0B1A30]/80 border border-slate-700/60 rounded-xl p-3.5 sm:p-4 flex items-center gap-3 shadow-md"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4 text-teal-400" />
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Tudo bem. Conforme você pratica, seu desempenho real vai ajudar a identificar onde vale concentrar mais atenção.
            </p>
          </motion.div>
        )}

        {/* Main 3 Blocks Composition */}
        <main className="w-full grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
          {/* Left Column (Desktop 7 cols): Evolution + Spaced Reviews */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <ProgressPreviewEvolution />
            <ProgressPreviewReviews />
          </div>

          {/* Right Column (Desktop 5 cols): Area Performance */}
          <div className="lg:col-span-5 flex flex-col">
            <ProgressPreviewAreaCard className="h-full" />
          </div>
        </main>

        {/* Action Footer */}
        <div className="w-full flex items-center justify-end pt-4 border-t border-slate-800/60">
          <button
            onClick={handleNext}
            type="button"
            className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white transition-all bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl shadow-lg shadow-teal-500/20 hover:from-teal-400 hover:to-emerald-500 hover:shadow-teal-500/35 cursor-pointer min-h-[48px] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <span>Continuar</span>
            <ArrowRight className="w-4 h-4 text-teal-100 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* System Watermark */}
        <footer className="pt-2 pb-4 text-center text-xs text-slate-500 font-medium">
          StaziaMed Revalida • Prévia de Acompanhamento
        </footer>
      </div>
    </div>
  );
};

export default OnboardingProgressPreviewView;
