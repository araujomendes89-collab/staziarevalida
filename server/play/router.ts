/**
 * Rotas /api/play (Stazia Play). O aluno fala direto com o banco (funções app_*); aqui só vive o que
 * precisa do papel de serviço: a rotina diária (sequências, dificuldade real, score, fotos do ranking,
 * fechamento de semana e de mês), chamada pela tarefa agendada da Vercel com CRON_SECRET.
 * Nenhuma rota recebe pontos do cliente.
 */
import express, { type Response } from "express";
import type { ContentDb } from "../contentHub/infra";

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

export interface PlayDeps {
  db: ContentDb;
  log?: (message: string) => void;
}

export async function runPlayDaily(deps: PlayDeps): Promise<Record<string, unknown>> {
  const result = await deps.db.service<Record<string, unknown>>("ch_worker_gamification_daily");
  deps.log?.(`[play] rotina diária: ${JSON.stringify(result)}`);
  return result;
}

export function createPlayRouter(deps: PlayDeps | null) {
  const router = express.Router();

  router.get("/cron", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!deps || !secret || req.headers.authorization !== `Bearer ${secret}`) return fail(res, 401, "Não autorizado.");
    try {
      res.json(await runPlayDaily(deps));
    } catch (error) {
      deps.log?.(`[play] falha na rotina diária: ${(error as Error).message}`);
      fail(res, 500, (error as Error).message.slice(0, 160));
    }
  });

  return router;
}

/** Fora da Vercel: roda a rotina diária na subida e depois a cada hora (ela mesma ignora o que já rodou no dia). */
export function startPlayScheduler(deps: PlayDeps, intervalMs = 60 * 60 * 1000) {
  const tick = () => runPlayDaily(deps).catch((error) => deps.log?.(`[play] rotina diária falhou: ${(error as Error).message}`));
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 5_000).unref?.();
  return () => clearInterval(timer);
}
