/**
 * B9 (prontidão da Fase 1): no celular a barra de baixo só levava a Início, Trilha, Estudar, Ranking e Perfil. Agora ganha "Mais",
 * que abre a lista com TODAS as áreas da 1ª fase (Aulas, Simulados, Flashcards, Tutor, Atualizações...), sem mostrar nada novo da
 * 2ª fase. Também: o sino "Alertas" e a caixa "Buscar" eram maquete sem função e saíram até haver função real.
 * Casca final (Novas telas, 15/10/2026): barra de baixo do pacote (Início, Questões, Tutor redondo, Revisar com o selo do Caderno de
 * Erros, Mais); "Mais" abre a folha que sobe de baixo (MobileMais); menu do computador com "Configurações" em sanfona, sem o botão
 * "Perguntar ao tutor" (o pacote não tem; o Tutor com IA segue no menu) e, recolhido, tocar num grupo abre o menu.
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

describe("Menu do celular: barra de baixo e folha 'Mais'", () => {
  it("a barra de baixo segue o pacote: Início, Questões, Tutor (botão redondo no meio), Revisar e Mais", () => {
    setWidth(390);
    mount();
    const bar = screen.getByRole("navigation", { name: "Navegação principal" });
    const names = within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Início", "Questões", "Tutor", "Revisar", "Mais"]);
    expect(within(bar).getByRole("button", { name: "Tutor" }).className).toContain("smn-tab--fab");
  });

  it("o selo do Revisar é o número real de questões erradas a revisar (Caderno de Erros); sem número, sem selo", () => {
    setWidth(390);
    const go = mount({ wrongPending: 5 });
    const rev = screen.getByRole("button", { name: "Revisar, 5 questões erradas para revisar" });
    expect(rev.textContent).toContain("5");
    fireEvent.click(rev);
    expect(go).toHaveBeenCalledWith("flash");
    cleanup();
    mount({ wrongPending: 0, flashcardsDue: 9 });
    expect(screen.getByRole("button", { name: "Revisar" }).textContent).not.toMatch(/\d/);
  });

  it("'Mais' abre a folha com as áreas da 1ª fase (nenhuma da 2ª), sem busca e sem Aulas para o aluno", () => {
    setWidth(390);
    mount();
    expect(screen.queryByRole("dialog", { name: "Mais opções" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const sheet = screen.getByRole("dialog", { name: "Mais opções" });
    for (const sec of ["Jornada e prática", "Aprender", "Stazia Arena", "Minha evolução", "Configurações"]) expect(within(sheet).getByRole("region", { name: sec })).toBeTruthy();
    for (const nome of ["Plano de Hoje", "Minha Trilha", "Simulados", "Temas Essenciais", "Diretrizes e Atualizações", "Mapas Mentais", "Missões", "Ranking", "Conquistas", "Desempenho", "Análise Inteligente", "Planejamento", "Meu Plano", "Preferências", "Sair da conta"]) {
      expect(within(sheet).getByRole("button", { name: new RegExp(nome) })).toBeTruthy();
    }
    for (const fase2 of ["Estações", "Teoria", "PEPs", "Paciente", "Praticar em dupla"]) expect(within(sheet).queryByRole("button", { name: new RegExp(fase2) })).toBeNull();
    expect(within(sheet).queryByText(/Administração|Revisão médica/)).toBeNull(); // aluno não vê
    expect(within(sheet).queryByRole("searchbox")).toBeNull();
    expect(within(sheet).queryByRole("button", { name: /Aulas/ })).toBeNull();
  });

  it("com VITE_AULAS_ALUNO=1 (caminho para abrir as Aulas de novo) a folha volta a ter Aulas", () => {
    vi.stubEnv("VITE_AULAS_ALUNO", "1");
    try {
      setWidth(390);
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Mais" }));
      expect(within(screen.getByRole("dialog", { name: "Mais opções" })).getByRole("button", { name: /Aulas/ })).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("tocar numa área leva até ela e fecha a folha; Esc, o X e tocar em 'Mais' de novo também fecham", () => {
    setWidth(390);
    const go = mount();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Mais opções" })).getByRole("button", { name: /Simulados/ }));
    expect(go).toHaveBeenCalledWith("simulados");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("selos reais na folha (Plano de Hoje 0/2, Missões 0/3); equipe vê Administração em Configurações; Preferências abre dentro da folha", () => {
    setWidth(390);
    const go = mount({ isStaff: true, planDone: 0, planTotal: 2, missionsDone: 0, missionsTotal: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const sheet = screen.getByRole("dialog", { name: "Mais opções" });
    expect(within(sheet).getByRole("button", { name: /Plano de Hoje/ }).textContent).toContain("0/2");
    expect(within(sheet).getByRole("button", { name: /Missões/ }).textContent).toContain("0/3");
    const cfg = within(sheet).getByRole("region", { name: "Configurações" });
    fireEvent.click(within(cfg).getByRole("button", { name: /Administração/ }));
    expect(go).toHaveBeenCalledWith("admin");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Preferências (dentro da folha): aluno não vê Administração; tema e fase mudam pelos botões; 'Trocar fase' leva até lá", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Trocar fase" })); // 2ª fase "Em breve": abre Preferências
    const prefs = screen.getByRole("dialog", { name: "Preferências" });
    expect(within(prefs).queryByText(/Administração/)).toBeNull();
    expect(within(prefs).getByRole("radio", { name: "Claro" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(prefs).getByRole("radio", { name: "Escuro" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
    const second = within(prefs).getByRole("radio", { name: /2ª Fase/ });
    expect(second.hasAttribute("disabled")).toBe(true);
    fireEvent.click(second);
    expect(setPhase).not.toHaveBeenCalled();
    fireEvent.click(within(prefs).getByRole("button", { name: /Mais/ })); // voltar
    expect(screen.getByRole("dialog", { name: "Mais opções" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Preferências/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Preferências" })).getByRole("button", { name: /Dados pessoais e acesso/ }));
    expect(go).toHaveBeenCalledWith("perfil");
  });

  it("Sair da conta fica na folha; num celular bem estreito (320 px) a barra continua com 5 botões", () => {
    setWidth(320);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Mais opções" })).getByRole("button", { name: "Sair da conta" }));
    expect(INFO.onSignOut).toHaveBeenCalled();
    const bar = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(bar).getAllByRole("button")).toHaveLength(5);
  });

  it("com ?mais=pagina o 'Mais' volta a abrir a página inteira (HomeMais)", () => {
    window.history.pushState({}, "", "/?mais=pagina");
    try {
      setWidth(390);
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Mais" }));
      expect(screen.getByRole("region", { name: "Mais" })).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});

describe("Menu do computador e do tablet", () => {
  it("no computador não há 'Mais'; o Tutor com IA fica no menu (sem o botão grande 'Perguntar ao tutor', como no pacote)", () => {
    setWidth(1400);
    const go = mount();
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Perguntar ao tutor" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tutor com IA" }));
    expect(go).toHaveBeenCalledWith("tutor");
  });

  it("Configurações em sanfona: Meu Plano e Preferências para todos; Administração só equipe; Revisão médica só revisor", () => {
    setWidth(1400);
    const go = mount();
    expect(screen.queryByText("Administração")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    const cfg = screen.getByRole("group", { name: "Configurações" });
    expect(within(cfg).queryByText("Administração")).toBeNull();
    expect(within(cfg).queryByText("Revisão médica")).toBeNull();
    fireEvent.click(within(cfg).getByRole("button", { name: /Meu Plano/ }));
    expect(go).toHaveBeenCalledWith("planos");
    fireEvent.click(within(cfg).getByRole("button", { name: /Preferências/ }));
    expect(go).toHaveBeenCalledWith("perfil");
    cleanup();
    mount({ isStaff: true });
    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    expect(within(screen.getByRole("group", { name: "Configurações" })).getByText("Administração")).toBeTruthy();
    cleanup();
    mount({ isReviewer: true });
    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    expect(within(screen.getByRole("group", { name: "Configurações" })).getByText("Revisão médica")).toBeTruthy();
  });

  it("selos do pacote no menu: Revisar mostra os erros a revisar (vermelho), Plano de Hoje e Arena o progresso do dia, Tutor 'IA'", () => {
    setWidth(1400);
    mount({ wrongPending: 5, planDone: 0, planTotal: 2, missionsDone: 0, missionsTotal: 3 });
    const revisar = screen.getByRole("button", { name: "Revisar" });
    expect(within(revisar).getByLabelText("5 pendentes").className).toContain("smn-badge--danger");
    expect(within(screen.getByRole("button", { name: "Stazia Arena" })).getByText("0/3").className).toContain("smn-badge--neutral");
    // o grupo da rota atual (Minha jornada) está aberto: o selo aparece no item Plano de Hoje
    expect(within(screen.getByRole("group", { name: "Minha jornada" })).getByText("0/2")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "Tutor com IA" })).getByText("IA")).toBeTruthy();
    fireEvent.click(revisar);
    expect(within(screen.getByRole("group", { name: "Revisar" })).getByRole("button", { name: /Caderno de Erros/ }).textContent).toContain("5");
  });

  it("computador: botão Recolher/Expandir menu, só ícones recolhido; tocar num grupo recolhido abre o menu e o grupo; guarda a escolha", () => {
    setWidth(1400);
    localStorage.removeItem("smf-col");
    const go = mount();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const btn = screen.getByRole("button", { name: "Recolher menu" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(within(nav).getByText("Minha jornada")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: "Expandir menu" }).getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("smf-col")).toBe("1");
    expect(within(nav).queryByText("Minha jornada")).toBeNull(); // só ícones
    expect(screen.getByRole("button", { name: "Praticar" }).getAttribute("title")).toBe("Praticar");
    fireEvent.click(screen.getByRole("button", { name: "Praticar" }));
    expect(screen.getByRole("button", { name: "Recolher menu" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Praticar" })).getByRole("button", { name: /Simulados/ }));
    expect(go).toHaveBeenCalledWith("simulados");
    expect(localStorage.getItem("smf-col")).toBe("0");
    localStorage.removeItem("smf-col");
  });

  it("tablet (834 px): trilho com painel; o painel lista os itens do grupo e leva à rota; só o selo vermelho aparece no trilho", () => {
    setWidth(834);
    const go = mount({ wrongPending: 5, missionsDone: 0, missionsTotal: 3 });
    const rail = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(rail).getByLabelText("5 pendentes")).toBeTruthy();
    expect(within(rail).queryByText("0/3")).toBeNull();
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
