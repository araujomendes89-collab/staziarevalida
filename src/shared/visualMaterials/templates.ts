/**
 * HTML dos materiais visuais, fiel às pranchas do pacote "StaziaMed Revalida — Modelos educacionais"
 * (feed, A4, story, flashcard digital e flashcard A6): mesmas medidas, fontes (Barlow, Barlow Condensed
 * e Caveat), cores e componentes. O mesmo HTML serve à prévia (navegador) e à geração (Chromium no
 * processamento), então o que se vê na prévia é o que sai no PDF e no PNG.
 *
 * Regras que o HTML garante:
 *   - a especialidade aparece escrita por extenso no selo (a cor nunca é o único identificador);
 *   - pegadinha e linha de alerta usam sempre o vermelho de alerta #C8102E, em qualquer especialidade;
 *   - campo vazio some da peça (nunca sai "[TÍTULO DO TEMA]" ou outro texto de exemplo);
 *   - guias de desenvolvimento (zona segura, corte, margens) só existem na prévia;
 *   - todo texto é escapado (nada do conteúdo vira HTML).
 */
import {
  A6_PRINT,
  STORY_SAFE,
  VISUAL_MODELS,
  paletteOf,
  sourceLine,
  updatedLabel,
  type IllustrationIcon,
  type TableRowKind,
  type VisualContent,
  type VisualSide,
} from "./model";
import { TEMPLATE_COLORS, VISUAL_TOKENS } from "./tokens";
import { LOGO_ASPECT, LOGO_ON_DARK, LOGO_ON_LIGHT } from "./logoData";

const NAVY = VISUAL_TOKENS.brand.neutral.navy;
const INK = VISUAL_TOKENS.brand.neutral.ink;
const ALERT = VISUAL_TOKENS.brand.alert.primary;
const ALERT_SOFT = VISUAL_TOKENS.brand.alert.soft;
const NOTE = VISUAL_TOKENS.brand.note.primary;
const { turquoiseSeal: SEAL, mistLine: LINE, navyLine: NAVY_LINE, brandMed: MED, tape: TAPE, alertIcon: ALERT_ICON } = TEMPLATE_COLORS;

const COND = "font-family:'Barlow Condensed','Arial Narrow',sans-serif";
const CAV = "font-family:'Caveat','Segoe Print',cursive";

export interface BuildOptions {
  /** @font-face das fontes dos modelos (o servidor embute os arquivos; a prévia carrega pela FontFace API). */
  fontCss?: string;
  /** Guias de desenvolvimento: só na prévia. A geração final sempre desliga. */
  guides?: boolean;
  /** Imagens das ilustrações: nome no depósito → data URI. */
  images?: Record<string, string>;
  /** Prévia de material novo: o ID do card ainda não existe. */
  preview?: boolean;
}

export interface Artboard {
  side: VisualSide;
  width: number;
  height: number;
  html: string;
}

// ---------------------------------------------------------------------------- utilidades
export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
/** Texto com as quebras de linha que a pessoa escreveu. */
const multi = (s: string) => esc(s).replace(/\n/g, "<br>");

interface Pal {
  p: string;
  s: string;
  d: string;
  c: string;
}

const svgAttrs = (size: number, stroke: string, width: number, extra = "") =>
  `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}`;

const ICONS: Record<IllustrationIcon | "tag" | "bars" | "question" | "bulb" | "book" | "flip", string> = {
  verificacao: `<circle cx="12" cy="12" r="9.5"></circle><path d="M7.5 12.5l3 3 6-6.5"></path>`,
  coracao: `<path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z"></path><path d="M3 13h4l1.5-3 2.5 5 1.5-2H21"></path>`,
  cruz: `<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M12 8v8M8 12h8"></path>`,
  comprimido: `<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"></rect><path d="M9.9 9.9l4.2 4.2"></path>`,
  cronometro: `<circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 2M9.5 2.5h5"></path>`,
  prancheta: `<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h7"></path>`,
  tag: `<path d="M3 12V4h8l10 10-8 8L3 12z"></path><circle cx="8" cy="9" r="1.4"></circle>`,
  bars: `<path d="M5 20v-5M12 20V10M19 20V4"></path>`,
  question: `<path d="M8.5 8.5a3.5 3.5 0 1 1 5.4 2.9c-1.1.7-1.9 1.5-1.9 2.8"></path>`,
  bulb: `<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"></path>`,
  book: `<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5z"></path><path d="M4 20a2 2 0 0 0 2 2h13v-4"></path>`,
  flip: `<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"></path><path d="M20 4v4h-4M4 20v-4h4"></path>`,
};
const icon = (name: keyof typeof ICONS, size: number, stroke: string, width = 2.2, style = "flex:none") => `<svg ${svgAttrs(size, stroke, width, `style="${style}"`)}>${ICONS[name]}</svg>`;
const alertTriangle = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${ALERT_ICON}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M12 3.2L22 20H2L12 3.2z"></path><path d="M12 10v4.5" fill="none"></path><circle cx="12" cy="17.2" r="0.6" fill="${INK}"></circle></svg>`;

const pal = (c: VisualContent): Pal => {
  const t = paletteOf(c.specialty.key);
  return { p: t.primary, s: t.soft, d: t.dark, c: t.contrast };
};

// ---------------------------------------------------------------------------- componentes
interface Scale {
  pill: number;
  pillPad: string;
  pillLs: number;
}

const specialtyPill = (c: VisualContent, P: Pal, s: Scale, style = "") =>
  `<div data-role="specialty" data-k="especialidade" style="${COND};font-weight:700;font-size:${s.pill}px;letter-spacing:${s.pillLs}px;text-transform:uppercase;background:${P.d};color:${P.c};padding:${s.pillPad};border-radius:999px;white-space:nowrap;${style}">${esc(c.specialty.label)}</div>`;

const sealPill = (text: string, s: Scale, k: string) =>
  text ? `<div data-k="${k}" style="background:${NAVY};color:#FFFFFF;${COND};font-weight:700;font-size:${s.pill}px;letter-spacing:${Math.min(s.pillLs, 1.5)}px;padding:${s.pillPad};border-radius:999px;white-space:nowrap;text-transform:uppercase">${esc(text)}</div>` : "";

const updatedPill = (c: VisualContent, s: Scale) => {
  const t = updatedLabel(c.atualizacao);
  return t ? `<div data-k="atualizacao" style="background:${SEAL};color:${NAVY};${COND};font-weight:700;font-size:${s.pill}px;letter-spacing:${Math.min(s.pillLs, 1.5)}px;padding:${s.pillPad};border-radius:999px;white-space:nowrap;text-transform:uppercase">${esc(t)}</div>` : "";
};

const sectionLabel = (text: string, size: number, pad: string, radius: number, rot: number, P: Pal) =>
  `<div style="align-self:flex-start;background:${P.d};color:#FFFFFF;${COND};font-style:italic;font-weight:700;font-size:${size}px;letter-spacing:${size > 30 ? 1 : 0.8}px;text-transform:uppercase;padding:${pad};border-radius:${radius}px;transform:rotate(${rot}deg)">${esc(text)}</div>`;

interface AlertScale {
  border: number;
  radius: number;
  pad: string;
  gap: number;
  icon: number;
  title: number;
  text: number;
  lh: number;
  lines: number;
}
const pegadinhaBox = (text: string, a: AlertScale, style = "") =>
  `<div data-role="alert" data-k="pegadinha" style="border:${a.border}px solid ${ALERT};border-radius:${a.radius}px;background:${ALERT_SOFT};padding:${a.pad};display:flex;gap:${a.gap}px;align-items:flex-start;${style}">${alertTriangle(a.icon)}<div style="display:flex;flex-direction:column;gap:${Math.round(a.gap / 4)}px;min-width:0"><div data-role="alert-title" style="${CAV};font-weight:700;font-size:${a.title}px;line-height:0.95;color:${ALERT}">Pegadinha de prova!</div><div data-k="pegadinha" data-lines="${a.lines}" data-fit="0.85" style="font-size:${a.text}px;line-height:${a.lh};font-weight:500;color:${INK}">${multi(text)}</div></div></div>`;

