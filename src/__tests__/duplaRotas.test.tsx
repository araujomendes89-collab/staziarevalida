/**
 * Treino em Dupla, Tarefa 10: rotas, acesso por plano, atalhos, painel e leitura do acesso na sessão.
 * As telas das Tarefas 7, 8 e 9 viram marcas (cada uma já tem o próprio teste); aqui se confere a ligação delas.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const state: { session: any; backend: any } = { session: null, backend: null };

vi.mock("../novo/data", async (importOriginal) => ({ ...(await importOriginal<any>()), getBackend: async () => state.backend }));
// Com `state.session` preenchido a sessão é a do teste; sem ela vale a de verdade (teste da leitura do acesso).
vi.mock("../novo/app/session.jsx", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    SessionProvider: (props: any) => (state.session ? props.children : <actual.SessionProvider {...props} />),
    useSession: () => state.session ?? actual.useSession(),
  };
});
vi.mock("../novo/app/AuthScreens.jsx", () => ({ AuthFlow: () => null }));
vi.mock("../novo/app/tutor/nexus/NexusScreen.jsx", () => ({ NexusScreen: () => null }));
vi.mock("../novo/app/tutor/ReportScreen.jsx", () => ({ ReportScreen: () => null }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorDockProvider: ({ children }: any) => <>{children}</> }));
vi.mock("../novo/app/study/LessonsScreen.jsx", () => ({ LessonsScreen: () => null }));
vi.mock("../novo/app/study/UpdatesScreen.jsx", () => ({ UpdatesScreen: () => null }));
vi.mock("../novo/app/study/ThemesScreen.jsx", () => ({ ThemesScreen: () => null }));
vi.mock("../novo/app/home/HomeScreen.jsx", () => ({ HomeScreen: () => <div data-testid="tela-home" /> }));
vi.mock("../novo/app/home/TodayPlan.jsx", () => ({ TodayPlan: () => null }));
vi.mock("../novo/app/home/PlanningScreen.jsx", () => ({ PlanningScreen: () => null }));
vi.mock("../novo/app/review/ErrorNotebook.jsx", () => ({ ErrorNotebook: () => null }));
vi.mock("../novo/app/review/PerformanceScreen.jsx", () => ({ PerformanceScreen: () => null }));
vi.mock("../novo/app/review/FlashcardsScreen.jsx", () => ({ FlashcardsScreen: () => null }));
vi.mock("../novo/app/practice/QuestionBuilder.jsx", () => ({ QuestionBuilder: () => null }));
vi.mock("../novo/app/practice/PracticeSession.jsx", () => ({ PracticeSession: () => null }));
vi.mock("../novo/app/play/TrailScreen.jsx", () => ({ TrailScreen: () => null }));
vi.mock("../novo/app/play/LeaderboardScreen.jsx", () => ({ LeaderboardScreen: () => null }));
vi.mock("../novo/app/play/MissionsScreen.jsx", () => ({ MissionsScreen: () => null }));
vi.mock("../novo/app/play/AchievementsScreen.jsx", () => ({ AchievementsScreen: () => null }));
vi.mock("../novo/app/account/AccountScreen.jsx", () => ({ AccountScreen: () => <div data-testid="tela-conta" /> }));
vi.mock("../novo/app/plan/PlansScreen.jsx", () => ({ PlansScreen: () => <div data-testid="tela-planos" /> }));
vi.mock("../novo/app/admin/AdminScreen.jsx", async () => ({
  AdminScreen: () => null,
  isStaffRole: (await import("../novo/app/admin/common.jsx")).isStaffRole,
}));
vi.mock("../novo/prototype/Phase2.jsx", () => ({
  Home2: () => <div data-testid="tela-home2" />,
  Stations: () => <div data-testid="tela-estacoes-prototipo" />,
  Station: () => <div data-testid="tela-estacao" />,
  Peps: () => <div data-testid="tela-peps" />,
  Perf2: () => <div data-testid="tela-desempenho2" />,
  SimPatient: () => <div data-testid="tela-paciente" />,
}));
vi.mock("../novo/prototype/Theory2.jsx", () => ({ Theory2: () => <div data-testid="tela-teoria2" /> }));
// 2ª fase com dados (telas-2fase, 16/10): as telas reais da equipe
vi.mock("../novo/app/fase2/Fase2Home.jsx", () => ({ Fase2Home: () => <div data-testid="tela-home2" /> }));
vi.mock("../novo/app/fase2/Fase2Player.jsx", () => ({ Fase2Player: () => <div data-testid="tela-estacao" /> }));
vi.mock("../novo/app/fase2/Fase2Peps.jsx", () => ({ Fase2Peps: () => <div data-testid="tela-peps" /> }));
vi.mock("../novo/app/fase2/Fase2Performance.jsx", () => ({ Fase2Performance: () => <div data-testid="tela-desempenho2" /> }));
vi.mock("../novo/app/fase2/Fase2Patient.jsx", () => ({ Fase2Patient: () => <div data-testid="tela-paciente" /> }));
vi.mock("../novo/app/fase2/Fase2Theory.jsx", () => ({ Fase2Theory: () => <div data-testid="tela-teoria2" /> }));
// As telas novas: uma marca cada, com botões que chamam o `go` que a rota entrega.
vi.mock("../novo/app/dupla/StationsScreen.jsx", () => ({
  StationsScreen: ({ go }: any) => (
    <div data-testid="tela-estacoes">
      <button onClick={() => go("dupla", { estacao: "teste-inep2020-e01" })}>abrir-praticar</button>
    </div>
  ),
}));
vi.mock("../novo/app/dupla/PracticeScreen.jsx", () => ({
  PracticeScreen: ({ go }: any) => (
    <div data-testid="tela-dupla">
      <button onClick={() => go("dupla-perfil")}>abrir-perfil</button>
      <button onClick={() => go("dupla-sala", { sala: "sala-123" })}>abrir-sala</button>
    </div>
  ),
}));
vi.mock("../novo/app/dupla/StudyProfileScreen.jsx", () => ({
  StudyProfileScreen: ({ go }: any) => (
    <div data-testid="tela-dupla-perfil">
      <button onClick={() => go("dupla")}>voltar-praticar</button>
    </div>
  ),
}));
vi.mock("../novo/app/dupla/room/RoomScreen.jsx", () => ({
  RoomScreen: ({ roomId }: any) => <div data-testid="tela-dupla-sala" data-room={roomId} />,
}));

import { App } from "../novo/app/App.jsx";
import { SessionProvider, useSession } from "../novo/app/session.jsx";
import { AdminDupla } from "../novo/app/admin/AdminDupla.jsx";
import { isPhase2Locked } from "../novo/app/admin/common.jsx";

const ABERTO_SEM_PLANO = { aberto: true, permitido: false, planos: ["pro", "elite"], equipe: false };
const ABERTO_COM_PLANO = { aberto: true, permitido: true, planos: ["pro", "elite"], equipe: false };
const FECHADO = { aberto: false, permitido: false, planos: ["pro", "elite"], equipe: false };
const FECHADO_EQUIPE = { aberto: false, permitido: true, planos: ["pro", "elite"], equipe: true };

const bootOf = (role: string, phase = 1, extra: Record<string, unknown> = {}) => ({
  role,
  profile: { name: "Ana Souza", phase, theme: "light", exam_type: "REVALIDA", target_edition: null, exam_date: null, daily_minutes: null },
  subscription: { plan: "pro", status: "active", trial_ends_at: null, current_period_end: "2027-01-01T00:00:00Z" },
  days_to_exam: null,
  streak_days: 0,
  flashcards_due: 0,
  play: { enabled: false },
  reviewer_areas: [],
  ...extra,
});

function openSession(boot: any, dupla: any) {
  const updateProfile = vi.fn(async (_patch: any) => {});
  state.session = { status: "ready", boot, dupla, user: { email: "ana@teste.dev" }, backend: { rpc: vi.fn(async () => null) }, signOut: vi.fn(), updateProfile };
  return updateProfile;
}
function renderApp(path: string, boot: any, dupla: any) {
  const updateProfile = openSession(boot, dupla);
  window.history.pushState({}, "", `/novo${path}`);
  render(<App />);
  return { updateProfile };
}

const textOf = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
const AT_HOME = /^\/novo\/?$/;
const originalMatchMedia = window.matchMedia;
function setMobile(on: boolean, isPhone = false) {
  window.matchMedia = ((query: string) => ({
    matches: on && (query.includes("860px") || (isPhone && query.includes("719px"))),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as any;
}
const rail = () => screen.getByRole("navigation", { name: "Navegação principal" });
const dock = () => screen.getByRole("toolbar", { name: "Ações rápidas" });

beforeEach(() => {
  window.scrollTo = vi.fn() as any;
});
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  window.history.replaceState({}, "", "/");
  state.session = null;
  state.backend = null;
});

describe("Chave desligada", () => {
  it("aluno: '2ª Fase · Em breve' e as rotas da 2ª fase levam ao início", () => {
    for (const route of ["estacoes", "dupla", "dupla/perfil", "dupla/sala/sala-123"]) {
      renderApp(`/${route}`, bootOf("student"), FECHADO);
      expect(screen.getByTestId("tela-home")).toBeTruthy();
      expect(screen.queryByTestId("tela-estacoes")).toBeNull();
      expect(screen.queryByTestId("tela-dupla")).toBeNull();
      expect(screen.queryByTestId("tela-dupla-perfil")).toBeNull();
      expect(screen.queryByTestId("tela-dupla-sala")).toBeNull();
      expect(window.location.pathname).toMatch(AT_HOME);
      const second = within(screen.getByRole("radiogroup", { name: "Fase do Revalida" })).getAllByRole("radio")[1];
      expect(textOf(second)).toMatch(/^2ª Fase ?· Em breve$/);
      expect(second).toBeDisabled();
      cleanup();
    }
  });

  it("sessão sem a leitura do acesso (null) conta como chave desligada", () => {
    renderApp("/estacoes", bootOf("student"), null);
    expect(screen.getByTestId("tela-home")).toBeTruthy();
    expect(window.location.pathname).toMatch(AT_HOME);
  });

  it("equipe e revisor médico (que o banco libera) entram mesmo com a chave desligada", () => {
    renderApp("/estacoes", bootOf("editor"), FECHADO_EQUIPE);
    expect(screen.getByTestId("tela-estacoes")).toBeTruthy();
    cleanup();
    renderApp("/dupla", bootOf("student", 1, { reviewer_areas: ["CLINICA_MEDICA"] }), { aberto: false, permitido: true, planos: ["pro", "elite"], equipe: false });
    expect(screen.getByTestId("tela-dupla")).toBeTruthy();
    expect(window.location.pathname).toBe("/novo/dupla");
  });
});

describe("Chave ligada, sem plano", () => {
  it.each(["estacoes", "dupla", "dupla/perfil", "dupla/sala/sala-123"])("/%s mostra o convite do plano e 'Ver planos' leva à tela de planos", (route) => {
    renderApp(`/${route}`, bootOf("student", 1, { subscription: { plan: "trial", status: "trialing", trial_ends_at: "2026-10-13T12:00:00Z", current_period_end: null } }), ABERTO_SEM_PLANO);
    expect(screen.getByRole("heading", { level: 3, name: "Praticar em dupla" })).toBeTruthy();
    expect(screen.getByText("Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase.")).toBeTruthy();
    expect(screen.getByText(/Recurso Stazia Pro/)).toBeTruthy();
    expect(screen.queryByTestId("tela-estacoes")).toBeNull();
    expect(screen.queryByTestId("tela-dupla")).toBeNull();
    expect(screen.queryByTestId("tela-dupla-perfil")).toBeNull();
    expect(screen.queryByTestId("tela-dupla-sala")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver planos/ }));
    expect(screen.getByTestId("tela-planos")).toBeTruthy();
    expect(window.location.pathname).toBe("/novo/planos");
  });

  it("o plano citado é o primeiro de Pro/Elite marcado no painel", () => {
    renderApp("/dupla", bootOf("student"), { ...ABERTO_SEM_PLANO, planos: ["trial", "elite"] });
    expect(screen.getByText(/Recurso Stazia Elite/)).toBeTruthy();
  });
});

describe("Chave ligada, com plano", () => {
  it("a 2ª fase começa no Banco de estações; Início, Teoria, PEPs, Paciente e Desempenho ficam 'Em breve' no menu", () => {
    const { updateProfile } = renderApp("/", bootOf("student", 2), ABERTO_COM_PLANO);
    expect(screen.getByTestId("tela-estacoes")).toBeTruthy();
    expect(screen.queryByTestId("tela-home2")).toBeNull();
    expect(screen.queryByText("Tela em reconstrução")).toBeNull();

    for (const name of ["Início", "Teoria", "Meus PEPs", "Treino com IA", "Análise"]) {
      const row = within(rail()).getByText(name).closest("button")!;
      expect(row).toHaveAttribute("aria-disabled", "true");
      expect(textOf(row)).toContain("Em breve");
      fireEvent.click(row);
    }
    expect(window.location.pathname).toMatch(AT_HOME);
    expect(updateProfile).not.toHaveBeenCalled();
    for (const name of ["Estações", "Praticar"]) {
      const row = within(rail()).getByText(name).closest("button")!;
      expect(row).not.toHaveAttribute("aria-disabled");
      expect(textOf(row)).not.toContain("Em breve");
    }
  });

  it.each(["home2", "teoria2", "peps", "paciente", "desempenho2", "estacao"])("/%s leva ao Banco de estações", (route) => {
    renderApp(`/${route}`, bootOf("student", 2), ABERTO_COM_PLANO);
    expect(screen.getByTestId("tela-estacoes")).toBeTruthy();
    expect(screen.queryByTestId(`tela-${route}`)).toBeNull();
    expect(window.location.pathname).toBe("/novo/estacoes");
  });

  it("escolher a 2ª fase no seletor leva às Estações", () => {
    const { updateProfile } = renderApp("/", bootOf("student", 1), ABERTO_COM_PLANO);
    const second = within(screen.getByRole("radiogroup", { name: "Fase do Revalida" })).getAllByRole("radio")[1];
    expect(textOf(second)).toMatch(/^2ª Fase ?· Prática$/);
    fireEvent.click(second);
    expect(updateProfile).toHaveBeenCalledWith({ phase: 2 });
    expect(window.location.pathname).toBe("/novo/estacoes");
  });

  it("a equipe segue com as telas da 2ª fase de antes (Início, Teoria etc.), sem 'Em breve'", () => {
    renderApp("/home2", bootOf("editor", 2), FECHADO_EQUIPE);
    expect(screen.getByTestId("tela-home2")).toBeTruthy();
    expect(within(rail()).getByText("Meus PEPs").closest("button")).not.toHaveAttribute("aria-disabled");
    expect(textOf(rail())).not.toContain("Em breve");
  });
});

describe("Atalhos da 2ª fase", () => {
  it("aluno: Estações → /estacoes e Praticar → /dupla; PEPs e Paciente 'Em breve'", () => {
    renderApp("/dupla", bootOf("student", 2), ABERTO_COM_PLANO);
    const side = within(rail());
    const estacoes = side.getByRole("button", { name: "Estações" });
    const praticar = side.getByRole("button", { name: "Praticar" });
    expect(estacoes).not.toHaveAttribute("aria-disabled");
    expect(praticar).not.toHaveAttribute("aria-disabled");

    // PEPs e Paciente (Treino com IA) ficam "Em breve" para o aluno
    const peps = side.getByText("Meus PEPs").closest("button")!;
    const paciente = side.getByText("Treino com IA").closest("button")!;
    expect(peps).toHaveAttribute("aria-disabled", "true");
    expect(textOf(peps)).toContain("Em breve");
    expect(paciente).toHaveAttribute("aria-disabled", "true");
    expect(textOf(paciente)).toContain("Em breve");

    fireEvent.click(estacoes);
    expect(window.location.pathname).toBe("/novo"); // para o aluno com a 2ª fase aberta o Banco de estações é a tela inicial (rota padrão)
    fireEvent.click(within(rail()).getByRole("button", { name: "Praticar" }));
    expect(window.location.pathname).toBe("/novo/dupla");
  });

  it("equipe: os mesmos dois mais PEPs e Paciente simulado", () => {
    renderApp("/estacoes", bootOf("admin", 2), FECHADO_EQUIPE);
    const side = within(rail());
    const estacoes = side.getByRole("button", { name: "Estações" });
    const praticar = side.getByRole("button", { name: "Praticar" });
    const peps = side.getByRole("button", { name: "Meus PEPs" });
    const paciente = side.getByRole("button", { name: "Treino com IA" });

    expect(estacoes).not.toHaveAttribute("aria-disabled");
    expect(praticar).not.toHaveAttribute("aria-disabled");
    expect(peps).not.toHaveAttribute("aria-disabled");
    expect(paciente).not.toHaveAttribute("aria-disabled");
    expect(textOf(rail())).not.toContain("Em breve");

    fireEvent.click(estacoes);
    expect(window.location.pathname).toBe("/novo/estacoes");
    fireEvent.click(within(rail()).getByRole("button", { name: "Praticar" }));
    expect(window.location.pathname).toBe("/novo/dupla");
    fireEvent.click(within(rail()).getByRole("button", { name: "Meus PEPs" }));
    expect(window.location.pathname).toBe("/novo/peps");
    fireEvent.click(within(rail()).getByRole("button", { name: "Treino com IA" }));
    expect(window.location.pathname).toBe("/novo/paciente");
  });

  it("celular: o menu do aluno tem só Estações e Praticar", () => {
    setMobile(true);
    renderApp("/estacoes", bootOf("student", 2), ABERTO_COM_PLANO);
    const nav = within(screen.getByRole("navigation", { name: "Navegação principal" }));
    expect(nav.getByRole("button", { name: "Estações" })).toBeTruthy();
    expect(nav.getByRole("button", { name: "Praticar" })).toBeTruthy();
    for (const name of ["Início", "PEPs", "Dados", "Paciente simulado"]) expect(nav.queryByRole("button", { name })).toBeNull();
    fireEvent.click(nav.getByRole("button", { name: "Praticar" }));
    expect(window.location.pathname).toBe("/novo/dupla");
  });
});

describe("Rotas novas", () => {
  it("/dupla, /dupla/perfil e /estacoes abrem a tela com o título do cabeçalho e sem 'Tela em reconstrução'", () => {
    const abertas: [string, string, string][] = [
      ["/estacoes", "tela-estacoes", "Banco de estações"],
      ["/dupla", "tela-dupla", "Praticar em dupla"],
      ["/dupla/perfil", "tela-dupla-perfil", "Meu perfil de estudo"],
    ];
    for (const [path, id, title] of abertas) {
      renderApp(path, bootOf("student", 2), ABERTO_COM_PLANO);
      expect(screen.getByTestId(id)).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
      expect(screen.queryByText("Tela em reconstrução")).toBeNull();
      expect(window.location.pathname).toBe(`/novo${path}`);
      cleanup();
    }
  });

  it("/dupla/sala/:id entrega o id à sala, sem cabeçalho, sem atalhos e sem 'Tela em reconstrução'", () => {
    renderApp("/dupla/sala/sala-123", bootOf("student", 2), ABERTO_COM_PLANO);
    expect(screen.getByTestId("tela-dupla-sala")).toHaveAttribute("data-room", "sala-123");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Fase do Revalida" })).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Ações rápidas" })).toBeNull();
    expect(screen.queryByText("Tela em reconstrução")).toBeNull();
    cleanup();

    setMobile(true, true);
    renderApp("/dupla/sala/sala-123", bootOf("student", 2), ABERTO_COM_PLANO);
    expect(screen.getByTestId("tela-dupla-sala")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).toBeNull();
  });

  it("o menu marca Praticar como atual no perfil de estudo e na sala", () => {
    renderApp("/dupla/perfil", bootOf("student", 2), ABERTO_COM_PLANO);
    expect(within(rail()).getByText("Praticar").closest("button")).toHaveAttribute("aria-current", "page");
  });

  describe("menu recolhido na sala (Etapa P, Tarefa P5)", () => {
    const toggle = () => within(rail()).getByRole("button", { name: /^(Recolher|Expandir) menu$/ });
    const isRecolhido = () => rail().classList.contains("is-collapsed");
    const guardada = () => localStorage.getItem("smf-col");
    const entrarNaSala = () => fireEvent.click(screen.getByText("abrir-sala"));
    const sairDaSala = () => {
      const praticar = within(rail()).queryByRole("button", { name: "Praticar" });
      if (praticar) {
        fireEvent.click(praticar);
      } else {
        fireEvent.click(within(rail()).getByRole("button", { name: "Menu" }));
        fireEvent.click(within(rail()).getByRole("button", { name: "Praticar" }));
      }
    };
    afterEach(() => localStorage.removeItem("smf-col"));

    it("na sala o menu abre recolhido; o botão expande; ao sair volta como estava", () => {
      localStorage.setItem("smf-col", "0");
      renderApp("/dupla", bootOf("student", 2), ABERTO_COM_PLANO);
      expect(toggle()).toHaveAttribute("aria-label", "Recolher menu");
      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(isRecolhido()).toBe(false);

      entrarNaSala();
      expect(screen.getByTestId("tela-dupla-sala")).toBeTruthy();
      expect(toggle()).toHaveAttribute("aria-label", "Expandir menu");
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(isRecolhido()).toBe(true);
      // A sala continua sem cabeçalho e sem barra de atalhos.
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Ações rápidas" })).toBeNull();

      fireEvent.click(toggle());
      expect(toggle()).toHaveAttribute("aria-label", "Recolher menu");
      expect(isRecolhido()).toBe(false);
      fireEvent.click(toggle());
      expect(isRecolhido()).toBe(true);

      sairDaSala();
      expect(screen.getByTestId("tela-dupla")).toBeTruthy();
      expect(toggle()).toHaveAttribute("aria-label", "Recolher menu");
      expect(isRecolhido()).toBe(false);
      expect(guardada()).toBe("0");
    });

    it("quem abre a sala direto pelo endereço também vê o menu recolhido, e quem já usava recolhido segue recolhido ao sair", () => {
      localStorage.setItem("smf-col", "1");
      renderApp("/dupla/sala/sala-123", bootOf("student", 2), ABERTO_COM_PLANO);
      expect(isRecolhido()).toBe(true);
      fireEvent.click(toggle());
      expect(isRecolhido()).toBe(false);
      sairDaSala();
      expect(screen.getByTestId("tela-dupla")).toBeTruthy();
      expect(isRecolhido()).toBe(true);
      expect(guardada()).toBe("1");
    });

    it("entrar na sala de novo recolhe outra vez, mesmo que a pessoa tenha expandido da vez anterior", () => {
      localStorage.setItem("smf-col", "0");
      renderApp("/dupla", bootOf("student", 2), ABERTO_COM_PLANO);
      entrarNaSala();
      fireEvent.click(toggle());
      expect(isRecolhido()).toBe(false);
      sairDaSala();
      entrarNaSala();
      expect(isRecolhido()).toBe(true);
    });

    it("fora da sala a preferência de menu não muda sozinha, e o botão continua gravando a escolha", () => {
      localStorage.setItem("smf-col", "0");
      renderApp("/dupla", bootOf("student", 2), ABERTO_COM_PLANO);
      fireEvent.click(screen.getByText("abrir-perfil"));
      expect(screen.getByTestId("tela-dupla-perfil")).toBeTruthy();
      expect(isRecolhido()).toBe(false);
      expect(guardada()).toBe("0");
      fireEvent.click(toggle());
      expect(isRecolhido()).toBe(true);
      expect(guardada()).toBe("1");
      fireEvent.click(toggle());
      expect(isRecolhido()).toBe(false);
      expect(guardada()).toBe("0");
    });

    it("dentro da sala, recolher e expandir não gravam a preferência da pessoa", () => {
      localStorage.setItem("smf-col", "0");
      renderApp("/dupla/sala/sala-123", bootOf("student", 2), ABERTO_COM_PLANO);
      fireEvent.click(toggle());
      fireEvent.click(toggle());
      fireEvent.click(toggle());
      expect(guardada()).toBe("0");
      cleanup();
      localStorage.removeItem("smf-col");
      renderApp("/dupla/sala/sala-123", bootOf("student", 2), ABERTO_COM_PLANO);
      fireEvent.click(toggle());
      expect(guardada()).toBeNull();
    });
  });

  it("go() monta os endereços: perfil, sala e Praticar com a estação escolhida", () => {
    renderApp("/estacoes", bootOf("student", 2), ABERTO_COM_PLANO);
    fireEvent.click(screen.getByText("abrir-praticar"));
    expect(window.location.pathname).toBe("/novo/dupla");
    expect(window.location.search).toBe("?estacao=teste-inep2020-e01");
    fireEvent.click(screen.getByText("abrir-perfil"));
    expect(window.location.pathname).toBe("/novo/dupla/perfil");
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByText("voltar-praticar"));
    expect(window.location.pathname).toBe("/novo/dupla");
    fireEvent.click(screen.getByText("abrir-sala"));
    expect(window.location.pathname).toBe("/novo/dupla/sala/sala-123");
    expect(screen.getByTestId("tela-dupla-sala")).toHaveAttribute("data-room", "sala-123");
  });

  it("endereço desconhecido dentro de /dupla volta ao início", () => {
    renderApp("/dupla/qualquer", bootOf("student", 2), ABERTO_COM_PLANO);
    expect(window.location.pathname).toMatch(/^\/novo(\/|\/estacoes)?$/);
  });
});

describe("isPhase2Locked", () => {
  it("olha a chave", () => {
    expect(isPhase2Locked("student")).toBe(true);
    expect(isPhase2Locked("student", null)).toBe(true);
    expect(isPhase2Locked("student", { aberto: false } as any)).toBe(true);
    expect(isPhase2Locked("student", { aberto: true } as any)).toBe(false);
    expect(isPhase2Locked("editor")).toBe(false);
    expect(isPhase2Locked("admin", { aberto: false } as any)).toBe(false);
    expect(isPhase2Locked(undefined)).toBe(true);
  });
  it("revisor médico (o banco diz 'permitido') entra com a chave desligada", () => {
    expect(isPhase2Locked("student", { aberto: false, permitido: true } as any)).toBe(false);
  });
});

describe("Sessão", () => {
  function Probe({ onSession }: { onSession: (s: any) => void }) {
    const s = useSession();
    onSession(s);
    return <div data-testid="status">{s.status}</div>;
  }
  async function openReal(rpc: (fn: string) => any) {
    const calls: string[] = [];
    state.backend = {
      getUser: async () => ({ id: "u1", email: "ana@teste.dev" }),
      onAuthChange: () => () => {},
      signOut: async () => {},
      rpc: vi.fn((fn: string) => {
        calls.push(fn);
        return rpc(fn);
      }),
    };
    let latest: any = null;
    render(
      <SessionProvider>
        <Probe onSession={(s) => (latest = s)} />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    return { calls, session: () => latest };
  }

  it("lê app_dupla_access junto com o app_bootstrap e o nivelamento", async () => {
    const { calls, session } = await openReal(async (fn) => (fn === "app_bootstrap" ? bootOf("student") : ABERTO_COM_PLANO));
    expect(calls).toEqual(["app_bootstrap", "app_nivelamento_estado", "app_dupla_access"]); // o nivelamento (main) é lido junto
    expect(session().dupla).toEqual(ABERTO_COM_PLANO);
    expect(session().boot.role).toBe("student");
  });

  it("falha na leitura do acesso vira null e o app abre do mesmo jeito", async () => {
    const { session } = await openReal(async (fn) => {
      if (fn === "app_bootstrap") return bootOf("student");
      throw new Error("Sem acesso ao Treinamento em Dupla.");
    });
    expect(session().dupla).toBeNull();
    expect(session().boot.role).toBe("student");
  });

  it("rpc sem resposta (testes que simulam o banco) também vira null", async () => {
    const { session } = await openReal((fn) => (fn === "app_bootstrap" ? bootOf("student") : undefined));
    expect(session().dupla).toBeNull();
  });

  it("refresh e updateProfile não perdem o acesso lido", async () => {
    const { session } = await openReal(async (fn) => (fn === "app_bootstrap" || fn === "app_update_profile" ? bootOf("student") : ABERTO_COM_PLANO));
    await session().refresh();
    await session().updateProfile({ phase: 2 });
    await waitFor(() => expect(session().dupla).toEqual(ABERTO_COM_PLANO));
  });
});

describe("Painel · Treinamento em Dupla", () => {
  function openPanel(treino: any, saveResult?: any) {
    const rpc = vi.fn(async (fn: string, args?: any) => {
      if (fn === "app_admin_settings") return treino === undefined ? { trial_days: 7 } : { trial_days: 7, treino_dupla: treino };
      if (fn === "app_admin_save_dupla") return saveResult ?? { aberto: args.p_aberto, planos: args.p_planos };
      return null;
    });
    state.session = { status: "ready", boot: bootOf("admin"), dupla: null, user: { email: "adm@teste.dev" }, backend: { rpc } };
    render(<AdminDupla />);
    return rpc;
  }

  it("mostra a chave e os planos gravados", async () => {
    openPanel({ aberto: false, planos: ["pro", "elite"] });
    expect(await screen.findByText("Treinamento em Dupla")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Abrir para os alunos/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Teste grátis" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pro" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Elite" })).toBeChecked();
  });

  it("salva a chave e os planos marcados e avisa", async () => {
    const rpc = openPanel({ aberto: false, planos: ["pro", "elite"] });
    await screen.findByText("Treinamento em Dupla");
    fireEvent.click(screen.getByRole("switch", { name: /Abrir para os alunos/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Teste grátis" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Elite" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("app_admin_save_dupla", { p_aberto: true, p_planos: ["trial", "pro"] });
    expect(screen.getByRole("switch", { name: /Abrir para os alunos/ })).toBeChecked();
  });

  it("sem a chave gravada, abre desligada com Pro e Elite", async () => {
    openPanel(undefined);
    await screen.findByText("Treinamento em Dupla");
    expect(screen.getByRole("switch", { name: /Abrir para os alunos/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pro" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Elite" })).toBeChecked();
  });

  it("recusa do banco aparece em português e nada some", async () => {
    const rpc = openPanel({ aberto: true, planos: ["pro"] });
    await screen.findByText("Treinamento em Dupla");
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_save_dupla") throw new Error("Planos inválidos.");
      return null;
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    expect(await screen.findByText("Planos inválidos.")).toBeTruthy();
    expect(screen.queryByText("Configurações salvas.")).toBeNull();
  });
});
