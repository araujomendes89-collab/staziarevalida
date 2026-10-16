// Módulo de figuras e imagens no documento rico (sdoc v1).
import {
  registrarNo,
  registrarAtributo,
  umDe,
  inteiroEntre,
  booleano,
  cssSeguro,
  type Css,
  type NoDoc,
  type Valor,
  type CtxHtml,
} from "../registro";
import { ID_IMAGEM, ALT_MAXIMO } from "../../docImagens";

export const OPCOES_FIGURA = {
  larguras: [25, 33, 50, 66, 75, 100],
  alinhamentos: [
    { valor: "esquerda", rotulo: "Esquerda" },
    { valor: "centro", rotulo: "Centro" },
    { valor: "direita", rotulo: "Direita" },
  ],
  disposicoes: [
    { valor: "linha", rotulo: "Alinhada ao texto" },
    { valor: "quadrado-esquerda", rotulo: "Quadrado à esquerda" },
    { valor: "quadrado-direita", rotulo: "Quadrado à direita" },
    { valor: "acima-abaixo", rotulo: "Acima e abaixo do texto" },
  ],
  bordas: [
    { valor: "fina", rotulo: "Fina" },
    { valor: "media", rotulo: "Média" },
    { valor: "grossa", rotulo: "Grossa" },
  ],
  cantos: [
    { valor: "retos", rotulo: "Retos" },
    { valor: "suaves", rotulo: "Suaves" },
    { valor: "arredondados", rotulo: "Arredondados" },
  ],
} as const;

export const ATRIBUTOS_DA_MOLDURA = ["largura", "alinhamento", "disposicao"] as const;
export const ATRIBUTOS_DA_IMAGEM = ["borda", "cantos", "sombra"] as const;

export const MARCADOR_ASSET = "sdoc-asset:";
export const MARCADOR_NUMERO = '<span class="dr-fig-n">#</span>';
export const MAX_FIGURAS_PDF = 40;
export const MAX_BYTES_FIGURA_PDF = 15 * 1024 * 1024;
export const TIPOS_PDF = ["image/png", "image/jpeg", "image/webp"] as const;

const SVG_INDISPONIVEL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">' +
  '<rect width="100%" height="100%" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>' +
  '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="16">Imagem indisponível</text>' +
  "</svg>";