interface NoteScale {
  radius: number;
  pad: string;
  rot: number;
  shadow: string;
  tape: [number, number, number, number]; // top, width, height, rot
  title: number;
  text: number;
  lines: number;
}
const tomeNota = (text: string, n: NoteScale, style = "") =>
  `<div data-k="tome_nota" style="position:relative;background:${NOTE};border-radius:${n.radius}px;padding:${n.pad};transform:rotate(${n.rot}deg);box-shadow:${n.shadow};display:flex;flex-direction:column;gap:4px;${style}"><div style="position:absolute;top:${n.tape[0]}px;left:50%;width:${n.tape[1]}px;height:${n.tape[2]}px;margin-left:-${n.tape[1] / 2}px;background:${TAPE};opacity:0.85;transform:rotate(${n.tape[3]}deg)"></div><div style="${CAV};font-weight:700;font-size:${n.title}px;line-height:0.95;color:${NAVY}">Tome nota!</div><div data-k="tome_nota" data-lines="${n.lines}" data-fit="0.85" style="${CAV};font-weight:600;font-size:${n.text}px;line-height:1.05;color:${INK}">${multi(text)}</div></div>`;

interface TableScale {
  radius: number;
  border: string;
  headSize: number;
  headLs: number;
  cellPad: string;
  rowSize: number;
  stripe: number;
  /** A4: 1ª linha com filete azul-marinho e demais em specialty.dark; feed/story: linhas alternadas. */
  a4: boolean;
}
function tableHtml(c: VisualContent, P: Pal, t: TableScale) {
  const tab = c.tabela!;
  const cols = tab.colunas.length === 2 ? "1.3fr 1fr" : t.a4 ? "1.3fr 1fr 1fr" : "1.2fr 1fr 1fr";
  const head = tab.colunas
    .map((h, i) => `<div style="padding:${t.cellPad};${i ? `border-left:1px solid ${NAVY_LINE};` : ""}min-width:0;overflow-wrap:anywhere">${esc(h)}</div>`)
    .join("");
  const rows = tab.linhas
    .map((r, i) => {
      const kind: TableRowKind = r.tipo;
      const zebra = !t.a4 && kind === "normal" && i % 2 === 1;
      const bg = kind === "alerta" ? ALERT_SOFT : kind === "destaque" || zebra ? P.s : "#FFFFFF";
      const stripe = kind === "alerta" ? ALERT : kind === "destaque" || zebra ? P.p : t.a4 && i === 0 ? NAVY : P.d;
      const firstColor = kind === "alerta" ? ALERT : kind === "destaque" ? P.d : NAVY;
      const last = i === tab.linhas.length - 1;
      const cells = r.celulas
        .map((cell, j) =>
          j === 0
            ? `<div style="padding:${t.cellPad};border-left:${t.stripe}px solid ${stripe};color:${firstColor};min-width:0;overflow-wrap:anywhere">${esc(cell)}</div>`
            : `<div style="padding:${t.cellPad};font-weight:500;min-width:0;overflow-wrap:anywhere">${esc(cell)}</div>`
        )
        .join("");
      return `<div ${kind === "alerta" ? 'data-role="alert-row" ' : ""}style="display:grid;grid-template-columns:${cols};font-size:${t.rowSize}px;font-weight:600;background:${bg};${last ? "" : `border-bottom:1px solid ${LINE};`}">${cells}</div>`;
    })
    .join("");
  return `<div data-k="tabela" data-box style="border-radius:${t.radius}px;overflow:hidden;border:${t.border} solid ${LINE};flex:none"><div style="display:grid;grid-template-columns:${cols};background:${NAVY};color:#FFFFFF;${COND};font-weight:700;font-size:${t.headSize}px;letter-spacing:${t.headLs}px;text-transform:uppercase">${head}</div>${rows}</div>`;
}

const hasTable = (c: VisualContent) => Boolean(c.tabela && c.tabela.linhas.length);
const hasIllustration = (c: VisualContent) => c.ilustracao.tipo !== "nenhuma" || Boolean(c.dado_chave);

/** Área flexível: imagem enviada, ícone com legenda e/ou dado-chave (manuscrito). */
function illustrationInner(c: VisualContent, P: Pal, o: BuildOptions, sz: { icon: number; caption: number; dado: number; gap: number; row?: boolean }) {
  const il = c.ilustracao;
  const parts: string[] = [];
  if (il.tipo === "imagem" && il.imagem) {
    const src = o.images?.[il.imagem];
    parts.push(
      src
        ? `<img data-k="ilustracao" src="${esc(src)}" alt="${esc(il.alt || il.legenda)}" style="display:block;max-width:100%;max-height:100%;min-height:0;flex:1 1 auto;object-fit:contain;border-radius:${Math.round(sz.gap / 2)}px">`
        : `<div data-k="ilustracao" style="${COND};font-weight:700;font-size:${sz.caption}px;color:${P.d}">Imagem indisponível</div>`
    );
  } else if (il.tipo === "icone") {
    parts.push(icon(il.icone, sz.icon, P.p, 1.6));
  }
  const texts: string[] = [];
  if (c.dado_chave) texts.push(`<div data-k="dado_chave" data-lines="2" data-fit="0.7" style="${CAV};font-weight:700;font-size:${sz.dado}px;line-height:0.95;color:${P.d}">${esc(c.dado_chave)}</div>`);
  if (il.legenda) texts.push(`<div data-k="ilustracao" data-lines="2" data-fit="0.8" style="${COND};font-weight:700;font-size:${sz.caption}px;letter-spacing:1px;color:${P.d}">${esc(il.legenda)}</div>`);
  if (texts.length) parts.push(sz.row ? `<div style="display:flex;flex-direction:column;gap:6px;min-width:0">${texts.join("")}</div>` : texts.join(""));
  return parts.join("");
}

interface FooterScale {
  pad: string;
  logo: number;
  rev: number;
  revLs: number;
  src: number;
  srcLs: number;
  pn: number;
  pnBorder: number;
  pnPad: string;
  height?: number;
}
// Logo oficial (imagem embutida): fundo claro usa a versao colorida; fundo azul-marinho usa a versao com o nome em branco.
// A altura mantem a mesma area do antigo bloco de texto (nome + REVALIDA), para nao mexer na diagramacao das pecas.
const logoBlock = (f: { logo: number; rev: number; revLs: number }, _med?: string, color: string = "#FFFFFF", align: string = "flex-start") => {
  const h = f.logo + f.rev + 4;
  const src = color === "#FFFFFF" ? LOGO_ON_DARK : LOGO_ON_LIGHT;
  return `<div data-k="logo" style="display:flex;align-items:center;justify-content:${align};flex:none"><img src="${src}" alt="StaziaMed Revalida" width="${Math.round(h * LOGO_ASPECT)}" height="${h}" style="display:block;height:${h}px;width:auto"></div>`;
};
const pagePill = (text: string, P: Pal, f: Pick<FooterScale, "pn" | "pnBorder" | "pnPad">, k: string, role = "") =>
  text
    ? `<div data-k="${k}" ${role ? `data-role="${role}" ` : ""}style="background:${P.s};color:${P.d};border:${f.pnBorder}px solid ${P.p};${COND};font-weight:800;font-size:${f.pn}px;letter-spacing:${k === "card_id" ? 1 : 0}px;padding:${f.pnPad};border-radius:999px;white-space:nowrap;flex:none">${esc(text)}</div>`
    : `<div style="flex:none"></div>`;
const footer = (c: VisualContent, P: Pal, f: FooterScale, src: string, right: string) =>
  `<div data-region="footer" style="flex:none;background:${NAVY};color:#FFFFFF;padding:${f.pad};${f.height ? `height:${f.height}px;box-sizing:border-box;` : ""}display:flex;align-items:center;justify-content:space-between;gap:20px">${logoBlock(f)}${
    src ? `<div data-k="fonte" data-lines="2" data-fit="0.8" style="flex:1;min-width:0;${COND};font-style:italic;font-weight:700;font-size:${f.src}px;letter-spacing:${f.srcLs}px;color:${SEAL};text-transform:uppercase;text-align:center">${esc(src)}</div>` : `<div style="flex:1"></div>`
  }${right}</div>`;

/** Rodapé de feed, A4 e story: marca, fonte e número da peça. */
const pieceFooter = (c: VisualContent, P: Pal, f: FooterScale) => footer(c, P, f, c.fonte, pagePill(c.paginacao, P, f, "paginacao"));

