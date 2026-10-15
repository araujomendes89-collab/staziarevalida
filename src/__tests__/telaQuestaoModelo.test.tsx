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
    expect(screen.getByText("Pergunta")).toBeTruthy();
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
    await waitFor(() => expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_answer_question" && c[1].p_option === "C")).toBe(true));
    expect(screen.getByText("Alternativa C guardada")).toBeTruthy();
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

describe("Marcar e relatar erro", () => {
  it("marcar para revisão chama o banco e muda o rótulo", async () => {
    await open(session("treino", [question()]));
    fireEvent.click(screen.getByRole("button", { name: /Marcar para revisão/ }));
    expect(await screen.findByText("Marcada para revisão")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_set_bookmark", { p_question_id: "q1", p_on: true });
  });

  it("'Nos avise' abre o formulário e envia o relato (sem código interno), agradecendo", async () => {
    await open(session("treino", [question()]));
    fireEvent.click(screen.getByRole("button", { name: "Nos avise" }));
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
