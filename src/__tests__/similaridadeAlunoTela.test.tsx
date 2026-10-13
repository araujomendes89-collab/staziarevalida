// @vitest-environment jsdom
/**
 * Motor de Similaridade — bloco "Questões relacionadas" do aluno (telas, banco simulado). O bloco só é carregado depois de responder
 * (correção do treino, revisão do resultado e caderno de erros), mostra prova, número, rótulo, subtema e motivo, filtra Todas /
 * Semelhantes / Complementares, nunca mostra gabarito, explicação nem enunciado de outra questão, some sem itens e sem a função no
 * banco, e abre a outra questão pelo caminho de sempre (o banco abre uma sessão de treino e a tela vai para "sessao").
 *
 * Dados: questões REAIS do banco (fixtures/questoes-reais-similaridade.json, tiradas de questoes-1200.json). O que o banco simulado
 * devolve é montado a partir delas; o tipo de relação é escolhido só para testar os rótulos e o motivo é neutro (repete a
 * classificação que o banco já tem), sem nenhum laudo clínico inventado.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student", profile: { name: "Aluna" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: () => null }));

import { PracticeSession } from "../novo/app/practice/PracticeSession.jsx";
import { ErrorNotebook } from "../novo/app/review/ErrorNotebook.jsx";

type Real = {
  id: string; code: string; exam_id: string; number: number; area: string; topic: string; subtopic: string | null; statement: string;
  options: { id: string; text: string; explanation?: string | null }[]; correct_option: string; expected_conduct: string | null; inep_intent: string | null;
};
const REAIS: Real[] = JSON.parse(readFileSync("src/__tests__/fixtures/questoes-reais-similaridade.json", "utf8"));
const byId: Record<string, Real> = Object.fromEntries(REAIS.map((q) => [q.id, q]));
const BASE = byId.revalida_2021_1_q045;

const examOf = (examId: string) => {
  const m = /^(revalida|enamed)-(\d{4})(?:-(\d))?$/.exec(examId)!;
  return { id: examId, kind: m[1] === "enamed" ? "ENAMED" : "REVALIDA", year: Number(m[2]), semester: m[3] ? Number(m[3]) : null };
};
const examLabelOf = (examId: string) => {
  const e = examOf(examId);
  return `${e.kind === "ENAMED" ? "ENAMED" : "Revalida"} ${e.year}${e.semester ? `/${e.semester}` : ""}`;
};

/** Item do contrato (app_related_questions) a partir de uma questão real; motivo neutro, só com a classificação do banco. */
const related = (id: string, relation: string, extra: Record<string, unknown> = {}) => {
  const q = byId[id];
  return { id: q.id, code: q.code, exam_label: examLabelOf(q.exam_id), number: q.number, area: q.area, tema: q.topic, subtema: q.subtopic, relation, reason: `Mesmo tema na classificação do banco: ${q.topic}.`, answered: false, ...extra };
};
const ITEMS = [
  related("revalida_2023_2_q059", "mesmo_raciocinio"),
  related("revalida_2022_2_q074", "mesmo_subtema", { answered: true }),
  related("revalida_2021_1_q001", "complementar"),
  related("revalida_2024_1_q024", "mesmo_tema"),
];
const TITLE = {
  q059: "Revalida 2023/2 • Questão 59 — Raciocínio semelhante",
  q074: "Revalida 2022/2 • Questão 74 — Mesmo assunto",
  q001: "Revalida 2021 • Questão 1 — Questão complementar",
  q024: "Revalida 2024/1 • Questão 24 — Mesmo assunto",
};

