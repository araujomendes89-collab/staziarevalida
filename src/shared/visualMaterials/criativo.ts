/**
 * Modelo "criativo-1" dos materiais visuais (feed, A4, story, flashcard digital e flashcard A6), no estilo do
 * modelo de referência do dono (2026-10-13): cabeçalho azul-marinho com ilustração vetorial e brilho, título
 * enorme em fonte condensada (branco + cor de destaque), três selos, faixa da mensagem-chave, cartão principal com
 * ícone grande, painel de pontos-chave com ícones, "post-it" amarelo inclinado ("Tome nota!"), seção numerada com
 * tabela de linhas coloridas, caixa vermelha "Pegadinha de prova!", faixa de passos numerados e rodapé
 * azul-marinho com a marca e a linha de fonte.
 *
 * Mesmo contrato de dados do modelo clássico (visual-1.0): mesmos campos, mesmo comando, mesma conferência
 * (data-k, data-lines, data-fit, data-box, data-role). Nenhum texto clínico fixo: só rótulos de interface.
 * Ilustrações: kit/ (SVG feito à mão, sem IA de imagem).
 */
import { A6_PRINT, STORY_SAFE, paletteOf, updatedLabel, type TableRowKind, type VisualContent, type VisualSide } from "./model";
import { VISUAL_TOKENS } from "./tokens";
import { corDoCampo } from "./temas";
import { KIT_NAVY, glowOnlySvg, heroInnerWhite, sceneSvg, spot, spotForText, themeOf, type SpotName } from "./kit";
import { esc, guidesHtml, type Artboard, type BuildOptions } from "./templates";

const NAVY = VISUAL_TOKENS.brand.neutral.navy;
const INK = VISUAL_TOKENS.brand.neutral.ink;
const ALERT = VISUAL_TOKENS.brand.alert.primary;
const ALERT_SOFT = VISUAL_TOKENS.brand.alert.soft;
const COND = "font-family:'Barlow Condensed','Arial Narrow',sans-serif";
const CAV = "font-family:'Caveat','Segoe Print',cursive";
const BODY_BG = "#EEF4F5";
const CARD_LINE = "#D6E4E7";
const HEADER_BG = "radial-gradient(130% 150% at 88% 20%, #1A4C8A 0%, #0D2B52 42%, #071A33 100%)";
const FOOTER_BG = "linear-gradient(90deg, #071A33 0%, #0B2545 60%, #0E2F57 100%)";
const MUTED = "#3B4A5E";

/** Cor de brilho por especialidade (título em destaque, contornos e selo "Atualizado"). */
const GLOW: Record<string, string> = {
  clinica_medica: "#5FE6C0",
  pediatria: "#8EC8FF",
  ginecologia: "#FF9EC2",
  cirurgia: "#FFA59C",
  preventiva_mfc: "#C9B8FF",
  fallback: "#7FE3DE",
};

interface CP {
  p: string;
  s: string;
  d: string;
  c: string;
  glow: string;
  /** Cores das linhas normais da tabela, em sequência (a 1ª é a da especialidade). */
  cycle: { stripe: string; bg: string; text: string; badge: SpotName; end: SpotName }[];
}

/** Cor da especialidade (padrão) ou, se preenchido, a cor do tema (campo tema_cor: GR-001…GR-100 ou #RRGGBB). */
const pal = (c: VisualContent): CP => {
  const esp = paletteOf(c.specialty.key);
  const tema = corDoCampo(c.tema_cor ?? "");
  const t = tema ? { ...esp, primary: tema.primaria, soft: tema.clara, dark: tema.escura } : esp;
  const blue = c.specialty.key === "pediatria" ? { stripe: "#1FA6A0", bg: "#E8F7F6", text: "#0E6B74" } : { stripe: "#3A7BD5", bg: "#EAF2FC", text: "#1F4E96" };
  return {
    p: t.primary,
    s: t.soft,
    d: t.dark,
    c: t.contrast,
    glow: tema ? tema.brilho : (GLOW[c.specialty.key] ?? GLOW.fallback),
    cycle: [
      { stripe: t.primary, bg: t.soft, text: NAVY, badge: "ok", end: "documento" },
      { ...blue, text: NAVY, badge: "pergunta", end: "lupa" },
      { stripe: "#5B6B80", bg: "#F1F4F7", text: NAVY, badge: "neutro", end: "seta" },
    ],
  };
};

