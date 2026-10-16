/**
 * Rotas /api/dupla/folhas (Administração › Estações): gerar/regerar a FOLHA DO CANDIDATO de uma estação e ver a imagem.
 * Quem decide o acesso é o banco, chamado como a própria pessoa: pedir = equipe (app_admin_dupla_folha_pedir); ver = equipe e
 * revisores (app_admin_dupla_folha_caminho). O navegador nunca recebe chaves nem o caminho do arquivo.
 *
 *   POST /:stationId/gerar       pede e, se este servidor tem o Chromium, gera na hora ({ gerada: true, situacao });
 *                                senão fica pedida para o processamento ({ gerada: false, aviso, situacao }, 202).
 *   GET  /:stationId/imagem/link { url }: endereço assinado por 10 minutos (Supabase); no desenvolvimento { url: null }.
 *   GET  /:stationId/imagem/file a imagem pelo servidor (desenvolvimento), sem cache.
 * Sem IA.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import type { ContentDb, Identity, Storage } from "../contentHub/infra";
import type { Renderer } from "../contentHub/render";
import { ACCESS_CHECK_FAILED, shown } from "../auth/friendlyError";
import { FolhaIndisponivel, gerarFolha } from "./folha";

type Authed = Request & { user?: Identity };
export interface FolhaRouterDeps {
  db: ContentDb;
  storage: Storage;
  renderer: Renderer | null;
  log?: (m: string) => void;
}

const STATION = /^[A-Za-z0-9_.-]{1,120}$/;
const LINK_SECONDS = 600;
export const AVISO_PROCESSAMENTO =
  "Pedido registrado. Este servidor não tem o gerador de imagens: o processamento (Cloud Run) gera a folha na próxima rodada, ou rode o comando npm run dupla:folhas.";

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const statusOf = (e: unknown) => (/restrit|só a equipe|42501/i.test(message(e)) ? 403 : /não encontrad|P0002/i.test(message(e)) ? 404 : 400);

export function createFolhaRouter(deps: FolhaRouterDeps | null, pending: string | null = null): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Folha do candidato sem servidor configurado.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      deps.log?.(`folha: conferência de login falhou: ${message(error)}`.slice(0, 300));
      fail(res, 500, ACCESS_CHECK_FAILED);
    }
  });
  router.param("stationId", (_req, res, next, id) => (STATION.test(String(id)) ? next() : fail(res, 400, "Estação inválida.")));

  router.post("/:stationId/gerar", async (req: Authed, res) => {
    const id = req.params.stationId;
    let situacao: unknown;
    try {
      situacao = await deps!.db.asUser(req.user!, "app_admin_dupla_folha_pedir", { p_station_id: id });
    } catch (error) {
      return fail(res, statusOf(error), shown(error));
    }
    if (!deps!.renderer) return res.status(202).json({ gerada: false, aviso: AVISO_PROCESSAMENTO, situacao });
    try {
      const r = await gerarFolha(deps!, id, req.user!.id);
      res.json({ gerada: true, situacao: r.situacao, largura: r.width, altura: r.height });
    } catch (error) {
      if (error instanceof FolhaIndisponivel) return res.status(202).json({ gerada: false, aviso: AVISO_PROCESSAMENTO, situacao });
      deps!.log?.(`folha: geração da estação ${id} falhou: ${message(error)}`.slice(0, 300));
      fail(res, 422, `A folha não foi gerada: ${message(error)}`.slice(0, 400));
    }
  });

  const caminho = async (req: Authed) => {
    let found: string | null;
    try {
      found = await deps!.db.asUser<string | null>(req.user!, "app_admin_dupla_folha_caminho", { p_station_id: req.params.stationId });
    } catch (error) {
      throw Object.assign(new Error(shown(error)), { status: 403 });
    }
    if (!found) throw Object.assign(new Error("Esta estação ainda não tem a folha em imagem."), { status: 404 });
    return found;
  };

  router.get("/:stationId/imagem/link", async (req: Authed, res) => {
    try {
      const key = await caminho(req);
      res.json({ url: deps!.storage.signedUrl ? await deps!.storage.signedUrl(key, LINK_SECONDS) : null });
    } catch (error: any) {
      fail(res, error?.status ?? 500, shown(error));
    }
  });

  router.get("/:stationId/imagem/file", async (req: Authed, res) => {
    try {
      const key = await caminho(req);
      let data: Buffer;
      try {
        data = await deps!.storage.get(key);
      } catch {
        return fail(res, 404, "Imagem da folha não encontrada no depósito.");
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    } catch (error: any) {
      fail(res, error?.status ?? 500, shown(error));
    }
  });

  return router;
}
