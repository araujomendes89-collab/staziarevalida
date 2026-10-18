/**
 * API do banco de desenvolvimento (/api/dev-db): login local e chamada das funções app_*.
 * Faz no servidor o mesmo papel que o Supabase faz em produção. Só existe fora de produção.
 */
import express, { type Request, type Response, Router } from "express";
import { BackendError, signUpMetadata } from "../../src/novo/data/backend";
import type { DevDatabase } from "./devDatabase";

const tokenOf = (req: Request) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim() || null;

/**
 * Metadados extras do cadastro que vêm no corpo (phone, terms_version, user_agent, declares_adult, declares_physician). Só texto passa; qualquer outro campo ou tipo
 * é ignorado, e quem valida o conteúdo é o gatilho do banco (como no Supabase).
 */
function signupMetaFromBody(body: Record<string, unknown>): Record<string, string> {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return signUpMetadata({
    phone: text(body.phone), termsVersion: text(body.terms_version), userAgent: text(body.user_agent),
    declaresAdult: body.declares_adult === "true", declaresPhysician: body.declares_physician === "true",
  });
}

function fail(res: Response, error: unknown) {
  const code = error instanceof BackendError ? error.code : "unknown";
  const message = error instanceof Error ? error.message : String(error);
  const status = code === "invalid_credentials" ? 401 : code === "unknown" ? 400 : 422;
  // a dica do banco (cadeado/amostra dos planos) segue para a tela, como no Supabase
  const hint = error instanceof BackendError && error.hint ? error.hint : undefined;
  res.status(status).json({ error: hint ? { code, message, hint } : { code, message } });
}

export function createDevDbRouter(getDb: () => Promise<DevDatabase>): Router {
  const router = Router();
  router.use(express.json({ limit: "2mb" }));

  router.get("/health", (_req, res) => res.json({ ok: true, mode: "dev-db" }));

  router.get("/auth/me", async (req, res) => {
    const db = await getDb();
    res.json({ user: await db.userForToken(tokenOf(req)) });
  });

  router.post("/auth/signup", async (req, res) => {
    try {
      const db = await getDb();
      const body = req.body ?? {};
      const { name = "", email = "", password = "" } = body;
      const user = await db.core.createAccount(String(name), String(email), String(password), false, signupMetaFromBody(body));
      res.json({ user, token: await db.createSession(user.id) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/auth/signin", async (req, res) => {
    try {
      const db = await getDb();
      const user = await db.core.verify(String(req.body?.email ?? ""), String(req.body?.password ?? ""));
      res.json({ user, token: await db.createSession(user.id) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/auth/signout", async (req, res) => {
    const db = await getDb();
    const token = tokenOf(req);
    if (token) await db.revokeSession(token);
    res.json({ ok: true });
  });

  router.post("/auth/password", async (req, res) => {
    try {
      const db = await getDb();
      const user = await db.userForToken(tokenOf(req));
      if (!user) throw new BackendError("invalid_credentials", "Entre na sua conta.");
      await db.core.setPassword(user.id, String(req.body?.password ?? ""));
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });

  router.get("/auth/master-needed", async (_req, res) => {
    const db = await getDb();
    res.json({ needed: !(await db.core.hasAdmin()) });
  });

  router.post("/auth/master", async (req, res) => {
    try {
      const db = await getDb();
      if (await db.core.hasAdmin()) throw new BackendError("unknown", "Já existe um administrador neste ambiente.");
      const { name = "", email = "", password = "" } = req.body ?? {};
      const user = await db.core.createAccount(String(name), String(email), String(password), true);
      res.json({ user, token: await db.createSession(user.id) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/rpc", async (req, res) => {
    try {
      const db = await getDb();
      const user = await db.userForToken(tokenOf(req));
      const data = await db.core.rpc(user, String(req.body?.fn ?? ""), req.body?.args ?? {});
      res.json({ data: data ?? null });
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
