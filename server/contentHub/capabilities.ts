/**
 * O que o processamento da Central tem pronto onde ele roda (tarefa no Google Cloud Run ou servidor de desenvolvimento):
 * gerador de PDF (Chromium), leitor de PDF (Python com PyMuPDF), OCR (Tesseract em português), logo e fonte do Design
 * System. O relato vai para o banco (ch_worker_report) e é o que o painel mostra: o servidor do site (Vercel) não
 * processa, então testar a si mesmo daria pendências falsas.
 *
 * IA: as etapas usam a Central de IAs (maestro), não a variável antiga CONTENT_HUB_AI_PROVIDER. O relato confere as funções que o
 * processamento usa (Criação e Verificação) com as chaves DESTE ambiente, do mesmo jeito que as etapas, sem chamar IA nenhuma
 * (falha vista em produção, 2026-10-09: a tarefa registrava "IA não configurada" com a IA da Central funcionando).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { loadBrand } from "./render";
import type { PipelineDeps } from "./pipeline";
import { embeddingsConfig } from "./embeddings";
import { aiAllowed } from "./ai/registry";
import { maestroCheckerProvider, maestroProvider } from "../ai/maestro";
import type { AiFunctionKey } from "../ai/config";

const run = promisify(execFile);

export interface ProcessingReport {
  where: "cloud_run" | "servidor";
  renderer: boolean;
  python: boolean;
  ocr_languages: string[];
  brand: { version: string; pending: string[] };
  /**
   * IA do processamento. `source: "central"` marca o formato novo (Central de IAs); relatos antigos, sem ele, olhavam a variável
   * CONTENT_HUB_AI_PROVIDER e o painel continua escondendo a pendência deles.
   */
  ai: { ready: boolean; source?: "central"; provider?: string | null; functions?: Record<string, AiFunctionReport>; pending?: string | null };
  /** Busca por significado: o processamento gera os vetores dos trechos das fontes. */
  embeddings: { ready: boolean; model: string | null; pending: string | null };
  pending: string[];
  checked_at: string;
}

export interface AiFunctionReport {
  ready: boolean;
  provider: string | null;
  model: string | null;
}

/** As funções da Central de IAs que o processamento usa, na ordem das etapas. */
const PROCESSING_FUNCTIONS: { key: AiFunctionKey; label: string }[] = [
  { key: "criacao", label: "Criação" },
  { key: "verificacao", label: "Verificação" },
];
const AI_PREFIX = "IA do processamento";

/**
 * Situação da IA do processamento pela Central de IAs, como as etapas a escolhem (pipeline.ts): Criação pelo maestroProvider e
 * Verificação pela IA de outra empresa que confere o texto da Criação. Só leitura: nada é chamado nem gravado em ai_calls.
 * Simulação (desenvolvimento): pronta.
 */
export async function processingAi(deps: PipelineDeps): Promise<{ ai: ProcessingReport["ai"]; pending: string[] }> {
  if (deps.ai.provider?.isMock) {
    return { ai: { ready: true, source: "central", provider: deps.ai.provider.name, functions: {}, pending: null }, pending: [] };
  }
  const pending: string[] = [];
  const functions: Record<string, AiFunctionReport> = {};
  try {
    const maestroDeps = { db: deps.db, makeProviderFor: deps.aiMaker };
    const origin = { source: "central" as const, itemId: null };
    let writer: string | null = null;
    for (const f of PROCESSING_FUNCTIONS) {
      const { provider, status } =
        f.key === "verificacao" ? await maestroCheckerProvider(maestroDeps, f.key, writer, origin) : await maestroProvider(maestroDeps, f.key, origin);
      functions[f.key] = { ready: Boolean(provider), provider: status.provider ?? null, model: status.model ?? null };
      if (f.key === "criacao" && provider) writer = status.model ?? null;
      if (!provider) pending.push(`${AI_PREFIX} (${f.label}): ${status.pending ?? "indisponível."}`);
    }
    const allowed = await aiAllowed(deps.db);
    if (!allowed.ok) pending.push(`${AI_PREFIX}: ${allowed.why}`);
  } catch (error) {
    pending.push(`${AI_PREFIX}: não foi possível ler a Central de IAs (${String((error as Error)?.message ?? error).slice(0, 200)}).`);
  }
  return { ai: { ready: pending.length === 0, source: "central", functions, pending: pending.length ? pending.join(" ") : null }, pending };
}

