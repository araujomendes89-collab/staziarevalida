/**
 * Rotas /api/content-hub (servidor). O navegador nunca recebe chaves: o envio do PDF, a leitura
 * dos arquivos e a fila passam por aqui; as leituras e decisões do painel usam as funções
 * app_ch_* com o token do próprio usuário (RLS e papéis valendo no banco).
 */
import crypto from "crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { stepVersions, type PipelineDeps } from "./pipeline";
import { loadBrand } from "./render";
import { compareSourceVersions } from "./sourceCompare";
import { applyReferenceCleanup, previewReferenceCleanup, undoReferenceCleanup } from "./referenceCleanup";
import type { Identity } from "./infra";
import type { ContentHubWorker } from "./worker";

const MAX_PDF_MB = Number(process.env.CONTENT_HUB_MAX_PDF_MB || 300);

type Authed = Request & { user?: Identity };

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));

export function createContentHubRouter(deps: PipelineDeps | null, opts: { pending?: string | null; worker?: ContentHubWorker | null } = {}) {
  const router = express.Router();

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, opts.pending ?? "Central de Conteúdo não configurada no servidor.");
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
  const requireStaff = async (req: Authed) => {
    const me = await asUser<{ staff: boolean; admin: boolean; reviewer_areas: string[] } | null>(req, "app_ch_whoami");
    if (!me || !(me.staff || me.reviewer_areas.length)) throw new Error("Acesso restrito à equipe de conteúdo.");
    return me;
  };

  /** Situação da configuração: o que está pronto e o que é pendência real. */
  router.get("/status", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      const brand = loadBrand();
      const pending = [
        ...(deps!.ai.status.ready ? [] : [deps!.ai.status.pending!]),
        ...(deps!.renderer ? [] : ["Renderizador de PDF (Playwright/Chromium) indisponível no servidor."]),
        ...brand.pending,
        "Busca por significado (embeddings) ainda não configurada: a busca de evidências usa palavras.",
      ];
      res.json({
        me,
        storage: deps!.db.mode,
        ai: deps!.ai.status,
        renderer: Boolean(deps!.renderer),
        brand: { version: brand.version, pending: brand.pending },
        worker: Boolean(opts.worker?.running),
        pending,
      });
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 500, message(error));
    }
  });

  /** Envio de PDF (corpo bruto). Idempotente pelo hash: o mesmo arquivo não é duplicado. */
  const upload = express.raw({ type: ["application/pdf", "application/octet-stream"], limit: `${MAX_PDF_MB}mb` });
  const receivePdf = async (req: Authed) => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw Object.assign(new Error("Envie o arquivo PDF no corpo da requisição."), { status: 400 });
    if (body.subarray(0, 5).toString("latin1") !== "%PDF-") throw Object.assign(new Error("O arquivo não é um PDF (assinatura %PDF- ausente)."), { status: 415 });
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    const key = `documents/${sha256}.pdf`;
    if (!(await deps!.storage.exists(key))) await deps!.storage.put(key, body, "application/pdf");
    const name = decodeURIComponent(String(req.headers["x-file-name"] ?? "documento.pdf")).slice(0, 300);
    const q = req.query as Record<string, string | undefined>;
    const registered = await asUser<{ id: string; duplicate: boolean }>(req, "app_ch_register_document", {
      p_doc: {
        name,
        author: q.author,
        publisher: q.publisher,
        edition_date: q.edition_date,
        language: q.language,
        rights_status: q.rights_status ?? "unknown",
        rights_note: q.rights_note,
        sha256,
        storage_path: key,
        provenance: { uploaded_at: new Date().toISOString(), uploaded_by: req.user!.id, original_file_name: name, size_bytes: body.length, source: q.source_note ?? null },
      },
    });
    return { ...registered, sha256 };
  };
  const enqueueExtract = (documentId: string) =>
    deps!.db.service<{ id: string; duplicate: boolean }>("ch_worker_enqueue", { p_document_id: documentId, p_step: "extract", p_scope_key: "", p_versions: stepVersions("extract", deps!), p_max_attempts: 3 });

  router.post("/documents", upload, async (req: Authed, res) => {
    try {
      await requireStaff(req);
      const doc = await receivePdf(req);
      const job = await enqueueExtract(doc.id);
      res.status(doc.duplicate ? 200 : 201).json({ ...doc, job });
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));
    }
  });

  /** PDF completo de uma fonte oficial (acervo de validação): vira trechos citáveis com página. */
  router.post("/sources/:id/document", upload, async (req: Authed, res) => {
    try {
      await requireStaff(req);
      const doc = await receivePdf(req);
      await asUser(req, "app_ch_attach_source_document", { p_source_id: req.params.id, p_document_id: doc.id });
      const job = await enqueueExtract(doc.id);
      await deps!.db.service("ch_worker_unblock");
      res.status(201).json({ ...doc, job });
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));
    }
  });

  /** Arquivo original preservado (só quem tem acesso ao documento). */
  router.get("/documents/:id/file", async (req: Authed, res) => {
    try {
      const detail = await asUser<{ document: { storage_path: string; name: string } }>(req, "app_ch_document", { p_document_id: req.params.id });
      const data = await deps!.storage.get(detail.document.storage_path);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(detail.document.name)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 404, message(error));
    }
  });

  /** Arquivo final (PDF/HTML) de um material. */
  router.get("/renders/:id", async (req: Authed, res) => {
    try {
      const r = await asUser<{ storage_path: string; format: string }>(req, "app_ch_render", { p_render_id: req.params.id });
      const data = await deps!.storage.get(r.storage_path);
      res.setHeader("Content-Type", r.format === "pdf" ? "application/pdf" : "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "private, no-store");
      if (r.format === "html") res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:");
      res.send(data);
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 404, message(error));
    }
  });

  /** Reprocessar uma etapa (sem duplicar) e acordar o worker. */
  router.post("/jobs/:id/retry", async (req: Authed, res) => {
    try {
      await asUser(req, "app_ch_retry_job", { p_job_id: req.params.id });
      res.json({ ok: true });
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 400, message(error));
    }
  });

  /** Conferir agora as fontes monitoradas (administrador). */
  router.post("/sources/check", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      if (!me.admin) return fail(res, 403, "Somente administradores.");
      if (!opts.worker) return fail(res, 503, "Worker desligado neste servidor.");
      res.json(await opts.worker.checkSources());
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 500, message(error));
    }
  });

  /**
   * Retirada das referências do licenciante (administrador). Só com licença ativa que autorize isso.
   * body: { action: "preview" | "apply" | "undo" }: a prévia não grava nada; o desfazer restaura o que ninguém revisou depois.
   */
  router.post("/documents/:id/clean-references", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      if (!me.admin) return fail(res, 403, "Somente administradores.");
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(res, 400, "Documento inválido.");
      const action = String(req.body?.action ?? "preview");
      if (action === "apply") return res.json(await applyReferenceCleanup(deps!.db, id, req.user!.id));
      if (action === "undo") return res.json(await undoReferenceCleanup(deps!.db, id, req.user!.id));
      const p = await previewReferenceCleanup(deps!.db, id);
      res.json({ ...p, changes: p.changes.slice(0, 200), shown: Math.min(p.changes.length, 200), total: p.changes.length });
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));
    }
  });

  /** Compara o conteúdo de duas versões de uma fonte e tria o impacto por afirmação (administrador). */
  router.post("/sources/:old/compare/:new", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      if (!me.admin) return fail(res, 403, "Somente administradores.");
      const uuid = /^[0-9a-f-]{36}$/i;
      if (!uuid.test(String(req.params.old)) || !uuid.test(String(req.params.new))) return fail(res, 400, "Fonte inválida.");
      res.json(await compareSourceVersions(deps!.db, String(req.params.old), String(req.params.new)));
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 400, message(error));
    }
  });

  return router;
}
