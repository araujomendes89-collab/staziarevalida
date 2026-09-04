import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { EcosystemIllustrationType } from "./ecosystemData";
import { TRANSITION_EASE } from "./motionTokens";

interface EcosystemFeatureIllustrationProps {
  type: EcosystemIllustrationType;
  className?: string;
}

export const EcosystemFeatureIllustration: React.FC<EcosystemFeatureIllustrationProps> = ({
  type,
  className = "",
}) => {
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  return (
    <div
      className={`relative w-full max-w-[340px] sm:max-w-[380px] h-[200px] mx-auto flex items-center justify-center select-none ${className}`}
      aria-hidden="true"
      role="presentation"
    >
      {/* Subtle ambient diffuse glow */}
      <div className="absolute inset-0 bg-teal-500/10 blur-xl rounded-full pointer-events-none transform -translate-y-2 opacity-50" />

      {/* 01 — PLANO DE HOJE */}
      {type === "PLANO_DE_HOJE" && (
        <svg viewBox="0 0 320 200" className="w-full h-full overflow-visible relative z-10" fill="none">
          {/* Base Planner Card */}
          <rect x="50" y="25" width="220" height="150" rx="14" fill="#0B192C" stroke="#1E293B" strokeWidth="1.5" />
          <rect x="70" y="42" width="80" height="8" rx="4" fill="#38BDF8" fillOpacity="0.4" />
          <circle cx="245" cy="46" r="4" fill="#14B8A6" />

          {/* Checklist Item 1 (Done) */}
          <motion.g
            initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.15 }}
          >
            <rect x="70" y="64" width="180" height="28" rx="8" fill="#132644" stroke="#1E3A8A" strokeOpacity="0.4" />
            <circle cx="86" cy="78" r="7" fill="#14B8A6" fillOpacity="0.2" stroke="#14B8A6" strokeWidth="1.5" />
            <motion.path
              d="M83 78L85.5 80.5L89.5 75.5"
              stroke="#14B8A6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={isReduced ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
            />
            <rect x="102" y="74" width="90" height="8" rx="4" fill="#94A3B8" fillOpacity="0.8" />
          </motion.g>

          {/* Checklist Item 2 (Done) */}
          <motion.g
            initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.3 }}
          >
            <rect x="70" y="100" width="180" height="28" rx="8" fill="#132644" stroke="#1E3A8A" strokeOpacity="0.4" />
            <circle cx="86" cy="114" r="7" fill="#14B8A6" fillOpacity="0.2" stroke="#14B8A6" strokeWidth="1.5" />
            <motion.path
              d="M83 114L85.5 116.5L89.5 111.5"
              stroke="#14B8A6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={isReduced ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.55, ease: TRANSITION_EASE }}
            />
            <rect x="102" y="110" width="110" height="8" rx="4" fill="#94A3B8" fillOpacity="0.8" />
          </motion.g>

          {/* Checklist Item 3 (Current / Active) */}
          <motion.g
            initial={isReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.45 }}
          >
            <rect x="70" y="136" width="180" height="24" rx="8" fill="#0F243E" stroke="#14B8A6" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="86" cy="148" r="6" fill="none" stroke="#64748B" strokeWidth="1.5" />
            <rect x="102" y="144" width="70" height="8" rx="4" fill="#64748B" fillOpacity="0.7" />
          </motion.g>
        </svg>
      )}

      {/* 02 — QUESTÕES E PROVAS */}
      {type === "QUESTOES_PROVAS" && (
        <svg viewBox="0 0 320 200" className="w-full h-full overflow-visible relative z-10" fill="none">
          {/* Question Exam Sheet */}
          <rect x="45" y="20" width="230" height="160" rx="14" fill="#0B192C" stroke="#1E293B" strokeWidth="1.5" />
          {/* Header & Stem lines */}
          <rect x="65" y="38" width="55" height="7" rx="3.5" fill="#38BDF8" fillOpacity="0.4" />
          <rect x="65" y="52" width="190" height="6" rx="3" fill="#64748B" fillOpacity="0.5" />
          <rect x="65" y="64" width="140" height="6" rx="3" fill="#64748B" fillOpacity="0.4" />

          {/* Alternative A */}
          <g>
            <rect x="65" y="82" width="190" height="20" rx="6" fill="#132644" stroke="#1E293B" strokeWidth="1" />
            <circle cx="78" cy="92" r="5" fill="none" stroke="#64748B" strokeWidth="1" />
            <text x="78" y="94.5" fontSize="6.5" fill="#94A3B8" textAnchor="middle" fontWeight="bold">A</text>
            <rect x="92" y="89" width="100" height="5" rx="2.5" fill="#64748B" fillOpacity="0.6" />
          </g>

          {/* Alternative B (Active Selected) */}
          <motion.g
            initial={isReduced ? { scale: 1 } : { scale: 0.98 }}
            animate={{ scale: 1 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.3 }}
          >
            <rect x="65" y="108" width="190" height="22" rx="6" fill="#0F2E42" stroke="#14B8A6" strokeWidth="1.5" />
            <circle cx="78" cy="119" r="6" fill="#14B8A6" />
            <text x="78" y="121.5" fontSize="6.5" fill="#07162A" textAnchor="middle" fontWeight="bold">B</text>
            <rect x="92" y="116" width="130" height="6" rx="3" fill="#E2E8F0" fillOpacity="0.9" />
          </motion.g>

          {/* Alternative C */}
          <g>
            <rect x="65" y="136" width="190" height="20" rx="6" fill="#132644" stroke="#1E293B" strokeWidth="1" />
            <circle cx="78" cy="146" r="5" fill="none" stroke="#64748B" strokeWidth="1" />
            <text x="78" y="148.5" fontSize="6.5" fill="#94A3B8" textAnchor="middle" fontWeight="bold">C</text>
            <rect x="92" y="143" width="85" height="5" rx="2.5" fill="#64748B" fillOpacity="0.6" />
          </g>
        </svg>
      )}

      {/* 03 — GRANDES TEMAS */}
      {type === "GRANDES_TEMAS" && (
        <svg viewBox="0 0 320 200" className="w-full h-full overflow-visible relative z-10" fill="none">
          {/* Central Connecting Lines */}
          <line x1="160" y1="100" x2="80" y2="60" stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3 3" />
          <line x1="160" y1="100" x2="240" y2="60" stroke="#ea580c" strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3 3" />
          <line x1="160" y1="100" x2="250" y2="145" stroke="#0d9488" strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3 3" />
          <line x1="160" y1="100" x2="70" y2="145" stroke="#e11d48" strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3 3" />
          <line x1="160" y1="100" x2="160" y2="165" stroke="#059669" strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3 3" />

          {/* Center Hub */}
          <circle cx="160" cy="100" r="16" fill="#0B192C" stroke="#14B8A6" strokeWidth="2" />
          <circle cx="160" cy="100" r="6" fill="#14B8A6" />

          {/* 5 Semantic Medical Area Nodes */}
          {/* 1. Clínica Médica (#2563eb) */}
          <motion.g
            initial={isReduced ? { scale: 1 } : { scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.1 }}
          >
            <rect x="45" y="45" width="70" height="30" rx="8" fill="#0F2344" stroke="#2563EB" strokeWidth="1.5" />
            <circle cx="58" cy="60" r="4.5" fill="#2563EB" />
            <rect x="68" y="56" width="36" height="8" rx="4" fill="#93C5FD" fillOpacity="0.9" />
          </motion.g>

          {/* 2. Cirurgia (#ea580c) */}
          <motion.g
            initial={isReduced ? { scale: 1 } : { scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.2 }}
          >
            <rect x="205" y="45" width="70" height="30" rx="8" fill="#381A0E" stroke="#EA580C" strokeWidth="1.5" />
            <circle cx="218" cy="60" r="4.5" fill="#EA580C" />
            <rect x="228" y="56" width="36" height="8" rx="4" fill="#FDBA74" fillOpacity="0.9" />
          </motion.g>

          {/* 3. Pediatria (#0d9488) */}
          <motion.g
            initial={isReduced ? { scale: 1 } : { scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.3 }}
          >
            <rect x="215" y="130" width="70" height="30" rx="8" fill="#0C2E2A" stroke="#0D9488" strokeWidth="1.5" />
            <circle cx="228" cy="145" r="4.5" fill="#0D9488" />
            <rect x="238" y="141" width="36" height="8" rx="4" fill="#5EEAD4" fillOpacity="0.9" />
          </motion.g>

          {/* 4. Ginecologia e Obstetrícia (#e11d48) */}
          <motion.g
            initial={isReduced ? { scale: 1 } : { scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.4 }}
          >
            <rect x="35" y="130" width="70" height="30" rx="8" fill="#380E1C" stroke="#E11D48" strokeWidth="1.5" />
            <circle cx="48" cy="145" r="4.5" fill="#E11D48" />
            <rect x="58" y="141" width="36" height="8" rx="4" fill="#FDA4AF" fillOpacity="0.9" />
          </motion.g>

          {/* 5. Preventiva (#059669) */}
          <motion.g
            initial={isReduced ? { scale: 1 } : { scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.5 }}
          >
            <rect x="125" y="150" width="70" height="30" rx="8" fill="#0A2E20" stroke="#059669" strokeWidth="1.5" />
            <circle cx="138" cy="165" r="4.5" fill="#059669" />
            <rect x="148" y="161" width="36" height="8" rx="4" fill="#6EE7B7" fillOpacity="0.9" />
          </motion.g>
        </svg>
      )}

      {/* 04 — REVISÕES E FLASHCARDS */}
      {type === "REVISOES_FLASHCARDS" && (
        <svg viewBox="0 0 320 200" className="w-full h-full overflow-visible relative z-10" fill="none">
          {/* Background Card (Previous Interval) */}
          <rect x="90" y="18" width="170" height="120" rx="12" fill="#0A1828" stroke="#1E293B" strokeWidth="1" opacity="0.6" transform="rotate(5 175 78)" />

          {/* Active Front/Back Card */}
          <motion.g
            initial={isReduced ? { scale: 1 } : { scale: 0.95, y: 5 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
          >
            <rect x="65" y="32" width="190" height="135" rx="14" fill="#0B192C" stroke="#14B8A6" strokeWidth="1.5" />
            <rect x="85" y="52" width="70" height="8" rx="4" fill="#38BDF8" fillOpacity="0.5" />
            <rect x="85" y="70" width="150" height="7" rx="3.5" fill="#CBD5E1" />
            <rect x="85" y="83" width="110" height="7" rx="3.5" fill="#94A3B8" fillOpacity="0.8" />

            {/* Answer Divider */}
            <line x1="85" y1="102" x2="235" y2="102" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />

            {/* Scheduled Review Badge (User-Facing Benefit) */}
            <rect x="85" y="118" width="96" height="18" rx="9" fill="#14B8A6" fillOpacity="0.15" stroke="#14B8A6" strokeWidth="1" />
            <text x="133" y="130" fontSize="7" fill="#2DD4BF" textAnchor="middle" fontWeight="bold">Revisão programada</text>

            <rect x="188" y="123" width="45" height="8" rx="4" fill="#64748B" fillOpacity="0.5" />
          </motion.g>
        </svg>
      )}

      {/* 05 — ATUALIZAÇÕES & DIRETRIZES */}
      {type === "ATUALIZACOES_DIRETRIZES" && (
        <svg viewBox="0 0 320 200" className="w-full h-full overflow-visible relative z-10" fill="none">
          {/* Document Base */}
          <rect x="60" y="25" width="200" height="150" rx="12" fill="#0B192C" stroke="#1E293B" strokeWidth="1.5" />

          {/* Document Header */}
          <rect x="80" y="45" width="90" height="8" rx="4" fill="#CBD5E1" fillOpacity="0.8" />
          <rect x="80" y="60" width="160" height="6" rx="3" fill="#64748B" fillOpacity="0.5" />
          <rect x="80" y="72" width="130" height="6" rx="3" fill="#64748B" fillOpacity="0.4" />

          {/* Update Protocol Banner Box */}
          <motion.g
            initial={isReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: isReduced ? 0 : 0.4, delay: isReduced ? 0 : 0.2 }}
          >
            <rect x="80" y="95" width="160" height="55" rx="8" fill="#132B45" stroke="#38BDF8" strokeWidth="1.2" />
            <rect x="94" y="108" width="65" height="16" rx="8" fill="#38BDF8" fillOpacity="0.2" />
            <text x="126" y="119" fontSize="7.5" fill="#38BDF8" textAnchor="middle" fontWeight="bold">Atualizado 2026</text>
            <rect x="94" y="132" width="130" height="6" rx="3" fill="#94A3B8" fillOpacity="0.8" />
          </motion.g>
        </svg>
      )}

      {/* 06 — MATERIAIS OFICIAIS */}
      {type === "MATERIAIS_OFICIAIS" && (
        <svg viewBox="0 0 320 200" className="w-full h-full overflow-visible relative z-10" fill="none">
          {/* Stack of Official Documents */}
          <rect x="75" y="45" width="170" height="110" rx="10" fill="#091524" stroke="#1E293B" strokeWidth="1" />
          <rect x="65" y="35" width="170" height="110" rx="10" fill="#0C1D33" stroke="#1E293B" strokeWidth="1.2" />
          <motion.g
            initial={isReduced ? { y: 0 } : { y: 6 }}
            animate={{ y: 0 }}
            transition={{ duration: isReduced ? 0 : 0.4, ease: TRANSITION_EASE }}
          >
            <rect x="55" y="25" width="170" height="115" rx="10" fill="#0F243E" stroke="#14B8A6" strokeWidth="1.5" />
            <circle cx="80" cy="50" r="10" fill="#14B8A6" fillOpacity="0.2" stroke="#14B8A6" strokeWidth="1.2" />
            <path d="M76 50L79 53L85 47" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="100" y="44" width="70" height="8" rx="4" fill="#F8FAFC" fillOpacity="0.9" />
            <rect x="100" y="56" width="45" height="6" rx="3" fill="#38BDF8" fillOpacity="0.7" />

            {/* Official Source Badges (PCDT, MS, CFM) */}
            <rect x="75" y="80" width="130" height="5" rx="2.5" fill="#64748B" fillOpacity="0.5" />
            <rect x="75" y="92" width="110" height="5" rx="2.5" fill="#64748B" fillOpacity="0.4" />
            <rect x="75" y="104" width="90" height="5" rx="2.5" fill="#64748B" fillOpacity="0.3" />
          </motion.g>
        </svg>
      )}
    </div>
  );
};
