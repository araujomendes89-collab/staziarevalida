/**
 * Painel "Vozes do Nexus" (administração): uma linha por voz, um botão por cenário dela (marcado quando já ouvido nesta
 * versão), "Aprovar esta voz" só com todos os cenários ouvidos e para quem está na lista de aprovação, e "Revogar" para a voz
 * aprovada. O navegador manda só professor e cenário; a versão da voz nunca sai daqui.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OfficialVoicesPanel } from "../novo/app/admin/OfficialVoicesPanel.jsx";
import { VOICE_SCENARIOS, scenariosFor } from "../shared/tutor/officialVoices";

const backend = { accessToken: async () => "admin-session-token" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));
vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({ StaziaVoiceOrb: () => <div data-testid="original-orb" />, orbEmotion: () => ({ emotion: "neutral", intensity: 0.2 }) }));
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ unlockAudio: () => null }));

const LABEL = { tranquilo: "Tranquilo", durona: "Durona", direto: "Direto" } as const;
type Id = keyof typeof LABEL;
const row = (id: Id, over: Record<string, unknown> = {}, heard: boolean | string[] = false) => ({
  id, label: LABEL[id], configured: true, unique: true, ready: true, approved: false, approved_at: null, fingerprint: `${id}-versao`, pending: null, can_approve: false,
  scenarios: scenariosFor(id).map((s) => ({ id: s, label: VOICE_SCENARIOS[s].label, heard: Array.isArray(heard) ? heard.includes(s) : heard })),
  ...over,
});
const panel = (rows: ReturnType<typeof row>[], approver = true) => ({ model: "eleven_v3", keyConfigured: true, pending: null, approver, rows });
let current: ReturnType<typeof panel>;
let fetcher: ReturnType<typeof vi.fn>;
let play: ReturnType<typeof vi.spyOn>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const calls = (suffix: string) => fetcher.mock.calls.filter(([url]) => String(url).endsWith(suffix));

beforeEach(() => {
  current = panel([row("tranquilo"), row("durona"), row("direto")]);
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:voz-do-nexus"), revokeObjectURL: vi.fn() }));
  fetcher = vi.fn(async (url: string) => (String(url).endsWith("/preview") ? new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } }) : json(current)));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const rowOf = async (label: string) => (await screen.findByRole("group", { name: `Voz ${label}` }));

describe("Vozes do Nexus", () => {
  it("lista as três vozes com os cenários de cada uma; tocar um cenário manda só personalidade e cenário", async () => {
    render(<OfficialVoicesPanel />);
    expect(await screen.findByRole("heading", { name: "Vozes do Nexus" })).toBeInTheDocument();
    for (const id of ["tranquilo", "durona", "direto"] as Id[]) {
      const r = await rowOf(LABEL[id]);
      expect(within(r).getAllByRole("button", { name: new RegExp(`^Ouvir ${LABEL[id]}:`) })).toHaveLength(scenariosFor(id).length);
    }
    expect(screen.getByRole("button", { name: "Ouvir Durona: Alívio com palavrão" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ouvir Direto: Alívio com palavrão" })).toBeNull();
    expect(screen.queryByText(/três vozes/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir Durona: Erro repetido" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    const [url, init] = calls("/preview")[0] as any;
    expect(url).toBe("/api/tutor/voices/preview");
    expect(JSON.parse(init.body)).toEqual({ personality: "durona", scenario: "repeticao" });
    expect(init.headers.Authorization).toBe("Bearer admin-session-token");
    expect(screen.getByTestId("original-orb")).toBeInTheDocument();
    expect(screen.getByLabelText("Audição da voz oficial")).toHaveAttribute("src", "blob:voz-do-nexus");
    // depois da audição o painel relê o que já foi ouvido
    await waitFor(() => expect(calls("/api/tutor/voices").length).toBe(2));
  });

  it("'Aprovar esta voz' só ativo com todos os cenários ouvidos nesta versão e para quem aprova; depois aparece 'Revogar'", async () => {
    current = panel([row("tranquilo", {}, ["apresentacao", "erro"]), row("durona", { can_approve: true }, true), row("direto")]);
    render(<OfficialVoicesPanel />);
    const durona = await rowOf("Durona");
    expect(within(durona).getByRole("button", { name: "Ouvir Durona: Alívio com palavrão" })).toHaveAttribute("aria-pressed", "true");
    const tranquilo = await rowOf("Tranquilo");
    expect(within(tranquilo).getByRole("button", { name: "Ouvir Tranquilo: Apresentação" })).toHaveAttribute("aria-pressed", "true");
    expect(within(tranquilo).getByRole("button", { name: "Ouvir Tranquilo: Erro repetido" })).toHaveAttribute("aria-pressed", "false");
    expect(within(tranquilo).getByRole("button", { name: "Aprovar esta voz: Tranquilo" })).toBeDisabled();
    const approved = panel([row("tranquilo"), row("durona", { approved: true, approved_at: "2026-10-08T15:00:00Z" }, true), row("direto")]);
    fetcher.mockImplementationOnce(async () => json(approved));
    fireEvent.click(within(durona).getByRole("button", { name: "Aprovar esta voz: Durona" }));
    await waitFor(() => expect(calls("/approve")).toHaveLength(1));
    expect(JSON.parse((calls("/approve")[0] as any)[1].body)).toEqual({ personality: "durona" });
    expect(await within(await rowOf("Durona")).findByRole("button", { name: "Revogar: Durona" })).toBeInTheDocument();
    expect(within(await rowOf("Durona")).getByText("Aprovada")).toBeInTheDocument();
    expect(within(await rowOf("Durona")).queryByRole("button", { name: /Aprovar esta voz/ })).toBeNull();
  });

  it("quem não está na lista de aprovação ouve, mas não aprova nem revoga", async () => {
    current = panel([row("tranquilo"), row("durona", { approved: true }), row("direto", { can_approve: false }, true)], false);
    render(<OfficialVoicesPanel />);
    expect(within(await rowOf("Direto")).getByRole("button", { name: "Aprovar esta voz: Direto" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Revogar/ })).toBeNull();
    expect(screen.getByText(/Só quem está na lista de aprovação do servidor aprova ou revoga/)).toBeInTheDocument();
    expect(within(await rowOf("Direto")).getByRole("button", { name: "Ouvir Direto: Apresentação" })).toBeEnabled();
  });

  it("revogar uma voz muda só aquela linha", async () => {
    current = panel([row("tranquilo"), row("durona", { approved: true }, true), row("direto", { approved: true }, true)]);
    render(<OfficialVoicesPanel />);
    const durona = await rowOf("Durona");
    fetcher.mockImplementationOnce(async () => json(panel([row("tranquilo"), row("durona", {}, true), row("direto", { approved: true }, true)])));
    fireEvent.click(within(durona).getByRole("button", { name: "Revogar: Durona" }));
    await waitFor(() => expect(calls("/revoke")).toHaveLength(1));
    expect(JSON.parse((calls("/revoke")[0] as any)[1].body)).toEqual({ personality: "durona" });
    expect(await within(await rowOf("Durona")).findByText("Aguardando audição e aprovação")).toBeInTheDocument();
    expect(within(await rowOf("Direto")).getByText("Aprovada")).toBeInTheDocument();
  });

  it("sem chave ou sem voice_id: cenários desativados e o motivo à vista, sem voz simulada", async () => {
    current = { ...panel([row("tranquilo", { ready: false, configured: false, pending: "Configure ELEVENLABS_VOICE_TRANQUILO com o voice_id salvo." }), row("durona", { ready: false }), row("direto", { ready: false })]), pending: "ELEVENLABS_API_KEY não configurada no servidor." };
    render(<OfficialVoicesPanel />);
    expect(await screen.findByText("ELEVENLABS_API_KEY não configurada no servidor.")).toBeInTheDocument();
    expect(within(await rowOf("Tranquilo")).getByText("Voice ID pendente")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Ouvir / }).every((b) => b.hasAttribute("disabled"))).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it("falha da audição aparece como erro; navegador que bloqueia o som deixa o player manual", async () => {
    fetcher.mockImplementation(async (url: string) => (String(url).endsWith("/preview") ? json({ error: "Créditos indisponíveis." }, 502) : json(current)));
    render(<OfficialVoicesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Ouvir Direto: Apresentação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Créditos indisponíveis.");
    expect(play).not.toHaveBeenCalled();
    cleanup();
    fetcher.mockImplementation(async (url: string) => (String(url).endsWith("/preview") ? new Response(new Uint8Array([73]), { headers: { "Content-Type": "audio/mpeg" } }) : json(current)));
    play.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<OfficialVoicesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Ouvir Tranquilo: Apresentação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reprodução automática");
    expect(screen.getByLabelText("Audição da voz oficial")).toHaveAttribute("controls");
  });
});
