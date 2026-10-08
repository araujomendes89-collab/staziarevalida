/**
 * Tutor v2 na tela (jsdom): voz em tempo real (WebRTC e OpenAI simulados), o painel do Tutor aberto de outras telas, pedido de
 * resolução, encerramento com resumo e o relatório ("O Tutor percebeu"). O servidor é simulado; a lógica real está em tutorV2.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TUTOR_SPOKEN_LANGUAGE, TUTOR_SPOKEN_REMINDER } from "../shared/tutor/voiceLanguage";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));

// WebRTC e microfone simulados
const sent: any[] = [];
let dc: any = null;
let micDenied = false;
class FakePC {
  connectionState = "new";
  ontrack: any; onconnectionstatechange: any;
  createDataChannel() {
    dc = { readyState: "open", send: (m: string) => sent.push(JSON.parse(m)), close() {}, onmessage: null as any, onopen: null as any };
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
    if (micDenied) throw Object.assign(new Error("negado"), { name: "NotAllowedError" });
    const track = { enabled: true, stop() {} };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  },
};
(globalThis as any).Audio = class { autoplay = false; srcObject: any = null; play() { return Promise.resolve(); } pause() {} };
(globalThis as any).SpeechSynthesisUtterance = class {};
(window as any).speechSynthesis = { getVoices: () => [], cancel() {}, speak() {} };

const PERSONALITIES = [
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Descontraído", swears: false, voice: {} },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Escrachada", swears: true, voice: {} },
  { id: "direto", name: "Direto", emoji: "🎯", tagline: "Objetivo", swears: false, voice: {} },
];
const ENT = { enabled: true, mode: "paid", is_paid: true, trial: { state: "none", days: 7 }, can_use: true, can_text: true, can_voice: true, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: true, remaining_today_s: 3600, remaining_s: 3600 }, questions: { limit: null } };
const status = (over: any = {}) => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, voice_enabled: true, reviews_due: 0, entitlement: ENT, preferences: { personality_id: "durona", profanity: "moderate", chosen: true }, personalities: PERSONALITIES, ...over });
const QUESTION = { id: "q1", number: 12, area: "PEDIATRIA", topic: "Bronquiolite", exam: { kind: "REVALIDA", year: 2022, semester: 1 }, statement: "Lactente com sibilância. Qual a conduta?", options: [{ id: "A", text: "Oxigênio" }, { id: "B", text: "Salbutamol" }, { id: "C", text: "Antibiótico" }, { id: "D", text: "Corticoide" }], state: "open", correct_option: null };
const session = (over: any = {}) => ({
  id: "22222222-2222-4222-8222-222222222222", mode: "questao", title: "Bronquiolite", topic: null, status: "active", question_state: "open", hint_level: 0, difficulty_level: 3, intensity: 3,
  personality: { id: "durona", name: "Durona", emoji: "🔥", voice: {} }, question: QUESTION, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "Questão na mesa. Lê direito.", grounding: "none" }], ...over,
});

let rpcImpl: Record<string, (args: any) => any> = {};
let server: Record<string, (body: any, init: any) => { status?: number; body?: any; headers?: Record<string, string>; text?: string }> = {};
const calls: { url: string; body: any; headers: any }[] = [];

beforeEach(() => {
  sent.length = 0;
  calls.length = 0;
  dc = null;
  micDenied = false;
  rpcImpl = { app_tutor_status: () => status(), app_tutor_sessions: () => [], app_tutor_start: () => session(), app_tutor_session: () => session() };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  server = {
    "/api/tutor/status": () => ({ body: { ready: true, simulated: false, neural_voice: false, realtime_voice: true } }),
    // Nexus: sem voz do professor aprovada, a conversa abre na voz reserva (a voz ao vivo)
    "/api/tutor/nexus": () => ({ body: { voice_enabled: true, stt: false, reserve: true, reserve_minutes: 60, minutes_today: 0, professors: PERSONALITIES.map((p) => ({ id: p.id, eleven: false, sample: false, reason: "not_approved" })) } }),
    "/api/tutor/voice/open": () => ({ body: { jeito: "reserva", voice_call_id: null, mic: true, reason: "not_approved", minutes_today: 0, reserve_minutes: 60 } }),
    "/api/tutor/voice/start": () => ({ body: { voice_call_id: "33333333-3333-4333-8333-333333333333", client_secret: "ek_temporario", model: "m", lease_seconds: 120, entitlement: { voice: { remaining_s: 540 } } } }),
    "https://api.openai.com/v1/realtime/calls": () => ({ text: "v=0 answer", headers: { Location: "/v1/realtime/calls/rtc_123" } }),
    "/api/tutor/voice/renew": () => ({ body: { stop: false, lease_seconds: 120, remaining_s: 500 } }),
    "/api/tutor/voice/tool": (b) => ({ body: { output: { question: { id: "q1", state: "open", official_answer: null }, asked: b.name } } }),
    "/api/tutor/voice/transcript": () => ({ body: { correction: null } }),
    "/api/tutor/voice/usage": () => ({ body: { estimated_cost_usd: 0.01 } }),
    "/api/tutor/voice/end": () => ({ body: { consumed_seconds: 30 } }),
    "/api/tutor/turn": () => ({ body: { message: { id: 9, role: "tutor", content: "A certa é a A: hipoxemia vem antes.", spoken: "x", grounding: "question", sources: [], hint_level: 5, suggested: [], notice: null }, question_state: "revealed", used_today: 1, daily_limit: 40 } }),
  };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const body = init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body ?? null;
    calls.push({ url: String(url), body, headers: init.headers ?? {} });
    const h = server[String(url)];
    if (!h) return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
    const r = h(body, init);
    if (r.text !== undefined) return new Response(r.text, { status: r.status ?? 201, headers: r.headers });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json", ...(r.headers ?? {}) } });
  });
});
afterEach(cleanup);

const load = async () => (await import("../novo/app/tutor/nexus/NexusScreen.jsx")).NexusScreen as any;
const urls = () => calls.map((c) => c.url);
/** A Nexus abre na voz reserva (a voz ao vivo): "Começar com …". */
const begin = async () => {
  const NexusScreen = await load();
  render(<NexusScreen go={() => {}} />);
  await waitFor(() => expect(urls()).toContain("/api/tutor/status"));
  fireEvent.click(await screen.findByRole("button", { name: /^Começar com/ }));
};
const emit = (ev: unknown) => dc.onmessage({ data: JSON.stringify(ev) });

