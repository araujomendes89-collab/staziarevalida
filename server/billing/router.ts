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
import type { Avisos } from "../avisos/avisos";
import type { EmailsCobranca } from "../avisos/emailsCobranca";

export interface BillingRoutesDeps {
  billing: Billing;
  provider: PaymentProvider | null;
  authenticate: (req: Request) => Promise<Identity | null>;
  log?: (m: string) => void;
  /** Avisos de cobrança (013760): e-mail logo depois do aviso do fornecedor e na tarefa diária. Opcional. */
  avisos?: Avisos | null;
  /** 013850: e-mail "Sua nota fiscal" ao aluno e alertas de gasto de IA ao dono. Opcional. */
  emails?: EmailsCobranca | null;
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
      // o aviso ao aluno (pagamento falhou / acesso liberado) nasce no banco; o e-mail sai já, sem atrasar a resposta por erro
      await deps.avisos?.enviar(5).catch((e) => deps.log?.(`[avisos] envio depois do aviso falhou: ${(e as Error).message}`.slice(0, 300)));
      // nota fiscal autorizada: o e-mail "Sua nota fiscal" sai já (o que sobrar vai na tarefa de hora em hora)
      if (notice.kind === "invoice") await deps.emails?.enviarNotas(5).catch((e) => deps.log?.(`[notas] envio depois do aviso falhou: ${(e as Error).message}`.slice(0, 300)));
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
    // alertas de gasto de IA ao dono e e-mails de nota (013850): valem mesmo com a cobrança desligada (o gasto de IA existe sem ela)
    const emails = deps?.emails ? await deps.emails.rodar().catch((e) => (deps.log?.(`[emails] tarefa falhou: ${(e as Error).message}`.slice(0, 300)), { erro: true })) : null;
    if (!deps?.provider) return res.json({ enabled: false, emails });
    try {
      const cobranca = await deps.billing.runScheduled();
      // depois do Pix de renovação gerado (7 dias antes), os avisos 7/3/1 e de acesso pausado; e os e-mails pendentes
      let avisos: unknown = null;
      if (deps.avisos) {
        try {
          avisos = { novos: await deps.avisos.gerar(), email: await deps.avisos.enviar(50) };
        } catch (e) {
          deps.log?.(`[avisos] tarefa diária falhou: ${(e as Error).message}`.slice(0, 300));
          avisos = { erro: true };
        }
      }
      // as notas que a tarefa acabou de achar: o e-mail sai nesta mesma rodada
      const notas = cobranca.notas && deps.emails ? await deps.emails.enviarNotas(50).catch(() => ({ erro: true })) : null;
      res.json({ ...cobranca, avisos, emails, ...(notas ? { notas_email: notas } : {}) });
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
  router.post("/payment-method", run((d, req) => d.billing.changeMethod(req.user!, req.body ?? {})));
  router.post("/cancel-renewal", run((d, req) => d.billing.cancelRenewal(req.user!)));
  router.post("/refunds", run((d, req) => d.billing.refund(req.user!, req.body?.cobranca_id)));
  // Administração > ficha do aluno > Pagamentos > "Devolver pagamento" (013850). Só administrador: o banco confere o papel de quem
  // está logado (ch_worker_billing_admin_devolucao) e grava quem fez.
  router.post("/admin/devolver", run((d, req) => d.billing.adminRefund(req.user!, req.body ?? {})));
  return router;
}
