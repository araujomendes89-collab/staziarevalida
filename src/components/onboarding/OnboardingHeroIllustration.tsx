import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { TRANSITION_EASE, MOTION_DELAYS } from "./motionTokens";

interface NodePoint {
  id: string;
  label?: string;
  initX: number;
  initY: number;
  targetX: number;
  targetY: number;
  radius: number;
  color: string;
  glow?: boolean;
  isPrimaryArea?: boolean;
  concept?: "QUESTIONS" | "CONTENT" | "REVIEW" | "PLAN" | "HUB";
}

/**
 * 20 Precisely Calibrated Nodes
 * 5 Semantic Medical Area Accents:
 * - Clínica Médica: #2563eb
 * - Cirurgia: #ea580c
 * - Pediatria: #0d9488
 * - Ginecologia e Obstetrícia: #e11d48
 * - Medicina Preventiva e Social: #059669
 */
const NODES: NodePoint[] = [
  // Central Synthesis Hub
  { id: "hub-center", initX: 280, initY: 150, targetX: 280, targetY: 140, radius: 7, color: "#14b8a6", glow: true, concept: "HUB" },

  // 5 Canonical Medical Area Primary Nodes (Harmonic Pentagon)
  { id: "area-clinica", initX: 60, initY: 45, targetX: 280, targetY: 60, radius: 5.5, color: "#2563eb", glow: true, isPrimaryArea: true, concept: "CONTENT" },
  { id: "area-cirurgia", initX: 500, initY: 70, targetX: 380, targetY: 110, radius: 5.5, color: "#ea580c", glow: true, isPrimaryArea: true, concept: "QUESTIONS" },
  { id: "area-pediatria", initX: 470, initY: 240, targetX: 345, targetY: 215, radius: 5.5, color: "#0d9488", glow: true, isPrimaryArea: true, concept: "REVIEW" },
  { id: "area-go", initX: 90, initY: 230, targetX: 215, targetY: 215, radius: 5.5, color: "#e11d48", glow: true, isPrimaryArea: true, concept: "PLAN" },
  { id: "area-preventiva", initX: 40, initY: 130, targetX: 180, targetY: 110, radius: 5.5, color: "#059669", glow: true, isPrimaryArea: true, concept: "QUESTIONS" },

  // Secondary Intermediary Structural Nodes (14 Knowledge Points)
  { id: "sub-1", initX: 140, initY: 30, targetX: 230, targetY: 85, radius: 3.5, color: "#38bdf8" },
  { id: "sub-2", initX: 420, initY: 35, targetX: 330, targetY: 85, radius: 3.5, color: "#818cf8" },
  { id: "sub-3", initX: 520, initY: 170, targetX: 410, targetY: 150, radius: 3, color: "#94a3b8" },
  { id: "sub-4", initX: 410, initY: 265, targetX: 310, targetY: 185, radius: 3.5, color: "#38bdf8" },
  { id: "sub-5", initX: 180, initY: 260, targetX: 250, targetY: 185, radius: 3.5, color: "#2dd4bf" },
  { id: "sub-6", initX: 35, initY: 185, targetX: 150, targetY: 150, radius: 3, color: "#94a3b8" },
  { id: "sub-7", initX: 200, initY: 60, targetX: 280, targetY: 100, radius: 3, color: "#cbd5e1" },
  { id: "sub-8", initX: 360, initY: 55, targetX: 330, targetY: 140, radius: 3, color: "#cbd5e1" },
  { id: "sub-9", initX: 490, initY: 110, targetX: 280, targetY: 180, radius: 3, color: "#cbd5e1" },
  { id: "sub-10", initX: 110, initY: 110, targetX: 230, targetY: 140, radius: 3, color: "#cbd5e1" },
  { id: "sub-11", initX: 250, initY: 270, targetX: 195, targetY: 165, radius: 2.5, color: "#64748b" },
  { id: "sub-12", initX: 310, initY: 270, targetX: 365, targetY: 165, radius: 2.5, color: "#64748b" },
  { id: "sub-13", initX: 30, initY: 80, targetX: 200, targetY: 70, radius: 2.5, color: "#64748b" },
  { id: "sub-14", initX: 530, initY: 220, targetX: 360, targetY: 70, radius: 2.5, color: "#64748b" },
];

