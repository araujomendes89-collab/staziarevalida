// @vitest-environment jsdom
/**
 * Editor profissional no celular (pedido do dono 18/10; só na Administração, onde o editor existe): até 600 px aparece uma barra
 * curta com os botões principais (negrito, itálico, lista com marcadores, lista numerada e link) e "Mais", que abre o resto
 * (abas, títulos, citação, tabela, desfazer/refazer, limpar...). "Mais" fecha com Esc e ao tocar fora. No computador nada muda.
 * Vale para todas as telas (Questões, Aulas, Atualizações, Podcasts, Comunicados), porque todas usam o mesmo EditorDocumento.
 * O tamanho de verdade (cabe em 375 e 390 px) é medido no navegador: editorPro.celular.navegador.test.ts.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "../novo/app/editorPro/modulos.js";
import EditorDocumento from "../novo/app/editorPro/EditorDocumento.jsx";
import { botoesDaAba } from "../novo/app/editorPro/registroEditor.js";

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto do campo." }] }] };
const original = window.matchMedia;
const tela = (largura: number) => {
  window.matchMedia = ((q: string) => ({ matches: /max-width: 600px/.test(q) && largura <= 600, media: q, addEventListener() {}, removeEventListener() {} })) as any;
};
let editor: any = null;
const FORA_DO_CAMPO = ["imagens", "pagina", "historico"];
const montar = (props: Record<string, unknown> = {}) =>
  render(
    <div>
      <button type="button">Fora do editor</button>
      <EditorDocumento valor={DOC} aoMudar={() => {}} compacto rotulo="Texto" id="campo" semModulos={FORA_DO_CAMPO} aoCriar={(e: any) => (editor = e)} {...props} />
    </div>,
  );
const nomes = (el: HTMLElement) => within(el).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());
const barraCurta = () => screen.findByRole("toolbar", { name: "Ferramentas principais" });
const abrirMais = async () => {
  const mais = within(await barraCurta()).getByRole("button", { name: "Mais" });
  fireEvent.click(mais);
  return { mais, painel: screen.getByRole("group", { name: "Mais ferramentas" }) };
};
const selecionarTudo = () =>
  act(() => {
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
  });

afterEach(() => {
  cleanup();
  editor = null;
  window.matchMedia = original;
});

describe("barra do editor no celular (375 e 390 px)", () => {
  it.each([375, 390])("a %i px: barra curta com negrito, itálico, listas, link e Mais; o resto fica no Mais, fechado", async (largura) => {
    tela(largura);
    const { container } = montar();
    const rapida = await barraCurta();
    expect(nomes(rapida)).toEqual(["Negrito (Ctrl+B)", "Itálico (Ctrl+I)", "Lista com marcadores", "Lista numerada", "Link", "Mais"]);
    const mais = within(rapida).getByRole("button", { name: "Mais" });
    expect(mais.getAttribute("aria-expanded")).toBe("false");
    const painel = container.querySelector(".ep-toolbar") as HTMLElement;
    expect(painel.hidden).toBe(true);
    expect(mais.getAttribute("aria-controls")).toBe(painel.id);
    expect(container.querySelector(".ep-container")!.className).toContain("ep-container--estreito");
  });

  it("Mais abre o resto (sem repetir os principais) e fecha de novo no próprio botão", async () => {
    tela(390);
    montar();
    const { mais, painel } = await abrirMais();
    expect(painel.hidden).toBe(false);
    expect(mais.getAttribute("aria-expanded")).toBe("true");
    const dentro = nomes(painel);
    for (const n of ["Desfazer (Ctrl+Z)", "Refazer (Ctrl+Y)", "Título 1 (seção da aula)", "Título 2", "Citação", "Limpar formatação do parágrafo"]) expect(dentro).toContain(n);
    for (const n of ["Negrito (Ctrl+B)", "Itálico (Ctrl+I)", "Lista com marcadores", "Lista numerada", "Hiperlink"]) expect(dentro).not.toContain(n);
    expect(within(painel).getByRole("tab", { name: "Inserir" })).toBeTruthy();
    fireEvent.click(mais);
    expect(painel.hidden).toBe(true);
    expect(mais.getAttribute("aria-expanded")).toBe("false");
  });

  it("Mais fecha com Esc (o foco volta para o botão Mais)", async () => {
    tela(390);
    montar();
    const { mais, painel } = await abrirMais();
    const titulo = within(painel).getByRole("button", { name: "Título 2" });
    titulo.focus();
    fireEvent.keyDown(titulo, { key: "Escape" });
    expect(painel.hidden).toBe(true);
    expect(mais.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(mais);
  });

  it("Mais fecha ao tocar fora, mas não ao tocar dentro dele", async () => {
    tela(390);
    montar();
    const { mais, painel } = await abrirMais();
    fireEvent.pointerDown(within(painel).getByRole("tab", { name: "Inserir" }));
    expect(painel.hidden).toBe(false);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Fora do editor" }));
    expect(painel.hidden).toBe(true);
    expect(mais.getAttribute("aria-expanded")).toBe("false");
  });

  it("os botões principais funcionam: negrito, itálico, listas e o link abre o painel Hiperlink", async () => {
    tela(390);
    montar();
    await waitFor(() => expect(editor).toBeTruthy());
    const rapida = await barraCurta();
    selecionarTudo();
    fireEvent.click(within(rapida).getByRole("button", { name: "Negrito (Ctrl+B)" }));
    expect(editor.isActive("bold")).toBe(true);
    fireEvent.click(within(rapida).getByRole("button", { name: "Itálico (Ctrl+I)" }));
    expect(editor.isActive("italic")).toBe(true);
    fireEvent.click(within(rapida).getByRole("button", { name: "Lista numerada" }));
    expect(editor.isActive("orderedList")).toBe(true);
    fireEvent.click(within(rapida).getByRole("button", { name: "Lista com marcadores" }));
    expect(editor.isActive("bulletList")).toBe(true);
    fireEvent.click(within(rapida).getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("complementary", { name: "Hiperlink" })).toBeTruthy();
  });

  it("os comandos de dentro do Mais funcionam: título, citação, limpar, desfazer, refazer e tabela", async () => {
    tela(390);
    montar();
    await waitFor(() => expect(editor).toBeTruthy());
    const { painel } = await abrirMais();
    selecionarTudo();
    fireEvent.click(within(painel).getByRole("button", { name: "Título 1 (seção da aula)" }));
    expect(editor.isActive("heading", { level: 2 })).toBe(true);
    fireEvent.click(within(painel).getByRole("button", { name: "Desfazer (Ctrl+Z)" }));
    expect(editor.isActive("heading")).toBe(false);
    fireEvent.click(within(painel).getByRole("button", { name: "Refazer (Ctrl+Y)" }));
    expect(editor.isActive("heading", { level: 2 })).toBe(true);
    fireEvent.click(within(painel).getByRole("button", { name: "Título 1 (seção da aula)" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Citação" }));
    expect(editor.isActive("blockquote")).toBe(true);
    fireEvent.click(within(painel).getByRole("button", { name: "Citação" }));
    selecionarTudo();
    fireEvent.click(within(painel).getByRole("button", { name: "Centralizar (Ctrl+Shift+E)" }));
    expect(JSON.stringify(editor.getJSON())).toMatch(/textAlign":"center/);
    selecionarTudo();
    fireEvent.click(within(painel).getByRole("button", { name: "Limpar formatação do parágrafo" }));
    expect(JSON.stringify(editor.getJSON())).not.toMatch(/textAlign":"center/);
    fireEvent.click(within(painel).getByRole("tab", { name: "Inserir" }));
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    });
    fireEvent.click(within(painel).getByRole("button", { name: "Inserir tabela (3 × 3)" }));
    expect(editor.getHTML()).toContain("<table");
  });

  it("só texto (fala de podcast): na barra curta ficam desfazer, refazer e Mais; no Mais, sem aba vazia", async () => {
    tela(390);
    montar({ somenteTexto: true, semModulos: ["imagens", "pagina", "historico", "formatacao", "tabelas", "insercao"] });
    expect(nomes(await barraCurta())).toEqual(["Desfazer (Ctrl+Z)", "Refazer (Ctrl+Y)", "Mais"]);
    // a aba Página inicial ficaria vazia dentro do Mais: some, e o Mais abre na Revisão
    const { painel } = await abrirMais();
    expect(within(painel).queryByRole("tab", { name: "Página inicial" })).toBeNull();
    expect(within(painel).getByRole("tab", { name: "Revisão" }).getAttribute("aria-selected")).toBe("true");
  });

  it("no computador nada muda: sem barra curta e sem Mais, a barra completa de sempre à vista", async () => {
    tela(1440);
    const { container } = montar();
    const barra = await screen.findByRole("toolbar", { name: "Ferramentas do editor" });
    expect(screen.queryByRole("toolbar", { name: "Ferramentas principais" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
    const toolbar = container.querySelector(".ep-toolbar") as HTMLElement;
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.hasAttribute("id")).toBe(false);
    expect(toolbar.hasAttribute("role")).toBe(false);
    expect(container.querySelector(".ep-container")!.className).not.toContain("ep-container--estreito");
    // todos os botões da aba Página inicial, na ordem de sempre (os seletores e os botões juntos)
    const esperados = botoesDaAba("inicio").filter((b: any) => !FORA_DO_CAMPO.includes(b.modulo)).length;
    expect(barra.querySelectorAll(".ep-grupo-itens > *").length).toBe(esperados);
    expect(within(barra).getByRole("button", { name: "Negrito (Ctrl+B)" })).toBeTruthy();
    expect(within(container.querySelector(".ep-tablist") as HTMLElement).getByRole("button", { name: "Hiperlink" })).toBeTruthy();
  });
});
