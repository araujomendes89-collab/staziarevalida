import React from "react";
import { motion, useReducedMotion } from "motion/react";

interface EcosystemProgressProps {
  currentStep: number;
  totalSteps: number;
  className?: string;
}

export const EcosystemProgress: React.FC<EcosystemProgressProps> = ({
  currentStep,
  totalSteps,
  className = "",
}) => {
  const prefersReduced = useReducedMotion();

  return (
    <div className={`w-full max-w-xs mx-auto flex flex-col items-center gap-2 ${className}`}>
      {/* Segmented Step Indicator */}
      <div className="w-full flex items-center gap-1.5" role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={totalSteps} aria-label={`Passo ${currentStep} de ${totalSteps}`}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepIndex = i + 1;
          const isActive = stepIndex === currentStep;
          const isPast = stepIndex < currentStep;

          return (
            <div
              key={`seg-${stepIndex}`}
              className="relative flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
            >
              <motion.div
                className={`h-full rounded-full ${
                  isActive || isPast
                    ? "bg-gradient-to-r from-teal-400 to-emerald-400"
                    : "bg-transparent"
                }`}
                initial={false}
                animate={{
                  opacity: isActive || isPast ? 1 : 0,
                  scaleX: isActive || isPast ? 1 : 0,
                }}
                transition={{
                  duration: prefersReduced ? 0 : 0.3,
                  ease: "easeInOut",
                }}
                style={{ transformOrigin: "left" }}
              />
            </div>
          );
        })}
      </div>

      {/* Discrete Counter */}
      <div className="text-[11px] font-medium tracking-wider text-slate-400">
        <span className="text-teal-400 font-semibold">{currentStep}</span>
        <span className="mx-1 text-slate-600">/</span>
        <span>{totalSteps}</span>
      </div>
    </div>
  );
};
