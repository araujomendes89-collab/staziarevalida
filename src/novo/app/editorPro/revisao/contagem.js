// Contagem de palavras e caracteres (funções puras). O texto vem do documento: blocos separados por "\n".
const PALAVRA = /[\p{L}\p{N}]+(?:[-'’.,][\p{L}\p{N}]+)*/gu;
export const PALAVRAS_POR_MINUTO = 200; // leitura silenciosa, adulto, português

export function contarTexto(texto) {
  const t = typeof texto === "string" ? texto : "";
  const palavras = (t.match(PALAVRA) || []).length;
  const semQuebras = t.replace(/[\r\n]+/g, "");
  const comEspacos = Array.from(semQuebras).length;
  const semEspacos = Array.from(t.replace(/\s+/g, "")).length;
  const minutos = palavras === 0 ? 0 : Math.max(1, Math.ceil(palavras / PALAVRAS_POR_MINUTO));
  return { palavras, caracteres: comEspacos, caracteresSemEspacos: semEspacos, minutosLeitura: minutos };
}

export function textoDoDoc(doc) {
  return doc.textBetween(0, doc.content.size, "\n", " ");
}

/** Conta o documento todo e, se houver trecho selecionado, também a seleção. */
export function contarEditor(editor) {
  const { doc, selection } = editor.state;
  const tudo = contarTexto(textoDoDoc(doc));
  const selecao = selection.empty ? null : contarTexto(doc.textBetween(selection.from, selection.to, "\n", " "));
  return { tudo, selecao };
}

export function rotuloTempo(min) {
  if (!min) return "menos de 1 min";
  return min === 1 ? "1 min" : `${min} min`;
}
