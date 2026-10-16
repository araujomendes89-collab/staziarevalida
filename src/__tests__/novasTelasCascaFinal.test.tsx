// @vitest-environment jsdom
/**
 * Novas telas, casca final (15/10/2026): Início do celular "simples" (pacote MobileMenu), selos reais da casca (useShellCounts:
 * Plano de Hoje, Missões e Caderno de Erros vindos do banco, sem número de exemplo) e a escolha da aparência (cascaConfig).
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
const bootRef: any = { role: "student", profile: { name: "Ana Souza" }, play: { enabled: true } };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend, refresh: async () => {}, updateProfile: async () => {}, boot: bootRef, user: { id: "u1" } }),
  useOptionalSession: () => ({ backend, boot: bootRef }),
}));
const SUMMARY = {
  enabled: true,
  score: 383,
  level: { name: "Explorador" },
  names: { score: "Stazia Score" },
  streak: { today: { questions: 4, min_questions: 10, min_minutes: 20 }, today_done: false },
  missions: { done: 1, total: 3, items: [] },
  flags: { leaderboard: true },
};
const playRef: any = { on: true };
vi.mock("../novo/app/play/PlayDashboard.jsx", () => ({
  PlayError: () => null,
  usePlayHome: () => ({ summary: { data: playRef.on ? SUMMARY : { enabled: false }, error: null, reload: () => {} }, busy: false, startNode: vi.fn(), error: null }),
}));
vi.mock("../novo/app/admin/radar/useRadarAvisos.js", () => ({ useRadarAvisos: () => [] }));

import { HomeScreen } from "../novo/app/home/HomeScreen.jsx";
import { AppShell } from "../novo/app/Shell.jsx";
import { countsFrom } from "../novo/app/shell/useShellCounts.js";
import { badgeOf, groupBadge, maisSheetSections, mobileTabs, GROUPS_FASE1 } from "../novo/app/shell/navModel.js";
import { INICIO_CELULAR, MAIS_CELULAR, inicioCelular, maisCelular } from "../novo/app/shell/cascaConfig.js";

const HOME = {
  attempts: 20,
  correct: 11,
  wrong_pending: 7,
  trial: null,
  open_session: { id: "s1", kind: "treino", status: "all", area: null, total: 20, answered: 2, paused: false, remaining_seconds: null },
  week: { attempts: 9, correct: 5, days_active: 3 },
  previous_week: { attempts: 0, correct: 0 },
  today: { attempts: 0 },
  priority_topics: [],
};
const PLAN = { tasks: [{ id: "t1", kind: "praticar", title: "20 questões de Pediatria", minutes: 40, progress: 0, target: 20, done: false, ref: { area: "PEDIATRIA", reason: "untrained", attempts: 0 } }], done: 0, total: 2 };
const TRAIL = { enabled: true, areas: [{ area: "CIRURGIA_GERAL", label: "Cirurgia", done: 0, total: 60, nodes: [{ topic: "Coloproctologia", state: "in_progress", answered: 1, goal: 8 }] }] };
const BASE: any = { app_home: HOME, app_today: PLAN, app_announcement: null, app_my_ineditas: { total: 74, released: 74, answered: 0, limited: false, locked: false }, app_trail: TRAIL, app_gamification_summary: SUMMARY };

const original = window.matchMedia;
function setWidth(px: number) {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return { matches: Boolean(max) && px <= Number(max![1]), media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false };
  }) as any;
}

beforeEach(() => {
  playRef.on = true;
  bootRef.play = { enabled: true };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn in BASE) return BASE[fn];
    throw new Error("rpc inesperada: " + fn);
  });
});
afterEach(() => {
  cleanup();
  window.matchMedia = original;
  window.history.pushState({}, "", "/");
});

describe("Configuração da casca (o dono escolhe vendo pronto)", () => {
  it("padrões: Início completo no celular e 'Mais' em folha; o endereço só compara", () => {
    expect(INICIO_CELULAR).toBe("completo");
    expect(MAIS_CELULAR).toBe("folha");
    expect(inicioCelular()).toBe("completo");
    window.history.pushState({}, "", "/?inicio=simples&mais=pagina");
    expect(inicioCelular()).toBe("simples");
    expect(maisCelular()).toBe("pagina");
  });
});

describe("Selos reais da casca", () => {
  it("vêm do banco no formato do pacote; sem resposta, sem selo (nada de exemplo)", () => {
    const c = countsFrom({ today: { done: 0, total: 2 }, summary: SUMMARY, home: HOME });
    expect(badgeOf("hoje", c)).toBe("0/2");
    expect(badgeOf("missoes", c)).toBe("1/3");
    expect(badgeOf("erros", c)).toBe(7);
    expect(badgeOf("flash", { ...c, flashcardsDue: 4 })).toBeNull();
    const vazio = countsFrom({});
    for (const id of ["hoje", "missoes", "erros"]) expect(badgeOf(id, vazio)).toBeNull();
    // Arena desligada: sem missões nem score
    const off = countsFrom({ summary: { enabled: false, missions: { done: 0, total: 3 }, score: 10 } });
    expect(off.missionsTotal).toBeNull();
    expect(off.score).toBeNull();
    const revisar = GROUPS_FASE1.find((g) => g.id === "revisar")!;
    expect(groupBadge(revisar, c)).toEqual({ text: 7, kind: "danger" });
    expect(groupBadge(GROUPS_FASE1.find((g) => g.id === "tutor")!, c)).toEqual({ text: "IA", kind: "ai" });
  });

  it("a barra de baixo (celular) pergunta ao banco e mostra no Revisar os erros a revisar", async () => {
    setWidth(390);
    render(
      <AppShell route="home" go={vi.fn()} theme="light" setTheme={() => {}} title="Início" sub="" phase={1} setPhase={() => {}} phase2Locked info={{ name: "Ana Souza", streakDays: 0, onSignOut: vi.fn() }}>
        <div>corpo</div>
      </AppShell>
    );
    expect(await screen.findByRole("button", { name: "Revisar, 7 questões erradas para revisar" })).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_home");
    expect(mobileTabs(1).map((t) => t[2])).toEqual(["Início", "Questões", "Tutor", "Revisar"]);
  });

  it("folha 'Mais' da 2ª fase (equipe) mostra os grupos da 2ª fase e Configurações", () => {
    const secs = maisSheetSections(2, { isStaff: true });
    expect(secs.map((s) => s.label)).toEqual(["Menu", "Treino com IA", "Análise", "Configurações"]);
    expect(secs[3].items.map((i) => i[2])).toEqual(["Administração", "Meu Plano", "Preferências"]);
    expect(maisSheetSections(1, { isReviewer: true })[4].items.map((i) => i[2])).toEqual(["Revisão médica", "Meu Plano", "Preferências"]);
    expect(maisSheetSections(1, {})[4].items.map((i) => i[2])).toEqual(["Meu Plano", "Preferências"]);
  });
});

describe("Início do celular 'simples' (pacote MobileMenu)", () => {
  it("Próximo passo, Stazia Score /1000 com o nível, Meta de hoje com as missões e a Trilha, com dados do banco", async () => {
    setWidth(390);
    window.history.pushState({}, "", "/?inicio=simples");
    const go = vi.fn();
    render(<MemoryRouter><HomeScreen go={go} mobile /></MemoryRouter>);
    const next = await screen.findByRole("region", { name: "Continue de onde parou" });
    expect(within(next).getByText("Próximo passo")).toBeTruthy();
    expect(within(next).getByText("20 questões · Todas as áreas")).toBeTruthy();
    expect(within(next).getByText(/Você parou na questão 3\. Faltam 18\./)).toBeTruthy();
    fireEvent.click(within(next).getByRole("button", { name: /Continuar/ }));
    expect(go).toHaveBeenCalledWith("sessao", { s: "s1" });
    const score = screen.getByRole("button", { name: /Stazia Score 383 de 1000, Explorador/ });
    expect(score.textContent).toContain("/1000");
    const meta = screen.getByRole("group", { name: "Meta de hoje: 4 de 10 questões" });
    expect(meta.textContent).toContain("1/3 missões");
    expect(await screen.findByRole("button", { name: "Trilha de aprendizado: Coloproctologia. Continuar" })).toBeTruthy();
    expect(screen.getByText(/questões da etapa/)).toBeTruthy();
    // a faixa de números e o carrossel são do Início completo
    expect(screen.queryByRole("region", { name: "Seu desempenho" })).toBeNull();
  });

  it("com a Stazia Arena desligada ficam só o Próximo passo (sem score, meta, missões nem trilha)", async () => {
    setWidth(390);
    window.history.pushState({}, "", "/?inicio=simples");
    playRef.on = false;
    bootRef.play = { enabled: false };
    render(<MemoryRouter><HomeScreen go={vi.fn()} mobile /></MemoryRouter>);
    await screen.findByText("Próximo passo");
    expect(screen.queryByText(/Stazia Score|Meta de hoje|missões|Trilha de aprendizado/)).toBeNull();
    await waitFor(() => expect(backend.rpc).not.toHaveBeenCalledWith("app_trail", expect.anything()));
  });
});