// ---------------------------------------------------------------------------- guias (só prévia)
function guidesHtml(model: VisualContent["model"], side: VisualSide, w: number, h: number): string {
  const label = `${COND};font-weight:700;letter-spacing:1.5px;text-transform:uppercase`;
  if (model === "story") {
    const band = (top: number, height: number, text: string) =>
      `<div data-guide style="position:absolute;left:0;top:${top}px;width:${w}px;height:${height}px;background:repeating-linear-gradient(45deg,rgba(194,24,122,.16) 0 14px,rgba(194,24,122,.06) 14px 28px);outline:3px dashed rgba(194,24,122,.7);outline-offset:-3px;pointer-events:none;display:flex;align-items:center;justify-content:center"><span style="${label};font-size:26px;color:#C2187A;background:rgba(255,255,255,.85);padding:4px 14px;border-radius:999px">${text}</span></div>`;
    return band(0, STORY_SAFE.top, `Zona segura · ${STORY_SAFE.top} px · sem conteúdo essencial`) + band(h - STORY_SAFE.bottom, STORY_SAFE.bottom, `Zona segura · ${STORY_SAFE.bottom} px`);
  }
  if (model === "flashcard_a6") {
    const s = A6_PRINT.safe;
    const texts = side === "front" ? ["Frente", "Tracejado: margem segura 5 mm · Linha rosa: corte · Sangria +3 mm", "Virar no eixo longo"] : ["Virar no eixo longo", "Tracejado: margem segura 5 mm · Linha rosa: corte · Sangria +3 mm", "Verso"];
    return `<div data-guide style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;pointer-events:none"><div style="position:absolute;left:${s}px;top:${s}px;width:${w - 2 * s}px;height:${h - 2 * s}px;box-sizing:border-box;border:3px dashed ${NAVY};opacity:0.35"></div><div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;box-sizing:border-box;border:4px solid #C2187A;opacity:0.55"></div><div style="position:absolute;left:${A6_PRINT.inset}px;bottom:14px;width:${w - 2 * A6_PRINT.inset}px;display:flex;justify-content:space-between;gap:16px;${label};font-size:24px;color:${NAVY}">${texts.map((t) => `<div>${t}</div>`).join("")}</div></div>`;
  }
  const m = model === "a4" ? 40 : model === "feed" ? 56 : 64;
  return `<div data-guide style="position:absolute;left:${m}px;top:0;width:${w - 2 * m}px;height:${h}px;box-sizing:border-box;border-left:2px dashed rgba(194,24,122,.55);border-right:2px dashed rgba(194,24,122,.55);pointer-events:none"></div>`;
}

const artboard = (c: VisualContent, side: VisualSide, w: number, h: number, inner: string, o: BuildOptions, extra = "") =>
  `<div class="vm-artboard" data-artboard="${side}" data-model="${c.model}" data-specialty="${c.specialty.key}" data-card-id="${esc(c.card_id)}" data-order="${c.ordem}" style="position:relative;width:${w}px;height:${h}px;box-sizing:border-box;background:#FFFFFF;color:${INK};font-family:'Barlow','Segoe UI',sans-serif;display:flex;flex-direction:column;overflow:hidden;${extra}">${inner}${
    o.guides ? guidesHtml(c.model, side, w, h) : ""
  }</div>`;

// ---------------------------------------------------------------------------- feed 1080 × 1350
function feed(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const s: Scale = { pill: 24, pillPad: "8px 22px", pillLs: 2 };
  const pontos = c.pontos_chave.length
    ? `<div data-k="pontos_chave" data-box style="flex:1.3;min-width:0;border:3px solid ${P.p};border-radius:26px;padding:22px 26px;display:flex;flex-direction:column;gap:16px">${sectionLabel("Pontos-chave", 34, "4px 22px", 8, -1.5, P)}${c.pontos_chave
        .map((p) => `<div style="display:flex;gap:14px;align-items:flex-start">${icon("verificacao", 36, P.d, 2.2, "flex:none;margin-top:2px")}<div data-k="pontos_chave" data-fit="0.9" style="font-size:30px;line-height:1.2;font-weight:500;min-width:0">${esc(p)}</div></div>`)
        .join("")}</div>`
    : "";
  const ilus = hasIllustration(c)
    ? `<div data-k="ilustracao" data-box style="flex:1;min-width:0;border:3px dashed ${P.p};border-radius:26px;background:${P.s};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;text-align:center">${illustrationInner(c, P, o, { icon: 84, caption: 28, dado: 64, gap: 12 })}</div>`
    : "";
  const row1 = pontos || ilus ? `<div style="flex:1;min-height:0;display:flex;gap:26px">${pontos}${ilus}</div>` : "";
  const table = hasTable(c) ? tableHtml(c, P, { radius: 18, border: "2px", headSize: 26, headLs: 1.5, cellPad: "11px 22px", rowSize: 27, stripe: 8, a4: false }) : "";
  const alerts = [
    c.pegadinha ? pegadinhaBox(c.pegadinha, { border: 3, radius: 26, pad: "18px 24px", gap: 16, icon: 60, title: 50, text: 27, lh: 1.22, lines: 3 }) : "",
    c.tome_nota ? tomeNota(c.tome_nota, { radius: 6, pad: "30px 24px 18px", rot: 1.5, shadow: "0 6px 14px rgba(11,37,69,0.18)", tape: [-14, 130, 30, -3], title: 50, text: 36, lines: 3 }) : "",
  ].filter(Boolean);
  const row3 = alerts.length ? `<div style="flex:none;display:grid;grid-template-columns:${alerts.length === 2 ? "1.25fr 1fr" : "1fr"};gap:26px;align-items:stretch">${alerts.join("")}</div>` : "";
  const inner = `
<div data-region="header" style="flex:none;padding:52px 56px 26px;display:flex;flex-direction:column;gap:14px">
<div style="display:flex;justify-content:space-between;align-items:center;gap:16px">${specialtyPill(c, P, s)}<div style="display:flex;gap:10px;align-items:center">${sealPill(c.selo_prova, s, "selo_prova")}${updatedPill(c, s)}</div></div>
<div data-k="titulo" data-lines="2" data-fit="0.7" style="${COND};font-weight:800;font-size:116px;line-height:0.92;text-transform:uppercase;color:${NAVY};letter-spacing:-1px">${esc(c.titulo)}</div>
${c.subtitulo ? `<div data-k="subtitulo" data-lines="1" data-fit="0.75" style="${COND};font-weight:700;font-size:60px;line-height:1;text-transform:uppercase;color:${P.d}">${esc(c.subtitulo)}</div>` : ""}
</div>
${c.resumo ? `<div data-k="resumo" data-lines="1" data-fit="0.8" style="flex:none;background:${P.d};color:#FFFFFF;padding:16px 56px;${COND};font-weight:700;font-size:32px;letter-spacing:1.5px;text-transform:uppercase">${esc(c.resumo)}</div>` : ""}
<div data-region="body" data-box style="flex:1;min-height:0;padding:30px 56px 30px;display:flex;flex-direction:column;gap:26px">${row1}${table}${row3}</div>
${pieceFooter(c, P, { pad: "22px 56px", logo: 38, rev: 20, revLs: 9, src: 24, srcLs: 1.5, pn: 34, pnBorder: 3, pnPad: "4px 22px" })}`;
  return [{ side: "single", width: 1080, height: 1350, html: artboard(c, "single", 1080, 1350, inner, o) }];
}