export const IMAGEM_INDISPONIVEL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG_INDISPONIVEL)}`;

export function ehQuadrado(attrs?: Record<string, Valor>): boolean {
  return Boolean(
    attrs && (attrs.disposicao === "quadrado-esquerda" || attrs.disposicao === "quadrado-direita")
  );
}

/** Junta o CSS de largura, alinhamento e disposição para a moldura da figura. */
export function cssMoldura(attrs?: Record<string, Valor>): Css {
  const css: Css = {};
  const largura =
    typeof attrs?.largura === "number" && attrs.largura >= 10 && attrs.largura <= 100
      ? attrs.largura
      : 100;
  css["width"] = `${largura}%`;

  const disposicao =
    attrs?.disposicao === "quadrado-esquerda" ||
    attrs?.disposicao === "quadrado-direita" ||
    attrs?.disposicao === "acima-abaixo" ||
    attrs?.disposicao === "linha"
      ? attrs.disposicao
      : "linha";

  if (disposicao === "quadrado-esquerda") {
    css["float"] = "left";
    css["margin-right"] = "1em";
    css["margin-bottom"] = "0.5em";
  } else if (disposicao === "quadrado-direita") {
    css["float"] = "right";
    css["margin-left"] = "1em";
    css["margin-bottom"] = "0.5em";
  } else {
    css["display"] = "block";
    if (disposicao === "acima-abaixo") {
      css["clear"] = "both";
    }
    const alinhamento =
      attrs?.alinhamento === "esquerda" ||
      attrs?.alinhamento === "direita" ||
      attrs?.alinhamento === "centro"
        ? attrs.alinhamento
        : "centro";
    if (alinhamento === "esquerda") {
      css["margin-left"] = "0";
      css["margin-right"] = "auto";
    } else if (alinhamento === "direita") {
      css["margin-left"] = "auto";
      css["margin-right"] = "0";
    } else {
      css["margin-left"] = "auto";
      css["margin-right"] = "auto";
    }
  }

  return css;
}

/** CSS aplicado ao elemento img dentro da figura (proporção, borda, cantos e sombra). */
export function cssImagem(attrs?: Record<string, Valor>): Css {
  const css: Css = {
    display: "block",
    width: "100%",
    height: "auto",
    "max-width": "100%",
  };

  if (attrs?.borda === "fina") {
    css["border"] = "1px solid #94a3b8";
  } else if (attrs?.borda === "media") {
    css["border"] = "2px solid #94a3b8";
  } else if (attrs?.borda === "grossa") {
    css["border"] = "4px solid #94a3b8";
  }

  if (attrs?.cantos === "suaves") {
    css["border-radius"] = "6px";
  } else if (attrs?.cantos === "arredondados") {
    css["border-radius"] = "16px";
  } else {
    css["border-radius"] = "0";
  }

  if (attrs?.sombra === true) {
    css["box-shadow"] = "0 2px 8px rgba(15, 23, 42, 0.18)";
  }

  return css;
}

/** Renderiza a tag figure HTML com imagem e legenda. */
export function htmlFigura(no: NoDoc, _filhos: string, ctx: CtxHtml): string {
  const assetRaw = no.attrs?.asset;
  if (typeof assetRaw !== "string" || !ID_IMAGEM.test(assetRaw.trim())) {
    return "";
  }
  const asset = assetRaw.trim().toLowerCase();
  const alt = typeof no.attrs?.alt === "string" ? no.attrs.alt.trim() : "";
  const legenda = typeof no.attrs?.legenda === "string" ? no.attrs.legenda.trim() : "";

  const stMoldura = cssSeguro(cssMoldura(no.attrs));
  const stImagem = cssSeguro(cssImagem(no.attrs));

  const attrMoldura = stMoldura ? ` style="${stMoldura}"` : "";
  const attrImagem = stImagem ? ` style="${stImagem}"` : "";

  let figcaption = "";
  if (legenda) {
    figcaption = `<figcaption class="dr-figura-legenda">Figura ${MARCADOR_NUMERO} – ${ctx.esc(legenda)}</figcaption>`;
  }

  return `<figure class="dr-figura"${attrMoldura}><img src="${MARCADOR_ASSET}${asset}" alt="${ctx.esc(alt)}"${attrImagem}>${figcaption}</figure>`;
}

// ---------------------------------------------------------------------------- Registro do Nó e Atributos

registrarNo({
  nome: "figura",
  grupo: "bloco",
  conteudo: "nenhum",
  texto: () => "",
  html: htmlFigura,
});

// Atributos de conteúdo
registrarAtributo({
  alvo: "figura",
  nome: "asset",
  sanear: (v) => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return ID_IMAGEM.test(s) ? s.toLowerCase() : undefined;
  },
});

registrarAtributo({
  alvo: "figura",
  nome: "alt",
  sanear: (v) => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    if (!s || s.length > ALT_MAXIMO) return undefined;
    return s;
  },
});

registrarAtributo({
  alvo: "figura",
  nome: "legenda",
  sanear: (v) => {
    if (typeof v !== "string") return undefined;
    const s = v.trim().replace(/\r?\n/g, " ");
    if (!s || s.length > 300) return undefined;
    return s;
  },
});

// Atributos de só aparência
registrarAtributo({
  alvo: "figura",
  nome: "largura",
  sanear: inteiroEntre(10, 100),
  padrao: 100,
  css: (v) => ({ width: `${v}%` }),
});

registrarAtributo({
  alvo: "figura",
  nome: "alinhamento",
  sanear: umDe(["esquerda", "centro", "direita"]),
  padrao: "centro",
  css: (v) => {
    if (v === "esquerda") return { "margin-left": "0", "margin-right": "auto" };
    if (v === "direita") return { "margin-left": "auto", "margin-right": "0" };
    return { "margin-left": "auto", "margin-right": "auto" };
  },
});

registrarAtributo({
  alvo: "figura",
  nome: "disposicao",
  sanear: umDe(["linha", "quadrado-esquerda", "quadrado-direita", "acima-abaixo"]),
  padrao: "linha",
  css: (v) => {
    if (v === "acima-abaixo") return { display: "block", clear: "both" };
    if (v === "quadrado-esquerda") return { float: "left", "margin-right": "1em", "margin-bottom": "0.5em" };
    if (v === "quadrado-direita") return { float: "right", "margin-left": "1em", "margin-bottom": "0.5em" };
    return { display: "block" };
  },
});

registrarAtributo({
  alvo: "figura",
  nome: "borda",
  sanear: umDe(["fina", "media", "grossa"]),
  css: (v) => {
    if (v === "fina") return { border: "1px solid #94a3b8" };
    if (v === "media") return { border: "2px solid #94a3b8" };
    if (v === "grossa") return { border: "4px solid #94a3b8" };
    return {};
  },
});

registrarAtributo({
  alvo: "figura",
  nome: "cantos",
  sanear: umDe(["retos", "suaves", "arredondados"]),
  padrao: "retos",
  css: (v) => {
    if (v === "suaves") return { "border-radius": "6px" };
    if (v === "arredondados") return { "border-radius": "16px" };
    return { "border-radius": "0" };
  },
});

registrarAtributo({
  alvo: "figura",
  nome: "sombra",
  sanear: booleano(),
  padrao: false,
  css: (v) => (v ? { "box-shadow": "0 2px 8px rgba(15, 23, 42, 0.18)" } : {}),
});

// ---------------------------------------------------------------------------- Utilitários do Documento

/** Retorna todas as figuras do documento rico, em qualquer profundidade, na ordem em que aparecem. */
export function figurasDoDoc(doc: unknown): NoDoc[] {
  const out: NoDoc[] = [];
  function visita(no: unknown) {
    if (!no || typeof no !== "object") return;
    const n = no as Record<string, any>;
    if (n.type === "figura") {
      out.push(n as NoDoc);
    }
    if (Array.isArray(n.content)) {
      for (const f of n.content) visita(f);
    }
  }
  visita(doc);
  return out;
}

/** Mapa de número (1, 2, 3...) de cada figura COM legenda; figuras sem legenda não ganham nem gastam número. */
export function numerosDasFiguras(doc: unknown): Map<NoDoc, number> {
  const mapa = new Map<NoDoc, number>();
  const figs = figurasDoDoc(doc);
  let n = 1;
  for (const f of figs) {
    if (typeof f.attrs?.legenda === "string" && f.attrs.legenda.trim()) {
      mapa.set(f, n++);
    }
  }
  return mapa;
}

function coletarTodasFiguras(x: unknown): NoDoc[] {
  const out: NoDoc[] = [];
  function visita(v: unknown) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const item of v) visita(item);
      return;
    }
    const o = v as Record<string, any>;
    if (o.type === "figura") {
      out.push(o as NoDoc);
    }
    for (const val of Object.values(o)) {
      if (val && typeof val === "object") {
        visita(val);
      }
    }
  }
  visita(x);
  return out;
}

/** Conta figuras com asset válido e sem alt (bloqueio de publicação). */
export function figurasSemAlt(x: unknown): number {
  const figs = coletarTodasFiguras(x);
  let count = 0;
  for (const f of figs) {
    const asset = f.attrs?.asset;
    const temAsset = typeof asset === "string" && ID_IMAGEM.test(asset.trim());
    if (temAsset) {
      const alt = f.attrs?.alt;
      const temAlt = typeof alt === "string" && alt.trim().length > 0;
      if (!temAlt) count++;
    }
  }
  return count;
}

/** Identificadores de imagem únicos presentes nas figuras (asset) do documento ou unidade. */
export function idsDasFiguras(x: unknown): string[] {
  const figs = coletarTodasFiguras(x);
  const out: string[] = [];
  for (const f of figs) {
    const asset = f.attrs?.asset;
    if (typeof asset === "string" && ID_IMAGEM.test(asset.trim())) {
      const id = asset.trim().toLowerCase();
      if (!out.includes(id)) {
        out.push(id);
      }
    }
  }
  return out;
}

/** Embutir bytes de figuras como data URI no HTML para PDF e numerar figuras com legenda. */
export async function embutirFiguras(
  html: string,
  carregar?: (id: string) => Promise<{ data: Uint8Array | Buffer; mime: string }>
): Promise<string> {
  if (!html.includes(MARCADOR_ASSET)) {
    if (!html.includes(MARCADOR_NUMERO)) return html;
    let num = 1;
    return html.replace(/<span class="dr-fig-n">#<\/span>/g, () => `<span class="dr-fig-n">${num++}</span>`);
  }

  const RE_SRC = /src="sdoc-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;
  const idsUnicos: string[] = [];
  for (const m of html.matchAll(RE_SRC)) {
    const id = m[1].toLowerCase();
    if (!idsUnicos.includes(id)) {
      idsUnicos.push(id);
    }
  }

  const mapa = new Map<string, string>();

  for (let i = 0; i < idsUnicos.length; i++) {
    const id = idsUnicos[i];
    if (i >= MAX_FIGURAS_PDF || !carregar) {
      mapa.set(id, IMAGEM_INDISPONIVEL);
      continue;
    }

    try {
      const res = await carregar(id);
      if (
        !res ||
        !res.data ||
        !res.mime ||
        !(TIPOS_PDF as readonly string[]).includes(res.mime as any) ||
        res.data.length > MAX_BYTES_FIGURA_PDF
      ) {
        mapa.set(id, IMAGEM_INDISPONIVEL);
        continue;
      }

      let b64: string;
      if (typeof Buffer !== "undefined") {
        b64 = Buffer.isBuffer(res.data) ? res.data.toString("base64") : Buffer.from(res.data).toString("base64");
      } else {
        const bin = Array.from(new Uint8Array(res.data))
          .map((b) => String.fromCharCode(b))
          .join("");
        b64 = btoa(bin);
      }
      mapa.set(id, `data:${res.mime};base64,${b64}`);
    } catch {
      mapa.set(id, IMAGEM_INDISPONIVEL);
    }
  }

  let resultado = html.replace(RE_SRC, (_m, id) => {
    const src = mapa.get(id.toLowerCase()) ?? IMAGEM_INDISPONIVEL;
    return `src="${src}"`;
  });

  let num = 1;
  resultado = resultado.replace(/<span class="dr-fig-n">#<\/span>/g, () => `<span class="dr-fig-n">${num++}</span>`);

  return resultado;
}
