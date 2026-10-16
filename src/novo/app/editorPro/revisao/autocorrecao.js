// Autocorreção ao digitar (só símbolos; nunca altera letras, números nem termos médicos). Backspace logo depois desfaz a troca.
import { Extension, InputRule } from "@tiptap/core";
import { prefs } from "./preferencias.js";

const ABRE = /[\s([{—–‘“-]/;

function trocar(regraId, find, texto) {
  return { regraId, find, texto };
}

// "find" casa o fim do que foi digitado; o tiptap passa o trecho que será substituído em range.
export const REGRAS_DE_TROCA = [
  trocar("travessao", /--$/, () => "—"),
  trocar("setas", /->$/, () => "→"),
  trocar("setas", /<-$/, () => "←"),
  trocar("reticencias", /\.\.\.$/, () => "…"),
  trocar("comparacao", />=$/, () => "≥"),
  trocar("comparacao", /<=$/, () => "≤"),
  trocar("comparacao", /\+\/-$/, () => "±"),
];

function ativa(regraId) {
  const p = prefs();
  return p.autocorrecao && p.regras[regraId] !== false;
}

export function criarInputRules() {
  const regras = REGRAS_DE_TROCA.map(
    (r) =>
      new InputRule({
        find: r.find,
        handler: ({ state, range }) => {
          if (!ativa(r.regraId)) return null;
          state.tr.insertText(r.texto(), range.from, range.to);
        },
      }),
  );
  regras.push(
    new InputRule({
      find: /"$/,
      handler: ({ state, range }) => {
        if (!ativa("aspas")) return null;
        const antes = range.from > 0 ? state.doc.textBetween(range.from - 1, range.from, "\n", "￼") : "";
        const abrindo = antes === "" || ABRE.test(antes);
        state.tr.insertText(abrindo ? "“" : "”", range.from, range.to);
      },
    }),
  );
  return regras;
}

export const Autocorrecao = Extension.create({
  name: "autocorrecaoRevisao",
  addInputRules() {
    return criarInputRules();
  },
});
