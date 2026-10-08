/**
 * A conversa da Nexus pela voz do professor (spec §5, §8 e §16 "Turno"): a fala do aluno vai à transcrição e ao motor; a
 * legenda e a emoção aparecem antes do som; o microfone fecha enquanto o professor fala e volta a ouvir sozinho (computador e
 * Android) ou com "Toque para falar" (iPhone e iPad); "Interromper" corta o som e manda o trecho; a letra só marca e
 * "Responder" responde; a rede que cai repete o mesmo client_turn_id; por escrito sem som; microfone negado segue pelo Chat;
 * limite ou aprovação revogada passam para a reserva; falhas com as mensagens exatas; os tempos de cada etapa nas métricas.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
// som do navegador como o de verdade: fechar a tela de voz fecha o contexto; o próximo toque cria outro
const audio = vi.hoisted(() => {
  const make = () => ({
    state: "running", sources: [] as unknown[],
    close() { this.state = "closed"; },
    createAnalyser: () => ({ fftSize: 0, getByteTimeDomainData() {} }),
    createMediaStreamSource(stream: unknown) { this.sources.push(stream); return { connect() {}, disconnect() {} }; },
  });
  const a = { ctx: null as any, get: () => (!a.ctx || a.ctx.state === "closed" ? (a.ctx = make()) : a.ctx) };
  return a;
});
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({
  unlockAudio: () => audio.get(), getAudioContext: () => audio.get(),
  releaseAudioContext: async () => { audio.ctx?.close(); audio.ctx = null; },
}));
vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({
  StaziaVoiceOrb: (p: any) => <div data-testid="orb" data-emotion={p.emotion} data-state={p.conversationState} />,
  orbEmotion: (a: any) => ({ emotion: a ? ({ irritated: "annoyed", firm: "firm" } as any)[a.emotion] ?? a.emotion : "neutral", intensity: 0.5 }),
}));
const live = vi.hoisted(() => ({ starts: 0, sent: [] as string[], error: null as any }));
vi.mock("../novo/app/tutor/useRealtimeVoice.js", () => ({
  realtimeErrorMessage: (e: any) => (e?.kind === "mic" ? "O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço, permita o microfone e tente de novo." : e?.message ?? "erro"),
  useRealtimeVoice: () => ({
    state: live.error ? "error" : "ready", error: live.error, captions: { tutor: "", student: "" }, streams: { input: null, output: null }, muted: false, provider: "realtime", remaining: null,
    start: () => { live.starts++; }, stop: async () => {}, interrupt() {}, sendText: (t: string) => live.sent.push(t), toggleMute() {}, setVolume() {}, active: true,
  }),
}));
// gravação: o teste decide quando a fala termina
const rec = vi.hoisted(() => ({ tap: false, calls: [] as any[], next: null as any }));
vi.mock("../novo/app/tutor/nexus/recorder.js", async () => {
  const actual: any = await vi.importActual("../novo/app/tutor/nexus/recorder.js");
  return {
    ...actual,
    tapToTalkDevice: () => rec.tap,
    startRecording: (opts: any) => {
      const h = { opts, stopped: false, cancelled: false, stop() { this.stopped = true; opts.onDone(rec.next); }, cancel() { this.cancelled = true; opts.onDone(null); } };
      rec.calls.push(h);
      return h;
    },
  };
});
// som: o teste decide quando a fala do professor termina
const player = vi.hoisted(() => ({ plays: [] as { resolve: (v: boolean) => void }[], stops: 0, dead: 0 }));
vi.mock("../novo/app/tutor/voice/audioPlayer.js", () => ({
  base64ToFloat32: () => new Float32Array(),
  AudioPlayer: class {
    stream = { id: "saida" };
    playing = false;
    constructor(public ctx: any) {}
    play() {}
    playEncoded() {
      // num contexto já fechado o som nunca termina (como no navegador)
      if (this.ctx?.state === "closed") return (player.dead++, new Promise<boolean>(() => {}));
      return new Promise<boolean>((resolve) => player.plays.push({ resolve }));
    }
    stop() {
      player.stops++;
      const all = player.plays.splice(0);
      all.forEach((p) => p.resolve(false));
    }
    setVolume() {}
    close() {}
  },
}));

const PERSONALITIES = [
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Descontraído.", swears: false, voice: {} },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Firme.", swears: true, voice: {} },
  { id: "direto", name: "Direto", emoji: "🎯", tagline: "Solto.", swears: true, voice: {} },
];
const ENT = { enabled: true, mode: "paid", is_paid: true, trial: { state: "none", days: 7 }, can_use: true, can_text: true, can_voice: true, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: true, remaining_s: 600 }, questions: { limit: null, used: 0 } };
const status = () => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, voice_enabled: true, reviews_due: 0, entitlement: ENT, preferences: { personality_id: "durona", profanity: "moderate", chosen: true }, personalities: PERSONALITIES });
const nexus = { voice_enabled: true, stt: true, reserve: true, reserve_minutes: 10, minutes_today: 5, professors: PERSONALITIES.map((p) => ({ id: p.id, eleven: true, sample: false, reason: null })) };
const SID = "22222222-2222-4222-8222-222222222222";
const CALL = "33333333-3333-4333-8333-333333333333";
const STATEMENT = "Gestante de 34 semanas com PA de 170 por 110 e cefaleia intensa. Qual a conduta inicial?";
const QUESTION = { id: "q1", exam: null, number: 12, topic: "Obstetrícia", statement: STATEMENT, state: "open", correct_option: null, options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id} do caso` })) };
const session = (over: any = {}) => ({
  id: SID, mode: "livre", title: "Perguntar ao Tutor", topic: null, status: "active", question_state: "none", hint_level: 0, read_only: false, summary: null,
  personality: { id: "durona", name: "Durona", emoji: "🔥", voice: {} }, question: null, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "Chegou. Bora.", grounding: "none" }], ...over,
});
const REPLY = "Pré-eclâmpsia é hipertensão depois de vinte semanas com lesão de órgão. Me diz qual é o próximo passo.";
const STT_TEXT = "Não entendi, pode repetir ou digitar?";
const sayResult = (over: any = {}) => ({ intent: "message", message: { id: 7, content: REPLY, voice_avatar: { emotion: "irritated", intensity: 70 } }, phrase: null, marked: null, tone: null, gate: null, question_state: "none", used_today: 1, daily_limit: 40, ...over });

let rpcImpl: Record<string, (args: any) => any> = {};
let server: Record<string, (body: any, init: any) => any> = {};
const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
let speechGate: (() => Promise<void>) | null = null;

beforeEach(async () => {
  const { NEXUS_TIMING } = await import("../novo/app/tutor/nexus/useNexusVoice.js");
  Object.assign(NEXUS_TIMING, { retryMs: 10, retryForMs: 1000, renewMs: 60_000 });
  calls.length = 0;
  live.starts = 0;
  live.sent.length = 0;
  live.error = null;
  rec.tap = false;
  rec.calls = [];
  rec.next = { blob: new Blob(["fala"], { type: "audio/webm" }), mime: "audio/webm", seconds: 2.5 };
  player.plays = [];
  player.stops = 0;
  player.dead = 0;
  audio.ctx = null;
  speechGate = null;
  (navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }], getAudioTracks: () => [{ stop() {} }] })) };
  rpcImpl = { app_tutor_status: () => status(), app_tutor_sessions: () => [], app_tutor_start: () => session(), app_tutor_session: () => session(), app_tutor_close: () => true };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  server = {
    "/api/tutor/nexus": () => ({ body: nexus }),
    "/api/tutor/voice/open": () => ({ body: { jeito: "eleven", voice_call_id: CALL, mic: true, reason: null, minutes_today: 5, reserve_minutes: 10 } }),
    "/api/tutor/voice/transcribe": () => ({ body: { text: "o que é pré-eclâmpsia" } }),
    "/api/tutor/voice/say": () => ({ body: sayResult() }),
    "/api/tutor/speech": async () => {
      if (speechGate) await speechGate();
      return { audio: true };
    },
    "/api/tutor/voice/renew": () => ({ body: { ok: true, lease_seconds: 120 } }),
    "/api/tutor/voice/end": () => ({ body: { consumed_seconds: 0 } }),
  };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const body = typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body ?? null;
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    calls.push({ url: String(url), body, headers });
    const h = server[String(url)];
    if (!h) return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
    const r = await h(body, init);
    if (r.throw) throw r.throw;
    if (r.audio) return new Response(new Uint8Array([73, 68, 51]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const speechCalls = () => calls.filter((c) => c.url === "/api/tutor/speech");
const sayCalls = () => calls.filter((c) => c.url === "/api/tutor/voice/say");
/** Abre a Nexus com a Durona e deixa o professor terminar a abertura. */
async function openConversation({ finishOpening = true } = {}) {
  const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
  render(<NexusScreen go={vi.fn()} />);
  await screen.findByText("Voz hoje: 5 min");
  fireEvent.click(screen.getByRole("button", { name: /^Começar com/ }));
  const dialog = await screen.findByRole("dialog");
  if (finishOpening) {
    await waitFor(() => expect(player.plays.length).toBe(1));
    expect(speechCalls()[0].body).toEqual({ kind: "message", session_id: SID, message_id: 1 });
    await act(async () => player.plays.shift()!.resolve(true));
  }
  return dialog;
}
const finishSpeaking = async () => {
  await waitFor(() => expect(player.plays.length).toBeGreaterThan(0));
  await act(async () => player.plays.shift()!.resolve(true));
};
const speak = async (text = "o que é pré-eclâmpsia") => {
  server["/api/tutor/voice/transcribe"] = () => ({ body: { text } });
  await waitFor(() => expect(rec.calls.length).toBeGreaterThan(0));
  const h = rec.calls.at(-1);
  // dispara o fim da fala sem esperar a resposta inteira (o teste decide quando o som termina)
  await act(async () => {
    void h.opts.onDone(rec.next);
  });
};

