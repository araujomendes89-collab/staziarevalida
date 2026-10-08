/**
 * VOZ EM TEMPO REAL do Stazia Tutor (OpenAI, WebRTC no navegador). Dois provedores atrás da mesma ligação (voiceProviders.ts):
 *
 *   GPT-Live (preferido quando configurado): o navegador manda a oferta WebRTC para /api/tutor/voice/start; o servidor confere
 *     login, direito, teste, cota e uma voz por aluno, reserva o tempo e troca a oferta com a OpenAI (POST /v1/live/sessions) com
 *     a chave daqui. O GPT-Live conversa e DELEGA o conteúdo ao aplicativo (/voice/delegate → delegate.ts → motor do Tutor).
 *   Realtime (reserva, ou escolhido no painel): o servidor pede um SEGREDO TEMPORÁRIO (POST /v1/realtime/client_secrets) com as
 *     instruções e as ferramentas; o navegador abre o WebRTC direto com a OpenAI usando esse segredo; ferramentas por /voice/tool.
 *
 *   → a cada ~minuto, /voice/renew conta o tempo real e renova a reserva; sem saldo ou no limite da conversa, o servidor manda
 *     encerrar com uma folga curta (o professor termina a frase) e derruba a ligação se o aplicativo não encerrar;
 *   → /voice/end fecha e registra; chamadas sem renovação expiram sozinhas (varredura) e o servidor desliga.
 *
 * A cota comercial é TEMPO autorizado pelo servidor; tokens e minutos servem só para custo e telemetria.
 *
 *   OPENAI_API_KEY                   chave (só no servidor)
 *   OPENAI_REALTIME_MODEL            modelo do Realtime (sem nome fixo no código)
 *   OPENAI_LIVE_MODEL                modelo do GPT-Live (sem nome fixo no código)
 *   OPENAI_VOICE_PROVIDER            live | realtime | auto
 *   OPENAI_REALTIME_VOICE            voz padrão quando o professor não tem uma
 *   TUTOR_VOICE_ALLOW_EXTERNAL=1     consentimento: a voz do aluno e as respostas passam pela OpenAI
 *   OPENAI_REALTIME_TRANSCRIBE_MODEL opcional (Realtime): transcrição da fala do aluno
 */
import { createHash } from "crypto";
import { engineFor, languageIntensity, normalize, profanityForIntensity, stateLayer, type PersonaEngine, type TutorState } from "./emotion";
import { TRIAL_OVER, TutorError, consentError, type Entitlement, type TutorDeps } from "./engine";
import { effectiveParams, personalityLayer, profanityLevel, type Personality, type ProfanityLevel, type TutorSettings as SessionPrefs } from "./personality";
import { composeLiveInstructions, composeRealtimeInstructions, type TutorMode } from "./prompts";
import { safetyCheck, type BaseBlock } from "./safety";
import { realKey } from "./speech";
import { REALTIME_TOOLS } from "./tools";
import { estimateCost, voiceTimeCost } from "./costs";
import { deterministicTutor, tutorSettings, type TutorSettings } from "./settings";
import {
  closeLiveSession, createGeminiVoiceToken, createLiveSession, geminiVoiceConfig, geminiVoiceName, GeminiVoiceError, liveConfig, LiveSessionError,
  markGeminiUnavailable, markLiveUnavailable, planProviders, type GeminiVoiceConfig, type LiveConfig, type VoiceProviderId,
} from "./voiceProviders";

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

const liveOf = (deps: Pick<TutorDeps, "live">): LiveConfig => deps.live ?? liveConfig();
const geminiOf = (deps: Pick<TutorDeps, "gemini">): GeminiVoiceConfig => deps.gemini ?? geminiVoiceConfig();

/** A voz está disponível no servidor por algum provedor? (a tela mostra o botão de voz) */
export function voiceReady(deps: Pick<TutorDeps, "realtime" | "live" | "gemini">) {
  const rt = deps.realtime ?? realtimeConfig();
  const live = liveOf(deps);
  const gemini = geminiOf(deps);
  return { ready: rt.ready || live.ready || gemini.ready, realtime: rt, live, gemini };
}