const multi = (s: string) => esc(s).replace(/\n/g, "<br>");
const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------------------------------------------------------------------------- peças
interface PillSize {
  font: number;
  pad: string;
  icon: number;
  gap: number;
}
const pillBase = (P: CP, s: PillSize, filled: boolean) =>
  `display:inline-flex;align-items:center;gap:${Math.round(s.icon * 0.45)}px;${COND};font-weight:700;font-size:${s.font}px;letter-spacing:${(s.font * 0.06).toFixed(1)}px;text-transform:uppercase;white-space:nowrap;padding:${s.pad};border-radius:999px;flex:none;${
    filled ? `background:${P.glow};color:${NAVY};border:${Math.max(1.5, s.font / 9)}px solid ${P.glow};` : `background:rgba(255,255,255,0.06);color:#FFFFFF;border:${Math.max(1.5, s.font / 9)}px solid ${hexA(P.glow, 0.75)};`
  }`;

const specialtyPill = (c: VisualContent, P: CP, s: PillSize) =>
  `<div data-role="specialty" data-k="especialidade" style="${pillBase(P, s, false)}">${spot("estetoscopio", s.icon, P.glow)}<span>${esc(c.specialty.label)}</span></div>`;
const seloPill = (c: VisualContent, P: CP, s: PillSize) => (c.selo_prova ? `<div data-k="selo_prova" style="${pillBase(P, s, false)}">${spot("livro", s.icon, P.glow)}<span>${esc(c.selo_prova)}</span></div>` : "");
const updatedPill = (c: VisualContent, P: CP, s: PillSize) => {
  const t = updatedLabel(c.atualizacao);
  return t ? `<div data-k="atualizacao" style="${pillBase(P, s, true)}">${spot("calendario", s.icon, NAVY)}<span>${esc(t)}</span></div>` : "";
};
const nivelPill = (c: VisualContent, P: CP, s: PillSize) => (c.nivel ? `<div data-k="nivel" style="${pillBase(P, s, false)}">${spot("niveis", s.icon, P.glow)}<span>${esc(c.nivel)}</span></div>` : "");

/** Título em duas cores: até os dois-pontos (ou a 1ª metade das palavras) em branco; o resto na cor de destaque. */
function titleParts(t: string): [string, string] {
  const i = t.indexOf(":");
  if (i > 0 && i < t.length - 1) return [t.slice(0, i + 1), t.slice(i + 1).trim()];
  const w = t.split(/\s+/).filter(Boolean);
  if (w.length < 2) return [t, ""];
  const k = Math.ceil(w.length / 2);
  return [w.slice(0, k).join(" "), w.slice(k).join(" ")];
}
const titleHtml = (c: VisualContent, P: CP, size: number, lines: number, fit = 0.55, k = "titulo", text = c.titulo) => {
  const [a, b] = titleParts(text);
  return `<div data-k="${k}" data-lines="${lines}" data-fit="${fit}" style="${COND};font-weight:800;font-size:${size}px;line-height:0.9;text-transform:uppercase;color:#FFFFFF;letter-spacing:-0.5px;text-shadow:0 ${Math.round(size / 30)}px ${Math.round(size / 8)}px rgba(0,0,0,0.25)">${esc(a)}${b ? `<br><span style="color:${P.glow}">${esc(b)}</span>` : ""}</div>`;
};

/** Cena do cabeçalho conforme a ilustração escolhida (decorativa: sem data-k). */
function headerScene(c: VisualContent, P: CP, uid: string, style: string) {
  const il = c.ilustracao;
  if (il.tipo === "nenhuma" && !c.pergunta) return glowOnlySvg(uid, { glow: P.glow, primary: P.p }, style);
  if (il.tipo !== "icone") return glowOnlySvg(uid, { glow: P.glow, primary: P.p }, style);
  const th = themeOf(il.icone);
  return sceneSvg(th.scene, uid, { glow: P.glow, primary: P.p }, heroInnerWhite(th.hero), style);
}

const band = (c: VisualContent, P: CP, s: { font: number; pad: string; margin: string; icon: number; radius: number }) =>
  c.resumo
    ? `<div style="flex:none;position:relative;z-index:2;margin:${s.margin};display:flex;align-items:center;gap:${Math.round(s.icon * 0.5)}px;padding:${s.pad};border-radius:${s.radius}px;background:linear-gradient(90deg, ${P.d} 0%, ${P.p} 100%);border:${Math.max(2, s.font / 10)}px solid ${hexA(P.glow, 0.7)};box-shadow:0 ${Math.round(s.font / 4)}px ${Math.round(s.font * 0.8)}px rgba(7,26,51,0.25)">${spot("alvo", s.icon, "#FFFFFF")}<div data-k="resumo" data-lines="2" data-fit="0.7" style="min-width:0;${COND};font-weight:800;font-size:${s.font}px;line-height:1.05;letter-spacing:${(s.font * 0.035).toFixed(1)}px;text-transform:uppercase;color:#FFFFFF">${esc(c.resumo)}</div></div>`
    : "";

interface MainSize {
  pad: string;
  radius: number;
  hero: number;
  dado: number;
  legend: number;
  para?: number;
  paraLines?: number;
  gap: number;
  /** Ícone em cima e texto centralizado (cartão alto). */
  stack?: boolean;
}
/** Cartão principal: ícone grande (ou imagem enviada), dado-chave em destaque, legenda e parágrafo. */
function mainCard(c: VisualContent, P: CP, o: BuildOptions, s: MainSize, withPara: boolean, style = "") {
  const il = c.ilustracao;
  let hero = "";
  if (il.tipo === "imagem" && il.imagem) {
    const src = o.images?.[il.imagem];
    hero = src
      ? `<img data-k="ilustracao" src="${esc(src)}" alt="${esc(il.alt || il.legenda)}" style="display:block;width:${s.hero * 1.6}px;height:${s.hero * 1.6}px;object-fit:contain;border-radius:${Math.round(s.radius / 2)}px;flex:none">`
      : `<div data-k="ilustracao" style="${COND};font-weight:700;font-size:${s.legend}px;color:${P.d}">Imagem indisponível</div>`;
  } else if (il.tipo === "icone") hero = spot(themeOf(il.icone).hero, s.hero, KIT_NAVY, "flex:none;filter:drop-shadow(0 3px 4px rgba(11,37,69,0.18))");
  const texts = [
    c.dado_chave ? `<div data-k="dado_chave" data-lines="2" data-fit="0.6" style="${COND};font-weight:800;font-size:${s.dado}px;line-height:0.98;color:${NAVY}">${esc(c.dado_chave)}</div>` : "",
    il.legenda ? `<div data-k="ilustracao" data-lines="2" data-fit="0.75" style="${COND};font-weight:700;font-size:${s.legend}px;line-height:1.05;letter-spacing:0.5px;text-transform:uppercase;color:${P.d}">${esc(il.legenda)}</div>` : "",
  ].filter(Boolean);
  const para = withPara && c.resumo_paragrafo ? `<div data-k="resumo_paragrafo" data-lines="${s.paraLines ?? 8}" data-fit="0.78" style="font-size:${s.para}px;line-height:1.38;color:${INK}">${multi(c.resumo_paragrafo)}</div>` : "";
  if (!hero && !texts.length && !para) return "";
  return `<div data-box style="min-width:0;background:#FFFFFF;border:1px solid ${CARD_LINE};border-radius:${s.radius}px;padding:${s.pad};box-shadow:0 2px 10px rgba(11,37,69,0.08);display:flex;flex-direction:column;gap:${s.gap}px;${style}">${
    hero || texts.length
      ? `<div style="display:flex;${s.stack ? "flex-direction:column;text-align:center;" : ""}align-items:center;gap:${s.gap}px;min-width:0">${hero}<div style="display:flex;flex-direction:column;gap:${Math.round(s.gap / 3)}px;min-width:0">${texts.join("")}</div></div>`
      : ""
  }${para}</div>`;
}

interface PontosSize {
  pad: string;
  radius: number;
  head: number;
  icon: number;
  text: number;
  detail: number;
  gap: number;
}
/** Painel de pontos-chave com ícone por item ("Destaque — detalhe" vira destaque em negrito + detalhe abaixo). */
function pontosPanel(c: VisualContent, P: CP, s: PontosSize, style = "") {
  if (!c.pontos_chave.length) return "";
  const items = c.pontos_chave
    .map((p) => {
      const m = /^(.+?)\s+[—–]\s+(.+)$/.exec(p);
      const body = m
        ? `<div style="font-weight:700;color:${NAVY};font-size:${s.text}px;line-height:1.2">${esc(m[1])}</div><div style="font-size:${s.detail}px;line-height:1.25;color:${MUTED}">${esc(m[2])}</div>`
        : `<div style="font-weight:600;color:${INK};font-size:${s.text}px;line-height:1.25">${esc(p)}</div>`;
      return `<div style="display:flex;gap:${Math.round(s.gap * 0.9)}px;align-items:flex-start;min-width:0">${spot(spotForText(p, "ok"), s.icon, NAVY, "flex:none;margin-top:1px")}<div data-k="pontos_chave" data-fit="0.75" style="min-width:0;font-size:${s.text}px">${body}</div></div>`;
    })
    .join("");
  return `<div data-box style="min-width:0;background:#FFFFFF;border:1px solid ${CARD_LINE};border-radius:${s.radius}px;padding:${s.pad};display:flex;flex-direction:column;gap:${s.gap}px;${style}"><div style="${COND};font-weight:800;font-size:${s.head}px;letter-spacing:1px;text-transform:uppercase;color:${P.d}">Pontos-chave</div>${items}</div>`;
}

interface NoteSize {
  width: number | null;
  pad: string;
  rot: number;
  title: number;
  text: number;
  lines: number;
  bulb: number;
  tape: [number, number];
}
/** "Post-it" amarelo inclinado, com fita, lâmpada e sublinhado laranja. */
const postIt = (text: string, s: NoteSize, style = "") =>
  text
    ? `<div data-k="tome_nota" style="position:relative;${s.width ? `width:${s.width}px;` : ""}box-sizing:border-box;flex:none;background:linear-gradient(160deg,#FFF3AE 0%,#FFE57E 55%,#FFD95A 100%);padding:${s.pad};transform:rotate(${s.rot}deg);box-shadow:0 ${Math.round(s.title / 5)}px ${Math.round(s.title / 2)}px rgba(11,37,69,0.22);border-radius:${Math.max(3, Math.round(s.title / 10))}px;display:flex;flex-direction:column;gap:${Math.round(s.title / 8)}px;${style}"><div style="position:absolute;top:-${Math.round(s.tape[1] / 2)}px;left:50%;width:${s.tape[0]}px;height:${s.tape[1]}px;margin-left:-${Math.round(s.tape[0] / 2)}px;background:rgba(158,216,230,0.85);transform:rotate(-4deg)"></div><div style="display:flex;align-items:center;gap:${Math.round(s.bulb / 4)}px">${spot("lampada", s.bulb, NAVY)}<div style="${CAV};font-weight:700;font-size:${s.title}px;line-height:0.95;color:${NAVY};transform:rotate(-4deg)">Tome nota!</div></div><div data-k="tome_nota" data-lines="${s.lines}" data-fit="0.7" style="${CAV};font-weight:700;font-size:${s.text}px;line-height:1.02;color:${INK}">${multi(text)}</div><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" style="display:block;width:70%;height:${Math.max(4, Math.round(s.text / 5))}px"><path d="M2 5C30 2 60 2 98 4" fill="none" stroke="#F08A24" stroke-width="2.4" stroke-linecap="round"></path></svg></div>`
    : "";

