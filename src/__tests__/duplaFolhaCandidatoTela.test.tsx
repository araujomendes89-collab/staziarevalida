/**
 * Administração › Estações · folha do candidato em imagem (jsdom, banco e servidor simulados): situação, bloqueio,
 * pré-visualização com o modelo (sem nome nem tema), gerar/regerar e o aviso quando o servidor não tem o gerador.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));

import { FolhaCandidato } from "../novo/app/admin/FolhaCandidato.jsx";

const FONTE = {
  numero: 1, area: "Clínica Médica", duracao_ms: 600000, cenario: "Cenário de teste.", tarefas: "1. receber o paciente;",
  impressos: [{ nome: "Relato do caso clínico", texto: "Homem, 30 anos." }], bloqueio: null,
};
const sit = (o: Record<string, unknown> = {}) => ({ estado: "nenhuma", imagem_valendo: false, tem_imagem: false, bloqueio: null, com_relato: true, gerada_em: null, pedida_em: null, modelo: null, erro: null, ...o });
let situacao: any = sit();
const fetchMock = vi.fn();

beforeEach(() => {
  situacao = sit();
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_admin_dupla_folha") return { fonte: FONTE, hash: "h", situacao };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("folha do candidato na aba Estações", () => {
  it("sem folha: selo, botão Gerar folha e pré-visualização com o modelo (sem nome nem tema)", async () => {
    const onSituacao = vi.fn();
    render(<FolhaCandidato stationId="teste-inep2020-e01" onSituacao={onSituacao} />);
    expect(await screen.findByText("Sem folha em imagem")).toBeTruthy();
    expect(screen.getByText("Com o relato do caso")).toBeTruthy();
    expect(onSituacao).toHaveBeenCalledWith(situacao);
    fireEvent.click(screen.getByRole("button", { name: /Pré-visualizar/ }));
    const quadro = screen.getByTitle("Pré-visualização da folha do candidato") as HTMLIFrameElement;
    const html = quadro.getAttribute("srcdoc") ?? "";
    expect(html).toContain("ESTAÇÃO 1");
    expect(html).toContain("RELATO DO CASO CLÍNICO");
    expect(html).toContain("/novo-assets/logo-staziamed-revalida-v2.png");
    expect(quadro.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(screen.getByRole("button", { name: "Gerar folha" })).toBeTruthy();
  });

  it("gerar sem o gerador no servidor: mostra o aviso e a situação 'pedida'", async () => {
    fetchMock.mockImplementation(async () => {
      situacao = sit({ estado: "pedida" });
      return new Response(JSON.stringify({ gerada: false, aviso: "Pedido registrado. Processamento na próxima rodada.", situacao }), { status: 202, headers: { "content-type": "application/json" } });
    });
    render(<FolhaCandidato stationId="teste-inep2020-e01" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gerar folha" }));
    expect(await screen.findByText("Pedido registrado. Processamento na próxima rodada.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/dupla/folhas/teste-inep2020-e01/gerar", { method: "POST", headers: { Authorization: "Bearer tok" } });
    await waitFor(() => expect(screen.getByText("Folha pedida: aguardando o gerador")).toBeTruthy());
  });

  it("desatualizada pede para gerar de novo; bloqueio desliga o botão; erro do servidor aparece", async () => {
    situacao = sit({ estado: "desatualizada", tem_imagem: true });
    const { unmount } = render(<FolhaCandidato stationId="x" />);
    expect(await screen.findByText(/O conteúdo da estação mudou depois desta imagem/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gerar de novo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver imagem gerada/ })).toBeTruthy();
    unmount();
    situacao = sit({ bloqueio: "A estação tem impresso visível desde o início que não é o relato do caso." });
    render(<FolhaCandidato stationId="y" />);
    expect(await screen.findByText(/não é o relato do caso/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Gerar folha" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
