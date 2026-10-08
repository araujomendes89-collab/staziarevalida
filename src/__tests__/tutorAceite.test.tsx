/** Cartão do aceite do Tutor (§34): na Nexus (/tutor) e na Nexus aberta por cima de outra tela. Banco e servidor simulados. */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
const acceptTerms = vi.fn();
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, acceptTerms }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));

const SENTENCE =
  "Estou ciente de que os Tutores do StaziaMed Revalida utilizam Inteligência Artificial e podem cometer erros. Entendo que alguns perfis possuem linguagem informal, humor, ironia, cobrança e, quando selecionados por mim, podem utilizar expressões mais intensas ou palavrões dentro do contexto educacional.";
const PERSONALITIES = [{ id: "direto", name: "Direto", emoji: "🎯", tagline: "Objetivo", swears: false, voice: { rate: 1, pitch: 1 } }];
const ENT = { enabled: true, mode: "trial", plan: "trial", is_paid: false, trial: { state: "active", days: 7, day: 1 }, can_use: true, can_text: true, can_voice: false, block_reason: null, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: false }, questions: { used: 0, limit: 30, remaining: 30 } };
let consent = true;
const status = (over: any = {}) => ({
  enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, max_profanity: "moderate", voice_enabled: false, reviews_due: 0,
  entitlement: ENT, preferences: { personality_id: "direto", profanity: "off", chosen: true }, personalities: PERSONALITIES,
  consent_required: consent, consent_version: "1.0", ...over,
});
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111", mode: "livre", title: "Conversa", topic: null, status: "active", question_state: null, hint_level: 0, difficulty_level: 3, intensity: 4,
  personality: { id: "direto", name: "Direto", emoji: "🎯", voice: { rate: 1, pitch: 1 } }, question: null, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "Pode perguntar.", grounding: "none", sources: null, hint_level: null, suggested: null, notice: null }],
};
const calls: string[] = [];
let rpcImpl: Record<string, (a: any) => any> = {};
let turnResponse: () => Response;

beforeEach(() => {
  consent = true;
  calls.length = 0;
  acceptTerms.mockReset();
  acceptTerms.mockImplementation(async () => { consent = false; });
  rpcImpl = { app_tutor_status: () => status(), app_tutor_sessions: () => [], app_tutor_start: () => SESSION };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    calls.push(fn);
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  turnResponse = () => new Response(JSON.stringify({ message: { id: 9, role: "tutor", content: "ok", spoken: "ok", grounding: "general", sources: [], hint_level: null, suggested: null, notice: null }, question_state: null, used_today: 1, daily_limit: 40 }), { status: 200 });
  (globalThis as any).fetch = vi.fn(async (url: string) => (String(url).endsWith("/turn") || String(url).endsWith("/voice/open") ? turnResponse() : new Response(JSON.stringify({ ready: true }), { status: 200 })));
});
afterEach(cleanup);

const loadScreen = async () => (await import("../novo/app/tutor/nexus/NexusScreen.jsx")).NexusScreen as any;
const lobby = () => screen.queryByRole("heading", { name: "Escolha seu professor" });
const loadDrawer = async () => (await import("../novo/app/tutor/TutorDrawer.jsx")) as any;

