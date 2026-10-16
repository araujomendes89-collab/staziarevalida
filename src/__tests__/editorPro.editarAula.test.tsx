import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import fs from "fs";
import path from "path";

// Polyfills necessários para o TipTap rodar em ambiente jsdom
const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

import "../novo/app/editorPro/modulos.js";
import { extensoesDe } from "../novo/app/editorPro/registroEditor.js";
import {
  textoDoResumo,
  docDoResumo,
  resumoRicoValido,
  resumoParaGuardar,
  resumoSoFormatacao,
} from "../shared/docRico/modulos/editarAula";
import { canonico, ler, escrever } from "../shared/textoRico";

// o texto do resumo editado guarda só texto + links (013080): negrito, itálico e sublinhado ficam no rico
const semFormato = (t: string) => {
  const d: any = ler(t, "documento");
  const tira = (n: any) => { if (n.marks) { n.marks = n.marks.filter((m: any) => m.type === "link"); if (!n.marks.length) delete n.marks; } (n.content ?? []).forEach(tira); };
  d.content.forEach(tira);
  return escrever(d, "documento");
};
import { sanear } from "../shared/docRico";
import EditorResumo from "../novo/app/editorPro/editarAula/EditorResumo.jsx";
import ResumoRico from "../novo/app/editorPro/editarAula/ResumoRico.jsx";
import TextoRicoJsx from "../novo/app/textoRico/TextoRico.jsx";
const TextoRico: any = TextoRicoJsx;

afterEach(() => {
  cleanup();
});

