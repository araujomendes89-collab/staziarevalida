import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, BookOpen, Lightbulb, ArrowRight } from "lucide-react";
import { DemoQuestionFixture } from "./onboardingDemoQuestionData";
import { TRANSITION_EASE } from "./motionTokens";

interface OnboardingDemoFeedbackProps {
  question: DemoQuestionFixture;
  selectedOptionId: "A" | "B" | "C" | "D";
  onContinue?: () => void;
}

export const OnboardingDemoFeedback: React.FC<OnboardingDemoFeedbackProps> = ({
  question,
  selectedOptionId,
  onContinue,
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  const isCorrect = selectedOptionId === question.correctOptionId;
  const correctOption = question.options.find((opt) => opt.id === question.correctOptionId);

  return (
    <motion.div
      initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
      className="w-full space-y-4 pt-4 text-left"
    >
      {/* 1. Header Feedback Banner */}
      <div
        className={`p-4 rounded-xl border flex items-start gap-3.5 ${
          isCorrect
            ? "bg-teal-950/40 border-teal-500/30 text-teal-200"
            : "bg-slate-800/60 border-slate-700/60 text-slate-200"
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {isCorrect ? (
            <div className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-700/60 flex items-center justify-center text-slate-300">
              <BookOpen className="w-3.5 h-3.5 text-slate-300" />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">
            {isCorrect ? "Você escolheu a resposta correta." : "Veja o raciocínio da questão."}
          </h3>
          <p className="text-xs text-slate-300">
            <span className="font-medium text-slate-400">Resposta correta: </span>
            <span className="font-semibold text-teal-300">
              {correctOption?.id} — {correctOption?.text}
            </span>
          </p>
        </div>
      </div>

      {/* 2. Clinical Explanation Body */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Explicação clínica
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">
          {question.explanation}
        </p>

        {/* 3. Ponto-Chave */}
        <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-start gap-2.5">
          <Lightbulb className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-slate-200">
            <span className="font-bold text-teal-300">{question.keyPointTitle}: </span>
            <span>{question.keyPointText}</span>
          </div>
        </div>
      </div>

      {/* 4. Product Value Note */}
      <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-center">
        <p className="text-xs text-slate-300 font-medium">
          {question.productValueNote}
        </p>
      </div>

      {/* 5. Forward CTA */}
      <div className="pt-2 flex justify-end">
        <button
          onClick={onContinue}
          type="button"
          className="group inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white transition-all bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl shadow-md shadow-teal-500/20 hover:from-teal-400 hover:to-emerald-500 hover:shadow-teal-500/35 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer min-h-[44px]"
        >
          <span>Continuar</span>
          <ArrowRight className="w-4 h-4 text-teal-100 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
};