describe("Voz em tempo real na tela", () => {
  it("abre pelo servidor (segredo temporário), conecta direto na OpenAI, executa ferramentas pelo servidor, mostra a fala e permite interromper", async () => {
    await begin();
    await waitFor(() => expect(urls()).toContain("https://api.openai.com/v1/realtime/calls"));
    expect(calls.find((c) => c.url === "/api/tutor/voice/start")!.body).toEqual({ session_id: session().id, force: false });
    const sdp = calls.find((c) => c.url.startsWith("https://api.openai.com"))!;
    expect(sdp.headers).toMatchObject({ Authorization: "Bearer ek_temporario", "Content-Type": "application/sdp" }); // só o segredo temporário
    expect(sdp.body).toBe("v=0 offer");
    dc.onopen();
    emit({ type: "session.created", session: { instructions: `${TUTOR_SPOKEN_LANGUAGE}\n\nRegras médicas e personalidade.\n\n${TUTOR_SPOKEN_REMINDER}` } });
    // a conversa por voz abre em tela cheia (Stazia Voice Mode)
    expect(await screen.findByRole("dialog", { name: "Nexus" })).toBeTruthy();
    expect(await screen.findByText("Ouvindo...")).toBeTruthy();
    expect(sent[0]).toEqual({ type: "response.create" }); // o professor abre a conversa
    // ferramenta pedida pela voz: o servidor executa e o resultado volta pelo canal
    emit({ type: "response.done", response: { output: [{ type: "function_call", call_id: "c1", name: "get_question_context", arguments: "{}" }], usage: { total_tokens: 10 } } });
    await waitFor(() => expect(sent.some((m) => m.type === "conversation.item.create" && m.item.call_id === "c1")).toBe(true));
    expect(calls.find((c) => c.url === "/api/tutor/voice/tool")!.body).toMatchObject({ voice_call_id: "33333333-3333-4333-8333-333333333333", name: "get_question_context" });
    expect(JSON.parse(sent.find((m) => m.item?.call_id === "c1").item.output)).toMatchObject({ asked: "get_question_context" });
    expect(sent.at(-1)).toEqual({ type: "response.create" });
    expect(urls()).toContain("/api/tutor/voice/usage");
    // a fala do professor aparece como mensagem e vai para a conferência no servidor
    emit({ type: "output_audio_buffer.started" });
    emit({ type: "response.output_audio_transcript.done", transcript: "Tem certeza? Olha o comando." });
    expect((await screen.findAllByText("Tem certeza? Olha o comando.")).length).toBeGreaterThan(0); // legenda e conversa
    expect(calls.find((c) => c.url === "/api/tutor/voice/transcript")!.body).toMatchObject({ role: "tutor", text: "Tem certeza? Olha o comando." });
    fireEvent.click(await screen.findByText("Interromper"));
    expect(sent.slice(-2)).toEqual([{ type: "response.cancel" }, { type: "output_audio_buffer.clear" }]);
    // encerrar: a tela de voz fecha e o servidor registra o fim (com as métricas da ligação)
    fireEvent.click(screen.getByLabelText("Encerrar a conversa por voz"));
    await waitFor(() => expect(urls()).toContain("/api/tutor/voice/end"));
    expect(calls.find((c) => c.url === "/api/tutor/voice/end")!.body).toMatchObject({ reason: "student", metrics: { provider_used: "realtime", mic_permission: "granted", tools: 1 } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nexus" })).toBeNull());
  });

  it("o servidor achou algo errado no que foi dito: o professor recebe a correção na hora", async () => {
    server["/api/tutor/voice/transcript"] = () => ({ body: { correction: "CORREÇÃO OBRIGATÓRIA: você adiantou a resposta." } });
    await begin();
    await waitFor(() => expect(dc).not.toBeNull());
    await waitFor(() => expect(urls()).toContain("https://api.openai.com/v1/realtime/calls"));
    dc.onopen();
    emit({ type: "session.created", session: { instructions: `${TUTOR_SPOKEN_LANGUAGE}\n\nRegras médicas e personalidade.\n\n${TUTOR_SPOKEN_REMINDER}` } });
    emit({ type: "response.output_audio_transcript.done", transcript: "A resposta é A." });
    await waitFor(() => expect(sent.some((m) => m.item?.role === "system" && /adiantou a resposta/.test(m.item.content[0].text))).toBe(true));
  });

  it("microfone negado, voz aberta em outro aparelho e cota: sempre uma explicação e uma saída", async () => {
    micDenied = true;
    await begin();
    expect(await screen.findByText(/O navegador bloqueou o microfone/)).toBeTruthy();
    expect(calls.find((c) => c.url === "/api/tutor/voice/end")!.body).toMatchObject({ reason: "error" }); // não conectou: não cobra
    cleanup();
    micDenied = false;
    let starts = 0;
    server["/api/tutor/voice/start"] = (b) => (++starts === 1 ? { status: 409, body: { error: "Já existe uma conversa por voz aberta em outro aparelho ou aba.", code: "busy" } } : { body: { voice_call_id: "33333333-3333-4333-8333-333333333333", client_secret: "ek_temporario", lease_seconds: 120, force: b.force } });
    await begin();
    expect(await screen.findByText(/aberta em outro aparelho/)).toBeTruthy();
    fireEvent.click(screen.getByText("Assumir aqui"));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/tutor/voice/start").at(-1)!.body).toEqual({ session_id: session().id, force: true }));
    cleanup();
    server["/api/tutor/voice/start"] = () => ({ status: 429, body: { error: "Você atingiu seu limite de voz de hoje. O acesso é renovado amanhã.", code: "voice_quota" } });
    await begin();
    expect(await screen.findByText("Você atingiu seu limite de voz de hoje. O acesso é renovado amanhã.")).toBeTruthy();
  });
});

describe("Tutor fora da tela do Tutor, resolução, encerramento e relatório", () => {
  it("o botão em outra tela abre a Nexus por cima com a questão (o aluno não copia nada; a conversa só começa no Começar); fora do app, o botão não aparece", async () => {
    const { TutorDockProvider, TutorButton } = await import("../novo/app/tutor/TutorDrawer.jsx");
    const started: any[] = [];
    rpcImpl.app_tutor_start = (a) => (started.push(a), session({ mode: "livre", question_state: "answered", question: { ...QUESTION, state: "answered", correct_option: "A" }, messages: [{ id: 1, role: "tutor", content: "A B, é? Me convence: por que essa?", grounding: "none" }] }));
    const { container } = render(<TutorButton request={{ mode: "livre", questionId: "q1" }} />);
    expect(container.textContent).toBe("");
    render(
      <TutorDockProvider>
        <TutorButton request={{ mode: "livre", questionId: "q1", context: { type: "question", id: "q1" } }} />
      </TutorDockProvider>
    );
    fireEvent.click(screen.getByText("Discutir com o Tutor"));
    const overlay = await screen.findByRole("dialog", { name: "Nexus" });
    expect(await within(overlay).findByRole("heading", { name: "Escolha seu professor" })).toBeTruthy();
    expect(started).toEqual([]); // Nexus (2026-10-08): nada começa antes do "Começar", com o professor escolhido
    fireEvent.click(within(overlay).getByRole("button", { name: /^Começar com/ }));
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]).toMatchObject({ p_mode: "livre", p_topic: null, p_question_id: "q1", p_context: { type: "question", id: "q1" } });
    // a conversa abre por cima; encerrar mostra o resumo e "Fechar" volta para a tela de baixo
    fireEvent.click(await screen.findByLabelText("Encerrar a conversa por voz"));
    fireEvent.click(await screen.findByLabelText("Fechar o Tutor"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("teste acabado: o painel explica em vez de abrir", async () => {
    const { TutorDockProvider, TutorButton } = await import("../novo/app/tutor/TutorDrawer.jsx");
    rpcImpl.app_tutor_status = () => status({ available: false, entitlement: { ...ENT, mode: "blocked", can_use: false, block_reason: "trial_expired" } });
    render(
      <TutorDockProvider>
        <TutorButton request={{ mode: "perguntas", context: { type: "weak_points" } }} label="Me teste" />
      </TutorDockProvider>
    );
    fireEvent.click(screen.getByText("Me teste"));
    expect(await screen.findByText("Seu teste grátis do Tutor terminou")).toBeTruthy();
  });

  it("cartão da questão na voz reserva: 'Ver resolução' pede pela voz; Encerrar fecha e mostra o resumo feito pelos dados", async () => {
    let current = session();
    rpcImpl.app_tutor_session = () => current;
    rpcImpl.app_tutor_close = () => {
      current = session({ status: "closed", question_state: "revealed", summary: { questions_answered: 3, correct: 2, concepts_mastered: ["Bronquiolite"], errors_detected: [{ error_type: "priority_of_management" }], recurrent_errors: ["priority_of_management"], needs_review: ["Asma"], next_recommended_topics: ["Sepse"] } });
      return true;
    };
    await begin();
    await waitFor(() => expect(urls()).toContain("https://api.openai.com/v1/realtime/calls"));
    dc.onopen();
    emit({ type: "session.created", session: { instructions: `${TUTOR_SPOKEN_LANGUAGE}\n\nRegras médicas e personalidade.\n\n${TUTOR_SPOKEN_REMINDER}` } });
    const dialog = await screen.findByRole("dialog", { name: "Nexus" });
    expect(within(dialog).getByText(/Lactente com sibilância/)).toBeTruthy(); // o enunciado fica na tela (e não é lido)
    fireEvent.click(within(dialog).getByRole("button", { name: "Ver resolução" }));
    await waitFor(() => expect(JSON.stringify(sent)).toContain("Me mostra a resolução."));
    fireEvent.click(within(dialog).getByLabelText("Encerrar a conversa por voz"));
    expect(await screen.findByText("2 de 3 questões certas.")).toBeTruthy();
    expect(screen.getByText("Erros que já se repetiram: Prioridade da conduta.")).toBeTruthy();
    expect(screen.getByText("Próximos temas sugeridos: Sepse.")).toBeTruthy();
  });

  it("trava do professor: depois de um erro repetido, a próxima questão só libera quando o aluno explica o raciocínio", async () => {
    rpcImpl.app_tutor_start = () => session({ question_state: "answered", question: { ...QUESTION, state: "answered", correct_option: "A" }, last_answer: { selected: "B", is_correct: false }, gate: "explain" });
    await begin();
    const dialog = await screen.findByRole("dialog", { name: "Nexus" });
    expect(within(dialog).getByText("Antes da próxima: explique ao professor o seu raciocínio nesta questão.")).toBeTruthy();
    expect((within(dialog).getByText("Próxima").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText("Você marcou B; a correta é A")).toBeTruthy();
  });

  it("relatório: 'O Tutor percebeu' com o número de casos; erros que se repetem; sessões", async () => {
    rpcImpl.app_tutor_report = () => ({
      mastery: { areas: [{ area: "PEDIATRIA", level: "FRACO", attempts: 30, accuracy: 50 }], subareas: [] }, critical_topics: [], highest_risk_area: "PEDIATRIA",
      evolution: { last_30: { attempts: 10, correct: 6 }, previous_30: { attempts: 0, correct: 0 } }, reviews: { due: 1, scheduled: 3 },
      tutor: { answers: 5, correct: 2, lucky_guesses: 0, with_heavy_hints: 0, wrong_but_sure: 1, avg_hints: 1, error_classes: {} },
      sessions: { count: 4, minutes: 52, voice_minutes: 10, questions_discussed: 9 },
      error_types: { priority_of_management: 4, diagnostic_reasoning: 1 },
      recurrent_errors: [{ error_type: "priority_of_management", knowledge_gap: "estabilizar antes de investigar", times: 3 }],
      insights: [{ text: "Você identifica o diagnóstico, mas tem perdido questões quando o comando pede a conduta.", evidence: 5 }],
    });
    const { ReportScreen } = await import("../novo/app/tutor/ReportScreen.jsx");
    render(<ReportScreen go={() => {}} />); // o relatório fica em /analise
    expect(await screen.findByText("O Tutor percebeu")).toBeTruthy();
    expect(screen.getByText(/comando pede a conduta/)).toBeTruthy();
    expect(screen.getByText("(5 casos)")).toBeTruthy();
    expect(screen.getByText("Prioridade da conduta: estabilizar antes de investigar · 3×")).toBeTruthy();
    expect(screen.getByText(/4 sessões · 52 min de estudo \(10 por voz\) · 9 questões discutidas/)).toBeTruthy();
  });
});
