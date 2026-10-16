import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent, screen, act } from "@testing-library/react";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import type { Server } from "http";

import {
  sanearPagina,
  cssPagina,
  htmlMarcaDagua,
  textosDecoracao,
  PAGINA_PADRAO,
  type PaginaConfig,
} from "../shared/docRico/modulos/pagina";
import {
  sanear,
  htmlDoDoc,
  precisaRico,
} from "../shared/docRico";
import EditorDocumentoJsx from "../novo/app/editorPro/EditorDocumento.jsx";
const EditorDocumento = EditorDocumentoJsx as any; // props opcionais no .jsx
import "../novo/app/editorPro/modulos.js";
import {
  lessonHtml,
  loadBrand,
  opcoesPdfAula,
  comparePdfText,
  createRenderer,
} from "../../server/contentHub/render";
import { mountPreviaPdf } from "../../server/contentHub/previaPdf";
import { PainelPagina } from "../novo/app/editorPro/pagina/PainelPagina.jsx";
import { botoesDaAba, modulosEditor } from "../novo/app/editorPro/registroEditor.js";

afterEach(() => cleanup());

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

describe("Módulo M5: Página e PDF do Editor Profissional", () => {
  it("1. sanearPagina: null para não-objeto; valores inválidos voltam ao padrão; chaves desconhecidas somem; texto com controle/limite", () => {
    // null para não-objeto
    expect(sanearPagina(null)).toBeNull();
    expect(sanearPagina(undefined)).toBeNull();
    expect(sanearPagina(123)).toBeNull();
    expect(sanearPagina("A4")).toBeNull();
    expect(sanearPagina([])).toBeNull();

    // valores inválidos voltam ao padrão
    const invalido = sanearPagina({
      tamanho: "A3",
      orientacao: "inclinado",
      margens: { topo: 99, base: 2, esquerda: "abc", direita: -5 },
      cabecalho: { texto: "Ok", alinhamento: "justificado" },
      rodape: { texto: "Rodape", alinhamento: "topo", padrao: "nao-booleano" },
      numeracao: { posicao: "centro-pagina", formato: "romano" },
      primeiraDiferente: "sim",
      secaoNovaPagina: 42,
      orfasViuvas: "verdadeiro",
    });
    expect(invalido).not.toBeNull();
    expect(invalido?.tamanho).toBe(PAGINA_PADRAO.tamanho);
    expect(invalido?.orientacao).toBe(PAGINA_PADRAO.orientacao);
    expect(invalido?.margens).toEqual(PAGINA_PADRAO.margens);
    expect(invalido?.cabecalho.alinhamento).toBe("esquerda");
    expect(invalido?.rodape.alinhamento).toBe("esquerda");
    expect(invalido?.rodape.padrao).toBe(PAGINA_PADRAO.rodape.padrao);
    expect(invalido?.numeracao.posicao).toBe(PAGINA_PADRAO.numeracao.posicao);
    expect(invalido?.numeracao.formato).toBe(PAGINA_PADRAO.numeracao.formato);
    expect(invalido?.primeiraDiferente).toBe(PAGINA_PADRAO.primeiraDiferente);
    expect(invalido?.secaoNovaPagina).toBe(PAGINA_PADRAO.secaoNovaPagina);
    expect(invalido?.orfasViuvas).toBe(PAGINA_PADRAO.orfasViuvas);

    // chaves desconhecidas somem
    const comEstranhas = sanearPagina({
      tamanho: "Carta",
      chaveDesconhecida: 123,
      scriptInject: "<script>alert(1)</script>",
    });
    expect((comEstranhas as any).chaveDesconhecida).toBeUndefined();
    expect((comEstranhas as any).scriptInject).toBeUndefined();
    expect(Object.keys(comEstranhas!).sort()).toEqual(Object.keys(PAGINA_PADRAO).sort());

    // texto com controle e limite de caracteres
    const comControle = sanearPagina({
      cabecalho: { texto: " Texto\u0000\u001F\u2028\u2029Limpo   " },
      marcaDagua: "M".repeat(120),
    });
    expect(comControle?.cabecalho.texto).toBe(" TextoLimpo   "); // sem trim ao gravar (espaço entre palavras ao digitar); o PDF apara
    expect(comControle?.marcaDagua.length).toBe(60);
    expect(comControle?.marcaDagua).toBe("M".repeat(60));
  });

  it("2. cssPagina: tamanhos/orientação/margens certos; texto malicioso não aparece cru; :first com content:none; numeração", () => {
    // tamanhos, orientação e margens certos
    const cfgA4Paisagem: PaginaConfig = {
      ...PAGINA_PADRAO,
      tamanho: "A4",
      orientacao: "paisagem",
      margens: { topo: 20, base: 22, esquerda: 24, direita: 26 },
    };
    const cssA4 = cssPagina(cfgA4Paisagem, { titulo: "Aula Teste", versao: 1, data: "16/10/2026" });
    expect(cssA4).toContain("size:297mm 210mm"); // 297 x 210 mm em paisagem
    expect(cssA4).toContain("margin:20mm 26mm 22mm 24mm"); // topo direita base esquerda

    // texto malicioso (sem `<`, `"` fora de escape, `}` cru)
    const malicioso = '"};</style><script>x</script>';
    const cfgMalicioso: PaginaConfig = {
      ...PAGINA_PADRAO,
      cabecalho: { texto: malicioso, alinhamento: "esquerda" },
    };
    const cssMal = cssPagina(cfgMalicioso, { titulo: "Aula", versao: 1, data: "16/10/2026" });
    expect(cssMal).not.toContain("<");
    expect(cssMal).not.toContain("</style>");
    expect(cssMal).not.toContain("<script>");
    // Não pode haver aspas ou chaves fechando prematuramente as regras
    expect(cssMal).toContain("\\3c "); // < escapado
    expect(cssMal).toContain("\\3e "); // > escapado
    expect(cssMal).toContain("\\7d "); // } escapado
    expect(cssMal).toContain("\\22 "); // " escapado

    // :first com content:none
    const cfgPrimeira: PaginaConfig = {
      ...PAGINA_PADRAO,
      primeiraDiferente: true,
    };
    const cssPri = cssPagina(cfgPrimeira, { titulo: "Aula", versao: 1, data: "16/10/2026" });
    expect(cssPri).toContain("@page :first{");
    expect(cssPri).toContain("content:none");

    // numeração "página N de M"
    const cfgNum: PaginaConfig = {
      ...PAGINA_PADRAO,
      numeracao: { posicao: "rodape-direita", formato: "pagina-de" },
    };
    const cssNum = cssPagina(cfgNum, { titulo: "Aula", versao: 1, data: "16/10/2026" });
    expect(cssNum).toContain('counter(page) " de " counter(pages)');
  });

  it("3. lessonHtml: sem doc_config igual ao snapshot de A5 16/13/18mm; com doc_config.pagina contém size:210mm 297mm e marca-d'água escapada", () => {
    const brand = loadBrand();
    const contentPadrao = {
      title: "Hipertensão Arterial Sistêmica",
      sections: [{ heading: "Diagnóstico", paragraphs: [{ text: "O diagnóstico é clínico." }] }],
      references: [],
    };
    const meta = {
      title: "Hipertensão Arterial Sistêmica",
      version: 2,
      revisedAt: "2026-10-16T12:00:00.000Z",
      contentHash: "hash-aula-1",
    };

    const htmlSem = lessonHtml(contentPadrao, meta, brand);
    const htmlClonado = lessonHtml({ ...contentPadrao }, meta, brand);
    expect(htmlSem).toBe(htmlClonado);
    expect(htmlSem).toContain("@page{size:A5;margin:16mm 13mm 18mm}");
    expect(htmlSem).not.toContain("ep-marca-dagua");

    const contentComPagina = {
      ...contentPadrao,
      doc_config: {
        pagina: {
          ...PAGINA_PADRAO,
          tamanho: "A4",
          marcaDagua: "CONFIDENCIAL & TESTE",
        },
      },
    };
    const htmlCom = lessonHtml(contentComPagina, meta, brand);
    expect(htmlCom).toContain("size:210mm 297mm");
    expect(htmlCom).toContain('<div class="ep-marca-dagua" aria-hidden="true">CONFIDENCIAL &amp; TESTE</div>');
  });

  it("4. comparePdfText com decoracoes: cabeçalho/rodapé/marca-d'água no começo/fim são ignorados e parágrafo partido passa", () => {
    const cfg: PaginaConfig = {
      ...PAGINA_PADRAO,
      cabecalho: { texto: "Diretrizes Clínicas 2026", alinhamento: "esquerda" },
      marcaDagua: "RASCUNHO",
    };
    const campos = { titulo: "HAS", versao: 1, data: "16/10/2026" };
    const decoracoes = (n: number, total: number) => textosDecoracao(cfg, campos, n, total);
    expect(decoracoes(2, 2)).toEqual(["Diretrizes Clínicas 2026", "StaziaMed · HAS · versão 1 de 16/10/2026", "página 2 de 2", "RASCUNHO"]);
    expect(textosDecoracao({ ...cfg, primeiraDiferente: true }, campos, 1, 2)).toEqual(["RASCUNHO"]);

    const textoParte1 = "O tratamento farmacológico inicial deve ser realizado com monoterapia ou combinação";
    const textoParte2 = "de dois fármacos em doses baixas, dependendo do estágio da hipertensão.";
    const textoCompleto = `${textoParte1} ${textoParte2}`;

    // como o Chromium escreve: caixas da margem antes do corpo (podem quebrar linha), marca-d'água depois
    const extracted = {
      pages: 2,
      empty_pages: [],
      page_texts: [
        `página 1 de 2\nStaziaMed · HAS · versão 1\nde 16/10/2026\nDiretrizes Clínicas 2026\nHAS\n${textoParte1}\nRASCUNHO\n`,
        `Diretrizes\nClínicas 2026\npágina 2 de 2\nStaziaMed · HAS · versão 1 de 16/10/2026\n${textoParte2}\nSociedade Brasileira de Cardiologia\nRASCUNHO\n`,
      ],
    };

    const expected = {
      texts: ["HAS", textoCompleto],
      references: ["Sociedade Brasileira de Cardiologia"],
    };

    // Com decorações: cabeçalho e rodapés nas pontas são limpos; o parágrafo partido entre páginas se une e é aceito
    const resultadoCom = comparePdfText(extracted, expected, "lesson", decoracoes);
    expect(resultadoCom.ok).toBe(true);
    expect(resultadoCom.missing_texts).toEqual([]);

    // Sem decorações: os cabeçalhos ficam no meio da junção de texto e corrompem a checagem contínua
    const resultadoSem = comparePdfText(extracted, expected, "lesson");
    expect(resultadoSem.ok).toBe(false);
    expect(resultadoSem.missing_texts).toContain(textoCompleto);
  });

  it("5. Quebra de página: precisaRico fica true; htmlDoDoc gera break-before:page; sanear tira quebraPagina='x'; ida e volta pelo editor", () => {
    const pComQuebra = {
      type: "paragraph",
      attrs: { quebraPagina: true },
      content: [{ type: "text", text: "Início em nova página" }],
    };

    // precisaRico fica true com quebraPagina
    expect(precisaRico(pComQuebra as any)).toBe(true);

    // htmlDoDoc gera break-before:page
    const doc = { type: "doc" as const, content: [pComQuebra as any] };
    const html = htmlDoDoc(doc);
    expect(html).toContain('style="break-before:page;"');

    // sanear tira quebraPagina: "x"
    const pInvalido = {
      type: "paragraph",
      attrs: { quebraPagina: "x" },
      content: [{ type: "text", text: "Invalido" }],
    };
    const saneado = sanear({ type: "doc", content: [pInvalido as any] });
    expect(saneado.content[0].attrs?.quebraPagina).toBeUndefined();

    // ida e volta pelo editor com aoCriar mantém o atributo
    let editorInst: any = null;
    const { unmount } = render(
      <EditorDocumento
        valor={doc}
        aoCriar={(e: any) => {
          editorInst = e;
        }}
      />
    );
    expect(editorInst).not.toBeNull();
    const json = editorInst.getJSON();
    expect(json.content[0].attrs?.quebraPagina).toBe(true);

    const reSaneado = sanear(json);
    expect(reSaneado.content[0].attrs?.quebraPagina).toBe(true);
    unmount();
  });

  it("6. Pipeline: material 'lesson' sem doc_config continua sem a chave e o hash é igual ao de antes", () => {
    const pipelinePath = path.join(process.cwd(), "server/contentHub/pipeline.ts");
    const conteudoArquivo = fs.readFileSync(pipelinePath, "utf-8");
    expect(conteudoArquivo).toContain("...(v.content.doc_config ? { doc_config: v.content.doc_config } : {})");

    const versaoSem = {
      version_id: "v-teste",
      title: "Título da Aula",
      content: { sections: [] },
      scope_note: "Nota",
    };

    const objAntes = {
      title: versaoSem.title,
      sections: versaoSem.content.sections,
      references: [],
      scope_note: versaoSem.scope_note,
      label: "Material StaziaMed",
    };

    const objDepois = {
      title: versaoSem.title,
      sections: versaoSem.content.sections,
      references: [],
      scope_note: versaoSem.scope_note,
      label: "Material StaziaMed",
      ...((versaoSem.content as any).doc_config ? { doc_config: (versaoSem.content as any).doc_config } : {}),
    };

    expect("doc_config" in objDepois).toBe(false);
    const hashAntes = crypto.createHash("sha256").update(JSON.stringify(objAntes)).digest("hex");
    const hashDepois = crypto.createHash("sha256").update(JSON.stringify(objDepois)).digest("hex");
    expect(hashDepois).toBe(hashAntes);
  });

  it("7. Rota previa-pdf (sem Chromium e sem Supabase): 503 com html; requireStaff que lança -> 403; corpo inválido -> 400; sem <script", async () => {
    const app = express();
    let deveBloquearStaff = false;

    const requireStaff = async () => {
      if (deveBloquearStaff) {
        throw new Error("Acesso restrito à equipe de conteúdo.");
      }
      return { staff: true };
    };

    const deps = { renderer: null };
    mountPreviaPdf(app, deps, null, requireStaff);

    const srv: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = (srv.address() as any).port;
    const url = `http://127.0.0.1:${port}/previa-pdf`;

    try {
      // requireStaff que lança -> 403
      deveBloquearStaff = true;
      const res403 = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: [] }),
      });
      expect(res403.status).toBe(403);
      expect(await res403.json()).toMatchObject({ error: "Acesso restrito à equipe de conteúdo." });

      // corpo inválido -> 400
      deveBloquearStaff = false;
      const res400A = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("string-invalida"),
      });
      expect(res400A.status).toBe(400);

      const res400B = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: "nao-eh-array" }),
      });
      expect(res400B.status).toBe(400);

      // sem renderer -> 503 com html contendo o texto
      const corpoValido = {
        titulo: "Aula de Teste de Rota",
        sections: [
          {
            heading: "Seção 1",
            paragraphs: [{ text: "Conteúdo textual da aula de prévia." }],
          },
        ],
      };
      const res503 = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoValido),
      });
      expect(res503.status).toBe(503);
      const data503 = (await res503.json()) as any;
      expect(data503.error).toContain("A prévia exata em PDF não está disponível");
      expect(data503.html).toContain("Conteúdo textual da aula de prévia.");
      expect(data503.html).toContain("Aula de Teste de Rota");

      // html sem <script mesmo com texto malicioso
      const corpoMalicioso = {
        titulo: '<script>alert("xss1")</script>',
        sections: [
          {
            heading: '<script>alert("xss2")</script>',
            paragraphs: [{ text: '<script>alert("xss3")</script>' }],
          },
        ],
      };
      const resMal = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoMalicioso),
      });
      const dataMal = (await resMal.json()) as any;
      expect(dataMal.html).not.toContain("<script");
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it("8. Teste com Chromium SÓ se disponível (createRenderer != null e pdfpython existir; senão it.skip)", async (ctx) => {
    let pythonDisponivel = false;
    try {
      const { execSync } = await import("child_process");
      execSync("which pdfpython", { stdio: "ignore" });
      pythonDisponivel = true;
    } catch {
      pythonDisponivel = false;
    }

    const renderer = await createRenderer();
    if (!renderer || !pythonDisponivel) {
      ctx.skip();
      return;
    }

    try {
      const content = {
        title: "Aula A4 de Exemplo",
        sections: [
          {
            heading: "Primeira Seção",
            paragraphs: [{ text: "Texto clínico com todas as informações requeridas para conferência." }],
          },
        ],
        references: [{ source: "Ministério da Saúde", organ: "MS", published_on: "2024-01-01" }],
        doc_config: {
          pagina: {
            ...PAGINA_PADRAO,
            tamanho: "A4",
            cabecalho: { texto: "Cabeçalho StaziaMed", alinhamento: "esquerda" },
            numeracao: { posicao: "rodape-direita", formato: "pagina-de" },
            marcaDagua: "RASCUNHO",
          },
        },
      };

      const meta = {
        title: "Aula A4 de Exemplo",
        version: 1,
        revisedAt: new Date().toISOString(),
        contentHash: "hash-chromium",
      };

      const files = await renderer.render("lesson", content, meta);
      const pdf = files.find((f) => f.format === "pdf");
      expect(pdf).toBeDefined();
      expect(pdf?.check?.ok).toBe(true);
    } finally {
      await renderer.close();
    }
  }, 120_000);
  it("9. Aula antiga (sem página) sai idêntica: HTML com o @page de hoje e as mesmas opções de PDF de hoje; as 23 aulas reais também", () => {
    const brand = loadBrand();
    const meta = { title: "T", version: 3, revisedAt: "2026-10-16T12:00:00.000Z", contentHash: "h" };
    const c = { title: "T", sections: [{ heading: "H", paragraphs: [{ text: "a **b**" }] }], references: [] };
    const html = lessonHtml(c, meta, brand);
    expect(html).toContain("\n@page{size:A5;margin:16mm 13mm 18mm}\nbody{");
    expect(html).toContain("</style></head><body>\n<header>");
    // doc_config sem página (ou com página inválida) não muda nada
    expect(lessonHtml({ ...c, doc_config: { hide_title: true } }, meta, brand)).toBe(html);
    expect(lessonHtml({ ...c, doc_config: { pagina: "A4" } }, meta, brand)).toBe(html);
    // opções do PDF de hoje, literalmente
    expect(opcoesPdfAula(c, meta)).toEqual({
      format: "A5",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:7px;color:#687586;width:100%;padding:0 13mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>StaziaMed · T · versão 3 de 16/10/2026</span><span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
      margin: { top: "16mm", bottom: "18mm", left: "13mm", right: "13mm" },
    });
    const unitsPath = (process.env.DOC_RICO_DADOS ?? "/Volumes/StaziaMed/.tmp-aulas/editor-word/dados") + "/units.json";
    if (fs.existsSync(unitsPath)) {
      const units = JSON.parse(fs.readFileSync(unitsPath, "utf8"));
      for (const u of units) {
        const h = lessonHtml({ title: "Aula", ...u.content }, meta, brand);
        expect(h).toContain("@page{size:A5;margin:16mm 13mm 18mm}");
        expect(h).not.toContain("ep-marca-dagua");
      }
    }
  });

  it("10. Editor: botões na aba Layout e painel grava a configuração; prévia cai na impressão do navegador quando o servidor responde 503", async () => {
    expect(modulosEditor()).toContain("pagina");
    const ids = botoesDaAba("layout").map((b: any) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["pagina-tamanho", "pagina-orientacao", "pagina-margens", "pagina-quebra"]));

    const mudarConfig = vi.fn();
    const editorFalso = { getJSON: () => ({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Seção" }] }, { type: "paragraph", content: [{ type: "text", text: "Texto" }] }] }) };
    const buscarPrevia = vi.fn(async (body: any) => {
      expect(body.sections).toEqual([{ heading: "Seção", paragraphs: [{ text: "Texto" }] }]);
      return new Response(JSON.stringify({ error: "A prévia exata em PDF não está disponível neste servidor.", html: "<p>prévia</p>" }), { status: 503, headers: { "Content-Type": "application/json" } });
    });
    render(<PainelPagina editor={editorFalso} ctx={{ config: { pagina: { tamanho: "A4" } }, mudarConfig }} buscarPrevia={buscarPrevia} />);

    fireEvent.change(screen.getByLabelText("Texto do cabeçalho"), { target: { value: "Pediatria " } });
    expect(mudarConfig).toHaveBeenLastCalledWith("pagina", expect.objectContaining({ tamanho: "A4", cabecalho: { texto: "Pediatria ", alinhamento: "esquerda" } }));

    // margem: só grava ao sair do campo, e dentro de 5–50
    const topo = screen.getByLabelText("Superior");
    fireEvent.change(topo, { target: { value: "2" } });
    const chamadas = mudarConfig.mock.calls.length;
    fireEvent.change(topo, { target: { value: "200" } });
    expect(mudarConfig.mock.calls.length).toBe(chamadas);
    fireEvent.blur(topo);
    expect(mudarConfig).toHaveBeenLastCalledWith("pagina", expect.objectContaining({ margens: expect.objectContaining({ topo: 50 }) }));

    await act(async () => {
      fireEvent.click(screen.getByText("Prévia do PDF"));
    });
    expect(buscarPrevia).toHaveBeenCalledTimes(1);
    const quadro = await screen.findByTitle("Prévia para impressão");
    expect(quadro.getAttribute("sandbox")).toBe("allow-same-origin allow-modals");
    expect(screen.getByText("Imprimir / salvar em PDF")).toBeTruthy();
  });
});
