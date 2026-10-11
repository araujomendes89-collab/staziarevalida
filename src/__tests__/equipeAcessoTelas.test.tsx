/**
 * Telas da equipe (administrador e editor): acesso completo, sem período de teste.
 * Conta mostra "Equipe · acesso completo" em vez de "Teste grátis até…"; Início não mostra o aviso do teste mesmo se o banco
 * mandar; o Tutor diz "Acesso da equipe". Aluno continua vendo o teste.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const session: { boot: any } = { boot: null };
const backend = {
  rpc: vi.fn(async (fn: string) => {
    // o título conta os dias pela data de fim (calendário de Brasília): a data vai relativa a hoje
    if (fn === "app_home") return { attempts: 0, correct: 0, open_session: null, trial: { ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), days_left: 5 } };
    if (fn === "app_today") return { tasks: [] };
    return null;
  }),
};

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: session.boot, user: { email: "pessoa@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));
vi.mock("../novo/app/play/PlayDashboard.jsx", () => ({
  usePlayHome: () => ({ summary: null, startNode: vi.fn(), busy: false, error: null }),
  PlayError: () => null,
  PlayHeader: () => null,
  PlayLoading: () => null,
  PlayLower: () => null,
  TrailPreview: () => null,
}));

import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { HomeScreen } from "../novo/app/home/HomeScreen.jsx";
import { TutorQuota } from "../novo/app/tutor/TutorQuota.jsx";

const boot = (role: string) => ({
  role,
  profile: { name: "Pessoa", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" },
  subscription: { plan: "trial", status: "trialing", trial_ends_at: "2026-10-13T12:00:00Z", current_period_end: null },
  has_pro: role !== "student",
});

afterEach(() => cleanup());

describe("Conta", () => {
  it.each([
    ["admin", "Você é administrador"],
    ["editor", "Você é editor"],
  ])("%s: acesso completo da equipe, sem teste grátis", async (role, title) => {
    session.boot = boot(role);
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Equipe · acesso completo")).toBeTruthy();
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(/Acesso completo ao app, sem período de teste\./)).toBeTruthy();
    expect(screen.queryByText(/Teste grátis até/)).toBeNull();
  });

  it("aluno: continua vendo até quando vai o teste grátis", () => {
    session.boot = boot("student");
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Teste grátis até 13/10/2026")).toBeTruthy();
    expect(screen.queryByText("Equipe · acesso completo")).toBeNull();
  });
});

describe("Início", () => {
  it("equipe: sem aviso de teste grátis, mesmo se o banco ainda mandar", async () => {
    session.boot = boot("editor");
    render(<HomeScreen go={vi.fn()} mobile={false} />);
    await screen.findByText("Comece aqui");
    expect(screen.queryByText(/teste gratuito/i)).toBeNull();
  });

  it("aluno: aviso de teste grátis continua", async () => {
    session.boot = boot("student");
    render(<HomeScreen go={vi.fn()} mobile={false} />);
    expect(await screen.findByText("Seu teste gratuito termina em 5 dias")).toBeTruthy();
  });
});

describe("Tutor", () => {
  const entitlement = (extra: Record<string, unknown>) => ({
    mode: "paid",
    is_paid: true,
    staff: false,
    trial: { state: "none", days: 7 },
    text: { used: 2, limit: 40, remaining: 38 },
    voice: { enabled: true, remaining_today_s: 3600, remaining_total_s: null },
    questions: { used: 0, limit: null },
    ...extra,
  });

  it("equipe: 'Acesso da equipe'; assinante: 'Plano ativo'", () => {
    render(<TutorQuota status={{ entitlement: entitlement({ staff: true }), reviews_due: 0 }} />);
    expect(screen.getByText("Acesso da equipe")).toBeTruthy();
    cleanup();
    render(<TutorQuota status={{ entitlement: entitlement({}), reviews_due: 0 }} />);
    expect(screen.getByText("Plano ativo")).toBeTruthy();
  });
});