// ---------------------------------------------------------------------------- A4 794 × 1123 (96 dpi)
function a4(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const s: Scale = { pill: 16, pillPad: "5px 16px", pillLs: 1.2 };
  let n = 0;
  const numbered = (t: string) => `${++n}) ${t}`;
  const col1 =
    c.dado_chave || c.resumo_paragrafo
      ? `<div style="display:flex;flex-direction:column;gap:6px;min-width:0">${
          c.dado_chave
            ? `<div data-k="dado_chave" data-lines="2" data-fit="0.7" style="${CAV};font-weight:700;font-size:40px;line-height:0.9;color:${NAVY}">${esc(c.dado_chave)}</div><div style="width:150px;height:5px;background:${P.p};border-radius:4px;transform:rotate(-1.5deg)"></div>`
            : ""
        }${c.resumo_paragrafo ? `<div data-k="resumo_paragrafo" data-lines="6" data-fit="0.9" style="font-size:16px;line-height:1.35;margin-top:6px">${multi(c.resumo_paragrafo)}</div>` : ""}</div>`
      : "";
  const ilusTipo = c.ilustracao.tipo !== "nenhuma";
  const col2 = ilusTipo
    ? `<div data-k="ilustracao" data-box style="border:2px dashed ${P.p};border-radius:16px;background:${P.s};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;text-align:center;min-height:150px;min-width:0">${illustrationInner({ ...c, dado_chave: "" }, P, o, { icon: 46, caption: 16, dado: 30, gap: 6 })}</div>`
    : "";
  const col3 = c.tome_nota ? tomeNota(c.tome_nota, { radius: 4, pad: "22px 16px 12px", rot: 2, shadow: "0 4px 10px rgba(11,37,69,0.18)", tape: [-9, 80, 20, -3], title: 30, text: 23, lines: 5 }, "min-width:0") : "";
  const cols = [
    [col1, "1.15fr"],
    [col2, "0.8fr"],
    [col3, "0.9fr"],
  ].filter(([h]) => h);
  const row1 = cols.length ? `<div style="flex:none;display:grid;grid-template-columns:${cols.map(([, f]) => f).join(" ")};gap:18px;align-items:stretch">${cols.map(([h]) => h).join("")}</div>` : "";
  const table = hasTable(c)
    ? `<div style="flex:none;display:flex;flex-direction:column;gap:10px">${c.tabela!.titulo ? sectionLabel(numbered(c.tabela!.titulo), 22, "2px 16px", 6, -1, P) : ""}${tableHtml(c, P, { radius: 12, border: "1.5px", headSize: 17, headLs: 1.2, cellPad: "6px 16px", rowSize: 16, stripe: 6, a4: true })}</div>`
    : "";
  const pontos = c.pontos_chave.length
    ? `<div data-k="pontos_chave" data-box style="border:2px solid ${P.p};border-radius:16px;padding:14px 18px;display:flex;flex-direction:column;gap:10px;min-width:0">${sectionLabel(numbered("Pontos-chave"), 22, "2px 16px", 6, -1, P)}${c.pontos_chave
        .map((p) => {
          const m = /^(.+?)\s+[—–]\s+(.+)$/.exec(p);
          const body = m ? `<b style="color:${NAVY}">${esc(m[1])}</b> — ${esc(m[2])}` : esc(p);
          return `<div style="display:flex;gap:10px;align-items:flex-start">${icon("verificacao", 22, P.d)}<div data-k="pontos_chave" style="line-height:1.3;min-width:0">${body}</div></div>`;
        })
        .join("")}</div>`
    : "";
  const right = [
    c.pegadinha ? pegadinhaBox(c.pegadinha, { border: 2, radius: 16, pad: "12px 16px", gap: 12, icon: 40, title: 32, text: 16, lh: 1.3, lines: 4 }) : "",
    c.bloco
      ? `<div data-k="bloco" data-box style="flex:1;min-height:0;border:2px solid ${LINE};border-radius:16px;padding:12px 16px;display:flex;flex-direction:column;gap:8px">${
          c.bloco.titulo ? `<div data-k="bloco" data-lines="2" style="${COND};font-weight:700;font-size:20px;letter-spacing:1px;text-transform:uppercase;color:${P.d}">${esc(c.bloco.titulo)}</div>` : ""
        }${c.bloco.itens.map((i) => `<div style="display:flex;gap:10px;align-items:baseline"><div style="flex:none;width:8px;height:8px;border-radius:50%;background:${P.p}"></div><div data-k="bloco" style="line-height:1.3;min-width:0">${esc(i)}</div></div>`).join("")}</div>`
      : "",
  ].filter(Boolean);
  const rightCol = right.length ? `<div style="display:flex;flex-direction:column;gap:14px;min-width:0">${right.join("")}</div>` : "";
  const row3 = pontos || rightCol ? `<div style="flex:1;min-height:0;display:grid;grid-template-columns:${pontos && rightCol ? "1.1fr 1fr" : "1fr"};gap:18px">${pontos}${rightCol}</div>` : "";
  const mn = c.mnemonico && c.mnemonico.itens.length
    ? `<div data-k="mnemonico" style="flex:none;border:2px solid ${NAVY};border-radius:16px;overflow:hidden"><div style="background:${NAVY};color:#FFFFFF;${COND};font-style:italic;font-weight:700;font-size:20px;letter-spacing:1px;text-transform:uppercase;padding:4px 18px">${esc(numbered(c.mnemonico.titulo || "Mnemônico"))}</div><div style="display:grid;grid-template-columns:repeat(${c.mnemonico.itens.length}, minmax(0, 1fr));gap:0">${c.mnemonico.itens
        .map(
          (it, i) =>
            `<div style="padding:10px 14px;text-align:center;${i ? `border-left:1px dashed ${P.p};` : ""}"><div data-k="mnemonico" style="${COND};font-weight:800;font-size:32px;line-height:1;color:${P.d}">${esc(it.letra)}</div><div data-k="mnemonico">${esc(it.texto)}</div></div>`
        )
        .join("")}</div></div>`
    : "";
  const inner = `
<div data-region="header" style="flex:none;padding:30px 40px 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
<div style="display:flex;flex-direction:column;gap:4px;min-width:0">
<div data-k="titulo" data-lines="2" data-fit="0.7" style="${COND};font-weight:800;font-size:60px;line-height:0.92;text-transform:uppercase;color:${NAVY}">${esc(c.titulo)}</div>
${c.subtitulo ? `<div data-k="subtitulo" data-lines="1" data-fit="0.75" style="${COND};font-weight:700;font-size:34px;line-height:1;text-transform:uppercase;color:${P.d}">${esc(c.subtitulo)}</div>` : ""}
</div>
<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex:none">${specialtyPill(c, P, s)}${sealPill(c.selo_prova, s, "selo_prova")}${updatedPill(c, s)}</div>
</div>
${c.resumo ? `<div data-k="resumo" data-lines="1" data-fit="0.85" style="flex:none;background:${P.d};color:#FFFFFF;padding:8px 40px;${COND};font-weight:700;font-size:19px;letter-spacing:1.2px;text-transform:uppercase">${esc(c.resumo)}</div>` : ""}
<div data-region="body" data-box style="flex:1;min-height:0;padding:20px 40px 18px;display:flex;flex-direction:column;gap:18px;font-size:16px">${row1}${table}${row3}${mn}</div>
${pieceFooter(c, P, { pad: "12px 40px", logo: 22, rev: 12, revLs: 6, src: 16, srcLs: 1.2, pn: 20, pnBorder: 2, pnPad: "2px 16px" })}`;
  return [{ side: "single", width: 794, height: 1123, html: artboard(c, "single", 794, 1123, inner, o, "font-size:16px") }];
}

