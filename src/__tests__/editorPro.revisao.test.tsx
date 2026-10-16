import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";

import { extensoesDe, botoesDaAba, paineis } from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import EditorDocumento from "../novo/app/editorPro/EditorDocumento.jsx";
import { acharNoDoc, estadoLocalizar } from "../novo/app/editorPro/revisao/localizar.js";
import { contarTexto } from "../novo/app/editorPro/revisao/contagem.js";
import { REGRAS_DE_TROCA } from "../novo/app/editorPro/revisao/autocorrecao.js";
import { definirPrefs, restaurarPrefsPadrao } from "../novo/app/editorPro/revisao/preferencias.js";
import { sanear } from "../shared/docRico";

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const par = (t: string, extra: any = {}) => ({ type: "paragraph", attrs: { ref: extra.ref ?? null }, content: [{ type: "text", text: t, ...(extra.marks ? { marks: extra.marks } : {}) }] });
const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2, ref: "0:h" }, content: [{ type: "text", text: "Dor torácica" }] },
    par("A dor é intensa. A DOR piora; dores leves. Dor!", { ref: "0:0" }),
    par("Indor não é dor.", { ref: "0:1", marks: [{ type: "bold" }] }),
  ],
};

let editores: Editor[] = [];
function novoEditor(content: any = DOC) {
  const e = new Editor({ extensions: extensoesDe({}), content });
  editores.push(e);
  return e;
}
const digitar = (e: Editor, texto: string) => {
  const { from, to } = e.state.selection;
  let tratado = false;
  e.view.someProp("handleTextInput", (f: any) => {
    if (!tratado && f(e.view, from, to, texto)) tratado = true;
  });
  if (!tratado) e.view.dispatch(e.state.tr.insertText(texto, from, to));
};
const textoDe = (e: Editor) => e.state.doc.textBetween(0, e.state.doc.content.size, "\n", " ");

beforeEach(() => restaurarPrefsPadrao());
afterEach(() => {
  cleanup();
  editores.forEach((e) => e.destroy());
  editores = [];
});

