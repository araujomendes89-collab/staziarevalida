/**
 * Processamento da Central de Conteúdo, uma etapa por trabalho da fila (ch_jobs):
 *
 *   material de estudo:  extract → classify → claims → evidence → draft → materials → render → review_check
 *   fonte de referência: extract → source_index
 *
 * Regras que valem para todas as etapas:
 *   - cada chamada de IA é separada, com prompt versionado, resposta validada por schema e
 *     registrada em ch_ai_runs (modelo, prompt, entrada por hash, tokens, custo, recusas);
 *   - toda saída passa por conferência de software antes de ser gravada (trecho literal,
 *     números/unidades, negações, cópia); o que falha é descartado e fica registrado;
 *   - nada aqui aprova, publica ou confirma afirmação crítica: isso é só de pessoas;
 *   - sem IA, extrator ou renderizador configurado, a etapa fica PENDENTE (blocked) com o
 *     motivo — nunca é simulada em produção;
 *   - checkpoints permitem retomar; reprocessar reaproveita respostas idênticas e não duplica.
 */
import { compareSourceVersions } from "./sourceCompare";
import { aiAllowed, registerPromptsOnce } from "./ai/registry";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PROMPTS, asDocument, CRITICAL_KINDS, type PromptKey } from "./ai/prompts";
import { AiInvalidOutput, type AiProvider, type AiStatus } from "./ai/provider";
import { validate } from "./ai/schema";
import { copyRatio, flashcardProblems, isVerbatim, negations, negationsLost, normalize, numbers, numbersOutside } from "./checks";
import type { ContentDb, Storage } from "./infra";
import type { Renderer } from "./render";
import { generateVisualVersion, visualVersionOf, VisualRenderUnavailable } from "./visual/service";

const run = promisify(execFile);

export const PIPELINE_VERSION = "pipeline-1.0.0";
export const EXTRACTOR_VERSION = "staziamed-extract-1.0";
export const MATERIALS_TEMPLATE = "materials-1.0";
const PAGE_RANGE = 20;

export type Step = "extract" | "source_index" | "classify" | "claims" | "evidence" | "draft" | "materials" | "render" | "review_check" | "visual_render";

export interface Job {
  id: string;
  document_id: string | null;
  step: Step;
  scope_key: string;
  versions: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  checkpoint: Record<string, any>;
}

export interface PipelineDeps {
  db: ContentDb;
  storage: Storage;
  ai: { provider: AiProvider | null; status: AiStatus };
  renderer?: Renderer | null;
  python?: string;
  log?: (message: string) => void;
}

/** Falta configuração: o trabalho fica pendente, sem gastar tentativa. */
export class Blocked extends Error {}
/** Falha que nova tentativa não resolve (arquivo protegido, corrompido, hash diferente). */
export class Fatal extends Error {}

interface Metrics {
  ms?: number;
  ai_calls: number;
  cache_hits: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  rejections: number;
  [key: string]: unknown;
}

interface Ctx {
  deps: PipelineDeps;
  job: Job;
  metrics: Metrics;
}

const sha256 = (data: Buffer | string) => crypto.createHash("sha256").update(data).digest("hex");
const svc = <T>(ctx: Ctx, fn: string, args: Record<string, unknown> = {}) => ctx.deps.db.service<T>(fn, args);
const docId = (ctx: Ctx) => {
  if (!ctx.job.document_id) throw new Fatal("Trabalho sem documento.");
  return ctx.job.document_id;
};
const versionScope = (ctx: Ctx) => (ctx.job.scope_key.startsWith("version:") ? ctx.job.scope_key.slice("version:".length) : null);
/** Situação do documento: trabalho de uma versão só (edição manual) não mexe no documento. */
const setMeta = async (ctx: Ctx, meta: Record<string, unknown>) => {
  if (versionScope(ctx) || !ctx.job.document_id) return;
  await svc(ctx, "ch_worker_document_meta", { p_document_id: ctx.job.document_id, p_meta: meta });
};
/** Versões em rascunho a processar: as do documento ou, em trabalho de versão, só aquela. */
async function targetVersions(ctx: Ctx): Promise<any[]> {
  const only = versionScope(ctx);
  if (only) {
    const v = await svc<any>(ctx, "ch_worker_unit_version", { p_version_id: only });
    return v && v.status === "draft" ? [v] : [];
  }
  return svc<any[]>(ctx, "ch_worker_unit_versions", { p_document_id: docId(ctx) });
}
const checkpoint = (ctx: Ctx, data: Record<string, unknown>) => {
  ctx.job.checkpoint = data;
  return svc(ctx, "ch_worker_checkpoint", { p_job_id: ctx.job.id, p_checkpoint: data });
};

export function stepVersions(step: Step, deps: PipelineDeps): Record<string, unknown> {
  const prompts: Partial<Record<Step, PromptKey[]>> = {
    classify: ["classify"],
    claims: ["claims"],
    evidence: ["evidence"],
    draft: ["draft"],
    materials: ["summary", "flashcards", "questions"],
    review_check: ["review"],
  };
  return {
    pipeline: PIPELINE_VERSION,
    ...(step === "extract" ? { parser: EXTRACTOR_VERSION } : {}),
    ...(prompts[step] ? { prompts: Object.fromEntries(prompts[step]!.map((k) => [k, PROMPTS[k].version])), model: deps.ai.provider?.model ?? null } : {}),
    ...(step === "materials" ? { template: MATERIALS_TEMPLATE } : {}),
    ...(step === "render" && deps.renderer ? { template: deps.renderer.templateVersion, brand: deps.renderer.brandVersion } : {}),
  };
}

