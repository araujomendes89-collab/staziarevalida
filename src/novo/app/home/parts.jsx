// Peças compartilhadas do Início e do Plano de Hoje (Novas telas, onda 2): anel de progresso, ícone da tarefa, letra da área.
import React from "react";
import { Icon } from "../../ds";
import { AppRealIcon } from "../AppIcons.jsx";
import { areaLabel, areaOf } from "../practice/format.js";

/** Anel de progresso sobre o cartão azul. `value` de `total`; o texto do meio vem de quem chama. */
export function Ring({ value, total, size, stroke, children, color, track }) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  return (
    <div className="ih-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track || "var(--ih-ring-track)"} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || "var(--ih-ring)"} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <div className="ih-ring-t">{children}</div>
    </div>
  );
}

/** Ícone ilustrado e cor de fundo da tarefa do plano, pelo tipo (estudar, praticar, revisar). */
export const TASK_LOOK = {
  praticar: { icon: "file-question", tile: "" },
  revisar: { icon: "notebook-pen", tile: "ih-tile--rev" },
  estudar: { icon: "book-open", tile: "ih-tile--est" },
};
export function TaskIcon({ kind, size = 30 }) {
  const look = TASK_LOOK[kind] ?? TASK_LOOK.praticar;
  return AppRealIcon({ name: look.icon, size }) || <Icon name={look.icon} size={size - 6} />;
}
export const taskTile = (kind) => (TASK_LOOK[kind] ?? TASK_LOOK.praticar).tile;

/** Cores pastel da área (tokens da onda 0). `area` é o código do banco (CIRURGIA_GERAL...). */
export function areaStyle(area) {
  const tone = areaOf(area)?.tone;
  return tone ? { background: `var(${tone}-bg)`, color: `var(${tone}-text)` } : { background: "var(--surface-sunken)", color: "var(--text-secondary)" };
}
export const areaLetter = (area) => areaLabel(area).trim().charAt(0).toUpperCase() || "?";
export const areaShort = (area) => areaLabel(area);

/** "20 de 20" etc.: separa o número da unidade para escrever o número em fonte de dados. */
export const Mono = ({ children }) => <span className="ih-mono">{children}</span>;
