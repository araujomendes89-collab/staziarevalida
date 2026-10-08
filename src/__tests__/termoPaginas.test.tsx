/**
 * Páginas públicas do Termo de Aceite e Uso v1.0 e da Política de Privacidade no app novo (/novo/termos e /novo/privacidade).
 * O texto do Termo é o do dono, sem nenhuma mudança; a Política nova tem as mesmas palavras da antiga.
 */
import React from "react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state: { session: any } = { session: null };

vi.mock("../novo/app/session.jsx", () => ({
  SessionProvider: ({ children }: any) => children,
  useSession: () => state.session,
}));
vi.mock("../novo/app/AuthScreens.jsx", () => ({ AuthFlow: () => <div data-testid="tela-login" /> }));

import { App } from "../novo/app/App.jsx";
import { LegalPage } from "../novo/app/legal/LegalPage.jsx";
import { PrivacyPolicyView } from "../components/legal/PrivacyPolicyView";

const TERMO_PATH = "src/novo/app/legal/termo-uso-v1.0.md";
const words = (s: string | null) => (s ?? "").split(/\s+/).filter(Boolean);
const texto = () => screen.getByTestId("legal-texto");

window.scrollTo = vi.fn() as any; // o jsdom não implementa
afterEach(() => cleanup());

describe("Termo e Política públicos", () => {
  it("o arquivo do termo é o texto do dono", () => {
    const hash = createHash("sha256").update(readFileSync(TERMO_PATH)).digest("hex");
    expect(hash).toBe("21611cdab66939edeae1bef6c12c034b4660ea214a96ce116dbf9f1b119ee548");
  });

  it("a página do termo mostra todas as palavras do arquivo", () => {
    const fonte = readFileSync(TERMO_PATH, "utf8");
    const esperadas = words(
      fonte
        .split("\n")
        .filter((l) => l.trim() !== "---")
        .map((l) => l.replace(/^#{1,2} /, "").replace(/^- /, "").replace(/\*\*/g, ""))
        .join("\n"),
    );
    // A conta do plano falava em 2.545 palavras; contando do arquivo (sem #, **, "- " e ---) dão 2.497. O que vale é a igualdade abaixo.
    expect(esperadas.length).toBeGreaterThan(2400);
    render(<MemoryRouter><LegalPage doc="termos" /></MemoryRouter>);
    // Palavras de cada título, parágrafo e item (o textContent junto cola o fim de um bloco no começo do outro).
    const naPagina = [...texto().querySelectorAll("h1, h2, p, li")].flatMap((el) => words(el.textContent));
    expect(naPagina).toEqual(esperadas);
    expect(screen.getByText("Versão 1.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para o app/ })).toHaveAttribute("href", "/novo");
  });

  it("a política nova tem as mesmas palavras da antiga", () => {
    const antiga = render(<MemoryRouter><PrivacyPolicyView /></MemoryRouter>);
    const palavrasAntigas = [...antiga.container.querySelectorAll("section[id]")].flatMap((s) => words(s.textContent));
    expect(palavrasAntigas.length).toBeGreaterThan(1000);
    cleanup();

    render(<MemoryRouter><LegalPage doc="privacidade" /></MemoryRouter>);
    const secoes = [...texto().querySelectorAll("section")];
    expect(secoes).toHaveLength(21);
    expect(secoes.flatMap((s) => words(s.textContent))).toEqual(palavrasAntigas);
    expect(screen.getByText("Última atualização: 04 de setembro de 2026")).toBeInTheDocument();
    expect(screen.getByText("Vigente a partir de 04/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Versão vigente a partir de 04 de setembro de 2026.")).toBeInTheDocument();
    expect(texto().textContent).toContain("5C CONSULTORIA EM GESTÃO E DESENVOLVIMENTO LTDA");
    expect(texto().textContent).toContain("64.964.213/0001-16");
  });

  const SESSOES: Array<[string, any]> = [
    ["signed-out", { status: "signed-out" }],
    ["loading", { status: "loading" }],
    ["error", { status: "error", error: new Error("falhou") }],
    ["ready", { status: "ready", boot: { role: "student", profile: { name: "Ana", phase: 1, theme: "light" }, reviewer_areas: [] }, user: { email: "a@b.dev" }, backend: { rpc: vi.fn(async () => null) }, signOut: vi.fn(), updateProfile: vi.fn() }],
  ];
  for (const [status, session] of SESSOES) {
    it.each([["/termos", "TERMO DE ACEITE E USO"], ["/privacidade", "Política de Privacidade"]])(
      `${status}: %s abre sem login`,
      (caminho, titulo) => {
        state.session = session;
        window.history.pushState({}, "", `/novo${caminho}`);
        render(<App />);
        expect(texto()).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1 }).textContent!.toUpperCase()).toContain(titulo.toUpperCase());
        expect(screen.queryByTestId("tela-login")).not.toBeInTheDocument();
        expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();
      },
    );
  }
});
