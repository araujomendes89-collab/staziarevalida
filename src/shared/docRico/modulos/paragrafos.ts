// Módulo M2 Parágrafos do editor profissional: alinhamento, entrelinha, espaço antes/depois, recuos, borda e sombreamento
// de parágrafo e estilo de lista (marcador/numeração). Tudo em lista fechada ou número limitado; nada de HTML ou CSS livre.
// Os valores padrão (esquerda, simples, 0...) NÃO são guardados: parágrafo sem mudança continua idêntico ao texto com marcas.
import { registrarAtributo, umDe, numeroEntre, inteiroEntre, type Css, type Valor } from "../registro";

export const ALINHAMENTOS = ["center", "right", "justify"] as const; // "left" é o padrão e não é guardado
export const ENTRELINHAS = [1, 1.15, 1.5, 2] as const; // simples, 1,15, 1,5, duplo (P1: aceita qualquer número de 1 a 3)
export const ESPACOS = [0, 4, 8, 12, 18, 24, 36] as const; // em pixels (P1: aceita inteiro de 0 a 72)
export const RECUO_MAX = 6; // níveis de 1,5 em (até 9 em: cabe no celular)
export const RECUO_PRIMEIRA_MAX = 4;
export const NIVEL_RECUO_EM = 1.5;

// Bordas e fundos usam cores semitransparentes: funcionam no modo claro e no escuro do aluno sem estourar o contraste.
export const BORDAS: Record<string, string> = {
  fina: "1px solid rgba(100,116,139,0.6)",
  media: "2px solid rgba(100,116,139,0.7)",
  grossa: "3px solid rgba(71,85,105,0.85)",
  esquerda: "4px solid rgba(100,116,139,0.8)",
};
export const FUNDOS: Record<string, string> = {
  cinza: "rgba(148,163,184,0.2)",
  amarelo: "rgba(250,204,21,0.2)",
  azul: "rgba(59,130,246,0.15)",
  verde: "rgba(34,197,94,0.15)",
  vermelho: "rgba(239,68,68,0.15)",
};
export const NUMERACOES = ["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"] as const;
export const MARCADORES = ["circle", "square"] as const; // "disc" é o padrão

const CAIXA = "0.35em 0.75em"; // respiro interno de quem tem borda ou fundo
const num = (v: Valor) => Number(v);

export const cssAlinhamento = (v: Valor): Css => ({ "text-align": String(v) });
export const cssEntrelinha = (v: Valor): Css => ({ "line-height": String(num(v)) });
export const cssAntes = (v: Valor): Css => ({ "margin-top": `${num(v)}px` });
export const cssDepois = (v: Valor): Css => ({ "margin-bottom": `${num(v)}px` });
export const cssRecuoEsq = (v: Valor): Css => ({ "margin-left": `${num(v) * NIVEL_RECUO_EM}em` });
export const cssRecuoPrimeira = (v: Valor): Css => ({ "text-indent": `${num(v) * NIVEL_RECUO_EM}em` });
export const cssBorda = (v: Valor): Css => (BORDAS[String(v)] ? { border: BORDAS[String(v)], padding: CAIXA } : {});
export const cssFundo = (v: Valor): Css => (FUNDOS[String(v)] ? { "background-color": FUNDOS[String(v)], padding: CAIXA } : {});

/** Atributos de parágrafo (nome do atributo -> como sanear, qual CSS e qual é o padrão que não se guarda). */
export const ATRIBUTOS_PARAGRAFO = {
  textAlign: { sanear: umDe([...ALINHAMENTOS]), css: cssAlinhamento },
  lineHeight: { sanear: numeroEntre(1, 3), css: cssEntrelinha, padrao: 1 as Valor },
  spacingBefore: { sanear: inteiroEntre(0, 72), css: cssAntes },
  spacingAfter: { sanear: inteiroEntre(0, 72), css: cssDepois },
  indent: { sanear: inteiroEntre(0, RECUO_MAX), css: cssRecuoEsq, padrao: 0 as Valor },
  firstLineIndent: { sanear: inteiroEntre(0, RECUO_PRIMEIRA_MAX), css: cssRecuoPrimeira, padrao: 0 as Valor },
  borda: { sanear: umDe(Object.keys(BORDAS)), css: cssBorda },
  backgroundColor: { sanear: umDe(Object.keys(FUNDOS)), css: cssFundo },
};

// Só parágrafo e títulos recebem estes atributos (célula de tabela e item de lista contêm parágrafos, então valem lá também).
for (const alvo of ["paragraph", "heading"]) {
  for (const [nome, d] of Object.entries(ATRIBUTOS_PARAGRAFO)) {
    registrarAtributo({ alvo, nome, sanear: d.sanear, css: d.css, ...("padrao" in d ? { padrao: d.padrao } : {}) });
  }
}

// Listas: estilo da numeração (a, A, i, I) e do marcador (círculo, quadrado). Aninhamento = lista dentro de item (multinível).
registrarAtributo({ alvo: "orderedList", nome: "listStyle", sanear: umDe([...NUMERACOES].filter((x) => x !== "decimal")), css: (v) => ({ "list-style-type": String(v) }) });
registrarAtributo({ alvo: "bulletList", nome: "listStyle", sanear: umDe([...MARCADORES]), css: (v) => ({ "list-style-type": String(v) }) });
