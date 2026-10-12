/**
 * B2 de ponta a ponta (backend simulado): o aluno abre o link do e-mail de recuperar senha e o app mostra "Criar nova senha" ANTES de
 * qualquer tela; depois de salvar e tocar em "Entrar no app", abre o Início. Sem o link, abre direto o Início. Link vencido: aviso.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const fake: { backend: any } = { backend: null };
vi.mock("../novo/data", async (orig) => ({ ...(await orig<any>()), getBackend: async () => fake.backend }));
// Telas do corpo viram marcas (só interessa qual abre)
vi.mock("../novo/app/home/HomeScreen.jsx", () => ({ HomeScreen: () => <div data-testid="tela-home" /> }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorDockProvider: ({ children }: any) => <>{children}</> }));

const BOOT = {
  role: "student",
  profile: { name: "Ana Souza", phase: 1, theme: "light", exam_type: "REVALIDA" },
  subscription: null,
  days_to_exam: null,
  streak_days: 0,
  flashcards_due: 0,
  play: { enabled: false },
  legal: { gate_required: false },
};

function fakeBackend(user: any) {
  const listeners = new Set<(u: any, e?: string) => void>();
  return {
    mode: "supabase",
    getUser: vi.fn(async () => user),
    onAuthChange: (cb: any) => (listeners.add(cb), () => listeners.delete(cb)),
    rpc: vi.fn(async (fn: string) => (fn === "app_bootstrap" ? BOOT : null)),
    updatePassword: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => undefined),
    signIn: vi.fn(),
    masterSetup: { needed: vi.fn(async () => false) },
    listeners,
  };
}

async function openApp(hash: string, user: any) {
  vi.resetModules();
  window.history.replaceState(null, "", "/novo" + hash);
  fake.backend = fakeBackend(user);
  const { App } = await import("../novo/app/App.jsx");
  render(<App />);
}
const USER = { id: "u1", email: "ana@teste.dev" };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Link de recuperar senha no app", () => {
  it("com o link: mostra Criar nova senha antes do app; salva; só então entra no Início", async () => {
    await openApp("#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=recovery", USER);
    expect(await screen.findByRole("heading", { name: "Criar nova senha" })).toBeTruthy();
    expect(screen.queryByTestId("tela-home")).toBeNull();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senha-boa-123" } });
    fireEvent.change(screen.getByLabelText("Conferir nova senha"), { target: { value: "senha-boa-123" } });
    fireEvent.click(screen.getByRole("button", { name: "SALVAR NOVA SENHA" }));
    await waitFor(() => expect(fake.backend.updatePassword).toHaveBeenCalledWith("senha-boa-123"));
    expect(await screen.findByText(/Senha alterada com sucesso/)).toBeTruthy();
    expect(screen.queryByTestId("tela-home")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ENTRAR NO APP" }));
    expect(await screen.findByTestId("tela-home")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Criar nova senha" })).toBeNull();
  });

  it("a recuperação também vale pelo aviso do Supabase (PASSWORD_RECOVERY), mesmo sem dados no endereço", async () => {
    await openApp("", USER);
    expect(await screen.findByTestId("tela-home")).toBeTruthy();
    for (const cb of fake.backend.listeners) cb(USER, "PASSWORD_RECOVERY");
    expect(await screen.findByRole("heading", { name: "Criar nova senha" })).toBeTruthy();
  });

  it("sem o link: abre direto o Início, sem pedir nova senha", async () => {
    await openApp("", USER);
    expect(await screen.findByTestId("tela-home")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Criar nova senha" })).toBeNull();
  });

  it("não derruba a sessão do link, mesmo com 'Lembrar de mim' desmarcado em outra visita", async () => {
    localStorage.setItem("smn-session-only", "1");
    await openApp("#access_token=a&type=recovery", USER);
    expect(await screen.findByRole("heading", { name: "Criar nova senha" })).toBeTruthy();
    expect(fake.backend.signOut).not.toHaveBeenCalled();
  });

  it("link vencido (sem sessão): mostra o aviso e o botão para pedir de novo", async () => {
    await openApp("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", null);
    expect(await screen.findByText("Esse link venceu. Peça um novo.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "PEDIR NOVO LINK" }));
    expect(screen.getByRole("region", { name: "Recuperar senha" })).toBeTruthy();
  });
});
