// Núcleo do editor profissional (fundação): o mesmo conjunto do "texto com marcas" (negrito, itálico, sublinhado, link https,
// títulos, listas, citação, tabela simples) + o atributo "ref" que liga cada bloco ao parágrafo de origem da aula.
// Os módulos (formatação, parágrafos, imagens...) se registram nos próprios arquivos; este arquivo é da fundação.
import React from "react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao } from "../ui.jsx";
import { hrefValido } from "../../../../shared/textoRico";
import { listarNos } from "../../../../shared/docRico";

// "ref" = de qual parágrafo da aula o bloco veio (ex.: "2:5"). Não aparece no HTML; é copiado ao dividir o parágrafo.
const RefBloco = Extension.create({
  name: "refBloco",
  addGlobalAttributes() {
    const tipos = listarNos("bloco"); // tipos que não existirem no editor são ignorados pelo TipTap
    return [
      {
        types: tipos,
        attributes: {
          ref: { default: null, keepOnSplit: true, parseHTML: () => null, renderHTML: () => ({}) },
        },
      },
    ];
  },
});

const dentroDe = (editor, ...tipos) => tipos.some((t) => editor.isActive(t));
const b = (id, aba, grupo, ordem, icon, label, { ativo, pode, faz }) => ({
  id,
  aba,
  grupo,
  ordem,
  Componente: ({ editor, ctx }) => (
    <Botao
      icon={icon}
      label={label}
      ativo={ativo ? ativo(editor) : undefined}
      disabled={ctx.somenteLeitura || (pode ? !pode(editor) : false)}
      onClick={() => faz(editor.chain().focus()).run()}
    />
  ),
});
const foraDaTabela = (e) => !e.isActive("table");

registrarModuloEditor({
  id: "nucleo",
  extensoes: () => [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: (u) => hrefValido(u) },
    }),
    TableKit.configure({ table: { resizable: false } }),
    RefBloco,
  ],
  botoes: [
    b("desfazer", "inicio", "historico", 10, "undo-2", "Desfazer (Ctrl+Z)", { pode: (e) => e.can().undo(), faz: (c) => c.undo() }),
    b("refazer", "inicio", "historico", 20, "redo-2", "Refazer (Ctrl+Y)", { pode: (e) => e.can().redo(), faz: (c) => c.redo() }),
    b("negrito", "inicio", "fonte", 100, "bold", "Negrito (Ctrl+B)", { ativo: (e) => e.isActive("bold"), faz: (c) => c.toggleBold() }),
    b("italico", "inicio", "fonte", 110, "italic", "Itálico (Ctrl+I)", { ativo: (e) => e.isActive("italic"), faz: (c) => c.toggleItalic() }),
    b("sublinhado", "inicio", "fonte", 120, "underline", "Sublinhado (Ctrl+U)", { ativo: (e) => e.isActive("underline"), faz: (c) => c.toggleUnderline() }),
    b("titulo1", "inicio", "paragrafo", 200, "heading-1", "Título 1 (seção da aula)", { ativo: (e) => e.isActive("heading", { level: 2 }), pode: foraDaTabela, faz: (c) => c.toggleHeading({ level: 2 }) }),
    b("titulo2", "inicio", "paragrafo", 210, "heading-2", "Título 2", { ativo: (e) => e.isActive("heading", { level: 3 }), pode: foraDaTabela, faz: (c) => c.toggleHeading({ level: 3 }) }),
    b("titulo3", "inicio", "paragrafo", 220, "heading-3", "Título 3", { ativo: (e) => e.isActive("heading", { level: 4 }), pode: foraDaTabela, faz: (c) => c.toggleHeading({ level: 4 }) }),
    b("lista", "inicio", "paragrafo", 230, "list", "Lista com marcadores", { ativo: (e) => e.isActive("bulletList"), pode: foraDaTabela, faz: (c) => c.toggleBulletList() }),
    b("numerada", "inicio", "paragrafo", 240, "list-ordered", "Lista numerada", { ativo: (e) => e.isActive("orderedList"), pode: foraDaTabela, faz: (c) => c.toggleOrderedList() }),
    b("citacao", "inicio", "paragrafo", 250, "text-quote", "Citação", { ativo: (e) => e.isActive("blockquote"), pode: foraDaTabela, faz: (c) => c.toggleBlockquote() }),
    b("tabela", "inserir", "tabela", 100, "table", "Inserir tabela (3 × 3)", {
      pode: (e) => !dentroDe(e, "table", "bulletList", "orderedList", "blockquote"),
      faz: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    }),
    b("linhaAbaixo", "inserir", "tabela", 110, "between-horizontal-end", "Linha abaixo", { pode: (e) => e.isActive("table"), faz: (c) => c.addRowAfter() }),
    b("colunaDireita", "inserir", "tabela", 120, "between-vertical-end", "Coluna à direita", { pode: (e) => e.isActive("table"), faz: (c) => c.addColumnAfter() }),
    b("apagarLinha", "inserir", "tabela", 130, "rows-3", "Apagar linha", { pode: (e) => e.isActive("table"), faz: (c) => c.deleteRow() }),
    b("apagarColuna", "inserir", "tabela", 140, "columns-3", "Apagar coluna", { pode: (e) => e.isActive("table"), faz: (c) => c.deleteColumn() }),
    b("apagarTabela", "inserir", "tabela", 150, "trash-2", "Apagar tabela", { pode: (e) => e.isActive("table"), faz: (c) => c.deleteTable() }),
  ],
});
