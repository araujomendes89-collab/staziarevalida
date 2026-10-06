/**
 * VOZ EM TEMPO REAL do Stazia Tutor (OpenAI Realtime, WebRTC no navegador).
 *
 *   aluno → /api/tutor/voice/start (servidor: login, direito, teste, cota, uma voz por aluno, reserva curta de uso)
 *         → o servidor pede à OpenAI um SEGREDO TEMPORÁRIO (POST /v1/realtime/client_secrets) com as instruções e as ferramentas
 *         → o navegador abre o WebRTC direto com a OpenAI usando esse segredo (a chave principal nunca sai do servidor)
 *         → a cada ~minuto, /voice/renew conta o tempo real e renova a reserva; sem saldo, o servidor encerra a chamada
 *         → /voice/end fecha e registra; chamadas sem renovação expiram sozinhas (varredura) e o servidor desliga
 *
 * A cota comercial é TEMPO autorizado pelo servidor; tokens (response.done) servem só para custo e telemetria.
 *
 *   OPENAI_API_KEY                   chave (só no servidor)
 *   OPENAI_REALTIME_MODEL            modelo de voz em tempo real (obrigatório: não há nome fixo no código)
 *   TUTOR_VOICE_ALLOW_EXTERNAL=1     consentimento: a voz do aluno e as respostas passam pela OpenAI
 *   OPENAI_REALTIME_TRANSCRIBE_MODEL opcional: transcrição da fala do aluno (sem ele, só a fala do professor vira texto)
 */
import { createHash } from "crypto";
import { engineFor, languageIntensity, normalize, profanityForIntensity, stateLayer, type PersonaEngine, type TutorState } from "./emotion";
import { TRIAL_OVER, TutorError, type Entitlement, type TutorDeps } from "./engine";
import { effectiveParams, personalityLayer, profanityLevel, type Personality, type ProfanityLevel, type TutorSettings } from "./personality";
import { composeRealtimeInstructions, type TutorMode } from "./prompts";
import { safetyCheck, type BaseBlock } from "./safety";
import { realKey } from "./speech";
import { REALTIME_TOOLS } from "./tools";
import { estimateCost } from "./costs";

const API = "https://api.openai.com/v1";

/** Textos que as ferramentas trouxeram em cada chamada (fontes do tema): valem como base na conferência do que foi dito. */
const evidence = new Map<string, string[]>();
export function rememberEvidence(voiceCallId: string, texts: string[]) {
  const list = evidence.get(voiceCallId) ?? [];
  list.push(...texts.map((t) => t.slice(0, 2000)));
  evidence.set(voiceCallId, list.slice(-30));
  if (evidence.size > 500) evidence.delete(evidence.keys().next().value as string);
}

export interface RealtimeConfig {
  ready: boolean;
  model: string | null;
  pending: string | null;
  key: string | null;
  transcribeModel: string | null;
}

export function realtimeConfig(env: NodeJS.ProcessEnv = process.env): RealtimeConfig {
  const model = (env.OPENAI_REALTIME_MODEL ?? "").trim() || null;
  const key = realKey(env.OPENAI_API_KEY);
  const transcribeModel = (env.OPENAI_REALTIME_TRANSCRIBE_MODEL ?? "").trim() || null;
  const pending = !model
    ? "Defina OPENAI_REALTIME_MODEL no servidor (o modelo de voz em tempo real)."
    : env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1"
      ? "Envio da voz do aluno à OpenAI não autorizado: defina TUTOR_VOICE_ALLOW_EXTERNAL=1 no servidor depois de aprovar o uso."
      : !key
        ? "OPENAI_API_KEY ausente ou com o texto de exemplo no .env do servidor."
        : null;
  return { ready: !pending, model, pending, key: pending ? null : key, transcribeModel };
}

/** Encerra uma chamada pelo servidor (cota acabou, reserva venceu, outra aba assumiu). Melhor esforço. */
export async function hangup(callId: string | null | undefined, deps: Pick<TutorDeps, "log" | "realtime" | "fetch">) {
  if (!callId || !/^[A-Za-z0-9_-]{4,120}$/.test(callId)) return;
  const key = deps.realtime ? deps.realtime.key : realKey(process.env.OPENAI_API_KEY);
  if (!key) return;
  const fetchImpl = deps.fetch ?? fetch;
  try {
    const res = await fetchImpl(`${API}/realtime/calls/${callId}/hangup`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok && res.status !== 404) deps.log?.(`[tutor] voz: encerrar ${callId} respondeu ${res.status}`);
  } catch (error) {
    deps.log?.(`[tutor] voz: falha ao encerrar ${callId}: ${(error as Error).message.slice(0, 120)}`);
  }
}

