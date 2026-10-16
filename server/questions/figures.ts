/**
 * Rotas /api/question-figures: a figura de cada questão (PNG ou JPG, até 5 MB, uma por questão), enviada pela equipe na aba
 * Questões da Administração (Q07, leva 3). O navegador nunca recebe chaves; quem decide o acesso é o banco:
 *   - enviar e tirar: app_admin_set_question_image e app_admin_remove_question_image exigem a equipe (editor ou administrador);
 *   - ver: app_question_figure devolve o caminho da figura a qualquer pessoa logada (como practice_question_view).
 *
 * Na Vercel o corpo de cada requisição vai até 4,5 MB, e a figura pode ter 5 MB, então com o Supabase o arquivo não passa por aqui:
 *   envio   → POST /:id/upload (prepara um envio assinado) → o navegador envia direto ao depósito "question-figures"
 *             → POST /:id/confirm (confere o arquivo que chegou, registra a figura e apaga a anterior);
 *   leitura → GET /:id/:n/link (endereço assinado de 1 hora).
 * No banco de desenvolvimento (sem Supabase) o arquivo passa pelo servidor: POST /:id/figure e GET /:id/:n/file.
 * O nome do arquivo no depósito é sorteado ("questoes/<32 letras e dígitos>.png|jpg"): nunca o nome de quem enviou nem o código da
 * questão. A figura guardada em questions.images traz só { path, alt }.
 */
import crypto from "crypto";
import path from "path";
import express, { type NextFunction, type Request, type Response } from "express";
import { localStorageDir, supabaseStorage, type ContentDb, type Identity, type Storage } from "../contentHub/infra";
import { imageProblem } from "./imageFiles";
import { ACCESS_CHECK_FAILED, shown } from "../auth/friendlyError";

export const FIGURES_BUCKET = "question-figures";
export const FIGURE_MAX_BYTES = 5 * 1024 * 1024;
const LINK_SECONDS = 3600;
const ID = /^[a-z0-9_]{3,80}$/;
const KEY = /^questoes\/[0-9a-f]{32}\.(png|jpg)$/;
const TYPES: Record<string, { ext: "png" | "jpg" }> = { "image/png": { ext: "png" }, "image/jpeg": { ext: "jpg" } };
const TYPE_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg" };

type Authed = Request & { user?: Identity };
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|42501|Acesso/i.test(message(error));
const notFound = (error: unknown) => /não encontrada|P0002/i.test(message(error));
/** O banco ainda não recebeu a atualização das figuras (as funções ch_worker_question_figure_* não existem). */
const missingSql = (error: unknown) => /ch_worker_question_figure_|PGRST202|42883|does not exist|could not find the function/i.test(message(error));
const httpError = (status: number, text: string) => Object.assign(new Error(text), { status });

export interface QuestionFiguresDeps {
  db: ContentDb;
  storage: Storage;
  log?: (m: string) => void;
}

/** Depósito das figuras: bucket privado "question-figures" no Supabase; pasta .data/question-figures no desenvolvimento. */
export function questionFiguresStorage(mode: ContentDb["mode"]): Storage {
  return mode === "supabase" ? supabaseStorage(FIGURES_BUCKET) : localStorageDir(process.env.QUESTION_FIGURES_STORAGE_DIR || path.join(process.cwd(), ".data/question-figures"));
}

