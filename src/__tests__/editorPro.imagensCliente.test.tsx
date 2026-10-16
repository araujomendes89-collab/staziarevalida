import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  enviarImagem,
  linksEquipe,
  carregarImagemAluno,
} from "../novo/app/editorPro/imagens/api.js";
import { GaleriaImagens } from "../novo/app/editorPro/imagens/GaleriaImagens.jsx";

describe("Cliente de Imagens do Editor Profissional", () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
  });

  it("enviarImagem envia cabeçalhos corretos e codificados", async () => {
    const backend = {
      accessToken: vi.fn().mockResolvedValue("token-secreto-123"),
    };

    let fetchUrl = "";
    let fetchHeaders: Record<string, string> = {};
    let fetchBody: any = null;

    global.fetch = vi.fn(async (url, opts: any) => {
      fetchUrl = String(url);
      fetchHeaders = opts.headers;
      fetchBody = opts.body;
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          imagem: {
            id: "11111111-1111-1111-1111-111111111111",
            sha256: "aabbcc",
            alt_text: "Legenda com espaço",
          },
        }),
      } as any;
    });

    const file = new File([new Uint8Array([1, 2, 3])], "foto teste.png", {
      type: "image/png",
    });

    const img = await enviarImagem(backend, file, {
      unidade: "22222222-2222-2222-2222-222222222222",
      aula: "33333333-3333-3333-3333-333333333333",
      alt: "Legenda com espaço",
      nome: "foto teste.png",
    });

    expect(fetchUrl).toContain("/api/content-hub/doc-imagens?");
    expect(fetchUrl).toContain("unidade=22222222-2222-2222-2222-222222222222");
    expect(fetchUrl).toContain("aula=33333333-3333-3333-3333-333333333333");
    expect(fetchHeaders["Authorization"]).toBe("Bearer token-secreto-123");
    expect(fetchHeaders["Content-Type"]).toBe("image/png");
    expect(fetchHeaders["X-File-Name"]).toBe(encodeURIComponent("foto teste.png"));
    expect(fetchHeaders["X-Texto-Alternativo"]).toBe(encodeURIComponent("Legenda com espaço"));
    expect(fetchBody).toBe(file);
    expect(img.id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("linksEquipe usa url assinada e cai para blob de /arquivo quando nula", async () => {
    const backend = {
      accessToken: vi.fn().mockResolvedValue("tok-456"),
    };

    URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/arquivo-blob-id");

    global.fetch = vi.fn(async (url, opts: any) => {
      const u = String(url);
      if (u.endsWith("/links")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            links: {
              "id-com-link": "https://storage.supabase.com/signed/img.png?token=xyz",
              "id-sem-link": null,
            },
            expira_em_segundos: 300,
          }),
        } as any;
      }
      if (u.includes("/id-sem-link/arquivo")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/png" }),
          blob: async () => new Blob(["bytes-imagem"], { type: "image/png" }),
        } as any;
      }
      throw new Error(`Rota não mapeada: ${u}`);
    });

    const res = await linksEquipe(backend, ["id-com-link", "id-sem-link"]);
    expect(res["id-com-link"]).toBe("https://storage.supabase.com/signed/img.png?token=xyz");
    expect(res["id-sem-link"]).toBe("blob:http://localhost/arquivo-blob-id");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("carregarImagemAluno reaproveita a memória e não guarda erro", async () => {
    const backend = {
      accessToken: vi.fn().mockResolvedValue("tok-aluno"),
    };

    URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/aluno-blob");

    let count = 0;
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      count++;
      if (u.includes("id-com-falha")) {
        return {
          ok: false,
          status: 404,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ error: "Imagem indisponível." }),
        } as any;
      }
      return {
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        blob: async () => new Blob(["png"]),
      } as any;
    });

    // 1. Duas chamadas para o mesmo ID devem resultar em apenas 1 requisição fetch
    const p1 = carregarImagemAluno(backend, "id-sucesso");
    const p2 = carregarImagemAluno(backend, "id-sucesso");
    const [src1, src2] = await Promise.all([p1, p2]);
    expect(src1).toBe("blob:http://localhost/aluno-blob");
    expect(src2).toBe("blob:http://localhost/aluno-blob");
    expect(count).toBe(1);

    // 2. Chamada com falha rejeita e não deixa resíduo na memória
    await expect(carregarImagemAluno(backend, "id-com-falha")).rejects.toThrow("Imagem indisponível.");

    // Próxima chamada para o ID que falhou deve tentar fazer novo fetch
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      blob: async () => new Blob(["png"]),
    })) as any;

    const srcRecuperado = await carregarImagemAluno(backend, "id-com-falha");
    expect(srcRecuperado).toBe("blob:http://localhost/aluno-blob");
  });

  it("GaleriaImagens exibe miniaturas, aviso de falta de alt, busca e seleção", async () => {
    const backend = {
      accessToken: vi.fn().mockResolvedValue("tok-staff"),
    };

    const mockImagens = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        width: 800,
        height: 600,
        bytes: 25600,
        version: 1,
        alt_text: "Raio-X de tórax",
        enviada_por: "medico@staziamed.com",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        width: 400,
        height: 300,
        bytes: 12800,
        version: 2,
        alt_text: "",
        enviada_por: "admin@staziamed.com",
      },
    ];

    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/links")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            links: {
              "11111111-1111-1111-1111-111111111111": "https://img1.preview",
              "22222222-2222-2222-2222-222222222222": "https://img2.preview",
            },
          }),
        } as any;
      }

      if (u.includes("busca=pulmao")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            itens: [mockImagens[0]],
            total: 1,
          }),
        } as any;
      }

      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          itens: mockImagens,
          total: 2,
        }),
      } as any;
    });

    const onEscolher = vi.fn();

    render(
      <GaleriaImagens
        backend={backend}
        unidade="unit-1"
        aula="lesson-1"
        onEscolher={onEscolher}
      />
    );

    // Carregando inicial
    expect(screen.getByText("Carregando…")).toBeInTheDocument();

    // Espera os dados carregarem
    await waitFor(() => {
      expect(screen.getByText("800 × 600 px")).toBeInTheDocument();
    });

    expect(screen.getByText("400 × 300 px")).toBeInTheDocument();
    expect(screen.getByText("Falta texto alternativo")).toBeInTheDocument();

    // Testa a busca
    const inputBusca = screen.getByPlaceholderText(/buscar/i);
    fireEvent.change(inputBusca, { target: { value: "pulmao" } });

    await waitFor(() => {
      expect(screen.queryByText("400 × 300 px")).not.toBeInTheDocument();
      expect(screen.getByText("800 × 600 px")).toBeInTheDocument();
    });

    // Clica em Inserir
    const botaoInserir = screen.getByRole("button", { name: "Inserir" });
    fireEvent.click(botaoInserir);
    expect(onEscolher).toHaveBeenCalledWith(mockImagens[0]);
  });
});
