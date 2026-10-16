// Substitui src/novo/app/session.jsx só na prévia: "banco" em memória com as funções app_* das telas da onda 5.
// TUDO é DADO DE TESTE (nenhum aluno real). ?papel=aluno|equipe  ?vazio=1 (sem respostas)  ?plano=trial|pro|elite
import React from "react";

const q = new URLSearchParams(location.search);
const papel = q.get("papel") || "aluno";
const vazio = q.get("vazio") === "1";
const plano = q.get("plano") || "trial";
const day = (n) => new Date(Date.UTC(2026, 9, 15 - n)).toISOString().slice(0, 10);

const performance = vazio
  ? { attempts: 0 }
  : {
      attempts: 11, correct: 6, questions: 11, days: 30, avg_seconds: 6,
      period: { attempts: 11, correct: 6 }, previous: { attempts: 0, correct: 0 },
      simulados: { count: 2, accuracy: 0 },
      daily: [
        { day: day(8), attempts: 2, correct: 2 }, { day: day(4), attempts: 2, correct: 2 },
        { day: day(3), attempts: 4, correct: 1 }, { day: day(0), attempts: 3, correct: 1 },
      ],
      areas: [
        { area: "CLINICA_MEDICA", attempts: 1, correct: 0 }, { area: "CIRURGIA_GERAL", attempts: 3, correct: 2 },
        { area: "GINECOLOGIA_OBSTETRICIA", attempts: 5, correct: 3 }, { area: "PEDIATRIA", attempts: 0, correct: 0 },
        { area: "MEDICINA_FAMILIA_COMUNIDADE", attempts: 2, correct: 1 },
      ],
    };
const errorProfile = { wrong: 5, attempts: 11, days: 30, diagnosed: 0, error_types: [], kinds: {}, fixed_ideas: 0, confidence: { wrong_but_sure: 0, wrong_and_guessing: 0 }, traps: [], weak_points: [] };
const report = {
  insights: [],
  sessions: { count: 15, minutes: 13, voice_minutes: 9, questions_discussed: 2 },
  recurrent_errors: [],
  mastery: { areas: [
    { area: "CIRURGIA_GERAL", attempts: 3, accuracy: 67, level: "SEM_DADOS" }, { area: "CLINICA_MEDICA", attempts: 1, accuracy: 0, level: "SEM_DADOS" },
    { area: "GINECOLOGIA_OBSTETRICIA", attempts: 5, accuracy: 60, level: "INTERMEDIARIO" }, { area: "MEDICINA_FAMILIA_COMUNIDADE", attempts: 2, accuracy: 50, level: "SEM_DADOS" },
    { area: "PEDIATRIA", attempts: 0, accuracy: 0, level: "SEM_DADOS" },
  ] },
  highest_risk_area: "GINECOLOGIA_OBSTETRICIA",
  critical_topics: [],
  evolution: { last_30: { attempts: 11, correct: 6 }, previous_30: { attempts: 0, correct: 0 } },
  reviews: { due: 0, scheduled: 0 },
  tutor: { correct: 2, answers: 2, wrong_but_sure: 0, lucky_guesses: 0, with_heavy_hints: 0, avg_hints: 0, error_classes: {} },
  error_types: {},
};
const planning = {
  today: "2026-10-15", days_to_exam: null, target_edition: null, exam_type: "REVALIDA", unanswered: 1205, last_7_days: 9, daily_target: 20,
  week: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].map((d, i) => ({ day: d, questions: [2, 6, 0, 1, 0, 0, 0][i], flashcards: [0, 0, 0, 1, 0, 0, 0][i] })),
  month_active_days: [7, 12, 13, 15],
};
const plans = {
  tutor_paid: true, pro_voice_daily_minutes: 60, elite_voice_daily_minutes: 60, elite_station_feedback: false,
  plans: [
    { code: "trial", name: "Teste grátis", description: "", features: [], offered_at_signup: true },
    { code: "pro", name: "Pro", description: "", features: [] }, { code: "elite", name: "Elite", description: "", features: [] },
  ],
};
const sub = plano === "trial" ? { plan: "trial", status: "trialing", trial_ends_at: "2026-10-22T12:00:00Z" } : { plan: plano, status: "active", current_period_end: "2026-11-15T12:00:00Z" };
const boot = {
  role: papel === "equipe" ? "admin" : "student",
  profile: { name: "Aluno de Teste", phone: null, theme: "light", phase: 1, exam_type: "REVALIDA", target_edition: "", exam_date: "", daily_minutes: 60, graduation_country: "", graduation_university: "", graduation_year: "" },
  subscription: papel === "equipe" ? null : sub,
  legal: { termo_uso: { accepted: "1.0", accepted_at: "2026-10-08T15:00:00Z", current: "1.0" }, tutor_ia: { accepted: null, current: "1.0" } },
  reviewer_areas: [], has_pro: false, days_to_exam: null,
};
const RPC = {
  app_performance: () => performance, app_error_profile: () => errorProfile, app_error_reasons: () => ({ declared: {}, wrong_questions: 5 }),
  app_tutor_status: () => ({ enabled: true, available: true, consent_required: false }), app_tutor_report: () => report,
  app_planning: () => planning, app_today: () => ({ done: 0, total: 2 }), app_plans_info: () => plans,
  app_my_access: () => ({ locked: false }), app_support_contact: () => ({ email: "suporte@staziamed.com.br" }), app_my_benefits: () => null,
  app_gamification_preferences: () => ({ display_name: "Aluno de Teste", leaderboard_visibility: "hidden", username: "", show_avatar: false, show_accuracy: false, show_streak: false, show_achievements: false }),
  app_gamification_history: () => ({ entries: [] }),
};
const backend = {
  accessToken: "token-de-teste-da-previa",
  rpc: async (name, args) => { if (name === "app_update_profile") return { ...boot, profile: { ...boot.profile, ...args.p_patch } }; const f = RPC[name]; if (!f) throw new Error("sem função na prévia: " + name); return f(args); },
  updatePassword: async () => {}, signOut: async () => alert("Sair (prévia)"), getUser: async () => ({ email: "aluno.teste@exemplo.com" }),
};
let state = { status: "ready", backend, user: { email: "aluno.teste@exemplo.com" }, boot, error: null, recovery: false };
const ctx = React.createContext(null);
export function SessionProvider({ children }) {
  const [s, setS] = React.useState(state);
  const value = React.useMemo(() => ({ ...s, refresh: async () => {}, signOut: async () => alert("Sair (prévia)"), finishRecovery() {}, async updateProfile(patch) { setS((x) => ({ ...x, boot: { ...x.boot, profile: { ...x.boot.profile, ...patch } } })); } }), [s]);
  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}
export function useSession() { return React.useContext(ctx); }
export function rememberChoice() {}
