/**
 * Rotas /api/lessons: arquivos das aulas (slides PDF e áudio Flashcast MP3). O navegador nunca recebe chaves.
 * Quem decide o acesso é o banco: app_lesson_material respeita o RLS (aluno só vê aula publicada) e
 * app_admin_lesson_material exige a equipe.
 *
 * Na Vercel o corpo de cada requisição vai até 4,5 MB, então com o Supabase os arquivos não passam por aqui:
 *   envio  → POST /:id/upload (prepara um envio assinado) → o navegador envia direto ao depósito "lessons"
 *            → POST /:id/materials/confirm (confere que o arquivo chegou e registra o material);
 *   leitura → GET /materials/:id/link (endereço assinado de 10 minutos).
 * No banco de desenvolvimento (sem Supabase) o arquivo passa pelo servidor: POST /:id/materials e GET /materials/:id/file.
 */
import crypto from "crypto";
import path from "path";
import express, { type NextFunction, type Request, type Response } from "express";
import { localStorageDir, supabaseStorage, type ContentDb, type Identity, type Storage } from "../contentHub/infra";

export const LESSONS_BUCKET = "lessons";
const MAX_MB = Number(process.env.LESSONS_MAX_FILE_MB || 200);
const LINK_SECONDS = 600;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: Record<string, { kinds: string[]; ext: string; magic: (b: Buffer) => boolean }> = {
  "application/pdf": { kinds: ["slides", "other"], ext: "pdf", magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "audio/mpeg": { kinds: ["flashcast", "other"], ext: "mp3", magic: (b) => b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
};

type Authed = Request & { user?: Identity };
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));
const httpError = (status: number, text: string) => Object.assign(new Error(text), { status });

export interface LessonsDeps {
  db: ContentDb;
  storage: Storage;
  log?: (m: string) => void;
}

/** Depósito das aulas: bucket privado "lessons" no Supabase; pasta .data/lessons no desenvolvimento. */
export function lessonsStorage(mode: ContentDb["mode"]): Storage {
  return mode === "supabase" ? supabaseStorage(LESSONS_BUCKET) : localStorageDir(process.env.LESSONS_STORAGE_DIR || path.join(process.cwd(), ".data/lessons"));
}