interface VoiceContext {
  entitlement: Entitlement & { voice: { remaining_s: number; remaining_today_s: number; remaining_total_s: number | null } };
  config: { max_profanity: ProfanityLevel };
  session: { id: string; mode: TutorMode; title: string; topic: string | null; status: string; question_state: string; settings: TutorSettings; emotion: (Partial<TutorState> & Record<string, unknown>) | null; context: { type: string | null; label: string | null } };
  personality: Personality & { voice?: { realtime?: string }; engine?: Partial<PersonaEngine> | null };
  student: { first_name: string | null; days_to_exam: number | null } | null;
  memory: { weak_subareas: { subarea: string; accuracy: number }[]; recurrent_errors: { error_type: string; knowledge_gap: string | null; times: number }[] } | null;
  question: { id: string } | null;
}

/** Contexto inicial da sessão de voz (sem gabarito: os fatos vêm das ferramentas). */
function sessionContext(ctx: VoiceContext): string {
  const lines = [`SESSÃO: ${ctx.session.title}.`];
  if (ctx.student?.first_name) lines.push(`O aluno se chama ${ctx.student.first_name}.`);
  if (ctx.question) {
    lines.push(ctx.session.question_state === "open"
      ? "Há uma questão ABERTA nesta sessão: chame get_question_context antes de falar dela e deixe o aluno tentar primeiro."
      : "A questão desta sessão já foi respondida: chame get_question_context para discutir a escolha do aluno.");
  } else if (ctx.session.context.type === "weak_points") {
    lines.push(`Foco: pontos fracos do aluno${ctx.memory?.weak_subareas?.length ? ` (${ctx.memory.weak_subareas.slice(0, 3).map((w) => w.subarea).join(", ")})` : ""}.`);
  } else if (ctx.session.topic || ctx.session.context.label) lines.push(`Tema: ${ctx.session.topic ?? ctx.session.context.label}.`);
  const rec = ctx.memory?.recurrent_errors ?? [];
  if (rec.length) lines.push(`Erros que já se repetiram com este aluno: ${rec.slice(0, 3).map((r) => `${r.error_type}${r.knowledge_gap ? ` (${r.knowledge_gap})` : ""}`).join("; ")}.`);
  lines.push("Comece cumprimentando em uma frase curta, no seu jeito, e já puxe o assunto da sessão.");
  return lines.join("\n");
}

export interface VoiceStart {
  voice_call_id: string;
  client_secret: string;
  expires_at: number | null;
  model: string;
  lease_seconds: number;
  entitlement: unknown;
}

const reasonError = (reason: string | undefined, e: unknown): TutorError => {
  switch (reason) {
    case "busy":
      return Object.assign(new TutorError("Já existe uma conversa por voz aberta em outro aparelho ou aba. Encerre por lá ou assuma aqui.", 409), { code: "busy" });
    case "trial_expired":
      return new TutorError(TRIAL_OVER, 403);
    case "disabled":
      return new TutorError("O Tutor ainda não está ligado.", 503);
    case "voice_disabled":
      return new TutorError("A voz do Tutor está desligada no momento.", 503);
    case "session_closed":
      return new TutorError("Esta conversa foi encerrada. Abra uma nova.", 409);
    case "not_found":
      return new TutorError("Conversa não encontrada.", 404);
    default:
      return Object.assign(new TutorError("Você atingiu seu limite de voz de hoje. O acesso é renovado amanhã.", 429), { code: "voice_quota", entitlement: e });
  }
};