/** Cabeçalho de seção numerada (círculo com número + aba azul-marinho inclinada). */
const sectionHead = (n: number, title: string, P: CP, s: { circle: number; font: number }, k = "") =>
  `<div style="flex:none;display:flex;align-items:center;position:relative;z-index:1"><div style="width:${s.circle}px;height:${s.circle}px;flex:none;border-radius:50%;background:linear-gradient(145deg, ${P.p} 0%, ${P.d} 100%);border:${Math.round(s.circle / 13)}px solid #FFFFFF;box-shadow:0 2px 6px rgba(11,37,69,0.3);display:flex;align-items:center;justify-content:center;${COND};font-style:italic;font-weight:800;font-size:${Math.round(s.circle * 0.6)}px;color:#FFFFFF;position:relative;z-index:2">${n}</div><div ${k ? `data-k="${k}" data-lines="1" data-fit="0.7" ` : ""}style="margin-left:-${Math.round(s.circle * 0.3)}px;background:${NAVY};color:#FFFFFF;${COND};font-weight:800;font-size:${s.font}px;letter-spacing:0.6px;text-transform:uppercase;padding:${Math.round(s.font * 0.28)}px ${Math.round(s.font * 1.3)}px ${Math.round(s.font * 0.28)}px ${Math.round(s.circle * 0.5)}px;clip-path:polygon(0 0, 100% 0, calc(100% - ${Math.round(s.font * 0.7)}px) 100%, 0 100%);min-width:0">${esc(title)}</div></div>`;

interface TableSize {
  radius: number;
  head: number;
  cellPad: string;
  first: number;
  cell: number;
  badge: number;
  end: number;
  stripe: number;
}
/** Tabela com linhas coloridas: especialidade/verde, vermelho (alerta), azul e cinza, com ícones. */
function colorTable(c: VisualContent, P: CP, s: TableSize) {
  const tab = c.tabela!;
  const n = tab.colunas.length;
  const cols = n === 2 ? "1.1fr 1.25fr" : "1.15fr 1fr 1.15fr";
  const head = tab.colunas.map((h, i) => `<div style="padding:${s.cellPad};${i ? "border-left:1px solid rgba(255,255,255,0.14);" : ""}min-width:0;overflow-wrap:anywhere">${esc(h)}</div>`).join("");
  let normal = 0;
  const rows = tab.linhas
    .map((r, i) => {
      const kind: TableRowKind = r.tipo;
      const look =
        kind === "alerta"
          ? { stripe: ALERT, bg: ALERT_SOFT, text: ALERT, badge: "alerta" as SpotName, end: "triangulo" as SpotName, endColor: ALERT }
          : kind === "destaque"
            ? { ...P.cycle[0], endColor: P.d }
            : (() => {
                const l = P.cycle[Math.min(normal++, P.cycle.length - 1)];
                return { ...l, endColor: l.stripe };
              })();
      const last = i === tab.linhas.length - 1;
      const cells = r.celulas
        .map((cell, j) => {
          if (j === 0)
            return `<div style="display:flex;align-items:center;gap:${Math.round(s.badge * 0.4)}px;padding:${s.cellPad};border-left:${s.stripe}px solid ${look.stripe};background:${look.bg};min-width:0">${spot(look.badge, s.badge)}<div style="font-weight:700;font-size:${s.first}px;line-height:1.2;color:${look.text};min-width:0;overflow-wrap:anywhere">${esc(cell)}</div></div>`;
          const isEnd = j === n - 1;
          return `<div style="display:flex;align-items:center;gap:${Math.round(s.end * 0.4)}px;padding:${s.cellPad};border-left:1px solid ${CARD_LINE};background:${isEnd ? look.bg : "#FFFFFF"};min-width:0">${isEnd ? spot(look.end, s.end, look.endColor) : ""}<div style="font-weight:${isEnd ? 600 : 500};font-size:${s.cell}px;line-height:1.25;color:${kind === "alerta" && isEnd ? ALERT : INK};min-width:0;overflow-wrap:anywhere">${esc(cell)}</div></div>`;
        })
        .join("");
      return `<div ${kind === "alerta" ? 'data-role="alert-row" ' : ""}style="display:grid;grid-template-columns:${cols};${last ? "" : `border-bottom:1px solid ${CARD_LINE};`}">${cells}</div>`;
    })
    .join("");
  return `<div data-k="tabela" data-box style="flex:none;border-radius:${s.radius}px;overflow:hidden;border:1px solid ${CARD_LINE};background:#FFFFFF;box-shadow:0 2px 10px rgba(11,37,69,0.08)"><div style="display:grid;grid-template-columns:${cols};background:${NAVY};color:#FFFFFF;${COND};font-weight:700;font-size:${s.head}px;letter-spacing:1px;text-transform:uppercase">${head}</div>${rows}</div>`;
}

