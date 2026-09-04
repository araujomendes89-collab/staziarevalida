import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ArrowRight } from "lucide-react";
import { DemoQuestionFixture } from "./onboardingDemoQuestionData";
import { OnboardingDemoFeedback } from "./OnboardingDemoFeedback";
import { TRANSITION_EASE } from "./motionTokens";

interface OnboardingDemoQuestionCardProps {
  question: DemoQuestionFixture;
  selectedOptionId: "A" | "B" | "C" | "D" | null;
  isFeedbackVisible: boolean;
  onSelectOption: (optionId: "A" | "B" | "C" | "D") => void;
  onRevealFeedback: () => void;
  onContinue?: () => void;
}

export const OnboardingDemoQuestionCard: React.FC<OnboardingDemoQuestionCardProps> = ({
  question,
  selectedOptionId,
  isFeedbackVisible,
  onSelectOption,
  onRevealFeedback,
  onContinue,
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  return (
    <div className="w-full max-w-2xl mx-auto bg-[#0B192C] border border-slate-800/80 rounded-2xl p-5 sm:p-7 shadow-xl space-y-6">
      {/* 1. Clinical Case Stem */}
      <div className="space-y-3 text-left">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Enunciado Clínico
        </div>
        <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
          {question.clinicalCase}
        </p>
        <div className="pt-2 font-semibold text-sm sm:text-base text-white border-t border-slate-800/60">
          {question.question}
        </div>
      </div>

      {/* 2. Alternative Options List */}
      <div
        className="space-y-2.5"
        role="radiogroup"
        aria-label="Alternativas da questão demonstrativa"
      >
        {question.options.map((option, idx) => {
          const isSelected = selectedOptionId === option.id;
          const isCorrect = option.id === question.correctOptionId;

          // Option styling based on selection and feedback state
          let optionStyle =
            "bg-[#132644]/80 border-slate-700/60 text-slate-200 hover:border-slate-600 hover:bg-[#162d50]";
          let letterStyle = "bg-slate-800 text-slate-300 border-slate-700";

          if (isFeedbackVisible) {
            if (isCorrect) {
              optionStyle = "bg-teal-950/40 border-teal-500/80 text-teal-100";
              letterStyle = "bg-teal-500 text-slate-900 border-teal-400 font-black";
            } else if (isSelected && !isCorrect) {
              optionStyle = "bg-slate-800/70 border-slate-600 text-slate-300";
              letterStyle = "bg-slate-700 text-slate-200 border-slate-500";
            } else {
              optionStyle = "bg-[#0c1a2e]/60 border-slate-800 text-slate-500 opacity-60";
              letterStyle = "bg-slate-900 text-slate-600 border-slate-800";
            }
          } else if (isSelected) {
            optionStyle =
              "bg-[#0F2E42] border-teal-500/80 text-white shadow-sm shadow-teal-500/10";
            letterStyle = "bg-teal-500 text-slate-900 border-teal-400 font-bold";
          }

          return (
            <motion.button
              key={option.id}
              onClick={() => !isFeedbackVisible && onSelectOption(option.id)}
              disabled={isFeedbackVisible}
              role="radio"
              aria-checked={isSelected}
              type="button"
              initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: isReduced ? 0 : 0.3,
                delay: isReduced ? 0 : 0.1 + idx * 0.05,
                ease: TRANSITION_EASE,
              }}
              className={`w-full flex items-center justify-between p-3.5 sm:p-4 rounded-xl border text-left transition-all duration-150 cursor-pointer disabled:cursor-default focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 ${optionStyle}`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs shrink-0 transition-colors ${letterStyle}`}
                >
                  {isFeedbackVisible && isCorrect ? (
                    <Check className="w-4 h-4 text-slate-900 stroke-[3]" />
                  ) : (
                    option.id
                  )}
                </div>
                <span className="text-sm font-medium">{option.text}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* 3. Pre-Feedback Action ("Ver explicação") */}
      {!isFeedbackVisible && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={onRevealFeedback}
            disabled={!selectedOptionId}
            type="button"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white transition-all rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-500 shadow-teal-600/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer min-h-[44px]"
          >
            <span>Ver explicação</span>
            <ArrowRight className="w-4 h-4 text-teal-100" />
          </button>
        </div>
      )}

      {/* 4. Feedback View (Pedagogical explanation revealed after action) */}
      {isFeedbackVisible && selectedOptionId && (
        <OnboardingDemoFeedback
          question={question}
          selectedOptionId={selectedOptionId}
          onContinue={onContinue}
        />
      )}
    </div>
  );
};
