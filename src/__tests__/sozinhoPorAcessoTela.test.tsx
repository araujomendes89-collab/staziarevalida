/**
 * Botão "Sozinho" do Banco de estações pelo acesso do banco (decisão do dono 19/10, migração 014220).
 * A tela não decide plano: lê app_dupla_access (useSession().dupla) — `permitido` (Treino em Dupla) e `fase2.acesso`
 * (liberado / amostra / trancado). Cada perfil:
 *   - equipe: escolhe Sozinho ou Em dupla (como sempre);
 *   - PRÁTICA/ELITE pagos (chave ligada): escolhe Sozinho ou Em dupla;
 *   - amostra (teste da 2ª fase, 2ª fase vencida): só Sozinho, a lista vem por app_fase2_banco e a faixa da amostra aparece;
 *   - revisor médico com a chave desligada (banco libera a Dupla, regra de 17/10): só a Dupla, como hoje;
 *   - aluno sem acesso à 2ª fase sozinho (PRO, teste da 1ª fase, chave desligada): nunca vê "Sozinho".
 * Só dado de teste; nada de rede.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const session: { backend: any; boot?: { role: string }; dupla?: any } = { backend: { rpc: (...a: unknown[]) => rpc(...(a as [string])) } };
let rpc = vi.fn(async (_fn: string) => [] as any);
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));

import { StationsScreen } from "../novo/app/dupla/StationsScreen.jsx";

const ESTACAO = {
  id: "teste-inep2020-e01",
  name: "Estação de teste",
  topic: "Teste",
  area: "Clínica Médica",
  area_code: "CM",
  number: 1,
  edition: "2020",
  reapplication: false,
  institution: "INEP",
  styles: [],
  duration_ms: 600000,
  is_pro_only: false,
  criteria_count: 8,
  pressing_count: 2,
  my_last_pct: null,
  average_pct: null,
  evaluations: 0,
  content_status: "content_ready",
};

const AMOSTRA = { acesso: "amostra", motivo: "amostra_do_teste", mensagem: "Teste grátis da 2ª fase: você usa uma amostra por dia.", amostra: { modo: "por_dia", limite: 1, unidade: "estação por dia" } };
const PERFIS: [string, string, any, { rpc: string; escolha: boolean; sozinhoDireto: boolean; faixa: boolean }][] = [
  ["equipe (chave desligada)", "admin", { aberto: false, permitido: true, equipe: true, fase2: { acesso: "liberado" } }, { rpc: "app_dupla_stations", escolha: true, sozinhoDireto: false, faixa: false }],
  ["PRÁTICA/ELITE pago", "student", { aberto: true, permitido: true, equipe: false, fase2: { acesso: "liberado" }, dupla: { acesso: "liberado" } }, { rpc: "app_dupla_stations", escolha: true, sozinhoDireto: false, faixa: false }],
  ["amostra (teste da 2ª fase)", "student", { aberto: true, permitido: false, equipe: false, fase2: AMOSTRA, dupla: { acesso: "trancado" } }, { rpc: "app_fase2_banco", escolha: false, sozinhoDireto: true, faixa: true }],
  ["amostra (PRÁTICA vencido)", "student", { aberto: true, permitido: false, equipe: false, fase2: { ...AMOSTRA, motivo: "amostra_vencida" }, dupla: { acesso: "trancado" } }, { rpc: "app_fase2_banco", escolha: false, sozinhoDireto: true, faixa: true }],
  ["revisor médico, chave desligada", "student", { aberto: false, permitido: true, equipe: false, fase2: { acesso: "trancado" }, dupla: { acesso: "trancado" } }, { rpc: "app_dupla_stations", escolha: false, sozinhoDireto: false, faixa: false }],
  ["banco sem a 014220 (sem fase2)", "student", { aberto: true, permitido: true, planos: ["pro", "elite"], equipe: false }, { rpc: "app_dupla_stations", escolha: false, sozinhoDireto: false, faixa: false }],
];

afterEach(() => {
  cleanup();
  delete session.boot;
  delete session.dupla;
});

describe("Banco de estações: 'Sozinho' segue o acesso do banco", () => {
  it.each(PERFIS)("%s", async (_quem, role, dupla, e) => {
    session.boot = { role };
    session.dupla = dupla;
    rpc = vi.fn(async (fn: string) => {
      if (fn !== e.rpc) throw new Error(`função inesperada: ${fn}`);
      return [ESTACAO];
    });
    const go = vi.fn();
    render(<StationsScreen go={go} />);
    const card = (await screen.findByRole("heading", { name: "Estação de teste", level: 3 })).closest("button") as HTMLElement;
    expect(rpc).toHaveBeenCalledWith(e.rpc);
    expect(Boolean(screen.queryByTestId("amostra-estacoes"))).toBe(e.faixa);
    fireEvent.click(card);
    if (e.escolha) {
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Sozinho" }));
      expect(go).toHaveBeenCalledWith("estacao", { id: ESTACAO.id });
    } else if (e.sozinhoDireto) {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(go).toHaveBeenCalledWith("estacao", { id: ESTACAO.id });
    } else {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(go).toHaveBeenCalledWith("dupla", { estacao: ESTACAO.id });
    }
    // "Só com conteúdo" continua só da equipe
    expect(Boolean(screen.queryByRole("switch", { name: /Só com conteúdo/ }))).toBe(role === "admin");
  });

  it("amostra: a faixa diz o limite do dia e que a Dupla é dos planos PRÁTICA e ELITE; 'Ver planos' leva aos planos", async () => {
    session.boot = { role: "student" };
    session.dupla = { aberto: true, permitido: false, equipe: false, fase2: AMOSTRA, dupla: { acesso: "trancado" } };
    rpc = vi.fn(async () => [ESTACAO]);
    const go = vi.fn();
    render(<StationsScreen go={go} />);
    const faixa = await screen.findByTestId("amostra-estacoes");
    expect(faixa.textContent).toMatch(/Amostra: 1 estação sozinho por dia/);
    expect(faixa.textContent).toMatch(/O Treino em Dupla é dos planos PRÁTICA e ELITE/);
    expect(screen.getByText(/Escolha uma estação para treinar sozinho/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ver planos/ }));
    expect(go).toHaveBeenCalledWith("planos");
  });
});
