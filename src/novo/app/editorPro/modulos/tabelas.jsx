// Módulo "tabelas" do editor profissional (M4): linhas/colunas acima e abaixo, mesclar e dividir células, cabeçalho de linha/coluna,
// largura da coluna, cor da célula e janela "Inserir tabela". Os atributos são saneados em src/shared/docRico/modulos/tabelas.ts.
import React from "react";
import { Extension } from "@tiptap/core";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao, Seletor } from "../ui.jsx";
import { cssSeguro } from "../../../../shared/docRico";
import PainelTabela from "../tabelas/PainelTabela.jsx";
import { CORES_CELULA, LARGURAS, definirLarguraColuna } from "../tabelas/comandos.js";
import "../tabelas/tabelas.css";

const CELULAS = ["tableCell", "tableHeader"];

// Atributos "cellBackground" e "colwidth" nas células (o JSON do TipTap é o formato guardado; o saneador do documento decide o que vale).
const AtributosCelula = Extension.create({
  name: "atributosCelula",
  addGlobalAttributes() {
    return [
      {
        types: CELULAS,
        attributes: {
          cellBackground: {
            default: null,
            parseHTML: (el) => el.style?.backgroundColor || null,
            renderHTML: (a) => {
              const st = a.cellBackground ? cssSeguro({ "background-color": a.cellBackground }) : "";
              return st ? { style: st } : {};
            },
          },
          colwidth: {
            default: null,
            parseHTML: (el) => {
              const n = parseInt(el.style?.width, 10);
              return Number.isFinite(n) ? n : null;
            },
            renderHTML: (a) => (Number(a.colwidth) > 0 ? { style: `width:${Number(a.colwidth)}px;min-width:${Number(a.colwidth)}px` } : {}),
          },
        },
      },
    ];
  },
});

const naTabela = (e) => e.isActive("table");
const btn = (id, grupo, ordem, icon, label, { pode, ativo, faz }) => ({
  id,
  aba: "inserir",
  grupo,
  ordem,
  Componente: ({ editor, ctx }) => (
    <Botao
      icon={icon}
      label={label}
      ativo={ativo ? ativo(editor) : undefined}
      disabled={ctx.somenteLeitura || !pode(editor)}
      onClick={() => faz(editor.chain().focus()).run()}
    />
  ),
});

const corAtual = (editor) => {
  const a = editor.getAttributes("tableCell").cellBackground ?? editor.getAttributes("tableHeader").cellBackground;
  return a && CORES_CELULA.some((c) => c.valor === a) ? a : "";
};
const larguraAtual = (editor) => {
  const a = editor.getAttributes("tableCell").colwidth ?? editor.getAttributes("tableHeader").colwidth;
  return a && LARGURAS.some((c) => c.valor === String(a)) ? String(a) : "";
};

registrarModuloEditor({
  id: "tabelas",
  extensoes: () => [AtributosCelula],
  paineis: [{ id: "tabela-inserir", titulo: "Inserir tabela", icone: "table-properties", Componente: PainelTabela }],
  botoes: [
    btn("tb-linhaAcima", "tabela", 160, "between-horizontal-start", "Linha acima", { pode: naTabela, faz: (c) => c.addRowBefore() }),
    btn("tb-colunaEsquerda", "tabela", 170, "between-vertical-start", "Coluna à esquerda", { pode: naTabela, faz: (c) => c.addColumnBefore() }),
    btn("tb-mesclar", "tabela", 180, "table-cells-merge", "Mesclar células selecionadas", { pode: (e) => e.can().mergeCells(), faz: (c) => c.mergeCells() }),
    btn("tb-dividir", "tabela", 190, "table-cells-split", "Dividir célula mesclada", { pode: (e) => e.can().splitCell(), faz: (c) => c.splitCell() }),
    btn("tb-cabLinha", "tabela", 200, "panel-top", "Linha de cabeçalho (liga e desliga)", { pode: naTabela, faz: (c) => c.toggleHeaderRow() }),
    btn("tb-cabColuna", "tabela", 210, "columns-3", "Coluna de cabeçalho (liga e desliga)", { pode: naTabela, faz: (c) => c.toggleHeaderColumn() }),
    {
      id: "tb-cor",
      aba: "inserir",
      grupo: "tabela",
      ordem: 220,
      Componente: ({ editor, ctx }) => (
        <Seletor
          label="Cor de cellBackground da célula"
          value={corAtual(editor)}
          opcoes={CORES_CELULA}
          disabled={ctx.somenteLeitura || !naTabela(editor)}
          onChange={(v) => editor.chain().focus().setCellAttribute("cellBackground", v || null).run()}
        />
      ),
    },
    {
      id: "tb-largura",
      aba: "inserir",
      grupo: "tabela",
      ordem: 230,
      Componente: ({ editor, ctx }) => (
        <Seletor
          label="Largura da coluna"
          value={larguraAtual(editor)}
          opcoes={LARGURAS}
          disabled={ctx.somenteLeitura || !naTabela(editor)}
          onChange={(v) => {
            editor.commands.focus();
            definirLarguraColuna(editor, v ? Number(v) : null);
          }}
        />
      ),
    },
  ],
});
