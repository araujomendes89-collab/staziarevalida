import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, Info } from "lucide-react";
import { ONBOARDING_DEMO_QUESTION } from "./onboardingDemoQuestionData";
import { OnboardingDemoQuestionCard } from "./OnboardingDemoQuestionCard";

interface OnboardingDemoQuestionViewProps {
  onBackToEcosystem?: () => void;
  onCompleteDemo?: () => void;
}

export const OnboardingDemoQuestionView: React.FC<OnboardingDemoQuestionViewProps> = ({
  onBackToEcosystem,
  onCompleteDemo,
}) => {
  const navigate = useNavigate();

  // Ephemeral React Local State strictly isolated from persistent storage
  const [selectedOptionId, setSelectedOptionId] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState<boolean>(false);

  const handleBack = () => {
    if (onBackToEcosystem) {
      onBackToEcosystem();
    } else {
      navigate("/onboarding/ecosystem");
    }
  };

  const handleContinue = () => {
    if (onCompleteDemo) {
      onCompleteDemo();
    } else {
      navigate("/onboarding/personalize");
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#06101E] text-slate-100 flex flex-col items-center justify-start overflow-x-hidden selection:bg-teal-500/20 selection:text-teal-200 py-8 px-4 sm:px-6 lg:px-8">
      {/* Background Ambient Radial Highlights */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 50% 0%, rgba(20, 184, 166, 0.12), rgba(14, 165, 233, 0.05) 50%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      {/* Subtle Geometric Background Dot Grid */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center space-y-6 my-auto">
        {/* Top Navigation & Brand Header */}
        <header className="w-full flex flex-col items-center space-y-4 text-center">
          {/* Top Bar with Back and Brand */}
          <div className="w-full flex items-center justify-between">
            <button
              onClick={handleBack}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer min-h-[36px]"
              aria-label="Voltar para ecossistema"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
              <span>Voltar</span>
            </button>

            {/* Brand Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/50 shadow-sm backdrop-blur-xs">
              <div className="w-4 h-4 rounded bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
                <Activity className="w-2.5 h-2.5 text-teal-400" />
              </div>
              <span className="text-[11px] font-bold text-white tracking-tight">
                Stazia<span className="text-teal-400">Med</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="text-[9px] font-black text-teal-400 tracking-wider uppercase">
                EXPERIÊNCIA
              </span>
            </div>

            <div className="w-16" aria-hidden="true" />
          </div>

          {/* Demonstration Notice & Disclaimer */}
          <div className="space-y-2 max-w-lg mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-bold text-amber-300 tracking-wide uppercase">
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span>{ONBOARDING_DEMO_QUESTION.badgeLabel}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Experimente como você vai estudar.
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Escolha uma alternativa e veja como a StaziaMed apresenta o raciocínio da questão.
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              {ONBOARDING_DEMO_QUESTION.disclaimer}
            </p>
          </div>
        </header>

        {/* Question Card */}
        <main className="w-full">
          <OnboardingDemoQuestionCard
            question={ONBOARDING_DEMO_QUESTION}
            selectedOptionId={selectedOptionId}
            isFeedbackVisible={isFeedbackVisible}
            onSelectOption={(optionId) => setSelectedOptionId(optionId)}
            onRevealFeedback={() => setIsFeedbackVisible(true)}
            onContinue={handleContinue}
          />
        </main>

        {/* Subtle Bottom System Watermark */}
        <footer className="pt-4 text-center text-xs text-slate-500 font-medium">
          StaziaMed Revalida • Modo Demonstrativo
        </footer>
      </div>
    </div>
  );
};

export default OnboardingDemoQuestionView;
