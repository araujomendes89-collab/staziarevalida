// Ilustração do tema em "órgão de vidro translúcido" (estilo definido em docs/temas-card.md), desenhada só em SVG: sem imagem,
// sem serviço externo. O componente base monta o halo na cor do tema, as definições de vidro (gradientes, brilho, sombra
// interna) e chama o desenho do motivo. Uso: <IlustracaoTema motivo="pulmao" /> dentro de um elemento com as variáveis do tema
// (--gt-b), ou <IlustracaoTema motivo="rim" cor="#90E7CD" />. É sempre decorativa (o título do tema já está escrito ao lado).
import React from "react";
import { Ctx, Defs } from "./vidro.jsx";
import { DESENHOS } from "./motivos.jsx";

/**
 * Ilustração de um tema. `motivo`: chave de DESENHOS (motivo sem desenho cai no genérico); `cor`: cor do halo (padrão: a cor
 * de brilho do tema, var(--gt-b)); `area`: muda a composição do genérico.
 */
export function IlustracaoTema({ motivo, cor, area, className = "" }) {
  const raw = React.useId();
  const u = `il${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const nome = DESENHOS[motivo] ? motivo : "generico";
  const Desenho = DESENHOS[nome];
  return (
    <svg
      className={`il ${className}`.trim()}
      viewBox="0 0 240 240"
      aria-hidden="true"
      focusable="false"
      data-motivo={nome}
      style={{ "--il-halo": cor ?? "var(--gt-b, #9FD8EA)" }}
    >
      <Ctx.Provider value={u}>
        <Defs u={u} />
        <circle cx="124" cy="118" r="114" fill={`url(#${u}-halo)`} />
        <Desenho area={area} />
      </Ctx.Provider>
    </svg>
  );
}
