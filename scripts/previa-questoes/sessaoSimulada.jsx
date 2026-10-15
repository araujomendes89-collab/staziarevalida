// Substitui src/novo/app/session.jsx só na prévia (ver vite.config.mjs): um "banco" em memória com as funções app_* que a tela de
// questão usa. Tudo é DADO SIMULADO de demonstração (textos de exemplo), sem login e sem rede.
import React from "react";

const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();

const OPCOES_INEDITA = [
  { id: "A", text: "Semanal, à Secretaria Municipal de Saúde." },
  { id: "B", text: "Somente se a paciente autorizar o registro." },
  { id: "C", text: "Imediata, em até 24 horas, à Secretaria Municipal." },
  { id: "D", text: "Imediata, ao Ministério e à Secretaria Estadual." },
];
const INEDITA = {
  id: "q-inedita",
  number: 13,
  area: "MEDICINA_FAMILIA_COMUNIDADE",
  exam: { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null },
  origin: "staziamed",
  statement:
    "Mulher de 19 anos é atendida no pronto-socorro após tomar cerca de 20 comprimidos de diazepam da mãe, depois de uma briga em casa. Após estabilização, fica em observação. Ela confirma que quis morrer e pede que nada seja registrado em lugar nenhum, por medo de ficar exposta. O plantonista acolhe a paciente, explica o sigilo das informações, aciona a avaliação de saúde mental e preenche a ficha de notificação de violência interpessoal e autoprovocada. Segundo a Lista Nacional de Notificação Compulsória vigente, como deve ser feita essa notificação?",
  options: OPCOES_INEDITA,
  images: [],
  support: null,
  preliminary: null,
};
const CORRECAO_INEDITA = {
  correct_option: "C",
  origin: "staziamed",
  explanation:
    "Tentativa de suicídio é violência autoprovocada e consta na Lista Nacional como notificação imediata: a ficha é comunicada à Secretaria Municipal de Saúde em até 24 horas. A notificação não depende da autorização da paciente — ela é compulsória e sigilosa, um registro de vigilância em saúde, não um registro policial.",
  option_notes: [
    { id: "A", text: "Semanal é o prazo da violência interpessoal sem caráter de urgência; a tentativa de suicídio exige comunicação imediata." },
    { id: "B", text: "A notificação é obrigatória para o profissional. Cabe explicar o sigilo e acolher o medo de exposição, sem condicionar o registro ao consentimento." },
    { id: "D", text: "A comunicação imediata a Ministério e Secretaria Estadual vale para outros agravos da lista; aqui o destino é a Secretaria Municipal." },
  ],
  topic: "Vigilância em saúde",
  subtopic: "Notificação compulsória",
  sources: [{ title: "Fonte interna da inédita (não deve aparecer)", organization: "Órgão interno" }],
  // o banco ainda manda as fontes das inéditas; a tela NÃO as mostra ao aluno
  official_sources: [{ source: "Lista Nacional de Notificação Compulsória", organ: "Ministério da Saúde", version: "2026", page: 3, quote: "trecho interno" }],
  expected_conduct: null,
};

const OFICIAL = {
  id: "q-oficial",
  number: 1,
  area: "CLINICA_MEDICA",
  exam: { id: "r2025-1", kind: "REVALIDA", year: 2025, semester: 1 },
  origin: "official",
  statement:
    "[Texto de exemplo da prévia] Paciente de 68 anos, com dispneia aos esforços, tem o eletrocardiograma mostrado na figura. Qual é a conduta mais adequada neste momento?",
  options: [
    { id: "A", text: "Observação clínica e reavaliação em 24 horas." },
    { id: "B", text: "Encaminhamento para avaliação especializada." },
    { id: "C", text: "Início imediato de anticoagulação plena." },
    { id: "D", text: "Alta com orientações e retorno em 30 dias." },
  ],
  images: [{ url: "/question-assets/revalida_2025_1/q001_image_01.png", alt: "Eletrocardiograma de 12 derivações (figura da questão)" }],
  support: null,
  preliminary: null,
};
const CORRECAO_OFICIAL = {
  correct_option: "B",
  origin: "official",
  explanation: "[Explicação de exemplo da prévia] O traçado exige avaliação especializada; as demais condutas não se sustentam.",
  option_notes: [
    { id: "A", text: "Exemplo: observar sem avaliar o traçado atrasa a conduta." },
    { id: "C", text: "Exemplo: anticoagulação plena sem indicação definida." },
    { id: "D", text: "Exemplo: alta sem investigação." },
  ],
  topic: "Eletrocardiograma",
  subtopic: "Interpretação do traçado",
  sources: [{ title: "Caderno de provas Revalida 2025/1", organization: "Inep" }],
  expected_conduct: null,
};

const TABELA = {
  ...OFICIAL,
  id: "q-tabela",
  number: 22,
  statement: "[Texto de exemplo da prévia] Mulher de 34 anos apresenta os exames da tabela abaixo. Qual é o diagnóstico mais provável?",
  images: [],
  support: {
    title: "Exames laboratoriais (dados de exemplo)",
    rows: [
      { label: "Hemoglobina", value: "9,1 g/dL" },
      { label: "VCM", value: "72 fL" },
      { label: "Ferritina", value: "8 ng/mL" },
    ],
  },
};
const ANULADA = { ...OFICIAL, id: "q-anulada", number: 31, statement: "[Texto de exemplo da prévia] Questão anulada pela banca, usada para mostrar o estado.", images: [] };

