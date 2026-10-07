/**
 * Geração dos arquivos de um material visual (PNG e PDF) com o Chromium do processamento, a partir do
 * MESMO HTML da prévia do painel (src/shared/visualMaterials). Depois de gerar, confere:
 *   - no navegador: linhas, texto cortado, sobreposição, zonas seguras, fontes, caracteres fora das fontes,
 *     vermelho de alerta, especialidade escrita e o mesmo card_id nos dois lados (VISUAL_FIT_SCRIPT);
 *   - no PDF (PyMuPDF): páginas, página vazia, todo o texto da peça presente, só as fontes do modelo,
 *     fontes embutidas e, no A6, as caixas de corte e de sangria;
 *   - no PNG: tamanho exato da prancha.
 * Guias de desenvolvimento nunca entram aqui (buildVisualDocument desliga).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  A6_PRINT,
  VISUAL_FONT_FILES,
  VISUAL_MODELS,
  VISUAL_TEMPLATE_VERSION,
  buildVisualDocument,
  type VisualContent,
  type VisualSide,
} from "../../../src/shared/visualMaterials";
import type { Renderer } from "../render";

const run = promisify(execFile);
const ROOT = process.cwd();

export interface VisualFile {
  format: "png" | "pdf";
  side: VisualSide | "pair";
  data: Buffer;
  width: number;
  height: number;
  pages: number;
}

export interface VisualProblem {
  code: string;
  side?: string;
  field?: string;
  message: string;
}

export interface VisualCheck {
  ok: boolean;
  problems: VisualProblem[];
  fitted: { side: string; field: string; scale: number }[];
  pdf?: { pages: number; page_info: any[]; fonts: string[]; embedded: boolean; empty_pages: number[] };
  png?: { side: string; width: number; height: number }[];
  template_version: string;
}

export interface VisualRenderResult {
  files: VisualFile[];
  check: VisualCheck;
}

// ---------------------------------------------------------------------------- fontes
let fontCssCache: string | null = null;
export function visualFontDir() {
  return process.env.CONTENT_HUB_VISUAL_FONT_DIR || path.join(ROOT, "server/contentHub/fonts/visual");
}

/** @font-face com os arquivos embutidos (o PDF carrega as fontes dentro dele). */
export function visualFontCss(): { css: string; missing: string[] } {
  const dir = visualFontDir();
  const missing = VISUAL_FONT_FILES.filter((f) => !fs.existsSync(path.join(dir, f.file))).map((f) => f.file);
  if (missing.length) return { css: "", missing };
  fontCssCache ??= VISUAL_FONT_FILES.map(
    (f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};font-display:block;src:url(data:font/ttf;base64,${fs.readFileSync(path.join(dir, f.file)).toString("base64")}) format('truetype')}`
  ).join("");
  return { css: fontCssCache, missing: [] };
}

// ---------------------------------------------------------------------------- PDF e PNG
const PT_PER_PX = 0.75;
const A4_PT = { width: 595.28, height: 841.89 };
const A6_PT_PER_PX = ((105 / 25.4) * 72) / 1240; // 105 mm em 1240 px

function pdfSpec(c: VisualContent, sheet: { width: number; height: number }) {
  // recorte exato da área desenhada (o Chromium arredonda a altura da página para cima)
  const clip = [0, 0, sheet.width * PT_PER_PX, sheet.height * PT_PER_PX];
  if (c.model === "a4") return { physical: { width: A4_PT.width, height: A4_PT.height, clip } };
  if (c.model === "flashcard_a6") {
    const k = A6_PT_PER_PX;
    const b = A6_PRINT.bleed * k;
    return { physical: { width: sheet.width * k, height: sheet.height * k, clip, trim: [b, b, (sheet.width - A6_PRINT.bleed) * k, (sheet.height - A6_PRINT.bleed) * k] } };
  }
  return { physical: { width: clip[2], height: clip[3], clip } };
}

export const pngSize = (buf: Buffer) => (buf.subarray(1, 4).toString("latin1") === "PNG" ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null);

const squash = (s: string) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR")
    .replace(/­/g, "")
    .replace(/\s+/g, "");

export interface RenderOptions {
  /** Imagens das ilustrações (nome no depósito → data URI). */
  images?: Record<string, string>;
  python?: string;
  /** Tempo máximo esperando o encaixe e as fontes no navegador. */
  timeoutMs?: number;
}

export class VisualRenderUnavailable extends Error {}

/** Gera os arquivos do material e a conferência. Não grava nada: quem chama decide (generate.ts). */
export async function renderVisualContent(renderer: Renderer, c: VisualContent, opts: RenderOptions = {}): Promise<VisualRenderResult> {
  if (!renderer.newPage) throw new VisualRenderUnavailable("Gerador de PDF (Playwright/Chromium) sem suporte a páginas avulsas.");
  const fonts = visualFontCss();
  if (fonts.missing.length) throw new VisualRenderUnavailable(`Fontes dos modelos ausentes em ${visualFontDir()}: ${fonts.missing.join(", ")}.`);
  const python = opts.python ?? process.env.CONTENT_HUB_PYTHON ?? "pdfpython";
  const info = VISUAL_MODELS[c.model];
  const doc = buildVisualDocument(c, { fontCss: fonts.css, images: opts.images });
  const scale = c.model === "a4" ? 2 : 1; // PNG do A4 em resolução de leitura (1588 × 2246)
  const page = await renderer.newPage({ viewport: { width: doc.page.width, height: doc.page.height }, deviceScaleFactor: scale });
  const problems: VisualProblem[] = [];
  try {
    await page.setContent(doc.html, { waitUntil: "load" });
    await page.waitForFunction(() => (window as any).__visual?.done === true, null, { timeout: opts.timeoutMs ?? 60_000 });
    const report = await page.evaluate(() => (window as any).__visual);
    problems.push(...(report.problems ?? []));
    // texto de cada lado, como o navegador desenhou (é o que precisa estar no PDF)
    const sideTexts: string[] = await page.$$eval(".vm-artboard", (arts) =>
      arts.map((a) =>
        Array.from(a.querySelectorAll("[data-k]"))
          .filter((el) => !el.querySelector("[data-k]") && !(el as HTMLElement).closest("[data-guide]"))
          .map((el) => (el as HTMLElement).innerText)
          .join("\n")
      )
    );

    const files: VisualFile[] = [];
    const pngs: { side: string; width: number; height: number }[] = [];
    if (info.formats.includes("png")) {
      for (const a of doc.artboards) {
        const data = await page.locator(`.vm-artboard[data-artboard="${a.side}"]`).screenshot({ type: "png", animations: "disabled" });
        const size = pngSize(data);
        const expected = { width: a.width * scale, height: a.height * scale };
        if (!size || size.width !== expected.width || size.height !== expected.height)
          problems.push({ code: "png_size", side: a.side, message: `PNG com ${size?.width}×${size?.height} px; o modelo pede ${expected.width}×${expected.height} px.` });
        pngs.push({ side: a.side, width: size?.width ?? 0, height: size?.height ?? 0 });
        files.push({ format: "png", side: a.side, data, width: size?.width ?? 0, height: size?.height ?? 0, pages: 1 });
      }
    }

    const raw = await page.pdf({ width: `${doc.page.width}px`, height: `${doc.page.height}px`, printBackground: true, preferCSSPageSize: true });
    const spec = pdfSpec(c, doc.page);
    const meta = {
      title: `${info.label}${c.card_id ? ` · ${c.card_id}` : ""} · ${c.titulo || c.tema || c.pergunta}`.slice(0, 200),
      subject: `StaziaMed Revalida · ${c.specialty.label}`,
      keywords: [c.card_id && `card_id=${c.card_id}`, `specialty_key=${c.specialty.key}`, `order=${c.ordem}`, `model=${c.model}`, info.pair && "sides=frente,verso", info.pair && c.model === "flashcard_a6" && "duplex=long_edge"].filter(Boolean).join("; "),
    };
    const pdf = await finalizePdf(Buffer.from(raw), { ...spec, metadata: meta }, python);
    const expectedPages = doc.artboards.length;
    if (pdf.report.pages !== expectedPages) problems.push({ code: "pdf_pages", message: `PDF com ${pdf.report.pages} página(s); o modelo pede ${expectedPages}.` });
    for (const p of pdf.report.empty_pages) problems.push({ code: "pdf_empty", message: `Página ${p} do PDF está vazia.` });
    if (!pdf.report.embedded) problems.push({ code: "font", message: "Há fonte não embutida no PDF." });
    for (const f of pdf.report.foreign_fonts) problems.push({ code: "font", message: `Trecho "${f.text}" saiu na fonte ${f.font}, fora das fontes do modelo (página ${f.page}).` });
    // todo o texto que o navegador desenhou está no PDF, página por página
    sideTexts.forEach((t, i) => {
      const pageText = squash(pdf.report.page_texts[i] ?? "");
      const missing = t
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !pageText.includes(squash(l)));
      if (missing.length) problems.push({ code: "pdf_text", side: doc.artboards[i].side, message: `Texto ausente no PDF (${doc.artboards[i].side}): ${missing.slice(0, 3).join(" | ").slice(0, 200)}` });
    });
    // par: o mesmo card_id escrito nas duas páginas e nos metadados
    if (info.pair) {
      pdf.report.page_texts.forEach((t, i) => {
        if (!c.card_id || !squash(t).includes(squash(c.card_id))) problems.push({ code: "pair", side: doc.artboards[i]?.side, field: "card_id", message: `O ID do card não aparece na página ${i + 1} do PDF.` });
      });
    }
    if (c.model === "flashcard_a6") {
      for (const [i, p] of pdf.report.page_info.entries()) {
        const trimW = p.trim[2] - p.trim[0];
        const trimH = p.trim[3] - p.trim[1];
        const mm = (pt: number) => (pt / 72) * 25.4;
        if (Math.abs(mm(trimW) - 105) > 0.2 || Math.abs(mm(trimH) - 148) > 0.2) problems.push({ code: "a6_trim", message: `Página ${i + 1}: corte com ${mm(trimW).toFixed(1)} × ${mm(trimH).toFixed(1)} mm (precisa 105 × 148 mm).` });
        if (mm(p.trim[0] - p.bleed[0]) < 2.99) problems.push({ code: "a6_bleed", message: `Página ${i + 1}: sangria menor que 3 mm.` });
      }
    }
    files.push({
      format: "pdf",
      side: info.pair ? "pair" : "single",
      data: pdf.data,
      width: Math.round(pdf.report.page_info[0]?.width ?? doc.page.width * PT_PER_PX),
      height: Math.round(pdf.report.page_info[0]?.height ?? doc.page.height * PT_PER_PX),
      pages: pdf.report.pages,
    });
    return {
      files,
      check: {
        ok: problems.length === 0,
        problems,
        fitted: report.fitted ?? [],
        pdf: { pages: pdf.report.pages, page_info: pdf.report.page_info, fonts: pdf.report.fonts, embedded: pdf.report.embedded, empty_pages: pdf.report.empty_pages },
        png: pngs,
        template_version: VISUAL_TEMPLATE_VERSION,
      },
    };
  } finally {
    await page.close();
  }
}

interface PdfReport {
  pages: number;
  page_info: { width: number; height: number; trim: number[]; bleed: number[] }[];
  page_texts: string[];
  empty_pages: number[];
  fonts: string[];
  foreign_fonts: { page: number; font: string; text: string }[];
  embedded: boolean;
}

async function finalizePdf(pdf: Buffer, spec: Record<string, unknown>, python: string): Promise<{ data: Buffer; report: PdfReport }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ch-visual-"));
  try {
    const src = path.join(dir, "in.pdf");
    const dst = path.join(dir, "out.pdf");
    fs.writeFileSync(src, pdf);
    let stdout: string;
    try {
      ({ stdout } = await run(python, [path.join(ROOT, "scripts/content-hub/visual_pdf.py"), src, dst, JSON.stringify(spec)], { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 }));
    } catch (error) {
      throw new VisualRenderUnavailable(`Finalização do PDF indisponível ("${python}" com PyMuPDF): ${(error as Error).message.slice(0, 200)}`);
    }
    return { data: fs.readFileSync(dst), report: JSON.parse(stdout) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
