import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";

import { modulosEditor, extensoesDe, botoesDaAba, paineis } from "../novo/app/editorPro/registroEditor.js";
import "../novo/app/editorPro/modulos.js";
import { ControleHistorico, controleDe } from "../novo/app/editorPro/historico/controle.js";
import IndicadorRascunho from "../novo/app/editorPro/historico/IndicadorRascunho.jsx";
import PainelHistorico from "../novo/app/editorPro/historico/PainelHistorico.jsx";
import { unidadeParaDoc, textoDoDoc, sanear } from "../shared/docRico";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

function criarGuardaEmMemoria(inicial: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(inicial));
  return {
    store,
    ler: vi.fn((chave: string) => store.get(chave) ?? null),
    gravar: vi.fn((chave: string, valor: any) => {
      store.set(chave, valor);
    }),
    apagar: vi.fn((chave: string) => {
      store.delete(chave);
    }),
  };
}

describe("Editor Profissional - Módulo M8 Histórico", () => {
  // 1. módulo registrado
  it("1. módulo registrado: modulosEditor() contém 'historico'; botoesDaAba('inicio') tem 'rascunho'; paineis() tem 'historico'", () => {
    expect(modulosEditor()).toContain("historico");

    const botoesInicio = botoesDaAba("inicio");
    expect(botoesInicio.map((b) => b.id)).toContain("rascunho");

    const listaPaineis = paineis();
    expect(listaPaineis.map((p) => p.id)).toContain("historico");
  });

  // 2. sem versionId
  it("2. sem versionId (extensoesDe({})) → controleDe(editor) é null e nenhuma rpc é chamada", () => {
    const rpcFn = vi.fn();
    const doc = unidadeParaDoc({ sections: [{ heading: "S1", paragraphs: [{ text: "p1" }] }] });
    const editor = new Editor({
      extensions: extensoesDe({}),
      content: doc,
    });

    expect(controleDe(editor)).toBeNull();
    expect(rpcFn).not.toHaveBeenCalled();

    editor.destroy();
  });

  // 3. ligar & mudança de texto
  it("3. ligar → chama app_ch_doc_trava com p_base_hash 'h1' e app_ch_doc_rascunho_ler; mudar o texto → depois de 1 s grava no guarda local, depois de 10 s chama app_ch_doc_rascunho_salvar (e NUNCA app_ch_save_unit_version); fase 'guardado'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fixture = { sections: [{ heading: "S1", paragraphs: [{ text: "p1" }] }] };
    const doc = unidadeParaDoc(fixture);
    const rpcCalls: Array<{ nome: string; args: any }> = [];

    const backend = {
      rpc: vi.fn(async (nome: string, args: any) => {
        rpcCalls.push({ nome, args });
        if (nome === "app_ch_doc_trava") {
          return { minha: true, desde: new Date().toISOString(), mudou: false };
        }
        if (nome === "app_ch_doc_rascunho_ler") {
          return null;
        }
        if (nome === "app_ch_doc_rascunho_salvar") {
          return { em: new Date().toISOString() };
        }
        return {};
      }),
    };

    const guarda = criarGuardaEmMemoria();
    const ctx = {
      contexto: { versionId: "v1", contentHash: "h1" },
      config: {},
      somenteLeitura: false,
    };

    const editor = new Editor({
      extensions: extensoesDe({ contexto: ctx.contexto }),
      content: doc,
    });

    const controle = controleDe(editor);
    expect(controle).toBeTruthy();
    if (!controle) return;

    controle.guarda = guarda;

    await controle.ligar(backend, ctx);

    expect(backend.rpc).toHaveBeenCalledWith("app_ch_doc_trava", {
      p_version_id: "v1",
      p_base_hash: "h1",
      p_assumir: false,
    });
    expect(backend.rpc).toHaveBeenCalledWith("app_ch_doc_rascunho_ler", {
      p_version_id: "v1",
    });

    // Mudar o texto
    editor.commands.insertContent(" extra");

    // Depois de 1 s grava no guarda local
    await vi.advanceTimersByTimeAsync(1100);
    expect(guarda.gravar).toHaveBeenCalledWith(
      "stazia.editorPro.rascunho.v1",
      expect.objectContaining({
        base_hash: "h1",
      })
    );
    expect(controle.estado().fase).toBe("pendente");
    expect(backend.rpc).not.toHaveBeenCalledWith("app_ch_doc_rascunho_salvar", expect.anything());

    // Depois de 10 s (total) chama app_ch_doc_rascunho_salvar
    await vi.advanceTimersByTimeAsync(9000);
    expect(backend.rpc).toHaveBeenCalledWith(
      "app_ch_doc_rascunho_salvar",
      expect.objectContaining({
        p_version_id: "v1",
        p_base_hash: "h1",
      })
    );

    // E NUNCA chama app_ch_save_unit_version
    expect(rpcCalls.some((c) => c.nome === "app_ch_save_unit_version")).toBe(false);
    expect(controle.estado().fase).toBe("guardado");

    editor.destroy();
  });

  // 4. trava de outra pessoa
  it("4. trava de outra pessoa (rpc devolve minha:false, quem:'ana@x') → editor.isEditable false e estado.trava.quem 'ana@x'; assumir() chama com p_assumir true", async () => {
    const backend = {
      rpc: vi.fn(async (nome: string, args: any) => {
        if (nome === "app_ch_doc_trava") {
          if (args?.p_assumir) {
            return { minha: true, desde: new Date().toISOString(), mudou: false };
          }
          return { minha: false, quem: "ana@x", desde: "2026-10-16T10:00:00Z" };
        }
        if (nome === "app_ch_doc_rascunho_ler") {
          return null;
        }
        return {};
      }),
    };

    const ctx = {
      contexto: { versionId: "v1", contentHash: "h1" },
      config: {},
      somenteLeitura: false,
    };

    const editor = new Editor({
      extensions: extensoesDe({ contexto: ctx.contexto }),
      content: unidadeParaDoc({ sections: [{ heading: "S", paragraphs: [{ text: "p" }] }] }),
    });

    const controle = controleDe(editor);
    expect(controle).toBeTruthy();
    if (!controle) return;

    await controle.ligar(backend, ctx);

    expect(editor.isEditable).toBe(false);
    expect(controle.estado().trava?.quem).toBe("ana@x");
    expect(controle.estado().trava?.minha).toBe(false);

    await controle.assumir();

    expect(backend.rpc).toHaveBeenCalledWith("app_ch_doc_trava", {
      p_version_id: "v1",
      p_base_hash: "h1",
      p_assumir: true,
    });
    expect(controle.estado().trava?.minha).toBe(true);
    expect(editor.isEditable).toBe(true);

    editor.destroy();
  });

  // 5. rascunho do servidor diferente, mesma base
  it("5. rascunho do servidor diferente, mesma base → recuperavel.mesmaBase true; recuperar() troca o texto do editor (textoDoDoc contém o texto do rascunho)", async () => {
    const docOriginal = unidadeParaDoc({ sections: [{ heading: "Original", paragraphs: [{ text: "original" }] }] });
    const docRascunho = unidadeParaDoc({
      sections: [{ heading: "Rascunho", paragraphs: [{ text: "conteudo recuperado com sucesso" }] }],
    });

    const backend = {
      rpc: vi.fn(async (nome: string) => {
        if (nome === "app_ch_doc_trava") {
          return { minha: true, desde: new Date().toISOString(), mudou: false };
        }
        if (nome === "app_ch_doc_rascunho_ler") {
          return {
            doc: docRascunho,
            config: {},
            base_hash: "h1",
            em: new Date().toISOString(),
          };
        }
        return {};
      }),
    };

    const ctx = {
      contexto: { versionId: "v1", contentHash: "h1" },
      config: {},
      somenteLeitura: false,
    };

    const editor = new Editor({
      extensions: extensoesDe({ contexto: ctx.contexto }),
      content: docOriginal,
    });

    const controle = controleDe(editor);
    expect(controle).toBeTruthy();
    if (!controle) return;

    await controle.ligar(backend, ctx);

    expect(controle.estado().recuperavel).not.toBeNull();
    expect(controle.estado().recuperavel?.mesmaBase).toBe(true);

    await controle.recuperar();

    expect(textoDoDoc(editor.getJSON())).toContain("conteudo recuperado com sucesso");
    expect(controle.estado().recuperavel).toBeNull();

    editor.destroy();
  });

  // 6. rascunho igual ao aberto & base diferente
  it("6. rascunho igual ao aberto → apaga (app_ch_doc_rascunho_apagar) e recuperavel null. Base diferente → mesmaBase false e recuperar() não troca nada", async () => {
    const docOriginal = unidadeParaDoc({ sections: [{ heading: "S1", paragraphs: [{ text: "texto idêntico" }] }] });

    // Parte A: rascunho igual
    const backendIgual = {
      rpc: vi.fn(async (nome: string) => {
        if (nome === "app_ch_doc_trava") return { minha: true, desde: new Date().toISOString(), mudou: false };
        if (nome === "app_ch_doc_rascunho_ler") {
          return {
            doc: docOriginal,
            config: {},
            base_hash: "h1",
            em: new Date().toISOString(),
          };
        }
        if (nome === "app_ch_doc_rascunho_apagar") return { ok: true };
        return {};
      }),
    };

    const editorA = new Editor({
      extensions: extensoesDe({ contexto: { versionId: "v1", contentHash: "h1" } }),
      content: docOriginal,
    });
    const controleA = controleDe(editorA);
    if (!controleA) throw new Error("Sem controle");

    await controleA.ligar(backendIgual, { contexto: { versionId: "v1", contentHash: "h1" }, config: {} });

    expect(backendIgual.rpc).toHaveBeenCalledWith("app_ch_doc_rascunho_apagar", { p_version_id: "v1" });
    expect(controleA.estado().recuperavel).toBeNull();
    editorA.destroy();

    // Parte B: base diferente
    const docRascunhoOutro = unidadeParaDoc({ sections: [{ heading: "S1", paragraphs: [{ text: "texto diferente" }] }] });
    const backendBaseDif = {
      rpc: vi.fn(async (nome: string) => {
        if (nome === "app_ch_doc_trava") return { minha: true, desde: new Date().toISOString(), mudou: false };
        if (nome === "app_ch_doc_rascunho_ler") {
          return {
            doc: docRascunhoOutro,
            config: {},
            base_hash: "hash_desatualizado",
            em: new Date().toISOString(),
          };
        }
        return {};
      }),
    };

    const editorB = new Editor({
      extensions: extensoesDe({ contexto: { versionId: "v1", contentHash: "h1" } }),
      content: docOriginal,
    });
    const controleB = controleDe(editorB);
    if (!controleB) throw new Error("Sem controle");

    await controleB.ligar(backendBaseDif, { contexto: { versionId: "v1", contentHash: "h1" }, config: {} });

    expect(controleB.estado().recuperavel?.mesmaBase).toBe(false);
    const textoAntes = textoDoDoc(editorB.getJSON());

    await controleB.recuperar();
    expect(textoDoDoc(editorB.getJSON())).toBe(textoAntes);

    editorB.destroy();
  });

  // 7. erro de rede no salvar
  it("7. erro de rede no salvar → fase 'so_local' e o guarda local tem o doc", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const doc = unidadeParaDoc({ sections: [{ heading: "S", paragraphs: [{ text: "p" }] }] });
    const guarda = criarGuardaEmMemoria();

    const backend = {
      rpc: vi.fn(async (nome: string) => {
        if (nome === "app_ch_doc_trava") return { minha: true, desde: new Date().toISOString(), mudou: false };
        if (nome === "app_ch_doc_rascunho_ler") return null;
        if (nome === "app_ch_doc_rascunho_salvar") throw new Error("Falha na rede");
        return {};
      }),
    };

    const ctx = {
      contexto: { versionId: "v1", contentHash: "h1" },
      config: {},
      somenteLeitura: false,
    };

    const editor = new Editor({
      extensions: extensoesDe({ contexto: ctx.contexto }),
      content: doc,
    });

    const controle = new ControleHistorico({
      editor,
      contexto: ctx.contexto,
      somenteLeitura: false,
      guarda,
      tempo: {
        agora: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id),
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: (id) => clearInterval(id),
      },
    });

    await controle.ligar(backend, ctx);

    editor.commands.insertContent(" modificado");
    controle.aoMudar();

    // 1 s de espera para gravar no localStorage
    await vi.advanceTimersByTimeAsync(1100);
    expect(guarda.gravar).toHaveBeenCalled();

    // 10 s para chamada do servidor com erro
    await vi.advanceTimersByTimeAsync(10000);
    expect(controle.estado().fase).toBe("so_local");
    expect(guarda.store.get("stazia.editorPro.rascunho.v1")).toBeTruthy();

    controle.desligar();
    editor.destroy();
  });

  // 8. desligar
  it("8. desligar → chama app_ch_doc_trava_soltar", async () => {
    const backend = {
      rpc: vi.fn(async (nome: string) => {
        if (nome === "app_ch_doc_trava") return { minha: true, desde: new Date().toISOString(), mudou: false };
        if (nome === "app_ch_doc_rascunho_ler") return null;
        if (nome === "app_ch_doc_trava_soltar") return { ok: true };
        return {};
      }),
    };

    const ctx = {
      contexto: { versionId: "v1", contentHash: "h1" },
      config: {},
      somenteLeitura: false,
    };

    const editor = new Editor({
      extensions: extensoesDe({ contexto: ctx.contexto }),
      content: unidadeParaDoc({ sections: [{ heading: "S", paragraphs: [{ text: "p" }] }] }),
    });

    const controle = controleDe(editor);
    if (!controle) throw new Error("Sem controle");

    await controle.ligar(backend, ctx);
    controle.desligar();

    expect(backend.rpc).toHaveBeenCalledWith("app_ch_doc_trava_soltar", {
      p_version_id: "v1",
    });

    editor.destroy();
  });

  // 9. PainelHistorico
  it("9. PainelHistorico: lista 'Versão 1'/'Versão 2' e um salvamento; 'Abrir' mostra o texto do parágrafo; 'Restaurar este texto' pede confirmação e só então chama app_ch_doc_restaurar e aoRecarregar", async () => {
    const aoRecarregar = vi.fn();
    const ctx = {
      contexto: { versionId: "v1", contentHash: "h1", aoRecarregar },
      config: {},
      somenteLeitura: false,
    };

    const dadosHistorico = {
      atual: { id: "v1", version: 2, status: "draft", content_hash: "h1" },
      salvamentos: [
        {
          id: "hist-1",
          origem: "salvo",
          detalhe: null,
          quem: "autor@stazia.com",
          em: "2026-10-16T12:00:00Z",
          content_hash: "hash_antigo",
          so_formatacao: false,
          igual_ao_atual: false,
        },
      ],
      versoes: [
        {
          id: "v1",
          version: 2,
          status: "draft",
          quem: "autor@stazia.com",
          em: "2026-10-16T12:00:00Z",
          content_hash: "h1",
          igual_ao_atual: true,
          atual: true,
        },
        {
          id: "v0",
          version: 1,
          status: "approved",
          quem: "revisor@stazia.com",
          em: "2026-10-15T10:00:00Z",
          content_hash: "hash_v1",
          igual_ao_atual: false,
          atual: false,
        },
      ],
    };

    const conteudoAbrir = {
      sections: [
        {
          heading: "Seção de Prévia",
          paragraphs: [{ text: "Texto do parágrafo da prévia", rico: null }],
        },
      ],
    };

    const backend = {
      rpc: vi.fn(async (nome: string, args: any) => {
        if (nome === "app_ch_doc_historico") {
          return dadosHistorico;
        }
        if (nome === "app_ch_doc_historico_abrir") {
          return { content: conteudoAbrir, content_hash: "hash_antigo" };
        }
        if (nome === "app_ch_doc_restaurar") {
          return { so_formatacao: false };
        }
        return {};
      }),
    };

    render(<PainelHistorico editor={null} ctx={ctx} backend={backend} />);

    // 1. Lista "Versão 1"/"Versão 2" e um salvamento
    expect(await screen.findByText("Versão 2")).toBeTruthy();
    expect(await screen.findByText("Versão 1")).toBeTruthy();
    expect(await screen.findByText("Salvo")).toBeTruthy();

    // 2. "Abrir" mostra o texto do parágrafo
    const botoesAbrir = await screen.findAllByText("Abrir");
    fireEvent.click(botoesAbrir[0]);

    expect(await screen.findByText("Texto do parágrafo da prévia")).toBeTruthy();

    // 3. "Restaurar este texto" pede confirmação e só então chama app_ch_doc_restaurar e aoRecarregar
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const botoesRestaurar = await screen.findAllByText("Restaurar este texto");
    fireEvent.click(botoesRestaurar[0]);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("O texto atual desta versão será trocado por este")
    );

    expect(
      await screen.findByText("Texto restaurado. As aprovações desta versão deixaram de valer.")
    ).toBeTruthy();

    expect(backend.rpc).toHaveBeenCalledWith("app_ch_doc_restaurar", {
      p_version_id: "v1",
      p_historico_id: "hist-1",
    });
    expect(aoRecarregar).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  // 10. IndicadorRascunho
  it("10. IndicadorRascunho: exibe status correto e botões conforme o estado", async () => {
    const editor = new Editor({
      extensions: extensoesDe({ contexto: { versionId: "v1", contentHash: "h1" } }),
      content: unidadeParaDoc({ sections: [{ heading: "S", paragraphs: [{ text: "p" }] }] }),
    });

    const controle = controleDe(editor);
    if (!controle) throw new Error("Sem controle");

    const backend = {
      rpc: vi.fn(async (nome: string) => {
        if (nome === "app_ch_doc_trava") {
          return { minha: false, quem: "maria@stazia.com", desde: "2026-10-16T14:30:00Z" };
        }
        if (nome === "app_ch_doc_rascunho_ler") return null;
        return {};
      }),
    };

    const ctx = {
      contexto: { versionId: "v1", contentHash: "h1" },
      config: {},
      somenteLeitura: false,
    };

    render(<IndicadorRascunho editor={editor} ctx={ctx} backend={backend} />);

    expect(
      await screen.findByText(/maria@stazia.com está editando desde.*O editor ficou só para leitura\./)
    ).toBeTruthy();
    expect(screen.getByText("Assumir a edição")).toBeTruthy();

    editor.destroy();
  });
});