const questionOf = (q: Real, over: Record<string, unknown> = {}) => ({
  id: q.id, code: q.code, number: q.number, area: q.area, origin: "official", exam: examOf(q.exam_id), statement: q.statement,
  options: q.options.map(({ id, text }) => ({ id, text })), images: [], support: null, bookmarked: false, selected: null, active_ms: 0, correction: null, ...over,
});
const correctionOf = (q: Real, selected: string) => ({
  is_correct: selected === q.correct_option, selected, correct_option: q.correct_option, topic: q.topic, subtopic: q.subtopic,
  explanation: q.options.find((o) => o.id === q.correct_option)?.explanation ?? null, option_notes: [], expected_conduct: q.expected_conduct,
  inep_intent: q.inep_intent, origin: "official", sources: [],
});
const iso = (ms: number) => new Date(ms).toISOString();
const sessionOf = (questions: any[], over: Record<string, unknown> = {}) => ({ id: "s1", kind: "questoes", filters: {}, started_at: iso(Date.now() - 60_000), finished_at: null, server_now: iso(Date.now()), locked: false, result: null, questions, ...over });

const MISSING = Object.assign(new Error("Could not find the function public.app_related_questions(p_limit, p_question_id) in the schema cache"), { code: "PGRST202" });
let rpcs: Record<string, (args: any) => any> = {};
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
beforeEach(() => {
  rpcs = {};
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (rpcs[fn]) return rpcs[fn](args);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

/** Sessão de treino com a questão base já respondida (correção à vista no painel). */
async function answered(relatedResult: () => any = () => ({ items: ITEMS })) {
  const go = vi.fn();
  rpcs.app_get_session = () => sessionOf([questionOf(BASE, { selected: BASE.correct_option, correction: correctionOf(BASE, BASE.correct_option) })]);
  rpcs.app_related_questions = relatedResult;
  render(
    <MemoryRouter initialEntries={["/sessao?s=s1"]}>
      <PracticeSession go={go} />
    </MemoryRouter>
  );
  await screen.findByText("Resposta correta.");
  return go;
}
const block = () => screen.findByRole("region", { name: "Questões relacionadas" });
const literal = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

describe("Questões relacionadas: quando aparece", () => {
  it("antes de responder não há chamada; depois de confirmar, o bloco carrega na correção do treino (com o aviso de que sai do treino)", async () => {
    const go = vi.fn();
    rpcs.app_get_session = () => sessionOf([questionOf(BASE)]);
    rpcs.app_answer_question = (a: any) => correctionOf(BASE, a.p_option);
    rpcs.app_related_questions = () => ({ items: ITEMS });
    render(
      <MemoryRouter initialEntries={["/sessao?s=s1"]}>
        <PracticeSession go={go} />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("radio", { name: new RegExp(`^${BASE.correct_option}`) }));
    expect(calls("app_related_questions")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Questões relacionadas" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    const region = await block();
    expect(calls("app_related_questions")).toEqual([["app_related_questions", { p_question_id: BASE.id, p_limit: 8 }]]);
    expect(within(region).getByText("Mesmo assunto, diferentes abordagens")).toBeTruthy();
    expect(within(region).getByText(/Abrir outra questão sai deste treino/)).toBeTruthy();
  });

  it("lista vazia: o bloco não aparece e a correção segue igual", async () => {
    await answered(() => ({ items: [] }));
    await waitFor(() => expect(calls("app_related_questions")).toHaveLength(1));
    expect(screen.queryByRole("region", { name: "Questões relacionadas" })).toBeNull();
    expect(screen.queryByText("Questões relacionadas")).toBeNull();
  });

  it("banco ainda sem a função: o bloco some, sem aviso técnico, e a correção segue igual", async () => {
    await answered(() => {
      throw MISSING;
    });
    await waitFor(() => expect(calls("app_related_questions")).toHaveLength(1));
    expect(screen.queryByText("Questões relacionadas")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST|app_related/);
    expect(screen.getByText("Resposta correta.")).toBeTruthy();
  });
});

describe("Questões relacionadas: conteúdo e filtros", () => {
  it("cada item: '<prova> • Questão <n> — <rótulo>', subtema e motivo; 'já respondida' só na que o aluno respondeu", async () => {
    await answered();
    const region = await block();
    const items = within(region).getAllByRole("listitem");
    expect(items.map((li) => li.firstElementChild!.textContent)).toEqual([TITLE.q059, TITLE.q074, TITLE.q001, TITLE.q024]);
    const q059 = items[0];
    expect(within(q059).getByText(byId.revalida_2023_2_q059.subtopic as string)).toBeTruthy();
    expect(within(q059).getByText(`Mesmo tema na classificação do banco: ${byId.revalida_2023_2_q059.topic}.`)).toBeTruthy();
    expect(within(items[1]).getByText("já respondida")).toBeTruthy();
    expect(items.filter((li) => within(li).queryByText("já respondida"))).toHaveLength(1);
  });

  it("filtros: Semelhantes = raciocínio semelhante + mesmo subtema; Complementares = complementares; Todas volta a lista", async () => {
    await answered();
    const region = await block();
    const titles = () => within(region).queryAllByRole("listitem").map((li) => li.firstElementChild!.textContent);
    const filters = within(region).getByRole("group", { name: "Filtrar questões relacionadas" });
    expect(within(filters).getByRole("button", { name: "Todas" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(filters).getByRole("button", { name: "Semelhantes" }));
    expect(titles()).toEqual([TITLE.q059, TITLE.q074]);
    fireEvent.click(within(filters).getByRole("button", { name: "Complementares" }));
    expect(titles()).toEqual([TITLE.q001]);
    fireEvent.click(within(filters).getByRole("button", { name: "Todas" }));
    expect(titles()).toHaveLength(4);
  });

  it("filtro sem itens diz isso, sem sumir com o bloco", async () => {
    await answered(() => ({ items: [ITEMS[0]] }));
    const region = await block();
    fireEvent.click(within(region).getByRole("button", { name: "Complementares" }));
    expect(within(region).getByText("Nenhuma questão neste filtro.")).toBeTruthy();
  });

  it("nunca mostra gabarito, explicação, conduta nem enunciado da outra questão, mesmo que venham do banco; nada de IA; tipos fora do aluno somem", async () => {
    const other = byId.revalida_2023_2_q059;
    const leaky = related(other.id, "mesmo_raciocinio", {
      correct_option: other.correct_option, statement: other.statement, options: other.options, expected_conduct: other.expected_conduct, explanation: other.expected_conduct,
    });
    const dup = related("revalida_2023_1_q039", "duplicada_exata");
    const self = related(BASE.id, "mesmo_tema");
    await answered(() => ({ items: [leaky, dup, self] }));
    const region = await block();
    const text = region.textContent ?? "";
    expect(within(region).getAllByRole("listitem")).toHaveLength(1);
    expect(text).toContain(TITLE.q059);
    expect(text).not.toContain(other.statement.slice(0, 60));
    expect(text).not.toContain((other.expected_conduct ?? "").slice(0, 40));
    for (const o of other.options) expect(text).not.toContain(o.text);
    expect(text).not.toMatch(/gabarito|alternativa correta|\bIA\b/i);
    expect(text).not.toContain(byId.revalida_2023_1_q039.code);
  });
});

describe("Questões relacionadas: abrir a outra questão", () => {
  it("'Resolver' pede ao banco a sessão daquela questão e vai para a tela da sessão", async () => {
    rpcs.app_start_related_question = () => ({ session_id: "s-rel", count: 1 });
    const go = await answered();
    const region = await block();
    fireEvent.click(within(region).getByRole("button", { name: `Resolver: ${TITLE.q059}` }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-rel" }));
    expect(calls("app_start_related_question")).toEqual([["app_start_related_question", { p_question_id: "revalida_2023_2_q059" }]]);
  });

  it("banco ainda sem a função de abrir: aviso simples, sem sair da tela", async () => {
    rpcs.app_start_related_question = () => {
      throw Object.assign(new Error("Could not find the function public.app_start_related_question(p_question_id) in the schema cache"), { code: "PGRST202" });
    };
    const go = await answered();
    const region = await block();
    fireEvent.click(within(region).getByRole("button", { name: `Resolver: ${TITLE.q001}` }));
    expect(await within(region).findByRole("alert")).toHaveProperty("textContent", "Abrir esta questão por aqui ainda não está disponível. Tente mais tarde.");
    expect(go).not.toHaveBeenCalled();
  });

  it("recusa do banco em português (Questões Inéditas sem acesso) aparece como veio", async () => {
    const lock = "Seu teste grátis terminou. As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
    rpcs.app_start_related_question = () => {
      throw Object.assign(new Error(lock), { code: "42501" });
    };
    const go = await answered();
    const region = await block();
    fireEvent.click(within(region).getByRole("button", { name: `Resolver: ${TITLE.q059}` }));
    expect((await within(region).findByRole("alert")).textContent).toBe(lock);
    expect(go).not.toHaveBeenCalled();
  });

  it("item bloqueado (cadeado): sem 'Resolver', com o aviso do banco e 'Ver planos'", async () => {
    // o banco já filtra as Inéditas de quem não tem acesso; aqui o sinal de bloqueio é simulado num item real para testar o cadeado
    const lock = "Seu teste grátis terminou. As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
    const go = await answered(() => ({ items: [related("revalida_2023_2_q059", "mesmo_raciocinio", { locked: true, lock_message: lock })] }));
    const region = await block();
    expect(within(region).queryByRole("button", { name: /Resolver/ })).toBeNull();
    expect(within(region).getByText(lock)).toBeTruthy();
    fireEvent.click(within(region).getByRole("button", { name: "Ver planos" }));
    expect(go).toHaveBeenCalledWith("planos");
    expect(calls("app_start_related_question")).toHaveLength(0);
  });
});

describe("Questões relacionadas: revisão do resultado e caderno de erros", () => {
  it("resultado do treino: o bloco aparece ao abrir a questão na revisão", async () => {
    const go = vi.fn();
    rpcs.app_get_session = () =>
      sessionOf([questionOf(BASE, { selected: "B", correction: correctionOf(BASE, "B") })], {
        finished_at: iso(Date.now()),
        result: { total: 1, answered: 1, correct: 0, by_area: [{ area: BASE.area, total: 1, answered: 1, correct: 0 }], active_seconds: 40 },
      });
    rpcs.app_related_questions = () => ({ items: ITEMS });
    rpcs.app_start_related_question = () => ({ session_id: "s-rel", count: 1 });
    render(
      <MemoryRouter initialEntries={["/sessao?s=s1"]}>
        <PracticeSession go={go} />
      </MemoryRouter>
    );
    await screen.findByText("Resultado do treino", { exact: false });
    expect(calls("app_related_questions")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: literal(BASE.statement.slice(0, 40)), expanded: false }));
    const region = await block();
    expect(within(region).queryByText(/Abrir outra questão sai deste treino/)).toBeNull();
    fireEvent.click(within(region).getByRole("button", { name: `Resolver: ${TITLE.q024}` }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-rel" }));
  });

  it("caderno de erros: o bloco aparece na questão aberta e abre a outra questão", async () => {
    const go = vi.fn();
    rpcs.app_error_notebook = () => ({
      counts: { pending: 1, overcome: 0, recurrent: 0 },
      items: [{ question_id: BASE.id, area: BASE.area, topic: BASE.topic, excerpt: BASE.statement.slice(0, 80), number: BASE.number, exam: examOf(BASE.exam_id), status: "para_revisar", wrong_count: 1, last_attempt_at: iso(Date.now()), has_note: false }],
    });
    rpcs.app_error_detail = () => ({ ...questionOf(BASE), selected: "B", correction: correctionOf(BASE, "B"), note: null, reason: null });
    rpcs.app_related_questions = () => ({ items: ITEMS });
    rpcs.app_start_related_question = () => ({ session_id: "s-rel", count: 1 });
    render(
      <MemoryRouter>
        <ErrorNotebook go={go} />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: literal(BASE.topic) }));
    const region = await block();
    expect(calls("app_related_questions")[0][1]).toEqual({ p_question_id: BASE.id, p_limit: 8 });
    expect(within(region).queryByText(/Abrir outra questão sai deste treino/)).toBeNull();
    fireEvent.click(within(region).getByRole("button", { name: `Resolver: ${TITLE.q074}` }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-rel" }));
    expect(calls("app_start_related_question")[0][1]).toEqual({ p_question_id: "revalida_2022_2_q074" });
  });
});
