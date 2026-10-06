/**
 * O que o processamento da Central tem pronto onde ele roda (tarefa no Google Cloud Run ou servidor de desenvolvimento):
 * gerador de PDF (Chromium), leitor de PDF (Python com PyMuPDF), OCR (Tesseract em português), logo e fonte do Design
 * System. O relato vai para o banco (ch_worker_report) e é o que o painel mostra: o servidor do site (Vercel) não
 * processa, então testar a si mesmo daria pendências falsas.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { loadBrand } from "./render";
import type { PipelineDeps } from "./pipeline";

const run = promisify(execFile);

export interface ProcessingReport {
  where: "cloud_run" | "servidor";
  renderer: boolean;
  python: boolean;
  ocr_languages: string[];
  brand: { version: string; pending: string[] };
  ai: { ready: boolean; provider?: string; pending?: string | null };
  pending: string[];
  checked_at: string;
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
  const pending = [
    ...(deps.ai.status.ready ? [] : [`IA do processamento: ${deps.ai.status.pending}`]),
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
    ai: { ready: deps.ai.status.ready, provider: deps.ai.status.provider, pending: deps.ai.status.pending ?? null },
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
