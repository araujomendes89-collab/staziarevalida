// Módulo "paragrafos" do editor profissional (M2): alinhamento, entrelinha, espaço antes/depois, recuos, borda e sombreamento do
// parágrafo, estilo de lista e listas multinível. Os valores padrão não são guardados (parágrafo sem mudança fica idêntico).
import React from "react";
import { Extension } from "@tiptap/core";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao, Seletor } from "../ui.jsx";
import { cssSeguro } from "../../../../shared/docRico";
import {
  ATRIBUTOS_PARAGRAFO, BORDAS, FUNDOS, NUMERACOES, MARCADORES, RECUO_MAX, ESPACOS, ENTRELINHAS,
} from "../../../../shared/docRico/modulos/paragrafos";

const TIPOS = ["paragraph", "heading"];
const LISTAS = ["bulletList", "orderedList"];
const PADRAO = { textAlign: null, lineHeight: null, spacingBefore: null, spacingAfter: null, indent: null, firstLineIndent: null, borda: null, fundo: null };

const globais = () =>
  Object.entries(ATRIBUTOS_PARAGRAFO).reduce((acc, [nome, d]) => {
    acc[nome] = {
      default: null,
      parseHTML: () => null,
      renderHTML: (attrs) => {
        const v = attrs[nome];
        if (v === null || v === undefined) return {};
        const s = cssSeguro(d.css(v));
        return s ? { style: s } : {};
      },
    };
    return acc;
  }, {});

// Muda um atributo em todos os parágrafos/títulos da seleção (null = volta ao padrão).
const definir = (nome, valor) => ({ tr, state, dispatch }) => {
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (no, pos) => {
    if (TIPOS.includes(no.type.name)) {
      if (dispatch) tr.setNodeMarkup(pos, undefined, { ...no.attrs, [nome]: valor });
      return false;
    }
    return true;
  });
  return true;
};

// Lista mais interna que contém o cursor.
function listaAtual(editor) {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const no = $from.node(d);
    if (LISTAS.includes(no.type.name)) return { no, pos: $from.before(d) };
  }
  return null;
}

