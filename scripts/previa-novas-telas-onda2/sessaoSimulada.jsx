// Substitui src/novo/app/session.jsx só na prévia (ver vite.config.mjs). Um "banco" em memória com as funções app_* que o Início, o Plano e o
// "Mais" usam. DADOS DE TESTE, no mesmo formato do banco. Parâmetros da URL: ?vazio=1 (aluno sem respostas), ?semplay=1 ou ?arena=0 (Stazia Arena desligada), ?semliga=1 (fora do ranking e da liga),
// ?teste=1 (teste grátis com 20 das 74 inéditas liberadas), ?tudofeito=1.
// Onda 6 (Stazia Arena): ?rota=trilha (trilha no formato do pacote; &trilhaandamento=1 com etapas feitas), ?missoesfeitas=1,
// ?rankcheio=1 (ranking com linhas de TESTE "Aluno de teste A..."), ?liga=1 (aluno dentro de um grupo da liga, linhas de TESTE).
import React from "react";

const q = new URLSearchParams(location.search);
const ARENA_OFF = Boolean(q.get("semplay")) || q.get("arena") === "0";
const TESTE = Boolean(q.get("teste"));
const SEM_LIGA = Boolean(q.get("semliga"));
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
const boot = () => ({ role: "student", profile: state.profile, play: { enabled: !ARENA_OFF, streak: 0 }, streak_days: 0, flashcards_due: 0, days_to_exam: null, subscription: null, has_pro: false, reviewer_areas: [] });
const MIS = [
  { slug: "m1", title: "Acerte 15 questões", progress: 0, target: 15, done: false, xp: 20 },
  { slug: "m2", title: "Estude 2 áreas diferentes", progress: 0, target: 2, done: false, xp: 10 },
  { slug: "m3", title: "Revise 4 questões erradas", progress: 0, target: 4, done: false, xp: 10 },
];
// ---- Onda 6: dados de TESTE da Stazia Arena, no mesmo formato das funções do banco (nunca vão ao aluno) ----
const ANDAMENTO = Boolean(q.get("trilhaandamento"));
const PED = [["Pediatria", 10, 129], ["Neonatologia", 10, 19], ["Cirurgia pediátrica", 4, 4], ["Infectologia pediátrica", 4, 4], ["Endocrinologia pediátrica", 3, 3], ["Nefrologia pediátrica", 3, 3], ["Intoxicação exógena na infância", 2, 2], ["Pneumologia pediátrica", 2, 2], ["Puericultura", 2, 2], ["Aleitamento materno", 1, 1], ["Asma na infância", 1, 1], ["Assistência imediata ao recém-nascido prematuro", 1, 1]];
const pedNode = ([topic, goal, questions], i) => {
  if (!ANDAMENTO) return { topic, position: i + 1, goal, questions, answered: 0, attempts: 0, correct: 0, accuracy: null, state: i === 0 ? "available" : "locked" };
  const st = i === 0 ? "mastered" : i < 3 ? "completed" : i === 3 ? "in_progress" : "locked";
  const answered = st === "in_progress" ? 2 : st === "locked" ? 0 : goal;
  return { topic, position: i + 1, goal, questions, answered, attempts: answered, correct: st === "mastered" ? goal - 1 : Math.max(0, answered - 1), accuracy: answered ? Math.round((100 * (st === "mastered" ? goal - 1 : answered - 1)) / answered) : null, state: st };
};
const testeNodes = (n) => Array.from({ length: n }, (_, i) => ({ topic: `Etapa de teste ${i + 1}`, position: i + 1, goal: 10, questions: 20, answered: 0, attempts: 0, correct: 0, accuracy: null, state: i === 0 ? "available" : "locked" }));
const trilhaPacote = () => ({
  enabled: true, goal: 10, mastery_accuracy: 80,
  areas: [
    { area: "PEDIATRIA", label: "Pediatria", total: 12, done: ANDAMENTO ? 3 : 0, mastered: ANDAMENTO ? 1 : 0, nodes: PED.map(pedNode), simulado: { state: "locked", done: 0, unlock_pct: 70 } },
    { area: "CLINICA_MEDICA", label: "Clínica Médica", total: 12, done: 0, mastered: 0, nodes: testeNodes(12), simulado: { state: "locked", done: 0, unlock_pct: 70 } },
    { area: "CIRURGIA_GERAL", label: "Cirurgia", total: 12, done: 0, mastered: 0, nodes: testeNodes(12), simulado: { state: "locked", done: 0, unlock_pct: 70 } },
    { area: "GINECOLOGIA_OBSTETRICIA", label: "Gineco & Obstetrícia", total: 12, done: 0, mastered: 0, nodes: testeNodes(12), simulado: { state: "locked", done: 0, unlock_pct: 70 } },
  ],
});
const FEITAS = Boolean(q.get("missoesfeitas"));
const mis = (slug, title, kind, icon, progress, target, xp, coins, done = false) => ({ slug, title, kind, icon, progress: done ? target : progress, target, done, xp, coins });
const missoes = () => ({
  today: "2026-10-15", week_start: "2026-10-12", week_end: "2026-10-18",
  daily_bonus: { xp: 50, coins: 25, done: FEITAS },
  daily: [mis("daily_correct", "Acerte 15 questões", "correct", "target", 0, 15, 15, 5, FEITAS), mis("daily_areas", "Estude 2 áreas diferentes", "areas", "layers", 0, 2, 10, 5, FEITAS), mis("daily_review", "Revise 4 questões erradas", "review", "notebook-pen", 0, 4, 15, 5, FEITAS)],
  weekly: [mis("weekly_questions", "Responda 150 questões na semana", "questions", "file-question", 3, 150, 60, 20), mis("weekly_accuracy", "Mantenha 75% de precisão na semana", "accuracy", "target", 0, 75, 60, 20), mis("weekly_areas", "Estude 4 áreas diferentes", "areas", "layers", 3, 4, 30, 10), mis("weekly_review", "Revise 30 erros", "review", "notebook-pen", 0, 30, 40, 15), mis("weekly_simulado", "Complete 1 simulado", "simulados", "timer", 0, 1, 50, 20)],
});
const RANK_CHEIO = Boolean(q.get("rankcheio"));
const testeRow = (rank, letra, value, extra = {}) => ({ rank, public_id: `teste${rank}`, name: `Aluno de teste ${letra}`, avatar: `Aluno ${letra}`, level: "explorador", accuracy: 70 - rank, streak: rank === 1 ? 6 : null, is_me: false, value, ...extra });
const ranking = ({ p_kind }) =>
  RANK_CHEIO
    ? { enabled: true, kind: p_kind, total: 5, offset: 0, limit: 50, rows: [testeRow(1, "A", 512), testeRow(2, "B", 470), testeRow(3, "C", 383, { name: "Você", avatar: "João Paulo Mendes", is_me: true }), testeRow(4, "D", 301), testeRow(5, "E", 250)], me: { rank: 3, total: 5, value: 383, percentile: 60, week_change: 2, next: [{ rank: 2, gap: 87 }] } }
    : { enabled: true, kind: p_kind, total: 0, offset: 0, limit: 50, rows: [], me: null };
