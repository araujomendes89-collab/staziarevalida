// Sessão e banco simulados da prévia (74 inéditas: lotes de 24, 25 e 25). Nada sai do navegador.
import React from "react";

export const TOTAL = 74;
const state = {
  profile: "teste", // teste | pro | vencido
  limits: { trial: 20, pro: null, elite: null },
  answered: { teste: 3, pro: 12, vencido: 0 },
};
const listeners = new Set();
export const preview = {
  get: () => state,
  set(patch) {
    Object.assign(state, patch);
    listeners.forEach((f) => f());
  },
  subscribe: (f) => (listeners.add(f), () => listeners.delete(f)),
};

const LOCK = "Seu teste grátis terminou. As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
function ineditasEntry() {
  const p = state.profile;
  const lim = p === "teste" ? state.limits.trial : p === "pro" ? state.limits.pro : 0;
  const locked = p === "vencido";
  const released = locked ? 0 : lim == null ? TOTAL : Math.min(lim, TOTAL);
  return { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas", total: TOTAL, locked, lock_message: locked ? LOCK : null, released, answered: state.answered[p], limited: locked || lim != null };
}

const backend = {
  async rpc(fn, args) {
    await new Promise((r) => setTimeout(r, 120));
    if (fn === "app_question_filters") {
      return { total: 1200, exams: [{ id: "revalida-2025-1", kind: "REVALIDA", year: 2025, semester: 1, title: "Revalida 2025/1", total: 100 }, ineditasEntry()], topics: [] };
    }
    if (fn === "app_count_questions") {
      const e = ineditasEntry();
      const n = args?.p_filters?.exam_id === "staziamed" ? e.released : 1200;
      return { total: n, by_area: { PEDIATRIA: Math.round(n * 0.2), CLINICA_MEDICA: Math.round(n * 0.2) } };
    }
    if (fn === "app_recent_sessions") return [];
    if (fn === "app_my_access") return state.profile === "vencido" ? { locked: true, state: "teste_acabou", tutor_closed: false } : { locked: false, state: null, tutor_closed: false };
    if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
    if (fn === "app_admin_plans") return [];
    if (fn === "app_admin_ineditas_limits")
      return { published: TOTAL, plans: ["trial", "pro", "elite"].map((plan) => ({ plan, limit: state.limits[plan], all: state.limits[plan] == null })) };
    if (fn === "app_admin_save_ineditas_limits") {
      Object.assign(state.limits, args.p_limits);
      listeners.forEach((f) => f());
      return backend.rpc("app_admin_ineditas_limits");
    }
    return null;
  },
};

const value = { backend, refresh: async () => {}, boot: { role: "admin", profile: { name: "Aluna de teste" } }, user: { id: "u1" } };
export const useSession = () => value;
export const SessionProvider = ({ children }) => children;
