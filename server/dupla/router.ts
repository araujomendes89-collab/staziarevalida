/**
 * Rotas /api/dupla: imagem de um impresso (ou da folha do candidato) da sala do Treino em Dupla. O navegador nunca recebe chaves.
 * Quem decide tudo é o banco: app_dupla_print_path, chamada como a própria pessoa, confere a sala, o papel, a fase e se o
 * impresso foi liberado, e devolve só o caminho do arquivo (de station_assets, sem o nome da estação) ou nulo.
 *
 *   GET /rooms/:roomId/prints/:pressingId/link → { url }: endereço assinado por 10 minutos (Supabase); no desenvolvimento
 *       { url: null } e o navegador baixa por /file.
 *   GET /rooms/:roomId/prints/:pressingId/file → o arquivo pelo servidor (desenvolvimento), sem cache e sem nome de arquivo.
 *
 * Treino sozinho (tentativa de station_attempts): as mesmas duas rotas em /solo/:attemptId/prints/:pressingId/{link,file}, pelo
 * mesmo código (printLink/printFile), com app_fase2_print_path; e a avaliação por IA:
 *   POST /solo/:attemptId/evaluate → 200 { ok: true } | 401 | 400 | 403 | 409 | 422 | 429 | 503 | 502 (ver server/dupla/soloEval.ts).
 *   Nenhuma resposta traz modelo, empresa, prompt, custo nem corpo técnico.
 *
 * A sala não usa IA. pressingId: 'candidate_sheet', o id verdadeiro (avaliador) ou a chave de tela 'i<n>' / 'd<n>' (candidato).
 */
import express, { type NextFunction, type Request, type Response } from "express";
import { localStorageDir, supabaseStorage, CONTENT_HUB_BUCKET, type ContentDb, type Identity, type Storage } from "../contentHub/infra";
import { ACCESS_CHECK_FAILED, shown } from "../auth/friendlyError";
import type { MaestroDeps } from "../ai/maestro";
import { evaluateSolo } from "./soloEval";

/** As imagens das estações ficam no depósito da Central de Conteúdo (onde a Montagem de estações grava). */
export const DUPLA_PRINTS_BUCKET = CONTENT_HUB_BUCKET;
const LINK_SECONDS = 600;
const ROOM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESSING = /^[A-Za-z0-9_-]{1,80}$/;
const SOLO_ID = ROOM; // a tentativa do treino sozinho também é um uuid
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

type Authed = Request & { user?: Identity };
interface DuplaDeps {
  db: ContentDb;
  storage: Storage;
  log?: (m: string) => void;
  /** Só para testes: provedores simulados e relógio do maestro (a avaliação por IA do treino sozinho). Em produção, vazio. */
  maestro?: Partial<MaestroDeps>;
  /** Variáveis de ambiente da avaliação por IA (padrão: process.env). */
  env?: NodeJS.ProcessEnv;
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
  const pathOf = async (req: Authed, owner: RegExp, fn: string, ownerArg: string, ownerId: string) => {
    const { pressingId } = req.params;
    if (!owner.test(ownerId) || !PRESSING.test(pressingId)) throw httpError(400, "Impresso inválido.");
    let found: string | null;
    try {
      found = await deps!.db.asUser<string | null>(req.user!, fn, { [ownerArg]: ownerId, p_pressing_id: pressingId });
    } catch (error) {
      throw httpError(403, shown(error));
    }
    if (!found) throw httpError(404, "Impresso sem imagem.");
    return found;
  };
  type PathOf = (req: Authed) => Promise<string>;

  /** Link assinado de 600 s (Supabase) ou { url: null } no desenvolvimento. Comum à sala e ao treino sozinho. */
  const printLink = (pathFor: PathOf) => async (req: Authed, res: Response) => {
    try {
      const key = await pathFor(req);
      res.json({ url: deps!.storage.signedUrl ? await deps!.storage.signedUrl(key, LINK_SECONDS) : null });
    } catch (error: any) {
      if (!error?.status) deps!.log?.(`dupla: link do impresso falhou: ${message(error)}`.slice(0, 300));
      fail(res, error?.status ?? 500, shown(error));
    }
  };

  /** O arquivo pelo servidor (desenvolvimento), sem cache e sem nome de arquivo. Comum à sala e ao treino sozinho. */
  const printFile = (pathFor: PathOf) => async (req: Authed, res: Response) => {
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
  };

  const roomPath: PathOf = (req) => pathOf(req, ROOM, "app_dupla_print_path", "p_room_id", req.params.roomId);
  const soloPath: PathOf = (req) => pathOf(req, SOLO_ID, "app_fase2_print_path", "p_attempt_id", req.params.attemptId);

  router.get("/rooms/:roomId/prints/:pressingId/link", printLink(roomPath));
  router.get("/rooms/:roomId/prints/:pressingId/file", printFile(roomPath));
  router.get("/solo/:attemptId/prints/:pressingId/link", printLink(soloPath));
  router.get("/solo/:attemptId/prints/:pressingId/file", printFile(soloPath));

  /** Avaliação por IA do treino sozinho. Tudo é decidido no servidor/banco; a resposta nunca traz detalhe técnico. */
  router.post("/solo/:attemptId/evaluate", async (req: Authed, res) => {
    if (!SOLO_ID.test(req.params.attemptId)) return fail(res, 400, "Treino inválido.");
    try {
      const r = await evaluateSolo({ db: deps!.db, maestro: deps!.maestro, env: deps!.env, log: deps!.log }, req.user!.id, req.params.attemptId);
      if (r.ok) return res.json({ ok: true });
      const bad = r as Extract<typeof r, { ok: false }>;
      fail(res, bad.status, bad.message);
    } catch {
      deps!.log?.("dupla: a avaliação do treino sozinho falhou de um jeito inesperado.");
      fail(res, 502, "A avaliação por IA falhou. Tente de novo ou corrija você mesmo.");
    }
  });

  return router;
}
