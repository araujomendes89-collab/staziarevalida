/**
 * Rotas /api/tutor. O navegador nunca recebe chave de IA: a fala do aluno chega aqui com o token da sessão, o servidor monta a
 * resposta e grava. Leituras (conversas, preferências, relatório) vão direto pelas funções app_tutor_* com o RLS valendo.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import type { Identity } from "../contentHub/infra";
import { TUTOR_CONSENT_PENDING, TutorError, consentError, resolveTutorProvider, tutorTurn, type TutorDeps } from "./engine";
import { speechProviderFor, tutorSpeech } from "./speech";
import { endVoice, purgeVoiceTranscripts, recordVoiceMetrics, recordVoiceUsage, rememberEvidence, renewVoice, startVoice, sweepVoice, voiceCall, voiceReady, voiceTranscript, type EndReason } from "./realtime";
import { runTutorTool, TOOL_NAMES } from "./tools";
import { delegateVoice } from "./delegate";
import { tutorSettings } from "./settings";
import { planProviders } from "./voiceProviders";

type Authed = Request & { user?: Identity };
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
/** Resposta para um erro do Tutor: a mensagem e, quando o erro traz, o código (o aplicativo age por ele, ex.: tutor_consent) e o direito de uso. */
const failTutor = (res: Response, error: TutorError) => {
  const extra = error as TutorError & { code?: string; entitlement?: unknown };
  return res.status(error.status).json({ error: error.message, ...(extra.code ? { code: extra.code } : {}), ...(extra.entitlement ? { entitlement: extra.entitlement } : {}) });
};

