// Núcleo do documento rico: tipos de nós e marcas equivalentes ao textoRico.

import { hrefValido } from "../textoRico";
import {
  registrarNo,
  registrarMarca,
  registrarAtributo,
  inteiroEntre,
} from "./registro";

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------- Nós do Núcleo

// Documento raiz (apenas container de blocos)
registrarNo({
  nome: "doc",
  grupo: "bloco",
  conteudo: "blocos",
  html: (_no, filhos) => filhos,
  texto: (_no, filhos) => filhos,
});

// Parágrafo padrão
registrarNo({
  nome: "paragraph",
  grupo: "bloco",
  conteudo: "inline",
  tag: "p",
});

// Títulos (níveis 2 a 4)
registrarNo({
  nome: "heading",
  grupo: "bloco",
  conteudo: "inline",
  tag: "h2",
});

registrarAtributo({
  alvo: "heading",
  nome: "level",
  sanear: inteiroEntre(2, 4),
  padrao: 2,
});

// Nó de texto puro com marcas opcionais
registrarNo({
  nome: "text",
  grupo: "inline",
  conteudo: "nenhum",
});

// Quebra de linha manual
registrarNo({
  nome: "hardBreak",
  grupo: "inline",
  conteudo: "nenhum",
  tag: "br",
  texto: () => "\n",
  html: () => "<br>",
});

// Lista com marcadores (bullet)
registrarNo({
  nome: "bulletList",
  grupo: "bloco",
  conteudo: ["listItem"],
  tag: "ul",
});

// Lista numerada (ordenada)
registrarNo({
  nome: "orderedList",
  grupo: "bloco",
  conteudo: ["listItem"],
  tag: "ol",
});

registrarAtributo({
  alvo: "orderedList",
  nome: "start",
  sanear: inteiroEntre(1, 999),
  padrao: 1,
});

// Item de lista
registrarNo({
  nome: "listItem",
  grupo: "bloco",
  conteudo: "blocos",
  tag: "li",
});

// Citação em bloco
registrarNo({
  nome: "blockquote",
  grupo: "bloco",
  conteudo: "blocos",
  tag: "blockquote",
});

// Tabela
registrarNo({
  nome: "table",
  grupo: "bloco",
  conteudo: ["tableRow"],
  tag: "table",
});

// Linha da tabela
registrarNo({
  nome: "tableRow",
  grupo: "bloco",
  conteudo: ["tableCell", "tableHeader"],
  tag: "tr",
});

// Célula normal da tabela
registrarNo({
  nome: "tableCell",
  grupo: "bloco",
  conteudo: "blocos",
  tag: "td",
});

// Célula de cabeçalho da tabela
registrarNo({
  nome: "tableHeader",
  grupo: "bloco",
  conteudo: "blocos",
  tag: "th",
});

// ---------------------------------------------------------------------------- Marcas do Núcleo

registrarMarca({
  nome: "bold",
  tag: "strong",
});

registrarMarca({
  nome: "italic",
  tag: "em",
});

registrarMarca({
  nome: "underline",
  tag: "u",
});

registrarMarca({
  nome: "link",
  tag: "a",
  html: (dentro, marca) => {
    const href = hrefValido(marca.attrs?.href) ? marca.attrs.href : "";
    return href ? `<a href="${esc(href)}" rel="noopener noreferrer nofollow">${dentro}</a>` : dentro;
  },
});

registrarAtributo({
  alvo: "link",
  nome: "href",
  sanear: (v) => (hrefValido(v) ? v : undefined),
});
