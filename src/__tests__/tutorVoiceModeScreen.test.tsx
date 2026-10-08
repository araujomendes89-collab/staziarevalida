/**
 * Stazia Voice Mode na tela (jsdom; WebRTC, microfone e servidor simulados): tela cheia, GPT-Live com a oferta pelo servidor e a
 * delegação respondida pelo servidor, legenda, microfone que liga e desliga sem encerrar, chat na mesma conversa, volume, fechar
 * (microfone parado e fim registrado com métricas), sem vídeo (esfera desenhada), movimento reduzido, "Continuar por texto",
 * "Conversar com o Tutor" no início e o painel de administração da voz.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TUTOR_SPOKEN_LANGUAGE, TUTOR_SPOKEN_REMINDER } from "../shared/tutor/voiceLanguage";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

// WebRTC e microfone simulados
const sent: any[] = [];
let dc: any = null;
let pcs: any[] = [];
let tracks: any[] = [];
let micDenied = false;
class FakePC {
  connectionState = "new";
  ontrack: any;
  onconnectionstatechange: any;
  localDescription: any = null;
  remote: any = null;
  constructor() {
    pcs.push(this);
  }
  createDataChannel() {
    dc = { readyState: "open", send: (m: string) => sent.push(JSON.parse(m)), close() {}, onmessage: null as any, onopen: null as any };
    return dc;
  }
  addTrack() {}
  getSenders() {
    return [];
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0 offer" };
  }
  async setLocalDescription(d: any) {
    this.localDescription = d;
  }
  async setRemoteDescription(d: any) {
    this.remote = d;
  }
  close() {}
}
(window as any).RTCPeerConnection = FakePC;
(navigator as any).mediaDevices = {
  getUserMedia: async () => {
    if (micDenied) throw Object.assign(new Error("negado"), { name: "NotAllowedError" });
    const track = { enabled: true, readyState: "live", stopped: false, stop() { this.stopped = true; } };
    tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  },
};
(globalThis as any).Audio = class { autoplay = false; volume = 1; srcObject: any = null; play() { return Promise.resolve(); } pause() {} setAttribute() {} };
(globalThis as any).SpeechSynthesisUtterance = class {};
(window as any).speechSynthesis = { getVoices: () => [], cancel() {}, speak() {} };
let reduceMotion = false;
(window as any).matchMedia = (q: string) => ({ matches: q.includes("reduce") ? reduceMotion : false, addEventListener() {}, removeEventListener() {} });

const PERSONALITIES = [
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Descontraído", swears: false, voice: {} },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Escrachada", swears: true, voice: {} },
];
const ENT = { enabled: true, mode: "trial", is_paid: false, trial: { state: "active", day: 2, days: 7 }, can_use: true, can_text: true, can_voice: true, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: true, remaining_today_s: 600, remaining_s: 600, remaining_total_s: 1020 }, questions: { limit: 30, used: 0 } };
const status = (over: any = {}) => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, voice_enabled: true, reviews_due: 0, entitlement: ENT, preferences: { personality_id: "durona", profanity: "moderate", chosen: true }, personalities: PERSONALITIES, ...over });
const SID = "22222222-2222-4222-8222-222222222222";
const session = (over: any = {}) => ({
  id: SID, mode: "livre", title: "Perguntar ao Tutor", topic: null, status: "active", question_state: "none", hint_level: 0, difficulty_level: 3, intensity: 3,
  personality: { id: "durona", name: "Durona", emoji: "🔥", voice: {} }, question: null, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "Chegou. Bora.", grounding: "none" }], ...over,
});
const CALL = "33333333-3333-4333-8333-333333333333";

let rpcImpl: Record<string, (args: any) => any> = {};
let server: Record<string, (body: any) => { status?: number; body?: any; text?: string; headers?: Record<string, string> }> = {};
const calls: { url: string; body: any }[] = [];

beforeEach(() => {
  sent.length = 0;
  calls.length = 0;
  dc = null;
  pcs = [];
  tracks = [];
  micDenied = false;
  reduceMotion = false;
  try {
    window.localStorage.clear();
  } catch {
    // sem armazenamento
  }
  rpcImpl = { app_tutor_status: () => status(), app_tutor_sessions: () => [], app_tutor_start: () => session(), app_tutor_session: () => session(), app_tutor_close: () => true };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  server = {
    "/api/tutor/status": () => ({ body: { ready: true, simulated: false, neural_voice: false, realtime_voice: true, live_voice: true } }),
    "/api/tutor/voice/start": (b) => ({ body: { provider: "live", voice_call_id: CALL, sdp: "v=0 resposta-live", live_session_id: "live_1", model: "m", voice: "marin", lease_seconds: 120, session_max_seconds: 1800, entitlement: { voice: { remaining_s: 600 } }, got: b } }),
    "/api/tutor/voice/delegate": () => ({ body: { intent: "message", say: ["Pré-eclâmpsia é hipertensão depois de vinte semanas, com lesão de órgão."], thinking: [], tone: "ESTADO NESTA SESSÃO (interno): humor irritado", avatar: { emotion: "irritated", intensity: 70 }, gate: null, question_state: "none" } }),
    "/api/tutor/voice/transcript": () => ({ body: { correction: null } }),
    "/api/tutor/voice/renew": () => ({ body: { stop: false, lease_seconds: 120, remaining_s: 500 } }),
    "/api/tutor/voice/end": () => ({ body: { consumed_seconds: 30 } }),
    "/api/tutor/voice/metrics": () => ({ body: { ok: true } }),
  };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const body = init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body ?? null;
    calls.push({ url: String(url), body });
    const h = server[String(url)];
    if (!h) return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
    const r = h(body);
    if (r.text !== undefined) return new Response(r.text, { status: r.status ?? 201, headers: r.headers });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
});
afterEach(cleanup);

const load = async () => (await import("../novo/app/tutor/TutorScreen.jsx")).TutorScreen as any;
const urls = () => calls.map((c) => c.url);
const emit = (ev: unknown) => act(() => dc.onmessage({ data: JSON.stringify(ev) }));
const openVoice = async () => {
  const TutorScreen = await load();
  render(<TutorScreen go={() => {}} />);
  fireEvent.click(await screen.findByText("Começar"));
  await waitFor(() => expect(urls()).toContain("/api/tutor/status"));
  fireEvent.click(await screen.findByText("Conversar por voz"));
  await waitFor(() => expect(urls()).toContain("/api/tutor/voice/start"));
  await waitFor(() => expect(pcs[0]?.remote).toBeTruthy());
};

describe("Stazia Voice Mode com GPT-Live", () => {
  it("tela cheia; oferta pelo servidor; delegação respondida pelo servidor; legenda; emoção na esfera", async () => {
    await openVoice();
    expect(screen.getByRole("dialog", { name: "Nexus" })).toBeTruthy();
    // o navegador mandou a oferta ao NOSSO servidor (nenhuma chamada direta à OpenAI) e recebeu a resposta
    expect(calls.find((c) => c.url === "/api/tutor/voice/start")!.body).toEqual({ session_id: SID, force: false, sdp: "v=0 offer" });
    expect(urls().some((u) => u.startsWith("https://api.openai.com"))).toBe(false);
    expect(pcs[0].remote).toEqual({ type: "answer", sdp: "v=0 resposta-live" });
    expect(screen.getByText("Conectando...")).toBeTruthy();
    expect(screen.getByText("10 min hoje · 17 min no seu teste")).toBeTruthy(); // o que vale hoje e o que sobra no teste
    await emit({ type: "session.started", session: { id: "live_1" } });
    expect(await screen.findByText("Pronto")).toBeTruthy();
    expect(sent.at(-1)).toMatchObject({ type: "session.instructions.append", delegation_id: null, content: expect.stringMatching(/Abra a conversa agora/) });
    // o aluno fala (pedaços de transcrição) e a voz delega
    await emit({ type: "session.input_transcript.delta", delta: "me explica " });
    await emit({ type: "session.input_transcript.delta", delta: "pré-eclâmpsia" });
    expect(await screen.findByText("Ouvindo...")).toBeTruthy();
    await emit({ type: "session.delegation.created", offset_ms: 1000, delegation: { id: "item_1", type: "delegation", target: "client" } });
    await waitFor(() => expect(urls()).toContain("/api/tutor/voice/delegate"));
    expect(calls.find((c) => c.url === "/api/tutor/voice/delegate")!.body).toMatchObject({ voice_call_id: CALL, transcript: [{ role: "student", text: "me explica pré-eclâmpsia" }] });
    await waitFor(() => expect(sent.some((m) => m.type === "session.commentary.append")).toBe(true));
    expect(sent.find((m) => m.type === "session.commentary.append")).toMatchObject({ delegation_id: "item_1", content: "Pré-eclâmpsia é hipertensão depois de vinte semanas, com lesão de órgão." });
    expect(sent.find((m) => m.type === "session.instructions.append" && /humor irritado/.test(m.content))).toBeTruthy(); // o tom do professor
    // o professor fala: legenda aparece aos poucos e a esfera recebe a emoção calculada pelo servidor
    await emit({ type: "session.output_transcript.delta", delta: "Pré-eclâmpsia é " });
    expect(await screen.findByText("Falando...")).toBeTruthy();
    expect(screen.getByText(/Pré-eclâmpsia é/)).toBeTruthy();
    const orb = document.querySelector(".svm-orb")!;
    expect(orb.getAttribute("data-emotion")).toBe("annoyed");
    expect(orb.getAttribute("data-state")).toBe("speaking");
    // GPT-Live é full-duplex: não há botão de interromper (falar por cima basta)
    expect(screen.queryByText("Interromper")).toBeNull();
  });

  it("microfone liga e desliga sem encerrar; chat na mesma conversa; legenda e volume ficam guardados", async () => {
    await openVoice();
    await emit({ type: "session.started", session: { id: "live_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Desligar o microfone" }));
    expect(sent.at(-1)).toMatchObject({ type: "session.input_audio.mute" });
    expect(tracks[0].enabled).toBe(false);
    expect(await screen.findByText("Microfone desligado")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Nexus" })).toBeTruthy(); // não encerrou
    fireEvent.click(screen.getByRole("button", { name: "Ligar o microfone" }));
    expect(sent.at(-1)).toMatchObject({ type: "session.input_audio.unmute" });
    expect(tracks[0].enabled).toBe(true);
    // chat: digitar vai para a mesma conversa (sem desligar a voz)
    fireEvent.click(screen.getByRole("button", { name: "Abrir o chat e a transcrição" }));
    const sheet = screen.getByRole("region", { name: "Chat e transcrição da conversa" });
    fireEvent.change(within(sheet).getByLabelText("Escrever para o Tutor"), { target: { value: "qual a dose do sulfato?" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Enviar" }));
    expect(sent.at(-1)).toMatchObject({ type: "session.instructions.append", content: expect.stringMatching(/qual a dose do sulfato\?/) });
    await waitFor(() => expect(calls.find((c) => c.url === "/api/tutor/voice/transcript")!.body).toMatchObject({ role: "student", text: "qual a dose do sulfato?" }));
    expect(screen.getAllByText("qual a dose do sulfato?").length).toBeGreaterThan(0);
    // legenda e volume são preferências do aparelho
    fireEvent.click(screen.getByLabelText("Mostrar transcrição na tela"));
    expect(window.localStorage.getItem("smn-voice-captions")).toBe("false");
    fireEvent.change(screen.getByLabelText("Volume do professor"), { target: { value: "0.4" } });
    expect(window.localStorage.getItem("smn-voice-volume")).toBe("0.4");
  });

  it("fechar: encerra combinado com a voz, para o microfone e registra o fim com as métricas", async () => {
    await openVoice();
    await emit({ type: "session.started", session: { id: "live_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Encerrar a conversa por voz" }));
    await waitFor(() => expect(sent.some((m) => m.type === "session.close")).toBe(true));
    await emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 31 } });
    await waitFor(() => expect(urls()).toContain("/api/tutor/voice/end"));
    expect(calls.find((c) => c.url === "/api/tutor/voice/end")!.body).toMatchObject({ voice_call_id: CALL, reason: "student", metrics: { provider_used: "live", mic_permission: "granted", disconnect_reason: "student" } });
    expect(tracks.every((t) => t.stopped)).toBe(true); // microfone parado depois de fechar
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nexus" })).toBeNull());
  });

  it("sem acesso ao GPT-Live, o servidor manda o Realtime e o navegador usa a mesma oferta com o segredo temporário", async () => {
    server["/api/tutor/voice/start"] = () => ({ body: { provider: "realtime", voice_call_id: CALL, client_secret: "ek_temporario", model: "m", lease_seconds: 120, entitlement: {} } });
    server["https://api.openai.com/v1/realtime/calls"] = () => ({ text: "v=0 answer", headers: { Location: "/v1/realtime/calls/rtc_9" } });
    await openVoice();
    expect(calls.find((c) => c.url === "https://api.openai.com/v1/realtime/calls")!.body).toBe("v=0 offer");
    act(() => dc.onopen());
    await emit({ type: "session.created", session: { instructions: `${TUTOR_SPOKEN_LANGUAGE}\n\nRegras médicas e personalidade.\n\n${TUTOR_SPOKEN_REMINDER}` } });
    expect(sent[0]).toEqual({ type: "response.create" });
    expect(await screen.findByText("Ouvindo...")).toBeTruthy();
  });
});

describe("Erros, falta do vídeo e acessibilidade", () => {
  it("microfone negado: explica e oferece continuar por texto (a mesma conversa, com o foco no campo de mensagem)", async () => {
    micDenied = true;
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Começar"));
    await waitFor(() => expect(urls()).toContain("/api/tutor/status"));
    fireEvent.click(await screen.findByText("Conversar por voz"));
    expect(await screen.findByText(/O navegador bloqueou o microfone/)).toBeTruthy();
    expect(urls()).not.toContain("/api/tutor/voice/start"); // GPT-Live: sem microfone, nem chega a reservar tempo
    fireEvent.click(screen.getByText("Continuar por texto"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nexus" })).toBeNull());
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Mensagem"));
  });

  it("sem o vídeo da esfera, entra a esfera desenhada; com movimento reduzido, o vídeo fica parado", async () => {
    const { StaziaVoiceOrb } = await import("../novo/app/tutor/voice/StaziaVoiceOrb.jsx");
    const { container, rerender } = render(<StaziaVoiceOrb conversationState="listening" emotion="neutral" />);
    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/novo-assets/tutor/stazia-voice-orb.mp4");
    expect(video.muted).toBe(true);
    fireEvent.error(video);
    expect(container.querySelector("[data-testid='orb-fallback']")).toBeTruthy();
    cleanup();
    reduceMotion = true;
    const paused = vi.fn();
    const orig = (window as any).HTMLMediaElement.prototype.pause;
    (window as any).HTMLMediaElement.prototype.pause = paused;
    const r2 = render(<StaziaVoiceOrb conversationState="speaking" emotion="happy" />);
    expect(r2.container.querySelector(".svm-orb")!.className).toMatch(/is-reduced/);
    expect(paused).toHaveBeenCalled();
    (window as any).HTMLMediaElement.prototype.pause = orig;
    void rerender;
  });

  it("Esc fecha; o foco começa no microfone e fica dentro da tela de voz", async () => {
    await openVoice();
    await emit({ type: "session.started", session: { id: "live_1" } });
    const dialog = screen.getByRole("dialog", { name: "Nexus" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nexus" })).toBeNull());
    // sem a confirmação do GPT-Live (session.closed), o fim é registrado assim mesmo depois de uma espera curta
    await waitFor(() => expect(urls()).toContain("/api/tutor/voice/end"), { timeout: 4000 });
  });
});

describe("Começar pela voz", () => {
  it("'Conversar com o Tutor' abre a sessão já no modo de voz, com o tempo restante à vista", async () => {
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    expect(await screen.findByText("Tutor por voz: 10 min hoje · 17 min no seu teste.")).toBeTruthy();
    fireEvent.click(await screen.findByText("Conversar com o Tutor"));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_tutor_start", expect.objectContaining({ p_mode: "questao" })));
    expect(await screen.findByRole("dialog", { name: "Nexus" })).toBeTruthy();
    await waitFor(() => expect(urls()).toContain("/api/tutor/voice/start"));
  });
});

describe("Painel de administração da voz", () => {
  it("salva provedor, voz, limite, transcrição, motor, Durona e pronúncias com motivo; professores com o mesmo motivo", async () => {
    const CONFIG = {
      enabled: true, requires_pro: true, daily_message_limit: 40, max_profanity: "moderate", voice_enabled: true, trial_text_daily: 40, trial_questions_daily: 30,
      trial_voice_daily_seconds: 600, trial_voice_total_seconds: 2400, paid_voice_daily_seconds: 3600, voice_provider: "auto", voice_name: null, voice_session_max_seconds: 1800,
      save_transcripts: true, transcript_retention_days: 180, emotion_engine: true, inside_jokes: true, durona_level: "forte", pronunciations: [],
      tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
      tts_price_per_1k_chars_usd: 0, stt_price_per_min_usd: 0,
      usage_30d: { students: 1, requests: 3, cost_usd: 0.1, voice_minutes: 4 }, cost_by_feature: {}, cost_by_persona: {}, trials: { started: 1, converted: 0 }, sessions: 2,
      voice_30d: { calls: 3, minutes: 4.5, avg_minutes: 1.5, connect_ms: 820, first_audio_ms: 1300, turn_ms: 900, reconnects: 1, by_provider: { live: 2, realtime: 1 }, ended_by: { student: 3 }, cost_usd: 0.3 },
    };
    const saved: any[] = [];
    const persona: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_tutor_config") return CONFIG;
      if (fn === "app_admin_tutor_save_config") return (saved.push(args), { ...CONFIG, ...args.p_config });
      if (fn === "app_admin_tutor_personalities") return [{ id: "acolhedor", name: "Tranquilo", emoji: "😌", active: true, default: true, voice: "cedar" }, { id: "durona", name: "Durona", emoji: "🔥", active: true, default: false, voice: "marin" }];
      if (fn === "app_admin_tutor_set_personality") return (persona.push(args), [{ id: "acolhedor", name: "Tranquilo", emoji: "😌", active: true, default: true }, { id: "durona", name: "Durona", emoji: "🔥", active: args.p_active, default: false }]);
      throw new Error(`rpc inesperada: ${fn}`);
    });
    server["/api/tutor/status"] = () => ({ body: { ready: true, realtime_voice: true, live_voice: true, live_model: "gpt-live-1", live_pending: null, realtime_model: "gpt-realtime-2.1", realtime_pending: null, gemini_voice_model: "gemini-3.8-live", gemini_voice_pending: null } });
    const { AdminTutor } = await import("../novo/app/admin/AdminPanels.jsx");
    render(<AdminTutor />);
    expect(await screen.findByText("Voz e personalidade")).toBeTruthy();
    expect(await screen.findByText(/Gemini pronto no servidor \(gemini-3.8-live\), com sotaque de brasileiro nativo\. GPT-Live: gpt-live-1\./)).toBeTruthy();
    expect(screen.getByText(/Voz em 30 dias: 3 ligação\(ões\) · 4.5 min/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Provedor da voz"), { target: { value: "live" } });
    fireEvent.change(screen.getByLabelText("Voz"), { target: { value: "cedar" } });
    fireEvent.change(screen.getByLabelText("Limite de cada conversa por voz (minutos)"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Nível da Durona"), { target: { value: "moderada" } });
    fireEvent.change(screen.getByLabelText("Pronúncias (uma por linha: termo = como falar)"), { target: { value: "INEP = inépi\nlixo sem igual" } });
    fireEvent.click(screen.getByRole("switch", { name: /^Piadas internas/ }));
    // professores usam o mesmo motivo (sem motivo, ficam travados)
    const durona = () => screen.getByRole("switch", { name: /^🔥 Durona/ }) as HTMLInputElement;
    expect(durona().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Ajuste da voz depois do teste do dono." } });
    fireEvent.click(durona());
    await waitFor(() => expect(persona[0]).toEqual({ p_id: "durona", p_active: false, p_reason: "Ajuste da voz depois do teste do dono." }));
    fireEvent.click(screen.getByText("Salvar Tutor"));
    await waitFor(() => expect(saved.length).toBe(1));
    expect(saved[0].p_config).toMatchObject({ voice_provider: "live", voice_name: "cedar", voice_session_max_seconds: "1200", durona_level: "moderada", inside_jokes: false, save_transcripts: true, pronunciations: [{ term: "INEP", say: "inépi" }] });
    // a voz do professor: só equipe, limites em caracteres e preços vão juntos
    expect(saved[0].p_config).toMatchObject({ tts_team_only: true, tts_trial_daily_chars: "4500", tts_paid_daily_chars: "4500", tts_account_daily_chars: "4500", tts_account_monthly_chars: "30000", tts_price_per_1k_chars_usd: "0", stt_price_per_min_usd: "0" });
    expect((screen.getByRole("switch", { name: /^Salvar o áudio/ }) as HTMLInputElement).disabled).toBe(true); // áudio nunca é gravado
  });

  it("painel do Tutor: só equipe, limites em caracteres e preços salvos com motivo; preço zerado mostra o aviso", async () => {
    const CONFIG = {
      enabled: true, requires_pro: true, daily_message_limit: 40, max_profanity: "moderate", voice_enabled: true, trial_text_daily: 40, trial_questions_daily: 30,
      trial_voice_daily_seconds: 600, trial_voice_total_seconds: 2400, paid_voice_daily_seconds: 3600, voice_provider: "auto", voice_name: null, voice_session_max_seconds: 1800,
      save_transcripts: true, transcript_retention_days: 180, emotion_engine: true, inside_jokes: true, durona_level: "forte", pronunciations: [],
      tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
      tts_price_per_1k_chars_usd: 0, stt_price_per_min_usd: 0.003,
      usage_30d: { students: 0, requests: 0, cost_usd: 0, voice_minutes: 0 }, cost_by_feature: {}, cost_by_persona: {}, sessions: 0,
    };
    const saved: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_tutor_config") return CONFIG;
      if (fn === "app_admin_tutor_save_config") return (saved.push(args), { ...CONFIG, ...Object.fromEntries(Object.entries(args.p_config).map(([k, v]) => [k, typeof v === "string" && /^[\d.]+$/.test(v) ? Number(v) : v])) });
      if (fn === "app_admin_tutor_personalities") return [];
      throw new Error(`rpc inesperada: ${fn}`);
    });
    server["/api/tutor/status"] = () => ({ body: { ready: true } });
    const { AdminTutor } = await import("../novo/app/admin/AdminPanels.jsx");
    render(<AdminTutor />);
    const teamOnly = (await screen.findByRole("switch", { name: /^Voz do professor só para a equipe/ })) as HTMLInputElement;
    expect(teamOnly.checked).toBe(true);
    expect(screen.getByText("Ligado: só administrador e editor ouvem a voz do professor; alunos seguem na voz reserva.")).toBeTruthy();
    expect(screen.getByText("Desligada: só o Chat, por escrito (sem as vozes e sem o microfone).")).toBeTruthy();
    expect(screen.getByText("Preço não preenchido: o custo da voz do professor e da transcrição fica zerado no registro de consumo.")).toBeTruthy();
    expect(screen.getAllByText("900 caracteres = 1 minuto de fala.").length).toBeGreaterThan(0);
    fireEvent.click(teamOnly);
    fireEvent.change(screen.getByLabelText("Voz do professor por dia — teste grátis (caracteres)"), { target: { value: "2700" } });
    fireEvent.change(screen.getByLabelText("Voz do professor por dia — plano pago (caracteres)"), { target: { value: "4500" } });
    fireEvent.change(screen.getByLabelText("Teto da plataforma por dia (caracteres)"), { target: { value: "90000" } });
    fireEvent.change(screen.getByLabelText("Teto da plataforma por mês (caracteres)"), { target: { value: "600000" } });
    fireEvent.change(screen.getByLabelText("Preço da voz do professor (US$ por mil caracteres)"), { target: { value: "0,30" } });
    fireEvent.change(screen.getByLabelText("Preço da transcrição (US$ por minuto)"), { target: { value: "0.003" } });
    const save = screen.getByText("Salvar Tutor").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true); // sem motivo, não salva
    fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Liberar a voz do professor para os alunos." } });
    fireEvent.click(save);
    await waitFor(() => expect(saved.length).toBe(1));
    expect(saved[0]).toMatchObject({ p_reason: "Liberar a voz do professor para os alunos." });
    expect(saved[0].p_config).toMatchObject({ tts_team_only: false, tts_trial_daily_chars: "2700", tts_paid_daily_chars: "4500", tts_account_daily_chars: "90000", tts_account_monthly_chars: "600000", tts_price_per_1k_chars_usd: "0.30", stt_price_per_min_usd: "0.003" });
    await waitFor(() => expect(screen.queryByText(/Preço não preenchido/)).toBeNull());
  });
});
