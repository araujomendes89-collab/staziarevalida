import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, BookOpen, Layers, RotateCcw } from "lucide-react";
import { TRANSITION_EASE } from "./motionTokens";

interface OnboardingFinishContentProps {
  className?: string;
}

export const OnboardingFinishContent: React.FC<OnboardingFinishContentProps> = ({
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  return (
    <div className={`text-center space-y-4 max-w-2xl mx-auto ${className}`}>
      {/* Badge */}
      <motion.div
        initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE, delay: 0.1 }}
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 shadow-xs"
      >
        <Sparkles className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs font-semibold text-teal-300">
          Preparação Estruturada
        </span>
      </motion.div>

      {/* Headlines */}
      <motion.div
        initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: isReduced ? 0 : 0.45, ease: TRANSITION_EASE, delay: 0.2 }}
        className="space-y-1.5"
      >
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Tudo certo.
        </h1>
        <p className="text-lg sm:text-xl font-semibold text-slate-200">
          Agora a StaziaMed pode começar a organizar sua preparação.
        </p>
      </motion.div>

      {/* Subheadline */}
      <motion.p
        initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: isReduced ? 0 : 0.45, ease: TRANSITION_EASE, delay: 0.3 }}
        className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto"
      >
        Estudo, prática e revisão podem trabalhar juntos em uma rotina feita para acompanhar sua preparação ao longo do Revalida.
      </motion.p>

      {/* Three Pillars Micro-pills */}
      <motion.div
        initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE, delay: 0.4 }}
        className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-300"
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B1A30]/80 border border-slate-700/60 shadow-xs">
          <BookOpen className="w-3.5 h-3.5 text-sky-400" />
          <span>Estudo orientado</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B1A30]/80 border border-slate-700/60 shadow-xs">
          <Layers className="w-3.5 h-3.5 text-teal-400" />
          <span>Prática ativa de questões</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B1A30]/80 border border-slate-700/60 shadow-xs">
          <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
          <span>Revisões no momento certo</span>
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingFinishContent;
