import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { TRANSITION_EASE, MOTION_DELAYS } from "./motionTokens";

interface MedicalAreaNode {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  radius: number;
}

const MEDICAL_AREA_NODES: MedicalAreaNode[] = [
  { id: "clinica", name: "Clínica Médica", color: "#2563eb", x: 230, y: 55, radius: 4 },
  { id: "cirurgia", name: "Cirurgia Geral", color: "#ea580c", x: 210, y: 145, radius: 4 },
  { id: "pediatria", name: "Pediatria", color: "#0d9488", x: 335, y: 88, radius: 4 },
  { id: "go", name: "Ginecologia e Obstetrícia", color: "#e11d48", x: 360, y: 152, radius: 4 },
  { id: "preventiva", name: "Medicina Preventiva / Saúde Coletiva", color: "#059669", x: 220, y: 195, radius: 4 },
];

export const OnboardingDirectionIllustration: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  return (
    <div
      className={`relative w-full max-w-[580px] mx-auto select-none flex items-center justify-center ${className}`}
      aria-hidden="true"
      role="presentation"
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-blue-500/10 blur-2xl rounded-full pointer-events-none transform -translate-y-2 opacity-50" />

      <svg
        viewBox="0 0 580 240"
        className="w-full h-auto overflow-visible relative z-10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Subtle Grid Pattern */}
          <pattern id="directionMicroGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.75" fill="#334155" fillOpacity="0.35" />
          </pattern>

          {/* Gradients for converging vectors */}
          <linearGradient id="convergeGradTop" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="convergeGradMid" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="convergeGradBtm" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.9" />
          </linearGradient>

          {/* Main forward trajectory gradient */}
          <linearGradient id="forwardTrajectoryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="1" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="1" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="1" />
          </linearGradient>

          {/* Hub radial glow */}
          <radialGradient id="directionHubGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#0ea5e9" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Grid Card Base */}
        <rect x="20" y="10" width="540" height="220" fill="url(#directionMicroGrid)" opacity="0.6" rx="16" />

        {/* 1. THREE PILLAR INGRESS VECTORS (Estudar, Praticar, Revisar) */}
        {/* Top Vector: Estudar -> Center Hub */}
        <motion.path
          d="M 120 50 C 180 50, 220 120, 280 120"
          stroke="url(#convergeGradTop)"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={isReduced ? { opacity: 0.8, pathLength: 1 } : { opacity: 0, pathLength: 0 }}
          animate={{ opacity: 0.8, pathLength: 1 }}
          transition={{ duration: isReduced ? 0 : 0.9, delay: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
        />

        {/* Middle Vector: Praticar -> Center Hub */}
        <motion.path
          d="M 120 120 L 280 120"
          stroke="url(#convergeGradMid)"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={isReduced ? { opacity: 0.8, pathLength: 1 } : { opacity: 0, pathLength: 0 }}
          animate={{ opacity: 0.8, pathLength: 1 }}
          transition={{ duration: isReduced ? 0 : 0.8, delay: isReduced ? 0 : 0.5, ease: TRANSITION_EASE }}
        />

        {/* Bottom Vector: Revisar -> Center Hub */}
        <motion.path
          d="M 120 190 C 180 190, 220 120, 280 120"
          stroke="url(#convergeGradBtm)"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={isReduced ? { opacity: 0.8, pathLength: 1 } : { opacity: 0, pathLength: 0 }}
          animate={{ opacity: 0.8, pathLength: 1 }}
          transition={{ duration: isReduced ? 0 : 0.9, delay: isReduced ? 0 : 0.6, ease: TRANSITION_EASE }}
        />

        {/* 2. FORWARD UNIFIED TRAJECTORY (Direção / Preparação) */}
        <motion.path
          d="M 280 120 L 480 120"
          stroke="url(#forwardTrajectoryGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          initial={isReduced ? { opacity: 1, pathLength: 1 } : { opacity: 0, pathLength: 0 }}
          animate={{ opacity: 1, pathLength: 1 }}
          transition={{ duration: isReduced ? 0 : 1.0, delay: isReduced ? 0 : 1.1, ease: TRANSITION_EASE }}
        />

        {/* Forward Arrow Head at end of trajectory */}
        <motion.path
          d="M 470 113 L 484 120 L 470 127"
          stroke="#60a5fa"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={isReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 1.9, ease: TRANSITION_EASE }}
        />

        {/* 3. THREE PILLAR INGRESS NODES & TEXT LABELS */}
        {/* Pillar 1: Estudar */}
        <motion.g
          initial={isReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: isReduced ? 0 : 0.6, delay: isReduced ? 0 : 0.2, ease: TRANSITION_EASE }}
        >
          <circle cx="120" cy="50" r="14" fill="#0c2340" stroke="#38bdf8" strokeWidth="1.5" />
          <circle cx="120" cy="50" r="5" fill="#38bdf8" />
          <text x="96" y="54" fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="end">
            ESTUDAR
          </text>
        </motion.g>

        {/* Pillar 2: Praticar */}
        <motion.g
          initial={isReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: isReduced ? 0 : 0.6, delay: isReduced ? 0 : 0.3, ease: TRANSITION_EASE }}
        >
          <circle cx="120" cy="120" r="14" fill="#062e30" stroke="#2dd4bf" strokeWidth="1.5" />
          <circle cx="120" cy="120" r="5" fill="#2dd4bf" />
          <text x="96" y="124" fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="end">
            PRATICAR
          </text>
        </motion.g>

        {/* Pillar 3: Revisar */}
        <motion.g
          initial={isReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: isReduced ? 0 : 0.6, delay: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
        >
          <circle cx="120" cy="190" r="14" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.5" />
          <circle cx="120" cy="190" r="5" fill="#818cf8" />
          <text x="96" y="194" fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="end">
            REVISAR
          </text>
        </motion.g>

        {/* 4. CENTRAL CONFLUENCE HUB */}
        <motion.g
          initial={isReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: isReduced ? 0 : 0.7, delay: isReduced ? 0 : 1.0, ease: TRANSITION_EASE }}
        >
          <circle cx="280" cy="120" r="22" fill="url(#directionHubGlow)" />
          <circle cx="280" cy="120" r="10" fill="#0f172a" stroke="#14b8a6" strokeWidth="2" />
          <circle cx="280" cy="120" r="4.5" fill="#14b8a6" />
        </motion.g>

        {/* 5. FIVE CANONICAL MEDICAL AREA SUBTLE SATELLITE NODES */}
        {MEDICAL_AREA_NODES.map((node, idx) => (
          <motion.g
            key={node.id}
            initial={isReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: isReduced ? 0 : 0.5,
              delay: isReduced ? 0 : 1.4 + idx * 0.08,
              ease: TRANSITION_EASE,
            }}
          >
            <circle cx={node.x} cy={node.y} r={node.radius * 2} fill={node.color} fillOpacity="0.2" />
            <circle cx={node.x} cy={node.y} r={node.radius} fill={node.color} stroke="#07162A" strokeWidth="1" />
            <circle cx={node.x} cy={node.y} r={1.5} fill="#ffffff" fillOpacity="0.9" />
          </motion.g>
        ))}

        {/* Direction Forward Concept Label */}
        <motion.g
          initial={isReduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: isReduced ? 0 : 0.6, delay: isReduced ? 0 : 1.8 }}
        >
          <text x="500" y="124" fill="#38bdf8" fontSize="11" fontWeight="700" textAnchor="start">
            PREPARAÇÃO
          </text>
        </motion.g>
      </svg>
    </div>
  );
};

export default OnboardingDirectionIllustration;
