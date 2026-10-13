/**
 * Cor de cada tema (GR-001 a GR-100) no modelo visual criativo-1.
 *
 * Regra do dono (2026-10-13): "cada tema terá uma cor". A cor-modelo é a do GR-001 (tuberculose), que o dono aprovou:
 *   destaque #2E9B67 · escura #1B6B45 · clara/fundo #E9F6EF · brilho (no azul-marinho) #5FE6C0.
 * Os outros 99 temas repetem a MESMA estrutura (mesma luminosidade e saturação em OKLCH, só muda o tom),
 * então o contraste fica igual ao do GR-001. Cada área tem uma família de tons; dentro da área, temas vizinhos
 * pulam de tom e alternam um pouco a luminosidade para ficarem bem diferentes.
 * O amarelo das caixas "Atenção"/post-it nunca é cor de tema. O vermelho é a família de Ginecologia e Obstetrícia
 * (decisão do dono, 2026-10-13: "Ginecologia vermelho") e fica proibido nas outras 6 áreas. Nos temas vermelhos,
 * a caixa "Pegadinha de prova!" ganha o reforço de alerta (faixa listrada e triângulo cheio): ver temaVermelho().
 *
 * Os dados prontos ficam em paletaTemas.data.ts (gerado por scripts/aulas/paleta-temas.mts).
 */
import { PALETA_TEMAS } from "./paletaTemas.data";

export interface CorTema {
  /** Cor de destaque (faixas, filetes, números das seções). */
  primaria: string;
  /** Versão escura (texto colorido sobre branco, início dos gradientes). */
  escura: string;
  /** Versão clara (fundo de linhas e caixas). */
  clara: string;
  /** Brilho sobre o azul-marinho (2ª linha do título, selos, "Med" da marca). */
  brilho: string;
}

export interface TemaPaleta extends CorTema {
  id: string;
  titulo: string;
  area: string;
  area_nome: string;
  /** Tom em OKLCH (graus), para quem mantém a paleta. */
  tom: number;
}

/** Cor-modelo (GR-001), sem nenhuma mudança. */
export const COR_MODELO: CorTema = { primaria: "#2E9B67", escura: "#1B6B45", clara: "#E9F6EF", brilho: "#5FE6C0" };

/** Família de tons (OKLCH, graus) de cada área. Fora: vermelho (alerta, ~22°) e amarelo/laranja (Atenção, post-it, 53° a 116°). */
export const FAIXAS_AREA: Record<string, { de: number; ate: number; nome: string; croma?: number }> = {
  cm: { de: 119, ate: 174, nome: "verdes" },
  cir: { de: 179, ate: 212, nome: "petróleo e ciano" },
  ped: { de: 217, ate: 255, nome: "azuis" },
  mfc: { de: 260, ate: 275, nome: "índigo" },
  sm: { de: 280, ate: 292, nome: "violeta" },
  sc: { de: 297, ate: 310, nome: "roxo-magenta" },
  // vermelhos de verdade pedem um pouco mais de saturação (o contraste é conferido do mesmo jeito)
  go: { de: 2, ate: 32, nome: "vermelhos", croma: 1.3 },
};
export const TONS_PROIBIDOS: { de: number; ate: number; motivo: string; exceto?: string[] }[] = [
  { de: 350, ate: 360, motivo: "vermelho de alerta (Pegadinha)", exceto: ["go"] },
  { de: 0, ate: 52, motivo: "vermelho de alerta (Pegadinha)", exceto: ["go"] },
  { de: 53, ate: 116, motivo: "amarelo/laranja (Atenção e post-it)" },
];

/** Tom proibido para a área? (o vermelho só é permitido em Ginecologia e Obstetrícia). */
export function tomProibido(h: number, area: string) {
  return TONS_PROIBIDOS.find((f) => h >= f.de && h <= f.ate && !(f.exceto ?? []).includes(area)) ?? null;
}

/** A cor do tema é da família vermelha (perto do vermelho de alerta)? Aí a Pegadinha recebe o reforço visual. */
export function temaVermelho(c: CorTema | null | undefined): boolean {
  if (!c) return false;
  const h = hexParaOklch(c.primaria)[2];
  return h >= 345 || h <= 52;
}

// ---------------------------------------------------------------------------- conversão de cor (OKLab/OKLCH ↔ sRGB)
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexParaRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbParaHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
export function hexParaOklch(h: string): [number, number, number] {
  const [r, g, b] = hexParaRgb(h).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}
function oklchParaRgbLin(L: number, C: number, H: number): number[] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
/** OKLCH → hex, reduzindo a saturação até caber no sRGB (o tom e a luminosidade ficam). */
export function oklchParaHex(L: number, C: number, H: number): string {
  let c = C;
  for (let i = 0; i < 60; i++) {
    const lin = oklchParaRgbLin(L, c, H);
    if (lin.every((x) => x >= -0.0005 && x <= 1.0005)) return rgbParaHex(lin.map(fromLin));
    c *= 0.96;
  }
  return rgbParaHex(oklchParaRgbLin(L, 0, H).map(fromLin));
}