// ---------------------------------------------------------------------------- IA
type Rejection = { where: string; reason: string };

async function ai<T>(ctx: Ctx, key: PromptKey, payload: unknown, check?: (output: T) => Rejection[]): Promise<{ output: T; rejections: Rejection[] }> {
  const provider = ctx.deps.ai.provider;
  if (!provider) throw new Blocked(ctx.deps.ai.status.pending ?? "IA não configurada.");
  const allowed = await aiAllowed(ctx.deps.db);
  if (!allowed.ok) throw new Blocked(allowed.why);
  await registerPromptsOnce(ctx.deps.db);
  const prompt = PROMPTS[key];
  const input = `Responda no formato "${key}". O material segue como dado:\n${asDocument(payload)}`;
  const inputHash = sha256(`${prompt.system}\n${input}`);
  const base = {
    job_id: ctx.job.id,
    document_id: ctx.job.document_id,
    step: ctx.job.step,
    provider: provider.name,
    model: provider.model,
    prompt_id: prompt.id,
    prompt_version: prompt.version,
    schema_version: prompt.version,
    input_hash: inputHash,
  };

  const cached = await svc<T | null>(ctx, "ch_worker_cached_run", { p_prompt_id: prompt.id, p_prompt_version: prompt.version, p_model: provider.model, p_input_hash: inputHash });
  if (cached && validate(prompt.schema, cached).length === 0) {
    ctx.metrics.cache_hits++;
    const rejections = check?.(cached) ?? [];
    ctx.metrics.rejections += rejections.length;
    return { output: cached, rejections };
  }

  ctx.metrics.ai_calls++;
  let result;
  try {
    result = await provider.generate<T>({ promptId: prompt.id, promptVersion: prompt.version, system: prompt.system, input, schema: prompt.schema, schemaName: `staziamed_${key}`, maxOutputTokens: 8192 });
  } catch (error) {
    const invalid = error instanceof AiInvalidOutput;
    await svc(ctx, "ch_worker_log_ai_run", {
      p_run: { ...base, status: invalid ? "invalid_output" : "failed", output: invalid ? { raw: String(JSON.stringify((error as AiInvalidOutput).raw) ?? "").slice(0, 4000) } : null, error: (error as Error).message.slice(0, 1000) },
    });
    throw error;
  }
  const rejections = check?.(result.output) ?? [];
  ctx.metrics.rejections += rejections.length;
  ctx.metrics.input_tokens += result.inputTokens ?? 0;
  ctx.metrics.output_tokens += result.outputTokens ?? 0;
  if (result.costUsd != null) ctx.metrics.cost_usd = (ctx.metrics.cost_usd ?? 0) + result.costUsd;
  await svc(ctx, "ch_worker_log_ai_run", {
    p_run: {
      ...base,
      provider: result.provider,
      model: result.model,
      status: rejections.length ? "rejected_by_check" : "ok",
      output: result.output,
      rejections,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: result.costUsd,
      latency_ms: result.latencyMs,
    },
  });
  return { output: result.output, rejections };
}

// ---------------------------------------------------------------------------- blocos e trechos
export interface Block {
  id: string;
  page_no: number;
  idx: number;
  type: string;
  status: string;
  text: string | null;
  original_text: string | null;
  flags: { code: string }[];
}

const usable = (b: Block) => b.status === "extracted" && normalize(b.text ?? "").length > 0;

