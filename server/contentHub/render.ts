/**
 * Arquivos finais da Central de Conteúdo: aula em PDF (A5, legível no celular) e cards em PDF
 * (4:5, um por página), gerados de HTML/CSS com a identidade do Design System StaziaMed.
 * O texto fica selecionável (nada de imagem de texto) e cada arquivo é conferido depois de
 * gerado: todo o texto do material presente, referências presentes, nenhuma página vazia e
 * nenhum card com texto cortado. Arquivo reprovado na conferência bloqueia a publicação.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { htmlInline, textoPuro } from "../../src/shared/textoRico";

const run = promisify(execFile);
const ROOT = process.cwd();

export const TEMPLATE_VERSION = "templates-1.0";

export interface RenderMeta {
  title: string;
  version: number;
  revisedAt: string;
  contentHash: string;
}

export interface RenderedFile {
  format: "pdf" | "html";
  data: Buffer;
  contentType: string;
  check: { ok: boolean; [key: string]: unknown };
}

export interface Renderer {
  templateVersion: string;
  brandVersion: string;
  render(kind: "lesson" | "visual_cards", content: any, meta: RenderMeta): Promise<RenderedFile[]>;
  /** Página nova no mesmo navegador (materiais visuais: server/contentHub/visual). Quem abre fecha. */
  newPage?(options?: { viewport?: { width: number; height: number }; deviceScaleFactor?: number }): Promise<import("playwright").Page>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------- marca
export interface Brand {
  version: string;
  logo: string | null;          // data URI
  fontFaces: string;            // @font-face com arquivos locais, quando existirem
  pending: string[];            // o que falta para a identidade ficar completa
}

/** Identidade a partir do Design System StaziaMed (cores e tipografia dos tokens; logo em public/novo-assets). */
export function loadBrand(): Brand {
  const pending: string[] = [];
  const logoPath = path.join(ROOT, "public/brand/horizontal-480w.png");
  const logo = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}` : null;
  if (!logo) pending.push("Logo horizontal não encontrado em public/brand/horizontal-480w.png.");
  // Plus Jakarta Sans (licença SIL OFL, em server/contentHub/fonts); CONTENT_HUB_FONT_DIR troca a pasta
  const fontDir = process.env.CONTENT_HUB_FONT_DIR || path.join(ROOT, "server/contentHub/fonts");
  let fontFaces = "";
  const files = fontDir && fs.existsSync(fontDir) ? fs.readdirSync(fontDir).filter((f) => /PlusJakartaSans.*\.(ttf|woff2?)$/i.test(f)) : [];
  for (const f of files) {
    const weight = /ExtraBold/i.test(f) ? 800 : /SemiBold/i.test(f) ? 600 : /Bold/i.test(f) ? 700 : /Medium/i.test(f) ? 500 : 400;
    const style = /Italic/i.test(f) ? "italic" : "normal";
    const type = f.endsWith(".ttf") ? "truetype" : f.endsWith(".woff2") ? "woff2" : "woff";
    const data = fs.readFileSync(path.join(fontDir!, f)).toString("base64");
    fontFaces += `@font-face{font-family:'Plus Jakarta Sans';font-weight:${weight};font-style:${style};src:url(data:font/${type};base64,${data}) format('${type}')}`;
  }
  if (!files.length) {
    pending.push("Fonte Plus Jakarta Sans (tipografia do Design System) não instalada no servidor: os PDFs usam a fonte sem serifa do sistema. Coloque os arquivos .ttf/.woff2 em CONTENT_HUB_FONT_DIR.");
  }
  return { version: `brand-1.0${files.length ? "+font" : ""}${logo ? "" : "-nologo"}`, logo, fontFaces, pending };
}

// Tokens do Design System (src/novo/ds/tokens) usados nos impressos.
const CSS_TOKENS = `
:root{--navy-900:#0D1C42;--teal-700:#0B6F68;--teal-50:#EEFBF9;--teal-500:#12A79B;--gray-600:#4F5A69;--gray-500:#687586;--gray-200:#DCE1E8;--gray-50:#F4F6F9;
--amber-50:#FEF5E3;--amber-700:#9A5B06;--font-sans:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;
--brand-gradient:linear-gradient(160deg,#12B5AA 0%,#1E4F96 100%)}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:var(--font-sans);color:var(--navy-900);hyphens:manual;overflow-wrap:break-word}
`;

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const dateBr = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

export function referenceLine(r: any): string {
  return [r.source, r.organ, r.version && `versão ${r.version}`, r.published_on && `publicado em ${dateBr(r.published_on)}`, r.section && `seção ${r.section}`, r.page != null && `p. ${r.page}`, r.url]
    .filter(Boolean)
    .join(" · ") + (r.simulated ? " [evidência simulada — desenvolvimento]" : "");
}

export function lessonHtml(content: any, meta: RenderMeta, brand: Brand): string {
  const sections = (content.sections ?? [])
    .map((s: any) => `<section><h2>${esc(s.heading)}</h2>${(s.paragraphs ?? []).map((p: any) => `<p>${htmlInline(p.text)}</p>`).join("")}</section>`)
    .join("");
  const refs = (content.references ?? []).map((r: any) => `<li>${esc(referenceLine(r))}</li>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(content.title ?? meta.title)}</title><style>${brand.fontFaces}${CSS_TOKENS}
@page{size:A5;margin:16mm 13mm 18mm}
body{font-size:11pt;line-height:1.55}
header{border-bottom:2px solid var(--teal-500);padding-bottom:10px;margin-bottom:14px}
header img{height:34px;width:auto;display:block;margin-bottom:10px}
.overline{font-size:8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--teal-700)}
h1{font-size:18pt;line-height:1.2;margin:4px 0 6px;font-weight:800}
.meta{font-size:8.5pt;color:var(--gray-600)}
.scope{background:var(--amber-50);color:var(--amber-700);border-radius:8px;padding:8px 10px;font-size:8.5pt;margin-top:8px}
h2{font-size:12.5pt;margin:16px 0 6px;color:var(--teal-700);break-after:avoid}
p{margin:0 0 8px}
.refs{margin-top:18px;border-top:1px solid var(--gray-200);padding-top:8px}
.refs h2{color:var(--navy-900)}
.refs li{font-size:8.5pt;color:var(--gray-600);margin-bottom:4px}
</style></head><body>
<header>${brand.logo ? `<img src="${brand.logo}" alt="StaziaMed Revalida">` : ""}<div class="overline">Aula StaziaMed</div><h1>${esc(content.title ?? meta.title)}</h1>
<div class="meta">${esc(content.label ?? "Material StaziaMed")} · conteúdo original, não é material oficial do Inep · versão ${meta.version} de ${esc(dateBr(meta.revisedAt))}</div>
${content.scope_note ? `<div class="scope">${esc(content.scope_note)}</div>` : ""}</header>
${sections}
<div class="refs"><h2>Referências</h2>${refs ? `<ol>${refs}</ol>` : "<p>Sem referência compatível registrada.</p>"}</div>
</body></html>`;
}

export function cardsHtml(content: any, meta: RenderMeta, brand: Brand): string {
  const cards = content.cards ?? [];
  const pages = cards
    .map(
      (c: any, i: number) => `<article class="card"><div class="top">${brand.logo ? `<img src="${brand.logo}" alt="StaziaMed Revalida">` : ""}<span>${esc(content.title ?? meta.title)}</span></div>
