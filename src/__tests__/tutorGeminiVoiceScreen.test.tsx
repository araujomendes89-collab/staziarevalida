/**
 * Voz do Gemini na tela do Tutor (jsdom; o módulo do Gemini e o servidor são simulados): o servidor indica o Gemini, o aplicativo
 * conecta com a chave temporária (nada vai para a OpenAI), o professor abre a conversa, fala com legenda, usa as ferramentas pelo
 * servidor e pode ser interrompido; a troca de conexão do Google não conta como queda; se o Gemini não abrir neste aparelho, a
 * reserva é liberada sem cobrar e a voz da OpenAI assume; se o servidor já tiver caído para a OpenAI, segue por ela.
 */
import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));

// módulo do Gemini simulado: o teste dispara o que o Google mandaria
const gem = { texts: [] as string[], tools: [] as any[], muted: [] as boolean[], interrupted: 0, closed: 0 };
const opened: any[] = [];
let gemBehavior: "ok" | "closeBeforeReady" | "throw" = "ok";
vi.mock("../novo/app/tutor/voice/geminiLive.js", () => ({
  openGeminiLive: async (args: any) => {
    opened.push(args);
    if (gemBehavior === "throw") throw new Error("WebSocket falhou");
    if (gemBehavior === "closeBeforeReady") setTimeout(() => args.handlers.onClose({ beforeReady: true, reason: "1006" }), 0);
    return {
      outputStream: { id: "voz-do-professor" },
      sendText: (t: string) => gem.texts.push(t),
      respondTools: (r: any) => gem.tools.push(r),
      mute: (on: boolean) => gem.muted.push(on),
      interrupt: () => gem.interrupted++,
      setVolume: () => {},
      close: () => gem.closed++,
    };
  },
}));

// WebRTC e microfone simulados (a voz da OpenAI é a reserva)
let dc: any = null;
class FakePC {
  connectionState = "new";
  ontrack: any; onconnectionstatechange: any;
  createDataChannel() {
    dc = { readyState: "open", send() {}, close() {}, onmessage: null as any, onopen: null as any };
    return dc;
  }
  addTrack() {}
  async createOffer() { return { type: "offer", sdp: "v=0 offer" }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() {}
}
(window as any).RTCPeerConnection = FakePC;
(navigator as any).mediaDevices = {
  getUserMedia: async () => {
    const track = { enabled: true, stop() {} };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  },
};
(globalThis as any).Audio = class { autoplay = false; srcObject: any = null; play() { return Promise.resolve(); } pause() {} };
(globalThis as any).SpeechSynthesisUtterance = class {};
(window as any).speechSynthesis = { getVoices: () => [], cancel() {}, speak() {} };

const PERSONALITIES = [{ id: "durona", name: "Durona", emoji: "🔥", tagline: "Escrachada", swears: true, voice: {} }];
const ENT = { enabled: true, mode: "paid", is_paid: true, trial: { state: "none", days: 7 }, can_use: true, can_text: true, can_voice: true, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: true, remaining_today_s: 3600, remaining_s: 3600 }, questions: { limit: null } };
const status = () => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, voice_enabled: true, reviews_due: 0, entitlement: ENT, preferences: { personality_id: "durona", profanity: "moderate", chosen: true }, personalities: PERSONALITIES });
const QUESTION = { id: "q1", number: 12, area: "PEDIATRIA", topic: "Bronquiolite", exam: { kind: "REVALIDA", year: 2022, semester: 1 }, statement: "Lactente com sibilância. Qual a conduta?", options: [{ id: "A", text: "Oxigênio" }, { id: "B", text: "Salbutamol" }], state: "open", correct_option: null };
const session = () => ({
  id: "22222222-2222-4222-8222-222222222222", mode: "questao", title: "Bronquiolite", topic: null, status: "active", question_state: "open", hint_level: 0, difficulty_level: 3, intensity: 3,
  personality: { id: "durona", name: "Durona", emoji: "🔥", voice: {} }, question: QUESTION, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "Questão na mesa. Lê direito.", grounding: "none" }],
});
const GEMINI_CALL = "44444444-4444-4444-8444-444444444444";
const RT_CALL = "33333333-3333-4333-8333-333333333333";
const geminiStart = { provider: "gemini", voice_call_id: GEMINI_CALL, gemini_token: "auth_tokens/temporario", model: "gemini-3.8-live", voice: "Kore", lease_seconds: 120, entitlement: { voice: { remaining_s: 540 } } };
const realtimeStart = { provider: "realtime", voice_call_id: RT_CALL, client_secret: "ek_temporario", model: "gpt-realtime-2.1", lease_seconds: 120, entitlement: { voice: { remaining_s: 540 } } };

