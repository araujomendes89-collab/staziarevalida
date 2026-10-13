/**
 * Kit de ilustrações (modelo "criativo-1"): ícones pequenos ("spots") em SVG, desenhados à mão, sem IA de imagem.
 * Todos usam viewBox 0 0 48 48, só formas vetoriais (sem texto, sem fonte) e nenhum id: podem se repetir
 * quantas vezes for preciso na mesma página. A cor principal vem por parâmetro (padrão: azul-marinho da marca).
 *
 * Para acrescentar um ícone: escreva o desenho em SPOT_DRAW e, se ele deve aparecer sozinho pelo texto
 * (pontos-chave, passos do bloco), acrescente a palavra em SPOT_KEYWORDS.
 */

export const KIT_NAVY = "#0B2545";

type Draw = (c: string) => string;

/** Brilho de "plástico" por cima das formas cheias (dá volume sem gradiente com id). */
const shine = (x: number, y: number, rx: number, ry: number, rot = -30) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#FFFFFF" opacity="0.28"></ellipse>`;

const badge = (fill: string, inner: string) =>
  `<circle cx="24" cy="24" r="21" fill="${fill}"></circle><circle cx="24" cy="24" r="21" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2"></circle>${shine(17, 14, 9, 4.5)}${inner}`;

export const SPOT_DRAW = {
  /** Cabeça de perfil tossindo (gotículas saindo da boca). */
  tosse: (c) =>
    `<path d="M13 45v-7.5c-5.6-3.2-7.8-9-7-15C7.3 12 14.6 5.4 24 5.6c8.5.2 14 6.3 14.4 13.4l3.1 6.9c.6 1.4-.2 2.6-1.7 2.6H38v4.3c0 2.6-1.8 4-4.4 4H29V45z" fill="${c}"></path>${shine(17, 13, 7, 3.5)}<g fill="${c}"><circle cx="44.2" cy="19.5" r="1.6"></circle><circle cx="46" cy="25" r="1.3"></circle><circle cx="43.6" cy="30.6" r="1.7"></circle><circle cx="46.6" cy="33.8" r="1"></circle><circle cx="41.6" cy="24.6" r="1"></circle></g>`,
  microscopio: (c) =>
    `<rect x="7" y="40" width="34" height="5" rx="2.5" fill="${c}"></rect><path d="M27 40c8.5-1 12.2-7.6 10.4-14.4-.9-3.3-3.1-5.8-5.9-7.2" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"></path><rect x="15.5" y="3.5" width="9" height="22" rx="2.5" transform="rotate(-28 20 14.5)" fill="${c}"></rect>${shine(17, 9, 2.4, 5, -28)}<rect x="11" y="28.5" width="18" height="4" rx="2" fill="${c}"></rect><rect x="17.5" y="32" width="4.5" height="8" fill="${c}"></rect><circle cx="25.6" cy="24.4" r="2.6" fill="${c}"></circle>`,
  capsulas: (c) =>
    `<g transform="rotate(-38 18 22)"><rect x="3" y="16" width="30" height="13" rx="6.5" fill="${c}"></rect><rect x="18" y="16" width="15" height="13" rx="6.5" fill="${c}" opacity="0.72"></rect><rect x="18" y="16" width="4" height="13" fill="${c}" opacity="0.72"></rect>${shine(11, 19.5, 5, 1.8, 0)}</g><circle cx="35" cy="34" r="10" fill="${c}"></circle><path d="M28.5 40.5l13-13" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="1.8"></path>${shine(31.5, 29.5, 3.5, 2)}`,
  pessoas: (c) =>
    `<g opacity="0.7"><circle cx="10.5" cy="17" r="5"></circle><path d="M2 39c0-8.2 3.6-13.6 8.5-13.6S19 30.8 19 39z"></path><circle cx="37.5" cy="17" r="5"></circle><path d="M29 39c0-8.2 3.6-13.6 8.5-13.6S46 30.8 46 39z"></path></g><circle cx="24" cy="13.5" r="6.6"></circle><path d="M12.6 42c0-10.3 4.9-16.4 11.4-16.4S35.4 31.7 35.4 42z"></path>${shine(21.5, 10.5, 3, 1.6)}`.replace(/<(circle|path)(?![^>]*fill=)/g, `<$1 fill="${c}"`),
  lupa: (c) =>
    `<circle cx="20" cy="20" r="12.5" fill="#FFFFFF" fill-opacity="0.15" stroke="${c}" stroke-width="5"></circle><path d="M29.5 29.5L42 42" stroke="${c}" stroke-width="6.5" stroke-linecap="round"></path><path d="M13 16a8 8 0 0 1 6-5" fill="none" stroke="${c}" stroke-opacity="0.45" stroke-width="2.4" stroke-linecap="round"></path>`,
  gota: (c) => `<path d="M24 3.5S9.5 21.6 9.5 30.8a14.5 14.5 0 0 0 29 0C38.5 21.6 24 3.5 24 3.5z" fill="${c}"></path>${shine(18, 31, 3, 6, 20)}`,
  documento: (c) =>
    `<path d="M11 4.5h18l9 9v28.5a2.5 2.5 0 0 1-2.5 2.5h-24.5a2.5 2.5 0 0 1-2.5-2.5V7a2.5 2.5 0 0 1 2.5-2.5z" fill="#FFFFFF" stroke="${c}" stroke-width="3.2" stroke-linejoin="round"></path><path d="M29 4.5v9h9" fill="none" stroke="${c}" stroke-width="3.2" stroke-linejoin="round"></path><path d="M15 22h17M15 28.5h17M15 35h11" stroke="${c}" stroke-width="3" stroke-linecap="round"></path>`,
  placa: (c) =>
    `<ellipse cx="24" cy="29" rx="20" ry="8.5" fill="${c}" opacity="0.25"></ellipse><ellipse cx="24" cy="26" rx="20" ry="8.5" fill="none" stroke="${c}" stroke-width="3.2"></ellipse><ellipse cx="24" cy="23.5" rx="13" ry="4.6" fill="none" stroke="${c}" stroke-width="2.4"></ellipse><g fill="${c}"><circle cx="19" cy="23" r="1.5"></circle><circle cx="26" cy="21.6" r="1.2"></circle><circle cx="29" cy="24.6" r="1.4"></circle></g>`,
  calendario: (c) =>
    `<rect x="5" y="9" width="38" height="34" rx="5" fill="none" stroke="${c}" stroke-width="3.4"></rect><path d="M5 18.5h38" stroke="${c}" stroke-width="3.4"></path><path d="M15 4.5v8M33 4.5v8" stroke="${c}" stroke-width="3.6" stroke-linecap="round"></path><g fill="${c}"><rect x="12" y="24" width="6" height="5" rx="1"></rect><rect x="21" y="24" width="6" height="5" rx="1"></rect><rect x="30" y="24" width="6" height="5" rx="1"></rect><rect x="12" y="32" width="6" height="5" rx="1"></rect><rect x="21" y="32" width="6" height="5" rx="1"></rect></g>`,
  livro: (c) =>
    `<path d="M24 11.5C19 8 11 7.5 4.5 9.2v29C11 36.6 19 37 24 40.5 29 37 37 36.6 43.5 38.2v-29C37 7.5 29 8 24 11.5z" fill="none" stroke="${c}" stroke-width="3.4" stroke-linejoin="round"></path><path d="M24 11.5v29" stroke="${c}" stroke-width="3.2"></path>`,
  estetoscopio: (c) =>
    `<path d="M11 5v12a9 9 0 0 0 18 0V5" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round"></path><path d="M20 26v6a9 9 0 0 0 18 0v-5" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round"></path><circle cx="38" cy="22.5" r="5" fill="none" stroke="${c}" stroke-width="3.4"></circle><path d="M8 5h6M26 5h6" stroke="${c}" stroke-width="3.6" stroke-linecap="round"></path>`,
  lampada: (c) =>
    `<path d="M24 9.5a11 11 0 0 0-6.6 19.8c1.4 1.1 2.2 2.4 2.2 4V35h8.8v-1.7c0-1.6.8-2.9 2.2-4A11 11 0 0 0 24 9.5z" fill="#FFFFFF" fill-opacity="0.35" stroke="${c}" stroke-width="3.2" stroke-linejoin="round"></path><path d="M19.5 40h9M21 44.5h6" stroke="${c}" stroke-width="3.2" stroke-linecap="round"></path><path d="M24 2v3M9 8l2.2 2.2M39 8l-2.2 2.2M3.5 21h3M41.5 21h3" stroke="${c}" stroke-width="3" stroke-linecap="round"></path><path d="M21 27l3-4 3 4" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>`,
  alvo: (c) =>
    `<circle cx="22" cy="26" r="17" fill="none" stroke="${c}" stroke-width="3.4"></circle><circle cx="22" cy="26" r="9.5" fill="none" stroke="${c}" stroke-width="3.4"></circle><circle cx="22" cy="26" r="3" fill="${c}"></circle><path d="M22 26L41 7M34 6.5l7.5.5.5 7.5" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"></path>`,
  prancheta: (c) =>
    `<rect x="8" y="7" width="27" height="36" rx="4" fill="none" stroke="${c}" stroke-width="3.4"></rect><path d="M15 5h13v6H15z" fill="${c}"></path><path d="M14 25l4.5 4.5L29 19" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M40 21.5l4 4-11.5 11.5-5.5 1.5 1.5-5.5z" fill="${c}"></path>`,
  virar: (c) =>
    `<path d="M40 22a16 16 0 0 0-29.8-6M8 26a16 16 0 0 0 29.8 6" fill="none" stroke="${c}" stroke-width="3.8" stroke-linecap="round"></path><path d="M40 8v8.5h-8.5M8 40v-8.5h8.5" fill="none" stroke="${c}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"></path>`,
  niveis: (c) => `<path d="M10 40V30M24 40V19M38 40V8" stroke="${c}" stroke-width="6" stroke-linecap="round"></path>`,
  etiqueta: (c) => `<path d="M5 24V7.5A2.5 2.5 0 0 1 7.5 5H24l19 19-19 19z" fill="none" stroke="${c}" stroke-width="3.4" stroke-linejoin="round"></path><circle cx="14" cy="14" r="3" fill="${c}"></circle>`,
  seta: (c) => `<circle cx="24" cy="24" r="20" fill="none" stroke="${c}" stroke-width="3.4"></circle><path d="M15 24h17M26 17l7 7-7 7" fill="none" stroke="${c}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"></path>`,
  /** Triângulo de alerta (contorno vermelho, como o da referência). */
  triangulo: (c) =>
    `<path d="M24 4.5L45 41.5H3z" fill="#FFFFFF" stroke="${c}" stroke-width="3.8" stroke-linejoin="round"></path><path d="M24 17v12" stroke="${c}" stroke-width="4.6" stroke-linecap="round"></path><circle cx="24" cy="35" r="2.8" fill="${c}"></circle>`,
  pulmoes: (c) =>
    `<path d="M22.5 5v15M22.5 20l-4 4M25.5 5v15M25.5 20l4 4" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"></path><path d="M18 12c-6 0-12 9-13 21-.5 6 2 9 7 8 5-1 8-3 9-7V18c0-3.5-1.2-6-3-6z" fill="${c}"></path><path d="M30 12c6 0 12 9 13 21 .5 6-2 9-7 8-5-1-8-3-9-7V18c0-3.5 1.2-6 3-6z" fill="${c}"></path>${shine(12, 24, 2.4, 6, 20)}${shine(36, 24, 2.4, 6, -20)}`,
  coracao: (c) => `<path d="M24 42S5 30.5 5 17.5A10.5 10.5 0 0 1 24 11a10.5 10.5 0 0 1 19 6.5C43 30.5 24 42 24 42z" fill="${c}"></path>${shine(14.5, 16, 5, 2.6)}<path d="M8 25h8l3-5 4 9 3-6 2.5 2H40" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>`,
  bebe: (c) =>
    `<circle cx="24" cy="25" r="16" fill="${c}"></circle><path d="M24 9c2-4 7-4 7.5-1 .4 2.4-2.5 3.2-3.8 1.6" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"></path><circle cx="7.5" cy="25" r="3.5" fill="${c}"></circle><circle cx="40.5" cy="25" r="3.5" fill="${c}"></circle><path d="M17 23.5q2.5 2.5 5 0M26 23.5q2.5 2.5 5 0M20 31q4 3.5 8 0" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"></path>${shine(17, 15, 5, 2.4)}`,
  cruz: (c) => `<rect x="6" y="6" width="36" height="36" rx="9" fill="${c}"></rect><path d="M24 14v20M14 24h20" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"></path>${shine(15, 13, 6, 2.6)}`,
  cronometro: (c) => `<circle cx="24" cy="27" r="16" fill="none" stroke="${c}" stroke-width="3.6"></circle><path d="M24 18v9l6 4M18 4.5h12M24 4.5v6" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"></path>`,
  // selos redondos coloridos (linhas da tabela e listas)
  ok: () => badge("#2E9B67", `<path d="M14.5 24.5l6.5 6.5 12.5-13" fill="none" stroke="#FFFFFF" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"></path>`),
  alerta: () => badge("#C8102E", `<path d="M24 12.5v14" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"></path><circle cx="24" cy="34" r="3.2" fill="#FFFFFF"></circle>`),
  pergunta: () => badge("#3A7BD5", `<path d="M18 18.5a6.3 6.3 0 1 1 9.4 5.5c-2 1.1-3.4 2.4-3.4 4.8v1" fill="none" stroke="#FFFFFF" stroke-width="4.4" stroke-linecap="round"></path><circle cx="24" cy="36" r="2.9" fill="#FFFFFF"></circle>`),
  neutro: () => badge("#5B6B80", `<path d="M15 24h18" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"></path>`),
} satisfies Record<string, Draw>;

