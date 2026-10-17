/**
 * Tela de aceite antes de todas as telas (spec 2026-10-07-termo-aceite-cadastro, seção 7).
 * Aparece quando boot.legal.gate_required (o servidor decide); sem `legal` no boot, nunca aparece. Sem WhatsApp desde 17/10/2026.
 * Desde a 3.0 (17/10/2026) no padrão das telas de acesso: "Antes de começar" (nunca aceitou) ou "Atualizamos nosso Contrato", os
 * textos completos por cima e a caixa conferida ao tocar em ACEITAR E CONTINUAR. Aqui com o Termo 1.0 vigente (banco sem a 013740:
 * o banco responde que app_legal_current não existe); a 3.0 está em termoV3Telas.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state: { session: any } = { session: null };

vi.mock("../novo/app/session.jsx", () => ({
  SessionProvider: ({ children }: any) => children,
  useSession: () => state.session,
}));
vi.mock("../novo/app/AuthScreens.jsx", () => ({ AuthFlow: () => null }));
vi.mock("../novo/app/Shell.jsx", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, AppShell: ({ children }: any) => <div data-testid="app-shell">{children}</div> };
});
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorDockProvider: ({ children }: any) => <>{children}</> }));
vi.mock("../novo/app/home/HomeScreen.jsx", () => ({ HomeScreen: () => <div data-testid="tela-home" /> }));
vi.mock("../novo/app/admin/AdminScreen.jsx", async () => ({
  AdminScreen: () => <div data-testid="tela-admin" />,
  isStaffRole: (await import("../novo/app/admin/common.jsx")).isStaffRole,
}));
vi.mock("../novo/app/tutor/nexus/NexusScreen.jsx", () => ({ NexusScreen: () => <div data-testid="tela-sessao" /> }));
vi.mock("../novo/app/tutor/ReportScreen.jsx", () => ({ ReportScreen: () => <div data-testid="tela-sessao" /> }));
vi.mock("../novo/data", async (importOriginal) => {
  const actual: any = await importOriginal();
  const semFuncao = async () => {
    throw new Error("Could not find the function public.app_legal_current without parameters in the schema cache");
  };
  return { ...actual, getBackend: async () => ({ rpc: semFuncao }) };
});

import { App } from "../novo/app/App.jsx";

const legalOf = (extra: Record<string, unknown> = {}, termo: Record<string, unknown> = {}) => ({
  termo_uso: { current: "1.0", accepted: null, accepted_at: null, ...termo },
  tutor_ia: { current: "1.0", accepted: null, accepted_at: null },
  phone_missing: false,
  gate_required: true,
  ...extra,
});

const bootOf = (legal: any, role = "student") => ({
  role,
  profile: { name: "Ana Souza", phase: 1, theme: "light", exam_type: "REVALIDA" },
  subscription: { plan: "trial", status: "trialing", trial_ends_at: "2026-10-13T12:00:00Z", current_period_end: null },
  days_to_exam: null,
  streak_days: 0,
  flashcards_due: 0,
  play: { enabled: false },
  reviewer_areas: [],
  legal,
});

function open(path: string, boot: any, extra: Record<string, unknown> = {}) {
  const fns = {
    acceptTerms: vi.fn(async (_a: any) => {}),
    refresh: vi.fn(async () => {}),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
    ...extra,
  };
  state.session = { status: "ready", boot, user: { email: "ana@teste.dev" }, backend: { rpc: vi.fn(async () => null) }, ...fns };
  window.history.pushState({}, "", `/novo${path}`);
  render(<App />);
  return fns;
}

const TITLE = "Antes de começar";
const checkbox = () => screen.getByRole("checkbox", { name: "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais." });
const accept = () => screen.getByRole("button", { name: "ACEITAR E CONTINUAR" });
const ERRO_CAIXA = "Para continuar, aceite os Termos de Uso e a Política de Privacidade e declare ter 18 anos ou mais.";

beforeEach(() => {
  window.scrollTo = vi.fn() as any;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("tela de aceite", () => {
  it("aluno sem aceite vê a tela em qualquer rota, inclusive sessao e admin", () => {
    for (const path of ["/", "/sessao", "/admin"]) {
      const { acceptTerms } = open(path, bootOf(legalOf()));
      expect(screen.getByRole("heading", { name: TITLE })).toBeTruthy();
      expect(screen.queryByTestId("tela-home")).toBeNull();
      expect(screen.queryByTestId("tela-admin")).toBeNull();
      expect(screen.queryByTestId("tela-sessao")).toBeNull();
      expect(acceptTerms).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("equipe, revisor e boot sem legal não veem a tela", () => {
    open("/", bootOf(legalOf({ gate_required: false }), "admin"));
    expect(screen.queryByRole("heading", { name: TITLE })).toBeNull();
    cleanup();
    open("/", bootOf(legalOf({ gate_required: false }, { accepted: "1.0" })));
    expect(screen.queryByRole("heading", { name: TITLE })).toBeNull();
    cleanup();
    open("/", bootOf(null));
    expect(screen.queryByRole("heading", { name: TITLE })).toBeNull();
    expect(screen.getByTestId("tela-home")).toBeTruthy();
  });

  it("as páginas públicas continuam abertas com a tela exigida", () => {
    open("/termos", bootOf(legalOf()));
    expect(screen.queryByRole("button", { name: "ACEITAR E CONTINUAR" })).toBeNull();
  });

  it("sem WhatsApp (17/10/2026): a tela não pede o número, mesmo com phone_missing, e aceitar não manda telefone", async () => {
    const { acceptTerms } = open("/", bootOf(legalOf({ phone_missing: true })));
    expect(screen.queryByLabelText("WhatsApp")).toBeNull();
    expect(screen.queryByLabelText("País do WhatsApp")).toBeNull();
    fireEvent.click(checkbox());
    fireEvent.click(accept());
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledTimes(1));
    expect(acceptTerms).toHaveBeenCalledWith({ document: "termo_uso", version: "1.0", origin: "tela_aceite", declarations: undefined });
  });

  it("banco ainda sem a 13660: Termo aceito e só o WhatsApp faltando não prende a pessoa na tela", () => {
    open("/", bootOf(legalOf({ phone_missing: true, gate_required: true }, { accepted: "1.0", accepted_at: "2026-10-07T12:00:00Z" })));
    expect(screen.queryByRole("heading", { name: TITLE })).toBeNull();
    expect(screen.getByTestId("tela-home")).toBeTruthy();
  });

  it("sem a caixa marcada, ACEITAR E CONTINUAR mostra o erro na caixa e não grava; marcar tira o erro", () => {
    const { acceptTerms } = open("/", bootOf(legalOf()));
    fireEvent.click(accept());
    expect(screen.getByText(ERRO_CAIXA)).toBeTruthy();
    expect(checkbox().getAttribute("aria-invalid")).toBe("true");
    expect(acceptTerms).not.toHaveBeenCalled();
    fireEvent.click(checkbox());
    expect(screen.queryByText(ERRO_CAIXA)).toBeNull();
  });

  it("sem WhatsApp faltando, aceitar não manda telefone", async () => {
    const { acceptTerms } = open("/", bootOf(legalOf()));
    fireEvent.click(checkbox());
    fireEvent.click(accept());
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledTimes(1));
    expect(acceptTerms.mock.calls[0][0].phone).toBeUndefined();
  });

  it("volta do Google com aceite guardado aceita sozinho com origem google", async () => {
    localStorage.setItem("smn-aceite-google", JSON.stringify({ version: "1.0", at: Date.now() - 60_000 }));
    const { acceptTerms } = open("/", bootOf(legalOf({ phone_missing: true })));
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledTimes(1));
    expect(acceptTerms).toHaveBeenCalledWith({ document: "termo_uso", version: "1.0", origin: "google" });
    expect(localStorage.getItem("smn-aceite-google")).toBeNull();
  });

  it("aceite do Google vencido (mais de 30 min) ou de outra versão: pede a caixa", () => {
    localStorage.setItem("smn-aceite-google", JSON.stringify({ version: "1.0", at: Date.now() - 31 * 60_000 }));
    const a = open("/", bootOf(legalOf()));
    expect(checkbox()).toBeTruthy();
    expect(a.acceptTerms).not.toHaveBeenCalled();
    cleanup();
    localStorage.setItem("smn-aceite-google", JSON.stringify({ version: "0.9", at: Date.now() }));
    const b = open("/", bootOf(legalOf()));
    expect(checkbox()).toBeTruthy();
    expect(b.acceptTerms).not.toHaveBeenCalled();
  });

  it("versão desatualizada recarrega e avisa; falha de rede avisa e deixa tentar de novo", async () => {
    const acceptTerms = vi.fn().mockRejectedValueOnce(new Error("Versão desatualizada do termo.")).mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValue(undefined);
    const { refresh } = open("/", bootOf(legalOf()), { acceptTerms });
    fireEvent.click(checkbox());
    fireEvent.click(accept());
    expect(await screen.findByText("O contrato foi atualizado agora há pouco. Leia a nova versão e aceite de novo.")).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((checkbox() as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox());
    fireEvent.click(accept());
    expect(await screen.findByText("Não foi possível registrar o aceite agora. Tente de novo.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: TITLE })).toBeTruthy();
    fireEvent.click(accept());
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledTimes(3));
  });

  it("cláusula 6.5-A: com plano pago ativo, o app abre com o aviso; 'Ler e aceitar' leva à tela, 'Agora não' volta", async () => {
    const legal = legalOf({ gate_required: false, grace_until: "2026-11-01T15:00:00Z" }, { current: "2.0", accepted: "1.0", accepted_at: "2026-10-07T12:00:00Z" });
    const { acceptTerms } = open("/", bootOf(legal));
    expect(screen.getByTestId("tela-home")).toBeTruthy();
    expect(screen.getByText("Atualizamos o Contrato (versão 2.0)")).toBeTruthy();
    expect(screen.getByText(/Você continua com o seu plano até 01\/11\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ler e aceitar" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Atualizamos nosso Contrato" })).toBeTruthy();
    expect(screen.getByText(/Você pode usar o seu plano até 01\/11\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(await screen.findByTestId("tela-home")).toBeTruthy();
    expect(acceptTerms).not.toHaveBeenCalled();
    cleanup();
    // sem o prazo, o endereço /aceite volta ao início
    open("/aceite", bootOf(legalOf({ gate_required: false }, { accepted: "1.0" })));
    expect(await screen.findByTestId("tela-home")).toBeTruthy();
    expect(screen.queryByText(/Atualizamos o Contrato/)).toBeNull();
  });

  it("Sair da conta encerra a sessão", () => {
    const { signOut } = open("/", bootOf(legalOf()));
    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("os textos completos abrem por cima, antes do aceite, e a caixa tem rótulo", async () => {
    open("/", bootOf(legalOf({ phone_missing: true })));
    fireEvent.click(screen.getByRole("button", { name: "Termo de Aceite e Uso" }));
    const janela = await screen.findByRole("dialog", { name: "Termos de Uso e Contrato" });
    expect(await screen.findByText("Versão 1.0")).toBeTruthy();
    expect(janela.textContent).toContain("Termo");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("WhatsApp")).toBeNull();
    expect(checkbox()).toBeTruthy();
    // quem nunca aceitou não vê "baixar dados" nem "pedir cancelamento" (não há o que cancelar); vê "Sair da conta"
    expect(screen.queryByRole("button", { name: "Baixar meus dados" })).toBeNull();
  });
});
