/**
 * Início do aluno · bloco "Créditos de hoje" (jsdom). O banco é simulado pelo contrato de app_credit_state('match') e ('ia'): a tela só
 * mostra o que o servidor devolve para o PRÓPRIO aluno. Cobre: com saldo, bônus e comprados, esgotado (com atalho para planos),
 * cota desligada, plano sem número, equipe, só uma moeda, erro de leitura e a virada do dia (renovação sem recarregar a página).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
const session: any = { backend, boot: { role: "student" }, dupla: { aberto: true, permitido: true }, user: { id: "u1" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));

import { CreditosHoje, CreditosHojeView } from "../novo/app/home/CreditosHoje.jsx";
import { modeloCreditosHoje, linhaCreditos } from "../novo/app/home/creditosHoje.js";

const estado = (extra: Record<string, unknown> = {}) => ({
  ativa: true, ilimitado: false, limite_dia: 5, usados_hoje: 2, bonus: 0, comprados: 0, disponivel: 3, pool: "match", renova_em: "2026-10-18T03:00:00.000Z", ...extra,
});
const OFF = { ativa: false, ilimitado: false, limite_dia: null, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: null, pool: "x", renova_em: "2026-10-18T03:00:00.000Z" };
const EQUIPE = { ...OFF, ativa: true, ilimitado: true };
let respostas: Record<string, any>;
const go = vi.fn();

beforeEach(() => {
  go.mockReset();
  respostas = { match: estado(), ia: OFF };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn !== "app_credit_state") throw new Error("função inesperada " + fn);
    const r = respostas[args.p_pool];
    if (r instanceof Error) throw r;
    return r;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const montar = async () => {
  render(<CreditosHoje go={go} />);
  await act(async () => {});
};
const nada = () => expect(screen.queryByTestId("creditos-hoje")).toBeNull();

describe("Início · Créditos de hoje", () => {
  it("2ª fase fechada para o aluno (chave desligada ou sem leitura do acesso): o bloco não aparece e o saldo nem é lido", async () => {
    for (const dupla of [{ aberto: false, permitido: false }, null]) {
      session.dupla = dupla;
      await montar();
      nada();
      expect(backend.rpc).not.toHaveBeenCalled();
      cleanup();
    }
    session.dupla = { aberto: true, permitido: true };
  });

  it("com saldo: 'Créditos de hoje', 'X de Y' do servidor e o detalhe de para que servem", async () => {
    respostas = { match: estado({ limite_dia: 5, usados_hoje: 2, disponivel: 3 }), ia: estado({ limite_dia: 4, usados_hoje: 1, disponivel: 3, pool: "ia" }) };
    await montar();
    expect(screen.getByRole("heading", { name: "Créditos de hoje" })).toBeTruthy();
    expect(screen.getByTestId("creditos-Estações em dupla").textContent).toBe("3 de 5");
    expect(screen.getByTestId("creditos-Avaliação por IA").textContent).toBe("3 de 4");
    expect(screen.getByText("Servem para as estações em dupla e para a avaliação por IA do treino sozinho.")).toBeTruthy();
    expect(screen.queryByText(/acabaram/)).toBeNull();
    expect(screen.queryByText("Ver planos")).toBeNull();
    // lê só o próprio estado, pelas duas moedas
    expect(backend.rpc.mock.calls.map((c: any[]) => `${c[0]}:${c[1].p_pool}`).sort()).toEqual(["app_credit_state:ia", "app_credit_state:match"]);
  });

  it("bônus e comprados aparecem à parte e não entram no 'X de Y'", async () => {
    respostas = { match: estado({ limite_dia: 5, usados_hoje: 2, bonus: 3, comprados: 1, disponivel: 7 }), ia: OFF };
    await montar();
    expect(screen.getByTestId("creditos-Estações em dupla").textContent).toBe("3 de 5");
    expect(screen.getByText("+ 3 de bônus")).toBeTruthy();
    expect(screen.getByText("+ 1 comprado")).toBeTruthy();
    expect(screen.getByText("Servem para as estações em dupla.")).toBeTruthy();
  });

  it("esgotado: mostra a mensagem, 'Voltam amanhã.' e o atalho para planos", async () => {
    respostas = { match: estado({ usados_hoje: 5, disponivel: 0 }), ia: OFF };
    await montar();
    expect(screen.getByTestId("creditos-Estações em dupla").textContent).toBe("0 de 5");
    expect(screen.getByText("Seus créditos de hoje acabaram. Voltam amanhã.")).toBeTruthy();
    fireEvent.click(screen.getByText("Ver planos"));
    expect(go).toHaveBeenCalledWith("planos");
  });

  it("esgotado só se as DUAS moedas acabaram; com bônus sobrando não é 'acabaram'", async () => {
    respostas = { match: estado({ usados_hoje: 5, disponivel: 0 }), ia: estado({ limite_dia: 3, usados_hoje: 1, disponivel: 2, pool: "ia" }) };
    await montar();
    expect(screen.queryByText(/acabaram/)).toBeNull();
    cleanup();
    respostas = { match: estado({ usados_hoje: 5, disponivel: 2, bonus: 2 }), ia: OFF };
    await montar();
    expect(screen.queryByText(/acabaram/)).toBeNull();
  });

  it("janela de semana ou mês esgotada na IA: diz que acabaram, mas NÃO promete 'Voltam amanhã.'", async () => {
    respostas = { match: OFF, ia: estado({ pool: "ia", limite_dia: 3, usados_hoje: 0, disponivel: 0, limite_semana: 4, usados_semana: 4, limite_mes: 10, usados_mes: 6 }) };
    await montar();
    expect(screen.getByText("Seus créditos de hoje acabaram.")).toBeTruthy();
    expect(screen.queryByText(/Voltam amanhã/)).toBeNull();
  });

  it("cota desligada: o bloco não aparece, nem 'Créditos de hoje' nem '0 de 0'", async () => {
    respostas = { match: OFF, ia: OFF };
    await montar();
    nada();
    expect(document.body.textContent).not.toMatch(/Créditos de hoje|0 de 0/);
  });

  it("plano sem número (limite zero, sem bônus): não aparece e nunca mostra '0 de 0'; com bônus aparece só o bônus", async () => {
    respostas = { match: estado({ limite_dia: 0, usados_hoje: 0, disponivel: 0 }), ia: estado({ pool: "ia", limite_dia: null, usados_hoje: 0, disponivel: 0 }) };
    await montar();
    nada();
    expect(document.body.textContent).not.toMatch(/0 de 0/);
    cleanup();
    respostas = { match: estado({ limite_dia: 0, usados_hoje: 0, bonus: 2, disponivel: 2 }), ia: OFF };
    await montar();
    expect(screen.queryByTestId("creditos-Estações em dupla")).toBeNull();
    expect(screen.getByText("+ 2 de bônus")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/0 de 0/);
  });

  it("equipe (administrador, editor, revisor): o servidor diz 'ilimitado' e o bloco não aparece", async () => {
    respostas = { match: EQUIPE, ia: EQUIPE };
    await montar();
    nada();
  });

  it("erro de leitura: o bloco não aparece e a tela não quebra", async () => {
    respostas = { match: new Error("falhou"), ia: new Error("falhou") };
    await montar();
    nada();
  });

  it("só a IA configurada: mostra só a linha da IA e o detalhe dela", async () => {
    respostas = { match: OFF, ia: estado({ pool: "ia", limite_dia: 2, usados_hoje: 0, disponivel: 2 }) };
    await montar();
    expect(screen.queryByTestId("creditos-Estações em dupla")).toBeNull();
    expect(screen.getByTestId("creditos-Avaliação por IA").textContent).toBe("2 de 2");
    expect(screen.getByText("Servem para a avaliação por IA do treino sozinho.")).toBeTruthy();
  });

  it("o número vem sempre do servidor: duas leituras diferentes, dois números diferentes (nada é descontado na tela)", async () => {
    await montar();
    expect(screen.getByTestId("creditos-Estações em dupla").textContent).toBe("3 de 5");
    respostas = { match: estado({ usados_hoje: 3, disponivel: 2 }), ia: OFF };
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("creditos-Estações em dupla").textContent).toBe("2 de 5");
  });

  it("DIA VIRANDO: ao passar a meia-noite de Brasília o bloco se renova sozinho, sem recarregar a página", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T23:58:00-03:00"));
    // ontem: esgotado; renova_em = 00:00 de Brasília (03:00Z do dia 18)
    respostas = { match: estado({ usados_hoje: 5, disponivel: 0, renova_em: "2026-10-18T03:00:00.000Z" }), ia: OFF };
    render(<CreditosHoje go={go} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Seus créditos de hoje acabaram. Voltam amanhã.")).toBeTruthy();
    const antes = backend.rpc.mock.calls.length;
    // 1 minuto depois, ainda é o mesmo dia: nenhuma leitura nova
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(backend.rpc.mock.calls.length).toBe(antes);
    // o servidor já virou o dia: cota nova
    respostas = { match: estado({ usados_hoje: 0, disponivel: 5, renova_em: "2026-10-19T03:00:00.000Z" }), ia: OFF };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000); // passa 00:00:30 de Brasília
    });
    expect(backend.rpc.mock.calls.length).toBeGreaterThan(antes);
    expect(screen.getByTestId("creditos-Estações em dupla").textContent).toBe("5 de 5");
    expect(screen.queryByText(/acabaram/)).toBeNull();
  });
});

describe("modelo", () => {
  it("linhaCreditos ignora estado desligado, ilimitado e ilegível", () => {
    expect(linhaCreditos(null, "x")).toBeNull();
    expect(linhaCreditos(OFF, "x")).toBeNull();
    expect(linhaCreditos(EQUIPE, "x")).toBeNull();
    expect(linhaCreditos({ ativa: true, disponivel: "abc" }, "x")).toBeNull();
    expect(modeloCreditosHoje(OFF, OFF)).toBeNull();
  });
  it("CreditosHojeView sem modelo não desenha nada", () => {
    const { container } = render(<CreditosHojeView modelo={null} go={go} />);
    expect(container.innerHTML).toBe("");
  });
});
