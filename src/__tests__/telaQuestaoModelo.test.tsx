/**
 * Tela de questão no modelo "StaziaMed — Tela de Questão" (15/10/2026): cada estado do modelo (respondendo, simulado, corrigido
 * certo/errado, anulada, com imagem e tabela, inédita, oficial), o que NÃO pode aparecer antes de responder (gabarito, explicação,
 * tema, fontes) e a decisão do dono de não mostrar fontes das Questões Inéditas ao aluno.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { PracticeSession } from "../novo/app/practice/PracticeSession.jsx";

const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.now();
const SEGREDOS = ["EXPLICACAO-SECRETA", "TEMA-SECRETO", "FONTE-SECRETA", "ORGAO-SECRETO", "CONDUTA-SECRETA"];

const question = (over: any = {}) => ({
  id: "q1", number: 13, area: "MEDICINA_FAMILIA_COMUNIDADE", exam: { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null }, origin: "staziamed",
  statement: "Mulher de 19 anos é atendida no pronto-socorro. Segundo a Lista vigente, como deve ser feita essa notificação?",
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id}` })),
  images: [], support: null, preliminary: null, bookmarked: false, selected: null, active_ms: 0, correction: null, ...over,
});
const correction = (over: any = {}) => ({
  correct_option: "C", is_correct: false, origin: "staziamed", explanation: "EXPLICACAO-SECRETA", topic: "TEMA-SECRETO", subtopic: "Subtema visível",
  option_notes: [{ id: "A", text: "Nota A" }, { id: "B", text: "Nota B" }, { id: "D", text: "Nota D" }], expected_conduct: "CONDUTA-SECRETA",
  sources: [{ title: "FONTE-SECRETA", organization: "ORGAO-SECRETO" }],
  official_sources: [{ source: "FONTE-SECRETA", organ: "ORGAO-SECRETO", version: "2026", page: 3, quote: "trecho" }], ...over,
});
const timer = (kind: string, paused = false) => ({ time_limit_seconds: kind === "simulado" ? 3600 : null, paused_at: paused ? iso(NOW) : null, paused_seconds: 0, deadline_at: kind === "simulado" ? iso(NOW + 3_444_000) : null, remaining_seconds: kind === "simulado" ? 3444 : null, server_now: iso(NOW) });
const session = (kind: string, qs: any[], extra: any = {}) => ({ id: "s1", kind, filters: { area: "MEDICINA_FAMILIA_COMUNIDADE" }, started_at: iso(NOW - 60_000), finished_at: null, result: null, collection: "oficiais", locked: false, questions: qs, ...timer(kind), ...extra });

let sessionData: any;
beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_get_session") return sessionData;
    if (fn === "app_answer_question") return { ...correction(), selected: args.p_option, is_correct: args.p_option === "C", play: null };
    if (fn === "app_report_problem") return { ok: true };
    if (fn === "app_set_bookmark") return { ok: true };
    if (fn === "app_pause_session") return { ...timer("simulado", true), paused_at: iso(NOW) };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

const open = async (data: any) => {
  sessionData = data;
  const view = render(<MemoryRouter initialEntries={["/sessao?s=s1"]}><PracticeSession go={vi.fn()} /></MemoryRouter>);
  await screen.findByRole("radiogroup", { name: "Alternativas" });
  return view;
};

describe("Respondendo (treino): nada de gabarito, explicação, tema ou fontes antes de responder", () => {
  it("mostra cabeçalho do treino, caso, pergunta, alternativas e rodapé do modelo; nenhum segredo da correção", async () => {
    const { container } = await open(session("treino", [question()]));
    expect(screen.getByText(/^Treino · /)).toBeTruthy();
    expect(screen.getByText("Caso clínico")).toBeTruthy();
    // Proposta B (19/10/2026): sem a caixa "Pergunta"; a pergunta vai em negrito no fim do caso e é o título da questão
    expect(screen.queryByText("Pergunta")).toBeNull();
    expect(screen.getByRole("heading", { name: "Segundo a Lista vigente, como deve ser feita essa notificação?" }).tagName).toBe("STRONG");
    expect(screen.getByText("Marcar para revisão")).toBeTruthy();
    expect(screen.getByText("Pular")).toBeTruthy();
    expect(screen.getByText("Escolha uma alternativa")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirmar resposta" }) as HTMLButtonElement).disabled).toBe(true);
    // sem pausa nem "Encerrar" no treino (não há prazo)
    expect(screen.queryByRole("button", { name: "Pausar o simulado" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Encerrar o simulado" })).toBeNull();
    for (const s of SEGREDOS) expect(container.textContent).not.toContain(s);
    expect(container.querySelector(".tq-answer")).toBeNull();
    expect(container.querySelector(".tq-side")).toBeNull();
    expect(screen.queryByText(/^Gabarito/)).toBeNull();
    expect(screen.queryByText("Fontes")).toBeNull();
    expect(screen.queryByText("Área e tema")).toBeNull();
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_answer_question")).toBe(false);
  });

  it("riscar alternativa e escolher: o rodapé acompanha; riscar a escolhida desmarca", async () => {
    await open(session("treino", [question()]));
    const riscarB = screen.getByRole("button", { name: "Riscar alternativa B" });
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa B/ }));
    expect(screen.getByText("Alternativa B selecionada")).toBeTruthy();
    fireEvent.click(riscarB);
    expect(screen.getByText("Escolha uma alternativa")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desfazer risco da alternativa B" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Simulado: cabeçalho do simulado só aqui, sem correção", () => {
  it("rótulo, cronômetro, 'Nesta questão', pausa e Encerrar; escolher guarda a resposta e não corrige", async () => {
    const { container } = await open(session("simulado", [question(), question({ id: "q2" })]));
    expect(screen.getByText(/^Simulado Revalida · /)).toBeTruthy();
    expect(screen.getByRole("timer", { name: /Tempo restante do simulado 57:24/ })).toBeTruthy();
    expect(screen.getByText("Restante")).toBeTruthy();
    expect(screen.getByText("Nesta questão")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pausar o simulado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Encerrar o simulado" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa C/ }));
    // escolher não grava e não libera avançar; não há "Pular" no simulado
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_answer_question")).toBe(false);
    expect((screen.getByRole("button", { name: "Confirmar resposta" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Próxima questão" })).toBeNull();
    expect(screen.queryByText("Pular")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar resposta" }));
    await waitFor(() => expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_answer_question" && c[1].p_option === "C")).toBe(true));
    // depois de confirmar: resposta travada, sem correção, e só agora libera "Próxima questão"
    expect(await screen.findByText("Resposta confirmada")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Alternativa A/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: /Alternativa C/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Próxima questão" }) as HTMLButtonElement).disabled).toBe(false);
    for (const s of SEGREDOS) expect(container.textContent).not.toContain(s);
    expect(container.querySelector(".tq-answer")).toBeNull();
    expect(screen.queryByText("Gabarito")).toBeNull();
  });

  it("pausa: a questão some e aparece o cartão 'Simulado pausado'", async () => {
    await open(session("simulado", [question()]));
    fireEvent.click(screen.getByRole("button", { name: "Pausar o simulado" }));
    expect(await screen.findByRole("heading", { name: "Simulado pausado" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Alternativas" })).toBeNull();
  });
});

describe("Corrigido: estados do modelo", () => {
  it("errado: 'Resposta incorreta', 'Gabarito: C', selos 'Sua resposta' e 'Gabarito', letras, painel de área e tema, Tutor/flashcard", async () => {
    const q = question({ origin: "official", exam: { id: "r", kind: "REVALIDA", year: 2024, semester: 1 }, number: 51, selected: "B", correction: correction({ origin: "official", is_correct: false, official_sources: undefined }) });
    const { container } = await open(session("treino", [q]));
    expect(screen.getByText("Resposta incorreta")).toBeTruthy();
    expect(container.querySelector(".tq-verdict__key")!.textContent).toBe("Gabarito: C");
    expect(screen.getByText("Sua resposta")).toBeTruthy();
    expect(screen.getByText("Gabarito")).toBeTruthy();
    expect(screen.getByText("EXPLICACAO-SECRETA")).toBeTruthy();
    expect(screen.getByText("Nota A")).toBeTruthy();
    const side = within(container.querySelector(".tq-side") as HTMLElement);
    expect(side.getByText("Área e tema")).toBeTruthy();
    expect(side.getByText(/Preventiva \/ MFC — TEMA-SECRETO/)).toBeTruthy();
    expect(side.getByText("Subtema visível")).toBeTruthy();
    expect(side.getByText("Criar flashcard")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Concluir treino" })).toBeTruthy();
    // oficial: a fonte do gabarito que o app já mostrava aparece em "Fontes"
    expect(side.getByText("Fontes")).toBeTruthy();
    expect(container.querySelector(".tq-src")!.textContent).toContain("FONTE-SECRETA");
    // alternativas travadas depois de corrigir
    expect((screen.getByRole("radio", { name: /Alternativa A/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("certo: 'Você acertou' e a escolha vai ao banco ao confirmar", async () => {
    await open(session("treino", [question()]));
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar resposta" }));
    expect(await screen.findByText("Você acertou")).toBeTruthy();
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_answer_question")![1].p_option).toBe("C");
  });

  it("treino: o cronômetro 'Respondendo' continua correndo depois de corrigir (dono, 16/10: 'não pode parar')", async () => {
    await open(session("treino", [question(), question({ id: "q2", number: 14 })]));
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar resposta" }));
    expect(await screen.findByText("Você acertou")).toBeTruthy();
    const t0 = Date.now();
    const relogio = vi.spyOn(Date, "now").mockImplementation(() => t0 + 65_000);
    try {
      // com a questão já corrigida, o relógio segue: 65 s depois o cabeçalho mostra pelo menos 01:05
      await waitFor(() => expect(screen.getByRole("timer", { name: /^Tempo respondendo 01:0\d/ })).toBeTruthy(), { timeout: 3000 });
    } finally {
      relogio.mockRestore();
    }
  });

  it("anulada: nenhuma alternativa 'Gabarito', aviso da banca, sem 'Resposta incorreta'", async () => {
    const q = question({ origin: "official", exam: { id: "r", kind: "REVALIDA", year: 2024, semester: 1 }, selected: "A", correction: correction({ origin: "official", annulled: true, correct_option: null, is_correct: null }) });
    const { container } = await open(session("treino", [q]));
    expect(screen.getByText("Questão anulada")).toBeTruthy();
    expect(screen.getByText("Questão anulada pela banca. Não conta como acerto nem erro.")).toBeTruthy();
    expect(screen.queryByText("Resposta incorreta")).toBeNull();
    expect(container.querySelector('.tq-alt[data-state="correct"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Tutor/ })).toBeNull();
  });

  it("com imagem e tabela: aparecem no cartão, antes das alternativas", async () => {
    const q = question({ images: [{ url: "/x.png", alt: "Eletrocardiograma" }], support: { title: "Exames", rows: [{ label: "Hemoglobina", value: "9 g/dL" }] } });
    const { container } = await open(session("treino", [q]));
    expect(screen.getByAltText("Eletrocardiograma")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Exames" })).toBeTruthy();
    expect(container.querySelector(".tq-case")!.contains(screen.getByRole("table", { name: "Exames" }))).toBe(true);
  });
});

describe("Questão Inédita: sem fontes ao aluno (decisão do dono)", () => {
  it("o banco manda fontes, a tela não mostra nenhuma; mostra 'Gabarito StaziaMed' e o aviso de não oficial", async () => {
    const q = question({ selected: "B", correction: correction() });
    const { container } = await open(session("treino", [q]));
    expect(screen.getByText("Gabarito StaziaMed")).toBeTruthy();
    expect(screen.getAllByText(/Não é questão oficial do Inep|não oficial do Inep/).length).toBeGreaterThan(0);
    expect(screen.getByText("Questão Inédita · nº 13")).toBeTruthy();
    for (const termo of ["FONTE-SECRETA", "ORGAO-SECRETO", "trecho", "Fontes oficiais citadas"]) expect(container.textContent).not.toContain(termo);
    expect(container.querySelector(".tq-src")).toBeNull();
    expect(screen.queryByRole("button", { name: /Tutor/ })).toBeNull();
  });
});

describe("Treino: pular e a lista de questões não feitas antes de finalizar", () => {
  it("pular a última abre a lista; tocar numa questão volta a ela; só 'Finalizar mesmo assim' encerra", async () => {
    const qs = [question({ id: "q1" }), question({ id: "q2", statement: "Segunda questão do treino. Qual a conduta?" })];
    await open(session("treino", qs));
    fireEvent.click(screen.getByText("Pular")); // q1 em branco
    expect(await screen.findByText(/Segunda questão do treino/)).toBeTruthy();
    fireEvent.click(screen.getByText("Pular")); // q2 em branco, era a última
    expect(await screen.findByRole("heading", { name: "Questões não feitas" })).toBeTruthy();
    expect(screen.getByText(/As 2 questões não feitas ficam em branco e não entram no placar/)).toBeTruthy();
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_finish_session")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Ir para a questão 1" }));
    expect(await screen.findByRole("radiogroup", { name: "Alternativas" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar resposta" }));
    await screen.findByText("Você acertou");
    // voltando de uma em branco, avançar mostra o que ainda falta (a 2) em vez de finalizar
    fireEvent.click(screen.getByRole("button", { name: /Próxima questão|Concluir treino/ }));
    expect(await screen.findByRole("heading", { name: "Questões não feitas" })).toBeTruthy();
    expect(screen.getByText(/A questão não feita fica em branco/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ir para a questão 1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar às questões" }));
    expect(await screen.findByRole("radiogroup", { name: "Alternativas" })).toBeTruthy();
  });

  it("sem questão em branco, concluir finaliza direto", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_get_session") return sessionData;
      if (fn === "app_answer_question") return { ...correction(), selected: args.p_option, is_correct: true, play: null };
      if (fn === "app_finish_session") return { ...sessionData, finished_at: iso(NOW), result: { total: 1, answered: 1, correct: 1, active_seconds: 5, elapsed_seconds: 5, paused_seconds: 0, by_area: [] }, questions: [] };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    await open(session("treino", [question()]));
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar resposta" }));
    await screen.findByText("Você acertou");
    fireEvent.click(screen.getByRole("button", { name: "Concluir treino" }));
    await waitFor(() => expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_finish_session")).toBe(true));
    expect(screen.queryByRole("heading", { name: "Questões não feitas" })).toBeNull();
  });
});

describe("Dificuldade validada: só no treino, depois de responder, nunca em simulado", () => {
  const withDifficulty = (level: number | null) => {
    const base = backend.rpc.getMockImplementation()!;
    backend.rpc.mockImplementation(async (fn: string, args: any) => (fn === "app_question_difficulty" ? (level ? { level } : null) : base(fn, args)));
  };
  it("treino corrigido: 5 barras e o rótulo; sem validação, nada (nada estimado)", async () => {
    withDifficulty(3);
    const q = question({ selected: "B", correction: correction() });
    const { container } = await open(session("treino", [q]));
    expect(await screen.findByText("Média")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Dificuldade média, 3 de 5" })).toBeTruthy();
    expect(container.querySelectorAll('.tq-diff__bars i[data-on="true"]')).toHaveLength(3);
    cleanup();
    withDifficulty(null);
    await open(session("treino", [q]));
    await screen.findByText("Área e tema");
    expect(screen.queryByText("Dificuldade")).toBeNull();
  });
  it("simulado e antes de responder: a função nem é chamada", async () => {
    withDifficulty(4);
    await open(session("treino", [question()]));
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_question_difficulty")).toBe(false);
    cleanup();
    backend.rpc.mockClear();
    await open(session("simulado", [question({ selected: "A" })]));
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_question_difficulty")).toBe(false);
    expect(screen.queryByText("Dificuldade")).toBeNull();
  });
});

describe("Dica do Tutor antes de responder: só no treino, só quando o servidor libera", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const serverOn = (on: boolean) =>
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("/status")
        ? new Response(JSON.stringify({ ready: true, question_hint: on }), { status: 200 })
        : new Response(JSON.stringify({ hint: "Releia o que a pergunta pede e destaque os dados do caso.", source: "ia" }), { status: 200 })
    );

  it("servidor sem a dica liberada (padrão): o botão não aparece", async () => {
    serverOn(false);
    const newBackend = { ...backend, accessToken: async () => "t" };
    Object.assign(backend, { accessToken: newBackend.accessToken });
    await open(session("treino", [question()]));
    await screen.findByText("Pular");
    expect(screen.queryByRole("button", { name: /Peça uma dica/ })).toBeNull();
    delete backend.accessToken;
  });

  it("liberada: o botão abre a dica, que vem do servidor e não traz gabarito; some depois de responder e no simulado", async () => {
    serverOn(true);
    backend.accessToken = async () => "t";
    await open(session("treino", [question()]));
    fireEvent.click(await screen.findByRole("button", { name: "Travou? Peça uma dica ao Tutor" }));
    expect(await screen.findByText(/Releia o que a pergunta pede/)).toBeTruthy();
    expect(fetchMock.mock.calls.some((c: any[]) => String(c[0]).endsWith("/question-hint") && JSON.parse(c[1].body).question_id === "q1")).toBe(true);
    expect(screen.queryByText(/^Gabarito/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar resposta" }));
    await screen.findByText("Você acertou");
    expect(screen.queryByRole("button", { name: /dica ao Tutor/ })).toBeNull();
    cleanup();
    await open(session("simulado", [question()]));
    await screen.findByText("Restante");
    expect(screen.queryByRole("button", { name: /Peça uma dica/ })).toBeNull();
    delete backend.accessToken;
  });
});

describe("Marcar e relatar erro", () => {
  it("marcar para revisão chama o banco e muda o rótulo", async () => {
    await open(session("treino", [question()]));
    fireEvent.click(screen.getByRole("button", { name: /Marcar para revisão/ }));
    expect(await screen.findByText("Marcada para revisão")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_set_bookmark", { p_question_id: "q1", p_on: true });
  });

  it("'Nos avise de um erro' abre o formulário e envia o relato (sem código interno), agradecendo", async () => {
    await open(session("treino", [question()]));
    fireEvent.click(screen.getByRole("button", { name: "Nos avise de um erro" }));
    expect((screen.getByRole("button", { name: "Enviar aviso" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Fonte desatualizada" })).toBeNull(); // inédita: sem fontes ao aluno
    fireEvent.click(screen.getByRole("button", { name: "Gabarito incorreto" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar aviso" }));
    expect(await screen.findByText(/Recebemos seu aviso/)).toBeTruthy();
    const call = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_report_problem")!;
    expect(call[1].p_message).toContain("Questão Inédita · nº 13");
    expect(call[1].p_message).toContain("Gabarito incorreto");
    expect(call[1].p_message).not.toContain("q1");
  });
});
