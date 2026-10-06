/**
 * Rotas /api/tutor. O navegador nunca recebe chave de IA: a fala do aluno chega aqui com o token da sessão, o servidor monta a
 * resposta e grava. Leituras (conversas, preferências, relatório) vão direto pelas funções app_tutor_* com o RLS valendo.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import type { Identity } from "../contentHub/infra";
import { TutorError, resolveTutorProvider, tutorTurn, type TutorDeps } from "./engine";
import { speechProviderFor, tutorSpeech } from "./speech";

type Authed = Request & { user?: Identity };
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

export function createTutorRouter(deps: TutorDeps | null, pending: string | null = null) {
  const router = express.Router();

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
    res.json({
      ready: status.ready, simulated: status.isMock, neural_voice: voice.ready,
      ...(admin ? { provider: status.provider, model: status.model, pending: status.pending, voice_provider: voice.provider, voice_model: voice.model, voice_pending: voice.pending } : {}),
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
      if (error instanceof TutorError) return fail(res, error.status, error.message);
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
      if (!["message", "hint", "react"].includes(type)) return fail(res, 400, "Ação inválida.");
      const result = await tutorTurn(deps!, req.user!.id, sessionId, {
        type: type as "message" | "hint" | "react",
        text: typeof body.text === "string" ? body.text : undefined,
        voice: body.voice === true,
        interrupted: typeof body.interrupted === "string" ? body.interrupted : null,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof TutorError) return fail(res, error.status, error.message);
      deps!.log?.(`[tutor] erro: ${(error as Error).message}`);
      fail(res, 500, "O Tutor não conseguiu responder agora.");
    }
  });

  return router;
}
