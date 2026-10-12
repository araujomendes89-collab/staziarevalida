/**
 * Correções da Administração nas telas:
 * PL01 — a aba Planos não diz mais que os planos aparecem para os alunos: avisa que ainda não aparecem e que a cobrança será
 *        pela Stripe.
 * CF01 — o painel do Tutor avisa, antes de salvar, que o Tutor ligado precisa de "Planos pagos + teste grátis" ligado.
 * PL03 — depois que o teste grátis acaba, a faixa do Início diz "Seu teste grátis terminou" (e não "termina hoje" para sempre).
 * US01 — Usuários pede a data de fim do plano pago e mostra quando o plano venceu; a Conta do aluno mostra o plano encerrado.
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
vi.mock("../novo/app/play/PlayDashboard.jsx", () => ({
  usePlayHome: () => ({ summary: null, startNode: vi.fn(), busy: false, error: null }),
  PlayError: () => null,
  PlayHeader: () => null,
  PlayLoading: () => null,
  PlayLower: () => null,
  TrailPreview: () => null,
}));

import { AdminPlans, AdminTutor } from "../novo/app/admin/AdminPanels.jsx";
import { AdminUsers } from "../novo/app/admin/AdminUsers.jsx";
import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { HomeScreen } from "../novo/app/home/HomeScreen.jsx";
import { trialTitle } from "../novo/app/home/plan.js";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

// chaves: o que o beforeEach devolve o vitest chama como limpeza depois do teste (mockReset devolve o próprio mock)
beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("PL01 — aba Planos", () => {
  const PLANS = [
    { code: "trial", name: "Teste grátis", description: null, price_cents: 0, billing_period: "monthly", features: [], active: true },
    { code: "pro", name: "Pro", description: null, price_cents: 12990, billing_period: "monthly", features: ["Tutor"], active: true },
  ];

  it("avisa que os planos ainda não aparecem para os alunos e que a cobrança será pela Stripe", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_admin_plans" ? PLANS : null));
    render(<AdminPlans />);
    expect(await screen.findByText("Os planos ainda não aparecem para os alunos")).toBeTruthy();
    expect(screen.getByText(/O app ainda não tem a tela de planos do aluno/)).toBeTruthy();
    expect(screen.getByText(/A cobrança será pela Stripe/)).toBeTruthy();
    // nada na aba afirma que os planos já aparecem para os alunos
    expect(screen.queryByText(/aparecem para os alunos\./)).toBeNull();
    expect(screen.queryByText(/Aparecem na tela de planos do aluno/)).toBeNull();
    expect(screen.queryByText("À venda")).toBeNull();
    expect(screen.getByText("Marcado para venda")).toBeTruthy();
    expect(screen.getByText(/Ainda não aparece para os alunos\./)).toBeTruthy();
  });
});

describe("CF01 — painel do Tutor", () => {
  const CONFIG = {
    enabled: false, requires_pro: false, daily_message_limit: 40, max_profanity: "moderate", voice_enabled: true, trial_text_daily: 40, trial_questions_daily: 30,
    trial_voice_daily_seconds: 600, trial_voice_total_seconds: 2400, paid_voice_daily_seconds: 3600, voice_provider: "auto", voice_name: null, voice_session_max_seconds: 1800,
    save_transcripts: true, transcript_retention_days: 180, emotion_engine: true, inside_jokes: true, durona_level: "forte", pronunciations: [],
    tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
    tts_price_per_1k_chars_usd: 0.3, stt_price_per_min_usd: 0.003,
    usage_30d: { students: 0, requests: 0, cost_usd: 0, voice_minutes: 0 }, cost_by_feature: {}, cost_by_persona: {}, sessions: 0,
  };
  const AVISO = "Para ligar o Tutor, ligue também “Planos pagos + teste grátis”. Sem isso, todo aluno usaria o Tutor de graça, com os limites do plano pago.";

  it("ligar o Tutor com os planos pagos desligados mostra o aviso e não deixa salvar; ligando os planos, salva", async () => {
    const saved: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_tutor_config") return CONFIG;
      if (fn === "app_admin_tutor_save_config") return (saved.push(args), { ...CONFIG, enabled: args.p_config.enabled, requires_pro: args.p_config.requires_pro });
      if (fn === "app_admin_tutor_personalities") return [];
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<AdminTutor />);
    const tutor = (await screen.findByRole("switch", { name: /^Tutor ligado/ })) as HTMLInputElement;
    expect(screen.queryByText(AVISO)).toBeNull();
    // a descrição não promete mais "liberado para todos"
    expect(screen.queryByText(/liberado para todos/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Colocar o Tutor no ar para os alunos." } });
    const save = screen.getByText("Salvar Tutor").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    fireEvent.click(tutor);
    expect(screen.getByText(AVISO)).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(saved).toHaveLength(0);

    fireEvent.click(screen.getByRole("switch", { name: /^Planos pagos \+ teste grátis/ }));
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].p_config).toMatchObject({ enabled: true, requires_pro: true });
  });
});

describe("PL03 — faixa do teste grátis no Início", () => {
  const home = (trial: any) => ({ attempts: 0, correct: 0, open_session: null, trial });
  const boot = {
    role: "student",
    profile: { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" },
    subscription: { plan: "trial", status: "trialing", trial_ends_at: null, current_period_end: null },
    has_pro: false,
  };

  it("teste que já acabou: 'Seu teste grátis terminou', nunca 'termina hoje'", async () => {
    session.boot = boot;
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_home") return home({ ends_at: iso(Date.now() - 3 * DAY), days_left: 0 });
      if (fn === "app_today") return { tasks: [] };
      return null;
    });
    render(<HomeScreen go={vi.fn()} mobile={false} />);
    expect(await screen.findByText("Seu teste grátis terminou")).toBeTruthy();
    expect(screen.queryByText(/termina hoje/)).toBeNull();
  });

  it("título do aviso conta os dias do calendário de Brasília e para de contar quando o teste acaba", () => {
    // 10/10/2026 às 9h em Brasília (12h UTC)
    const now = new Date("2026-10-10T12:00:00Z");
    expect(trialTitle({ ends_at: "2026-10-10T20:00:00Z", days_left: 1 }, now)).toBe("Seu teste gratuito termina hoje");
    expect(trialTitle({ ends_at: "2026-10-11T20:00:00Z", days_left: 2 }, now)).toBe("Seu teste gratuito termina amanhã");
    expect(trialTitle({ ends_at: "2026-10-15T12:00:00Z", days_left: 5 }, now)).toBe("Seu teste gratuito termina em 5 dias");
    expect(trialTitle({ ends_at: "2026-10-10T11:59:00Z", days_left: 0 }, now)).toBe("Seu teste grátis terminou");
    expect(trialTitle({ ends_at: "2026-09-01T12:00:00Z", days_left: 0 }, now)).toBe("Seu teste grátis terminou");
    // sem a data: o banco manda 0 dias só quando o teste já acabou
    expect(trialTitle({ days_left: 0 }, now)).toBe("Seu teste grátis terminou");
    expect(trialTitle({ days_left: 3 }, now)).toBe("Seu teste gratuito termina em 3 dias");
  });
});

describe("US01 — plano pago com data de fim", () => {
  const student = (over: any = {}) => ({
    id: "u1", email: "ana@teste.dev", name: "Ana Lima", role: "student", created_at: iso(Date.now() - 40 * DAY), answered: 0, correct: 0, last_activity: null,
    plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() - 2 * DAY), ...over,
  });

  it("Usuários: plano pago vencido aparece como vencido; o formulário explica que a data de fim é obrigatória e corta o acesso", async () => {
    const ended = student();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_users") return { total: 2, items: [ended, student({ id: "u2", email: "bia@teste.dev", name: "Bia", current_period_end: iso(Date.now() + 20 * DAY) })] };
      if (fn === "app_admin_user") return { ...ended, sessions: 0, simulados: 0, flashcards: 0, flashcard_reviews: 0, pending_errors: 0 };
      return null;
    });
    render(<AdminUsers />);
    const vencido = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ended.current_period_end));
    expect(await screen.findByText(`Pro · Ativo · venceu em ${vencido}`)).toBeTruthy();
    expect(screen.getByText("Pro · Ativo")).toBeTruthy(); // a Bia ainda está no prazo
    fireEvent.click(screen.getByLabelText("Abrir Ana Lima"));
    expect(await screen.findByText(/informe até quando vai em “Plano pago até”/)).toBeTruthy();
    expect(screen.getByText(/Depois dessa data o acesso pago acaba sozinho; com pagamento pendente, ele continua por até 3 dias\./)).toBeTruthy();
  });

  it("Conta do aluno: plano pago que já não dá acesso aparece como encerrado", () => {
    session.boot = {
      role: "student",
      profile: { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" },
      subscription: { plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() - 2 * DAY) },
      has_pro: false,
    };
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Plano Pro · encerrado")).toBeTruthy();
  });

  it("Conta do revisor médico: acesso completo pelo papel, mesmo com o plano vencido", () => {
    session.boot = {
      role: "student",
      reviewer_areas: ["clinica_medica"],
      profile: { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" },
      subscription: { plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() - 2 * DAY) },
      has_pro: true,
    };
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Revisor médico · acesso completo")).toBeTruthy();
    expect(screen.queryByText("Plano Pro · encerrado")).toBeNull();
  });

  it("Conta do aluno: plano pago no prazo continua como antes", () => {
    session.boot = {
      role: "student",
      profile: { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" },
      subscription: { plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() + 20 * DAY) },
      has_pro: true,
    };
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Plano Pro")).toBeTruthy();
  });
});

describe("PL03 (resto) — teste encerrado em Usuários e na Conta", () => {
  const dia = (ms: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));

  it("Conta do aluno: teste que acabou aparece como encerrado; teste no prazo continua 'até a data'", () => {
    const boot = (ends: number) => ({
      role: "student",
      profile: { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" },
      subscription: { plan: "trial", status: "trialing", trial_ends_at: iso(ends), current_period_end: null },
      has_pro: false,
    });
    session.boot = boot(Date.now() - 3 * DAY);
    const velho = render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Teste grátis · encerrado")).toBeTruthy();
    velho.unmount();
    const fim = Date.now() + 5 * DAY;
    session.boot = boot(fim);
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText(`Teste grátis até ${dia(fim)}`)).toBeTruthy();
  });

  it("Usuários: teste que acabou diz quando terminou", async () => {
    const fim = Date.now() - 4 * DAY;
    const aluno = {
      id: "u1", email: "ana@teste.dev", name: "Ana Lima", role: "student", created_at: iso(Date.now() - 40 * DAY), answered: 0, correct: 0, last_activity: null,
      plan: "trial", status: "trialing", trial_ends_at: iso(fim), current_period_end: null,
    };
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_admin_users" ? { total: 1, items: [aluno] } : null));
    render(<AdminUsers />);
    expect(await screen.findByText(`Teste grátis · Em teste · terminou em ${dia(fim)}`)).toBeTruthy();
  });
});

describe("PL05, PL06 e PL08 — aba Planos", () => {
  const PLANS = [
    { code: "trial", name: "Teste grátis", description: null, price_cents: 0, billing_period: "monthly", features: [], active: true },
    { code: "pro", name: "Pro", description: null, price_cents: null, billing_period: "monthly", features: [], active: false },
  ];
  const abrir = async (saved: any[]) => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_plans") return PLANS;
      if (fn === "app_admin_save_plan") return (saved.push(args.p_plan), PLANS);
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<AdminPlans />);
    return (await screen.findByLabelText("Preço (R$)")) as HTMLInputElement;
  };

  it("PL05: 129.90 vale R$ 129,90 (e não 12.990), com prévia antes de salvar", async () => {
    const saved: any[] = [];
    const preco = await abrir(saved);
    fireEvent.change(preco, { target: { value: "129.90" } });
    expect(screen.getByText("Vai salvar: R$ 129,90")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Salvar plano")[1]);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].price_cents).toBe(12990);
  });

  it.each([
    ["129,90", "Vai salvar: R$ 129,90", 12990],
    ["R$ 129,90", "Vai salvar: R$ 129,90", 12990],
    ["1.299,90", "Vai salvar: R$ 1.299,90", 129990],
    ["1.299", "Vai salvar: R$ 1.299,00", 129900],
    ["129,9", "Vai salvar: R$ 129,90", 12990],
    ["129", "Vai salvar: R$ 129,00", 12900],
  ])("PL05: %s", async (digitado, previa, centavos) => {
    const saved: any[] = [];
    const preco = await abrir(saved);
    fireEvent.change(preco, { target: { value: digitado } });
    expect(screen.getByText(previa as string)).toBeTruthy();
    fireEvent.click(screen.getAllByText("Salvar plano")[1]);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].price_cents).toBe(centavos);
  });

  it("PL05: preço que não dá para entender não salva e não mostra prévia", async () => {
    const saved: any[] = [];
    const preco = await abrir(saved);
    fireEvent.change(preco, { target: { value: "12.5.0" } });
    expect(screen.queryByText(/Vai salvar/)).toBeNull();
    fireEvent.click(screen.getAllByText("Salvar plano")[1]);
    expect(await screen.findByText("Preço inválido. Use, por exemplo, 49,90.")).toBeTruthy();
    expect(saved).toHaveLength(0);
  });

  it("PL08: linhas em branco da lista de recursos não vão para o banco", async () => {
    const saved: any[] = [];
    await abrir(saved);
    const recursos = screen.getAllByLabelText(/Recursos incluídos/)[1];
    fireEvent.change(recursos, { target: { value: "Tutor\n\n   \n  Simulados  \n" } });
    fireEvent.click(screen.getAllByText("Salvar plano")[1]);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].features).toEqual(["Tutor", "Simulados"]);
  });

  it("PL06: a chave do teste grátis diz a verdade (o cadastro agora a consulta, migração 9732)", async () => {
    await abrir([]);
    expect(screen.getByText(/Desligado: quem se cadastrar depois entra sem teste, só com questões e flashcards/)).toBeTruthy();
    expect(screen.queryByText(/Hoje todo cadastro novo recebe o teste/)).toBeNull();
  });
});
