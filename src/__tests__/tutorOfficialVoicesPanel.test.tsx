import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OfficialVoicesPanel } from "../novo/app/admin/OfficialVoicesPanel.jsx";

const backend = { accessToken: async () => "admin-session-token" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));
vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({ StaziaVoiceOrb: () => <div data-testid="original-orb" />, orbEmotion: () => ({ emotion: "neutral", intensity: 0.2 }) }));
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ unlockAudio: () => null }));
const rows = ["tranquilo", "durona", "direto"].map((id) => ({ id, ready: true, configured: true, approved: false, fingerprint: `${id}-test-fingerprint` }));
let fetcher: ReturnType<typeof vi.fn>;
let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:official-voice"), revokeObjectURL: vi.fn() }));
  fetcher = vi.fn(async (url: string) => url.endsWith("/preview") ? new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } }) : new Response(JSON.stringify({ rows, releaseReady: false, pending: "Aguardando aprovação." })));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("painel de audição das três vozes", () => {
  it("mostra três testes e não permite aprovação/deploy automático", async () => {
    render(<OfficialVoicesPanel />);
    expect(await screen.findByRole("button", { name: "Testar voz Tranquilo" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Testar voz Durona" })).toBeEnabled());
    expect(screen.getAllByRole("button", { name: /Testar voz/ })).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent(/bloqueada.*Tranquilo.*Durona.*Direto/);
    expect(screen.queryByRole("button", { name: /aprovar|deploy|publicar/i })).toBeNull();
  });
  it("botões ficam desativados sem credenciais/IDs, sem voz simulada", async () => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ rows: rows.map((row) => ({ ...row, ready: false, configured: false })), pending: "ELEVENLABS_API_KEY não configurada no servidor." })));
    render(<OfficialVoicesPanel />);
    await screen.findByText("ELEVENLABS_API_KEY não configurada no servidor.");
    expect(screen.getAllByRole("button", { name: /Testar voz/ }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });
  it("envia só perfil e cenário ao servidor local e reutiliza a esfera original", async () => {
    render(<OfficialVoicesPanel endpoint="/api/nexus-lab/voices" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Testar voz Durona" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Cenário de audição"), { target: { value: "repeticao" } });
    fireEvent.click(screen.getByRole("button", { name: "Testar voz Durona" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    const [url, init] = fetcher.mock.calls.find(([url]) => String(url).endsWith("/preview")) as any;
    expect(url).toBe("/api/nexus-lab/voices/preview");
    expect(JSON.parse(init.body)).toEqual({ personality: "durona", scenario: "repeticao" });
    expect(init.headers.Authorization).toBe("Bearer admin-session-token");
    expect(screen.getByTestId("original-orb")).toBeInTheDocument();
    expect(screen.getByLabelText("Audição da voz oficial")).toHaveAttribute("src", "blob:official-voice");
  });
  it("exibe falha da API sem trocar silenciosamente por voz do aparelho", async () => {
    fetcher.mockImplementation(async (url: string) => url.endsWith("/preview") ? new Response(JSON.stringify({ error: "Créditos indisponíveis." }), { status: 502 }) : new Response(JSON.stringify({ rows })));
    render(<OfficialVoicesPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Testar voz Direto" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Testar voz Direto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Créditos indisponíveis.");
    expect(play).not.toHaveBeenCalled();
  });
  it("oferece player manual quando o navegador bloqueia o áudio", async () => {
    play.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<OfficialVoicesPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Testar voz Tranquilo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Testar voz Tranquilo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reprodução automática");
    expect(screen.getByLabelText("Audição da voz oficial")).toHaveAttribute("controls");
  });
});
