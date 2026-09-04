import { Variants, Transition } from "motion/react";

/**
 * StaziaMed Revalida — Motion Design Tokens
 * Premium, controlled, clinical transitions.
 * Zero child bounce, strictly calibrated ease curves.
 */

export const TRANSITION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]; // Smooth deceleration ease-out
export const TRANSITION_SMOOTH: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const MOTION_DURATIONS = {
  instant: 0,
  fast: 0.3,
  base: 0.5,
  heroEnter: 0.8,
  lineDraw: 1.0,
  settle: 1.2,
};

export const MOTION_DELAYS = {
  bg: 0.0,
  nodesDispersed: 0.3,
  linesConnect: 0.8,
  nodesOrganize: 1.4,
  logo: 1.9,
  headline: 2.2,
  subheadline: 2.6,
  cta: 3.0,
};

/**
 * Standard Fade Up Variant
 */
export const createFadeUpVariant = (delay: number, duration: number = 0.6): Variants => ({
  hidden: {
    opacity: 0,
    y: 18,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration,
      delay,
      ease: TRANSITION_EASE,
    },
  },
});

/**
 * Standard Fade In Variant
 */
export const createFadeInVariant = (delay: number, duration: number = 0.5): Variants => ({
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration,
      delay,
      ease: TRANSITION_SMOOTH,
    },
  },
});

/**
 * Instant static variant for prefers-reduced-motion
 */
export const REDUCED_MOTION_STATIC_VARIANT: Variants = {
  hidden: { opacity: 1, y: 0, scale: 1 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0 } },
};

/**
 * Directional carousel slide variant for progressive feature transitions
 * Short controlled displacement (24px) without jarring full-screen swipes.
 */
export const createCarouselSlideVariant = (isReducedMotion: boolean = false): Variants => {
  if (isReducedMotion) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: 0.15 } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    };
  }

  return {
    enter: (direction: number) => ({
      x: direction > 0 ? 28 : -28,
      opacity: 0,
      scale: 0.98,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { ease: TRANSITION_EASE, duration: 0.35 },
        opacity: { ease: TRANSITION_SMOOTH, duration: 0.3 },
        scale: { ease: TRANSITION_EASE, duration: 0.35 },
      },
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 28 : -28,
      opacity: 0,
      scale: 0.98,
      transition: {
        x: { ease: TRANSITION_EASE, duration: 0.25 },
        opacity: { ease: TRANSITION_SMOOTH, duration: 0.2 },
        scale: { ease: TRANSITION_EASE, duration: 0.25 },
      },
    }),
  };
};