/** Abre uma chamada de voz: direito + reserva no banco, depois o segredo temporário na OpenAI. */
export async function startVoice(deps: TutorDeps, userId: string, sessionId: string, force: boolean): Promise<VoiceStart> {
  const cfg = deps.realtime ?? realtimeConfig();
  const fetchImpl = deps.fetch ?? fetch;
  if (!cfg.ready) {
    deps.log?.(`[tutor] voz em tempo real indisponível: ${cfg.pending}`);
    throw new TutorError("A conversa por voz ainda não está configurada no servidor.", 503);
  }
  const ctx = await deps.db.service<VoiceContext | null>("ch_worker_tutor_context", { p_user: userId, p_session_id: sessionId });
  if (!ctx) throw new TutorError("Conversa não encontrada.", 404);
  const r = await deps.db.service<{ ok: boolean; reason?: string; voice_call_id?: string; lease_seconds?: number; replaced_call_id?: string | null; entitlement?: unknown }>(
    "ch_worker_tutor_voice_start", { p_user: userId, p_session_id: sessionId, p_force: force, p_model: cfg.model });
  if (!r.ok) throw reasonError(r.reason, r.entitlement);
  if (r.replaced_call_id) void hangup(r.replaced_call_id, deps);

  const engine = engineFor(ctx.personality.id, ctx.personality.engine);
  const state = normalize(ctx.session.emotion, engine);
  const li = languageIntensity(state, engine);
  // na voz o estado muda pelas ferramentas (o "tom" volta junto); o teto de palavrão da sessão é o do professor
  const profanity = profanityLevel(ctx.personality.params, ctx.session.settings.profanity ?? "off", ctx.config.max_profanity);
  const mood = { label: state.mood, text: stateLayer(ctx.personality.id, state, engine), swearing: "conforme a INTENSIDADE DE LINGUAGEM do estado (ela muda ao longo da conversa: siga o tom que as ferramentas devolverem)", strong: li >= 3 };
  const persona = personalityLayer(ctx.personality, effectiveParams(ctx.personality.params, 3, ctx.session.settings), profanity, 3, null, mood);
  const instructions = composeRealtimeInstructions({ mode: ctx.session.mode, persona, context: sessionContext(ctx) });
  const session = {
    type: "realtime",
    model: cfg.model,
    instructions,
    audio: {
      input: {
        // fim de fala pelo sentido (não só pelo silêncio): "aham" no meio da explicação não vira pergunta; o aluno pode interromper
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
        ...(cfg.transcribeModel ? { transcription: { model: cfg.transcribeModel, language: "pt" } } : {}),
      },
      output: { voice: ctx.personality.voice?.realtime || "marin" },
    },
    tools: REALTIME_TOOLS,
    tool_choice: "auto",
  };
  try {
    const res = await fetchImpl(`${API}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        // identificador estável e sem dado pessoal, para a OpenAI tratar abuso por aluno
        "OpenAI-Safety-Identifier": createHash("sha256").update(`stazia:${userId}`).digest("hex"),
      },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 120 }, session }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenAI respondeu ${res.status}: ${(await res.text()).replace(cfg.key!, "[chave]").slice(0, 200)}`);
    const data = (await res.json()) as { value?: string; expires_at?: number };
    if (!data.value) throw new Error("OpenAI respondeu sem segredo temporário.");
    return { voice_call_id: r.voice_call_id!, client_secret: data.value, expires_at: data.expires_at ?? null, model: cfg.model!, lease_seconds: r.lease_seconds!, entitlement: r.entitlement };
  } catch (error) {
    deps.log?.(`[tutor] voz: falha ao criar o segredo temporário: ${(error as Error).message.slice(0, 200)}`);
    // não conectou: libera a reserva sem cobrar
    await deps.db.service("ch_worker_tutor_voice_end", { p_user: userId, p_voice_call: r.voice_call_id, p_reason: "error" }).catch(() => undefined);
    throw new TutorError("Não consegui abrir a conversa por voz agora. Tente de novo em instantes.", 502);
  }
}

export async function renewVoice(deps: TutorDeps, userId: string, voiceCallId: string, callId: string | null) {
  const r = await deps.db.service<{ ok: boolean; stop?: boolean; reason?: string; call_id?: string | null; lease_seconds?: number; remaining_s?: number; warn?: boolean; entitlement?: unknown }>(
    "ch_worker_tutor_voice_renew", { p_user: userId, p_voice_call: voiceCallId, p_call_id: callId });
  if (r.stop) {
    void hangup(r.call_id ?? callId, deps);
    return {
      stop: true, reason: r.reason,
      message: r.reason === "quota" ? "Você atingiu seu limite de voz de hoje. O acesso é renovado amanhã." : r.reason === "timeout" ? "A conversa por voz caiu por falta de sinal. Pode abrir de novo." : "A conversa por voz foi encerrada.",
      entitlement: r.entitlement ?? null,
    };
  }
  return { stop: false, lease_seconds: r.lease_seconds, remaining_s: r.remaining_s, warn: r.warn ? `Restam ${Math.max(1, Math.round((r.remaining_s ?? 0) / 60))} minuto(s) de Tutor por voz hoje.` : null, entitlement: r.entitlement };
}

