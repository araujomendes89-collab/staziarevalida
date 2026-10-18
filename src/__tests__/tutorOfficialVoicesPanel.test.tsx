/**
 * Painel "Vozes do Stazi e da Stazia" (administração): uma linha por voz, um botão por cenário dela (marcado quando já ouvido nesta
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

const LABEL = { stazi: "Stazi", stazia: "Stazia" } as const;
type Id = keyof typeof LABEL;
const row = (id: Id, over: Record<string, unknown> = {}, heard: boolean | string[] = false) => ({
  id, label: LABEL[id], configured: true, unique: true, ready: true, approved: false, approved_at: null, fingerprint: `${id}-versao`, pending: null, detail: null, can_approve: false,
  scenarios: scenariosFor(id).map((s) => ({ id: s, label: VOICE_SCENARIOS[s].label, heard: Array.isArray(heard) ? heard.includes(s) : heard })),
  ...over,
});
const panel = (rows: ReturnType<typeof row>[], approver = true) => ({ engine: "gemini", model: "gemini-3.8-flash-tts", keyConfigured: true, pending: null, detail: null, approver, rows });
let current: ReturnType<typeof panel>;
let fetcher: ReturnType<typeof vi.fn>;
let play: ReturnType<typeof vi.spyOn>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const calls = (suffix: string) => fetcher.mock.calls.filter(([url]) => String(url).endsWith(suffix));

beforeEach(() => {
  current = panel([row("stazi"), row("stazia")]);
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

describe("Vozes do Stazi e da Stazia", () => {
  it("lista as duas vozes (uma por personagem) com os cenários de cada uma; tocar um cenário manda só voz e cenário", async () => {
    render(<OfficialVoicesPanel />);
    expect(await screen.findByRole("heading", { name: "Vozes do Stazi e da Stazia" })).toBeInTheDocument();
    // os textos citam os personagens e não nomeiam mais a ElevenLabs nem o Nexus
    expect(screen.getByText(/O Stazi fala pelo Durão e pelo Tranquilo; a Stazia, pela Durona e pela Tranquila/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ElevenLabs|Nexus/);
    for (const id of ["stazi", "stazia"] as Id[]) {
      const r = await rowOf(LABEL[id]);
      expect(within(r).getAllByRole("button", { name: new RegExp(`^Ouvir ${LABEL[id]}:`) })).toHaveLength(scenariosFor(id).length);
    }
    expect(screen.getByRole("button", { name: "Ouvir Stazia: Alívio com palavrão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvir Stazi: Alívio com palavrão" })).toBeInTheDocument(); // o Durão fala com a voz do Stazi
    expect(screen.queryByRole("group", { name: /Voz Direto/ })).toBeNull();
    expect(screen.queryByText(/três vozes/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir Stazia: Erro repetido" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    const [url, init] = calls("/preview")[0] as any;
    expect(url).toBe("/api/tutor/voices/preview");
    expect(JSON.parse(init.body)).toEqual({ personality: "stazia", scenario: "repeticao" });
    expect(init.headers.Authorization).toBe("Bearer admin-session-token");
    expect(screen.getByTestId("original-orb")).toBeInTheDocument();
    expect(screen.getByLabelText("Audição da voz oficial")).toHaveAttribute("src", "blob:voz-do-nexus");
    // depois da audição o painel relê o que já foi ouvido
    await waitFor(() => expect(calls("/api/tutor/voices").length).toBe(2));
  });

  it("'Aprovar esta voz' só ativo com todos os cenários ouvidos nesta versão e para quem aprova; depois aparece 'Revogar'", async () => {
    current = panel([row("stazi", {}, ["apresentacao", "erro"]), row("stazia", { can_approve: true }, true)]);
    render(<OfficialVoicesPanel />);
    const stazia = await rowOf("Stazia");
    expect(within(stazia).getByRole("button", { name: "Ouvir Stazia: Alívio com palavrão" })).toHaveAttribute("aria-pressed", "true");
    const stazi = await rowOf("Stazi");
    expect(within(stazi).getByRole("button", { name: "Ouvir Stazi: Apresentação" })).toHaveAttribute("aria-pressed", "true");
    expect(within(stazi).getByRole("button", { name: "Ouvir Stazi: Erro repetido" })).toHaveAttribute("aria-pressed", "false");
    expect(within(stazi).getByRole("button", { name: "Aprovar esta voz: Stazi" })).toBeDisabled();
    const approved = panel([row("stazi"), row("stazia", { approved: true, approved_at: "2026-10-08T15:00:00Z" }, true)]);
    fetcher.mockImplementationOnce(async () => json(approved));
    fireEvent.click(within(stazia).getByRole("button", { name: "Aprovar esta voz: Stazia" }));
    await waitFor(() => expect(calls("/approve")).toHaveLength(1));
    expect(JSON.parse((calls("/approve")[0] as any)[1].body)).toEqual({ personality: "stazia" });
    expect(await within(await rowOf("Stazia")).findByRole("button", { name: "Revogar: Stazia" })).toBeInTheDocument();
    expect(within(await rowOf("Stazia")).getByText("Aprovada")).toBeInTheDocument();
    expect(within(await rowOf("Stazia")).queryByRole("button", { name: /Aprovar esta voz/ })).toBeNull();
  });

  it("quem não está na lista de aprovação ouve, mas não aprova nem revoga", async () => {
    current = panel([row("stazi", { approved: true }), row("stazia", { can_approve: false }, true)], false);
    render(<OfficialVoicesPanel />);
    expect(within(await rowOf("Stazia")).getByRole("button", { name: "Aprovar esta voz: Stazia" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Revogar/ })).toBeNull();
    expect(screen.getByText(/Só quem está na lista de aprovação do servidor aprova ou revoga/)).toBeInTheDocument();
    expect(within(await rowOf("Stazia")).getByRole("button", { name: "Ouvir Stazia: Apresentação" })).toBeEnabled();
  });

  it("revogar uma voz muda só aquela linha", async () => {
    current = panel([row("stazi", { approved: true }, true), row("stazia", { approved: true }, true)]);
    render(<OfficialVoicesPanel />);
    const stazia = await rowOf("Stazia");
    fetcher.mockImplementationOnce(async () => json(panel([row("stazi", { approved: true }, true), row("stazia", {}, true)])));
    fireEvent.click(within(stazia).getByRole("button", { name: "Revogar: Stazia" }));
    await waitFor(() => expect(calls("/revoke")).toHaveLength(1));
    expect(JSON.parse((calls("/revoke")[0] as any)[1].body)).toEqual({ personality: "stazia" });
    expect(await within(await rowOf("Stazia")).findByText("Aguardando audição e aprovação")).toBeInTheDocument();
    expect(within(await rowOf("Stazi")).getByText("Aprovada")).toBeInTheDocument();
  });

  it("sem chave ou sem voz cadastrada: cenários desativados e o motivo à vista em português simples, sem voz simulada", async () => {
    current = {
      ...panel([row("stazi", { ready: false, configured: false, pending: "A voz de Stazi ainda não foi cadastrada no servidor.", detail: "Configure ELEVENLABS_VOICE_STAZI com o voice_id salvo." }), row("stazia", { ready: false })]),
      pending: "A chave de acesso da voz do professor ainda não foi configurada no servidor.", detail: "Configure ELEVENLABS_API_KEY no servidor.",
    };
    render(<OfficialVoicesPanel />);
    expect(await screen.findByText("A chave de acesso da voz do professor ainda não foi configurada no servidor.")).toBeInTheDocument();
    expect(within(await rowOf("Stazi")).getByText("Voz ainda não cadastrada")).toBeInTheDocument();
    expect(within(await rowOf("Stazi")).getByText("A voz de Stazi ainda não foi cadastrada no servidor.")).toBeInTheDocument();
    // o nome da variável do servidor fica no detalhe técnico, escondido (a seção começa fechada)
    const detalhes = screen.getAllByText("Detalhe técnico (para quem configura o servidor)");
    expect(detalhes).toHaveLength(2);
    for (const d of detalhes) expect(d.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Configure ELEVENLABS_API_KEY no servidor.").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText("Voice ID pendente")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Ouvir / }).every((b) => b.hasAttribute("disabled"))).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it("falha da audição aparece como erro; navegador que bloqueia o som deixa o player manual", async () => {
    fetcher.mockImplementation(async (url: string) => (String(url).endsWith("/preview") ? json({ error: "Créditos indisponíveis." }, 502) : json(current)));
    render(<OfficialVoicesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Ouvir Stazi: Apresentação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Créditos indisponíveis.");
    expect(play).not.toHaveBeenCalled();
    cleanup();
    fetcher.mockImplementation(async (url: string) => (String(url).endsWith("/preview") ? new Response(new Uint8Array([73]), { headers: { "Content-Type": "audio/mpeg" } }) : json(current)));
    play.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<OfficialVoicesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Ouvir Stazia: Apresentação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reprodução automática");
    expect(screen.getByLabelText("Audição da voz oficial")).toHaveAttribute("controls");
  });
});
