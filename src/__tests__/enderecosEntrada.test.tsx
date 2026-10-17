/**
 * Endereços de entrada usados pela página inicial (backend simulado): /novo/criar-conta abre a tela Criar conta que já existe,
 * /novo/entrar e /novo/login abrem o login de sempre. Com sessão aberta, os três levam para o app (/novo).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const fake: { backend: any } = { backend: null };
vi.mock("../novo/data", async (orig) => ({ ...(await orig<any>()), getBackend: async () => fake.backend }));
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
  return {
    mode: "supabase",
    getUser: vi.fn(async () => user),
    onAuthChange: () => () => {},
    rpc: vi.fn(async (fn: string) => (fn === "app_bootstrap" ? BOOT : null)),
    signOut: vi.fn(async () => undefined),
    signIn: vi.fn(),
    masterSetup: { needed: vi.fn(async () => false) },
  };
}

async function abrir(endereco: string, user: any) {
  vi.resetModules();
  window.history.replaceState(null, "", endereco);
  fake.backend = fakeBackend(user);
  const { App } = await import("../novo/app/App.jsx");
  render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Endereços de entrada da página inicial", { timeout: 60_000 }, () => {
  it("/novo/criar-conta sem sessão abre direto a tela Criar conta", async () => {
    await abrir("/novo/criar-conta", null);
    expect(await screen.findByRole("button", { name: "CRIAR CONTA" }, { timeout: 15_000 })).toBeTruthy();
  });

  for (const endereco of ["/novo/entrar", "/novo/login", "/novo"]) {
    it(`${endereco} sem sessão abre o login de sempre (não o Criar conta)`, async () => {
      await abrir(endereco, null);
      expect(await screen.findByRole("button", { name: /ENTRAR/ }, { timeout: 15_000 })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "CRIAR CONTA" })).toBeNull();
    });
  }

  for (const endereco of ["/novo/criar-conta", "/novo/entrar", "/novo/login"]) {
    it(`${endereco} com sessão aberta vai para o app`, async () => {
      await abrir(endereco, { id: "u1", email: "ana@teste.dev" });
      expect(await screen.findByTestId("tela-home", {}, { timeout: 15_000 })).toBeTruthy();
      await waitFor(() => expect(window.location.pathname).toBe("/novo"));
    });
  }
});