interface AlertSize {
  border: number;
  radius: number;
  pad: string;
  icon: number;
  title: number;
  text: number;
  lines: number;
  gap: number;
}
/** Caixa "Pegadinha de prova!": sempre o vermelho de alerta #C8102E. */
const pegadinha = (text: string, s: AlertSize, style = "") =>
  text
    ? `<div data-role="alert" data-k="pegadinha" style="flex:none;border:${s.border}px solid ${ALERT};border-radius:${s.radius}px;background:linear-gradient(180deg,#FFFFFF 0%,${ALERT_SOFT} 100%);padding:${s.pad};display:flex;gap:${s.gap}px;align-items:center;box-shadow:0 2px 10px rgba(200,16,46,0.10);${style}">${spot("triangulo", s.icon, ALERT)}<div style="display:flex;flex-direction:column;gap:${Math.round(s.gap / 5)}px;min-width:0"><div data-role="alert-title" style="${COND};font-style:italic;font-weight:800;font-size:${s.title}px;line-height:0.95;letter-spacing:0.3px;text-transform:uppercase;color:${ALERT}">Pegadinha de prova!</div><div data-k="pegadinha" data-lines="${s.lines}" data-fit="0.75" style="font-size:${s.text}px;line-height:1.3;font-weight:500;color:${INK}">${multi(text)}</div></div></div>`
    : "";

interface StepsSize {
  radius: number;
  pad: string;
  headIcon: number;
  head: number;
  num: number;
  icon: number;
  text: number;
  gap: number;
}
/** Bloco de lista como faixa de passos numerados com ícones (ex.: "Depois de confirmar"). */
function steps(c: VisualContent, P: CP, s: StepsSize, style = "") {
  const b = c.bloco;
  if (!b || (!b.titulo && !b.itens.length)) return "";
  const items = b.itens
    .map(
      (it, i) =>
        `<div style="display:flex;align-items:center;gap:${Math.round(s.gap * 0.6)}px;min-width:0;padding:0 ${Math.round(s.gap * 0.7)}px;${i ? `border-left:2px dashed ${hexA(P.p, 0.45)};` : ""}"><div style="width:${s.num}px;height:${s.num}px;flex:none;border-radius:50%;background:${P.s};border:2px solid ${P.p};display:flex;align-items:center;justify-content:center;${COND};font-weight:800;font-size:${Math.round(s.num * 0.62)}px;color:${P.d}">${i + 1}</div>${spot(spotForText(it, "ok"), s.icon, NAVY)}<div data-k="bloco" data-lines="4" data-fit="0.75" style="min-width:0;font-size:${s.text}px;line-height:1.25;color:${INK}">${esc(it)}</div></div>`
    )
    .join("");
  return `<div data-box style="flex:none;border:2px solid ${hexA(P.p, 0.35)};background:#FFFFFF;border-radius:${s.radius}px;padding:${s.pad};display:flex;flex-direction:column;gap:${s.gap}px;${style}">${
    b.titulo
      ? `<div style="display:flex;align-items:center;gap:${Math.round(s.gap * 0.7)}px"><div style="width:${s.headIcon}px;height:${s.headIcon}px;flex:none;border-radius:50%;background:linear-gradient(145deg, ${P.p}, ${P.d});display:flex;align-items:center;justify-content:center">${spot("prancheta", Math.round(s.headIcon * 0.62), "#FFFFFF")}</div><div data-k="bloco" data-lines="1" data-fit="0.7" style="${COND};font-weight:800;font-size:${s.head}px;letter-spacing:0.6px;text-transform:uppercase;color:${P.d}">${esc(b.titulo)}</div></div>`
      : ""
  }${items ? `<div style="display:grid;grid-template-columns:repeat(${b.itens.length}, minmax(0, 1fr));margin:0 -${Math.round(s.gap * 0.7)}px">${items}</div>` : ""}</div>`;
}

function mnemonico(c: VisualContent, P: CP, s: { radius: number; head: number; letter: number; text: number }, n: number) {
  const m = c.mnemonico;
  if (!m || !m.itens.length) return "";
  return `<div data-k="mnemonico" style="flex:none;border-radius:${s.radius}px;overflow:hidden;border:1px solid ${CARD_LINE};background:#FFFFFF"><div style="background:${NAVY};color:#FFFFFF;${COND};font-weight:800;font-size:${s.head}px;letter-spacing:1px;text-transform:uppercase;padding:4px 16px">${n}. ${esc(m.titulo || "Mnemônico")}</div><div style="display:grid;grid-template-columns:repeat(${m.itens.length}, minmax(0, 1fr))">${m.itens
    .map(
      (it, i) =>
        `<div style="padding:6px 10px;text-align:center;${i ? `border-left:1px dashed ${P.p};` : ""}"><div data-k="mnemonico" style="${COND};font-weight:800;font-size:${s.letter}px;line-height:1;color:${P.d}">${esc(it.letra)}</div><div data-k="mnemonico" style="font-size:${s.text}px;line-height:1.2">${esc(it.texto)}</div></div>`
    )
    .join("")}</div></div>`;
}

const logo = (s: { logo: number; rev: number }, P: CP, align = "flex-start") =>
  `<div style="display:flex;flex-direction:column;align-items:${align};line-height:1;color:#FFFFFF;flex:none"><div style="font-weight:700;font-size:${s.logo}px;letter-spacing:-0.3px">Stazia<span style="color:${P.glow}">Med</span></div><div style="${COND};font-weight:600;font-size:${s.rev}px;letter-spacing:${Math.round(s.rev * 0.55)}px;margin-top:${Math.round(s.rev * 0.35)}px;color:#DCE6F2">REVALIDA</div></div>`;

