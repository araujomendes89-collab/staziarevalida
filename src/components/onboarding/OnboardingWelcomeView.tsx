import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppOptional } from "../../context/AppContext";
import { resolveOnboardingState } from "../../services/onboardingStateResolver";
import { OnboardingPersistenceService } from "../../services/onboardingPersistenceService";
import { OnboardingHeroIllustration } from "./OnboardingHeroIllustration";
import { OnboardingProgressiveText } from "./OnboardingProgressiveText";

interface OnboardingWelcomeViewProps {
  onStart?: () => void;
}

export const OnboardingWelcomeView: React.FC<OnboardingWelcomeViewProps> = ({ onStart }) => {
  const navigate = useNavigate();
  const appContext = useAppOptional();
  const user = appContext?.user;
  const firebaseUser = appContext?.firebaseUser;
  const isGuestMode = appContext?.isGuestMode ?? false;
  const profileResolutionStatus = appContext?.profileResolutionStatus ?? "IDLE";
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleStart = async () => {
    if (isPending) return;

    // Evaluate persistent onboarding eligibility
    const isPersistentEligible =
      Boolean(user) &&
      Boolean(firebaseUser) &&
      !isGuestMode &&
      profileResolutionStatus === "READY" &&
      resolveOnboardingState(user).shouldOnboard;

    if (isPersistentEligible && user) {
      setIsPending(true);
      setError(null);
      const activeUid = user.id;

      try {
        const result = await OnboardingPersistenceService.beginOnboarding(activeUid);
        if (!isMountedRef.current) return;

        if (result.success) {
          if (onStart) {
            onStart();
          } else {
            navigate("/onboarding/ecosystem");
          }
        } else {
          setIsPending(false);
          setError("Não foi possível iniciar agora. Tente novamente.");
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        setIsPending(false);
        setError("Não foi possível iniciar agora. Tente novamente.");
      }
    } else {
      // Safe preview mode: do not write to Firestore, simply navigate
      if (onStart) {
        onStart();
      } else {
        navigate("/onboarding/ecosystem");
      }
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
      <main className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center justify-center space-y-8 my-auto">
        {/* 1. Hero SVG Illustration */}
        <div className="w-full flex justify-center">
          <OnboardingHeroIllustration />
        </div>

        {/* 2. Progressive Text & CTA */}
        <OnboardingProgressiveText
          onStart={handleStart}
          isPending={isPending}
          error={error}
        />
      </main>

      {/* Subtle Bottom System Watermark */}
      <footer className="relative z-10 mt-auto pt-6 text-center text-xs text-slate-500 font-medium">
        StaziaMed Revalida • Sistema de Preparação Médica de Alta Performance
      </footer>
    </div>
  );
};

export default OnboardingWelcomeView;