/**
 * Connecting Knowledge Vectors
 */
const CONNECTIONS: [string, string][] = [
  // Primary Pentagon Ring
  ["area-clinica", "area-cirurgia"],
  ["area-cirurgia", "area-pediatria"],
  ["area-pediatria", "area-go"],
  ["area-go", "area-preventiva"],
  ["area-preventiva", "area-clinica"],

  // Rays to Hub
  ["area-clinica", "hub-center"],
  ["area-cirurgia", "hub-center"],
  ["area-pediatria", "hub-center"],
  ["area-go", "hub-center"],
  ["area-preventiva", "hub-center"],

  // Internal Cross-Disciplinary Arcs
  ["sub-1", "sub-7"],
  ["sub-2", "sub-8"],
  ["sub-4", "sub-9"],
  ["sub-5", "sub-10"],
  ["sub-1", "area-preventiva"],
  ["sub-2", "area-cirurgia"],
  ["sub-4", "area-pediatria"],
  ["sub-5", "area-go"],
];

export const OnboardingHeroIllustration: React.FC<{ className?: string }> = ({ className = "" }) => {
  const prefersReduced = useReducedMotion();

  const nodeMap = React.useMemo(() => {
    const map = new Map<string, NodePoint>();
    NODES.forEach((n) => map.set(n.id, n));
    return map;
  }, []);

  return (
    <div
      className={`relative w-full max-w-[560px] mx-auto select-none flex items-center justify-center ${className}`}
      aria-hidden="true"
      role="presentation"
    >
      {/* Ambient background glow behind central constellation */}
      <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-blue-500/10 blur-2xl rounded-full pointer-events-none transform -translate-y-2 opacity-60" />

      <svg
        viewBox="0 0 560 280"
        className="w-full h-auto overflow-visible relative z-10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Subtle Radial Glows for Central Hub */}
          <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#0ea5e9" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </radialGradient>

          {/* Gradients for connecting vectors */}
          <linearGradient id="vectorGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="vectorGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.15" />
          </linearGradient>

          {/* Background Grid Pattern */}
          <pattern id="microGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.75" fill="#334155" fillOpacity="0.4" />
          </pattern>
        </defs>

        {/* Ambient Geometric Grid Overlay in SVG */}
        <rect x="20" y="10" width="520" height="260" fill="url(#microGrid)" opacity="0.6" rx="16" />

        {/* Outer Orbit Guide Ring */}
        <motion.ellipse
          cx="280"
          cy="140"
          rx="155"
          ry="90"
          stroke="#1e293b"
          strokeWidth="1"
          strokeDasharray="4 6"
          initial={{ opacity: prefersReduced ? 0.7 : 0, scale: prefersReduced ? 1 : 0.9 }}
          animate={{ opacity: 0.7, scale: 1 }}
          transition={{ duration: prefersReduced ? 0 : 1.2, delay: prefersReduced ? 0 : MOTION_DELAYS.linesConnect }}
        />

        {/* Inner Hub Orbit Ring */}
        <motion.ellipse
          cx="280"
          cy="140"
          rx="65"
          ry="38"
          stroke="#14b8a6"
          strokeWidth="1"
          strokeDasharray="2 4"
          strokeOpacity="0.4"
          initial={{ opacity: prefersReduced ? 0.6 : 0, rotate: 0 }}
          animate={{
            opacity: 0.6,
            rotate: prefersReduced ? 0 : 360,
          }}
          transition={{
            opacity: { duration: prefersReduced ? 0 : 1.0, delay: prefersReduced ? 0 : MOTION_DELAYS.nodesOrganize },
            rotate: { duration: 40, repeat: Infinity, ease: "linear" },
          }}
          style={{ transformOrigin: "280px 140px" }}
        />

        {/* Connecting Knowledge Lines (Path Drawing) */}
        <g className="connecting-lines">
          {CONNECTIONS.map(([fromId, toId], idx) => {
            const fromNode = nodeMap.get(fromId);
            const toNode = nodeMap.get(toId);
            if (!fromNode || !toNode) return null;

            const isEven = idx % 2 === 0;

            return (
              <motion.line
                key={`line-${fromId}-${toId}`}
                x1={fromNode.targetX}
                y1={fromNode.targetY}
                x2={toNode.targetX}
                y2={toNode.targetY}
                stroke={isEven ? "url(#vectorGrad1)" : "url(#vectorGrad2)"}
                strokeWidth={fromNode.isPrimaryArea || toNode.isPrimaryArea ? "1.5" : "1"}
                strokeLinecap="round"
                initial={
                  prefersReduced
                    ? { opacity: 0.75, pathLength: 1 }
                    : { opacity: 0, pathLength: 0 }
                }
                animate={{
                  opacity: 0.75,
                  pathLength: 1,
                }}
                transition={{
                  duration: prefersReduced ? 0 : 0.9,
                  delay: prefersReduced ? 0 : MOTION_DELAYS.linesConnect + idx * 0.04,
                  ease: TRANSITION_EASE,
                }}
              />
            );
          })}
        </g>

        {/* Nodes (Transitioning from Dispersed -> Organized) */}
        <g className="constellation-nodes">
          {NODES.map((node, idx) => {
            const isReduced = Boolean(prefersReduced);

            return (
              <motion.g
                key={node.id}
                initial={
                  isReduced
                    ? {
                        opacity: 1,
                        x: node.targetX,
                        y: node.targetY,
                        scale: 1,
                      }
                    : {
                        opacity: 0,
                        x: node.initX,
                        y: node.initY,
                        scale: 0.6,
                      }
                }
                animate={
                  isReduced
                    ? {
                        opacity: 1,
                        x: node.targetX,
                        y: node.targetY,
                        scale: 1,
                      }
                    : {
                        opacity: [0, 0.9, 1],
                        x: [node.initX, (node.initX + node.targetX) / 2, node.targetX],
                        y: [node.initY, (node.initY + node.targetY) / 2, node.targetY],
                        scale: [0.6, 1.15, 1],
                      }
                }
                transition={{
                  duration: isReduced ? 0 : 1.4,
                  delay: isReduced ? 0 : MOTION_DELAYS.nodesDispersed + (idx % 8) * 0.06,
                  ease: TRANSITION_EASE,
                  times: isReduced ? [0, 1] : [0, 0.45, 1],
                }}
              >
                {/* Node Outer Halo Glow for Primary/Hub */}
                {node.glow && (
                  <circle
                    cx={0}
                    cy={0}
                    r={node.radius * 2.8}
                    fill={node.color}
                    fillOpacity="0.18"
                    className="filter blur-[1.5px]"
                  />
                )}

                {/* Node Pulse Ring */}
                {node.isPrimaryArea && (
                  <circle
                    cx={0}
                    cy={0}
                    r={node.radius * 1.7}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="1"
                    strokeOpacity="0.5"
                  />
                )}

                {/* Core Node Circle */}
                <circle
                  cx={0}
                  cy={0}
                  r={node.radius}
                  fill={node.color}
                  stroke="#07162A"
                  strokeWidth="1.5"
                />

                {/* Center Core Light Dot */}
                <circle
                  cx={0}
                  cy={0}
                  r={Math.max(1, node.radius * 0.35)}
                  fill="#ffffff"
                  fillOpacity="0.85"
                />
              </motion.g>
            );
          })}
        </g>

        {/* Central Synthesis Hub Halo Breathing */}
        <motion.circle
          cx="280"
          cy="140"
          r="18"
          fill="url(#hubGlow)"
          initial={{ opacity: prefersReduced ? 0.8 : 0, scale: prefersReduced ? 1 : 0.8 }}
          animate={{
            opacity: [0.6, 0.9, 0.6],
            scale: prefersReduced ? 1 : [0.95, 1.05, 0.95],
          }}
          transition={{
            opacity: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: prefersReduced ? 0 : 2.0 },
            scale: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: prefersReduced ? 0 : 2.0 },
          }}
        />
      </svg>
    </div>
  );
};
