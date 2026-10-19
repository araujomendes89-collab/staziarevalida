// Cartão público de um colega no Treinamento em Dupla: os textos de "Disponível", "Estações" e o cartão inteiro
// (porte de toCard, match-rules.js:47-51 do pacote de design, sem pessoa de exemplo: tudo vem do que o servidor entrega).
import { formatDecimal } from "../../ds/format.js";
import { ROLE_PREF_LABEL, areaByCode } from "./labels.js";

/** Pesos da compatibilidade, em %, na ordem em que aparecem em "Como a compatibilidade é calculada" (match-rules.js:6). */
export const COMPAT_WEIGHTS = { role: 40, areas: 25, time: 20, pace: 10, exam: 5 };

/**
 * Turnos e dias em uma linha: ["Noite"], ["Seg","Qua"] → "Noite · Seg, Qua". Sem turno: "Sem turno".
 * Cinco dias ou mais viram "primeiro a último" ("Seg a Sex"), como no cartão do protótipo (match-rules.js:48).
 * @param {string[] | null | undefined} shifts
 * @param {string[] | null | undefined} days
 * @returns {string}
 */
export function availabilityLabel(shifts, days) {
  const turnos = Array.isArray(shifts) ? shifts : [];
  const dias = Array.isArray(days) ? days : [];
  const diasTexto = dias.length >= 5 ? `${dias[0]} a ${dias[dias.length - 1]}` : dias.join(", ");
  return (turnos.join(" e ") || "Sem turno") + (dias.length ? " · " + diasTexto : "");
}

/**
 * Linha "Estações" do cartão. Sem `stats` (a pessoa não mostra o desempenho) é "Oculto".
 * @param {{ done: number, avg: number | null } | null | undefined} stats
 * @returns {string}
 */
export function statsLabel(stats) {
  if (!stats) return "Oculto";
  if (!stats.done) return "0 feitas";
  return `${stats.done} feitas · PEP ${formatDecimal(stats.avg)}`;
}

/**
 * @typedef {{ icon: string, text: string, strong?: boolean, weak?: boolean }} CardReason
 * @typedef {{
 *   public_name: string, school?: string | null, city?: string | null, exam?: string | null, bio?: string | null,
 *   handle?: string, goal?: string | null, areas?: string[], role_pref?: "med" | "ator" | "any", pace?: string,
 *   days?: string[], shifts?: string[], stats?: { done: number, avg: number | null } | null,
 *   compat?: number, reasons?: CardReason[], online?: boolean
 * }} PublicCard
 */

/**
 * Cartão público -> pessoa do `MatchCard` do design system.
 * @param {PublicCard} p
 */
export function toCard(p) {
  const meta = [p.handle && "@" + p.handle, p.school, p.city, p.exam && "Revalida " + p.exam].filter(Boolean).join(" · ");
  const person = {
    name: p.public_name,
    meta,
    bio: p.bio || "",
    facts: [
      { icon: "target", label: "Objetivo", value: p.goal || "—" },
      { icon: "clock", label: "Disponível", value: availabilityLabel(p.shifts, p.days) },
      { icon: "user-round", label: "Papel", value: ROLE_PREF_LABEL[p.role_pref] ?? ROLE_PREF_LABEL.any },
      { icon: "list-checks", label: "Estações", value: statsLabel(p.stats) },
    ],
    tags: (p.areas ?? []).map((code) => areaByCode(code)?.chip).filter(Boolean),
  };
  if (p.online) person.online = true;
  if (typeof p.compat === "number") person.compat = p.compat;
  if (p.reasons && p.reasons.length) person.reasons = p.reasons;
  return person;
}
