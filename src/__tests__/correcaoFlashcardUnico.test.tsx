// @vitest-environment jsdom
/**
 * Hotfix: "Criar flashcard" aparecia dezenas de vezes na correção (questão preliminar de 2026/2, aluno errou).
 * Aqui a correção é aberta no treino, no resultado e no caderno de erros, com o banco simulado e questão real do banco:
 * tem de haver UM botão e um número limitado de chamadas ao banco (sem laço de renderização).
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";

const backend: any = { rpc: vi.fn() };
let mobileFlag = false;
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student", profile: { name: "Aluna" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => mobileFlag, useMQ: () => mobileFlag }));

import { PracticeSession } from "../novo/app/practice/PracticeSession.jsx";
import { ErrorNotebook } from "../novo/app/review/ErrorNotebook.jsx";

const REAIS: any[] = JSON.parse(readFileSync("src/__tests__/fixtures/questoes-reais-similaridade.json", "utf8"));
const Q = REAIS[0];
const wrongOption = Q.options.find((o: any) => o.id !== Q.correct_option).id;
const PRELIM = { expected_on: "2026-12-04" };
const question = (over: any = {}) => ({
  id: Q.id, code: Q.code, number: Q.number, area: Q.area, origin: "official", exam: { id: "revalida-2026-2", kind: "REVALIDA", year: 2026, semester: 2 },
  statement: Q.statement, options: Q.options.map(({ id, text }: any) => ({ id, text })), images: [], support: null, bookmarked: false,
  selected: wrongOption, active_ms: 0, preliminary: PRELIM, correction: correction(), ...over,
});
const correction = () => ({
  is_correct: false, selected: wrongOption, correct_option: Q.correct_option, topic: Q.topic, subtopic: Q.subtopic, explanation: null, option_notes: [],
  expected_conduct: Q.expected_conduct, inep_intent: Q.inep_intent, origin: "official", sources: [{ title: "Gabarito preliminar do Inep", organization: "Inep" }],
  in_review: true, answer_preliminary: true, preliminary: PRELIM,
});
const iso = (ms: number) => new Date(ms).toISOString();
const session = (questions: any[], over: any = {}) => ({ id: "s1", kind: "questoes", filters: {}, started_at: iso(Date.now() - 60_000), finished_at: null, server_now: iso(Date.now()), locked: false, result: null, questions, ...over });

let rpcs: Record<string, (a: any) => any> = {};
beforeEach(() => {
  rpcs = {};
  mobileFlag = false;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, a: any) => {
    if (rpcs[fn]) return rpcs[fn](a);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);
const settle = () => new Promise((r) => setTimeout(r, 150));
const count = () => screen.queryAllByRole("button", { name: "Criar flashcard" }).length;
const callsTotal = () => backend.rpc.mock.calls.length;

describe("Correção: um só 'Criar flashcard', sem laço", () => {
  it("sem chaves repetidas entre os blocos da correção (causa do botão duplicado: React avisa 'two children with the same key')", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcs.app_get_session = () => session([question()]);
    rpcs.app_related_questions = () => ({ items: [{ id: "revalida_2023_2_q059", exam_label: "Revalida 2023/2", number: 59, relation: "mesmo_tema", subtema: "x", reason: "y", answered: false }] });
    render(<MemoryRouter initialEntries={["/sessao?s=s1"]}><PracticeSession go={vi.fn()} /></MemoryRouter>);
    await screen.findByRole("region", { name: "Questões relacionadas" });
    await settle();
    const dup = err.mock.calls.filter((c) => /same key/i.test(String(c[0]) + String(c[1])));
    err.mockRestore();
    expect(dup).toHaveLength(0);
    expect(count()).toBe(1);
  });

  for (const mobile of [false, true]) {
    it(`treino (${mobile ? "celular" : "computador"}): um botão e poucas chamadas ao banco`, async () => {
      mobileFlag = mobile;
      rpcs.app_get_session = () => session([question()]);
      rpcs.app_related_questions = () => ({ items: [] });
      render(<MemoryRouter initialEntries={["/sessao?s=s1"]}><PracticeSession go={vi.fn()} /></MemoryRouter>);
      await screen.findByText("A explicação desta questão está em revisão pela equipe.");
      await settle();
      expect(count()).toBe(1);
      expect(callsTotal()).toBeLessThan(10);
    });
  }

  it("resultado: um botão por correção aberta", async () => {
    rpcs.app_get_session = () => session([question()], { finished_at: iso(Date.now()), result: { total: 1, answered: 1, correct: 0, by_area: [] } });
    rpcs.app_related_questions = () => ({ items: [] });
    render(<MemoryRouter initialEntries={["/sessao?s=s1"]}><PracticeSession go={vi.fn()} /></MemoryRouter>);
    const row = await screen.findByRole("button", { expanded: false, name: /./ }).catch(() => null);
    await settle();
    const toggles = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-expanded") === "false");
    fireEvent.click(toggles[0]);
    await screen.findByText("A explicação desta questão está em revisão pela equipe.");
    await settle();
    expect(count()).toBe(1);
    expect(callsTotal()).toBeLessThan(12);
  });

  it("caderno de erros: um botão", async () => {
    rpcs.app_error_notebook = () => ({ items: [{ question_id: Q.id, topic: Q.topic, excerpt: "x", area: Q.area, status: "para_revisar", wrong_count: 1, last_attempt_at: iso(Date.now()), exam: { year: 2026, semester: 2, kind: "REVALIDA" }, number: Q.number, preliminary: PRELIM }], counts: { all: 1, pending: 1, overcome: 0 }, total: 1 });
    rpcs.app_error_detail = () => question();
    rpcs.app_related_questions = () => ({ items: [] });
    render(<MemoryRouter><ErrorNotebook go={vi.fn()} /></MemoryRouter>);
    await settle();
    const toggles = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-expanded") === "false");
    fireEvent.click(toggles[0]);
    await screen.findByText("A explicação desta questão está em revisão pela equipe.");
    await settle();
    expect(count()).toBe(1);
    expect(callsTotal()).toBeLessThan(12);
  });
});