describe("Aceite do Tutor", () => {
  it("aluno sem aceite vê o cartão do §34 na tela do Tutor, não o aviso de plano", async () => {
    rpcImpl.app_tutor_status = () => status({ available: false });
    const NexusScreen = await loadScreen();
    const { container } = render(<NexusScreen go={() => {}} />);
    expect(await screen.findByText("Continuar")).toBeTruthy();
    expect(container.textContent).toContain(SENTENCE);
    expect(screen.getByLabelText("Li e concordo")).toBeTruthy();
    expect(screen.queryByText("O Tutor faz parte dos planos pagos")).toBeNull();
    expect(lobby()).toBeNull();
  });

  it("Continuar só com a caixa marcada; depois do aceite a tela recarrega e mostra o início", async () => {
    const NexusScreen = await loadScreen();
    render(<NexusScreen go={() => {}} />);
    const button = (await screen.findByText("Continuar")).closest("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Li e concordo"));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledWith({ document: "tutor_ia", version: "1.0", origin: "tutor" }));
    expect(await screen.findByRole("heading", { name: "Escolha seu professor" })).toBeTruthy();
    expect(screen.queryByText("Continuar")).toBeNull();
  });

  it("recusa do servidor: mostra a mensagem no cartão e relê o status com a versão nova", async () => {
    acceptTerms.mockRejectedValueOnce(new Error("Versão desatualizada do termo."));
    let version = "1.0";
    rpcImpl.app_tutor_status = () => status({ consent_version: version });
    const NexusScreen = await loadScreen();
    render(<NexusScreen go={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Li e concordo"));
    version = "1.1";
    fireEvent.click(screen.getByText("Continuar"));
    expect(await screen.findByText("Versão desatualizada do termo.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Li e concordo"));
    fireEvent.click(screen.getByText("Continuar"));
    await waitFor(() => expect(acceptTerms).toHaveBeenLastCalledWith({ document: "tutor_ia", version: "1.1", origin: "tutor" }));
  });

  it("403 tutor_consent ao abrir a conversa mostra o cartão (não o aviso de plano)", async () => {
    consent = false;
    const NexusScreen = await loadScreen();
    render(<NexusScreen go={() => {}} />);
    const start = await screen.findByRole("button", { name: /^Começar com/ });
    turnResponse = () => new Response(JSON.stringify({ error: "Aceite o termo do Tutor.", code: "tutor_consent" }), { status: 403 });
    consent = true; // o servidor passa a pedir o aceite; a releitura do status traz consent_required
    fireEvent.click(start);
    expect(await screen.findByText("Continuar")).toBeTruthy();
    expect(screen.queryByText("O Tutor faz parte dos planos pagos")).toBeNull();
    expect(screen.queryByText("Aceite o termo do Tutor.")).toBeNull();
  });

  it("status sem consent_required: a Nexus abre na escolha do professor", async () => {
    consent = false;
    const NexusScreen = await loadScreen();
    render(<NexusScreen go={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Escolha seu professor" })).toBeTruthy();
    expect(screen.queryByText("Continuar")).toBeNull();
  });
});

describe("Aceite do Tutor na gaveta", () => {
  it("o cartão aparece e nenhuma sessão é criada antes; depois do aceite a Nexus mostra a escolha do professor (a conversa só começa no Começar)", async () => {
    const { TutorDockProvider, TutorButton } = await loadDrawer();
    render(<TutorDockProvider><TutorButton request={{ mode: "livre" }} /></TutorDockProvider>);
    fireEvent.click(screen.getByText("Discutir com o Tutor"));
    expect(await screen.findByText("Continuar")).toBeTruthy();
    expect(calls).not.toContain("app_tutor_start");
    fireEvent.click(screen.getByLabelText("Li e concordo"));
    fireEvent.click(screen.getByText("Continuar"));
    expect(await screen.findByRole("heading", { name: "Escolha seu professor" })).toBeTruthy();
    expect(calls).not.toContain("app_tutor_start");
  });

  it("sem consent_required a Nexus abre por cima na escolha do professor", async () => {
    consent = false;
    const { TutorDockProvider, TutorButton } = await loadDrawer();
    render(<TutorDockProvider><TutorButton request={{ mode: "livre" }} /></TutorDockProvider>);
    fireEvent.click(screen.getByText("Discutir com o Tutor"));
    expect(await screen.findByRole("heading", { name: "Escolha seu professor" })).toBeTruthy();
    expect(screen.queryByText("Continuar")).toBeNull();
  });
});

describe("Cartão do aceite: duplo clique", () => {
  it("depois do aceite com sucesso o botão não reenvia enquanto o cartão não sai", async () => {
    const { TutorConsentCard } = await import("../novo/app/tutor/TutorConsentCard.jsx");
    const onAccepted = vi.fn();
    render(<TutorConsentCard version="1.0" onAccepted={onAccepted} />);
    fireEvent.click(screen.getByLabelText("Li e concordo"));
    const button = screen.getByText("Continuar").closest("button") as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    fireEvent.click(button);
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(acceptTerms).toHaveBeenCalledTimes(1);
  });
});
