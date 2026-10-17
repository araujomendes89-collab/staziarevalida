/**
 * Mini Tutor (pedido do dono, 17/10/2026): janelinha flutuante nas Questões, Simulados e Aulas, com o personagem em miniatura.
 * Confere: abre com o contexto certo (questão, revisão, aula), antes de responder só pistas (nunca a resposta), simulado em andamento
 * travado, saldo que diminui a cada mensagem e bloqueia quando acaba, minimizar e fechar sem sair da tela.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" } }) }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ useTutorDock: () => null }));
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ unlockAudio: () => null, releaseAudioContext: async () => {}, getAudioContext: () => null }));
vi.mock("../novo/app/tutor/personagens/PersonagemTutor.jsx", () => ({
  PersonagemTutor: (p: any) => <div data-testid="personagem" data-personagem={p.personagem} data-state={p.conversationState} />,
}));
const voz = { start: vi.fn(), stop: vi.fn(async () => {}) };
vi.mock("../novo/app/tutor/useRealtimeVoice.js", () => ({
  realtimeSupport: () => true,
  realtimeErrorMessage: (e: any) => e?.message ?? "erro",
  useRealtimeVoice: () => ({ state: "listening", error: null, captions: { tutor: "", student: "" }, streams: {}, muted: false, remaining: 300, start: voz.start, stop: voz.stop, toggleMute() {}, active: true }),
}));

const PERSONALITIES = [
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", character: "stazi" },
  { id: "durona", name: "Durona", emoji: "🔥", character: "stazia" },
];
const ent = (used = 0, limit = 40, over: any = {}) => ({
  enabled: true, mode: "paid", is_paid: true, can_use: true, can_text: used < limit, can_voice: true,
  text: { used, limit, remaining: Math.max(0, limit - used) }, voice: { enabled: true, remaining_today_s: 600, remaining_s: 600 }, questions: { limit: null, used: 0 }, ...over,
});
const status = (over: any = {}) => ({
  enabled: true, available: true, consent_required: false, voice_enabled: true, daily_limit: 40, used_today: 0,
  entitlement: ent(), preferences: { personality_id: "durona", character: "stazia" }, personalities: PERSONALITIES, ...over,
});
const SID = "33333333-3333-4333-8333-333333333333";
const QUESTAO = { id: "q-oficial-1", statement: "Paciente de 40 anos com dor torácica…", options: [{ id: "A", text: "IAM" }, { id: "B", text: "TEP" }], area: "CLINICA", origin: "official", exam: { kind: "REVALIDA", year: 2024 } };

let rpcImpl: Record<string, (args: any) => any> = {};
const rpcCalls: { fn: string; args: any }[] = [];
const turnos: any[] = [];
let turnoImpl: (body: any) => { status: number; body: any };

beforeEach(() => {
  window.localStorage.clear();
  rpcCalls.length = 0;
  turnos.length = 0;
  voz.start.mockClear();
  rpcImpl = {
    app_tutor_status: () => status(),
    app_tutor_start: () => ({ id: SID, mode: "questao", personality: { id: "durona", name: "Durona" }, messages: [] }),
    app_tutor_close: () => true,
  };
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    if (!rpcImpl[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return rpcImpl[fn](args);
  });
  let usadas = 0;
  turnoImpl = (body) => {
    usadas += 1;
    return { status: 200, body: { message: { id: usadas, content: body.action === "hint" ? `Pista ${usadas}` : `Resposta ${usadas}`, hint_level: body.action === "hint" ? usadas : null, avatar: null }, used_today: usadas, daily_limit: 40 } };
  };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (String(url) === "/api/tutor/turn") {
      turnos.push(body);
      const r = turnoImpl(body);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    if (String(url) === "/api/tutor/status") return new Response(JSON.stringify({ live_voice: false, voice_hint: "gemini" }), { status: 200 });
    return new Response(JSON.stringify({ error: "não simulado" }), { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const montar = async (contexto: any, extra: any = {}) => {
  const { MiniTutor } = await import("../novo/app/tutor/mini");
  const utils = render(<MiniTutor contexto={contexto} go={vi.fn()} {...extra} />);
  return utils;
};
const abrir = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Abrir o mini tutor/ }));
  return screen.findByRole("dialog");
};
const escrever = async (painel: HTMLElement, texto: string) => {
  const campo = within(painel).getByLabelText(/Sua pergunta para/);
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.click(within(painel).getByRole("button", { name: "Enviar" }));
};

describe("mini tutor: contexto automático", () => {
  it("questão aberta: abre com o personagem do perfil, só pistas, e a conversa nasce no primeiro envio com a questão (modo questão)", async () => {
    const { contextoDaQuestao } = await import("../novo/app/tutor/mini");
    await montar(contextoDaQuestao(QUESTAO, { simulado: false, respondida: false }));
    // fechado, nada vai ao servidor
    expect(rpcCalls).toHaveLength(0);
    const painel = await abrir();
    expect(await within(painel).findByRole("heading", { name: /Stazia.*Durona/ })).toBeInTheDocument();
    expect(within(painel).getByText("Só pistas, sem a resposta")).toBeInTheDocument();
    expect(within(painel).getByText(/A resposta certa eu só conto depois que você responder/)).toBeInTheDocument();
    expect(rpcCalls.map((c) => c.fn)).toEqual(["app_tutor_status"]); // abrir não cria conversa nem gasta saldo
    await escrever(painel, "Por onde começo?");
    expect(await within(painel).findByText("Resposta 1")).toBeInTheDocument();
    const start = rpcCalls.find((c) => c.fn === "app_tutor_start")!.args;
    expect(start).toMatchObject({ p_mode: "questao", p_question_id: "q-oficial-1", p_context: { type: "question", id: "q-oficial-1" }, p_personality: null });
    expect(turnos[0]).toEqual({ session_id: SID, action: "message", text: "Por onde começo?" });
  });

  it("questão respondida: conversa livre sobre a questão (explica tudo) e atalhos de explicação", async () => {
    const { contextoDaQuestao } = await import("../novo/app/tutor/mini");
    await montar(contextoDaQuestao({ ...QUESTAO, correction: { correct_option: "A", is_correct: false } }, { respondida: true }));
    const painel = await abrir();
    expect(await within(painel).findByText("Explicação completa")).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Explique a questão" }));
    await within(painel).findByText("Resposta 1");
    expect(rpcCalls.find((c) => c.fn === "app_tutor_start")!.args).toMatchObject({ p_mode: "livre", p_question_id: "q-oficial-1", p_context: { type: "question", id: "q-oficial-1" } });
  });

  it("aula: conversa livre com o tema; a pergunta leva a seção que está na tela", async () => {
    const { contextoDaAula } = await import("../novo/app/tutor/mini");
    await montar(contextoDaAula({ id: "gt-12", title: "Síndrome coronariana aguda", area: "CLINICA", area_name: "CLINICA_MEDICA" }, "Diagnóstico"));
    const painel = await abrir();
    expect(await within(painel).findByText(/Dúvida na aula de Síndrome coronariana aguda/)).toBeInTheDocument();
    expect(within(painel).getByText("Diagnóstico")).toBeInTheDocument();
    await escrever(painel, "O que é troponina?");
    await within(painel).findByText("Resposta 1");
    expect(rpcCalls.find((c) => c.fn === "app_tutor_start")!.args).toMatchObject({
      p_mode: "livre", p_topic: "Síndrome coronariana aguda", p_question_id: null, p_context: { type: "theme", id: "gt-12", label: "Síndrome coronariana aguda", area: "CLINICA_MEDICA" },
    });
    expect(turnos[0].text).toBe('[Aula de Síndrome coronariana aguda, parte "Diagnóstico"] O que é troponina?');
    // na tela, o aluno vê só o que escreveu
    expect(within(painel).getByText("O que é troponina?")).toBeInTheDocument();
  });

  it("revisão sem questão aberta: conversa livre; Questão Inédita e anulada não abrem conversa", async () => {
    const { contextoDaRevisao, contextoDaQuestao } = await import("../novo/app/tutor/mini");
    expect(contextoDaRevisao(null, { simulado: true })).toEqual({ tipo: "livre", rotulo: "Resultado do simulado" });
    const ined = await montar(contextoDaQuestao({ ...QUESTAO, origin: "staziamed" }, { respondida: true }));
    const painel = await abrir();
    expect(within(painel).getByText(/não comenta as Questões Inéditas/)).toBeInTheDocument();
    expect(within(painel).queryByLabelText(/Sua pergunta para/)).toBeNull();
    ined.unmount();
    await montar(contextoDaQuestao({ ...QUESTAO, correction: { annulled: true } }, { respondida: true }));
    const p2 = await abrir();
    expect(within(p2).getByText(/anulada pela banca/)).toBeInTheDocument();
    expect(rpcCalls.filter((c) => c.fn === "app_tutor_start")).toHaveLength(0);
  });

  it("mudou de questão: a conversa anterior fecha e a nova começa do zero", async () => {
    const { contextoDaQuestao } = await import("../novo/app/tutor/mini");
    const { MiniTutor } = await import("../novo/app/tutor/mini");
    const { rerender } = render(<MiniTutor contexto={contextoDaQuestao(QUESTAO)} />);
    const painel = await abrir();
    await waitFor(() => expect(within(painel).getByLabelText(/Sua pergunta para/)).toBeInTheDocument());
    await escrever(painel, "Oi");
    await within(painel).findByText("Resposta 1");
    rerender(<MiniTutor contexto={contextoDaQuestao({ ...QUESTAO, id: "q-oficial-2" })} />);
    await waitFor(() => expect(rpcCalls.some((c) => c.fn === "app_tutor_close" && c.args.p_session_id === SID)).toBe(true));
    expect(screen.queryByText("Resposta 1")).toBeNull();
  });
});

describe("mini tutor: antes de responder, nunca a resposta", () => {
  it("atalhos só de pista e raciocínio; a pista vai como 'hint' (nunca 'reveal'); para no 4º nível", async () => {
    const { contextoDaQuestao } = await import("../novo/app/tutor/mini");
    await montar(contextoDaQuestao(QUESTAO));
    const painel = await abrir();
    const grupo = await within(painel).findByRole("group", { name: "Perguntas prontas" });
    const rotulos = within(grupo).getAllByRole("button").map((b) => b.textContent);
    expect(rotulos).toEqual(["Me dá uma pista", "Como eu começo a pensar?", "Qual o conceito-chave?"]);
    expect(rotulos.join(" ")).not.toMatch(/resposta|gabarito|explique/i);
    for (let i = 1; i <= 4; i++) {
      fireEvent.click(await within(painel).findByRole("button", { name: "Me dá uma pista" }));
      await within(painel).findByText(`Pista ${i}`);
    }
    expect(turnos.map((t) => t.action)).toEqual(["hint", "hint", "hint", "hint"]);
    expect(turnos.some((t) => t.action === "reveal")).toBe(false);
    // o 5º nível pode entregar a alternativa: o mini tutor não pede
    // conversa longa: as perguntas prontas saem, a pista fica, agora desligada
    const resto = within(painel).getByRole("group", { name: "Perguntas prontas" });
    expect(within(resto).getAllByRole("button").map((b) => b.textContent)).toEqual(["Me dá uma pista"]);
    expect(within(resto).getByRole("button", { name: "Me dá uma pista" })).toBeDisabled();
    await act(async () => {});
    expect(turnos).toHaveLength(4);
  });

  it("o 5º pedido de pista não chega ao servidor", async () => {
    const { useMiniTutor } = await import("../novo/app/tutor/mini/useMiniTutor.js");
    const { contextoDaQuestao } = await import("../novo/app/tutor/mini");
    const ctx = contextoDaQuestao(QUESTAO);
    let api: any;
    const Sonda = () => {
      api = useMiniTutor({ backend, contexto: ctx, aberto: true });
      return null;
    };
    render(<Sonda />);
    await waitFor(() => expect(api.status).not.toBeNull());
    for (let i = 0; i < 4; i++) await act(async () => void (await api.pista()));
    expect(api.pistas).toBe(4);
    await act(async () => void (await api.pista()));
    expect(turnos).toHaveLength(4);
    expect(api.mensagens.at(-1).texto).toMatch(/Já te dei todas as pistas/);
  });

  it("voz desligada antes de responder (a voz poderia mostrar a resolução); depois de responder, abre na mesma conversa", async () => {
    const { contextoDaQuestao } = await import("../novo/app/tutor/mini");
    const antes = await montar(contextoDaQuestao(QUESTAO));
    let painel = await abrir();
    const mic = await within(painel).findByRole("button", { name: /A voz abre depois que você responder/ });
    expect(mic).toBeDisabled();
    antes.unmount();
    await montar(contextoDaQuestao({ ...QUESTAO, correction: { correct_option: "A" } }, { respondida: true }));
    painel = await abrir();
    fireEvent.click(await within(painel).findByRole("button", { name: /Falar com Stazia por voz/ }));
    expect(await within(painel).findByLabelText("Conversa por voz")).toBeInTheDocument();
    expect(voz.start).toHaveBeenCalled();
    expect(rpcCalls.find((c) => c.fn === "app_tutor_start")!.args.p_mode).toBe("livre");
  });
});

describe("mini tutor: simulado em andamento", () => {
  it("fica travado com a mensagem amigável e não chama o Tutor", async () => {
    const { contextoDaQuestao } = await import("../novo/app/tutor/mini");
    await montar(contextoDaQuestao(QUESTAO, { simulado: true }));
    const bolinha = screen.getByRole("button", { name: /travado até a entrega do simulado/ });
    fireEvent.click(bolinha);
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByText("O Tutor ajuda depois que você entregar o simulado")).toBeInTheDocument();
    expect(within(painel).getByText("Travado até a entrega")).toBeInTheDocument();
    expect(within(painel).queryByLabelText(/Sua pergunta para/)).toBeNull();
    expect(within(painel).queryByRole("button", { name: /voz/ })).toBeNull();
    await act(async () => {});
    expect(rpcCalls).toHaveLength(0);
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it("depois da entrega (revisão), a questão do simulado abre a explicação completa", async () => {
    const { contextoDaRevisao } = await import("../novo/app/tutor/mini");
    await montar(contextoDaRevisao({ ...QUESTAO, selected: "B", correction: { correct_option: "A", is_correct: false } }, { simulado: true }));
    const painel = await abrir();
    expect(await within(painel).findByText("Explicação completa")).toBeInTheDocument();
    await escrever(painel, "Por que errei?");
    await within(painel).findByText("Resposta 1");
    expect(rpcCalls.find((c) => c.fn === "app_tutor_start")!.args.p_mode).toBe("livre");
  });
});

describe("mini tutor: saldo", () => {
  it("mostra o saldo, diminui a cada mensagem, avisa quando está acabando e bloqueia quando acaba (com convite aos planos)", async () => {
    rpcImpl.app_tutor_status = () => status({ entitlement: ent(37, 40) });
    let usadas = 37;
    turnoImpl = () => {
      usadas += 1;
      if (usadas > 39) return { status: 429, body: { error: "Você chegou ao limite de 40 interações de hoje. Amanhã tem mais." } };
      return { status: 200, body: { message: { id: usadas, content: `Resposta ${usadas}` }, used_today: usadas, daily_limit: 40 } };
    };
    const { contextoDaAula } = await import("../novo/app/tutor/mini");
    const go = vi.fn();
    await montar(contextoDaAula({ id: "gt-1", title: "Asma" }), { go });
    const painel = await abrir();
    const saldo = await within(painel).findByLabelText("Saldo do Tutor hoje");
    expect(saldo).toHaveTextContent("3 de 40 mensagens restantes hoje");
    expect(saldo).toHaveTextContent("10 min de voz");
    expect(saldo).toHaveTextContent("Restam 3 mensagens hoje.");
    await escrever(painel, "Primeira");
    await within(painel).findByText("Resposta 38");
    expect(within(painel).getByLabelText("Saldo do Tutor hoje")).toHaveTextContent("2 de 40 mensagens restantes hoje");
    await escrever(painel, "Segunda");
    await within(painel).findByText("Resposta 39");
    expect(within(painel).getByLabelText("Saldo do Tutor hoje")).toHaveTextContent("Resta 1 mensagem hoje.");
    await escrever(painel, "Terceira");
    expect(await within(painel).findByText("Seu saldo do Tutor de hoje acabou")).toBeInTheDocument();
    expect(within(painel).getByLabelText("Saldo do Tutor hoje")).toHaveTextContent("0 de 40 mensagens restantes hoje");
    expect(within(painel).queryByLabelText(/Sua pergunta para/)).toBeNull();
    fireEvent.click(within(painel).getByRole("button", { name: /Ver planos/ }));
    expect(go).toHaveBeenCalledWith("planos");
  });

  it("já sem saldo ao abrir: aviso na hora e nenhuma mensagem sai", async () => {
    rpcImpl.app_tutor_status = () => status({ entitlement: ent(40, 40) });
    const { contextoDaAula } = await import("../novo/app/tutor/mini");
    await montar(contextoDaAula({ id: "gt-1", title: "Asma" }));
    const painel = await abrir();
    expect(await within(painel).findByText("Seu saldo do Tutor de hoje acabou")).toBeInTheDocument();
    expect(turnos).toHaveLength(0);
  });

  it("sem plano: mostra o aviso dos planos em vez da conversa", async () => {
    rpcImpl.app_tutor_status = () => status({ available: false, entitlement: ent(0, 40, { mode: "blocked", plan_locked: true, block_reason: "trial_expired" }) });
    const { contextoDaAula } = await import("../novo/app/tutor/mini");
    await montar(contextoDaAula({ id: "gt-1", title: "Asma" }));
    const painel = await abrir();
    expect(await within(painel).findByText("Seu teste grátis do Tutor terminou")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: /Ver planos/ })).toBeInTheDocument();
  });
});

describe("mini tutor: abrir, minimizar e fechar", () => {
  it("Esc e o botão minimizam para a bolinha (foco volta nela) sem perder a conversa; Fechar encerra a conversa", async () => {
    const { contextoDaAula } = await import("../novo/app/tutor/mini");
    await montar(contextoDaAula({ id: "gt-1", title: "Asma" }));
    let painel = await abrir();
    expect(painel).toHaveAttribute("aria-modal", "false");
    await waitFor(() => expect(within(painel).getByLabelText(/Sua pergunta para/)).toHaveFocus());
    await escrever(painel, "Pergunta 1");
    await within(painel).findByText("Resposta 1");
    fireEvent.keyDown(within(painel).getByLabelText(/Sua pergunta para/), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    const bolinha = screen.getByRole("button", { name: /Abrir o mini tutor \(Stazia\)/ });
    await waitFor(() => expect(bolinha).toHaveFocus());
    painel = await abrir();
    expect(within(painel).getByText("Resposta 1")).toBeInTheDocument(); // a conversa continua
    fireEvent.click(within(painel).getByRole("button", { name: "Minimizar o mini tutor" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    painel = await abrir();
    fireEvent.click(within(painel).getByRole("button", { name: /Fechar o mini tutor/ }));
    await waitFor(() => expect(rpcCalls.some((c) => c.fn === "app_tutor_close" && c.args.p_session_id === SID)).toBe(true));
    painel = await abrir();
    expect(within(painel).queryByText("Resposta 1")).toBeNull(); // conversa nova
  });

  it("personagem anima: pensando enquanto espera a resposta; sem servidor do Tutor, o mini tutor não aparece", async () => {
    let soltar: () => void = () => {};
    const { contextoDaAula, MiniTutor } = await import("../novo/app/tutor/mini");
    const original = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
      if (String(url) === "/api/tutor/turn") await new Promise<void>((r) => (soltar = r));
      return original(url, init);
    });
    await montar(contextoDaAula({ id: "gt-1", title: "Asma" }));
    const painel = await abrir();
    await waitFor(() => expect(within(painel).getByLabelText(/Sua pergunta para/)).toBeInTheDocument());
    await escrever(painel, "Oi");
    await waitFor(() => expect(within(painel).getAllByTestId("personagem")[0]).toHaveAttribute("data-state", "thinking"));
    expect(within(painel).getAllByTestId("personagem")[0]).toHaveAttribute("data-personagem", "stazia");
    await act(async () => soltar());
    await within(painel).findByText("Resposta 1");
    cleanup();
    const token = backend.accessToken;
    backend.accessToken = undefined; // sem a sessão do servidor (prévia, fora do app)
    try {
      const { container } = render(<MiniTutor contexto={contextoDaAula({ id: "gt-1", title: "Asma" })} />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByRole("button", { name: /Abrir o mini tutor/ })).toBeNull();
    } finally {
      backend.accessToken = token;
    }
  });
});
