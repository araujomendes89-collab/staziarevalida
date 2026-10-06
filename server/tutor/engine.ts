/**
 * Motor de turno do Stazia Tutor. Para cada fala do aluno:
 *
 *   1. confere se pode responder (ligado, plano, limite do dia, IA liberada);
 *   2. recupera o contexto (aluno, conversa, questão) e a base conferida (questão oficial, análise revisada, fontes oficiais);
 *   3. monta as camadas: NÚCLEO → MODO → (VOZ) → PERSONALIDADE, e os dados: base, aluno, conversa, fala, tarefa;
 *   4. gera a resposta estruturada;
 *   5. VALIDA por software (safety.ts); barrada, tenta mais uma vez com a correção; barrada de novo, entrega a resposta fixa;
 *   6. grava a troca e o uso do dia.
 *
 * A personalidade só entra na etapa 3 e nunca passa pela etapa 5 com conteúdo inválido.
 */
import { asDocument } from "../contentHub/ai/prompts";
import { AiInvalidOutput, resolveProviderKind, withFallback, type StructuredRequest } from "../contentHub/ai/provider";
import { aiAllowed, registerPrompts, type PromptEntry } from "../contentHub/ai/registry";
import type { ContentDb } from "../contentHub/infra";
import { adaptiveAdjust, effectiveParams, personalityLayer, profanityLevel, type Personality, type ProfanityLevel, type TutorSettings } from "./personality";
import { TUTOR_CORE, TUTOR_MODES, TUTOR_PROMPT_LAYERS, TUTOR_SCHEMA, TUTOR_VERSION, TUTOR_VOICE, taskInstruction, type TutorMode, type TutorOutput, type TutorTask } from "./prompts";
import { fallbackReply, safetyCheck, spokenText, type BaseBlock, type SafetyResult, type Violation } from "./safety";

export interface TutorDeps {
  db: ContentDb;
  mockRespond?: (req: StructuredRequest) => unknown;
  log?: (m: string) => void;
  /** Voz natural: nos testes, um provedor fixo (ou null = desligada); fora deles, vem do .env (speech.ts). */
  speech?: import("./speech").SpeechProvider | null;
}

export interface TutorAction {
  type: "message" | "hint" | "react";
  text?: string;
  voice?: boolean;
  interrupted?: string | null;
}

/** Erro que o aluno pode ler (com o código HTTP certo). */
export class TutorError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface Context {
  config: { enabled: boolean; requires_pro: boolean; daily_limit: number; max_profanity: ProfanityLevel };
  is_pro: boolean;
  used_today: number;
  session: { id: string; mode: TutorMode; topic: string | null; status: string; question_state: string; hint_level: number; intensity: number; settings: TutorSettings & { params?: unknown }; difficulty_level: number };
  personality: Personality;
  student: { first_name: string | null; phase: number; days_to_exam: number | null } | null;
  mastery: { areas: { area: string; level: string; accuracy: number | null }[] };
  recent_results: boolean[];
  history: { role: "student" | "tutor"; content: string }[];
  question: {
    id: string; area: string; topic: string; subtopic: string | null; statement: string; exam: string | null; number: number;
    options: { id: string; text: string; explanation: string | null }[];
    official_answer: string; expected_conduct: string | null; inep_intent: string | null;
    last_answer: { selected: string; is_correct: boolean; confidence: number | null; lucky_guess: boolean; heavy_hints: boolean; hints_used: number; justification: string | null } | null;
    analysis: { question_core: string; trap: string | null; golden_rule: string | null; options: { option_id: string; reasoning: string; why_wrong: string | null; trap: string | null }[] | null } | null;
    update_card: { official_answer: string; current_answer: string | null; what_changed: string; effective_date: string | null; sources: unknown } | null;
  } | null;
}

interface Passage {
  source: string; organ: string; version: string | null; page: number | null; section: string | null; text: string;
}

