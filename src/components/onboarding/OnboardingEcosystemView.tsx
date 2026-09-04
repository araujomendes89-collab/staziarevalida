import React from "react";
import { useNavigate } from "react-router-dom";
import { EcosystemCarousel } from "./EcosystemCarousel";

interface OnboardingEcosystemViewProps {
  onBackToWelcome?: () => void;
  onComplete?: () => void;
}

export const OnboardingEcosystemView: React.FC<OnboardingEcosystemViewProps> = ({
  onBackToWelcome,
  onComplete,
}) => {
  const navigate = useNavigate();

  const handleBackToWelcome = () => {
    if (onBackToWelcome) {
      onBackToWelcome();
    } else {
      navigate("/onboarding/welcome");
    }
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    } else {
      navigate("/onboarding/experience");
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#06101E] text-slate-100 flex flex-col items-center justify-center overflow-x-hidden selection:bg-teal-500/20 selection:text-teal-200 py-8 px-4 sm:px-6 lg:px-8">
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

      {/* Main Centered Stage */}
      <main className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-center justify-center my-auto">
        <EcosystemCarousel
          onBackToWelcome={handleBackToWelcome}
          onComplete={handleComplete}
        />
      </main>

      {/* Subtle Bottom System Watermark */}
      <footer className="relative z-10 mt-auto pt-6 text-center text-xs text-slate-500 font-medium">
        StaziaMed Revalida • Ecossistema Integrado de Preparação Médica
      </footer>
    </div>
  );
};

export default OnboardingEcosystemView;