export type SpotName = keyof typeof SPOT_DRAW;

/** Um ícone do kit em SVG (tamanho em px). */
export function spot(name: SpotName, size: number, color: string = KIT_NAVY, style = "flex:none"): string {
  const draw = SPOT_DRAW[name] ?? SPOT_DRAW.ok;
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" style="${style}">${draw(color)}</svg>`;
}

/**
 * Ícone escolhido pelo texto (só decoração: nunca muda o conteúdo). A primeira regra que casar vence.
 * Comparação sem acento e sem maiúsculas.
 */
export const SPOT_KEYWORDS: [RegExp, SpotName][] = [
  [/contato|famil|domicil|pessoas|casa\b|comunidade/, "pessoas"],
  [/\bhiv\b|sangue|sorolog|hemograma/, "gota"],
  [/esquema|tratament|comprimid|dose|rhze|\b3hp\b|medicament|farmac|\btdo\b/, "capsulas"],
  [/cultura|\bts\b|sensibilidade/, "placa"],
  [/baciloscop|escarro|laborat|microscop|trm|molecular|\bpcr\b|exame/, "microscopio"],
  [/raio x|radiograf|torax|pulm/, "pulmoes"],
  [/notific|registr|ficha|document/, "documento"],
  [/tosse|sintomatic|sintoma/, "tosse"],
  [/investig|procurar|busca|rastre/, "lupa"],
  [/semana|\bdias?\b|\bmes(es)?\b|prazo|tempo/, "calendario"],
  [/coraca|cardi|pressao|\becg\b/, "coracao"],
  [/bebe|lactente|recem|neonat|crianca/, "bebe"],
  [/referencia|encaminh|especializ/, "seta"],
];

const fold = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function spotForText(text: string, fallback: SpotName = "ok"): SpotName {
  const t = fold(text);
  for (const [re, name] of SPOT_KEYWORDS) if (re.test(t)) return name;
  return fallback;
}
