// Sessão e banco simulados da prévia (74 inéditas). Nada sai do navegador; nenhum dado real.
import React from "react";

export const TOTAL = 74;
const state = { profile: "teste" }; // teste | pago_limite | pro | vencido | sem_inedita
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
export function myIneditas() {
  switch (state.profile) {
    case "teste": return { total: TOTAL, released: 20, answered: 3, limit: 20, limited: true, locked: false, lock_message: null };
    case "pago_limite": return { total: TOTAL, released: 40, answered: 12, limit: 40, limited: true, locked: false, lock_message: null };
    case "pro": return { total: TOTAL, released: TOTAL, answered: 12, limit: null, limited: false, locked: false, lock_message: null };
    case "vencido": return { total: TOTAL, released: 0, answered: 0, limit: 0, limited: true, locked: true, lock_message: LOCK };
    default: return { total: 0, released: 0, answered: 0, limit: 0, limited: true, locked: false, lock_message: null };
  }
}
const entry = () => ({ id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas", ...myIneditas() });

const SUPPORT = { type: "TABLE", title: "Exames da admissão", rows: [{ label: "Hemoglobina", value: "11 g/dL" }, { label: "Leucócitos", value: "14.000/mm3" }] };
const question = (over = {}) => ({
  id: "staziamed_q0012", code: "STZ-0012", number: 12, area: "PEDIATRIA", origin: "staziamed", support: SUPPORT,
  exam: { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas" },
  statement: "Lactente de 8 meses, previamente hígido, com febre há 3 dias e otalgia à esquerda. Ao exame, membrana timpânica abaulada e hiperemiada. Qual é a conduta inicial mais adequada?",
  images: [], bookmarked: false, selected: null, active_ms: 0, correction: null,
  options: [["A", "Observação por 48 horas sem antibiótico"], ["B", "Amoxicilina por via oral"], ["C", "Ceftriaxona intramuscular"], ["D", "Azitromicina por via oral"]].map(([id, text]) => ({ id, text })), ...over,
});
const CORRECTION = {
  is_correct: true, correct_option: "B", topic: "Otite média aguda", subtopic: null, explanation: "Exemplo de explicação (dados simulados).",
  option_notes: [], expected_conduct: "Exemplo de conduta esperada (dados simulados).", inep_intent: null, origin: "staziamed", support: SUPPORT, sources: [], official_sources: [],
};
const HOME_ACTIVE = {
  attempts: 42, correct: 27, open_session: null, trial: null, priority_topics: [], streak_days: 3, wrong_pending: 5,
  week: { attempts: 31, correct: 20, days_active: 3 }, previous_week: { attempts: 20, correct: 11 }, today: { attempts: 4, correct: 3 },
};

const backend = {
  async rpc(fn, args) {
    await new Promise((r) => setTimeout(r, 120));
    if (fn === "app_my_ineditas") return myIneditas();
    if (fn === "app_question_filters") return { total: 1200, exams: [{ id: "revalida-2025-1", kind: "REVALIDA", year: 2025, semester: 1, title: "Revalida 2025/1", total: 100 }, ...(state.profile === "sem_inedita" ? [] : [entry()])], topics: [] };
    if (fn === "app_count_questions") return { total: args?.p_filters?.exam_id === "staziamed" ? myIneditas().released : 1200, by_area: { PEDIATRIA: 40, CLINICA_MEDICA: 40 } };
    if (fn === "app_recent_sessions") return [];
    if (fn === "app_my_access") return state.profile === "vencido" ? { locked: true, state: "teste_acabou", tutor_closed: false } : { locked: false, state: null, tutor_closed: false };
    if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
    if (fn === "app_home") return state.novo ? { ...HOME_ACTIVE, attempts: 0 } : HOME_ACTIVE;
    if (fn === "app_today") return { tasks: [{ id: "t1", kind: "praticar", title: "Pediatria · 10 questões", minutes: 25, done: false, ref: {} }], total: 1, done: 0 };
    if (fn === "app_announcement") return null;
    if (fn === "app_get_session") return { id: "s1", kind: "questoes", filters: { exam_id: "staziamed" }, started_at: new Date(Date.now() - 60000).toISOString(), finished_at: null, server_now: new Date().toISOString(), collection: "staziamed", locked: false, result: null, questions: [question(state.answered ? { selected: "B", correction: CORRECTION } : {})] };
    if (fn === "app_answer_question") return { ...CORRECTION, selected: args.p_option };
    if (fn === "app_start_session") return { session_id: "s1", count: 20 };
    return null;
  },
};

const value = { backend, refresh: async () => {}, boot: { role: "student", profile: { name: "Aluna de teste", daily_minutes: 60, exam_date: null } }, user: { id: "u1" } };
export const useSession = () => value;
export const SessionProvider = ({ children }) => children;
