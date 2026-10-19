/**
 * Apoio dos testes de tela do treino sozinho: um "servidor" simulado que guarda UMA tentativa e responde como as funções
 * app_fase2_* (a fase só muda no servidor), e registra tudo que a tela pediu e tudo que o servidor respondeu.
 * Tudo é de TESTE (nada de conteúdo médico real). O roteiro do ator e o PEP ficam guardados aqui e só saem nas fases certas.
 */
import { vi } from "vitest";

export const SEGREDO_ATOR = "SEGREDO-DO-ATOR-NAO-PODE-APARECER";

export const STATION = {
  id: "st-teste-1",
  name: "Estação de teste",
  topic: "Tema de teste",
  area: "Clínica Médica",
  setting: "Pronto-socorro",
  institution: "INEP",
  year: "2024",
  duration_ms: 600000,
};

export const CHECKLIST = [
  { order: 1, item_id: "i1", phase: "Apresentação", content: "Apresenta-se e pede permissão.", tip: "", max: 4, partial: null, criteria: {}, subitems: [] },
  { order: 2, item_id: "i2", phase: "Conduta", content: "Solicita exame de teste.", tip: "", max: 6, partial: 3, criteria: { correct: "Pede o exame de teste.", partial: "Pede sem justificar." }, subitems: [] },
];

export const PRESSINGS = [
  { id: "p0", number: 1, name: "Relato do caso", initial: true, opened: true, content: "Relato de teste do caso.", has_image: false },
  { id: "p1", number: 1, name: "Exame de teste A", initial: false, opened: false, content: null, has_image: false },
  { id: "p2", number: 2, name: "Exame de teste B", initial: false, opened: false, content: null, has_image: true },
];
const PRESSING_TEXT: Record<string, string> = { p1: "Resultado de teste A", p2: "Resultado de teste B" };