const LIGAS = [["bronze", "Bronze", 1, "medal"], ["prata", "Prata", 2, "medal"], ["ouro", "Ouro", 3, "medal"], ["platina", "Platina", 4, "gem"], ["diamante", "Diamante", 5, "gem"], ["elite", "Elite", 6, "crown"], ["revalida_master", "Revalida Master", 7, "trophy"]].map(([slug, name, position, icon]) => ({ slug, name, position, icon, color_token: `--league-${slug === "revalida_master" ? "master" : slug}` }));
const liga = () =>
  q.get("liga")
    ? { enabled: true, joined: true, season: { starts_on: "2026-10-12", ends_on: "2026-10-18" }, league: LIGAS[0], leagues: LIGAS, group_no: 1, promote: 5, relegate: 5, min_group_for_relegation: 10, group_size: 30,
        rows: Array.from({ length: 12 }, (_, i) => ({ ...testeRow(i + 1, String.fromCharCode(65 + i), 0), position: i + 1, weekly_xp: 300 - i * 20, ...(i === 6 ? { name: "Você", avatar: "João Paulo Mendes", is_me: true } : {}) })), history: [] }
    : { enabled: true, joined: false, ends_on: "2026-10-18", leagues: LIGAS };
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
          trial: TESTE ? { days_left: 5, ends_at: new Date(Date.now() + 5 * 86400000).toISOString() } : null,
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
  app_my_ineditas: () => (TESTE ? { total: 74, released: 20, answered: 3, limit: 20, limited: true, locked: false } : { total: 74, released: 74, answered: 0, limit: null, limited: false, locked: false }),
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
    weekly_rank: SEM_LIGA ? null : { rank: 12, total: 340, percentile: 96 },
    league: SEM_LIGA ? null : { slug: "bronze", name: "Bronze", icon: "medal", position: 12, group_size: 30, weekly_xp: 120 },
    recent_achievements: [],
    flags: { leaderboard: true, leagues: true, trail: true },
  }),
  app_trail: () => (q.get("rota") === "trilha" ? trilhaPacote() : { enabled: true, areas: [{ area: "CIRURGIA_GERAL", label: "Cirurgia", done: 0, total: 60, nodes: nodes(3) }, { area: "PEDIATRIA", label: "Pediatria", done: 0, total: 60, nodes: [] }] }),
  app_gamification_missions: () => missoes(),
  app_leaderboard: (a) => ranking(a),
  app_leaderboard_near_me: (a) => ({ ...ranking(a), rows: ranking(a).rows }),
  app_public_profile: () => ({ name: "Aluno de teste A", avatar: "Aluno A", level_info: { name: "Explorador" }, score: 512, provisional: false, rank: 1, total: 5, questions: 120, accuracy: 69, streak: 6, achievements: [] }),
  app_league_current: () => liga(),
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
