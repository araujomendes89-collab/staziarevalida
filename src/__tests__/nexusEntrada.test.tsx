/**
 * Entrada do Nexus (/tutor): o personagem (Stazi ou Stazia) e as 2 personalidades dele em cartões, o modo (Perguntar ao Tutor já marcado), a linha de voz do dia,
 * o aviso da Política, "Ouvir" com a amostra aprovada, Começar (som e microfone no mesmo toque), outra aba aberta ("Assumir
 * aqui"), a voz reserva, Encerrar com o resumo, o Histórico e o portão do Tutor (aceite, desligado, plano).
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
const ALUNO = "55555555-5555-4555-8555-555555555555";
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, user: { id: ALUNO }, boot: { role: "student" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
const audio = vi.hoisted(() => ({ unlock: vi.fn(() => null), order: [] as string[] }));
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({
  unlockAudio: () => (audio.order.push("unlock"), audio.unlock()),
  releaseAudioContext: async () => {},
  getAudioContext: () => null,
}));
vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({ StaziaVoiceOrb: () => <div data-testid="orb" />, orbEmotion: () => ({ emotion: "neutral", intensity: 0.2 }) }));
// voz reserva (ao vivo): o gancho de hoje, simulado
const live = vi.hoisted(() => ({ starts: [] as unknown[], stops: 0, opts: null as any }));
vi.mock("../novo/app/tutor/useRealtimeVoice.js", () => ({
  realtimeErrorMessage: (e: any) => e?.message ?? "erro",
  useRealtimeVoice: (opts: any) => {
    live.opts = opts;
    return {
      state: "ready", error: null, captions: { tutor: "", student: "" }, streams: { input: null, output: null }, muted: false, provider: "realtime", remaining: null,
      start: (force?: boolean) => live.starts.push(force ?? false), stop: async () => { live.stops++; }, interrupt() {}, sendText() {}, toggleMute() {}, setVolume() {}, active: true,
    };
  },
}));

const PERSONALITIES = [
  { id: "durao", name: "Durão", emoji: "🔥", tagline: "Firme e exigente, cobra raciocínio.", swears: true, voice: {}, character: "stazi" },
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Descontraído, faz você pensar antes de explicar.", swears: false, voice: {}, character: "stazi" },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Provocadora, escrachada e sem passar a mão na cabeça.", swears: true, voice: {}, character: "stazia" },
  { id: "tranquila", name: "Tranquila", emoji: "😌", tagline: "Calma, acolhedora e sem pressa.", swears: false, voice: {}, character: "stazia" },
];
const ENT = { enabled: true, mode: "paid", is_paid: true, staff: false, trial: { state: "none", days: 7 }, can_use: true, can_text: true, can_voice: true, text: { used: 2, limit: 40, remaining: 38 }, voice: { enabled: true, remaining_s: 600 }, questions: { limit: null, used: 0 } };
const status = (over: any = {}) => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 2, voice_enabled: true, reviews_due: 0, entitlement: ENT, preferences: { personality_id: "durona", profanity: "moderate", chosen: true }, personalities: PERSONALITIES, ...over });
const nexus = (over: any = {}) => ({
  voice_enabled: true, stt: true, reserve: true, reserve_minutes: 10, minutes_today: 5,
  // uma voz por personagem: a do Stazi (Durão e Tranquilo) ainda não foi aprovada; a da Stazia (Durona e Tranquila) sim
  professors: [{ id: "durao", eleven: false, sample: false, reason: "not_approved" }, { id: "acolhedor", eleven: false, sample: false, reason: "not_approved" }, { id: "durona", eleven: true, sample: true, reason: null }, { id: "tranquila", eleven: true, sample: true, reason: null }],
  ...over,
});
const SID = "22222222-2222-4222-8222-222222222222";
const SID2 = "44444444-4444-4444-8444-444444444444";
const CALL = "33333333-3333-4333-8333-333333333333";
const session = (over: any = {}) => ({
  id: SID, mode: "livre", title: "Perguntar ao Tutor", topic: null, status: "active", question_state: "none", read_only: false, summary: null,
  personality: { id: "durona", name: "Durona", emoji: "🔥", voice: {} }, question: null, messages: [{ id: 1, role: "tutor", content: "Chegou. Bora.", grounding: "none" }], ...over,
});
const POLICY = "Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação.";

let rpcImpl: Record<string, (args: any) => any> = {};
let server: Record<string, (body: any) => { status?: number; body?: any; blob?: Blob }> = {};
const calls: { url: string; body: any }[] = [];
const rpcCalls: { fn: string; args: any }[] = [];
let tracks: any[] = [];
let play: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.localStorage.clear(); // a escolha do personagem fica guardada no aparelho: cada teste começa sem ela
  calls.length = 0;
  rpcCalls.length = 0;
  audio.order.length = 0;
  audio.unlock.mockClear();
  live.starts.length = 0;
  live.stops = 0;
  tracks = [];
  (navigator as any).mediaDevices = {
    getUserMedia: vi.fn(async () => {
      audio.order.push("mic");
      const track = { enabled: true, readyState: "live", stopped: false, stop() { this.stopped = true; } };
      tracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    }),
  };
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:amostra"), revokeObjectURL: vi.fn() }));
  rpcImpl = {
    app_tutor_status: () => status(), app_tutor_sessions: () => [], app_tutor_start: () => session(), app_tutor_session: () => session(),
    app_tutor_close: () => true,
  };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    if (fn === "app_tutor_start") audio.order.push("start");
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  server = {
    "/api/tutor/nexus": () => ({ body: nexus() }),
    "/api/tutor/voice/open": () => ({ body: { jeito: "eleven", voice_call_id: CALL, mic: true, reason: null, minutes_today: 5, reserve_minutes: 10 } }),
    "/api/tutor/voice/sample/durona": () => ({ blob: new Blob([new Uint8Array([73, 68, 51])], { type: "audio/mpeg" }) }),
    "/api/tutor/voice/end": () => ({ body: { consumed_seconds: 0 } }),
  };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const body = typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body ?? null;
    calls.push({ url: String(url), body });
    const h = server[String(url)];
    if (!h) return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
    const r = h(body);
    if (r.blob) return new Response(r.blob, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = async () => {
  const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
  const go = vi.fn();
  render(<NexusScreen go={go} />);
  await screen.findByRole("heading", { name: "Escolha seu professor" });
  return { go };
};
const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^.{0,3}\\s*${name}\\b`) });
const startButton = () => screen.getByRole("button", { name: /^Começar com/ });

describe("Nexus: entrada", () => {
  it("/tutor abre a Nexus pelo personagem (Stazia, por causa da Durona): as 2 personalidades dele com a frase curta; a última escolhida marcada; nada começa sem o toque", async () => {
    await mount();
    expect(screen.getByRole("button", { name: /Stazia/ })).toHaveAttribute("aria-pressed", "true");
    for (const p of PERSONALITIES.filter((x) => x.character === "stazia")) {
      expect(card(p.name)).toBeInTheDocument();
      expect(screen.getByText(p.tagline)).toBeInTheDocument();
    }
    // as do outro personagem só aparecem depois de escolher o Stazi
    expect(screen.queryByRole("button", { name: /^.{0,3}\s*Durão\b/ })).toBeNull();
    expect(card("Durona")).toHaveAttribute("aria-pressed", "true");
    expect(card("Tranquila")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /Stazi\b/ }));
    for (const p of PERSONALITIES.filter((x) => x.character === "stazi")) {
      expect(card(p.name)).toBeInTheDocument();
      expect(screen.getByText(p.tagline)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /^.{0,3}\s*Durona\b/ })).toBeNull();
    expect(card("Tranquilo")).toHaveAttribute("aria-pressed", "true"); // a calma abre quando o aluno troca de personagem
    expect(card("Durão")).toHaveAttribute("aria-pressed", "false");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(rpcCalls.some((c) => c.fn === "app_tutor_start")).toBe(false);
    expect(calls.some((c) => c.url.endsWith("/voice/open"))).toBe(false);
    expect((navigator as any).mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("o personagem vem do perfil do aluno e o toque grava no perfil (app_tutor_set_character)", async () => {
    rpcImpl.app_tutor_status = () => status({ preferences: { personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" } });
    rpcImpl.app_tutor_set_character = ({ p_character }: any) => ({ personality_id: p_character === "stazia" ? "tranquila" : "acolhedor", profanity: "off", chosen: true, character: p_character });
    await mount();
    expect(screen.getByRole("button", { name: /Stazi\b/ })).toHaveAttribute("aria-pressed", "true");
    expect(rpcCalls.some((c) => c.fn === "app_tutor_set_character")).toBe(false); // abrir não grava nada
    fireEvent.click(screen.getByRole("button", { name: /Stazia/ }));
    await waitFor(() => expect(rpcCalls.filter((c) => c.fn === "app_tutor_set_character").map((c) => c.args)).toEqual([{ p_character: "stazia" }]));
    await waitFor(() => expect(card("Tranquila")).toHaveAttribute("aria-pressed", "true"));
    expect(rpcCalls.some((c) => c.fn === "app_tutor_start")).toBe(false); // gravar o personagem não começa conversa
  });

  it("o personagem gravado continua marcado depois de sair da entrada e voltar (Histórico e Voltar), e o status é relido", async () => {
    let perfil: any = { personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" };
    rpcImpl.app_tutor_status = () => status({ preferences: { ...perfil } });
    rpcImpl.app_tutor_set_character = ({ p_character }: any) => (perfil = { personality_id: p_character === "stazia" ? "tranquila" : "acolhedor", profanity: "off", chosen: true, character: p_character });
    await mount();
    expect(screen.getByRole("button", { name: /^Stazi\b(?!a)/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Stazia/ }));
    await waitFor(() => expect(rpcCalls.filter((c) => c.fn === "app_tutor_status")).toHaveLength(2)); // relido depois de gravar
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    fireEvent.click(await screen.findByRole("button", { name: "Voltar para a entrada" }));
    await screen.findByRole("heading", { name: "Escolha seu professor" });
    expect(screen.getByRole("button", { name: /^Stazia\b/ })).toHaveAttribute("aria-pressed", "true");
    expect(card("Tranquila")).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("smn-tutor-personagem")).toBe("stazia");
    expect(rpcCalls.filter((c) => c.fn === "app_tutor_set_character")).toHaveLength(1);
  });

  it("mesmo antes de o status relido chegar, voltar à entrada mostra o personagem que o perfil confirmou", async () => {
    rpcImpl.app_tutor_status = () => status({ preferences: { personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" } });
    rpcImpl.app_tutor_set_character = () => ({ personality_id: "tranquila", profanity: "off", chosen: true, character: "stazia" });
    await mount();
    rpcImpl.app_tutor_status = () => new Promise(() => {}); // a releitura não volta
    fireEvent.click(screen.getByRole("button", { name: /Stazia/ }));
    await waitFor(() => expect(rpcCalls.filter((c) => c.fn === "app_tutor_status")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    fireEvent.click(await screen.findByRole("button", { name: "Voltar para a entrada" }));
    await screen.findByRole("heading", { name: "Escolha seu professor" });
    expect(screen.getByRole("button", { name: /^Stazia\b/ })).toHaveAttribute("aria-pressed", "true");
    expect(card("Tranquila")).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("smn-tutor-personagem")).toBe("stazia");
  });

  it("a gravação do personagem falhou, mas a conversa começou com ele: o toque deixa de ser pendente", async () => {
    rpcImpl.app_tutor_status = () => status({ preferences: { personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" } });
    rpcImpl.app_tutor_set_character = () => { throw new Error("sem rede"); };
    rpcImpl.app_tutor_start = () => session({ personality: { id: "tranquila", name: "Tranquila", emoji: "😌", voice: {}, character: "stazia" } });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Stazia/ }));
    await waitFor(() => expect(window.localStorage.getItem(`smn-tutor-personagem-pendente:${ALUNO}`)).toBe("stazia"));
    fireEvent.click(startButton());
    await waitFor(() => expect(rpcCalls.some((c) => c.fn === "app_tutor_start")).toBe(true));
    await waitFor(() => expect(window.localStorage.getItem(`smn-tutor-personagem-pendente:${ALUNO}`)).toBeNull());
    expect(window.localStorage.getItem("smn-tutor-personagem")).toBe("stazia");
  });

  it("na tela do app o título não se repete (o topo do app já diz 'Stazia Tutor'); por cima de outra tela, o título aparece", async () => {
    await mount();
    expect(screen.queryByText("Seu professor particular para o Revalida")).toBeNull();
    expect(screen.getByRole("button", { name: "Histórico" })).toBeInTheDocument();
  });

  it("'Perguntar ao Tutor' já marcado; o botão diz 'Começar com a Durona' e muda com a escolha (o artigo concorda: o Durão, a Durona, o Tranquilo, a Tranquila)", async () => {
    await mount();
    const modes = within(screen.getByRole("group", { name: "Modo" })).getAllByRole("button");
    expect(modes.map((m) => m.textContent)).toEqual(["Perguntar ao Tutor", "Questões", "Meus erros", "Me teste"]);
    expect(modes[0]).toHaveAttribute("aria-pressed", "true");
    expect(startButton()).toHaveTextContent("Começar com a Durona");
    fireEvent.click(card("Tranquila"));
    expect(startButton()).toHaveTextContent("Começar com a Tranquila");
    fireEvent.click(screen.getByRole("button", { name: /Stazi\b/ }));
    expect(startButton()).toHaveTextContent("Começar com o Tranquilo");
    fireEvent.click(card("Durão"));
    expect(startButton()).toHaveTextContent("Começar com o Durão");
    fireEvent.click(modes[1]);
    expect(modes[1]).toHaveAttribute("aria-pressed", "true");
    expect(modes[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("'Ouvir' só com amostra aprovada; toca a amostra guardada (nenhum /speech)", async () => {
    await mount();
    // a voz é do personagem: um só "Ouvir", com a voz da Stazia; o Stazi não tem amostra aprovada
    await waitFor(() => expect(screen.getByRole("button", { name: "Ouvir a voz da Stazia" })).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /^Ouvir a voz/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Stazi\b/ }));
    expect(screen.queryByRole("button", { name: /^Ouvir a voz/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Stazia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvir a voz da Stazia" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(calls.some((c) => c.url === "/api/tutor/voice/sample/durona")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/speech"))).toBe(false);
    expect(rpcCalls.some((c) => c.fn === "app_tutor_start")).toBe(false); // ouvir não começa conversa
  });

  it("linha de voz: 'Voz hoje: 5 min', 'Voz reserva hoje: 10 min' ou 'Professor por escrito hoje'; aviso da Política sempre visível", async () => {
    await mount();
    expect(await screen.findByText("Voz hoje: 5 min")).toHaveClass("nx-voice-line__min"); // minutos em fonte de números
    expect(screen.getByText(POLICY)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Stazi\b/ })); // a voz do Stazi não está aprovada: vai para a reserva
    expect(await screen.findByText("Voz reserva hoje: 10 min")).toBeInTheDocument();
    cleanup();
    server["/api/tutor/nexus"] = () => ({ body: nexus({ reserve: false, reserve_minutes: 0, professors: nexus().professors.map((p: any) => ({ ...p, eleven: false, sample: false })) }) });
    await mount();
    expect(await screen.findByText("Professor por escrito hoje")).not.toHaveClass("nx-voice-line__min"); // sem números, texto normal
    expect(screen.getByText(POLICY)).toBeInTheDocument();
  });

  it("Começar: som liberado e microfone pedido no mesmo toque; conversa com p_personality e jeito aberto; toque duplo cria uma só", async () => {
    await mount();
    await screen.findByText("Voz hoje: 5 min");
    const b = startButton();
    fireEvent.click(b);
    fireEvent.click(b);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/voice/open"))).toBe(true));
    expect(audio.order.slice(0, 3)).toEqual(["unlock", "mic", "start"]);
    const starts = rpcCalls.filter((c) => c.fn === "app_tutor_start");
    expect(starts).toHaveLength(1);
    expect(starts[0].args).toEqual({ p_mode: "livre", p_topic: null, p_question_id: null, p_context: { type: "free" }, p_personality: "durona" });
    expect(calls.find((c) => c.url.endsWith("/voice/open"))!.body).toEqual({ session_id: SID });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Voz do professor")).toBeInTheDocument();
    expect(tracks[0].stopped).toBe(false); // o microfone fica para a conversa
  });

  it("outra aba com voz aberta: a mensagem e 'Assumir aqui' (force)", async () => {
    let n = 0;
    server["/api/tutor/voice/open"] = (b) => (++n === 1
      ? { status: 409, body: { error: "Já existe uma conversa por voz aberta em outro aparelho ou aba. Encerre por lá ou assuma aqui.", code: "busy" } }
      : { body: { jeito: "eleven", voice_call_id: CALL, mic: true, reason: null, minutes_today: 5, reserve_minutes: 10, got: b } });
    await mount();
    fireEvent.click(startButton());
    expect(await screen.findByText(/Já existe uma conversa por voz aberta em outro aparelho ou aba/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assumir aqui" }));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/voice/open"))).toHaveLength(2));
    expect(calls.filter((c) => c.url.endsWith("/voice/open"))[1].body).toEqual({ session_id: SID, force: true });
    expect(rpcCalls.filter((c) => c.fn === "app_tutor_start")).toHaveLength(1); // a mesma conversa
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("reserva: a voz ao vivo como hoje, com o selo do professor (não é botão) e 'Voz reserva'", async () => {
    server["/api/tutor/voice/open"] = () => ({ body: { jeito: "reserva", voice_call_id: null, mic: true, reason: "not_approved", minutes_today: 5, reserve_minutes: 10 } });
    await mount();
    fireEvent.click(startButton());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Voz reserva")).toBeInTheDocument();
    expect(within(dialog).getByText("Durona")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Durona/ })).toBeNull();
    await waitFor(() => expect(live.starts.length).toBe(1));
    expect(live.opts).toMatchObject({ sessionId: SID });
    expect(tracks[0].stopped).toBe(true); // a reserva pede o microfone por conta própria
    expect(JSON.stringify(document.body.textContent)).not.toMatch(/ElevenLabs|OpenAI|Gemini|Google/);
  });

  it("Encerrar fecha a conversa e mostra o resumo; 'Conversar de novo' cria outra com o mesmo professor; 'Trocar de professor' volta aos cartões", async () => {
    rpcImpl.app_tutor_session = () => session({ status: "closed", summary: { questions_answered: 2, correct: 1, concepts_mastered: ["pré-eclâmpsia"] } });
    await mount();
    fireEvent.click(startButton());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Encerrar a conversa por voz" }));
    expect(await screen.findByText("Conversa encerrada")).toBeInTheDocument();
    expect(rpcCalls.find((c) => c.fn === "app_tutor_close")!.args).toEqual({ p_session_id: SID });
    expect(calls.find((c) => c.url.endsWith("/voice/end"))!.body).toMatchObject({ voice_call_id: CALL });
    expect(screen.getByText(/1 de 2 questões certas/)).toBeInTheDocument();
    rpcImpl.app_tutor_start = () => session({ id: SID2 });
    fireEvent.click(screen.getByRole("button", { name: "Conversar de novo com a Durona" }));
    await waitFor(() => expect(rpcCalls.filter((c) => c.fn === "app_tutor_start")).toHaveLength(2));
    expect(rpcCalls.filter((c) => c.fn === "app_tutor_start")[1].args).toMatchObject({ p_mode: "livre", p_personality: "durona" });
    const again = await screen.findByRole("dialog");
    fireEvent.click(within(again).getByRole("button", { name: "Encerrar a conversa por voz" }));
    fireEvent.click(await screen.findByRole("button", { name: "Trocar de professor" }));
    expect(await screen.findByRole("heading", { name: "Escolha seu professor" })).toBeInTheDocument();
  });

  it("Histórico: encerrada só leitura com resumo; aberta continua; Acolhedor antigo e perfil desligado com 'Este professor mudou. Comece uma conversa nova.'", async () => {
    const OLD = "55555555-5555-4555-8555-555555555555";
    const OFF = "66666666-6666-4666-8666-666666666666";
    rpcImpl.app_tutor_sessions = () => [
      { id: SID, title: "Me teste", mode: "perguntas", status: "active", personality: "🔥", persona: "Durão", personality_id: "durao", read_only: false, minutes: 4, questions: 0 },
      { id: SID2, title: "Pré-eclâmpsia", mode: "livre", status: "closed", personality: "🔥", persona: "Durona", personality_id: "durona", read_only: false, minutes: 9, questions: 0 },
      { id: OLD, title: "Questões", mode: "questao", status: "closed", personality: "🤗", persona: "Acolhedor", personality_id: "acolhedor", read_only: true, minutes: 12, questions: 3 },
      { id: OFF, title: "Revisão", mode: "livre", status: "active", personality: "😴", persona: "Preguiçoso", personality_id: "preguicoso", read_only: true, minutes: 3, questions: 0 },
    ];
    rpcImpl.app_tutor_session = ({ p_session_id }: any) =>
      p_session_id === SID2 ? session({ id: SID2, status: "closed", summary: { concepts_mastered: ["sulfato de magnésio"] } })
      : p_session_id === OLD ? session({ id: OLD, status: "closed", read_only: true, personality: { id: "acolhedor", name: "Acolhedor", emoji: "🤗" } })
      : p_session_id === OFF ? session({ id: OFF, read_only: true, personality: { id: "preguicoso", name: "Preguiçoso", emoji: "😴" } })
      : session({ id: SID, mode: "perguntas", personality: { id: "durao", name: "Durão", emoji: "🔥" } });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    fireEvent.click(await screen.findByRole("button", { name: /Durona · Perguntar ao Tutor/ }));
    expect(await screen.findByText(/Firmou: sulfato de magnésio/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conversar de novo com a Durona" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    fireEvent.click(await screen.findByRole("button", { name: /Acolhedor · Questões/ }));
    expect(await screen.findByText("Este professor mudou. Comece uma conversa nova.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Conversar de novo/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    fireEvent.click(await screen.findByRole("button", { name: /Preguiçoso/ }));
    expect(await screen.findByText("Este professor mudou. Comece uma conversa nova.")).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/voice/open"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    fireEvent.click(await screen.findByRole("button", { name: /Durão · Me teste/ }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/voice/open"))!.body).toEqual({ session_id: SID }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("aceite pendente mostra o cartão do §34 antes de tudo; Tutor desligado e plano como hoje; nenhum nome de fornecedor na tela", async () => {
    const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
    rpcImpl.app_tutor_status = () => status({ consent_required: true, consent_version: "1.0" });
    render(<NexusScreen go={vi.fn()} />);
    expect(await screen.findByText(/Estou ciente de que os Tutores do StaziaMed Revalida utilizam Inteligência Artificial/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Escolha seu professor" })).toBeNull();
    cleanup();
    rpcImpl.app_tutor_status = () => status({ enabled: false });
    render(<NexusScreen go={vi.fn()} />);
    expect(await screen.findByText("O Tutor ainda não está ligado")).toBeInTheDocument();
    cleanup();
    const go = vi.fn();
    rpcImpl.app_tutor_status = () => status({ available: false, entitlement: { ...ENT, block_reason: "trial_expired" } });
    render(<NexusScreen go={go} />);
    expect(await screen.findByText("Seu teste grátis do Tutor terminou")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver planos/ }));
    expect(go).toHaveBeenCalledWith("planos");
    cleanup();
    rpcImpl.app_tutor_status = () => status();
    await mount();
    await screen.findByText("Voz hoje: 5 min");
    expect(document.body.textContent).not.toMatch(/ElevenLabs|OpenAI|Gemini|Google/);
  });
});