export interface ServerOptions {
  status?: string;
  durationMs?: number;
  tasks?: string;
  answers?: Array<{ task: number; text: string }>;
  ia?: { available: boolean; reason: string | null; consent_required: boolean };
  iaMessage?: string | null;
  /** Resultado da autoavaliação / IA já pronto quando o treino abre em `done`. */
  result?: Record<string, any>;
  source?: "ia" | "autoavaliacao" | null;
  failSaves?: number;
  /** Servidor "com defeito": manda o roteiro do ator e o PEP fora de hora. A tela não pode mostrá-los. */
  leak?: boolean;
  /** As funções em que o servidor responde com erro (nome -> mensagem). */
  errors?: Record<string, string>;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function makeSoloServer(options: ServerOptions = {}) {
  const duration = options.durationMs ?? STATION.duration_ms;
  const st: any = {
    id: "att-teste-1",
    status: options.status ?? "reading",
    startedAt: Date.now(),
    attendanceStartedAt: options.status && options.status !== "reading" ? Date.now() : null as number | null,
    submittedAt: null as number | null,
    answers: options.answers ?? [],
    opened: new Set<string>(),
    how: null as string | null,
    source: options.source ?? null,
    result: options.result ?? null,
    iaMessage: options.iaMessage ?? null,
    saves: 0,
    failSaves: options.failSaves ?? 0,
  };
  const calls: Array<{ fn: string; args: any }> = [];
  const responses: Array<{ fn: string; json: string }> = [];

  const payload = () => {
    const base: any = {
      attempt_id: st.id,
      status: st.status,
      server_now: iso(Date.now()),
      station: { ...STATION, duration_ms: duration },
      scene: "Cenário de teste: paciente de teste chega ao serviço.",
      tasks: options.tasks ?? "1. Fazer a anamnese.\n2. Pedir exames e orientar.\nObservação: nota de teste.",
      started_at: iso(st.startedAt),
      attendance_started_at: st.attendanceStartedAt ? iso(st.attendanceStartedAt) : null,
      attendance_ended_at: st.submittedAt ? iso(st.submittedAt) : null,
      submitted_at: st.submittedAt ? iso(st.submittedAt) : null,
      ends_at: st.attendanceStartedAt ? iso(st.attendanceStartedAt + duration) : null,
      answers: st.answers,
      how: st.how,
      source: st.source,
    };
    if (options.leak && st.status !== "scoring" && st.status !== "done") {
      base.actor_script = SEGREDO_ATOR;
      base.checklist = CHECKLIST;
    }
    if (st.status !== "reading") {
      base.pressings = PRESSINGS.map((p) => {
        const opened = p.initial || st.opened.has(p.id);
        return { ...p, opened, content: opened ? (p.initial ? p.content : PRESSING_TEXT[p.id]) : null };
      });
    }
    if (st.status === "submitted") {
      base.ia = options.ia ?? { available: false, reason: "Disponível em outro plano.", consent_required: false };
      base.ia_message = st.iaMessage;
    }
    if (st.status === "scoring") base.checklist = CHECKLIST;
    if (st.status === "done") base.result = st.result;
    return base;
  };

  const fail = (fn: string) => {
    if (options.errors?.[fn]) throw new Error(options.errors[fn]);
  };

  const handlers: Record<string, (args: any) => any> = {
    app_fase2_start: () => payload(),
    app_fase2_attempt: () => payload(),
    app_fase2_begin: () => {
      st.status = "attending";
      st.attendanceStartedAt ??= Date.now();
      return payload();
    },
    app_fase2_save_answers: (a) => {
      if (st.failSaves > 0) {
        st.failSaves -= 1;
        throw new Error("Falha de rede de teste.");
      }
      if (st.status !== "attending") throw new Error("Esta tentativa não aceita mais texto.");
      st.answers = a.p_answers;
      st.saves += 1;
      return { ok: true, saved_at: iso(Date.now()) };
    },
    app_fase2_open_pressing: (a) => {
      st.opened.add(a.p_pressing_id);
      const p = PRESSINGS.find((x) => x.id === a.p_pressing_id)!;
      return { id: p.id, number: p.number, name: p.name, content: PRESSING_TEXT[p.id], has_image: p.has_image };
    },
    app_fase2_deliver: (a) => {
      if (Array.isArray(a.p_answers)) st.answers = a.p_answers;
      st.status = "submitted";
      st.submittedAt = Date.now();
      return payload();
    },
    app_fase2_finish: () => {
      st.status = "scoring";
      st.how = "self";
      st.submittedAt ??= Date.now();
      return payload();
    },
    app_fase2_submit: (a) => {
      const marks = a.p_marks as Record<string, string>;
      const rows = CHECKLIST.map((i) => {
        const grade = marks[String(i.order)] ?? null;
        const points = grade === "correct" ? i.max : grade === "partial" ? i.partial ?? 0 : 0;
        return { order: i.order, item_id: i.item_id, phase: i.phase, content: i.content, grade, points, max: i.max };
      });
      const score = rows.reduce((s, r) => s + r.points, 0);
      st.status = "done";
      st.source = "autoavaliacao";
      st.result = {
        score, max_score: 10, score10: score, finished_at: iso(Date.now()), source: "autoavaliacao", used_ms: 120000, marks: rows, ia: null,
        positive: rows.filter((r) => r.grade === "correct").map((r) => r.content),
        negative: rows.filter((r) => r.grade !== "correct").map((r) => r.content),
      };
      return payload();
    },
    app_fase2_abandon: () => {
      st.status = "abandoned";
      return { ok: true };
    },
    app_fase2_report_ia: () => ({ ok: true }),
    app_dupla_heartbeat: () => ({ ok: true }),
    app_tutor_status: () => ({ enabled: true, consent_required: true, consent_version: "2.0" }),
  };

  const backend: any = {
    rpc: vi.fn(async (fn: string, args: any = {}) => {
      calls.push({ fn, args });
      fail(fn);
      const handler = handlers[fn];
      if (!handler) throw new Error(`rpc inesperada: ${fn}`);
      const out = handler(args);
      responses.push({ fn, json: JSON.stringify(out) });
      return out;
    }),
    accessToken: vi.fn(async () => "token-de-teste"),
  };

  return {
    backend,
    state: st,
    calls,
    responses,
    payload,
    /** Muda a fase pelo "servidor" (ex.: a IA terminou). */
    set(patch: Record<string, any>) {
      Object.assign(st, patch);
    },
    callsOf: (fn: string) => calls.filter((c) => c.fn === fn),
  };
}

/** Resultado de uma avaliação por IA (itens com trecho, razão e etiquetas), no formato de `result` do servidor. */
export function resultadoIA() {
  return {
    score: 7.25,
    max_score: 10,
    score10: 7.3,
    finished_at: "2026-10-17T12:00:00.000Z",
    source: "ia",
    used_ms: 452000,
    marks: [
      { order: 1, item_id: "i1", phase: "Apresentação", content: "Apresenta-se e pede permissão.", grade: "correct", points: 4, max: 4, quote: "Boa tarde, sou o médico de teste", reason: "Citou a apresentação.", label: null },
      { order: 2, item_id: "i2", phase: "Conduta", content: "Solicita exame de teste.", grade: "partial", points: 3.25, max: 4, quote: "peço o exame", reason: "Pediu sem justificar.", label: "divergiram" },
      { order: 3, item_id: "i3", phase: "Conduta", content: "Orienta retorno.", grade: "incorrect", points: 0, max: 1, quote: null, reason: "Nada sobre retorno.", label: "nao_citado" },
      { order: 4, item_id: "i4", phase: "Conduta", content: "Explica o diagnóstico.", grade: null, points: 0, max: 0.5, quote: null, reason: null, label: "sem_trecho" },
      { order: 5, item_id: "i5", phase: "Conduta", content: "Registra o atendimento.", grade: null, points: 0, max: 0.5, quote: null, reason: null, label: "sem_avaliacao" },
    ],
    ia: { note: "Texto organizado e direto.", diverged: 1 },
    positive: ["Apresenta-se e pede permissão."],
    negative: ["Solicita exame de teste.", "Orienta retorno.", "Explica o diagnóstico.", "Registra o atendimento."],
  };
}
