// Substitui src/novo/app/session.jsx só na prévia (ver vite.config.mjs). Um "banco" em memória com as funções app_* que o Início, o Plano e o
// "Mais" usam. DADOS DE TESTE, no mesmo formato do banco. Parâmetros da URL: ?vazio=1 (aluno sem respostas), ?semplay=1, ?tudofeito=1.
import React from "react";

const q = new URLSearchParams(location.search);
const state = {
  profile: { name: "João Paulo Mendes", phase: 1, theme: q.get("tema") === "escuro" ? "dark" : "light", daily_minutes: 60, exam_date: null },
  tasks: q.get("tudofeito")
    ? [
        { id: "t1", kind: "praticar", title: "20 questões de Pediatria", minutes: 40, progress: 20, target: 20, done: true, ref: { area: "PEDIATRIA", reason: "untrained", attempts: 0 } },
        { id: "t2", kind: "revisar", title: "Rever 5 questões erradas", minutes: 10, progress: 5, target: 5, done: true, ref: { reason: "errors" } },
      ]
    : [
        { id: "t1", kind: "praticar", title: "20 questões de Pediatria", minutes: 40, progress: 0, target: 20, done: false, ref: { area: "PEDIATRIA", reason: "untrained", attempts: 0 } },
        { id: "t2", kind: "revisar", title: "Rever 5 questões erradas", minutes: 10, progress: 0, target: 5, done: false, ref: { reason: "errors" } },
      ],
};
const todayPlan = () => ({ tasks: state.tasks, done: state.tasks.filter((t) => t.done).length, total: state.tasks.length });
const boot = () => ({ role: "student", profile: state.profile, play: { enabled: !q.get("semplay"), streak: 0 }, streak_days: 0, flashcards_due: 0, days_to_exam: null, subscription: null, has_pro: false, reviewer_areas: [] });
const MIS = [
  { slug: "m1", title: "Acerte 15 questões", progress: 0, target: 15, done: false, xp: 20 },
  { slug: "m2", title: "Estude 2 áreas diferentes", progress: 0, target: 2, done: false, xp: 10 },
  { slug: "m3", title: "Revise 4 questões erradas", progress: 0, target: 4, done: false, xp: 10 },
];
const nodes = (n) => Array.from({ length: n }, (_, i) => ({ topic: i === 0 ? "Coloproctologia" : `Tema ${i}`, state: i === 0 ? "in_progress" : "locked", answered: i === 0 ? 1 : 0, goal: 8 }));
const RPC = {
  app_bootstrap: () => boot(),
  app_update_profile: ({ p_patch }) => (Object.assign(state.profile, p_patch), boot()),
  app_home: () =>
    q.get("vazio")
      ? { attempts: 0, correct: 0, wrong_pending: 0, open_session: null, trial: null, week: { attempts: 0, correct: 0, days_active: 0 }, previous_week: { attempts: 0, correct: 0 }, today: { attempts: 0 }, priority_topics: [] }
      : {
          attempts: 20,
          correct: 11,
          wrong_pending: 5,
          trial: null,
          open_session: { id: "s1", kind: "treino", status: "all", area: null, total: 20, answered: 2, paused: false, remaining_seconds: null },
          week: { attempts: 9, correct: 5, days_active: 3 },
          previous_week: { attempts: 0, correct: 0 },
          today: { attempts: 0 },
          priority_topics: [
            { area: "CIRURGIA_GERAL", topic: "Cirurgia geral e trauma", questions: 30, ineditas: 0, correct: 0, attempts: 0 },
            { area: "PEDIATRIA", topic: "Geriatria", questions: 9, ineditas: 0, correct: 1, attempts: 4 },
            { area: "CLINICA_MEDICA", topic: "Infectologia", questions: 2, ineditas: 0, correct: 0, attempts: 0 },
            { area: "CLINICA_MEDICA", topic: "Cardiologia", questions: 12, ineditas: 0, correct: 3, attempts: 8 },
          ],
        },
  app_today: () => todayPlan(),
  app_announcement: () => null,
  app_my_ineditas: () => ({ total: 74, released: 74, answered: 0, limit: null, limited: false, locked: false }),
  app_set_plan_task: ({ p_task_id, p_done }) => (state.tasks.forEach((t) => t.id === p_task_id && (t.done = p_done)), todayPlan()),
  app_start_plan_task: () => ({ session_id: "s-previa" }),
  app_start_trail_node: () => ({ session_id: "s-previa" }),
  app_gamification_summary: () => ({
    enabled: true,
    score: 383,
    level: { name: "Explorador", icon: "sprout" },
    next_level: { name: "Praticante", min_score: 400 },
    names: { score: "Stazia Score" },
    questions: 23,
    provisional: false,
    streak: { today: { questions: 0, min_questions: 10, min_minutes: 20 }, today_done: false, current: 0 },
    missions: { done: 0, total: 3, items: MIS },
    weekly_rank: null,
    recent_achievements: [],
    flags: { leaderboard: true, leagues: true, trail: true },
  }),
  app_trail: () => ({ enabled: true, areas: [{ area: "CIRURGIA_GERAL", label: "Cirurgia", done: 0, total: 60, nodes: nodes(3) }, { area: "PEDIATRIA", label: "Pediatria", done: 0, total: 60, nodes: [] }] }),
  app_my_access: () => ({ locked: false }),
};
const backend = {
  async rpc(fn, args = {}) {
    const f = RPC[fn];
    if (!f) throw new Error("função de teste ausente: " + fn);
    return f(args);
  },
  async getUser() {
    return { id: "previa" };
  },
  onAuthChange() {
    return () => {};
  },
  async signOut() {},
};
const value = { backend, boot: boot(), user: { id: "previa" }, status: "ready", refresh: async () => {}, updateProfile: async (patch) => RPC.app_update_profile({ p_patch: patch }), signOut: async () => alert("Sair (prévia)") };
export function useSession() {
  return { ...value, boot: boot() };
}
export function useOptionalSession() {
  return useSession();
}
export function SessionProvider({ children }) {
  return children;
}
export function rememberChoice() {}
