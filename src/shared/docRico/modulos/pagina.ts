// Módulo página do editor profissional (StaziaMed Revalida).
// Define as configurações de tamanho, orientação, margens, cabeçalho, rodapé, numeração e quebra de página.

import { registrarConfig, registrarAtributo, booleano } from "../registro";

export const TAMANHOS = {
  A4: { rotulo: "A4 (21 × 29,7 cm)", w: 210, h: 297 },
  A5: { rotulo: "A5 (14,8 × 21 cm)", w: 148, h: 210 },
  Carta: { rotulo: "Carta (21,59 × 27,94 cm)", w: 215.9, h: 279.4 },
  Oficio: { rotulo: "Ofício (21,59 × 35,56 cm)", w: 215.9, h: 355.6 },
} as const;

export interface PaginaConfig {
  tamanho: "A4" | "A5" | "Carta" | "Oficio";
  orientacao: "retrato" | "paisagem";
  margens: { topo: number; base: number; esquerda: number; direita: number };
  cabecalho: { texto: string; alinhamento: "esquerda" | "centro" | "direita" };
  rodape: { texto: string; alinhamento: "esquerda" | "centro" | "direita"; padrao: boolean };
  numeracao: {
    posicao: "nenhuma" | "rodape-esquerda" | "rodape-centro" | "rodape-direita" | "cabecalho-direita";
    formato: "pagina-de" | "pagina" | "numero";
  };
  primeiraDiferente: boolean;
  marcaDagua: string;
  secaoNovaPagina: boolean;
  orfasViuvas: boolean;
}

export const PAGINA_PADRAO: PaginaConfig = {
  tamanho: "A5",
  orientacao: "retrato",
  margens: { topo: 16, base: 18, esquerda: 13, direita: 13 },
  cabecalho: { texto: "", alinhamento: "esquerda" },
  rodape: { texto: "", alinhamento: "esquerda", padrao: true },
  numeracao: { posicao: "rodape-direita", formato: "pagina-de" },
  primeiraDiferente: false,
  marcaDagua: "",
  secaoNovaPagina: false,
  orfasViuvas: true,
};

function limparTexto(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  // sem trim aqui: o editor grava a cada tecla (o espaço entre palavras não pode sumir); o desenho do PDF apara
  return s.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, "").slice(0, max);
}

function sanearMargem(v: unknown, padrao: number): number {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^-?\d+$/.test(v.trim())) n = Number(v.trim());
  else return padrao;
  return Number.isInteger(n) && n >= 5 && n <= 50 ? n : padrao;
}

export function sanearPagina(v: unknown): PaginaConfig | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;

  const tamanho =
    raw.tamanho === "A4" || raw.tamanho === "A5" || raw.tamanho === "Carta" || raw.tamanho === "Oficio"
      ? raw.tamanho
      : PAGINA_PADRAO.tamanho;

  const orientacao =
    raw.orientacao === "retrato" || raw.orientacao === "paisagem"
      ? raw.orientacao
      : PAGINA_PADRAO.orientacao;

  const rawMargens =
    typeof raw.margens === "object" && raw.margens !== null
      ? (raw.margens as Record<string, unknown>)
      : {};
  const margens = {
    topo: sanearMargem(rawMargens.topo, PAGINA_PADRAO.margens.topo),
    base: sanearMargem(rawMargens.base, PAGINA_PADRAO.margens.base),
    esquerda: sanearMargem(rawMargens.esquerda, PAGINA_PADRAO.margens.esquerda),
    direita: sanearMargem(rawMargens.direita, PAGINA_PADRAO.margens.direita),
  };

  const rawCab =
    typeof raw.cabecalho === "object" && raw.cabecalho !== null
      ? (raw.cabecalho as Record<string, unknown>)
      : {};
  const cabAlin =
    rawCab.alinhamento === "esquerda" ||
    rawCab.alinhamento === "centro" ||
    rawCab.alinhamento === "direita"
      ? rawCab.alinhamento
      : PAGINA_PADRAO.cabecalho.alinhamento;
  const cabecalho = {
    texto: limparTexto(rawCab.texto, 100),
    alinhamento: cabAlin,
  };

  const rawRod =
    typeof raw.rodape === "object" && raw.rodape !== null
      ? (raw.rodape as Record<string, unknown>)
      : {};
  const rodAlin =
    rawRod.alinhamento === "esquerda" ||
    rawRod.alinhamento === "centro" ||
    rawRod.alinhamento === "direita"
      ? rawRod.alinhamento
      : PAGINA_PADRAO.rodape.alinhamento;
  const rodPadrao = typeof rawRod.padrao === "boolean" ? rawRod.padrao : PAGINA_PADRAO.rodape.padrao;
  const rodape = {
    texto: limparTexto(rawRod.texto, 100),
    alinhamento: rodAlin,
    padrao: rodPadrao,
  };

  const rawNum =
    typeof raw.numeracao === "object" && raw.numeracao !== null
      ? (raw.numeracao as Record<string, unknown>)
      : {};
  const numPos =
    rawNum.posicao === "nenhuma" ||
    rawNum.posicao === "rodape-esquerda" ||
    rawNum.posicao === "rodape-centro" ||
    rawNum.posicao === "rodape-direita" ||
    rawNum.posicao === "cabecalho-direita"
      ? rawNum.posicao
      : PAGINA_PADRAO.numeracao.posicao;
  const numFmt =
    rawNum.formato === "pagina-de" ||
    rawNum.formato === "pagina" ||
    rawNum.formato === "numero"
      ? rawNum.formato
      : PAGINA_PADRAO.numeracao.formato;
  const numeracao = {
    posicao: numPos,
    formato: numFmt,
  };

  const primeiraDiferente =
    typeof raw.primeiraDiferente === "boolean"
      ? raw.primeiraDiferente
      : PAGINA_PADRAO.primeiraDiferente;
  const marcaDagua = limparTexto(raw.marcaDagua, 60);
  const secaoNovaPagina =
    typeof raw.secaoNovaPagina === "boolean"
      ? raw.secaoNovaPagina
      : PAGINA_PADRAO.secaoNovaPagina;
  const orfasViuvas =
    typeof raw.orfasViuvas === "boolean" ? raw.orfasViuvas : PAGINA_PADRAO.orfasViuvas;

  return {
    tamanho,
    orientacao,
    margens,
    cabecalho,
    rodape,
    numeracao,
    primeiraDiferente,
    marcaDagua,
    secaoNovaPagina,
    orfasViuvas,
  };
}

