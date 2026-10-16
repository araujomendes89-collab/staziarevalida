/**
 * Novas telas, onda 5 (15/10/2026): Desempenho, Análise Inteligente, Planejamento, Conta e Meu plano com o visual do pacote.
 * Confere o que importa para o aluno: os números vêm do banco (nada fixo), as áreas ganham arte própria, as regras de antes
 * continuam (sem preço nem assinar em Meu plano, sem previsão de aprovação) e o celular usa abas/sanfona em vez do desenho largo.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const day = (n: number) => new Date(Date.UTC(2026, 9, 15 - n)).toISOString().slice(0, 10);
const RPC: Record<string, any> = {
  app_performance: {
    attempts: 11, correct: 6, questions: 11, days: 30, avg_seconds: 6, period: { attempts: 11, correct: 6 }, previous: { attempts: 0, correct: 0 }, simulados: { count: 2, accuracy: 0 },
    daily: [{ day: day(8), attempts: 2, correct: 2 }, { day: day(0), attempts: 3, correct: 1 }],
    areas: [
      { area: "CLINICA_MEDICA", attempts: 1, correct: 0 },
      { area: "PEDIATRIA", attempts: 0, correct: 0 },
    ],
  },
  app_error_profile: { wrong: 5, attempts: 11, days: 30, diagnosed: 0, error_types: [], kinds: {}, fixed_ideas: 0, confidence: { wrong_but_sure: 0, wrong_and_guessing: 0 }, traps: [], weak_points: [] },
  app_error_reasons: { declared: {}, wrong_questions: 5 },
  app_tutor_status: { enabled: true, available: true, consent_required: false },
  app_tutor_report: {
    insights: [], sessions: { count: 15, minutes: 13, voice_minutes: 9, questions_discussed: 2 }, recurrent_errors: [],
    mastery: { areas: [{ area: "PEDIATRIA", attempts: 0, accuracy: 0, level: "SEM_DADOS" }, { area: "CIRURGIA_GERAL", attempts: 3, accuracy: 67, level: "SEM_DADOS" }] },
    highest_risk_area: "GINECOLOGIA_OBSTETRICIA", critical_topics: [], evolution: { last_30: { attempts: 11, correct: 6 }, previous_30: { attempts: 0, correct: 0 } },
    reviews: { due: 0, scheduled: 0 }, tutor: { correct: 2, answers: 2, wrong_but_sure: 0, lucky_guesses: 0, with_heavy_hints: 0, avg_hints: 0, error_classes: {} }, error_types: {},
  },
  app_planning: {
    today: "2026-10-15", days_to_exam: null, target_edition: null, exam_type: "REVALIDA", unanswered: 1205, last_7_days: 9, daily_target: 20,
    week: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].map((d, i) => ({ day: d, questions: [2, 6, 0, 1, 0, 0, 0][i], flashcards: [0, 0, 0, 1, 0, 0, 0][i] })),
    month_active_days: [7, 12, 13, 15],
  },
  app_today: { done: 0, total: 2 },
  app_plans_info: { tutor_paid: true, pro_voice_daily_minutes: 60, elite_voice_daily_minutes: null, elite_station_feedback: false, plans: [{ code: "trial", name: "Teste grátis", description: "", features: [] }, { code: "pro", name: "Pro", description: "", features: [] }] },
  app_my_access: { locked: false },
  app_support_contact: { email: "suporte@staziamed.com.br" },
};
const session: { boot: any } = { boot: null };
const backend = { accessToken: "t", rpc: vi.fn(async (fn: string) => (fn in RPC ? RPC[fn] : null)) };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: session.boot, user: { email: "aluno@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));

import { PerformanceScreen } from "../novo/app/review/PerformanceScreen.jsx";
import { Report } from "../novo/app/tutor/ReportScreen.jsx";
import { PlanningScreen } from "../novo/app/home/PlanningScreen.jsx";
import { PlansScreen } from "../novo/app/plan/PlansScreen.jsx";
import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";

/** jsdom não tem matchMedia: simula a largura (celular = 390). */
const setWidth = (px: number) =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? 99999);
      return { matches: px <= max, media: query, addEventListener: () => {}, removeEventListener: () => {} };
    },
  });
beforeEach(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  session.boot = { role: "student", profile: { name: "Aluno Teste", phase: 1, theme: "light", exam_type: "REVALIDA" }, subscription: { plan: "pro", status: "active", current_period_end: "2099-01-01T00:00:00Z" }, reviewer_areas: [] };
  setWidth(1440);
});
afterEach(() => cleanup());

describe("Desempenho", () => {
  it("computador: quatro azulejos com os números do banco, áreas com barra e os dois quadros de erros", async () => {
    render(<PerformanceScreen go={vi.fn()} />);
    expect(await screen.findByText("Evolução da acurácia")).toBeInTheDocument();
    expect(screen.getByText("Acurácia").nextElementSibling).toHaveTextContent("55%");
    expect(screen.getByText("Questões").nextElementSibling).toHaveTextContent("11");
    expect(screen.getByText("Simulados").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Tempo por questão").nextElementSibling).toHaveTextContent("00:06");
    expect(screen.getByText("Clínica Médica")).toBeInTheDocument();
    expect(screen.getByText("sem respostas")).toBeInTheDocument(); // Pediatria
    expect(screen.getByRole("img", { name: /Clínica Médica: 0% em 1 questões/ })).toBeInTheDocument();
    expect(await screen.findByText("Por que você erra")).toBeInTheDocument();
    expect(screen.getByText(/Ainda não há análise revisada por médico\./)).toBeInTheDocument();
    expect(screen.getByText("Nenhum ponto com 3 ou mais respostas e 40% ou mais de erro.")).toBeInTheDocument();
  });

  it("celular: resumo em anel e abas Evolução, Por área e Erros", async () => {
    setWidth(390);
    render(<PerformanceScreen go={vi.fn()} />);
    expect(await screen.findByText("Respostas certas")).toBeInTheDocument();
    expect(screen.getByText("6/11")).toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: "Seções do desempenho" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Evolução", "Por área", "Erros"]);
    expect(screen.getByText("Acurácia no período")).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole("tab", { name: "Por área" }));
    expect(screen.getByText("Clínica Médica")).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole("tab", { name: "Erros" }));
    expect(await screen.findByText("Pontos para reforçar")).toBeInTheDocument();
  });
});