let server: Record<string, (body: any) => { status?: number; body?: any; headers?: Record<string, string>; text?: string }> = {};
const calls: { url: string; body: any }[] = [];

beforeEach(async () => {
  (await import("../novo/app/tutor/useRealtimeVoice.js")).resetGeminiDeviceFallback();
  calls.length = 0;
  opened.length = 0;
  Object.assign(gem, { texts: [], tools: [], muted: [], interrupted: 0, closed: 0 });
  gemBehavior = "ok";
  dc = null;
  const rpcImpl: Record<string, () => any> = { app_tutor_status: () => status(), app_tutor_sessions: () => [], app_tutor_start: () => session(), app_tutor_session: () => session() };
  backend.rpc.mockImplementation(async (fn: string) => {
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn]();
  });
  server = {
    "/api/tutor/status": () => ({ body: { ready: true, simulated: false, neural_voice: false, realtime_voice: true, live_voice: false, voice_hint: "gemini" } }),
    // o servidor abre o Gemini, a não ser que o aplicativo peça outra voz
    "/api/tutor/voice/start": (b) => ({ body: b?.avoid?.includes("gemini") ? realtimeStart : geminiStart }),
    "https://api.openai.com/v1/realtime/calls": () => ({ text: "v=0 answer", headers: { Location: "/v1/realtime/calls/rtc_123" } }),
    "/api/tutor/voice/renew": () => ({ body: { stop: false, lease_seconds: 120, remaining_s: 500 } }),
    "/api/tutor/voice/tool": (b) => ({ body: { output: { question: { id: "q1", state: "open", official_answer: null }, asked: b.name } } }),
    "/api/tutor/voice/transcript": () => ({ body: { correction: null } }),
    "/api/tutor/voice/end": () => ({ body: { consumed_seconds: 30 } }),
  };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const body = init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body ?? null;
    calls.push({ url: String(url), body });
    const h = server[String(url)];
    if (!h) return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
    const r = h(body);
    if (r.text !== undefined) return new Response(r.text, { status: r.status ?? 201, headers: r.headers });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json", ...(r.headers ?? {}) } });
  });
});
afterEach(cleanup);

const load = async () => (await import("../novo/app/tutor/TutorScreen.jsx")).TutorScreen as any;
const urls = () => calls.map((c) => c.url);
const bodies = (u: string) => calls.filter((c) => c.url === u).map((c) => c.body);
const openVoice = async () => {
  const TutorScreen = await load();
  render(<TutorScreen go={() => {}} />);
  fireEvent.click(await screen.findByText("Começar"));
  await waitFor(() => expect(urls()).toContain("/api/tutor/status"));
  fireEvent.click(await screen.findByText("Conversar por voz"));
};

