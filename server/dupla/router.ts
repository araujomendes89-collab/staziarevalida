/**
 * Rotas /api/dupla: imagem de um impresso (ou da folha do candidato) da sala do Treino em Dupla. O navegador nunca recebe chaves.
 * Quem decide tudo é o banco: app_dupla_print_path, chamada como a própria pessoa, confere a sala, o papel, a fase e se o
 * impresso foi liberado, e devolve só o caminho do arquivo (de station_assets, sem o nome da estação) ou nulo.
 *
 *   GET /rooms/:roomId/prints/:pressingId/link → { url }: endereço assinado por 10 minutos (Supabase); no desenvolvimento
 *       { url: null } e o navegador baixa por /file.
 *   GET /rooms/:roomId/prints/:pressingId/file → o arquivo pelo servidor (desenvolvimento), sem cache e sem nome de arquivo.
 *
 * Sem IA. pressingId: 'candidate_sheet', o id verdadeiro (avaliador) ou a chave de tela 'i<n>' / 'd<n>' (candidato).
 */
import express, { type NextFunction, type Request, type Response } from "express";
import { localStorageDir, supabaseStorage, CONTENT_HUB_BUCKET, type ContentDb, type Identity, type Storage } from "../contentHub/infra";
import { ACCESS_CHECK_FAILED, shown } from "../auth/friendlyError";

/** As imagens das estações ficam no depósito da Central de Conteúdo (onde a Montagem de estações grava). */
export const DUPLA_PRINTS_BUCKET = CONTENT_HUB_BUCKET;
const LINK_SECONDS = 600;
const ROOM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESSING = /^[A-Za-z0-9_-]{1,80}$/;
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

type Authed = Request & { user?: Identity };
interface DuplaDeps {
  db: ContentDb;
  storage: Storage;
  log?: (m: string) => void;
}
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const httpError = (status: number, text: string) => Object.assign(new Error(text), { status });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Depósito das imagens: bucket privado "content-hub" no Supabase; pasta .data/content-hub no desenvolvimento. */
export function duplaStorage(mode: ContentDb["mode"]): Storage {
  return mode === "supabase" ? supabaseStorage(DUPLA_PRINTS_BUCKET) : localStorageDir();
}

export function createDuplaRouter(deps: DuplaDeps | null, pending: string | null = null): express.Router {
  const router = express.Router();

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Treino em Dupla sem servidor configurado.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      deps.log?.(`dupla: conferência de login falhou: ${message(error)}`.slice(0, 300));
      fail(res, 500, ACCESS_CHECK_FAILED);
    }
  });

  /** Caminho do arquivo, decidido pelo banco. Recusa do banco → 403 com a mensagem; sem imagem → 404. */
  const pathFor = async (req: Authed) => {
    const { roomId, pressingId } = req.params;
    if (!ROOM.test(roomId) || !PRESSING.test(pressingId)) throw httpError(400, "Impresso inválido.");
    let found: string | null;
    try {
      found = await deps!.db.asUser<string | null>(req.user!, "app_dupla_print_path", { p_room_id: roomId, p_pressing_id: pressingId });
    } catch (error) {
      throw httpError(403, shown(error));
    }
    if (!found) throw httpError(404, "Impresso sem imagem.");
    return found;
  };

  router.get("/rooms/:roomId/prints/:pressingId/link", async (req: Authed, res) => {
    try {
      const key = await pathFor(req);
      res.json({ url: deps!.storage.signedUrl ? await deps!.storage.signedUrl(key, LINK_SECONDS) : null });
    } catch (error: any) {
      if (!error?.status) deps!.log?.(`dupla: link do impresso falhou: ${message(error)}`.slice(0, 300));
      fail(res, error?.status ?? 500, shown(error));
    }
  });

  router.get("/rooms/:roomId/prints/:pressingId/file", async (req: Authed, res) => {
    try {
      const key = await pathFor(req);
      let data: Buffer;
      try {
        data = await deps!.storage.get(key);
      } catch {
        throw httpError(404, "Impresso sem imagem.");
      }
      const ext = (/\.([a-z0-9]+)$/i.exec(key)?.[1] ?? "").toLowerCase();
      res.setHeader("Content-Type", TYPES[ext] ?? "application/octet-stream");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    } catch (error: any) {
      fail(res, error?.status ?? 500, shown(error));
    }
  });

  return router;
}