describe("Editor Profissional - Editar Aula (M13)", () => {
  it("a) aula antiga continua idêntica: textos de documento e seções da fixture GR-001 geram rico nulo", () => {
    const fixturePath = path.join(__dirname, "fixtures/aula-pronta-GR-001-v3.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    // Resumos montados a partir das seções reais da aula GR-001
    const resumosFixture: string[] = (fixture.aula?.sections ?? []).map((secao: any) =>
      (secao.paragraphs ?? []).map((p: any) => p.text).join("\n\n")
    );

    // Lista de textos variados no formato documento
    const textosFormatoDocumento: string[] = [
      "## Título",
      "### Sub",
      "- item",
      "1. item",
      "> citação",
      "| a | b |\n| --- | --- |\n| 1 | 2 |",
      "**x**",
      "*x*",
      "<u>x</u>",
      "[x](https://ex.com)",
      "Linha 1\nLinha 2",
    ];

    const todosOsTextos = [...resumosFixture, ...textosFormatoDocumento];

    for (const textoBruto of todosOsTextos) {
      const T = canonico(textoBruto, "documento");
      if (!T) continue;

      const editor = new Editor({
        extensions: extensoesDe({}),
        content: docDoResumo(T),
      });

      const json = editor.getJSON();
      const resultado = resumoParaGuardar(json);

      if (semFormato(T) === T) {
        expect(resultado).toEqual({ summary: T, summary_rico: null });
      } else {
        // tinha negrito/itálico/sublinhado: o texto perde as marcas, o rico guarda; o conteúdo é o mesmo (só formatação)
        expect(resultado.summary).toBe(semFormato(T));
        expect(resumoRicoValido(resultado.summary, resultado.summary_rico)).not.toBeNull();
        expect(resumoSoFormatacao({ summary: T, summary_rico: null }, { summary: resultado.summary, summary_rico: resultado.summary_rico })).toBe(false); // o texto mudou
      }
      editor.destroy();
    }
  });

  it("b) formatação que o texto não guarda gera rico válido (título nível 4)", () => {
    const docH4 = {
      type: "doc" as const,
      content: [
        {
          type: "heading" as const,
          attrs: { level: 4 },
          content: [{ type: "text" as const, text: "Subtítulo Nível 4" }],
        },
      ],
    };

    // Abre em editor de verdade e testa tanto a saída direta quanto a do TipTap
    const editor = new Editor({
      extensions: extensoesDe({}),
      content: docH4,
    });
    const json = editor.getJSON();

    const { summary, summary_rico } = resumoParaGuardar(json);
    expect(summary_rico).not.toBeNull();

    const ricoValido = resumoRicoValido(summary, summary_rico);
    expect(ricoValido).not.toBeNull();
    expect(textoDoResumo(summary_rico!.doc)).toBe(summary);

    editor.destroy();
  });

  it("c) rico desatualizado é ignorado: rico de outro texto, envelope inválido ou summary vazio", () => {
    const ricoA = {
      f: "sdoc" as const,
      v: 1 as const,
      doc: {
        type: "doc" as const,
        content: [
          {
            type: "heading" as const,
            attrs: { level: 4 },
            content: [{ type: "text" as const, text: "Texto A" }],
          },
        ],
      },
    };
    const summaryA = textoDoResumo(ricoA.doc);
    const summaryB = "Texto B completamente diferente";

    // Rico do texto A aplicado com summary B -> null
    expect(resumoRicoValido(summaryB, ricoA)).toBeNull();

    // Ricos que não são envelopes válidos
    expect(resumoRicoValido(summaryA, {})).toBeNull();
    expect(resumoRicoValido(summaryA, null)).toBeNull();
    expect(resumoRicoValido(summaryA, "string inválida")).toBeNull();
    expect(resumoRicoValido(summaryA, { f: "sdoc", v: 2, doc: ricoA.doc })).toBeNull();
    expect(resumoRicoValido(summaryA, [ricoA])).toBeNull();

    // Summary vazio
    expect(resumoRicoValido("", ricoA)).toBeNull();
    expect(resumoRicoValido(null, ricoA)).toBeNull();
    expect(resumoRicoValido(undefined, ricoA)).toBeNull();
  });

  it("d) saneamento: nós desconhecidos e links maliciosos são removidos sem perder o texto", () => {
    const docMalicioso = {
      type: "doc" as const,
      content: [
        {
          type: "script",
          content: [{ type: "text" as const, text: "x" }],
        },
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "clique aqui",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };

    const saneado = sanear(docMalicioso, { semRef: true });
    const jsonSaneado = JSON.stringify(saneado);
    expect(jsonSaneado).not.toContain("script");
    expect(jsonSaneado).not.toContain("javascript:");

    // A projeção em texto continua apenas com o texto
    const projecao = textoDoResumo(docMalicioso as any);
    expect(projecao).not.toContain("script");
    expect(projecao).not.toContain("javascript:");
    expect(projecao).toContain("x");
    expect(projecao).toContain("clique aqui");

    // No resumoParaGuardar também não há traço do script nem do javascript:
    const guardado = resumoParaGuardar(docMalicioso as any);
    const jsonGuardado = JSON.stringify(guardado);
    expect(jsonGuardado).not.toContain("script");
    expect(jsonGuardado).not.toContain("javascript:");
    expect(guardado.summary).toBe("x\n\nclique aqui");
  });

  it("e) parágrafos vazios não são guardados: summary idêntico ao sem o vazio e rico nulo", () => {
    const docComVazio = {
      type: "doc" as const,
      content: [
        { type: "paragraph" as const, content: [{ type: "text" as const, text: "Primeiro parágrafo." }] },
        { type: "paragraph" as const, content: [] },
        { type: "paragraph" as const, content: [{ type: "text" as const, text: "Segundo parágrafo." }] },
      ],
    };
    const docSemVazio = {
      type: "doc" as const,
      content: [
        { type: "paragraph" as const, content: [{ type: "text" as const, text: "Primeiro parágrafo." }] },
        { type: "paragraph" as const, content: [{ type: "text" as const, text: "Segundo parágrafo." }] },
      ],
    };

    const gComVazio = resumoParaGuardar(docComVazio);
    const gSemVazio = resumoParaGuardar(docSemVazio);

    expect(gComVazio.summary).toBe(gSemVazio.summary);
    expect(gComVazio.summary).toBe("Primeiro parágrafo.\n\nSegundo parágrafo.");
    expect(gComVazio.summary_rico).toBeNull();
  });

  it("f) ResumoRico: render sem rico, com rico válido (h5) e com rico desatualizado", () => {
    const T = "Texto de teste para resumo da aula médica.";

    // 1. Sem rico: HTML idêntico ao de <TextoRico modo="documento" texto={T} />
    const { container: cSemRico } = render(<ResumoRico texto={T} rico={null} />);
    const { container: cRefSemRico } = render(<TextoRico modo="documento" texto={T} />);
    expect(cSemRico.innerHTML).toBe(cRefSemRico.innerHTML);

    // 2. Com rico válido (título nível 4 -> tag h5 no LeitorDoc)
    const ricoH4 = {
      f: "sdoc" as const,
      v: 1 as const,
      doc: {
        type: "doc" as const,
        content: [
          {
            type: "heading" as const,
            attrs: { level: 4 },
            content: [{ type: "text" as const, text: "Subtítulo Nível Quatro" }],
          },
        ],
      },
    };
    const textoH4 = textoDoResumo(ricoH4.doc);
    const { container: cComRico } = render(<ResumoRico texto={textoH4} rico={ricoH4} />);

    expect(cComRico.textContent).toContain("Subtítulo Nível Quatro");
    const elH5 = cComRico.querySelector("h5");
    expect(elH5).not.toBeNull();
    expect(elH5?.textContent).toBe("Subtítulo Nível Quatro");
    expect(cComRico.querySelector("script")).toBeNull();
    expect(cComRico.innerHTML).not.toContain("<script");

    // 3. Com rico desatualizado: ignora o rico e renderiza idêntico ao TextoRico do texto
    const textoDesatualizado = "Resumo que diverge do documento rico fornecido";
    const { container: cDesatualizado } = render(<ResumoRico texto={textoDesatualizado} rico={ricoH4} />);
    const { container: cRefDesatualizado } = render(<TextoRico modo="documento" texto={textoDesatualizado} />);
    expect(cDesatualizado.innerHTML).toBe(cRefDesatualizado.innerHTML);
  });

  it("g) EditorResumo com editor de verdade: inserção de parágrafo e título nível 4", async () => {
    const T = "Texto inicial do resumo.";
    const fn = vi.fn();
    let ed: any = null;

    render(<EditorResumo summary={T} rico={null} aoMudar={fn} aoCriar={(e: any) => (ed = e)} />);

    // Aguarda o editor carregar via Suspense
    await screen.findByRole("textbox");
    await waitFor(() => expect(ed).not.toBeNull());

    // Sem mexer, a função de callback não deve ser acionada
    expect(fn).not.toHaveBeenCalled();

    // Insere novo conteúdo através de transação do TipTap
    act(() => {
      ed.commands.insertContentAt(ed.state.doc.content.size, {
        type: "paragraph",
        content: [{ type: "text", text: "Novo." }],
      });
    });

    expect(fn).toHaveBeenCalledWith({
      summary: `${T}\n\nNovo.`,
      summary_rico: null,
    });

    // Modifica o primeiro parágrafo para título nível 4 (formatação nova)
    act(() => {
      ed.commands.setTextSelection({ from: 1, to: 5 });
      ed.commands.toggleHeading({ level: 4 });
    });

    expect(fn).toHaveBeenCalled();
    const ultimoChamado = fn.mock.calls[fn.mock.calls.length - 1][0];
    expect(ultimoChamado.summary_rico).not.toBeNull();
    expect(resumoRicoValido(ultimoChamado.summary, ultimoChamado.summary_rico)).not.toBeNull();
    expect(textoDoResumo(ultimoChamado.summary_rico.doc)).toBe(ultimoChamado.summary);
  });
});
