import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { TextSelection } from "@tiptap/pm/state";

import { extensoesDe, botoesDaAba, paineis } from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import LeitorDoc from "../novo/app/editorPro/leitor/LeitorDoc.jsx";
import PainelLink from "../novo/app/editorPro/insercao/PainelLink.jsx";
import PainelTabela from "../novo/app/editorPro/tabelas/PainelTabela.jsx";
import { definirLarguraColuna } from "../novo/app/editorPro/tabelas/comandos.js";
import { sanear, htmlDoDoc, textoDoDoc } from "../shared/docRico";
import { normalizarLink, formatarDataHora, GRUPOS_SIMBOLOS } from "../shared/docRico/modulos/insercao";

afterEach(() => cleanup());

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const p = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const cel = (t: string, attrs?: any, tipo = "tableCell") => ({ type: tipo, ...(attrs ? { attrs } : {}), content: [p(t)] });
const ctx = { somenteLeitura: false };

function editorComTabela() {
  const e = new Editor({ extensions: extensoesDe({}), content: { type: "doc", content: [p("antes")] } });
  e.chain().focus("end").insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  return e;
}
function posicoesCelulas(e: Editor) {
  const r: number[] = [];
  e.state.doc.descendants((n, pos) => {
    if (n.type.name === "tableCell" || n.type.name === "tableHeader") r.push(pos);
  });
  return r;
}
const selecionar = (e: Editor, a: number, b: number) => e.view.dispatch(e.state.tr.setSelection(CellSelection.create(e.state.doc, a, b)));

describe("M4 - saneamento das células", () => {
  it("colspan/rowspan/cellBackground/colwidth: limites e valores perigosos", () => {
    const d = sanear({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                cel("a", { colspan: 2, rowspan: 3, cellBackground: "#fde68a", colwidth: 120 }),
                cel("b", { colspan: 99, rowspan: 0, cellBackground: "red; background:url(x)", colwidth: 5000 }),
                cel("c", { colspan: "2", cellBackground: "expression(alert(1))", colwidth: "abc", colwidth: [100] }, "tableHeader"),
              ],
            },
          ],
        },
      ],
    });
    const [a, b, c] = d.content[0].content![0].content!;
    expect(a.attrs).toEqual({ colspan: 2, rowspan: 3, cellBackground: "#fde68a", colwidth: 120 });
    expect(b.attrs).toBeUndefined();
    expect(c.attrs).toEqual({ colspan: 2 });
  });

  it("HTML do PDF escreve colspan, rowspan e cor; sem script", () => {
    const html = htmlDoDoc({
      type: "doc",
      content: [{ type: "table", content: [{ type: "tableRow", content: [cel("x<script>", { colspan: 2, cellBackground: "#bfdbfe", colwidth: 100 }, "tableHeader"), cel("y", { rowspan: 2 })] }] }],
    } as any);
    expect(html).toContain('<th colspan="2" style="background-color:#bfdbfe;width:100px;min-width:100px;"><p>x&lt;script&gt;</p></th>');
    expect(html).toContain('<td rowspan="2"><p>y</p></td>');
    expect(html).not.toContain("<script>");
  });

  it("célula comum sem atributos continua idêntica (td/th simples)", () => {
    const html = htmlDoDoc({ type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cel("1"), cel("2")] }] }] } as any);
    expect(html).toBe("<table><tr><td><p>1</p></td><td><p>2</p></td></tr></table>");
  });
});

describe("M4 - editor de verdade", () => {
  it("mesclar, dividir, cor, largura e cabeçalho de coluna passam pelo saneador", () => {
    const e = editorComTabela();
    let pos = posicoesCelulas(e);
    expect(pos).toHaveLength(9);
    selecionar(e, pos[3], pos[4]);
    expect(e.can().mergeCells()).toBe(true);
    e.chain().mergeCells().run();
    let t = sanear(e.getJSON()).content.find((n) => n.type === "table")!;
    expect(t.content![1].content![0].attrs).toMatchObject({ colspan: 2 });
    // dividir de novo
    pos = posicoesCelulas(e);
    selecionar(e, pos[3], pos[3]);
    expect(e.can().splitCell()).toBe(true);
    e.chain().splitCell().run();
    t = sanear(e.getJSON()).content.find((n) => n.type === "table")!;
    expect(t.content![1].content).toHaveLength(3);
    // cor
    pos = posicoesCelulas(e);
    selecionar(e, pos[4], pos[5]);
    e.chain().setCellAttribute("cellBackground", "#bbf7d0").run();
    // largura da coluna 1 (todas as linhas)
    selecionar(e, pos[1], pos[1]);
    expect(definirLarguraColuna(e, 140)).toBe(true);
    t = sanear(e.getJSON()).content.find((n) => n.type === "table")!;
    const linhas = t.content!;
    expect(linhas[1].content![1].attrs).toMatchObject({ cellBackground: "#bbf7d0", colwidth: 140 });
    expect(linhas[1].content![2].attrs).toMatchObject({ cellBackground: "#bbf7d0" });
    expect(linhas.every((l) => l.content![1].attrs?.colwidth === 140)).toBe(true);
    // tirar a cor
    selecionar(e, pos[4], pos[4]);
    e.chain().setCellAttribute("cellBackground", null).run();
    t = sanear(e.getJSON()).content.find((n) => n.type === "table")!;
    expect(t.content![1].content![1].attrs?.cellBackground).toBeUndefined();
    // cabeçalho de coluna
    e.chain().toggleHeaderColumn().run();
    expect(JSON.stringify(e.getJSON())).toContain("tableHeader");
    // ida e volta: documento guardado volta idêntico no editor
    const guardado = sanear(e.getJSON());
    const e2 = new Editor({ extensions: extensoesDe({}), content: guardado });
    expect(sanear(e2.getJSON())).toEqual(guardado);
    e.destroy();
    e2.destroy();
  });

  it("botões e painéis registrados", () => {
    const ids = botoesDaAba("inserir").map((b: any) => b.id);
    for (const id of ["tb-mesclar", "tb-dividir", "tb-cor", "tb-largura", "tb-linhaAcima", "tb-colunaEsquerda", "tb-cabLinha", "tb-cabColuna", "sim-0", "data-hoje", "hora-agora", "sim-remover-link"]) expect(ids).toContain(id);
    expect(paineis().map((x: any) => x.id)).toEqual(expect.arrayContaining(["tabela-inserir", "simbolos", "hiperlink", "datahora"]));
  });

  it("janela Inserir tabela respeita os limites", () => {
    const e = new Editor({ extensions: extensoesDe({}), content: { type: "doc", content: [p("x")] } });
    render(<PainelTabela editor={e} ctx={ctx} />);
    const [linhas, colunas] = screen.getAllByRole("spinbutton");
    fireEvent.change(linhas, { target: { value: "500" } });
    fireEvent.change(colunas, { target: { value: "2" } });
    fireEvent.click(screen.getByText("Inserir tabela"));
    const t = e.getJSON().content!.find((n: any) => n.type === "table")!;
    expect(t.content).toHaveLength(30);
    expect(t.content![0].content).toHaveLength(2);
    expect(t.content![0].content![0].type).toBe("tableHeader");
    e.destroy();
  });
});