// ---------------------------------------------------------------------------- story 1080 × 1920
function story(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const s: Scale = { pill: 26, pillPad: "8px 24px", pillLs: 2 };
  // A faixa azul-marinho do topo cobre a zona segura (190 px) e os selos ficam logo abaixo dela, ainda na faixa.
  const band = `<div data-region="safe-top" style="height:${STORY_SAFE.top + 74}px;flex:none;background:${NAVY};display:flex;align-items:flex-end;justify-content:space-between;padding:0 64px 22px;box-sizing:border-box">${specialtyPill(c, P, { pill: 26, pillPad: "5px 24px", pillLs: 2 }, `background:${P.s};color:${P.d};border:3px solid ${P.p}`)}${updatedPill(c, s)}</div>`;
  const flexArea = (() => {
    const imagem = c.ilustracao.tipo === "imagem";
    if (!imagem && hasTable(c))
      return `<div data-k="tabela" data-box style="flex:1;min-height:0;border:3px dashed ${P.p};border-radius:30px;background:${P.s};display:flex;flex-direction:column;justify-content:center;gap:18px;padding:28px">${
        c.tabela!.titulo ? `<div data-k="tabela" style="${COND};font-weight:700;font-size:34px;letter-spacing:1px;text-transform:uppercase;color:${P.d}">${esc(c.tabela!.titulo)}</div>` : ""
      }${tableHtml(c, P, { radius: 20, border: "2px", headSize: 30, headLs: 1.5, cellPad: "12px 24px", rowSize: 32, stripe: 8, a4: false })}${c.dado_chave ? `<div data-k="dado_chave" data-lines="2" data-fit="0.7" style="${CAV};font-weight:700;font-size:60px;line-height:0.95;color:${P.d};text-align:center">${esc(c.dado_chave)}</div>` : ""}</div>`;
    if (!hasIllustration(c)) return "";
    return `<div data-k="ilustracao" data-box style="flex:1;min-height:0;border:3px dashed ${P.p};border-radius:30px;background:${P.s};display:flex;${imagem ? "flex-direction:column;" : ""}align-items:center;justify-content:center;gap:24px;padding:20px;text-align:${imagem ? "center" : "left"}">${illustrationInner(c, P, o, { icon: 96, caption: 32, dado: 60, gap: 24, row: !imagem })}</div>`;
  })();
  const pontos = c.pontos_chave.length
    ? `<div data-k="pontos_chave" data-box style="flex:none;border:3px solid ${P.p};border-radius:30px;padding:26px 30px;display:flex;flex-direction:column;gap:20px">${sectionLabel("Pontos-chave", 40, "4px 24px", 8, -1.5, P)}${c.pontos_chave
        .map((p) => `<div style="display:flex;gap:18px;align-items:flex-start">${icon("verificacao", 44, P.d, 2.2, "flex:none;margin-top:2px")}<div data-k="pontos_chave" data-fit="0.9" style="font-size:38px;line-height:1.2;font-weight:500;min-width:0">${esc(p)}</div></div>`)
        .join("")}</div>`
    : "";
  const peg = c.pegadinha ? pegadinhaBox(c.pegadinha, { border: 3, radius: 30, pad: "22px 28px", gap: 20, icon: 76, title: 62, text: 34, lh: 1.22, lines: 3 }, "flex:none") : "";
  const nota = c.tome_nota
    ? tomeNota(c.tome_nota, { radius: 6, pad: "34px 32px 22px", rot: -1.5, shadow: "0 8px 18px rgba(11,37,69,0.18)", tape: [-16, 160, 34, 3], title: 60, text: 44, lines: 3 }, "flex:none;align-self:center;width:820px;box-sizing:border-box")
    : "";
  const inner = `${band}
<div data-region="header" style="flex:none;padding:44px 64px 30px;display:flex;flex-direction:column;gap:14px">
${c.selo_prova ? `<div style="align-self:flex-start">${sealPill(c.selo_prova, s, "selo_prova")}</div>` : ""}
<div data-k="titulo" data-lines="2" data-fit="0.7" style="${COND};font-weight:800;font-size:136px;line-height:0.9;text-transform:uppercase;color:${NAVY};letter-spacing:-1px">${esc(c.titulo)}</div>
${c.subtitulo ? `<div data-k="subtitulo" data-lines="1" data-fit="0.75" style="${COND};font-weight:700;font-size:66px;line-height:1;text-transform:uppercase;color:${P.d}">${esc(c.subtitulo)}</div>` : ""}
</div>
${c.resumo ? `<div data-k="resumo" data-lines="1" data-fit="0.8" style="flex:none;background:${P.d};color:#FFFFFF;padding:18px 64px;${COND};font-weight:700;font-size:36px;letter-spacing:1.5px;text-transform:uppercase">${esc(c.resumo)}</div>` : ""}
<div data-region="body" data-box style="flex:1;min-height:0;padding:36px 64px 36px;display:flex;flex-direction:column;gap:32px">${flexArea}${pontos}${peg}${nota}</div>
${pieceFooter(c, P, { pad: `26px 64px ${STORY_SAFE.bottom}px`, logo: 44, rev: 22, revLs: 10, src: 26, srcLs: 1.5, pn: 38, pnBorder: 3, pnPad: "4px 24px" })}`;
  return [{ side: "single", width: 1080, height: 1920, html: artboard(c, "single", 1080, 1920, inner, o) }];
}

// ---------------------------------------------------------------------------- flashcards
const cardIdText = (c: VisualContent, o: BuildOptions) => c.card_id || (o.preview ? "ID automático" : "");

function digitalIdBlock(c: VisualContent, P: Pal) {
  const nivel = c.nivel
    ? `<div data-k="nivel" style="display:flex;align-items:center;gap:10px;border:3px solid ${NAVY};color:${NAVY};${COND};font-weight:700;font-size:28px;letter-spacing:2px;text-transform:uppercase;padding:6px 22px;border-radius:999px;white-space:nowrap">${icon("bars", 28, NAVY, 2.6)}${esc(c.nivel)}</div>`
    : "";
  return `<div data-region="header" style="flex:none;padding:40px 64px 0;display:flex;flex-direction:column;gap:22px">
<div style="height:56px;display:flex;justify-content:space-between;align-items:center;gap:16px">${specialtyPill(c, P, { pill: 28, pillPad: "9px 26px", pillLs: 2 })}${nivel}</div>
<div style="height:52px;display:flex;align-items:center;gap:14px;padding-bottom:20px;border-bottom:3px solid ${LINE}">${c.tema ? `${icon("tag", 36, P.d, 2)}<div data-k="tema" data-lines="1" data-fit="0.7" style="${COND};font-weight:700;font-size:40px;line-height:1;letter-spacing:1.5px;text-transform:uppercase;color:${P.d};min-width:0">${esc(c.tema)}</div>` : ""}</div>
</div>`;
}

const digitalFooter = (c: VisualContent, P: Pal, o: BuildOptions, withSource: boolean) => {
  const f: FooterScale = { pad: "0 64px", logo: 38, rev: 20, revLs: 9, src: 24, srcLs: 1.5, pn: 30, pnBorder: 3, pnPad: "4px 22px", height: 104 };
  return footer(c, P, f, withSource ? sourceLine(c, true) : "", pagePill(cardIdText(c, o), P, f, "card_id", "card-id"));
};

function flashcardDigital(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const stripe = `<div data-bg style="height:18px;flex:none;background:${P.p}"></div>`;
  const front = `${stripe}${digitalIdBlock(c, P)}
<div data-region="body" data-box style="flex:1;min-height:0;padding:36px 64px 36px;display:flex;flex-direction:column;gap:28px">
<div data-box style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:30px">
<div style="display:flex;align-items:center;gap:20px"><div style="width:96px;height:96px;flex:none;border-radius:50%;background:${P.s};border:3px solid ${P.p};box-sizing:border-box;display:flex;align-items:center;justify-content:center"><svg ${svgAttrs(54, P.d, 2.4)}>${ICONS.question}<circle cx="12" cy="18.2" r="0.7" fill="${P.d}"></circle></svg></div><div style="${COND};font-weight:700;font-size:34px;letter-spacing:6px;text-transform:uppercase;color:${P.d}">Pergunta</div></div>
<div data-k="pergunta" data-lines="5" data-fit="0.45" style="${COND};font-weight:800;font-size:108px;line-height:0.96;text-transform:uppercase;color:${NAVY};letter-spacing:-0.5px">${multi(c.pergunta)}</div>
<div style="width:220px;height:10px;border-radius:6px;background:${P.p};flex:none"></div>
</div>
<div style="flex:none;align-self:center;display:flex;align-items:center;gap:14px;background:${P.s};border-radius:999px;padding:10px 30px">${icon("flip", 40, P.d)}<div style="${CAV};font-weight:700;font-size:46px;line-height:1;color:${P.d}">toque para virar</div></div>
</div>
${digitalFooter(c, P, o, false)}`;
  const back = `${stripe}${digitalIdBlock(c, P)}
<div data-region="body" data-box style="flex:1;min-height:0;padding:32px 64px 32px;display:flex;flex-direction:column;gap:26px">
<div style="flex:none;background:${P.d};color:${P.c};border-radius:28px;padding:26px 34px 30px;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:14px">${icon("verificacao", 40, P.c, 2.4)}<div style="${COND};font-weight:700;font-size:34px;letter-spacing:6px;text-transform:uppercase">Resposta</div></div>
<div data-k="resposta" data-lines="2" data-fit="0.6" style="${COND};font-weight:800;font-size:80px;line-height:0.98;text-transform:uppercase">${esc(c.resposta)}</div>
</div>
${
  c.explicacao
    ? `<div data-k="explicacao" data-box style="flex:1;min-height:0;border:3px solid ${P.p};border-radius:28px;padding:24px 30px;display:flex;flex-direction:column;gap:12px"><div style="display:flex;align-items:center;gap:14px">${icon("bulb", 40, P.d)}<div style="${COND};font-weight:700;font-size:34px;letter-spacing:3px;text-transform:uppercase;color:${P.d}">Explicação / justificativa</div></div><div data-k="explicacao" data-lines="${c.pegadinha ? 5 : 8}" data-fit="0.8" style="font-size:34px;line-height:1.28;font-weight:500">${multi(c.explicacao)}</div></div>`
    : ""
}
${c.pegadinha ? pegadinhaBox(c.pegadinha, { border: 3, radius: 28, pad: "18px 26px", gap: 18, icon: 64, title: 52, text: 30, lh: 1.22, lines: 2 }, "flex:none") : ""}
</div>
${digitalFooter(c, P, o, true)}`;
  return [
    { side: "front", width: 1080, height: 1350, html: artboard(c, "front", 1080, 1350, front, o) },
    { side: "back", width: 1080, height: 1350, html: artboard(c, "back", 1080, 1350, back, o) },
  ];
}

