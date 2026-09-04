import React from "react";
import { motion, useReducedMotion } from "motion/react";

interface PersonalizationProgressProps {
  currentQuestionIndex: number; // 1 to 5
  totalQuestions: number; // 5
  className?: string;
}

export const PersonalizationProgress: React.FC<PersonalizationProgressProps> = ({
  currentQuestionIndex,
  totalQuestions,
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const percentage = Math.round((currentQuestionIndex / totalQuestions) * 100);

  return (
    <div
      className={`w-full max-w-md mx-auto flex flex-col items-center gap-1.5 ${className}`}
      role="progressbar"
      aria-valuenow={currentQuestionIndex}
      aria-valuemin={1}
      aria-valuemax={totalQuestions}
      aria-label={`Pergunta ${currentQuestionIndex} de ${totalQuestions}`}
    >
      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-400"
          initial={false}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: prefersReduced ? 0 : 0.35,
            ease: "easeInOut",
          }}
        />
      </div>
      <div className="text-[11px] font-medium text-slate-400">
        <span className="text-teal-400 font-semibold">{currentQuestionIndex}</span>
        <span className="mx-1 text-slate-600">/</span>
        <span>{totalQuestions}</span>
      </div>
    </div>
  );
};