/** Encerra uma chamada pelo servidor (cota acabou, reserva venceu, outra aba assumiu). Melhor esforço. */
export async function hangup(callId: string | null | undefined, deps: Pick<TutorDeps, "log" | "realtime" | "fetch" | "live">, provider: VoiceProviderId | string | null = "realtime") {
  // Gemini: a ligação é do navegador com o Google; quem desliga é o aplicativo (a renovação diz para parar) e a chave vence sozinha
  if (provider === "gemini") return;
  if (!callId || !/^[A-Za-z0-9_-]{4,120}$/.test(callId)) return;
  if (provider === "live") {
    const key = liveOf(deps).key ?? (deps.realtime ? deps.realtime.key : realKey(process.env.OPENAI_API_KEY));
    await closeLiveSession(key, callId, deps.log);
    return;
  }
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
  /** O banco diz que o aluno ainda não aceitou os Tutores de IA. */
  consent_pending?: boolean;
  entitlement: Entitlement & { voice: { remaining_s: number; remaining_today_s: number; remaining_total_s: number | null } };
  config: { max_profanity: ProfanityLevel };
  session: { id: string; mode: TutorMode; title: string; topic: string | null; status: string; question_state: string; settings: SessionPrefs; emotion: (Partial<TutorState> & Record<string, unknown>) | null; context: { type: string | null; label: string | null } };
  personality: Personality & { voice?: { realtime?: string }; engine?: Partial<PersonaEngine> | null };
  student: { first_name: string | null; days_to_exam: number | null } | null;
  memory: { weak_subareas: { subarea: string; accuracy: number }[]; recurrent_errors: { error_type: string; knowledge_gap: string | null; times: number }[] } | null;
  question: { id: string } | null;
}

/** Lembranças e a última conversa (continuidade entre dias). */
interface VoiceExtras {
  memories: { kind: string; concept: string; note: string | null; strength: number }[];
  last_session: { id: string; title: string; topic: string | null; mode: string; days_ago: number; summary: { topics?: unknown; recurrent_errors?: unknown; next_topics?: unknown } | null } | null;
}

const MEMORY_KIND: Record<string, string> = { inside_joke: "piada interna", fact: "fato", preference: "preferência", goal: "meta", milestone: "conquista" };

/** Contexto inicial da sessão de voz (sem gabarito: os fatos vêm das ferramentas ou do servidor). */
export function sessionContext(ctx: VoiceContext, extras: VoiceExtras | null, opts: { live: boolean; continuity: boolean }): string {
  const lines = [`SESSÃO: ${ctx.session.title}.`];
  if (ctx.student?.first_name) lines.push(`O aluno se chama ${ctx.student.first_name}.`);
  if (ctx.question) {
    lines.push(ctx.session.question_state === "open"
      ? opts.live
        ? "Há uma questão ABERTA nesta sessão: o backend traz o caso; deixe o aluno tentar primeiro."
        : "Há uma questão ABERTA nesta sessão: chame get_question_context antes de falar dela e deixe o aluno tentar primeiro."
      : opts.live
        ? "A questão desta sessão já foi respondida: o backend traz a correção para discutir a escolha do aluno."
        : "A questão desta sessão já foi respondida: chame get_question_context para discutir a escolha do aluno.");
  } else if (ctx.session.context.type === "weak_points") {
    lines.push(`Foco: pontos fracos do aluno${ctx.memory?.weak_subareas?.length ? ` (${ctx.memory.weak_subareas.slice(0, 3).map((w) => w.subarea).join(", ")})` : ""}.`);
  } else if (ctx.session.topic || ctx.session.context.label) lines.push(`Tema: ${ctx.session.topic ?? ctx.session.context.label}.`);
  const rec = ctx.memory?.recurrent_errors ?? [];
  if (rec.length) lines.push(`Erros que já se repetiram com este aluno: ${rec.slice(0, 3).map((r) => `${r.error_type}${r.knowledge_gap ? ` (${r.knowledge_gap})` : ""}`).join("; ")}.`);
  const mem = (extras?.memories ?? []).slice(0, 6);
  if (mem.length) lines.push(`O que você lembra deste aluno (use com naturalidade e de vez em quando, nunca tudo de uma vez): ${mem.map((m) => `${MEMORY_KIND[m.kind] ?? m.kind}: ${m.concept}${m.note ? ` (${m.note})` : ""}`).join("; ")}.`);
  const last = extras?.last_session;
  if (opts.continuity && last && last.days_ago <= 14) {
    const when = last.days_ago === 0 ? "mais cedo hoje" : last.days_ago === 1 ? "ontem" : `há ${last.days_ago} dias`;
    lines.push(`Continuidade (use nesta abertura só se encaixar): a última conversa foi ${when}, sobre ${last.topic ?? last.title}.`);
  }
  lines.push("Comece numa frase curta, no seu jeito, e já puxe o assunto da sessão. Varie: nem toda abertura retoma a conversa anterior.");
  return lines.join("\n");
}