describe("Editor Profissional - M6 Revisão", () => {
  it("registra botões da aba Revisão e os dois painéis", () => {
    expect(botoesDaAba("revisao").map((b: any) => b.id)).toEqual(
      expect.arrayContaining(["revisaoLocalizarProx", "revisaoOrtografia", "revisaoAutocorrecao", "revisaoPalavras"]),
    );
    expect(paineis().map((p: any) => p.id)).toEqual(expect.arrayContaining(["revisao-localizar", "revisao-contagem"]));
  });

  it("localiza com e sem diferenciar maiúsculas e com palavra inteira", () => {
    const e = novoEditor();
    expect(acharNoDoc(e.state.doc, "dor").length).toBe(7); // Dor, dor, DOR, dores, Dor, Indor, dor
    expect(acharNoDoc(e.state.doc, "dor", { maiusculas: true }).length).toBe(4); // dor, dores, Indor, dor
    expect(acharNoDoc(e.state.doc, "dor", { palavraInteira: true }).length).toBe(5); // Dor, dor, DOR, Dor, dor
    expect(acharNoDoc(e.state.doc, "dor", { palavraInteira: true, maiusculas: true }).length).toBe(2);
    expect(acharNoDoc(e.state.doc, "torácica", { palavraInteira: true }).length).toBe(1);
    expect(acharNoDoc(e.state.doc, "").length).toBe(0);
    expect(acharNoDoc(e.state.doc, "a(b").length).toBe(0); // caracteres especiais de regex são texto
    const [a] = acharNoDoc(e.state.doc, "intensa");
    expect(e.state.doc.textBetween(a.from, a.to)).toBe("intensa");
  });

  it("navega entre achados e marca o atual", () => {
    const e = novoEditor();
    e.commands.buscar("dor");
    expect(estadoLocalizar(e.state).achados.length).toBe(7);
    e.commands.buscarProximo();
    expect(estadoLocalizar(e.state).atual).toBe(1);
    e.commands.buscarAnterior();
    e.commands.buscarAnterior();
    expect(estadoLocalizar(e.state).atual).toBe(6); // volta ao fim
    e.commands.limparBusca();
    expect(estadoLocalizar(e.state).achados.length).toBe(0);
  });

  it("substitui o atual e depois todos, num único desfazer, mantendo marcas e ref dos blocos", () => {
    const e = novoEditor();
    e.commands.buscar("dor", { palavraInteira: true });
    e.commands.substituirAtual("dolor");
    expect(textoDe(e)).toContain("dolor torácica");
    expect(estadoLocalizar(e.state).achados.length).toBe(4);
    const antes = JSON.stringify(sanear(e.getJSON()));
    e.commands.substituirTudo("sintoma");
    expect(textoDe(e)).not.toMatch(/\bdor\b/i);
    expect(textoDe(e)).toContain("Indor não é sintoma.");
    const json = e.getJSON() as any;
    expect(json.content[2].attrs.ref).toBe("0:1");
    expect(json.content[2].content[0].marks[0].type).toBe("bold");
    e.commands.undo();
    expect(JSON.stringify(sanear(e.getJSON()))).toBe(antes);
  });

  it("substituir por vazio apaga; substituir por texto que contém o termo não trava", () => {
    const e = novoEditor(DOC);
    e.commands.buscar("dores", { palavraInteira: true });
    e.commands.substituirTudo("");
    expect(textoDe(e)).toContain("DOR piora;  leves.");
    const f = novoEditor(DOC);
    f.commands.buscar("intensa");
    f.commands.substituirAtual("muito intensa");
    expect(textoDe(f)).toContain("muito intensa");
    expect(estadoLocalizar(f.state).achados.length).toBe(1);
  });

  it("não troca nada sem termo ou sem achados", () => {
    const e = novoEditor();
    const antes = textoDe(e);
    expect(e.commands.substituirTudo("x")).toBe(false);
    e.commands.buscar("inexistente");
    expect(e.commands.substituirAtual("x")).toBe(false);
    expect(textoDe(e)).toBe(antes);
  });

  it("contagem de palavras e caracteres", () => {
    expect(contarTexto("")).toEqual({ palavras: 0, caracteres: 0, caracteresSemEspacos: 0, minutosLeitura: 0 });
    const c = contarTexto("Dor torácica aguda.\nPA 120/80 mmHg, 1,5 mg/dL.");
    expect(c.palavras).toBe(10); // Dor torácica aguda PA 120 80 mmHg 1,5 mg dL
    expect(c.caracteres).toBe("Dor torácica aguda.PA 120/80 mmHg, 1,5 mg/dL.".length);
    expect(c.caracteresSemEspacos).toBe("Dortorácicaaguda.PA120/80mmHg,1,5mg/dL.".length);
    expect(c.minutosLeitura).toBe(1);
    expect(contarTexto(Array(401).fill("a").join(" ")).minutosLeitura).toBe(3);
    expect(contarTexto("ação não é 😀").palavras).toBe(3);
  });

  it("autocorreção troca só símbolos e Backspace desfaz", () => {
    const e = novoEditor({ type: "doc", content: [par("x")] });
    e.commands.focus("end");
    digitar(e, "-"); digitar(e, "-");
    expect(textoDe(e)).toBe("x—");
    digitar(e, " "); digitar(e, "-"); digitar(e, ">");
    expect(textoDe(e)).toBe("x— →");
    digitar(e, " "); digitar(e, "\"");
    expect(textoDe(e)).toBe("x— → “");
    digitar(e, "a"); digitar(e, "\"");
    expect(textoDe(e).endsWith("“a”")).toBe(true);
    digitar(e, ">"); digitar(e, "=");
    expect(textoDe(e).endsWith("≥")).toBe(true);
    e.commands.undoInputRule();
    expect(textoDe(e).endsWith("a”>=")).toBe(true);
  });

  it("autocorreção respeita o interruptor geral e cada regra; nunca troca letras", () => {
    const e = novoEditor({ type: "doc", content: [par("x")] });
    e.commands.focus("end");
    definirPrefs({ autocorrecao: false });
    digitar(e, "-"); digitar(e, "-");
    expect(textoDe(e)).toBe("x--");
    definirPrefs({ autocorrecao: true, regras: { travessao: false, reticencias: true } });
    digitar(e, "-");
    expect(textoDe(e)).toBe("x---");
    digitar(e, "."); digitar(e, "."); digitar(e, ".");
    expect(textoDe(e).endsWith("…")).toBe(true);
    for (const r of REGRAS_DE_TROCA) {
      expect(r.texto()).not.toMatch(/[\p{L}\p{N}]/u);
    }
  });

  it("ortografia: atributo spellcheck e lang pt-BR seguem a preferência", () => {
    const e = novoEditor();
    expect(e.view.dom.getAttribute("spellcheck")).toBe("true");
    expect(e.view.dom.getAttribute("lang")).toBe("pt-BR");
    act(() => definirPrefs({ ortografia: false }));
    expect(e.view.dom.getAttribute("spellcheck")).toBe("false");
    act(() => definirPrefs({ ortografia: true }));
    expect(e.view.dom.getAttribute("spellcheck")).toBe("true");
  });

  it("painel Localizar e substituir na tela: busca, conta e substitui tudo", () => {
    let saida: any = null;
    render(<EditorDocumento valor={DOC} aoMudar={(d: any) => { saida = d; }} rotulo="Doc" />);
    fireEvent.click(screen.getByRole("button", { name: "Localizar e substituir" }));
    const campo = screen.getByLabelText("Texto a localizar");
    fireEvent.change(campo, { target: { value: "dor" } });
    expect(screen.getByTestId("resultado-busca").textContent).toBe("1 de 7");
    fireEvent.click(screen.getByLabelText("Palavra inteira"));
    expect(screen.getByTestId("resultado-busca").textContent).toBe("1 de 5");
    fireEvent.click(screen.getByLabelText("Diferenciar maiúsculas de minúsculas"));
    expect(screen.getByTestId("resultado-busca").textContent).toBe("1 de 2");
    fireEvent.change(screen.getByLabelText("Substituir por"), { target: { value: "algia" } });
    fireEvent.click(screen.getByRole("button", { name: "Substituir tudo" }));
    expect(JSON.stringify(saida)).toContain("A algia é intensa");
    expect(screen.getByRole("status").textContent).toBe("2 trechos substituídos.");
    expect(screen.getByTestId("resultado-busca").textContent).toBe("Nenhum resultado.");
  });

  it("painel Localizar não deixa substituir em somente leitura", () => {
    render(<EditorDocumento valor={DOC} somenteLeitura rotulo="Doc" />);
    fireEvent.click(screen.getByRole("button", { name: "Localizar e substituir" }));
    fireEvent.change(screen.getByLabelText("Texto a localizar"), { target: { value: "dor" } });
    expect((screen.getByRole("button", { name: "Substituir tudo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("painel Contagem mostra palavras do documento", () => {
    render(<EditorDocumento valor={DOC} rotulo="Doc" />);
    fireEvent.click(screen.getByRole("button", { name: "Contagem e correção" }));
    const c = screen.getByTestId("contagem").textContent || "";
    expect(c).toContain("Palavras");
    expect(c).toContain("Tempo de leitura1 min");
  });
});
