/**
 * Relato do aluno (19/10, vídeo): no Tutor por VOZ AO VIVO, o cartão da questão mostrava "Você acertou" e "Próxima", e tocar em
 * "Próxima" não fazia nada; e não havia como voltar para a questão (só "Encerrar").
 *
 * (1) O cartão acompanha a conversa no servidor. A própria voz responde e abre a próxima questão pelas ferramentas (submit_answer,
 *     next_question); a tela relê a conversa depois delas. "Próxima" recusado relê a conversa e, se o servidor já está noutra
 *     questão, o cartão pula para ela; senão, o motivo aparece NO CARTÃO (antes ficava atrás do aviso de minutos). Um toque só
 *     enquanto carrega.
 * (2) "Voltar" na conversa por voz: por cima da questão (treino, Plano de Hoje, Caderno de erros...), volta para a MESMA questão sem
 *     remontar nada (resposta, correção e tempo ficam) e sem encerrar a conversa; pela página do Tutor, volta para a tela anterior.
 *
 * Nada de IA: o módulo do Gemini e a ligação da OpenAI são simulados; o "servidor" é um banco de mentira com as regras do banco real
 * (app_tutor_next_question recusa com a questão aberta; tutor_next_for troca a questão da conversa).
 */
import React from "react";
import { act } from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student", profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({ StaziaVoiceOrb: () => <div data-testid="orb" />, orbEmotion: () => ({ emotion: "neutral", intensity: 0.5 }) }));
vi.mock("../novo/app/tutor/personagens/PersonagemTutor.jsx", () => ({ PersonagemTutor: () => <div data-testid="orb" /> }));

// módulo do Gemini simulado: o teste dispara o que a voz mandaria (inclusive as ferramentas)
const gem = { texts: [] as string[], tools: [] as any[], closed: 0 };
const opened: any[] = [];
vi.mock("../novo/app/tutor/voice/geminiLive.js", () => ({
  openGeminiLive: async (args: any) => {
    opened.push(args);
    return {
      outputStream: { id: "voz-do-professor" },
      sendText: (t: string) => gem.texts.push(t),
      respondTools: (r: any) => gem.tools.push(r),
      mute() {},
      interrupt() {},
      setVolume() {},
      close: () => gem.closed++,
    };
  },
}));

// WebRTC e microfone simulados (caminho da OpenAI)
const sent: any[] = [];
let dc: any = null;
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
    const track = { enabled: true, stop() {} };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  },
};
(globalThis as any).Audio = class { autoplay = false; srcObject: any = null; play() { return Promise.resolve(); } pause() {} };
(globalThis as any).SpeechSynthesisUtterance = class {};
(window as any).speechSynthesis = { getVoices: () => [], cancel() {}, speak() {} };

const PERSONALITIES = [{ id: "durona", name: "Durona", emoji: "🔥", tagline: "Escrachada", swears: true, voice: {} }];
const ENT = { enabled: true, mode: "trial", is_paid: false, trial: { state: "active", days: 7 }, can_use: true, can_text: true, can_voice: true, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: true, remaining_today_s: 60, remaining_s: 60, remaining_total_s: 60 }, questions: { limit: 30, used: 29 } };
const status = () => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, voice_enabled: true, reviews_due: 0, entitlement: ENT, preferences: { personality_id: "durona", profanity: "moderate", chosen: true }, personalities: PERSONALITIES });
const SID = "22222222-2222-4222-8222-222222222222";
const GEMINI_CALL = "44444444-4444-4444-8444-444444444444";
const RT_CALL = "33333333-3333-4333-8333-333333333333";
const AVISO_MINUTO = "Restam 1 minuto(s) de Tutor por voz hoje.";
const RECUSA_ABERTA = "Responda a questão atual antes de pedir a próxima.";
const LIMITE = "Você chegou ao limite de 30 questões de hoje no teste grátis. Amanhã tem mais.";

