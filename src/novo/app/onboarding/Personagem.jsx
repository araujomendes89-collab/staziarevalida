// Stazi e Stazia no onboarding: só a arte 2D aprovada (nada de 3D).
// - Com o ramo tutor-personagens no app (pasta tutor/personagens/sprites), usa as poses de lá para os dois personagens.
// - Antes disso: o Stazi vem do mascote oficial que já está no app (motion-studio, as mesmas artes aprovadas) e a Stazia aparece
//   como um selo com a inicial, até a arte dela chegar (ponto de ligação: basta o ramo entrar, nada aqui precisa mudar).
// O movimento é só transform/opacidade (entrada, troca de pose e respiração); com "reduzir movimento" fica parado.
import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { StaziMascote } from "../../../motion-studio/mascot/StaziMascote";

// poses do ramo tutor-personagens (meia resolução basta: o personagem fica com até ~280 px de altura)
const DO_RAMO = import.meta.glob("../tutor/personagens/sprites/*/*.meia.webp", { eager: true, query: "?url", import: "default" });
const urlDoRamo = (id, arquivo) => DO_RAMO[`../tutor/personagens/sprites/${id}/${arquivo}.meia.webp`] ?? null;

// pose do onboarding → arquivo de cada fonte
const POSES = {
  acenando: { stazi: "acenando", stazia: "acenando", mascote: "acenando" },
  estudando: { stazi: "encorajando", stazia: "encorajando", mascote: "livro" },
  pensando: { stazi: "pensando", stazia: "pensando", mascote: "pensativo" },
  polegar: { stazi: "polegar", stazia: "polegar", mascote: "polegar" },
  orgulho: { stazi: "orgulhoso", stazia: "orgulhosa", mascote: "orgulhosa" },
  comemorando: { stazi: "comemorando", stazia: "comemorando", mascote: "comemorando" },
  calmo: { stazi: "feliz", stazia: "feliz", mascote: "base" },
  firme: { stazi: "firme", stazia: "firme", mascote: "base" },
};

export const NOMES = { stazi: "Stazi", stazia: "Stazia" };

/** A arte da Stazia já está no app? (sem ela, a tela mostra o selo com a inicial) */
export const temArteDaStazia = () => Boolean(urlDoRamo("stazia", "base"));

const ALT = {
  stazi: "Stazi, a lontra de moletom azul-marinho do StaziaMed",
  stazia: "Stazia, a lontra de moletom rosa e laço do StaziaMed",
};

/**
 * Um personagem numa pose. `altura` em px CSS da figura em pé. `decorativo`: sem texto alternativo (o nome já está ao lado).
 */
export function Personagem({ id = "stazi", pose = "acenando", altura = 220, decorativo = false, respirar = true, animar = true }) {
  const reduzir = useReducedMotion() || !animar;
  const p = POSES[pose] ?? POSES.acenando;
  const doRamo = urlDoRamo(id, p[id] ?? p.stazi) || urlDoRamo(id, "base");
  const alt = decorativo ? "" : ALT[id] ?? "";

  let figura;
  if (doRamo) {
    figura = <img src={doRamo} alt={alt} height={altura} style={{ height: altura, width: "auto", display: "block" }} draggable={false} decoding="async" className={respirar && !reduzir ? "ob-respira" : undefined} />;
  } else if (id === "stazi") {
    figura = <StaziMascote pose={p.mascote} size={Math.round(altura * 0.92)} lazy={false} idle={respirar && !reduzir} alt={alt} />;
  } else {
    // a arte da Stazia ainda não está no app: selo com a inicial (nada inventado)
    figura = (
      <span className="ob-selo" style={{ width: altura * 0.62, height: altura * 0.62 }} role={decorativo ? undefined : "img"} aria-label={decorativo ? undefined : "Stazia"} aria-hidden={decorativo || undefined}>
        <b>S</b>
        <small>Stazia</small>
      </span>
    );
  }

  if (reduzir) return <span className="ob-figura" style={{ minHeight: altura }}>{figura}</span>;
  return (
    <span className="ob-figura" style={{ minHeight: altura }}>
      <AnimatePresence mode="wait" initial>
        <motion.span
          key={`${id}-${pose}`}
          className="ob-figura__pose"
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.8 }}
        >
          {figura}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
