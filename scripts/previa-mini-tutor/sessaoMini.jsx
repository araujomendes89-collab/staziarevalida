// Substitui src/novo/app/session.jsx só na prévia do Mini Tutor: o banco simulado da prévia de questões + as funções do Tutor e da
// aula. Tudo é DADO SIMULADO de demonstração (textos de exemplo), sem login, sem rede e sem IA.
import React from "react";
import { useSession as sessaoDasQuestoes } from "../previa-questoes/sessaoSimulada.jsx";

const params = new URLSearchParams(location.search);
const LIMITE = 40;
export const saldo = { usadas: params.get("saldo") === "acabou" ? LIMITE : params.get("saldo") === "pouco" ? 37 : 12 };
const SID = "11111111-1111-4111-8111-111111111111";

const PERSONALIDADES = [
  { id: "durao", name: "Durão", emoji: "🔥", character: "stazi" },
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", character: "stazi" },
  { id: "durona", name: "Durona", emoji: "🔥", character: "stazia" },
  { id: "tranquila", name: "Tranquila", emoji: "😌", character: "stazia" },
];
const personalidade = params.get("personagem") === "stazia" ? "tranquila" : "acolhedor";

export const AULA = {
  lesson_id: "22222222-2222-4222-8222-222222222222",
  titulo: "Bronquiolite viral aguda: do primeiro chiado à conduta de suporte",
  atualizado_em: "2026-10-14T12:00:00Z",
  cabecalho: "[Texto de exemplo da prévia] Resumo curto da aula.",
  pontos_chave: ["Diagnóstico clínico.", "Suporte é a conduta."],
  secoes: [
    { titulo: "Caso clínico de abertura", paragrafos: ["[Exemplo] Helena, 4 meses, chiado há um dia, depois de dois dias de coriza."], estilos: ["caso"] },
    { titulo: "Bloco 1 · Quadro típico em lactentes", paragrafos: ["[Exemplo] Primeiro episódio de sibilância em menor de 2 anos, após quadro gripal.", "Tome nota: o VSR é o agente mais comum."], estilos: ["normal", "normal"] },
    { titulo: "Bloco 2 · Sinais de gravidade", paragrafos: ["[Exemplo] Desconforto respiratório, saturação baixa, recusa alimentar e apneia indicam internação."], estilos: ["normal"] },
    { titulo: "Erros frequentes na prova", paragrafos: ["[Exemplo] Tratar como asma. Pedir radiografia de rotina. Dar antibiótico sem infecção."], estilos: ["lista_erros"] },
  ],
  tabelas: [], midias: [], revisao_aula: null, flashcards: { cartoes: [] }, questoes: { itens: [] },
};

function status() {
  return {
    enabled: true, available: true, consent_required: false, voice_enabled: true, daily_limit: LIMITE, used_today: saldo.usadas,
    entitlement: {
      enabled: true, mode: "paid", is_paid: true, staff: false, can_use: true, can_text: saldo.usadas < LIMITE, can_voice: true,
      text: { used: saldo.usadas, limit: LIMITE, remaining: Math.max(0, LIMITE - saldo.usadas) },
      voice: { enabled: true, remaining_today_s: 8 * 60, remaining_s: 8 * 60 }, questions: { limit: null, used: 0 },
    },
    preferences: { personality_id: personalidade, character: personalidade === "tranquila" ? "stazia" : "stazi" },
    personalities: PERSONALIDADES,
  };
}

function finalizada(s) {
  // simulado já entregue (revisão): placar de exemplo e a correção de cada questão
  const questions = s.questions.map((q, i) => ({ ...q, selected: i === 0 ? "C" : i % 3 === 0 ? null : "B", correction: { correct_option: "B", is_correct: i !== 0 && i % 3 !== 0, annulled: false, explanation: "[Exemplo da prévia] Explicação.", option_notes: [], topic: "Clínica", sources: [] } }));
  return {
    ...s, kind: "simulado", finished_at: new Date().toISOString(), questions,
    result: { total: questions.length, answered: questions.filter((q) => q.selected).length, correct: questions.filter((q) => q.correction.is_correct).length, elapsed_seconds: 3120, paused_seconds: 0, active_seconds: 3000, by_area: [{ area: "CLINICA_MEDICA", total: questions.length, correct: 5 }] },
  };
}

let valor = null;
export function useSession() {
  const base = sessaoDasQuestoes();
  if (!valor) {
    const backend = {
      accessToken: async () => "previa",
      async rpc(fn, args = {}) {
        switch (fn) {
          case "app_tutor_status":
            await new Promise((r) => setTimeout(r, 120));
            return status();
          case "app_tutor_start":
            return { id: SID, mode: args.p_mode, personality: PERSONALIDADES.find((p) => p.id === personalidade), messages: [] };
          case "app_tutor_close":
            return true;
          case "app_tema_aula":
            return AULA;
          case "app_lesson_notes":
            return { notas: {}, checks: {} };
          case "app_lesson_section_note_save":
          case "app_lesson_checks_save":
            return { ok: true };
          case "app_session_irt_result":
            return null;
          case "app_get_session":
            if (params.get("tela") === "resultado") return finalizada(await base.backend.rpc(fn, args));
            return base.backend.rpc(fn, args);
          default:
            return base.backend.rpc(fn, args);
        }
      },
    };
    valor = { ...base, backend };
  }
  return valor;
}
export function SessionProvider({ children }) {
  return <>{children}</>;
}
export function rememberChoice() {}
export function useOptionalSession() {
  return useSession();
}
