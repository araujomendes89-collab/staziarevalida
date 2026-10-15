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
  it("a barra de baixo mantém os atalhos de antes e ganha 'Mais' (sem poluir: 5 botões)", () => {
    setWidth(390);
    mount();
    const bar = screen.getByRole("navigation", { name: "Navegação principal" });
    const names = within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Início", "Questões", "Revisar", "Tutor", "Mais"]);
  });

  it("'Mais' abre a página com todas as áreas da 1ª fase e nenhuma da 2ª", () => {
    setWidth(390);
    mount();
    expect(screen.queryByRole("region", { name: "Mais" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const page = screen.getByRole("region", { name: "Mais" });
    for (const nome of ["Plano de Hoje", "Minha Trilha", "Temas Essenciais", "Diretrizes e Atualizações", "Mapas Mentais", "Banco de Questões", "Simulados", "Flashcards", "Caderno de Erros", "Missões", "Ranking", "Conquistas", "Desempenho", "Análise Inteligente", "Planejamento"]) {
      expect(within(page).getByRole("button", { name: new RegExp(nome) })).toBeTruthy();
    }
    for (const fase2 of ["Estações", "Teoria", "PEPs", "Paciente", "Praticar em dupla"]) expect(within(page).queryByRole("button", { name: new RegExp(fase2) })).toBeNull();
    expect(within(page).queryByText(/Administração/)).toBeNull(); // aluno não vê
    // sem a caixa "Buscar no app" (fora da 1ª entrega)
    expect(within(page).queryByRole("searchbox")).toBeNull();
    // Aulas fechadas ao aluno por decisão do dono (14/10/2026; ver features.js)
    expect(within(page).queryByRole("button", { name: /Aulas/ })).toBeNull();
  });

  it("com VITE_AULAS_ALUNO=1 (caminho para abrir as Aulas de novo) a página volta a ter Aulas", () => {
    vi.stubEnv("VITE_AULAS_ALUNO", "1");
    try {
      setWidth(390);
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Mais" }));
      expect(within(screen.getByRole("region", { name: "Mais" })).getByRole("button", { name: /Aulas/ })).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("tocar numa área leva até ela e fecha a página; Esc e tocar em 'Mais' de novo também fecham", () => {
    setWidth(390);
    const go = mount();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Mais" })).getByRole("button", { name: /Simulados/ }));
    expect(go).toHaveBeenCalledWith("simulados");
    expect(screen.queryByRole("region", { name: "Mais" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Mais" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(screen.queryByRole("region", { name: "Mais" })).toBeNull();
  });

  it("mostra o número de flashcards a revisar; Administração (equipe) fica em Preferências", () => {
    setWidth(390);
    mount({ isStaff: true });
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const page = screen.getByRole("region", { name: "Mais" });
    expect(within(page).getByRole("button", { name: /Flashcards/ }).textContent).toContain("3");
    fireEvent.click(within(page).getByRole("button", { name: "Preferências" }));
    const prefs = screen.getByRole("region", { name: "Preferências" });
    expect(within(prefs).getByRole("button", { name: /Administração/ })).toBeTruthy();
    expect(within(prefs).getByRole("button", { name: /Meu Plano/ })).toBeTruthy();
    expect(within(prefs).getByRole("button", { name: /Dados pessoais e acesso/ })).toBeTruthy();
    fireEvent.click(within(prefs).getByRole("button", { name: /Mais/ })); // voltar
    expect(screen.getByRole("region", { name: "Mais" })).toBeTruthy();
  });

  it("Preferências: aluno não vê Administração; tema e fase mudam pelos botões; Sair da conta sai", () => {
    setWidth(390);
    const setTheme = vi.fn();
    const setPhase = vi.fn();
    const go = vi.fn();
    render(
      <AppShell bare={false} route="home" go={go} theme="light" setTheme={setTheme} title="Início" sub="" phase={1} setPhase={setPhase} phase2Locked info={{ ...INFO, themeChoice: "light" }}>
        <div>corpo</div>
      </AppShell>
    );
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Mais" })).getByRole("button", { name: "Preferências" }));
    const prefs = screen.getByRole("region", { name: "Preferências" });
    expect(within(prefs).queryByText(/Administração/)).toBeNull();
    expect(within(prefs).getByRole("radio", { name: "Claro" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(prefs).getByRole("radio", { name: "Escuro" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
    fireEvent.click(within(prefs).getByRole("radio", { name: "Do sistema" }));
    expect(setTheme).toHaveBeenCalledWith("system");
    // 2ª fase fechada ao aluno: opção sem clique
    const second = within(prefs).getByRole("radio", { name: /2ª Fase/ });
    expect(second.hasAttribute("disabled")).toBe(true);
    fireEvent.click(second);
    expect(setPhase).not.toHaveBeenCalled();
    fireEvent.click(within(prefs).getByRole("button", { name: /Dados pessoais e acesso/ }));
    expect(go).toHaveBeenCalledWith("perfil");
  });

  it("Sair da conta fica em Preferências; num celular bem estreito (320 px) os botões continuam cabendo", () => {
    setWidth(320);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Mais" })).getByRole("button", { name: "Preferências" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Preferências" })).getByRole("button", { name: "Sair da conta" }));
    expect(INFO.onSignOut).toHaveBeenCalled();
    const bar = screen.getByRole("navigation", { name: "Navegação principal" });
    for (const b of within(bar).getAllByRole("button")) expect(b.className).toContain("smn-tab") // largura flexível (flex:1) e min-height 56 no CSS;
  });

  it("no computador não há 'Mais' (o menu lateral já mostra tudo) e o botão Perguntar ao tutor fica visível", () => {
    setWidth(1400);
    mount();
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
    expect(screen.getByRole("button", { name: "Perguntar ao tutor" })).toBeTruthy();
  });

  it("Administração só para equipe e Revisão médica só para revisor (computador)", () => {
    setWidth(1400);
    mount();
    expect(screen.queryByText("Administração")).toBeNull();
    expect(screen.queryByText("Revisão médica")).toBeNull();
    cleanup();
    mount({ isStaff: true });
    expect(screen.getByText("Administração")).toBeTruthy();
    cleanup();
    mount({ isReviewer: true });
    expect(screen.getByText("Revisão médica")).toBeTruthy();
  });

  it("computador: botão Recolher/Expandir menu, trilho só com ícones e tooltips, guarda a escolha", () => {
    setWidth(1400);
    localStorage.removeItem("smf-col");
    const go = mount();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const btn = screen.getByRole("button", { name: "Recolher menu" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(within(nav).getByText("Minha jornada")).toBeTruthy();
    fireEvent.click(btn);
    const exp = screen.getByRole("button", { name: "Expandir menu" });
    expect(exp.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("smf-col")).toBe("1");
    expect(within(nav).queryByText("Minha jornada")).toBeNull(); // só ícones
    expect(screen.getByRole("button", { name: "Perguntar ao tutor" }).getAttribute("title")).toBe("Perguntar ao tutor");
    // clicar no ícone do grupo abre o submenu flutuante; Esc fecha
    fireEvent.click(screen.getByRole("button", { name: "Praticar" }));
    const fly = screen.getByRole("group", { name: "Praticar" });
    fireEvent.click(within(fly).getByRole("button", { name: /Simulados/ }));
    expect(go).toHaveBeenCalledWith("simulados");
    fireEvent.click(screen.getByRole("button", { name: "Praticar" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Praticar" })).toBeNull();
    fireEvent.click(exp);
    expect(localStorage.getItem("smf-col")).toBe("0");
    localStorage.removeItem("smf-col");
  });

  it("tablet (834 px): trilho com painel; o painel lista os itens do grupo e leva à rota", () => {
    setWidth(834);
    const go = mount();
    fireEvent.click(screen.getByRole("button", { name: "Praticar" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Praticar" })).getByRole("button", { name: /Simulados/ }));
    expect(go).toHaveBeenCalledWith("simulados");
    expect(screen.getByRole("button", { name: "Perguntar ao tutor" })).toBeTruthy();
  });

  it("tablet: 'Mais' e 'Preferências' do trilho abrem a página, cada uma na sua tela", () => {
    setWidth(834);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(screen.getByRole("region", { name: "Mais" })).toBeTruthy();
    const rail = screen.getByRole("navigation", { name: "Navegação principal" });
    fireEvent.click(within(rail).getByRole("button", { name: "Preferências" }));
    expect(screen.getByRole("region", { name: "Preferências" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Mais" })).toBeNull();
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
