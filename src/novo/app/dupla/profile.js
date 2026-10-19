// Perfil de estudo no navegador: edições da prova, rascunho a partir do que o servidor entrega e validação do nome.
import { AREAS, DAYS, SHIFTS } from "./labels.js";

const ZONE = "America/Sao_Paulo";

/**
 * As três próximas edições do Revalida, no fuso de São Paulo. Até junho a lista começa no /1 do ano; depois, no /2.
 * 09/10/2026 -> ["2026/2", "2027/1", "2027/2"]; 15/03/2027 -> ["2027/1", "2027/2", "2028/1"].
 * @param {Date} [today]
 * @returns {string[]}
 */
export function nextEditions(today = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "numeric" }).formatToParts(today);
  let year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  let half = month <= 6 ? 1 : 2;
  const out = [];
  for (let i = 0; i < 3; i++) {
    out.push(`${year}/${half}`);
    if (half === 2) {
      year += 1;
      half = 1;
    } else {
      half = 2;
    }
  }
  return out;
}

/**
 * @typedef {{
 *   public_name: string, handle: string, school: string, city: string, goal: string, exam: string, bio: string,
 *   areas: string[], role_pref: "med" | "ator" | "any", pace: "livre" | "cronometrado" | "simulacao",
 *   days: string[], shifts: string[], radar_visible: boolean, allow_direct_invites: boolean, show_school: boolean, show_stats: boolean
 * }} Draft
 * @typedef {{
 *   profile: (Partial<Draft> & { public_name: string }) | null,
 *   defaults?: { public_name?: string | null, exam?: string | null } | null,
 *   stats?: { done: number, avg: number | null } | null
 * }} AppDuplaProfile
 */

/**
 * Rascunho do formulário. Com perfil salvo, é o perfil (texto vazio no lugar de nulo). Na primeira vez: o nome da Conta,
 * a edição-alvo da Conta se ela estiver entre as três próximas (senão a primeira), papel "any", ritmo "cronometrado",
 * os quatro interruptores ligados e listas vazias.
 * @param {AppDuplaProfile} data
 * @param {Date} [today]
 * @returns {Draft}
 */
export function profileDraft(data, today = new Date()) {
  const saved = data?.profile ?? null;
  if (saved) {
    return {
      public_name: saved.public_name ?? "",
      handle: saved.handle ?? "",
      school: saved.school ?? "",
      city: saved.city ?? "",
      goal: saved.goal ?? "",
      exam: saved.exam ?? "",
      bio: saved.bio ?? "",
      areas: [...(saved.areas ?? [])],
      role_pref: saved.role_pref ?? "any",
      pace: saved.pace ?? "cronometrado",
      days: [...(saved.days ?? [])],
      shifts: [...(saved.shifts ?? [])],
      radar_visible: saved.radar_visible ?? true,
      allow_direct_invites: saved.allow_direct_invites ?? true,
      show_school: saved.show_school ?? true,
      show_stats: saved.show_stats ?? true,
    };
  }
  const editions = nextEditions(today);
  const target = data?.defaults?.exam ?? "";
  return {
    public_name: data?.defaults?.public_name ?? "",
    handle: "",
    school: "",
    city: "",
    goal: "",
    exam: editions.includes(target) ? target : editions[0],
    bio: "",
    areas: [],
    role_pref: "any",
    pace: "cronometrado",
    days: [],
    shifts: [],
    radar_visible: true,
    allow_direct_invites: true,
    show_school: true,
    show_stats: true,
  };
}

/**
 * @param {Draft} d
 * @returns {{ public_name?: string }}
 */
export function draftErrors(d) {
  return String(d?.public_name ?? "").trim().length < 3 ? { public_name: "Informe como você quer aparecer para os colegas." } : {};
}

/** Liga ou desliga um item da lista, sempre na ordem canônica (a mesma em que o servidor grava). */
export function toggleInOrder(list, item, order) {
  const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  return order.filter((x) => next.includes(x));
}

export const AREA_ORDER = AREAS.map((a) => a.code);
export const DAY_ORDER = DAYS;
export const SHIFT_ORDER = SHIFTS;

/** O que vai em `p_profile`: textos aparados; prova vazia não vai; @ vazio não vai (o servidor sorteia um no perfil novo). */
export function draftPayload(d) {
  const { exam, handle, ...rest } = d;
  return {
    ...rest,
    ...(handle && handle.trim() ? { handle: handle.trim().toLowerCase() } : {}),
    public_name: d.public_name.trim(),
    school: d.school.trim(),
    city: d.city.trim(),
    goal: d.goal.trim(),
    ...(exam ? { exam } : {}),
  };
}
