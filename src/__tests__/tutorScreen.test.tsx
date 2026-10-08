/**
 * Tela do Stazia Tutor (jsdom): desligado, escolha do professor, questão com resposta corrigida pelo banco e conversa por voz.
 * O banco e o servidor são simulados aqui; a lógica de verdade é coberta em tutor.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));

// voz do navegador simulada (definida ANTES de importar a tela, que lê essas APIs ao carregar)
const spoken: { text: string; rate: number; pitch: number }[] = [];
let recognition: any = null;
class FakeUtterance {
  rate = 1; pitch = 1; lang = ""; voice: any = null; onstart: any; onend: any; onerror: any;
  constructor(public text: string) {}
}
(globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
(window as any).speechSynthesis = {
  getVoices: () => [{ lang: "pt-BR", name: "Voz de teste" }],
  cancel: vi.fn(),
  speak: (u: FakeUtterance) => {
    spoken.push({ text: u.text, rate: u.rate, pitch: u.pitch });
    u.onstart?.();
    pendingEnd.push(() => u.onend?.());
  },
};
const pendingEnd: (() => void)[] = [];
// voz natural do servidor simulada: o áudio "toca" num elemento falso e o teste decide quando ele termina
const audios: any[] = [];
class FakeAudio {
  src = ""; muted = false; currentTime = 0; duration = 10; paused = true; onended: any = null; onerror: any = null; played: string[] = [];
  constructor(src?: string) { if (src) this.src = src; audios.push(this); }
  play() { this.paused = false; this.played.push(this.src); return Promise.resolve(); }
  pause() { this.paused = true; }
}
(globalThis as any).Audio = FakeAudio;
let blobs = 0;
(URL as any).createObjectURL = () => `blob:voz-${++blobs}`;
(URL as any).revokeObjectURL = () => {};
(window as any).webkitSpeechRecognition = class {
  lang = ""; interimResults = false; continuous = false; onresult: any; onerror: any; onend: any;
  constructor() { recognition = this; }
  start() {}
  abort() { this.onend?.(); }
};

const PERSONALITIES = [
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Descontraído; faz você pensar", swears: false, voice: { rate: 0.92, pitch: 0.95 } },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Provocadora e escrachada", swears: true, voice: { rate: 1.06, pitch: 1 } },
  { id: "direto", name: "Direto", emoji: "🎯", tagline: "Objetivo, exigente e sem enrolação", swears: false, voice: { rate: 1, pitch: 0.85 } },
];
const ENTITLEMENT = {
  enabled: true, mode: "trial", plan: "trial", is_paid: false, trial: { state: "active", days: 7, day: 3 }, can_use: true, can_text: true, can_voice: true, block_reason: null,
  text: { used: 2, limit: 40, remaining: 38 }, voice: { enabled: true, limit_today_s: 600, used_today_s: 120, remaining_today_s: 480, limit_total_s: 2400, used_total_s: 480, remaining_total_s: 1920, remaining_s: 480 },
  questions: { used: 1, limit: 30, remaining: 29 },
};
const status = (over: any = {}) => ({
  enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 2, max_profanity: "moderate", voice_enabled: true, reviews_due: 1,
  entitlement: ENTITLEMENT,
  preferences: { personality_id: "direto", profanity: "off", chosen: true },
  personalities: PERSONALITIES, ...over,
});
const QUESTION = { id: "q1", number: 12, area: "PEDIATRIA", topic: "Bronquiolite", exam: { kind: "REVALIDA", year: 2022, semester: 1 }, statement: "Lactente com sibilância. Qual a conduta?", options: [{ id: "A", text: "Oxigênio" }, { id: "B", text: "Salbutamol" }, { id: "C", text: "Antibiótico" }, { id: "D", text: "Corticoide" }], state: "open", correct_option: null };
const session = (over: any = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", mode: "questao", title: "Questões", topic: null, status: "active", question_state: "open", hint_level: 0, difficulty_level: 3, intensity: 4,
  personality: { id: "direto", name: "Direto", emoji: "🎯", voice: { rate: 1, pitch: 0.85 } }, question: QUESTION, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "Vamos de questão. Responda quando estiver pronto.", grounding: "none", sources: null, hint_level: null, suggested: null, notice: null }], ...over,
});

let rpcImpl: Record<string, (args: any) => any> = {};
let serverStatus: any;
const speechCalls: any[] = [];
let speechFail = false;
const turns: any[] = [];
let turnReply: any;

beforeEach(() => {
  spoken.length = 0;
  pendingEnd.length = 0;
  turns.length = 0;
  recognition = null;
  audios.length = 0;
  speechCalls.length = 0;
  speechFail = false;
  serverStatus = { ready: true, simulated: false, neural_voice: false, realtime_voice: false };
  rpcImpl = { app_tutor_status: () => status(), app_tutor_sessions: () => [] };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  turnReply = { message: { id: 9, role: "tutor", content: "Qual é a síndrome principal?", spoken: "Qual é a síndrome principal?", grounding: "general", sources: [], hint_level: null, suggested: ["Não sei"], notice: null }, question_state: "open", used_today: 3, daily_limit: 40 };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
    if (String(url).endsWith("/status")) return new Response(JSON.stringify(serverStatus), { status: 200 });
    if (String(url).endsWith("/speech")) {
      speechCalls.push(JSON.parse(init.body));
      return speechFail ? new Response(JSON.stringify({ error: "A voz natural falhou agora." }), { status: 502 }) : new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }), { status: 200 });
    }
    turns.push(JSON.parse(init.body));
    return new Response(JSON.stringify(typeof turnReply === "function" ? turnReply(turns[turns.length - 1]) : turnReply), { status: 200 });
  });
});
afterEach(cleanup);

const load = async () => (await import("../novo/app/tutor/TutorScreen.jsx")).TutorScreen as any;

describe("Tela do Tutor", () => {
  it("desligado: mostra que ainda não está no ar e nenhum texto médico de enfeite", async () => {
    rpcImpl.app_tutor_status = () => status({ enabled: false, available: false });
    const TutorScreen = await load();
    const { container } = render(<TutorScreen go={() => {}} />);
    expect(await screen.findByText("O Tutor ainda não está ligado")).toBeTruthy();
    expect(container.textContent).not.toMatch(/FEBRASGO|160\/110|plaquetas/i); // o protótipo antigo trazia isso fixo
  });

  it("plano pago exigido: convida a ver os planos", async () => {
    rpcImpl.app_tutor_status = () => status({ available: false, requires_pro: true });
    const TutorScreen = await load();
    const go = vi.fn();
    render(<TutorScreen go={go} />);
    fireEvent.click(await screen.findByText("Ver planos"));
    expect(go).toHaveBeenCalledWith("perfil");
  });

  it("três professores na tela inicial: trocar salva na hora; nada de intensidade nem campo de palavrões", async () => {
    const saved: any[] = [];
    rpcImpl.app_tutor_save_preferences = (a) => (saved.push(a.p_prefs), { ...a.p_prefs, chosen: true });
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    expect(await screen.findByText("Seu professor particular para o Revalida.")).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: /Tranquilo|Direto|Durona/ })).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Direto/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /Durona/ }));
    await waitFor(() => expect(saved).toEqual([{ personality_id: "durona" }]));
    expect(screen.queryByText(/intensidade/i)).toBeNull();
    expect(screen.queryByText("Palavrões")).toBeNull();
    // quatro modos
    for (const label of [/^Questões$/, /^Meus erros/, /^Me teste$/, /^Perguntar ao Tutor$/]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText("Revisar onde você mais erra.")).toBeTruthy();
  });

  it("uso do Tutor: teste grátis com dia, texto, voz e questões (números do servidor); histórico por sessão de estudo", async () => {
    serverStatus = { ...serverStatus, realtime_voice: true };
    rpcImpl.app_tutor_sessions = () => [
      { id: "s1", title: "Calendário vacinal", mode: "questao", status: "closed", personality: "😌", persona: "Tranquilo", minutes: 20, questions: 12 },
      { id: "s2", title: "Sepse: choque séptico", mode: "livre", status: "closed", personality: "🎯", persona: "Direto", minutes: 8, questions: 0 },
    ];
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    expect(await screen.findByText("Teste grátis · Dia 3 de 7")).toBeTruthy();
    expect(screen.getByText("Texto 2/40 interações hoje")).toBeTruthy();
    expect(await screen.findByText("Voz 8 min disponíveis hoje · 32 min restantes no teste")).toBeTruthy();
    expect(screen.getByText("Questões 1/30 hoje")).toBeTruthy();
    expect(screen.getByText("12 questões · Tranquilo")).toBeTruthy();
    expect(screen.getByText("8 min · Direto")).toBeTruthy();
    expect(screen.queryByText(/de 40 mensagens hoje/)).toBeNull();
  });

  it("modos: 'Me teste' nos pontos fracos e 'Perguntar ao Tutor' com a pergunta já escrita (vai sozinha)", async () => {
    const started: any[] = [];
    rpcImpl.app_tutor_start = (a) => (started.push(a), session({ mode: a.p_mode, question: null, question_state: "none", title: "Meus pontos fracos" }));
    const TutorScreen = await load();
    const { unmount } = render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Me teste"));
    expect(screen.getByText("Meus pontos fracos")).toBeTruthy();
    fireEvent.click(screen.getByText("Começar"));
    await waitFor(() => expect(started[0]).toMatchObject({ p_mode: "perguntas", p_context: { type: "weak_points" } }));
    unmount();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Perguntar ao Tutor"));
    fireEvent.change(screen.getByLabelText("Sua pergunta (opcional)"), { target: { value: "Explique pré-eclâmpsia." } });
    fireEvent.click(screen.getByText("Começar"));
    await waitFor(() => expect(turns).toHaveLength(1));
    expect(started[1]).toMatchObject({ p_mode: "livre", p_context: { type: "free" } });
    expect(turns[0]).toMatchObject({ action: "message", text: "Explique pré-eclâmpsia." });
  });

  it("questão: sem gabarito à vista; a resposta vai para o banco, e o professor reage com a base indicada", async () => {
    let current = session();
    rpcImpl.app_tutor_start = () => current;
    rpcImpl.app_tutor_session = () => current;
    const answers: any[] = [];
    rpcImpl.app_tutor_answer = (a) => {
      answers.push(a);
      current = session({ question_state: "answered", question: { ...QUESTION, state: "answered", correct_option: "A" }, last_answer: { selected: "B", is_correct: false, confidence: 5, outcome: "priority", lucky_guess: false, heavy_hints: false } });
      return { is_correct: false };
    };
    turnReply = { message: { id: 10, role: "tutor", content: "Você tratou o chiado e esqueceu a hipoxemia.", spoken: "x", grounding: "question", sources: [], hint_level: null, suggested: [], notice: null }, question_state: "answered", used_today: 3, daily_limit: 40 };
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Começar"));
    expect(await screen.findByText(/Lactente com sibilância/)).toBeTruthy();
    expect(screen.queryByLabelText("Correta")).toBeNull();
    expect(screen.getByText("Responder").closest("button")!.disabled).toBe(true);
    fireEvent.click(screen.getByText("Salbutamol"));
    fireEvent.click(screen.getByText("5 · Certeza"));
    fireEvent.click(screen.getByText("Responder"));
    await waitFor(() => expect(answers).toEqual([{ p_session_id: current.id, p_option: "B", p_confidence: 5, p_response_ms: expect.any(Number), p_first_pick: null }]));
    expect(await screen.findByText("Você tratou o chiado e esqueceu a hipoxemia.")).toBeTruthy();
    expect(turns[0]).toMatchObject({ action: "react", session_id: current.id });
    expect(screen.getByText("Baseado na questão oficial")).toBeTruthy();
    expect(screen.getByText(/Você marcou B; a correta é A/)).toBeTruthy();
    expect(screen.getByText("Errou com certeza: prioridade")).toBeTruthy();
    expect(screen.getByLabelText("Correta")).toBeTruthy();
  });

  it("mensagem escrita: mostra a resposta, de onde ela veio e o aviso quando foi substituída", async () => {
    rpcImpl.app_tutor_start = () => session({ mode: "livre", question: null, question_state: "none" });
    turnReply = { message: { id: 11, role: "tutor", content: "Não encontrei confirmação suficiente na base disponível.", spoken: "x", grounding: "insufficient", sources: [], hint_level: null, suggested: [], notice: "Resposta substituída: a primeira versão trazia informação que não pôde ser conferida." }, question_state: "none", used_today: 3, daily_limit: 40 };
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Perguntar ao Tutor"));
    fireEvent.click(screen.getByText("Começar"));
    const input = await screen.findByLabelText("Mensagem");
    fireEvent.change(input, { target: { value: "qual a dose de amoxicilina?" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("Não encontrei confirmação suficiente na base disponível.")).toBeTruthy();
    expect(turns[0]).toMatchObject({ action: "message", text: "qual a dose de amoxicilina?", voice: false, interrupted: null });
    expect(screen.getByText("Sem confirmação na base")).toBeTruthy();
    expect(screen.getByText(/Resposta substituída/)).toBeTruthy();
    expect(screen.getByText("qual a dose de amoxicilina?")).toBeTruthy();
  });

  it("voz: o aluno fala, o professor responde falando com a voz dele, e a interrupção volta como contexto", async () => {
    rpcImpl.app_tutor_start = () => session({ mode: "livre", question: null, question_state: "none" });
    turnReply = { message: { id: 12, role: "tutor", content: "Pense primeiro na síndrome. Depois na causa.", spoken: "Pense primeiro na síndrome. Depois na causa.", grounding: "general", sources: [], hint_level: null, suggested: [], notice: null }, question_state: "none", used_today: 3, daily_limit: 40 };
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Perguntar ao Tutor"));
    fireEvent.click(screen.getByText("Começar"));
    fireEvent.click(await screen.findByLabelText("Falar com o professor"));
    expect(recognition.lang).toBe("pt-BR");
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "não entendi o mecanismo" }], { isFinal: true })] });
    recognition.onend();
    await waitFor(() => expect(turns).toHaveLength(1));
    expect(turns[0]).toMatchObject({ action: "message", text: "não entendi o mecanismo", voice: true });
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toEqual({ text: "Pense primeiro na síndrome. Depois na causa.", rate: 1, pitch: 0.85 }); // voz do professor, em fala corrida
    expect(await screen.findByText("O professor está falando.")).toBeTruthy();
    // o aluno interrompe e fala de novo: a frase que estava sendo dita vai junto
    fireEvent.click(screen.getByLabelText("Interromper e falar"));
    expect((window as any).speechSynthesis.cancel).toHaveBeenCalled();
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "explica de outro jeito" }], { isFinal: true })] });
    recognition.onend();
    await waitFor(() => expect(turns).toHaveLength(2));
    expect(turns[1]).toMatchObject({ text: "explica de outro jeito", voice: true, interrupted: "Pense primeiro na síndrome. Depois na causa." });
  });

  it("voz natural ligada no servidor: a resposta toca o áudio gerado lá (pela fala validada, nunca texto livre); se falhar, a voz do aparelho assume", async () => {
    serverStatus = { ready: true, simulated: false, neural_voice: true, realtime_voice: false };
    rpcImpl.app_tutor_start = () => session({ mode: "livre", question: null, question_state: "none" });
    const first = "Olha, antes de pensar em remédio, pensa em qual síndrome está na sua frente, porque é ela que manda em todo o resto do raciocínio.";
    const second = "Depois disso, pergunta pra você mesmo qual é a causa mais comum nessa idade, e só então qual é o achado que muda a conduta de verdade.";
    turnReply = { message: { id: 12, role: "tutor", content: `${first} ${second}`, spoken: `${first} ${second}`, grounding: "general", sources: [], hint_level: null, suggested: [], notice: null }, question_state: "none", used_today: 3, daily_limit: 40 };
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Perguntar ao Tutor"));
    fireEvent.click(screen.getByText("Começar"));
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalledWith("/api/tutor/status", expect.anything()));
    fireEvent.click(await screen.findByLabelText("Falar com o professor"));
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "não entendi o mecanismo" }], { isFinal: true })] });
    recognition.onend();
    await waitFor(() => expect(speechCalls).toHaveLength(1));
    expect(speechCalls[0]).toEqual({ kind: "message", session_id: session().id, message_id: 12 });
    await waitFor(() => expect(audios.some((a) => a.played.some((src: string) => src.startsWith("blob:")))).toBe(true));
    expect(spoken).toHaveLength(0); // a voz do aparelho não foi usada
    // interrompe com 90% do áudio tocado: o trecho que estava sendo dito volta como contexto
    const playing = audios.find((a) => a.played.some((src: string) => src.startsWith("blob:")));
    playing.currentTime = 9;
    fireEvent.click(screen.getByLabelText("Interromper e falar"));
    expect(playing.paused).toBe(true);
    speechFail = true; // a próxima voz natural vai falhar
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "explica de outro jeito" }], { isFinal: true })] });
    recognition.onend();
    await waitFor(() => expect(turns).toHaveLength(2));
    expect(turns[1].interrupted).toBe(second);
    // a voz natural falhou: a do aparelho assume com o mesmo texto validado
    await waitFor(() => expect(speechCalls).toHaveLength(2));
    await waitFor(() => expect(spoken.map((x) => x.text).join(" ")).toContain(first));
  });

  it("voz do aparelho (sem voz em tempo real): a voz natural vem marcada e dá para ouvir o professor", async () => {
    serverStatus = { ready: true, simulated: false, neural_voice: true, realtime_voice: false };
    rpcImpl.app_tutor_status = () => status({ preferences: { personality_id: "durona", profanity: "moderate", chosen: false } });
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    const field = (await screen.findByLabelText("Voz do professor")) as HTMLSelectElement;
    await waitFor(() => expect(field.value).toBe("__voz_natural__"));
    expect(Array.from(field.options).map((o) => o.textContent)).toEqual(["Voz natural do professor (recomendada)", "A mais natural do aparelho (Voz de teste)", "Voz de teste"]);
    fireEvent.click(screen.getByText("Ouvir"));
    await waitFor(() => expect(speechCalls).toEqual([{ kind: "phrase", phrase: "sample", personality_id: "durona" }]));
    // trocar para a do aparelho fica guardado e não pede nada ao servidor
    fireEvent.change(field, { target: { value: "Voz de teste" } });
    fireEvent.click(screen.getByText("Ouvir"));
    expect(spoken.at(-1)?.text).toMatch(/É assim que eu vou falar com você/);
    expect(speechCalls).toHaveLength(1);
    expect(localStorage.getItem("smn-tutor-voice-engine")).toBe("device");
    fireEvent.change(field, { target: { value: "__voz_natural__" } });
    expect(localStorage.getItem("smn-tutor-voice-engine")).toBeNull();
  });

  it("fala corrida e voz mais natural: junta frases curtas, quebra texto longo e prefere a voz natural do aparelho", async () => {
    const v = await import("../novo/app/tutor/useVoice.js");
    expect(v.speechChunks("Hum. Quase. Olha de novo o caso.")).toEqual(["Hum. Quase. Olha de novo o caso."]);
    const long = Array.from({ length: 8 }, (_, i) => `Esta é a frase número ${i + 1} de uma explicação mais comprida do professor.`).join(" ");
    const chunks = v.speechChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c: string) => c.length <= 220)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
    const keep = (window as any).speechSynthesis.getVoices;
    (window as any).speechSynthesis.getVoices = () => [
      { lang: "en-US", name: "Samantha", localService: true },
      { lang: "pt-BR", name: "Luciana", localService: true },
      { lang: "pt-PT", name: "Joana (Enhanced)", localService: true },
      { lang: "pt-BR", name: "Google português do Brasil", localService: false },
      { lang: "pt-BR", name: "Microsoft Francisca Online (Natural)", localService: false },
    ];
    expect(v.portugueseVoices().map((x: any) => x.name)).toEqual(["Microsoft Francisca Online (Natural)", "Google português do Brasil", "Luciana", "Joana (Enhanced)"]);
    (window as any).speechSynthesis.getVoices = keep;
  });

  it("conversa por voz numa questão: o professor lê, o aluno marca e confirma falando, sem digitar nem clicar", async () => {
    let current = session();
    rpcImpl.app_tutor_start = () => current;
    rpcImpl.app_tutor_session = () => current;
    const answers: any[] = [];
    rpcImpl.app_tutor_answer = (a) => {
      answers.push(a);
      current = session({ question_state: "answered", question: { ...QUESTION, state: "answered", correct_option: "A" }, last_answer: { selected: "B", is_correct: false, confidence: null, outcome: "normal", lucky_guess: false, heavy_hints: false } });
      return { is_correct: false };
    };
    turnReply = { message: { id: 13, role: "tutor", content: "Hum, a B. Olha de novo a saturação.", spoken: "Hum, a B. Olha de novo a saturação.", grounding: "question", sources: [], hint_level: null, suggested: [], notice: null }, question_state: "answered", used_today: 3, daily_limit: 40 };
    const finishSpeech = async () => {
      for (let i = 0; i < 20 && pendingEnd.length; i++) pendingEnd.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    };
    const speakNow = async (said: string) => {
      await waitFor(() => expect(recognition).not.toBeNull());
      const rec = recognition;
      recognition = null;
      rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: said }], { isFinal: true })] });
      rec.onend();
    };
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Começar"));
    fireEvent.click(await screen.findByText("Conversar por voz"));
    // 1. lê o enunciado e as alternativas
    await waitFor(() => expect(spoken.length).toBeGreaterThan(0));
    expect(spoken.map((x) => x.text).join(" ")).toContain("Lactente com sibilância. Qual a conduta? Alternativa A: Oxigênio Alternativa B: Salbutamol");
    expect(screen.getByText(/Lendo a questão/)).toBeTruthy();
    await finishSpeech();
    // 2. o aluno marca falando: nada é enviado ainda, o app pede a confirmação
    await speakNow("acho que é a alternativa bê");
    await waitFor(() => expect(screen.getByText(/Marquei a B\. Diga “confirmo”/)).toBeTruthy());
    expect(answers).toHaveLength(0);
    expect(turns).toHaveLength(0);
    await finishSpeech();
    // 3. confirma falando: a resposta vai para o banco e o professor reage em voz alta
    await speakNow("confirmo");
    await waitFor(() => expect(answers).toEqual([{ p_session_id: current.id, p_option: "B", p_confidence: null, p_response_ms: expect.any(Number), p_first_pick: null }]));
    await waitFor(() => expect(turns).toHaveLength(1));
    expect(turns[0]).toMatchObject({ action: "react", voice: true });
    await waitFor(() => expect(spoken.some((x) => x.text.includes("Olha de novo a saturação"))).toBe(true));
    // 4. interromper a LEITURA da questão não vira "você me interrompeu" para o professor
    expect(turns[0].interrupted).toBeNull();
    expect(screen.getByText("Encerrar voz")).toBeTruthy();
  });

  it("microfone bloqueado ou navegador sem suporte: o aluno recebe a explicação, não um botão mudo", async () => {
    rpcImpl.app_tutor_start = () => session({ mode: "livre", question: null, question_state: "none" });
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Perguntar ao Tutor"));
    fireEvent.click(screen.getByText("Começar"));
    fireEvent.click(await screen.findByLabelText("Falar com o professor"));
    recognition.onerror({ error: "not-allowed" });
    recognition.onend();
    expect(await screen.findByText(/O navegador bloqueou o microfone/)).toBeTruthy();
    expect(turns).toHaveLength(0);
  });

  it("'espera' só faz o professor parar: não vira mensagem", async () => {
    rpcImpl.app_tutor_start = () => session({ mode: "livre", question: null, question_state: "none" });
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    fireEvent.click(await screen.findByText("Perguntar ao Tutor"));
    fireEvent.click(screen.getByText("Começar"));
    fireEvent.click(await screen.findByLabelText("Falar com o professor"));
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "Espera." }], { isFinal: true })] });
    recognition.onend();
    await new Promise((r) => setTimeout(r, 20));
    expect(turns).toHaveLength(0);
  });
});