const FILL = (n) => ({
  id: `q-fill-${n}`,
  number: 100 + n,
  area: "MEDICINA_FAMILIA_COMUNIDADE",
  exam: { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null },
  origin: "staziamed",
  statement: `[Questão de exemplo ${n}] Texto de preenchimento da prévia.`,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id}` })),
  images: [],
  support: null,
  preliminary: null,
});

const SETS = {
  inedita: { first: INEDITA, correction: CORRECAO_INEDITA },
  oficial: { first: OFICIAL, correction: CORRECAO_OFICIAL },
  tabela: { first: TABELA, correction: CORRECAO_OFICIAL },
  anulada: { first: ANULADA, correction: { ...CORRECAO_OFICIAL, correct_option: null, annulled: true, explanation: null, option_notes: [], annulled_notes: [] } },
};

const params = new URLSearchParams(location.search);
const kind = params.get("modo") === "simulado" ? "simulado" : "questoes";
const setName = SETS[params.get("q")] ? params.get("q") : "inedita";
const TOTAL = Number(params.get("total")) || 20;
const LIMIT = 3600;
const deadline0 = now() + (57 * 60 + 24) * 1000;

const state = {
  selected: {},
  correction: {},
  bookmarked: {},
  pausedAt: null,
  frozen: null,
  deadline: deadline0,
};

function questions() {
  const base = [SETS[setName].first, ...Array.from({ length: TOTAL - 1 }, (_, i) => FILL(i + 2))];
  return base.map((q) => ({
    ...q,
    bookmarked: !!state.bookmarked[q.id],
    selected: state.selected[q.id] ?? null,
    active_ms: q.id === "q-inedita" || q.id === base[0].id ? 156_000 : 0,
    correction: kind === "simulado" ? null : (state.correction[q.id] ?? null),
  }));
}
function timerFields() {
  const paused = state.pausedAt != null;
  const remaining = paused ? state.frozen : Math.max(0, Math.round((state.deadline - now()) / 1000));
  return {
    time_limit_seconds: kind === "simulado" ? LIMIT : null,
    paused_at: paused ? iso(state.pausedAt) : null,
    paused_seconds: 0,
    deadline_at: kind === "simulado" ? iso(state.deadline) : null,
    remaining_seconds: kind === "simulado" ? remaining : null,
    server_now: iso(now()),
  };
}
function session() {
  return {
    id: "s-previa",
    kind,
    filters: { area: "MEDICINA_FAMILIA_COMUNIDADE" },
    collection: "oficiais",
    locked: false,
    started_at: iso(now() - 3 * 60_000),
    finished_at: null,
    result: null,
    questions: questions(),
    ...timerFields(),
  };
}

// Pré-responde conforme ?estado= (o estado "respondendo" não responde nada)
function preAnswer() {
  const estado = params.get("estado");
  if (!estado || estado === "respondendo") return;
  const first = SETS[setName].first;
  const letra = estado === "errado" ? "B" : estado === "certo" ? SETS[setName].correction.correct_option : "A";
  if (kind === "simulado") {
    state.selected[first.id] = letra;
    return;
  }
  state.selected[first.id] = letra;
  state.correction[first.id] = answer(first.id, letra);
}
function answer(id, option) {
  const c = SETS[setName].correction;
  const annulled = c.annulled === true;
  return { ...c, selected: option, is_correct: annulled ? null : option === c.correct_option, annulled, in_review: false, play: null };
}

const backend = {
  accessToken: async () => "previa", // a prévia responde /api/tutor com dados simulados (main.jsx)
  async rpc(fn, args = {}) {
    await new Promise((r) => setTimeout(r, 40));
    switch (fn) {
      case "app_get_session":
        return session();
      case "app_answer_question": {
        state.selected[args.p_question_id] = args.p_option;
        if (kind === "simulado") return { ok: true };
        const c = answer(args.p_question_id, args.p_option);
        state.correction[args.p_question_id] = c;
        return c;
      }
      case "app_pause_session":
        if (state.pausedAt == null) {
          state.frozen = Math.max(0, Math.round((state.deadline - now()) / 1000));
          state.pausedAt = now();
        }
        return timerFields();
      case "app_resume_session":
        if (state.pausedAt != null) {
          state.deadline = now() + state.frozen * 1000;
          state.pausedAt = null;
        }
        return timerFields();
      case "app_set_bookmark":
        state.bookmarked[args.p_question_id] = args.p_on;
        return { ok: true };
      case "app_finish_session":
        return { ...session(), finished_at: iso(now()) };
      case "app_report_problem":
        return { ok: true };
      case "app_attempt_diagnosis":
        return { diagnosed: false, repeated_same_option: false };
      case "app_question_commentary":
      case "app_question_source_links":
        return null;
      case "app_question_difficulty":
        // dificuldade validada de exemplo (3 = Média); no simulado o app nem chama
        return kind === "simulado" || state.selected[args.p_question_id] == null ? null : { level: setName === "oficial" ? 4 : 3 };
      case "app_related_questions":
        return [];
      default:
        throw new Error(`função simulada não existe: ${fn}`);
    }
  },
};
preAnswer();

const value = { backend, refresh: async () => {}, boot: { profile: { name: "Aluno de prévia" } }, user: { id: "previa" } };
export function useSession() {
  return value;
}
export function SessionProvider({ children }) {
  return <>{children}</>;
}
export function rememberChoice() {}
