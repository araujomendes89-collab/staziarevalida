import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";

import {
  modulosEditor,
  botoesDaAba,
  paineis,
  extensoesDe,
} from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import EditorDocumento from "../novo/app/editorPro/EditorDocumento.jsx";
import LeitorDoc from "../novo/app/editorPro/leitor/LeitorDoc.jsx";
import { ContextoFiguras } from "../novo/app/editorPro/imagens/fonteImagens.js";
import {
  tratarArquivos,
  figuraSelecionada,
} from "../novo/app/editorPro/imagens/extensaoFigura.js";
import { obterEstado } from "../novo/app/editorPro/imagens/estadoEnvio.js";
import { sanear } from "../shared/docRico";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Polyfills para ambiente jsdom do Vitest
const retangulo = () => ({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
});
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const UUID_1 = "11111111-1111-1111-1111-111111111111";
const UUID_2 = "22222222-2222-2222-2222-222222222222";
const UUID_3 = "33333333-3333-3333-3333-333333333333";
const DATA_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("M11b imagens - registro do módulo e interface", () => {
  it("modulosEditor() contém 'imagens', aba inserir tem os 3 botões e paineis() têm galeria e formatação", () => {
    expect(modulosEditor()).toContain("imagens");

    const botoesInserir = botoesDaAba("inserir");
    const botoesImagens = botoesInserir.filter((b) => b.grupo === "imagens");
    expect(botoesImagens).toHaveLength(3);

    const idsImagens = botoesImagens.map((b) => b.id);
    expect(idsImagens).toContain("imagem-computador");
    expect(idsImagens).toContain("imagem-galeria");
    expect(idsImagens).toContain("imagem-formatar");

    const listaPaineis = paineis();
    expect(listaPaineis.some((p) => p.id === "galeria-imagens")).toBe(true);
    expect(listaPaineis.some((p) => p.id === "formatar-imagem")).toBe(true);
  });
});