export interface VoiceStart {
  provider: VoiceProviderId;
  voice_call_id: string;
  /** Realtime: segredo temporário para o navegador abrir o WebRTC com a OpenAI. */
  client_secret?: string;
  expires_at?: number | null;
  /** GPT-Live: resposta SDP (o servidor já trocou a oferta) e o id da sessão na OpenAI. */
  sdp?: string;
  live_session_id?: string;
  /** Gemini: chave temporária (instruções travadas no servidor) para o navegador conectar no Google. */
  gemini_token?: string;
  gemini_expires_at?: string;
  model: string;
  voice: string;
  lease_seconds: number;
  session_max_seconds: number;
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

/** Voz da ligação: a do painel (todos), senão a do professor, senão a padrão do ambiente. */
export function voiceFor(settings: Pick<TutorSettings, "voice_name">, personality: { voice?: { realtime?: string } }, env: NodeJS.ProcessEnv = process.env): string {
  // o painel pode ter escolhido uma voz do Gemini: essa não serve para a OpenAI
  const panel = settings.voice_name && !geminiVoiceName(settings.voice_name) ? settings.voice_name : null;
  return panel || personality.voice?.realtime || (env.OPENAI_REALTIME_VOICE ?? "").trim() || "marin";
}

/** Voz do Gemini: a do painel quando for do Gemini, senão a do professor (tutor_personalities.voice.gemini), senão Kore. */
export function geminiVoiceFor(settings: Pick<TutorSettings, "voice_name">, personality: { voice?: { gemini?: string } }): string {
  return geminiVoiceName(settings.voice_name) ?? geminiVoiceName(personality.voice?.gemini) ?? "Kore";
}

/**
 * Abre uma chamada de voz: direito + reserva no banco, depois a sessão no provedor (Gemini, GPT-Live ou Realtime).
 * `avoid`: provedores que acabaram de falhar no aparelho do aluno (o Gemini conecta pelo navegador; se não abrir, o app pede outro).
 */
export async function startVoice(deps: TutorDeps, userId: string, sessionId: string, force: boolean, sdp: string | null = null, avoid: VoiceProviderId[] = []): Promise<VoiceStart> {
  const rt = deps.realtime ?? realtimeConfig();
  const live = liveOf(deps);
  const gemini = geminiOf(deps);
  const settings = await tutorSettings(deps);
  const plan = planProviders(settings.voice_provider, process.env, live, rt, Boolean(sdp), gemini, avoid);
  if (!plan.first) {
    deps.log?.(`[tutor] voz em tempo real indisponível: ${plan.pending}`);
    throw new TutorError("A conversa por voz ainda não está configurada no servidor.", 503);
  }
  const fetchImpl = deps.fetch ?? fetch;
  const ctx = await deps.db.service<VoiceContext | null>("ch_worker_tutor_context", { p_user: userId, p_session_id: sessionId });
  if (!ctx) throw new TutorError("Conversa não encontrada.", 404);
  // sem o aceite dos Tutores a voz não abre: antes de reservar o tempo (o banco não confere isso na reserva) e de falar com qualquer provedor
  if (ctx.consent_pending) throw consentError();
  const extras = await deps.db.service<VoiceExtras | null>("ch_worker_tutor_voice_context", { p_user: userId, p_session_id: sessionId }).catch(() => null);

  const engine = engineFor(ctx.personality.id, ctx.personality.engine, settings.durona_level);
  const state = normalize(ctx.session.emotion, engine);
  const li = languageIntensity(state, engine);
  // na voz o estado muda pelas ferramentas ou pelo servidor (o "tom" volta junto); o teto de palavrão da sessão é o do professor
  const profanity = profanityLevel(ctx.personality.params, ctx.session.settings.profanity ?? "off", ctx.config.max_profanity);
  const mood = { label: state.mood, text: stateLayer(ctx.personality.id, state, engine), swearing: "conforme a INTENSIDADE DE LINGUAGEM do estado (ela muda ao longo da conversa: siga o tom que o sistema devolver)", strong: li >= 3 };
  const persona = personalityLayer(ctx.personality, effectiveParams(ctx.personality.params, 3, ctx.session.settings), profanity, 3, null, mood);
  // continuidade em algumas aberturas, não em todas (sem sorteio no modo determinístico)
  const continuity = deterministicTutor() ? true : createHash("sha256").update(`${sessionId}:abertura`).digest()[0] % 2 === 0;
  const voice = voiceFor(settings, ctx.personality);

  const reserve = async (model: string) => {
    const r = await deps.db.service<{ ok: boolean; reason?: string; voice_call_id?: string; lease_seconds?: number; replaced_call_id?: string | null; replaced_provider?: string | null; entitlement?: unknown }>(
      "ch_worker_tutor_voice_start", { p_user: userId, p_session_id: sessionId, p_force: force, p_model: model });
    if (!r.ok) throw reasonError(r.reason, r.entitlement);
    if (r.replaced_call_id) void hangup(r.replaced_call_id, deps, r.replaced_provider ?? "realtime"); // a anterior pode ser de outro provedor
    return r as { voice_call_id: string; lease_seconds: number; entitlement: unknown };
  };
  const release = (id: string) => deps.db.service("ch_worker_tutor_voice_end", { p_user: userId, p_voice_call: id, p_reason: "error" }).catch(() => undefined);
  const base = { voice, session_max_seconds: settings.voice_session_max_seconds };

  const tryLive = async (): Promise<VoiceStart> => {
    const r = await reserve(live.model!);
    try {
      const instructions = composeLiveInstructions({ mode: ctx.session.mode, persona, context: sessionContext(ctx, extras, { live: true, continuity }), pronunciations: settings.pronunciations });
      const s = await createLiveSession({ key: live.key!, model: live.model!, instructions, voice, sdp: sdp!, userId, fetchImpl });
      await deps.db.service("ch_worker_tutor_voice_attach", { p_user: userId, p_voice_call: r.voice_call_id, p_call_id: s.sessionId, p_provider: "live" });
      return { provider: "live", voice_call_id: r.voice_call_id, sdp: s.sdp, live_session_id: s.sessionId, model: live.model!, lease_seconds: r.lease_seconds, entitlement: r.entitlement, ...base };
    } catch (error) {
      await release(r.voice_call_id); // não conectou: libera a reserva sem cobrar
      throw error;
    }
  };

  const tryRealtime = async (): Promise<VoiceStart> => {
    const r = await reserve(rt.model!);
    const instructions = composeRealtimeInstructions({ mode: ctx.session.mode, persona, context: sessionContext(ctx, extras, { live: false, continuity }), pronunciations: settings.pronunciations });
    const session = {
      type: "realtime",
      model: rt.model,
      instructions,
      audio: {
        input: {
          // fim de fala pelo sentido (não só pelo silêncio): "aham" no meio da explicação não vira pergunta; o aluno pode interromper
          turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
          ...(rt.transcribeModel ? { transcription: { model: rt.transcribeModel, language: "pt" } } : {}),
        },
        output: { voice },
      },
      tools: REALTIME_TOOLS,
      tool_choice: "auto",
    };
    try {
      const res = await fetchImpl(`${API}/realtime/client_secrets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rt.key}`,
          "Content-Type": "application/json",
          // identificador estável e sem dado pessoal, para a OpenAI tratar abuso por aluno
          "OpenAI-Safety-Identifier": createHash("sha256").update(`stazia:${userId}`).digest("hex"),
        },
        body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 120 }, session }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`OpenAI respondeu ${res.status}: ${(await res.text()).replace(rt.key!, "[chave]").slice(0, 200)}`);
      const data = (await res.json()) as { value?: string; expires_at?: number };
      if (!data.value) throw new Error("OpenAI respondeu sem segredo temporário.");
      return { provider: "realtime", voice_call_id: r.voice_call_id, client_secret: data.value, expires_at: data.expires_at ?? null, model: rt.model!, lease_seconds: r.lease_seconds, entitlement: r.entitlement, ...base };
    } catch (error) {
      deps.log?.(`[tutor] voz: falha ao criar o segredo temporário: ${(error as Error).message.slice(0, 200)}`);
      await release(r.voice_call_id); // não conectou: libera a reserva sem cobrar
      throw new TutorError("Não consegui abrir a conversa por voz agora. Tente de novo em instantes.", 502);
    }
  };

  /** Gemini: o servidor cria a chave temporária com tudo travado (instruções, voz, ferramentas); o navegador conecta no Google. */
  const tryGemini = async (): Promise<VoiceStart> => {
    const r = await reserve(gemini.model);
    try {
      const instructions = composeRealtimeInstructions({ mode: ctx.session.mode, persona, context: sessionContext(ctx, extras, { live: false, continuity }), pronunciations: settings.pronunciations });
      const gVoice = geminiVoiceFor(settings, ctx.personality as { voice?: { gemini?: string } });
      // a chave vence junto com o que a ligação pode durar: limite da conversa ou o tempo de voz que o aluno ainda tem hoje
      const left = Number((r.entitlement as { voice?: { remaining_s?: number } } | null)?.voice?.remaining_s);
      const maxSeconds = Number.isFinite(left) ? Math.min(settings.voice_session_max_seconds, left + r.lease_seconds) : settings.voice_session_max_seconds;
      const t = await createGeminiVoiceToken({ key: gemini.key!, model: gemini.model, instructions, voice: gVoice, tools: REALTIME_TOOLS as never, maxSeconds, client: deps.geminiClient });
      await deps.db.service("ch_worker_tutor_voice_attach", { p_user: userId, p_voice_call: r.voice_call_id, p_call_id: `gemini-${r.voice_call_id.slice(0, 8)}`, p_provider: "gemini" });
      return { provider: "gemini", voice_call_id: r.voice_call_id, gemini_token: t.token, gemini_expires_at: t.expiresAt, model: gemini.model, lease_seconds: r.lease_seconds, entitlement: r.entitlement, ...base, voice: gVoice };
    } catch (error) {
      await release(r.voice_call_id); // não abriu: libera a reserva sem cobrar
      throw error;
    }
  };

  const attempt: Record<VoiceProviderId, () => Promise<VoiceStart>> = { gemini: tryGemini, live: tryLive, realtime: tryRealtime };
  let lastError: unknown = null;
  for (const p of plan.order) {
    try {
      return await attempt[p]();
    } catch (error) {
      if (error instanceof TutorError && !(p === "realtime" && plan.order.indexOf(p) < plan.order.length - 1)) throw error; // direito, cota, outra aba: não adianta trocar
      lastError = error;
      deps.log?.(`[tutor] voz: ${p} falhou: ${(error as Error).message.slice(0, 200)}`);
      if (error instanceof LiveSessionError && error.access) markLiveUnavailable(); // sem acesso: os outros por um tempo
      if (error instanceof GeminiVoiceError && error.access) markGeminiUnavailable();
    }
  }
  if (lastError instanceof TutorError) throw lastError;
  throw new TutorError("Não consegui abrir a conversa por voz agora. Tente de novo em instantes.", 502);
}

