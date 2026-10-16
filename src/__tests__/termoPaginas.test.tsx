/**
 * Páginas públicas do Termo de Aceite e Uso e da Política de Privacidade no app novo (/novo/termos e /novo/privacidade).
 * Desde a ativação do Termo 2.0 (…11510_termo_v2_ativar, "pode" do dono em 16/10/2026) as páginas mostram a 2.0 e a Política que a
 * acompanha. O arquivo do Termo 1.0 continua o texto do dono, sem nenhuma mudança (é a prova do que foi aceito até a troca), e a
 * Política de 07/10/2026 continua palavra por palavra na versão 1.0 (fixture extraída do commit 88a2031).
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
import { LegalPage, Privacidade } from "../novo/app/legal/LegalPage.jsx";

const TERMO_PATH = "src/novo/app/legal/termo-uso-v1.0.md";
const TERMO_V2_PATH = "src/novo/app/legal/termo-uso-v2.0.md";
const words = (s: string | null) => (s ?? "").split(/\s+/).filter(Boolean);
const texto = () => screen.getByTestId("legal-texto");

window.scrollTo = vi.fn() as any; // o jsdom não implementa
afterEach(() => cleanup());

describe("Termo e Política públicos", () => {
  it("o arquivo do termo é o texto do dono", () => {
    const hash = createHash("sha256").update(readFileSync(TERMO_PATH)).digest("hex");
    expect(hash).toBe("21611cdab66939edeae1bef6c12c034b4660ea214a96ce116dbf9f1b119ee548");
  });

  it("a página do termo mostra todas as palavras do arquivo da versão vigente (2.0)", () => {
    const fonte = readFileSync(TERMO_V2_PATH, "utf8");
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
    expect(screen.getByText("Versão 2.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para o app/ })).toHaveAttribute("href", "/novo");
  });

  it("a política da versão 1.0 continua a de 07/10/2026, palavra por palavra", () => {
    // Fixture extraída do commit 88a2031 por script: uma linha por elemento (tag, tab, texto).
    const esperado = readFileSync("src/__tests__/fixtures/politica-2026-10-07.txt", "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [tag, ...resto] = l.split("\t");
        return { tag, palavras: words(resto.join("\t")) };
      });
    expect(esperado).toHaveLength(24);
    const { container } = render(<MemoryRouter><Privacidade versao="1.0" /></MemoryRouter>);
    const naPagina = [...container.querySelectorAll("h1, h2, h3, p, li")].map((el) => ({
      tag: el.tagName.toLowerCase(),
      palavras: words(el.textContent),
    }));
    expect(naPagina).toEqual(esperado);
    expect(screen.getByText("Última atualização: 07 de outubro de 2026")).toBeInTheDocument();
    expect(screen.getByText("STAZIA TECNOLOGIA E EDUCAÇÃO LTDA - CNPJ 64.964.213/0001-16")).toBeInTheDocument();
    const tudo = container.textContent!;
    expect(tudo).not.toContain("5C CONSULTORIA");
    expect(tudo).not.toContain("04 de setembro de 2026");
    expect(tudo).not.toContain("04/09/2026");
    expect(tudo).not.toContain("Vigente a partir");
  });

  it("a página da política mostra a que acompanha o Termo 2.0, com a mesma controladora", () => {
    const { container } = render(<MemoryRouter><LegalPage doc="privacidade" /></MemoryRouter>);
    expect(screen.getByText("Última atualização: 16 de outubro de 2026")).toBeInTheDocument();
    expect(screen.getByText("STAZIA TECNOLOGIA E EDUCAÇÃO LTDA - CNPJ 64.964.213/0001-16")).toBeInTheDocument();
    const tudo = container.textContent!;
    for (const trecho of ["Vertex AI", "até 7 dias", "ElevenLabs", "não grava o áudio", "18 anos ou mais"]) expect(tudo).toContain(trecho);
    expect(tudo).not.toContain("5C CONSULTORIA");
    expect(tudo).not.toContain("RASCUNHO");
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