describe("M11b imagens - ciclo de vida no editor e saneamento", () => {
  const imagensFalsas = {
    carregar: vi.fn().mockResolvedValue(DATA_PNG),
    enviar: vi.fn().mockResolvedValue({ id: UUID_1, alt_text: "Raio-x" }),
  };

  it("conteúdo com figura mantém atributos idênticos ao sanear, insere múltiplas e atualiza atributos", () => {
    const docInicial = {
      type: "doc",
      content: [
        {
          type: "figura",
          attrs: {
            asset: UUID_1,
            alt: "Radiografia inicial",
            legenda: "Legenda clínica",
            largura: 75,
            alinhamento: "direita",
            disposicao: "quadrado-direita",
            borda: "fina",
            cantos: "suaves",
            sombra: true,
          },
        },
      ],
    };

    const editor = new Editor({
      extensions: extensoesDe({ contexto: { imagens: imagensFalsas } }),
      content: docInicial,
    });

    // Ida e volta idêntica pelo saneador
    const docSaneado = sanear(editor.getJSON());
    const figOriginal = docSaneado.content[0];
    expect(figOriginal.type).toBe("figura");
    expect(figOriginal.attrs).toEqual({
      asset: UUID_1,
      alt: "Radiografia inicial",
      legenda: "Legenda clínica",
      largura: 75,
      alinhamento: "direita",
      disposicao: "quadrado-direita",
      borda: "fina",
      cantos: "suaves",
      sombra: true,
    });

    // Inserir 2 figuras adicionais
    editor.commands.inserirFiguras([
      { asset: UUID_2, alt: "Segunda foto" },
      { asset: UUID_3, alt: "Terceira foto" },
    ]);

    const docComTres = editor.getJSON();
    const figs = docComTres.content?.filter((n: any) => n.type === "figura") || [];
    expect(figs).toHaveLength(3);

    // Selecionar a primeira figura com NodeSelection
    let posFig1 = 0;
    editor.state.doc.descendants((no, pos) => {
      if (no.type.name === "figura" && no.attrs.asset === UUID_1) {
        posFig1 = pos;
      }
    });

    editor.commands.setNodeSelection(posFig1);
    expect(figuraSelecionada(editor)?.attrs.asset).toBe(UUID_1);

    // Atualizar largura e disposição
    editor.commands.atualizarFigura({
      largura: 50,
      disposicao: "quadrado-esquerda",
    });

    const figModificada = editor.state.doc.nodeAt(posFig1);
    expect(figModificada?.attrs.largura).toBe(50);
    expect(figModificada?.attrs.disposicao).toBe("quadrado-esquerda");

    // Atualizar com legenda vazia para remover
    editor.commands.atualizarFigura({ legenda: "" });
    const figSemLegenda = editor.state.doc.nodeAt(posFig1);
    expect(figSemLegenda?.attrs.legenda).toBeNull();

    const saneadoFinal = sanear(editor.getJSON());
    expect(saneadoFinal.content[0].attrs.legenda).toBeUndefined();
  });

  it("tratarArquivos insere figura ao receber imagem e registra erro para arquivo que não é imagem", async () => {
    const editor = new Editor({
      extensions: extensoesDe({ contexto: { imagens: imagensFalsas } }),
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    const enviarMock = vi.fn().mockResolvedValue({ id: UUID_2, alt_text: "Raio-x de tórax" });
    const ctxEnvio = {
      contexto: { imagens: { enviar: enviarMock } },
      somenteLeitura: false,
    };

    const filePng = new File([new Uint8Array([1, 2, 3])], "exame.png", { type: "image/png" });
    await tratarArquivos(editor, [filePng], null, ctxEnvio);

    expect(enviarMock).toHaveBeenCalled();
    const docApos = editor.getJSON();
    const figInserida = docApos.content?.find(
      (n: any) => n.type === "figura" && n.attrs.asset === UUID_2
    );
    expect(figInserida).toBeDefined();
    expect(figInserida?.attrs.alt).toBe("Raio-x de tórax");

    // Arquivo que não é imagem
    const filePdf = new File([new Uint8Array([1, 2, 3])], "relatorio.pdf", {
      type: "application/pdf",
    });
    await tratarArquivos(editor, [filePdf], null, ctxEnvio);

    const estado = obterEstado(editor);
    expect(estado.erros.some((e: string) => e.includes("não é imagem"))).toBe(true);
  });
});

describe("M11b imagens - EditorDocumento e painel de formatação", () => {
  const imagensFalsas = {
    carregar: vi.fn().mockResolvedValue(DATA_PNG),
    enviar: vi.fn().mockResolvedValue({ id: UUID_1, alt_text: "Foto" }),
  };

  it("mostra aviso de falta de texto alternativo e altera documento ao formatar no painel", async () => {
    let editorInstancia: any = null;
    let ultimoDoc: any = null;

    const docInicial = {
      type: "doc",
      content: [
        {
          type: "figura",
          attrs: {
            asset: UUID_1,
            alt: "",
            largura: 100,
          },
        },
      ],
    };

    render(
      <EditorDocumento
        valor={docInicial}
        aoCriar={(e) => {
          editorInstancia = e;
        }}
        aoMudar={(d) => {
          ultimoDoc = d;
        }}
        contexto={{ imagens: imagensFalsas }}
      />
    );

    // Aviso de acessibilidade visível
    expect(screen.getByText(/Falta o texto alternativo/i)).toBeInTheDocument();

    // Selecionar figura com NodeSelection usando aoCriar
    let posFig = 0;
    editorInstancia.state.doc.descendants((no: any, pos: number) => {
      if (no.type.name === "figura") posFig = pos;
    });
    editorInstancia.commands.setNodeSelection(posFig);

    // Abrir o painel de formatação clicando em 'Escrever agora'
    const botaoEscrever = screen.getByRole("button", { name: "Escrever agora" });
    fireEvent.click(botaoEscrever);

    expect(screen.getByTestId("painel-formatar-imagem")).toBeInTheDocument();

    // Alterar o texto alternativo pelo textarea do painel
    const campoAlt = screen.getByPlaceholderText(/Descreva a imagem para acessibilidade/i);
    fireEvent.change(campoAlt, { target: { value: "Descrição detalhada do exame" } });

    // Alterar largura para 50% clicando no botão do painel
    const botao50 = screen.getByRole("button", { name: "50%" });
    fireEvent.click(botao50);

    // O callback aoMudar recebeu o documento atualizado e saneado
    expect(ultimoDoc).toBeDefined();
    const fig = ultimoDoc.content.find((n: any) => n.type === "figura");
    expect(fig.attrs.largura).toBe(50);
    expect(fig.attrs.alt).toBe("Descrição detalhada do exame");
  });
});

describe("M11b imagens - Leitor do aluno", () => {
  it("renderiza imagens com alt, numera figuras com legenda, classe dr-figura--quadrado, zoom e fechamento", async () => {
    const docTresFiguras = {
      type: "doc",
      content: [
        {
          type: "figura",
          attrs: {
            asset: UUID_1,
            alt: "Primeira imagem alt",
            legenda: "Aspecto tomográfico",
            disposicao: "quadrado-esquerda",
          },
        },
        {
          type: "figura",
          attrs: {
            asset: UUID_2,
            alt: "Segunda imagem alt sem legenda",
          },
        },
        {
          type: "figura",
          attrs: {
            asset: UUID_3,
            alt: "Terceira imagem alt",
            legenda: "Corte sagital",
          },
        },
      ],
    };

    render(
      <ContextoFiguras.Provider value={{ carregar: async () => DATA_PNG }}>
        <div data-figuras-raiz>
          <LeitorDoc doc={docTresFiguras} />
        </div>
      </ContextoFiguras.Provider>
    );

    // Imagens com alt correto
    const img1 = await screen.findByAltText("Primeira imagem alt");
    const img2 = await screen.findByAltText("Segunda imagem alt sem legenda");
    const img3 = await screen.findByAltText("Terceira imagem alt");
    expect(img1).toBeInTheDocument();
    expect(img2).toBeInTheDocument();
    expect(img3).toBeInTheDocument();

    // Nenhuma src contém 'http' ou 'doc-imagens'
    const todasImgs = [img1, img2, img3] as HTMLImageElement[];
    for (const img of todasImgs) {
      expect(img.src).not.toContain("http");
      expect(img.src).not.toContain("doc-imagens");
      expect(img.src).toContain("data:image/png;base64");
    }

    // Numeração correta (a sem legenda não numera)
    expect(screen.getByText("Figura 1 – Aspecto tomográfico")).toBeInTheDocument();
    expect(screen.getByText("Figura 2 – Corte sagital")).toBeInTheDocument();
    expect(screen.queryByText(/Figura 3/i)).not.toBeInTheDocument();

    // Figura com disposicao quadrado-esquerda tem classe dr-figura--quadrado
    const figure1 = img1.closest("figure");
    expect(figure1?.className).toContain("dr-figura--quadrado");

    // Zoom: clicar em 'Ampliar imagem' abre diálogo e 'Fechar' fecha
    const botoesZoom = screen.getAllByRole("button", { name: "Ampliar imagem" });
    fireEvent.click(botoesZoom[0]);

    const dialogo = screen.getByRole("dialog", { name: "Imagem ampliada" });
    expect(dialogo).toBeInTheDocument();

    const botaoFechar = screen.getByRole("button", { name: "Fechar" });
    fireEvent.click(botaoFechar);
    expect(screen.queryByRole("dialog", { name: "Imagem ampliada" })).not.toBeInTheDocument();
  });

  it("leitor sem carregar e sem sessão exibe 'Imagem indisponível'", async () => {
    const docSimples = {
      type: "doc",
      content: [
        {
          type: "figura",
          attrs: {
            asset: UUID_1,
            alt: "Teste sem sessão",
          },
        },
      ],
    };

    render(
      <div data-figuras-raiz>
        <LeitorDoc doc={docSimples} />
      </div>
    );

    const msgErro = await screen.findByText("Imagem indisponível");
    expect(msgErro).toBeInTheDocument();
  });

  it("módulos do leitor e fonte de imagens não importam @tiptap", () => {
    const p1 = path.resolve(__dirname, "../novo/app/editorPro/leitor/modulos/imagens.jsx");
    const p2 = path.resolve(__dirname, "../novo/app/editorPro/imagens/FiguraLeitor.jsx");
    const p3 = path.resolve(__dirname, "../novo/app/editorPro/imagens/fonteImagens.js");

    const t1 = fs.readFileSync(p1, "utf-8");
    const t2 = fs.readFileSync(p2, "utf-8");
    const t3 = fs.readFileSync(p3, "utf-8");

    expect(t1).not.toContain("@tiptap");
    expect(t2).not.toContain("@tiptap");
    expect(t3).not.toContain("@tiptap");
  });
});