// as duas questões do caso: a nº 48 (a do vídeo) e a que a voz abriu sozinha
const Q48 = {
  id: "revalida_2024_2_q048", number: 48, area: "DERMATOLOGIA", topic: "Dermatologia", exam: { kind: "REVALIDA", year: 2024, semester: 2 }, correta: "D",
  statement: "Uma mãe leva seus dois filhos, em idade pré-escolar, à UBS com lesões serpiginosas nos pés depois de um passeio. Qual o diagnóstico e o tratamento?",
  options: [
    { id: "A", text: "Escabiose; uso de loção de permetrina a 5%." },
    { id: "B", text: "Pediculose corporis; uso de ivermectina." },
    { id: "C", text: "Dermatite atópica; uso de hidrocortisona tópica." },
    { id: "D", text: "Larva migrans; uso de tiabendazol creme tópico." },
  ],
};
const Q42 = {
  id: "revalida_2025_1_q042", number: 42, area: "OBSTETRICIA", topic: "Pré-natal", exam: { kind: "REVALIDA", year: 2025, semester: 1 }, correta: "B",
  statement: "Gestante de 20 semanas pergunta com que frequência deve voltar às consultas de pré-natal. Qual a orientação?",
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Orientação ${id} do pré-natal.` })),
};
const QS = [Q48, Q42];
const db = { i: 0, state: "open", last: null as any, limite: null as string | null, closes: 0, reads: 0 };
const avancar = () => {
  db.i = Math.min(db.i + 1, QS.length - 1);
  db.state = "open";
  db.last = null;
};
const responder = (opcao: string) => {
  if (db.state !== "open") throw new Error("Não há questão aberta nesta conversa.");
  db.state = "answered";
  db.last = { selected: opcao, is_correct: opcao === QS[db.i].correta };
};
const sessao = (mode = "questao") => {
  const { correta, ...q } = QS[db.i];
  return {
    id: SID, mode, title: "Questões", topic: null, status: "active", question_state: mode === "questao" ? db.state : "none", hint_level: 0, gate: null, read_only: false, summary: null,
    personality: { id: "durona", name: "Durona", emoji: "🔥", voice: {} },
    question: mode === "questao" ? { ...q, state: db.state, correct_option: db.state === "open" ? null : correta } : null,
    last_answer: mode === "questao" ? db.last : null,
    messages: [{ id: 1, role: "tutor", content: "Questão na mesa.", grounding: "none" }],
  };
};

let rpcImpl: Record<string, (args: any) => any> = {};
let server: Record<string, (body: any) => { status?: number; body?: any; headers?: Record<string, string>; text?: string }> = {};
const calls: { url: string; body: any }[] = [];
const geminiStart = { provider: "gemini", voice_call_id: GEMINI_CALL, gemini_token: "auth_tokens/temporario", model: "gemini-live", voice: "Kore", lease_seconds: 120, entitlement: { voice: { remaining_s: 60 } } };
const realtimeStart = { provider: "realtime", voice_call_id: RT_CALL, client_secret: "ek_temporario", model: "gpt-realtime", lease_seconds: 120, entitlement: { voice: { remaining_s: 60 } } };

beforeEach(async () => {
  (await import("../novo/app/tutor/useRealtimeVoice.js")).resetGeminiDeviceFallback();
  Object.assign(db, { i: 0, state: "open", last: null, limite: null, closes: 0, reads: 0 });
  Object.assign(gem, { texts: [], tools: [], closed: 0 });
  opened.length = 0;
  sent.length = 0;
  calls.length = 0;
  dc = null;
  window.history.replaceState(null, "");
  rpcImpl = {
    app_tutor_status: () => status(),
    app_tutor_sessions: () => [],
    app_tutor_start: () => sessao(),
    app_tutor_session: () => (db.reads++, sessao()),
    app_tutor_answer: (a) => (responder(a.p_option), { ok: true }),
    // as mesmas recusas do banco (tutor_next_for, 20261003005400_tutor_aceite.sql)
    app_tutor_next_question: () => {
      if (db.state === "open") throw new Error(RECUSA_ABERTA);
      if (db.limite) throw new Error(db.limite);
      avancar();
      return sessao();
    },
    app_tutor_close: () => (db.closes++, true),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  server = {
    "/api/tutor/status": () => ({ body: { ready: true, simulated: false, neural_voice: false, realtime_voice: true, live_voice: false, voice_hint: "gemini" } }),
    "/api/tutor/nexus": () => ({ body: { voice_enabled: true, stt: false, live: true, live_minutes: 1, reserve: true, reserve_minutes: 1, minutes_today: 1, professors: PERSONALITIES.map((p) => ({ id: p.id, eleven: false, sample: false, reason: "not_approved" })) } }),
    "/api/tutor/voice/open": () => ({ body: { jeito: "aovivo", voice_call_id: null, mic: true, reason: null, minutes_today: 1, live_minutes: 1, reserve_minutes: 1 } }),
    "/api/tutor/voice/start": () => ({ body: geminiStart }),
    "https://api.openai.com/v1/realtime/calls": () => ({ text: "v=0 answer", headers: { Location: "/v1/realtime/calls/rtc_123" } }),
    // a renovação da voz ao vivo traz o aviso real do servidor (server/tutor/realtime.ts)
    "/api/tutor/voice/renew": () => ({ body: { stop: false, lease_seconds: 120, remaining_s: 60, warn: AVISO_MINUTO } }),
    // as ferramentas da voz mexem na MESMA conversa do banco de mentira (como ch_worker_tutor_answer_as / ch_worker_tutor_next_as)
    "/api/tutor/voice/tool": (b) => {
      const args = JSON.parse(b?.arguments ?? "{}");
      if (b?.name === "next_question") {
        if (db.state === "open") return { body: { output: { error: RECUSA_ABERTA } } };
        avancar();
        return { body: { output: { session_id: SID, question: { id: QS[db.i].id, state: "open" } } } };
      }
      if (b?.name === "submit_answer") {
        try {
          responder(args.option);
        } catch (e: any) {
          return { body: { output: { error: e.message } } };
        }
        return { body: { output: { result: { is_correct: db.last.is_correct, correct_option: QS[db.i].correta } } } };
      }
      return { body: { output: { question: { id: QS[db.i].id, state: db.state } } } };
    },
    "/api/tutor/voice/transcript": () => ({ body: { correction: null } }),
    "/api/tutor/voice/usage": () => ({ body: {} }),
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const bodies = (u: string) => calls.filter((c) => c.url === u).map((c) => c.body);
const cartao = () => screen.getByRole("region", { name: "Questão" });
/** A alternativa da questão atual pelo texto dela (o nome acessível junta a letra e o texto). */
const alternativa = (letra: string) => new RegExp(QS[db.i].options.find((o) => o.id === letra)!.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

/** Tutor pelo menu (/novo/tutor), modo Questões, voz ao vivo do Gemini pronta. */
async function abrirVozAoVivo() {
  const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
  const go = vi.fn();
  render(<NexusScreen go={go} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Começar com/ }));
  await waitFor(() => expect(opened).toHaveLength(1));
  const h = opened[0].handlers;
  act(() => {
    h.onReady();
  });
  await screen.findByRole("region", { name: "Questão" });
  return { h, go };
}
/** No cartão: marca a letra e toca em Responder (a resposta vai ao banco; a tela manda "Marquei a D." à voz). */
async function responderNoCartao(letra = "D") {
  fireEvent.click(within(cartao()).getByRole("radio", { name: alternativa(letra) }));
  fireEvent.click(within(cartao()).getByRole("button", { name: "Responder" }));
  await within(cartao()).findByText("Você acertou");
  await waitFor(() => expect(gem.texts).toContain(`Marquei a ${letra}.`));
}

describe("Tutor por voz ao vivo: o cartão da questão acompanha a conversa e o 'Próxima' sempre anda", () => {
  it("a voz abriu a próxima questão pela ferramenta next_question: o cartão relê a conversa e mostra a questão nova (só ferramentas que mudam a conversa)", async () => {
    const { h } = await abrirVozAoVivo();
    expect(within(cartao()).getByText(/nº 48/)).toBeTruthy();
    await responderNoCartao("D");
    expect(within(cartao()).getByRole("button", { name: /Próxima/ })).toBeTruthy();
    // ferramenta que só lê (o contexto da questão) não relê a conversa
    const lidas = db.reads;
    act(() => {
    h.onToolCalls([{ id: "f0", name: "get_question_context", args: {} }]);
  });
    await waitFor(() => expect(gem.tools).toHaveLength(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(db.reads).toBe(lidas);
    // a voz passa de questão sozinha (o servidor troca a questão da conversa)
    act(() => {
    h.onToolCalls([{ id: "f1", name: "next_question", args: {} }]);
  });
    await waitFor(() => expect(gem.tools).toHaveLength(2));
    await waitFor(() => expect(within(cartao()).getByText(/nº 42/)).toBeTruthy());
    expect(within(cartao()).getByText(/Gestante de 20 semanas/)).toBeTruthy();
    expect(within(cartao()).getByRole("button", { name: "Responder" })).toBeTruthy();
    expect(within(cartao()).queryByText("Você acertou")).toBeNull();
    expect(screen.queryByText(RECUSA_ABERTA)).toBeNull();
  });

  it("a voz respondeu pela ferramenta submit_answer: o cartão mostra o resultado e o 'Próxima' (sem o aluno tocar em Responder)", async () => {
    const { h } = await abrirVozAoVivo();
    act(() => {
    h.onToolCalls([{ id: "f1", name: "submit_answer", args: { option: "D" } }]);
  });
    await waitFor(() => expect(gem.tools).toHaveLength(1));
    expect(await within(cartao()).findByText("Você acertou")).toBeTruthy();
    fireEvent.click(within(cartao()).getByRole("button", { name: /Próxima/ }));
    await waitFor(() => expect(within(cartao()).getByText(/nº 42/)).toBeTruthy());
    expect(screen.queryByText("Não há questão aberta nesta conversa.")).toBeNull();
  });

  it("voz da OpenAI: next_question pedido na resposta da voz também faz o cartão acompanhar", async () => {
    server["/api/tutor/voice/start"] = () => ({ body: realtimeStart });
    const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
    render(<NexusScreen go={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Começar com/ }));
    await waitFor(() => expect(dc).not.toBeNull());
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("https://api.openai.com"))).toBe(true));
    act(() => {
    dc.onopen();
  });
    act(() => {
    dc.onmessage({ data: JSON.stringify({ type: "session.created", session: {} }) });
  });
    await screen.findByRole("region", { name: "Questão" });
    await responderNoCartaoOpenAI("D");
    act(() => {
    dc.onmessage({ data: JSON.stringify({ type: "response.done", response: { output: [{ type: "function_call", call_id: "c1", name: "next_question", arguments: "{}" }] } }) });
  });
    await waitFor(() => expect(sent.some((m) => m.type === "conversation.item.create" && m.item?.call_id === "c1")).toBe(true));
    await waitFor(() => expect(within(cartao()).getByText(/nº 42/)).toBeTruthy());
  });

  it("GPT-Live: a delegação ao motor do Tutor que abre a próxima questão também faz o cartão acompanhar (conversa que não muda: não relê)", async () => {
    const LIVE_CALL = "66666666-6666-4666-8666-666666666666";
    server["/api/tutor/status"] = () => ({ body: { ready: true, simulated: false, neural_voice: false, realtime_voice: true, live_voice: true, voice_hint: null } });
    server["/api/tutor/voice/start"] = () => ({ body: { provider: "live", voice_call_id: LIVE_CALL, sdp: "v=0 answer", live_session_id: "ls_1", lease_seconds: 120, entitlement: { voice: { remaining_s: 60 } } } });
    let intencao = "chat";
    server["/api/tutor/voice/delegate"] = () => {
      if (intencao === "next") avancar(); // o motor do Tutor abriu a próxima questão na conversa
      return { body: { say: ["Certo."], thinking: [], tone: null, intent: intencao } };
    };
    const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
    render(<NexusScreen go={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Começar com/ }));
    await waitFor(() => expect(dc).not.toBeNull());
    act(() => {
      dc.onmessage({ data: JSON.stringify({ type: "session.started" }) });
    });
    await screen.findByRole("region", { name: "Questão" });
    await responderNoCartaoOpenAI("D");
    // delegação que só conversa: não relê a conversa
    const lidas = db.reads;
    act(() => {
      dc.onmessage({ data: JSON.stringify({ type: "session.delegation.created", delegation: { id: "d0" } }) });
    });
    await waitFor(() => expect(sent.some((m) => m.type === "session.commentary.append" && m.delegation_id === "d0")).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(db.reads).toBe(lidas);
    // o aluno pede a próxima falando; o motor do Tutor abre a próxima questão (intent "next")
    intencao = "next";
    act(() => {
      dc.onmessage({ data: JSON.stringify({ type: "session.delegation.created", delegation: { id: "d1" } }) });
    });
    await waitFor(() => expect(within(cartao()).getByText(/nº 42/)).toBeTruthy());
    expect(within(cartao()).getByRole("button", { name: "Responder" })).toBeTruthy();
  });

  it("rede de segurança: a conversa já está noutra questão no servidor; 'Próxima' recusado relê e o cartão pula para ela, sem mensagem de erro", async () => {
    await abrirVozAoVivo();
    await responderNoCartao("D");
    avancar(); // a questão mudou no servidor sem a tela saber (ex.: ferramenta da voz cuja resposta se perdeu)
    fireEvent.click(within(cartao()).getByRole("button", { name: /Próxima/ }));
    await waitFor(() => expect(within(cartao()).getByText(/nº 42/)).toBeTruthy());
    expect(within(cartao()).getByRole("button", { name: "Responder" })).toBeTruthy();
    expect(screen.queryByText(RECUSA_ABERTA)).toBeNull();
  });

  it("'Próxima' recusado de verdade (limite de questões do teste) com o aviso de minutos na tela: o motivo aparece no cartão", async () => {
    await abrirVozAoVivo();
    await responderNoCartao("D");
    // a renovação da voz (5 s depois de abrir) traz "Restam 1 minuto(s)…", como no vídeo
    expect(await screen.findByText(AVISO_MINUTO, {}, { timeout: 9000 })).toBeTruthy();
    db.limite = LIMITE;
    fireEvent.click(within(cartao()).getByRole("button", { name: /Próxima/ }));
    await waitFor(() => expect(rpcCalls("app_tutor_next_question")).toHaveLength(1));
    expect(await within(cartao()).findByText(LIMITE)).toBeTruthy();
    expect(within(cartao()).getByText(/nº 48/)).toBeTruthy(); // a questão não muda (o banco recusou)
    expect(screen.getByText(AVISO_MINUTO)).toBeTruthy(); // e o aviso de minutos continua
  }, 20_000);

  it("um toque só: enquanto o 'Próxima' carrega, o botão fica desabilitado (sem 3 toques = 3 chamadas)", async () => {
    await abrirVozAoVivo();
    await responderNoCartao("D");
    let liberar!: () => void;
    const original = rpcImpl.app_tutor_next_question;
    rpcImpl.app_tutor_next_question = (a) => new Promise((r) => (liberar = () => r(original(a))));
    const proxima = within(cartao()).getByRole("button", { name: /Próxima/ });
    fireEvent.click(proxima);
    await waitFor(() => expect((proxima as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(proxima);
    fireEvent.click(proxima);
    expect(rpcCalls("app_tutor_next_question")).toHaveLength(1);
    await act(async () => liberar());
    await waitFor(() => expect(within(cartao()).getByText(/nº 42/)).toBeTruthy());
  });
});

/** Igual a responderNoCartao, para a voz da OpenAI (a fala "Marquei a D." vai pelo canal de dados). */
async function responderNoCartaoOpenAI(letra: string) {
  fireEvent.click(within(cartao()).getByRole("radio", { name: alternativa(letra) }));
  fireEvent.click(within(cartao()).getByRole("button", { name: "Responder" }));
  await within(cartao()).findByText("Você acertou");
}

describe("Tela de voz: avisos da tela", () => {
  it("o aviso de minutos e o motivo de uma troca que falhou aparecem os dois (um não esconde o outro)", async () => {
    const { StaziaVoiceMode } = await import("../novo/app/tutor/voice/StaziaVoiceMode.jsx");
    const rt = { state: "listening", muted: false, captions: {}, streams: null, setVolume() {}, toggleMute() {}, sendText() {}, start() {} };
    render(<StaziaVoiceMode rt={rt} persona={{ id: "durona", name: "Durona" }} note={[AVISO_MINUTO, "Não foi possível abrir o chat agora.", null]} onClose={() => {}} />);
    expect(screen.getByText(AVISO_MINUTO)).toBeTruthy();
    expect(screen.getByText("Não foi possível abrir o chat agora.")).toBeTruthy();
  });
});

// ------------------------------------------------------------------------------------------------ "Voltar"
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.now();
const questaoDoTreino = (over: any = {}) => ({
  id: "rq1", number: 13, area: "PEDIATRIA", exam: { id: "r", kind: "REVALIDA", year: 2024, semester: 2 }, origin: "official",
  statement: "Pré-escolar de 4 anos com febre há 3 dias e lesões em pés e mãos. Qual a conduta?",
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id}` })),
  images: [], support: null, preliminary: null, bookmarked: false, selected: null, active_ms: 0, correction: null, ...over,
});
const correcao = { correct_option: "C", origin: "official", explanation: "Explicação da questão.", topic: "Doença mão-pé-boca", subtopic: "Exantemas", option_notes: [], expected_conduct: null, sources: [], official_sources: [] };
const treino = {
  id: "s1", kind: "treino", filters: { area: "PEDIATRIA" }, started_at: iso(NOW - 60_000), finished_at: null, result: null, collection: "oficiais", locked: false,
  questions: [questaoDoTreino(), questaoDoTreino({ id: "rq2", number: 14, statement: "Segunda questão do treino: lactente com tosse. Qual o diagnóstico?" })],
  time_limit_seconds: null, paused_at: null, paused_seconds: 0, deadline_at: null, remaining_seconds: null, server_now: iso(NOW),
};

