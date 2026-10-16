/**
 * Base da expansão do editor (Questões, Atualizações, Podcasts, Estações, Central): campos "texto + formatacao".
 * Banco (migração 013110, PGlite) e tela (src/shared/docRico/campos.ts) dão a mesma resposta para "só formatação × conteúdo".
 */
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { abrirBanco, type Sql } from "./helpers/publicacaoCentral";
import { envelope } from "../shared/docRico";
import { campoDoDoc, camposConteudo, camposSoFormatacao, comFormatacao, docDoCampo, formatacaoValida } from "../shared/docRico/campos";
import { CampoRico } from "../novo/app/editorPro/CampoRico.jsx";

afterEach(() => cleanup());
const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

let sql: Sql;
beforeAll(async () => {
  ({ sql } = await abrirBanco());
  await import("../novo/app/editorPro/EditorDocumento.jsx"); // o editor é carregado sob demanda: aquece antes dos testes de tela
}, 300_000);

const txt = (t: string, marks?: any[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const par = (inline: any[], attrs?: any) => envelope({ type: "doc", content: [{ type: "paragraph", ...(attrs ? { attrs } : {}), content: inline }] } as any);
const link = { type: "link", attrs: { href: "https://www.gov.br/saude" } };

describe("Campo: texto oficial + formatação", () => {
  it("texto sem formatação volta igual e sem rico; negrito vai para o rico e o texto fica sem marcas", () => {
    for (const t of ["PA ≥ 140 x 90 mmHg", "Linha 1\nLinha 2", "Ver [guia](https://www.gov.br/saude) hoje", ""]) {
      expect(campoDoDoc(docDoCampo(t, null))).toEqual({ texto: t, rico: null });
    }
    const doc: any = docDoCampo("Febre alta", null);
    doc.content[0].content[0].marks = [{ type: "bold" }];
    const c = campoDoDoc(doc);
    expect(c.texto).toBe("Febre alta");
    expect(c.rico?.doc.content[0].content?.[0].marks).toEqual([{ type: "bold" }]);
    expect(campoDoDoc(docDoCampo(c.texto, c.rico))).toEqual(c); // reabrir não muda nada
  });

  it("formatacaoValida descarta rico velho (texto mudou) e lixo; comFormatacao junta e remove", () => {
    const r = par([txt("Febre", [{ type: "bold" }])]);
    expect(Object.keys(formatacaoValida({ a: "Febre", b: "outro" }, { a: r, b: r, c: { x: 1 } }))).toEqual(["a"]);
    expect(comFormatacao({ a: r }, "a", null)).toEqual({});
    expect(comFormatacao(null, "b", r)).toEqual({ b: r });
  });
});

describe("Só formatação × conteúdo por campo (banco = tela)", () => {
  const T = { enunciado: "Febre e [guia](https://www.gov.br/saude) hoje", explicacao: "Conduta: hidratar." };
  const casos: [string, any, any, any, any, boolean][] = [
    ["nada mudou", T, null, T, null, true],
    ["negrito e alinhamento", T, null, T, { enunciado: par([txt("Febre", [{ type: "bold" }]), txt(" e "), txt("guia", [link]), txt(" hoje")], { textAlign: "center" }) }, true],
    ["texto mudou", T, null, { ...T, explicacao: "Conduta: hidratar já." }, null, false],
    ["imagem no campo", T, null, T, { explicacao: envelope({ type: "doc", content: [{ type: "paragraph", content: [txt("Conduta: hidratar.")] }, { type: "figura", attrs: { asset: "a1", alt: "x" } }] } as any) }, false],
    ["só largura da imagem", T, { explicacao: envelope({ type: "doc", content: [{ type: "paragraph", content: [txt("Conduta: hidratar.")] }, { type: "figura", attrs: { asset: "a1", alt: "x", largura: 50 } }] } as any) },
      T, { explicacao: envelope({ type: "doc", content: [{ type: "paragraph", content: [txt("Conduta: hidratar.")] }, { type: "figura", attrs: { asset: "a1", alt: "x", largura: 90 } }] } as any) }, true],
    ["link trocado só na formatação", T, null, T, { enunciado: par([txt("Febre e "), txt("guia", [{ type: "link", attrs: { href: "https://outro.gov.br" } }]), txt(" hoje")]) }, false],
    ["formatação estranha", T, null, T, { enunciado: { f: "x" } }, false],
    ["tirar a formatação", T, { enunciado: par([txt("Febre", [{ type: "italic" }]), txt(" e "), txt("guia", [link]), txt(" hoje")]) }, T, null, true],
  ];
  for (const [nome, ta, fa, td, fd, esperado] of casos) {
    it(`${esperado ? "só formatação" : "conteúdo"}: ${nome}`, async () => {
      const [r] = await sql(`select public.ch_campos_so_formatacao($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) r`, [JSON.stringify(ta), JSON.stringify(fa), JSON.stringify(td), JSON.stringify(fd)]);
      expect(r.r).toBe(esperado);
      expect(camposSoFormatacao({ textos: ta, formatacao: fa }, { textos: td, formatacao: fd })).toBe(esperado);
    });
  }

  it("conteúdo da formatação: banco e tela iguais; forma conferida no banco", async () => {
    const f = { enunciado: par([txt("Febre", [{ type: "superscript" }])]), explicacao: envelope({ type: "doc", content: [{ type: "notaRodape", content: [txt("ver")] }] } as any) };
    const [r] = await sql(`select public.ch_campos_conteudo($1::jsonb, $2::jsonb) c, public.ch_formatacao_valida($2::jsonb) v, public.ch_formatacao_valida('{"a": {"f": "sdoc"}}'::jsonb) ruim`, [JSON.stringify(T), JSON.stringify(f)]);
    expect(Object.keys(r.c).sort()).toEqual(Object.keys(camposConteudo(T, f)).sort());
    expect(r.v).toBe(true);
    expect(r.ruim).toBe(false);
  });
});

describe("CampoRico (tela)", () => {
  it("abre com o texto e mostra a barra de formatação", async () => {
    const mudou = vi.fn();
    render(<CampoRico label="Enunciado" texto="Febre alta" rico={null} onChange={mudou} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Negrito/ })).toBeTruthy(), { timeout: 15000 });
    expect(document.querySelector(".ep-container--compacto .ProseMirror")?.textContent).toBe("Febre alta");
  });

  it("somenteTexto (podcast): sem botões de formatação", async () => {
    render(<CampoRico label="Fala" texto="Bom dia" rico={null} onChange={() => {}} somenteTexto />);
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy(), { timeout: 15000 });
    expect(screen.queryByRole("button", { name: /Negrito/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Desfazer/ })).toBeTruthy();
  });
});