function flashcardA6(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const W = 1240;
  const H = 1748;
  const stripe = `<div data-bg style="height:30px;flex:none;background:${P.p}"></div>`;
  const sp = specialtyPill(c, P, { pill: 42, pillPad: "12px 36px", pillLs: 3 });
  const id = `<div data-k="card_id" data-role="card-id" style="background:${P.s};color:${P.d};border:4px solid ${P.p};${COND};font-weight:800;font-size:42px;letter-spacing:2px;padding:8px 30px;border-radius:999px;white-space:nowrap">${esc(cardIdText(c, o))}</div>`;
  const nivel = c.nivel
    ? `<div data-k="nivel" style="display:flex;align-items:center;gap:14px;border:4px solid ${NAVY};color:${NAVY};${COND};font-weight:700;font-size:42px;letter-spacing:3px;text-transform:uppercase;padding:8px 30px;border-radius:999px;white-space:nowrap">${icon("bars", 40, NAVY, 2.6)}${esc(c.nivel)}</div>`
    : "<div></div>";
  const logo = (align: string) => logoBlock({ logo: 46, rev: 26, revLs: 10 }, P.d, NAVY, align);
  const front = `${stripe}
<div data-region="body" data-box style="flex:1;min-height:0;padding:54px ${A6_PRINT.inset}px ${A6_PRINT.inset}px;display:flex;flex-direction:column;gap:40px">
<div style="flex:none;height:84px;display:flex;justify-content:space-between;align-items:center;gap:20px">${sp}${id}</div>
<div data-box style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:36px">
${c.tema ? `<div style="display:flex;align-items:center;gap:18px">${icon("tag", 52, P.d, 2)}<div data-k="tema" data-lines="1" data-fit="0.7" style="${COND};font-weight:700;font-size:56px;line-height:1;letter-spacing:2px;text-transform:uppercase;color:${P.d};min-width:0">${esc(c.tema)}</div></div>` : ""}
<div data-k="pergunta" data-lines="5" data-fit="0.45" style="${COND};font-weight:800;font-size:136px;line-height:0.96;text-transform:uppercase;color:${NAVY};letter-spacing:-0.5px">${multi(c.pergunta)}</div>
<div style="width:260px;height:12px;border-radius:8px;background:${P.p};flex:none"></div>
</div>
<div style="flex:none;height:84px;display:flex;justify-content:space-between;align-items:center;gap:20px">${nivel}${logo("flex-end")}</div>
</div>`;
  const back = `${stripe}
<div data-region="body" data-box style="flex:1;min-height:0;padding:54px ${A6_PRINT.inset}px ${A6_PRINT.inset}px;display:flex;flex-direction:column;gap:32px">
<div style="flex:none;height:84px;display:flex;justify-content:space-between;align-items:center;gap:20px">${id}${sp}</div>
<div style="flex:none;background:${P.d};color:${P.c};border-radius:34px;padding:30px 40px 36px;display:flex;flex-direction:column;gap:12px">
<div style="display:flex;align-items:center;gap:16px">${icon("verificacao", 52, P.c, 2.4)}<div style="${COND};font-weight:700;font-size:42px;letter-spacing:7px;text-transform:uppercase">Resposta</div></div>
<div data-k="resposta" data-lines="2" data-fit="0.6" style="${COND};font-weight:800;font-size:92px;line-height:0.98;text-transform:uppercase">${esc(c.resposta)}</div>
</div>
${
  c.como_lembrar
    ? `<div data-k="como_lembrar" data-box style="flex:1;min-height:0;background:${P.s};border:4px solid ${P.p};border-radius:34px;padding:28px 38px;display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:16px">${icon("bulb", 52, P.d)}<div style="${CAV};font-weight:700;font-size:72px;line-height:0.95;color:${P.d}">Como lembrar</div></div><div data-k="como_lembrar" data-lines="6" data-fit="0.8" style="font-size:44px;line-height:1.26;font-weight:500">${multi(c.como_lembrar)}</div></div>`
    : ""
}
${c.pegadinha ? pegadinhaBox(c.pegadinha, { border: 4, radius: 34, pad: "22px 34px 26px", gap: 22, icon: 84, title: 68, text: 42, lh: 1.22, lines: 2 }, "flex:none") : ""}
${c.referencia ? `<div style="flex:none;display:flex;align-items:center;gap:16px;padding-top:22px;border-top:3px solid ${LINE}">${icon("book", 46, NAVY, 2)}<div data-k="referencia" data-lines="2" data-fit="0.8" style="font-size:38px;line-height:1.2;font-weight:600;color:${NAVY};min-width:0">${multi(c.referencia)}</div></div>` : ""}
<div style="flex:none;height:84px;margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:20px">${logo("flex-start")}${
    sourceLine(c, true)
      ? `<div data-k="fonte" data-lines="2" data-fit="0.75" style="min-width:0;text-align:right;${COND};font-style:italic;font-weight:700;font-size:34px;letter-spacing:1.5px;text-transform:uppercase;color:${P.d}">${esc(sourceLine(c, true))}</div>`
      : ""
  }</div>
</div>`;
  return [
    { side: "front", width: W, height: H, html: artboard(c, "front", W, H, front, o) },
    { side: "back", width: W, height: H, html: artboard(c, "back", W, H, back, o) },
  ];
}

const BUILDERS: Record<VisualContent["model"], (c: VisualContent, o: BuildOptions) => Artboard[]> = {
  feed,
  a4,
  story,
  flashcard_digital: flashcardDigital,
  flashcard_a6: flashcardA6,
};

/** Pranchas (um lado ou frente e verso) do material. */
export function renderArtboards(c: VisualContent, o: BuildOptions = {}): Artboard[] {
  return BUILDERS[c.model](c, o);
}

// ---------------------------------------------------------------------------- documento completo
export const VISUAL_BASE_CSS = `*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;background:#FFFFFF}
.vm-artboard{hyphens:manual;overflow-wrap:break-word;font-kerning:normal}.vm-artboard b{font-weight:700}`;

/** Folha de impressão do A6: a prancha (corte) com 3 mm de sangria em volta; o filete da especialidade se estende até a borda da sangria. */
function printSheet(a: Artboard, c: VisualContent) {
  const b = A6_PRINT.bleed;
  return `<div class="vm-sheet" data-sheet="${a.side}" style="position:relative;width:${a.width + 2 * b}px;height:${a.height + 2 * b}px;background:#FFFFFF;overflow:hidden;break-after:page"><div data-bg style="position:absolute;left:0;top:0;width:${a.width + 2 * b}px;height:${b + 30}px;background:${paletteOf(c.specialty.key).primary}"></div><div style="position:absolute;left:${b}px;top:${b}px">${a.html}</div></div>`;
}

export interface VisualDocument {
  html: string;
  artboards: Artboard[];
  /** Página do PDF em px (A6: folha com sangria). */
  page: { width: number; height: number };
}

/**
 * Documento para a geração (Chromium): fontes embutidas, sem guias, cada lado numa página.
 * O roteiro de encaixe e conferência (VISUAL_FIT_SCRIPT) roda sozinho e deixa o resultado em window.__visual.
 */
