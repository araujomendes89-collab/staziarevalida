/**
 * Rotas /api/tutor. O navegador nunca recebe chave de IA: a fala do aluno chega aqui com o token da sessão, o servidor monta a
 * resposta e grava. Leituras (conversas, preferências, relatório) vão direto pelas funções app_tutor_* com o RLS valendo.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import type { Identity } from "../contentHub/infra";
import { TutorError, resolveTutorProvider, tutorTurn, type TutorDeps } from "./engine";

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
    res.json({ ready: status.ready, simulated: status.isMock, ...(admin ? { provider: status.provider, model: status.model, pending: status.pending } : {}) });
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
