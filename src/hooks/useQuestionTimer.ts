import { useEffect, useRef, useState, useCallback } from "react";
import { QuestionTimingTracker, TIMING_VERSION_ACTIVE_MONOTONIC } from "../services/questionTimingService";

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

  // Visibility listener
  useEffect(() => {
    const handleVisibility = () => {
      const isVisible = document.visibilityState === "visible";
      trackerRef.current?.handleVisibilityChange(isVisible);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
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
        timingVersion: TIMING_VERSION_ACTIVE_MONOTONIC,
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