/** Contraste WCAG 2 entre duas cores (1 a 21). */
export function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bb] = hexParaRgb(h).map(toLin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => p - q);
  return (y + 0.05) / (x + 0.05);
}
/** Distância de cor (OKLab, euclidiana). 0,02 já é perceptível; acima de 0,06 é bem diferente. */
export function distancia(a: string, b: string): number {
  const [La, Ca, Ha] = hexParaOklch(a);
  const [Lb, Cb, Hb] = hexParaOklch(b);
  const xa = Ca * Math.cos((Ha * Math.PI) / 180), ya = Ca * Math.sin((Ha * Math.PI) / 180);
  const xb = Cb * Math.cos((Hb * Math.PI) / 180), yb = Cb * Math.sin((Hb * Math.PI) / 180);
  return Math.hypot(La - Lb, xa - xb, ya - yb);
}

// ---------------------------------------------------------------------------- geração (estrutura do GR-001 com outro tom)
const MODELO_OKLCH = {
  primaria: hexParaOklch(COR_MODELO.primaria),
  escura: hexParaOklch(COR_MODELO.escura),
  clara: hexParaOklch(COR_MODELO.clara),
  brilho: hexParaOklch(COR_MODELO.brilho),
};

/**
 * Cores de um tema com o tom H (OKLCH). `dl` muda um pouco a luminosidade da primária e da escura
 * (variação entre temas vizinhos); clara e brilho ficam iguais ao modelo, só mudando o tom.
 */
export function corDoTom(H: number, dl = 0, croma = 1): CorTema {
  const m = MODELO_OKLCH;
  const dh = (x: number) => (H + (x - m.primaria[2]) + 360) % 360;
  return {
    primaria: oklchParaHex(m.primaria[0] + dl, m.primaria[1] * croma, H),
    escura: oklchParaHex(m.escura[0] + dl * 0.6, m.escura[1] * croma, dh(m.escura[2])),
    clara: oklchParaHex(m.clara[0], m.clara[1], dh(m.clara[2])),
    brilho: oklchParaHex(m.brilho[0], m.brilho[1], dh(m.brilho[2])),
  };
}

/** Exigências de leitura (as mesmas do GR-001, que o dono aprovou). */
export const REGRAS_CONTRASTE = [
  { nome: "Texto branco sobre a cor escura (faixas, cartão de resposta)", a: "#FFFFFF", b: "escura", min: 4.5 },
  { nome: "Texto branco grande e em negrito sobre a cor de destaque", a: "#FFFFFF", b: "primaria", min: 3 },
  { nome: "Texto na cor escura sobre o branco (títulos de painel)", a: "escura", b: "#FFFFFF", min: 4.5 },
  { nome: "Texto na cor escura sobre a cor clara (números, caixas)", a: "escura", b: "clara", min: 4.5 },
  { nome: "Brilho sobre o azul-marinho (2ª linha do título, selos)", a: "brilho", b: "#0B2545", min: 4.5 },
  { nome: "Azul-marinho sobre a cor clara (texto das linhas da tabela)", a: "#0B2545", b: "clara", min: 7 },
] as const;

export function conferirContraste(c: CorTema) {
  const pick = (x: string) => (x.startsWith("#") ? x : (c as any)[x]);
  return REGRAS_CONTRASTE.map((r) => {
    const v = contraste(pick(r.a), pick(r.b));
    return { regra: r.nome, valor: Math.round(v * 100) / 100, minimo: r.min, ok: v >= r.min };
  });
}

/** Ajusta a luminosidade até passar em todas as regras (raro: só alguns tons claros pedem). */
export function corSegura(H: number, dl = 0, croma = 1): CorTema {
  for (let k = 0; k < 20; k++) {
    const c = corDoTom(H, dl - k * 0.01, croma);
    if (conferirContraste(c).every((x) => x.ok)) return c;
  }
  return corDoTom(H, dl - 0.2, croma);
}

// ---------------------------------------------------------------------------- uso nas peças
const HEX = /^#[0-9a-f]{6}$/i;
const ID_TEMA = /^GR-\d{3}$/i;

/** Valor aceito no campo tema_cor: vazio, um tema (GR-001…GR-100) ou uma cor #RRGGBB. */
export function temaCorValido(v: string): boolean {
  const s = String(v ?? "").trim();
  return !s || (ID_TEMA.test(s) && Boolean(PALETA_TEMAS[s.toUpperCase()])) || HEX.test(s);
}

/** Cores do campo tema_cor: tema da lista, ou uma cor qualquer (vira a estrutura do GR-001 com aquele tom). Vazio = null. */
export function corDoCampo(v: string): CorTema | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (ID_TEMA.test(s)) return PALETA_TEMAS[s.toUpperCase()] ?? null;
  if (HEX.test(s)) return corSegura(hexParaOklch(s)[2]);
  return null;
}

export { PALETA_TEMAS };
