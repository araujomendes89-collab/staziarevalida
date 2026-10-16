/**
 * Kit de ilustrações (modelo "criativo-1"): cenas grandes do cabeçalho azul-marinho, em SVG vetorial feito à mão
 * (gradientes, brilho e sombra), sem IA de imagem e sem texto. Cada cena ocupa viewBox 0 0 320 240.
 *
 * Organização por tema (área do roteiro). Para criar um tema novo:
 *   1. escreva a função da cena aqui (use `ids(uid)` para os gradientes: cada SVG precisa de ids próprios);
 *   2. registre em SCENES e em THEMES (index.ts), com o ícone pequeno que representa o tema;
 *   3. acrescente o ícone em ILLUSTRATION_ICONS (model.ts) para a equipe escolher no formulário.
 */

export interface SceneColors {
  /** Cor de brilho da especialidade (título em destaque, contornos claros). */
  glow: string;
  /** Cor principal da especialidade. */
  primary: string;
}

const sparkle = (x: number, y: number, r: number, color: string, op = 0.9) =>
  `<path d="M${x} ${y - r}C${x + r * 0.18} ${y - r * 0.18} ${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}C${x + r * 0.18} ${y + r * 0.18} ${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}C${x - r * 0.18} ${y + r * 0.18} ${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}C${x - r * 0.18} ${y - r * 0.18} ${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}z" fill="${color}" opacity="${op}"></path>`;

const dots = (color: string, pts: [number, number, number][]) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0.55"></circle>`).join("");

/** Halo de fundo (luz difusa atrás da cena). */
const halo = (id: string, color: string, cx = 160, cy = 120, r = 150, op = 0.45) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${op}"></stop><stop offset="1" stop-color="${color}" stop-opacity="0"></stop></radialGradient>`;

/** Bacilo brilhante (bastonete vermelho com volume e halo). */
function bacillus(uid: string, x: number, y: number, len: number, th: number, rot: number) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-len / 2 - th * 0.7}" y="${-th * 1.2}" width="${len + th * 1.4}" height="${th * 2.4}" rx="${th * 1.2}" fill="url(#${uid}-bglow)"></rect><rect x="${-len / 2}" y="${-th / 2}" width="${len}" height="${th}" rx="${th / 2}" fill="url(#${uid}-bac)"></rect><rect x="${-len / 2 + th * 0.45}" y="${-th / 2 + th * 0.16}" width="${len - th * 0.9}" height="${th * 0.24}" rx="${th * 0.12}" fill="#FFFFFF" opacity="0.6"></rect></g>`;
}

