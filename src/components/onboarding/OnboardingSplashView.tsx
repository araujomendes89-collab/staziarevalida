import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { Volume2 } from "lucide-react";
import { StaziaMascotSplashIllustration } from "./StaziaMascotSplashIllustration";
import { useSplashAudio } from "./useSplashAudio";

export const SPLASH_DURATION_MS = 11000;
export const REDUCED_MOTION_DURATION_MS = 1000;

export interface OnboardingSplashViewProps {
  onComplete?: () => void;
}

export const OnboardingSplashView: React.FC<OnboardingSplashViewProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(Boolean(prefersReduced));
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setReduceMotion(true);
    }
  }, []);

  const { needsGesture, unlockAndPlay, cleanup: cleanupAudio } = useSplashAudio({
    reduceMotion,
  });

  const handleFinish = () => {
    if (!navigatedRef.current) {
      navigatedRef.current = true;
      if (onComplete) {
        onComplete();
      } else {
        navigate("/onboarding/welcome", { replace: true });
      }
    }
  };

  useEffect(() => {
    if (reduceMotion) {
      // In reduced motion, avoid waiting 11s and complete promptly
      const timer = setTimeout(() => {
        handleFinish();
      }, REDUCED_MOTION_DURATION_MS);
      return () => clearTimeout(timer);
    }

    setIsAnimating(true);

    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, SPLASH_DURATION_MS - 400);

    const navTimer = setTimeout(() => {
      handleFinish();
    }, SPLASH_DURATION_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(navTimer);
      cleanupAudio();
    };
  }, [reduceMotion, navigate, cleanupAudio, onComplete]);

  return (
    <div
      onClick={unlockAndPlay}
      className={`fixed inset-0 w-screen min-h-[100dvh] z-50 overflow-hidden flex flex-col items-center justify-center transition-opacity duration-300 ${
        isFadingOut ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background: "radial-gradient(ellipse 900px 900px at 50% 38%, #0E1B34 0%, #08101D 70%)",
      }}
    >
      {/* Audio Hint & Activation Button (discreet, non-blocking) */}
      {needsGesture && !reduceMotion && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            unlockAndPlay();
          }}
          aria-label="Ativar áudio da animação"
          className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/60 hover:bg-black/80 border border-teal-400/40 text-teal-300 hover:text-white text-xs px-4 py-2 rounded-full cursor-pointer transition-all duration-200 shadow-lg backdrop-blur-xs flex items-center gap-2 z-30 active:scale-95 animate-pulse"
        >
          <Volume2 className="w-3.5 h-3.5 text-teal-400" />
          <span>Ativar som</span>
        </button>
      )}

      {/* Main Mascot Scene */}
      <div className="flex-1 w-full max-w-[420px] flex items-center justify-center px-4">
        <StaziaMascotSplashIllustration
          isAnimating={isAnimating}
          reduceMotion={reduceMotion}
        />
      </div>

      {/* Bottom Cinematic Load Bar */}
      <div className="w-full max-w-[360px] px-6 pb-6 pt-2">
        <div
          className="w-full h-1 bg-white/10 rounded-full overflow-hidden"
          aria-hidden="true"
        >
          <div
            className={`h-full bg-gradient-to-r from-[#52C7B8] to-[#2D68B8] rounded-full transition-all ${
              reduceMotion ? "w-full" : ""
            }`}
            style={
              !reduceMotion
                ? {
                    animation: `fillProgress ${SPLASH_DURATION_MS}ms linear forwards`,
                  }
                : undefined
            }
          />
        </div>
      </div>

      <style>{`
        @keyframes fillProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};
