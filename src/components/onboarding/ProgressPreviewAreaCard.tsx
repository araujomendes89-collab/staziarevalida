import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3 } from "lucide-react";
import { MEDICAL_AREAS_OPTIONS } from "./personalizationSteps";
import { TRANSITION_EASE } from "./motionTokens";

interface ProgressPreviewAreaCardProps {
  className?: string;
}

export const ProgressPreviewAreaCard: React.FC<ProgressPreviewAreaCardProps> = ({
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  return (
    <motion.section
      initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE, delay: 0.1 }}
      className={`bg-[#0B192C]/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between ${className}`}
      aria-labelledby="area-performance-title"
    >
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800/80">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h2 id="area-performance-title" className="text-base font-bold text-white tracking-tight">
              Desempenho por área
            </h2>
            <p className="text-xs text-slate-400">
              Taxa de acerto e consistência nas 5 grandes áreas médicas
            </p>
          </div>
        </div>

        {/* 5 Medical Areas List */}
        <div className="mt-5 space-y-4">
          {MEDICAL_AREAS_OPTIONS.map((area) => (
            <div key={area.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: area.color }}
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-slate-200">{area.label}</span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  Seu histórico aparecerá aqui
                </span>
              </div>

              {/* Clean Empty Neutral Track */}
              <div
                className="w-full h-2 rounded-full bg-slate-800/80 border border-slate-700/30 overflow-hidden"
                aria-hidden="true"
              >
                <div className="w-0 h-full bg-slate-700/30 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Informative Note */}
      <div className="mt-6 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Organizado automaticamente por questões resolvidas</span>
        <span className="text-teal-400/80 font-medium">5 áreas</span>
      </div>
    </motion.section>
  );
};

export default ProgressPreviewAreaCard;