// ---------------------------------------------------------------------------- pulmão (TB, pneumologia)
function pulmao(uid: string, col: SceneColors) {
  const lungL = "M134 46C116 40 92 60 82 94C71 130 66 166 72 190C76 205 93 208 111 199C126 192 138 186 141 168L143 86C143 64 141 50 134 46Z";
  const lungR = "M186 46C204 40 228 60 238 94C249 130 254 166 248 190C244 205 227 208 209 199C194 192 182 186 179 168L177 86C177 64 179 50 186 46Z";
  const veins =
    "M150 74L128 92L112 112M128 92L122 128L106 150M122 128L134 156M112 112L94 124M106 150L92 170M170 74L192 92L208 112M192 92L198 128L214 150M198 128L186 158M208 112L226 126M214 150L228 170M118 104L102 98M200 104L218 96";
  return `<defs>${halo(`${uid}-halo`, "#2563EB", 165, 120, 160, 0.5)}
<linearGradient id="${uid}-lung" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DB8FF" stop-opacity="0.55"></stop><stop offset="0.55" stop-color="#3B6FD8" stop-opacity="0.42"></stop><stop offset="1" stop-color="#1A3C8F" stop-opacity="0.55"></stop></linearGradient>
<radialGradient id="${uid}-inf" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FF4D6D" stop-opacity="0.95"></stop><stop offset="0.45" stop-color="#E11D48" stop-opacity="0.55"></stop><stop offset="1" stop-color="#E11D48" stop-opacity="0"></stop></radialGradient>
<linearGradient id="${uid}-bac" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF8A9A"></stop><stop offset="0.5" stop-color="#E5243F"></stop><stop offset="1" stop-color="#99102A"></stop></linearGradient>
<radialGradient id="${uid}-bglow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FF5470" stop-opacity="0.55"></stop><stop offset="1" stop-color="#FF5470" stop-opacity="0"></stop></radialGradient>
<radialGradient id="${uid}-lens" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#7A1028"></stop><stop offset="0.7" stop-color="#3A0714"></stop><stop offset="1" stop-color="#22040C"></stop></radialGradient>
<clipPath id="${uid}-clip"><circle cx="256" cy="172" r="52"></circle></clipPath></defs>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-halo)"></rect>
${dots("#9CC9FF", [[40, 40, 1.6], [62, 196, 1.2], [290, 30, 1.4], [24, 120, 1], [300, 98, 1.1]])}
<path d="M155 14h10v62h-10z" fill="#9CC9FF" opacity="0.55"></path><path d="M155 22h10M155 30h10M155 38h10M155 46h10M155 54h10M155 62h10" stroke="#0B2545" stroke-opacity="0.45" stroke-width="2"></path>
<path d="${lungL}" fill="none" stroke="${col.glow}" stroke-opacity="0.18" stroke-width="10"></path><path d="${lungR}" fill="none" stroke="${col.glow}" stroke-opacity="0.18" stroke-width="10"></path>
<path d="${lungL}" fill="url(#${uid}-lung)" stroke="#A9D2FF" stroke-width="2.2"></path><path d="${lungR}" fill="url(#${uid}-lung)" stroke="#A9D2FF" stroke-width="2.2"></path>
<path d="M96 80C92 100 88 122 88 140" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round" fill="none"></path><path d="M224 80C228 100 232 122 232 140" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="4" stroke-linecap="round" fill="none"></path>
<circle cx="112" cy="130" r="34" fill="url(#${uid}-inf)"></circle><circle cx="204" cy="146" r="28" fill="url(#${uid}-inf)"></circle><circle cx="96" cy="88" r="18" fill="url(#${uid}-inf)" opacity="0.7"></circle>
<path d="${veins}" fill="none" stroke="#FF5C7C" stroke-opacity="0.3" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
<path d="${veins}" fill="none" stroke="#FF8FA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
${bacillus(uid, 58, 66, 26, 8, 32)}${bacillus(uid, 214, 40, 22, 7, -28)}${bacillus(uid, 34, 160, 20, 7, -50)}${bacillus(uid, 152, 214, 18, 6, 12)}
<path d="M204 146L226 154" stroke="#FFFFFF" stroke-width="1.6" opacity="0.9"></path><circle cx="204" cy="146" r="4" fill="#FFFFFF"></circle>
<circle cx="256" cy="172" r="60" fill="#FF5470" opacity="0.14"></circle>
<circle cx="256" cy="172" r="52" fill="url(#${uid}-lens)"></circle>
<g clip-path="url(#${uid}-clip)">${bacillus(uid, 236, 150, 46, 13, 28)}${bacillus(uid, 270, 186, 50, 14, -32)}${bacillus(uid, 240, 202, 34, 11, 8)}${bacillus(uid, 284, 140, 30, 10, 62)}</g>
<circle cx="256" cy="172" r="52" fill="none" stroke="#FFFFFF" stroke-width="4.5"></circle><path d="M222 140a44 44 0 0 1 26-14" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="3" fill="none" stroke-linecap="round"></path>
${sparkle(290, 60, 9, "#FFFFFF")}${sparkle(30, 98, 6, col.glow)}${sparkle(196, 222, 5, "#FFFFFF", 0.7)}`;
}

// ---------------------------------------------------------------------------- coração (cardiologia)
function coracao(uid: string, col: SceneColors) {
  const heart = "M160 214S62 156 62 92C62 58 88 36 116 36C136 36 152 48 160 64C168 48 184 36 204 36C232 36 258 58 258 92C258 156 160 214 160 214Z";
  return `<defs>${halo(`${uid}-halo`, "#E11D48", 160, 120, 160, 0.4)}
<linearGradient id="${uid}-h" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#FF8A9E"></stop><stop offset="0.5" stop-color="#E0213F"></stop><stop offset="1" stop-color="#8E0E27"></stop></linearGradient></defs>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-halo)"></rect>
<path d="${heart}" fill="none" stroke="#FF6B85" stroke-opacity="0.25" stroke-width="14"></path>
<path d="${heart}" fill="url(#${uid}-h)"></path>
<path d="M92 76C96 60 110 52 124 54" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round" fill="none"></path>
<path d="M14 128H96L110 100L128 160L146 82L162 140L176 120H306" fill="none" stroke="${col.glow}" stroke-opacity="0.3" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"></path>
<path d="M14 128H96L110 100L128 160L146 82L162 140L176 120H306" fill="none" stroke="${col.glow}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
${sparkle(270, 48, 9, "#FFFFFF")}${sparkle(48, 60, 6, col.glow)}${sparkle(286, 196, 6, "#FFFFFF", 0.7)}${dots("#FFB3C1", [[30, 200, 1.6], [300, 110, 1.3], [210, 20, 1.2]])}`;
}

