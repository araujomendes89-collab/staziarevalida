/**
 * Rotas /api/planos (planos, etapa 3). O cadastro é feito direto no Supabase, que não mostra o IP para o banco; por isso o teste
 * grátis é "ativado" aqui, onde o servidor vê o IP:
 *
 *  POST /api/planos/teste/ativar  { escolha?: "teoria" | "pratica" | "as_duas" }   (aluno logado)
 *    → ch_worker_teste_ativar(aluno, escolha, HMAC-SHA256 do IP). O IP em si nunca vai para o banco: só o código (hash), guardado
 *      90 dias. Muitos testes do mesmo IP em poucos dias pedem verificação a mais; NUNCA bloqueiam. O onboarding (etapa 4) chama
 *      esta rota logo depois do cadastro (sem escolha = só registra; com escolha = escolhe a fase do teste, uma vez).
 *  GET /api/planos/cron  (tarefa agendada, Authorization: Bearer CRON_SECRET)
 *    → avisos de renovação (7, 3 e 1 dia antes; só com a chave ligada) e limpeza dos códigos de IP com mais de 90 dias.
 *
 * Chave do código do IP: PLANOS_IP_SEGREDO (recomendado, só no servidor); sem ela, usa a chave de serviço do Supabase como
 * material da chave (nunca aparece em lugar nenhum). Sem nenhuma das duas, ativa sem o código (sem alerta).
 */
import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ContentDb, Identity } from "../contentHub/infra";
import { shown } from "../auth/friendlyError";
import { cronAutorizado } from "../seguranca/protecoes";

type Authed = Request & { user?: Identity };
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

export interface PlanosDeps {
  db: ContentDb;
  log?: (m: string) => void;
}

/** O IP de quem chamou (na Vercel, o cabeçalho que a própria Vercel preenche vem primeiro). */
export function ipDe(req: Pick<Request, "headers" | "socket">): string | null {
  const h = (n: string) => {
    const v = req.headers[n];
    return (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim() || null;
  };
  return h("x-vercel-forwarded-for") ?? h("x-real-ip") ?? h("x-forwarded-for") ?? req.socket?.remoteAddress ?? null;
}

/** HMAC-SHA256 do IP (64 hexadecimais), ou null sem chave/sem IP. */
export function codigoDoIp(ip: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  const segredo = env.PLANOS_IP_SEGREDO || env.SUPABASE_SERVICE_ROLE_KEY || (env.NODE_ENV !== "production" ? "dev-local-planos" : "");
  if (!ip || !segredo) return null;
  const normal = ip.replace(/^::ffff:/, "").toLowerCase();
  return crypto.createHmac("sha256", `planos-ip:${segredo}`).update(normal).digest("hex");
}

const ESCOLHAS = new Set(["teoria", "pratica", "as_duas"]);

export function createPlanosRouter(deps: PlanosDeps | null, pending: string | null = null) {
  const router = express.Router();

  router.get("/cron", async (req, res) => {
    // segredo do cron comparado em tempo constante (auditoria de 17/10)
    if (!deps || !cronAutorizado(req.headers.authorization, process.env.CRON_SECRET)) return fail(res, 401, "Não autorizado.");
    try {
      const avisos = await deps.db.service<number>("ch_worker_avisos_renovacao");
      const ips = await deps.db.service<number>("ch_worker_teste_ips_limpar");
      res.json({ avisos_renovacao: avisos, ips_apagados: ips });
    } catch (error) {
      deps.log?.(`[planos] tarefa diária falhou: ${(error as Error).message.slice(0, 160)}`);
      fail(res, 500, shown(error));
    }
  });

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Planos não configurados no servidor.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch {
      fail(res, 500, "Não foi possível conferir o seu acesso agora.");
    }
  });

  router.post("/teste/ativar", async (req: Authed, res) => {
    const escolha = req.body?.escolha == null || req.body.escolha === "" ? null : String(req.body.escolha);
    if (escolha !== null && !ESCOLHAS.has(escolha)) return fail(res, 400, "Escolha 1ª fase, 2ª fase ou as duas.");
    try {
      const r = await deps!.db.service<Record<string, unknown>>("ch_worker_teste_ativar", {
        p_user: req.user!.id, p_escolha: escolha, p_ip_hash: codigoDoIp(ipDe(req)),
      });
      res.json(r);
    } catch (error) {
      // as recusas do banco (já escolheu, teste acabou, 2ª fase fechada) já vêm em português
      fail(res, 400, shown(error));
    }
  });

  return router;
}