interface FootSize {
  height: number;
  pad: string;
  logo: number;
  rev: number;
  src: number;
  pill: number;
}
/** Rodapé azul-marinho: marca, linha de fonte (pequena, à direita) e número da peça ou ID do card. */
function footer(P: CP, s: FootSize, src: string, right: string) {
  return `<div data-region="footer" style="flex:none;height:${s.height}px;box-sizing:border-box;background:${FOOTER_BG};padding:${s.pad};display:flex;align-items:center;justify-content:space-between;gap:${Math.round(s.logo)}px">${logo(s, P)}<div style="flex:1;min-width:0;display:flex;justify-content:flex-end;align-items:center;gap:${Math.round(s.logo * 0.6)}px">${
    src ? `<div data-k="fonte" data-lines="2" data-fit="0.75" style="min-width:0;${COND};font-weight:600;font-size:${s.src}px;line-height:1.35;letter-spacing:${(s.src * 0.12).toFixed(1)}px;text-transform:uppercase;color:#C3D0E2;text-align:right">${esc(src)}</div>` : ""
  }${right}</div></div>`;
}
const idPill = (text: string, P: CP, size: number, k: string, role = "") =>
  text
    ? `<div data-k="${k}" ${role ? `data-role="${role}" ` : ""}style="flex:none;background:${P.glow};color:${NAVY};${COND};font-weight:800;font-size:${size}px;letter-spacing:1px;padding:${Math.round(size * 0.12)}px ${Math.round(size * 0.6)}px;border-radius:999px;white-space:nowrap">${esc(text)}</div>`
    : "";

const artboard = (c: VisualContent, side: VisualSide, w: number, h: number, inner: string, o: BuildOptions, extra = "") =>
  `<div class="vm-artboard" data-artboard="${side}" data-model="${c.model}" data-template="criativo-1" data-specialty="${c.specialty.key}" data-card-id="${esc(c.card_id)}" data-order="${c.ordem}" style="position:relative;width:${w}px;height:${h}px;box-sizing:border-box;background:${BODY_BG};color:${INK};font-family:'Barlow','Segoe UI',sans-serif;display:flex;flex-direction:column;overflow:hidden;${extra}">${inner}${
    o.guides ? guidesHtml(c.model, side, w, h) : ""
  }</div>`;

const hasTable = (c: VisualContent) => Boolean(c.tabela && c.tabela.linhas.length);

// ---------------------------------------------------------------------------- A4 794 × 1123 (96 dpi)
function a4(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const pill: PillSize = { font: 12.5, pad: "4px 12px", icon: 15, gap: 8 };
  let n = 0;
  const header = `<div data-region="header" style="flex:none;position:relative;min-height:216px;padding-bottom:30px;box-sizing:border-box;background:${HEADER_BG};overflow:hidden">
${headerScene(c, P, "a4", "position:absolute;right:6px;top:8px;width:270px;height:203px")}
<div style="position:relative;padding:22px 0 0 32px;width:540px;display:flex;flex-direction:column;gap:6px">
${titleHtml(c, P, 52, 3, 0.6)}
${c.subtitulo ? `<div data-k="subtitulo" data-lines="1" data-fit="0.7" style="${COND};font-weight:700;font-size:22px;line-height:1.05;text-transform:uppercase;color:#E3EAF4;letter-spacing:0.4px">${esc(c.subtitulo)}</div>` : ""}
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${specialtyPill(c, P, pill)}${seloPill(c, P, pill)}${updatedPill(c, P, pill)}</div>
</div></div>`;
  const main = mainCard(c, P, o, { pad: "14px 16px", radius: 14, hero: 62, dado: 30, legend: 14, para: 14.5, paraLines: 8, gap: 12 }, true);
  const pontos = pontosPanel(c, P, { pad: "12px 14px", radius: 14, head: 15, icon: 22, text: 13, detail: 12, gap: 8 }, "flex:1");
  const nota = postIt(c.tome_nota, { width: pontos ? 166 : null, pad: "22px 12px 10px", rot: 3.5, title: pontos ? 25 : 30, text: pontos ? 21 : 24, lines: 6, bulb: pontos ? 22 : 28, tape: [64, 16] }, pontos ? "align-self:center" : "align-self:center;width:250px");
  const right = pontos || nota ? `<div style="display:flex;gap:14px;align-items:stretch;min-width:0;padding:4px 6px 4px 0">${pontos}${nota}</div>` : "";
  const row1 = main || right ? `<div style="flex:none;display:grid;grid-template-columns:${main && right ? "1fr 1.15fr" : "1fr"};gap:12px;align-items:stretch">${main}${right}</div>` : "";
  const table = hasTable(c)
    ? `<div style="flex:none;display:flex;flex-direction:column;gap:8px">${sectionHead(++n, c.tabela!.titulo || "Resumo em tabela", P, { circle: 40, font: 19 }, c.tabela!.titulo ? "tabela" : "")}${colorTable(c, P, { radius: 10, head: 13, cellPad: "7px 12px", first: 13.5, cell: 13, badge: 24, end: 22, stripe: 5 })}</div>`
    : "";
  const peg = pegadinha(c.pegadinha, { border: 2.5, radius: 14, pad: "10px 16px", icon: 50, title: 25, text: 14, lines: 3, gap: 14 });
  const bl = steps(c, P, { radius: 14, pad: "10px 16px 12px", headIcon: 32, head: 21, num: 24, icon: 30, text: 12.5, gap: 10 });
  const mn = mnemonico(c, P, { radius: 12, head: 16, letter: 24, text: 12.5 }, ++n);
  const inner = `${header}
${band(c, P, { font: 18, pad: "7px 16px", margin: "-16px 18px 0", icon: 24, radius: 12 })}
<div data-region="body" data-box style="flex:1;min-height:0;padding:14px 18px 12px;display:flex;flex-direction:column;gap:10px;justify-content:space-between;font-size:14px">${row1}${table}${peg}${bl}${mn}</div>
${footer(P, { height: 62, pad: "0 26px", logo: 23, rev: 10, src: 10.5, pill: 15 }, c.fonte, idPill(c.paginacao, P, 15, "paginacao"))}`;
  return [{ side: "single", width: 794, height: 1123, html: artboard(c, "single", 794, 1123, inner, o, "font-size:14px") }];
}