<div class="body" data-card="${i}"><p>${esc(c.text)}</p></div>
<div class="foot">${esc(content.label ?? "Card StaziaMed")} · versão ${meta.version} de ${esc(dateBr(meta.revisedAt))} · ${i + 1}/${cards.length}</div></article>`
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(content.title ?? meta.title)}</title><style>${brand.fontFaces}${CSS_TOKENS}
@page{size:108mm 135mm;margin:0}
.card{width:108mm;height:135mm;padding:9mm 8mm;display:flex;flex-direction:column;break-after:page;background:#fff;border-top:3mm solid var(--teal-500)}
.top{display:flex;flex-direction:column;gap:4mm;font-size:9pt;font-weight:700;color:var(--teal-700);text-transform:uppercase;letter-spacing:.06em}
.top img{height:28px;width:auto;align-self:flex-start}
.body{flex:1;display:flex;align-items:center;overflow:hidden}
.body p{font-size:15pt;line-height:1.4;font-weight:600;margin:0}
.foot{font-size:7.5pt;color:var(--gray-600);border-top:1px solid var(--gray-200);padding-top:3mm}
</style></head><body>${pages}</body></html>`;
}

/** Textos que precisam aparecer no arquivo final. */
export function expectedTexts(kind: "lesson" | "visual_cards", content: any): { texts: string[]; references: string[] } {
  if (kind === "lesson") {
    return {
      texts: [content.title, ...(content.sections ?? []).flatMap((s: any) => [s.heading, ...(s.paragraphs ?? []).map((p: any) => textoPuro(p.text, "linha"))])].filter(Boolean),
      references: (content.references ?? []).map(referenceLine),
    };
  }
  return { texts: (content.cards ?? []).map((c: any) => c.text), references: [] };
}

