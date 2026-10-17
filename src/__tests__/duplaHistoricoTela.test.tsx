/**
 * Treino em Dupla · decisão (c) do dono de 17/10 na tela Meus PEPs: as rodadas em dupla (candidato ou avaliador) vêm do
 * histórico (app_dupla_history, 013400); a rodada liberada abre o mesmo resultado da sala, só leitura, inclusive com a sala
 * encerrada; a rodada com a revisão pedida aparece "Aguardando revisão", sem nome, sem nota e sem abrir. Dados de TESTE.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "editor" }, user: { id: "u-ana" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Fase2Peps } from "../novo/app/fase2/Fase2Peps.jsx";

const CONCLUIDA = {
  room_id: "sala-fechada", round: 1, role: "candidate", status: "concluida", revised: true, finished_at: "2026-10-16T15:00:00Z",
  partner: { public_name: "Bruno" },
  station: { number: 1, area: "Clínica Médica", area_code: "CM", name: "ZZNOME estação de teste", edition: "2020" },
  score: 7.5, max_score: 10, pct: 75,
};
const AGUARDANDO = {
  room_id: "sala-2", round: 2, role: "evaluator", status: "aguardando_revisao", revised: false, finished_at: "2026-10-16T16:00:00Z",
  partner: { public_name: "Carla" },
  station: { number: 8, area: "Pediatria", area_code: "PED", name: null, edition: null },
  score: null, max_score: null, pct: null,
};
const RESULTADO = {
  round: 1, viewer: "candidate",
  station: { id: "teste-x", name: "ZZNOME estação de teste", area: "Clínica Médica", area_code: "CM", number: 1, edition: "2020" },
  score: 7.5, max_score: 10, pct: 75, previous_pct: null,
  items: [{ id: "i1", order: 1, content: "Item de teste.", max_points: 10, grade: "partial", points: 7.5 }],
  evaluator: { user_id: "u-bruno", public_name: "Bruno" }, candidate: { user_id: "u-ana", public_name: "Ana" },
  finished_at: "2026-10-16T15:00:00Z", used_ms: 540000,
  feedback: { pos: "Boa anamnese.", neg: "", gen: "" },
  review: { requested_at: "2026-10-16T15:01:00Z", reason: "Motivo.", revised_at: "2026-10-16T15:05:00Z", score_before_review: 6 },
};

let historico: any = [CONCLUIDA, AGUARDANDO];
beforeEach(() => {
  historico = [CONCLUIDA, AGUARDANDO];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_fase2_peps") return [{ id: "att-1", origin: "solo", station_id: "st", name: "Treino sozinho de teste", area: "Clínica Médica", at: "2026-10-15T10:00:00Z", score10: 6 }];
    if (fn === "app_fase2_performance") return { count: 1 };
    if (fn === "app_dupla_history") {
      if (historico instanceof Error) throw historico;
      return historico;
    }
    if (fn === "app_dupla_history_result") {
      expect(args).toEqual({ p_room_id: "sala-fechada", p_round: 1 });
      return RESULTADO;
    }
    throw new Error(`rpc inesperada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Meus PEPs com o histórico do Treino em Dupla", () => {
  it("rodada concluída (sala encerrada) abre o resultado só leitura; Voltar volta à lista", async () => {
    render(<Fase2Peps go={vi.fn()} />);
    const linha = await screen.findByRole("button", { name: /ZZNOME estação de teste/ });
    expect(screen.getByText("Avaliado por Bruno")).toBeTruthy();
    expect(screen.getByText("Nota revisada")).toBeTruthy();
    expect(screen.getByText("7,5")).toBeTruthy();
    expect(screen.getByText("3 estações avaliadas")).toBeTruthy();
    fireEvent.click(linha);
    expect(await screen.findByRole("heading", { name: "ZZNOME estação de teste", level: 1 })).toBeTruthy();
    expect(screen.getByText("Boa anamnese.")).toBeTruthy();
    // só leitura: nada das ações da sala
    for (const nome of ["Treinar outra estação", "Encerrar treino", "Solicitar revisão da nota", "Rever a nota"]) {
      expect(screen.queryByRole("button", { name: nome })).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Voltar para Meus PEPs" }));
    expect(await screen.findByText("Meus PEPs")).toBeTruthy();
  });

  it("aguardando revisão: 'Estação 8', sem nome e sem nota, não abre", async () => {
    render(<Fase2Peps go={vi.fn()} />);
    const linha = (await screen.findByRole("button", { name: /Estação 8 - Pediatria - Aguardando revisão da nota/ })) as HTMLButtonElement;
    expect(linha.disabled).toBe(true);
    expect(screen.getByText("Aguardando revisão")).toBeTruthy();
    expect(screen.getByText("Você avaliou Carla")).toBeTruthy();
    expect(linha.textContent).toContain("—");
  });

  it("o tema nunca aparece fora do resultado liberado (texto da página)", async () => {
    historico = [AGUARDANDO];
    render(<Fase2Peps go={vi.fn()} />);
    await screen.findByText("Estação 8");
    expect(document.body.textContent).not.toContain("ZZNOME");
  });

  it("sem o histórico em dupla (função ausente ou erro): aviso, e o treino sozinho continua", async () => {
    historico = new Error("function public.app_dupla_history does not exist");
    render(<Fase2Peps go={vi.fn()} />);
    expect(await screen.findByText("Não foi possível carregar os treinos em dupla agora. Os treinos sozinho estão abaixo.")).toBeTruthy();
    expect(screen.getByText("Treino sozinho de teste")).toBeTruthy();
  });
});