export function createLessonsRouter(deps: LessonsDeps | null, pending: string | null = null) {
  const router = express.Router();

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Aulas sem servidor configurado.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      fail(res, 500, message(error));
    }
  });
  const asUser = <T>(req: Authed, fn: string, args: Record<string, unknown> = {}) => deps!.db.asUser<T>(req.user!, fn, args);

  /** Equipe (conferida no banco) e aula existente. */
  const staffLesson = async (req: Authed) => {
    const id = req.params.id;
    if (!ID.test(id)) throw httpError(400, "Aula inválida.");
    await asUser(req, "app_admin_lessons");
    const lesson = await asUser(req, "app_lesson", { p_id: id });
    if (!lesson) throw httpError(404, "Aula não encontrada.");
    return id;
  };
  const checkType = (kind: unknown, type: unknown) => {
    const spec = TYPES[String(type)];
    if (!spec) throw httpError(415, "Envie um PDF (slides) ou um MP3 (áudio Flashcast).");
    if (!spec.kinds.includes(String(kind))) throw httpError(400, "Tipo de material incompatível com o arquivo.");
    return spec;
  };
  const keyFor = (id: string, kind: string, ext: string) => `lessons/${id}/${kind}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const register = (req: Authed, id: string, m: { kind: string; title: string; key: string; type: string; size: number }) =>
    asUser(req, "app_admin_lesson_material", {
      p_lesson_id: id,
      p_material: { kind: m.kind, title: m.title.slice(0, 200), storage_path: m.key, content_type: m.type, size_bytes: m.size },
    });

  /** 1) Prepara o envio direto ao depósito (Supabase). Sem envio assinado (desenvolvimento): { mode: "direct" }. */
  router.post("/:id/upload", async (req: Authed, res) => {
    try {
      const { kind, content_type, size_bytes } = (req.body ?? {}) as Record<string, unknown>;
      const spec = checkType(kind, content_type);
      if (!Number.isFinite(Number(size_bytes)) || Number(size_bytes) <= 0) throw httpError(400, "Arquivo vazio.");
      if (Number(size_bytes) > MAX_MB * 1024 * 1024) throw httpError(413, `Arquivo acima de ${MAX_MB} MB.`);
      const id = await staffLesson(req);
      if (!deps!.storage.signedUpload) return res.json({ mode: "direct" });
      const key = keyFor(id, String(kind), spec.ext);
      const signed = await deps!.storage.signedUpload(key);
      res.json({ mode: "signed", bucket: LESSONS_BUCKET, key, path: signed.path, token: signed.token });
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));
    }
  });

  /** 2) Confirma o envio direto: o arquivo precisa estar no depósito, no caminho desta aula. */
  router.post("/:id/materials/confirm", async (req: Authed, res) => {
    try {
      const { kind, key, title, content_type, size_bytes } = (req.body ?? {}) as Record<string, unknown>;
      checkType(kind, content_type);
      const id = await staffLesson(req);
      if (typeof key !== "string" || !new RegExp(`^lessons/${id}/[a-z]+-[0-9a-f]{16}\\.(pdf|mp3)$`).test(key)) throw httpError(400, "Caminho de arquivo inválido.");
      if (!(await deps!.storage.exists(key))) throw httpError(400, "O arquivo não chegou ao depósito. Envie de novo.");
      res.status(201).json(await register(req, id, { kind: String(kind), title: String(title || "Material"), key, type: String(content_type), size: Number(size_bytes) || 0 }));
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));
    }
  });

  /** Envio pelo servidor (desenvolvimento): corpo bruto, tipo no Content-Type, nome em X-File-Name. */
  const upload = express.raw({ type: Object.keys(TYPES), limit: `${MAX_MB}mb` });
  router.post("/:id/materials", upload, async (req: Authed, res) => {
    try {
      const body = req.body as Buffer;
      const type = String(req.headers["content-type"] ?? "").split(";")[0].trim();
      const kind = String(req.query.kind ?? (type === "application/pdf" ? "slides" : "flashcast"));
      const spec = checkType(kind, type);
      if (!Buffer.isBuffer(body) || body.length === 0) throw httpError(400, "Arquivo vazio.");
      if (!spec.magic(body)) throw httpError(415, "O conteúdo não corresponde ao tipo informado.");
      const id = await staffLesson(req);
      const name = decodeURIComponent(String(req.headers["x-file-name"] ?? "material")).slice(0, 200);
      const key = `lessons/${id}/${kind}-${crypto.createHash("sha256").update(body).digest("hex").slice(0, 16)}.${spec.ext}`;
      if (!(await deps!.storage.exists(key))) await deps!.storage.put(key, body, type);
      res.status(201).json(await register(req, id, { kind, title: String(req.query.title ?? name), key, type, size: body.length }));
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));
    }
  });

  const materialFor = async (req: Authed) => {
    if (!ID.test(req.params.id)) throw httpError(400, "Material inválido.");
    const m = await asUser<{ storage_path: string | null; content_type: string | null; title: string; url: string | null } | null>(req, "app_lesson_material", { p_id: req.params.id });
    if (!m) throw httpError(404, "Material não encontrado.");
    return m;
  };

  /** Endereço para abrir o material: externo, assinado (Supabase) ou nulo (o navegador baixa por /file). */
  router.get("/materials/:id/link", async (req: Authed, res) => {
    try {
      const m = await materialFor(req);
      if (m.url) return res.json({ url: m.url });
      if (!m.storage_path) throw httpError(404, "Material sem arquivo.");
      res.json({ url: deps!.storage.signedUrl ? await deps!.storage.signedUrl(m.storage_path, LINK_SECONDS) : null });
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 404), message(error));
    }
  });

  /** Arquivo pelo servidor (desenvolvimento). */
  router.get("/materials/:id/file", async (req: Authed, res) => {
    try {
      const m = await materialFor(req);
      if (!m.storage_path) throw httpError(404, "Material sem arquivo.");
      const data = await deps!.storage.get(m.storage_path);
      res.setHeader("Content-Type", m.content_type ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(m.title)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 404), message(error));
    }
  });

  return router;
}
