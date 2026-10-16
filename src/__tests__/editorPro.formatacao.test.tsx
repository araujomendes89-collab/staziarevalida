import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";

import { extensoesDe, botoesDaAba } from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import EditorDocumento from "../novo/app/editorPro/EditorDocumento.jsx";
import LeitorDoc from "../novo/app/editorPro/leitor/LeitorDoc.jsx";
import { aplicarCaixa, mudarCaixa, limparFormatacao, copiarFormato, colarFormato } from "../novo/app/editorPro/formatacao/comandos.js";
import { lessonHtml } from "../../server/contentHub/render";
import { sanear, docParaUnidade, unidadeParaDoc } from "../shared/docRico";
import { CORES_TEXTO, CORES_MARCA_TEXTO, FONTES, TAMANHOS } from "../shared/docRico/modulos/formatacao";

afterEach(() => cleanup());

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const base = { sections: [{ heading: "S", paragraphs: [{ text: "ola mundo. outra frase" }] }] };
// título "S" ocupa as posições 0..3; o parágrafo começa em 4
const novoEditor = (texto = "ola mundo. outra frase") =>
  new Editor({ extensions: extensoesDe({}), content: unidadeParaDoc({ sections: [{ heading: "S", paragraphs: [{ text: texto }] }] }) });
const paragrafo = (e: Editor) => (sanear(e.getJSON()) as any).content[1];
const textoPuro = (e: Editor) => paragrafo(e).content.map((n: any) => n.text).join("");
const meta = { title: "T", version: 1, revisedAt: "2026-10-16", contentHash: "x" } as any;
const brand = { version: "1", logo: null, fontFaces: "", pending: [] } as any;