export async function endVoice(deps: TutorDeps, userId: string, voiceCallId: string, reason: "student" | "error") {
  const r = await deps.db.service<{ ok: boolean; consumed_seconds?: number; call_id?: string | null }>("ch_worker_tutor_voice_end", { p_user: userId, p_voice_call: voiceCallId, p_reason: reason });
  if (!r.ok) throw new TutorError("Chamada de voz não encontrada.", 404);
  void hangup(r.call_id, deps);
  return { consumed_seconds: r.consumed_seconds ?? 0 };
}

interface VoiceCall {
  id: string;
  session_id: string;
  status: string;
  model: string | null;
  call_id: string | null;
}

export async function voiceCall(deps: TutorDeps, userId: string, voiceCallId: string): Promise<VoiceCall> {
  const v = await deps.db.service<VoiceCall | null>("ch_worker_tutor_voice_call", { p_user: userId, p_voice_call: voiceCallId });
  if (!v) throw new TutorError("Chamada de voz não encontrada.", 404);
  return v;
}

const int = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(10_000_000, Math.round(Number(x)))) : 0);

/** Uso de uma resposta da voz (evento response.done): só telemetria e custo, nunca cota. */
export async function recordVoiceUsage(deps: TutorDeps, userId: string, voiceCallId: string, usage: Record<string, any>) {
  const v = await voiceCall(deps, userId, voiceCallId);
  const tokens = {
    input_text_tokens: int(usage?.input_token_details?.text_tokens),
    input_audio_tokens: int(usage?.input_token_details?.audio_tokens),
    cached_tokens: int(usage?.input_token_details?.cached_tokens),
    output_text_tokens: int(usage?.output_token_details?.text_tokens),
    output_audio_tokens: int(usage?.output_token_details?.audio_tokens),
  };
  const cost = estimateCost(v.model, tokens) ?? 0;
  await deps.db.service("ch_worker_tutor_ledger", { p_user: userId, p_session_id: v.session_id, p_entry: { feature: "tutor_voice_tokens", provider: "openai", model: v.model, ...tokens, estimated_cost_usd: cost, meta: { voice_call: v.id } } });
  return { estimated_cost_usd: cost };
}

/**
 * Transcrição do que foi dito na voz. A fala do professor passa pela MESMA conferência do texto (safety.ts) DEPOIS de dita
 * (na voz ao vivo não dá para conferir antes): se algo escapou, o servidor devolve uma correção para o professor dizer em seguida.
 */
