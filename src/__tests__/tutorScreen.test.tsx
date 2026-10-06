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
(window as any).webkitSpeechRecognition = class {
  lang = ""; interimResults = false; continuous = false; onresult: any; onerror: any; onend: any;
  constructor() { recognition = this; }
  start() {}
  abort() { this.onend?.(); }
};

const PERSONALITIES = [
  { id: "amigavel", name: "Professor Amigável", emoji: "🙂", tagline: "Calmo", swears: false, voice: { rate: 0.95, pitch: 1.05 } },
  { id: "rabugento", name: "Professor Rabugento", emoji: "😠", tagline: "Resmunga, mas ensina", swears: false, voice: { rate: 1, pitch: 0.85 } },
  { id: "xingao", name: "Professor Xingão", emoji: "🤬", tagline: "Boca suja", swears: true, foul_mouthed: true, voice: { rate: 1.15, pitch: 1 } },
];
const status = (over: any = {}) => ({
  enabled: true, available: true, requires_pro: false, daily_limit: 40, used_today: 2, max_profanity: "moderate", voice_enabled: true, reviews_due: 1,
  preferences: { personality_id: "rabugento", intensity: 4, humor: null, explanation: "normal", strictness: "normal", profanity: "off", adaptive: true, chosen: true },
  personalities: PERSONALITIES, ...over,
});
const QUESTION = { id: "q1", number: 12, area: "PEDIATRIA", topic: "Bronquiolite", exam: { kind: "REVALIDA", year: 2022, semester: 1 }, statement: "Lactente com sibilância. Qual a conduta?", options: [{ id: "A", text: "Oxigênio" }, { id: "B", text: "Salbutamol" }, { id: "C", text: "Antibiótico" }, { id: "D", text: "Corticoide" }], state: "open", correct_option: null };
const session = (over: any = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", mode: "questao", title: "Questões", topic: null, status: "active", question_state: "open", hint_level: 0, difficulty_level: 3, intensity: 4,
  personality: { id: "rabugento", name: "Professor Rabugento", emoji: "😠", voice: { rate: 1, pitch: 0.85 } }, question: QUESTION, last_answer: null,
  messages: [{ id: 1, role: "tutor", content: "Vamos de questão. Responda quando estiver pronto.", grounding: "none", sources: null, hint_level: null, suggested: null, notice: null }], ...over,
});

let rpcImpl: Record<string, (args: any) => any> = {};
const turns: any[] = [];
let turnReply: any;

beforeEach(() => {
  spoken.length = 0;
  pendingEnd.length = 0;
  turns.length = 0;
  recognition = null;
  rpcImpl = { app_tutor_status: () => status(), app_tutor_sessions: () => [] };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  turnReply = { message: { id: 9, role: "tutor", content: "Qual é a síndrome principal?", spoken: "Qual é a síndrome principal?", grounding: "general", sources: [], hint_level: null, suggested: ["Não sei"], notice: null }, question_state: "open", used_today: 3, daily_limit: 40 };
  (globalThis as any).fetch = vi.fn(async (_url: string, init: any) => {
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

  it("primeira vez: escolhe o professor e a intensidade; palavrões só aparecem para quem xinga", async () => {
    rpcImpl.app_tutor_status = () => status({ preferences: { ...status().preferences, personality_id: "amigavel", intensity: 2, chosen: false } });
    const saved: any[] = [];
    rpcImpl.app_tutor_save_preferences = (a) => (saved.push(a.p_prefs), a.p_prefs);
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    expect(await screen.findByText("Escolha seu professor")).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: /Amigável|Rabugento|Xingão/ })).toHaveLength(3);
    expect(screen.queryByText("Palavrões")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Xingão/ }));
    expect(screen.getByText("Palavrões")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Rabugento/ }));
    expect(screen.queryByText("Palavrões")).toBeNull();
    fireEvent.click(screen.getByText("Salvar professor"));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ personality_id: "rabugento", profanity: "off", adaptive: true });
  });

  it("Xingão: o palavrão já vem liberado (é o personagem) e o aluno pode baixar; o que ele marcar no campo passa a valer", async () => {
    rpcImpl.app_tutor_status = () => status({ preferences: { ...status().preferences, personality_id: "amigavel", intensity: 3, chosen: false } });
    const saved: any[] = [];
    rpcImpl.app_tutor_save_preferences = (a) => (saved.push(a.p_prefs), a.p_prefs);
    const TutorScreen = await load();
    render(<TutorScreen go={() => {}} />);
    await screen.findByText("Escolha seu professor");
    fireEvent.click(screen.getByRole("radio", { name: /Xingão/ }));
    const field = screen.getByLabelText("Palavrões") as HTMLSelectElement;
    expect(field.value).toBe("moderate");
    expect(screen.getByText(/xinga de verdade, inclusive você, na zoeira/)).toBeTruthy();
    expect(Array.from(field.options).map((o) => o.textContent)).toEqual(["Sem palavrão", "Leves (putz, que saco)", "Liberados (inclusive com você)"]);
    fireEvent.change(field, { target: { value: "off" } });
    fireEvent.click(screen.getByRole("radio", { name: /Amigável/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Xingão/ }));
    expect((screen.getByLabelText("Palavrões") as HTMLSelectElement).value).toBe("off"); // a escolha do aluno não é desfeita
    fireEvent.change(screen.getByLabelText("Palavrões"), { target: { value: "moderate" } });
    fireEvent.click(screen.getByText("Salvar professor"));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ personality_id: "xingao", profanity: "moderate", intensity: 3 });
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
    await waitFor(() => expect(answers).toEqual([{ p_session_id: current.id, p_option: "B", p_confidence: 5 }]));
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
    fireEvent.click(await screen.findByText("Conversa livre"));
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
    fireEvent.click(await screen.findByText("Conversa livre"));
    fireEvent.click(screen.getByText("Começar"));
    fireEvent.click(await screen.findByLabelText("Falar com o professor"));
    expect(recognition.lang).toBe("pt-BR");
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "não entendi o mecanismo" }], { isFinal: true })] });
    recognition.onend();
    await waitFor(() => expect(turns).toHaveLength(1));
    expect(turns[0]).toMatchObject({ action: "message", text: "não entendi o mecanismo", voice: true });
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toEqual({ text: "Pense primeiro na síndrome. Depois na causa.", rate: 1, pitch: 0.85 }); // voz do Rabugento, em fala corrida
    expect(await screen.findByText("O professor está falando.")).toBeTruthy();
    // o aluno interrompe e fala de novo: a frase que estava sendo dita vai junto
    fireEvent.click(screen.getByLabelText("Interromper e falar"));
    expect((window as any).speechSynthesis.cancel).toHaveBeenCalled();
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "explica de outro jeito" }], { isFinal: true })] });
    recognition.onend();
    await waitFor(() => expect(turns).toHaveLength(2));
    expect(turns[1]).toMatchObject({ text: "explica de outro jeito", voice: true, interrupted: "Pense primeiro na síndrome. Depois na causa." });
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
    await waitFor(() => expect(answers).toEqual([{ p_session_id: current.id, p_option: "B", p_confidence: null }]));
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
    fireEvent.click(await screen.findByText("Conversa livre"));
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
    fireEvent.click(await screen.findByText("Conversa livre"));
    fireEvent.click(screen.getByText("Começar"));
    fireEvent.click(await screen.findByLabelText("Falar com o professor"));
    recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "Espera." }], { isFinal: true })] });
    recognition.onend();
    await new Promise((r) => setTimeout(r, 20));
    expect(turns).toHaveLength(0);
  });
});
