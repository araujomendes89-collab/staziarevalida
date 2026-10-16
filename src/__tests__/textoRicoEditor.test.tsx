/**
 * Editor estilo Word (Editar aula, Unidades, Revisão) e a leitura do "texto com marcas" (aluno e equipe).
 * O que entra e sai do editor é sempre o texto com marcas de src/shared/textoRico; texto antigo sem marca não muda.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TextoRico } from "../novo/app/textoRico/TextoRico.jsx";
import EditorTexto from "../novo/app/textoRico/EditorTexto.jsx";
import { doEditor, normalizar } from "../shared/textoRico";

afterEach(() => cleanup());

// O jsdom não mede layout: o ProseMirror pede retângulos ao rolar até o cursor. Retângulo vazio basta para o teste.
const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

describe("Leitura formatada (TextoRico)", () => {
  it("texto antigo sem marca sai exatamente igual", () => {
    const { container } = render(<p><TextoRico texto="PA ≥ 140 x 90 mmHg, glicemia < 92 mg/dL." /></p>);
    expect(container.querySelector("p")!.innerHTML).toBe("PA ≥ 140 x 90 mmHg, glicemia &lt; 92 mg/dL.");
  });

  it("negrito, itálico, sublinhado e link https viram elementos; quebra de linha vira <br>", () => {
    const { container } = render(<p><TextoRico texto={"**forte** e *leve* e <u>sub</u>\n[guia](https://www.gov.br/saude)"} /></p>);
    expect(container.querySelector("strong")!.textContent).toBe("forte");
    expect(container.querySelector("em")!.textContent).toBe("leve");
    expect(container.querySelector("u")!.textContent).toBe("sub");
    expect(container.querySelector("br")).toBeTruthy();
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://www.gov.br/saude");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("nada de HTML cru nem link perigoso", () => {
    const { container } = render(<p><TextoRico texto={'<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))'} /></p>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("modo documento: títulos, listas, citação e tabela", () => {
    const texto = "## Diagnóstico\n\nTexto **chave**.\n\n- um\n- dois\n\n1. primeiro\n2. segundo\n\n> citação\n\n| Achado | Conduta |\n| --- | --- |\n| Febre | Antitérmico |";
    const { container } = render(<TextoRico modo="documento" texto={texto} />);
    expect(container.querySelector("h3")!.textContent).toBe("Diagnóstico");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.querySelector("blockquote")!.textContent).toBe("citação");
    expect(container.querySelector("th")!.textContent).toBe("Achado");
    expect(container.querySelector("td")!.textContent).toBe("Febre");
  });

  it("modo documento com texto antigo: parágrafos e quebras como antes", () => {
    const { container } = render(<TextoRico modo="documento" texto={"Linha 1\nLinha 2\n\nOutro parágrafo"} />);
    const ps = container.querySelectorAll("p");
    expect(ps).toHaveLength(2);
    expect(ps[0].innerHTML).toBe("Linha 1<br>Linha 2");
    expect(ps[1].textContent).toBe("Outro parágrafo");
  });
});

describe("normalizar (documento do editor → forma guardada)", () => {
  it("lista dentro de lista sobe para o mesmo nível; título 1 vira 2 e 4 vira 3; marcas desconhecidas e link http caem", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "A" }] },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "B" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "pai", marks: [{ type: "strike" }, { type: "bold" }] }] },
                { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "filho" }] }] }] },
              ],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "site", marks: [{ type: "link", attrs: { href: "http://x.br", target: "_blank" } }] }] },
      ],
    };
    expect(doEditor(doc, "documento")).toBe("## A\n\n### B\n\n- **pai**\n- filho\n\nsite");
    expect(normalizar({}).content).toEqual([{ type: "paragraph" }]);
  });

  it("tabela do editor (com atributos de largura) vira tabela simples", () => {
    const cel = (t: string, type = "tableCell") => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
    const doc = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cel("A", "tableHeader"), cel("B", "tableHeader")] }, { type: "tableRow", content: [cel("1"), cel("2")] }] }] };
    expect(doEditor(doc, "documento")).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });
});

const montar = async (props: any) => {
  let ed: any = null;
  const onChange = vi.fn();
  render(<EditorTexto {...props} onChange={onChange} aoCriar={(e: any) => (ed = e)} />);
  await waitFor(() => expect(ed).toBeTruthy());
  return { ed, onChange };
};

describe("Editor estilo Word (EditorTexto)", () => {
  it("abre o texto já formatado e não marca alteração só por abrir", async () => {
    const { ed, onChange } = await montar({ value: "Texto **forte** aqui", modo: "linha", label: "Parágrafo 1" });
    expect(document.querySelector(".tr-area strong")!.textContent).toBe("forte");
    expect(ed.getText()).toBe("Texto forte aqui");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("toolbar", { name: "Formatação do texto" })).toBeTruthy();
  });

  it("modo linha: barra só com desfazer, refazer, negrito, itálico e sublinhado", async () => {
    await montar({ value: "x", modo: "linha" });
    for (const nome of [/Desfazer/, /Refazer/, /Negrito/, /Itálico/, /Sublinhado/]) expect(screen.getByRole("button", { name: nome })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Título" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Inserir tabela/ })).toBeNull();
  });

  it("negrito pela barra grava **…** e Desfazer volta ao texto de antes", async () => {
    const { ed, onChange } = await montar({ value: "Febre alta", modo: "linha" });
    act(() => {
      ed.commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: /Negrito/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("**Febre alta**"));
    fireEvent.click(screen.getByRole("button", { name: /Desfazer/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("Febre alta"));
  });

  it("modo documento: título, lista e tabela simples pela barra", async () => {
    const { ed, onChange } = await montar({ value: "Resumo", modo: "documento" });
    act(() => {
      ed.commands.setTextSelection(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Título" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("## Resumo"));
    fireEvent.click(screen.getByRole("button", { name: "Lista com marcadores" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("- Resumo"));
    // dentro de lista não dá para pôr tabela (o formato guardado não tem tabela dentro de lista)
    expect((screen.getByRole("button", { name: /Inserir tabela/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Lista com marcadores" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("Resumo"));
    act(() => {
      ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    });
    fireEvent.click(screen.getByRole("button", { name: /Inserir tabela/ }));
    expect(document.querySelectorAll(".tr-area table th")).toHaveLength(3);
    // tabela vazia não é guardada; ao escrever na primeira célula, ela entra no texto
    act(() => {
      ed.commands.insertContent("Achado");
    });
    await waitFor(() => expect(String(onChange.mock.lastCall?.[0] ?? "")).toMatch(/\| Achado \|  \|  \|\n\| --- \| --- \| --- \|/));
    expect(screen.getByRole("button", { name: "Apagar tabela" })).toBeTruthy();
  });

  it("modo pontos: um ponto por item, gravado um por linha", async () => {
    const { ed, onChange } = await montar({ value: "Primeiro ponto\nSegundo **ponto**", modo: "pontos" });
    expect(document.querySelectorAll(".tr-area li")).toHaveLength(2);
    act(() => {
      ed.commands.setTextSelection(ed.state.doc.content.size - 3);
      ed.commands.insertContent("!");
    });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("Primeiro ponto\nSegundo **ponto!**"));
  });

  it("valor trocado por fora (Cancelar, sugestão) recarrega sem marcar alteração", async () => {
    const onChange = vi.fn();
    let ed: any = null;
    const { rerender } = render(<EditorTexto value="antes" modo="linha" onChange={onChange} aoCriar={(e: any) => (ed = e)} />);
    await waitFor(() => expect(ed).toBeTruthy());
    rerender(<EditorTexto value="depois *novo*" modo="linha" onChange={onChange} aoCriar={(e: any) => (ed = e)} />);
    await waitFor(() => expect(ed.getText()).toBe("depois novo"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