export async function voiceTranscript(deps: TutorDeps, userId: string, voiceCallId: string, role: "student" | "tutor", text: string) {
  const v = await voiceCall(deps, userId, voiceCallId);
  const clean = text.trim().slice(0, 4000);
  if (!clean) return { correction: null };
  if (role === "student") {
    await deps.db.service("ch_worker_tutor_append", { p_user: userId, p_session_id: v.session_id, p_student: clean, p_tutor: null, p_meta: { realtime: true }, p_usage: {} });
    return { correction: null };
  }
  const ctx = await deps.db.service<{ question: any; history: { content: string }[]; config: { max_profanity: ProfanityLevel }; session: { settings: TutorSettings; question_state: string; emotion: (Partial<TutorState> & Record<string, unknown>) | null }; personality: Personality & { engine?: Partial<PersonaEngine> | null } } | null>(
    "ch_worker_tutor_context", { p_user: userId, p_session_id: v.session_id });
  const q = ctx?.question;
  const open = ctx?.session.question_state === "open";
  const blocks: BaseBlock[] = [
    ...(q
      ? [{ ref: "Q", kind: "question" as const, label: "Questão oficial", text: [q.statement, ...(q.options ?? []).map((o: any) => `${o.id}) ${o.text}`), ...(open ? [] : [...(q.options ?? []).map((o: any) => o.explanation ?? ""), q.expected_conduct ?? "", JSON.stringify(q.analysis ?? ""), JSON.stringify(q.update_card ?? "")])].join("\n") }]
      : []),
    ...(evidence.get(voiceCallId) ?? []).map((text, i) => ({ ref: `F${i + 1}`, kind: "source" as const, label: "Fonte trazida pela ferramenta", text })),
  ];
  // palavrão: no máximo o do professor, e um degrau acima do que o estado da sessão pede agora (a voz não é conferida antes)
  let profanity: ProfanityLevel = "off";
  if (ctx) {
    const engine = engineFor(ctx.personality.id, ctx.personality.engine);
    const byState = profanityForIntensity(Math.min(5, languageIntensity(normalize(ctx.session.emotion, engine), engine) + 1));
    const max = profanityLevel(ctx.personality.params, ctx.session.settings.profanity ?? "off", ctx.config.max_profanity);
    const RANK = { off: 0, mild: 1, moderate: 2 } as const;
    profanity = RANK[byState] < RANK[max] ? byState : max;
  }
  const check = safetyCheck(
    { reply: clean, grounding: "GENERAL", citations: [], evaluation: { error_type: "none", knowledge_gap: "", severity: 1, unsafe: false, reasoning_quality: "na", recommended_action: "none", answer_correct: "na", self_corrected: false }, justification: "NONE", reveals_answer: false, suggested_replies: [] },
    { blocks, conversationTexts: (ctx?.history ?? []).map((h) => h.content), question: q ? { open, officialLetter: q.official_answer ?? null, officialText: (q.options ?? []).find((o: any) => o.id === q.official_answer)?.text ?? null } : null, hintLevel: null, hasUpdateCard: Boolean(q?.update_card), profanity },
  );
  // valores e documentos ditos sem ferramenta não são conferíveis aqui (as ferramentas trazem fontes): o que importa barrar na voz
  // é gabarito antes da hora, ataque pessoal, palavrão acima do liberado e contestar o gabarito
  const serious = check.violations.filter((x) => ["answer_leak", "personal_attack", "profanity", "challenges_official_answer", "ungrounded_number", "invented_reference", "currency_claim"].includes(x.code));
  await deps.db.service("ch_worker_tutor_append", {
    p_user: userId, p_session_id: v.session_id, p_student: null, p_tutor: clean,
    p_meta: { realtime: true, grounding: "general", ...(serious.length ? { violations: serious.map((x) => x.code) } : {}) }, p_usage: {},
  });
  if (!serious.length) return { correction: null };
  const leak = serious.some((x) => x.code === "answer_leak");
  const facts = serious.some((x) => ["ungrounded_number", "invented_reference", "currency_claim"].includes(x.code));
  return {
    correction: [
      "CORREÇÃO OBRIGATÓRIA, diga já, em uma frase curta e natural, sem citar sistema:",
      leak ? "você adiantou a resposta da questão aberta; peça desculpa e devolva a pergunta ao aluno." : "",
      facts ? "você disse um valor, documento ou conduta que não veio das ferramentas; diga que não tem isso confirmado na base e retire." : "",
      serious.some((x) => x.code === "personal_attack" || x.code === "profanity") ? "você passou do tom permitido; retome no limite (a bronca é para a resposta, nunca para a pessoa)." : "",
      serious.some((x) => x.code === "challenges_official_answer") ? "o gabarito oficial não está errado; corrija isso." : "",
    ].filter(Boolean).join(" "),
  };
}

/** Uma varredura: chamadas sem renovação expiram (contam até o fim da reserva) e o servidor as desliga. Devolve quantas. */
export async function sweepVoice(deps: TutorDeps): Promise<number> {
  const ids = await deps.db.service<string[]>("ch_worker_tutor_voice_expire", {});
  for (const id of ids ?? []) await hangup(id, deps);
  return (ids ?? []).length;
}

/** Varredura por intervalo (servidor que fica de pé). */
export function startVoiceSweeper(deps: TutorDeps, everyMs = 20_000) {
  const tick = async () => {
    try {
      await sweepVoice(deps);
    } catch (error) {
      deps.log?.(`[tutor] voz: varredura falhou: ${(error as Error).message.slice(0, 160)}`);
    }
  };
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer), tick };
}