const STOP_MESSAGE: Record<string, string> = {
  quota: "Você atingiu seu limite de voz de hoje. O acesso é renovado amanhã.",
  session_limit: "Esta conversa por voz chegou ao tempo máximo. Você pode abrir outra.",
  timeout: "A conversa por voz caiu por falta de sinal. Pode abrir de novo.",
};

export async function renewVoice(deps: TutorDeps, userId: string, voiceCallId: string, callId: string | null) {
  const r = await deps.db.service<{ ok: boolean; stop?: boolean; reason?: string; call_id?: string | null; provider?: string; grace_seconds?: number; lease_seconds?: number; remaining_s?: number; warn?: boolean; session_left_s?: number; entitlement?: unknown }>(
    "ch_worker_tutor_voice_renew", { p_user: userId, p_voice_call: voiceCallId, p_call_id: callId });
  if (r.stop) {
    // com folga: o professor termina a frase e o aplicativo encerra; sem folga (ou já vencida), o servidor derruba agora
    const grace = Math.max(0, Number(r.grace_seconds ?? 0));
    if (!grace) void hangup(r.call_id ?? callId, deps, r.provider ?? "realtime");
    return {
      stop: true, reason: r.reason, grace_seconds: grace,
      message: STOP_MESSAGE[r.reason ?? ""] ?? "A conversa por voz foi encerrada.",
      entitlement: r.entitlement ?? null,
    };
  }
  const sessionWarn = r.session_left_s != null && r.session_left_s <= 120 ? "Faltam 2 minutos para o fim desta conversa por voz." : null;
  return {
    stop: false, lease_seconds: r.lease_seconds, remaining_s: r.remaining_s, session_left_s: r.session_left_s ?? null,
    warn: r.warn ? `Restam ${Math.max(1, Math.round((r.remaining_s ?? 0) / 60))} minuto(s) de Tutor por voz hoje.` : sessionWarn,
    entitlement: r.entitlement,
  };
}

