/**
 * Junção da onda 1 do editor profissional (ramo ed-integra): os módulos juntos na mesma casca.
 * - nenhuma aba tem dois botões na mesma ordem e cada grupo fica num bloco só (sem grupo partido por botão de outro módulo);
 * - ctx.abrirPainel(id) e Ctrl+F abrem "Localizar e substituir" com o cursor no campo;
 * - largura de coluna (colwidth numérico, nosso) não quebra mesclar/dividir/linhas/colunas do TipTap (redimensionar continua desligado).
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";

import EditorDocumento from "../novo/app/editorPro/EditorDocumento.jsx";
import { ABAS, botoesDaAba, extensoesDe, modulosEditor, paineis } from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import { definirLarguraColuna } from "../novo/app/editorPro/tabelas/comandos.js";
import { sanear } from "../shared/docRico";

afterEach(() => cleanup());

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const p = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const DOC = { type: "doc", content: [p("Dor torácica típica."), p("Outra dor no texto.")] };

describe("editor profissional: módulos da onda 1 juntos", () => {
  it("os módulos da onda 1 estão registrados", () => {
    expect(modulosEditor()).toEqual(expect.arrayContaining(["nucleo", "formatacao", "paragrafos", "tabelas", "insercao", "pagina", "revisao", "historico"]));
    expect(paineis().map((x: any) => x.id)).toEqual(
      expect.arrayContaining(["revisao-localizar", "revisao-contagem", "pagina", "historico", "tabela-inserir", "simbolos", "hiperlink", "datahora"]),
    );
    expect(new Set(paineis().map((x: any) => x.id)).size).toBe(paineis().length);
  });

  it("nenhuma aba tem ordem repetida nem grupo partido", () => {
    for (const aba of ABAS) {
      const bs = botoesDaAba(aba.id) as any[];
      const ordens = bs.map((b) => b.ordem);
      expect(new Set(ordens).size, `ordem repetida na aba ${aba.id}: ${ordens.join(",")}`).toBe(ordens.length);
      const blocos: string[] = [];
      for (const b of bs) if (blocos[blocos.length - 1] !== b.grupo) blocos.push(b.grupo);
      expect(new Set(blocos).size, `grupo partido na aba ${aba.id}: ${blocos.join(" > ")}`).toBe(blocos.length);
      expect(new Set(bs.map((b) => b.id)).size).toBe(bs.length);
    }
  });

  it("Ctrl+F abre Localizar e substituir com o cursor no campo; o botão da aba Revisão usa ctx.abrirPainel", () => {
    const { container } = render(<EditorDocumento valor={DOC} rotulo="Doc" />);
    expect(screen.queryByTestId("painel-localizar")).toBeNull();
    const folha = container.querySelector(".ep-folha") as HTMLElement;
    fireEvent.keyDown(folha, { key: "f", ctrlKey: true });
    expect(screen.getByTestId("painel-localizar")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Texto a localizar"));
    // fecha e abre de novo pelo botão da aba Revisão (Cmd+F no Mac também)
    fireEvent.click(screen.getByLabelText("Fechar painel"));
    expect(screen.queryByTestId("painel-localizar")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Revisão" }));
    fireEvent.click(screen.getByRole("button", { name: "Localizar (Ctrl+F)" }));
    expect(screen.getByTestId("painel-localizar")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Fechar painel"));
    fireEvent.keyDown(folha, { key: "F", metaKey: true });
    expect(screen.getByTestId("painel-localizar")).toBeTruthy();
    // Ctrl+Shift+F e outras teclas não abrem nada
    fireEvent.click(screen.getByLabelText("Fechar painel"));
    fireEvent.keyDown(folha, { key: "f", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(folha, { key: "g", ctrlKey: true });
    expect(screen.queryByTestId("painel-localizar")).toBeNull();
  });

  it("largura de coluna seguida de mesclar, dividir e linhas/colunas novas não quebra (colwidth é número nosso)", () => {
    const e = new Editor({ extensions: extensoesDe({}), content: { type: "doc", content: [p("antes")] } });
    e.chain().focus("end").insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    const celulas = () => {
      const r: number[] = [];
      e.state.doc.descendants((n, pos) => {
        if (n.type.name === "tableCell" || n.type.name === "tableHeader") r.push(pos);
      });
      return r;
    };
    const sel = (a: number, b: number) => e.view.dispatch(e.state.tr.setSelection(CellSelection.create(e.state.doc, a, b)));
    let pos = celulas();
    sel(pos[0], pos[6]);
    expect(definirLarguraColuna(e, 200)).toBe(true);
    pos = celulas();
    sel(pos[3], pos[4]);
    expect(() => e.chain().mergeCells().run()).not.toThrow();
    pos = celulas();
    sel(pos[3], pos[3]);
    expect(() => e.chain().splitCell().run()).not.toThrow();
    // cada botão da barra é uma corrente própria; a célula mesclada (colspan 2, largura somada) atravessa as colunas mexidas
    pos = celulas();
    sel(pos[3], pos[4]);
    expect(e.chain().mergeCells().run()).toBe(true);
    for (const cmd of ["addColumnBefore", "addColumnAfter", "addRowAfter", "deleteColumn"] as const) {
      pos = celulas();
      sel(pos[1], pos[1]);
      expect(() => (e.chain().focus() as any)[cmd]().run(), cmd).not.toThrow();
    }
    const t = sanear(e.getJSON()).content.find((n: any) => n.type === "table")!;
    for (const linha of t.content!) for (const c of linha.content!) {
      const w = c.attrs?.colwidth;
      expect(w === undefined || (typeof w === "number" && w > 0)).toBe(true);
    }
    // nada liga o redimensionar por arrasto (o colwidth nativo do TipTap é lista; o nosso é número)
    expect(e.view.dom.querySelector(".column-resize-handle")).toBeNull();
    expect(e.extensionManager.extensions.find((x) => x.name === "table")?.options.resizable).toBe(false);
    e.destroy();
  });
});