/** Resumo da IA para a linha de início da tarefa (log técnico): "IA: Criação pronta (modelo) · Verificação pendente". */
export function aiSummaryLine(ai: ProcessingReport["ai"]): string {
  if (ai.source !== "central") return `IA: ${ai.ready ? "pronta" : "pendente"}`;
  const fns = PROCESSING_FUNCTIONS.filter((f) => ai.functions?.[f.key]);
  if (!fns.length) return `IA: ${ai.ready ? "simulação" : "pendente"}`;
  return `IA: ${fns
    .map((f) => {
      const r = ai.functions![f.key];
      return r.ready ? `${f.label} pronta (${r.model ?? "?"})` : `${f.label} pendente`;
    })
    .join(" · ")}`;
}

export async function probeProcessing(deps: PipelineDeps): Promise<ProcessingReport> {
  const python = deps.python ?? process.env.CONTENT_HUB_PYTHON ?? "pdfpython";
  let pythonOk = false;
  try {
    await run(python, ["-c", "import fitz"], { timeout: 30_000 });
    pythonOk = true;
  } catch {
    pythonOk = false;
  }
  let langs: string[] = [];
  try {
    const { stdout, stderr } = await run("tesseract", ["--list-langs"], { timeout: 30_000 });
    langs = `${stdout}\n${stderr}`.split(/\s+/).filter((l) => /^[a-z]{3}$/.test(l));
  } catch {
    langs = [];
  }
  const brand = loadBrand();
  const emb = embeddingsConfig();
  // a busca por significado pode estar ligada e ter parado na rodada (erro de configuração do Google, ex.: 404): conta como parada
  const embProblem = deps.embedder?.problem ?? null;
  const embReady = Boolean(deps.embedder) && !embProblem;
  const ai = await processingAi(deps);
  const pending = [
    ...ai.pending,
    ...(embReady ? [] : [`Busca por significado no processamento: ${embProblem ?? emb.pending ?? "indisponível."}`]),
    ...(deps.renderer ? [] : ["Gerador de PDF (Playwright/Chromium) indisponível no processamento."]),
    ...(pythonOk ? [] : [`Leitor de PDF indisponível no processamento: "${python}" sem PyMuPDF.`]),
    ...(langs.includes("por") ? [] : ["OCR em português (Tesseract) indisponível no processamento: páginas escaneadas não são lidas."]),
    ...brand.pending,
  ];
  return {
    where: process.env.CLOUD_RUN_JOB ? "cloud_run" : "servidor",
    renderer: Boolean(deps.renderer),
    python: pythonOk,
    ocr_languages: langs,
    brand: { version: brand.version, pending: brand.pending },
    ai: ai.ai,
    embeddings: { ready: embReady, model: deps.embedder?.model ?? null, pending: embReady ? null : (embProblem ?? emb.pending) },
    pending,
    checked_at: new Date().toISOString(),
  };
}

/** Grava o relato; falhar aqui nunca impede o processamento. */
export async function reportProcessing(deps: PipelineDeps, report: ProcessingReport, extra: Record<string, unknown> = {}) {
  try {
    await deps.db.service("ch_worker_report", { p_worker: report.where, p_report: { ...report, ...extra } });
  } catch (error) {
    deps.log?.(`[central] não foi possível registrar o relato do processamento: ${(error as Error).message}`);
  }
}
