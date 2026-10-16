import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Editor } from "@tiptap/core";

import { extensoesDe, botoesDaAba } from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import ParagrafoRico from "../novo/app/editorPro/leitor/ParagrafoRico.jsx";
import { lessonHtml } from "../../server/contentHub/render";
import { sanear, htmlDoDoc, precisaRico, ricoValido, textoDoDoc, docParaUnidade, unidadeParaDoc } from "../shared/docRico";

afterEach(() => cleanup());

const p = (texto: string, attrs?: Record<string, unknown>) => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content: [{ type: "text", text: texto }] });
const doc = (...content: any[]) => ({ type: "doc", content });
const env = (d: any) => ({ f: "sdoc", v: 1, doc: d });

describe("Editor Profissional - M2 Parágrafos", () => {
  it("sanear: guarda só valores fechados e descarta o padrão", () => {
    const d = sanear(doc(p("a", {
      textAlign: "center", lineHeight: 1.5, spacingBefore: 12, spacingAfter: 24, indent: 2, firstLineIndent: 1, borda: "fina", backgroundColor: "azul",
    })));
    expect(d.content[0].attrs).toEqual({ textAlign: "center", lineHeight: 1.5, spacingBefore: 12, spacingAfter: 24, indent: 2, firstLineIndent: 1, borda: "fina", backgroundColor: "azul" });

    const ruim = sanear(doc(p("a", {
      textAlign: "left", lineHeight: 1, spacingBefore: -1, spacingAfter: 999, indent: 0, firstLineIndent: 99, borda: "red; x:y", backgroundColor: "url(x)",
    })));
    expect(ruim.content[0].attrs).toBeUndefined();
    expect(sanear(doc(p("a", { textAlign: "justify", lineHeight: 9 }))).content[0].attrs).toEqual({ textAlign: "justify" });
    expect(sanear(doc(p("a", { lineHeight: 1.3 }))).content[0].attrs).toEqual({ lineHeight: 1.3 });
  });

  it("html do PDF aplica o estilo e não aceita CSS livre", () => {
    const html = htmlDoDoc(doc(p("a", { textAlign: "right", lineHeight: 2, spacingBefore: 8, indent: 2, backgroundColor: "amarelo" })) as any);
    expect(html).toContain("text-align:right;");
    expect(html).toContain("line-height:2;");
    expect(html).toContain("margin-top:8px;");
    expect(html).toContain("margin-left:3em;");
    expect(html).toContain("background-color:rgba(250,204,21,0.2);");
    expect(htmlDoDoc(doc(p("a", { textAlign: "x;color:red" })) as any)).toBe("<p>a</p>");
  });

  it("listas: estilo da numeração/marcador e multinível sobrevivem", () => {
    const item = (t: string, ...filhos: any[]) => ({ type: "listItem", content: [p(t), ...filhos] });
    const d = doc({
      type: "orderedList", attrs: { listStyle: "lower-alpha" },
      content: [item("a", { type: "bulletList", attrs: { listStyle: "square" }, content: [item("b", { type: "orderedList", content: [item("c")] })] })],
    });
    const s = sanear(d);
    expect(s.content[0].attrs).toEqual({ listStyle: "lower-alpha" });
    const nivel2 = s.content[0].content![0].content![1];
    expect(nivel2.type).toBe("bulletList");
    expect(nivel2.attrs).toEqual({ listStyle: "square" });
    expect(nivel2.content![0].content![1].type).toBe("orderedList");
    const html = htmlDoDoc(s);
    expect(html).toContain("list-style-type:lower-alpha;");
    expect(html).toContain("list-style-type:square;");
    expect(sanear(doc({ type: "orderedList", attrs: { listStyle: "decimal" }, content: [item("x")] })).content[0].attrs).toBeUndefined();
  });

  it("compatibilidade: parágrafo comum continua sem rico; formatado exige rico e o texto não muda", () => {
    expect(precisaRico(sanear(doc(p("oi"))).content[0])).toBe(false);
    const f = sanear(doc(p("oi", { textAlign: "center" }))).content[0];
    expect(precisaRico(f)).toBe(true);
    const e = env(sanear(doc(p("oi", { textAlign: "center" }))));
    expect(ricoValido("oi", e)).not.toBeNull();
    expect(ricoValido("outro", e)).toBeNull();
    expect(textoDoDoc(e.doc as any)).toBe("oi");
  });

  it("editor: botões registrados e comandos mudam só o que deve", () => {
    const ids = botoesDaAba("inicio").map((b: any) => b.id);
    for (const id of ["esq", "centro", "dir", "just", "entrelinha", "antes", "depois", "recuoMais", "recuoMenos", "borda", "backgroundColor", "estiloLista"]) expect(ids).toContain(id);

    const ed = new Editor({ extensions: extensoesDe({}), content: doc(p("um"), p("dois")) });
    (ed.commands as any).definirParagrafo("textAlign", "justify");
    expect(ed.getJSON().content![0].attrs?.textAlign).toBe("justify");
    // 'left' (null) volta ao padrão: nada é guardado
    (ed.commands as any).definirParagrafo("textAlign", null);
    expect(sanear(ed.getJSON()).content[0].attrs).toBeUndefined();

    (ed.commands as any).recuar(1);
    (ed.commands as any).recuar(1);
    expect(sanear(ed.getJSON()).content[0].attrs).toEqual({ indent: 2 });
    (ed.commands as any).recuar(-5);
    expect(sanear(ed.getJSON()).content[0].attrs).toBeUndefined();
    (ed.commands as any).recuar(99);
    expect(sanear(ed.getJSON()).content[0].attrs).toEqual({ indent: 6 });
    // o segundo parágrafo não foi tocado
    expect(sanear(ed.getJSON()).content[1].attrs).toBeUndefined();

    (ed.commands as any).definirParagrafo("backgroundColor", "verde");
    (ed.commands as any).limparParagrafo();
    expect(sanear(ed.getJSON()).content[0].attrs).toBeUndefined();
    ed.destroy();
  });

  it("editor: lista dentro de lista (Tab) e estilo da lista mais interna", () => {
    const item = (t: string) => ({ type: "listItem", content: [p(t)] });
    const ed = new Editor({ extensions: extensoesDe({}), content: doc({ type: "orderedList", content: [item("a"), item("b")] }) });
    ed.commands.setTextSelection(ed.state.doc.content.size - 2); // dentro do item "b"
    (ed.commands as any).recuar(1);
    const j = sanear(ed.getJSON());
    expect(j.content[0].content![0].content![1].type).toBe("orderedList");
    (ed.commands as any).estiloLista("upper-roman");
    expect(sanear(ed.getJSON()).content[0].content![0].content![1].attrs).toEqual({ listStyle: "upper-roman" });
    expect(sanear(ed.getJSON()).content[0].attrs).toBeUndefined();
    (ed.commands as any).recuar(-1);
    expect(sanear(ed.getJSON()).content[0].content!.length).toBe(2);
    ed.destroy();
  });

  it("ida e volta da aula inteira: texto não muda, rico guarda o alinhamento", () => {
    const unit = { sections: [{ heading: "S", paragraphs: [{ text: "um" }, { text: "dois" }] }] };
    const ed = new Editor({ extensions: extensoesDe({}), content: unidadeParaDoc(unit) as any });
    ed.commands.setTextSelection(ed.state.doc.content.size - 2);
    (ed.commands as any).definirParagrafo("textAlign", "center");
    const volta = docParaUnidade(sanear(ed.getJSON()), unit);
    expect(volta.sections[0].paragraphs[0]).toEqual({ text: "um" });
    expect(volta.sections[0].paragraphs[1].text).toBe("dois");
    expect(volta.sections[0].paragraphs[1].rico.doc.content[0].attrs.textAlign).toBe("center");
    ed.destroy();
  });

  it("leitor do aluno e PDF respeitam; rico velho é ignorado", () => {
    const rico = env(doc(p("oi", { textAlign: "center", spacingAfter: 18, firstLineIndent: 1 })));
    const { container, rerender } = render(<ParagrafoRico texto="oi" rico={rico} />);
    const el = container.querySelector(".tr-doc p") as HTMLElement;
    expect(el.style.textAlign).toBe("center");
    expect(el.style.marginBottom).toBe("18px");
    expect(el.style.textIndent).toBe("1.5em");
    rerender(<ParagrafoRico texto="mudou" rico={rico} />);
    expect(container.innerHTML).toBe("<p>mudou</p>");

    const meta = { title: "T", version: 1, revisedAt: "2026-10-16", contentHash: "x" } as any;
    const brand = { version: "1", logo: null, fontFaces: "", pending: [] } as any;
    expect(lessonHtml({ sections: [{ heading: "H", paragraphs: [{ text: "oi", rico }] }] }, meta, brand)).toContain("text-align:center;");
    expect(lessonHtml({ sections: [{ heading: "H", paragraphs: [{ text: "x", rico }] }] }, meta, brand)).not.toContain("text-align:center;");
  });
});
