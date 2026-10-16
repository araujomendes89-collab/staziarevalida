// @vitest-environment jsdom
/**
 * Questões Inéditas por plano (migração …010300), telas: o aluno em teste vê "20 de 74 liberadas no seu plano" e o convite para
 * conhecer os planos (sem preço); o aluno com todas não vê aviso de limite; o administrador configura o limite por plano.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: () => <button type="button">Conversar com o Tutor</button> }));

import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { AdminPlans } from "../novo/app/admin/AdminPanels.jsx";

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

const TESTE = { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas", total: 74, locked: false, lock_message: null, released: 20, answered: 3, limited: true };

function openBuilder(staz: any, mode: "q" | "sim" = "q") {
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_question_filters") return { total: 1200, exams: [staz], topics: [] };
    if (fn === "app_count_questions") return { total: staz.released, by_area: { PEDIATRIA: staz.released } };
    if (fn === "app_recent_sessions") return [];
    throw new Error(`rpc não simulada: ${fn}`);
  });
  const go = vi.fn();
  render(
    <MemoryRouter>
      <QuestionBuilder go={go} mode={mode} />
    </MemoryRouter>
  );
  return go;
}

describe("Montador: limite do plano", () => {
  it("teste grátis: mostra o total, as liberadas, as respondidas e o convite, sem preço nem gabarito", async () => {
    // 143005f2 (15/10/2026): o Simulado nunca sorteia Questões Inéditas; elas e o quadro do limite ficam só no Banco de questões (treino)
    const go = openBuilder(TESTE, "q");
    const select = (await screen.findByLabelText("Prova / edição")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain("Questões Inéditas (20 de 74)");
    fireEvent.change(select, { target: { value: "staziamed" } });
    // no treino quem mostra o limite é o cartão "Questões Inéditas" (58778717): total, liberadas, respondidas e o convite
    expect((await screen.findAllByText(/20 de 74 liberadas no seu plano/)).length).toBeGreaterThan(0); // linha "disponíveis com esses filtros"
    const cartao = screen.getByRole("region", { name: "Questões Inéditas" });
    expect(cartao.textContent).toContain("20 de 74 liberadas");
    expect(cartao.textContent).toMatch(/Respondidas\s*3 de 20/);
    expect(cartao.textContent).toContain("as outras abrem em um plano com mais acesso");
    expect(document.body.textContent).not.toMatch(/R\$|reais|por mês/i);
    fireEvent.click(screen.getByRole("button", { name: "Conhecer os planos" }));
    expect(go).toHaveBeenCalledWith("planos");
  });

  it("plano com todas (sem limite): nada de bloqueio nem convite", async () => {
    openBuilder({ ...TESTE, released: 74, limited: false }, "q");
    const select = (await screen.findByLabelText("Prova / edição")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain("Questões Inéditas");
    fireEvent.change(select, { target: { value: "staziamed" } });
    await screen.findByText(/disponíveis com esses filtros/);
    expect(screen.queryByText("Conhecer os planos")).toBeNull();
    // sem aviso de limite: nada de "X de Y liberadas" nem de bloqueadas (o cartão das inéditas da onda 3 diz só "Todas as 74 liberadas")
    expect(document.body.textContent).not.toMatch(/\d+ de \d+ liberadas|bloqueadas/);
    expect(screen.getByText("Todas as 74 liberadas")).toBeTruthy();
  });

  it("simulado: a prova inédita nem aparece na lista (regra do dono: inéditas fora do simulado)", async () => {
    openBuilder(TESTE, "sim");
    const select = (await screen.findByLabelText("Prova / edição")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).not.toContain("staziamed");
    expect([...select.options].map((o) => o.textContent).join(" ")).not.toMatch(/Inéditas/);
  });

  it("sem acesso: continua o aviso, e o total de inéditas aparece", async () => {
    openBuilder({ ...TESTE, locked: true, released: 0, limited: true, lock_message: "Seu teste grátis terminou. As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia." });
    const select = (await screen.findByLabelText("Prova / edição")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "staziamed" } });
    expect(await screen.findByText(/Existem 74 Questões Inéditas no banco/)).toBeTruthy();
  });
});

describe("Administração > Planos: limite de Questões Inéditas", () => {
  const LIMITS = { published: 74, plans: [{ plan: "trial", limit: 20, all: false }, { plan: "pro", limit: null, all: true }, { plan: "elite", limit: null, all: true }] };
  const rpcAdmin = () =>
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_plans") return [];
      if (fn === "app_admin_ineditas_limits") return LIMITS;
      if (fn === "app_admin_save_ineditas_limits") return { ...LIMITS, plans: LIMITS.plans.map((p) => ({ ...p, limit: args.p_limits[p.plan], all: args.p_limits[p.plan] == null })) };
      return null;
    });

  it("mostra o padrão (teste 20, Pro e Elite todas) e salva o novo número", async () => {
    rpcAdmin();
    render(
      <MemoryRouter>
        <AdminPlans />
      </MemoryRouter>
    );
    expect(await screen.findByText("Questões Inéditas por plano")).toBeTruthy();
    const quantas = (await screen.findByLabelText("Quantas liberar")) as HTMLInputElement;
    expect(quantas.value).toBe("20");
    fireEvent.change(quantas, { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar limites" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_ineditas_limits", { p_limits: { trial: 35, pro: null, elite: null } }));
    expect(await screen.findByText("Limites salvos.")).toBeTruthy();
  });

  it("valor inválido bloqueia o botão", async () => {
    rpcAdmin();
    render(
      <MemoryRouter>
        <AdminPlans />
      </MemoryRouter>
    );
    const quantas = (await screen.findByLabelText("Quantas liberar")) as HTMLInputElement;
    fireEvent.change(quantas, { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Salvar limites" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