export function dimensoesMm(cfg: PaginaConfig): { w: number; h: number } {
  const base = TAMANHOS[cfg.tamanho] ?? TAMANHOS.A5;
  if (cfg.orientacao === "paisagem") {
    return { w: base.h, h: base.w };
  }
  return { w: base.w, h: base.h };
}

export interface CamposPagina {
  titulo: string;
  versao: number;
  data: string;
}

export function textoRodapePadrao(c: CamposPagina): string {
  const titulo = (c.titulo ?? "").slice(0, 60);
  return `StaziaMed · ${titulo} · versão ${c.versao ?? 0} de ${c.data ?? ""}`;
}

export function cssString(s: string): string {
  let out = "";
  for (const ch of s) {
    if (/[a-zA-Z0-9 ]/.test(ch)) {
      out += ch;
    } else {
      out += "\\" + ch.codePointAt(0)!.toString(16) + " ";
    }
  }
  return out;
}

const escHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function htmlMarcaDagua(cfg: PaginaConfig): string {
  if (!cfg.marcaDagua || !cfg.marcaDagua.trim()) return "";
  return `<div class="ep-marca-dagua" aria-hidden="true">${escHtml(cfg.marcaDagua.trim())}</div>`;
}

type CaixaMargem =
  | "@top-left"
  | "@top-center"
  | "@top-right"
  | "@bottom-left"
  | "@bottom-center"
  | "@bottom-right";

interface InfoCaixa {
  textos: string[];
  numeracao?: "pagina-de" | "pagina" | "numero";
}

function coletarCaixas(
  cfg: PaginaConfig,
  c: CamposPagina
): Partial<Record<CaixaMargem, InfoCaixa>> {
  const caixas: Partial<Record<CaixaMargem, InfoCaixa>> = {};
  function obter(nome: CaixaMargem): InfoCaixa {
    if (!caixas[nome]) caixas[nome] = { textos: [] };
    return caixas[nome]!;
  }

  // Cabeçalho
  if (cfg.cabecalho.texto.trim()) {
    const nome: CaixaMargem =
      cfg.cabecalho.alinhamento === "centro"
        ? "@top-center"
        : cfg.cabecalho.alinhamento === "direita"
        ? "@top-right"
        : "@top-left";
    obter(nome).textos.push(cfg.cabecalho.texto.trim());
  }

  // Rodapé padrão
  if (cfg.rodape.padrao) {
    obter("@bottom-left").textos.push(textoRodapePadrao(c));
  }

  // Rodapé texto
  if (cfg.rodape.texto.trim()) {
    const nome: CaixaMargem =
      cfg.rodape.alinhamento === "centro"
        ? "@bottom-center"
        : cfg.rodape.alinhamento === "direita"
        ? "@bottom-right"
        : "@bottom-left";
    obter(nome).textos.push(cfg.rodape.texto.trim());
  }

  // Numeração
  if (cfg.numeracao.posicao !== "nenhuma") {
    const mapaPos: Record<string, CaixaMargem> = {
      "rodape-esquerda": "@bottom-left",
      "rodape-centro": "@bottom-center",
      "rodape-direita": "@bottom-right",
      "cabecalho-direita": "@top-right",
    };
    const nome = mapaPos[cfg.numeracao.posicao];
    if (nome) obter(nome).numeracao = cfg.numeracao.formato;
  }

  return caixas;
}

