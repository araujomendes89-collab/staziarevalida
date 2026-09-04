import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Activity, ArrowRight, ArrowLeft } from "lucide-react";
import { ECOSYSTEM_FEATURES, EcosystemFeatureItem } from "./ecosystemData";
import { EcosystemFeatureIllustration } from "./EcosystemFeatureIllustration";
import { EcosystemProgress } from "./EcosystemProgress";
import { createCarouselSlideVariant, TRANSITION_EASE } from "./motionTokens";

interface EcosystemCarouselProps {
  onBackToWelcome?: () => void;
  onComplete?: () => void;
  className?: string;
}

export const EcosystemCarousel: React.FC<EcosystemCarouselProps> = ({
  onBackToWelcome,
  onComplete,
  className = "",
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [direction, setDirection] = useState<number>(1);
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  const totalSteps = ECOSYSTEM_FEATURES.length;
  const currentFeature: EcosystemFeatureItem = ECOSYSTEM_FEATURES[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSteps - 1;

  const handleNext = () => {
    if (isLast) {
      if (onComplete) {
        onComplete();
      } else {
        console.log("[Onboarding Prototype] 'Quero experimentar' clicked (Prototype action).");
      }
    } else {
      setDirection(1);
      setCurrentIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    }
  };

  const handlePrev = () => {
    if (isFirst) {
      if (onBackToWelcome) {
        onBackToWelcome();
      }
    } else {
      setDirection(-1);
      setCurrentIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const slideVariant = createCarouselSlideVariant(isReduced);

  return (
    <div className={`w-full max-w-2xl mx-auto flex flex-col items-center select-none ${className}`}>
      {/* 1. Header with Brand & Progress */}
      <header className="w-full flex flex-col items-center space-y-4 mb-6">
        {/* Brand Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/50 shadow-sm backdrop-blur-xs">
          <div className="w-4 h-4 rounded bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
            <Activity className="w-2.5 h-2.5 text-teal-400" />
          </div>
          <span className="text-[11px] font-bold text-white tracking-tight">
            Stazia<span className="text-teal-400">Med</span>
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-600" />
          <span className="text-[9px] font-black text-teal-400 tracking-wider uppercase">
            ECOSSISTEMA
          </span>
        </div>

        {/* Segmented Progress */}
        <EcosystemProgress currentStep={currentIndex + 1} totalSteps={totalSteps} />

        {/* Headline & Subheadline */}
        <div className="text-center px-4 space-y-1.5">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white">
            Tudo organizado para você saber o que estudar.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto font-normal">
            Conheça as ferramentas que vão acompanhar sua preparação para o Revalida.
          </p>
        </div>
      </header>

      {/* 2. Central Active Feature Stage with Directional Transitions */}
      <div className="w-full relative min-h-[360px] sm:min-h-[380px] flex items-center justify-center overflow-hidden px-2">
        <AnimatePresence custom={direction} mode="popLayout" initial={false}>
          <motion.div
            key={currentFeature.id}
            custom={direction}
            variants={slideVariant}
            initial="enter"
            animate="center"
            exit="exit"
            className="w-full flex flex-col items-center text-center space-y-5"
          >
            {/* Dedicated SVG Illustration */}
            <div className="w-full">
              <EcosystemFeatureIllustration type={currentFeature.illustrationType} />
            </div>

            {/* Feature Content Info */}
            <div className="space-y-2 max-w-md mx-auto px-4">
              <div className="inline-block px-2.5 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/20 text-[11px] font-bold text-teal-400 tracking-wide uppercase">
                {currentFeature.badgeLabel}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {currentFeature.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {currentFeature.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. Navigation Controls */}
      <footer className="w-full max-w-md mx-auto mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4 px-4">
        {/* Back Button */}
        <button
          onClick={handlePrev}
          type="button"
          aria-label={isFirst ? "Voltar para o início" : "Voltar para recurso anterior"}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400" />
          <span>Voltar</span>
        </button>

        {/* Step Indicator Bullets */}
        <div className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
          {ECOSYSTEM_FEATURES.map((feat, idx) => (
            <button
              key={`dot-${feat.id}`}
              onClick={() => {
                setDirection(idx > currentIndex ? 1 : -1);
                setCurrentIndex(idx);
              }}
              aria-label={`Ir para ${feat.title}`}
              className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                idx === currentIndex
                  ? "w-5 bg-teal-400"
                  : "bg-slate-700 hover:bg-slate-600"
              }`}
            />
          ))}
        </div>

        {/* Next / Primary Action Button */}
        <button
          onClick={handleNext}
          type="button"
          aria-label={isLast ? "Quero experimentar" : "Continuar para próximo recurso"}
          className={`group inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white transition-all rounded-xl shadow-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 min-h-[44px] cursor-pointer ${
            isLast
              ? "bg-gradient-to-r from-teal-500 to-emerald-600 shadow-teal-500/25 hover:from-teal-400 hover:to-emerald-500 hover:shadow-teal-500/40"
              : "bg-teal-600 hover:bg-teal-500 shadow-teal-600/20"
          }`}
        >
          <span>{isLast ? "Quero experimentar" : "Continuar"}</span>
          <ArrowRight className="w-4 h-4 text-teal-100 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </footer>
    </div>
  );
};