/** Agrupa blocos em pedaços por seção (título), sem passar de maxChars. */
export function chunkBlocks(blocks: Block[], maxChars: number): Block[][] {
  const chunks: Block[][] = [];
  let cur: Block[] = [];
  let size = 0;
  for (const b of blocks) {
    const len = (b.text ?? "").length;
    if (cur.length && (size + len > maxChars || (b.type === "heading" && size > maxChars / 4))) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(b);
    size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Trechos de uma fonte de referência: por seção e página (para citar a página exata). */
export function buildPassages(blocks: Block[], maxChars = 1500) {
  const out: { section: string | null; page: number; text: string }[] = [];
  let section: string | null = null;
  let cur: { section: string | null; page: number; parts: string[]; size: number } | null = null;
  const flush = () => {
    if (cur && cur.parts.length) out.push({ section: cur.section, page: cur.page, text: cur.parts.join("\n") });
    cur = null;
  };
  for (const b of blocks) {
    if (!usable(b)) continue;
    const text = normalize(b.text ?? "");
    if (b.type === "heading") {
      flush();
      section = text.slice(0, 200);
      continue;
    }
    if (!["paragraph", "list", "table", "caption", "footnote", "reference"].includes(b.type)) continue;
    if (!cur || cur.page !== b.page_no || cur.section !== section || cur.size + text.length > maxChars) {
      flush();
      cur = { section, page: b.page_no, parts: [], size: 0 };
    }
    cur!.parts.push(text);
    cur!.size += text.length;
  }
  flush();
  return out;
}

/** Consulta por palavras (OU) para a busca em português do banco. */
export function searchQuery(text: string, max = 10): string {
  const stop = new Set("para pela pelo com sem que como mais menos deve devem pode podem quando entre sobre após até essa esse esta este dos das nos nas uma uns umas".split(" "));
  const seen = new Set<string>();
  const words = normalize(text)
    .toLowerCase()
    .split(/[^a-zà-ú0-9]+/i)
    .filter((w) => w.length >= 4 && !stop.has(w) && !seen.has(w) && seen.add(w));
  return words.slice(0, max).join(" or ");
}

/** Tipos críticos detectados por regra (só acrescenta: mais conferência humana, nunca menos). */
export function softwareCriticalKinds(text: string): string[] {
  const kinds: string[] = [];
  if (/\d\s*(mg|mcg|µg|g|ml|ui)(\/|\b)/i.test(text)) kinds.push("dose");
  if (/\d\s*(dias?|semanas?|meses|horas?)\b/i.test(text) || /\b(por|durante)\s+\d/i.test(text)) kinds.push("duration");
  if (/\b(\d+\/\d+\s*h|a cada \d+|\d+\s*x\s*(ao|por)\s*dia|\d+\s*vezes)/i.test(text)) kinds.push("frequency");
  if (/\b(via oral|endovenos|intravenos|intramuscular|subcut[âa]ne|IV|IM|VO|SC)\b/.test(text)) kinds.push("route");
  if (/contraindica/i.test(text)) kinds.push("contraindication");
  if (/rastreamento|rastreio/i.test(text) && /\d/.test(text)) kinds.push("screening_interval");
  return kinds;
}

// ---------------------------------------------------------------------------- etapas
async function stepExtract(ctx: Ctx): Promise<Step | null> {
  const doc = await svc<any>(ctx, "ch_worker_document", { p_document_id: docId(ctx) });
  if (!doc) throw new Fatal("Documento não encontrado.");
  if (!doc.storage_path || !(await ctx.deps.storage.exists(doc.storage_path))) throw new Fatal("O arquivo original não está no armazenamento.");
  const buf = await ctx.deps.storage.get(doc.storage_path);
  if (sha256(buf) !== doc.sha256) throw new Fatal("O arquivo armazenado não confere com o hash registrado no envio.");
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Fatal("Formato ainda não suportado: por enquanto só PDF (os demais formatos entram por adaptadores).");

  await setMeta(ctx, { status: "extracting", failure: "" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ch-extract-"));
  const pdf = path.join(dir, "original.pdf");
  fs.writeFileSync(pdf, buf);
  const script = path.join(process.cwd(), "scripts/content-hub/extract_pdf.py");
  const python = ctx.deps.python ?? process.env.CONTENT_HUB_PYTHON ?? "pdfpython";
  const cp = ctx.job.checkpoint ?? {};
  let start: number = cp.next_page ?? 1;
  let pageCount: number | null = cp.page_count ?? null;
  const kinds: Record<string, number> = { ...(cp.kinds ?? {}) };
  let blocks: number = cp.blocks ?? 0;
  let last: any = cp.last ?? null;
  try {
    while (pageCount == null || start <= pageCount) {
      const out = path.join(dir, `range-${start}.json`);
      try {
        await run(python, [script, pdf, "--out", out, "--start", String(start), "--end", String(start + PAGE_RANGE - 1)], { timeout: 20 * 60_000, maxBuffer: 16 * 1024 * 1024 });
      } catch (error: any) {
        if (error?.code === "ENOENT") throw new Blocked(`Extrator indisponível: o comando "${python}" não existe neste servidor (configure CONTENT_HUB_PYTHON).`);
        if (error?.code === 2 && fs.existsSync(out)) {
          const failed = JSON.parse(fs.readFileSync(out, "utf8"));
          throw new Fatal(failed.document?.error ?? "Arquivo ilegível.");
        }
        throw new Error(`Extrator falhou: ${String(error?.stderr || error?.message || error).slice(-600)}`);
      }
      const data = JSON.parse(fs.readFileSync(out, "utf8"));
      pageCount = data.document.page_count;
      await svc(ctx, "ch_worker_save_extraction", { p_document_id: docId(ctx), p_text_kind: data.document.text_kind, p_pages: data.pages, p_blocks: data.blocks });
      await setMeta(ctx, { status: "extracting" });
      for (const p of data.pages) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
      blocks += data.blocks.length;
      last = { parser: data.parser, metadata: data.document.metadata ?? {}, repaired: Boolean(data.document.repaired) };
      start += PAGE_RANGE;
      await checkpoint(ctx, { next_page: start, page_count: pageCount, kinds, blocks, last });
      if (!data.pages.length) break;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const nonEmpty = Object.keys(kinds).filter((k) => k !== "empty" && kinds[k] > 0);
  const textKind = nonEmpty.length > 1 ? "mixed" : nonEmpty[0] ?? "text";
  const reference = doc.purpose === "reference_source";
  await setMeta(ctx, {
    page_count: pageCount,
    text_kind: textKind,
    status: reference ? "verifying_sources" : "classifying",
    provenance: { extraction: { at: new Date().toISOString(), parser: last?.parser, pdf_metadata: last?.metadata, repaired: last?.repaired } },
  });
  Object.assign(ctx.metrics, { pages: pageCount, blocks, page_kinds: kinds });
  return reference ? "source_index" : "classify";
}

async function stepSourceIndex(ctx: Ctx): Promise<Step | null> {
  const source = await svc<any>(ctx, "ch_worker_source_for_document", { p_document_id: docId(ctx) });
  if (!source) throw new Blocked("Documento de referência sem fonte cadastrada vinculada: cadastre a fonte (órgão, versão, vigência) e vincule este PDF.");
  const blocks = await svc<Block[]>(ctx, "ch_worker_blocks", { p_document_id: docId(ctx) });
  const passages = buildPassages(blocks);
  const n = await svc<number>(ctx, "ch_worker_replace_passages", { p_source_id: source.id, p_passages: passages });
  // versão nova de uma fonte já cadastrada: compara o conteúdo com a anterior e tria as questões afetadas (falha aqui não derruba a leitura)
  try {
    const previous = await svc<string | null>(ctx, "ch_worker_predecessor_source", { p_source_id: source.id });
    if (previous && n > 0) {
      const r = await compareSourceVersions(ctx.deps.db, previous, source.id);
      Object.assign(ctx.metrics, { diff_critical: r.summary.critical, diff_claims: r.claims });
    }
  } catch (error) {
    Object.assign(ctx.metrics, { diff_error: (error as Error).message });
  }
  await setMeta(ctx, { status: "awaiting_review" });
  Object.assign(ctx.metrics, { passages: n, unresolved_blocks: blocks.filter((b) => b.status === "pending" || b.status === "illegible").length });
  return null;
}

async function stepClassify(ctx: Ctx): Promise<Step | null> {
  await setMeta(ctx, { status: "classifying" });
  const catalog = await svc<{ version: number; nodes: { id: string; level: string; path: string; area_code: string }[] }>(ctx, "ch_worker_catalog");
  const nodes = new Map(catalog.nodes.map((n) => [n.id, n]));
  const areaNode = new Map(catalog.nodes.filter((n) => n.level === "area").map((n) => [n.area_code, n.id]));
  const blocks = (await svc<Block[]>(ctx, "ch_worker_blocks", { p_document_id: docId(ctx) })).filter(
    (b) => usable(b) && ["heading", "paragraph", "list", "table", "caption", "footnote"].includes(b.type)
  );
  const chunks = chunkBlocks(blocks, 6000);
  let linked = 0;
  let suggested = 0;
  for (let i = ctx.job.checkpoint?.chunk ?? 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const payload = {
      catalogo: catalog.nodes.map((n) => ({ id: n.id, level: n.level, path: n.path, area_code: n.area_code })),
      trechos: chunk.map((b, k) => ({ idx: k, page: b.page_no, type: b.type, text: (b.text ?? "").slice(0, 2500) })),
    };
    const { output } = await ai<any>(ctx, "classify", payload, (o) => [
      ...o.node_ids.filter((id: string) => !nodes.has(id)).map((id: string) => ({ where: "node_ids", reason: `id fora do catálogo: ${id}` })),
      ...o.suggestions.filter((s: any) => !nodes.has(s.parent_id)).map((s: any) => ({ where: "suggestions", reason: `nó pai fora do catálogo: ${s.parent_id}` })),
    ]);
    const ids = [...new Set([...output.node_ids.filter((id: string) => nodes.has(id)), ...output.area_codes.map((c: string) => areaNode.get(c)).filter(Boolean)])];
    if (ids.length) linked += await svc<number>(ctx, "ch_worker_classify_blocks", { p_block_ids: chunk.map((b) => b.id), p_node_ids: ids });
    for (const s of output.suggestions.filter((x: any) => nodes.has(x.parent_id))) {
      try {
        if (await svc(ctx, "ch_worker_suggest_node", { p_parent: s.parent_id, p_name: s.name })) suggested++;
      } catch {
        ctx.metrics.rejections++;
      }
    }
    await checkpoint(ctx, { chunk: i + 1 });
  }
  Object.assign(ctx.metrics, { chunks: chunks.length, links: linked, suggested_nodes: suggested });
  return "claims";
}

async function stepClaims(ctx: Ctx): Promise<Step | null> {
  const all = await svc<Block[]>(ctx, "ch_worker_blocks", { p_document_id: docId(ctx) });
  const themes = await svc<Record<string, { id: string; level: string }[]>>(ctx, "ch_worker_block_themes", { p_document_id: docId(ctx) });
  // tema do bloco; sem tema próprio, herda o do bloco anterior (mesma seção)
  const themeOf = new Map<string, string | null>();
  let previous: string | null = null;
  for (const b of all) {
    // o mais específico (subtema) primeiro; ordem estável para o reprocessamento dar o mesmo resultado
    const own = [...(themes[b.id] ?? [])].sort((x, y) => (x.level === y.level ? x.id.localeCompare(y.id) : x.level === "subtheme" ? -1 : 1));
    const pick = own[0];
    if (pick) previous = pick.id;
    if (b.type === "heading" && !pick) previous = null;
    themeOf.set(b.id, pick?.id ?? previous);
  }
  const blocks = all.filter((b) => usable(b) && ["paragraph", "list", "table", "caption"].includes(b.type));
  const chunks = chunkBlocks(blocks, 5000);
  let created = 0;
  for (let i = ctx.job.checkpoint?.chunk ?? 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const payload = { trechos: chunk.map((b, k) => ({ block_idx: k, page: b.page_no, type: b.type, text: b.text })) };
    const { output } = await ai<any>(ctx, "claims", payload, (o) =>
      o.claims.flatMap((c: any, k: number) => {
        const b = chunk[c.block_idx];
        if (!b) return [{ where: `claims[${k}]`, reason: "bloco inexistente" }];
        if (!isVerbatim(c.quote, b.text ?? "")) return [{ where: `claims[${k}]`, reason: "a citação não é cópia literal do bloco (palavras, números ou negações diferentes)" }];
        return [];
      })
    );
    for (const c of output.claims) {
      const b = chunk[c.block_idx];
      if (!b || !isVerbatim(c.quote, b.text ?? "")) continue;
      const statement = normalize(c.quote);
      const added = softwareCriticalKinds(statement).filter((k) => !c.critical_kinds.includes(k));
      await svc(ctx, "ch_worker_add_claim", {
        p_claim: {
          document_id: docId(ctx),
          block_id: b.id,
          theme_node_id: themeOf.get(b.id) ?? null,
          statement,
          critical_kinds: [...new Set([...c.critical_kinds, ...added])].filter((k) => CRITICAL_KINDS.includes(k)),
          context: {
            population: c.population || null,
            care_setting: c.care_setting || null,
            conditions: c.conditions || null,
            page: b.page_no,
            numbers: numbers(statement),
            negations: negations(statement),
            critical_kinds_added_by_rule: added,
          },
          model: ctx.deps.ai.provider?.model,
        },
      });
      created++;
    }
    await checkpoint(ctx, { chunk: i + 1 });
  }
  Object.assign(ctx.metrics, { chunks: chunks.length, claims: created, blocks_without_theme: blocks.filter((b) => !themeOf.get(b.id)).length });
  return "evidence";
}

async function stepEvidence(ctx: Ctx): Promise<Step | null> {
  await setMeta(ctx, { status: "verifying_sources" });
  const claims = (await svc<any[]>(ctx, "ch_worker_claims", { p_document_id: docId(ctx) })).filter((c) => c.status === "extracted");
  const counts: Record<string, number> = {};
  for (const c of claims) {
    const text = c.proposed_text ?? c.statement;
    const passages = await svc<any[]>(ctx, "ch_worker_search_passages", { p_query: searchQuery(text), p_limit: 6 });
    if (!passages.length) {
      await svc(ctx, "ch_worker_mark_claim", {
        p_claim_id: c.id,
        p_status: "insufficient",
        p_note: "Nenhum trecho das fontes cadastradas trata desta afirmação (busca por palavras). Cadastre a fonte oficial completa ou vincule a evidência manualmente.",
      });
      counts.no_passage = (counts.no_passage ?? 0) + 1;
      continue;
    }
    const byId = new Map(passages.map((p) => [p.passage_id, p]));
    const payload = {
      afirmacao: { text, context: c.context },
      trechos: passages.map((p) => ({ passage_id: p.passage_id, source: p.source, organ: p.organ, version: p.version, section: p.section, page: p.page, text: String(p.text).slice(0, 2500) })),
    };
    const { output, rejections } = await ai<any>(ctx, "evidence", payload, (o) => {
      const p = byId.get(o.passage_id);
      if (!p) return [{ where: "passage_id", reason: "trecho fora da lista fornecida" }];
      if (!isVerbatim(o.quote, p.text)) return [{ where: "quote", reason: "a citação não é cópia literal do trecho da fonte" }];
      return [];
    });
    if (rejections.length) {
      await svc(ctx, "ch_worker_mark_claim", { p_claim_id: c.id, p_status: "needs_review", p_note: `Evidência proposta recusada pela conferência: ${rejections.map((r) => r.reason).join("; ")}` });
      counts.rejected = (counts.rejected ?? 0) + 1;
      continue;
    }
    const p = byId.get(output.passage_id);
    const r = await svc<any>(ctx, "ch_worker_link_evidence", {
      p_claim_id: c.id,
      p_evidence: { source_id: p.source_id, passage_id: p.passage_id, section: p.section, page: p.page, quote: normalize(output.quote), verdict: output.verdict, model: ctx.deps.ai.provider?.model },
    });
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  }
  Object.assign(ctx.metrics, { claims_checked: claims.length, verdicts: counts });
  return "draft";
}

export interface DraftParagraph {
  text: string;
  clinical: boolean;
  claim_ids: string[];
}

const foldTerm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Conferência do rascunho: remove o que não se sustenta e devolve o motivo de cada remoção. */
export function checkDraft(
  sections: { heading: string; paragraphs: DraftParagraph[] }[],
  base: Map<string, string>,
  opts: { originalText?: string; independent: boolean; forbiddenTerms?: string[] }
) {
  const flags: { severity: string; kind: string; where: string; detail: string; removed_text: string; by: string }[] = [];
  const kept = sections
    .map((s) => ({
      heading: s.heading,
      paragraphs: s.paragraphs.filter((p, i) => {
        const where = `${s.heading} §${i + 1}`;
        const drop = (kind: string, detail: string) => {
          flags.push({ severity: "critical", kind, where, detail, removed_text: p.text, by: "software" });
          return false;
        };
        // licença que autoriza retirar as referências: o texto novo não pode voltar a citar o licenciante
        const leak = (opts.forbiddenTerms ?? []).find((t) => t.trim().length >= 3 && foldTerm(p.text).includes(foldTerm(t)));
        if (leak) return drop("other", `menciona o licenciante (“${leak}”): as referências dele foram retiradas por licença`);
        const unknown = p.claim_ids.filter((id) => !base.has(id));
        if (unknown.length) return drop("unsupported", "cita afirmação que não faz parte da base do tema");
        const cited = p.claim_ids.map((id) => base.get(id)!);
        if (p.clinical && !cited.length) return drop("unsupported", "parágrafo clínico sem afirmação citada");
        const extra = numbersOutside(p.text, cited);
        if (extra.length) return drop("number_mismatch", `número/unidade sem sustentação nas afirmações citadas: ${extra.join(", ")}`);
        const lost = negationsLost(p.text, cited);
        if (lost.length) return drop("missing_condition", `condição/negação da base ausente no texto: ${lost.join(", ")}`);
        if (opts.independent && opts.originalText && p.text.split(/\s+/).length >= 12 && copyRatio(p.text, opts.originalText) > 0.5) {
          return drop("other", "texto copiado do original em criação independente (sem licença de adaptação)");
        }
        return true;
      }),
    }))
    .filter((s) => s.paragraphs.length > 0);
  return { sections: kept, flags };
}

async function stepDraft(ctx: Ctx): Promise<Step | null> {
  await setMeta(ctx, { status: "drafting" });
  const doc = await svc<any>(ctx, "ch_worker_document", { p_document_id: docId(ctx) });
  const catalog = await svc<{ nodes: { id: string; path: string }[] }>(ctx, "ch_worker_catalog");
  const pathOf = new Map(catalog.nodes.map((n) => [n.id, n.path]));
  const claims = await svc<any[]>(ctx, "ch_worker_claims", { p_document_id: docId(ctx) });
  const blocks = await svc<Block[]>(ctx, "ch_worker_blocks", { p_document_id: docId(ctx) });
  const originalText = blocks.map((b) => b.original_text ?? "").join("\n");
  // adaptação só vale com direitos próprios/licenciados; havendo licença registrada, ela precisa estar ativa, dentro do prazo e autorizar adaptar
  const license = await svc<{ expired: boolean; allows_adaptation: boolean; allows_attribution_removal: boolean; reference_terms: string[] } | null>(ctx, "ch_worker_license", { p_document_id: docId(ctx) });
  const adaptation = ["own", "licensed_adaptation"].includes(doc.rights_status) && (!license || (!license.expired && license.allows_adaptation));
  const forbiddenTerms = license?.allows_attribution_removal && adaptation ? license.reference_terms : [];

  const byTheme = new Map<string, any[]>();
  for (const c of claims) if (c.theme_node_id) byTheme.set(c.theme_node_id, [...(byTheme.get(c.theme_node_id) ?? []), c]);
  const themes = [...byTheme.keys()].sort();
  let drafts = 0;
  let removed = 0;
  for (let i = ctx.job.checkpoint?.theme ?? 0; i < themes.length; i++) {
    const theme = themes[i];
    const all = byTheme.get(theme)!;
    const ready = all.filter((c) => c.status === "compatible");
    if (ready.length) {
      const base = new Map(ready.map((c) => [c.id, c.proposed_text ?? c.statement]));
      const payload = { tema: pathOf.get(theme) ?? "", afirmacoes: ready.map((c) => ({ id: c.id, text: base.get(c.id), context: c.context })) };
      const { output } = await ai<any>(ctx, "draft", payload);
      const checked = checkDraft(output.sections, base, { originalText, independent: !adaptation, forbiddenTerms });
      removed += checked.flags.length;
      if (checked.sections.some((s) => s.paragraphs.some((p) => p.clinical))) {
        const scope =
          `Rascunho a partir de ${ready.length} de ${all.length} afirmações deste tema no documento "${doc.name}"; ` +
          `as demais aguardam evidência ou revisão. Não representa a transformação integral do documento.`;
        const saved = await svc<{ version_id: string }>(ctx, "ch_worker_save_draft", {
          p_theme_node_id: theme,
          p_title: output.title,
          p_content: { sections: checked.sections },
          p_origin: adaptation ? "adaptation" : "independent",
          p_model: ctx.deps.ai.provider?.model,
          p_scope_note: scope,
        });
        await svc(ctx, "ch_worker_review_flags", { p_version_id: saved.version_id, p_flags: checked.flags });
        drafts++;
      }
    }
    await checkpoint(ctx, { theme: i + 1 });
  }
  Object.assign(ctx.metrics, { themes: themes.length, drafts, paragraphs_removed: removed, claims_without_theme: claims.filter((c) => !c.theme_node_id).length });
  return "materials";
}

function claimIdsOf(content: unknown): string[] {
  const ids = new Set<string>();
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) k === "claim_ids" && Array.isArray(x) ? x.forEach((id) => ids.add(String(id))) : walk(x);
  };
  walk(content);
  return [...ids];
}

/** Referências da aula: fontes das evidências compatíveis (com página e versão). */
export function lessonReferences(claims: any[]) {
  const seen = new Map<string, any>();
  for (const c of claims)
    for (const e of c.evidence ?? [])
      if (e.verdict === "compatible") {
        const key = `${e.source_id}|${e.version ?? ""}|${e.page ?? ""}`;
        if (!seen.has(key))
          seen.set(key, { source: e.source, organ: e.organ, version: e.version, published_on: e.published_on, url: e.url, section: e.section, page: e.page, simulated: e.simulated || undefined });
      }
  return [...seen.values()];
}

async function stepMaterials(ctx: Ctx): Promise<Step | null> {
  await setMeta(ctx, { status: "drafting" });
  const versions = await targetVersions(ctx);
  const model = ctx.deps.ai.provider?.model ?? null;
  const counts: Record<string, number> = {};
  const save = async (version: string, kind: string, content: unknown, byModel: string | null) => {
    await svc(ctx, "ch_worker_save_material", { p_version_id: version, p_kind: kind, p_content: content, p_model: byModel, p_template: MATERIALS_TEMPLATE });
    counts[kind] = (counts[kind] ?? 0) + 1;
  };
  for (let i = ctx.job.checkpoint?.version ?? 0; i < versions.length; i++) {
    const v = versions[i];
    const ids = claimIdsOf(v.content);
    const claims = await svc<any[]>(ctx, "ch_worker_claims_by_ids", { p_ids: ids });
    const base = new Map(claims.map((c) => [c.id, c.proposed_text ?? c.statement]));
    const cited = (list: string[]) => list.filter((id) => base.has(id)).map((id) => base.get(id)!);
    const supported = (text: string, list: string[]) => list.length > 0 && list.every((id) => base.has(id)) && !numbersOutside(text, cited(list)).length && !negationsLost(text, cited(list)).length;
    const payload = { tema: v.title, afirmacoes: claims.map((c) => ({ id: c.id, text: base.get(c.id), context: c.context })) };

    // aula: montada por software a partir da base revisada (sem texto novo)
    await save(v.version_id, "lesson", { title: v.title, sections: v.content.sections, references: lessonReferences(claims), scope_note: v.scope_note, label: "Material StaziaMed" }, null);

    const summary = await ai<any>(ctx, "summary", payload, (o) =>
      o.items.flatMap((it: any, k: number) => (supported(it.text, it.claim_ids) ? [] : [{ where: `items[${k}]`, reason: "tópico sem sustentação exata (afirmação, número ou condição)" }]))
    );
    const items = summary.output.items.filter((it: any) => supported(it.text, it.claim_ids));
    if (items.length) {
      await save(v.version_id, "summary", { title: v.title, items }, model);
      await save(v.version_id, "visual_cards", { title: v.title, cards: items.map((it: any) => ({ text: it.text, claim_ids: it.claim_ids })), label: "Card StaziaMed" }, model);
    }

    const cards = await ai<any>(ctx, "flashcards", payload, (o) =>
      o.cards.flatMap((c: any, k: number) => {
        const p = flashcardProblems(c);
        if (p.length) return [{ where: `cards[${k}]`, reason: p.join("; ") }];
        return supported(`${c.front} ${c.back}`, c.claim_ids) ? [] : [{ where: `cards[${k}]`, reason: "cartão sem sustentação exata (afirmação, número ou condição)" }];
      })
    );
    const deck = cards.output.cards.filter((c: any) => !flashcardProblems(c).length && supported(`${c.front} ${c.back}`, c.claim_ids));
    if (deck.length) await save(v.version_id, "flashcards", { title: v.title, cards: deck }, model);

    const qs = await ai<any>(ctx, "questions", payload, (o) =>
      o.items.flatMap((q: any, k: number) => {
        const text = [q.stem, ...q.options.map((x: any) => x.text), ...q.comments.map((x: any) => x.text)].join(" ");
        const okIds = q.claim_ids.length > 0 && q.claim_ids.every((id: string) => base.has(id));
        const extra = okIds ? numbersOutside(text, cited(q.claim_ids)) : [];
        const letters = new Set(q.options.map((x: any) => x.id));
        if (!okIds) return [{ where: `items[${k}]`, reason: "cita afirmação fora da base" }];
        if (extra.length) return [{ where: `items[${k}]`, reason: `número sem sustentação: ${extra.join(", ")}` }];
        if (letters.size !== 4) return [{ where: `items[${k}]`, reason: "alternativas repetidas" }];
        return [];
      })
    );
    const rejectedQ = new Set(qs.rejections.map((r) => r.where));
    const questions = qs.output.items
      .filter((_: any, k: number) => !rejectedQ.has(`items[${k}]`))
      .map((q: any) => ({ ...q, author: "StaziaMed", official: false, label: "Questão inédita StaziaMed (não é questão oficial do Inep)" }));
    if (questions.length) await save(v.version_id, "questions", { title: v.title, items: questions }, model);

    await checkpoint(ctx, { version: i + 1 });
  }
  Object.assign(ctx.metrics, { versions: versions.length, materials: counts });
  return "render";
}

async function stepRender(ctx: Ctx): Promise<Step | null> {
  const renderer = ctx.deps.renderer;
  if (!renderer) throw new Blocked("Renderizador de PDF indisponível no servidor (Playwright/Chromium).");
  const versions = await targetVersions(ctx);
  let rendered = 0;
  let failed = 0;
  for (const v of versions) {
    const materials = (await svc<any[]>(ctx, "ch_worker_materials", { p_version_id: v.version_id })).filter((m) => m.kind === "lesson" || m.kind === "visual_cards");
    for (const m of materials) {
      const out = await renderer.render(m.kind, m.content, { title: v.title, version: v.version, revisedAt: v.created_at, contentHash: m.content_hash });
      for (const file of out) {
        const key = `renders/${m.id}/${m.content_hash.slice(0, 16)}.${file.format}`;
        await ctx.deps.storage.put(key, file.data, file.contentType);
        await svc(ctx, "ch_worker_save_render", {
          p_render: { material_id: m.id, format: file.format, storage_path: key, sha256: sha256(file.data), template_version: renderer.templateVersion, brand_version: renderer.brandVersion, material_hash: m.content_hash, check_result: file.check },
        });
        rendered++;
        if (!file.check.ok) failed++;
      }
    }
  }
  Object.assign(ctx.metrics, { files: rendered, failed_checks: failed });
  return "review_check";
}

async function stepReviewCheck(ctx: Ctx): Promise<Step | null> {
  const versions = await targetVersions(ctx);
  let issues = 0;
  for (let i = ctx.job.checkpoint?.version ?? 0; i < versions.length; i++) {
    const v = versions[i];
    const claims = await svc<any[]>(ctx, "ch_worker_claims_by_ids", { p_ids: claimIdsOf(v.content) });
    const payload = {
      texto: v.content.sections,
      afirmacoes: claims.map((c) => ({ id: c.id, text: c.proposed_text ?? c.statement, context: c.context, evidencias: (c.evidence ?? []).map((e: any) => ({ verdict: e.verdict, quote: e.quote, source: e.source, page: e.page })) })),
    };
    const { output } = await ai<any>(ctx, "review", payload);
    const kept = (v.review_flags ?? []).filter((f: any) => f.by !== "ai_review");
    const found = output.issues.map((x: any) => ({ ...x, by: "ai_review", model: ctx.deps.ai.provider?.model }));
    issues += found.length;
    await svc(ctx, "ch_worker_review_flags", { p_version_id: v.version_id, p_flags: [...kept, ...found] });
    await checkpoint(ctx, { version: i + 1 });
  }
  await setMeta(ctx, { status: "awaiting_review" });
  Object.assign(ctx.metrics, { versions: versions.length, review_issues: issues });
  return null;
}

/** Material visual (cards, A4, story e flashcards da Central): gera e confere os arquivos de uma versão (visual/service.ts). */
async function stepVisualRender(ctx: Ctx): Promise<Step | null> {
  try {
    const r = await generateVisualVersion(ctx.deps, visualVersionOf(ctx.job));
    Object.assign(ctx.metrics, { files: r.files, failed_checks: r.check.ok ? 0 : r.check.problems.length });
  } catch (error) {
    // sem gerador neste processamento: espera sem gastar tentativa (como as outras etapas)
    if (error instanceof VisualRenderUnavailable) throw new Blocked(error.message);
    throw error;
  }
  return null;
}

const STEPS: Record<Step, (ctx: Ctx) => Promise<Step | null>> = {
  extract: stepExtract,
  source_index: stepSourceIndex,
  classify: stepClassify,
  claims: stepClaims,
  evidence: stepEvidence,
  draft: stepDraft,
  materials: stepMaterials,
  render: stepRender,
  review_check: stepReviewCheck,
  visual_render: stepVisualRender,
};

/** Executa um trabalho já reservado (ch_worker_claim) e registra o resultado na fila. */
export async function runJob(deps: PipelineDeps, job: Job): Promise<{ status: string; next: Step | null; error?: string }> {
  const ctx: Ctx = { deps, job, metrics: { ai_calls: 0, cache_hits: 0, input_tokens: 0, output_tokens: 0, cost_usd: null, rejections: 0 } };
  const t0 = Date.now();
  try {
    const next = await STEPS[job.step](ctx);
    ctx.metrics.ms = Date.now() - t0;
    await deps.db.service("ch_worker_finish", { p_job_id: job.id, p_ok: true, p_error: null, p_metrics: ctx.metrics });
    if (next) await deps.db.service("ch_worker_next", { p_document_id: job.document_id, p_step: next, p_versions: stepVersions(next, deps), p_scope_key: job.scope_key });
    deps.log?.(`[central] ${job.step} concluído (${ctx.metrics.ms} ms)`);
    return { status: "succeeded", next };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Blocked) {
      await deps.db.service("ch_worker_block", { p_job_id: job.id, p_reason: message });
      deps.log?.(`[central] ${job.step} pendente: ${message}`);
      return { status: "blocked", next: null, error: message };
    }
    if (error instanceof Fatal) {
      await deps.db.service("ch_worker_fail", { p_job_id: job.id, p_error: message });
      deps.log?.(`[central] ${job.step} falhou: ${message}`);
      return { status: "dead", next: null, error: message };
    }
    ctx.metrics.ms = Date.now() - t0;
    const status = await deps.db.service<string>("ch_worker_finish", { p_job_id: job.id, p_ok: false, p_error: message.slice(0, 1000), p_metrics: ctx.metrics });
    deps.log?.(`[central] ${job.step} erro (${status}): ${message}`);
    return { status, next: null, error: message };
  }
}
