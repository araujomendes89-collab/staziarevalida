/**
 * Rodada de correções da revisão independente da leva 3 (Planos), nas telas:
 *  1. O aviso não diz que o Tutor é pago quando o banco diz que ele está aberto (tutor_closed = false).
 *  5. Conta: os benefícios do Elite somem quando o Elite acaba (sem desmontar a tela).
 *  6. Janelas de publicação: site novo + SQL antigo => nenhuma tela promete o que o banco não faz.
 *  7. Nenhum texto técnico ("TODO") aparece para o dono.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const session: { boot: any } = { boot: null };
const backend: any = { rpc: vi.fn() };

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: session.boot, user: { id: "eu", email: "pessoa@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));

import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { AdminPlans, AdminSettings } from "../novo/app/admin/AdminPanels.jsx";
import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { TutorGate } from "../novo/app/tutor/nexus/TutorGate.jsx";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const PROFILE = { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" };
const bootOf = (subscription: any, over: any = {}) => ({ role: "student", profile: PROFILE, subscription, has_pro: false, ...over });
const VENCIDO = { plan: "trial", status: "trialing", trial_ends_at: iso(Date.now() - 3 * DAY), current_period_end: null };
const ELITE = { plan: "elite", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() + 20 * DAY) };
const ELITE_CANCELADO = { ...ELITE, status: "canceled" };
const SEM_TUTOR = /(o Tutor e as estações Pro|O Tutor faz parte dos planos pagos)/;

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("Achado 1 — o aviso não contradiz o Tutor", () => {
  it("Tutor aberto a todos (chave desligada pelo dono): o aviso da Conta só fala de simulados e estações Pro", async () => {
    session.boot = bootOf(VENCIDO);
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_my_access" ? { locked: true, state: "teste_acabou", tutor_closed: false } : null));
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Seu teste grátis terminou")).toBeTruthy();
    expect(screen.getByText(/Os simulados completos e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos\./)).toBeTruthy();
    expect(screen.queryByText(SEM_TUTOR)).toBeNull();
  });

  it("Tutor fechado: o aviso fala do Tutor", async () => {
    session.boot = bootOf(VENCIDO);
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_my_access" ? { locked: true, state: "teste_acabou", tutor_closed: true } : null));
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText(/Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos/)).toBeTruthy();
  });
});

describe("Achado 5 — Conta: benefícios do Elite acompanham o plano", () => {
  it("Elite cancelado sem desmontar a tela: o benefício antigo sai", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_my_benefits") return session.boot.subscription.status === "active" ? { elite: true, voice_daily_minutes: 90, station_feedback: false } : { elite: false, voice_daily_minutes: null, station_feedback: false };
      return null;
    });
    session.boot = bootOf(ELITE, { has_pro: true });
    const r = render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Voz do Tutor: até 90 minutos por dia")).toBeTruthy();
    session.boot = bootOf(ELITE_CANCELADO);
    r.rerender(<AccountScreen go={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull());
  });

  it("Elite que vence com a tela aberta: no instante do vencimento a consulta é refeita e o benefício sai", async () => {
    const end = Date.now() + 400;
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn !== "app_my_benefits") return null;
      return Date.now() < end ? { elite: true, voice_daily_minutes: 90, station_feedback: false } : { elite: false, voice_daily_minutes: null, station_feedback: false };
    });
    session.boot = bootOf({ ...ELITE, current_period_end: iso(end) }, { has_pro: true });
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Voz do Tutor: até 90 minutos por dia")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull(), { timeout: 3000 });
  });

  it("Elite: ao voltar para a aba a consulta é refeita", async () => {
    let elite = true;
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_my_benefits" ? { elite, voice_daily_minutes: elite ? 90 : null, station_feedback: false } : null));
    session.boot = bootOf(ELITE, { has_pro: true });
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Voz do Tutor: até 90 minutos por dia")).toBeTruthy();
    elite = false;
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull());
  });

  it("Elite que muda para Pro sem desmontar: o benefício antigo sai e nenhuma consulta nova é feita", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_my_benefits" ? { elite: true, voice_daily_minutes: 90, station_feedback: false } : null));
    session.boot = bootOf(ELITE, { has_pro: true });
    const r = render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Voz do Tutor: até 90 minutos por dia")).toBeTruthy();
    session.boot = bootOf({ ...ELITE, plan: "pro" }, { has_pro: true });
    r.rerender(<AccountScreen go={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull());
  });
});

describe("Achado 6 — site novo + SQL antigo: as telas não prometem o que o banco não faz", () => {
  const semFuncao = (fn: string) => new Error(`function public.${fn}() does not exist`);

  it("Simulados: sem app_my_access o aviso não aparece e o botão fica liberado como antes (o banco decide ao iniciar)", async () => {
    session.boot = bootOf(VENCIDO);
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_my_access") throw semFuncao(fn);
      if (fn === "app_question_filters") return { total: 50, exams: [], topics: [] };
      if (fn === "app_count_questions") return { total: 50, by_area: {} };
      if (fn === "app_recent_sessions") return [];
      return null;
    });
    render(
      <MemoryRouter>
        <QuestionBuilder go={vi.fn()} mode="sim" />
      </MemoryRouter>
    );
    const botao = (await screen.findByText("Iniciar simulado")).closest("button") as HTMLButtonElement;
    await waitFor(() => expect(botao.disabled).toBe(false));
    expect(backend.rpc).toHaveBeenCalledWith("app_my_access");
    expect(screen.queryByText("Seu teste grátis terminou")).toBeNull();
  });

  it("Conta: sem app_my_access nenhum aviso de plano", async () => {
    session.boot = bootOf(VENCIDO);
    backend.rpc.mockImplementation(async (fn: string) => {
      throw semFuncao(fn);
    });
    render(<AccountScreen go={vi.fn()} />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_my_access"));
    expect(screen.queryByText("Seu teste grátis terminou")).toBeNull();
  });

  it("Tutor: título neutro enquanto o banco não confirma o motivo", async () => {
    session.boot = bootOf(VENCIDO);
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_tutor_status") return { enabled: true, consent_required: false, available: false, entitlement: { block_reason: "trial_expired", plan_locked: true } };
      throw semFuncao(fn);
    });
    render(<TutorGate go={vi.fn()}>{() => <div>conteúdo</div>}</TutorGate>);
    expect(await screen.findByText("O Tutor faz parte dos planos pagos")).toBeTruthy();
  });

  it("Planos: sem app_admin_signup_trial_rule a chave mantém o texto de antes e o selo não diz 'Cadastro sem teste'", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_plans") return [{ code: "trial", name: "Teste grátis", description: null, price_cents: 0, billing_period: "monthly", features: [], active: false }];
      throw semFuncao(fn);
    });
    render(<AdminPlans />);
    expect(await screen.findByText(/Hoje todo cadastro novo recebe o teste, com esta chave ligada ou desligada\./)).toBeTruthy();
    expect(screen.queryByText("Cadastro sem teste")).toBeNull();
    expect(screen.queryByText(/entra sem teste/)).toBeNull();
  });

  it("Planos: banco que não respondeu por outro motivo (rede) não afirma nem a regra nova nem a antiga", async () => {
    let release: (v?: unknown) => void = () => {};
    const gate = new Promise((r) => (release = r));
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_signup_trial_rule") {
        await gate; // enquanto confere
        throw new Error("Failed to fetch");
      }
      if (fn === "app_admin_plans") return [{ code: "trial", name: "Teste grátis", description: null, price_cents: 0, billing_period: "monthly", features: [], active: false }];
      return null;
    });
    render(<AdminPlans />);
    expect(await screen.findByText("Conferindo…")).toBeTruthy(); // ainda conferindo
    expect(screen.queryByText(/Hoje todo cadastro novo recebe o teste/)).toBeNull();
    expect(screen.queryByText(/entra sem teste/)).toBeNull();
    expect(screen.queryByText("Cadastro sem teste")).toBeNull();
    release();
    await waitFor(() => expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_admin_signup_trial_rule")).toBe(true));
    await new Promise((r) => setTimeout(r, 30)); // a falha chegou: continua sem afirmar nada
    expect(screen.getByText("Conferindo…")).toBeTruthy();
    expect(screen.queryByText(/Hoje todo cadastro novo recebe o teste/)).toBeNull();
    expect(screen.queryByText(/entra sem teste/)).toBeNull();
    expect(screen.queryByText("Cadastro sem teste")).toBeNull();
  });

  it("Planos: com a regra no banco, a chave desligada diz 'Cadastro sem teste'", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_signup_trial_rule") return { applies: true };
      if (fn === "app_admin_plans") return [{ code: "trial", name: "Teste grátis", description: null, price_cents: 0, billing_period: "monthly", features: [], active: false }];
      return null;
    });
    render(<AdminPlans />);
    expect(await screen.findByText("Cadastro sem teste")).toBeTruthy();
  });
});

describe("Achado 7 — nenhum texto técnico para o dono", () => {
  it("Configurações: os avisos de benefício pendente estão em português e sem 'TODO'", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_settings") return { trial_days: 7, announcement: { active: false, tone: "info", title: "", text: "" } };
      if (fn === "app_admin_plan_benefits") return { elite_voice_daily_minutes: null, elite_station_feedback: false, pro_voice_daily_minutes: 60, voice_enabled: true };
      return null;
    });
    render(<AdminSettings />);
    expect(await screen.findByText("Pendente: definir os minutos de voz do Elite")).toBeTruthy();
    expect(screen.getByText("Pendente: decidir se a correção de estação com devolutiva entra no Elite")).toBeTruthy();
    expect(screen.queryByText(/TODO/)).toBeNull();
  });
});
