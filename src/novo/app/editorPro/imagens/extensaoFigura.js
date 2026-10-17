import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state";
import { VistaFigura } from "./VistaFigura.jsx";
import { enviarArquivos, backendPadrao } from "./fonteImagens.js";
import { definirEstado } from "./estadoEnvio.js";

/**
 * Retorna o nó figura atualmente selecionado pelo cursor/NodeSelection ou null.
 */
export function figuraSelecionada(editor) {
  if (!editor?.state) return null;
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node?.type?.name === "figura") {
    return selection.node;
  }
  return null;
}

/**
 * Trata o envio e inserção de arquivos de imagens arrastados ou colados.
 */
export async function tratarArquivos(editor, files, pos, ctx) {
  if (ctx?.somenteLeitura || editor?.isEditable === false) return false;
  const lista = files ? Array.from(files) : [];
  if (lista.length === 0) return false;

  definirEstado(editor, { enviando: lista.length, erros: [] });

  try {
    const backend = ctx?.contexto?.backend ?? (await backendPadrao());
    const unidade = ctx?.contexto?.unidadeId;
    const aula = ctx?.contexto?.aulaId;
    const enviar = ctx?.contexto?.imagens?.enviar;

    const res = await enviarArquivos(lista, { backend, unidade, aula, enviar });

    definirEstado(editor, { enviando: 0, erros: res.erros });

    if (res.ok && res.ok.length > 0) {
      const figuras = res.ok.map((item) => ({
        asset: item.id,
        alt: item.alt,
        largura: 100,
      }));
      if (typeof pos === "number") {
        editor
          .chain()
          .focus()
          .insertContentAt(
            pos,
            figuras.map((f) => ({ type: "figura", attrs: f }))
          )
          .run();
      } else {
        editor.commands.inserirFiguras(figuras);
      }
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    definirEstado(editor, { enviando: 0, erros: [msg] });
    return false;
  }
}

/**
 * Cria a extensão TipTap do nó "figura".
 */
export function criarExtensaoFigura(ctx) {
  return Node.create({
    name: "figura",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
      return {
        asset: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-asset") || null,
          renderHTML: (attrs) => (attrs.asset ? { "data-asset": attrs.asset } : {}),
        },
        alt: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-alt") || null,
          renderHTML: (attrs) => (attrs.alt ? { "data-alt": attrs.alt } : {}),
        },
        legenda: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-legenda") || null,
          renderHTML: (attrs) => (attrs.legenda ? { "data-legenda": attrs.legenda } : {}),
        },
        largura: {
          default: null,
          parseHTML: (el) => {
            const v = el.getAttribute("data-largura");
            const n = v ? parseInt(v, 10) : NaN;
            return Number.isFinite(n) ? n : null;
          },
          renderHTML: (attrs) =>
            attrs.largura != null ? { "data-largura": String(attrs.largura) } : {},
        },
        alinhamento: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-alinhamento") || null,
          renderHTML: (attrs) =>
            attrs.alinhamento ? { "data-alinhamento": attrs.alinhamento } : {},
        },
        disposicao: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-disposicao") || null,
          renderHTML: (attrs) =>
            attrs.disposicao ? { "data-disposicao": attrs.disposicao } : {},
        },
        borda: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-borda") || null,
          renderHTML: (attrs) => (attrs.borda ? { "data-borda": attrs.borda } : {}),
        },
        cantos: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-cantos") || null,
          renderHTML: (attrs) => (attrs.cantos ? { "data-cantos": attrs.cantos } : {}),
        },
        sombra: {
          default: null,
          parseHTML: (el) => {
            const v = el.getAttribute("data-sombra");
            return v === "true" ? true : v === "false" ? false : null;
          },
          renderHTML: (attrs) =>
            attrs.sombra != null ? { "data-sombra": String(attrs.sombra) } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: "figure[data-figura]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["figure", mergeAttributes({ "data-figura": "" }, HTMLAttributes)];
    },

    addNodeView() {
      return ReactNodeViewRenderer(VistaFigura);
    },

    addCommands() {
      return {
        inserirFiguras:
          (lista) =>
          ({ commands, state }) => {
            const itens = Array.isArray(lista) ? lista : [lista];
            if (itens.length === 0) return false;
            const nos = itens.map((item) => ({
              type: this.name,
              attrs: {
                asset: item.asset ?? item.id ?? null,
                alt: item.alt ?? item.alt_text ?? null,
                largura: item.largura ?? 100,
                legenda: item.legenda ?? null,
                alinhamento: item.alinhamento ?? null,
                disposicao: item.disposicao ?? null,
                borda: item.borda ?? null,
                cantos: item.cantos ?? null,
                sombra: item.sombra ?? null,
              },
            }));
            // figura selecionada: as novas entram DEPOIS dela (nunca a substituem)
            const sel = state.selection;
            if (sel instanceof NodeSelection && sel.node?.type?.name === this.name) {
              return commands.insertContentAt(sel.to, nos);
            }
            return commands.insertContent(nos);
          },

        atualizarFigura:
          (attrs) =>
          ({ state, tr, dispatch }) => {
            const { selection } = state;
            if (
              !(selection instanceof NodeSelection) ||
              selection.node?.type?.name !== "figura"
            ) {
              return false;
            }
            const pos = selection.from;
            const novosAttrs = { ...selection.node.attrs };
            for (const [k, v] of Object.entries(attrs)) {
              if (v === null || v === "") {
                novosAttrs[k] = null;
              } else {
                novosAttrs[k] = v;
              }
            }
            if (dispatch) {
              tr.setNodeMarkup(pos, undefined, novosAttrs);
              tr.setSelection(NodeSelection.create(tr.doc, pos));
            }
            return true;
          },
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: new PluginKey("figuraDropPaste"),
          props: {
            handlePaste: (_view, event) => {
              if (ctx?.somenteLeitura || !editor.isEditable) return false;
              const files = event.clipboardData?.files;
              if (!files || files.length === 0) return false;
              const temImagem = Array.from(files).some(
                (f) => f.type && f.type.startsWith("image/")
              );
              if (!temImagem) return false;
              event.preventDefault();
              tratarArquivos(editor, files, null, ctx);
              return true;
            },
            handleDrop: (view, event) => {
              if (ctx?.somenteLeitura || !editor.isEditable) return false;
              const files = event.dataTransfer?.files;
              if (!files || files.length === 0) return false;
              const temImagem = Array.from(files).some(
                (f) => f.type && f.type.startsWith("image/")
              );
              if (!temImagem) return false;
              event.preventDefault();
              let pos = null;
              const coords = { left: event.clientX, top: event.clientY };
              const posAtCoords = view.posAtCoords(coords);
              if (posAtCoords) {
                pos = posAtCoords.pos;
              }
              tratarArquivos(editor, files, pos, ctx);
              return true;
            },
          },
        }),
      ];
    },
  });
}
