/**
 * PL01 (Fase 1 objetiva, 2026-10-12): a tela de Planos do ALUNO é só informativa. Mostra nome, descrição e recursos de cada plano como
 * o administrador escreveu (app_plans_info) e a situação da pessoa; NÃO tem preço, NÃO tem botão de assinar, nada de pagamento.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const session: { boot: any } = { boot: null };
const backend: any = { rpc: vi.fn() };

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: session.boot, user: { id: "eu", email: "pessoa@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));

import { PlansScreen, planExtras } from "../novo/app/plan/PlansScreen.jsx";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const bootOf = (subscription: any, extra: any = {}) => ({ role: "student", reviewer_areas: [], subscription, ...extra });
const TESTE = { plan: "trial", status: "trialing", trial_ends_at: iso(Date.now() + 3 * DAY), current_period_end: null };
const TESTE_ACABOU = { plan: "trial", status: "trialing", trial_ends_at: iso(Date.now() - DAY), current_period_end: null };
const PRO = { plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() + 20 * DAY) };
const ELITE = { plan: "elite", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() + 20 * DAY) };

const INFO = {
  plans: [
    { code: "trial", name: "Teste grátis", description: "Conheça o app", features: ["Questões", "Flashcards"], offered_at_signup: true },
    { code: "pro", name: "Pro", description: "Para estudar todo dia", features: ["Simulados completos", "Tutor"], offered_at_signup: null },
    { code: "elite", name: "Elite", description: null, features: [], offered_at_signup: null },
  ],
  tutor_paid: true,
  pro_voice_daily_minutes: 20,
  elite_voice_daily_minutes: null,
  elite_station_feedback: false,
};
const ACESSO_LIVRE = { locked: false, state: null, tutor_closed: false };

const abrir = (boot: any, info: any = INFO, acesso: any = ACESSO_LIVRE, go = vi.fn()) => {
  session.boot = boot;
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_plans_info") {
      if (info instanceof Error) throw info;
      return info;
    }
    if (fn === "app_my_access") return acesso;
    throw new Error(`rpc inesperada: ${fn}`);
  });
  return { go, ...render(<PlansScreen go={go} />) };
};

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("PL01 — tela de planos do aluno", () => {
  it("mostra os planos como o administrador escreveu, e não tem preço nem botão de assinar", async () => {
    abrir(bootOf(PRO));
    const trial = await screen.findByTestId("plano-trial");
    expect(within(trial).getByText("Teste grátis")).toBeTruthy();
    expect(within(trial).getByText("Conheça o app")).toBeTruthy();
    expect(within(trial).getByText("Flashcards")).toBeTruthy();
    const pro = screen.getByTestId("plano-pro");
    expect(within(pro).getByText("Para estudar todo dia")).toBeTruthy();
    expect(within(pro).getByText("Simulados completos")).toBeTruthy();
    expect(screen.getByText("A assinatura pelo app ainda não está disponível")).toBeTruthy();
    // nada de preço, cobrança ou compra
    expect(document.body.textContent).not.toMatch(/R\$|US\$|\/mês|por mês|mensal|anual/i);
    for (const button of screen.getAllByRole("button")) expect(button.textContent).not.toMatch(/assin|compr|pagar|contratar|checkout/i);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("destaca o plano da pessoa (e só ele) e diz a situação", async () => {
    abrir(bootOf(PRO));
    const pro = await screen.findByTestId("plano-pro");
    expect(within(pro).getByText("Seu plano")).toBeTruthy();
    expect(within(screen.getByTestId("plano-trial")).queryByText("Seu plano")).toBeNull();
    expect(within(screen.getByTestId("plano-elite")).queryByText("Seu plano")).toBeNull();
    expect(screen.getByText("Plano Pro")).toBeTruthy();
  });

  it("teste grátis valendo: a situação traz a data e o cartão do Teste grátis é o dela", async () => {
    abrir(bootOf(TESTE));
    const trial = await screen.findByTestId("plano-trial");
    expect(within(trial).getByText("Seu plano")).toBeTruthy();
    expect(screen.getByText(/^Teste grátis até \d{2}\/\d{2}\/\d{4}$/)).toBeTruthy();
  });

  it("teste acabado: avisa o que fica aberto e fechado, sem destacar plano nenhum", async () => {
    abrir(bootOf(TESTE_ACABOU), INFO, { locked: true, state: "teste_acabou", tutor_closed: true });
    await screen.findByTestId("plano-pro");
    expect(await screen.findByText("Seu teste grátis terminou.")).toBeTruthy();
    expect(screen.getByText(/as questões e os flashcards continuam abertos/)).toBeTruthy();
    expect(screen.queryByText("Seu plano")).toBeNull();
    expect(screen.getByText("Teste grátis · encerrado")).toBeTruthy();
  });

  it("equipe: acesso completo, nenhum cartão destacado", async () => {
    abrir(bootOf(null, { role: "editor" }));
    await screen.findByTestId("plano-pro");
    expect(screen.getByText("Equipe · acesso completo")).toBeTruthy();
    expect(screen.getByText("Você tem acesso completo ao app, sem precisar de plano.")).toBeTruthy();
    expect(screen.queryByText("Seu plano")).toBeNull();
  });

  it("minutos de voz do Tutor: Pro com o valor do painel; Elite igual ao Pro até o dono preencher, e o benefício só quando ligado", async () => {
    abrir(bootOf(PRO));
    const pro = await screen.findByTestId("plano-pro");
    expect(within(pro).getByText("Voz do Tutor: até 20 minutos por dia")).toBeTruthy();
    expect(within(screen.getByTestId("plano-elite")).getByText("Voz do Tutor: até 20 minutos por dia")).toBeTruthy();
    expect(within(screen.getByTestId("plano-elite")).queryByText("Correção de estação com devolutiva")).toBeNull();
    cleanup();
    abrir(bootOf(ELITE), { ...INFO, elite_voice_daily_minutes: 45, elite_station_feedback: true });
    const elite = await screen.findByTestId("plano-elite");
    expect(within(elite).getByText("Voz do Tutor: até 45 minutos por dia")).toBeTruthy();
    expect(within(elite).getByText("Correção de estação com devolutiva")).toBeTruthy();
    expect(within(elite).getByText("Seu plano")).toBeTruthy();
  });

  it("sem Tutor nos planos pagos: nenhum minuto de voz e a frase não cita o Tutor", async () => {
    abrir(bootOf(PRO), { ...INFO, tutor_paid: false, pro_voice_daily_minutes: null, elite_voice_daily_minutes: null });
    await screen.findByTestId("plano-pro");
    expect(screen.queryByText(/Voz do Tutor/)).toBeNull();
    expect(screen.getByText(/^Os simulados completos e as estações Pro ficam com os planos pagos/)).toBeTruthy();
  });

  it("plano que a equipe ainda não descreveu: diz isso, sem inventar nada", async () => {
    abrir(bootOf(PRO), { ...INFO, pro_voice_daily_minutes: null, tutor_paid: false });
    const elite = await screen.findByTestId("plano-elite");
    expect(within(elite).getByText("A equipe ainda vai descrever o que este plano inclui.")).toBeTruthy();
  });

  it("o Teste grátis some quando o cadastro não o oferece mais, a menos que a pessoa esteja nele", async () => {
    const info = { ...INFO, plans: INFO.plans.map((p) => (p.code === "trial" ? { ...p, offered_at_signup: false } : p)) };
    abrir(bootOf(PRO), info);
    await screen.findByTestId("plano-pro");
    expect(screen.queryByTestId("plano-trial")).toBeNull();
    cleanup();
    abrir(bootOf(TESTE), info);
    expect(await screen.findByTestId("plano-trial")).toBeTruthy();
  });

  it("falha ao carregar: mensagem simples, sem termo técnico, e tentar de novo funciona", async () => {
    abrir(bootOf(PRO), new Error("function public.app_plans_info() does not exist"));
    expect(await screen.findByText("Não foi possível carregar os planos agora")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/function|public\.|does not exist/i);
    // a situação da pessoa continua na tela
    expect(screen.getByText("Plano Pro")).toBeTruthy();
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_plans_info" ? INFO : ACESSO_LIVRE));
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByTestId("plano-pro")).toBeTruthy();
  });

  it("resposta sem a lista de planos conta como falha", async () => {
    abrir(bootOf(PRO), {});
    expect(await screen.findByText("Não foi possível carregar os planos agora")).toBeTruthy();
  });

  it("Voltar para a conta usa a rota da conta", async () => {
    const { go } = abrir(bootOf(PRO));
    await screen.findByTestId("plano-pro");
    fireEvent.click(screen.getByRole("button", { name: /Voltar para a conta/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("perfil"));
  });
});

describe("PL01 — itens extras do plano", () => {
  it("Teste grátis não tem extras; Pro só com minutos; Elite nunca abaixo do Pro", () => {
    expect(planExtras("trial", INFO)).toEqual([]);
    expect(planExtras("pro", INFO)).toEqual(["Voz do Tutor: até 20 minutos por dia"]);
    expect(planExtras("elite", { ...INFO, elite_voice_daily_minutes: 1 , pro_voice_daily_minutes: 1 })).toEqual(["Voz do Tutor: até 1 minuto por dia"]);
    expect(planExtras("pro", { ...INFO, pro_voice_daily_minutes: null })).toEqual([]);
  });
});
