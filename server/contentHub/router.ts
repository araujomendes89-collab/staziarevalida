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
import { CONTENT_HUB_BUCKET, type Identity } from "./infra";
import type { ContentHubWorker } from "./worker";
import type { ProcessingReport } from "./capabilities";
import { DEFAULT_MAX_SEARCHES, functionChecks, invalidateAiConfig, loadAiConfig } from "../ai/config";
import { aiAllowed } from "./ai/registry";
import { DEFAULT_EMBEDDING_MODEL, embedderAllowed, embeddingsConfig, queryEmbedding } from "./embeddings";

/** A tarefa no Cloud Run roda a cada 10 minutos: sem relato há mais de 30, ela parou. */
const PROCESSING_STALE_MIN = 30;

const MAX_PDF_MB = Number(process.env.CONTENT_HUB_MAX_PDF_MB || 300);
/** Caminho temporário do envio direto (o servidor sorteia; a confirmação só aceita este formato). */
const TEMP_UPLOAD = /^uploads\/[0-9a-f]{32}\.pdf$/;
/** Validade do endereço assinado do original (o visualizador recarrega a cada troca de página). */
const LINK_SECONDS = 3600;

type Authed = Request & { user?: Identity };

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const httpError = (status: number, text: string) => Object.assign(new Error(text), { status });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));

