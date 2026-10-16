// Localizar e substituir. A busca é feita bloco a bloco (um achado nunca atravessa dois parágrafos) e só mexe no texto:
// o "ref" dos blocos, as marcas (negrito etc.) e as tabelas continuam como estão.
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const chaveLocalizar = new PluginKey("localizarRevisao");
const LIMITE_ACHADOS = 5000; // teto de segurança para o navegador

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function montarRegex(termo, { maiusculas = false, palavraInteira = false } = {}) {
  if (!termo) return null;
  const miolo = escapar(termo);
  const fonte = palavraInteira ? `(?<![\\p{L}\\p{N}_])${miolo}(?![\\p{L}\\p{N}_])` : miolo;
  return new RegExp(fonte, maiusculas ? "gu" : "giu");
}

/** Lista [{ from, to }] (posições do ProseMirror) de todos os achados no documento. */
export function acharNoDoc(doc, termo, opcoes) {
  const re = montarRegex(termo, opcoes);
  const achados = [];
  if (!re) return achados;
  doc.descendants((no, pos) => {
    if (achados.length >= LIMITE_ACHADOS) return false;
    if (!no.isTextblock) return true;
    let texto = "";
    no.forEach((filho) => {
      texto += filho.isText ? filho.text : "￼"; // nó que não é texto (ex.: quebra de linha) ocupa 1 posição
    });
    const inicio = pos + 1;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto)) && achados.length < LIMITE_ACHADOS) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      achados.push({ from: inicio + m.index, to: inicio + m.index + m[0].length });
    }
    return false;
  });
  return achados;
}

const vazio = { termo: "", maiusculas: false, palavraInteira: false, atual: 0, achados: [] };

function recalcular(doc, base, atual) {
  const achados = acharNoDoc(doc, base.termo, base);
  const i = achados.length ? Math.min(Math.max(atual, 0), achados.length - 1) : 0;
  return { ...base, achados, atual: i };
}

function decoracoes(doc, s) {
  if (!s.achados.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    s.achados.map((a, i) => Decoration.inline(a.from, a.to, { class: i === s.atual ? "ep-achado ep-achado--atual" : "ep-achado" })),
  );
}

export const estadoLocalizar = (state) => chaveLocalizar.getState(state) || vazio;

export const Localizar = Extension.create({
  name: "localizarRevisao",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: chaveLocalizar,
        state: {
          init: () => vazio,
          apply(tr, s, _antigo, novo) {
            const meta = tr.getMeta(chaveLocalizar);
            if (meta) {
              const r = recalcular(novo.doc, { ...s, ...meta.base }, meta.atual ?? s.atual);
              if (typeof meta.depoisDe === "number" && r.achados.length) {
                const i = r.achados.findIndex((a) => a.from >= meta.depoisDe);
                r.atual = i === -1 ? 0 : i; // chegou ao fim: volta ao primeiro
              }
              return r;
            }
            if (tr.docChanged && s.termo) return recalcular(novo.doc, s, s.atual);
            return s;
          },
        },
        props: {
          decorations: (state) => decoracoes(state.doc, estadoLocalizar(state)),
        },
      }),
    ];
  },

  addCommands() {
    const irPara = (tr, s, i) => {
      const a = s.achados[i];
      tr.setMeta(chaveLocalizar, { base: {}, atual: i });
      if (a) tr.setSelection(TextSelection.create(tr.doc, a.from, a.to)).scrollIntoView();
      return tr;
    };
    return {
      /** Define o que procurar (sem mexer no foco do campo de busca). */
      buscar: (termo, opcoes = {}) => ({ tr, state, dispatch }) => {
        tr.setMeta(chaveLocalizar, {
          base: { termo: termo ?? "", maiusculas: Boolean(opcoes.maiusculas), palavraInteira: Boolean(opcoes.palavraInteira) },
          atual: 0,
        });
        dispatch?.(tr);
        return true;
      },
      buscarProximo: () => ({ tr, state, dispatch }) => {
        const s = estadoLocalizar(state);
        if (!s.achados.length) return false;
        dispatch?.(irPara(tr, s, (s.atual + 1) % s.achados.length));
        return true;
      },
      buscarAnterior: () => ({ tr, state, dispatch }) => {
        const s = estadoLocalizar(state);
        if (!s.achados.length) return false;
        dispatch?.(irPara(tr, s, (s.atual - 1 + s.achados.length) % s.achados.length));
        return true;
      },
      limparBusca: () => ({ tr, dispatch }) => {
        tr.setMeta(chaveLocalizar, { base: { termo: "" }, atual: 0 });
        dispatch?.(tr);
        return true;
      },
      /** Troca só o achado atual; o próximo vira o atual. */
      substituirAtual: (texto) => ({ tr, state, dispatch }) => {
        const s = estadoLocalizar(state);
        const a = s.achados[s.atual];
        if (!a) return false;
        if (dispatch) {
          if (texto) tr.insertText(texto, a.from, a.to);
          else tr.delete(a.from, a.to);
          tr.setMeta(chaveLocalizar, { base: {}, depoisDe: a.from + (texto ? texto.length : 0) });
          dispatch(tr);
        }
        return true;
      },
      /** Troca todos os achados numa só ação (um único "desfazer"). */
      substituirTudo: (texto) => ({ tr, state, dispatch }) => {
        const s = estadoLocalizar(state);
        if (!s.achados.length) return false;
        if (dispatch) {
          for (const a of [...s.achados].reverse()) {
            if (texto) tr.insertText(texto, a.from, a.to);
            else tr.delete(a.from, a.to);
          }
          dispatch(tr);
        }
        return true;
      },
    };
  },
});
