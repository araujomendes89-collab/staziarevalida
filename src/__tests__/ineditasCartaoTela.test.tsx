// @vitest-environment jsdom
/**
 * "Questões Inéditas" visível na tela do aluno: cartão no Banco de Questões (abre direto a resolução), atalho no Início e no
 * Plano de Hoje, os quatro estados (teste com 20 liberadas, pago com limite, pago com todas, sem acesso) e o selo "Questão Inédita".
 * Só números: nenhum gabarito, explicação, fonte ou código, e nenhum preço.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student", profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/play/PlayDashboard.jsx", () => ({
  PlayError: () => null, PlayHeader: () => null, PlayLoading: () => null, PlayLower: () => null, TrailPreview: () => null,
  usePlayHome: () => ({ busy: false, startNode: () => {} }),
}));
vi.mock("../novo/app/admin/radar/useRadarAvisos.js", () => ({ useRadarAvisos: () => [] }));

import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { HomeScreen } from "../novo/app/home/HomeScreen.jsx";
import { TodayPlan } from "../novo/app/home/TodayPlan.jsx";
import { IneditasCard, IneditaSeal, counterText, ineditasState } from "../novo/app/practice/IneditasCard.jsx";
import { questionRef } from "../novo/app/practice/format.js";

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

const TESTE = { total: 74, released: 20, answered: 3, limit: 20, limited: true, locked: false };
const PAGO_LIMITE = { total: 74, released: 40, answered: 40, limit: 40, limited: true, locked: false };
const PAGO_TODAS = { total: 74, released: 74, answered: 10, limit: null, limited: false, locked: false };
const SEM_ACESSO = { total: 74, released: 0, answered: 0, limit: 0, limited: true, locked: true };
const entry = (i: any) => ({ id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas", lock_message: null, ...i });

describe("estados do cartão", () => {
  it("classifica e conta: teste, pago com limite, pago com todas, sem acesso e sem inéditas", () => {
    expect(ineditasState(TESTE)).toBe("limitado");
    expect(counterText(TESTE)).toBe("20 de 74 liberadas");
    expect(ineditasState(PAGO_LIMITE)).toBe("limitado");
    expect(ineditasState(PAGO_TODAS)).toBe("todas");
    expect(counterText(PAGO_TODAS)).toBe("Todas as 74 liberadas");
    expect(ineditasState(SEM_ACESSO)).toBe("sem_acesso");
    expect(counterText(SEM_ACESSO)).toBe("74 questões no banco");
    expect(ineditasState({ ...TESTE, total: 0 })).toBe("oculto");
    expect(ineditasState(null)).toBe("oculto");
    expect(ineditasState({ ...TESTE, limit: 80, released: 74 })).toBe("todas");
  });

  it("textos: convite no limite, nada de preço, e sem acesso só convida a ver os planos", () => {
    const onOpen = vi.fn();
    const onPlans = vi.fn();
    const { unmount } = render(<IneditasCard ineditas={TESTE} onOpen={onOpen} onPlans={onPlans} />);
    expect(screen.getByText("20 de 74 liberadas")).toBeTruthy();
    expect(screen.getByText("3 de 20")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolver Questões Inéditas" }));
    expect(onOpen).toHaveBeenCalledWith({ status: "unanswered" });
    fireEvent.click(screen.getByRole("button", { name: "Conhecer os planos" }));
    expect(onPlans).toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/R\$|reais|por mês/i);
    unmount();

    render(<IneditasCard ineditas={PAGO_LIMITE} onOpen={onOpen} onPlans={onPlans} />);
    expect(screen.getByRole("button", { name: "Rever Questões Inéditas" })).toBeTruthy(); // fez as 40 liberadas
    fireEvent.click(screen.getByRole("button", { name: "Rever Questões Inéditas" }));
    expect(onOpen).toHaveBeenLastCalledWith({ status: "all" });
    cleanup();

    render(<IneditasCard ineditas={PAGO_TODAS} onOpen={onOpen} onPlans={onPlans} />);
    expect(screen.queryByRole("button", { name: "Conhecer os planos" })).toBeNull();
    cleanup();

    render(<IneditasCard ineditas={SEM_ACESSO} onOpen={onOpen} onPlans={onPlans} />);
    expect(screen.getByText("74 questões no banco")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resolver/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver planos" }));
    expect(onPlans).toHaveBeenCalledTimes(2);
  });

  it("selo e rótulo padronizados: 'Questão Inédita · nº N'", () => {
    render(<IneditaSeal number={12} />);
    expect(screen.getByText("Questão Inédita · nº 12")).toBeTruthy();
    expect(questionRef({ origin: "staziamed", number: 12, exam: { kind: "STAZIAMED" } })).toBe("Questão Inédita · nº 12");
    expect(questionRef({ number: 51, exam: { kind: "REVALIDA", year: 2024, semester: 1 } })).toBe("Revalida 2024/1 · Q51");
  });
});

describe("Banco de Questões", () => {
  function open(i: any) {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_question_filters") return { total: 1200, exams: [entry(i)], topics: [] };
      if (fn === "app_count_questions") return { total: 100, by_area: {} };
      if (fn === "app_recent_sessions") return [];
      if (fn === "app_start_session") return { session_id: "s-1" };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const go = vi.fn();
    render(
      <MemoryRouter>
        <QuestionBuilder go={go} mode="q" />
      </MemoryRouter>
    );
    return go;
  }

  it("mostra o cartão no topo e o botão abre direto uma sessão só com as inéditas que faltam", async () => {
    const go = open(TESTE);
    expect(await screen.findByText("20 de 74 liberadas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolver Questões Inéditas" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-1" }));
    expect(backend.rpc).toHaveBeenCalledWith("app_start_session", { p_kind: "questoes", p_filters: { area: "", exam_id: "staziamed", search: "", status: "unanswered" }, p_count: 20, p_time_limit_seconds: null });
  });

  it("sem acesso: o cartão mostra o total e leva aos planos", async () => {
    const go = open({ ...SEM_ACESSO, lock_message: "Seu teste grátis terminou." });
    expect(await screen.findByText("74 questões no banco")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Ver planos" })[0]);
    expect(go).toHaveBeenCalledWith("planos");
  });

  it("se não abrir, deixa as inéditas escolhidas no montador e avisa", async () => {
    open(TESTE);
    await screen.findByText("20 de 74 liberadas");
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_start_session") throw new Error("falhou");
      if (fn === "app_question_filters") return { total: 1200, exams: [entry(TESTE)], topics: [] };
      if (fn === "app_count_questions") return { total: 20, by_area: {} };
      return [];
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolver Questões Inéditas" }));
    expect(await screen.findByText(/Não foi possível abrir as Questões Inéditas agora/)).toBeTruthy();
    expect((screen.getByLabelText("Prova / edição") as HTMLSelectElement).value).toBe("staziamed");
  });
});

describe("Início e Plano de Hoje", () => {
  const HOME = { attempts: 0, open_session: null, trial: null, priority_topics: [], metrics: {} };
  const PLAN = { tasks: [], total: 0, done: 0 };
  function rpcs(i: any) {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_home") return HOME;
      if (fn === "app_today") return PLAN;
      if (fn === "app_announcement") return null;
      if (fn === "app_my_ineditas") return i;
      return null;
    });
  }

  it("Início: atalho com contador que leva ao banco já na prova 'Questões Inéditas'", async () => {
    rpcs(TESTE);
    const go = vi.fn();
    render(<MemoryRouter><HomeScreen go={go} mobile={false} /></MemoryRouter>);
    expect(await screen.findByText("20 de 74 liberadas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolver Questões Inéditas" }));
    expect(go).toHaveBeenCalledWith("questoes", { prova: "staziamed", status: "unanswered" });
  });

  it("Início sem a função do banco ou sem inéditas: nada aparece e nada quebra", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_my_ineditas") throw new Error("não existe");
      if (fn === "app_home") return HOME;
      if (fn === "app_today") return PLAN;
      return null;
    });
    render(<MemoryRouter><HomeScreen go={vi.fn()} mobile={false} /></MemoryRouter>);
    await screen.findByText("Comece aqui");
    expect(screen.queryByText("Questões Inéditas")).toBeNull();
  });

  it("Plano de Hoje: mesmo atalho", async () => {
    rpcs(PAGO_TODAS);
    const go = vi.fn();
    render(<MemoryRouter><TodayPlan go={go} /></MemoryRouter>);
    expect(await screen.findByText("Todas as 74 liberadas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolver Questões Inéditas" }));
    expect(go).toHaveBeenCalledWith("questoes", { prova: "staziamed", status: "unanswered" });
  });
});