describe("M1 formatação", () => {
  it("botões registrados na Página inicial", () => {
    const ids = botoesDaAba("inicio").map((b: any) => b.id);
    for (const id of ["fonte", "tamanho", "tachado", "subscrito", "sobrescrito", "corTexto", "marcaTexto", "caixa", "limpar", "pincel"]) expect(ids).toContain(id);
  });

  it("aplica fonte, tamanho, cor, marca-texto, tachado, sobrescrito e fica no formato sdoc", () => {
    const e = novoEditor("ola");
    e.commands.setTextSelection({ from: 4, to: 7 });
    e.chain().setMark("textStyle", { fontFamily: "arial" }).setMark("textStyle", { fontFamily: "arial", fontSize: "18pt", color: CORES_TEXTO[0].valor }).run();
    e.chain().setMark("highlight", { color: CORES_MARCA_TEXTO[0].valor }).toggleMark("strike").toggleMark("superscript").run();
    const marks = paragrafo(e).content[0].marks.map((m: any) => m.type);
    expect(marks).toEqual(expect.arrayContaining(["textStyle", "highlight", "strike", "superscript"]));
    const unid = docParaUnidade(sanear(e.getJSON()), base);
    const p = unid.sections[0].paragraphs[0];
    expect(p.text).toBe("ola"); // o texto oficial não muda
    expect(p.rico).toBeDefined();
    // volta idêntico ao reabrir
    const e2 = new Editor({ extensions: extensoesDe({}), content: unidadeParaDoc(unid) });
    expect(JSON.stringify(docParaUnidade(sanear(e2.getJSON()), unid))).toBe(JSON.stringify(unid));
    // PDF
    const html = lessonHtml({ sections: [{ heading: "H", paragraphs: [{ text: p.text, rico: p.rico }] }] }, meta, brand);
    expect(html).toMatch(/font-family:Arial, Helvetica, sans-serif;/);
    expect(html).toContain("font-size:18pt;");
    expect(html).toContain(`color:${CORES_TEXTO[0].valor};`);
    expect(html).toContain("<mark");
    expect(html).toContain(`background-color:${CORES_MARCA_TEXTO[0].valor};`);
    expect(html).toContain("<s>");
    expect(html).toContain("<sup>");
    e.destroy(); e2.destroy();
  });

  it("saneamento: valores fora da lista somem; nada de CSS livre", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "text", text: "a", marks: [{ type: "textStyle", attrs: { fontFamily: "Comic Sans", fontSize: "99pt", color: "url(javascript:x)" } }] },
        { type: "text", text: "b", marks: [{ type: "textStyle", attrs: { fontFamily: "times", fontSize: "12pt", color: "#d93a3a", x: "y" } }] },
        { type: "text", text: "c", marks: [{ type: "highlight", attrs: { color: "red; background:url(x)" } }] },
        { type: "text", text: "d", marks: [{ type: "highlight", attrs: { color: "#FFF3A3" } }] },
      ] }],
    };
    const s = sanear(doc) as any;
    const [a, b, c, d] = s.content[0].content;
    expect(a.marks?.[0].attrs).toBeUndefined();
    expect(b.marks[0].attrs).toEqual({ fontFamily: "times", fontSize: "12pt", color: "#D93A3A" });
    expect(c.marks?.[0].attrs).toBeUndefined();
    expect(d.marks[0].attrs).toEqual({ color: "#FFF3A3" });
    const html = lessonHtml({ sections: [{ heading: "H", paragraphs: [{ text: "abcd", rico: { f: "sdoc", v: 1, doc } }] }] }, meta, brand);
    expect(html).not.toContain("Comic");
    expect(html).not.toContain("url(");
    expect(html).not.toContain("99pt");
  });

  it("leitor do aluno desenha as marcas com os estilos", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "H2O", marks: [{ type: "subscript" }, { type: "textStyle", attrs: { fontSize: "16pt", fontFamily: "georgia", color: "#2672D4" } }] }] }] };
    const { container } = render(<LeitorDoc rico={{ doc }} />);
    const html = container.innerHTML;
    expect(html).toContain("<sub>");
    expect(html).toContain("font-size: 16pt");
    expect(html).toContain("color: rgb(38, 114, 212)");
    expect(html).toContain("Georgia");
  });

  it("maiúsculas e minúsculas", () => {
    expect(aplicarCaixa("ola MUNDO", "maiusculas")).toBe("OLA MUNDO");
    expect(aplicarCaixa("OLA MUNDO", "minusculas")).toBe("ola mundo");
    expect(aplicarCaixa("ola mundo d'água", "palavras")).toBe("Ola Mundo D'água");
    expect(aplicarCaixa("ola mundo. OUTRA frase! sim", "sentenca")).toBe("Ola mundo. Outra frase! Sim");
    const e = novoEditor("ola **mundo**. fim");
    e.commands.setTextSelection({ from: 4, to: 4 + "ola mundo. fim".length });
    expect(mudarCaixa(e, "maiusculas")).toBe(true);
    expect(textoPuro(e)).toBe("OLA MUNDO. FIM");
    expect(paragrafo(e).content.some((n: any) => n.marks?.some((m: any) => m.type === "bold") && n.text === "MUNDO")).toBe(true);
    // sem seleção: a palavra sob o cursor
    e.commands.setTextSelection(5);
    mudarCaixa(e, "minusculas");
    expect(textoPuro(e)).toBe("ola MUNDO. FIM");
    e.destroy();
  });

  it("limpar formatação tira tudo menos o link", () => {
    const e = novoEditor("ola");
    e.commands.setTextSelection({ from: 4, to: 7 });
    e.chain().toggleBold().setMark("textStyle", { color: CORES_TEXTO[1].valor }).setMark("highlight", { color: CORES_MARCA_TEXTO[1].valor }).setLink({ href: "https://exemplo.com.br" }).run();
    limparFormatacao(e);
    expect(paragrafo(e).content[0].marks.map((m: any) => m.type)).toEqual(["link"]);
    e.destroy();
  });

  it("pincel copia a formatação e cola em outro trecho", () => {
    const e = novoEditor("aaa bbb");
    e.commands.setTextSelection({ from: 4, to: 7 });
    e.chain().toggleBold().setMark("textStyle", { fontSize: "20pt" }).run();
    copiarFormato(e);
    expect(e.storage.pincel.marcas.length).toBe(2);
    e.commands.setTextSelection({ from: 8, to: 11 });
    expect(colarFormato(e)).toBe(true);
    const ps = paragrafo(e).content;
    expect(ps[ps.length - 1].text).toBe("bbb");
    expect(ps[ps.length - 1].marks.map((m: any) => m.type).sort()).toEqual(["bold", "textStyle"]);
    expect(e.storage.pincel.marcas).toBeNull();
    e.destroy();
  });

  it("barra: botões funcionam no EditorDocumento", () => {
    let ed: any = null;
    let ultimo: any = null;
    render(<EditorDocumento valor={unidadeParaDoc(base)} aoMudar={(d: any) => (ultimo = d)} aoCriar={(x: any) => (ed = x)} />);
    act(() => { ed.commands.setTextSelection({ from: 4, to: 7 }); });
    fireEvent.click(screen.getByRole("button", { name: "Tachado" }));
    expect(JSON.stringify(ultimo)).toContain("strike");
    fireEvent.change(screen.getByLabelText("Nome da fonte"), { target: { value: "verdana" } });
    fireEvent.change(screen.getByLabelText("Tamanho da fonte (pt)"), { target: { value: `${TAMANHOS[3]}pt` } });
    expect(JSON.stringify(ultimo)).toContain("verdana");
    expect(JSON.stringify(ultimo)).toContain("14pt");
    fireEvent.click(screen.getByRole("button", { name: "Cor do texto" }));
    fireEvent.click(screen.getByRole("button", { name: "Azul" }));
    expect(JSON.stringify(ultimo)).toContain("#2672D4");
    fireEvent.click(screen.getByRole("button", { name: "Limpar formatação" }));
    expect(JSON.stringify(ultimo)).not.toContain("textStyle");
    expect(FONTES.length).toBeGreaterThan(5);
  });

  it("aula antiga sem formatação nova continua idêntica", () => {
    const e = novoEditor("**a** _b_ c");
    const unid = docParaUnidade(sanear(e.getJSON()), { sections: [{ heading: "S", paragraphs: [{ text: "**a** _b_ c" }] }] });
    expect(unid.sections[0].paragraphs[0].rico).toBeUndefined();
    e.destroy();
  });
});