describe("'Voltar' na conversa por voz do Tutor", () => {
  it("aberto pela questão do treino: 'Voltar para a questão' volta para a MESMA questão (nada remonta: resposta, correção e tempo) sem encerrar a conversa", async () => {
    rpcImpl.app_get_session = () => treino;
    rpcImpl.app_answer_question = (a) => ({ ...correcao, selected: a.p_option, is_correct: a.p_option === "C", play: null });
    rpcImpl.app_tutor_start = () => sessao("livre");
    rpcImpl.app_tutor_session = () => sessao("livre");
    const { PracticeSession } = await import("../novo/app/practice/PracticeSession.jsx");
    const { TutorDockProvider } = await import("../novo/app/tutor/TutorDrawer.jsx");
    const go = vi.fn();
    render(
      <MemoryRouter initialEntries={["/sessao?s=s1"]}>
        <TutorDockProvider go={go}>
          <PracticeSession go={go} />
        </TutorDockProvider>
      </MemoryRouter>
    );
    await screen.findByRole("radiogroup", { name: "Alternativas" });
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar resposta" }));
    expect(await screen.findByText("Você acertou")).toBeTruthy();
    const enunciado = screen.getByText(/Pré-escolar de 4 anos/);
    const relogio = screen.getByRole("timer", { name: /^Tempo respondendo/ });
    const lidasDaSessao = rpcCalls("app_get_session").length;
    // abre o Tutor por cima da questão e começa a conversa por voz (o botão fica com o foco, como no toque/Enter do navegador)
    const abrir = screen.getByRole("button", { name: /Conversar com o Tutor/ });
    abrir.focus();
    fireEvent.click(abrir);
    fireEvent.click(await screen.findByRole("button", { name: /^Começar com/ }));
    await waitFor(() => expect(opened).toHaveLength(1));
    // enquanto a voz conecta (microfone desabilitado), o foco fica no próprio diálogo, nunca na página de trás
    const conectando = await screen.findByRole("dialog", { name: /Stazia/ });
    expect(document.activeElement).toBe(conectando);
    act(() => {
    opened[0].handlers.onReady();
  });
    const voz = await screen.findByRole("dialog", { name: /Stazia/ });
    // a voz conectou: o foco passa para o microfone
    await waitFor(() => expect(document.activeElement).toBe(within(voz).getByRole("button", { name: "Desligar o microfone" })));
    const voltar = within(voz).getByRole("button", { name: "Voltar para a questão" });
    expect(voltar.className).toContain("svm__voltar");
    fireEvent.click(voltar);
    // a camada do Tutor fecha; a questão de baixo é a mesma (os mesmos elementos, sem recarregar a sessão)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Pré-escolar de 4 anos/)).toBe(enunciado);
    expect(screen.getByRole("timer", { name: /^Tempo respondendo/ })).toBe(relogio);
    expect(screen.getByText("Você acertou")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Alternativa C/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(rpcCalls("app_get_session")).toHaveLength(lidasDaSessao);
    // a conversa NÃO foi encerrada (fica aberta no Histórico); a voz desligou e o servidor parou de contar os minutos
    expect(rpcCalls("app_tutor_close")).toHaveLength(0);
    expect(gem.closed).toBeGreaterThan(0);
    await waitFor(() => expect(bodies("/api/tutor/voice/end")[0]).toMatchObject({ voice_call_id: GEMINI_CALL, reason: "student" }));
    expect(document.body.style.overflow).not.toBe("hidden"); // a página de baixo volta a rolar
    // teclado e leitor de tela: o foco volta para o botão que abriu o Tutor (não cai no <body>)
    await waitFor(() => expect(document.activeElement).toBe(abrir));
    // e o treino segue: "Próxima questão" anda
    fireEvent.click(screen.getByRole("button", { name: "Próxima questão" }));
    expect(await screen.findByText(/Segunda questão do treino/)).toBeTruthy();
  });

  it("pela página do Tutor (menu): 'Voltar para a tela anterior' volta uma página no app sem encerrar; a voz para no primeiro toque mesmo se a rota não mudar", async () => {
    // history.back de mentira não muda a rota: é o caso da tela anterior ser o próprio Tutor (o menu empilha /tutor de novo)
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState({ usr: null, key: "k2", idx: 2 }, "");
    const { go } = await abrirVozAoVivo();
    const voz = screen.getByRole("dialog", { name: /Stazia/ });
    fireEvent.click(within(voz).getByRole("button", { name: "Voltar para a tela anterior" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    // a tela de voz saiu, a voz desligou e o servidor parou de contar os minutos; a conversa NÃO foi encerrada
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Stazia/ })).toBeNull());
    expect(gem.closed).toBeGreaterThan(0);
    await waitFor(() => expect(bodies("/api/tutor/voice/end")[0]).toMatchObject({ voice_call_id: GEMINI_CALL, reason: "student" }));
    expect(rpcCalls("app_tutor_close")).toHaveLength(0);
    expect(await screen.findByRole("button", { name: /^Começar com/ })).toBeTruthy(); // a entrada do Tutor
  });

  it("pela página do Tutor aberta direto pelo endereço (nada antes no app): o nome diz o destino, 'Voltar para o Início'", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState(null, "");
    const { go } = await abrirVozAoVivo();
    const voz = screen.getByRole("dialog", { name: /Stazia/ });
    expect(within(voz).queryByRole("button", { name: "Voltar para a tela anterior" })).toBeNull();
    fireEvent.click(within(voz).getByRole("button", { name: "Voltar para o Início" }));
    expect(go).toHaveBeenCalledWith("home");
    expect(back).not.toHaveBeenCalled();
    expect(rpcCalls("app_tutor_close")).toHaveLength(0);
  });

  it("foco: se o botão que abriu o Tutor saiu da tela, ao fechar a camada o foco vai para o título da questão", async () => {
    const { TutorDockProvider, useTutorDock } = await import("../novo/app/tutor/TutorDrawer.jsx");
    function Tela() {
      const abrir = useTutorDock();
      const [mostra, setMostra] = React.useState(true);
      return (
        <main>
          <h1>Enunciado da questão</h1>
          {mostra && (
            <button type="button" onClick={() => (abrir({ mode: "livre", questionId: "rq1" }), setMostra(false))}>
              Abrir o Tutor
            </button>
          )}
        </main>
      );
    }
    render(
      <TutorDockProvider go={vi.fn()}>
        <Tela />
      </TutorDockProvider>
    );
    const botao = screen.getByRole("button", { name: "Abrir o Tutor" });
    botao.focus();
    fireEvent.click(botao);
    await screen.findByRole("button", { name: /^Começar com/ }); // a entrada do Tutor carregou (o "Fechar" do carregando sai)
    fireEvent.click(screen.getByRole("button", { name: "Fechar o Tutor" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tutor" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Enunciado da questão" })));
  });

  it("por escrito (ou modo reserva): 'Voltar' fecha a chamada de voz no servidor na hora (os minutos param) e a conversa continua aberta", async () => {
    const ESC = "55555555-5555-4555-8555-555555555555";
    server["/api/tutor/voice/open"] = () => ({ body: { jeito: "escrito", voice_call_id: ESC, mic: false, reason: "voice_off", minutes_today: 0, reserve_minutes: 0 } });
    const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
    const onClose = vi.fn();
    render(<NexusScreen go={vi.fn()} overlay request={{ mode: "livre", questionId: "rq1", context: { type: "question", id: "rq1" } }} onClose={onClose} />);
    rpcImpl.app_tutor_start = () => sessao("livre");
    fireEvent.click(await screen.findByRole("button", { name: /^Começar com/ }));
    const voz = await screen.findByRole("dialog", { name: /Stazia/ });
    expect(within(voz).getByText("Por escrito")).toBeTruthy();
    fireEvent.click(within(voz).getByRole("button", { name: "Voltar para a questão" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(bodies("/api/tutor/voice/end")[0]).toMatchObject({ voice_call_id: ESC, reason: "student" }));
    expect(rpcCalls("app_tutor_close")).toHaveLength(0);
  });

  it("a tela de voz rola (dedo e rodinha) e, no computador, o cartão alto começa do topo: Voltar e Próxima sempre ao alcance", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/tutor/voice/voiceMode.css"), "utf8");
    // o primeiro bloco de regras do seletor exato (no começo da linha, com ou sem recuo de @media)
    const bloco = (sel: string) => css.match(new RegExp("(?:^|\\n)\\s*" + sel.replace(/\./g, "\\.") + "\\s*\\{([^}]*)\\}"))?.[1] ?? "";
    const svm = bloco(".svm");
    expect(svm).toMatch(/overflow-y:\s*auto/);
    expect(svm).not.toMatch(/overflow:\s*hidden/);
    expect(bloco(".svm__top")).toMatch(/flex:\s*none/); // o topo (com o Voltar de 44 px) não encolhe quando a tela passa da altura
    expect(bloco(".svm--with-card")).toMatch(/align-content:\s*safe center/);
    expect(bloco(".svm__sheet")).toMatch(/position:\s*fixed/); // o Chat continua no rodapé com a tela rolada
  });

  it("o motivo da recusa no cartão usa os tokens do design system (com versão do modo noite)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/tutor/nexus/nexus.css"), "utf8");
    const bloco = css.match(/\.nx-q__erro\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(bloco).toMatch(/color:\s*var\(--danger-text\)/);
    expect(bloco).toMatch(/background:\s*var\(--danger-bg\)/);
    expect(bloco).toMatch(/var\(--danger-border\)/);
    expect(css).not.toContain("--text-danger");
  });

  it("alvo de toque do 'Voltar' com pelo menos 44 px (celular)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/tutor/voice/voiceMode.css"), "utf8");
    const bloco = css.match(/\.svm__voltar\s*\{([^}]*)\}/)?.[1] ?? "";
    const px = (prop: string) => Number(bloco.match(new RegExp(`(?:^|;|\\s)${prop}:\\s*(\\d+)px`))?.[1] ?? 0);
    expect(px("min-height")).toBeGreaterThanOrEqual(44);
    expect(px("min-width")).toBeGreaterThanOrEqual(44);
  });
});