const NO_FUNCTION_READY = "Nenhuma função da Central de IAs está pronta: ligue e configure as IAs em Administração › Central de IAs.";

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

  /**
   * Situação da configuração: o que está pronto e o que é pendência real. Quem lê os PDFs, faz OCR e gera os arquivos
   * finais é o processamento: no desenvolvimento, este servidor; em produção, a tarefa no Google Cloud Run (o servidor do
   * site na Vercel não processa). Sem processamento aqui, o painel mostra o último relato da tarefa (ch_worker_report).
   */
  router.get("/status", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      const local = Boolean(opts.worker?.running);
      // a IA vem da Central de IAs: a situação das funções vale no lugar da IA das variáveis de ambiente
      const central = await asUser<unknown>(req, "app_ai_summary").catch(() => null);
      const pending: string[] = [];
      if (!deps!.ai.status.isMock) {
        const ready = await loadAiConfig(deps!.db).then((cfg) => Object.values(functionChecks(cfg, process.env)).some((c) => c.ready)).catch(() => false);
        if (!ready) pending.push(NO_FUNCTION_READY);
      }
      let renderer: boolean;
      let brand: { version: string; pending: string[] };
      let processing: Record<string, unknown>;
      if (local) {
        const b = loadBrand();
        renderer = Boolean(deps!.renderer);
        brand = { version: b.version, pending: b.pending };
        pending.push(...(renderer ? [] : ["Renderizador de PDF (Playwright/Chromium) indisponível no servidor."]), ...b.pending);
        processing = { where: "servidor", running: true };
      } else {
        const last = await deps!.db
          .service<{ worker: string; reported_at: string; report: ProcessingReport & { jobs?: number; finished_at?: string } } | null>("ch_worker_last_report")
          .catch(() => null);
        if (!last) {
          renderer = false;
          brand = { version: "", pending: [] };
          processing = { where: null };
          pending.push("O processamento da Central (leitura dos PDFs, OCR e geração dos arquivos finais) ainda não rodou: ele roda como tarefa no Google Cloud Run, que ainda não foi implantada.");
        } else {
          const minutes = Math.max(0, Math.round((Date.now() - Date.parse(last.reported_at)) / 60_000));
          const stale = minutes > PROCESSING_STALE_MIN;
          if (stale) pending.push(`O processamento da Central não roda desde ${new Date(last.reported_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}: confira a tarefa no Google Cloud Run.`);
          // IA do processamento: o relato novo confere a Central de IAs com as chaves do processamento e vale; o relato antigo (sem
          // ai.source) olhava a variável CONTENT_HUB_AI_PROVIDER, que as etapas não usam, e continua escondido. Com o motivo do
          // relato, a linha geral de "nenhuma função pronta" (conferida com as chaves do site) não se repete.
          const centralReport = last.report.ai?.source === "central";
          const aiLines = (last.report.pending ?? []).filter((p) => p.startsWith("IA do processamento"));
          const general = pending.indexOf(NO_FUNCTION_READY);
          if (centralReport && aiLines.length && general >= 0) pending.splice(general, 1);
          for (const p of last.report.pending ?? []) {
            const oldAi = p.startsWith("IA do processamento") && (!centralReport || p.includes("CONTENT_HUB_AI_PROVIDER"));
            if (!oldAi && !pending.includes(p)) pending.push(p);
          }
          renderer = Boolean(last.report.renderer);
          brand = last.report.brand ?? { version: "", pending: [] };
          processing = { where: last.worker, reported_at: last.reported_at, minutes_ago: minutes, stale, python: Boolean(last.report.python), ocr_languages: last.report.ocr_languages ?? [], jobs: last.report.jobs ?? null };
        }
      }
      // busca por significado: este servidor faz o vetor das perguntas; o processamento, o dos trechos das fontes
      if (!deps!.embedder) pending.push(embeddingsConfig().pending ?? "Busca por significado indisponível no servidor.");
      else if (deps!.embedder.problem) pending.push(`Busca por significado parada no servidor: ${deps!.embedder.problem}`);
      const model = deps!.embedder?.model ?? (embeddingsConfig().model || DEFAULT_EMBEDDING_MODEL);
      const stats = await deps!.db
        .service<{ passages: number; embedded: number; vector_index: boolean } | null>("ch_worker_embedding_stats", { p_model: model })
        .catch(() => null);
      const embeddings = { ready: Boolean(deps!.embedder) && !deps!.embedder?.problem, model, passages: stats?.passages ?? null, embedded: stats?.embedded ?? null, vector_index: stats?.vector_index ?? null };
      res.json({ me, storage: deps!.db.mode, ai: deps!.ai.status, ai_central: central, renderer, brand, worker: local, processing, embeddings, pending });
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 500, message(error));
    }
  });

  /**
   * Busca de trechos das fontes pela equipe: palavras e, com a busca por significado ligada, o vetor da pergunta (feito aqui no
   * servidor; a chave do Google nunca vai ao navegador). Filtros e permissões continuam no banco (app_ch_search_passages).
   */
  router.post("/search", express.json({ limit: "64kb" }), async (req: Authed, res) => {
    try {
      await requireStaff(req); // antes de gastar com o vetor da pergunta
      const body = (req.body ?? {}) as { query?: unknown; filters?: unknown; limit?: unknown };
      const query = String(body.query ?? "").trim().slice(0, 500);
      if (!query) return fail(res, 400, "Escreva o que procurar.");
      const filters = body.filters && typeof body.filters === "object" && !Array.isArray(body.filters) ? body.filters : {};
      const limit = Math.min(Math.max(Math.trunc(Number(body.limit)) || 10, 1), 50);
      const meaning = await queryEmbedding(await embedderAllowed(deps!.db, deps!.embedder), query, deps!.log);
      const results = await asUser<any[]>(req, "app_ch_search_passages", { p_query: query, p_filters: filters, p_limit: limit, p_embedding: meaning });
      res.json({ results: results ?? [], mode: meaning ? "palavras e significado" : "palavras" });
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 500, message(error));
    }
  });

  /**
   * Guarda o PDF pelo hash e registra o documento. Idempotente pelo hash: o mesmo arquivo não é duplicado. Os metadados
   * vêm da consulta (envio pelo servidor) ou do corpo JSON (confirmação do envio direto); só texto é aceito.
   */
  const storePdf = async (req: Authed, body: Buffer, fileName: string, meta: Record<string, unknown>, kind: "study" | "source") => {
    if (!Buffer.isBuffer(body) || body.length === 0) throw httpError(400, "Envie o arquivo PDF no corpo da requisição.");
    if (body.subarray(0, 5).toString("latin1") !== "%PDF-") throw httpError(415, "O arquivo não é um PDF (assinatura %PDF- ausente).");
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    const key = `documents/${sha256}.pdf`;
    if (!(await deps!.storage.exists(key))) await deps!.storage.put(key, body, "application/pdf");
    const name = fileName.slice(0, 300);
    const q = Object.fromEntries(Object.entries(meta).filter(([, v]) => typeof v === "string")) as Record<string, string | undefined>;
    const registered = await asUser<{ id: string; duplicate: boolean }>(req, "app_ch_register_document", {
      p_doc: {
        name,
        author: q.author,
        publisher: q.publisher,
        edition_date: q.edition_date,
        language: q.language,
        // decisão do dono (2026-10-09): documento de estudo é sempre material próprio, sem registro de autorização e ignorando o que o cliente enviar;
        // PDF de fonte oficial segue "unknown" (o anexo da fonte o torna "somente referência")
        rights_status: kind === "study" ? "own" : "unknown",
        sha256,
        storage_path: key,
        provenance: { uploaded_at: new Date().toISOString(), uploaded_by: req.user!.id, original_file_name: name, size_bytes: body.length, source: q.source_note ?? null },
      },
    });
    return { ...registered, sha256 };
  };
  /** Envio pelo servidor (desenvolvimento): corpo bruto, nome em X-File-Name, metadados na consulta. */
  const upload = express.raw({ type: ["application/pdf", "application/octet-stream"], limit: `${MAX_PDF_MB}mb` });
  const receivePdf = (req: Authed, kind: "study" | "source") => storePdf(req, req.body as Buffer, decodeURIComponent(String(req.headers["x-file-name"] ?? "documento.pdf")), req.query as Record<string, unknown>, kind);

  /**
   * 1) Prepara o envio direto do navegador ao depósito (Supabase), num caminho temporário: o arquivo não passa pelo limite
   * de 4,5 MB do corpo das funções da Vercel. Sem envio assinado (desenvolvimento): { mode: "direct" }.
   */
  const prepareUpload = async (req: Authed) => {
    await requireStaff(req);
    const size = Number((req.body ?? {}).size_bytes);
    if (!Number.isFinite(size) || size <= 0) throw httpError(400, "Arquivo vazio.");
    if (size > MAX_PDF_MB * 1024 * 1024) throw httpError(413, `Arquivo acima de ${MAX_PDF_MB} MB.`);
    if (!deps!.storage.signedUpload) return { mode: "direct" };
    const key = `uploads/${crypto.randomBytes(16).toString("hex")}.pdf`;
    const signed = await deps!.storage.signedUpload(key);
    return { mode: "signed", bucket: CONTENT_HUB_BUCKET, key, path: signed.path, token: signed.token };
  };
  /** 2) Confirma o envio direto: confere o arquivo temporário, guarda pelo hash e registra; o temporário sempre sai. */
  const receiveUpload = async (req: Authed, kind: "study" | "source") => {
    await requireStaff(req);
    const { key, name } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof key !== "string" || !TEMP_UPLOAD.test(key)) throw httpError(400, "Caminho de arquivo inválido.");
    if (!(await deps!.storage.exists(key))) throw httpError(400, "O arquivo não chegou ao depósito. Envie de novo.");
    try {
      return await storePdf(req, await deps!.storage.get(key), typeof name === "string" && name.trim() ? name : "documento.pdf", req.body, kind);
    } finally {
      await deps!.storage.remove?.([key]).catch(() => undefined);
    }
  };
  const enqueueExtract = (documentId: string) =>
    deps!.db.service<{ id: string; duplicate: boolean }>("ch_worker_enqueue", { p_document_id: documentId, p_step: "extract", p_scope_key: "", p_versions: stepVersions("extract", deps!), p_max_attempts: 3 });
  const sendDocument = async (res: Response, doc: { id: string; duplicate: boolean; sha256: string }) => {
    const job = await enqueueExtract(doc.id);
    res.status(doc.duplicate ? 200 : 201).json({ ...doc, job });
  };
  /** PDF completo de uma fonte oficial (acervo de validação): vira trechos citáveis com página. */
  const sendSourceDocument = async (req: Authed, res: Response, doc: { id: string; duplicate: boolean; sha256: string }) => {
    await asUser(req, "app_ch_attach_source_document", { p_source_id: req.params.id, p_document_id: doc.id });
    const job = await enqueueExtract(doc.id);
    await deps!.db.service("ch_worker_unblock");
    res.status(201).json({ ...doc, job });
  };
  const failUpload = (res: Response, error: any) => fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));

  router.post("/documents", upload, async (req: Authed, res) => {
    try {
      await requireStaff(req);
      await sendDocument(res, await receivePdf(req, "study"));
    } catch (error: any) {
      failUpload(res, error);
    }
  });
  router.post("/documents/upload", async (req: Authed, res) => {
    try {
      res.json(await prepareUpload(req));
    } catch (error: any) {
      failUpload(res, error);
    }
  });
  router.post("/documents/confirm", async (req: Authed, res) => {
    try {
      await sendDocument(res, await receiveUpload(req, "study"));
    } catch (error: any) {
      failUpload(res, error);
    }
  });

  router.post("/sources/:id/document", upload, async (req: Authed, res) => {
    try {
      await requireStaff(req);
      await sendSourceDocument(req, res, await receivePdf(req, "source"));
    } catch (error: any) {
      failUpload(res, error);
    }
  });
  router.post("/sources/:id/document/upload", async (req: Authed, res) => {
    try {
      res.json(await prepareUpload(req));
    } catch (error: any) {
      failUpload(res, error);
    }
  });
  router.post("/sources/:id/document/confirm", async (req: Authed, res) => {
    try {
      await sendSourceDocument(req, res, await receiveUpload(req, "source"));
    } catch (error: any) {
      failUpload(res, error);
    }
  });

  /** Endereço para abrir o original: assinado (Supabase, direto do depósito, sem o limite da Vercel) ou nulo (baixa por /file). */
  router.get("/documents/:id/link", async (req: Authed, res) => {
    try {
      const detail = await asUser<{ document: { storage_path: string } }>(req, "app_ch_document", { p_document_id: req.params.id });
      res.json({ url: deps!.storage.signedUrl ? await deps!.storage.signedUrl(detail.document.storage_path, LINK_SECONDS) : null });
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 404, message(error));
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

  // ------------------------------------------------------------------ biblioteca de fontes oficiais (administrador)
  /** Só administrador (a equipe toda lê a Central, mas buscar, aprovar e rejeitar fontes é do dono). */
  const requireAdmin = async (req: Authed) => {
    const me = await requireStaff(req);
    if (!me.admin) throw httpError(403, "Somente administradores.");
    return me;
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const candidateId = (req: Authed) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) throw httpError(400, "Candidato inválido.");
    return id;
  };
  const adminError = (res: Response, error: any) => fail(res, error?.status ?? (forbidden(error) ? 403 : 400), message(error));
  /** Link temporário do arquivo guardado de um candidato (60 s). */
  const CANDIDATE_LINK_SECONDS = 60;
  const WEB_PAGE_NO_FILE = "Página web: o arquivo não abre aqui. Veja o texto e abra no site oficial.";

  /** A busca de fontes oficiais está pronta? (função da Central de IAs configurada, IA ligada, sinalizadores) */
  router.get("/source-search/status", async (req: Authed, res) => {
    try {
      await requireAdmin(req);
      invalidateAiConfig(deps!.db);
      const cfg = await loadAiConfig(deps!.db);
      const check = functionChecks(cfg)["busca_fontes"];
      const problems = [...check.problems];
      const allowed = await aiAllowed(deps!.db);
      if (!allowed.ok && !problems.includes(allowed.why)) problems.push(allowed.why);
      // a IA e o preço por busca que valem agora (tabela de preços da Central de IAs): a tela das abas estima o custo com eles
      const primary = cfg.functions.busca_fontes?.primary ?? null;
      const price = primary ? cfg.prices.find((p) => p.provider === primary.provider && p.model === primary.model) : null;
      res.json({
        ready: check.ready && allowed.ok,
        problems,
        warnings: check.warnings,
        max_searches: cfg.functions.busca_fontes?.max_searches ?? DEFAULT_MAX_SEARCHES,
        provider: primary?.provider ?? null,
        model: primary?.model ?? null,
        per_search_usd: price?.per_search_usd ?? null,
      });
    } catch (error) {
      adminError(res, error);
    }
  });

  /**
   * Aprova um candidato: o banco cria a fonte, o documento de referência e o vínculo numa transação (só administrador) e a
   * rota põe a leitura na fila. Se pôr na fila falhar, a aprovação vale e a resposta traz read_error (a tela oferece "Ler de novo").
   */
  router.post("/source-candidates/:id/approve", express.json({ limit: "64kb" }), async (req: Authed, res) => {
    try {
      await requireAdmin(req);
      const id = candidateId(req);
      const fields = req.body && typeof req.body.fields === "object" && req.body.fields && !Array.isArray(req.body.fields) ? req.body.fields : {};
      const approved = await asUser<{ source_id: string; document_id: string }>(req, "app_ch_source_candidate_approve", { p_candidate_id: id, p_fields: fields });
      try {
        const job = await enqueueExtract(approved.document_id);
        await deps!.db.service("ch_worker_unblock");
        res.status(201).json({ ...approved, job });
      } catch (error) {
        deps!.log?.(`[central] leitura da fonte aprovada não entrou na fila: ${message(error).slice(0, 200)}`);
        res.status(201).json({ ...approved, job: null, read_error: "A leitura não entrou na fila: use Ler de novo." });
      }
    } catch (error) {
      adminError(res, error);
    }
  });

  /** "Ler de novo": põe a leitura da fonte aprovada na fila, sem duplicar o trabalho (e recomeça o que falhou). */
  router.post("/source-candidates/:id/read", async (req: Authed, res) => {
    try {
      await requireAdmin(req);
      const c = await asUser<{ status: string; document_id: string | null }>(req, "app_ch_source_candidate", { p_candidate_id: candidateId(req) });
      if (c.status !== "aprovado" || !c.document_id) throw httpError(409, "Só a fonte aprovada tem leitura.");
      const next = await deps!.db.service<{ id: string; duplicate: boolean }>("ch_worker_next", { p_document_id: c.document_id, p_step: "extract", p_versions: stepVersions("extract", deps!), p_scope_key: "" });
      await deps!.db.service("ch_worker_unblock");
      res.json({ ok: true, job: next });
    } catch (error) {
      adminError(res, error);
    }
  });

  /** Rejeita (motivo de pelo menos 10 caracteres) e apaga o arquivo guardado; o link e o SHA-256 ficam, então não volta. */
  router.post("/source-candidates/:id/reject", express.json({ limit: "64kb" }), async (req: Authed, res) => {
    try {
      await requireAdmin(req);
      const out = await asUser<{ storage_path: string | null }>(req, "app_ch_source_candidate_reject", { p_candidate_id: candidateId(req), p_reason: String(req.body?.reason ?? "") });
      if (out?.storage_path) {
        // falha ao apagar não desfaz a rejeição: só vai para o registro
        await deps!.storage.remove?.([out.storage_path]).catch((error: unknown) => deps!.log?.(`[central] arquivo rejeitado não foi apagado (${out.storage_path}): ${message(error).slice(0, 200)}`));
      }
      res.json({ ok: true });
    } catch (error) {
      adminError(res, error);
    }
  });

  /**
   * Abre o arquivo guardado do candidato: link temporário de 60 s do depósito, ou (desenvolvimento) o PDF. Página web nunca é
   * servida como página: 409 com o aviso (a tela mostra o texto e o link do site oficial). Rejeitado (arquivo apagado): 404.
   */
  router.get("/source-candidates/:id/file", async (req: Authed, res) => {
    try {
      await requireAdmin(req);
      const c = await asUser<{ file_kind: string; storage_path: string | null; sha256: string }>(req, "app_ch_source_candidate", { p_candidate_id: candidateId(req) });
      if (c.file_kind === "html") return fail(res, 409, WEB_PAGE_NO_FILE);
      if (!c.storage_path) return fail(res, 404, "O arquivo deste candidato não está mais guardado.");
      if (deps!.storage.signedUrl) return res.json({ url: await deps!.storage.signedUrl(c.storage_path, CANDIDATE_LINK_SECONDS) });
      const data = await deps!.storage.get(c.storage_path);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="fonte-${c.sha256.slice(0, 12)}.pdf"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : /não encontrado/i.test(message(error)) ? 404 : 400), message(error));
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
