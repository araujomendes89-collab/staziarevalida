import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Activity, ArrowRight } from "lucide-react";
import {
  createFadeUpVariant,
  MOTION_DELAYS,
  REDUCED_MOTION_STATIC_VARIANT,
} from "./motionTokens";

interface OnboardingProgressiveTextProps {
  onStart?: () => void;
  isPending?: boolean;
  error?: string | null;
  className?: string;
}

export const OnboardingProgressiveText: React.FC<OnboardingProgressiveTextProps> = ({
  onStart,
  isPending = false,
  error = null,
  className = "",
}) => {
  const prefersReduced = useReducedMotion();

  const logoVariant = prefersReduced
    ? REDUCED_MOTION_STATIC_VARIANT
    : createFadeUpVariant(MOTION_DELAYS.logo, 0.5);

  const headlineVariant = prefersReduced
    ? REDUCED_MOTION_STATIC_VARIANT
    : createFadeUpVariant(MOTION_DELAYS.headline, 0.6);

  const subheadlineVariant = prefersReduced
    ? REDUCED_MOTION_STATIC_VARIANT
    : createFadeUpVariant(MOTION_DELAYS.subheadline, 0.5);

  const ctaVariant = prefersReduced
    ? REDUCED_MOTION_STATIC_VARIANT
    : createFadeUpVariant(MOTION_DELAYS.cta, 0.5);

  return (
    <div className={`w-full max-w-2xl mx-auto text-center px-4 space-y-6 ${className}`}>
      {/* 1. Brand Logo Badge */}
      <motion.div
        variants={logoVariant}
        initial="hidden"
        animate="visible"
        className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-800/70 border border-slate-700/60 shadow-lg backdrop-blur-xs"
      >
        <div className="w-5 h-5 rounded-md bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
          <Activity className="w-3.5 h-3.5 text-teal-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold tracking-tight text-white text-xs">
            Stazia<span className="text-teal-400">Med</span>
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-600" />
          <span className="text-[10px] font-black text-teal-400 tracking-wider uppercase">
            REVALIDA
          </span>
        </div>
      </motion.div>

      {/* 2. Primary Headline */}
      <motion.h1
        variants={headlineVariant}
        initial="hidden"
        animate="visible"
        className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight"
      >
        Sua preparação para o Revalida começa agora.
      </motion.h1>

      {/* 3. Subheadline */}
      <motion.p
        variants={subheadlineVariant}
        initial="hidden"
        animate="visible"
        className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto font-normal leading-relaxed"
      >
        Organize o que estudar, praticar e revisar ao longo da sua preparação.
      </motion.p>

      {/* Error Feedback */}
      {error && (
        <div
          data-testid="welcome-error-message"
          className="text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 max-w-md mx-auto"
        >
          {error}
        </div>
      )}

      {/* 4. Action CTA */}
      <motion.div
        variants={ctaVariant}
        initial="hidden"
        animate="visible"
        className="pt-2 flex justify-center"
      >
        <button
          onClick={onStart}
          disabled={isPending}
          data-testid="welcome-start-cta"
          type="button"
          className={`group relative inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-semibold text-white transition-all duration-200 rounded-xl shadow-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06101E] active:scale-[0.98] min-h-[48px] ${
            isPending
              ? "bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-75 shadow-none"
              : "bg-gradient-to-r from-teal-500 via-teal-600 to-emerald-600 shadow-teal-500/25 hover:shadow-teal-500/40 hover:from-teal-400 hover:to-emerald-500 cursor-pointer"
          }`}
        >
          <span>{isPending ? "Começando..." : "Começar minha preparação"}</span>
          {!isPending && (
            <ArrowRight className="w-4 h-4 text-teal-100 group-hover:translate-x-1 transition-transform duration-200" />
          )}
        </button>
      </motion.div>
    </div>
  );
};
