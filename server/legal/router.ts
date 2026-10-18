/**
 * Rotas /api/legal (ramo termo-funcoes): só tarefas agendadas da Vercel (com CRON_SECRET). Nenhuma rota é chamada pelo navegador.
 *   GET /api/legal/email   a cada 5 minutos: manda os e-mails da fila (aviso de conta inativa). O contrato NÃO vai por e-mail
 *                          (decisão do dono, 18/10/2026): fica só em Minha Conta → Documentos.
 *                          Sem as variáveis SMTP_*: não faz nada ({ desligado: true }) e os e-mails ficam na fila.
 *   GET /api/legal/diaria  uma vez por dia: rotina de contas inativas e expurgo dos aceites (013810). As duas nascem DESLIGADAS
 *                          (chaves em public.app_rotinas_conta_config): desligadas, só devolvem o relatório do que fariam.
 * Fora da Vercel (servidor normal), startLegalScheduler faz o mesmo por intervalo.
 * O registro (log) leva só o número do e-mail na fila e a mensagem do erro; nunca o endereço nem a senha.
 */
import express, { type Response } from "express";
import type { ContentDb } from "../contentHub/infra";
import { shown } from "../auth/friendlyError";
import { SmtpError, type Mailer } from "../email/smtp";
import { renderItem, type ItemFila } from "./emails";

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

export interface LegalDeps {
  db: ContentDb;
  mailer: Mailer | null;
  /** APP_BASE_URL (ex.: https://app.staziamed.com.br): o link para Minha Conta e para entrar. Sem ele, o endereço oficial. */
  baseUrl: string | null;
  log?: (m: string) => void;
  /** limite de tempo de uma rodada (a função da Vercel corta em 300 s) */
  budgetMs?: number;
}

export interface ResultadoEnvio {
  desligado?: boolean;
  enviados: number;
  novas_tentativas: number;
  incertos: number;
  cancelados: number;
}

type Resultado = "enviado" | "tentar_de_novo" | "incerto" | "cancelado";

/** Monta e manda um e-mail. Não dá para montar (sem e-mail, sem texto): cancelado. Caiu depois de mandar: incerto (não repete). */
async function enviarUm(mailer: Mailer, item: ItemFila, baseUrl: string | null): Promise<{ resultado: Resultado; erro: string | null }> {
  let email;
  try {
    if (!item.email) throw new Error("Conta sem e-mail.");
    email = renderItem(item, baseUrl);
  } catch (e) {
    return { resultado: "cancelado", erro: (e as Error).message };
  }
  try {
    await mailer.send({ to: item.email, ...email });
    return { resultado: "enviado", erro: null };
  } catch (e) {
    return { resultado: e instanceof SmtpError && e.talvezEntregue ? "incerto" : "tentar_de_novo", erro: (e as Error).message };
  }
}

/** Manda os e-mails pendentes da fila, em lotes de 20, até esvaziar ou acabar o tempo. */
export async function enviarFila(deps: LegalDeps): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { enviados: 0, novas_tentativas: 0, incertos: 0, cancelados: 0 };
  if (!deps.mailer) return { ...r, desligado: true };
  const log = (m: string) => deps.log?.(m.slice(0, 300));
  const fim = Date.now() + (deps.budgetMs ?? 120_000);
  while (Date.now() < fim) {
    const lote = (await deps.db.service<ItemFila[]>("ch_worker_email_pegar", { p_limite: 20 })) ?? [];
    if (!lote.length) break;
    for (const item of lote) {
      const { resultado, erro } = await enviarUm(deps.mailer, item, deps.baseUrl);
      if (resultado === "enviado") r.enviados++;
      else if (resultado === "tentar_de_novo") r.novas_tentativas++;
      else if (resultado === "incerto") r.incertos++;
      else r.cancelados++;
      if (erro) log(`[legal] e-mail ${item.id} (${item.kind}): ${resultado} — ${erro}`);
      await deps.db
        .service("ch_worker_email_marcar", { p_id: item.id, p_resultado: resultado, p_erro: erro })
        .catch((e) => log(`[legal] e-mail ${item.id}: não marcado (${(e as Error).message})`));
    }
    if (lote.length < 20) break;
  }
  return r;
}

/** Rotina diária: contas inativas e expurgo (cada uma no seu modo; desligadas = ensaio). Uma falha não impede a outra. */
export async function rotinaDiaria(deps: LegalDeps): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [nome, fn] of [["contas_inativas", "ch_worker_contas_inativas"], ["expurgo_aceites", "ch_worker_expurgo_aceites"]] as const) {
    try {
      const res = await deps.db.service<Record<string, unknown>>(fn);
      out[nome] = res;
      const { contas: _lista, ...resumo } = (res ?? {}) as Record<string, unknown>;
      deps.log?.(`[legal] ${nome}: ${JSON.stringify(resumo)}`);
    } catch (error) {
      out[nome] = { erro: (error as Error).message };
      deps.log?.(`[legal] ${nome} falhou: ${(error as Error).message}`);
    }
  }
  return out;
}

export function createLegalRouter(deps: LegalDeps | null) {
  const router = express.Router();
  const autorizado = (auth: string | undefined) => {
    const secret = process.env.CRON_SECRET;
    return Boolean(deps && secret && auth === `Bearer ${secret}`);
  };

  router.get("/email", async (req, res) => {
    if (!autorizado(req.headers.authorization)) return fail(res, 401, "Não autorizado.");
    try {
      res.json(await enviarFila(deps!));
    } catch (error) {
      deps!.log?.(`[legal] fila de e-mail falhou: ${(error as Error).message}`);
      fail(res, 500, shown(error));
    }
  });

  router.get("/diaria", async (req, res) => {
    if (!autorizado(req.headers.authorization)) return fail(res, 401, "Não autorizado.");
    try {
      res.json(await rotinaDiaria(deps!));
    } catch (error) {
      fail(res, 500, shown(error));
    }
  });

  return router;
}

/** Fora da Vercel: fila de e-mail a cada 5 minutos e rotina diária a cada 24 h (a primeira 1 minuto depois de subir). */
export function startLegalScheduler(deps: LegalDeps, emailMs = 5 * 60 * 1000, diariaMs = 24 * 60 * 60 * 1000) {
  const log = (m: string) => deps.log?.(m);
  const email = () => enviarFila(deps).catch((e) => log(`[legal] fila de e-mail falhou: ${(e as Error).message}`));
  const diaria = () => rotinaDiaria(deps).catch((e) => log(`[legal] rotina diária falhou: ${(e as Error).message}`));
  const t1 = setInterval(email, emailMs);
  const t2 = setInterval(diaria, diariaMs);
  t1.unref?.();
  t2.unref?.();
  setTimeout(email, 15_000).unref?.();
  setTimeout(diaria, 60_000).unref?.();
  return () => {
    clearInterval(t1);
    clearInterval(t2);
  };
}