/** Custo da voz por tempo (GPT-Live e Gemini): entra no registro quando a ligação acaba. */
async function recordLiveMinutes(deps: TutorDeps, userId: string, sessionId: string | null, model: string | null, seconds: number, voiceCallId: string, provider: "live" | "gemini" = "live") {
  if (!seconds) return;
  const cost = voiceTimeCost(model, seconds) ?? 0;
  const entry = provider === "gemini"
    ? { feature: "tutor_voice_gemini", provider: "google", model, duration_seconds: seconds, estimated_cost_usd: cost, meta: { voice_call: voiceCallId } }
    : { feature: "tutor_voice_live", provider: "openai", model, duration_seconds: seconds, estimated_cost_usd: cost, meta: { voice_call: voiceCallId } };
  await deps.db.service("ch_worker_tutor_ledger", { p_user: userId, p_session_id: sessionId, p_entry: entry })
    .catch((error: Error) => deps.log?.(`[tutor] voz: custo da voz (${provider}) não registrado: ${error.message.slice(0, 120)}`));
}

export type EndReason = "student" | "error" | "quota" | "session_limit";

export async function endVoice(deps: TutorDeps, userId: string, voiceCallId: string, reason: EndReason) {
  const r = await deps.db.service<{ ok: boolean; consumed_seconds?: number; call_id?: string | null; provider?: string; model?: string | null; session_id?: string; already?: boolean }>(
    "ch_worker_tutor_voice_end", { p_user: userId, p_voice_call: voiceCallId, p_reason: reason });
  if (!r.ok) throw new TutorError("Chamada de voz não encontrada.", 404);
  void hangup(r.call_id, deps, r.provider ?? "realtime");
  if (!r.already && (r.provider === "live" || r.provider === "gemini")) await recordLiveMinutes(deps, userId, r.session_id ?? null, r.model ?? null, r.consumed_seconds ?? 0, voiceCallId, r.provider);
  return { consumed_seconds: r.consumed_seconds ?? 0 };
}