/**
 * Provedor do Tutor. O consentimento para enviar a fala do aluno ao provedor de IA é próprio do Tutor (TUTOR_AI_ALLOW_EXTERNAL=1):
 * ligar o Tutor não autoriza, de carona, o envio de documentos da Central de Conteúdo, e vice-versa.
 */
export function resolveTutorProvider(mockRespond?: (req: StructuredRequest) => unknown) {
  const env = process.env;
  const opts = {
    allowExternal: env.TUTOR_AI_ALLOW_EXTERNAL === "1",
    allowHint: "Envio da fala do aluno ao provedor de IA não autorizado: defina TUTOR_AI_ALLOW_EXTERNAL=1 no servidor depois de aprovar o uso.",
  };
  return withFallback(resolveProviderKind((env.TUTOR_AI_PROVIDER || "anthropic").trim(), mockRespond, env.TUTOR_MODEL, opts), mockRespond, undefined, opts);
}

/** Conversa pede resposta rápida: o Tutor usa esforço baixo (TUTOR_ANTHROPIC_EFFORT muda). A validação por software continua igual. */
const EFFORT = (["low", "medium", "high"].includes(process.env.TUTOR_ANTHROPIC_EFFORT ?? "") ? process.env.TUTOR_ANTHROPIC_EFFORT : "low") as "low" | "medium" | "high";

const STATE_PT: Record<string, string> = { open: "aberta", answered: "respondida", revealed: "revelada", none: "sem questão" };

/** Blocos da base conferida. O gabarito e as explicações só entram quando a questão já foi respondida ou quando a tarefa é uma dica. */
export function buildBlocks(ctx: Context, passages: Passage[], includeAnswer: boolean): BaseBlock[] {
  const blocks: BaseBlock[] = [];
  const q = ctx.question;
  if (q) {
    const lines = [
      `Questão oficial: ${q.exam ?? ""} nº ${q.number} · ${q.topic}`,
      `Estado: ${STATE_PT[ctx.session.question_state] ?? ctx.session.question_state}`,
      `Enunciado: ${q.statement}`,
      ...q.options.map((o) => `${o.id}) ${o.text}`),
    ];
    if (includeAnswer) {
      lines.push(`Gabarito oficial da prova: ${q.official_answer}`);
      for (const o of q.options) if (o.explanation) lines.push(`Explicação oficial de ${o.id}: ${o.explanation}`);
      if (q.expected_conduct) lines.push(`Conduta esperada: ${q.expected_conduct}`);
      if (q.inep_intent) lines.push(`O que a questão avalia: ${q.inep_intent}`);
    }
    if (q.last_answer) lines.push(`Resposta do aluno: ${q.last_answer.selected} (${q.last_answer.is_correct ? "acertou" : "errou"})`);
    blocks.push({ ref: "Q", kind: "question", label: "Questão oficial", text: lines.join("\n") });
    if (q.analysis) {
      const a = q.analysis;
      blocks.push({
        ref: "A", kind: "analysis", label: "Análise Stazia revisada por médico",
        text: [`O que a questão pede: ${a.question_core}`, a.trap ? `Armadilha: ${a.trap}` : "", a.golden_rule ? `Regra para lembrar: ${a.golden_rule}` : "",
          ...(a.options ?? []).map((o) => `${o.option_id}: ${o.reasoning}${o.why_wrong ? ` Por que está errada: ${o.why_wrong}` : ""}${o.trap ? ` Armadilha: ${o.trap}` : ""}`)].filter(Boolean).join("\n"),
      });
    }
    if (q.update_card) {
      const u = q.update_card;
      blocks.push({
        ref: "U", kind: "update", label: "Atualização de conduta revisada",
        text: `Gabarito oficial da prova: ${u.official_answer}. Conduta atual conferida: ${u.current_answer ?? "nenhuma alternativa isolada"}. O que mudou: ${u.what_changed}${u.effective_date ? ` Em vigor desde ${u.effective_date}.` : ""}`,
      });
    }
  }
  passages.forEach((p, i) =>
    blocks.push({ ref: `F${i + 1}`, kind: "source", label: `${p.source} · ${p.organ}${p.version ? ` · versão ${p.version}` : ""}${p.page != null ? ` · p. ${p.page}` : ""}`, text: p.text })
  );
  return blocks;
}

