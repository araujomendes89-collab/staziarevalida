// Módulo formatação do editor profissional (M1): fonte, tamanho, cor do texto, marca-texto, tachado, sobrescrito e subscrito.
// Tudo por lista fechada (nada de valor livre): vale igual no editor, na leitura do aluno (React) e no PDF (HTML).
// Nomes = nomes das extensões do TipTap: marcas "textStyle" (fontFamily, fontSize, color), "highlight" (color), "strike", "subscript", "superscript".
import { registrarMarca, registrarAtributo, umDe, Css } from "../registro";

export interface FonteDoc { id: string; rotulo: string; pilha: string; aviso?: string }

// Pilhas sem aspas (o filtro de CSS não aceita aspas); nomes com espaço funcionam sem aspas.
export const FONTES: readonly FonteDoc[] = [
  { id: "jakarta", rotulo: "Plus Jakarta Sans (padrão do app)", pilha: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif" },
  { id: "newsreader", rotulo: "Newsreader (serifada do app)", pilha: "Newsreader, ui-serif, Georgia, serif" },
  { id: "jetbrains", rotulo: "JetBrains Mono (código)", pilha: "JetBrains Mono, ui-monospace, Menlo, monospace" },
  { id: "arial", rotulo: "Arial", pilha: "Arial, Helvetica, sans-serif" },
  { id: "calibri", rotulo: "Calibri", pilha: "Calibri, Carlito, Segoe UI, Helvetica, Arial, sans-serif", aviso: "Calibri só existe no Windows; no celular e no PDF aparece uma fonte parecida." },
  { id: "times", rotulo: "Times New Roman", pilha: "Times New Roman, Times, serif" },
  { id: "georgia", rotulo: "Georgia", pilha: "Georgia, Times New Roman, serif" },
  { id: "verdana", rotulo: "Verdana", pilha: "Verdana, Geneva, sans-serif" },
];

// Tamanhos em pontos (10 a 36), lista fechada para o celular do aluno não quebrar.
export const TAMANHOS: readonly number[] = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];

export interface CorDoc { id: string; rotulo: string; valor: string }

// Cores do texto: contraste conferido contra o fundo claro (#FFFFFF, mínimo 4,1:1) e o escuro do app (#0F1A2B, mínimo 3,4:1).
// "Automático" (sem cor) segue o tema do aluno e não aparece aqui.
export const CORES_TEXTO: readonly CorDoc[] = [
  { id: "vermelho", rotulo: "Vermelho", valor: "#D93A3A" },
  { id: "laranja", rotulo: "Laranja", valor: "#C4620A" },
  { id: "ambar", rotulo: "Âmbar", valor: "#A8710A" },
  { id: "verde", rotulo: "Verde", valor: "#2F8F3A" },
  { id: "verde-azulado", rotulo: "Verde-azulado", valor: "#0B8A8C" },
  { id: "azul", rotulo: "Azul", valor: "#2672D4" },
  { id: "roxo", rotulo: "Roxo", valor: "#8E4FD0" },
  { id: "rosa", rotulo: "Rosa", valor: "#D0306E" },
  { id: "cinza", rotulo: "Cinza", valor: "#6B7A8C" },
];

// Marca-texto: fundo claro com texto escuro fixo (legível nos dois temas).
export const TEXTO_NO_MARCA_TEXTO = "#1B2430";
export const CORES_MARCA_TEXTO: readonly CorDoc[] = [
  { id: "amarelo", rotulo: "Amarelo", valor: "#FFF3A3" },
  { id: "verde", rotulo: "Verde", valor: "#BDF0C8" },
  { id: "azul", rotulo: "Azul", valor: "#BFE1FF" },
  { id: "rosa", rotulo: "Rosa", valor: "#FFC9DE" },
  { id: "laranja", rotulo: "Laranja", valor: "#FFD8A8" },
  { id: "lilas", rotulo: "Lilás", valor: "#E2D1FF" },
  { id: "cinza", rotulo: "Cinza", valor: "#E1E6EC" },
];

const tamanhoValor = (n: number) => `${n}pt`;
export const TAMANHOS_VALOR: readonly string[] = TAMANHOS.map(tamanhoValor);

const minusculo = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const lista = (l: readonly CorDoc[]) => l.map((c) => c.valor.toLowerCase());
// Saneadores guardam o valor canônico da lista (hex em minúsculas já aceito; maiúsculas do JSON antigo viram o canônico).
const umDeCores = (l: readonly CorDoc[]) => {
  const ok = umDe(lista(l));
  return (v: unknown) => {
    const r = ok(minusculo(v));
    return r === undefined ? undefined : l.find((c) => c.valor.toLowerCase() === r)!.valor;
  };
};

registrarMarca({ nome: "textStyle", tag: "span" });
registrarAtributo({ alvo: "textStyle", nome: "fontFamily", sanear: umDe(FONTES.map((f) => f.id)), css: (v): Css => {
  const f = FONTES.find((x) => x.id === v);
  return f ? { "font-family": f.pilha } : {};
} });
registrarAtributo({ alvo: "textStyle", nome: "fontSize", sanear: umDe([...TAMANHOS_VALOR]), css: (v): Css => ({ "font-size": String(v) }) });
registrarAtributo({ alvo: "textStyle", nome: "color", sanear: umDeCores(CORES_TEXTO), css: (v): Css => ({ color: String(v) }) });

registrarMarca({ nome: "strike", tag: "s" });
registrarMarca({ nome: "subscript", tag: "sub" });
registrarMarca({ nome: "superscript", tag: "sup" });

registrarMarca({ nome: "highlight", tag: "mark" });
registrarAtributo({ alvo: "highlight", nome: "color", sanear: umDeCores(CORES_MARCA_TEXTO), css: (v): Css => ({ "background-color": String(v), color: TEXTO_NO_MARCA_TEXTO }) });