// ---------------------------------------------------------------------------- bebê (pediatria)
function bebe(uid: string, col: SceneColors) {
  return `<defs>${halo(`${uid}-halo`, "#60A5FA", 160, 120, 160, 0.45)}
<radialGradient id="${uid}-skin" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#FFE3CC"></stop><stop offset="0.7" stop-color="#F6BE98"></stop><stop offset="1" stop-color="#E39E78"></stop></radialGradient>
<linearGradient id="${uid}-blk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE0FF"></stop><stop offset="1" stop-color="#5B9BE6"></stop></linearGradient></defs>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-halo)"></rect>
<path d="M70 236C74 180 112 150 160 150S246 180 250 236Z" fill="url(#${uid}-blk)"></path><path d="M96 200C120 186 200 186 224 200" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="4" fill="none" stroke-linecap="round"></path>
<circle cx="160" cy="112" r="68" fill="#FFFFFF" opacity="0.08"></circle>
<circle cx="96" cy="116" r="15" fill="url(#${uid}-skin)"></circle><circle cx="224" cy="116" r="15" fill="url(#${uid}-skin)"></circle>
<circle cx="160" cy="112" r="62" fill="url(#${uid}-skin)"></circle>
<path d="M160 52C150 36 166 24 178 30C188 35 182 50 170 46" fill="none" stroke="#B9744F" stroke-width="5" stroke-linecap="round"></path>
<path d="M128 108q10 9 20 0M172 108q10 9 20 0" fill="none" stroke="#5A3A2A" stroke-width="4.5" stroke-linecap="round"></path>
<circle cx="124" cy="132" r="10" fill="#FF8FA3" opacity="0.45"></circle><circle cx="196" cy="132" r="10" fill="#FF8FA3" opacity="0.45"></circle>
<path d="M146 138q14 12 28 0" fill="none" stroke="#B4533A" stroke-width="4.5" stroke-linecap="round"></path>
<ellipse cx="136" cy="80" rx="16" ry="8" transform="rotate(-25 136 80)" fill="#FFFFFF" opacity="0.4"></ellipse>
${sparkle(268, 46, 9, "#FFFFFF")}${sparkle(52, 56, 7, col.glow)}${sparkle(282, 168, 6, col.glow, 0.8)}${dots("#CFE6FF", [[30, 150, 1.6], [300, 110, 1.3], [230, 26, 1.2]])}`;
}

// ---------------------------------------------------------------------------- genérica (qualquer tema sem cena própria)
/** Círculo de luz com o ícone do tema em branco e brilhos ao redor. */
function generica(uid: string, col: SceneColors, iconSvgInner: string) {
  return `<defs>${halo(`${uid}-halo`, col.primary, 170, 120, 150, 0.55)}
<linearGradient id="${uid}-disc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col.glow}" stop-opacity="0.35"></stop><stop offset="1" stop-color="${col.primary}" stop-opacity="0.15"></stop></linearGradient></defs>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-halo)"></rect>
<circle cx="170" cy="120" r="92" fill="none" stroke="${col.glow}" stroke-opacity="0.18" stroke-width="2" stroke-dasharray="3 9"></circle>
<circle cx="170" cy="120" r="72" fill="url(#${uid}-disc)" stroke="${col.glow}" stroke-opacity="0.6" stroke-width="2.5"></circle>
<g transform="translate(122 72) scale(2)">${iconSvgInner}</g>
${sparkle(268, 46, 9, "#FFFFFF")}${sparkle(66, 62, 7, col.glow)}${sparkle(276, 186, 6, col.glow, 0.8)}${dots(col.glow, [[40, 170, 1.6], [300, 110, 1.3], [230, 22, 1.2], [90, 210, 1.2]])}`;
}

export const SCENES = { pulmao, coracao, bebe } as const;
export type SceneName = keyof typeof SCENES;

/** SVG da cena. `uid` deixa os ids únicos na página (ex.: "a4-single"). Sem cena própria: a genérica com o ícone. */
export function sceneSvg(name: string, uid: string, col: SceneColors, fallbackIconInner: string, style = ""): string {
  const fn = (SCENES as Record<string, (u: string, c: SceneColors) => string>)[name];
  const body = fn ? fn(uid, col) : generica(uid, col, fallbackIconInner);
  return `<svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="display:block;${style}">${body}</svg>`;
}

/** Só a luz de fundo e brilhos (ilustração "nenhuma"). */
export function glowOnlySvg(uid: string, col: SceneColors, style = ""): string {
  return `<svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="display:block;${style}"><defs>${halo(`${uid}-halo`, col.primary, 220, 110, 170, 0.5)}</defs><rect x="0" y="0" width="320" height="240" fill="url(#${uid}-halo)"></rect>${sparkle(268, 52, 9, "#FFFFFF", 0.8)}${sparkle(200, 170, 6, col.glow, 0.8)}${dots(col.glow, [[240, 120, 1.6], [300, 190, 1.3], [170, 40, 1.2]])}</svg>`;
}
