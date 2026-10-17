// @vitest-environment jsdom
/**
 * Administração › Estações › Conferir: grau de dificuldade (pedido do dono de 17/10, migração 013410), na tela (banco simulado).
 *  - a rubrica fixa fica ao lado da escolha e diz o grau que indica (0–1 Fácil, 2–3 Médio, 4+ Difícil);
 *  - salvar pede a nota do que foi conferido (10+ caracteres) e manda grau, itens e nota para app_admin_set_station_difficulty;
 *  - quem não pode definir (editor, revisor de outra área) só lê, sem os controles;
 *  - a regra da rubrica (dificuldade.js) bate com o banco e com docs/estacoes/dificuldade-estacoes.md.
 * Tudo aqui é EXEMPLO DE TESTE: nenhuma estação real é classificada.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
const session: any = { backend, boot: { role: "admin" }, user: { id: "a" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { StationDifficulty } from "../novo/app/admin/AdminPanels.jsx";
import { CRITERIOS, DIFICULDADES, dificuldadeLabel, dificuldadeSugerida } from "../novo/app/dupla/dificuldade.js";

const BASE = { id: "teste-e01", name: "Estação de teste", area: "Clínica Médica", can_review: true, difficulty: null, difficulty_criteria: [] };
const NOTA = "Conferido roteiro e checklist (exemplo de teste).";

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (_fn: string, a: any) => [{ ...BASE, difficulty: a.p_level, difficulty_criteria: a.p_criteria, difficulty_note: a.p_note, difficulty_by: "Revisor de Teste", difficulty_at: "2026-10-17T12:00:00Z" }]);
});
afterEach(cleanup);

describe("Conferir › Grau de dificuldade", () => {
  it("rubrica ao lado da escolha; a sugestão acompanha os itens; salvar pede a nota e envia grau, itens e nota", async () => {
    const onSaved = vi.fn();
    render(<StationDifficulty station={BASE} onSaved={onSaved} />);
    expect(screen.getByText("Sem grau")).toBeTruthy();
    expect(screen.getByText(/Sem grau definido: o aluno não vê selo de dificuldade/)).toBeTruthy();
    for (const c of CRITERIOS) expect(screen.getByText(`${c.label}.`)).toBeTruthy();
    expect(screen.getByText(/A rubrica indica:/).textContent).toContain("Fácil");

    fireEvent.click(screen.getByRole("checkbox", { name: /Quatro tarefas ou mais/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Raciocínio em etapas/ }));
    expect(screen.getByText(/A rubrica indica:/).textContent).toContain("Médio");

    const salvar = screen.getByRole("button", { name: "Salvar grau" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true); // sem grau escolhido
    fireEvent.click(screen.getByRole("radio", { name: "Difícil" }));
    expect(screen.getByText(/diferente do que a rubrica indica \(Médio\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Médio" }));
    expect(screen.queryByText(/diferente do que a rubrica indica/)).toBeNull();
    expect(salvar.disabled).toBe(true); // sem nota
    fireEvent.change(screen.getByLabelText(/O que foi conferido para definir o grau/), { target: { value: "curta" } });
    expect(salvar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/O que foi conferido para definir o grau/), { target: { value: `  ${NOTA} ` } });
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_set_station_difficulty", {
      p_station_id: "teste-e01", p_level: "medio", p_criteria: ["tarefas", "raciocinio"], p_note: NOTA,
    });
  });

  it("com grau gravado mostra o selo e quem definiu; 'Tirar o grau' também pede a nota", async () => {
    const station = { ...BASE, difficulty: "dificil", difficulty_criteria: ["tarefas", "raciocinio", "procedimento", "tempo"], difficulty_note: NOTA, difficulty_by: "Revisor de Teste", difficulty_at: "2026-10-17T12:00:00Z" };
    const onSaved = vi.fn();
    const { container } = render(<StationDifficulty station={station} onSaved={onSaved} />);
    expect(container.querySelector(".osce-level")?.textContent).toBe("Difícil");
    expect(screen.getByText(/Difícil: definido por Revisor de Teste/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Tempo apertado/ }) as HTMLInputElement).checked).toBe(true);
    const tirar = screen.getByRole("button", { name: "Tirar o grau" }) as HTMLButtonElement;
    expect(tirar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/O que foi conferido para definir o grau/), { target: { value: NOTA } });
    fireEvent.click(tirar);
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_set_station_difficulty", { p_station_id: "teste-e01", p_level: null, p_criteria: [], p_note: NOTA });
  });

  it("quem não pode definir só lê: sem rubrica para marcar, sem botões", () => {
    render(<StationDifficulty station={{ ...BASE, can_review: false }} onSaved={vi.fn()} />);
    expect(screen.getByText(/Só um revisor médico cadastrado em Clínica Médica ou um administrador define o grau/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar grau" })).toBeNull();
  });
});

describe("Rubrica: tela, banco e documento dizem o mesmo", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013410_treino_dupla_dificuldade_estacoes.sql"), "utf8");
  const doc = fs.readFileSync(path.join(ROOT, "docs/estacoes/dificuldade-estacoes.md"), "utf8");

  it("de 4 a 6 itens; os códigos estão no banco; os nomes estão no documento", () => {
    expect(CRITERIOS.length).toBeGreaterThanOrEqual(4);
    expect(CRITERIOS.length).toBeLessThanOrEqual(6);
    const lista = `array[${CRITERIOS.map((c) => `'${c.value}'`).join(", ")}]::text[]`;
    expect(sql.split(lista).length - 1).toBe(2); // na coluna e na função
    expect(sql).toContain("level in ('facil', 'medio', 'dificil')");
    expect(DIFICULDADES.map((d) => d.value)).toEqual(["facil", "medio", "dificil"]);
    for (const c of CRITERIOS) expect(doc, c.label).toContain(c.label);
  });

  it("0–1 Fácil, 2–3 Médio, 4+ Difícil; item desconhecido ou repetido não conta", () => {
    const ids = CRITERIOS.map((c) => c.value);
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => dificuldadeSugerida(ids.slice(0, n)))).toEqual(["facil", "facil", "medio", "medio", "dificil", "dificil", "dificil"]);
    expect(dificuldadeSugerida(["tarefas", "tarefas", "outro"])).toBe("facil");
    expect(dificuldadeSugerida(null)).toBe("facil");
    expect(dificuldadeLabel("medio")).toBe("Médio");
    expect(dificuldadeLabel(null)).toBeNull();
    expect(dificuldadeLabel("—")).toBeNull();
  });
});