function conteudoCaixaCss(info: InfoCaixa): string {
  const texto = info.textos.length > 0 ? info.textos.join(" · ") : "";
  if (!info.numeracao) {
    return `"${cssString(texto)}"`;
  }
  if (info.numeracao === "pagina-de") {
    const prefixo = texto ? `${texto} · página ` : "página ";
    return `"${cssString(prefixo)}" counter(page) " de " counter(pages)`;
  }
  if (info.numeracao === "pagina") {
    const prefixo = texto ? `${texto} · página ` : "página ";
    return `"${cssString(prefixo)}" counter(page)`;
  }
  // info.numeracao === "numero"
  if (texto) {
    return `"${cssString(texto + " · ")}" counter(page)`;
  }
  return `counter(page)`;
}

export function cssPagina(cfg: PaginaConfig, c: CamposPagina): string {
  const { w, h } = dimensoesMm(cfg);
  const caixas = coletarCaixas(cfg, c);

  let css = `@page{size:${w}mm ${h}mm;margin:${cfg.margens.topo}mm ${cfg.margens.direita}mm ${cfg.margens.base}mm ${cfg.margens.esquerda}mm;`;
  for (const [nome, info] of Object.entries(caixas)) {
    if (info) {
      // caixa só com o número da página não quebra linha (sem isso, ao lado de um rodapé longo, "página" e "2" ficam em linhas separadas)
      const semQuebra = info.numeracao && info.textos.length === 0 ? ";white-space:nowrap" : "";
      css += `${nome}{content:${conteudoCaixaCss(info)};font-size:7pt;color:#687586;font-family:Arial,sans-serif${semQuebra}}`;
    }
  }
  css += `}`;

  if (cfg.primeiraDiferente) {
    css += `@page :first{`;
    const todasCaixas: CaixaMargem[] = [
      "@top-left",
      "@top-center",
      "@top-right",
      "@bottom-left",
      "@bottom-center",
      "@bottom-right",
    ];
    for (const cx of todasCaixas) {
      css += `${cx}{content:none}`;
    }
    css += `}`;
  }

  if (cfg.orfasViuvas) {
    css += `p,li{orphans:2;widows:2}`;
  }

  if (cfg.secaoNovaPagina) {
    css += `section+section{break-before:page}`;
  }

  if (cfg.marcaDagua && cfg.marcaDagua.trim()) {
    const diagonal = Math.hypot(w, h);
    const nCarac = Math.max(6, cfg.marcaDagua.trim().length);
    const fontSizePt = Math.round(Math.max(16, Math.min(60, (diagonal * 2.2) / nCarac)));
    css += `.ep-marca-dagua{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);white-space:nowrap;font-weight:800;color:rgba(13,28,66,.08);font-size:${fontSizePt}pt;pointer-events:none;z-index:0}`;
  }

  return css;
}

/**
 * Textos que o cabeçalho, o rodapé, a numeração e a marca-d'água desenham NUMA página (a conferência do PDF tira esses textos
 * do começo e do fim de cada página antes de comparar com a aula). Na 1ª página com "primeiraDiferente", só a marca-d'água.
 */
export function textosDecoracao(cfg: PaginaConfig, c: CamposPagina, pagina: number, total: number): string[] {
  const out: string[] = [];
  if (!(cfg.primeiraDiferente && pagina === 1)) {
    for (const info of Object.values(coletarCaixas(cfg, c))) {
      if (!info) continue;
      const texto = info.textos.join(" · ");
      const prefixo = texto ? `${texto} · ` : "";
      if (!info.numeracao) {
        if (texto) out.push(texto);
      } else if (info.numeracao === "pagina-de") out.push(`${prefixo}página ${pagina} de ${total}`);
      else if (info.numeracao === "pagina") out.push(`${prefixo}página ${pagina}`);
      else out.push(`${prefixo}${pagina}`);
    }
  }
  if (cfg.marcaDagua.trim()) out.push(cfg.marcaDagua.trim());
  return out;
}

// Registro das configurações e atributos
registrarConfig("pagina", sanearPagina);

registrarAtributo({
  alvo: "paragraph",
  nome: "quebraPagina",
  sanear: booleano(),
  padrao: false,
  css: (v) => (v === true ? { "break-before": "page" } : {}),
});

registrarAtributo({
  alvo: "heading",
  nome: "quebraPagina",
  sanear: booleano(),
  padrao: false,
  css: (v) => (v === true ? { "break-before": "page" } : {}),
});