const Paragrafos = Extension.create({
  name: "paragrafosM2",
  addGlobalAttributes() {
    return [
      { types: TIPOS, attributes: globais() },
      {
        types: LISTAS,
        attributes: {
          listStyle: {
            default: null,
            parseHTML: () => null,
            renderHTML: (a) => (a.listStyle ? { style: cssSeguro({ "list-style-type": String(a.listStyle) }) } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      definirParagrafo: (nome, valor) => definir(nome, valor),
      limparParagrafo: () => ({ tr, state, dispatch }) => {
        const { from, to } = state.selection;
        state.doc.nodesBetween(from, to, (no, pos) => {
          if (TIPOS.includes(no.type.name)) {
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...no.attrs, ...PADRAO });
            return false;
          }
          return true;
        });
        return true;
      },
      estiloLista: (valor) => ({ tr, state, dispatch }) => {
        const l = listaAtual({ state });
        if (!l) return false;
        if (dispatch) tr.setNodeMarkup(l.pos, undefined, { ...l.no.attrs, listStyle: valor });
        return true;
      },
      recuar: (delta) => ({ editor, commands, state }) => {
        if (listaAtual(editor)) return delta > 0 ? commands.sinkListItem("listItem") : commands.liftListItem("listItem");
        const { $from } = state.selection;
        const atual = Number($from.parent.attrs?.indent) || 0;
        const novo = Math.max(0, Math.min(RECUO_MAX, atual + delta));
        return commands.definirParagrafo("indent", novo === 0 ? null : novo);
      },
    };
  },
  addKeyboardShortcuts() {
    const al = (v) => () => this.editor.commands.definirParagrafo("textAlign", v);
    return {
      "Mod-Shift-l": al(null),
      "Mod-Shift-e": al("center"),
      "Mod-Shift-r": al("right"),
      "Mod-Shift-j": al("justify"),
    };
  },
});

const atual = (editor, nome) => {
  for (const t of TIPOS) {
    const v = editor.getAttributes(t)?.[nome];
    if (v !== undefined && v !== null) return v;
  }
  return null;
};
const aplicar = (editor, nome, valor) => editor.chain().focus().definirParagrafo(nome, valor).run();
const foraDaTabela = () => true;

const botao = (id, ordem, icon, label, { grupo = "alinhamento", rotuloGrupo, aba = "inicio", ativo, pode, faz }) => ({
  id, aba, grupo, ordem, ...(rotuloGrupo ? { rotuloGrupo } : {}),
  Componente: ({ editor, ctx }) => (
    <Botao icon={icon} label={label} ativo={ativo ? ativo(editor) : undefined}
      disabled={ctx.somenteLeitura || (pode ? !pode(editor) : false)} onClick={() => faz(editor)} />
  ),
});

const ROTULOS_ENTRELINHA = { 1: "Simples", 1.15: "1,15", 1.5: "1,5", 2: "Duplo" };
const fmt = (n) => String(n).replace(".", ",");

function pedirNumero(texto, min, max) {
  if (typeof window === "undefined" || !window.prompt) return null;
  const r = window.prompt(texto);
  if (r == null) return null;
  const n = Number(String(r).replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const seletor = (id, ordem, grupo, label, montar) => ({
  id, aba: "inicio", grupo, ordem,
  Componente: ({ editor, ctx }) => {
    const { valor, opcoes, aoMudar, desligado } = montar(editor);
    return <Seletor label={label} value={valor} opcoes={opcoes} disabled={ctx.somenteLeitura || Boolean(desligado)} onChange={(v) => aoMudar(v)} />;
  },
});

const entrelinha = (editor) => {
  const v = atual(editor, "lineHeight");
  const base = ENTRELINHAS.map((n) => ({ valor: String(n), rotulo: `Entrelinha: ${ROTULOS_ENTRELINHA[n]}` }));
  const extra = v !== null && !ENTRELINHAS.includes(Number(v)) ? [{ valor: String(v), rotulo: `Entrelinha: ${fmt(v)}` }] : [];
  return {
    valor: v === null ? "1" : String(v),
    opcoes: [...base, ...extra, { valor: "outro", rotulo: "Entrelinha: outro valor..." }],
    aoMudar: (x) => {
      if (x === "outro") {
        const n = pedirNumero("Entrelinha (número de 1 a 3, ex.: 1,3):", 1, 3);
        if (n !== null) aplicar(editor, "lineHeight", n === 1 ? null : n);
        return;
      }
      aplicar(editor, "lineHeight", Number(x) === 1 ? null : Number(x));
    },
  };
};

const espaco = (nome, rotulo) => (editor) => {
  const v = atual(editor, nome);
  const extra = v !== null && !ESPACOS.includes(Number(v)) ? [{ valor: String(v), rotulo: `${rotulo}: ${v} px` }] : [];
  return {
    valor: v === null ? "0" : String(v),
    opcoes: [...ESPACOS.map((n) => ({ valor: String(n), rotulo: `${rotulo}: ${n} px` })), ...extra, { valor: "outro", rotulo: `${rotulo}: outro valor...` }],
    aoMudar: (x) => {
      if (x === "outro") {
        const n = pedirNumero(`${rotulo} (inteiro de 0 a 72 px):`, 0, 72);
        if (n !== null) aplicar(editor, nome, Math.round(n) === 0 ? null : Math.round(n));
        return;
      }
      aplicar(editor, nome, Number(x) === 0 ? null : Number(x));
    },
  };
};

const NOMES_BORDA = { fina: "Fina", media: "Média", grossa: "Grossa", esquerda: "Barra lateral" };
const NOMES_FUNDO = { cinza: "Cinza", amarelo: "Amarelo", azul: "Azul", verde: "Verde", vermelho: "Vermelho" };
const NOMES_NUM = { decimal: "1, 2, 3", "lower-alpha": "a, b, c", "upper-alpha": "A, B, C", "lower-roman": "i, ii, iii", "upper-roman": "I, II, III" };
const NOMES_MARC = { disc: "Bolinha cheia", circle: "Bolinha vazia", square: "Quadrado" };

const simples = (nome, nomes, vazio) => (editor) => {
  const v = atual(editor, nome);
  return {
    valor: v === null ? "" : String(v),
    opcoes: [{ valor: "", rotulo: vazio }, ...Object.keys(nomes).map((k) => ({ valor: k, rotulo: nomes[k] }))],
    aoMudar: (x) => aplicar(editor, nome, x || null),
  };
};

const estiloLista = (editor) => {
  const l = listaAtual(editor);
  const ordenada = l?.no.type.name === "orderedList";
  const chaves = ordenada ? NUMERACOES : ["disc", ...MARCADORES];
  const nomes = ordenada ? NOMES_NUM : NOMES_MARC;
  const v = l?.no.attrs.listStyle || chaves[0];
  return {
    desligado: !l,
    valor: String(v),
    opcoes: chaves.map((k) => ({ valor: k, rotulo: `Lista: ${nomes[k]}` })),
    aoMudar: (x) => editor.chain().focus().estiloLista(x === chaves[0] ? null : x).run(),
  };
};

function alinhar(id, ordem, icon, label, valor) {
  return botao(id, ordem, icon, label, {
    ativo: (e) => (atual(e, "textAlign") ?? null) === valor,
    faz: (e) => aplicar(e, "textAlign", valor),
  });
}

registrarModuloEditor({
  id: "paragrafos",
  extensoes: () => [Paragrafos],
  botoes: [
    { ...alinhar("esq", 300, "align-left", "Alinhar à esquerda (Ctrl+Shift+L)", null), rotuloGrupo: "Alinhamento" },
    alinhar("centro", 310, "align-center", "Centralizar (Ctrl+Shift+E)", "center"),
    alinhar("dir", 320, "align-right", "Alinhar à direita (Ctrl+Shift+R)", "right"),
    alinhar("just", 330, "align-justify", "Justificar (Ctrl+Shift+J)", "justify"),
    botao("recuoMenos", 260, "indent-decrease", "Diminuir recuo", { grupo: "paragrafo", pode: foraDaTabela, faz: (e) => e.chain().focus().recuar(-1).run() }),
    botao("recuoMais", 270, "indent-increase", "Aumentar recuo (em lista: vira subitem)", { grupo: "paragrafo", pode: foraDaTabela, faz: (e) => e.chain().focus().recuar(1).run() }),
    botao("primeiraLinha", 280, "arrow-right-to-line", "Recuo da primeira linha (liga/desliga)", {
      grupo: "paragrafo",
      ativo: (e) => Number(atual(e, "firstLineIndent")) > 0,
      pode: (e) => !listaAtual(e),
      faz: (e) => aplicar(e, "firstLineIndent", Number(atual(e, "firstLineIndent")) > 0 ? null : 1),
    }),
    seletor("estiloLista", 290, "paragrafo", "Estilo da lista", estiloLista),
    { ...seletor("entrelinha", 340, "espacamento", "Espaçamento entre linhas", entrelinha), rotuloGrupo: "Espaçamento" },
    seletor("antes", 350, "espacamento", "Espaço antes do parágrafo", espaco("spacingBefore", "Antes")),
    seletor("depois", 360, "espacamento", "Espaço depois do parágrafo", espaco("spacingAfter", "Depois")),
    { ...seletor("borda", 370, "caixa", "Borda do parágrafo", simples("borda", NOMES_BORDA, "Sem borda")), rotuloGrupo: "Borda e fundo" },
    seletor("backgroundColor", 380, "caixa", "Sombreamento do parágrafo", simples("backgroundColor", NOMES_FUNDO, "Sem sombreamento")),
    botao("limparParagrafo", 390, "eraser", "Limpar formatação do parágrafo", { grupo: "caixa", faz: (e) => e.chain().focus().limparParagrafo().run() }),
  ],
});
