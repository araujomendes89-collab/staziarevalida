/**
 * Treino sozinho: tela de resultado (nota, selos, tempo, quadro por item), ações, e a fonte (IA ou Autoavaliação) em
 * Meus PEPs e no Início. O servidor é simulado (helpers/soloServidor.ts).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makeSoloServer } from "./helpers/soloServidor";

const state: { backend: any } = { backend: null };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend: state.backend, boot: { role: "student" }, user: { id: "u1" } }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Fase2Player } from "../novo/app/fase2/Fase2Player.jsx";
import { Fase2Peps } from "../novo/app/fase2/Fase2Peps.jsx";
import { Fase2Home } from "../novo/app/fase2/Fase2Home.jsx";

const go = vi.fn();
beforeEach(() => go.mockReset());
afterEach(cleanup);

const RESULT_SELF = {
  score: 7.25,
  max_score: 10,
  score10: 7.3,
  finished_at: "2026-10-17T12:00:00.000Z",
  source: "autoavaliacao",
  used_ms: 452000,
  marks: [
    { order: 1, item_id: "i1", phase: "Apresentação", content: "Apresenta-se e pede permissão.", grade: "correct", points: 4, max: 4 },
    { order: 2, item_id: "i2", phase: "Conduta", content: "Solicita exame de teste.", grade: "partial", points: 3.25, max: 4 },
    { order: 3, item_id: "i3", phase: "Conduta", content: "Orienta retorno.", grade: "incorrect", points: 0, max: 2 },
  ],
  ia: null,
  positive: ["Apresenta-se e pede permissão."],
  negative: ["Solicita exame de teste.", "Orienta retorno."],
};

function openDone(result = RESULT_SELF, source: "ia" | "autoavaliacao" = "autoavaliacao") {
  const server = makeSoloServer({ status: "done", result, source });
  state.backend = server.backend;
  render(
    <MemoryRouter initialEntries={["/estacao?tentativa=att-teste-1"]}>
      <Fase2Player go={go} />
    </MemoryRouter>
  );
  return server;
}

describe("Resultado do treino sozinho", () => {
  it("mostra a nota com vírgula, os selos Sozinho e Autoavaliação, o tempo usado e o quadro por item", async () => {
    openDone();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    const resumo = screen.getByRole("region", { name: "Resumo da nota" });
    expect(within(resumo).getByText("7,25")).toBeTruthy();
    expect(within(resumo).getByText("/ 10,00")).toBeTruthy();
    expect(within(resumo).getByText("7 min 32 s")).toBeTruthy();
    const header = screen.getByRole("heading", { name: "Resultado do treino sozinho" }).parentElement!;
    expect(within(header).getByText("Sozinho")).toBeTruthy();
    expect(within(header).getByText("Autoavaliação")).toBeTruthy();
    expect(within(header).queryByText("IA")).toBeNull();

    const quadro = screen.getByRole("list", { name: "Quadro por item" });
    const itens = within(quadro).getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(within(itens[0]).getByText("Adequado")).toBeTruthy();
    expect(within(itens[0]).getByText("4,00 / 4,00")).toBeTruthy();
    expect(within(itens[1]).getByText("Parcial")).toBeTruthy();
    expect(within(itens[1]).getByText("3,25 / 4,00")).toBeTruthy();
    expect(within(itens[2]).getByText("Inadequado")).toBeTruthy();
    expect(screen.getByText("7,25 / 10,00")).toBeTruthy(); // total do quadro
    expect(screen.getByText("Pontos positivos")).toBeTruthy();
    expect(screen.getByText("Pontos para melhorar")).toBeTruthy();
  });

  it("filtro 'Com perda de pontos' mostra só os itens que perderam pontos", async () => {
    openDone();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    fireEvent.click(screen.getByRole("button", { name: /Com perda de pontos \(2\)/ }));
    const itens = within(screen.getByRole("list", { name: "Quadro por item" })).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(screen.queryByText("Apresenta-se e pede permissão.", { selector: ".f2-solo-item__text" })).toBeNull();
  });

  it("autoavaliação: sem aviso de IA, sem 'Avisar a equipe', sem trecho e sem razão; e sem revisão da nota nem Inverter papéis", async () => {
    openDone();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    expect(screen.queryByText(/Avaliação feita por inteligência artificial/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Avisar a equipe/ })).toBeNull();
    expect(screen.queryByText("Trecho seu")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Solicitar revisão|Inverter papéis|Escrito por/i);
  });

  it("Treinar de novo abre a mesma estação, Meus PEPs e Voltar ao banco de estações navegam", async () => {
    openDone();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    fireEvent.click(screen.getByRole("button", { name: "Treinar de novo" }));
    expect(go).toHaveBeenLastCalledWith("estacao", { id: "st-teste-1" });
    fireEvent.click(screen.getByRole("button", { name: "Meus PEPs" }));
    expect(go).toHaveBeenLastCalledWith("peps");
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao banco de estações" }));
    expect(go).toHaveBeenLastCalledWith("estacoes");
  });

  it("treino concluído sem fonte conhecida: só o selo Sozinho, sem inventar", async () => {
    openDone({ ...RESULT_SELF, source: null, used_ms: null } as any);
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    const header = screen.getByRole("heading", { name: "Resultado do treino sozinho" }).parentElement!;
    expect(within(header).getByText("Sozinho")).toBeTruthy();
    expect(within(header).queryByText("Autoavaliação")).toBeNull();
    expect(within(header).queryByText("IA")).toBeNull();
  });
});

describe("Meus PEPs e Início mostram a fonte do treino sozinho", () => {
  const peps = [
    { id: "a1", origin: "solo", source: "ia", station_id: "s1", name: "Estação com IA", area: "Pediatria", at: "2026-10-16T10:00:00Z", score10: 7.3 },
    { id: "a2", origin: "solo", source: "autoavaliacao", station_id: "s2", name: "Estação autoavaliada", area: "Clínica Médica", at: "2026-10-15T10:00:00Z", score10: 8 },
    { id: "a3", origin: "solo", source: null, station_id: "s3", name: "Estação antiga", area: "Cirurgia Geral", at: "2026-10-14T10:00:00Z", score10: 6 },
  ];

  it("Meus PEPs: ao lado de Sozinho aparece IA ou Autoavaliação; sem fonte, nada; a linha abre a mesma tentativa", async () => {
    state.backend = {
      rpc: vi.fn(async (fn: string) => {
        if (fn === "app_fase2_peps") return peps;
        if (fn === "app_fase2_performance") return { count: 3 };
        if (fn === "app_dupla_history") return [];
        throw new Error(`rpc inesperada: ${fn}`);
      }),
    };
    render(
      <MemoryRouter>
        <Fase2Peps go={go} />
      </MemoryRouter>
    );
    await screen.findByText("Meus PEPs");
    const linha = (nome: string) => screen.getByRole("button", { name: new RegExp(nome) });
    expect(within(linha("Estação com IA")).getByText("IA")).toBeTruthy();
    expect(within(linha("Estação autoavaliada")).getByText("Autoavaliação")).toBeTruthy();
    const antiga = linha("Estação antiga");
    expect(within(antiga).getByText("Sozinho")).toBeTruthy();
    expect(within(antiga).queryByText("IA")).toBeNull();
    expect(within(antiga).queryByText("Autoavaliação")).toBeNull();
    fireEvent.click(linha("Estação com IA"));
    expect(go).toHaveBeenCalledWith("estacao", { tentativa: "a1" });
  });

  it("Início: a última estação mostra a fonte ao lado de Sozinho", async () => {
    state.backend = {
      rpc: vi.fn(async (fn: string) => {
        if (fn === "app_fase2_overview")
          return {
            stations_total: 3, areas: [{ area: "Pediatria", total: 3 }], done_count: 1, avg_score10: 7.3,
            last: { id: "a1", origin: "solo", source: "ia", station_id: "s1", name: "Estação com IA", area: "Pediatria", at: "2026-10-16T10:00:00Z", score10: 7.3 },
            open_attempt: null,
          };
        throw new Error(`rpc inesperada: ${fn}`);
      }),
    };
    render(
      <MemoryRouter>
        <Fase2Home go={go} />
      </MemoryRouter>
    );
    await screen.findByText("Última estação");
    expect(screen.getByText("Sozinho")).toBeTruthy();
    expect(screen.getByText("IA")).toBeTruthy();
  });
});
