/**
 * ES06: telas ainda não ligadas aos dados mostram o aviso "Tela em reconstrução". Hoje só "Praticar em dupla" (maquete da frente do
 * Treino em Dupla) o mostra; as outras telas da 2ª fase leem o banco. Só a equipe chega nessas telas.
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
vi.mock("../novo/app/fase2/Fase2Home.jsx", () => ({ Fase2Home: () => <div data-testid="tela-home2" /> }));
vi.mock("../novo/app/fase2/Fase2Stations.jsx", () => ({ Fase2Stations: () => <div data-testid="tela-estacoes" /> }));
vi.mock("../novo/app/fase2/Fase2Player.jsx", () => ({ Fase2Player: () => <div data-testid="tela-estacao" /> }));
vi.mock("../novo/app/fase2/Fase2Peps.jsx", () => ({ Fase2Peps: () => <div data-testid="tela-peps" /> }));
vi.mock("../novo/app/fase2/Fase2Performance.jsx", () => ({ Fase2Performance: () => <div data-testid="tela-desempenho2" /> }));
vi.mock("../novo/app/fase2/Fase2Patient.jsx", () => ({ Fase2Patient: () => <div data-testid="tela-paciente" /> }));
vi.mock("../novo/app/fase2/Fase2Theory.jsx", () => ({ Fase2Theory: () => <div data-testid="tela-teoria2" /> }));
vi.mock("../novo/prototype/Match.jsx", () => ({ Pair: () => <div data-testid="tela-dupla" /> }));

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
  // 16/10/2026: as telas da 2ª fase (estação, banco, início, PEPs, desempenho, paciente, teoria) leem o banco de verdade
  // (src/novo/app/fase2/) e deixaram de mostrar o aviso de "exemplos do novo design".
  it("as telas da 2ª fase já ligadas aos dados não mostram o aviso", () => {
    for (const rota of ["/estacao", "/estacoes", "/home2", "/peps", "/desempenho2", "/paciente", "/teoria2"]) {
      renderApp(rota, "admin");
      expect(screen.queryByText("Tela em reconstrução")).toBeNull();
      cleanup();
    }
  });

  it("a tela de Praticar em dupla (ainda maquete) continua com o aviso, uma vez só", () => {
    renderApp("/dupla", "admin");
    expect(screen.getAllByText("Tela em reconstrução")).toHaveLength(1);
  });

  it("uma tela já ligada aos dados não ganha o aviso", () => {
    renderApp("/hoje", "admin");
    expect(screen.queryByText("Tela em reconstrução")).toBeNull();
  });
});
