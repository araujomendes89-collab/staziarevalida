// Extensões do TipTap do módulo formatação. Os valores aceitos são os mesmos da lista fechada de src/shared/docRico/modulos/formatacao.ts.
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { TextStyle } from "@tiptap/extension-text-style";
import Strike from "@tiptap/extension-strike";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import { FONTES, TAMANHOS_VALOR, CORES_TEXTO, CORES_MARCA_TEXTO, TEXTO_NO_MARCA_TEXTO } from "../../../../shared/docRico/modulos/formatacao";
import { colarFormato, cancelarPincel } from "./comandos.js";

const hex = (css) => {
  const s = String(css ?? "").trim().toLowerCase();
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  return s;
};
const corDaLista = (lista, css) => lista.find((c) => c.valor.toLowerCase() === hex(css))?.valor ?? null;
const primeiraFamilia = (css) => String(css ?? "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();
const fonteDe = (css) => FONTES.find((f) => primeiraFamilia(f.pilha) === primeiraFamilia(css))?.id ?? null;
const tamanhoDe = (css) => {
  const s = String(css ?? "").trim().toLowerCase();
  if (TAMANHOS_VALOR.includes(s)) return s;
  const px = s.match(/^(\d+(?:\.\d+)?)px$/); // colado de outro lugar: px vira o pt mais próximo da lista
  if (!px) return null;
  const pt = Number(px[1]) * 0.75;
  return TAMANHOS_VALOR.reduce((a, b) => (Math.abs(parseFloat(b) - pt) < Math.abs(parseFloat(a) - pt) ? b : a));
};

/** Fonte, tamanho e cor do texto: atributos da marca "textStyle". */
const EstiloDoTexto = Extension.create({
  name: "estiloDoTexto",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el) => fonteDe(el.style.fontFamily),
            renderHTML: (a) => {
              const f = FONTES.find((x) => x.id === a.fontFamily);
              return f ? { style: `font-family: ${f.pilha}` } : {};
            },
          },
          fontSize: {
            default: null,
            parseHTML: (el) => tamanhoDe(el.style.fontSize),
            renderHTML: (a) => (TAMANHOS_VALOR.includes(a.fontSize) ? { style: `font-size: ${a.fontSize}` } : {}),
          },
          color: {
            default: null,
            parseHTML: (el) => corDaLista(CORES_TEXTO, el.style.color),
            renderHTML: (a) => (corDaLista(CORES_TEXTO, a.color) ? { style: `color: ${a.color}` } : {}),
          },
        },
      },
    ];
  },
});

const MarcaTexto = Highlight.configure({ multicolor: true }).extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => corDaLista(CORES_MARCA_TEXTO, el.getAttribute("data-color") || el.style.backgroundColor),
        renderHTML: (a) =>
          corDaLista(CORES_MARCA_TEXTO, a.color) ? { "data-color": a.color, style: `background-color: ${a.color}; color: ${TEXTO_NO_MARCA_TEXTO}` } : {},
      },
    };
  },
});

/** Pincel de formatação: com o pincel armado, o próximo trecho selecionado com o mouse recebe a formatação guardada; Esc cancela. */
const Pincel = Extension.create({
  name: "pincel",
  addStorage() {
    return { marcas: null };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mouseup: () => {
              if (editor.storage.pincel.marcas) setTimeout(() => !editor.isDestroyed && colarFormato(editor), 0);
              return false;
            },
          },
          handleKeyDown: (_view, e) => {
            if (e.key === "Escape" && editor.storage.pincel.marcas) {
              cancelarPincel(editor);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

export const extensoesFormatacao = () => [TextStyle, EstiloDoTexto, Strike, Subscript, Superscript, MarcaTexto, Pincel];
