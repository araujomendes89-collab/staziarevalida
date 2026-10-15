/**
 * Simulado TRI (estimativa StaziaMed) nas telas (jsdom, banco simulado): na montagem do simulado o aluno escolhe "Como corrigir?"
 * (Clássico por acertos, o padrão, ou TRI estimativa) com o texto do que é cada um; no resultado TRI aparecem a nota, a faixa de
 * incerteza, o aviso fixo "Estimativa StaziaMed, não é a nota do Inep", o "O que é isso?" e o desempenho por área. O modo clássico
 * fica como sempre. As regras de verdade (conta, RLS, recorreção) estão em simuladoTriBanco.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TRI_LABEL, formatNota, tendencia } from "../novo/app/practice/tri.js";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { SessionResult } from "../novo/app/practice/SessionResult.jsx";

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

describe("Montagem do simulado: Como corrigir?", () => {
  beforeEach(() => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_question_filters") return { total: 200, exams: [], topics: [] };
      if (fn === "app_count_questions") return { total: 200, by_area: { PEDIATRIA: 40 } };
      if (fn === "app_recent_sessions") return [];
      if (fn === "app_start_session") return { session_id: "s-classico", count: 30 };
      if (fn === "app_start_simulado_tri") return { session_id: "s-tri", count: 30, scoring: "irt" };
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });
  const renderBuilder = (go = vi.fn(), mode = "sim") =>
    render(
      <MemoryRouter>
        <QuestionBuilder go={go} mode={mode} />
      </MemoryRouter>
    );

  it("o clássico por acertos vem marcado; os dois modos explicam o que são", async () => {
    renderBuilder();
    const grupo = await screen.findByRole("radiogroup", { name: "Como corrigir?" });
    const classico = within(grupo).getByRole("radio", { name: /Clássico — por acertos/ });
    const tri = within(grupo).getByRole("radio", { name: /TRI — estimativa StaziaMed/ });
    expect(classico.getAttribute("aria-checked")).toBe("true");
    expect(tri.getAttribute("aria-checked")).toBe("false");
    expect(grupo.textContent).toMatch(/acertos ÷ questões válidas/);
    expect(grupo.textContent).toMatch(/mesmo tipo de modelo do Inep \(Rasch\)/);
    expect(grupo.textContent).toMatch(/não é a nota do Inep/);
  });

  it("clássico: inicia como sempre (app_start_session)", async () => {
    const go = vi.fn();
    renderBuilder(go);
    await screen.findByText("30 questões");
    fireEvent.click(screen.getByRole("button", { name: /Iniciar simulado/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-classico" }));
    expect(backend.rpc.mock.calls.some(([fn]: [string]) => fn === "app_start_simulado_tri")).toBe(false);
  });

  it("TRI: inicia pelo app_start_simulado_tri com os mesmos filtros, quantidade e tempo", async () => {
    const go = vi.fn();
    renderBuilder(go);
    await screen.findByText("30 questões");
    fireEvent.click(screen.getByRole("radio", { name: /TRI — estimativa StaziaMed/ }));
    expect(screen.getByRole("radio", { name: /TRI — estimativa StaziaMed/ }).getAttribute("aria-checked")).toBe("true");
    // com 30 questões, o aviso da faixa larga
    expect(screen.getByText(/faixa de incerteza fica larga/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Iniciar simulado/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-tri" }));
    const call = backend.rpc.mock.calls.find(([fn]: [string]) => fn === "app_start_simulado_tri");
    expect(call[1]).toEqual({ p_filters: { area: "", exam_id: "", search: "", status: "all" }, p_count: 30, p_time_limit_seconds: 30 * 180 });
  });

  it("TRI com menos de 30 questões disponíveis: não inicia e explica", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_question_filters") return { total: 20, exams: [], topics: [] };
      if (fn === "app_count_questions") return { total: 20, by_area: {} };
      if (fn === "app_recent_sessions") return [];
      throw new Error(`rpc não simulada: ${fn}`);
    });
    renderBuilder();
    await screen.findByText("20 questões");
    fireEvent.click(screen.getByRole("radio", { name: /TRI — estimativa StaziaMed/ }));
    expect(screen.getByText(/precisa de pelo menos 30 questões/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Iniciar simulado/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("no treino de questões não há escolha de correção", async () => {
    renderBuilder(vi.fn(), "questoes");
    await screen.findByText("20 questões");
    expect(screen.queryByRole("radiogroup", { name: "Como corrigir?" })).toBeNull();
  });
});

const Q = (n: number, area: string, selected: string | null, right: boolean) => ({
  id: `q${n}`,
  number: n,
  area,
  exam: { id: "e", kind: "REVALIDA", year: 2025, semester: 1 },
  statement: `Caso ${n}. Conduta?`,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}` })),
  images: [],
  selected,
  correction: { is_correct: selected ? right : null, correct_option: "B", explanation: null, option_notes: [], sources: [] },
});
const FINISHED = {
  id: "s-tri",
  kind: "simulado",
  filters: { area: "" },
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  questions: [Q(1, "PEDIATRIA", "B", true), Q(2, "PEDIATRIA", "A", false), Q(3, "CLINICA_MEDICA", "B", true)],
  result: {
    total: 3, answered: 3, correct: 2, active_seconds: 60, elapsed_seconds: 90, paused_seconds: 0,
    by_area: [{ area: "CLINICA_MEDICA", total: 1, answered: 1, correct: 1 }, { area: "PEDIATRIA", total: 2, answered: 2, correct: 1 }],
  },
};
const TRI = {
  scoring: "irt",
  ready: true,
  label: "Estimativa StaziaMed, não é a nota do Inep",
  method: "EAP",
  scale: { media: 50, por_logit: 10 },
  theta: 1.234,
  se: 0.3,
  theta_lo: 0.646,
  theta_hi: 1.822,
  nota: 62.3,
  nota_lo: 56.5,
  nota_hi: 68.2,
  n_items: 98,
  n_correct: 70,
  n_blank: 3,
  n_annulled: 2,
  n_rejected: 0,
  n_provisional: 60,
  n_calibrated: 38,
  n_preliminary: 4,
  by_area: [
    { area: "CLINICA_MEDICA", n_items: 20, n_correct: 17, expected: 14.2, nota: 66.1, nota_lo: 52.3, nota_hi: 79.9 },
    { area: "PEDIATRIA", n_items: 20, n_correct: 10, expected: 13.9, nota: 49.8, nota_lo: 37.5, nota_hi: 62.1 },
    { area: "CIRURGIA_GERAL", n_items: 20, n_correct: 14, expected: 14.1, nota: 61.9, nota_lo: 48.8, nota_hi: 75 },
  ],
  by_topic: [],
};
const renderResult = () =>
  render(
    <MemoryRouter>
      <SessionResult session={FINISHED} go={vi.fn()} />
    </MemoryRouter>
  );

describe("Resultado do simulado TRI", () => {
  it("mostra a nota StaziaMed com a faixa, o aviso fixo e a qualidade da estimativa; o clássico continua abaixo", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_session_irt_result" && args.p_session_id === "s-tri") return TRI;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    renderResult();
    const card = await screen.findByRole("region", { name: /Simulado TRI/ });
    expect(within(card).getByText("62,3")).toBeTruthy();
    expect(card.textContent).toMatch(/faixa de 56,5 a 68,2/);
    expect(card.textContent).toMatch(/Estimativa StaziaMed, não é a nota do Inep/);
    expect(card.textContent).toMatch(/98 questões na conta/);
    expect(card.textContent).toMatch(/38 com dificuldade calibrada/);
    expect(card.textContent).toMatch(/60 com dificuldade provisória/);
    expect(card.textContent).toMatch(/2 anuladas fora da conta/);
    expect(card.textContent).toMatch(/4 com gabarito preliminar/);
    // o placar clássico não some
    expect(screen.getByText("Aproveitamento")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/aprovad/i);
  });

  it("'O que é isso?' abre a explicação simples (régua, faixa, provisória × calibrada, não é o Inep)", async () => {
    backend.rpc.mockResolvedValue(TRI);
    renderResult();
    const botao = await screen.findByRole("button", { name: "O que é isso?" });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/mesma régua/);
    expect(texto).toMatch(/50 é o meio da régua/);
    expect(texto).toMatch(/95%/);
    expect(texto).toMatch(/provisória/);
    expect(texto).toMatch(/calibrada/);
    expect(texto).toMatch(/não publica a dificuldade das questões/);
    expect(texto).not.toMatch(/aprovad/i);
  });

  it("desempenho por área: acertos × esperado pelo modelo e a tendência", async () => {
    backend.rpc.mockResolvedValue(TRI);
    renderResult();
    const area = await screen.findByRole("list", { name: "Desempenho por área (TRI)" });
    const itens = within(area).getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(itens[0].textContent).toMatch(/Clínica Médica/);
    expect(itens[0].textContent).toMatch(/17 de 20 · esperado 14,2/);
    expect(itens[0].textContent).toMatch(/acima do esperado/);
    expect(itens[1].textContent).toMatch(/abaixo do esperado/);
    expect(itens[2].textContent).toMatch(/dentro do esperado/);
  });

  it("simulado clássico: nada de TRI na tela", async () => {
    backend.rpc.mockResolvedValue({ scoring: "classic" });
    renderResult();
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_session_irt_result", { p_session_id: "s-tri" }));
    expect(screen.queryByRole("region", { name: /Simulado TRI/ })).toBeNull();
    expect(screen.getByText("Aproveitamento")).toBeTruthy();
  });

  it("formatação e tendência", () => {
    expect(formatNota(62.3)).toBe("62,3");
    expect(formatNota(50)).toBe("50,0");
    expect(TRI_LABEL).toBe("Estimativa StaziaMed, não é a nota do Inep");
    expect(tendencia({ n_correct: 17, expected: 14.2 })).toBe("acima");
    expect(tendencia({ n_correct: 10, expected: 13.9 })).toBe("abaixo");
    expect(tendencia({ n_correct: 14, expected: 14.1 })).toBe("dentro");
  });
});
