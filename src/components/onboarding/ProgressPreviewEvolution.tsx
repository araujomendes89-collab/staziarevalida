import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { TrendingUp, Sparkles } from "lucide-react";
import { TRANSITION_EASE } from "./motionTokens";

interface ProgressPreviewEvolutionProps {
  className?: string;
}

export const ProgressPreviewEvolution: React.FC<ProgressPreviewEvolutionProps> = ({
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  return (
    <motion.section
      initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE, delay: 0.15 }}
      className={`bg-[#0B192C]/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between ${className}`}
      aria-labelledby="evolution-preview-title"
    >
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800/80">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <h2 id="evolution-preview-title" className="text-base font-bold text-white tracking-tight">
              Sua evolução ao longo do tempo
            </h2>
            <p className="text-xs text-slate-400">
              Seu histórico começa a ser construído conforme você pratica.
            </p>
          </div>
        </div>

        {/* Abstract SVG Graphic Concept */}
        <div className="relative mt-5 w-full h-44 sm:h-48 bg-[#071322]/80 rounded-xl border border-slate-800/70 p-4 flex flex-col justify-between overflow-hidden">
          {/* Ambient Glow Background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              background:
                "radial-gradient(circle at 70% 30%, rgba(20, 184, 166, 0.25), transparent 60%)",
            }}
            aria-hidden="true"
          />

          {/* Abstract Grid Lines */}
          <div className="absolute inset-x-4 inset-y-4 flex flex-col justify-between pointer-events-none opacity-20" aria-hidden="true">
            <div className="w-full border-b border-dashed border-slate-600" />
            <div className="w-full border-b border-dashed border-slate-600" />
            <div className="w-full border-b border-dashed border-slate-600" />
            <div className="w-full border-b border-dashed border-slate-600" />
          </div>

          {/* SVG Vector Path */}
          <div className="relative w-full h-full flex items-center justify-center">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 400 120"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#14b8a6" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Area Fill */}
              <path
                d="M 10 100 Q 100 85, 180 65 T 390 20 L 390 115 L 10 115 Z"
                fill="url(#areaGradient)"
              />

              {/* Trajectory Stroke */}
              <motion.path
                d="M 10 100 Q 100 85, 180 65 T 390 20"
                fill="none"
                stroke="url(#curveGradient)"
                strokeWidth="3.5"
                strokeLinecap="round"
                initial={isReduced ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: isReduced ? 0 : 1.2, ease: TRANSITION_EASE, delay: 0.2 }}
              />

              {/* Target Indicator Pulse */}
              <motion.circle
                cx="390"
                cy="20"
                r="4.5"
                fill="#38bdf8"
                initial={isReduced ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 1.3 }}
              />
            </svg>
          </div>

          {/* Clean Concept Labels */}
          <div className="relative z-10 flex items-center justify-between text-[11px] font-medium text-slate-400 pt-1">
            <span>Início da prática</span>
            <div className="flex items-center gap-1.5 text-teal-300 font-semibold bg-teal-950/60 px-2.5 py-0.5 rounded-full border border-teal-500/30">
              <Sparkles className="w-3 h-3 text-teal-400" />
              <span>Consistência contínua</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Informative Note */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400">
        A StaziaMed mostra sua evolução com base no que você realmente faz na plataforma.
      </div>
    </motion.section>
  );
};

export default ProgressPreviewEvolution;