export function createQuestionFiguresRouter(deps: QuestionFiguresDeps | null, pending: string | null = null) {
  const router = express.Router();

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Figuras das questões sem servidor configurado.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      (deps as { log?: (m: string) => void } | null)?.log?.(`conferência de login falhou: ${message(error)}`.slice(0, 300));
      fail(res, 500, ACCESS_CHECK_FAILED);
    }
  });
  const asUser = <T>(req: Authed, fn: string, args: Record<string, unknown> = {}) => deps!.db.asUser<T>(req.user!, fn, args);
  const status = (error: any, fallback = 400) => error?.status ?? (forbidden(error) ? 403 : notFound(error) ? 404 : fallback);
  const FAIL_SQL = "A atualização do banco para as figuras das questões ainda não foi aplicada. Peça ao administrador para aplicar a atualização e tente de novo.";
  /** Resposta de erro: banco sem a atualização vira aviso em português (503), nunca um sucesso silencioso. */
  const failWith = (res: Response, error: any, fallback = 400) => (missingSql(error) && !error?.status ? fail(res, 503, FAIL_SQL) : fail(res, status(error, fallback), shown(error)));

  /** Equipe (conferida no banco) e questão existente; devolve o id. */
  const staffQuestion = async (req: Authed) => {
    const id = req.params.id;
    if (!ID.test(id)) throw httpError(400, "Questão inválida.");
    const question = await asUser<unknown>(req, "app_admin_question", { p_id: id }); // exige a equipe; 404 se não existe
    void question;
    return { id };
  };
  const checkType = (type: unknown) => {
    const spec = TYPES[String(type)];
    if (!spec) throw httpError(415, "Envie a figura em PNG ou JPG.");
    return spec;
  };
  const checkAlt = (alt: unknown) => {
    const text = typeof alt === "string" ? alt.trim() : "";
    if (text.length < 10 || text.length > 300) throw httpError(400, "Escreva o texto alternativo da figura (de 10 a 300 letras): ele descreve a imagem para quem não a vê.");
    return text;
  };
  const checkBytes = (bytes: Buffer, type: string) => {
    if (bytes.length === 0) throw httpError(400, "O arquivo da figura está vazio.");
    if (bytes.length > FIGURE_MAX_BYTES) throw httpError(413, "A figura pode ter no máximo 5 MB.");
    checkType(type);
    // o arquivo precisa ser uma imagem COMPLETA (estrutura inteira), não só começar como PNG ou JPG
    const problem = imageProblem(bytes, type);
    if (problem) throw httpError(415, `O conteúdo do arquivo não é uma imagem PNG ou JPG completa (${problem}).`);
  };
  const newKey = (ext: string) => `questoes/${crypto.randomBytes(16).toString("hex")}.${ext}`;
  /**
   * Apaga um arquivo do depósito. NUNCA apaga na hora: primeiro pede ao banco para soltar o caminho (ch_worker_question_figure_drop),
   * que só diz sim se nenhuma questão o usa e depois disso o caminho não pode mais virar figura; só com o sim o arquivo sai.
   * Sem resposta do banco (ou com não), o arquivo fica: um arquivo solto custa pouco, uma figura quebrada custa a questão.
   */
  const drop = async (key: string | null) => {
    if (!key || !KEY.test(key)) return;
    try {
      const free = await deps!.db.service<boolean>("ch_worker_question_figure_drop", { p_path: key });
      if (free !== true) return;
      await deps!.storage.remove?.([key]);
    } catch (error) {
      deps!.log?.(`figuras das questões: não foi possível apagar ${key}: ${message(error)}`);
    }
  };
  /** Registra a figura: o servidor confirma ao banco o arquivo que conferiu e só então a equipe o vincula; o arquivo anterior sai depois. */
  const register = async (req: Authed, id: string, key: string, alt: string, type: string, size: number) => {
    await deps!.db.service("ch_worker_question_figure_confirm", { p_path: key, p_content_type: type, p_size_bytes: size });
    const saved = await asUser<any>(req, "app_admin_set_question_image", { p_question_id: id, p_image: { path: key, alt } });
    const released: string | null = saved?.released_path ?? null;
    if (saved && typeof saved === "object") delete saved.released_path;
    await drop(released);
    return saved;
  };

  /** 1) Prepara o envio direto ao depósito (Supabase). Sem envio assinado (desenvolvimento): { mode: "direct" }. */
  router.post("/:id/upload", async (req: Authed, res) => {
    try {
      const { content_type, size_bytes } = (req.body ?? {}) as Record<string, unknown>;
      const spec = checkType(content_type);
      const size = Number(size_bytes);
      if (!Number.isFinite(size) || size <= 0) throw httpError(400, "O arquivo da figura está vazio.");
      if (size > FIGURE_MAX_BYTES) throw httpError(413, "A figura pode ter no máximo 5 MB.");
      await staffQuestion(req);
      if (!deps!.storage.signedUpload) return res.json({ mode: "direct" });
      const key = newKey(spec.ext);
      const signed = await deps!.storage.signedUpload(key);
      res.json({ mode: "signed", bucket: FIGURES_BUCKET, key, path: signed.path, token: signed.token });
    } catch (error: any) {
      failWith(res, error);
    }
  });

  /** 2) Confirma o envio direto: o arquivo precisa estar no depósito, com o conteúdo e o tamanho certos. */
  router.post("/:id/confirm", async (req: Authed, res) => {
    try {
      const { key, alt, content_type } = (req.body ?? {}) as Record<string, unknown>;
      const spec = checkType(content_type);
      const { id } = await staffQuestion(req);
      if (typeof key !== "string" || !KEY.test(key) || !key.endsWith(`.${spec.ext}`)) throw httpError(400, "Caminho de arquivo inválido.");
      const text = checkAlt(alt);
      if (!(await deps!.storage.exists(key))) throw httpError(400, "O arquivo não chegou ao depósito. Envie de novo.");
      const bytes = await deps!.storage.get(key);
      try {
        checkBytes(bytes, String(content_type));
      } catch (error) {
        await drop(key); // arquivo que não passa na conferência não fica no depósito
        throw error;
      }
      try {
        res.status(201).json(await register(req, id, key, text, String(content_type), bytes.length));
      } catch (error) {
        if (!missingSql(error)) await drop(key); // o banco recusou: o arquivo não foi vinculado; só sai se o banco o soltar
        throw error;
      }
    } catch (error: any) {
      failWith(res, error);
    }
  });

  /** Envio pelo servidor (desenvolvimento): corpo bruto, tipo no Content-Type, texto alternativo em ?alt=. */
  const upload = express.raw({ type: Object.keys(TYPES), limit: FIGURE_MAX_BYTES + 1 });
  router.post("/:id/figure", (req: Authed, res, next) => upload(req, res, (error?: any) => (error?.type === "entity.too.large" ? fail(res, 413, "A figura pode ter no máximo 5 MB.") : error ? next(error) : next())), async (req: Authed, res) => {
    try {
      const type = String(req.headers["content-type"] ?? "").split(";")[0].trim();
      const spec = checkType(type);
      const { id } = await staffQuestion(req);
      const text = checkAlt(req.query.alt);
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      checkBytes(body, type);
      const key = newKey(spec.ext);
      await deps!.storage.put(key, body, type);
      try {
        res.status(201).json(await register(req, id, key, text, type, body.length));
      } catch (error) {
        if (!missingSql(error)) await drop(key); // o banco recusou: o arquivo acabou de ser criado aqui; só sai se o banco o soltar
        else await deps!.storage.remove?.([key]).catch(() => undefined); // sem o SQL novo ninguém sabe do arquivo: nasceu agora, sai agora
        throw error;
      }
    } catch (error: any) {
      if (!res.headersSent) failWith(res, error);
    }
  });

  /** Tirar a figura da questão (e o arquivo do depósito). */
  router.delete("/:id/figure", async (req: Authed, res) => {
    try {
      const { id } = await staffQuestion(req);
      const saved = await asUser<any>(req, "app_admin_remove_question_image", { p_question_id: id });
      const released: string | null = saved?.released_path ?? null;
      if (saved && typeof saved === "object") delete saved.released_path;
      await drop(released);
      res.json(saved);
    } catch (error: any) {
      failWith(res, error);
    }
  });

  /** A figura n da questão como o aluno a vê (practice_question_view: qualquer pessoa logada). */
  const figureOf = async (req: Authed) => {
    if (!ID.test(req.params.id) || !/^\d{1,2}$/.test(req.params.n)) throw httpError(400, "Figura inválida.");
    const image = await asUser<{ path?: string; url?: string } | null>(req, "app_question_figure", { p_question_id: req.params.id, p_index: Number(req.params.n) });
    if (!image) throw httpError(404, "Figura não encontrada.");
    return image;
  };

  /** Endereço para abrir a figura: o do caderno (já público), o assinado (Supabase) ou nulo (o navegador baixa por /file). */
  router.get("/:id/:n/link", async (req: Authed, res) => {
    try {
      const image = await figureOf(req);
      if (!image.path) return res.json({ url: image.url ?? null });
      if (!KEY.test(image.path)) throw httpError(404, "Figura não encontrada.");
      res.json({ url: deps!.storage.signedUrl ? await deps!.storage.signedUrl(image.path, LINK_SECONDS) : null });
    } catch (error: any) {
      fail(res, status(error, 404), shown(error));
    }
  });

  /** Arquivo pelo servidor (desenvolvimento). */
  router.get("/:id/:n/file", async (req: Authed, res) => {
    try {
      const image = await figureOf(req);
      if (!image.path || !KEY.test(image.path)) throw httpError(404, "Figura não encontrada.");
      const data = await deps!.storage.get(image.path);
      res.setHeader("Content-Type", TYPE_BY_EXT[image.path.split(".").pop() as string] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error: any) {
      fail(res, status(error, 404), shown(error));
    }
  });

  return router;
}