// ---------------------------------------------------------------------------- feed 1080 × 1350
function feed(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const pill: PillSize = { font: 19, pad: "6px 18px", icon: 22, gap: 10 };
  const header = `<div data-region="header" style="flex:none;position:relative;min-height:390px;padding-bottom:44px;box-sizing:border-box;background:${HEADER_BG};overflow:hidden">
${headerScene(c, P, "feed", "position:absolute;right:8px;top:10px;width:440px;height:330px")}
<div style="position:relative;padding:40px 0 0 48px;width:640px;display:flex;flex-direction:column;gap:10px">
${titleHtml(c, P, 92, 3, 0.55)}
${c.subtitulo ? `<div data-k="subtitulo" data-lines="2" data-fit="0.7" style="${COND};font-weight:700;font-size:34px;line-height:1.02;text-transform:uppercase;color:#E3EAF4;letter-spacing:0.5px">${esc(c.subtitulo)}</div>` : ""}
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">${specialtyPill(c, P, pill)}${seloPill(c, P, pill)}${updatedPill(c, P, pill)}</div>
</div></div>`;
  const main = mainCard(c, P, o, { pad: "20px 24px", radius: 22, hero: 170, dado: 64, legend: 24, gap: 18, stack: true }, false, "flex:1;justify-content:center");
  const nota = postIt(c.tome_nota, { width: null, pad: "30px 22px 14px", rot: -2.5, title: 44, text: 36, lines: 3, bulb: 40, tape: [100, 24] }, "margin:6px 14px 4px");
  const left = main || nota ? `<div style="display:flex;flex-direction:column;gap:18px;min-width:0">${main}${nota}</div>` : "";
  const pontos = pontosPanel(c, P, { pad: "22px 26px", radius: 22, head: 28, icon: 50, text: 29, detail: 24, gap: 24 }, "justify-content:center");
  const row1 = left || pontos ? `<div style="flex:1 0 auto;display:grid;grid-template-columns:${left && pontos ? "1fr 1.05fr" : "1fr"};gap:18px;align-items:stretch">${left}${pontos}</div>` : "";
  const table = hasTable(c)
    ? `<div style="flex:none;display:flex;flex-direction:column;gap:10px">${sectionHead(1, c.tabela!.titulo || "Resumo em tabela", P, { circle: 54, font: 27 }, c.tabela!.titulo ? "tabela" : "")}${colorTable(c, P, { radius: 16, head: 20, cellPad: "10px 16px", first: 22, cell: 21, badge: 36, end: 32, stripe: 7 })}</div>`
    : "";
  const peg = pegadinha(c.pegadinha, { border: 3, radius: 22, pad: "14px 22px", icon: 72, title: 38, text: 24, lines: 3, gap: 20 });
  const inner = `${header}
${band(c, P, { font: 27, pad: "10px 22px", margin: "-24px 26px 0", icon: 34, radius: 16 })}
<div data-region="body" data-box style="flex:1;min-height:0;padding:18px 26px 16px;display:flex;flex-direction:column;gap:18px">${row1}${table}${peg}</div>
${footer(P, { height: 92, pad: "0 40px", logo: 36, rev: 15, src: 16, pill: 26 }, c.fonte, idPill(c.paginacao, P, 26, "paginacao"))}`;
  return [{ side: "single", width: 1080, height: 1350, html: artboard(c, "single", 1080, 1350, inner, o) }];
}

// ---------------------------------------------------------------------------- story 1080 × 1920
function story(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const pill: PillSize = { font: 24, pad: "7px 22px", icon: 28, gap: 12 };
  const nota = postIt(c.tome_nota, { width: 330, pad: "34px 26px 16px", rot: 3.5, title: 50, text: 40, lines: 4, bulb: 46, tape: [110, 26] }, "align-self:center");
  // A faixa azul-marinho cobre a zona segura do topo (190 px): ali só entra a ilustração (decorativa).
  const header = `<div data-region="safe-top" style="flex:none;position:relative;background:${HEADER_BG};overflow:hidden;padding:${STORY_SAFE.top + 24}px 64px 60px;display:flex;flex-direction:column;gap:22px">
${headerScene(c, P, "story", "position:absolute;right:0;top:30px;width:540px;height:405px")}
<div style="position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:12px;width:440px;min-height:180px">${specialtyPill(c, P, pill)}${seloPill(c, P, pill)}${updatedPill(c, P, pill)}</div>
<div style="position:relative;display:flex;gap:30px;align-items:flex-end">
<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">${titleHtml(c, P, 116, 3, 0.55)}${c.subtitulo ? `<div data-k="subtitulo" data-lines="2" data-fit="0.7" style="${COND};font-weight:700;font-size:44px;line-height:1.02;text-transform:uppercase;color:#E3EAF4">${esc(c.subtitulo)}</div>` : ""}</div>
${nota}
</div></div>`;
  const main = mainCard(c, P, o, { pad: "24px 30px", radius: 26, hero: 120, dado: 66, legend: 28, gap: 22 }, false, "justify-content:center");
  const pontos = pontosPanel(c, P, { pad: "22px 26px", radius: 26, head: 30, icon: 48, text: 30, detail: 25, gap: 16 });
  const row1 = main || pontos ? `<div style="flex:1 0 auto;display:grid;grid-template-columns:${main && pontos ? "0.9fr 1.1fr" : "1fr"};gap:22px;align-items:stretch">${main}${pontos}</div>` : "";
  const table = hasTable(c)
    ? `<div style="flex:none;display:flex;flex-direction:column;gap:12px">${sectionHead(1, c.tabela!.titulo || "Resumo em tabela", P, { circle: 66, font: 34 }, c.tabela!.titulo ? "tabela" : "")}${colorTable(c, P, { radius: 20, head: 26, cellPad: "14px 20px", first: 29, cell: 28, badge: 46, end: 40, stripe: 9 })}</div>`
    : "";
  const peg = pegadinha(c.pegadinha, { border: 4, radius: 26, pad: "20px 28px", icon: 92, title: 48, text: 31, lines: 4, gap: 24 });
  const inner = `${header}
${band(c, P, { font: 34, pad: "14px 28px", margin: "-34px 40px 0", icon: 44, radius: 20 })}
<div data-region="body" data-box style="flex:1;min-height:0;padding:28px 50px 26px;display:flex;flex-direction:column;gap:26px">${row1}${table}${peg}</div>
${footer(P, { height: 104 + STORY_SAFE.bottom, pad: `0 56px ${STORY_SAFE.bottom}px`, logo: 42, rev: 18, src: 19, pill: 30 }, c.fonte, idPill(c.paginacao, P, 30, "paginacao"))}`;
  return [{ side: "single", width: 1080, height: 1920, html: artboard(c, "single", 1080, 1920, inner, o) }];
}

