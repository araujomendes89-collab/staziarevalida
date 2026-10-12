/**
 * ES06: a tela de uma estação (aberta em /estacao, antes do ponto em que o aviso era colocado) também mostra o aviso
 * "Tela em reconstrução", como as outras telas ainda não ligadas aos dados. Só a equipe chega nessa tela.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state: { session: any; shellProps: any } = { session: null, shellProps: null };

vi.mock("../novo/app/session.jsx", () => ({
  SessionProvider: ({ children }: any) => children,
  useSession: () => state.session,
}));
// O cabeçalho e o menu são os de verdade; só guardo o que a tela entrega ao AppShell (para chamar o setPhase direto).
vi.mock("../novo/app/Shell.jsx", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    AppShell: (props: any) => {
      state.shellProps = props;
      return <actual.AppShell {...props} />;
    },
  };
});
// Telas do corpo: cada uma vira uma marca, para ver qual abriu sem carregar dados.
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
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));
vi.mock("../novo/app/admin/AdminScreen.jsx", async () => ({
  AdminScreen: () => null,
  isStaffRole: (await import("../novo/app/admin/common.jsx")).isStaffRole, // a regra de verdade
}));
vi.mock("../novo/prototype/Phase2.jsx", () => ({
  Home2: () => <div data-testid="tela-home2" />,
  Station: () => <div data-testid="tela-estacao" />,
  Peps: () => <div data-testid="tela-peps" />,
  Perf2: () => <div data-testid="tela-desempenho2" />,
  SimPatient: () => <div data-testid="tela-paciente" />,
}));
// Treinamento em Dupla: o Banco de estações e o Praticar são telas reais (Tarefas 7 e 8), sem o aviso de exemplo
vi.mock("../novo/app/dupla/StationsScreen.jsx", () => ({ StationsScreen: () => <div data-testid="tela-estacoes" /> }));
vi.mock("../novo/app/dupla/PracticeScreen.jsx", () => ({ PracticeScreen: () => <div data-testid="tela-dupla" /> }));
vi.mock("../novo/prototype/Theory2.jsx", () => ({ Theory2: () => <div data-testid="tela-teoria2" /> }));

import { App } from "../novo/app/App.jsx";

const bootOf = (role: string) => ({
  role,
  profile: { name: "Ana Souza", phase: 2, theme: "light", exam_type: "REVALIDA", target_edition: null, exam_date: null, daily_minutes: null, graduation_country: null, graduation_university: null, graduation_year: null },
  subscription: { plan: "trial", status: "trialing", trial_ends_at: "2026-10-13T12:00:00Z", current_period_end: null },
  days_to_exam: null,
  streak_days: 0,
  flashcards_due: 0,
  play: { enabled: false },
  reviewer_areas: [],
});

function renderApp(path: string, role: string) {
  state.session = { status: "ready", boot: bootOf(role), user: { email: "ana@teste.dev" }, backend: { rpc: vi.fn(async () => null) }, signOut: vi.fn(), updateProfile: vi.fn(async () => {}) };
  window.history.pushState({}, "", `/novo${path}`);
  render(<App />);
}

beforeEach(() => {
  window.scrollTo = vi.fn() as any;
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  state.session = null;
  state.shellProps = null;
});

describe("Tela em reconstrução (ES06)", () => {
  it("a tela de uma estação mostra o aviso, junto com a tela", () => {
    renderApp("/estacao", "admin");
    expect(screen.getByTestId("tela-estacao")).toBeTruthy();
    expect(screen.getByText("Tela em reconstrução")).toBeTruthy();
    expect(screen.getByText(/Os itens e números abaixo são exemplos do novo design/)).toBeTruthy();
  });

  it("o Banco de estações e o Praticar em dupla agora são telas com dados reais: sem o aviso", () => {
    renderApp("/estacoes", "admin");
    expect(screen.getByTestId("tela-estacoes")).toBeTruthy();
    expect(screen.queryByText("Tela em reconstrução")).toBeNull();
    cleanup();
    renderApp("/dupla", "admin");
    expect(screen.getByTestId("tela-dupla")).toBeTruthy();
    expect(screen.queryByText("Tela em reconstrução")).toBeNull();
  });

  it("as telas da 2ª fase que ainda são de exemplo (Início da 2ª fase, PEPs) seguem com o aviso", () => {
    renderApp("/peps", "admin");
    expect(screen.getAllByText("Tela em reconstrução")).toHaveLength(1);
  });

  it("uma tela já ligada aos dados não ganha o aviso", () => {
    renderApp("/hoje", "admin");
    expect(screen.queryByText("Tela em reconstrução")).toBeNull();
  });
});