describe("Nexus: a conversa pela voz do professor", () => {
  it("voz do professor: a fala vai à transcrição e ao motor; legenda e emoção antes do som; depois volta a ouvir sozinho", async () => {
    const dialog = await openConversation();
    await waitFor(() => expect(rec.calls).toHaveLength(1));
    expect(rec.calls[0].opts.auto).toBe(true);
    let release!: () => void;
    speechGate = () => new Promise<void>((r) => (release = r));
    await speak();
    const tr = calls.find((c) => c.url === "/api/tutor/voice/transcribe")!;
    expect(tr.headers["x-voice-call-id"]).toBe(CALL);
    expect(tr.headers["x-audio-seconds"]).toBe("2.5");
    await waitFor(() => expect(sayCalls()).toHaveLength(1));
    expect(sayCalls()[0].body).toMatchObject({ voice_call_id: CALL, text: "o que é pré-eclâmpsia" });
    expect(sayCalls()[0].body.client_turn_id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    // legenda e emoção antes do som
    expect(await within(dialog).findByText(REPLY)).toBeInTheDocument();
    expect(within(dialog).getByTestId("orb")).toHaveAttribute("data-emotion", "annoyed");
    expect(player.plays).toHaveLength(0);
    expect(rec.calls).toHaveLength(1); // microfone fechado enquanto o professor responde
    await act(async () => release());
    await finishSpeaking();
    expect(speechCalls().at(-1)!.body).toEqual({ kind: "message", session_id: SID, message_id: 7 });
    await waitFor(() => expect(rec.calls).toHaveLength(2));
    expect(rec.calls[1].opts.auto).toBe(true);
  });

  it("iPhone/iPad: 'Falar' e 'Enviar'; depois do professor, 'Toque para falar'", async () => {
    rec.tap = true;
    const dialog = await openConversation();
    expect(await within(dialog).findByText("Toque para falar")).toBeInTheDocument();
    expect(rec.calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Falar" }));
    await waitFor(() => expect(rec.calls).toHaveLength(1));
    expect(rec.calls[0].opts.auto).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar a fala" }));
    await waitFor(() => expect(sayCalls()).toHaveLength(1));
    await finishSpeaking();
    expect(await within(dialog).findByText("Toque para falar")).toBeInTheDocument();
    expect(rec.calls).toHaveLength(1);
  });

  it("Interromper para o som na hora e manda o trecho como interrupted", async () => {
    const dialog = await openConversation();
    await speak();
    await waitFor(() => expect(player.plays.length).toBe(1));
    fireEvent.click(within(dialog).getByRole("button", { name: "Interromper" }));
    expect(player.stops).toBeGreaterThan(0);
    await waitFor(() => expect(rec.calls).toHaveLength(2));
    await speak("espera, e o sulfato?");
    await waitFor(() => expect(sayCalls()).toHaveLength(2));
    expect(sayCalls()[1].body.interrupted).toBe(REPLY.slice(0, 300));
    expect(sayCalls()[1].body.text).toBe("espera, e o sulfato?");
  });

  it("questão: tocar a B só marca e o professor diz 'Marquei a B…'; Responder responde; o enunciado não vai para /speech", async () => {
    rpcImpl.app_tutor_start = () => session({ mode: "questao", question_state: "open", question: QUESTION, messages: [{ id: 1, role: "tutor", content: "Lê com calma.", grounding: "none" }] });
    rpcImpl.app_tutor_session = () => session({ mode: "questao", question_state: "answered", question: { ...QUESTION, state: "answered", correct_option: "C" }, last_answer: { selected: "B", is_correct: false } });
    const dialog = await openConversation();
    expect(within(dialog).getByText(/Gestante de 34 semanas/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /B\s*Alternativa B do caso/ }));
    await waitFor(() => expect(speechCalls().at(-1)!.body).toEqual({ kind: "phrase", phrase: "marked", letter: "B", personality_id: "durona" }));
    expect(within(dialog).getByText("Marquei a B. Diga confirmo para responder, ou fale outra alternativa.")).toBeInTheDocument();
    expect(sayCalls()).toHaveLength(0);
    await finishSpeaking();
    server["/api/tutor/voice/say"] = () => ({ body: sayResult({ intent: "answer", question_state: "answered", message: { id: 8, content: "Sério isso? A pista estava no enunciado.", voice_avatar: { emotion: "firm", intensity: 30 } } }) });
    fireEvent.click(within(dialog).getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(sayCalls()).toHaveLength(1));
    expect(sayCalls()[0].body).toMatchObject({ command: "answer", option: "B" });
    expect(await within(dialog).findByText("Sério isso? A pista estava no enunciado.")).toBeInTheDocument();
    await finishSpeaking();
    await waitFor(() => expect(within(dialog).getByText(/a correta é C/)).toBeInTheDocument()); // a conversa relida mostra o resultado
    for (const c of speechCalls()) {
      expect(c.body.kind).not.toBe("question");
      expect(JSON.stringify(c.body)).not.toContain("Gestante");
    }
  });

  it("rede caiu no meio do turno: reenvia o mesmo client_turn_id e mostra uma resposta só", async () => {
    let n = 0;
    server["/api/tutor/voice/say"] = () => (++n === 1 ? { throw: new TypeError("Failed to fetch") } : { body: sayResult() });
    const dialog = await openConversation();
    await speak();
    await waitFor(() => expect(sayCalls()).toHaveLength(2));
    expect(sayCalls()[1].body.client_turn_id).toBe(sayCalls()[0].body.client_turn_id);
    expect(await within(dialog).findAllByText(REPLY)).toHaveLength(1);
  });

  it("por escrito: sem /speech; o Chat manda ao motor", async () => {
    server["/api/tutor/voice/open"] = () => ({ body: { jeito: "escrito", voice_call_id: CALL, mic: true, reason: "account_month", minutes_today: 0, reserve_minutes: 0 } });
    const dialog = await openConversation({ finishOpening: false });
    expect(within(dialog).getByText("Por escrito")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir o chat e a transcrição" }));
    fireEvent.change(within(dialog).getByLabelText("Escrever para o Tutor"), { target: { value: "me explica pré-eclâmpsia" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(sayCalls()).toHaveLength(1));
    expect(sayCalls()[0].body).toMatchObject({ text: "me explica pré-eclâmpsia" });
    expect((await within(dialog).findAllByText(REPLY)).length).toBeGreaterThan(0);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(speechCalls()).toHaveLength(0);
  });

  it("sem transcrição no servidor (mic: false): não grava nem diz 'Ouvindo'; o Chat abre para escrever e a resposta sai em voz", async () => {
    server["/api/tutor/voice/open"] = () => ({ body: { jeito: "eleven", voice_call_id: CALL, mic: false, reason: null, minutes_today: 5, reserve_minutes: 10 } });
    const dialog = await openConversation();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(rec.calls).toHaveLength(0);
    expect(within(dialog).queryByText("Ouvindo...")).toBeNull();
    expect(within(dialog).queryByText(/bloqueou o microfone/)).toBeNull();
    expect(within(dialog).getByLabelText("Escrever para o Tutor")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Escrever para o Tutor"), { target: { value: "oi" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(speechCalls().at(-1)!.body).toEqual({ kind: "message", session_id: SID, message_id: 7 }));
    await finishSpeaking();
    expect(rec.calls).toHaveLength(0);
  });

  it("microfone negado: o aviso de hoje e a conversa segue pelo Chat, com resposta em voz", async () => {
    (navigator as any).mediaDevices.getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error("negado"), { name: "NotAllowedError" });
    });
    const dialog = await openConversation();
    expect(await within(dialog).findByText(/O navegador bloqueou o microfone/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Escrever para o Tutor")).toBeInTheDocument(); // o Chat abriu sozinho
    expect(within(dialog).queryByRole("dialog")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Escrever para o Tutor"), { target: { value: "oi" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(sayCalls()).toHaveLength(1));
    await waitFor(() => expect(speechCalls().at(-1)!.body).toEqual({ kind: "message", session_id: SID, message_id: 7 }));
    expect(rec.calls).toHaveLength(0);
  });

  it("limite do dia ou aprovação revogada no meio: passa para a reserva com a mensagem certa e a legenda fica", async () => {
    server["/api/tutor/speech"] = async (body: any) => (body.message_id === 7 ? { status: 429, body: { error: "Você usou sua voz de hoje", code: "voice_student_limit" } } : { audio: true });
    const eleven = server["/api/tutor/voice/open"];
    server["/api/tutor/voice/open"] = (body: any, init: any) => (body.skip === "eleven" ? { body: { jeito: "reserva", voice_call_id: null, mic: true, reason: "student_limit", minutes_today: 0, reserve_minutes: 10 } } : eleven(body, init));
    const dialog = await openConversation();
    await speak();
    expect(await screen.findByText("Você usou sua voz de hoje")).toBeInTheDocument();
    await waitFor(() => expect(live.starts).toBe(1));
    expect(calls.filter((c) => c.url === "/api/tutor/voice/open")[1].body).toEqual({ session_id: SID, force: true, skip: "eleven" }); // o servidor escolhe o jeito
    expect(calls.findIndex((c) => c.url === "/api/tutor/voice/end")).toBeLessThan(calls.map((c) => c.url).lastIndexOf("/api/tutor/voice/open")); // a chamada da voz do professor fecha antes
    const now = screen.getByRole("dialog");
    expect(within(now).getByText("Voz reserva")).toBeInTheDocument();
    expect(within(now).getByText(REPLY)).toBeInTheDocument();
    expect(dialog).toBeTruthy();
    // aprovação revogada no meio: a mesma passagem, com o aviso de voz indisponível
    cleanup();
    live.starts = 0;
    server["/api/tutor/speech"] = async (body: any) => (body.message_id === 7 ? { status: 409, body: { error: "A voz do professor não está disponível agora.", code: "voice_unavailable" } } : { audio: true });
    await openConversation();
    await speak();
    expect(await screen.findByText("A voz do professor não está disponível agora.")).toBeInTheDocument();
    await waitFor(() => expect(live.starts).toBe(1));
  });

  it("transcrição falhou: 'Não entendi, pode repetir ou digitar?' e o Chat abre; motor falhou: 'O professor não conseguiu responder, tente de novo'", async () => {
    server["/api/tutor/voice/transcribe"] = () => ({ status: 502, body: { error: "Não entendi, pode repetir ou digitar?", code: "stt_failed" } });
    const dialog = await openConversation();
    await waitFor(() => expect(rec.calls).toHaveLength(1));
    await act(async () => {
      void rec.calls[0].opts.onDone(rec.next);
    });
    expect(await within(dialog).findByText("Não entendi, pode repetir ou digitar?")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Escrever para o Tutor")).toBeInTheDocument();
    expect(sayCalls()).toHaveLength(0);
    server["/api/tutor/voice/say"] = () => ({ status: 502, body: { error: "O professor não conseguiu responder, tente de novo" } });
    fireEvent.change(within(dialog).getByLabelText("Escrever para o Tutor"), { target: { value: "oi" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    expect(await within(dialog).findByText("O professor não conseguiu responder, tente de novo")).toBeInTheDocument();
  });

  it("Conversa por voz desligada no painel: sem chamada, o Chat manda ao motor pela rota de texto e o cartão responde", async () => {
    rpcImpl.app_tutor_status = () => ({ ...status(), voice_enabled: false });
    rpcImpl.app_tutor_start = () => session({ mode: "questao", question_state: "open", question: QUESTION, messages: [{ id: 1, role: "tutor", content: "Lê com calma.", grounding: "none" }] });
    rpcImpl.app_tutor_answer = () => ({ ok: true });
    rpcImpl.app_tutor_session = () => session({ mode: "questao", question_state: "answered", question: { ...QUESTION, state: "answered", correct_option: "C" }, last_answer: { selected: "B", is_correct: false } });
    server["/api/tutor/nexus"] = () => ({ body: { ...nexus, voice_enabled: false, reserve: false, professors: nexus.professors.map((p) => ({ ...p, eleven: false, reason: "voice_disabled" })) } });
    server["/api/tutor/voice/open"] = () => ({ body: { jeito: "escrito", voice_call_id: null, mic: false, reason: "voice_off", minutes_today: 0, reserve_minutes: 0 } });
    server["/api/tutor/turn"] = (body: any) => ({ body: { message: { id: body.action === "react" ? 9 : 8, content: body.action === "react" ? "Errou. A pista estava no enunciado." : REPLY }, question_state: body.action === "react" ? "answered" : "open", gate: null, tone: null, used_today: 1, daily_limit: 40 } });
    const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
    render(<NexusScreen go={vi.fn()} />);
    await screen.findByText("Professor por escrito hoje");
    fireEvent.click(screen.getByRole("button", { name: /^Começar com/ }));
    const dialog = await screen.findByRole("dialog");
    const input = await within(dialog).findByLabelText("Escrever para o Tutor");
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "me explica pré-eclâmpsia" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/tutor/turn")).toHaveLength(1));
    expect(calls.find((c) => c.url === "/api/tutor/turn")!.body).toEqual({ session_id: SID, action: "message", text: "me explica pré-eclâmpsia" });
    expect((await within(dialog).findAllByText(REPLY)).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Fechar o chat" }).at(-1)!);
    fireEvent.click(within(dialog).getByRole("radio", { name: /B\s*Alternativa B do caso/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/tutor/turn")).toHaveLength(2));
    expect(backend.rpc).toHaveBeenCalledWith("app_tutor_answer", { p_session_id: SID, p_option: "B", p_confidence: null, p_response_ms: null, p_first_pick: null });
    expect(calls.filter((c) => c.url === "/api/tutor/turn")[1].body).toEqual({ session_id: SID, action: "react" });
    expect((await within(dialog).findAllByText("Errou. A pista estava no enunciado.")).length).toBeGreaterThan(0);
    await waitFor(() => expect(within(dialog).getByText(/a correta é C/)).toBeInTheDocument());
    expect(sayCalls()).toHaveLength(0);
    expect(speechCalls()).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("tocar uma alternativa enquanto o microfone ouve: a gravação para antes do 'Marquei a B…' e só volta depois (sem eco)", async () => {
    rpcImpl.app_tutor_start = () => session({ mode: "questao", question_state: "open", question: QUESTION, messages: [{ id: 1, role: "tutor", content: "Lê com calma.", grounding: "none" }] });
    const dialog = await openConversation();
    await waitFor(() => expect(rec.calls).toHaveLength(1)); // ouvindo sozinho
    fireEvent.click(within(dialog).getByRole("radio", { name: /B\s*Alternativa B do caso/ }));
    await waitFor(() => expect(player.plays.length).toBe(1)); // o professor diz "Marquei a B…"
    expect(rec.calls[0].cancelled).toBe(true);
    expect(rec.calls).toHaveLength(1); // nenhuma gravação nova enquanto ele fala
    expect(calls.filter((c) => c.url === "/api/tutor/voice/transcribe")).toHaveLength(0);
    await finishSpeaking();
    await waitFor(() => expect(rec.calls).toHaveLength(2)); // depois volta a ouvir
  });

  it("escrever pelo Chat enquanto o microfone ouve: a gravação para e não volta antes da resposta do professor", async () => {
    const dialog = await openConversation();
    await waitFor(() => expect(rec.calls).toHaveLength(1));
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir o chat e a transcrição" }));
    fireEvent.change(within(dialog).getByLabelText("Escrever para o Tutor"), { target: { value: "oi" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(player.plays.length).toBe(1)); // a resposta do professor tocando
    expect(rec.calls[0].cancelled).toBe(true);
    expect(rec.calls).toHaveLength(1);
    await finishSpeaking();
    await waitFor(() => expect(rec.calls).toHaveLength(2));
  });

  it("segunda conversa na mesma visita (Conversar de novo): a voz toca no som novo, o microfone novo é medido e nada da primeira fica", async () => {
    const dialog = await openConversation();
    await speak();
    await finishSpeaking(); // a Durona respondeu irritada
    await waitFor(() => expect(within(dialog).getByTestId("orb").dataset.emotion).toBe("annoyed"));
    const firstCtx = audio.ctx;
    rpcImpl.app_tutor_session = () => session({ status: "closed" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Encerrar a conversa por voz" }));
    expect(await screen.findByText("Conversa encerrada")).toBeInTheDocument();
    expect(firstCtx.state).toBe("closed"); // a tela de voz fechou o som ao sair
    rpcImpl.app_tutor_session = () => session();
    fireEvent.click(screen.getByRole("button", { name: /^Conversar de novo com/ }));
    const second = await screen.findByRole("dialog");
    expect(within(second).getByTestId("orb").dataset.emotion).toBe("neutral");
    await waitFor(() => expect(player.plays.length).toBe(1)); // a abertura toca
    expect(player.dead).toBe(0);
    await act(async () => player.plays.shift()!.resolve(true));
    await waitFor(() => expect(rec.calls.length).toBeGreaterThan(1)); // volta a ouvir
    expect(audio.ctx).not.toBe(firstCtx);
    expect(audio.ctx.sources).toHaveLength(1); // o microfone desta conversa é medido no som novo
  });

  it("a chamada acabou no servidor (aparelho dormiu): avisa sem 'Não entendi', e 'Conversar de novo' reabre outra chamada", async () => {
    const dialog = await openConversation();
    server["/api/tutor/voice/transcribe"] = () => ({ status: 409, body: { error: "A conversa por voz foi encerrada." } });
    await waitFor(() => expect(rec.calls).toHaveLength(1));
    await act(async () => {
      void rec.calls[0].opts.onDone(rec.next);
    });
    expect(await within(dialog).findByText("A conversa por voz foi encerrada.")).toBeInTheDocument();
    expect(within(dialog).queryByText(STT_TEXT)).toBeNull();
    const NEW_CALL = "44444444-4444-4444-8444-444444444444";
    server["/api/tutor/voice/open"] = () => ({ body: { jeito: "eleven", voice_call_id: NEW_CALL, mic: true, reason: null, minutes_today: 5, reserve_minutes: 10 } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Conversar de novo" }));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/tutor/voice/open")).toHaveLength(2));
    expect(calls.filter((c) => c.url === "/api/tutor/voice/open")[1].body).toEqual({ session_id: SID, force: true }); // o toque é "continuar aqui"
    await finishSpeaking();
    await speak("voltei");
    await waitFor(() => expect(sayCalls()).toHaveLength(1));
    expect(sayCalls()[0].body.voice_call_id).toBe(NEW_CALL);
  });

  it("outra aba assumiu a conversa: a renovação para e avisa; nada mais vai ao servidor por esta aba", async () => {
    const { NEXUS_TIMING } = await import("../novo/app/tutor/nexus/useNexusVoice.js");
    NEXUS_TIMING.renewMs = 20;
    server["/api/tutor/voice/renew"] = () => ({ body: { stop: true, reason: "replaced", message: "A conversa por voz foi encerrada." } });
    const dialog = await openConversation();
    expect(await within(dialog).findByText("A conversa continuou em outra aba ou aparelho.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Conversar de novo" })).toBeInTheDocument();
    expect(rec.calls.every((h) => h.cancelled || h.stopped)).toBe(true);
  });

  it("a voz do professor parou e a reserva não roda: a conversa segue por escrito, com o aviso, e o Chat manda ao motor", async () => {
    const ESC = "55555555-5555-4555-8555-555555555555";
    server["/api/tutor/speech"] = async (body: any) => (body.message_id === 7 ? { status: 429, body: { error: "Você usou sua voz de hoje", code: "voice_student_limit" } } : { audio: true });
    const eleven = server["/api/tutor/voice/open"];
    server["/api/tutor/voice/open"] = (body: any, init: any) => (body.skip === "eleven" ? { body: { jeito: "escrito", voice_call_id: ESC, mic: true, reason: "student_limit", minutes_today: 0, reserve_minutes: 0 } } : eleven(body, init));
    const dialog = await openConversation();
    await speak();
    expect(await within(dialog).findByText("Por escrito")).toBeInTheDocument();
    expect(within(dialog).getByText("Você usou sua voz de hoje")).toBeInTheDocument();
    expect(live.starts).toBe(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir o chat e a transcrição" }));
    const input = within(dialog).getByLabelText("Escrever para o Tutor");
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "segue por escrito" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(sayCalls().at(-1)!.body).toMatchObject({ voice_call_id: ESC, text: "segue por escrito" }));
  });

  it("na reserva sem microfone ou sem tempo ao vivo: 'Escrever pelo Chat' passa para por escrito e o Chat manda ao motor", async () => {
    const ESC = "66666666-6666-4666-8666-666666666666";
    server["/api/tutor/voice/open"] = (body: any) => (body.skip === "voice"
      ? { body: { jeito: "escrito", voice_call_id: ESC, mic: true, reason: null, minutes_today: 0, reserve_minutes: 0 } }
      : { body: { jeito: "reserva", voice_call_id: null, mic: true, reason: "not_approved", minutes_today: 5, reserve_minutes: 10 } });
    live.error = { kind: "quota", message: "Você atingiu seu limite de voz de hoje." };
    const dialog = await openConversation({ finishOpening: false });
    expect(within(dialog).getByText("Você atingiu seu limite de voz de hoje.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Escrever pelo Chat" }));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/tutor/voice/open")).toHaveLength(2));
    expect(calls.filter((c) => c.url === "/api/tutor/voice/open")[1].body).toEqual({ session_id: SID, force: true, skip: "voice" });
    expect(await within(dialog).findByText("Por escrito")).toBeInTheDocument();
    const input = within(dialog).getByLabelText("Escrever para o Tutor");
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "oi" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(sayCalls().at(-1)!.body).toMatchObject({ voice_call_id: ESC, text: "oi" }));
  });

  it("os tempos de cada etapa vão nas métricas ao encerrar", async () => {
    const dialog = await openConversation();
    await speak();
    await finishSpeaking();
    rpcImpl.app_tutor_session = () => session({ status: "closed" }); // depois de encerrar, o banco devolve a conversa fechada
    fireEvent.click(within(dialog).getByRole("button", { name: "Encerrar a conversa por voz" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/tutor/voice/end")).toBe(true));
    const end = calls.find((c) => c.url === "/api/tutor/voice/end")!.body;
    expect(end).toMatchObject({ voice_call_id: CALL, reason: "student" });
    for (const k of ["stt_ms_avg", "engine_ms_avg", "tts_ms_avg", "play_start_ms_avg"]) expect(typeof end.metrics[k], k).toBe("number");
    expect(await screen.findByText("Conversa encerrada")).toBeInTheDocument();
  });
});
