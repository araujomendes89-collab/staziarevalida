// Comandos de formatação que o TipTap não traz prontos: maiúsculas/minúsculas, limpar formatação e pincel.
// Só funções puras sobre o editor (sem React), para o teste usar o editor de verdade.
import { TextSelection } from "@tiptap/pm/state";

const LETRA = /\p{L}/u;
const PONTUACAO_FIM = /[.!?]/;

/** Aplica o modo ao texto. `ctx` guarda o estado entre pedaços do mesmo bloco ({ inicioFrase, inicioPalavra }). */
export function aplicarCaixa(texto, modo, ctx = { inicioFrase: true, inicioPalavra: true }) {
  let saida = "";
  for (const ch of texto) {
    const ehLetra = LETRA.test(ch);
    let novo = ch;
    if (modo === "maiusculas") novo = ch.toLocaleUpperCase("pt-BR");
    else if (modo === "minusculas") novo = ch.toLocaleLowerCase("pt-BR");
    else if (modo === "alternar") novo = ch === ch.toLocaleUpperCase("pt-BR") ? ch.toLocaleLowerCase("pt-BR") : ch.toLocaleUpperCase("pt-BR");
    else if (modo === "palavras") novo = ehLetra ? (ctx.inicioPalavra ? ch.toLocaleUpperCase("pt-BR") : ch.toLocaleLowerCase("pt-BR")) : ch;
    else if (modo === "sentenca") {
      if (ehLetra) novo = ctx.inicioFrase ? ch.toLocaleUpperCase("pt-BR") : ch.toLocaleLowerCase("pt-BR");
    }
    saida += novo;
    if (ehLetra || /[\d'’]/.test(ch)) {
      ctx.inicioPalavra = false;
      if (ehLetra) ctx.inicioFrase = false;
    } else {
      ctx.inicioPalavra = true;
      if (PONTUACAO_FIM.test(ch)) ctx.inicioFrase = true;
    }
  }
  return saida;
}

/** Sem seleção, a palavra sob o cursor; com seleção, a própria seleção. */
function intervalo(state) {
  const { from, to, empty, $from } = state.selection;
  if (!empty) return { from, to };
  const bloco = $from.parent;
  if (!bloco.isTextblock) return null;
  const texto = bloco.textBetween(0, bloco.content.size, "\n", "\0");
  const i = $from.parentOffset;
  let a = i;
  let b = i;
  while (a > 0 && /[\p{L}\d'’]/u.test(texto[a - 1])) a--;
  while (b < texto.length && /[\p{L}\d'’]/u.test(texto[b])) b++;
  if (a === b) return null;
  const inicio = $from.start();
  return { from: inicio + a, to: inicio + b };
}

/** modo: "maiusculas" | "minusculas" | "sentenca" | "palavras" | "alternar". Mantém as marcas (negrito, cor...) de cada trecho. */
export function mudarCaixa(editor, modo) {
  const { state, view } = editor;
  const faixa = intervalo(state);
  if (!faixa) return false;
  const trocas = [];
  let ctx = { inicioFrase: true, inicioPalavra: true };
  state.doc.nodesBetween(faixa.from, faixa.to, (no, pos) => {
    if (no.isTextblock) {
      ctx = { inicioFrase: true, inicioPalavra: true };
      // texto antes da faixa dentro do mesmo bloco só serve de contexto da frase
      if (modo === "sentenca" || modo === "palavras") {
        const antes = state.doc.textBetween(pos + 1, Math.max(pos + 1, Math.min(faixa.from, pos + no.nodeSize - 1)), "\n", "\0");
        if (antes) aplicarCaixa(antes, "alternar", ctx);
      }
      return true;
    }
    if (!no.isText) return true;
    const a = Math.max(faixa.from, pos);
    const b = Math.min(faixa.to, pos + no.nodeSize);
    const velho = no.text.slice(a - pos, b - pos);
    const novo = aplicarCaixa(velho, modo, ctx);
    if (novo !== velho) trocas.push({ a, b, novo, marks: no.marks });
    return false;
  });
  if (!trocas.length) return false;
  const tr = state.tr;
  let delta = 0;
  for (const t of trocas.reverse()) {
    tr.replaceWith(t.a, t.b, state.schema.text(t.novo, t.marks));
    delta += t.novo.length - (t.b - t.a);
  }
  const { empty, from, to } = state.selection;
  tr.setSelection(TextSelection.create(tr.doc, from, empty ? from : to + delta));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Tira toda a formatação de caractere (fonte, tamanho, cores, negrito, tachado...), mantendo links e a estrutura do texto. */
export function limparFormatacao(editor) {
  const { state, view } = editor;
  const { from, to, empty } = state.selection;
  const tr = state.tr;
  const tipos = Object.values(state.schema.marks).filter((t) => t.name !== "link");
  if (empty) {
    const faixa = intervalo(state);
    for (const t of tipos) if (faixa) tr.removeMark(faixa.from, faixa.to, t);
    tr.setStoredMarks((state.storedMarks ?? state.selection.$from.marks()).filter((m) => m.type.name === "link"));
  } else {
    for (const t of tipos) tr.removeMark(from, to, t);
  }
  view.dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------- pincel de formatação

const marcasSemLink = (marcas) => marcas.filter((m) => m.type.name !== "link");

/** Guarda a formatação do ponto/trecho selecionado. */
export function copiarFormato(editor) {
  const { state } = editor;
  const { empty, from, $from } = state.selection;
  const marcas = empty ? (state.storedMarks ?? $from.marks()) : (state.doc.nodeAt(from)?.marks ?? $from.marks());
  editor.storage.pincel.marcas = marcasSemLink(marcas);
  avisar(editor);
}

export function cancelarPincel(editor) {
  editor.storage.pincel.marcas = null;
  avisar(editor);
}

/** Cola a formatação guardada na seleção (troca a formatação atual do trecho, menos links) e desarma o pincel. */
export function colarFormato(editor) {
  const marcas = editor.storage.pincel.marcas;
  const { state, view } = editor;
  const { from, to, empty } = state.selection;
  if (!marcas || empty) return false;
  const tr = state.tr;
  for (const t of Object.values(state.schema.marks)) if (t.name !== "link") tr.removeMark(from, to, t);
  for (const m of marcas) tr.addMark(from, to, m);
  view.dispatch(tr);
  cancelarPincel(editor);
  return true;
}

// Uma transação vazia faz a barra se redesenhar (o botão do pincel muda de cor).
function avisar(editor) {
  editor.view.dispatch(editor.state.tr.setMeta("pincel", true));
  editor.view.dom.classList.toggle("ep-pincel-armado", Boolean(editor.storage.pincel.marcas));
}