export function buildVisualDocument(c: VisualContent, o: BuildOptions = {}): VisualDocument {
  const artboards = renderArtboards(c, { ...o, guides: false, preview: false });
  const a6 = c.model === "flashcard_a6";
  const page = a6 ? { width: artboards[0].width + 2 * A6_PRINT.bleed, height: artboards[0].height + 2 * A6_PRINT.bleed } : { width: artboards[0].width, height: artboards[0].height };
  const pages = artboards.map((a) => (a6 ? printSheet(a, c) : `<div class="vm-page" style="width:${a.width}px;height:${a.height}px;overflow:hidden;break-after:page">${a.html}</div>`)).join("");
  const info = VISUAL_MODELS[c.model];
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(info.label)} · ${esc(c.card_id || c.titulo || c.pergunta)}</title><style>${o.fontCss ?? ""}${VISUAL_BASE_CSS}
@page{size:${page.width}px ${page.height}px;margin:0}.vm-page:last-child,.vm-sheet:last-child{break-after:auto}</style></head><body>${pages}<script>${VISUAL_FIT_SCRIPT}
window.__runVisual({ model: ${JSON.stringify(c.model)}, preview: false });</script></body></html>`;
  return { html, artboards, page };
}

// ---------------------------------------------------------------------------- encaixe e conferência
/**
 * Roda dentro do documento (prévia e geração). Reduz títulos e textos longos até o mínimo de cada um
 * (data-fit) e confere: linhas (data-lines), texto cortado (data-box), sobreposição, zonas seguras
 * (story 190/150 px; A6 margem de 5 mm), fontes carregadas, caracteres fora das fontes, vermelho de
 * alerta, especialidade escrita e o mesmo card_id nos dois lados.
 * É texto (não função) para valer igual no navegador e no Chromium do servidor.
 */
export const VISUAL_FIT_SCRIPT = String.raw`
(function () {
  var LABELS = { titulo: "Título", subtitulo: "Subtítulo", resumo: "Resumo em uma linha", resumo_paragrafo: "Resumo em parágrafo", dado_chave: "Dado-chave",
    pontos_chave: "Pontos-chave", tabela: "Tabela", ilustracao: "Ilustração", pegadinha: "Pegadinha", tome_nota: "Tome nota", fonte: "Fonte",
    atualizacao: "Atualização", selo_prova: "Selo da prova", paginacao: "Número da peça", bloco: "Bloco de lista", mnemonico: "Mnemônico",
    nivel: "Nível", tema: "Tema", pergunta: "Pergunta", resposta: "Resposta", explicacao: "Explicação", como_lembrar: "Como lembrar",
    referencia: "Referência", card_id: "ID do card", especialidade: "Especialidade", body: "Conteúdo" };
  var SIDE = { single: "", front: "frente", back: "verso" };
  var FACES = ['400 20px "Barlow"', '500 20px "Barlow"', '600 20px "Barlow"', '700 20px "Barlow"', '600 20px "Barlow Condensed"',
    '700 20px "Barlow Condensed"', '800 20px "Barlow Condensed"', 'italic 700 20px "Barlow Condensed"', '600 20px "Caveat"', '700 20px "Caveat"'];
  // caracteres que as fontes dos modelos têm (latim, acentos, pontuação e símbolos comuns em conteúdo médico)
  // caracteres que TODAS as fontes dos modelos desenham (conferido nos arquivos .ttf: latim com acentos, pontuação e ≤ ≥ ± × ≈ ≠ µ °);
  // setas e letras gregas não existem nelas
  var SUPPORTED = /^[\u0009\u000A -~ -ēĖ-īĭ-ıĳ-ķĹ-ľŀ-ňŊ-ōŏ-žƏƒǔǥǧǩǯǿȘ-țȟȷəʒʼˆ-ˇˉ˘-˝̀-̄̆-̈̊-̣̦̌-̵̨μẀ-ẅẸ-ẹẼ-ẽỊ-ọỤ-ụỲ-ỳỸ-ỹ‐–-—‘-‚“-„†-•…‰′-″‹-›⁄⁴-⁹₣€₺₽™⅛-⅞−∕∙≈≠≤-≥⟩ﬁ-ﬂ]$/;
  var px = function (v) { return parseFloat(v) || 0; };
  // "700 20px \"Caveat\"" → carregada? (check() da FontFaceSet devolve true quando não há face nenhuma; aqui exige a face)
  function faceLoaded(spec) {
    var m = /^(italic )?(\d+) \d+px "(.+)"$/.exec(spec);
    if (!m || !document.fonts) return false;
    var style = m[1] ? "italic" : "normal", weight = parseInt(m[2], 10), family = m[3];
    var ok = false;
    document.fonts.forEach(function (f) {
      if (f.status !== "loaded" || f.family.replace(/["']/g, "") !== family || (f.style || "normal") !== style) return;
      var w = String(f.weight).split(/\s+/).map(function (x) { return x === "normal" ? 400 : x === "bold" ? 700 : parseInt(x, 10); });
      if (weight >= w[0] && weight <= (w[1] || w[0])) ok = true;
    });
    return ok;
  }
  var keyOf = function (el) { var k = el.closest("[data-k]"); return k ? k.getAttribute("data-k") : "body"; };
  var labelOf = function (k) { return LABELS[k] || k; };
  // linhas de texto de verdade (caixas de linha), sem contar o espaçamento interno da caixa
  function lines(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var rects = Array.prototype.slice.call(range.getClientRects()).filter(function (r) { return r.width > 0.5 && r.height > 0.5; });
    if (!rects.length) return 0;
    var tol = px(getComputedStyle(el).fontSize) * 0.5;
    rects.sort(function (a, b) { return a.top - b.top; });
    var n = 1, last = rects[0].top;
    for (var i = 1; i < rects.length; i++) if (rects[i].top - last > tol) { n++; last = rects[i].top; }
    return n;
  }
  function overflows(el) { return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1; }
  function wide(el) { return el.scrollWidth > el.clientWidth + 1; }
  function bad(el) {
    var max = parseInt(el.getAttribute("data-lines") || "0", 10);
    if (max && lines(el) > max) return true;
    if (wide(el)) return true;
    var box = el.parentElement && el.parentElement.closest("[data-box]");
    return Boolean(box && overflows(box));
  }
  function shrink(el, factor) {
    var base = px(el.getAttribute("data-base"));
    var min = base * (parseFloat(el.getAttribute("data-fit")) || 1);
    var size = px(el.style.fontSize) || base;
    if (size <= min + 0.01) return false;
    el.style.fontSize = Math.max(min, size * factor).toFixed(2) + "px";
    return true;
  }
  function fit(art) {
    var items = Array.prototype.slice.call(art.querySelectorAll("[data-fit]"));
    // tamanho do modelo guardado na 1ª vez; nas seguintes o texto volta a ele antes de encaixar de novo
    items.forEach(function (el) {
      if (!el.hasAttribute("data-base")) el.setAttribute("data-base", String(px(getComputedStyle(el).fontSize)));
      el.style.fontSize = el.getAttribute("data-base") + "px";
    });
    // 1) cada texto respeita as próprias linhas e a caixa onde está
    items.forEach(function (el) { var guard = 0; while (bad(el) && guard++ < 80 && shrink(el, 0.97)) {} });
    // 2) o corpo ainda não coube: reduz o que ainda pode reduzir, um pouco de cada vez
    var boxes = Array.prototype.slice.call(art.querySelectorAll("[data-box]"));
    var guard = 0;
    while (guard++ < 40 && boxes.some(overflows)) {
      var any = false;
      items.forEach(function (el) { if (shrink(el, 0.97)) any = true; });
      if (!any) break;
    }
  }
  function rect(el, base) {
    var r = el.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  }
  function check(art, opts, problems) {
    var side = art.getAttribute("data-artboard");
    var where = SIDE[side] ? " (" + SIDE[side] + ")" : "";
    var add = function (code, k, message) { problems.push({ code: code, side: side, field: k, message: message + where }); };
    var base = art.getBoundingClientRect();
    var W = art.clientWidth, H = art.clientHeight;
    art.querySelectorAll("[data-lines]").forEach(function (el) {
      if (el.closest("[data-guide]")) return;
      var max = parseInt(el.getAttribute("data-lines"), 10);
      var n = lines(el);
      if (n > max) add("lines", keyOf(el), labelOf(keyOf(el)) + ": " + n + " linhas (o modelo comporta " + max + "). Encurte o texto.");
    });
    var cut = {};
    art.querySelectorAll("[data-box]").forEach(function (el) {
      if (overflows(el)) { var k = keyOf(el); if (!cut[k]) { cut[k] = 1; add("overflow", k, (k === "body" ? "O conteúdo não coube na peça" : labelOf(k) + ": o texto não coube") + ". Encurte ou retire algum bloco."); } }
    });
    art.querySelectorAll("[data-fit],[data-k]").forEach(function (el) {
      if (wide(el) && !el.matches("img")) { var k = keyOf(el); if (!cut[k]) { cut[k] = 1; add("overflow", k, labelOf(k) + ": palavra longa demais para a largura. Quebre a palavra ou encurte."); } }
    });
    // sobreposição entre blocos de conteúdo (fora as relações de pai e filho)
    var blocks = Array.prototype.slice.call(art.querySelectorAll("[data-k]")).filter(function (el) { return !el.closest("[data-guide]") && el.offsetHeight > 0; });
    var seen = {};
    for (var i = 0; i < blocks.length; i++) for (var j = i + 1; j < blocks.length; j++) {
      var a = blocks[i], b = blocks[j];
      if (a.contains(b) || b.contains(a) || a.getAttribute("data-k") === b.getAttribute("data-k")) continue;
      var ra = rect(a, base), rb = rect(b, base);
      var ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x), oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
      if (ox > 2 && oy > 2) {
        var key = a.getAttribute("data-k") + "/" + b.getAttribute("data-k");
        if (!seen[key]) { seen[key] = 1; add("overlap", a.getAttribute("data-k"), labelOf(a.getAttribute("data-k")) + " encosta em " + labelOf(b.getAttribute("data-k")) + ". Encurte o texto."); }
      }
    }
    // zonas seguras
    var model = art.getAttribute("data-model");
    blocks.forEach(function (el) {
      var r = rect(el, base);
      if (model === "story" && (r.y < ${STORY_SAFE.top} - 0.5 || r.y + r.h > H - ${STORY_SAFE.bottom} + 0.5))
        add("safe_zone", el.getAttribute("data-k"), labelOf(el.getAttribute("data-k")) + " entrou na zona segura do story (${STORY_SAFE.top} px no topo e ${STORY_SAFE.bottom} px na base).");
      if (model === "flashcard_a6" && (r.x < ${A6_PRINT.safe} - 0.5 || r.y < ${A6_PRINT.safe} - 0.5 || r.x + r.w > W - ${A6_PRINT.safe} + 0.5 || r.y + r.h > H - ${A6_PRINT.safe} + 0.5))
        add("safe_zone", el.getAttribute("data-k"), labelOf(el.getAttribute("data-k")) + " saiu da margem segura de 5 mm.");
    });
    // pegadinha e alerta: sempre o vermelho de alerta, em qualquer especialidade
    art.querySelectorAll('[data-role="alert"]').forEach(function (el) {
      if (getComputedStyle(el).borderTopColor !== "rgb(200, 16, 46)") add("alert_color", "pegadinha", "A pegadinha perdeu o vermelho de alerta.");
    });
    art.querySelectorAll('[data-role="alert-title"]').forEach(function (el) {
      if (getComputedStyle(el).color !== "rgb(200, 16, 46)") add("alert_color", "pegadinha", "O título da pegadinha perdeu o vermelho de alerta.");
    });
    var sp = art.querySelector('[data-role="specialty"]');
    if (!sp || !sp.textContent.trim()) add("specialty", "especialidade", "A especialidade precisa aparecer escrita por extenso.");
    // caracteres sem desenho nas fontes do modelo
    var odd = {};
    var walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest("[data-guide]")) continue;
      var text = node.nodeValue;
      for (var ci = 0; ci < text.length; ci++) {
        var ch = text[ci];
        var cp = text.codePointAt(ci);
        if (cp > 0xffff) { ch = String.fromCodePoint(cp); ci++; }
        if (!SUPPORTED.test(ch)) odd[ch] = keyOf(node.parentElement);
      }
    }
    Object.keys(odd).forEach(function (ch) { add("glyph", odd[ch], "O caractere \"" + ch + "\" não existe nas fontes do modelo (sairia em outra fonte). Troque por texto."); });
  }
  window.__runVisual = function (opts) {
    opts = opts || {};
    window.__visual = { done: false };
    var started = Date.now();
    var fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
    var loads = [];
    if (document.fonts) document.fonts.forEach(function (f) { loads.push(f.load().catch(function () { return null; })); });
    return Promise.all(loads).then(function () { return fontsReady; }).then(function () {
      var arts = Array.prototype.slice.call(document.querySelectorAll(".vm-artboard"));
      arts.forEach(fit);
      var problems = [];
      var missing = FACES.filter(function (f) { return !faceLoaded(f); });
      if (missing.length) problems.push({ code: "font", side: "", field: "body", message: "Fonte do modelo não carregou: " + missing.join(", ") + "." });
      arts.forEach(function (art) { check(art, opts, problems); });
      var ids = arts.map(function (a) { return a.getAttribute("data-card-id"); });
      if (arts.length === 2) {
        if (ids[0] !== ids[1] || arts[0].getAttribute("data-specialty") !== arts[1].getAttribute("data-specialty") || arts[0].getAttribute("data-order") !== arts[1].getAttribute("data-order"))
          problems.push({ code: "pair", side: "", field: "card_id", message: "Frente e verso com identificação diferente." });
        if (!opts.preview) arts.forEach(function (a) {
          var shown = a.querySelector('[data-role="card-id"]');
          if (!ids[0] || !shown || shown.textContent.trim() !== ids[0]) problems.push({ code: "pair", side: a.getAttribute("data-artboard"), field: "card_id", message: "O ID do card não aparece igual nos dois lados." });
        });
      }
      var fitted = [];
      arts.forEach(function (art) {
        art.querySelectorAll("[data-fit]").forEach(function (el) {
          var base = px(el.getAttribute("data-base")), now = px(el.style.fontSize) || base;
          if (now < base - 0.01) fitted.push({ side: art.getAttribute("data-artboard"), field: el.getAttribute("data-k"), scale: Math.round((now / base) * 100) / 100 });
        });
      });
      window.__visual = { done: true, problems: problems, fitted: fitted, ms: Date.now() - started,
        artboards: arts.map(function (a) { return { side: a.getAttribute("data-artboard"), width: a.offsetWidth, height: a.offsetHeight, card_id: a.getAttribute("data-card-id"), specialty: a.getAttribute("data-specialty"), order: a.getAttribute("data-order") }; }) };
      return window.__visual;
    });
  };
})();
`;

/**
 * Moldura da prévia (iframe isolado, sem acesso à página): recebe as fontes uma vez (FontFace API) e,
 * a cada mudança, as pranchas; devolve o resultado da conferência por postMessage.
 */
export function previewShellHtml(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${VISUAL_BASE_CSS}body{background:transparent}#root{display:flex;flex-direction:column;align-items:flex-start;gap:0}</style></head><body><div id="root"></div><script>${VISUAL_FIT_SCRIPT}
(function(){
  var seq = 0;
  window.addEventListener("message", function (e) {
    var m = e.data || {};
    if (m.type === "fonts") {
      Promise.all((m.faces || []).map(function (f) {
        var face = new FontFace(f.family, f.data, { weight: f.weight, style: f.style || "normal" });
        document.fonts.add(face);
        return face.load().catch(function () { return null; });
      })).then(function () { parent.postMessage({ type: "visual-fonts-ready" }, "*"); });
    }
    if (m.type === "render") {
      var my = ++seq;
      document.getElementById("root").innerHTML = m.html;
      window.__runVisual({ model: m.model, preview: true }).then(function (r) {
        if (my !== seq) return;
        var root = document.getElementById("root");
        parent.postMessage({ type: "visual-report", id: m.id, report: r, height: root.scrollHeight, width: root.scrollWidth }, "*");
      });
    }
  });
  parent.postMessage({ type: "visual-shell-ready" }, "*");
})();
</script></body></html>`;
}
