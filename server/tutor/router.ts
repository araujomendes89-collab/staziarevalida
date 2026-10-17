/**
 * Rotas /api/tutor. O navegador nunca recebe chave de IA: a fala do aluno chega aqui com o token da sessão, o servidor monta a
 * resposta e grava. Leituras (conversas, preferências, relatório) vão direto pelas funções app_tutor_* com o RLS valendo.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import type { Identity } from "../contentHub/infra";
import { TUTOR_CONSENT_PENDING, TutorError, consentError, resolveTutorProvider, tutorTurn, type TutorDeps } from "./engine";
import { speechProviderFor, tutorSpeech } from "./speech";
import { endVoice, guardarAberturaDaPonte, purgeVoiceTranscripts, recordVoiceMetrics, recordVoiceUsage, rememberEvidence, renewVoice, startVoice, sweepVoice, voiceCall, voiceReady, voiceTranscript, type EndReason } from "./realtime";
import { runTutorTool, TOOL_NAMES } from "./tools";
import { limparRetornoFerramenta } from "./sigilo";
import { delegateVoice, sayVoice, type Letter } from "./delegate";
import { naturalOpening, OPENING_TIMEOUT_MS, OPENING_WAIT_MS } from "./opening";
import { tutorSettings } from "./settings";
import { questionHint, questionHintEnabled } from "./questionHint";
import { geminiVoiceConfig, planProviders, vertexPonteConfig } from "./voiceProviders";
import { relatorioConfere } from "../vozPonte/bilhete";
import { planPersonaTurn } from "./voiceReactions";
import { personaStateLayer } from "./personalityEngine";
import { elevenLabsReadiness, officialVoiceForPersonality } from "./officialVoices";
import { samplePath } from "./voicePreview";
import { elevenAccessOf, nexusStatus, openNexus, type TtsQuota } from "./nexus";
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, STT_BLOCK, STT_BUSY, STT_PER_MINUTE, audioFitsSeconds, sttAccessOf, sttConfig, transcribe } from "./stt";
import { ACCESS_CHECK_FAILED, shown } from "../auth/friendlyError";
import { rateHit } from "./limits";
import { rotasConhecimentoPonte } from "./conhecimento/rotaPonte";

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
      fail(res, 500, shown(error));
    }
  });

  /**
   * Relatório de uso da PONTE de voz (Cloud Run → app), no fim de cada ligação pelo Vertex: tokens e custo estimado vão para o
   * registro de custos (ai_usage_ledger). Sem login de aluno: assinatura HMAC com VOZ_PONTE_SEGREDO (a mesma do bilhete).
   */
  router.post("/voice/ponte-uso", async (req, res) => {
    const ponte = vertexPonteConfig();
    const corpo = typeof (req as Request & { rawBody?: string }).rawBody === "string" ? (req as Request & { rawBody?: string }).rawBody! : JSON.stringify(req.body ?? {});
    if (!deps || !ponte || !relatorioConfere(corpo, String(req.headers["x-stazia-ponte-assinatura"] ?? ""), ponte.segredo)) return fail(res, 401, "Não autorizado.");
    try {
      const b = JSON.parse(corpo) as { vc?: string; u?: string; modelo?: string; duracao_s?: number; uso?: Record<string, number>; custo_usd?: number; t?: number };
      if (!uuid.test(String(b.vc ?? "")) || !uuid.test(String(b.u ?? "")) || Math.abs(Date.now() - Number(b.t ?? 0)) > 10 * 60_000) return fail(res, 400, "Relatório inválido.");
      const v = await voiceCall(deps, String(b.u), String(b.vc));
      const n = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Math.round(Number(x))) : 0);
      await deps.db.service("ch_worker_tutor_ledger", { p_user: b.u, p_session_id: v.session_id, p_entry: {
        feature: "tutor_voice_gemini", provider: "google-vertex", model: String(b.modelo ?? "").slice(0, 60),
        input_text_tokens: n(b.uso?.textoEntrada), input_audio_tokens: n(b.uso?.audioEntrada), output_text_tokens: n(b.uso?.textoSaida), output_audio_tokens: n(b.uso?.audioSaida),
        duration_seconds: n(b.duracao_s), estimated_cost_usd: Math.max(0, Number(b.custo_usd) || 0), meta: { voice_call: b.vc, via: "vertex-ponte", por: "tokens" },
      } });
      res.json({ ok: true });
    } catch (error) {
      fail(res, 500, shown(error));
    }
  });

  /**
   * Abertura da ligação relatada pela PONTE (revisão de 17/10): a 1ª fala do professor como o Google transcreveu, assinada com
   * VOZ_PONTE_SEGREDO. Só por aqui a abertura da voz pelo Vertex entra na memória (o texto do navegador não entra).
   */
  router.post("/voice/ponte-abertura", async (req, res) => {
    const ponte = vertexPonteConfig();
    const corpo = typeof (req as Request & { rawBody?: string }).rawBody === "string" ? (req as Request & { rawBody?: string }).rawBody! : JSON.stringify(req.body ?? {});
    if (!deps || !ponte || !relatorioConfere(corpo, String(req.headers["x-stazia-ponte-assinatura"] ?? ""), ponte.segredo)) return fail(res, 401, "Não autorizado.");
    try {
      const b = JSON.parse(corpo) as { vc?: string; u?: string; texto?: string; t?: number };
      if (!uuid.test(String(b.vc ?? "")) || !uuid.test(String(b.u ?? "")) || typeof b.texto !== "string" || Math.abs(Date.now() - Number(b.t ?? 0)) > 10 * 60_000) return fail(res, 400, "Relatório inválido.");
      res.json({ ok: await guardarAberturaDaPonte(deps, String(b.u), String(b.vc), b.texto.slice(0, 600)) });
    } catch (error) {
      fail(res, 500, shown(error));
    }
  });

  // cérebro do Tutor: busca de conhecimento e material do tema pedidos pela PONTE de voz (assinados, sem login de aluno)
  router.use(rotasConhecimentoPonte(deps));

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Tutor não configurado no servidor.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      fail(res, 500, ACCESS_CHECK_FAILED);
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
      ready: status.ready, simulated: status.isMock, question_hint: questionHintEnabled(process.env, settings.question_hint_enabled === true) && settings.enabled && status.ready, neural_voice: voice.ready, realtime_voice: vr.ready && settings.voice_enabled !== false, live_voice: plan.first === "live",
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

  /**
   * "Ouvir" do aluno: a Apresentação guardada quando a voz foi aprovada (a versão no ar precisa ser a aprovada). Não gera voz
   * nem gasta caracteres. Vale as mesmas travas da voz do professor (VZ02): voz do Tutor ligada, "só equipe" desligado (ou quem
   * pede é da equipe) e aprovação; a tela esconde o botão nesses casos e o pedido direto também é recusado.
   */
  router.get("/voice/sample/:personality", async (req: Authed, res) => {
    try {
      const quota = await deps!.db.service<TtsQuota>("ch_worker_tutor_tts_quota", { p_user: req.user!.id });
      if (quota?.consent_pending) return failTutor(res, consentError());
      const id = officialVoiceForPersonality(String(req.params.personality ?? ""));
      const row = id ? elevenLabsReadiness(deps!.elevenEnv ?? process.env, quota?.approvals ?? {}).rows.find((r) => r.id === id) : null;
      const approval = id ? quota?.approvals?.[id] : null;
      // need: 0, pois a amostra não gasta caracteres: o limite do dia não a bloqueia
      const access = row && quota ? elevenAccessOf({ quota, row, need: 0 }) : null;
      if (!id || !access?.ok || !row?.approved || !approval?.sample_path || approval.sample_path !== samplePath(id, row.fingerprint) || !deps!.storage) return fail(res, 404, "Amostra indisponível.");
      const audio = await deps!.storage.get(approval.sample_path).catch(() => null);
      if (!audio) return fail(res, 404, "Amostra indisponível.");
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(audio);
    } catch (error) {
      deps!.log?.(`[tutor] amostra da voz: ${(error as Error).message.slice(0, 160)}`);
      fail(res, 500, "Não foi possível tocar a amostra agora.");
    }
  });

  /**
   * Transcrição da fala do aluno na Nexus: o áudio (até 4 MB e 45 s) vem no corpo, com X-Voice-Call-Id (a conversa de voz aberta)
   * e X-Audio-Seconds. Ordem: conversa de voz do aluno, aceite, microfone liberado ao aluno (CF02), transcrição ligada, tamanho,
   * tetos diários. Devolve só o texto.
   */
  const TOO_BIG = "Áudio acima de 45 segundos ou de 4 MB.";
  // teto da transcrição por aluno nesta instância: uma por vez e até STT_PER_MINUTE por minuto
  const sttRecent = new Map<string, number[]>();
  const sttBusy = new Set<string>();
  router.post("/voice/transcribe", express.raw({ type: "audio/*", limit: MAX_AUDIO_BYTES }), async (req: Authed, res) => {
    try {
      const callId = String(req.headers["x-voice-call-id"] ?? "");
      const v = uuid.test(callId) ? await voiceCall(deps!, req.user!.id, callId).catch(() => null) : null;
      if (!v || v.status !== "active" || v.provider !== "tts") return fail(res, 409, "A conversa por voz foi encerrada.");
      const quota = await deps!.db.service<TtsQuota>("ch_worker_tutor_tts_quota", { p_user: req.user!.id });
      if (quota?.consent_pending) return failTutor(res, consentError());
      // CF02: o microfone é da equipe até o dono abrir aos alunos e preencher os tetos diários; recusa antes de olhar o áudio e de qualquer gasto
      const staff = quota?.staff === true;
      const settings = await tutorSettings(deps!);
      const closed = sttAccessOf({ staff, mode: quota?.mode, settings });
      if (closed) return res.status(403).json({ error: STT_BLOCK[closed].message, code: STT_BLOCK[closed].code });
      if (!(deps!.stt ?? sttConfig()).ready) return fail(res, 503, "A transcrição não está ligada no servidor.");
      const seconds = Number(req.headers["x-audio-seconds"]);
      const audio = Buffer.isBuffer(req.body) ? req.body : null;
      if (req.headers["x-audio-seconds"] == null || !Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_AUDIO_SECONDS || !audio?.length) return fail(res, 413, TOO_BIG);
      if (!audioFitsSeconds(audio.length, seconds)) return fail(res, 413, TOO_BIG);
      const uid = req.user!.id;
      // tetos diários do aluno e da plataforma: o que já foi transcrito hoje (registro de uso) mais este áudio
      if (!staff) {
        const used = await deps!.db.service<{ user_seconds: number; account_seconds: number }>("ch_worker_tutor_stt_today", { p_user: uid });
        const over = sttAccessOf({ staff, mode: quota?.mode, settings, used: { user_seconds: Number(used?.user_seconds ?? 0), account_seconds: Number(used?.account_seconds ?? 0) }, seconds });
        if (over) return res.status(403).json({ error: STT_BLOCK[over].message, code: STT_BLOCK[over].code });
      }
      const now = Date.now();
      const recent = (sttRecent.get(uid) ?? []).filter((t) => now - t < 60_000);
      if (sttBusy.has(uid) || recent.length >= STT_PER_MINUTE) return res.status(429).json({ error: STT_BUSY, code: "stt_busy" });
      if (sttRecent.size > 5_000) for (const [k, ts] of sttRecent) if (!ts.some((t) => now - t < 60_000)) sttRecent.delete(k);
      sttRecent.set(uid, [...recent, now]);
      sttBusy.add(uid);
      try {
        res.json(await transcribe(deps!, uid, callId, audio, String(req.headers["content-type"] ?? ""), seconds));
      } finally {
        sttBusy.delete(uid);
      }
    } catch (error) {
      if (error instanceof TutorError) return failTutor(res, error);
      deps!.log?.("[tutor] transcrição: erro inesperado");
      fail(res, 500, "Não entendi, pode repetir ou digitar?");
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

  /**
   * Abertura e passagem naturais (17/10): depois de app_tutor_start ou app_tutor_next_question chamados direto pelo aplicativo, a
   * fala sorteada pelo banco é só a reserva; aqui a IA cria a fala do momento e troca o texto. body: { session_id }.
   * Devolve { opening: { id, content } } ou { opening: null } (a reserva fica). Só troca a última fala da conversa, uma vez: o banco
   * reserva a fala antes de chamar a IA e conta no limite de frequência do aluno ('tutor_opening'), então pedidos repetidos ou juntos
   * não geram custo. rapido: true = a tela está esperando (espera curta, depois fica a reserva).
   */
  router.post("/opening", async (req: Authed, res) => {
    const sessionId = String(req.body?.session_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return fail(res, 400, "Conversa inválida.");
    res.json({ opening: await naturalOpening(deps!, req.user!.id, sessionId, req.body?.rapido === true ? OPENING_WAIT_MS : OPENING_TIMEOUT_MS) });
  });

  /**
   * Dica ANTES de responder (só treino; nasce desligada: interruptor do painel ou TUTOR_QUESTION_HINT=1). body: { question_id }. Nunca traz gabarito, explicação nem fontes.
   */
  router.post("/question-hint", async (req: Authed, res) => {
    try {
      const questionId = String(req.body?.question_id ?? "");
      if (!/^[A-Za-z0-9_.:-]{3,80}$/.test(questionId)) return fail(res, 400, "Questão inválida.");
      res.json(await questionHint(deps!, req.user!, questionId));
    } catch (error) {
      if (error instanceof TutorError) return failTutor(res, error);
      deps!.log?.(`[tutor] dica: erro: ${(error as Error).message}`);
      fail(res, 500, "O Tutor não conseguiu dar a dica agora.");
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
  // ---- Nexus: estado por professor, abertura (o jeito da conversa) e o turno pela voz do professor
  router.get("/nexus", async (req: Authed, res) => {
    try {
      res.json(await nexusStatus(deps!, req.user!.id));
    } catch (error) {
      if (error instanceof TutorError) return failTutor(res, error);
      deps!.log?.(`[tutor] nexus: ${(error as Error).message.slice(0, 160)}`);
      fail(res, 500, "Não foi possível abrir a Nexus agora.");
    }
  });
  router.post("/voice/open", voiceRoute(async (req, b) => {
    if (!uuid.test(String(b.session_id ?? ""))) throw new TutorError("Conversa inválida.", 400);
    if (b.skip != null && b.skip !== "eleven" && b.skip !== "voice") throw new TutorError("Pedido inválido.", 400);
    return openNexus(deps!, req.user!.id, String(b.session_id), b.force === true, b.skip ?? null);
  }));
  const letterOf = (x: unknown): Letter | null => (typeof x === "string" && /^[A-D]$/.test(x.toUpperCase()) ? (x.toUpperCase() as Letter) : null);
  router.post("/voice/say", voiceRoute(async (req, b) => {
    const turnId = typeof b.client_turn_id === "string" ? b.client_turn_id : "";
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(turnId)) throw new TutorError("Turno inválido.", 400);
    const command = ["answer", "hint", "reveal", "next"].includes(b.command) ? b.command : null;
    if (b.command != null && !command) throw new TutorError("Pedido inválido.", 400);
    return sayVoice(deps!, req.user!.id, callIdOf(b), {
      clientTurnId: turnId, command, option: letterOf(b.option), marked: letterOf(b.marked),
      text: typeof b.text === "string" ? b.text.slice(0, 2000) : null, interrupted: typeof b.interrupted === "string" ? b.interrupted.slice(0, 300) : null,
    });
  }));

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
  /**
   * Ferramenta pedida pela voz: só as da lista, sempre com o aluno e a sessão desta chamada. Fase 0 (L2): só na voz ao vivo que usa
   * ferramentas (Realtime e Gemini); a Nexus "por escrito" (tts) e o GPT-Live (delega pelo /voice/delegate) são recusados, e cada
   * pedido conta no limite de frequência do aluno, no banco.
   */
  router.post("/voice/tool", voiceRoute(async (req, b) => {
    const id = callIdOf(b);
    const name = String(b.name ?? "");
    if (!TOOL_NAMES.has(name)) throw new TutorError("Ferramenta desconhecida.", 400);
    const v = await voiceCall(deps!, req.user!.id, id);
    if (v.status !== "active") throw new TutorError("A conversa por voz foi encerrada.", 409);
    if (v.provider !== "realtime" && v.provider !== "gemini") throw new TutorError("Esta conversa por voz não usa ferramentas.", 409);
    await rateHit(deps!, req.user!.id, "voice_tool");
    let args: Record<string, unknown> = {};
    try {
      args = typeof b.arguments === "string" ? JSON.parse(b.arguments || "{}") : (b.arguments ?? {});
    } catch {
      args = {};
    }
    const persona = await deps!.db.service<{ personality: { id: string } } | null>("ch_worker_tutor_context", { p_user: req.user!.id, p_session_id: v.session_id });
    const output = await runTutorTool({ deps: deps!, userId: req.user!.id, sessionId: v.session_id, personaId: persona?.personality.id ?? "acolhedor", remember: (t) => rememberEvidence(id, t) }, name, args);
    // voz do Gemini pelo Vertex: depois da correção, o tom novo do professor vem do Personality Engine (acerto ou erro)
    if (name === "submit_answer" && v.provider === "gemini" && geminiVoiceConfig().via === "vertex" && output && typeof output === "object" && "result" in output) {
      try {
        const correct = Boolean((output as { result?: { is_correct?: boolean } }).result?.is_correct);
        const d = await planPersonaTurn(deps!, { userId: req.user!.id, personality: persona?.personality.id ?? "acolhedor", provider: "gemini_live", memory: null, facts: [correct ? "correct" : "wrong"] });
        // só o ESTADO (a ficha e o jeito fixo já estão nas instruções da sessão); com o humor da ligação, a ponte troca por o dela
        (output as Record<string, unknown>).tom_do_professor = personaStateLayer(d);
      } catch {
        // sem o motor no banco: fica o "tone" de sempre
      }
    }
    // o que a ferramenta devolve é dado para a voz: sai sem chave, endereço ou nome interno do banco (sigilo.ts)
    return { output: limparRetornoFerramenta(output) };
  }));

  // corpo grande demais no express.raw da transcrição: o mesmo aviso, em JSON
  router.use((error: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (error?.type === "entity.too.large") return fail(res, 413, "Áudio acima de 45 segundos ou de 4 MB.");
    next(error);
  });
  return router;
}