// ---------------------------------------------------------------------------- flashcards
const cardIdText = (c: VisualContent, o: BuildOptions) => c.card_id || (o.preview ? "ID automático" : "");

function cardHeader(c: VisualContent, P: CP, uid: string, s: { h: number; pad: string; tema: number; pill: PillSize; sceneW: number; sceneH: number; textW: number }, first: string) {
  return `<div data-region="header" style="flex:none;position:relative;height:${s.h}px;background:${HEADER_BG};overflow:hidden">
${headerScene(c, P, uid, `position:absolute;right:-10px;top:${Math.round((s.h - s.sceneH) / 2)}px;width:${s.sceneW}px;height:${s.sceneH}px`)}
<div style="position:relative;padding:${s.pad};width:${s.textW}px;display:flex;flex-direction:column;gap:${Math.round(s.tema * 0.3)}px">
<div style="display:flex;gap:${s.pill.gap}px;flex-wrap:wrap;align-items:center">${first}</div>
${c.tema ? `<div data-k="tema" data-lines="2" data-fit="0.6" style="${COND};font-weight:800;font-size:${s.tema}px;line-height:0.92;text-transform:uppercase;color:${P.glow};letter-spacing:-0.3px">${esc(c.tema)}</div>` : ""}
</div></div>`;
}

function flashcardDigital(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const pill: PillSize = { font: 22, pad: "6px 20px", icon: 26, gap: 12 };
  const hs = { h: 290, pad: "44px 0 0 56px", tema: 66, pill, sceneW: 400, sceneH: 300, textW: 640 };
  const head = (uid: string) => cardHeader(c, P, uid, hs, `${specialtyPill(c, P, pill)}${nivelPill(c, P, pill)}${updatedPill(c, P, pill)}`);
  const foot = (src: string) => footer(P, { height: 104, pad: "0 56px", logo: 38, rev: 16, src: 18, pill: 30 }, src, idPill(cardIdText(c, o), P, 30, "card_id", "card-id"));
  const front = `${head("fd-front")}
<div data-region="body" data-box style="flex:1;min-height:0;padding:36px 48px 30px;display:flex;flex-direction:column;gap:26px">
<div data-box style="flex:1;min-height:0;background:#FFFFFF;border:2px solid ${CARD_LINE};border-radius:32px;box-shadow:0 4px 18px rgba(11,37,69,0.10);padding:34px 42px;display:flex;flex-direction:column;justify-content:center;gap:28px">
<div style="display:flex;align-items:center;gap:18px">${spot("pergunta", 78)}<div style="${COND};font-weight:800;font-size:36px;letter-spacing:5px;text-transform:uppercase;color:${P.d}">Pergunta</div></div>
<div data-k="pergunta" data-lines="6" data-fit="0.45" style="${COND};font-weight:800;font-size:90px;line-height:0.98;text-transform:uppercase;color:${NAVY};letter-spacing:-0.3px">${multi(c.pergunta)}</div>
<div style="width:200px;height:10px;border-radius:6px;background:linear-gradient(90deg, ${P.p}, ${P.glow});flex:none"></div>
</div>
<div style="flex:none;align-self:center;display:flex;align-items:center;gap:14px;background:#FFFFFF;border:2px solid ${hexA(P.p, 0.4)};border-radius:999px;padding:8px 30px">${spot("virar", 42, P.d)}<div style="${CAV};font-weight:700;font-size:46px;line-height:1;color:${P.d}">toque para virar</div></div>
</div>
${foot("")}`;
  const back = `${head("fd-back")}
<div data-region="body" data-box style="flex:1;min-height:0;padding:32px 48px 30px;display:flex;flex-direction:column;justify-content:center;gap:28px">
<div style="flex:none;background:linear-gradient(120deg, ${P.d} 0%, ${P.p} 100%);border:3px solid ${hexA(P.glow, 0.7)};border-radius:30px;padding:24px 34px 28px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 18px rgba(11,37,69,0.16)">
<div style="display:flex;align-items:center;gap:14px"><div style="width:52px;height:52px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;flex:none"><svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true"><path d="M11 25l9 9 17-19" fill="none" stroke="${P.d}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path></svg></div><div style="${COND};font-weight:800;font-size:34px;letter-spacing:5px;text-transform:uppercase;color:#FFFFFF">Resposta</div></div>
<div data-k="resposta" data-lines="2" data-fit="0.55" style="${COND};font-weight:800;font-size:74px;line-height:0.98;text-transform:uppercase;color:#FFFFFF">${esc(c.resposta)}</div>
</div>
${
  c.explicacao
    ? `<div data-box style="flex:0 1 auto;min-height:0;background:#FFFFFF;border:2px solid ${CARD_LINE};border-radius:30px;padding:28px 34px 32px;display:flex;flex-direction:column;gap:16px;box-shadow:0 4px 18px rgba(11,37,69,0.08)"><div style="display:flex;align-items:center;gap:14px">${spot("lampada", 52, P.d)}<div style="${COND};font-weight:800;font-size:34px;letter-spacing:3px;text-transform:uppercase;color:${P.d}">Explicação</div></div><div data-k="explicacao" data-lines="${c.pegadinha ? 6 : 10}" data-fit="0.7" style="font-size:40px;line-height:1.3;font-weight:500;color:${INK}">${multi(c.explicacao)}</div></div>`
    : ""
}
${pegadinha(c.pegadinha, { border: 3, radius: 26, pad: "16px 24px", icon: 70, title: 40, text: 29, lines: 2, gap: 20 })}
</div>
${foot(c.fonte)}`;
  return [
    { side: "front", width: 1080, height: 1350, html: artboard(c, "front", 1080, 1350, front, o) },
    { side: "back", width: 1080, height: 1350, html: artboard(c, "back", 1080, 1350, back, o) },
  ];
}

/** A6: cabeçalho e rodapé azul-marinho; conteúdo a 7 mm da borda (margem segura 5 mm). */
export const A6_CRIATIVO = { header: 420, footer: 230, stripe: 16 };

