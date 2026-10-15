// @vitest-environment jsdom
/**
 * Questões StaziaMed — lado do aluno (Tarefa 14): a opção "Questões Inéditas" na lista "Prova / edição", o aviso e o convite para
 * quem está fechado (teste vencido, plano vencido, sem assinatura), o rótulo "Questão Inédita · nº 12" com o selo de que não é
 * oficial do Inep, a tabela de apoio, a correção "Gabarito StaziaMed" com as fontes oficiais citadas e o caderno de erros.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: () => <button type="button">Conversar com o Tutor</button> }));

import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { PracticeSession } from "../novo/app/practice/PracticeSession.jsx";
import { examLabel, isStaziamed, questionRef } from "../novo/app/practice/format.js";
import { ErrorNotebook } from "../novo/app/review/ErrorNotebook.jsx";

const SUPPORT = { type: "TABLE", title: "Exames da admissão", rows: [{ label: "Hemoglobina", value: "11 g/dL" }, { label: "Leucócitos", value: "14.000/mm3" }] };
const STAZ = { id: "staziamed_q0012", code: "STZ-0012", number: 12, area: "PEDIATRIA", origin: "staziamed", support: SUPPORT, exam: { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões StaziaMed" } };
const questionOf = (over: any = {}) => ({
  ...STAZ, statement: "Lactente de 8 meses com febre há 3 dias e otalgia. Qual é a conduta inicial?", images: [], bookmarked: false, selected: null, active_ms: 0, correction: null,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id}` })), ...over,
});
const CORRECTION = {
  is_correct: false, correct_option: "B", topic: "Otite média aguda", subtopic: null, explanation: "Amoxicilina é a primeira escolha em lactentes.",
  option_notes: [{ id: "A", text: "Observação isolada não é a conduta." }, { id: "C", text: "Não é a primeira escolha." }],
  expected_conduct: "Tratar a otite média aguda com amoxicilina.", inep_intent: null, origin: "staziamed", support: SUPPORT,
  sources: [{ title: "PCDT de Otite", organ: "Ministério da Saúde", level: "A", page: 7, version: "2026" }],
  official_sources: [{ passage_id: "p1", source: "PCDT de Otite", organ: "Ministério da Saúde", version: "2026", page: 7, quote: "indica-se amoxicilina 90 mg/kg/dia por 10 dias", supports: "x" }],
};
const iso = (ms: number) => new Date(ms).toISOString();
const session = (over: any = {}) => ({ id: "s1", kind: "questoes", filters: { exam_id: "staziamed" }, started_at: iso(Date.now() - 60_000), finished_at: null, server_now: iso(Date.now()), collection: "staziamed", locked: false, result: null, questions: [questionOf()], ...over });

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

describe("Rótulos", () => {
  it("questionRef e examLabel: 'Questão Inédita · nº 12', 'Questões Inéditas' na lista e 'Revalida 2024/1 · Q51'", () => {
    expect(questionRef(STAZ)).toBe("Questão Inédita · nº 12");
    expect(examLabel(STAZ.exam)).toBe("Questões Inéditas");
    expect(questionRef({ number: 51, exam: { kind: "REVALIDA", year: 2024, semester: 1 } })).toBe("Revalida 2024/1 · Q51");
    expect(isStaziamed(STAZ)).toBe(true);
    expect(isStaziamed({ exam: { kind: "ENAMED" } })).toBe(false);
    expect(isStaziamed({ origin: "staziamed" })).toBe(true);
  });
});

describe("Montador: opção 'Questões Inéditas' na lista 'Prova / edição'", () => {
  const filters = (staz: any) => ({ total: 1200, exams: [{ id: "revalida-2024-1", kind: "REVALIDA", year: 2024, semester: 1, title: "Revalida 2024/1", total: 100 }, ...(staz ? [staz] : [])], topics: [] });
  const open = (staz: any) => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_question_filters") return filters(staz);
      if (fn === "app_count_questions") return args.p_filters.exam_id === "staziamed" ? { total: staz?.locked ? 0 : staz?.total ?? 0, by_area: { PEDIATRIA: staz?.locked ? 0 : staz?.total ?? 0 } } : { total: 1200, by_area: { PEDIATRIA: 240 } };
      if (fn === "app_recent_sessions") return [];
      if (fn === "app_start_session") return { session_id: "s-novo" };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const go = vi.fn();
    render(
      <MemoryRouter>
        <QuestionBuilder go={go} mode="q" />
      </MemoryRouter>
    );
    return go;
  };
  const OPEN = { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas", total: 8, locked: false, lock_message: null };

  it("a lista traz 'Questões Inéditas'; escolhida, mostra o aviso e manda exam_id 'staziamed' (teste grátis válido também abre)", async () => {
    const go = open(OPEN);
    const select = (await screen.findByLabelText("Prova / edição")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Todas as provas oficiais", "Revalida 2024/1", "Questões Inéditas"]);
    fireEvent.change(select, { target: { value: "staziamed" } });
    expect(await screen.findByText("Questões criadas pela StaziaMed a partir de fontes oficiais e revisadas por médico. Não é questão oficial do Inep.", { exact: false })).toBeTruthy();
    expect(screen.getByText(/não é o mesmo que "ainda não respondidas"/)).toBeTruthy();
    expect(screen.queryByText("Ver planos")).toBeNull();
    await waitFor(() => expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_count_questions" && c[1].p_filters.exam_id === "staziamed")).toBe(true));
    const start = await screen.findByRole("button", { name: "Começar treino" });
    await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
    fireEvent.click(start);
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-novo" }));
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_start_session")![1].p_filters.exam_id).toBe("staziamed");
  });

  it.each([
    ["teste vencido", "Seu teste grátis terminou. As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas."],
    ["plano vencido", "Seu plano pago terminou. As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas."],
    ["sem assinatura", "As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas."],
  ])("fechado (%s): cadeado, o aviso do banco e 'Ver planos'; nunca inicia sessão", async (_name, message) => {
    const go = open({ ...OPEN, locked: true, lock_message: message });
    const select = (await screen.findByLabelText("Prova / edição")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain("Questões Inéditas (indisponível no seu plano agora)");
    fireEvent.change(select, { target: { value: "staziamed" } });
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("Questões Inéditas indisponíveis agora")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Começar treino" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Ver planos" })[0]); // o cartão do topo e o aviso do filtro levam ao mesmo lugar
    expect(go).toHaveBeenCalledWith("planos");
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_start_session")).toBe(false);
  });

  it("sem Questões Inéditas publicadas a opção não aparece; o resto do montador segue igual", async () => {
    open(null);
    const select = (await screen.findByLabelText("Prova / edição")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Todas as provas oficiais", "Revalida 2024/1"]);
  });
});

describe("Sessão e correção", () => {
  const openSession = (s: any) => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_get_session") return s;
      if (fn === "app_question_commentary") throw new Error("comentário da Stazia não existe para Questão StaziaMed");
      throw new Error(`rpc não simulada: ${fn}`);
    });
    return render(
      <MemoryRouter initialEntries={["/sessao?s=s1"]}>
        <PracticeSession go={vi.fn()} />
      </MemoryRouter>
    );
  };

  it("sessão: 'Questão Inédita · nº 12', selo 'não é questão oficial do Inep' e a tabela de apoio antes das alternativas", async () => {
    openSession(session());
    expect(await screen.findByText("Questão Inédita · nº 12")).toBeTruthy();
    expect(screen.getByText("Não é questão oficial do Inep")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Exames da admissão" });
    expect(within(table).getByText("Hemoglobina")).toBeTruthy();
    expect(within(table).getByText("14.000/mm3")).toBeTruthy();
    // a tabela vem antes das alternativas e rola sozinha (nunca a página inteira)
    const options = screen.getByRole("radiogroup", { name: "Alternativas" });
    expect(table.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.parentElement!.style.overflowX).toBe("auto");
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_question_commentary")).toBe(false);
  });

  it("correção: 'Gabarito StaziaMed', 'Por que não as outras?' e conduta; NENHUMA fonte (decisão do dono: as fontes das inéditas ficam na tabela interna); nunca 'gabarito oficial' nem 'O que a questão avalia'; sem Tutor", async () => {
    const { container } = openSession(session({ questions: [questionOf({ selected: "A", correction: CORRECTION })] }));
    expect(await screen.findByText("Gabarito StaziaMed")).toBeTruthy();
    expect(screen.getByText(/questão autoral, não oficial do Inep/)).toBeTruthy();
    expect(container.querySelector(".tq-verdict__key")!.textContent).toBe("Gabarito: B");
    expect(screen.getByText("Por que não as outras?")).toBeTruthy();
    expect(screen.getByText(/Tratar a otite média aguda com amoxicilina\./)).toBeTruthy();
    // o banco ainda manda official_sources na correção; o aluno não as vê (nem título, nem órgão, nem versão, nem página, nem trecho)
    expect(screen.queryByText("Fontes oficiais citadas")).toBeNull();
    expect(screen.queryByText("Fontes")).toBeNull();
    expect(container.querySelector(".tq-src")).toBeNull();
    for (const termo of ["PCDT de Otite", "Ministério da Saúde", "versão 2026", "p. 7", "indica-se amoxicilina 90 mg/kg/dia por 10 dias"]) expect(container.textContent).not.toContain(termo);
    expect(screen.queryByText(/gabarito oficial/i)).toBeNull();
    expect(screen.queryByText("O que a questão avalia")).toBeNull();
    expect(screen.queryByRole("button", { name: /Tutor/ })).toBeNull();
  });

  it("sessão de quem ficou sem acesso: o aviso do banco e 'Ver planos', sem erro", async () => {
    const message = "Seu teste grátis terminou. As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
    openSession(session({ locked: true, lock_message: message, questions: [] }));
    expect(await screen.findByText("Questões Inéditas indisponíveis agora")).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver planos" })).toBeTruthy();
  });

  it("questão oficial segue como sempre: 'Gabarito: …', sem selo e com o Tutor", async () => {
    const oficial = { ...questionOf({ origin: "official", support: null, exam: { id: "r", kind: "REVALIDA", year: 2024, semester: 1 }, number: 51, selected: "A", correction: { ...CORRECTION, origin: "official", official_sources: undefined, sources: [{ title: "Edital do Inep", organization: "Inep" }] } }) };
    openSession(session({ collection: "oficiais", filters: {}, questions: [oficial] }));
    expect(await screen.findByText("Revalida 2024/1 · Q51")).toBeTruthy();
    expect(screen.queryByText("Não é questão oficial do Inep")).toBeNull();
    expect(document.querySelector(".tq-src")!.textContent).toContain("Edital do Inep");
    expect(screen.queryByText("Fontes oficiais citadas")).toBeNull();
  });
});

describe("Caderno de erros", () => {
  it("rótulo e selo da questão StaziaMed", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_error_notebook") return { counts: { para_revisar: 1, superada: 0, all: 1 }, items: [{ question_id: "staziamed_q0012", area: "PEDIATRIA", topic: "Otite média aguda", excerpt: "Lactente de 8 meses…", number: 12, exam: STAZ.exam, status: "para_revisar", wrong_count: 1, last_attempt_at: iso(Date.now()), has_note: false }] };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(
      <MemoryRouter>
        <ErrorNotebook go={vi.fn()} />
      </MemoryRouter>
    );
    const row = await screen.findByText(/Questão Inédita · nº 12/);
    expect(row.textContent).toContain("não é questão oficial do Inep");
  });
});
