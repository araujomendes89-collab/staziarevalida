import { useEffect, useRef, useState, useCallback } from "react";
import { QuestionTimingTracker, TIMING_VERSION_IDLE_AWARE } from "../services/questionTimingService";

interface UseQuestionTimerProps {
  questionId: string;
  isPaused?: boolean;
  isAnswerSubmitted?: boolean;
  initialTimeSeconds?: number;
}

export function useQuestionTimer({
  questionId,
  isPaused = false,
  isAnswerSubmitted = false,
  initialTimeSeconds = 0,
}: UseQuestionTimerProps) {
  const trackerRef = useRef<QuestionTimingTracker | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState<number>(initialTimeSeconds);

  if (!trackerRef.current) {
    trackerRef.current = new QuestionTimingTracker();
  }

  // Initialize/switch question in tracker
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!tracker) return;

    tracker.startQuestion(questionId, initialTimeSeconds * 1000);
    tracker.setPaused(isPaused);

    setDisplaySeconds(Math.round(tracker.getCurrentActiveDurationMs() / 1000));
  }, [questionId, initialTimeSeconds]);

  // Sync paused state
  useEffect(() => {
    trackerRef.current?.setPaused(isPaused);
  }, [isPaused]);

  // Visibility listener & User Activity Listeners (Idle awareness)
  useEffect(() => {
    const handleVisibility = () => {
      const isVisible = document.visibilityState === "visible";
      trackerRef.current?.handleVisibilityChange(isVisible);
    };

    let lastMouseMove = 0;
    const handleUserActivity = (e: Event) => {
      if (e.type === "mousemove") {
        const now = Date.now();
        if (now - lastMouseMove < 2000) return; // Throttle mousemove to once every 2s
        lastMouseMove = now;
      }
      trackerRef.current?.recordActivity();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pointerdown", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });
    window.addEventListener("touchstart", handleUserActivity, { passive: true });
    window.addEventListener("scroll", handleUserActivity, { passive: true });
    window.addEventListener("mousemove", handleUserActivity, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
      window.removeEventListener("mousemove", handleUserActivity);
    };
  }, []);

  // Periodic tick for UI timer display
  useEffect(() => {
    if (isPaused || isAnswerSubmitted) return;

    const interval = setInterval(() => {
      if (trackerRef.current) {
        setDisplaySeconds(Math.round(trackerRef.current.getCurrentActiveDurationMs() / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, isAnswerSubmitted]);

  const finishTimer = useCallback(() => {
    if (!trackerRef.current) {
      return {
        activeDurationMs: displaySeconds * 1000,
        timeSpentSeconds: displaySeconds,
        timingVersion: TIMING_VERSION_IDLE_AWARE,
      };
    }
    return trackerRef.current.finishQuestion();
  }, [displaySeconds]);

  const getActiveDurationMs = useCallback(() => {
    return trackerRef.current?.getCurrentActiveDurationMs() ?? displaySeconds * 1000;
  }, [displaySeconds]);

  return {
    displaySeconds,
    finishTimer,
    getActiveDurationMs,
  };
}