describe("M4 - leitor do aluno", () => {
  it("tabela com mesclagem e cor, em quadro rolável, sem HTML cru", () => {
    const doc = {
      type: "doc",
      content: [{ type: "table", content: [{ type: "tableRow", content: [cel("Cab", { colspan: 2, cellBackground: "#fde68a", colwidth: 200 }, "tableHeader")] }, { type: "tableRow", content: [cel("a"), cel("b", { rowspan: 1, cellBackground: "url(x)" })] }] }],
    };
    const { container } = render(<LeitorDoc doc={doc} />);
    expect(container.querySelector(".tr-tabela-rolagem table")).toBeTruthy();
    const th = container.querySelector("thead th") as HTMLElement;
    expect(th.getAttribute("colspan")).toBe("2");
    expect(th.style.backgroundColor).toBe("rgb(253, 230, 138)");
    expect(th.style.width).toBe("200px");
    const tds = container.querySelectorAll("tbody td");
    expect(tds).toHaveLength(2);
    expect((tds[1] as HTMLElement).style.backgroundColor).toBe("");
  });
});

describe("M4 - inserção", () => {
  it("normalizarLink: só https", () => {
    expect(normalizarLink("https://exemplo.com.br/a?b=1")).toEqual({ href: "https://exemplo.com.br/a?b=1" });
    expect(normalizarLink("exemplo.com.br")).toEqual({ href: "https://exemplo.com.br" });
    for (const ruim of ["", "javascript:alert(1)", "http://x.com", "mailto:a@b.com", "data:text/html,x", "https://a b.com", "https://semponto", "ftp://x.com"]) {
      expect(normalizarLink(ruim)).toHaveProperty("erro");
    }
  });

  it("data e hora e símbolos", () => {
    const d = new Date(2026, 9, 5, 8, 7);
    expect(formatarDataHora(d, "curta")).toBe("05/10/2026");
    expect(formatarDataHora(d, "longa")).toBe("5 de outubro de 2026");
    expect(formatarDataHora(d, "hora")).toBe("08:07");
    expect(formatarDataHora(d, "dataHora")).toBe("05/10/2026 08:07");
    const todos = GRUPOS_SIMBOLOS.flatMap((g) => g.itens);
    for (const s of ["µ", "±", "°", "≥", "→", "α"]) expect(todos).toContain(s);
  });

  it("janela de link: insere com texto, recusa javascript:, aplica na seleção e remove", () => {
    const e = new Editor({ extensions: extensoesDe({}), content: { type: "doc", content: [p("Veja a diretriz aqui")] } });
    e.commands.focus("end");
    const { rerender } = render(<PainelLink editor={e} ctx={ctx} />);
    fireEvent.change(screen.getByLabelText("Endereço do link"), { target: { value: "javascript:alert(1)" } });
    fireEvent.submit(screen.getByTestId("painel-link"));
    expect(screen.getByRole("alert").textContent).toMatch(/https/);
    expect(JSON.stringify(e.getJSON())).not.toContain("javascript");

    fireEvent.change(screen.getByLabelText("Endereço do link"), { target: { value: "sbp.com.br" } });
    fireEvent.change(screen.getByLabelText("Texto do link"), { target: { value: "SBP" } });
    fireEvent.submit(screen.getByTestId("painel-link"));
    expect(textoDoDoc(sanear(e.getJSON()))).toContain("SBP");
    expect(htmlDoDoc(sanear(e.getJSON()))).toContain('<a href="https://sbp.com.br" rel="noopener noreferrer nofollow">SBP</a>');

    // seleção de um trecho
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 6, 9))); // "a d"? só confere que vira link
    rerender(<PainelLink editor={e} ctx={ctx} />);
    fireEvent.change(screen.getByLabelText("Endereço do link"), { target: { value: "https://exemplo.com" } });
    fireEvent.submit(screen.getByTestId("painel-link"));
    expect(htmlDoDoc(sanear(e.getJSON()))).toContain('href="https://exemplo.com"');
    // remover
    rerender(<PainelLink editor={e} ctx={ctx} />);
    fireEvent.click(screen.getByText("Remover link"));
    expect(htmlDoDoc(sanear(e.getJSON()))).not.toContain("https://exemplo.com");
    e.destroy();
  });
});