const STOP = new Set(["sobre", "quais", "qual", "como", "para", "pela", "pelo", "entre", "quando", "porque", "essa", "esse", "isso", "esta", "este", "numa", "mais", "menos", "muito", "paciente", "questao", "alternativa", "resposta", "explica", "explique", "tutor"]);

/** Consulta para as fontes oficiais: os termos mais específicos do tema, ligados por "or". */
export function sourceQuery(...texts: (string | null | undefined)[]): string {
  const words = texts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !STOP.has(w));
  return [...new Set(words)].slice(0, 8).join(" or ");
}

async function searchSources(deps: TutorDeps, query: string): Promise<Passage[]> {
  if (!query) return [];
  try {
    return (await deps.db.service<Passage[]>("ch_worker_search_official_passages", { p_query: query, p_limit: 3 })) ?? [];
  } catch (error) {
    deps.log?.(`[tutor] busca nas fontes falhou: ${(error as Error).message}`);
    return [];
  }
}

const registered = new WeakSet<object>();
const busy = new Set<string>();

export interface TurnResult {
  message: { id: number; role: "tutor"; content: string; spoken: string; grounding: string; sources: { ref: string; label: string }[]; hint_level: number | null; suggested: string[]; notice: string | null };
  question_state: string;
  used_today: number;
  daily_limit: number;
}