const squash = (s: string) => String(s ?? "").normalize("NFKC").replace(/­/g, "").replace(/\s+/g, "");

/** Compara o texto extraído do PDF com o que o material contém. */
const FOOTER_LINES = [/^StaziaMed · /, /^página \d+ de \d+$/];

export function comparePdfText(extracted: { pages: number; page_texts: string[]; empty_pages: number[] }, expected: { texts: string[]; references: string[] }, kind: string) {
  // o rodapé de cada página não pode partir um parágrafo que continua na página seguinte
  const body = extracted.page_texts.map((t) => t.split("\n").filter((line) => !FOOTER_LINES.some((r) => r.test(line.trim()))).join("\n"));
  const all = squash(body.join("\n"));
  const missingTexts = expected.texts.filter((t) => !all.includes(squash(t)));
  const missingReferences = expected.references.filter((r) => !all.includes(squash(r)));
  const noReferences = kind === "lesson" && expected.references.length === 0;
  return {
    ok: extracted.pages > 0 && !missingTexts.length && !missingReferences.length && !extracted.empty_pages.length && !noReferences && expected.texts.length > 0,
    pages: extracted.pages,
    empty_pages: extracted.empty_pages,
    missing_texts: missingTexts.slice(0, 10),
    missing_references: missingReferences.slice(0, 10),
    no_references: noReferences || undefined,
    checked_texts: expected.texts.length,
    checked_references: expected.references.length,
  };
}

async function extractPdf(pdf: Buffer, python: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ch-render-"));
  try {
    const file = path.join(dir, "out.pdf");
    fs.writeFileSync(file, pdf);
    const { stdout } = await run(python, [path.join(ROOT, "scripts/content-hub/check_render.py"), file], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
    return JSON.parse(stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Renderizador com Chromium (Playwright). Devolve null se o navegador não estiver instalado. */
export async function createRenderer(opts: { python?: string } = {}): Promise<Renderer | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    chromium = (await import("playwright")).chromium;
    if (!fs.existsSync(chromium.executablePath())) return null;
  } catch {
    return null;
  }
  const python = opts.python ?? process.env.CONTENT_HUB_PYTHON ?? "pdfpython";
  const brand = loadBrand();
  let browser: import("playwright").Browser | null = null;
  const page = async (options?: { viewport?: { width: number; height: number }; deviceScaleFactor?: number }) => {
    browser ??= await chromium.launch();
    return browser.newPage(options);
  };

  return {
    templateVersion: TEMPLATE_VERSION,
    brandVersion: brand.version,
    newPage: page,
    async render(kind, content, meta) {
      const html = kind === "lesson" ? lessonHtml(content, meta, brand) : cardsHtml(content, meta, brand);
      const p = await page();
      try {
        await p.setContent(html, { waitUntil: "load" });
        // texto que não coube no card (cortado) é falha de conferência
        const overflow: number[] = kind === "visual_cards" ? await p.$$eval(".body", (els) => els.map((e, i) => (e.scrollHeight > e.clientHeight + 1 ? i + 1 : 0)).filter(Boolean)) : [];
        const pdf =
          kind === "lesson"
            ? await p.pdf({
                format: "A5",
                printBackground: true,
                displayHeaderFooter: true,
                headerTemplate: "<span></span>",
                footerTemplate: `<div style="font-size:7px;color:#687586;width:100%;padding:0 13mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>StaziaMed · ${esc(meta.title).slice(0, 60)} · versão ${meta.version} de ${esc(dateBr(meta.revisedAt))}</span><span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
                margin: { top: "16mm", bottom: "18mm", left: "13mm", right: "13mm" },
              })
            : await p.pdf({ width: "108mm", height: "135mm", printBackground: true, preferCSSPageSize: true });
        let check: RenderedFile["check"];
        try {
          check = comparePdfText(await extractPdf(Buffer.from(pdf), python), expectedTexts(kind, content), kind);
        } catch (error) {
          check = { ok: false, reason: `Conferência do PDF indisponível: ${(error as Error).message.slice(0, 200)}` };
        }
        if (overflow.length) check = { ...check, ok: false, cut_cards: overflow };
        check = { ...check, brand_pending: brand.pending };
        return [
          { format: "pdf", data: Buffer.from(pdf), contentType: "application/pdf", check },
          { format: "html", data: Buffer.from(html, "utf8"), contentType: "text/html; charset=utf-8", check: { ok: true, by: "source", brand_pending: brand.pending } },
        ];
      } finally {
        await p.close();
      }
    },
    async close() {
      await browser?.close();
      browser = null;
    },
  };
}
