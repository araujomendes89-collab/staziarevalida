// Substitui src/novo/app/session.jsx só na prévia da voz do Tutor: banco SIMULADO (dados de exemplo), sem login e sem rede.
import React from "react";

const params = new URLSearchParams(location.search);
const SID = "22222222-2222-4222-8222-222222222222";
const PERSONALIDADES = [
  { id: "durao", name: "Durão", emoji: "🔥", tagline: "Exigente e firme.", character: "stazi", swears: true, voice: {} },
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Calmo, sem pressa.", character: "stazi", swears: false, voice: {} },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Exigente e firme.", character: "stazia", swears: true, voice: {} },
  { id: "tranquila", name: "Tranquila", emoji: "😌", tagline: "Calma e acolhedora.", character: "stazia", swears: false, voice: {} },
];
const escolhida = params.get("personagem") === "stazia" ? "tranquila" : "acolhedor";
const ENT = {
  enabled: true, mode: "paid", is_paid: true, staff: false, can_use: true, can_text: true, can_voice: true, text: { used: 2, limit: 40, remaining: 38 },
  voice: { enabled: true, remaining_s: 8 * 60 }, questions: { limit: null, used: 0 }, trial: { state: "none", days: 7 },
};
const RESUMO_BOM = {
  questions_answered: 3, correct: 2, concepts_mastered: ["critérios de gravidade da pré-eclâmpsia"], errors_detected: [{ error_type: "conduta" }],
  recurrent_errors: [], needs_review: ["dose do sulfato de magnésio"], next_recommended_topics: ["Hipertensão na gestação"],
};
const RESUMO_CURTO = { questions_answered: 0, concepts_mastered: [], errors_detected: [], recurrent_errors: [], needs_review: [], next_recommended_topics: [] };

export const banco = { sessao: null, fechada: false, mensagens: [] };
const personalidade = (id) => PERSONALIDADES.find((p) => p.id === id) ?? PERSONALIDADES[1];
const sessao = (id) => ({
  id: SID, mode: "livre", title: "Perguntar ao Tutor", topic: params.get("resumo") === "curta" ? null : "Hipertensão na gestação", status: banco.fechada ? "closed" : "active",
  question_state: "none", hint_level: 0, read_only: false,
  summary: banco.fechada ? (params.get("resumo") === "curta" ? RESUMO_CURTO : RESUMO_BOM) : null,
  personality: { ...personalidade(id), voice: {} }, question: null, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "[Exemplo] Oi! Vamos estudar o que hoje?" }, ...banco.mensagens],
});

const RPC = {
  app_tutor_status: () => ({
    enabled: true, available: true, consent_required: false, requires_pro: true, daily_limit: 40, used_today: 2, voice_enabled: true, reviews_due: 0,
    entitlement: ENT, preferences: { personality_id: escolhida, character: params.get("personagem") === "stazia" ? "stazia" : "stazi", chosen: true, profanity: "off" },
    personalities: PERSONALIDADES,
  }),
  app_tutor_start: (a) => ((banco.fechada = false), (banco.mensagens = []), (banco.sessao = a.p_personality), sessao(a.p_personality)),
  app_tutor_session: () => sessao(banco.sessao ?? escolhida),
  app_tutor_close: () => ((banco.fechada = true), true),
  app_tutor_sessions: () => [],
  app_tutor_set_character: (a) => ({ character: a.p_character, personality_id: a.p_character === "stazia" ? "tranquila" : "acolhedor" }),
  app_my_access: () => ({ full: true }),
  app_support_contact: () => ({ email: "suporte@exemplo.com" }),
};
const backend = {
  rpc: async (fn, args) => {
    await new Promise((r) => setTimeout(r, 60));
    if (!RPC[fn]) throw new Error(`rpc não simulada na prévia: ${fn}`);
    return RPC[fn](args ?? {});
  },
  accessToken: async () => "token-da-previa",
};
const valor = { backend, user: { id: "aluno-da-previa" }, boot: { role: "student", has_pro: true, subscription: { plan: "pro", status: "active" } } };

export function SessionProvider({ children }) {
  return children;
}
export const useSession = () => valor;
export const useOptionalSession = () => valor;
export const rememberChoice = () => {};
