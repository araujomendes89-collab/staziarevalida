/**
 * O Nexus aberto de outras telas (spec §6): Correção, Caderno de erros, Flashcards, Temas e Desempenho abrem o Nexus por cima,
 * com o modo travado pelo pedido da tela; só se escolhe o professor e nada começa antes do "Começar". A tela de baixo continua
 * montada e fechar volta para ela. O relatório do Tutor fica em /analise, com o mesmo portão (aceite e avisos de hoje).
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ unlockAudio: () => null, releaseAudioContext: async () => {}, getAudioContext: () => null }));
vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({ StaziaVoiceOrb: () => <div data-testid="orb" />, orbEmotion: () => ({ emotion: "neutral", intensity: 0.2 }) }));
vi.mock("../novo/app/tutor/useRealtimeVoice.js", () => ({
  realtimeErrorMessage: (e: any) => e?.message ?? "erro",
  useRealtimeVoice: () => ({ state: "ready", error: null, captions: { tutor: "", student: "" }, streams: {}, muted: false, provider: "realtime", remaining: null, start() {}, stop: async () => {}, interrupt() {}, sendText() {}, toggleMute() {}, setVolume() {}, active: true }),
}));

const PERSONALITIES = [
  { id: "durao", name: "Durão", emoji: "🔥", tagline: "Firme.", swears: true, voice: {}, character: "stazi" },
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Descontraído.", swears: false, voice: {}, character: "stazi" },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Provocadora.", swears: true, voice: {}, character: "stazia" },
  { id: "tranquila", name: "Tranquila", emoji: "😌", tagline: "Calma.", swears: false, voice: {}, character: "stazia" },
];
const ENT = { enabled: true, mode: "paid", is_paid: true, trial: { state: "none", days: 7 }, can_use: true, can_text: true, can_voice: true, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: true, remaining_s: 600 }, questions: { limit: null, used: 0 } };
const status = (over: any = {}) => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, voice_enabled: true, reviews_due: 0, entitlement: ENT, preferences: { personality_id: "durona", profanity: "moderate", chosen: true }, personalities: PERSONALITIES, ...over });
const SID = "22222222-2222-4222-8222-222222222222";
const session = () => ({ id: SID, mode: "livre", title: "x", status: "active", question_state: "none", read_only: false, personality: { id: "durona", name: "Durona", emoji: "🔥" }, question: null, messages: [{ id: 1, role: "tutor", content: "Bora.", grounding: "none" }] });
const REPORT = {
  insights: [], sessions: { count: 2, minutes: 30, voice_minutes: 0, questions_discussed: 4 }, recurrent_errors: [], mastery: { areas: [] }, highest_risk_area: null, critical_topics: [],
  evolution: { last_30: { attempts: 10, correct: 6 }, previous_30: { attempts: 0, correct: 0 } }, reviews: { due: 1, scheduled: 3 },
  tutor: { correct: 3, answers: 5, wrong_but_sure: 0, lucky_guesses: 0, with_heavy_hints: 0, avg_hints: 1, error_classes: {} },
};

let rpcImpl: Record<string, (args: any) => any> = {};
const rpcCalls: { fn: string; args: any }[] = [];
const calls: { url: string; body: any }[] = [];

beforeEach(() => {
  window.localStorage.clear(); // a escolha do personagem fica guardada no aparelho
  rpcCalls.length = 0;
  calls.length = 0;
  (navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })) };
  rpcImpl = { app_tutor_status: () => status(), app_tutor_sessions: () => [], app_tutor_start: () => session(), app_tutor_session: () => session(), app_tutor_close: () => true, app_tutor_report: () => REPORT };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    const routes: Record<string, any> = {
      "/api/tutor/nexus": { voice_enabled: true, stt: true, reserve: true, reserve_minutes: 10, minutes_today: 5, professors: PERSONALITIES.map((p) => ({ id: p.id, eleven: false, sample: false, reason: "not_approved" })) },
      "/api/tutor/voice/open": { jeito: "reserva", voice_call_id: null, mic: true, reason: "not_approved", minutes_today: 5, reserve_minutes: 10 },
      "/api/tutor/voice/end": { consumed_seconds: 0 },
    };
    if (!(String(url) in routes)) return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
    return new Response(JSON.stringify(routes[String(url)]), { status: 200, headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const dock = async (request: any, label: string, below: React.ReactNode = null) => {
  const { TutorDockProvider, TutorButton } = await import("../novo/app/tutor/TutorDrawer.jsx");
  render(
    <TutorDockProvider go={vi.fn()}>
      {below}
      <TutorButton request={request} label={label} />
    </TutorDockProvider>
  );
  fireEvent.click(screen.getByText(label));
  const overlay = await screen.findByRole("dialog", { name: "Nexus" });
  await within(overlay).findByRole("heading", { name: "Escolha seu professor" });
  return overlay;
};

describe("Nexus por cima das outras telas", () => {
  it("Correção abre a Nexus por cima com 'Perguntar ao Tutor' sobre a questão; só se escolhe o professor; nenhuma conversa antes do Começar", async () => {
    const request = { mode: "livre", questionId: "q1", context: { type: "question", id: "q1" } };
    const overlay = await dock(request, "Discutir com o Tutor");
    expect(within(overlay).queryByRole("group", { name: "Modo" })).toBeNull();
    expect(within(overlay).getByText(/Perguntar ao Tutor/)).toBeInTheDocument();
    // a Durona vem preferida: abre no personagem dela (Stazia); as do Stazi aparecem ao trocar de personagem
    for (const p of PERSONALITIES.filter((x) => x.character === "stazia")) expect(within(overlay).getByRole("button", { name: new RegExp(`^${p.name} `) })).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(rpcCalls.some((c) => c.fn === "app_tutor_start")).toBe(false);
    fireEvent.click(within(overlay).getByRole("button", { name: /Stazi\b/ }));
    for (const p of PERSONALITIES.filter((x) => x.character === "stazi")) expect(within(overlay).getByRole("button", { name: new RegExp(`^${p.name} `) })).toBeInTheDocument();
    fireEvent.click(within(overlay).getByRole("button", { name: /^Durão / }));
    fireEvent.click(within(overlay).getByRole("button", { name: "Começar com o Durão" }));
    await waitFor(() => expect(rpcCalls.filter((c) => c.fn === "app_tutor_start")).toHaveLength(1));
    expect(rpcCalls.find((c) => c.fn === "app_tutor_start")!.args).toEqual({ p_mode: "livre", p_topic: null, p_question_id: "q1", p_context: { type: "question", id: "q1" }, p_personality: "durao" });
  });

  it("Temas → Me teste no tema; Desempenho → pontos fracos; Flashcards → Perguntar sobre o tema (modo travado)", async () => {
    const cases = [
      { request: { mode: "perguntas", topic: "Cardiologia", context: { type: "theme", id: "cardio", label: "Cardiologia" } }, label: "Me teste", shown: /Me teste · Cardiologia/ },
      { request: { mode: "perguntas", context: { type: "weak_points" } }, label: "Me teste nos pontos fracos", shown: /Me teste/ },
      { request: { mode: "livre", topic: "Sepse", context: { type: "flashcard", id: "9", label: "Sepse" } }, label: "Perguntar ao Tutor sobre este tema", shown: /Perguntar ao Tutor · Sepse/ },
    ];
    for (const c of cases) {
      rpcCalls.length = 0;
      const overlay = await dock(c.request, c.label);
      expect(within(overlay).getByText(c.shown)).toBeInTheDocument();
      fireEvent.click(within(overlay).getByRole("button", { name: /^Começar com/ }));
      await waitFor(() => expect(rpcCalls.filter((x) => x.fn === "app_tutor_start")).toHaveLength(1));
      const args = rpcCalls.find((x) => x.fn === "app_tutor_start")!.args;
      expect(args).toMatchObject({ p_mode: c.request.mode, p_topic: (c.request as any).topic ?? null, p_context: c.request.context, p_personality: "durona" });
      cleanup();
    }
  });

  it("a tela de baixo continua montada (o cronômetro do treino segue) e fechar volta para ela", async () => {
    let mounts = 0;
    function Timer() {
      const [s, setS] = React.useState(0);
      React.useEffect(() => {
        mounts++;
        const t = setInterval(() => setS((x) => x + 1), 10);
        return () => clearInterval(t);
      }, []);
      return <span data-testid="cronometro">{s}</span>;
    }
    const overlay = await dock({ mode: "livre", questionId: "q1" }, "Discutir com o Tutor", <Timer />);
    const before = Number(screen.getByTestId("cronometro").textContent);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(Number(screen.getByTestId("cronometro").textContent)).toBeGreaterThan(before); // o treino segue por baixo
    fireEvent.click(within(overlay).getByRole("button", { name: "Fechar o Tutor" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nexus" })).toBeNull());
    expect(screen.getByTestId("cronometro")).toBeInTheDocument();
    expect(mounts).toBe(1);
  });

  it("/analise mostra o relatório, com o cartão do aceite e os avisos de hoje", async () => {
    const { ReportScreen } = await import("../novo/app/tutor/ReportScreen.jsx");
    const go = vi.fn();
    render(<ReportScreen go={go} />);
    expect(await screen.findByText("Meu relatório")).toBeInTheDocument();
    // visual novo (onda 5): o resumo virou três azulejos (Sessões, De estudo, Questões discutidas), com os mesmos números do banco
    expect(screen.getByText("Sessões").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("De estudo").nextElementSibling).toHaveTextContent("30 min");
    expect(screen.getByText("Questões discutidas")).toBeInTheDocument();
    expect(screen.getByText(/Não há previsão de aprovação aqui/)).toBeInTheDocument();
    cleanup();
    rpcImpl.app_tutor_status = () => status({ consent_required: true, consent_version: "1.0" });
    render(<ReportScreen go={go} />);
    expect(await screen.findByText(/Estou ciente de que os Tutores do StaziaMed Revalida utilizam Inteligência Artificial/)).toBeInTheDocument();
    expect(rpcCalls.some((c) => c.fn === "app_tutor_report")).toBe(true); // só a primeira montagem
    cleanup();
    rpcImpl.app_tutor_status = () => status({ available: false, entitlement: { ...ENT, block_reason: "trial_expired" } });
    render(<ReportScreen go={go} />);
    expect(await screen.findByText("Seu teste grátis do Tutor terminou")).toBeInTheDocument();
    const app = await import("fs").then((fs) => fs.readFileSync(require("path").resolve(__dirname, "../novo/app/App.jsx"), "utf8"));
    expect(app).toMatch(/route === "analise"\) body = <ReportScreen go=\{go\} \/>/);
  });
});
