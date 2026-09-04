import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ArrowRight, Clock, Calendar, AlertCircle, Target } from "lucide-react";
import { OnboardingPersonalizationDraft } from "./personalizationTypes";
import {
  STAGE_OPTIONS,
  DAILY_AVAILABILITY_OPTIONS,
  WEEK_DAYS_CONFIG,
  MEDICAL_AREAS_OPTIONS,
  EXAM_INTENT_OPTIONS,
} from "./personalizationSteps";
import { TRANSITION_EASE } from "./motionTokens";

interface PersonalizationSummaryProps {
  draft: OnboardingPersonalizationDraft;
  className?: string;
}

export const PersonalizationSummary: React.FC<PersonalizationSummaryProps> = ({
  draft,
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  // Formatted summary strings
  const availabilityLabel =
    DAILY_AVAILABILITY_OPTIONS.find((opt) => opt.value === draft.dailyStudyAvailability)?.label ||
    "Não definido";

  const daysLabel = draft.variableRoutine
    ? "Rotina variável"
    : draft.studyDays.length > 0
    ? draft.studyDays
        .map((d) => WEEK_DAYS_CONFIG.find((w) => w.value === d)?.label || d)
        .join(" • ")
    : "Não informado";

  const weakAreasLabel = draft.dontKnowWeakAreas
    ? "Ainda não sei"
    : draft.selfReportedWeakAreas.length > 0
    ? draft.selfReportedWeakAreas
        .map((a) => MEDICAL_AREAS_OPTIONS.find((m) => m.id === a)?.label || a)
        .join(" • ")
    : "Nenhuma área indicada";

  const examIntentLabel =
    EXAM_INTENT_OPTIONS.find((opt) => opt.value === draft.examIntent)?.label || "Não definido";

  return (
    <motion.div
      initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
      className={`w-full max-w-xl mx-auto space-y-6 text-left ${className}`}
    >
      {/* 1. Header Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30 mb-2">
          <CheckCircle2 className="w-6 h-6 text-teal-400" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Perfeito. Já temos o essencial.
        </h2>
        <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
          Com essas informações, a StaziaMed poderá organizar sua rotina de estudo com mais contexto.
        </p>
      </div>

      {/* 2. Structured Summary Card */}
      <div className="bg-[#0B192C] border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        {/* Availability */}
        <div className="flex items-start gap-3.5 pb-3.5 border-b border-slate-800/80">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-400">Disponibilidade diária</div>
            <div className="text-sm font-semibold text-white mt-0.5">{availabilityLabel}</div>
          </div>
        </div>

        {/* Days */}
        <div className="flex items-start gap-3.5 pb-3.5 border-b border-slate-800/80">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Calendar className="w-4 h-4 text-teal-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-400">Dias de estudo</div>
            <div className="text-sm font-semibold text-white mt-0.5">{daysLabel}</div>
          </div>
        </div>

        {/* Weak Areas */}
        <div className="flex items-start gap-3.5 pb-3.5 border-b border-slate-800/80">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-400">Áreas que pedem atenção</div>
            <div className="text-sm font-semibold text-white mt-0.5">{weakAreasLabel}</div>
          </div>
        </div>

        {/* Exam Intent */}
        <div className="flex items-start gap-3.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-400">Objetivo</div>
            <div className="text-sm font-semibold text-white mt-0.5">{examIntentLabel}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
