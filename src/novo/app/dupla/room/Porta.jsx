// Treino em Dupla · a porta da estação (dono, 19/10): o candidato fica "de frente para a porta" com o número da ÁREA, como na
// prova (1 Clínica Médica, 2 Cirurgia Geral, 3 Pediatria, 4 Ginecologia e Obstetrícia, 5 MFC/Saúde Coletiva). O número vem do
// servidor (`room.porta`, 014140); nunca há porta sem número (quem chama não desenha a porta sem `numero`). Ao iniciar, a porta
// abre durante o apito, no tempo do servidor (porta.js). Só na tela do CANDIDATO (DONO-1: o ator não vê a porta). Só tokens do
// design system; o leitor de tela ouve "Porta N".
import React from "react";
import { APITO_MS } from "../porta.js";

const CSS = `
@keyframes dupla-porta-abre{from{transform:perspective(700px) rotateY(0deg)}to{transform:perspective(700px) rotateY(-78deg)}}
.dupla-porta{display:block;width:min(220px,60vw);height:auto;margin:0 auto}
.dupla-porta__folha{transform-origin:46px 50%;transform-box:view-box}
.dupla-porta[data-estado="abrindo"][data-animar="sim"] .dupla-porta__folha{animation:dupla-porta-abre ${APITO_MS}ms linear forwards}
.dupla-porta[data-estado="aberta"] .dupla-porta__folha{transform:perspective(700px) rotateY(-78deg)}
@media (prefers-reduced-motion:reduce){.dupla-porta__folha{animation:none!important}}
`;

/** O aparelho pede menos movimento? (Com isso a porta troca sem animação.) */
export function prefereMenosMovimento() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/**
 * @param {{ numero: number, estado?: "fechada" | "abrindo" | "aberta", jaPassouMs?: number }} p
 *   jaPassouMs: quanto do apito já tinha passado, no relógio do servidor, quando a porta começou a abrir NESTA tela; a animação
 *   começa desse ponto (atraso negativo) para o apito e a porta ficarem juntos. Quem chama fixa esse valor uma vez (PortaEntrada,
 *   Tarefa 6): mudar o atraso de uma animação em curso não a reinicia e faria a porta abrir mais rápido que o apito.
 */
export function Porta({ numero, estado = "fechada", jaPassouMs = 0 }) {
  const animar = !prefereMenosMovimento();
  const atraso = Math.max(0, Math.min(APITO_MS, jaPassouMs));
  return (
    <svg className="dupla-porta" viewBox="0 0 200 300" role="img" aria-label={`Porta ${numero}`} data-estado={estado} data-animar={animar ? "sim" : "nao"}>
      <style>{CSS}</style>
      <rect x="30" y="20" width="140" height="270" rx="6" fill="var(--surface-sunken)" stroke="var(--border-strong)" strokeWidth="6" />
      <g
        className="dupla-porta__folha"
        data-ja-passou={estado === "abrindo" ? atraso : undefined}
        style={estado === "abrindo" && animar ? { animationDelay: `-${atraso}ms` } : undefined}
      >
        <rect x="46" y="34" width="108" height="250" rx="4" fill="var(--surface-card)" stroke="var(--border-default)" strokeWidth="3" />
        <circle cx="138" cy="164" r="6" fill="var(--text-brand)" />
        <rect x="70" y="70" width="60" height="60" rx="30" fill="var(--surface-brand-soft)" />
        <text x="100" y="112" textAnchor="middle" fontSize="40" fontWeight="800" fill="var(--text-primary)" aria-hidden="true">
          {numero}
        </text>
      </g>
    </svg>
  );
}

/**
 * Tela do CANDIDATO enquanto a porta abre (apito tocando) e até a estação chegar do servidor (DONO-1: o ator não vê a porta;
 * DONO-2: com a porta aberta, a tela pede estado e conteúdo de novo e só então troca para a estação). Sem número de porta
 * (nunca deve acontecer: o servidor manda a porta de toda estação da prova), só o texto.
 * O atraso da animação é fixado na primeira vez que a porta aparece abrindo NESTA tela (ruling D1): recalcular a cada 250 ms
 * mudaria o atraso de uma animação em curso (não a reinicia) e a porta abriria mais rápido que o apito.
 * @param {{ room: { porta?: number | null }, entrada: { etapa: "fechada" | "abrindo" | "aberta", faltaMs: number } }} p
 */
export function PortaEntrada({ room, entrada }) {
  const jaPassou = React.useRef(null);
  if (entrada.etapa === "abrindo" && jaPassou.current == null) jaPassou.current = APITO_MS - (entrada.faltaMs ?? APITO_MS);
  return (
    <main
      role="status"
      aria-live="polite"
      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "32px 16px", boxSizing: "border-box" }}
    >
      {room.porta ? <Porta numero={room.porta} estado={entrada.etapa} jaPassouMs={jaPassou.current ?? 0} /> : null}
      <p style={{ margin: 0, font: "700 var(--text-lg)/1.3 var(--font-sans)", color: "var(--text-primary)", textAlign: "center" }}>A estação vai começar</p>
    </main>
  );
}
