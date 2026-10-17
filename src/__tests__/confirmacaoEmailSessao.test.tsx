/**
 * Link do e-mail de confirmação do cadastro, de ponta a ponta (backend simulado): a pessoa volta logada para /novo?confirmacao=1
 * e segue o fluxo normal (Início, sem pedir de novo o aceite já dado no cadastro), mesmo com "Lembrar de mim" desmarcado antes;
 * a marca sai do endereço. Link vencido: a tela "Link de confirmação vencido" (e não a de recuperar senha).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

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

describe("Link de confirmação do cadastro no app", { timeout: 60_000 }, () => {
  it("volta logado e abre o Início, sem derrubar a sessão e sem a marca no endereço", async () => {
    localStorage.setItem("smn-session-only", "1");
    await openApp("?confirmacao=1#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=signup", USER);
    expect(await screen.findByTestId("tela-home", {}, { timeout: 15_000 })).toBeTruthy();
    expect(fake.backend.signOut).not.toHaveBeenCalled();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("vencido (sem sessão): mostra a tela de confirmação vencida", async () => {
    await openApp("?confirmacao=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", null);
    expect(await screen.findByRole("heading", { name: "Link de confirmação vencido" }, { timeout: 15_000 })).toBeTruthy();
    expect(screen.queryByText("Esse link venceu. Peça um novo.")).toBeNull();
  });
});