interface VoiceCall {
  id: string;
  session_id: string;
  status: string;
  model: string | null;
  call_id: string | null;
  provider?: VoiceProviderId;
  closing_at?: string | null;
}

export async function voiceCall(deps: TutorDeps, userId: string, voiceCallId: string): Promise<VoiceCall> {
  const v = await deps.db.service<VoiceCall | null>("ch_worker_tutor_voice_call", { p_user: userId, p_voice_call: voiceCallId });
  if (!v) throw new TutorError("Chamada de voz não encontrada.", 404);
  return v;
}

const int = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(10_000_000, Math.round(Number(x)))) : 0);

/**
 * Uso de uma resposta da voz (Realtime: evento response.done): só telemetria e custo, nunca cota. No GPT-Live o custo é por tempo e
 * é registrado ao encerrar (os eventos de uso dele só trazem segundos).
 */
export async function recordVoiceUsage(deps: TutorDeps, userId: string, voiceCallId: string, usage: Record<string, any>) {
  const v = await voiceCall(deps, userId, voiceCallId);
  if (v.provider === "live") return { estimated_cost_usd: 0, by_time: true };
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

/** Métricas da ligação (latências, reconexões, motivo do fim): só números e rótulos curtos. */
export async function recordVoiceMetrics(deps: TutorDeps, userId: string, voiceCallId: string, metrics: Record<string, unknown>) {
  const ok = await deps.db.service<boolean | null>("ch_worker_tutor_voice_metrics", { p_user: userId, p_voice_call: voiceCallId, p_metrics: metrics });
  if (!ok) throw new TutorError("Chamada de voz não encontrada.", 404);
  return { ok: true };
}

/**
 * Transcrição do que foi dito na voz. A fala do professor passa pela MESMA conferência do texto (safety.ts) DEPOIS de dita
 * (na voz ao vivo não dá para conferir antes): se algo escapou, o servidor devolve uma correção para o professor dizer em seguida.
 * No GPT-Live o conteúdo já vem conferido do servidor (delegação); a conferência aqui pega o que a voz acrescentou por conta própria.
 */
export async function voiceTranscript(deps: TutorDeps, userId: string, voiceCallId: string, role: "student" | "tutor", text: string) {
  const v = await voiceCall(deps, userId, voiceCallId);
  const clean = text.trim().slice(0, 4000);
  if (!clean) return { correction: null };
  if (role === "student") {
    await deps.db.service("ch_worker_tutor_append", { p_user: userId, p_session_id: v.session_id, p_student: clean, p_tutor: null, p_meta: { realtime: true }, p_usage: {} });
    return { correction: null };
  }
  const ctx = await deps.db.service<{ question: any; history: { content: string }[]; config: { max_profanity: ProfanityLevel }; session: { settings: SessionPrefs; question_state: string; emotion: (Partial<TutorState> & Record<string, unknown>) | null }; personality: Personality & { engine?: Partial<PersonaEngine> | null } } | null>(
    "ch_worker_tutor_context", { p_user: userId, p_session_id: v.session_id });
  const settings = await tutorSettings(deps);
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
    const engine = engineFor(ctx.personality.id, ctx.personality.engine, settings.durona_level);
    const byState = profanityForIntensity(Math.min(5, languageIntensity(normalize(ctx.session.emotion, engine), engine) + 1));
    const max = profanityLevel(ctx.personality.params, ctx.session.settings.profanity ?? "off", ctx.config.max_profanity);
    const RANK = { off: 0, mild: 1, moderate: 2 } as const;
    // Durona "sem filtro cosmético": o teto do professor vale direto (os limites contra ataque pessoal continuam)
    profanity = settings.durona_level === "sem_filtro" && ctx.personality.id === "durona" ? max : RANK[byState] < RANK[max] ? byState : max;
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
  const gone = await deps.db.service<{ voice_call: string; call_id: string | null; provider: string; model: string | null; user_id: string; session_id: string | null; seconds: number }[]>("ch_worker_tutor_voice_sweep", {});
  for (const g of gone ?? []) {
    if (g.call_id) await hangup(g.call_id, deps, g.provider);
    if (g.provider === "live") await recordLiveMinutes(deps, g.user_id, g.session_id, g.model, g.seconds, g.voice_call);
  }
  return (gone ?? []).length;
}

/** Retenção das transcrições da voz (painel): roda na tarefa diária. Devolve quantas falas saíram. */
export async function purgeVoiceTranscripts(deps: TutorDeps): Promise<number> {
  return Number(await deps.db.service<number>("ch_worker_tutor_purge_transcripts", {})) || 0;
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
