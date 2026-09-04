import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { RotateCcw, BookOpen, Layers, CheckCircle2, ArrowRight } from "lucide-react";
import { TRANSITION_EASE } from "./motionTokens";

interface ProgressPreviewReviewsProps {
  className?: string;
}

export const ProgressPreviewReviews: React.FC<ProgressPreviewReviewsProps> = ({
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  return (
    <motion.section
      initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE, delay: 0.2 }}
      className={`bg-[#0B192C]/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between ${className}`}
      aria-labelledby="reviews-preview-title"
    >
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800/80">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <RotateCcw className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 id="reviews-preview-title" className="text-base font-bold text-white tracking-tight">
              Revisões no momento certo
            </h2>
            <p className="text-xs text-slate-400">
              A StaziaMed organiza os conteúdos que precisam voltar para sua rotina de estudo.
            </p>
          </div>
        </div>

        {/* Conceptual Pipeline Representation */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Step 1 */}
          <div className="bg-[#071322]/90 border border-slate-800/70 rounded-xl p-3.5 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Prática diária</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Questões e flashcards resolvidos
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-[#071322]/90 border border-slate-800/70 rounded-xl p-3.5 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Fila de revisão</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Intervalos calculados por retenção
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-[#071322]/90 border border-slate-800/70 rounded-xl p-3.5 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Retenção ativa</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Fixação consolidada até a prova
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Informative Note */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400">
        Você estuda sem se preocupar em calcular quando rever cada tema. A plataforma prioriza automaticamente os pontos que pedem reforço.
      </div>
    </motion.section>
  );
};

export default ProgressPreviewReviews;