export function createTutorRouter(deps: TutorDeps | null, pending: string | null = null) {
  const router = express.Router();

  /**
   * Varredura da voz pela tarefa agendada (Vercel Cron manda "Authorization: Bearer CRON_SECRET"). No servidor normal quem
   * varre é o intervalo de startVoiceSweeper; na Vercel, além desta tarefa, toda rota de voz varre antes de responder.
   */
  router.get("/voice/sweep", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!deps || !secret || req.headers.authorization !== `Bearer ${secret}`) return fail(res, 401, "Não autorizado.");
    try {
      // a tarefa diária também aplica a retenção das transcrições da voz (painel)
      res.json({ expired: await sweepVoice(deps), purged_transcripts: await purgeVoiceTranscripts(deps).catch(() => 0) });
    } catch (error) {
      fail(res, 500, (error as Error).message.slice(0, 120));
    }
  });

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Tutor não configurado no servidor.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      fail(res, 500, (error as Error).message);
    }
  });

  /** A IA do Tutor está pronta no servidor? O motivo da pendência só vai para administrador. */
  router.get("/status", async (req: Authed, res) => {
    const { status } = resolveTutorProvider(deps!.mockRespond);
    let admin = false;
    try {
      await deps!.db.asUser(req.user!, "app_admin_tutor_config");
      admin = true;
    } catch {
      admin = false;
    }
    const voice = speechProviderFor(deps!).status;
    const vr = voiceReady(deps!);
    const settings = await tutorSettings(deps!);
    // GPT-Live disponível agora? (o navegador manda a oferta WebRTC antes de abrir; se o GPT-Live falhar, o servidor cai no Realtime)
    const plan = planProviders(settings.voice_provider, process.env, vr.live, vr.realtime, true, vr.gemini);
    res.json({
      ready: status.ready, simulated: status.isMock, neural_voice: voice.ready, realtime_voice: vr.ready && settings.voice_enabled !== false, live_voice: plan.first === "live",
      // qual voz o aplicativo abre primeiro (o Gemini não precisa da oferta WebRTC; o GPT-Live precisa)
      voice_hint: plan.first,
      voice_session_max_seconds: settings.voice_session_max_seconds,
      ...(admin ? { provider: status.provider, model: status.model, pending: status.pending, voice_provider: voice.provider, voice_model: voice.model, voice_pending: voice.pending,
                    realtime_model: vr.realtime.model, realtime_pending: vr.realtime.pending, live_model: vr.live.model, live_pending: vr.live.pending,
                    gemini_voice_model: vr.gemini.model, gemini_voice_pending: vr.gemini.pending,
                    voice_choice: { panel: settings.voice_provider, env: (process.env.OPENAI_VOICE_PROVIDER ?? "").trim() || "auto" } } : {}),
    });
  });

  /**
   * Voz natural de um texto já validado. body: { kind: "message", session_id, message_id } | { kind: "question", session_id }
   * | { kind: "phrase", phrase: "marked" | "unmarked" | "sample", letter?, personality_id }. Responde com o áudio.
   */
  router.post("/speech", async (req: Authed, res) => {
    try {
      const body = req.body ?? {};
      const kind = String(body.kind ?? "");
      if (!["message", "question", "phrase"].includes(kind)) return fail(res, 400, "Pedido de voz inválido.");
      const sessionId = body.session_id == null ? null : String(body.session_id);
      if (kind !== "phrase" && !/^[0-9a-f-]{36}$/i.test(sessionId ?? "")) return fail(res, 400, "Conversa inválida.");
      const messageId = Number(body.message_id);
      if (kind === "message" && !(Number.isInteger(messageId) && messageId > 0)) return fail(res, 400, "Fala inválida.");
      const letter = body.letter == null ? null : String(body.letter).toUpperCase();
      if (letter !== null && !/^[A-E]$/.test(letter)) return fail(res, 400, "Alternativa inválida.");
      const personalityId = body.personality_id == null ? null : String(body.personality_id);
      if (kind === "phrase" && !/^[a-z_]{3,24}$/.test(personalityId ?? "")) return fail(res, 400, "Professor inválido.");
      const out = await tutorSpeech(deps!, req.user!.id, {
        kind: kind as "message" | "question" | "phrase", sessionId: kind === "phrase" ? null : sessionId, messageId: kind === "message" ? messageId : null,
        phrase: kind === "phrase" ? String(body.phrase ?? "") : null, letter, personalityId: kind === "phrase" ? personalityId : null,
      });
      res.setHeader("Content-Type", out.mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Tutor-Voice-Cache", out.cached ? "hit" : "miss");
      res.send(out.audio);
    } catch (error) {
      if (error instanceof TutorError) return failTutor(res, error);
      deps!.log?.(`[tutor] erro na voz: ${(error as Error).message}`);
      fail(res, 500, "A voz natural falhou agora.");
    }
  });

  /** Um turno da conversa. body: { session_id, action: "message" | "hint" | "react", text?, voice?, interrupted? } */
  router.post("/turn", async (req: Authed, res) => {
    try {
      const body = req.body ?? {};
      const sessionId = String(body.session_id ?? "");
      const type = String(body.action ?? "message");
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return fail(res, 400, "Conversa inválida.");
      if (!["message", "hint", "react", "reveal"].includes(type)) return fail(res, 400, "Ação inválida.");
      const result = await tutorTurn(deps!, req.user!.id, sessionId, {
        type: type as "message" | "hint" | "react" | "reveal",
        text: typeof body.text === "string" ? body.text : undefined,
        voice: body.voice === true,
        interrupted: typeof body.interrupted === "string" ? body.interrupted : null,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof TutorError) return failTutor(res, error);
      deps!.log?.(`[tutor] erro: ${(error as Error).message}`);
      fail(res, 500, "O Tutor não conseguiu responder agora.");
    }
  });

  // ---------------------------------------------------------------- voz em tempo real
  const uuid = /^[0-9a-f-]{36}$/i;
  let lastSweep = 0;
  const voiceRoute = (handler: (req: Authed, body: Record<string, any>) => Promise<unknown>) => async (req: Authed, res: Response) => {
    try {
      // varredura oportunista (no máximo a cada 20 s por instância): na Vercel não há processo vivo para o intervalo
      if (Date.now() - lastSweep > 20_000) {
        lastSweep = Date.now();
        await sweepVoice(deps!).catch((error) => deps!.log?.(`[tutor] voz: varredura falhou: ${(error as Error).message.slice(0, 120)}`));
      }
      res.json(await handler(req, req.body ?? {}));
    } catch (error) {
      // aceite perdido no meio da ligação: a letra dita e a próxima questão vão direto ao banco, que recusa com a mesma frase, sem código
      const known = error instanceof Error && error.message === TUTOR_CONSENT_PENDING ? consentError() : error;
      if (known instanceof TutorError) return failTutor(res, known);
      deps!.log?.(`[tutor] voz: erro: ${(error as Error).message}`);
      fail(res, 500, "A conversa por voz falhou agora.");
    }
  };
  const callIdOf = (b: Record<string, any>) => {
    if (!uuid.test(String(b.voice_call_id ?? ""))) throw new TutorError("Chamada de voz inválida.", 400);
    return String(b.voice_call_id);
  };

  /**
   * Abre a voz: direito, cota e uma voz por aluno no banco. Com a oferta WebRTC do navegador (sdp), o servidor tenta o GPT-Live e
   * devolve a resposta SDP; sem ela (ou com o Realtime escolhido), devolve o segredo temporário. A chave principal fica aqui.
   */
  router.post("/voice/start", voiceRoute(async (req, b) => {
    if (!uuid.test(String(b.session_id ?? ""))) throw new TutorError("Conversa inválida.", 400);
    const sdp = typeof b.sdp === "string" && b.sdp.length <= 20_000 && b.sdp.startsWith("v=0") ? b.sdp : null;
    // provedores que acabaram de falhar no aparelho do aluno (o Gemini conecta pelo navegador): o servidor escolhe outro
    const avoid = (Array.isArray(b.avoid) ? b.avoid : []).filter((x: unknown): x is "gemini" | "live" | "realtime" => x === "gemini" || x === "live" || x === "realtime");
    return startVoice(deps!, req.user!.id, String(b.session_id), b.force === true, sdp, avoid);
  }));
  /** Renovação da reserva (a cada ~minuto). Sem saldo, o servidor encerra a chamada. */
  router.post("/voice/renew", voiceRoute(async (req, b) => renewVoice(deps!, req.user!.id, callIdOf(b), typeof b.call_id === "string" ? b.call_id.slice(0, 120) : null)));
  router.post("/voice/end", voiceRoute(async (req, b) => {
    const reason: EndReason = ["error", "quota", "session_limit"].includes(b.reason) ? b.reason : "student";
    const id = callIdOf(b);
    // métricas da ligação (latência, reconexões, motivo do fim) vêm junto do encerramento
    if (b.metrics && typeof b.metrics === "object") await recordVoiceMetrics(deps!, req.user!.id, id, b.metrics).catch(() => undefined);
    return endVoice(deps!, req.user!.id, id, reason);
  }));
  /** Métricas no meio da ligação (reconexão, troca de microfone): só números e rótulos curtos. */
  router.post("/voice/metrics", voiceRoute(async (req, b) => {
    if (!b.metrics || typeof b.metrics !== "object") throw new TutorError("Métricas inválidas.", 400);
    return recordVoiceMetrics(deps!, req.user!.id, callIdOf(b), b.metrics);
  }));
  /**
   * GPT-Live delegou: o servidor responde com o motor do Tutor (conferido antes de falar). body: { voice_call_id, transcript:
   * [{ role, text }], typed?, interrupted? }. O aplicativo devolve "say" à voz (session.commentary.append) e "tone" como instrução.
   */
  router.post("/voice/delegate", voiceRoute(async (req, b) => {
    const transcript = Array.isArray(b.transcript)
      ? b.transcript.slice(-24).filter((x: any) => x && (x.role === "student" || x.role === "tutor") && typeof x.text === "string").map((x: any) => ({ role: x.role, text: String(x.text).slice(0, 2000) }))
      : [];
    return delegateVoice(deps!, req.user!.id, callIdOf(b), {
      transcript, typed: typeof b.typed === "string" ? b.typed.slice(0, 2000) : null, interrupted: typeof b.interrupted === "string" ? b.interrupted.slice(0, 300) : null,
    });
  }));
  /** Uso de tokens de uma resposta (response.done): só custo e telemetria; a cota é o tempo autorizado acima. */
  router.post("/voice/usage", voiceRoute(async (req, b) => recordVoiceUsage(deps!, req.user!.id, callIdOf(b), typeof b.usage === "object" && b.usage ? b.usage : {})));
  router.post("/voice/transcript", voiceRoute(async (req, b) => {
    const role = b.role === "tutor" ? "tutor" : b.role === "student" ? "student" : null;
    if (!role || typeof b.text !== "string") throw new TutorError("Transcrição inválida.", 400);
    return voiceTranscript(deps!, req.user!.id, callIdOf(b), role, b.text);
  }));
  /** Ferramenta pedida pela voz: só as da lista, sempre com o aluno e a sessão desta chamada. */
  router.post("/voice/tool", voiceRoute(async (req, b) => {
    const id = callIdOf(b);
    const name = String(b.name ?? "");
    if (!TOOL_NAMES.has(name)) throw new TutorError("Ferramenta desconhecida.", 400);
    const v = await voiceCall(deps!, req.user!.id, id);
    if (v.status !== "active") throw new TutorError("A conversa por voz foi encerrada.", 409);
    let args: Record<string, unknown> = {};
    try {
      args = typeof b.arguments === "string" ? JSON.parse(b.arguments || "{}") : (b.arguments ?? {});
    } catch {
      args = {};
    }
    const persona = await deps!.db.service<{ personality: { id: string } } | null>("ch_worker_tutor_context", { p_user: req.user!.id, p_session_id: v.session_id });
    return { output: await runTutorTool({ deps: deps!, userId: req.user!.id, sessionId: v.session_id, personaId: persona?.personality.id ?? "direto", remember: (t) => rememberEvidence(id, t) }, name, args) };
  }));

  return router;
}