describe("Voz do Gemini na tela", () => {
  it("conecta com a chave temporária, o professor abre, fala com legenda, usa ferramentas pelo servidor e pode ser interrompido", async () => {
    await openVoice();
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(bodies("/api/tutor/voice/start")).toEqual([{ session_id: session().id, force: false }]);
    expect(opened[0]).toMatchObject({ token: "auth_tokens/temporario", model: "gemini-3.8-live" });
    expect(urls().some((u) => u.startsWith("https://api.openai.com"))).toBe(false); // nada vai para a OpenAI
    expect(await screen.findByRole("dialog", { name: "Tutor Stazia" })).toBeTruthy();
    const h = opened[0].handlers;
    act(() => {
      h.onReady();
    });
    expect(await screen.findByText("Ouvindo...")).toBeTruthy();
    expect(gem.texts[0]).toMatch(/Abra do seu jeito/);
    // o professor fala: estado, legenda e conferência no servidor da fala inteira
    act(() => {
      h.onAudio();
    });
    expect(await screen.findByText("Falando...")).toBeTruthy();
    act(() => {
      h.onTranscript("tutor", "Fala, ", false);
      h.onTranscript("tutor", "bora lá.", true);
    });
    await waitFor(() => expect(bodies("/api/tutor/voice/transcript")[0]).toMatchObject({ voice_call_id: GEMINI_CALL, role: "tutor", text: "Fala, bora lá." }));
    fireEvent.click(screen.getByText("Interromper"));
    expect(gem.interrupted).toBe(1);
    // ferramenta pedida pela voz: o servidor executa e o resultado volta para o Gemini
    act(() => {
      h.onToolCalls([{ id: "f1", name: "get_question_context", args: {} }]);
    });
    await waitFor(() => expect(gem.tools).toHaveLength(1));
    expect(bodies("/api/tutor/voice/tool")[0]).toMatchObject({ voice_call_id: GEMINI_CALL, name: "get_question_context", arguments: "{}" });
    expect(gem.tools[0]).toEqual([{ id: "f1", name: "get_question_context", response: { output: { question: { id: "q1", state: "open", official_answer: null }, asked: "get_question_context" } } }]);
    // microfone desligado também no Gemini
    fireEvent.click(screen.getByLabelText("Desligar o microfone"));
    expect(gem.muted).toEqual([true]);
    // troca de conexão de rotina do Google não é queda; encerrar fecha a conexão e registra o fim com as métricas
    act(() => {
      h.onReconnect("goaway");
    });
    fireEvent.click(screen.getByLabelText("Encerrar a conversa por voz"));
    await waitFor(() => expect(urls()).toContain("/api/tutor/voice/end"));
    expect(gem.closed).toBeGreaterThan(0);
    expect(bodies("/api/tutor/voice/end")[0]).toMatchObject({ voice_call_id: GEMINI_CALL, reason: "student", metrics: { provider_used: "gemini", mic_permission: "granted", tools: 1, reconnects: 0 } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tutor Stazia" })).toBeNull());
  });

  it("o Gemini não abriu neste aparelho: libera a reserva sem cobrar e a voz da OpenAI assume na hora", async () => {
    gemBehavior = "closeBeforeReady";
    await openVoice();
    await waitFor(() => expect(urls()).toContain("https://api.openai.com/v1/realtime/calls"));
    expect(bodies("/api/tutor/voice/end")[0]).toEqual({ voice_call_id: GEMINI_CALL, reason: "error" });
    expect(bodies("/api/tutor/voice/start")).toEqual([{ session_id: session().id, force: false }, { session_id: session().id, force: true, avoid: ["gemini"] }]);
    dc.onopen();
    expect(await screen.findByText("Ouvindo...")).toBeTruthy();
    cleanup();
    // logo depois, neste aparelho: a OpenAI direto, sem fazer o aluno esperar outra tentativa do Gemini
    await new Promise((x) => setTimeout(x, 50));
    calls.length = 0;
    opened.length = 0;
    await openVoice();
    await waitFor(() => expect(urls()).toContain("https://api.openai.com/v1/realtime/calls"));
    expect(opened).toHaveLength(0);
    expect(bodies("/api/tutor/voice/start")).toEqual([{ session_id: session().id, force: false, avoid: ["gemini"] }]);
    cleanup();
    // a conexão nem chegou a abrir (erro ao conectar): mesmo caminho
    (await import("../novo/app/tutor/useRealtimeVoice.js")).resetGeminiDeviceFallback();
    await new Promise((x) => setTimeout(x, 50));
    calls.length = 0;
    gemBehavior = "throw";
    await openVoice();
    await waitFor(() => expect(urls()).toContain("https://api.openai.com/v1/realtime/calls"));
    expect(bodies("/api/tutor/voice/end").filter((b) => b.voice_call_id === GEMINI_CALL)).toEqual([{ voice_call_id: GEMINI_CALL, reason: "error" }]);
  });

  it("o servidor já caiu para a OpenAI (o Google recusou): segue pela OpenAI, sem abrir o Gemini", async () => {
    server["/api/tutor/voice/start"] = () => ({ body: realtimeStart });
    await openVoice();
    await waitFor(() => expect(urls()).toContain("https://api.openai.com/v1/realtime/calls"));
    expect(opened).toHaveLength(0);
    expect(bodies("/api/tutor/voice/end")).toEqual([]);
  });

  it("caiu no meio da conversa e não deu para retomar: abre outra ligação do Gemini, mantendo a conversa", async () => {
    await openVoice();
    await waitFor(() => expect(opened).toHaveLength(1));
    act(() => {
      opened[0].handlers.onReady();
    });
    expect(await screen.findByText("Ouvindo...")).toBeTruthy();
    act(() => {
      opened[0].handlers.onClose({ beforeReady: false, reason: "1006" });
    });
    await waitFor(() => expect(opened).toHaveLength(2));
    expect(bodies("/api/tutor/voice/end")[0]).toMatchObject({ voice_call_id: GEMINI_CALL, reason: "student", metrics: { reconnects: 1, disconnect_reason: "network" } });
    expect(bodies("/api/tutor/voice/start").at(-1)).toEqual({ session_id: session().id, force: true });
    act(() => {
      opened[1].handlers.onReady();
    });
    expect(await screen.findByText("Ouvindo...")).toBeTruthy();
  });
});