function flashcardA6(c: VisualContent, o: BuildOptions): Artboard[] {
  const P = pal(c);
  const W = 1240;
  const H = 1748;
  const I = A6_PRINT.inset;
  const pill: PillSize = { font: 30, pad: "8px 26px", icon: 34, gap: 14 };
  const id = idPill(cardIdText(c, o), P, 36, "card_id", "card-id");
  const hs = { h: A6_CRIATIVO.header, pad: `${I}px 0 0 ${I}px`, tema: 80, pill, sceneW: 470, sceneH: 352, textW: 760 };
  const stripe = `<div data-bg style="height:${A6_CRIATIVO.stripe}px;flex:none;background:${P.p}"></div>`;
  const foot = (left: string, right: string) =>
    `<div data-region="footer" style="flex:none;height:${A6_CRIATIVO.footer}px;box-sizing:border-box;background:${FOOTER_BG};padding:30px ${I}px ${I}px;display:flex;align-items:center;justify-content:space-between;gap:30px">${left}${right}</div>`;
  const front = `${cardHeader(c, P, "a6-front", hs, `${specialtyPill(c, P, pill)}${id}`)}${stripe}
<div data-region="body" data-box style="flex:1;min-height:0;padding:44px ${I}px 36px;display:flex;flex-direction:column;gap:30px">
<div data-box style="flex:1;min-height:0;background:#FFFFFF;border:3px solid ${CARD_LINE};border-radius:40px;box-shadow:0 6px 22px rgba(11,37,69,0.10);padding:40px 48px;display:flex;flex-direction:column;justify-content:center;gap:34px">
<div style="display:flex;align-items:center;gap:22px">${spot("pergunta", 96)}<div style="${COND};font-weight:800;font-size:46px;letter-spacing:6px;text-transform:uppercase;color:${P.d}">Pergunta</div></div>
<div data-k="pergunta" data-lines="6" data-fit="0.45" style="${COND};font-weight:800;font-size:112px;line-height:0.98;text-transform:uppercase;color:${NAVY};letter-spacing:-0.3px">${multi(c.pergunta)}</div>
<div style="width:260px;height:12px;border-radius:8px;background:linear-gradient(90deg, ${P.p}, ${P.glow});flex:none"></div>
</div></div>
${foot(nivelPill(c, P, pill) || "<div></div>", logo({ logo: 46, rev: 20 }, P, "flex-end"))}`;
  const back = `${cardHeader(c, P, "a6-back", hs, `${id}${specialtyPill(c, P, pill)}`)}${stripe}
<div data-region="body" data-box style="flex:1;min-height:0;padding:40px ${I}px 34px;display:flex;flex-direction:column;justify-content:center;gap:34px">
<div style="flex:none;background:linear-gradient(120deg, ${P.d} 0%, ${P.p} 100%);border:4px solid ${hexA(P.glow, 0.7)};border-radius:36px;padding:28px 40px 34px;display:flex;flex-direction:column;gap:12px">
<div style="display:flex;align-items:center;gap:16px"><div style="width:62px;height:62px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;flex:none"><svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true"><path d="M11 25l9 9 17-19" fill="none" stroke="${P.d}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path></svg></div><div style="${COND};font-weight:800;font-size:42px;letter-spacing:6px;text-transform:uppercase;color:#FFFFFF">Resposta</div></div>
<div data-k="resposta" data-lines="2" data-fit="0.55" style="${COND};font-weight:800;font-size:88px;line-height:0.98;text-transform:uppercase;color:#FFFFFF">${esc(c.resposta)}</div>
</div>
${
  c.como_lembrar
    ? `<div data-box style="flex:0 1 auto;min-height:0;position:relative;background:linear-gradient(160deg,#FFF3AE 0%,#FFE57E 60%,#FFD95A 100%);border-radius:10px;padding:44px 42px 30px;transform:rotate(-1deg);box-shadow:0 8px 20px rgba(11,37,69,0.18);display:flex;flex-direction:column;gap:14px;margin:6px 10px"><div style="position:absolute;top:-16px;left:50%;width:170px;height:34px;margin-left:-85px;background:rgba(158,216,230,0.85);transform:rotate(-3deg)"></div><div style="display:flex;align-items:center;gap:16px">${spot("lampada", 62, NAVY)}<div style="${CAV};font-weight:700;font-size:72px;line-height:0.95;color:${NAVY}">Como lembrar</div></div><div data-k="como_lembrar" data-lines="${c.pegadinha ? 6 : 9}" data-fit="0.7" style="font-size:44px;line-height:1.28;font-weight:500;color:${INK}">${multi(c.como_lembrar)}</div></div>`
    : ""
}
${pegadinha(c.pegadinha, { border: 4, radius: 32, pad: "20px 30px", icon: 90, title: 52, text: 38, lines: 2, gap: 24 })}
${c.referencia ? `<div style="flex:none;display:flex;align-items:center;gap:16px;padding-top:18px;border-top:3px solid ${CARD_LINE}">${spot("livro", 46, NAVY)}<div data-k="referencia" data-lines="2" data-fit="0.75" style="font-size:34px;line-height:1.2;font-weight:600;color:${NAVY};min-width:0">${multi(c.referencia)}</div></div>` : ""}
</div>
${foot(logo({ logo: 46, rev: 20 }, P), c.fonte ? `<div data-k="fonte" data-lines="2" data-fit="0.75" style="min-width:0;${COND};font-weight:600;font-size:26px;line-height:1.3;letter-spacing:2px;text-transform:uppercase;color:#C3D0E2;text-align:right">${esc(c.fonte)}</div>` : "")}`;
  return [
    { side: "front", width: W, height: H, html: artboard(c, "front", W, H, front, o) },
    { side: "back", width: W, height: H, html: artboard(c, "back", W, H, back, o) },
  ];
}

/** Folha de impressão do A6 criativo: a sangria repete o azul-marinho do cabeçalho e do rodapé e o filete da especialidade. */
export function printSheetCriativo(a: Artboard, c: VisualContent) {
  const b = A6_PRINT.bleed;
  const W = a.width + 2 * b;
  const H = a.height + 2 * b;
  const tema = corDoCampo(c.tema_cor ?? "");
  const P = tema ? { primary: tema.primaria } : paletteOf(c.specialty.key);
  return `<div class="vm-sheet" data-sheet="${a.side}" style="position:relative;width:${W}px;height:${H}px;background:${BODY_BG};overflow:hidden;break-after:page"><div style="position:absolute;left:0;top:0;width:${W}px;height:${b + A6_CRIATIVO.header}px;background:#0B2545"></div><div style="position:absolute;left:0;top:${b + A6_CRIATIVO.header}px;width:${W}px;height:${A6_CRIATIVO.stripe}px;background:${P.primary}"></div><div style="position:absolute;left:0;bottom:0;width:${W}px;height:${b + A6_CRIATIVO.footer}px;background:#0B2545"></div><div style="position:absolute;left:${b}px;top:${b}px">${a.html}</div></div>`;
}

export const CRIATIVO_BUILDERS: Record<VisualContent["model"], (c: VisualContent, o: BuildOptions) => Artboard[]> = {
  feed,
  a4,
  story,
  flashcard_digital: flashcardDigital,
  flashcard_a6: flashcardA6,
};