describe("Análise Inteligente", () => {
  it("computador: relatório em azulejos, domínio por área (sem respostas por último), risco e a nota sobre previsão", async () => {
    render(<Report />);
    expect(await screen.findByText("Meu relatório")).toBeInTheDocument();
    expect(screen.getByText("Feita pelo Tutor")).toBeInTheDocument();
    expect(screen.getByText("Sessões").nextElementSibling).toHaveTextContent("15");
    const nomes = screen.getAllByText(/^(Cirurgia|Pediatria)$/).map((n) => n.textContent);
    expect(nomes).toEqual(["Cirurgia", "Pediatria"]);
    expect(screen.getByText("Gineco & Obstetrícia")).toBeInTheDocument(); // risco, com o nome da área
    expect(screen.getByText("Com o Tutor")).toBeInTheDocument();
    expect(screen.getByText(/Não há previsão de aprovação aqui/)).toBeInTheDocument();
  });

  it("celular: cartão roxo com o risco do dia e abas Por área, Evolução e Tutor", async () => {
    setWidth(390);
    render(<Report />);
    expect(await screen.findByText("O que o Tutor percebeu")).toBeInTheDocument();
    expect(screen.getByText("Área com maior risco hoje: Gineco & Obstetrícia.")).toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: "Seções da análise" });
    fireEvent.click(within(tabs).getByRole("tab", { name: "Tutor" }));
    expect(screen.getByText("Com o Tutor")).toBeInTheDocument();
  });
});

describe("Planejamento", () => {
  it("computador: cartão 'Até a prova', calendário de segunda a domingo e sete cartões da semana", async () => {
    render(<PlanningScreen go={vi.fn()} />);
    expect(await screen.findByText("Data da prova não definida")).toBeInTheDocument();
    expect(screen.getByText(/as 1205 questões inéditas acabam em cerca de 134 semanas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Definir data da prova/ })).toBeInTheDocument();
    const semana = screen.getByRole("region", { hidden: true, name: "Esta semana" }) as HTMLElement;
    expect(within(semana).getAllByRole("listitem")).toHaveLength(7);
    expect(within(semana).getByText("Hoje · Plano 0/2")).toBeInTheDocument();
    expect(within(semana).getByText("Sem estudo")).toBeInTheDocument();
    expect(screen.getByText("Outubro 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("15 de Outubro, hoje, com estudo")).toBeInTheDocument();
    expect(screen.getByText(/dias de estudo neste mês/)).toBeInTheDocument();
  });

  it("celular: fita de dias; tocar num dia mostra o resumo dele", async () => {
    setWidth(390);
    render(<PlanningScreen go={vi.fn()} />);
    await screen.findByText("Data da prova não definida");
    fireEvent.click(screen.getByRole("button", { name: "Ter 13" }));
    expect(screen.getByText("6 questões")).toBeInTheDocument();
  });
});

describe("Meu plano", () => {
  it("só informativo: sem preço e sem assinar; situação da equipe e planos em cartões", async () => {
    session.boot = { ...session.boot, role: "admin", subscription: null };
    render(<PlansScreen go={vi.fn()} />);
    expect(await screen.findByTestId("plano-pro")).toBeInTheDocument();
    expect(screen.getByText("A assinatura pelo app ainda não está disponível")).toBeInTheDocument();
    expect(screen.getByText("Sua situação")).toBeInTheDocument();
    expect(screen.getByText("Equipe · acesso completo")).toBeInTheDocument();
    expect(within(screen.getByTestId("plano-pro")).getByText("Voz do Tutor: até 60 minutos por dia")).toBeInTheDocument();
    expect(screen.queryByText(/R\$|assinar agora|comprar/i)).toBeNull();
  });
});

describe("Conta", () => {
  it("computador: cartão do perfil, lista de seções ao lado e Ajuda e Sair no fim", () => {
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Aluno Teste" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Seções da conta" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent?.split(/(?=[A-Z][a-zê]*[ ,])/)[0])).toBeTruthy();
    expect(within(nav).getByText("Ajuda e suporte")).toBeInTheDocument();
    expect(within(nav).getByText("Sair da conta")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: /Segurança/ }));
    expect(screen.getByText("Nova senha")).toBeInTheDocument();
  });

  it("celular: lista em sanfona; abrir uma seção mostra o formulário dentro dela", () => {
    setWidth(390);
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Plano e acesso")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /Minha conta/ });
    // D9 (G9.3): no celular a lista abre com as seções fechadas e sem o cartão "Seu plano" (a linha "Meu plano" já existe)
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Nome completo")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Seu plano" })).toBeNull();
    expect(screen.getByRole("button", { name: /Meu plano/ })).toBeInTheDocument();
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Aluno Teste");
    fireEvent.click(screen.getByRole("button", { name: /Segurança/ }));
    expect(screen.getByText("Nova senha")).toBeInTheDocument();
  });
});
