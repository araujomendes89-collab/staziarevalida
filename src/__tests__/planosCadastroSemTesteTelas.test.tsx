/**
 * PL06 (decisão do dono de 2026-10-11) nas telas: "Oferecer teste grátis no cadastro" vale de verdade (o cadastro consulta a chave,
 * migração 9732). A aba Planos diz o que a chave faz, Usuários e Conta mostram o cadastro sem teste como "Acesso gratuito" e o Registro
 * escreve em português quando a chave é ligada ou desligada.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const session: { boot: any } = { boot: null };
const backend: any = { rpc: vi.fn() };

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: session.boot, user: { id: "eu", email: "pessoa@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));

import { AdminPlans } from "../novo/app/admin/AdminPanels.jsx";
import { AdminUsers } from "../novo/app/admin/AdminUsers.jsx";
import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { auditLabel, auditSummary } from "../novo/app/admin/auditLog.js";

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

const PLANS = (active: boolean) => [
  { code: "trial", name: "Teste grátis", description: null, price_cents: 0, billing_period: "monthly", features: [], active },
  { code: "pro", name: "Pro", description: null, price_cents: null, billing_period: "monthly", features: [], active: false },
];

describe("PL06 — aba Planos", () => {
  it("a chave explica o que faz agora e salva o que o dono escolheu", async () => {
    const saved: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_signup_trial_rule") return { applies: true };
      if (fn === "app_admin_plans") return PLANS(true);
      if (fn === "app_admin_save_plan") return (saved.push(args.p_plan), PLANS(args.p_plan.active));
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<AdminPlans />);
    const chave = (await screen.findByRole("switch", { name: /^Oferecer teste grátis no cadastro/ })) as HTMLInputElement;
    expect(chave.checked).toBe(true);
    expect(screen.getByText("Oferecido no cadastro")).toBeTruthy();
    expect(screen.getByText(/Desligado: quem se cadastrar depois entra sem teste, só com questões e flashcards, até a equipe liberar um plano ou um teste em Usuários\. Quem já está em teste não muda\./)).toBeTruthy();
    expect(screen.queryByText(/ligada ou desligada/)).toBeNull();
    fireEvent.click(chave);
    fireEvent.click(screen.getAllByText("Salvar plano")[0]);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ code: "trial", active: false });
    expect(await screen.findByText("Cadastro sem teste")).toBeTruthy();
  });
});

describe("PL06 — Usuários e Conta", () => {
  const SEM_TESTE = { plan: "trial", status: "expired", trial_ends_at: null, current_period_end: null };

  it("Usuários: o cadastro sem teste aparece como 'Acesso gratuito · sem teste'", async () => {
    const aluno = { id: "u1", email: "nova@teste.dev", name: "Nova", role: "student", created_at: new Date().toISOString(), answered: 0, correct: 0, last_activity: null, ...SEM_TESTE };
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_admin_users" ? { total: 1, items: [aluno] } : null));
    render(<AdminUsers />);
    expect(await screen.findByText("Acesso gratuito · sem teste")).toBeTruthy();
  });

  it("Conta: 'Acesso gratuito' e o que fica nos planos pagos; sem inventar teste que nunca existiu", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_my_access" ? { locked: true, state: "sem_teste", tutor_closed: true } : null));
    session.boot = {
      role: "student",
      profile: { name: "Nova", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" },
      subscription: SEM_TESTE,
      has_pro: false,
    };
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Você está no acesso gratuito")).toBeTruthy();
    expect(screen.getByText("Acesso gratuito")).toBeTruthy();
    expect(screen.queryByText(/Teste grátis · encerrado/)).toBeNull();
    expect(screen.queryByText("Seu teste grátis terminou")).toBeNull();
  });
});

describe("PL06 — Registro", () => {
  const entry = (active: boolean) => ({ action: "plan.save", target: "trial", actor: "master@teste.dev", details: { code: "trial", active } });
  it("diz em português se o cadastro passou a oferecer ou não o teste grátis", () => {
    expect(auditLabel(entry(false))).toBe("Plano editado");
    expect(auditSummary(entry(true))).toBe("Teste grátis · oferta de teste no cadastro ligada");
    // o resumo é de um registro antigo: diz só o que foi feito, sem afirmar o que o cadastro faz hoje
    expect(auditSummary(entry(false))).toBe("Teste grátis · oferta de teste no cadastro desligada");
    expect(auditSummary(entry(false))).not.toMatch(/sem teste/);
    // os outros planos seguem como antes
    expect(auditSummary({ action: "plan.save", target: "pro", details: { active: true } })).toBe("Pro · marcado para venda");
  });
});
