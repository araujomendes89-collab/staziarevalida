/**
 * Cronômetro do simulado (jsdom, banco simulado): o aluno escolhe o tempo na montagem; durante o simulado pausa
 * (a questão some e o teclado não responde), continua e encerra com confirmação. As regras de verdade (prazo com
 * as pausas, resposta recusada pausado) estão em supabasePracticeApi.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { paceLabel, parseDuration } from "../novo/app/practice/format.js";

const backend: any = { rpc: vi.fn() };
let mobile = false;
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => mobile, useMQ: () => mobile }));

import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { PracticeSession } from "../novo/app/practice/PracticeSession.jsx";

const QUESTIONS = [1, 2, 3].map((n) => ({
  id: `q${n}`,
  number: n,
  area: "PEDIATRIA",
  exam: { id: "e", kind: "REVALIDA", year: 2024, semester: 1 },
  statement: `Caso clínico número ${n}. Qual é a conduta?`,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id} da questão ${n}` })),
  images: [],
  bookmarked: false,
  selected: null,
  active_ms: 0,
  correction: null,
}));
const iso = (ms: number) => new Date(ms).toISOString();
function running(seconds = 600) {
  const now = Date.now();
  return { time_limit_seconds: 600, paused_at: null, paused_seconds: 0, deadline_at: iso(now + seconds * 1000), remaining_seconds: seconds, server_now: iso(now) };
}
function pausedAt(seconds: number) {
  const now = Date.now();
  return { time_limit_seconds: 600, paused_at: iso(now), paused_seconds: 0, deadline_at: iso(now + seconds * 1000), remaining_seconds: seconds, server_now: iso(now) };
}
const SESSION = (timer: any) => ({ id: "s1", kind: "simulado", filters: { area: "" }, started_at: iso(Date.now() - 60_000), finished_at: null, result: null, questions: QUESTIONS, ...timer });
const FINISHED = {
  ...SESSION(running()),
  finished_at: iso(Date.now()),
  questions: QUESTIONS.map((q) => ({ ...q, correction: { is_correct: null, correct_option: "B", explanation: null, option_notes: [], sources: [] } })),
  result: { total: 3, answered: 0, correct: 0, active_seconds: 0, elapsed_seconds: 65, paused_seconds: 120, by_area: [{ area: "PEDIATRIA", total: 3, answered: 0, correct: 0 }] },
};

beforeEach(() => {
  mobile = false;
  backend.rpc.mockReset();
});
afterEach(cleanup);

describe("Tempo escolhido pelo aluno (montagem do simulado)", () => {
  beforeEach(() => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_question_filters") return { total: 200, exams: [], topics: [] };
      if (fn === "app_count_questions") return { total: 200, by_area: { PEDIATRIA: 40 } };
      if (fn === "app_recent_sessions")
        return [{ id: "s-p", kind: "simulado", started_at: iso(Date.now()), finished_at: null, total: 30, answered: 4, correct: null, paused: true, expired: false, remaining_seconds: 2100, filters: { area: "" } }];
      if (fn === "app_start_session") return { session_id: "s-novo" };
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });
  const renderBuilder = (go = vi.fn()) =>
    render(
      <MemoryRouter>
        <QuestionBuilder go={go} mode="sim" />
      </MemoryRouter>
    );

  it("tempo personalizado: começa no tempo de prova, aceita atalho e horas/minutos digitados e vai para o banco", async () => {
    const go = vi.fn();
    renderBuilder(go);
    await screen.findByText("30 questões");
    fireEvent.change(screen.getByLabelText("Cronômetro"), { target: { value: "custom" } });
    // 30 questões no ritmo de prova (3 min) = 1h30
    expect((screen.getByLabelText("Horas") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Minutos") as HTMLInputElement).value).toBe("30");
    expect(screen.getByText(/1h30 para 30 questões · 3 min por questão/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "2h" }));
    expect((screen.getByLabelText("Horas") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Minutos") as HTMLInputElement).value).toBe("0");
    fireEvent.change(screen.getByLabelText("Minutos"), { target: { value: "15" } });
    expect(screen.getByText(/2h15 de prova/)).toBeTruthy(); // resumo ao lado
    fireEvent.click(screen.getByRole("button", { name: /Iniciar simulado/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-novo" }));
    expect(backend.rpc).toHaveBeenCalledWith("app_start_session", expect.objectContaining({ p_kind: "simulado", p_count: 30, p_time_limit_seconds: 8100 }));
  });

  it("fora de 1 minuto a 12 horas: avisa e não deixa iniciar", async () => {
    renderBuilder();
    await screen.findByText("30 questões");
    fireEvent.change(screen.getByLabelText("Cronômetro"), { target: { value: "custom" } });
    const startButton = () => screen.getByRole("button", { name: /Iniciar simulado/ }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Horas"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Minutos"), { target: { value: "0" } });
    expect(screen.getByText("Escolha pelo menos 1 minuto.")).toBeTruthy();
    expect(startButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Horas"), { target: { value: "13" } });
    expect(screen.getByText("O máximo é 12 horas.")).toBeTruthy();
    expect(startButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Horas"), { target: { value: "12" } });
    expect(startButton().disabled).toBe(false);
  });

  it("o histórico mostra o simulado pausado e quanto falta", async () => {
    renderBuilder();
    expect(await screen.findByText("Pausado")).toBeTruthy();
    expect(screen.getByText(/4\/30 respondidas · faltam 35:00/)).toBeTruthy();
  });

  it("horas e minutos e ritmo por questão", () => {
    expect(parseDuration("1", "30")).toEqual({ minutes: 90 });
    expect(parseDuration("", "45")).toEqual({ minutes: 45 });
    expect(parseDuration("12", "0")).toEqual({ minutes: 720 });
    expect(parseDuration("", "").error).toBe("Escolha pelo menos 1 minuto.");
    expect(parseDuration("12", "1").error).toBe("O máximo é 12 horas.");
    expect(parseDuration("1", "75").error).toMatch(/minutos de 0 a 59/);
    expect(parseDuration("1.5", "0").error).toMatch(/horas inteiras/);
    expect([180, 150, 45].map(paceLabel)).toEqual(["3 min por questão", "2,5 min por questão", "45 s por questão"]);
  });
});

describe("Cronômetro durante o simulado", () => {
  const renderSession = (go = vi.fn()) =>
    render(
      <MemoryRouter initialEntries={["/sessao?s=s1"]}>
        <PracticeSession go={go} />
      </MemoryRouter>
    );

  it("pausar esconde a questão e para o tempo; continuar volta; encerrar pede confirmação", async () => {
    let state: any = running(600);
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_get_session") return SESSION(state);
      if (fn === "app_pause_session") return (state = pausedAt(598));
      if (fn === "app_resume_session") return (state = running(598));
      if (fn === "app_finish_session") return FINISHED;
      if (fn === "app_answer_question") return { saved: true };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    renderSession();
    expect(await screen.findByText(/Caso clínico número 1/)).toBeTruthy();
    expect(screen.getByText("10:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pausar o simulado" }));
    expect(await screen.findByRole("heading", { name: "Simulado pausado" })).toBeTruthy();
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_pause_session", { p_session_id: "s1" }));
    expect(screen.queryByText(/Caso clínico número 1/)).toBeNull(); // questão escondida
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.getAllByText("09:58").length).toBeGreaterThan(0); // tempo parado no cabeçalho e no cartão
    fireEvent.keyDown(window, { key: "a" }); // teclado não responde pausado
    expect(backend.rpc).not.toHaveBeenCalledWith("app_answer_question", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Continuar simulado" }));
    expect(await screen.findByText(/Caso clínico número 1/)).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_resume_session", { p_session_id: "s1" });
    fireEvent.keyDown(window, { key: "b" });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_answer_question", expect.objectContaining({ p_question_id: "q1", p_option: "B" })));

    fireEvent.click(screen.getByRole("button", { name: "Encerrar o simulado" }));
    expect(await screen.findByRole("heading", { name: "Encerrar o simulado?" })).toBeTruthy();
    expect(screen.getByText(/Você respondeu 1 de 3 questões\. As 2 em branco contam como erro\. Ainda restam/)).toBeTruthy();
    expect(backend.rpc).not.toHaveBeenCalledWith("app_finish_session", expect.anything()); // só depois de confirmar
    fireEvent.click(screen.getByRole("button", { name: "Voltar às questões" }));
    expect(await screen.findByText(/Caso clínico número 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Encerrar o simulado" }));
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar e ver resultado" }));
    expect(await screen.findByText(/Resultado do simulado/)).toBeTruthy();
    expect(screen.getByText("do início ao fim, sem as pausas")).toBeTruthy();
  });

  it("simulado pausado ao abrir: continua pausado; sair guarda para depois, sem descartar", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_get_session") return SESSION(pausedAt(1234));
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const go = vi.fn();
    renderSession(go);
    expect(await screen.findByRole("heading", { name: "Simulado pausado" })).toBeTruthy();
    expect(screen.getAllByText("20:34").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Sair e continuar depois" }));
    expect(go).toHaveBeenCalledWith("simulados");
    fireEvent.click(screen.getByRole("button", { name: "Sair" })); // pausado sem resposta também fica guardado
    expect(go).toHaveBeenCalledTimes(2);
    expect(backend.rpc).not.toHaveBeenCalledWith("app_finish_session", expect.anything());
  });

  it("encerrar pausado: a confirmação volta para a pausa; confirmar finaliza", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_get_session") return SESSION(pausedAt(300));
      if (fn === "app_finish_session") return FINISHED;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    renderSession();
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar simulado" }));
    expect(await screen.findByRole("heading", { name: "Encerrar o simulado?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByRole("heading", { name: "Simulado pausado" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Encerrar simulado" }));
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar e ver resultado" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_finish_session", { p_session_id: "s1" }));
    expect(await screen.findByText(/Resultado do simulado/)).toBeTruthy();
  });

  it("no celular, os controles do cronômetro aparecem como ícones com nome", async () => {
    mobile = true;
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_get_session") return SESSION(running(600));
      if (fn === "app_pause_session") return pausedAt(599);
      throw new Error(`rpc não simulada: ${fn}`);
    });
    renderSession();
    await screen.findByText(/Caso clínico número 1/);
    expect(screen.getByRole("group", { name: "Cronômetro do simulado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Encerrar o simulado" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pausar o simulado" }));
    expect(await screen.findByRole("button", { name: "Continuar o simulado" })).toBeTruthy();
  });

  it("pausar com o tempo já esgotado finaliza o simulado", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_get_session") return SESSION(running(600));
      if (fn === "app_pause_session") throw new Error("O tempo do simulado acabou.");
      if (fn === "app_finish_session") return FINISHED;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    renderSession();
    await screen.findByText(/Caso clínico número 1/);
    fireEvent.click(screen.getByRole("button", { name: "Pausar o simulado" }));
    expect(await screen.findByText("Tempo encerrado")).toBeTruthy();
  });
});
