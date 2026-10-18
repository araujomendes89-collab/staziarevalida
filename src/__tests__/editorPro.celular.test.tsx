// @vitest-environment jsdom
/**
 * Editor profissional no celular (decisão do dono 18/10; só na Administração, onde o editor existe): até 600 px aparece uma barra
 * curta com os botões principais (desfazer, negrito, itálico, lista, link) e "Mais", que abre a barra completa (abas e grupos que
 * rolam de lado dentro da caixa). No computador nada muda. Vale para todas as telas, porque todas usam o mesmo EditorDocumento.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "../novo/app/editorPro/modulos.js";
import EditorDocumento from "../novo/app/editorPro/EditorDocumento.jsx";

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto do campo." }] }] };
const tela = (largura: number) => {
  window.matchMedia = ((q: string) => ({ matches: /max-width: 600px/.test(q) && largura <= 600, media: q, addEventListener() {}, removeEventListener() {} })) as any;
};
let editor: any = null;
const montar = (props: Record<string, unknown> = {}) =>
  render(<EditorDocumento valor={DOC} aoMudar={() => {}} compacto rotulo="Texto" id="campo" aoCriar={(e: any) => (editor = e)} {...props} />);

afterEach(() => {
  cleanup();
  editor = null;
});

describe("barra do editor no celular (390 px)", () => {
  it("barra curta com desfazer, negrito, itálico, lista, link e Mais; a barra completa fica escondida até 'Mais'", async () => {
    tela(390);
    const { container } = montar();
    const rapida = await screen.findByRole("toolbar", { name: "Ferramentas principais" });
    const nomes = within(rapida).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());
    expect(nomes).toEqual(["Desfazer (Ctrl+Z)", "Negrito (Ctrl+B)", "Itálico (Ctrl+I)", "Lista com marcadores", "Hiperlink", "Mais"]);
    const completa = container.querySelector(".ep-toolbar") as HTMLElement;
    expect(completa.hidden).toBe(true);
    const mais = within(rapida).getByRole("button", { name: "Mais" });
    expect(mais.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(mais);
    expect(completa.hidden).toBe(false);
    expect(within(rapida).getByRole("button", { name: "Menos" }).getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".ep-container")!.className).toContain("ep-container--estreito");
  });

  it("os botões principais funcionam (negrito marca o texto) e o link abre o painel Hiperlink", async () => {
    tela(390);
    montar();
    await waitFor(() => expect(editor).toBeTruthy());
    act(() => {
      editor.commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Negrito (Ctrl+B)" }));
    expect(editor.isActive("bold")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hiperlink" }));
    expect(await screen.findByRole("complementary", { name: "Hiperlink" })).toBeTruthy();
  });

  it("só texto (fala de podcast): na barra curta ficam só desfazer e Mais", async () => {
    tela(390);
    montar({ somenteTexto: true, semModulos: ["imagens", "pagina", "historico", "formatacao", "tabelas", "insercao"] });
    const rapida = await screen.findByRole("toolbar", { name: "Ferramentas principais" });
    expect(within(rapida).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim())).toEqual(["Desfazer (Ctrl+Z)", "Mais"]);
  });

  it("no computador nada muda: sem barra curta, barra completa à vista", async () => {
    tela(1440);
    const { container } = montar();
    await screen.findByRole("toolbar", { name: "Ferramentas do editor" });
    expect(screen.queryByRole("toolbar", { name: "Ferramentas principais" })).toBeNull();
    expect((container.querySelector(".ep-toolbar") as HTMLElement).hidden).toBe(false);
  });
});
