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
import { estimateDocumentCost } from "./costEstimate";
import { applyReferenceCleanup, previewReferenceCleanup, undoReferenceCleanup } from "./referenceCleanup";
import { CONTENT_HUB_BUCKET, DigestLimit, type Identity } from "./infra";
import type { ContentHubWorker } from "./worker";
import type { ProcessingReport } from "./capabilities";
import { DEFAULT_MAX_SEARCHES, functionChecks, invalidateAiConfig, loadAiConfig } from "../ai/config";
import { aiAllowed } from "./ai/registry";
import { runScheduledReanalysis } from "./reanalysisRun";
import { mountQuestoesStaziaMed } from "./questoes/routes";
import { DEFAULT_EMBEDDING_MODEL, embedderAllowed, embeddingsConfig, queryEmbedding } from "./embeddings";
import { ACCESS_CHECK_FAILED, shown } from "../auth/friendlyError";

/** A tarefa no Cloud Run passa a cada minuto (agendador); a execução que pega trabalho dura até 50 min. Sem relato há mais de 30 min, ela parou. */
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

/** O site já tem a função nova, mas o banco ainda não recebeu a atualização (SQL colado depois): aviso em português simples. */
const NEEDS_DB_UPDATE = "Esta função ainda não está disponível: falta concluir uma atualização do banco de dados. Peça ao suporte técnico.";
const missingDbFunction = (error: unknown) => /does not exist|could not find the function|schema cache/i.test(message(error)) && /app_ch_(request_sources_check|reanalysis_request)/.test(message(error));

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
      (deps as { log?: (m: string) => void } | null)?.log?.(`conferência de login falhou: ${message(error)}`.slice(0, 300));
      fail(res, 500, ACCESS_CHECK_FAILED);
    }
  });

  const asUser = <T>(req: Authed, fn: string, args: Record<string, unknown> = {}) => deps!.db.asUser<T>(req.user!, fn, args);
  // Questões StaziaMed: estimativa de custo e fila de Gerar, Conferir e Buscar fonte oficial (só a equipe)
  mountQuestoesStaziaMed(router, deps!, asUser);
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
      // CC11: "a IA está pronta?" olha as chaves de quem de fato chama a IA. Onde o processamento é este servidor (desenvolvimento), valem
      // as chaves daqui; em produção quem chama a IA é a tarefa do Google Cloud Run, e as chaves do SITE (Vercel) não dizem nada sobre
      // ela. Por isso o site só confere as próprias chaves quando não há relato do processamento no formato novo (que traz a Central de IAs
      // conferida com as chaves da própria tarefa).
      const checkSiteAi = async () => {
        if (deps!.ai.status.isMock) return;
        const ready = await loadAiConfig(deps!.db).then((cfg) => Object.values(functionChecks(cfg, process.env)).some((c) => c.ready)).catch(() => false);
        if (!ready) pending.push(NO_FUNCTION_READY);
      };
      let renderer: boolean;
      let brand: { version: string; pending: string[] };
      let processing: Record<string, unknown>;
      if (local) {
        await checkSiteAi();
        const b = loadBrand();
        renderer = Boolean(deps!.renderer);
        brand = { version: b.version, pending: b.pending };
        pending.push(...(renderer ? [] : ["Renderizador de PDF (Playwright/Chromium) indisponível no servidor."]), ...b.pending);
        processing = { where: "servidor", running: true };
      } else {
        const last = await deps!.db
          .service<{ worker: string; reported_at: string; report: ProcessingReport & { jobs?: number; finished_at?: string } } | null>("ch_worker_last_report")
          .catch(() => null);
        if (!last || last.report.ai?.source !== "central") await checkSiteAi();
        if (!last) {
          renderer = false;
          brand = { version: "", pending: [] };
          processing = { where: null };
          pending.push("O processamento da Central (leitura dos PDFs, OCR e geração dos arquivos finais) ainda não rodou: ele roda como tarefa no Google Cloud Run, que ainda não foi implantada.");
        } else {
          const minutes = Math.max(0, Math.round((Date.now() - Date.parse(last.reported_at)) / 60_000));
          const stale = minutes > PROCESSING_STALE_MIN;
          if (stale) pending.push(`O processamento da Central não roda desde ${new Date(last.reported_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}: confira a tarefa no Google Cloud Run.`);
          // IA do processamento: o relato novo confere a Central de IAs com as chaves do processamento e vale (as chaves do site não
          // entram: CC11); o relato antigo (sem ai.source) olhava a variável CONTENT_HUB_AI_PROVIDER, que as etapas não usam, e
          // continua escondido, e nesse caso o site confere as próprias chaves.
          const centralReport = last.report.ai?.source === "central";
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
      fail(res, forbidden(error) ? 403 : 500, shown(error));
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
      fail(res, forbidden(error) ? 403 : 500, shown(error));
    }
  });

  /**
   * Guarda o PDF pelo hash e registra o documento. Idempotente pelo hash: o mesmo arquivo não é duplicado. Os metadados
   * vêm da consulta (envio pelo servidor) ou do corpo JSON (confirmação do envio direto); só texto é aceito.
   */
  const registerPdf = async (req: Authed, file: { sha256: string; sizeBytes: number; key: string }, fileName: string, meta: Record<string, unknown>, kind: "study" | "source") => {
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
        sha256: file.sha256,
        storage_path: file.key,
        provenance: { uploaded_at: new Date().toISOString(), uploaded_by: req.user!.id, original_file_name: name, size_bytes: file.sizeBytes, source: q.source_note ?? null },
      },
    });
    return { ...registered, sha256: file.sha256 };
  };
  const storePdf = async (req: Authed, body: Buffer, fileName: string, meta: Record<string, unknown>, kind: "study" | "source") => {
    if (!Buffer.isBuffer(body) || body.length === 0) throw httpError(400, "Envie o arquivo PDF no corpo da requisição.");
    if (body.subarray(0, 5).toString("latin1") !== "%PDF-") throw httpError(415, "O arquivo não é um PDF (assinatura %PDF- ausente).");
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    const key = `documents/${sha256}.pdf`;
    if (!(await deps!.storage.exists(key))) await deps!.storage.put(key, body, "application/pdf");
    return registerPdf(req, { sha256, sizeBytes: body.length, key }, fileName, meta, kind);
  };
  /**
   * Envio direto já no depósito (CC08): o arquivo NÃO é baixado inteiro para a memória do servidor nem enviado de volta. O servidor
   * lê o arquivo em pedaços só para calcular o SHA-256 e conferir a assinatura de PDF e, se o depósito deixa copiar de dentro dele,
   * copia do caminho temporário para o definitivo (documents/<sha>.pdf) sem mover bytes pela rede. Um PDF de 300 MB deixa de
   * estourar a memória e metade do tempo da função da Vercel. Depósito sem essas duas operações (banco de desenvolvimento): o caminho
   * antigo (storePdf).
   */
  const CONFIRM_SECONDS = 200;
  const storeUploadedPdf = async (req: Authed, tempKey: string, fileName: string, meta: Record<string, unknown>, kind: "study" | "source") => {
    const st = deps!.storage;
    if (!st.digest || !st.copy) return storePdf(req, await st.get(tempKey), fileName, meta, kind);
    let found;
    try {
      found = await st.digest(tempKey, { maxBytes: MAX_PDF_MB * 1024 * 1024, timeoutMs: CONFIRM_SECONDS * 1000 });
    } catch (error) {
      if (error instanceof DigestLimit) {
        throw httpError(error.reason === "size" ? 413 : 504, error.reason === "size" ? `Arquivo acima de ${MAX_PDF_MB} MB.` : "A conferência do arquivo demorou demais. Tente enviar de novo; se repetir, envie um PDF menor ou em partes.");
      }
      throw error;
    }
    if (found.size === 0) throw httpError(400, "Envie o arquivo PDF no corpo da requisição.");
    if (found.head.subarray(0, 5).toString("latin1") !== "%PDF-") throw httpError(415, "O arquivo não é um PDF (assinatura %PDF- ausente).");
    const key = `documents/${found.sha256}.pdf`;
    if (!(await st.exists(key))) await st.copy(tempKey, key);
    return registerPdf(req, { sha256: found.sha256, sizeBytes: found.size, key }, fileName, meta, kind);
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
      return await storeUploadedPdf(req, key, typeof name === "string" && name.trim() ? name : "documento.pdf", req.body, kind);
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
    let job = await enqueueExtract(doc.id);
    if (job.duplicate) job = (await continueKnownDocument(doc.id)) ?? job;
    await deps!.db.service("ch_worker_unblock");
    res.status(201).json({ ...doc, job });
  };
  /**
   * O mesmo arquivo já tinha sido enviado (ex.: em Documentos) e a fila reconheceu a leitura como repetida (CC24): sem isto a fonte
   * ficava ligada ao documento, mas sem trechos. Leitura pronta = manda direto indexar os trechos (ler o PDF de novo apagaria o trabalho
   * já feito no documento); leitura que falhou = refaz; na fila ou rodando = deixa terminar (a leitura confere no fim se virou fonte).
   */
  const continueKnownDocument = async (documentId: string) => {
    const state = await deps!.db
      .service<{ extract_status: string | null; blocks: number } | null>("ch_worker_document_extraction", { p_document_id: documentId })
      .catch(() => null); // banco sem a atualização 9873: segue como antes
    if (!state) return null;
    if (state.extract_status === "succeeded" && state.blocks > 0) {
      return deps!.db.service<{ id: string; duplicate: boolean }>("ch_worker_next", { p_document_id: documentId, p_step: "source_index", p_versions: stepVersions("source_index", deps!), p_scope_key: "" });
    }
    if (state.extract_status && ["failed", "dead", "blocked", "succeeded"].includes(state.extract_status)) {
      return deps!.db.service<{ id: string; duplicate: boolean }>("ch_worker_next", { p_document_id: documentId, p_step: "extract", p_versions: stepVersions("extract", deps!), p_scope_key: "" });
    }
    return null;
  };
    const failUpload = (res: Response, error: any) => fail(res, error?.status ?? (forbidden(error) ? 403 : 400), shown(error));

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
      fail(res, forbidden(error) ? 403 : 404, shown(error));
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
      fail(res, forbidden(error) ? 403 : 404, shown(error));
    }
  });

  /**
   * Arquivo de um material da unidade (imagem ou PDF da aula importada), do depósito protegido. Só equipe e revisor médico (a função do
   * banco recusa os demais); nunca guarda em cache e nunca devolve o caminho do depósito. O aluno não tem rota para arquivo de unidade.
   */
  router.get("/unit-materials/:id/file/:idx", async (req: Authed, res) => {
    try {
      const idx = Number(req.params.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx > 200) return fail(res, 400, "Arquivo inválido.");
      const f = await asUser<{ caminho: string; tipo: string }>(req, "app_ch_unit_material_file", { p_item_id: req.params.id, p_idx: idx });
      if (!/^aulas-prontas\/[A-Za-z0-9._-]+\/[A-Za-z0-9/_.-]+$/.test(f.caminho) || f.caminho.includes("..")) return fail(res, 400, "Arquivo inválido.");
      const data = await deps!.storage.get(f.caminho);
      res.setHeader("Content-Type", f.tipo === "application/pdf" ? "application/pdf" : f.tipo);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 404, shown(error));
    }
  });

  /**
   * Imagem da aula do ALUNO (Revisão da Aula A4 ou flashcard ilustrado): só PNG de item publicado e visível ao aluno. O servidor confere o
   * login (acima), pede o caminho ao banco por função só do servidor e entrega os bytes; o navegador nunca recebe o caminho do depósito
   * nem endereço assinado, e a resposta não fica em cache. Nunca há rota de PDF para o aluno.
   */
  router.get("/aula-aluno/:tema/:qual/:n", async (req: Authed, res) => {
    try {
      const n = Number(req.params.n);
      const tema = String(req.params.tema);
      const qual = String(req.params.qual);
      if (!/^GR-[0-9]{3}$/.test(tema) || !["revisao", "frente", "verso"].includes(qual) || !Number.isInteger(n) || n < 1 || n > 60) return fail(res, 400, "Arquivo inválido.");
      const f = await deps!.db.service<{ caminho: string; tipo: string }>("ch_worker_aula_aluno_arquivo", { p_tema_id: tema, p_qual: qual, p_n: n });
      if (!f?.caminho || f.tipo !== "image/png" || !/^aulas-prontas\/[A-Za-z0-9._-]+\/[A-Za-z0-9/_.-]+\.png$/.test(f.caminho) || f.caminho.includes("..")) return fail(res, 404, "Arquivo não encontrado.");
      const data = await deps!.storage.get(f.caminho);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    } catch (error) {
      fail(res, 404, "Imagem indisponível agora.");
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
      fail(res, forbidden(error) ? 403 : 404, shown(error));
    }
  });

  /**
   * Estimativa de custo de IA do documento (administrador; CC05): o pior caso pela mesma conta dos tetos, com o texto já lido. Não chama
   * IA nem grava nada. O documento precisa ser acessível a quem pergunta (a mesma regra da tela do documento).
   */
  router.get("/documents/:id/cost-estimate", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      if (!me.admin) return fail(res, 403, "Somente administradores.");
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(res, 400, "Documento inválido.");
      await asUser(req, "app_ch_inventory", { p_document_id: id });
      res.json(await estimateDocumentCost(deps!.db, id));
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 400, message(error));
    }
  });

  /** Reprocessar uma etapa (sem duplicar) e acordar o worker. */
  router.post("/jobs/:id/retry", async (req: Authed, res) => {
    try {
      await asUser(req, "app_ch_retry_job", { p_job_id: req.params.id });
      res.json({ ok: true });
    } catch (error) {
      fail(res, forbidden(error) ? 403 : 400, shown(error));
    }
  });

  /**
   * Conferir agora as fontes monitoradas (administrador). Onde o processamento roda junto com o servidor (desenvolvimento), confere
   * na hora. No site publicado quem confere é o processamento no Google (o servidor da Vercel não processa): o pedido fica marcado
   * em cada fonte monitorada e a próxima rodada atende (CC23).
   */
  router.post("/sources/check", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      if (!me.admin) return fail(res, 403, "Somente administradores.");
      if (opts.worker?.running) return res.json(await opts.worker.checkSources());
      const requested = await asUser<number>(req, "app_ch_request_sources_check");
      res.json({ requested: Number(requested) || 0 });
    } catch (error) {
      if (missingDbFunction(error)) return fail(res, 503, NEEDS_DB_UPDATE);
      fail(res, forbidden(error) ? 403 : 500, shown(error));
    }
  });

  /**
   * Reanalisar agora as questões cuja fonte oficial mudou (administrador, CC18). Marca o pedido no banco; o processamento atende na
   * próxima rodada. Onde o processamento roda junto com o servidor (desenvolvimento), a rodada começa na hora, em segundo plano.
   * A IA só propõe: nada vai ao aluno sem a decisão de um revisor médico.
   */
  router.post("/questions/reanalysis", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      if (!me.admin) return fail(res, 403, "Somente administradores.");
      const r = await asUser<{ waiting: number; already: boolean }>(req, "app_ch_reanalysis_request");
      const now = Boolean(opts.worker?.running);
      if (now) void runScheduledReanalysis(deps!).catch((error) => deps!.log?.(`[central] reanálise de questões: ${message(error)}`));
      res.json({ ...r, now });
    } catch (error) {
      if (missingDbFunction(error)) return fail(res, 503, NEEDS_DB_UPDATE);
      fail(res, forbidden(error) ? 403 : /esperando reanálise/.test(message(error)) ? 400 : 500, shown(error));
    }
  });

  /**
   * "Tirar marcas de terceiros" (administrador, sem licença cadastrada: CC09). body: { action: "preview" | "apply" | "undo", terms: [nomes e
   * endereços a tirar] }. A prévia não grava nada; o desfazer restaura o que ninguém revisou depois.
   */
  router.post("/documents/:id/clean-references", async (req: Authed, res) => {
    try {
      const me = await requireStaff(req);
      if (!me.admin) return fail(res, 403, "Somente administradores.");
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(res, 400, "Documento inválido.");
      const action = String(req.body?.action ?? "preview");
      if (action === "undo") return res.json(await undoReferenceCleanup(deps!.db, id, req.user!.id));
      if (action === "apply") return res.json(await applyReferenceCleanup(deps!.db, id, req.user!.id, req.body?.terms));
      const p = await previewReferenceCleanup(deps!.db, id, req.body?.terms);
      res.json({ ...p, changes: p.changes.slice(0, 200), shown: Math.min(p.changes.length, 200), total: p.changes.length });
    } catch (error: any) {
      fail(res, error?.status ?? (forbidden(error) ? 403 : 400), shown(error));
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
  const adminError = (res: Response, error: any) => fail(res, error?.status ?? (forbidden(error) ? 403 : 400), shown(error));
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
      fail(res, error?.status ?? (forbidden(error) ? 403 : /não encontrado/i.test(message(error)) ? 404 : 400), shown(error));
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
      fail(res, forbidden(error) ? 403 : 400, shown(error));
    }
  });

  return router;
}