export async function tutorTurn(deps: TutorDeps, userId: string, sessionId: string, action: TutorAction): Promise<TurnResult> {
  if (/^(false|0|off|no)$/i.test((process.env.TUTOR_ENABLED ?? "").trim())) throw new TutorError("O Tutor está desligado no servidor.", 503);
  if (busy.has(userId)) throw new TutorError("Espere a resposta anterior antes de mandar outra.", 429);
  busy.add(userId);
  try {
    const ctx = await deps.db.service<Context | null>("ch_worker_tutor_context", { p_user: userId, p_session_id: sessionId });
    if (!ctx) throw new TutorError("Conversa não encontrada.", 404);
    if (!ctx.config.enabled) throw new TutorError("O Tutor ainda não está ligado.", 503);
    if (ctx.config.requires_pro && !ctx.is_pro) throw new TutorError("O Tutor faz parte dos planos pagos.", 403);
    if (ctx.session.status !== "active") throw new TutorError("Esta conversa foi encerrada. Abra uma nova.", 409);
    if (ctx.used_today >= ctx.config.daily_limit) throw new TutorError(`Você chegou ao limite de ${ctx.config.daily_limit} mensagens de hoje. Amanhã tem mais.`, 429);
    const allowed = await aiAllowed(deps.db);
    if (!allowed.ok) {
      deps.log?.(`[tutor] IA bloqueada: ${allowed.why}`);
      throw new TutorError("O Tutor está indisponível no momento.", 503);
    }

    // ---- a tarefa desta resposta
    const q = ctx.question;
    const open = ctx.session.question_state === "open";
    let task: TutorTask;
    let studentText = "";
    let hintLevel: number | null = null;
    if (action.type === "hint") {
      if (!q || !open) throw new TutorError("Não há questão aberta para pedir dica.", 409);
      if (ctx.session.hint_level >= 5) throw new TutorError("Você já recebeu todas as dicas desta questão.", 409);
      hintLevel = ctx.session.hint_level + 1;
      task = { type: "hint", level: hintLevel };
      studentText = hintLevel === 1 ? "Me dá uma ajuda aqui." : "Me ajuda mais um pouco.";
    } else if (action.type === "react") {
      const a = q?.last_answer;
      if (!q || !a || ctx.session.question_state !== "answered") throw new TutorError("Responda a questão antes.", 409);
      task = { type: "react", selected: a.selected, correct: a.is_correct, confidence: a.confidence, hints: a.hints_used, lucky: a.lucky_guess };
      studentText = `Marquei a ${a.selected}.`;
    } else {
      studentText = (action.text ?? "").trim();
      if (!studentText) throw new TutorError("Escreva ou fale a sua mensagem.", 400);
      if (studentText.length > 2000) throw new TutorError("Mensagem longa demais (até 2.000 caracteres).", 400);
      const a = q?.last_answer;
      task = a && a.is_correct && a.lucky_guess && !a.justification && ctx.session.question_state === "answered" ? { type: "justify" } : { type: "message", interrupted: action.interrupted?.slice(0, 300) || null };
    }

    const { provider, status } = resolveTutorProvider(deps.mockRespond);
    if (!provider) {
      deps.log?.(`[tutor] IA não configurada: ${status.pending}`);
      throw new TutorError("O Tutor está indisponível no momento.", 503);
    }
    if (!registered.has(deps.db)) {
      await registerPrompts(deps.db, TUTOR_PROMPT_LAYERS as PromptEntry[]);
      registered.add(deps.db);
    }

    // ---- base conferida
    const includeAnswer = Boolean(q) && (!open || task.type === "hint");
    const passages = await searchSources(deps, sourceQuery(q?.topic, q?.subtopic, ctx.session.topic, task.type === "message" && !q ? studentText : ""));
    const blocks = buildBlocks(ctx, passages, includeAnswer);

    // ---- personalidade (sempre depois do conteúdo)
    const settings = ctx.session.settings;
    const adjust = adaptiveAdjust(ctx.session.intensity, settings.adaptive !== false, ctx.recent_results ?? []);
    const eff = effectiveParams(ctx.personality.params, adjust.intensity, settings);
    const profanity = profanityLevel(ctx.personality.params, settings.profanity ?? "off", ctx.config.max_profanity);
    const system = [TUTOR_CORE, TUTOR_MODES[ctx.session.mode], action.voice ? TUTOR_VOICE : "", personalityLayer(ctx.personality, eff, profanity, adjust.intensity, adjust.note)].filter(Boolean).join("\n\n");

    const studentCtx = {
      nome: ctx.student?.first_name ?? null,
      dias_para_a_prova: ctx.student?.days_to_exam ?? null,
      dominio_por_area: (ctx.mastery?.areas ?? []).filter((a) => a.level !== "SEM_DADOS").map((a) => ({ area: a.area, nivel: a.level })),
      nivel_da_conversa: ctx.session.difficulty_level,
    };
    const conversation = ctx.history.map((h) => `${h.role === "student" ? "Aluno" : "Tutor"}: ${h.content.slice(0, 600)}`).join("\n");
    const baseInput =
      `Responda no formato "tutor".\n<base>\n${JSON.stringify(blocks.map((b) => ({ ref: b.ref, tipo: b.kind, rotulo: b.label, texto: b.text })))}\n</base>\n` +
      `<contexto_do_aluno>\n${JSON.stringify(studentCtx)}\n</contexto_do_aluno>\n<conversa>\n${conversation}\n</conversa>\n<aluno>\n${asDocument(studentText)}\n</aluno>\n` +
      `<tarefa>\n${taskInstruction(task)}\n</tarefa>`;

    const safetyCtx = {
      blocks,
      conversationTexts: [studentText, ...ctx.history.map((h) => h.content)],
      question: q ? { open, officialLetter: q.official_answer, officialText: q.options.find((o) => o.id === q.official_answer)?.text ?? null } : null,
      hintLevel,
      hasUpdateCard: Boolean(q?.update_card),
      profanity,
    };

    // ---- gerar e validar (uma nova tentativa com a correção)
    const usage = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    let out: TutorOutput | null = null;
    let check: SafetyResult | null = null;
    let violations: Violation[] = [];
    let model = provider.model;
    let providerName = provider.name;
    for (let attempt = 0; attempt < 2; attempt++) {
      const input = attempt === 0 ? baseInput : `${baseInput}\n<correcao_obrigatoria>\nSua resposta anterior foi barrada. Refaça sem estes problemas:\n${violations.map((x) => `- ${x.detail}`).join("\n")}\n</correcao_obrigatoria>`;
      let r;
      try {
        r = await provider.generate<TutorOutput>({ promptId: "tutor", promptVersion: TUTOR_VERSION, system, input, schema: TUTOR_SCHEMA, schemaName: "staziamed_tutor", maxOutputTokens: 2000, effort: EFFORT });
      } catch (error) {
        // resposta fora do formato: conta como barrada e ganha uma nova tentativa (nunca é "consertada")
        if (error instanceof AiInvalidOutput) {
          usage.calls++;
          violations = [{ code: "invalid_format", detail: `A resposta veio fora do formato pedido (${error.message.slice(0, 160)}). Responda só no formato "tutor", com reply de até 2.600 caracteres.` }];
          continue;
        }
        deps.log?.(`[tutor] falha do provedor: ${(error as Error).message.slice(0, 200)}`);
        if (usage.calls === 0) throw new TutorError("O Tutor não conseguiu responder agora. Tente de novo em instantes.", 502);
        break;
      }
      usage.calls++;
      usage.input_tokens += r.inputTokens ?? 0;
      usage.output_tokens += r.outputTokens ?? 0;
      usage.cost_usd += r.costUsd ?? 0;
      model = r.model;
      providerName = r.provider;
      const c = safetyCheck(r.output, safetyCtx);
      violations = c.violations;
      if (!violations.length) {
        out = r.output;
        check = c;
        break;
      }
    }

    const replaced = !out;
    const reply = out ? out.reply.trim() : fallbackReply(violations);
    const reveals = Boolean(out?.reveals_answer) && hintLevel === 5;
    const meta: Record<string, unknown> = {
      grounding: replaced ? "insufficient" : check!.grounding,
      sources: replaced ? [] : check!.sources,
      suggested: replaced ? [] : out!.suggested_replies,
      notice: replaced ? "Resposta substituída: a primeira versão trazia informação que não pôde ser conferida." : adjust.notice,
      model, provider: providerName, prompt_version: TUTOR_VERSION, simulated: provider.isMock,
      personality: { id: ctx.personality.id, intensity: adjust.intensity, profanity },
      voice: Boolean(action.voice),
      ...(violations.length ? { violations: violations.map((x) => x.code) } : {}),
      ...(hintLevel != null ? { hint_level: hintLevel, reveals_answer: reveals } : {}),
      ...(task.type === "react" && !task.correct && out && out.error_class !== "NONE" ? { error_class: out.error_class } : {}),
      ...(task.type === "justify" && out && out.justification !== "NONE" ? { justification: out.justification } : {}),
    };
    const saved = await deps.db.service<{ id: number; used_today: number }>("ch_worker_tutor_append", {
      p_user: userId, p_session_id: sessionId, p_student: studentText, p_tutor: reply, p_meta: meta, p_usage: usage,
    });
    return {
      message: { id: saved.id, role: "tutor", content: reply, spoken: spokenText(reply), grounding: String(meta.grounding), sources: meta.sources as { ref: string; label: string }[], hint_level: hintLevel, suggested: meta.suggested as string[], notice: (meta.notice as string | null) ?? null },
      question_state: reveals ? "revealed" : ctx.session.question_state,
      used_today: saved.used_today,
      daily_limit: ctx.config.daily_limit,
    };
  } finally {
    busy.delete(userId);
  }
}
