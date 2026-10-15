/**
 * B9 (prontidão da Fase 1): no celular a barra de baixo só levava a Início, Trilha, Estudar, Ranking e Perfil. Agora ganha "Mais",
 * que abre a lista com TODAS as áreas da 1ª fase (Aulas, Simulados, Flashcards, Tutor, Atualizações...), sem mostrar nada novo da
 * 2ª fase. Também: o sino "Alertas" e a caixa "Buscar" eram maquete sem função e saíram até haver função real.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "../novo/app/Shell.jsx";

const original = window.matchMedia;
function setWidth(px: number) {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return { matches: Boolean(max) && px <= Number(max![1]), media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false };
  }) as any;
}
const INFO = { name: "Ana Souza", streakDays: 2, flashcardsDue: 3, onSignOut: vi.fn(), isStaff: false, isReviewer: false };
const mount = (over: any = {}) => {
  const go = vi.fn();
  render(
    <AppShell bare={false} route="home" go={go} theme="light" setTheme={() => {}} title="Início" sub="" phase={1} setPhase={() => {}} phase2Locked info={{ ...INFO, ...over }}>
      <div>corpo</div>
    </AppShell>
  );
  return go;
};
afterEach(() => {
  cleanup();
  window.matchMedia = original;
});
beforeEach(() => INFO.onSignOut.mockReset());

describe("Menu do celular: Mais", () => {
  it("a barra de baixo mantém os atalhos de antes e ganha 'Mais' (sem poluir: 6 botões)", () => {
    setWidth(390);
    mount();
    const bar = screen.getByRole("navigation", { name: "Navegação principal" });
    const names = within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Jornada", "Trilha", "Praticar", "Ranking", "Perfil", "Mais"]);
  });

  it("'Mais' abre a lista com todas as áreas da 1ª fase e nenhuma da 2ª", () => {
    setWidth(390);
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const sheet = screen.getByRole("dialog", { name: "Todas as áreas" });
    for (const nome of ["Plano de Hoje", "Temas Essenciais", "Diretrizes e Atualizações", "Banco de Questões", "Simulados", "Flashcards", "Caderno de Erros", "Missões", "Ranking", "Conquistas", "Desempenho", "Análise Inteligente", "Planejamento", "Tutor com IA", "Meu Plano", "Conta e ajuda"]) {
      expect(within(sheet).getByRole("button", { name: new RegExp(nome) })).toBeTruthy();
    }
    for (const fase2 of ["Estações", "Teoria", "PEPs", "Paciente", "Praticar em dupla"]) expect(within(sheet).queryByRole("button", { name: new RegExp(fase2) })).toBeNull();
    expect(within(sheet).queryByText(/Administração/)).toBeNull(); // aluno não vê
    // Aulas fechadas ao aluno por decisão do dono (14/10/2026; ver features.js)
    expect(within(sheet).queryByRole("button", { name: /Aulas/ })).toBeNull();
  });

  it("com VITE_AULAS_ALUNO=1 (caminho para abrir as Aulas de novo) a lista volta a ter Aulas", () => {
    vi.stubEnv("VITE_AULAS_ALUNO", "1");
    try {
      setWidth(390);
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Mais" }));
      expect(within(screen.getByRole("dialog", { name: "Todas as áreas" })).getByRole("button", { name: /Aulas/ })).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("tocar numa área leva até ela e fecha a lista; Esc e o fundo também fecham", () => {
    setWidth(390);
    const go = mount();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Simulados/ }));
    expect(go).toHaveBeenCalledWith("simulados");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(screen.getByRole("dialog").previousElementSibling as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mostra o número de flashcards a revisar, e a equipe vê a Administração", () => {
    setWidth(390);
    mount({ isStaff: true });
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: /Flashcards/ }).textContent).toContain("3");
    expect(within(sheet).getByRole("button", { name: /Administração/ })).toBeTruthy();
  });

  it("Sair fica na lista; num celular bem estreito (320 px) os botões continuam cabendo", () => {
    setWidth(320);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sair" }));
    expect(INFO.onSignOut).toHaveBeenCalled();
    const bar = screen.getByRole("navigation", { name: "Navegação principal" });
    for (const b of within(bar).getAllByRole("button")) expect((b as HTMLElement).style.width).toMatch(/min\(\d+px,\s*\d+vw\)/);
  });

  it("no computador não há 'Mais' (o menu lateral já mostra tudo)", () => {
    setWidth(1400);
    mount();
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
  });
});

describe("Maquete escondida: sino 'Alertas' e 'Buscar'", () => {
  it("celular e computador não mostram o sino nem a caixa de busca sem função", () => {
    for (const w of [390, 1400]) {
      cleanup();
      setWidth(w);
      mount();
      expect(screen.queryByRole("button", { name: "Alertas" })).toBeNull();
      expect(screen.queryByLabelText("Buscar")).toBeNull();
      expect(screen.queryByPlaceholderText("Buscar…")).toBeNull();
      expect(screen.queryByTitle("Buscar")).toBeNull();
    }
  });
});
