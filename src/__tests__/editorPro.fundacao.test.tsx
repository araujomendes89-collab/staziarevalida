import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import fs from "fs";

import { registrarModuloEditor, modulosEditor, extensoesDe, botoesDaAba } from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import EditorDocumento from "../novo/app/editorPro/EditorDocumento.jsx";
import { registrarLeitor, leitorDe } from "../novo/app/editorPro/leitor/registroLeitor.js";
import LeitorDoc from "../novo/app/editorPro/leitor/LeitorDoc.jsx";
import ParagrafoRico from "../novo/app/editorPro/leitor/ParagrafoRico.jsx";
import { lessonHtml } from "../../server/contentHub/render";
import { sanear, docParaUnidade, unidadeParaDoc, blocoDeTexto } from "../shared/docRico";

afterEach(() => cleanup());

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

describe("Editor Profissional - Fundação", () => {
  it("1. registroEditor", () => {
    expect(() => registrarModuloEditor({ id: "nucleo" })).toThrow(/já registrado/);
    expect(() => registrarModuloEditor({ id: "teste", botoes: [{ id: "x", aba: "inexistente" }] })).toThrow(/inválida/);
    
    const botoesInicio = botoesDaAba("inicio");
    const arrBotoes = botoesInicio.map(b => b.id);
    const sortedArr = [...botoesInicio].sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.id.localeCompare(b.id);
    }).map(b => b.id);
    expect(arrBotoes).toEqual(sortedArr);

    expect(arrBotoes).toContain("desfazer");
    expect(arrBotoes).toContain("negrito");
    
    const botoesInserir = botoesDaAba("inserir");
    expect(botoesInserir.map(b => b.id)).toContain("tabela");
  });

  it("2. IDA E VOLTA COM O EDITOR DE VERDADE", () => {
    const fixtures = [
      { sections: [] },
      { sections: [{ heading: "Teste", paragraphs: [] }] },
      { sections: [{ heading: "", paragraphs: [] }] },
      { sections: [{ heading: "S1", paragraphs: [{ text: "p1", clinical: false, claim_ids: [] }] }] },
      { sections: [{ heading: "S2", paragraphs: [{ text: "a **b** c", clinical: true, claim_ids: ["abc"] }] }] },
      { sections: [{ heading: "S3", paragraphs: [{ text: "1 \\* 2" }] }] },
      { sections: [{ heading: "S4", paragraphs: [{ text: "L1\nL2" }] }] },
      { doc_config: { hide_title: true }, sections: [{ heading: "S5", paragraphs: [{ text: "p" }] }], references: ["ref1"], pdf_estilo: "moderno" }
    ];

    for (const f of fixtures) {
      const doc = unidadeParaDoc(f);
      const editor = new Editor({ extensions: extensoesDe({}), content: doc });
      const json = editor.getJSON();
      const unit = docParaUnidade(sanear(json), f);
      expect(JSON.stringify(unit)).toBe(JSON.stringify(f));
    }

    const unitsPath = process.env.DOC_RICO_DADOS ?? "/Volumes/StaziaMed/.tmp-aulas/editor-word/dados";
    const fileUnits = unitsPath + "/units.json";
    if (fs.existsSync(fileUnits)) {
      const data = JSON.parse(fs.readFileSync(fileUnits, "utf-8"));
      let paraCount = 0;
      expect(data.length).toBe(23);
      for (const u of data) {
        const f = u.content;
        const doc = unidadeParaDoc(f);
        const editor = new Editor({ extensions: extensoesDe({}), content: doc });
        const unit = docParaUnidade(sanear(editor.getJSON()), f);
        expect(JSON.stringify(unit)).toBe(JSON.stringify(f));
        paraCount += f.sections?.reduce((sum, s) => sum + (s.paragraphs?.length || 0), 0) || 0;
        editor.destroy();
      }
      expect(paraCount).toBe(668);
    }
  });

  it("3. Edição pelo editor", () => {
    const f = { sections: [{ heading: "S", paragraphs: [{ text: "ola" }] }] };
    const doc = unidadeParaDoc(f);
    const editor = new Editor({ extensions: extensoesDe({}), content: doc });
    
    // Select all text in paragraph
    editor.commands.setTextSelection({ from: 4, to: 7 }); // título "S" ocupa 0..3
    editor.commands.toggleBold();
    const unit1 = docParaUnidade(sanear(editor.getJSON()), f);
    expect(unit1.sections[0].paragraphs[0].text).toBe("**ola**");
    
    editor.commands.toggleBulletList();
    const unit2 = docParaUnidade(sanear(editor.getJSON()), f);
    expect(unit2.sections[0].paragraphs[0].text).toBe("• **ola**");
    expect(unit2.sections[0].paragraphs[0].rico).toBeDefined();

    // o rico guardado volta idêntico ao reabrir no editor (não muda o hash à toa)
    const ed2 = new Editor({ extensions: extensoesDe({}), content: unidadeParaDoc(unit2) });
    expect(JSON.stringify(docParaUnidade(sanear(ed2.getJSON()), unit2))).toBe(JSON.stringify(unit2));
    ed2.destroy();
  });

  it("4. EditorDocumento monta", () => {
    const fn = vi.fn();
    const doc = unidadeParaDoc({ sections: [{ heading: "S", paragraphs: [{ text: "teste" }] }] });
    let ed: any = null;
    const { container } = render(<EditorDocumento valor={doc} aoMudar={fn} aoCriar={(e: any) => (ed = e)} />);
    
    expect(screen.getByRole("tab", { name: "Página inicial" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Inserir" })).toBeDefined();

    // Select text "teste"
    const editorEl = container.querySelector(".ProseMirror");
    expect(editorEl).toBeDefined();
    
    // seleciona "teste" e clica em Negrito
    act(() => {
      ed.commands.setTextSelection({ from: 4, to: 9 });
    });
    const btn = screen.getByRole("button", { name: "Negrito (Ctrl+B)" });
    fireEvent.click(btn);
    expect(fn).toHaveBeenCalled();
  });

  it("5. LeitorDoc: marcas, listas, tabela, citação, script escapado, sem attributes injetados", () => {
    const rico = {
      doc: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "bold e script <script>alert(1)</script>", marks: [{ type: "bold" }] }] },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] }] },
          { type: "table", content: [
            { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "header" }] }] }] },
            { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "cell" }] }] }] }
          ]},
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quote" }] }] },
          { type: "paragraph", content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }
        ]
      }
    };
    const { container } = render(<LeitorDoc rico={rico} />);
    const html = container.innerHTML;
    
    expect(html).toContain("<strong>bold e script &lt;script&gt;alert(1)&lt;/script&gt;</strong>");
    expect(html).toContain("tr-lista");
    expect(html).toContain("tr-tabela-rolagem");
    expect(html).toContain("tr-tabela");
    expect(html).toContain("thead");
    expect(html).toContain("tr-citacao");
    expect(html).not.toContain("<a"); // javascript protocol filtered
    expect(html).not.toContain("data-ref");
    expect(html).not.toContain("ref=");
  });

  it("6. ParagrafoRico", () => {
    const lista = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "ola" }] }] }] }] } };
    const { container, rerender } = render(<ParagrafoRico texto="ola" />);
    expect(container.innerHTML).toBe("<p>ola</p>"); // sem rico: igual ao texto de hoje

    rerender(<ParagrafoRico texto="• ola" rico={lista} />);
    expect(container.querySelector(".tr-doc ul.tr-lista li")?.textContent).toBe("ola");

    // texto mudou pelo caminho antigo: o rico velho é ignorado
    rerender(<ParagrafoRico texto="mudou" rico={lista} />);
    expect(container.querySelector(".tr-doc")).toBeNull();
    expect(container.innerHTML).toBe("<p>mudou</p>");
  });

  it("7. render.ts usa o rico válido e cai no texto quando o rico é velho", () => {
    const meta = { title: "T", version: 1, revisedAt: "2026-10-16", contentHash: "x" } as any;
    const brand = { version: "1", logo: null, fontFaces: "", pending: [] } as any;
    const lista = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "ola" }] }] }] }] } };
    const html1 = lessonHtml({ sections: [{ heading: "H", paragraphs: [{ text: "ola" }] }] }, meta, brand);
    expect(html1).toContain("<p>ola</p>");
    const html2 = lessonHtml({ sections: [{ heading: "H", paragraphs: [{ text: "• ola", rico: lista }] }] }, meta, brand);
    expect(html2).toMatch(/<ul[^>]*><li[^>]*><p>ola<\/p><\/li><\/ul>/);
    const html3 = lessonHtml({ sections: [{ heading: "H", paragraphs: [{ text: "mudou", rico: lista }] }] }, meta, brand);
    expect(html3).toContain("<p>mudou</p>");
    expect(html3).not.toContain("<ul");
  });

  it("8. Migração 013020", () => {
    const sql = fs.readFileSync("supabase/migrations/20261003013020_editor_pro_ricos_aluno.sql", "utf8");
    expect(sql).toContain("'ricos'");
    expect(sql).toContain("with ordinality");
    expect(sql).toContain("'doc_config'");
    expect(sql).toContain("revoke execute on function public.app_tema_aula(text) from public, anon;");
    expect(sql).toContain("grant execute on function public.app_tema_aula(text) to authenticated;");
    expect(sql).not.toContain("claims");
    expect(sql).not.toContain("claim_ids");
    expect(sql).not.toContain("'fontes'");
    expect(sql).not.toContain("references");
  });
});
