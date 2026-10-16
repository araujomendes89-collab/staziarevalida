/**
 * 2ª Fase · Prática "Em breve" para alunos (pedido do dono, 2026-10-07).
 * Aluno (e revisor médico, que é aluno com áreas de revisão): o seletor de fase mostra "2ª Fase · Em breve" apagado e sem
 * clique, quem tinha a 2ª fase gravada abre na 1ª, as telas da 2ª fase levam ao início e, na Conta, a opção vira
 * "2ª fase · prática (em breve)" e não pode ser escolhida. Equipe (admin e editor): tudo como antes.
 * Nada muda no banco nem no servidor: é só visibilidade "por enquanto".
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
  Stations: () => <div data-testid="tela-estacoes" />,
  Station: () => <div data-testid="tela-estacao" />,
  Peps: () => <div data-testid="tela-peps" />,
  Perf2: () => <div data-testid="tela-desempenho2" />,
  SimPatient: () => <div data-testid="tela-paciente" />,
}));
vi.mock("../novo/prototype/Match.jsx", () => ({ Pair: () => <div data-testid="tela-dupla" /> }));
vi.mock("../novo/prototype/Theory2.jsx", () => ({ Theory2: () => <div data-testid="tela-teoria2" /> }));

import { App } from "../novo/app/App.jsx";
import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { SegmentedControl } from "../novo/ds";
import { isPhase2Locked } from "../novo/app/admin/common.jsx";

const PHASE2_ROUTES = ["home2", "teoria2", "estacoes", "estacao", "dupla", "peps", "paciente", "desempenho2"];

const bootOf = (role: string, phase = 1, extra: Record<string, unknown> = {}) => ({
  role,
  profile: {
    name: "Ana Souza",
    phase,
    theme: "light",
    exam_type: "REVALIDA",
    target_edition: null,
    exam_date: null,
    daily_minutes: null,
    graduation_country: null,
    graduation_university: null,
    graduation_year: null,
  },
  subscription: { plan: "trial", status: "trialing", trial_ends_at: "2026-10-13T12:00:00Z", current_period_end: null },
  days_to_exam: null,
  streak_days: 0,
  flashcards_due: 0,
  play: { enabled: false },
  reviewer_areas: [],
  ...extra,
});

function openSession(boot: any) {
  const updateProfile = vi.fn(async (_patch: any) => {});
  state.session = { status: "ready", boot, user: { email: "ana@teste.dev" }, backend: { rpc: vi.fn(async () => null) }, signOut: vi.fn(), updateProfile };
  return updateProfile;
}

function renderApp(path: string, boot: any) {
  const updateProfile = openSession(boot);
  window.history.pushState({}, "", `/novo${path}`);
  render(<App />);
  return { updateProfile };
}

const phaseRadios = () => within(screen.getByRole("radiogroup", { name: "Fase do Revalida" })).getAllByRole("radio");
// celular (G1.8, 16/10/2026): o topo mostra a pílula compacta da fase; tocar nela abre o mesmo seletor
const abrirPilulaDaFase = () => {
  const pill = screen.getByRole("button", { name: /^Fase do Revalida: 1ª Fase/ });
  expect(screen.queryByRole("radiogroup", { name: "Fase do Revalida" })).toBeNull();
  fireEvent.click(pill);
  expect(pill).toHaveAttribute("aria-expanded", "true");
};
const textOf = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
const AT_HOME = /^\/novo\/?$/;

const originalMatchMedia = window.matchMedia;
function setMobile(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && (query.includes("860px") || query.includes("719px")),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as any;
}

beforeEach(() => {
  window.scrollTo = vi.fn() as any;
});
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  window.history.replaceState({}, "", "/");
  state.session = null;
  state.shellProps = null;
});

describe("Regra da 2ª fase em breve", () => {
  it("só a equipe (admin e editor) entra; aluno, revisor médico (é aluno) e papel ausente ficam em breve", () => {
    expect(isPhase2Locked("admin")).toBe(false);
    expect(isPhase2Locked("editor")).toBe(false);
    expect(isPhase2Locked("student")).toBe(true);
    expect(isPhase2Locked(undefined)).toBe(true);
    expect(isPhase2Locked(null)).toBe(true);
  });
});

describe("Seletor de fase · aluno", () => {
  it("mostra '2ª Fase · Em breve' desabilitada e clicar não muda de fase", async () => {
    const { updateProfile } = renderApp("/", bootOf("student"));
    const [first, second] = phaseRadios();

    expect(textOf(second)).toMatch(/^2ª Fase ?· Em breve$/);
    expect(textOf(second)).not.toMatch(/Prática/);
    expect(second).toBeDisabled();
    expect(second).toHaveAttribute("aria-disabled", "true");
    expect(second).toHaveAttribute("aria-checked", "false");
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(first).not.toBeDisabled();

    fireEvent.click(second);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.getByTestId("tela-home")).toBeTruthy();
    expect(screen.queryByTestId("tela-home2")).toBeNull();
    expect(window.location.pathname).toMatch(AT_HOME);
  });

  it("revisor médico (aluno com áreas de revisão) também vê 'Em breve'", () => {
    renderApp("/", bootOf("student", 1, { reviewer_areas: ["CLINICA_MEDICA"] }));
    const second = phaseRadios()[1];
    expect(textOf(second)).toMatch(/^2ª Fase ?· Em breve$/);
    expect(second).toBeDisabled();
  });

  it("no celular a descrição some, mas a 2ª Fase continua dizendo 'Em breve', empilhado sob o nome para o seletor não alargar", () => {
    setMobile(true);
    renderApp("/", bootOf("student"));
    abrirPilulaDaFase();
    const [first, second] = phaseRadios();
    expect(textOf(first)).toBe("1ª Fase");
    expect(textOf(second)).toMatch(/^2ª Fase ?Em breve$/);
    expect(textOf(second)).not.toContain("·"); // sem o "· Em breve" em linha, que deixaria o seletor com ~280 px
    const emBreve = within(second).getByText("Em breve");
    expect(emBreve.parentElement).toHaveStyle({ flexDirection: "column" });
    expect(second).toBeDisabled();
    expect(second).toHaveAttribute("aria-disabled", "true");
  });

  it("quem tem a 2ª fase gravada no perfil abre na 1ª fase", () => {
    renderApp("/", bootOf("student", 2));
    expect(screen.getByTestId("tela-home")).toBeTruthy();
    expect(screen.queryByTestId("tela-home2")).toBeNull();
    const [first, second] = phaseRadios();
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(second).toHaveAttribute("aria-checked", "false");
  });

  it.each(PHASE2_ROUTES)("o endereço /%s não abre e leva ao início", (route) => {
    renderApp(`/${route}`, bootOf("student"));
    expect(screen.getByTestId("tela-home")).toBeTruthy();
    expect(screen.queryByTestId(`tela-${route}`)).toBeNull();
    expect(window.location.pathname).toMatch(AT_HOME);
  });

  it("aluno com a 2ª fase gravada e /estacoes também cai no início da 1ª fase", () => {
    renderApp("/estacoes", bootOf("student", 2));
    expect(screen.getByTestId("tela-home")).toBeTruthy();
    expect(screen.queryByTestId("tela-estacoes")).toBeNull();
    expect(window.location.pathname).toMatch(AT_HOME);
  });

  it("setPhase(2) não faz nada (defesa extra) e setPhase(1) continua valendo", () => {
    const { updateProfile } = renderApp("/", bootOf("student", 2));
    expect(state.shellProps).toBeTruthy();

    act(() => state.shellProps.setPhase(2));
    expect(updateProfile).not.toHaveBeenCalled();
    expect(window.location.pathname).toMatch(AT_HOME);
    expect(screen.queryByTestId("tela-home2")).toBeNull();

    act(() => state.shellProps.setPhase(1));
    expect(updateProfile).toHaveBeenCalledWith({ phase: 1 });
  });
});

describe("Seletor de fase · equipe", () => {
  it.each(["editor", "admin"])("%s vê '2ª Fase · Prática' e consegue trocar de fase", async (role) => {
    const { updateProfile } = renderApp("/", bootOf(role));
    const second = phaseRadios()[1];

    expect(textOf(second)).toMatch(/^2ª Fase ?· Prática$/);
    expect(second).not.toBeDisabled();
    expect(second).not.toHaveAttribute("aria-disabled");

    fireEvent.click(second);
    expect(updateProfile).toHaveBeenCalledWith({ phase: 2 });
    expect(await screen.findByTestId("tela-home2")).toBeTruthy();
    expect(window.location.pathname).toBe("/novo/home2");
    expect(phaseRadios()[1]).toHaveAttribute("aria-checked", "true");
    expect(phaseRadios()[0]).toHaveAttribute("aria-checked", "false");
  });

  it("no celular a equipe continua sem descrição nas duas fases", () => {
    setMobile(true);
    renderApp("/", bootOf("editor"));
    abrirPilulaDaFase();
    const [first, second] = phaseRadios();
    expect(textOf(first)).toBe("1ª Fase");
    expect(textOf(second)).toBe("2ª Fase");
    expect(second).not.toBeDisabled();
  });

  it("com a 2ª fase gravada abre na 2ª fase e as telas dela continuam abrindo", () => {
    renderApp("/", bootOf("editor", 2));
    expect(screen.getByTestId("tela-home2")).toBeTruthy();
    expect(screen.queryByTestId("tela-home")).toBeNull();
    cleanup();

    renderApp("/estacoes", bootOf("admin"));
    expect(screen.getByTestId("tela-estacoes")).toBeTruthy();
    expect(window.location.pathname).toBe("/novo/estacoes");
    expect(phaseRadios()[1]).toHaveAttribute("aria-checked", "true");
  });

  it.each(PHASE2_ROUTES)("/%s abre para o editor", (route) => {
    renderApp(`/${route}`, bootOf("editor"));
    expect(screen.getByTestId(`tela-${route}`)).toBeTruthy();
    expect(window.location.pathname).toBe(`/novo/${route}`);
  });
});

describe("Conta · campo Fase", () => {
  function openStudy(boot: any) {
    const updateProfile = openSession(boot);
    render(<AccountScreen go={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Estudo e prova/ }));
    const [first, second] = within(screen.getByRole("radiogroup", { name: "Fase" })).getAllByRole("radio");
    return { updateProfile, first, second };
  }
  const saveButton = () => screen.getByRole("button", { name: "Salvar alterações" });

  it("aluno: a opção da 2ª fase aparece '(em breve)' e não pode ser escolhida", () => {
    const { updateProfile, first, second } = openStudy(bootOf("student"));
    expect(textOf(first)).toBe("1ª fase · objetiva");
    expect(textOf(second)).toBe("2ª fase · prática (em breve)");
    expect(second).toBeDisabled();
    expect(second).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(second).toHaveAttribute("aria-checked", "false");
    expect(saveButton()).toBeDisabled(); // nada mudou no formulário
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("aluno no celular: o campo Fase ocupa a largura toda do cartão e tem o gancho do CSS que empilha as opções em cartão estreito", () => {
    setMobile(true);
    openStudy(bootOf("student"));
    const group = screen.getByRole("radiogroup", { name: "Fase" });
    expect(group).toHaveClass("sm-seg--full");
    expect(group.parentElement).toHaveClass("acc-phase-soon");
    cleanup();

    setMobile(false); // no computador segue do tamanho do conteúdo (o CSS ainda empilha se o cartão for estreito)
    openStudy(bootOf("student"));
    const wide = screen.getByRole("radiogroup", { name: "Fase" });
    expect(wide).not.toHaveClass("sm-seg--full");
    expect(wide.parentElement).toHaveClass("acc-phase-soon");
  });

  it("equipe no celular: o campo Fase fica como era (sem largura total e sem o gancho do aluno)", () => {
    setMobile(true);
    openStudy(bootOf("editor"));
    const group = screen.getByRole("radiogroup", { name: "Fase" });
    expect(group).not.toHaveClass("sm-seg--full");
    expect(group.parentElement).not.toHaveClass("acc-phase-soon");
  });

  it("aluno com a 2ª fase gravada: o campo mostra a 1ª fase e salvar grava 1", async () => {
    const { updateProfile, first, second } = openStudy(bootOf("student", 2));
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(second).toHaveAttribute("aria-checked", "false");
    expect(saveButton()).toBeDisabled(); // mostrar a 1ª fase não conta como alteração do aluno

    fireEvent.change(screen.getByLabelText("Tempo de estudo"), { target: { value: "60" } });
    expect(saveButton()).not.toBeDisabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith({ daily_minutes: 60, phase: 1 });
  });

  it("depois de salvar, o banco passa a ter a 1ª fase e o formulário não volta a ficar alterado", async () => {
    const saved: any[] = [];
    function Conta() {
      const [boot, setBoot] = React.useState<any>(() => bootOf("student", 2));
      state.session = {
        status: "ready",
        boot,
        user: { email: "ana@teste.dev" },
        backend: { rpc: vi.fn(async () => null) },
        signOut: vi.fn(),
        updateProfile: async (patch: any) => {
          saved.push(patch);
          setBoot((b: any) => ({ ...b, profile: { ...b.profile, ...patch } })); // o banco devolve o perfil já com o que foi gravado
        },
      };
      return <AccountScreen go={vi.fn()} />;
    }
    render(<Conta />);
    fireEvent.click(screen.getByRole("button", { name: /Estudo e prova/ }));
    fireEvent.change(screen.getByLabelText("Tempo de estudo"), { target: { value: "120" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(saved).toEqual([{ daily_minutes: 120, phase: 1 }]);
    expect(await screen.findByText("Alterações salvas.")).toBeTruthy();
    const [first, second] = within(screen.getByRole("radiogroup", { name: "Fase" })).getAllByRole("radio");
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(second).toHaveAttribute("aria-checked", "false");
    expect(second).toBeDisabled();
  });

  it("aluno com a 2ª fase gravada: o selo da conta diz 1ª fase", () => {
    openSession(bootOf("student", 2));
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("1ª fase")).toBeTruthy();
    expect(screen.queryByText("2ª fase")).toBeNull();
  });

  it.each(["editor", "admin"])("%s: a opção '2ª fase · prática' segue livre e salva 2", async (role) => {
    const { updateProfile, first, second } = openStudy(bootOf(role));
    expect(textOf(second)).toBe("2ª fase · prática");
    expect(second).not.toBeDisabled();
    expect(second).not.toHaveAttribute("aria-disabled");

    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-checked", "true");
    expect(first).toHaveAttribute("aria-checked", "false");
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ phase: 2 }));
  });

  it("equipe com a 2ª fase gravada continua vendo a 2ª fase (selo e campo)", () => {
    const { second } = openStudy(bootOf("editor", 2));
    expect(second).toHaveAttribute("aria-checked", "true");
    cleanup();
    openSession(bootOf("editor", 2));
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("2ª fase")).toBeTruthy();
  });
});

describe("SegmentedControl · opção desabilitada", () => {
  it("não dispara onChange e aparece desabilitada; as outras seguem funcionando", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Teste"
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B", disabled: true },
          "C",
        ]}
      />,
    );
    const b = screen.getByRole("radio", { name: "B" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(b);
    expect(onChange).not.toHaveBeenCalled();

    expect(screen.getByRole("radio", { name: "A" })).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getByRole("radio", { name: "C" }));
    expect(onChange).toHaveBeenCalledWith("C");
  });
});
