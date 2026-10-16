/**
 * PL02 (decisão do dono de 2026-10-11) nas telas: teste grátis vencido mostra o aviso simples em português
 * ("Seu teste grátis terminou...") e deixa claro o que segue aberto (questões e flashcards). Não há tela de assinatura e a
 * cobrança (Stripe) está parada: o aviso não promete botão de assinar.
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
import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { TutorGate } from "../novo/app/tutor/nexus/TutorGate.jsx";
import { hasFullAccess, isPlanLockMessage, lockNotice } from "../novo/app/plan/planAccess.js";
import { PLAN_LOCKED, TRIAL_OVER, trialOverMessage } from "../../server/tutor/engine";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const PROFILE = { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" };
const bootOf = (subscription: any, over: any = {}) => ({ role: "student", profile: PROFILE, subscription, has_pro: false, ...over });
const TESTE_ACABOU = { plan: "trial", status: "trialing", trial_ends_at: iso(Date.now() - 3 * DAY), current_period_end: null };
const TESTE_VALE = { plan: "trial", status: "trialing", trial_ends_at: iso(Date.now() + 3 * DAY), current_period_end: null };
const PAGO = { plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(Date.now() + 20 * DAY) };
const SEM_TESTE = { plan: "trial", status: "expired", trial_ends_at: null, current_period_end: null };
const AVISO = /Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos\. Para pedir acesso ou tirar dúvidas, fale com o suporte: suporte@staziamed\.com\.br\./;

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

// O que o banco responde em app_my_access (quem decide é o banco; as telas só escolhem o aviso)
const ACESSO = {
  teste_acabou: { locked: true, state: "teste_acabou", tutor_closed: true },
  plano_acabou: { locked: true, state: "plano_acabou", tutor_closed: true },
  sem_teste: { locked: true, state: "sem_teste", tutor_closed: true },
  livre: { locked: false, state: null, tutor_closed: false },
};
const comAcesso = (acesso: any, resto: (fn: string, args?: any) => any = () => null) => {
  backend.rpc.mockImplementation(async (fn: string, args?: any) => (fn === "app_my_access" ? acesso : resto(fn, args)));
};

describe("PL02 — avisos (o banco decide; a tela só escolhe o texto)", () => {
  it.each([
    ["teste_acabou", "Seu teste grátis terminou"],
    ["plano_acabou", "Seu plano pago terminou"],
    ["sem_teste", "Você está no acesso gratuito"],
  ])("%s", (estado, titulo) => {
    expect(lockNotice(estado)!.title).toBe(titulo);
    expect(lockNotice(estado)!.text).toMatch(AVISO);
  });
  it("sem motivo conhecido não há aviso", () => {
    expect(lockNotice(null)).toBeNull();
    expect(lockNotice("qualquer")).toBeNull();
  });

  it("textos em português simples, sem botão de assinar e sem inventar preço", () => {
    for (const a of ["teste_acabou", "plano_acabou", "sem_teste"]) {
      const n = lockNotice(a)!;
      expect(n.text).toMatch(AVISO);
      expect(`${n.title} ${n.text}`).not.toMatch(/R\$|\d/);
    }
    expect(hasFullAccess(bootOf(null, { role: "editor" }))).toBe(true);
    expect(isPlanLockMessage("Seu teste grátis terminou. Os simulados completos fazem parte dos planos pagos.")).toBe(true);
    expect(isPlanLockMessage("Nenhuma questão encontrada com esses filtros.")).toBe(false);
  });
});

describe("PL02 — Início", () => {
  const home = (trial: any) => ({ attempts: 4, correct: 2, open_session: null, trial });
  const abrir = async (boot: any, trial: any, acesso: any = ACESSO.livre) => {
    session.boot = boot;
    comAcesso(acesso, (fn) => (fn === "app_home" ? home(trial) : fn === "app_today" ? { tasks: [] } : null));
    return render(<HomeScreen go={vi.fn()} mobile={false} />);
  };

  it("teste vencido: 'Seu teste grátis terminou', o que fica aberto e fechado, o contato do suporte e 'Ver planos' abre a tela informativa (sem assinar)", async () => {
    await abrir(bootOf(TESTE_ACABOU), { ends_at: TESTE_ACABOU.trial_ends_at, days_left: 0 }, ACESSO.teste_acabou);
    expect(await screen.findByText(AVISO)).toBeTruthy();
    expect(screen.getByText("Seu teste grátis terminou")).toBeTruthy();
    // PL01: a tela de planos é só informativa; o botão leva a ela e não existe botão de assinar
    expect(screen.getByText("Ver planos")).toBeTruthy();
    expect(screen.queryByText("Ver meu plano")).toBeNull();
    expect(screen.queryByText(/assinar/i, { selector: "button" })).toBeNull();
  });

  it("teste dentro do prazo: segue como antes (dias, questões respondidas e 'Ver planos')", async () => {
    await abrir(bootOf(TESTE_VALE), { ends_at: TESTE_VALE.trial_ends_at, days_left: 3 });
    expect(await screen.findByText(/Seu teste gratuito termina/)).toBeTruthy();
    expect(screen.getByText("Você respondeu 4 questões até agora.")).toBeTruthy();
    expect(screen.getByText("Ver planos")).toBeTruthy();
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("revisor médico não vê aviso de teste, mesmo com o teste vencido", async () => {
    await abrir(bootOf(TESTE_ACABOU, { reviewer_areas: ["clinica_medica"], has_pro: true }), { ends_at: TESTE_ACABOU.trial_ends_at, days_left: 0 });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalled());
    await screen.findAllByText(/Plano de hoje|Diagnóstico|Nada pendente|Personalizar/i).catch(() => undefined);
    expect(screen.queryByText("Seu teste grátis terminou")).toBeNull();
  });
});

describe("PL02 — Conta", () => {
  it("teste vencido: aviso com o que segue aberto; plano pago válido, equipe e revisor: sem aviso", async () => {
    session.boot = bootOf(TESTE_ACABOU);
    comAcesso(ACESSO.teste_acabou);
    const a = render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Seu teste grátis terminou")).toBeTruthy();
    expect(screen.getByText(AVISO)).toBeTruthy();
    expect(screen.getByText("Teste grátis · encerrado")).toBeTruthy();
    a.unmount();
    for (const boot of [bootOf(PAGO, { has_pro: true }), bootOf(TESTE_ACABOU, { role: "admin", has_pro: true }), bootOf(TESTE_ACABOU, { reviewer_areas: ["pediatria"], has_pro: true }), bootOf(TESTE_VALE)]) {
      session.boot = boot;
      comAcesso(ACESSO.livre);
      const r = render(<AccountScreen go={vi.fn()} />);
      await waitFor(() => expect(screen.queryByText(AVISO)).toBeNull());
      r.unmount();
    }
  });
});

describe("PL02 — Simulados", () => {
  const abrir = (boot: any, mode: "sim" | "q" = "sim", onStart?: () => Promise<any>, acesso: any = ACESSO.livre) => {
    session.boot = boot;
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_my_access") return acesso;
      if (fn === "app_question_filters") return { total: 50, exams: [], topics: [] };
      if (fn === "app_count_questions") return { total: 50, by_area: {} };
      if (fn === "app_recent_sessions") return [];
      if (fn === "app_start_session") return onStart ? onStart() : { session_id: "s1", count: 30 };
      return null;
    });
    return render(
      <MemoryRouter>
        <QuestionBuilder go={vi.fn()} mode={mode} />
      </MemoryRouter>
    );
  };
  const iniciar = async () => (await screen.findByText("Iniciar simulado")).closest("button") as HTMLButtonElement;

  it("teste vencido: aviso no simulado e o botão fica desligado; o treino de questões segue aberto", async () => {
    const a = abrir(bootOf(TESTE_ACABOU), "sim", undefined, ACESSO.teste_acabou);
    expect(await screen.findByText("Seu teste grátis terminou")).toBeTruthy();
    expect(screen.getByText(AVISO)).toBeTruthy();
    await waitFor(async () => expect((await iniciar()).disabled).toBe(true));
    a.unmount();
    abrir(bootOf(TESTE_ACABOU), "q", undefined, ACESSO.teste_acabou);
    const treino = (await screen.findByText("Começar treino")).closest("button") as HTMLButtonElement;
    await waitFor(() => expect(treino.disabled).toBe(false));
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("teste dentro do prazo, plano pago e equipe: simulado liberado, sem aviso", async () => {
    for (const boot of [bootOf(TESTE_VALE), bootOf(PAGO, { has_pro: true }), bootOf(TESTE_ACABOU, { role: "editor", has_pro: true }), bootOf(TESTE_ACABOU, { reviewer_areas: ["cirurgia"], has_pro: true })]) {
      const r = abrir(boot);
      const botao = await iniciar();
      await waitFor(() => expect(botao.disabled).toBe(false));
      expect(screen.queryByText(AVISO)).toBeNull();
      r.unmount();
    }
  });

  it("se o banco recusar (aviso desatualizado na tela), mostra a mensagem do banco em português", async () => {
    abrir(bootOf(TESTE_VALE), "sim", async () => {
      throw new Error("Seu teste grátis terminou. Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.");
    });
    const botao = await iniciar();
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
    expect(await screen.findByText(AVISO)).toBeTruthy();
  });
});

describe("PL02 — Tutor", () => {
  const status = (entitlement: any) => ({ enabled: true, consent_required: false, available: false, entitlement });
  const abrir = (boot: any, st: any, acesso: any = ACESSO.livre) => {
    session.boot = boot;
    comAcesso(acesso, (fn) => (fn === "app_tutor_status" ? st : null));
    return render(<TutorGate go={vi.fn()}>{() => <div>conteúdo do Tutor</div>}</TutorGate>);
  };

  it("conta sem teste valendo: 'Seu teste grátis terminou' e o que fica aberto, com 'Ver planos' (informativo) e sem botão de assinar", async () => {
    abrir(bootOf(TESTE_ACABOU), status({ block_reason: "trial_expired", plan_locked: true }), ACESSO.teste_acabou);
    expect(await screen.findByText("Seu teste grátis terminou")).toBeTruthy();
    expect(screen.getByText(/as questões e os flashcards continuam abertos\. Para pedir acesso ou tirar dúvidas, fale com o suporte: suporte@staziamed\.com\.br\./)).toBeTruthy();
    expect(screen.getByText("Ver planos")).toBeTruthy();
    expect(screen.queryByText("Ver meu plano")).toBeNull();
    expect(screen.queryByText(/assinar/i, { selector: "button" })).toBeNull();
  });

  it("cadastro sem teste: o título não diz que um teste terminou", async () => {
    abrir(bootOf(SEM_TESTE), status({ block_reason: "trial_expired", plan_locked: true }), ACESSO.sem_teste);
    expect(await screen.findByText("Você está no acesso gratuito")).toBeTruthy();
  });

  it("fim do teste do Tutor (o que já existia) continua igual", async () => {
    abrir(bootOf(TESTE_VALE), status({ block_reason: "trial_expired", plan_locked: false }));
    expect(await screen.findByText("Seu teste grátis do Tutor terminou")).toBeTruthy();
    expect(screen.getByText("Ver planos")).toBeTruthy();
  });
});

describe("PL02 — servidor do Tutor", () => {
  it("mensagem de Tutor bloqueado: a da conta sem teste quando o banco avisa, senão a do teste do Tutor", () => {
    expect(trialOverMessage({ plan_locked: true })).toBe(PLAN_LOCKED);
    expect(trialOverMessage({ plan_locked: false })).toBe(TRIAL_OVER);
    expect(trialOverMessage(null)).toBe(TRIAL_OVER);
    expect(trialOverMessage(undefined)).toBe(TRIAL_OVER);
    expect(PLAN_LOCKED).toMatch(/^Seu teste grátis terminou\./);
  });
});
