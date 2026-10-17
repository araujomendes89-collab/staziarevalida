/**
 * Rotas /api/cobranca (cobrança, sem depender do fornecedor). Tudo exige aluno logado, menos:
 *   - POST /webhook: aviso do fornecedor, sem login; vale pelo token conferido em tempo constante no adaptador e pela
 *     cobrança relida na API (core.processCharge). Corpo CRU (montado antes do express.json em server.ts);
 *   - GET /cron: tarefa agendada (CRON_SECRET, comparado em tempo constante).
 * Sem chave do fornecedor o recurso está desligado: /overview diz {enabled:false} e o resto responde 503.
 */
import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Identity } from "../contentHub/infra";
import { ACCESS_CHECK_FAILED, shown } from "../auth/friendlyError";
import { BillingError, type Billing } from "./core";
import { BillingSignatureError, type PaymentProvider } from "./provider";

export interface BillingRoutesDeps {
  billing: Billing;
  provider: PaymentProvider | null;
  authenticate: (req: Request) => Promise<Identity | null>;
  log?: (m: string) => void;
}

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

const sameSecret = (a: string, b: string) => {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
};

/** Aviso do fornecedor: token conferido, contado uma vez; falha de processamento = 500 (o fornecedor tenta de novo). */
export function createWebhookHandler(get: () => BillingRoutesDeps | null) {
  return async (req: Request, res: Response) => {
    const deps = get();
    if (!deps?.provider) return fail(res, 503, "Pagamento desligado.");
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) return fail(res, 400, "Corpo do aviso inválido.");
    let notice;
    try {
      notice = deps.provider.parseNotice(raw, req.headers);
    } catch (e) {
      if (e instanceof BillingSignatureError) return fail(res, 401, "Não autorizado.");
      return fail(res, 400, "Aviso inválido.");
    }
    try {
      await deps.billing.handleNotice(notice);
      res.json({ received: true });
    } catch (e) {
      deps.log?.(`[billing] falha ao processar ${notice.eventId}: ${(e as Error).message}`.slice(0, 300));
      fail(res, 500, "Falha ao processar o aviso.");
    }
  };
}

export function createBillingRouter(get: () => BillingRoutesDeps | null) {
  const router = express.Router();
  type Authed = Request & { user?: Identity };

  router.get("/cron", async (req: Request, res: Response) => {
    const deps = get();
    const secret = process.env.CRON_SECRET ?? "";
    const got = String(req.headers.authorization ?? "");
    if (!secret || !sameSecret(`Bearer ${secret}`, got)) return fail(res, 401, "Não autorizado.");
    if (!deps?.provider) return res.json({ enabled: false });
    try {
      res.json(await deps.billing.runScheduled());
    } catch (e) {
      deps.log?.(`[billing] tarefa agendada falhou: ${(e as Error).message}`.slice(0, 300));
      fail(res, 500, shown(e));
    }
  });

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    const deps = get();
    if (!deps) return fail(res, 503, "Pagamento sem servidor configurado.");
    try {
      const user = await deps.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (e) {
      deps.log?.(`[billing] conferência de login falhou: ${(e as Error).message}`.slice(0, 300));
      fail(res, 500, ACCESS_CHECK_FAILED);
    }
  });

  const run = (fn: (deps: BillingRoutesDeps, req: Authed) => Promise<unknown>) => async (req: Authed, res: Response) => {
    const deps = get()!;
    try {
      res.json(await fn(deps, req));
    } catch (e) {
      if (e instanceof BillingError) return res.status(e.status).json(e.code ? { error: e.message, code: e.code } : { error: e.message });
      deps.log?.(`[billing] erro: ${(e as Error).message}`.slice(0, 300));
      fail(res, 500, shown(e));
    }
  };

  const ipOf = (req: Request) => String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim().slice(0, 64) || null;

  router.get("/overview", run((d, req) => d.billing.overview(req.user!)));
  router.post("/checkout", run((d, req) => d.billing.checkout(req.user!, req.body ?? {}, { ip: ipOf(req), userAgent: String(req.headers["user-agent"] ?? "") })));
  router.get("/orders/:id", run((d, req) => d.billing.orderStatus(req.user!, String(req.params.id))));
  router.post("/orders/:id/cancel", run((d, req) => d.billing.cancelOrder(req.user!, String(req.params.id))));
  router.post("/renewal/pix", run((d, req) => d.billing.payRenewalByPix(req.user!)));
  router.post("/cancel-renewal", run((d, req) => d.billing.cancelRenewal(req.user!)));
  router.post("/refunds", run((d, req) => d.billing.refund(req.user!, req.body?.cobranca_id)));
  return router;
}
